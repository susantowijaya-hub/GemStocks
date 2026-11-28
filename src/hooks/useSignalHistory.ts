import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { getFirebaseServices } from '../lib/firebase';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';
import {
  EconomicEvent,
  MarketAsset,
  SignalBarrierOutcome,
  SignalExecutionPostureTag,
  SignalExpiredReason,
  SignalHistoryRecord,
  SignalHistoryStatus,
  SignalIndexedOutcome,
  SignalSourceEngine,
  SignalStrategyKey,
  SignalUserOutcome,
  SignalVerificationStatus,
  StockMover,
  StocksMoversBucket,
  SyncedRadarConfig,
} from '../types/market';
import {
  LivePriceProbe,
  SignalHistoryStats,
  buildIctSignalCandidate,
  buildSdcvSignalCandidate,
  buildStockSignalCandidate,
  computeSignalHistoryStats,
  deriveSignalIndexedOutcome,
  deriveSignalStrategyKey,
  deriveSignalVerificationStatus,
  isTerminalSignalStatus,
  isUnfilledExpiredSignal,
  normalizeSignalStatus,
  reconcileSignalHistory,
} from '../utils/signalHistoryEngine';
import {
  PENDING_CLEANUP_INTERVAL_MS,
  runPendingSignalCleanup,
} from '../utils/signalCleanupService';

const LOCAL_STORAGE_KEY = 'stocks-signal-history-v2';
const RECALIBRATED_AT_KEY = 'stocks-signal-recalibrated-at-v1';
const MAX_LOCAL_RECORDS = 150;
const RECONCILE_INTERVAL_MS = 4500;

type RadarEngines = {
  scanAllIctSignals: typeof import('../utils/ictSignals').scanAllIctSignals;
  scanAllSdCandleVolumeSignals: typeof import('../utils/sdCandleVolumeSignals').scanAllSdCandleVolumeSignals;
};

let cachedRadarEngines: RadarEngines | null = null;
let radarEnginesPromise: Promise<RadarEngines> | null = null;

function loadRadarEngines(): Promise<RadarEngines> {
  if (cachedRadarEngines) return Promise.resolve(cachedRadarEngines);
  if (!radarEnginesPromise) {
    radarEnginesPromise = Promise.all([
      import('../utils/ictSignals'),
      import('../utils/sdCandleVolumeSignals'),
    ]).then(([ictMod, sdcvMod]) => {
      cachedRadarEngines = {
        scanAllIctSignals: ictMod.scanAllIctSignals,
        scanAllSdCandleVolumeSignals: sdcvMod.scanAllSdCandleVolumeSignals,
      };
      return cachedRadarEngines;
    });
  }
  return radarEnginesPromise;
}

function loadLocalSignalHistory(): SignalHistoryRecord[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SignalHistoryRecord =>
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.lockKey === 'string' &&
          typeof item.entryPrice === 'number' &&
          item.entryPrice > 0 &&
          typeof item.stopLoss === 'number' &&
          item.stopLoss > 0 &&
          !isUnfilledExpiredSignal(item)
      )
      .slice(0, MAX_LOCAL_RECORDS);
  } catch {
    return [];
  }
}

function saveLocalSignalHistory(records: SignalHistoryRecord[]): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify(records.slice(0, MAX_LOCAL_RECORDS))
    );
  } catch {
    // ignore quota errors
  }
}

function collectUniqueStocks(bucket: StocksMoversBucket): StockMover[] {
  const map = new Map<string, StockMover>();
  const lists = [
    bucket.impact,
    bucket.gainers,
    bucket.losers,
    bucket.foreignBuy ?? [],
    bucket.foreignSell ?? [],
  ];
  for (const list of lists) {
    for (const item of list) {
      if (!item?.symbol || !Number.isFinite(item.price) || item.price <= 0) continue;
      if (!map.has(item.symbol)) {
        map.set(item.symbol, item);
      }
    }
  }
  return Array.from(map.values());
}

const VALID_SIGNAL_STATUSES = new Set<SignalHistoryStatus>([
  'PENDING',
  'FILLED',
  'EXPIRED',
  'TP',
  'SL',
  'PENDING_LIMIT',
  'RUNNING',
  'TP1_HIT',
  'TP2_HIT',
  'SL_HIT',
  'BE_CLOSED',
]);

const VALID_ASSET_CLASSES = new Set(['stock_id', 'stock_us', 'crypto', 'commodity']);
const VALID_SOURCE_ENGINES = new Set(['idx_scanner', 'us_scanner', 'ict_radar', 'sdcv_radar']);
const VALID_EXECUTION_POSTURES = new Set<SignalExecutionPostureTag>([
  'enter_now',
  'armed_limit',
  'limit_pullback_only',
]);
const VALID_USER_OUTCOMES = new Set<SignalUserOutcome>(['WIN', 'LOSS', 'BE', 'SKIPPED']);
const VALID_STRATEGY_KEYS = new Set<SignalStrategyKey>([
  'ict_2022',
  'sdcv_canonical',
  'idx_bandar',
  'us_swing',
]);
const VALID_INDEXED_OUTCOMES = new Set<SignalIndexedOutcome>([
  'PENDING',
  'RUNNING',
  'WIN',
  'LOSS',
  'BE',
  'EXPIRED',
]);
const VALID_VERIFICATION_STATUSES = new Set<SignalVerificationStatus>([
  'Pending',
  'Verified',
  'Expired',
]);
const VALID_BARRIER_OUTCOMES = new Set<SignalBarrierOutcome>([
  'UPPER_TP',
  'LOWER_SL',
  'TIME_BARRIER',
  'BREAK_EVEN',
  'OPEN',
]);
const VALID_VOL_REGIMES = new Set(['R1_COMPRESSION', 'NORMAL', 'R2_EXPANSION']);
const VALID_EXPIRED_REASONS = new Set<SignalExpiredReason>([
  'INVALIDATED_SL',
  'MISSED_TP1',
  'UNFILLED_TIMEOUT',
  'TIME_BARRIER',
]);

function sanitizeFirestoreDocId(raw: string): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || `sig_${Date.now()}`;
}

function finitePositive(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}

