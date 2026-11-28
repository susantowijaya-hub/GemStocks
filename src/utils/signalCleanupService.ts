import { SignalHistoryRecord } from '../types/market';
import {
  deriveSignalIndexedOutcome,
  normalizeSignalStatus,
} from './signalHistoryEngine';

/**
 * Automatic expiration window for untriggered Pending signals: 48 hours from creation.
 */
export const PENDING_CLEANUP_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Background cadence for periodic pending-signal cleanup sweeps (every 5 minutes).
 */
export const PENDING_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export interface SignalCleanupResult {
  nextRecords: SignalHistoryRecord[];
  expiredRecords: SignalHistoryRecord[];
  expiredIds: string[];
  expiredCount: number;
  ranAtMs: number;
  changed: boolean;
}

/**
 * Returns true if a signal is still in PENDING state without any entry trigger/fill
 * and has exceeded the 48-hour cleanup window since creation.
 */
export function isPendingSignalExpired48h(
  record: Pick<
    SignalHistoryRecord,
    'status' | 'createdAtMs' | 'filledAtMs' | 'zoneFillVerified' | 'filledOnFirstSight'
  >,
  nowMs: number = Date.now()
): boolean {
  if (normalizeSignalStatus(record.status) !== 'PENDING') return false;
  if (record.filledAtMs || record.zoneFillVerified || record.filledOnFirstSight) return false;
  if (!Number.isFinite(record.createdAtMs) || record.createdAtMs <= 0) return false;
  return nowMs - record.createdAtMs >= PENDING_CLEANUP_WINDOW_MS;
}

/**
 * Computes remaining milliseconds before a PENDING signal is automatically moved to Closed/Expired.
 * Returns null if the signal is not currently pending.
 */
export function getPendingExpiryRemainingMs(
  record: Pick<SignalHistoryRecord, 'status' | 'createdAtMs'>,
  nowMs: number = Date.now()
): number | null {
  if (normalizeSignalStatus(record.status) !== 'PENDING') return null;
  if (!Number.isFinite(record.createdAtMs) || record.createdAtMs <= 0) return null;
  return Math.max(0, record.createdAtMs + PENDING_CLEANUP_WINDOW_MS - nowMs);
}

/**
 * Formats remaining time until 48h auto-expiry as a compact human label (e.g. "36h 15m left").
 */
export function formatPendingExpiryCountdown(remainingMs: number | null): string {
  if (remainingMs === null) return '';
  if (remainingMs <= 0) return 'Expiring now';
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

/**
 * Transitions a single stale Pending signal cleanly to Closed/Expired (status: 'EXPIRED')
 * while keeping every field compliant with Firestore security rules.
 */
export function expirePendingSignalRecord(
  record: SignalHistoryRecord,
  nowMs: number = Date.now()
): SignalHistoryRecord {
  const closedPrice =
    Number.isFinite(record.lastPrice) && record.lastPrice > 0
      ? record.lastPrice
      : record.entryPrice;

  return {
    ...record,
    status: 'EXPIRED',
    outcome: deriveSignalIndexedOutcome('EXPIRED', record.userOutcome),
    verificationStatus: 'Expired',
    verifiedAtMs: record.verifiedAtMs ?? nowMs,
    expiredReason: 'UNFILLED_TIMEOUT',
    barrierOutcome: 'TIME_BARRIER',
    closedAtMs: record.closedAtMs ?? nowMs,
    closedPrice: record.closedPrice ?? closedPrice,
    pnlPct: 0,
    rMultiple: 0,
    lastCheckedAtMs: nowMs,
  };
}

/**
 * Cleanup Service: scans signal records and automatically moves any 'Pending' signal
 * that has not been triggered within 48 hours of entry creation into 'Closed/Expired'.
 */
export function runPendingSignalCleanup(
  records: SignalHistoryRecord[],
  nowMs: number = Date.now()
): SignalCleanupResult {
  const expiredRecords: SignalHistoryRecord[] = [];
  const expiredIds: string[] = [];
  let changed = false;

  const nextRecords = records.map((rec) => {
    if (!isPendingSignalExpired48h(rec, nowMs)) {
      return rec;
    }
    const expired = expirePendingSignalRecord(rec, nowMs);
    expiredRecords.push(expired);
    expiredIds.push(expired.id);
    changed = true;
    return expired;
  });

  return {
    nextRecords,
    expiredRecords,
    expiredIds,
    expiredCount: expiredRecords.length,
    ranAtMs: nowMs,
    changed,
  };
}
