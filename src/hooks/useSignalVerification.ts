import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { getFirebaseServices } from '../lib/firebase';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';
import {
  CandlePoint,
  MarketAsset,
  SignalHistoryRecord,
  SignalHistoryStatus,
  SignalVerificationStatus,
  StocksMoversBucket,
} from '../types/market';
import {
  deriveSignalIndexedOutcome,
  deriveSignalVerificationStatus,
  isTerminalSignalStatus,
  normalizeSignalStatus,
} from '../utils/signalHistoryEngine';

const TTL_MS_STOCK_PENDING = 7 * 24 * 60 * 60 * 1000;
const TTL_MS_INTRADAY_PENDING = 18 * 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 60_000;
const MAX_RECENT_EVENTS = 12;

export interface SignalVerificationEvent {
  signalId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  result: 'Verified' | 'Expired';
  triggerPrice: number;
  entryLow: number;
  entryHigh: number;
  atMs: number;
}

export interface SignalVerificationMetrics {
  verifiedCount: number;
  expiredCount: number;
  pendingCount: number;
  fillConversionRatePct: number | null;
  verifiedWins: number;
  verifiedLosses: number;
  verifiedBe: number;
  verifiedDecided: number;
  trueHitRatePct: number | null;
  isMonitoring: boolean;
  recentVerifications: SignalVerificationEvent[];
}

interface UseSignalVerificationOptions {
  records: SignalHistoryRecord[];
  assets: MarketAsset[];
  idxMoversBucket: StocksMoversBucket;
  usMoversBucket: StocksMoversBucket;
  feedsLive: boolean;
  cloudSynced: boolean;
  isRecordConfirmedOnServer: (signalId: string) => boolean;
  tryAcquireSignalWriteLock?: (signalId: string) => boolean;
  releaseSignalWriteLock?: (signalId: string) => void;
  applyVerificationPatch: (
    signalId: string,
    patch: Partial<SignalHistoryRecord>,
    syncedStatus?: SignalHistoryStatus
  ) => void;
  onRemoveUnfilledSignal?: (signalId: string) => Promise<void> | void;
}

interface LiveFeedSnapshot {
  price: number;
  candles?: CandlePoint[];
}