function finiteClamped(value: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function buildFirestoreCreatePayload(
  rec: SignalHistoryRecord,
  uid: string,
  serverTimestampFn: () => unknown
): Record<string, unknown> | null {
  const entryPrice = finitePositive(rec.entryPrice, 0);
  const stopLoss = finitePositive(rec.stopLoss, 0);
  const tp1 = finitePositive(rec.tp1, 0);
  const tp2 = finitePositive(rec.tp2, tp1);
  if (entryPrice <= 0 || stopLoss <= 0 || tp1 <= 0 || tp2 <= 0) {
    return null;
  }

  const firstShownPrice = finitePositive(rec.firstShownPrice, entryPrice);
  const entryLow = finitePositive(rec.entryLow, entryPrice);
  const entryHigh = finitePositive(rec.entryHigh, entryPrice);
  const lastPrice = finitePositive(rec.lastPrice, firstShownPrice);
  const maxFavorablePrice = finitePositive(rec.maxFavorablePrice, lastPrice);
  const maxAdversePrice = finitePositive(rec.maxAdversePrice, lastPrice);
  const createdAtMs = Math.round(finitePositive(rec.createdAtMs, Date.now()));
  const lastCheckedAtMs = Math.round(finitePositive(rec.lastCheckedAtMs, createdAtMs));

  const cleanSymbol =
    String(rec.symbol || 'ASSET')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9._\-/^=]/g, '')
      .slice(0, 24) || 'ASSET';
  const cleanAssetId =
    String(rec.assetId || cleanSymbol)
      .trim()
      .replace(/[^A-Za-z0-9._\-/^=]/g, '')
      .slice(0, 32) || cleanSymbol;
  const safeAssetClass = VALID_ASSET_CLASSES.has(rec.assetClass) ? rec.assetClass : 'stock_id';
  const safeSourceEngine = VALID_SOURCE_ENGINES.has(rec.sourceEngine)
    ? rec.sourceEngine
    : 'idx_scanner';
  const safeStatus: SignalHistoryStatus = VALID_SIGNAL_STATUSES.has(rec.status)
    ? normalizeSignalStatus(rec.status)
    : 'FILLED';
  const rawLock = String(rec.lockKey || `${safeSourceEngine}:${cleanAssetId}`)
    .trim()
    .replace(/[^a-zA-Z0-9_.:/\-]/g, '_')
    .slice(0, 80);
  const cleanLockKey = rawLock.length >= 3 ? rawLock : `sig_${cleanAssetId}`.slice(0, 80);

  const safeStrategy: SignalStrategyKey =
    rec.strategy && VALID_STRATEGY_KEYS.has(rec.strategy)
      ? rec.strategy
      : deriveSignalStrategyKey(safeSourceEngine as SignalSourceEngine);
  const safeOutcome: SignalIndexedOutcome = deriveSignalIndexedOutcome(safeStatus, rec.userOutcome);
  const safeTimestamp = Math.round(finitePositive(rec.timestamp ?? createdAtMs, createdAtMs));

  const payload: Record<string, unknown> = {
    ownerId: uid,
    lockKey: cleanLockKey,
    assetClass: safeAssetClass,
    sourceEngine: safeSourceEngine,
    symbol: cleanSymbol,
    assetId: cleanAssetId,
    name: String(rec.name || cleanSymbol).trim().slice(0, 120) || cleanSymbol,
    currency: rec.currency === 'IDR' ? 'IDR' : 'USD',
    decimals: Math.round(finiteClamped(rec.decimals, 0, 6, 2)),
    timeframe: String(rec.timeframe || '1D').trim().slice(0, 8) || '1D',
    direction: rec.direction === 'SELL' ? 'SELL' : 'BUY',
    strategyTag: String(rec.strategyTag || 'Setup').trim().slice(0, 140) || 'Setup',
    strategy: safeStrategy,
    outcome: safeOutcome,
    timestamp: safeTimestamp,
    confidence: Math.round(finiteClamped(rec.confidence, 0, 100, 60)),
    firstShownPrice,
    entryPrice,
    entryLow: Math.min(entryLow, entryHigh),
    entryHigh: Math.max(entryLow, entryHigh),
    stopLoss,
    tp1,
    tp2,
    riskReward: String(rec.riskReward || '1 : 2.0').trim().slice(0, 24) || '1 : 2.0',
    status: safeStatus,
    filledOnFirstSight: Boolean(rec.filledOnFirstSight),
    createdAtMs,
    lastPrice,
    maxFavorablePrice,
    maxAdversePrice,
    pnlPct: finiteClamped(rec.pnlPct, -100, 5000, 0),
    rMultiple: finiteClamped(rec.rMultiple, -20, 200, 0),
    lastCheckedAtMs,
    createdAt: serverTimestampFn(),
    updatedAt: serverTimestampFn(),
  };

  if (rec.executionPosture && VALID_EXECUTION_POSTURES.has(rec.executionPosture)) {
    payload.executionPosture = rec.executionPosture;
  }
  if (typeof rec.zoneFillVerified === 'boolean') {
    payload.zoneFillVerified = rec.zoneFillVerified;
  }
  const safeVerificationStatus = deriveSignalVerificationStatus(rec);
  payload.verificationStatus = safeVerificationStatus;
  if (typeof rec.verifiedAtMs === 'number' && Number.isFinite(rec.verifiedAtMs) && rec.verifiedAtMs > 0) {
    payload.verifiedAtMs = Math.round(rec.verifiedAtMs);
  }
  if (rec.userOutcome && VALID_USER_OUTCOMES.has(rec.userOutcome)) {
    payload.userOutcome = rec.userOutcome;
  }
  if (typeof rec.journalNote === 'string' && rec.journalNote.trim().length > 0) {
    payload.journalNote = rec.journalNote.trim().slice(0, 300);
  }
  if (typeof rec.journaledAtMs === 'number' && Number.isFinite(rec.journaledAtMs) && rec.journaledAtMs > 0) {
    payload.journaledAtMs = Math.round(rec.journaledAtMs);
  }
  if (typeof rec.filledAtMs === 'number' && Number.isFinite(rec.filledAtMs) && rec.filledAtMs > 0) {
    payload.filledAtMs = Math.round(rec.filledAtMs);
  }
  if (typeof rec.tp1HitAtMs === 'number' && Number.isFinite(rec.tp1HitAtMs) && rec.tp1HitAtMs > 0) {
    payload.tp1HitAtMs = Math.round(rec.tp1HitAtMs);
  }
  if (typeof rec.closedAtMs === 'number' && Number.isFinite(rec.closedAtMs) && rec.closedAtMs > 0) {
    payload.closedAtMs = Math.round(rec.closedAtMs);
  }
  if (typeof rec.closedPrice === 'number' && Number.isFinite(rec.closedPrice) && rec.closedPrice > 0) {
    payload.closedPrice = rec.closedPrice;
  }
  if (typeof rec.mfeR === 'number' && Number.isFinite(rec.mfeR)) {
    payload.mfeR = finiteClamped(rec.mfeR, -20, 200, 0);
  }
  if (typeof rec.maeR === 'number' && Number.isFinite(rec.maeR)) {
    payload.maeR = finiteClamped(rec.maeR, -20, 200, 0);
  }
  if (rec.barrierOutcome && VALID_BARRIER_OUTCOMES.has(rec.barrierOutcome)) {
    payload.barrierOutcome = rec.barrierOutcome;
  }
  if (typeof rec.timeBarrierAtMs === 'number' && Number.isFinite(rec.timeBarrierAtMs) && rec.timeBarrierAtMs > 0) {
    payload.timeBarrierAtMs = Math.round(rec.timeBarrierAtMs);
  }
  if (rec.inKillzone === true) {
    payload.inKillzone = true;
  }
  if (rec.po3Aligned === true) {
    payload.po3Aligned = true;
  }
  if (rec.smtConfirmed === true) {
    payload.smtConfirmed = true;
  }
  if (rec.volatilityRegime && VALID_VOL_REGIMES.has(rec.volatilityRegime)) {
    payload.volatilityRegime = rec.volatilityRegime;
  }
  if (rec.htfAligned === true) {
    payload.htfAligned = true;
  }
  if (typeof rec.netRr === 'number' && Number.isFinite(rec.netRr) && rec.netRr > 0) {
    payload.netRr = finiteClamped(rec.netRr, 0, 100, 0);
  }
  if (rec.stage2Aligned === true) {
    payload.stage2Aligned = true;
  }
  if (typeof rec.rsRank === 'number' && Number.isFinite(rec.rsRank)) {
    payload.rsRank = Math.round(finiteClamped(rec.rsRank, 0, 100, 50));
  }
  if (rec.vcpDetected === true) {
    payload.vcpDetected = true;
  }
  if (rec.sectorLeader === true) {
    payload.sectorLeader = true;
  }
  if (typeof rec.orderType === 'string' && rec.orderType.trim().length > 0) {
    payload.orderType = rec.orderType.trim().slice(0, 24);
  }
  if (rec.expiredReason && VALID_EXPIRED_REASONS.has(rec.expiredReason)) {
    payload.expiredReason = rec.expiredReason;
  }

  return payload;
}

function buildFirestoreCoreCreatePayload(
  fullPayload: Record<string, unknown>,
  serverTimestampFn: () => unknown
): Record<string, unknown> {
  const coreKeys = [
    'ownerId',
    'lockKey',
    'assetClass',
    'sourceEngine',
    'symbol',
    'assetId',
    'name',
    'currency',
    'decimals',
    'timeframe',
    'direction',
    'strategyTag',
    'strategy',
    'outcome',
    'timestamp',
    'confidence',
    'firstShownPrice',
    'entryPrice',
    'entryLow',
    'entryHigh',
    'stopLoss',
    'tp1',
    'tp2',
    'riskReward',
    'status',
    'filledOnFirstSight',
    'verificationStatus',
    'createdAtMs',
    'lastPrice',
    'maxFavorablePrice',
    'maxAdversePrice',
    'pnlPct',
    'rMultiple',
    'lastCheckedAtMs',
  ] as const;

  const core: Record<string, unknown> = {};
  for (const key of coreKeys) {
    if (key in fullPayload && fullPayload[key] !== undefined) {
      core[key] = fullPayload[key];
    }
  }
  core.createdAt = serverTimestampFn();
  core.updatedAt = serverTimestampFn();
  return core;
}

