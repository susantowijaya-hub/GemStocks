import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getFirebaseServices } from '../lib/firebase';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';
import {
  EconomicEvent,
  MarketAsset,
  SignalBarrierOutcome,
  SignalExecutionPostureTag,
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
  reconcileSignalHistory,
} from '../utils/signalHistoryEngine';

const LOCAL_STORAGE_KEY = 'stocks-signal-history-v1';
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
          item.stopLoss > 0
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
  'PENDING_LIMIT',
  'RUNNING',
  'TP1_HIT',
  'TP2_HIT',
  'SL_HIT',
  'BE_CLOSED',
  'EXPIRED',
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
    ? rec.status
    : 'RUNNING';
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
    ? rec.status
    : 'RUNNING';
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

  return payload;
}

export interface UseSignalHistoryResult {
  records: SignalHistoryRecord[];
  activeByLockKey: Map<string, SignalHistoryRecord>;
  activeBySymbol: Map<string, SignalHistoryRecord>;
  stats: SignalHistoryStats;
  cloudSynced: boolean;
  isSyncing: boolean;
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

  // Persist local mirror whenever records change
  useEffect(() => {
    saveLocalSignalHistory(records);
  }, [records]);

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
        const [
          { db },
          { collection, doc, limit, onSnapshot, query, serverTimestamp, setDoc, where },
        ] = await Promise.all([getFirebaseServices(), import('firebase/firestore')]);
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
                status: d.status as SignalHistoryStatus,
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
              };
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

  // Helper to push created & updated records to Firestore safely
  const syncDeltaToFirestore = useCallback(
    async (created: SignalHistoryRecord[], updated: SignalHistoryRecord[]) => {
      if (!user || !profileReady || !cloudReadyRef.current) return;
      if (created.length === 0 && updated.length === 0) return;

      const [{ db }, { doc, getDoc, serverTimestamp, setDoc, updateDoc }] = await Promise.all([
        getFirebaseServices(),
        import('firebase/firestore'),
      ]);

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

  // Continuous reconciliation loop: evaluates active signals + locks new actionable setups
  useEffect(() => {
    if (!feedsLive) return;
    let cancelled = false;

    const runReconcile = async () => {
      const now = Date.now();
      if (now - lastReconcileAtRef.current < RECONCILE_INTERVAL_MS) return;
      lastReconcileAtRef.current = now;

      const ownerId = user?.uid ?? 'local';
      const liveProbes = new Map<string, LivePriceProbe>();
      const incomingCandidates: SignalHistoryRecord[] = [];

      // 1. Collect IDX & US stock probes + actionable candidates
      const idxStocks = collectUniqueStocks(idxMoversBucket);
      const usStocks = collectUniqueStocks(usMoversBucket);

      for (const stock of [...idxStocks, ...usStocks]) {
        liveProbes.set(stock.symbol, {
          price: stock.price,
          dayHigh: stock.dayHigh,
          dayLow: stock.dayLow,
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
        void syncDeltaToFirestore(result.createdRecords, result.updatedRecords);
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
        const [{ db }, { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc }] =
          await Promise.all([getFirebaseServices(), import('firebase/firestore')]);

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
      setRecords((prev) => prev.filter((r) => r.id !== signalId));
      remoteStatusMapRef.current.delete(signalId);

      if (!user || !profileReady) return;
      const docPath = `users/${user.uid}/signalHistory/${signalId}`;
      try {
        const [{ db }, { deleteDoc, doc }] = await Promise.all([
          getFirebaseServices(),
          import('firebase/firestore'),
        ]);
        await deleteDoc(doc(db, 'users', user.uid, 'signalHistory', signalId));
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
    }

    if (!user || !profileReady) return;
    try {
      const [{ db }, { deleteDoc, doc }] = await Promise.all([
        getFirebaseServices(),
        import('firebase/firestore'),
      ]);
      for (const r of toDelete) {
        const docPath = `users/${user.uid}/signalHistory/${r.id}`;
        await deleteDoc(doc(db, 'users', user.uid, 'signalHistory', r.id)).catch((err) => {
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
    annotateSignal,
    applyVerificationPatch,
    isRecordConfirmedOnServer,
    tryAcquireSignalWriteLock,
    releaseSignalWriteLock,
    deleteSignal,
    clearClosedSignals,
  };
}