function sanitizeDocId(raw: string): string {
  return String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function roundPrice(value: number, decimals: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const factor = Math.pow(10, clamp(Math.round(decimals), 0, 6));
  return Math.round(value * factor) / factor;
}

function collectLivePriceMap(
  assets: MarketAsset[],
  idxMoversBucket: StocksMoversBucket,
  usMoversBucket: StocksMoversBucket
): Map<string, LiveFeedSnapshot> {
  const map = new Map<string, LiveFeedSnapshot>();

  for (const asset of assets) {
    if (!Number.isFinite(asset.price) || asset.price <= 0) continue;
    const candles =
      asset.chartCandles?.['5m'] ??
      asset.chartCandles?.['15m'] ??
      asset.chartCandles?.['1h'] ??
      asset.chartCandles?.['1D'];
    const snap: LiveFeedSnapshot = { price: asset.price, candles };
    map.set(asset.id, snap);
    map.set(asset.symbol, snap);
  }

  const buckets = [idxMoversBucket, usMoversBucket];
  for (const bucket of buckets) {
    const lists = [
      bucket.impact,
      bucket.gainers,
      bucket.losers,
      bucket.foreignBuy ?? [],
      bucket.foreignSell ?? [],
    ];
    for (const list of lists) {
      for (const stock of list) {
        if (!stock?.symbol || !Number.isFinite(stock.price) || stock.price <= 0) continue;
        if (!map.has(stock.symbol)) {
          map.set(stock.symbol, { price: stock.price });
        }
      }
    }
  }

  return map;
}

/**
 * Monitors real-time market price feeds against historical signal entry zones.
 * Immediately transitions Firestore `SignalHistory` documents to `'Verified'`
 * upon entry-zone price crossing (or `'Expired'` if invalidated/timed-out unfilled)
 * and computes a true hit-rate strictly from zone-verified trades.
 */
export function useSignalVerification({
  records,
  assets,
  idxMoversBucket,
  usMoversBucket,
  feedsLive,
  cloudSynced,
  isRecordConfirmedOnServer,
  tryAcquireSignalWriteLock,
  releaseSignalWriteLock,
  applyVerificationPatch,
  onRemoveUnfilledSignal,
}: UseSignalVerificationOptions): SignalVerificationMetrics {
  const { user, profileReady } = useAuth();
  const [recentVerifications, setRecentVerifications] = useState<SignalVerificationEvent[]>([]);

  // Track previous tick per symbol/assetId so fast jumps across [entryLow, entryHigh] are caught
  const prevPriceMapRef = useRef<Map<string, number>>(new Map());
  const inFlightVerifyRef = useRef<Set<string>>(new Set());
  const backoffRef = useRef<Map<string, number>>(new Map());
  const processedResultRef = useRef<Map<string, 'Verified' | 'Expired'>>(new Map());

  useEffect(() => {
    if (!user) {
      inFlightVerifyRef.current.clear();
      backoffRef.current.clear();
      processedResultRef.current.clear();
    }
  }, [user]);

  useEffect(() => {
    if (!feedsLive || records.length === 0) return;

    const liveMap = collectLivePriceMap(assets, idxMoversBucket, usMoversBucket);
    if (liveMap.size === 0) return;

    const now = Date.now();
    const pendingToInspect = records.filter(
      (rec) =>
        normalizeSignalStatus(rec.status) === 'PENDING' &&
        deriveSignalVerificationStatus(rec) === 'Pending' &&
        !isTerminalSignalStatus(rec.status)
    );

    const transitions: Array<{
      rec: SignalHistoryRecord;
      result: 'Verified' | 'Expired';
      nextStatus: SignalHistoryStatus;
      triggerPrice: number;
      patch: Partial<SignalHistoryRecord>;
    }> = [];

    for (const rec of pendingToInspect) {
      const safeId = sanitizeDocId(rec.id);
      if (processedResultRef.current.has(safeId) || inFlightVerifyRef.current.has(safeId)) {
        continue;
      }

      const feed = liveMap.get(rec.assetId) ?? liveMap.get(rec.symbol);
      if (!feed || !Number.isFinite(feed.price) || feed.price <= 0) continue;

      const livePrice = roundPrice(feed.price, rec.decimals);
      if (!Number.isFinite(livePrice) || livePrice <= 0) continue;
      const prevPrice =
        prevPriceMapRef.current.get(rec.assetId) ??
        prevPriceMapRef.current.get(rec.symbol) ??
        rec.lastPrice;

      const zoneLo = Math.min(rec.entryLow, rec.entryHigh);
      const zoneHi = Math.max(rec.entryLow, rec.entryHigh);
      const tol = Math.max(livePrice * 0.0003, 1e-6);

      // 1. Direct containment OR tick-to-tick crossing across entry zone
      const rangeLo = Math.min(prevPrice > 0 ? prevPrice : livePrice, livePrice);
      const rangeHi = Math.max(prevPrice > 0 ? prevPrice : livePrice, livePrice);
      let crossedZone = rangeLo <= zoneHi + tol && rangeHi >= zoneLo - tol;

      // 2. Post-creation candle wick crossing check (catches rapid intrabar touches)
      if (!crossedZone && feed.candles && feed.candles.length > 0) {
        for (let i = feed.candles.length - 1; i >= Math.max(0, feed.candles.length - 12); i--) {
          const c = feed.candles[i];
          const candleTs = c.t < 1e12 ? c.t * 1000 : c.t;
          if (candleTs < rec.createdAtMs - 60_000) break;
          if (c.l > 0 && c.h > 0 && c.l <= zoneHi + tol && c.h >= zoneLo - tol) {
            crossedZone = true;
            break;
          }
        }
      }

      const isBuy = rec.direction === 'BUY';
      const isStock = rec.assetClass === 'stock_id' || rec.assetClass === 'stock_us';
      const pendingTtl = isStock ? TTL_MS_STOCK_PENDING : TTL_MS_INTRADAY_PENDING;

      if (crossedZone) {
        const diff = isBuy ? livePrice - rec.entryPrice : rec.entryPrice - livePrice;
        const riskDist = Math.max(
          Math.abs(rec.entryPrice - rec.stopLoss),
          rec.entryPrice * 0.005,
          1e-6
        );
        const pnlPct = clamp(Number(((diff / rec.entryPrice) * 100).toFixed(2)), -100, 5000);
        const rMultiple = clamp(Number((diff / riskDist).toFixed(2)), -20, 200);
        const maxFav = roundPrice(
          isBuy
            ? Math.max(rec.entryPrice, livePrice)
            : Math.min(rec.entryPrice, livePrice),
          rec.decimals
        );
        const maxAdv = roundPrice(
          isBuy
            ? Math.min(rec.entryPrice, livePrice)
            : Math.max(rec.entryPrice, livePrice),
          rec.decimals
        );

        const patch: Partial<SignalHistoryRecord> = {
          status: 'FILLED',
          outcome: deriveSignalIndexedOutcome('FILLED', rec.userOutcome),
          zoneFillVerified: true,
          verificationStatus: 'Verified',
          verifiedAtMs: now,
          filledAtMs: rec.filledAtMs ?? now,
          lastPrice: livePrice,
          maxFavorablePrice: maxFav > 0 ? maxFav : livePrice,
          maxAdversePrice: maxAdv > 0 ? maxAdv : livePrice,
          pnlPct,
          rMultiple,
          mfeR: Math.max(0, rMultiple),
          maeR: Math.max(0, -rMultiple),
          barrierOutcome: 'OPEN',
          lastCheckedAtMs: now,
        };

        transitions.push({
          rec,
          result: 'Verified',
          nextStatus: 'FILLED',
          triggerPrice: livePrice,
          patch,
        });
        continue;
      }

      // Check immediate expiry without entry-zone fill (hit SL, ran straight to TP1, or TTL expired)
      const hitSlUnfilled = isBuy ? livePrice <= rec.stopLoss : livePrice >= rec.stopLoss;
      const ranToTp1Unfilled = isBuy ? livePrice >= rec.tp1 : livePrice <= rec.tp1;
      const ttlExpired = now - rec.createdAtMs > pendingTtl;

      if (hitSlUnfilled || ranToTp1Unfilled || ttlExpired) {
        const patch: Partial<SignalHistoryRecord> = {
          status: 'EXPIRED',
          outcome: 'EXPIRED',
          zoneFillVerified: false,
          verificationStatus: 'Expired',
          verifiedAtMs: now,
          closedAtMs: now,
          closedPrice: livePrice,
          lastPrice: livePrice,
          maxFavorablePrice: rec.maxFavorablePrice > 0 ? rec.maxFavorablePrice : livePrice,
          maxAdversePrice: rec.maxAdversePrice > 0 ? rec.maxAdversePrice : livePrice,
          pnlPct: 0,
          rMultiple: 0,
          mfeR: 0,
          maeR: 0,
          barrierOutcome: 'TIME_BARRIER',
          lastCheckedAtMs: now,
        };

        transitions.push({
          rec,
          result: 'Expired',
          nextStatus: 'EXPIRED',
          triggerPrice: livePrice,
          patch,
        });
      }
    }

    // Update previous price snapshots after inspecting all pending signals
    for (const [key, snap] of liveMap.entries()) {
      prevPriceMapRef.current.set(key, snap.price);
    }

    if (transitions.length === 0) return;

    // Apply optimistic local state updates + recent verification feed immediately
    // Non-filled expired signals are removed directly from history & Firestore
    const newEvents: SignalVerificationEvent[] = [];
    const verifiedTransitions: typeof transitions = [];
    for (const t of transitions) {
      const safeId = sanitizeDocId(t.rec.id);
      processedResultRef.current.set(safeId, t.result);
      if (t.result === 'Expired') {
        if (onRemoveUnfilledSignal) {
          void onRemoveUnfilledSignal(t.rec.id);
        } else {
          applyVerificationPatch(t.rec.id, t.patch);
        }
        continue;
      }
      verifiedTransitions.push(t);
      applyVerificationPatch(t.rec.id, t.patch);
      newEvents.push({
        signalId: t.rec.id,
        symbol: t.rec.symbol,
        direction: t.rec.direction,
        result: t.result,
        triggerPrice: t.triggerPrice,
        entryLow: t.rec.entryLow,
        entryHigh: t.rec.entryHigh,
        atMs: now,
      });
    }

    if (newEvents.length > 0) {
      setRecentVerifications((prev) => [...newEvents, ...prev].slice(0, MAX_RECENT_EVENTS));
    }

    // Immediately persist 'Verified' transitions to Firestore SignalHistory
    if (!user || !profileReady || !cloudSynced || verifiedTransitions.length === 0) return;

    void (async () => {
      try {
        const { db } = await getFirebaseServices();

        for (const t of verifiedTransitions) {
          const safeId = sanitizeDocId(t.rec.id);
          if (!isRecordConfirmedOnServer(safeId)) continue;
          if (inFlightVerifyRef.current.has(safeId)) continue;
          const backoffUntil = backoffRef.current.get(safeId) ?? 0;
          if (Date.now() < backoffUntil) continue;

          if (tryAcquireSignalWriteLock && !tryAcquireSignalWriteLock(safeId)) {
            continue;
          }

          const docPath = `users/${user.uid}/signalHistory/${safeId}`;
          const ref = doc(db, 'users', user.uid, 'signalHistory', safeId);

          const safeLastPrice =
            typeof t.patch.lastPrice === 'number' && Number.isFinite(t.patch.lastPrice) && t.patch.lastPrice > 0
              ? t.patch.lastPrice
              : t.rec.lastPrice;
          if (!Number.isFinite(safeLastPrice) || safeLastPrice <= 0) {
            releaseSignalWriteLock?.(safeId);
            continue;
          }
          const safeMaxFav =
            typeof t.patch.maxFavorablePrice === 'number' &&
            Number.isFinite(t.patch.maxFavorablePrice) &&
            t.patch.maxFavorablePrice > 0
              ? t.patch.maxFavorablePrice
              : safeLastPrice;
          const safeMaxAdv =
            typeof t.patch.maxAdversePrice === 'number' &&
            Number.isFinite(t.patch.maxAdversePrice) &&
            t.patch.maxAdversePrice > 0
              ? t.patch.maxAdversePrice
              : safeLastPrice;

          const updatePayload: Record<string, unknown> = {
            status: t.nextStatus,
            outcome: t.patch.outcome ?? deriveSignalIndexedOutcome(t.nextStatus, t.rec.userOutcome),
            zoneFillVerified: Boolean(t.patch.zoneFillVerified),
            verificationStatus: t.result as SignalVerificationStatus,
            verifiedAtMs: Math.round(t.patch.verifiedAtMs ?? now),
            lastPrice: safeLastPrice,
            maxFavorablePrice: safeMaxFav,
            maxAdversePrice: safeMaxAdv,
            pnlPct: clamp(Number(t.patch.pnlPct ?? 0) || 0, -100, 5000),
            rMultiple: clamp(Number(t.patch.rMultiple ?? 0) || 0, -20, 200),
            lastCheckedAtMs: Math.round(t.patch.lastCheckedAtMs ?? now),
            updatedAt: serverTimestamp(),
          };
          if (t.patch.filledAtMs && t.patch.filledAtMs > 0) {
            updatePayload.filledAtMs = Math.round(t.patch.filledAtMs);
          }
          if (t.patch.closedAtMs && t.patch.closedAtMs > 0) {
            updatePayload.closedAtMs = Math.round(t.patch.closedAtMs);
          }
          if (t.patch.closedPrice && t.patch.closedPrice > 0) {
            updatePayload.closedPrice = t.patch.closedPrice;
          }
          if (typeof t.patch.mfeR === 'number' && Number.isFinite(t.patch.mfeR)) {
            updatePayload.mfeR = clamp(t.patch.mfeR, -20, 200);
          }
          if (typeof t.patch.maeR === 'number' && Number.isFinite(t.patch.maeR)) {
            updatePayload.maeR = clamp(t.patch.maeR, -20, 200);
          }
          if (t.patch.barrierOutcome) {
            updatePayload.barrierOutcome = t.patch.barrierOutcome;
          }

          inFlightVerifyRef.current.add(safeId);
          try {
            await updateDoc(ref, updatePayload);
            applyVerificationPatch(t.rec.id, t.patch, t.nextStatus);
            backoffRef.current.delete(safeId);
          } catch (err) {
            // Reconcile server state before surfacing an error (handles terminal-lock races cleanly)
            let reconciled = false;
            try {
              const snap = await getDoc(ref);
              if (!snap.exists()) {
                processedResultRef.current.delete(safeId);
                reconciled = true;
              } else {
                const serverStatus = snap.data()?.status as SignalHistoryStatus | undefined;
                if (serverStatus && isTerminalSignalStatus(serverStatus)) {
                  applyVerificationPatch(
                    t.rec.id,
                    {
                      status: serverStatus,
                      outcome: deriveSignalIndexedOutcome(serverStatus, t.rec.userOutcome),
                    },
                    serverStatus
                  );
                  backoffRef.current.delete(safeId);
                  reconciled = true;
                } else {
                  // Retry once with core-only fields in case optional fields tripped an older schema
                  const corePayload: Record<string, unknown> = {
                    status: t.nextStatus,
                    outcome: t.patch.outcome ?? deriveSignalIndexedOutcome(t.nextStatus, t.rec.userOutcome),
                    zoneFillVerified: Boolean(t.patch.zoneFillVerified),
                    verificationStatus: t.result as SignalVerificationStatus,
                    verifiedAtMs: Math.round(t.patch.verifiedAtMs ?? now),
                    lastPrice: safeLastPrice,
                    maxFavorablePrice: safeMaxFav,
                    maxAdversePrice: safeMaxAdv,
                    pnlPct: clamp(Number(t.patch.pnlPct ?? 0) || 0, -100, 5000),
                    rMultiple: clamp(Number(t.patch.rMultiple ?? 0) || 0, -20, 200),
                    lastCheckedAtMs: Math.round(t.patch.lastCheckedAtMs ?? now),
                    updatedAt: serverTimestamp(),
                  };
                  if (t.patch.filledAtMs && t.patch.filledAtMs > 0) {
                    corePayload.filledAtMs = Math.round(t.patch.filledAtMs);
                  }
                  if (t.patch.closedAtMs && t.patch.closedAtMs > 0) {
                    corePayload.closedAtMs = Math.round(t.patch.closedAtMs);
                  }
                  if (t.patch.closedPrice && t.patch.closedPrice > 0) {
                    corePayload.closedPrice = t.patch.closedPrice;
                  }
                  try {
                    await updateDoc(ref, corePayload);
                    applyVerificationPatch(t.rec.id, t.patch, t.nextStatus);
                    backoffRef.current.delete(safeId);
                    reconciled = true;
                  } catch {
                    // Legacy doc violates hardened schema; keep local state and freeze remote verify retries
                    backoffRef.current.set(safeId, Date.now() + 24 * 60 * 60 * 1000);
                    reconciled = true;
                  }
                }
              }
            } catch {
              // fall through to structured error handler below
            }

            if (!reconciled) {
              backoffRef.current.set(safeId, Date.now() + FAILURE_BACKOFF_MS);
              processedResultRef.current.delete(safeId);
              try {
                handleFirestoreError(err, OperationType.UPDATE, docPath);
              } catch {
                // structured JSON logged
              }
            }
          } finally {
            inFlightVerifyRef.current.delete(safeId);
            releaseSignalWriteLock?.(safeId);
          }
        }
      } catch {
        // firebase init error handled upstream
      }
    })();
  }, [
    assets,
    idxMoversBucket,
    usMoversBucket,
    records,
    feedsLive,
    cloudSynced,
    user,
    profileReady,
    isRecordConfirmedOnServer,
    tryAcquireSignalWriteLock,
    releaseSignalWriteLock,
    applyVerificationPatch,
    onRemoveUnfilledSignal,
  ]);

  // Compute true hit-rate metrics strictly from entry-zone verified signals
  return useMemo<SignalVerificationMetrics>(() => {
    let verifiedCount = 0;
    let expiredCount = 0;
    let pendingCount = 0;
    let verifiedWins = 0;
    let verifiedLosses = 0;
    let verifiedBe = 0;

    for (const r of records) {
      const vStatus = deriveSignalVerificationStatus(r);
      const st = normalizeSignalStatus(r.status);
      if (vStatus === 'Verified') {
        verifiedCount += 1;
        if (st === 'TP' || r.userOutcome === 'WIN') {
          verifiedWins += 1;
        } else if (st === 'SL' || r.userOutcome === 'LOSS') {
          verifiedLosses += 1;
        } else if (r.status === 'BE_CLOSED' || r.barrierOutcome === 'BREAK_EVEN' || r.userOutcome === 'BE') {
          verifiedBe += 1;
        }
      } else if (vStatus === 'Expired') {
        expiredCount += 1;
      } else {
        pendingCount += 1;
      }
    }

    const verifiedDecided = verifiedWins + verifiedLosses;
    const trueHitRatePct =
      verifiedDecided > 0 ? Math.round((verifiedWins / verifiedDecided) * 100) : null;
    const resolvedTotal = verifiedCount + expiredCount;
    const fillConversionRatePct =
      resolvedTotal > 0 ? Math.round((verifiedCount / resolvedTotal) * 100) : null;

    return {
      verifiedCount,
      expiredCount,
      pendingCount,
      fillConversionRatePct,
      verifiedWins,
      verifiedLosses,
      verifiedBe,
      verifiedDecided,
      trueHitRatePct,
      isMonitoring: feedsLive && pendingCount > 0,
      recentVerifications,
    };
  }, [records, feedsLive, recentVerifications]);
}