function buildFirestoreUpdatePayload(
  rec: SignalHistoryRecord,
  serverTimestampFn: () => unknown
): Record<string, unknown> | null {
  const safeStatus: SignalHistoryStatus = VALID_SIGNAL_STATUSES.has(rec.status)
    ? normalizeSignalStatus(rec.status)
    : 'FILLED';
  const lastPrice = finitePositive(rec.lastPrice, finitePositive(rec.entryPrice, 0));
  if (lastPrice <= 0) return null;

  const maxFavorablePrice = finitePositive(rec.maxFavorablePrice, lastPrice);
  const maxAdversePrice = finitePositive(rec.maxAdversePrice, lastPrice);
  const lastCheckedAtMs = Math.round(finitePositive(rec.lastCheckedAtMs, Date.now()));

  const payload: Record<string, unknown> = {
    status: safeStatus,
    outcome: deriveSignalIndexedOutcome(safeStatus, rec.userOutcome),
    lastPrice,
    maxFavorablePrice,
    maxAdversePrice,
    pnlPct: finiteClamped(rec.pnlPct, -100, 5000, 0),
    rMultiple: finiteClamped(rec.rMultiple, -20, 200, 0),
    lastCheckedAtMs,
    updatedAt: serverTimestampFn(),
  };

  if (typeof rec.zoneFillVerified === 'boolean') {
    payload.zoneFillVerified = rec.zoneFillVerified;
  }
  if (rec.verificationStatus && VALID_VERIFICATION_STATUSES.has(rec.verificationStatus)) {
    payload.verificationStatus = rec.verificationStatus;
  }
  if (typeof rec.verifiedAtMs === 'number' && Number.isFinite(rec.verifiedAtMs) && rec.verifiedAtMs > 0) {
    payload.verifiedAtMs = Math.round(rec.verifiedAtMs);
  }
  if (typeof rec.filledAtMs === 'number' && Number.isFinite(rec.filledAtMs) && rec.filledAtMs > 0) {
    payload.filledAtMs = Math.round(rec.filledAtMs);
  }
  if (typeof rec.tp1HitAtMs === 'number' && Number.isFinite(rec.tp1HitAtMs) && rec.tp1HitAtMs > 0) {
    payload.tp1HitAtMs = Math.round(rec.tp1HitAtMs);
  }
  if (typeof rec.closedAtMs === 'number' && Number.isFinite(rec.closedAtMs) && rec.closedAtMs > 0) {
    payload.closedAtMs = Math.round(rec.closedAtMs);
  }
  if (typeof rec.closedPrice === 'number' && Number.isFinite(rec.closedPrice) && rec.closedPrice > 0) {
    payload.closedPrice = rec.closedPrice;
  }
  if (typeof rec.mfeR === 'number' && Number.isFinite(rec.mfeR)) {
    payload.mfeR = finiteClamped(rec.mfeR, -20, 200, 0);
  }
  if (typeof rec.maeR === 'number' && Number.isFinite(rec.maeR)) {
    payload.maeR = finiteClamped(rec.maeR, -20, 200, 0);
  }
  if (rec.barrierOutcome && VALID_BARRIER_OUTCOMES.has(rec.barrierOutcome)) {
    payload.barrierOutcome = rec.barrierOutcome;
  }
  if (rec.expiredReason && VALID_EXPIRED_REASONS.has(rec.expiredReason)) {
    payload.expiredReason = rec.expiredReason;
  }

  return payload;
}

export interface CloudSignalEngineStatus {
  running: boolean;
  lastScanAtMs: number | null;
  recalibratedAtMs?: number | null;
  trackedCount: number;
  activeCount: number;
  scanIntervalSec: number;
}

export interface UseSignalHistoryResult {
  records: SignalHistoryRecord[];
  activeByLockKey: Map<string, SignalHistoryRecord>;
  activeBySymbol: Map<string, SignalHistoryRecord>;
  stats: SignalHistoryStats;
  cloudSynced: boolean;
  isSyncing: boolean;
  cloudEngineStatus: CloudSignalEngineStatus;
  triggerCloudScan: () => Promise<void>;
  refreshSignalDatabase: () => Promise<void>;
  annotateSignal: (
    signalId: string,
    outcome: SignalUserOutcome | null,
    journalNote?: string
  ) => Promise<void>;
  applyVerificationPatch: (
    signalId: string,
    patch: Partial<SignalHistoryRecord>,
    syncedStatus?: SignalHistoryStatus
  ) => void;
  isRecordConfirmedOnServer: (signalId: string) => boolean;
  tryAcquireSignalWriteLock: (signalId: string) => boolean;
  releaseSignalWriteLock: (signalId: string) => void;
  deleteSignal: (signalId: string) => Promise<void>;
  clearClosedSignals: () => Promise<void>;
}

export function useSignalHistory(
  assets: MarketAsset[],
  idxMoversBucket: StocksMoversBucket,
  usMoversBucket: StocksMoversBucket,
  economicEvents: EconomicEvent[],
  syncedRadarConfig: SyncedRadarConfig,
  feedsLive: boolean
): UseSignalHistoryResult {
  const { user, authReady, profileReady } = useAuth();
  const [records, setRecords] = useState<SignalHistoryRecord[]>(() => loadLocalSignalHistory());
  const [cloudSynced, setCloudSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudEngineStatus, setCloudEngineStatus] = useState<CloudSignalEngineStatus>({
    running: false,
    lastScanAtMs: null,
    trackedCount: 0,
    activeCount: 0,
    scanIntervalSec: 60,
  });

  const recordsRef = useRef<SignalHistoryRecord[]>(records);
  recordsRef.current = records;

  // Track confirmed server status of documents in Firestore so we never update unconfirmed or terminal docs
  const remoteStatusMapRef = useRef<Map<string, SignalHistoryStatus>>(new Map());
  const inFlightDocIdsRef = useRef<Set<string>>(new Set());
  const inFlightLockKeysRef = useRef<Set<string>>(new Set());
  const failedWriteBackoffRef = useRef<Map<string, number>>(new Map());
  const blockedLegacyUpdateIdsRef = useRef<Set<string>>(new Set());
  const backfillInProgressRef = useRef(false);
  const cloudReadyRef = useRef(false);
  const lastReconcileAtRef = useRef(0);
  const persistedStockProbesRef = useRef<Map<string, LivePriceProbe>>(new Map());
  const [stockProbeTick, setStockProbeTick] = useState(0);

  const mergeCloudRecords = useCallback(
    async (cloudRecords: SignalHistoryRecord[], recalibratedAtMs?: number | null) => {
      if (!Array.isArray(cloudRecords)) return;
      const validCloud = cloudRecords.filter(
        (r) => r && r.timeframe !== '1m' && !isUnfilledExpiredSignal(r)
      );

      // Check if server performed a clean v3 DB refresh/recalibration newer than our last synced epoch
      let isFreshRecalibration = false;
      if (typeof recalibratedAtMs === 'number' && recalibratedAtMs > 0 && typeof window !== 'undefined') {
        const lastSyncedRecal = Number(window.localStorage.getItem(RECALIBRATED_AT_KEY) || '0');
        if (recalibratedAtMs > lastSyncedRecal) {
          isFreshRecalibration = true;
          try {
            window.localStorage.setItem(RECALIBRATED_AT_KEY, String(recalibratedAtMs));
          } catch {
            // ignore storage quota errors
          }
        }
      }

      const getSlotKey = (rec: SignalHistoryRecord): string => {
        const isStock = rec.assetClass === 'stock_id' || rec.assetClass === 'stock_us';
        if (isStock) return `stock:${rec.assetClass}:${rec.symbol.toUpperCase()}`;
        return `radar:${rec.assetId.toUpperCase()}:${rec.timeframe.toLowerCase()}`;
      };

      const toPersistToFirestore: SignalHistoryRecord[] = [];
      const staleIdsToPruneFromFirestore: string[] = [];

      if (isFreshRecalibration) {
        const freshIds = new Set(validCloud.map((c) => sanitizeFirestoreDocId(c.id)));
        for (const existingRec of recordsRef.current) {
          const safeId = sanitizeFirestoreDocId(existingRec.id);
          if (!freshIds.has(safeId)) {
            staleIdsToPruneFromFirestore.push(safeId);
          }
        }

        const freshNormalized: SignalHistoryRecord[] = validCloud
          .map((c) => {
            const normalizedStatus = normalizeSignalStatus(c.status);
            return {
              ...c,
              status: normalizedStatus,
              outcome: deriveSignalIndexedOutcome(normalizedStatus, c.userOutcome),
              ownerId: user?.uid ?? 'local',
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs)
          .slice(0, MAX_LOCAL_RECORDS);

        recordsRef.current = freshNormalized;
        setRecords(freshNormalized);
        toPersistToFirestore.push(...freshNormalized);
      } else {
        if (validCloud.length === 0) return;
        setRecords((prev) => {
          const byId = new Map<string, SignalHistoryRecord>();
          const activeLockKeys = new Set<string>();
          const activeSlots = new Set<string>();
          for (const r of prev) {
            byId.set(r.id, r);
            if (!isTerminalSignalStatus(r.status)) {
              activeLockKeys.add(r.lockKey);
              activeSlots.add(getSlotKey(r));
            }
          }

          let mutated = false;
          for (const c of validCloud) {
            const existing = byId.get(c.id);
            if (!existing) {
              // Strict Non-Overlay: never add a second active signal on the same lockKey or instrument slot
              if (
                !isTerminalSignalStatus(c.status) &&
                (activeLockKeys.has(c.lockKey) || activeSlots.has(getSlotKey(c)))
              ) {
                continue;
              }
              const normalizedStatus = normalizeSignalStatus(c.status);
              const normalized: SignalHistoryRecord = {
                ...c,
                status: normalizedStatus,
                outcome: deriveSignalIndexedOutcome(normalizedStatus, c.userOutcome),
                ownerId: user?.uid ?? 'local',
              };
              byId.set(c.id, normalized);
              if (!isTerminalSignalStatus(normalizedStatus)) {
                activeLockKeys.add(c.lockKey);
                activeSlots.add(getSlotKey(normalized));
              }
              toPersistToFirestore.push(normalized);
              mutated = true;
            } else if (
              !isTerminalSignalStatus(existing.status) &&
              (isTerminalSignalStatus(c.status) || c.lastCheckedAtMs > existing.lastCheckedAtMs)
            ) {
              const normalizedStatus = normalizeSignalStatus(c.status);
              byId.set(c.id, {
                ...existing,
                status: normalizedStatus,
                outcome: deriveSignalIndexedOutcome(normalizedStatus, existing.userOutcome),
                filledAtMs: existing.filledAtMs ?? c.filledAtMs,
                tp1HitAtMs: existing.tp1HitAtMs ?? c.tp1HitAtMs,
                closedAtMs: existing.closedAtMs ?? c.closedAtMs,
                closedPrice: existing.closedPrice ?? c.closedPrice,
                zoneFillVerified: existing.zoneFillVerified || c.zoneFillVerified,
                verificationStatus: c.verificationStatus ?? existing.verificationStatus,
                expiredReason: c.expiredReason ?? existing.expiredReason,
                lastPrice: c.lastPrice,
                maxFavorablePrice: c.maxFavorablePrice,
                maxAdversePrice: c.maxAdversePrice,
                pnlPct: c.pnlPct,
                rMultiple: c.rMultiple,
                lastCheckedAtMs: Math.max(existing.lastCheckedAtMs, c.lastCheckedAtMs),
              });
              mutated = true;
            }
          }

          if (!mutated) return prev;
          const merged = Array.from(byId.values())
            .sort((a, b) => b.createdAtMs - a.createdAtMs)
            .slice(0, MAX_LOCAL_RECORDS);
          recordsRef.current = merged;
          return merged;
        });
      }

      // Mirror newly discovered / recalibrated 24H cloud signals into the user's Firestore ledger
      if (user && profileReady && cloudReadyRef.current) {
        try {
          const { db } = await getFirebaseServices();
          for (const staleId of staleIdsToPruneFromFirestore) {
            remoteStatusMapRef.current.delete(staleId);
            void deleteDoc(doc(db, 'users', user.uid, 'signalHistory', staleId)).catch(() => {
              // ignore cleanup errors
            });
          }
          for (const rec of toPersistToFirestore) {
            const safeId = sanitizeFirestoreDocId(rec.id);
            if (!isFreshRecalibration && (remoteStatusMapRef.current.has(safeId) || inFlightDocIdsRef.current.has(safeId))) {
              continue;
            }
            const payload = buildFirestoreCreatePayload(rec, user.uid, serverTimestamp);
            if (!payload) continue;
            inFlightDocIdsRef.current.add(safeId);
            setDoc(doc(db, 'users', user.uid, 'signalHistory', safeId), payload)
              .then(() => {
                remoteStatusMapRef.current.set(safeId, rec.status);
              })
              .catch(() => {
                // Non-fatal: already persisted in cloud ledger + local mirror
              })
              .finally(() => {
                inFlightDocIdsRef.current.delete(safeId);
              });
          }
        } catch {
          // ignore
        }
      }
    },
    [user, profileReady]
  );

  // 24H Cloud Background Signal Engine hydration (runs on mount & every 30s)
  useEffect(() => {
    let cancelled = false;
    const pollCloudSignals = async () => {
      try {
        const res = await fetch('/api/signals/cloud', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled || !data) return;
        const recalMs = typeof data.recalibratedAtMs === 'number' ? data.recalibratedAtMs : null;
        setCloudEngineStatus({
          running: Boolean(data.running),
          lastScanAtMs: typeof data.lastScanAtMs === 'number' ? data.lastScanAtMs : null,
          recalibratedAtMs: recalMs,
          trackedCount: Number(data.trackedCount ?? 0),
          activeCount: Number(data.activeCount ?? 0),
          scanIntervalSec: Number(data.scanIntervalSec ?? 60),
        });
        if (Array.isArray(data.records)) {
          void mergeCloudRecords(data.records, recalMs);
        }
      } catch {
        // non-fatal
      }
    };

    void pollCloudSignals();
    const timer = window.setInterval(() => {
      void pollCloudSignals();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mergeCloudRecords]);

  const triggerCloudScan = useCallback(async () => {
    try {
      const res = await fetch('/api/signals/cloud/scan', { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json();
      const snap = data?.snapshot;
      if (snap) {
        const recalMs = typeof snap.recalibratedAtMs === 'number' ? snap.recalibratedAtMs : null;
        setCloudEngineStatus({
          running: Boolean(snap.running),
          lastScanAtMs: typeof snap.lastScanAtMs === 'number' ? snap.lastScanAtMs : null,
          recalibratedAtMs: recalMs,
          trackedCount: Number(snap.trackedCount ?? 0),
          activeCount: Number(snap.activeCount ?? 0),
          scanIntervalSec: Number(snap.scanIntervalSec ?? 60),
        });
        if (Array.isArray(snap.records)) {
          void mergeCloudRecords(snap.records, recalMs);
        }
      }
    } catch {
      // ignore
    }
  }, [mergeCloudRecords]);

  const refreshSignalDatabase = useCallback(async () => {
    try {
      const res = await fetch('/api/signals/cloud/refresh', { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json();
      const snap = data?.snapshot;
      if (snap) {
        const recalMs =
          typeof data.recalibratedAtMs === 'number'
            ? data.recalibratedAtMs
            : typeof snap.recalibratedAtMs === 'number'
              ? snap.recalibratedAtMs
              : Date.now();
        setCloudEngineStatus({
          running: Boolean(snap.running),
          lastScanAtMs: typeof snap.lastScanAtMs === 'number' ? snap.lastScanAtMs : null,
          recalibratedAtMs: recalMs,
          trackedCount: Number(snap.trackedCount ?? 0),
          activeCount: Number(snap.activeCount ?? 0),
          scanIntervalSec: Number(snap.scanIntervalSec ?? 60),
        });
        if (Array.isArray(snap.records)) {
          await mergeCloudRecords(snap.records, recalMs);
        }
      }
    } catch {
      // ignore
    }
  }, [mergeCloudRecords]);

  // Persist local mirror whenever records change
  useEffect(() => {
    saveLocalSignalHistory(records);
  }, [records]);

  // Automated 48-Hour Pending Signal Cleanup Service (runs immediately & every 5 minutes)
  // Moves any 'Pending' signal untriggered for >= 48h to 'Closed/Expired' locally & in Firestore
  useEffect(() => {
    let cancelled = false;
    const executePendingCleanup = async () => {
      const cleanup = runPendingSignalCleanup(recordsRef.current, Date.now());
      if (!cleanup.changed || cancelled) return;

      recordsRef.current = cleanup.nextRecords;
      setRecords(cleanup.nextRecords);

      if (!user || !profileReady || !cloudReadyRef.current) return;
      try {
        const { db } = await getFirebaseServices();
        for (const expiredRec of cleanup.expiredRecords) {
          if (cancelled) return;
          const safeId = sanitizeFirestoreDocId(expiredRec.id);
          const remoteStatus = remoteStatusMapRef.current.get(safeId);
          if (!remoteStatus || isTerminalSignalStatus(remoteStatus) || inFlightDocIdsRef.current.has(safeId)) {
            continue;
          }
          const payload = buildFirestoreUpdatePayload(expiredRec, serverTimestamp);
          if (!payload) continue;
          const docPath = `users/${user.uid}/signalHistory/${safeId}`;
          inFlightDocIdsRef.current.add(safeId);
          try {
            await updateDoc(doc(db, 'users', user.uid, 'signalHistory', safeId), payload);
            remoteStatusMapRef.current.set(safeId, 'EXPIRED');
          } catch (err) {
            try {
              handleFirestoreError(err, OperationType.UPDATE, docPath);
            } catch {
              // logged
            }
          } finally {
            inFlightDocIdsRef.current.delete(safeId);
          }
        }
      } catch {
        // non-fatal; retried on next cleanup tick
      }
    };

    void executePendingCleanup();
    const timer = window.setInterval(() => {
      void executePendingCleanup();
    }, PENDING_CLEANUP_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user, profileReady]);

  // Attach Firestore real-time listener when authenticated & profile ready
  useEffect(() => {
    if (!authReady || !profileReady || !user) {
      setCloudSynced(false);
      cloudReadyRef.current = false;
      remoteStatusMapRef.current.clear();
      inFlightLockKeysRef.current.clear();
      failedWriteBackoffRef.current.clear();
      blockedLegacyUpdateIdsRef.current.clear();
      return;
    }

    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    const attachFirestore = async () => {
      setIsSyncing(true);
      const collectionPath = `users/${user.uid}/signalHistory`;
      try {
        const { db } = await getFirebaseServices();
        if (disposed) return;

        // Filter explicitly by ownerId to satisfy Firestore security rules
        // (allow list: resource.data.ownerId == request.auth.uid) without requiring a composite index
        const q = query(
          collection(db, 'users', user.uid, 'signalHistory'),
          where('ownerId', '==', user.uid),
          limit(MAX_LOCAL_RECORDS)
        );

        let initialSeedDone = false;

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            if (disposed) return;
            const remoteRecords: SignalHistoryRecord[] = [];
            const nextRemoteMap = new Map<string, SignalHistoryStatus>();

            snapshot.forEach((docSnap) => {
              const d = docSnap.data();
              if (!d || typeof d.lockKey !== 'string' || typeof d.entryPrice !== 'number') return;
              const rec: SignalHistoryRecord = {
                id: docSnap.id,
                ownerId: String(d.ownerId || user.uid),
                lockKey: String(d.lockKey),
                assetClass: d.assetClass,
                sourceEngine: d.sourceEngine,
                symbol: String(d.symbol),
                assetId: String(d.assetId),
                name: String(d.name),
                currency: d.currency === 'IDR' ? 'IDR' : 'USD',
                decimals: Number(d.decimals ?? 2),
                timeframe: String(d.timeframe || '1D'),
                direction: d.direction === 'SELL' ? 'SELL' : 'BUY',
                strategyTag: String(d.strategyTag || 'Setup'),
                strategy:
                  typeof d.strategy === 'string' &&
                  VALID_STRATEGY_KEYS.has(d.strategy as SignalStrategyKey)
                    ? (d.strategy as SignalStrategyKey)
                    : deriveSignalStrategyKey(d.sourceEngine as SignalSourceEngine),
                outcome:
                  typeof d.outcome === 'string' &&
                  VALID_INDEXED_OUTCOMES.has(d.outcome as SignalIndexedOutcome)
                    ? (d.outcome as SignalIndexedOutcome)
                    : deriveSignalIndexedOutcome(
                        d.status as SignalHistoryStatus,
                        typeof d.userOutcome === 'string' &&
                          VALID_USER_OUTCOMES.has(d.userOutcome as SignalUserOutcome)
                          ? (d.userOutcome as SignalUserOutcome)
                          : undefined
                      ),
                timestamp: Number(d.timestamp ?? d.createdAtMs),
                confidence: Number(d.confidence ?? 60),
                firstShownPrice: Number(d.firstShownPrice),
                entryPrice: Number(d.entryPrice),
                entryLow: Number(d.entryLow),
                entryHigh: Number(d.entryHigh),
                stopLoss: Number(d.stopLoss),
                tp1: Number(d.tp1),
                tp2: Number(d.tp2),
                riskReward: String(d.riskReward || '1 : 2'),
                status: normalizeSignalStatus(d.status as SignalHistoryStatus),
                filledOnFirstSight: Boolean(d.filledOnFirstSight),
                ...(typeof d.executionPosture === 'string' &&
                VALID_EXECUTION_POSTURES.has(d.executionPosture as SignalExecutionPostureTag)
                  ? { executionPosture: d.executionPosture as SignalExecutionPostureTag }
                  : {}),
                ...(typeof d.zoneFillVerified === 'boolean'
                  ? { zoneFillVerified: d.zoneFillVerified }
                  : {}),
                ...(typeof d.verificationStatus === 'string' &&
                VALID_VERIFICATION_STATUSES.has(d.verificationStatus as SignalVerificationStatus)
                  ? { verificationStatus: d.verificationStatus as SignalVerificationStatus }
                  : {}),
                ...(typeof d.verifiedAtMs === 'number' && d.verifiedAtMs > 0
                  ? { verifiedAtMs: d.verifiedAtMs }
                  : {}),
                ...(typeof d.userOutcome === 'string' &&
                VALID_USER_OUTCOMES.has(d.userOutcome as SignalUserOutcome)
                  ? { userOutcome: d.userOutcome as SignalUserOutcome }
                  : {}),
                ...(typeof d.journalNote === 'string' && d.journalNote.length > 0
                  ? { journalNote: d.journalNote }
                  : {}),
                ...(typeof d.journaledAtMs === 'number' && d.journaledAtMs > 0
                  ? { journaledAtMs: d.journaledAtMs }
                  : {}),
                createdAtMs: Number(d.createdAtMs),
                ...(typeof d.filledAtMs === 'number' && d.filledAtMs > 0
                  ? { filledAtMs: d.filledAtMs }
                  : {}),
                ...(typeof d.tp1HitAtMs === 'number' && d.tp1HitAtMs > 0
                  ? { tp1HitAtMs: d.tp1HitAtMs }
                  : {}),
                ...(typeof d.closedAtMs === 'number' && d.closedAtMs > 0
                  ? { closedAtMs: d.closedAtMs }
                  : {}),
                ...(typeof d.closedPrice === 'number' && d.closedPrice > 0
                  ? { closedPrice: d.closedPrice }
                  : {}),
                lastPrice: Number(d.lastPrice),
                maxFavorablePrice: Number(d.maxFavorablePrice),
                maxAdversePrice: Number(d.maxAdversePrice),
                pnlPct: Number(d.pnlPct ?? 0),
                rMultiple: Number(d.rMultiple ?? 0),
                lastCheckedAtMs: Number(d.lastCheckedAtMs ?? d.createdAtMs),
                ...(typeof d.mfeR === 'number' && Number.isFinite(d.mfeR) ? { mfeR: d.mfeR } : {}),
                ...(typeof d.maeR === 'number' && Number.isFinite(d.maeR) ? { maeR: d.maeR } : {}),
                ...(typeof d.barrierOutcome === 'string' &&
                VALID_BARRIER_OUTCOMES.has(d.barrierOutcome as SignalBarrierOutcome)
                  ? { barrierOutcome: d.barrierOutcome as SignalBarrierOutcome }
                  : {}),
                ...(typeof d.timeBarrierAtMs === 'number' && d.timeBarrierAtMs > 0
                  ? { timeBarrierAtMs: d.timeBarrierAtMs }
                  : {}),
                ...(typeof d.inKillzone === 'boolean' ? { inKillzone: d.inKillzone } : {}),
                ...(typeof d.po3Aligned === 'boolean' ? { po3Aligned: d.po3Aligned } : {}),
                ...(typeof d.smtConfirmed === 'boolean' ? { smtConfirmed: d.smtConfirmed } : {}),
                ...(typeof d.volatilityRegime === 'string' && VALID_VOL_REGIMES.has(d.volatilityRegime)
                  ? {
                      volatilityRegime: d.volatilityRegime as
                        | 'R1_COMPRESSION'
                        | 'NORMAL'
                        | 'R2_EXPANSION',
                    }
                  : {}),
                ...(typeof d.htfAligned === 'boolean' ? { htfAligned: d.htfAligned } : {}),
                ...(typeof d.netRr === 'number' && Number.isFinite(d.netRr) ? { netRr: d.netRr } : {}),
                ...(typeof d.stage2Aligned === 'boolean' ? { stage2Aligned: d.stage2Aligned } : {}),
                ...(typeof d.rsRank === 'number' && Number.isFinite(d.rsRank) ? { rsRank: d.rsRank } : {}),
                ...(typeof d.vcpDetected === 'boolean' ? { vcpDetected: d.vcpDetected } : {}),
                ...(typeof d.sectorLeader === 'boolean' ? { sectorLeader: d.sectorLeader } : {}),
                ...(typeof d.orderType === 'string' && d.orderType.length > 0
                  ? { orderType: d.orderType }
                  : {}),
                ...(typeof d.expiredReason === 'string' &&
                VALID_EXPIRED_REASONS.has(d.expiredReason as SignalExpiredReason)
                  ? { expiredReason: d.expiredReason as SignalExpiredReason }
                  : {}),
              };

              // Automatically purge non-filled expired signals from Firestore & history
              if (isUnfilledExpiredSignal(rec)) {
                void deleteDoc(doc(db, 'users', user.uid, 'signalHistory', docSnap.id)).catch(() => {
                  // ignore cleanup errors
                });
                return;
              }

              remoteRecords.push(rec);
              // Only mark as server-confirmed when not a local unacknowledged pending write
              if (!docSnap.metadata.hasPendingWrites) {
                const prevKnown = remoteStatusMapRef.current.get(rec.id);
                if (prevKnown && isTerminalSignalStatus(prevKnown) && !isTerminalSignalStatus(rec.status)) {
                  nextRemoteMap.set(rec.id, prevKnown);
                } else {
                  nextRemoteMap.set(rec.id, rec.status);
                }
              }
            });

            // Preserve any locally confirmed terminal statuses that haven't settled in the snapshot yet
            for (const [docId, prevStatus] of remoteStatusMapRef.current.entries()) {
              if (isTerminalSignalStatus(prevStatus) && !nextRemoteMap.has(docId)) {
                nextRemoteMap.set(docId, prevStatus);
              }
            }

            remoteRecords.sort((a, b) => b.createdAtMs - a.createdAtMs);
            remoteStatusMapRef.current = nextRemoteMap;
            setCloudSynced(true);
            setIsSyncing(false);

            // On first cloud load, backfill any local-only records BEFORE enabling live updates
            if (!initialSeedDone) {
              initialSeedDone = true;
              const remoteIds = new Set(remoteRecords.map((r) => r.id));
              const remoteActiveLocks = new Set(
                remoteRecords.filter((r) => !isTerminalSignalStatus(r.status)).map((r) => r.lockKey)
              );
              const localOnly = recordsRef.current.filter(
                (localRec) =>
                  !remoteIds.has(sanitizeFirestoreDocId(localRec.id)) &&
                  (isTerminalSignalStatus(localRec.status) || !remoteActiveLocks.has(localRec.lockKey))
              );

              // Merge remote + localOnly for immediate seamless continuity
              const merged = [...remoteRecords, ...localOnly]
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
                .slice(0, MAX_LOCAL_RECORDS);
              setRecords(merged);

              if (localOnly.length > 0) {
                backfillInProgressRef.current = true;
                void (async () => {
                  try {
                    for (const localRec of localOnly.slice(0, 20)) {
                      if (disposed) return;
                      const safeId = sanitizeFirestoreDocId(localRec.id);
                      const payload = buildFirestoreCreatePayload(localRec, user.uid, serverTimestamp);
                      if (!payload) continue;
                      const docPath = `users/${user.uid}/signalHistory/${safeId}`;
                      const ref = doc(db, 'users', user.uid, 'signalHistory', safeId);
                      inFlightDocIdsRef.current.add(safeId);
                      try {
                        await setDoc(ref, payload);
                        remoteStatusMapRef.current.set(safeId, payload.status as SignalHistoryStatus);
                      } catch (err) {
                        try {
                          const corePayload = buildFirestoreCoreCreatePayload(
                            payload,
                            serverTimestamp
                          );
                          await setDoc(ref, corePayload);
                          remoteStatusMapRef.current.set(
                            safeId,
                            corePayload.status as SignalHistoryStatus
                          );
                        } catch {
                          try {
                            handleFirestoreError(err, OperationType.CREATE, docPath);
                          } catch {
                            // structured error logged
                          }
                        }
                      } finally {
                        inFlightDocIdsRef.current.delete(safeId);
                      }
                    }
                  } finally {
                    backfillInProgressRef.current = false;
                    if (!disposed) {
                      cloudReadyRef.current = true;
                    }
                  }
                })();
              } else {
                cloudReadyRef.current = true;
              }
              return;
            }

            if (backfillInProgressRef.current) {
              return;
            }

            cloudReadyRef.current = true;
            setRecords(remoteRecords.slice(0, MAX_LOCAL_RECORDS));
          },
          (error) => {
            setIsSyncing(false);
            setCloudSynced(false);
            try {
              handleFirestoreError(error, OperationType.LIST, collectionPath);
            } catch {
              // structured JSON logged without crashing terminal
            }
          }
        );
      } catch (error) {
        setIsSyncing(false);
        try {
          handleFirestoreError(error, OperationType.LIST, collectionPath);
        } catch {
          // structured JSON logged
        }
      }
    };

    void attachFirestore();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [authReady, profileReady, user]);

  // Helper to push created, updated, and removed (non-filled expired) records to Firestore safely
  const syncDeltaToFirestore = useCallback(
    async (
      created: SignalHistoryRecord[],
      updated: SignalHistoryRecord[],
      removedIds: string[] = []
    ) => {
      if (!user || !profileReady || !cloudReadyRef.current) return;
      if (created.length === 0 && updated.length === 0 && removedIds.length === 0) return;

      const { db } = await getFirebaseServices();

      for (const rawId of removedIds) {
        const safeId = sanitizeFirestoreDocId(rawId);
        remoteStatusMapRef.current.delete(safeId);
        remoteStatusMapRef.current.delete(rawId);
        void deleteDoc(doc(db, 'users', user.uid, 'signalHistory', safeId)).catch(() => {
          // non-fatal cleanup for non-filled expired signal
        });
      }

      const nowMs = Date.now();

      for (const rec of created) {
        const safeId = sanitizeFirestoreDocId(rec.id);
        const lockKey = rec.lockKey || safeId;
        if (
          remoteStatusMapRef.current.has(safeId) ||
          inFlightDocIdsRef.current.has(safeId) ||
          inFlightLockKeysRef.current.has(lockKey)
        ) {
          continue;
        }
        const backoffUntil = failedWriteBackoffRef.current.get(`create:${lockKey}`) ?? 0;
        if (nowMs < backoffUntil) {
          continue;
        }
        const payload = buildFirestoreCreatePayload(rec, user.uid, serverTimestamp);
        if (!payload) continue;
        const docPath = `users/${user.uid}/signalHistory/${safeId}`;
        const ref = doc(db, 'users', user.uid, 'signalHistory', safeId);
        inFlightDocIdsRef.current.add(safeId);
        inFlightLockKeysRef.current.add(lockKey);
        try {
          await setDoc(ref, payload);
          remoteStatusMapRef.current.set(safeId, payload.status as SignalHistoryStatus);
          failedWriteBackoffRef.current.delete(`create:${lockKey}`);
        } catch (err) {
          let healed = false;
          try {
            const snap = await getDoc(ref);
            if (snap.exists()) {
              const serverStatus = snap.data()?.status as SignalHistoryStatus | undefined;
              if (serverStatus) {
                remoteStatusMapRef.current.set(safeId, serverStatus);
              }
              failedWriteBackoffRef.current.delete(`create:${lockKey}`);
              healed = true;
            } else {
              const corePayload = buildFirestoreCoreCreatePayload(payload, serverTimestamp);
              await setDoc(ref, corePayload);
              remoteStatusMapRef.current.set(safeId, corePayload.status as SignalHistoryStatus);
              failedWriteBackoffRef.current.delete(`create:${lockKey}`);
              healed = true;
            }
          } catch {
            // fall through to structured error handler below
          }
          if (!healed) {
            failedWriteBackoffRef.current.set(`create:${lockKey}`, Date.now() + 60_000);
            try {
              handleFirestoreError(err, OperationType.CREATE, docPath);
            } catch {
              // logged
            }
          }
        } finally {
          inFlightDocIdsRef.current.delete(safeId);
          inFlightLockKeysRef.current.delete(lockKey);
        }
      }

      for (const rec of updated) {
        const safeId = sanitizeFirestoreDocId(rec.id);
        if (inFlightDocIdsRef.current.has(safeId)) continue;
        if (blockedLegacyUpdateIdsRef.current.has(safeId)) continue;
        const remotePrevStatus = remoteStatusMapRef.current.get(safeId);
        if (!remotePrevStatus) continue; // wait until server confirms creation
        if (isTerminalSignalStatus(remotePrevStatus)) continue; // Firestore rules lock terminal states
        const backoffUntil = failedWriteBackoffRef.current.get(`update:${safeId}`) ?? 0;
        if (nowMs < backoffUntil) {
          continue;
        }

        const payload = buildFirestoreUpdatePayload(rec, serverTimestamp);
        if (!payload) continue;
        const docPath = `users/${user.uid}/signalHistory/${safeId}`;
        const ref = doc(db, 'users', user.uid, 'signalHistory', safeId);
        inFlightDocIdsRef.current.add(safeId);
        try {
          await updateDoc(ref, payload);
          remoteStatusMapRef.current.set(safeId, payload.status as SignalHistoryStatus);
          failedWriteBackoffRef.current.delete(`update:${safeId}`);
        } catch (err) {
          // Self-heal once: verify whether server doc is missing, already terminal, or a legacy doc needing core-only update
          let healed = false;
          try {
            const snap = await getDoc(ref);
            if (!snap.exists()) {
              const createPayload = buildFirestoreCreatePayload(rec, user.uid, serverTimestamp);
              if (createPayload) {
                await setDoc(ref, createPayload);
                remoteStatusMapRef.current.set(safeId, createPayload.status as SignalHistoryStatus);
                failedWriteBackoffRef.current.delete(`update:${safeId}`);
                healed = true;
              }
            } else {
              const serverData = snap.data();
              const serverStatus = serverData?.status as SignalHistoryStatus | undefined;
              if (serverStatus && isTerminalSignalStatus(serverStatus)) {
                remoteStatusMapRef.current.set(safeId, serverStatus);
                failedWriteBackoffRef.current.delete(`update:${safeId}`);
                setRecords((prev) => {
                  const next = prev.map((item) =>
                    item.id === rec.id || sanitizeFirestoreDocId(item.id) === safeId
                      ? {
                          ...item,
                          status: serverStatus,
                          outcome: deriveSignalIndexedOutcome(serverStatus, item.userOutcome),
                        }
                      : item
                  );
                  recordsRef.current = next;
                  return next;
                });
                healed = true;
              } else {
                // Retry once with core-only fields in case optional fields tripped an older rule or schema
                const corePayload: Record<string, unknown> = {
                  status: payload.status,
                  outcome: payload.outcome,
                  lastPrice: payload.lastPrice,
                  maxFavorablePrice: payload.maxFavorablePrice,
                  maxAdversePrice: payload.maxAdversePrice,
                  pnlPct: payload.pnlPct,
                  rMultiple: payload.rMultiple,
                  lastCheckedAtMs: payload.lastCheckedAtMs,
                  updatedAt: serverTimestamp(),
                };
                if (payload.filledAtMs) corePayload.filledAtMs = payload.filledAtMs;
                if (payload.tp1HitAtMs) corePayload.tp1HitAtMs = payload.tp1HitAtMs;
                if (payload.closedAtMs) corePayload.closedAtMs = payload.closedAtMs;
                if (payload.closedPrice) corePayload.closedPrice = payload.closedPrice;
                try {
                  await updateDoc(ref, corePayload);
                  remoteStatusMapRef.current.set(safeId, corePayload.status as SignalHistoryStatus);
                  failedWriteBackoffRef.current.delete(`update:${safeId}`);
                  healed = true;
                } catch {
                  // Existing legacy doc on server violates hardened schema validation (e.g. old fields or missing createdAt).
                  // Freeze cloud sync for this specific legacy doc ID locally so it never spams permission errors.
                  blockedLegacyUpdateIdsRef.current.add(safeId);
                  healed = true;
                }
              }
            }
          } catch {
            // fall through to structured error handler below
          }

          if (!healed) {
            failedWriteBackoffRef.current.set(`update:${safeId}`, Date.now() + 120_000);
            try {
              handleFirestoreError(err, OperationType.UPDATE, docPath);
            } catch {
              // logged
            }
          }
        } finally {
          inFlightDocIdsRef.current.delete(safeId);
        }
      }
    },
    [user, profileReady]
  );

  // Cross-device stock continuity probe loop:
  // Fetches live quotes + 1M OHLCV candles for ALL active saved stock signals in DB (even if no longer in Top 10 movers)
  // so reopening on any device immediately checks whether each stock position is RUNNING, TP1, TP2, or SL.
  const activeStockSymbolsKey = useMemo(() => {
    const syms = new Set<string>();
    for (const r of records) {
      if (isTerminalSignalStatus(r.status)) continue;
      if (r.assetClass !== 'stock_id' && r.assetClass !== 'stock_us') continue;
      const yahooSym =
        r.assetClass === 'stock_id' && !r.symbol.endsWith('.JK')
          ? `${r.symbol}.JK`
          : r.symbol;
      syms.add(yahooSym.toUpperCase());
    }
    return Array.from(syms).sort().join(',');
  }, [records]);

  useEffect(() => {
    if (!activeStockSymbolsKey) return;
    let cancelled = false;
    const symbols = activeStockSymbolsKey.split(',').filter(Boolean);

    const fetchStockProbes = async () => {
      try {
        const res = await fetch('/api/signals/stock-probes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols }),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          probes?: Record<string, LivePriceProbe>;
        };
        if (cancelled || !data?.probes) return;
        let updatedAny = false;
        for (const [sym, probe] of Object.entries(data.probes)) {
          if (probe && Number.isFinite(probe.price) && probe.price > 0) {
            persistedStockProbesRef.current.set(sym, probe);
            updatedAny = true;
          }
        }
        if (updatedAny && !cancelled) {
          lastReconcileAtRef.current = 0;
          setStockProbeTick((n) => n + 1);
        }
      } catch {
        // non-fatal; will retry on next interval
      }
    };

    void fetchStockProbes();
    const timer = window.setInterval(() => {
      void fetchStockProbes();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeStockSymbolsKey]);

  // Continuous reconciliation loop: evaluates active signals + locks new actionable setups
  useEffect(() => {
    if (!feedsLive && stockProbeTick === 0) return;
    let cancelled = false;

    const runReconcile = async () => {
      const now = Date.now();
      if (now - lastReconcileAtRef.current < RECONCILE_INTERVAL_MS) return;
      lastReconcileAtRef.current = now;

      const ownerId = user?.uid ?? 'local';
      const liveProbes = new Map<string, LivePriceProbe>();
      const incomingCandidates: SignalHistoryRecord[] = [];

      // Seed persisted stock probes (covers saved stock signals retrieved from DB on any device, even outside Top 10 movers)
      for (const [sym, probe] of persistedStockProbesRef.current.entries()) {
        liveProbes.set(sym, probe);
      }

      // 1. Collect IDX & US stock probes + actionable candidates
      const idxStocks = collectUniqueStocks(idxMoversBucket);
      const usStocks = collectUniqueStocks(usMoversBucket);

      for (const stock of [...idxStocks, ...usStocks]) {
        const existingCandleProbe =
          persistedStockProbesRef.current.get(stock.symbol) ??
          persistedStockProbesRef.current.get(`${stock.symbol}.JK`);
        liveProbes.set(stock.symbol, {
          price: stock.price,
          dayHigh: stock.dayHigh,
          dayLow: stock.dayLow,
          candles: existingCandleProbe?.candles,
        });
        const cand = buildStockSignalCandidate(stock, now, ownerId);
        if (cand) incomingCandidates.push(cand);
      }

      // 2. Collect BTCUSD & XAUUSD probes + ICT / S&D candidates
      for (const asset of assets) {
        if (!Number.isFinite(asset.price) || asset.price <= 0) continue;
        const candles =
          asset.chartCandles?.[syncedRadarConfig.timeframe] ??
          asset.chartCandles?.['15m'] ??
          asset.chartCandles?.['1D'];
        const parsedHigh = Number(String(asset.dayHigh || '').replace(/[^0-9.-]/g, ''));
        const parsedLow = Number(String(asset.dayLow || '').replace(/[^0-9.-]/g, ''));
        liveProbes.set(asset.id, {
          price: asset.price,
          dayHigh: Number.isFinite(parsedHigh) && parsedHigh > 0 ? parsedHigh : undefined,
          dayLow: Number.isFinite(parsedLow) && parsedLow > 0 ? parsedLow : undefined,
          candles,
        });
        liveProbes.set(asset.symbol, liveProbes.get(asset.id)!);
      }

      try {
        const engines = await loadRadarEngines();
        if (cancelled) return;

        const preferredTfMap = {
          BTCUSD: syncedRadarConfig.timeframe,
          XAUUSD: syncedRadarConfig.timeframe,
        };

        const ictSignals = engines.scanAllIctSignals(
          assets,
          preferredTfMap,
          syncedRadarConfig.enforceVolatilityFilter,
          economicEvents,
          syncedRadarConfig.enforceNewsBlackout
        );
        for (const sig of ictSignals) {
          const cand = buildIctSignalCandidate(sig, now, ownerId);
          if (cand) incomingCandidates.push(cand);
        }

        const sdcvSignals = engines.scanAllSdCandleVolumeSignals(
          assets,
          preferredTfMap,
          syncedRadarConfig.enforceVolatilityFilter,
          economicEvents,
          syncedRadarConfig.enforceNewsBlackout
        );
        for (const sig of sdcvSignals) {
          const cand = buildSdcvSignalCandidate(sig, now, ownerId);
          if (cand) incomingCandidates.push(cand);
        }
      } catch {
        // non-fatal if radar module still loading
      }

      if (cancelled) return;

      const result = reconcileSignalHistory(
        recordsRef.current,
        incomingCandidates,
        liveProbes,
        now,
        MAX_LOCAL_RECORDS
      );

      if (result.changed) {
        recordsRef.current = result.nextRecords;
        setRecords(result.nextRecords);
        void syncDeltaToFirestore(
          result.createdRecords,
          result.updatedRecords,
          result.removedRecordIds
        );
      }
    };

    const timer = window.setTimeout(() => {
      void runReconcile();
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    assets,
    idxMoversBucket,
    usMoversBucket,
    economicEvents,
    syncedRadarConfig,
    feedsLive,
    stockProbeTick,
    user?.uid,
    syncDeltaToFirestore,
  ]);

  const annotateSignal = useCallback(
    async (signalId: string, outcome: SignalUserOutcome | null, journalNote?: string) => {
      const nowMs = Date.now();
      const trimmedNote = typeof journalNote === 'string' ? journalNote.trim().slice(0, 300) : undefined;
      let targetAfterUpdate: SignalHistoryRecord | null = null;

      const existingTarget = recordsRef.current.find((r) => r.id === signalId);
      const nextIndexedOutcome: SignalIndexedOutcome | undefined = existingTarget
        ? deriveSignalIndexedOutcome(existingTarget.status, outcome ?? undefined)
        : undefined;

      setRecords((prev) =>
        prev.map((rec) => {
          if (rec.id !== signalId) return rec;
          const nextRec: SignalHistoryRecord = {
            ...rec,
            outcome: deriveSignalIndexedOutcome(rec.status, outcome ?? undefined),
            journaledAtMs: nowMs,
          };
          if (outcome === null) {
            delete nextRec.userOutcome;
          } else {
            nextRec.userOutcome = outcome;
          }
          if (trimmedNote !== undefined) {
            if (trimmedNote.length > 0) {
              nextRec.journalNote = trimmedNote;
            } else {
              delete nextRec.journalNote;
            }
          }
          targetAfterUpdate = nextRec;
          return nextRec;
        })
      );

      if (!user || !profileReady || !cloudReadyRef.current) return;
      const safeId = sanitizeFirestoreDocId(signalId);
      const docPath = `users/${user.uid}/signalHistory/${safeId}`;

      try {
        const { db } = await getFirebaseServices();

        const ref = doc(db, 'users', user.uid, 'signalHistory', safeId);
        const updatePayload: Record<string, unknown> = {
          userOutcome: outcome === null ? deleteField() : outcome,
          ...(nextIndexedOutcome ? { outcome: nextIndexedOutcome } : {}),
          journaledAtMs: nowMs,
          updatedAt: serverTimestamp(),
        };
        if (trimmedNote !== undefined) {
          updatePayload.journalNote = trimmedNote.length > 0 ? trimmedNote : deleteField();
        }

        inFlightDocIdsRef.current.add(safeId);
        try {
          if (remoteStatusMapRef.current.has(safeId)) {
            await updateDoc(ref, updatePayload);
          } else {
            const snap = await getDoc(ref);
            if (snap.exists()) {
              await updateDoc(ref, updatePayload);
              const serverStatus = snap.data()?.status as SignalHistoryStatus | undefined;
              if (serverStatus) remoteStatusMapRef.current.set(safeId, serverStatus);
            } else if (targetAfterUpdate) {
              const createPayload = buildFirestoreCreatePayload(
                targetAfterUpdate,
                user.uid,
                serverTimestamp
              );
              if (createPayload) {
                await setDoc(ref, createPayload);
                remoteStatusMapRef.current.set(safeId, createPayload.status as SignalHistoryStatus);
              }
            }
          }
        } finally {
          inFlightDocIdsRef.current.delete(safeId);
        }
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.UPDATE, docPath);
        } catch {
          // structured error logged
        }
      }
    },
    [user, profileReady]
  );

  const deleteSignal = useCallback(
    async (signalId: string) => {
      const safeId = sanitizeFirestoreDocId(signalId);
      setRecords((prev) => prev.filter((r) => r.id !== signalId && sanitizeFirestoreDocId(r.id) !== safeId));
      remoteStatusMapRef.current.delete(signalId);
      remoteStatusMapRef.current.delete(safeId);

      if (!user || !profileReady) return;
      const docPath = `users/${user.uid}/signalHistory/${safeId}`;
      try {
        const { db } = await getFirebaseServices();
        await deleteDoc(doc(db, 'users', user.uid, 'signalHistory', safeId));
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.DELETE, docPath);
        } catch {
          // logged
        }
      }
    },
    [user, profileReady]
  );

  const clearClosedSignals = useCallback(async () => {
    const toDelete = recordsRef.current.filter((r) => isTerminalSignalStatus(r.status));
    if (toDelete.length === 0) return;

    setRecords((prev) => prev.filter((r) => !isTerminalSignalStatus(r.status)));
    for (const r of toDelete) {
      remoteStatusMapRef.current.delete(r.id);
      remoteStatusMapRef.current.delete(sanitizeFirestoreDocId(r.id));
    }

    if (!user || !profileReady) return;
    try {
      const { db } = await getFirebaseServices();
      for (const r of toDelete) {
        const safeId = sanitizeFirestoreDocId(r.id);
        const docPath = `users/${user.uid}/signalHistory/${safeId}`;
        await deleteDoc(doc(db, 'users', user.uid, 'signalHistory', safeId)).catch((err) => {
          try {
            handleFirestoreError(err, OperationType.DELETE, docPath);
          } catch {
            // logged
          }
        });
      }
    } catch {
      // handled per-doc
    }
  }, [user, profileReady]);

  const activeByLockKey = useMemo(() => {
    const map = new Map<string, SignalHistoryRecord>();
    for (const r of records) {
      if (!isTerminalSignalStatus(r.status) && !map.has(r.lockKey)) {
        map.set(r.lockKey, r);
      }
    }
    return map;
  }, [records]);

  const activeBySymbol = useMemo(() => {
    const map = new Map<string, SignalHistoryRecord>();
    for (const r of records) {
      if (!isTerminalSignalStatus(r.status)) {
        if (!map.has(r.symbol)) map.set(r.symbol, r);
        if (!map.has(r.assetId)) map.set(r.assetId, r);
      }
    }
    return map;
  }, [records]);

  const applyVerificationPatch = useCallback(
    (
      signalId: string,
      patch: Partial<SignalHistoryRecord>,
      syncedStatus?: SignalHistoryStatus
    ) => {
      const safeId = sanitizeFirestoreDocId(signalId);
      if (syncedStatus) {
        remoteStatusMapRef.current.set(safeId, syncedStatus);
      }
      setRecords((prev) => {
        let mutated = false;
        const next = prev.map((rec) => {
          if (rec.id !== signalId && sanitizeFirestoreDocId(rec.id) !== safeId) {
            return rec;
          }
          mutated = true;
          return { ...rec, ...patch };
        });
        if (mutated) {
          recordsRef.current = next;
          return next;
        }
        return prev;
      });
    },
    []
  );

  const isRecordConfirmedOnServer = useCallback((signalId: string) => {
    const safeId = sanitizeFirestoreDocId(signalId);
    const serverStatus = remoteStatusMapRef.current.get(safeId);
    if (!serverStatus) return false;
    if (isTerminalSignalStatus(serverStatus)) return false;
    if (inFlightDocIdsRef.current.has(safeId)) return false;
    return true;
  }, []);

  const tryAcquireSignalWriteLock = useCallback((signalId: string) => {
    const safeId = sanitizeFirestoreDocId(signalId);
    const serverStatus = remoteStatusMapRef.current.get(safeId);
    if (!serverStatus || isTerminalSignalStatus(serverStatus)) return false;
    if (inFlightDocIdsRef.current.has(safeId)) return false;
    inFlightDocIdsRef.current.add(safeId);
    return true;
  }, []);

  const releaseSignalWriteLock = useCallback((signalId: string) => {
    const safeId = sanitizeFirestoreDocId(signalId);
    inFlightDocIdsRef.current.delete(safeId);
  }, []);

  const stats = useMemo(() => computeSignalHistoryStats(records), [records]);

  return {
    records,
    activeByLockKey,
    activeBySymbol,
    stats,
    cloudSynced,
    isSyncing,
    cloudEngineStatus,
    triggerCloudScan,
    refreshSignalDatabase,
    annotateSignal,
    applyVerificationPatch,
    isRecordConfirmedOnServer,
    tryAcquireSignalWriteLock,
    releaseSignalWriteLock,
    deleteSignal,
    clearClosedSignals,
  };
}
