import {
  CandlePoint,
  IctSignalAnalysis,
  PriceAlertItem,
  SdCandleVolumeSignal,
  SignalAssetClass,
  SignalBarrierOutcome,
  SignalHistoryRecord,
  SignalHistoryStatus,
  SignalIndexedOutcome,
  SignalSourceEngine,
  SignalStrategyKey,
  SignalUserOutcome,
  SignalVerificationStatus,
  StockMover,
} from '../types/market';

export const TERMINAL_SIGNAL_STATUSES: ReadonlySet<SignalHistoryStatus> = new Set([
  'TP2_HIT',
  'SL_HIT',
  'BE_CLOSED',
  'EXPIRED',
]);

export function isTerminalSignalStatus(status: SignalHistoryStatus): boolean {
  return TERMINAL_SIGNAL_STATUSES.has(status);
}

export function deriveSignalStrategyKey(sourceEngine: SignalSourceEngine): SignalStrategyKey {
  switch (sourceEngine) {
    case 'ict_radar':
      return 'ict_2022';
    case 'sdcv_radar':
      return 'sdcv_canonical';
    case 'us_scanner':
      return 'us_swing';
    case 'idx_scanner':
    default:
      return 'idx_bandar';
  }
}

export function deriveSignalIndexedOutcome(
  status: SignalHistoryStatus,
  userOutcome?: SignalUserOutcome
): SignalIndexedOutcome {
  if (userOutcome === 'WIN') return 'WIN';
  if (userOutcome === 'LOSS') return 'LOSS';
  if (userOutcome === 'BE') return 'BE';
  switch (status) {
    case 'TP1_HIT':
    case 'TP2_HIT':
      return 'WIN';
    case 'SL_HIT':
      return 'LOSS';
    case 'BE_CLOSED':
      return 'BE';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'RUNNING':
      return 'RUNNING';
    case 'PENDING_LIMIT':
    default:
      return 'PENDING';
  }
}

export function deriveSignalVerificationStatus(
  record: Pick<
    SignalHistoryRecord,
    'verificationStatus' | 'zoneFillVerified' | 'filledOnFirstSight' | 'filledAtMs' | 'status'
  >
): SignalVerificationStatus {
  if (record.verificationStatus === 'Verified' || record.verificationStatus === 'Expired') {
    return record.verificationStatus;
  }
  if (
    record.zoneFillVerified ||
    record.filledOnFirstSight ||
    Boolean(record.filledAtMs) ||
    (record.status !== 'PENDING_LIMIT' && record.status !== 'EXPIRED')
  ) {
    return 'Verified';
  }
  if (record.status === 'EXPIRED') {
    return 'Expired';
  }
  return 'Pending';
}

const REENTRY_COOLDOWN_MS_STOCK = 4 * 60 * 60 * 1000; // 4h cooldown after a stock signal closes before logging a fresh one
const REENTRY_COOLDOWN_MS_INTRADAY = 15 * 60 * 1000; // 15m cooldown after an intraday BTC/XAU signal closes
const TTL_MS_STOCK_PENDING = 7 * 24 * 60 * 60 * 1000; // 7 days for unfilled stock limit setups
const TTL_MS_STOCK_RUNNING = 21 * 24 * 60 * 60 * 1000; // 21 days max swing window for running stocks
const TTL_MS_INTRADAY_PENDING = 18 * 60 * 60 * 1000; // 18h for unfilled intraday limits
const TTL_MS_INTRADAY_RUNNING = 72 * 60 * 60 * 1000; // 72h for running intraday BTC/XAU setups

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function roundPrice(value: number, decimals: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const factor = Math.pow(10, clamp(Math.round(decimals), 0, 6));
  return Math.round(value * factor) / factor;
}

function sanitizeIdPart(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 28) || 'ASSET';
}

function sanitizeSymbol(raw: string): string {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._\-/^=]/g, '')
    .slice(0, 24);
  return cleaned || 'ASSET';
}

function sanitizeAssetId(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9._\-/^=]/g, '')
    .slice(0, 32);
  return cleaned || 'ASSET';
}

function sanitizeLockKey(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_.:/\-]/g, '_')
    .slice(0, 80);
}

function computeRiskDistance(entryPrice: number, stopLoss: number, direction: 'BUY' | 'SELL'): number {
  const dist = direction === 'BUY' ? entryPrice - stopLoss : stopLoss - entryPrice;
  if (Number.isFinite(dist) && dist > 0) return dist;
  return Math.max(entryPrice * 0.005, 1e-6);
}

function computePnlAndR(
  direction: 'BUY' | 'SELL',
  entryPrice: number,
  stopLoss: number,
  evalPrice: number,
  status: SignalHistoryStatus
): { pnlPct: number; rMultiple: number } {
  if (status === 'PENDING_LIMIT' || status === 'EXPIRED') {
    return { pnlPct: 0, rMultiple: 0 };
  }
  const diff = direction === 'BUY' ? evalPrice - entryPrice : entryPrice - evalPrice;
  const pnlPct = clamp(Number(((diff / entryPrice) * 100).toFixed(2)), -100, 5000);
  const riskDist = computeRiskDistance(entryPrice, stopLoss, direction);
  const rMultiple = clamp(Number((diff / riskDist).toFixed(2)), -20, 200);
  return { pnlPct, rMultiple };
}

function isValidDirectionalLevels(
  direction: 'BUY' | 'SELL',
  entryPrice: number,
  stopLoss: number,
  tp1: number,
  tp2: number
): boolean {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopLoss) ||
    !Number.isFinite(tp1) ||
    !Number.isFinite(tp2)
  ) {
    return false;
  }
  if (entryPrice <= 0 || stopLoss <= 0 || tp1 <= 0 || tp2 <= 0) return false;
  if (direction === 'BUY') {
    return stopLoss < entryPrice && tp1 > entryPrice && tp2 >= tp1;
  }
  return stopLoss > entryPrice && tp1 < entryPrice && tp2 <= tp1;
}

export interface LivePriceProbe {
  price: number;
  dayHigh?: number;
  dayLow?: number;
  candles?: CandlePoint[];
}

export function buildStockSignalCandidate(
  stock: StockMover,
  now: number,
  ownerId = 'local'
): SignalHistoryRecord | null {
  const plan = stock.tradePlan;
  if (!plan) return null;
  if (plan.action !== 'BUY' && plan.action !== 'SELL') return null;

  const isId = stock.market === 'ID';
  const minConviction = isId ? 58 : 60;
  const isStrongVerdict =
    plan.verdictLabel === 'BUY NOW (ACCUMULATION)' ||
    plan.verdictLabel === 'BUY AT DEMAND' ||
    plan.verdictLabel === 'BREAKOUT BUY';

  if (plan.conviction < minConviction && !isStrongVerdict) return null;
  if (!Number.isFinite(stock.price) || stock.price <= 0) return null;

  const decimals = stock.currency === 'IDR' ? 0 : 2;
  const direction = plan.action;
  const entryPrice = roundPrice(plan.entryPrice, decimals);
  const stopLoss = roundPrice(plan.stopLoss, decimals);
  const tp1 = roundPrice(plan.takeProfit1, decimals);
  const tp2 = roundPrice(plan.takeProfit2, decimals);

  if (!isValidDirectionalLevels(direction, entryPrice, stopLoss, tp1, tp2)) {
    return null;
  }

  const bandPct = isId ? 0.008 : 0.006;
  const rawLow =
    direction === 'BUY' && plan.demandLowNum && plan.demandHighNum && Math.abs(plan.demandHighNum - entryPrice) / entryPrice < 0.025
      ? Math.min(plan.demandLowNum, entryPrice)
      : entryPrice * (1 - bandPct);
  const rawHigh =
    direction === 'BUY' && plan.demandLowNum && plan.demandHighNum && Math.abs(plan.demandHighNum - entryPrice) / entryPrice < 0.025
      ? Math.max(plan.demandHighNum, entryPrice)
      : entryPrice * (1 + bandPct);

  const entryLow = Math.max(roundPrice(Math.min(rawLow, rawHigh), decimals), decimals === 0 ? 1 : 0.01);
  const entryHigh = Math.max(roundPrice(Math.max(rawLow, rawHigh), decimals), entryLow);
  const spot = roundPrice(stock.price, decimals);

  // Determine whether price is ALREADY at/inside entry zone when signal first appears
  const inZone = spot >= entryLow && spot <= entryHigh;
  const nearEntry = Math.abs(spot - entryPrice) / entryPrice <= 0.012;
  const immediateMarketAction =
    plan.verdictLabel === 'BUY NOW (ACCUMULATION)' || plan.verdictLabel === 'BREAKOUT BUY';
  const crossedThrough =
    direction === 'BUY'
      ? spot <= entryHigh && spot > stopLoss
      : spot >= entryLow && spot < stopLoss;

  const filledOnFirstSight = Boolean(immediateMarketAction || inZone || nearEntry || crossedThrough);
  const status: SignalHistoryStatus = filledOnFirstSight ? 'RUNNING' : 'PENDING_LIMIT';

  const sourceEngine: SignalSourceEngine = isId ? 'idx_scanner' : 'us_scanner';
  const assetClass: SignalAssetClass = isId ? 'stock_id' : 'stock_us';
  const cleanSym = sanitizeSymbol(stock.symbol);
  const cleanAssetId = sanitizeAssetId(stock.symbol);
  const lockKey = sanitizeLockKey(`${sourceEngine}:${cleanSym}`);
  const id = `sig_${isId ? 'idx' : 'us'}_${sanitizeIdPart(cleanSym)}_${now}`;

  const effectiveEntry = filledOnFirstSight && immediateMarketAction ? spot : entryPrice;
  const safeEntry = isValidDirectionalLevels(direction, effectiveEntry, stopLoss, tp1, tp2)
    ? effectiveEntry
    : entryPrice;

  const { pnlPct, rMultiple } = computePnlAndR(direction, safeEntry, stopLoss, spot, status);

  const riskDist = computeRiskDistance(safeEntry, stopLoss, direction);
  const netRrVal = clamp(Number((Math.abs(tp2 - safeEntry) / Math.max(1e-6, riskDist)).toFixed(2)), 0, 100);

  return {
    id,
    ownerId,
    lockKey,
    assetClass,
    sourceEngine,
    symbol: cleanSym,
    assetId: cleanAssetId,
    name: (stock.name || cleanSym).trim().slice(0, 120),
    currency: stock.currency,
    decimals,
    timeframe: '1D',
    direction,
    strategyTag: (plan.verdictLabel || plan.strategyTag || 'Institutional Setup').trim().slice(0, 140),
    strategy: deriveSignalStrategyKey(sourceEngine),
    outcome: deriveSignalIndexedOutcome(status),
    timestamp: now,
    confidence: clamp(Math.round(plan.conviction), 0, 100),
    firstShownPrice: spot,
    entryPrice: safeEntry,
    entryLow: Math.min(entryLow, safeEntry),
    entryHigh: Math.max(entryHigh, safeEntry),
    stopLoss,
    tp1,
    tp2,
    riskReward: (plan.riskReward || '1 : 2.0').trim().slice(0, 24),
    status,
    filledOnFirstSight,
    executionPosture: filledOnFirstSight ? 'enter_now' : 'armed_limit',
    zoneFillVerified: filledOnFirstSight,
    verificationStatus: filledOnFirstSight ? 'Verified' : 'Pending',
    ...(filledOnFirstSight ? { verifiedAtMs: now } : {}),
    createdAtMs: now,
    ...(filledOnFirstSight ? { filledAtMs: now } : {}),
    lastPrice: spot,
    maxFavorablePrice: spot,
    maxAdversePrice: spot,
    pnlPct,
    rMultiple,
    lastCheckedAtMs: now,
    mfeR: Math.max(0, rMultiple),
    maeR: Math.max(0, -rMultiple),
    barrierOutcome: 'OPEN',
    timeBarrierAtMs: computeTimeBarrierAtMs('1D', assetClass, now),
    htfAligned: plan.stage === 'Stage 2 Advancing' || plan.trendFilterLabel === 'Uptrend (EMA20 > EMA50)',
    netRr: netRrVal,
    stage2Aligned: plan.stage === 'Stage 2 Advancing',
    ...(typeof plan.rsRank === 'number' && Number.isFinite(plan.rsRank)
      ? { rsRank: clamp(Math.round(plan.rsRank), 0, 100) }
      : {}),
    vcpDetected: Boolean(plan.vcpDetected),
    sectorLeader: Boolean(plan.isTopSector),
  };
}

function computeTimeBarrierAtMs(
  timeframe: string,
  assetClass: SignalAssetClass,
  createdAtMs: number
): number {
  if (assetClass === 'stock_id' || assetClass === 'stock_us') {
    return createdAtMs + 21 * 24 * 60 * 60 * 1000;
  }
  const tfMinsMap: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1D': 1440,
  };
  const barMins = tfMinsMap[timeframe] ?? 15;
  // 16-bar vertical Triple-Barrier window, bounded between 2h and 12h for intraday precision
  const windowMs = clamp(barMins * 16 * 60 * 1000, 2 * 60 * 60 * 1000, 12 * 60 * 60 * 1000);
  return createdAtMs + windowMs;
}

function computeMfeMaeR(
  direction: 'BUY' | 'SELL',
  entryPrice: number,
  stopLoss: number,
  maxFav: number,
  maxAdv: number
): { mfeR: number; maeR: number } {
  const risk = Math.max(Math.abs(entryPrice - stopLoss), entryPrice * 0.001, 1e-6);
  const favDiff = direction === 'BUY' ? maxFav - entryPrice : entryPrice - maxFav;
  const advDiff = direction === 'BUY' ? entryPrice - maxAdv : maxAdv - entryPrice;
  const mfeR = clamp(Number((Math.max(0, favDiff) / risk).toFixed(2)), 0, 200);
  const maeR = clamp(Number((Math.max(0, advDiff) / risk).toFixed(2)), 0, 200);
  return { mfeR, maeR };
}

export function buildIctSignalCandidate(
  sig: IctSignalAnalysis,
  now: number,
  ownerId = 'local'
): SignalHistoryRecord | null {
  if (sig.direction !== 'BUY' && sig.direction !== 'SELL') return null;
  if (sig.survivalBlocked || sig.newsBlackoutActive) return null;
  if (
    sig.executionPosture !== 'enter_now' &&
    sig.executionPosture !== 'armed_limit' &&
    sig.executionPosture !== 'limit_pullback_only'
  ) {
    return null;
  }

  const decimals = clamp(sig.decimals ?? 2, 0, 6);
  const spot = roundPrice(sig.currentPrice, decimals);
  const entryLow = roundPrice(sig.entryLowNum ?? 0, decimals);
  const entryHigh = roundPrice(sig.entryHighNum ?? 0, decimals);
  const stopLoss = roundPrice(sig.stopLossNum ?? 0, decimals);
  const tp1 = roundPrice(sig.tp1Num ?? 0, decimals);
  const tp2 = roundPrice(sig.tp2Num ?? tp1, decimals);
  const midEntry = roundPrice(
    sig.limitEntryPriceNum ?? (entryLow > 0 && entryHigh > 0 ? (entryLow + entryHigh) / 2 : spot),
    decimals
  );

  if (!spot || !entryLow || !entryHigh || !isValidDirectionalLevels(sig.direction, midEntry, stopLoss, tp1, tp2)) {
    return null;
  }

  const zoneLo = Math.min(entryLow, entryHigh);
  const zoneHi = Math.max(entryLow, entryHigh);
  const tol = Math.max(spot * 0.0003, 1e-6);
  const spotInsideZone = spot >= zoneLo - tol && spot <= zoneHi + tol;
  const filledOnFirstSight = sig.executionPosture === 'enter_now' || spotInsideZone;
  const status: SignalHistoryStatus = filledOnFirstSight ? 'RUNNING' : 'PENDING_LIMIT';
  const assetClass: SignalAssetClass = sig.assetId === 'BTCUSD' ? 'crypto' : 'commodity';
  const cleanSym = sanitizeSymbol(sig.symbol);
  const cleanAssetId = sanitizeAssetId(sig.assetId);
  const lockKey = sanitizeLockKey(`ict_radar:${cleanAssetId}:${sig.timeframe}`);
  const id = `sig_ict_${sanitizeIdPart(cleanAssetId)}_${sanitizeIdPart(sig.timeframe)}_${now}`;

  const lockedEntry = filledOnFirstSight ? spot : midEntry;
  const safeEntry = isValidDirectionalLevels(sig.direction, lockedEntry, stopLoss, tp1, tp2)
    ? lockedEntry
    : midEntry;

  const { pnlPct, rMultiple } = computePnlAndR(sig.direction, safeEntry, stopLoss, spot, status);
  const inKillzone = Boolean(
    sig.clearanceGates?.find((g) => g.id === 'kz')?.passed ??
      (sig.killzone && !/asia|lunch|inter-session/i.test(sig.killzone))
  );
  const smtConfirmed =
    (sig.direction === 'BUY' && sig.smtStatus === 'Bullish SMT') ||
    (sig.direction === 'SELL' && sig.smtStatus === 'Bearish SMT');

  return {
    id,
    ownerId,
    lockKey,
    assetClass,
    sourceEngine: 'ict_radar',
    symbol: cleanSym,
    assetId: cleanAssetId,
    name: (sig.name || cleanSym).trim().slice(0, 120),
    currency: 'USD',
    decimals,
    timeframe: sig.timeframe.slice(0, 8),
    direction: sig.direction,
    strategyTag: (sig.setupName || 'ICT Liquidity & OTE').trim().slice(0, 140),
    strategy: deriveSignalStrategyKey('ict_radar'),
    outcome: deriveSignalIndexedOutcome(status),
    timestamp: now,
    confidence: clamp(Math.round(sig.confidence), 0, 100),
    firstShownPrice: spot,
    entryPrice: safeEntry,
    entryLow: Math.min(entryLow, entryHigh),
    entryHigh: Math.max(entryLow, entryHigh),
    stopLoss,
    tp1,
    tp2,
    riskReward: (sig.riskReward || '1 : 2.0').trim().slice(0, 24),
    status,
    filledOnFirstSight,
    executionPosture: sig.executionPosture,
    zoneFillVerified: filledOnFirstSight,
    verificationStatus: filledOnFirstSight ? 'Verified' : 'Pending',
    ...(filledOnFirstSight ? { verifiedAtMs: now } : {}),
    createdAtMs: now,
    ...(filledOnFirstSight ? { filledAtMs: now } : {}),
    lastPrice: spot,
    maxFavorablePrice: spot,
    maxAdversePrice: spot,
    pnlPct,
    rMultiple,
    lastCheckedAtMs: now,
    mfeR: 0,
    maeR: 0,
    barrierOutcome: 'OPEN',
    timeBarrierAtMs: computeTimeBarrierAtMs(sig.timeframe, assetClass, now),
    inKillzone,
    ...(typeof sig.po3Aligned === 'boolean' ? { po3Aligned: sig.po3Aligned } : {}),
    smtConfirmed,
    ...(sig.volatilityRegime ? { volatilityRegime: sig.volatilityRegime } : {}),
    ...(typeof sig.htfAligned === 'boolean' ? { htfAligned: sig.htfAligned } : {}),
    ...(typeof sig.netRr === 'number' && Number.isFinite(sig.netRr) && sig.netRr >= 0
      ? { netRr: clamp(Number(sig.netRr.toFixed(2)), 0, 100) }
      : {}),
  };
}

export function buildSdcvSignalCandidate(
  sig: SdCandleVolumeSignal,
  now: number,
  ownerId = 'local'
): SignalHistoryRecord | null {
  if (sig.direction !== 'BUY' && sig.direction !== 'SELL') return null;
  if (sig.survivalBlocked || sig.newsBlackoutActive) return null;
  if (
    sig.executionPosture !== 'enter_now' &&
    sig.executionPosture !== 'armed_limit' &&
    sig.executionPosture !== 'limit_pullback_only'
  ) {
    return null;
  }

  const decimals = clamp(sig.decimals ?? 2, 0, 6);
  const spot = roundPrice(sig.currentPrice, decimals);
  const entryLow = roundPrice(sig.entryLowNum ?? 0, decimals);
  const entryHigh = roundPrice(sig.entryHighNum ?? 0, decimals);
  const stopLoss = roundPrice(sig.stopLossNum ?? 0, decimals);
  const tp1 = roundPrice(sig.tp1Num ?? 0, decimals);
  const tp2 = roundPrice(sig.tp2Num ?? tp1, decimals);
  const midEntry = roundPrice(
    sig.limitEntryPriceNum ?? (entryLow > 0 && entryHigh > 0 ? (entryLow + entryHigh) / 2 : spot),
    decimals
  );

  if (!spot || !entryLow || !entryHigh || !isValidDirectionalLevels(sig.direction, midEntry, stopLoss, tp1, tp2)) {
    return null;
  }

  const zoneLo = Math.min(entryLow, entryHigh);
  const zoneHi = Math.max(entryLow, entryHigh);
  const tol = Math.max(spot * 0.0003, 1e-6);
  const spotInsideZone = spot >= zoneLo - tol && spot <= zoneHi + tol;
  const filledOnFirstSight = sig.executionPosture === 'enter_now' || spotInsideZone;
  const status: SignalHistoryStatus = filledOnFirstSight ? 'RUNNING' : 'PENDING_LIMIT';
  const assetClass: SignalAssetClass = sig.assetId === 'BTCUSD' ? 'crypto' : 'commodity';
  const cleanSym = sanitizeSymbol(sig.symbol);
  const cleanAssetId = sanitizeAssetId(sig.assetId);
  const lockKey = sanitizeLockKey(`sdcv_radar:${cleanAssetId}:${sig.timeframe}`);
  const id = `sig_sdcv_${sanitizeIdPart(cleanAssetId)}_${sanitizeIdPart(sig.timeframe)}_${now}`;

  const lockedEntry = filledOnFirstSight ? spot : midEntry;
  const safeEntry = isValidDirectionalLevels(sig.direction, lockedEntry, stopLoss, tp1, tp2)
    ? lockedEntry
    : midEntry;

  const { pnlPct, rMultiple } = computePnlAndR(sig.direction, safeEntry, stopLoss, spot, status);

  return {
    id,
    ownerId,
    lockKey,
    assetClass,
    sourceEngine: 'sdcv_radar',
    symbol: cleanSym,
    assetId: cleanAssetId,
    name: (sig.name || cleanSym).trim().slice(0, 120),
    currency: 'USD',
    decimals,
    timeframe: sig.timeframe.slice(0, 8),
    direction: sig.direction,
    strategyTag: `S&D ${sig.sdPattern || sig.zoneBias} · ${sig.candlePattern}`.trim().slice(0, 140),
    strategy: deriveSignalStrategyKey('sdcv_radar'),
    outcome: deriveSignalIndexedOutcome(status),
    timestamp: now,
    confidence: clamp(Math.round(sig.confidence), 0, 100),
    firstShownPrice: spot,
    entryPrice: safeEntry,
    entryLow: Math.min(entryLow, entryHigh),
    entryHigh: Math.max(entryLow, entryHigh),
    stopLoss,
    tp1,
    tp2,
    riskReward: (sig.riskReward || '1 : 2.0').trim().slice(0, 24),
    status,
    filledOnFirstSight,
    executionPosture: sig.executionPosture,
    zoneFillVerified: filledOnFirstSight,
    verificationStatus: filledOnFirstSight ? 'Verified' : 'Pending',
    ...(filledOnFirstSight ? { verifiedAtMs: now } : {}),
    createdAtMs: now,
    ...(filledOnFirstSight ? { filledAtMs: now } : {}),
    lastPrice: spot,
    maxFavorablePrice: spot,
    maxAdversePrice: spot,
    pnlPct,
    rMultiple,
    lastCheckedAtMs: now,
    mfeR: 0,
    maeR: 0,
    barrierOutcome: 'OPEN',
    timeBarrierAtMs: computeTimeBarrierAtMs(sig.timeframe, assetClass, now),
    htfAligned:
      (sig.direction === 'BUY' && sig.zoneBias === 'Demand' && (sig.htfCurvePct == null || sig.htfCurvePct <= 55)) ||
      (sig.direction === 'SELL' && sig.zoneBias === 'Supply' && (sig.htfCurvePct == null || sig.htfCurvePct >= 45)),
  };
}

/**
 * Pure lifecycle evaluator: transitions an active signal through
 * PENDING_LIMIT -> RUNNING -> TP1_HIT -> (TP2_HIT | SL_HIT | BE_CLOSED | EXPIRED)
 * without EVER mutating immutable entry/SL/TP snapshot fields or reopening terminal signals.
 */
export function evaluateSignalRecord(
  record: SignalHistoryRecord,
  probe: LivePriceProbe | undefined,
  now: number
): SignalHistoryRecord {
  if (isTerminalSignalStatus(record.status)) {
    return record;
  }

  const isStock = record.assetClass === 'stock_id' || record.assetClass === 'stock_us';
  const pendingTtl = isStock ? TTL_MS_STOCK_PENDING : TTL_MS_INTRADAY_PENDING;
  const runningTtl = isStock ? TTL_MS_STOCK_RUNNING : TTL_MS_INTRADAY_RUNNING;

  const livePrice =
    probe && Number.isFinite(probe.price) && probe.price > 0
      ? roundPrice(probe.price, record.decimals)
      : record.lastPrice;

  let status: SignalHistoryStatus = record.status;
  let filledAtMs = record.filledAtMs;
  let zoneFillVerified = Boolean(record.zoneFillVerified || record.filledOnFirstSight || record.filledAtMs);
  let tp1HitAtMs = record.tp1HitAtMs;
  let closedAtMs = record.closedAtMs;
  let closedPrice = record.closedPrice;
  let maxFav = record.maxFavorablePrice || livePrice;
  let maxAdv = record.maxAdversePrice || livePrice;

  const isBuy = record.direction === 'BUY';

  // Build ordered post-creation price checkpoints from candles (if available) + live tick
  const checkpoints: Array<{ high: number; low: number; close: number; ts: number }> = [];
  if (probe?.candles && probe.candles.length > 0) {
    for (const c of probe.candles) {
      const candleTs = c.t < 1e12 ? c.t * 1000 : c.t;
      if (candleTs >= record.createdAtMs - 60_000 && c.h > 0 && c.l > 0 && c.c > 0) {
        checkpoints.push({ high: c.h, low: c.l, close: c.c, ts: candleTs });
      }
    }
  }

  // Always include live spot (and session high/low only if signal was created before today's bar or after fill)
  const useSessionRange =
    probe?.dayHigh &&
    probe?.dayLow &&
    probe.dayHigh > 0 &&
    probe.dayLow > 0 &&
    now - record.createdAtMs >= 6 * 60 * 60 * 1000;

  checkpoints.push({
    high: useSessionRange ? Math.max(livePrice, probe!.dayHigh!) : livePrice,
    low: useSessionRange ? Math.min(livePrice, probe!.dayLow!) : livePrice,
    close: livePrice,
    ts: now,
  });

  for (const pt of checkpoints) {
    if (isTerminalSignalStatus(status)) break;

    if (status === 'PENDING_LIMIT') {
      // Check if limit entry zone was touched
      const touchedZone = pt.low <= record.entryHigh && pt.high >= record.entryLow;
      const hitSlBeforeFill = isBuy ? pt.low <= record.stopLoss : pt.high >= record.stopLoss;
      const ranToTp1BeforeFill = isBuy ? pt.high >= record.tp1 : pt.low <= record.tp1;

      if (touchedZone) {
        status = 'RUNNING';
        zoneFillVerified = true;
        filledAtMs = filledAtMs ?? Math.max(record.createdAtMs, pt.ts);
        maxFav = record.entryPrice;
        maxAdv = record.entryPrice;
        // Same bar could continue straight into SL or TP1 after fill, evaluate conservatively: SL first
        if (hitSlBeforeFill) {
          status = 'SL_HIT';
          closedAtMs = Math.max(filledAtMs, pt.ts);
          closedPrice = record.stopLoss;
          maxAdv = isBuy ? Math.min(maxAdv, pt.low) : Math.max(maxAdv, pt.high);
          break;
        }
        if (ranToTp1BeforeFill) {
          status = 'TP1_HIT';
          tp1HitAtMs = Math.max(filledAtMs, pt.ts);
          maxFav = isBuy ? Math.max(maxFav, pt.high) : Math.min(maxFav, pt.low);
          const hitTp2 = isBuy ? pt.high >= record.tp2 : pt.low <= record.tp2;
          if (hitTp2) {
            status = 'TP2_HIT';
            closedAtMs = Math.max(tp1HitAtMs, pt.ts);
            closedPrice = record.tp2;
            break;
          }
        }
      } else if (hitSlBeforeFill || ranToTp1BeforeFill) {
        // Missed limit setup: price hit SL or ran to TP1 without ever filling the limit
        status = 'EXPIRED';
        closedAtMs = Math.max(record.createdAtMs, pt.ts);
        closedPrice = roundPrice(pt.close, record.decimals);
        break;
      }
      continue;
    }

    // RUNNING or TP1_HIT
    maxFav = isBuy ? Math.max(maxFav, pt.high) : Math.min(maxFav, pt.low);
    maxAdv = isBuy ? Math.min(maxAdv, pt.low) : Math.max(maxAdv, pt.high);

    if (status === 'RUNNING') {
      const hitSl = isBuy ? pt.low <= record.stopLoss : pt.high >= record.stopLoss;
      const hitTp1 = isBuy ? pt.high >= record.tp1 : pt.low <= record.tp1;
      const hitTp2 = isBuy ? pt.high >= record.tp2 : pt.low <= record.tp2;

      // Conservative institutional grading: if both SL and TP occur in the same bar, grade SL first
      if (hitSl) {
        status = 'SL_HIT';
        closedAtMs = Math.max(filledAtMs ?? record.createdAtMs, pt.ts);
        closedPrice = record.stopLoss;
        break;
      }
      if (hitTp1) {
        status = 'TP1_HIT';
        tp1HitAtMs = Math.max(filledAtMs ?? record.createdAtMs, pt.ts);
        if (hitTp2) {
          status = 'TP2_HIT';
          closedAtMs = tp1HitAtMs;
          closedPrice = record.tp2;
          break;
        }
      }
    } else if (status === 'TP1_HIT') {
      const hitTp2 = isBuy ? pt.high >= record.tp2 : pt.low <= record.tp2;
      // After TP1 is secured, stop moves to Break-Even (entryPrice)
      const hitBe = isBuy ? pt.low <= record.entryPrice : pt.high >= record.entryPrice;

      if (hitTp2) {
        status = 'TP2_HIT';
        closedAtMs = Math.max(tp1HitAtMs ?? record.createdAtMs, pt.ts);
        closedPrice = record.tp2;
        break;
      }
      if (hitBe) {
        status = 'BE_CLOSED';
        closedAtMs = Math.max(tp1HitAtMs ?? record.createdAtMs, pt.ts);
        closedPrice = record.entryPrice;
        break;
      }
    }
  }

  // Triple-Barrier Vertical Time-Barrier expiry check
  const timeBarrierAtMs =
    record.timeBarrierAtMs ??
    computeTimeBarrierAtMs(record.timeframe, record.assetClass, record.createdAtMs);
  let hitTimeBarrier = false;

  if (!isTerminalSignalStatus(status)) {
    const ageMs = now - record.createdAtMs;
    if (status === 'PENDING_LIMIT' && ageMs > pendingTtl) {
      status = 'EXPIRED';
      closedAtMs = now;
      closedPrice = livePrice;
      hitTimeBarrier = true;
    } else if (
      (status === 'RUNNING' || status === 'TP1_HIT') &&
      (now >= timeBarrierAtMs || ageMs > runningTtl)
    ) {
      status = status === 'TP1_HIT' ? 'BE_CLOSED' : 'EXPIRED';
      closedAtMs = now;
      closedPrice = livePrice;
      hitTimeBarrier = true;
    }
  }

  const evalPrice = closedPrice ?? livePrice;
  const { pnlPct, rMultiple } = computePnlAndR(
    record.direction,
    record.entryPrice,
    record.stopLoss,
    evalPrice,
    status
  );

  const roundedMaxFav = roundPrice(maxFav > 0 ? maxFav : livePrice, record.decimals);
  const roundedMaxAdv = roundPrice(maxAdv > 0 ? maxAdv : livePrice, record.decimals);
  const { mfeR, maeR } =
    status === 'PENDING_LIMIT' && !zoneFillVerified
      ? { mfeR: 0, maeR: 0 }
      : computeMfeMaeR(
          record.direction,
          record.entryPrice,
          record.stopLoss,
          roundedMaxFav > 0 ? roundedMaxFav : livePrice,
          roundedMaxAdv > 0 ? roundedMaxAdv : livePrice
        );

  const barrierOutcome: SignalBarrierOutcome =
    status === 'TP2_HIT'
      ? 'UPPER_TP'
      : status === 'SL_HIT'
        ? 'LOWER_SL'
        : status === 'BE_CLOSED'
          ? 'BREAK_EVEN'
          : status === 'EXPIRED' || hitTimeBarrier
            ? 'TIME_BARRIER'
            : 'OPEN';

  const nextVerificationStatus: SignalVerificationStatus = zoneFillVerified
    ? 'Verified'
    : status === 'EXPIRED'
      ? 'Expired'
      : 'Pending';
  const nextVerifiedAtMs =
    record.verifiedAtMs ??
    (nextVerificationStatus === 'Verified'
      ? filledAtMs ?? now
      : nextVerificationStatus === 'Expired'
        ? closedAtMs ?? now
        : undefined);

  return {
    ...record,
    status,
    strategy: record.strategy ?? deriveSignalStrategyKey(record.sourceEngine),
    outcome: deriveSignalIndexedOutcome(status, record.userOutcome),
    timestamp: record.timestamp ?? record.createdAtMs,
    zoneFillVerified,
    verificationStatus: nextVerificationStatus,
    ...(nextVerifiedAtMs ? { verifiedAtMs: nextVerifiedAtMs } : {}),
    ...(filledAtMs ? { filledAtMs } : {}),
    ...(tp1HitAtMs ? { tp1HitAtMs } : {}),
    ...(closedAtMs ? { closedAtMs } : {}),
    ...(closedPrice ? { closedPrice: roundPrice(closedPrice, record.decimals) } : {}),
    lastPrice: livePrice,
    maxFavorablePrice: roundedMaxFav > 0 ? roundedMaxFav : livePrice,
    maxAdversePrice: roundedMaxAdv > 0 ? roundedMaxAdv : livePrice,
    pnlPct,
    rMultiple,
    mfeR,
    maeR,
    barrierOutcome,
    timeBarrierAtMs,
    lastCheckedAtMs: now,
  };
}

export interface ReconcileSignalHistoryResult {
  nextRecords: SignalHistoryRecord[];
  createdRecords: SignalHistoryRecord[];
  updatedRecords: SignalHistoryRecord[];
  changed: boolean;
}

/**
 * Reconciles active signal records with live price probes and incoming scanner candidates.
 * Guarantees continuity: if a lockKey already has an active signal (PENDING_LIMIT / RUNNING / TP1_HIT),
 * incoming candidates for the same lockKey are ignored so the original entry/SL/TP stays locked.
 */
export function reconcileSignalHistory(
  existingRecords: SignalHistoryRecord[],
  incomingCandidates: SignalHistoryRecord[],
  liveProbes: Map<string, LivePriceProbe>,
  now: number,
  maxRecords = 150
): ReconcileSignalHistoryResult {
  const updatedRecords: SignalHistoryRecord[] = [];
  let changed = false;

  const evaluated = existingRecords.map((rec) => {
    if (isTerminalSignalStatus(rec.status)) return rec;
    const probe = liveProbes.get(rec.assetId) ?? liveProbes.get(rec.symbol);
    const next = evaluateSignalRecord(rec, probe, now);

    const statusChanged = next.status !== rec.status;
    const priceDeltaPct =
      rec.lastPrice > 0 ? Math.abs(next.lastPrice - rec.lastPrice) / rec.lastPrice : 0;
    const heartbeatDue = now - rec.lastCheckedAtMs >= 60_000 && next.lastPrice !== rec.lastPrice;

    if (statusChanged || priceDeltaPct >= 0.0025 || heartbeatDue) {
      updatedRecords.push(next);
      changed = true;
      return next;
    }
    return rec;
  });

  // Track active locks & recent closed cooldowns by lockKey
  const activeLockKeys = new Set<string>();
  const latestClosedByLock = new Map<string, number>();

  for (const rec of evaluated) {
    if (!isTerminalSignalStatus(rec.status)) {
      activeLockKeys.add(rec.lockKey);
    } else {
      const closedTs = rec.closedAtMs ?? rec.lastCheckedAtMs ?? rec.createdAtMs;
      const prev = latestClosedByLock.get(rec.lockKey) ?? 0;
      if (closedTs > prev) latestClosedByLock.set(rec.lockKey, closedTs);
    }
  }

  const createdRecords: SignalHistoryRecord[] = [];
  for (const cand of incomingCandidates) {
    if (activeLockKeys.has(cand.lockKey)) continue;

    const lastClosed = latestClosedByLock.get(cand.lockKey);
    const isStock = cand.assetClass === 'stock_id' || cand.assetClass === 'stock_us';
    const cooldownMs = isStock ? REENTRY_COOLDOWN_MS_STOCK : REENTRY_COOLDOWN_MS_INTRADAY;
    if (lastClosed && now - lastClosed < cooldownMs) continue;

    activeLockKeys.add(cand.lockKey);
    createdRecords.push(cand);
    changed = true;
  }

  const combined = [...createdRecords, ...evaluated]
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, maxRecords);

  return {
    nextRecords: combined,
    createdRecords,
    updatedRecords,
    changed,
  };
}

export interface SignalHistoryStats {
  total: number;
  runningCount: number;
  pendingCount: number;
  tp1Count: number;
  tp2Count: number;
  slCount: number;
  beCount: number;
  expiredCount: number;
  winRatePct: number | null;
  verifiedCount: number;
  verifiedExpiredCount: number;
  verifiedPendingCount: number;
  fillConversionRatePct: number | null;
  trueHitRatePct: number | null;
  verifiedWins: number;
  verifiedLosses: number;
  verifiedBe: number;
  netR: number;
  journalWins: number;
  journalLosses: number;
  journalBe: number;
  journalSkipped: number;
  journalWinRatePct: number | null;
}

export function computeSignalHistoryStats(records: SignalHistoryRecord[]): SignalHistoryStats {
  let runningCount = 0;
  let pendingCount = 0;
  let tp1Count = 0;
  let tp2Count = 0;
  let slCount = 0;
  let beCount = 0;
  let expiredCount = 0;
  let verifiedCount = 0;
  let verifiedExpiredCount = 0;
  let verifiedPendingCount = 0;
  let verifiedWins = 0;
  let verifiedLosses = 0;
  let verifiedBe = 0;
  let netR = 0;
  let journalWins = 0;
  let journalLosses = 0;
  let journalBe = 0;
  let journalSkipped = 0;

  for (const r of records) {
    const vStatus = deriveSignalVerificationStatus(r);
    if (vStatus === 'Verified') verifiedCount++;
    else if (vStatus === 'Expired') verifiedExpiredCount++;
    else verifiedPendingCount++;

    if (r.status === 'RUNNING') runningCount++;
    else if (r.status === 'PENDING_LIMIT') pendingCount++;
    else if (r.status === 'TP1_HIT') tp1Count++;
    else if (r.status === 'TP2_HIT') tp2Count++;
    else if (r.status === 'SL_HIT') slCount++;
    else if (r.status === 'BE_CLOSED') beCount++;
    else if (r.status === 'EXPIRED') expiredCount++;

    if (vStatus === 'Verified') {
      if (r.status === 'TP1_HIT' || r.status === 'TP2_HIT') verifiedWins++;
      else if (r.status === 'SL_HIT') verifiedLosses++;
      else if (r.status === 'BE_CLOSED') verifiedBe++;
    }

    if (r.status !== 'PENDING_LIMIT' && r.status !== 'EXPIRED') {
      netR += r.rMultiple;
    }

    if (r.userOutcome === 'WIN') journalWins++;
    else if (r.userOutcome === 'LOSS') journalLosses++;
    else if (r.userOutcome === 'BE') journalBe++;
    else if (r.userOutcome === 'SKIPPED') journalSkipped++;
  }

  const wins = tp1Count + tp2Count;
  const decided = wins + slCount;
  const winRatePct = decided > 0 ? Math.round((wins / decided) * 100) : null;
  const verifiedDecided = verifiedWins + verifiedLosses;
  const trueHitRatePct =
    verifiedDecided > 0 ? Math.round((verifiedWins / verifiedDecided) * 100) : null;
  const verificationResolved = verifiedCount + verifiedExpiredCount;
  const fillConversionRatePct =
    verificationResolved > 0 ? Math.round((verifiedCount / verificationResolved) * 100) : null;
  const journalDecided = journalWins + journalLosses;
  const journalWinRatePct =
    journalDecided > 0 ? Math.round((journalWins / journalDecided) * 100) : null;

  return {
    total: records.length,
    runningCount,
    pendingCount,
    tp1Count,
    tp2Count,
    slCount,
    beCount,
    expiredCount,
    winRatePct,
    verifiedCount,
    verifiedExpiredCount,
    verifiedPendingCount,
    fillConversionRatePct,
    trueHitRatePct,
    verifiedWins,
    verifiedLosses,
    verifiedBe,
    netR: Number(netR.toFixed(2)),
    journalWins,
    journalLosses,
    journalBe,
    journalSkipped,
    journalWinRatePct,
  };
}

export function formatSignalPrice(
  price: number,
  currency: 'USD' | 'IDR',
  decimals: number
): string {
  if (!Number.isFinite(price)) return '—';
  if (currency === 'IDR') {
    return `Rp ${Math.round(price).toLocaleString('en-US')}`;
  }
  return `$${price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export interface ExecutionTypePerformanceBucket {
  label: string;
  total: number;
  filledCount: number;
  awaitingCount: number;
  expiredCount: number;
  fillRatePct: number | null;
  wins: number;
  bes: number;
  losses: number;
  decidedCount: number;
  hitRatePct: number | null;
  avgR: number | null;
  expectancyR: number | null;
  netR: number;
}

export interface ExecutionTypePerformanceSummary {
  enterNow: ExecutionTypePerformanceBucket;
  limitPullback: ExecutionTypePerformanceBucket;
  combined: ExecutionTypePerformanceBucket;
  edgeNote: string;
}

function createEmptyBucket(label: string): ExecutionTypePerformanceBucket {
  return {
    label,
    total: 0,
    filledCount: 0,
    awaitingCount: 0,
    expiredCount: 0,
    fillRatePct: null,
    wins: 0,
    bes: 0,
    losses: 0,
    decidedCount: 0,
    hitRatePct: null,
    avgR: null,
    expectancyR: null,
    netR: 0,
  };
}

function finalizeBucket(b: ExecutionTypePerformanceBucket): ExecutionTypePerformanceBucket {
  const fillDenom = b.filledCount + b.expiredCount;
  const fillRatePct =
    b.total > 0
      ? Math.round((b.filledCount / Math.max(1, fillDenom > 0 ? fillDenom : b.total)) * 100)
      : null;
  const decidedCount = b.wins + b.losses;
  const hitRatePct = decidedCount > 0 ? Math.round((b.wins / decidedCount) * 100) : null;
  const closedCount = b.wins + b.bes + b.losses;
  const avgR = closedCount > 0 ? Number((b.netR / closedCount).toFixed(2)) : null;
  const expectancyR =
    decidedCount > 0
      ? Number((b.netR / Math.max(1, decidedCount + b.bes)).toFixed(2))
      : null;
  return {
    ...b,
    fillRatePct,
    decidedCount,
    hitRatePct,
    avgR,
    expectancyR,
    netR: Number(b.netR.toFixed(2)),
  };
}

/**
 * Aggregates historical hit-rate, fill-rate, and expectancy comparing
 * 'Enter Now' (Market / Zone Fill on entry) vs 'Limit Pullback' (Armed / Pullback Limit)
 * across persisted ICT/S&D signal history records and live radar alert logs.
 */
export function computeExecutionTypePerformance(
  records: SignalHistoryRecord[] = [],
  alerts: PriceAlertItem[] = []
): ExecutionTypePerformanceSummary {
  const enterNow = createEmptyBucket('Enter Now');
  const limitPullback = createEmptyBucket('Limit Pullback');

  const radarRecords = records.filter(
    (r) =>
      r.sourceEngine === 'ict_radar' ||
      r.sourceEngine === 'sdcv_radar' ||
      r.assetClass === 'crypto' ||
      r.assetClass === 'commodity'
  );

  const seenFingerprints = new Set<string>();

  for (const r of radarRecords) {
    const isEnterNow =
      r.executionPosture === 'enter_now' ||
      (!r.executionPosture && r.filledOnFirstSight);
    const bucket = isEnterNow ? enterNow : limitPullback;
    const fp = `${r.assetId}:${r.direction}:${Math.floor(r.createdAtMs / 600_000)}`;
    seenFingerprints.add(fp);

    bucket.total += 1;
    const isZoneFilled = Boolean(
      r.zoneFillVerified ||
        r.filledOnFirstSight ||
        r.filledAtMs ||
        (r.status !== 'PENDING_LIMIT' && r.status !== 'EXPIRED')
    );

    if (r.status === 'PENDING_LIMIT') {
      bucket.awaitingCount += 1;
    } else if (r.status === 'EXPIRED') {
      if (isZoneFilled) {
        bucket.filledCount += 1;
      } else {
        bucket.expiredCount += 1;
      }
    } else {
      bucket.filledCount += 1;
      if (r.status === 'TP1_HIT' || r.status === 'TP2_HIT') {
        bucket.wins += 1;
        bucket.netR += r.rMultiple > 0 ? r.rMultiple : r.status === 'TP2_HIT' ? 2.0 : 1.0;
      } else if (r.status === 'BE_CLOSED') {
        bucket.bes += 1;
        bucket.netR += Number.isFinite(r.rMultiple) ? r.rMultiple : 0;
      } else if (r.status === 'SL_HIT') {
        bucket.losses += 1;
        bucket.netR += r.rMultiple < 0 ? r.rMultiple : -1.0;
      }
    }
  }

  for (const a of alerts) {
    if (a.alertKind !== 'ict') continue;
    if (a.ictAction !== 'BUY' && a.ictAction !== 'SELL') continue;
    const fp = `${a.assetId}:${a.ictAction}:${Math.floor(a.triggeredAt / 600_000)}`;
    if (seenFingerprints.has(fp)) continue;
    seenFingerprints.add(fp);

    const isEnterNow =
      a.ictStage === 'triggered' ||
      a.recommendedOrderType === 'MARKET / ZONE FILL' ||
      (a.fillStatus === 'filled' && a.ictStage !== 'armed' && a.ictStage !== 'pullback_limit');
    const bucket = isEnterNow ? enterNow : limitPullback;

    bucket.total += 1;
    if (a.fillStatus === 'expired_unfilled') {
      bucket.expiredCount += 1;
      continue;
    }
    if (a.fillStatus === 'awaiting_fill' && a.outcomeStatus === 'pending') {
      bucket.awaitingCount += 1;
      continue;
    }
    bucket.filledCount += 1;
    if (a.outcomeStatus === 'win') {
      bucket.wins += 1;
      bucket.netR += 2.0;
    } else if (a.outcomeStatus === 'be') {
      bucket.bes += 1;
    } else if (a.outcomeStatus === 'loss') {
      bucket.losses += 1;
      bucket.netR -= 1.0;
    }
  }

  const fEnter = finalizeBucket(enterNow);
  const fLimit = finalizeBucket(limitPullback);

  const combinedRaw = createEmptyBucket('All Verified Radar');
  combinedRaw.total = fEnter.total + fLimit.total;
  combinedRaw.filledCount = fEnter.filledCount + fLimit.filledCount;
  combinedRaw.awaitingCount = fEnter.awaitingCount + fLimit.awaitingCount;
  combinedRaw.expiredCount = fEnter.expiredCount + fLimit.expiredCount;
  combinedRaw.wins = fEnter.wins + fLimit.wins;
  combinedRaw.bes = fEnter.bes + fLimit.bes;
  combinedRaw.losses = fEnter.losses + fLimit.losses;
  combinedRaw.netR = fEnter.netR + fLimit.netR;
  const combined = finalizeBucket(combinedRaw);

  let edgeNote =
    'Awaiting verified TP/SL outcomes — fills are automatically verified against Entry Zone before grading.';
  if (fEnter.decidedCount > 0 && fLimit.decidedCount > 0) {
    if ((fLimit.hitRatePct ?? 0) > (fEnter.hitRatePct ?? 0)) {
      edgeNote = `Limit Pullback leads (${fLimit.hitRatePct}% WR · ${fLimit.netR >= 0 ? '+' : ''}${fLimit.netR}R) vs Enter Now (${fEnter.hitRatePct}% WR) — patience for retracement fills is paying off.`;
    } else if ((fEnter.hitRatePct ?? 0) > (fLimit.hitRatePct ?? 0)) {
      edgeNote = `Enter Now leads (${fEnter.hitRatePct}% WR · ${fEnter.netR >= 0 ? '+' : ''}${fEnter.netR}R) vs Limit Pullback (${fLimit.hitRatePct}% WR) — in-zone momentum entries are converting cleanly.`;
    } else {
      edgeNote = `Enter Now and Limit Pullback are tied at ${fEnter.hitRatePct}% WR — continue following live Spot vs Limit R:R discipline.`;
    }
  } else if (fEnter.decidedCount > 0) {
    edgeNote = `Enter Now verified at ${fEnter.hitRatePct}% WR (${fEnter.wins}W/${fEnter.losses}L · ${fEnter.netR >= 0 ? '+' : ''}${fEnter.netR}R); Limit Pullback awaiting closed fills.`;
  } else if (fLimit.decidedCount > 0) {
    edgeNote = `Limit Pullback verified at ${fLimit.hitRatePct}% WR (${fLimit.wins}W/${fLimit.losses}L · ${fLimit.netR >= 0 ? '+' : ''}${fLimit.netR}R); Enter Now awaiting closed fills.`;
  } else if (combined.total > 0) {
    edgeNote = `${combined.filledCount} filled · ${combined.awaitingCount} awaiting limit fill — hit-rates update automatically as trades hit TP1/TP2 or SL.`;
  }

  return {
    enterNow: fEnter,
    limitPullback: fLimit,
    combined,
    edgeNote,
  };
}

export interface ConfluenceExpectancyRow {
  id: string;
  label: string;
  category: 'Confluence' | 'Regime' | 'Execution';
  sampleSize: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  expectancyR: number | null;
  netR: number;
  avgMfeR: number | null;
  avgMaeR: number | null;
  edgeGrade: 'STRONG_EDGE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'INSUFFICIENT';
}

export interface ConfluenceExpectancyMatrix {
  rows: ConfluenceExpectancyRow[];
  overallExpectancyR: number | null;
  rolling20ExpectancyR: number | null;
  rolling20Count: number;
  driftWarning: boolean;
  driftMessage: string;
  avgMfeR: number | null;
  avgMaeR: number | null;
  edgeCaptureRatioPct: number | null;
  stopCalibrationNote: string;
  barrierBreakdown: {
    upperTp: number;
    lowerSl: number;
    timeBarrier: number;
    breakEven: number;
    open: number;
  };
}

function getEffectiveRForExpectancy(r: SignalHistoryRecord): {
  outcomeType: 'win' | 'loss' | 'be' | 'skip';
  realizedR: number;
} {
  if (r.userOutcome === 'SKIPPED') return { outcomeType: 'skip', realizedR: 0 };
  if (r.userOutcome === 'WIN') {
    return { outcomeType: 'win', realizedR: r.rMultiple > 0 ? r.rMultiple : 2.0 };
  }
  if (r.userOutcome === 'LOSS') {
    return { outcomeType: 'loss', realizedR: r.rMultiple < 0 ? r.rMultiple : -1.0 };
  }
  if (r.userOutcome === 'BE') return { outcomeType: 'be', realizedR: 0 };

  if (r.status === 'TP1_HIT' || r.status === 'TP2_HIT') {
    return {
      outcomeType: 'win',
      realizedR: r.rMultiple > 0 ? r.rMultiple : r.status === 'TP2_HIT' ? 2.2 : 1.1,
    };
  }
  if (r.status === 'SL_HIT') {
    return { outcomeType: 'loss', realizedR: r.rMultiple < 0 ? r.rMultiple : -1.0 };
  }
  if (r.status === 'BE_CLOSED') {
    return { outcomeType: 'be', realizedR: Number.isFinite(r.rMultiple) ? r.rMultiple : 0 };
  }
  if (r.status === 'EXPIRED' && r.zoneFillVerified && r.barrierOutcome === 'TIME_BARRIER') {
    if (r.rMultiple > 0.15) return { outcomeType: 'win', realizedR: r.rMultiple };
    if (r.rMultiple < -0.15) return { outcomeType: 'loss', realizedR: r.rMultiple };
    return { outcomeType: 'be', realizedR: r.rMultiple };
  }
  return { outcomeType: 'skip', realizedR: 0 };
}

function buildExpectancyRow(
  id: string,
  label: string,
  category: ConfluenceExpectancyRow['category'],
  subset: SignalHistoryRecord[]
): ConfluenceExpectancyRow {
  let wins = 0;
  let losses = 0;
  let bes = 0;
  let winRSum = 0;
  let lossRSum = 0;
  let netR = 0;
  let mfeSum = 0;
  let maeSum = 0;
  let excCount = 0;

  for (const rec of subset) {
    const { outcomeType, realizedR } = getEffectiveRForExpectancy(rec);
    if (outcomeType === 'skip') continue;
    if (outcomeType === 'win') {
      wins++;
      winRSum += Math.abs(realizedR);
      netR += realizedR;
    } else if (outcomeType === 'loss') {
      losses++;
      lossRSum += Math.abs(realizedR);
      netR += realizedR;
    } else if (outcomeType === 'be') {
      bes++;
      netR += realizedR;
    }

    const risk = Math.max(Math.abs(rec.entryPrice - rec.stopLoss), rec.entryPrice * 0.001, 1e-6);
    const derivedMfe =
      typeof rec.mfeR === 'number'
        ? rec.mfeR
        : computeMfeMaeR(rec.direction, rec.entryPrice, rec.stopLoss, rec.maxFavorablePrice, rec.maxAdversePrice).mfeR;
    const derivedMae =
      typeof rec.maeR === 'number'
        ? rec.maeR
        : computeMfeMaeR(rec.direction, rec.entryPrice, rec.stopLoss, rec.maxFavorablePrice, rec.maxAdversePrice).maeR;
    if (risk > 0 && Number.isFinite(derivedMfe) && Number.isFinite(derivedMae)) {
      mfeSum += derivedMfe;
      maeSum += derivedMae;
      excCount++;
    }
  }

  const sampleSize = wins + losses + bes;
  const decided = wins + losses;
  const winRatePct = decided > 0 ? Math.round((wins / decided) * 100) : null;
  const avgWinR = wins > 0 ? Number((winRSum / wins).toFixed(2)) : null;
  const avgLossR = losses > 0 ? Number((lossRSum / losses).toFixed(2)) : null;

  let expectancyR: number | null = null;
  if (sampleSize > 0) {
    const pWin = wins / sampleSize;
    const pLoss = losses / sampleSize;
    const eVal = pWin * (avgWinR ?? 0) - pLoss * (avgLossR ?? 0);
    expectancyR = Number(eVal.toFixed(2));
  }

  const edgeGrade: ConfluenceExpectancyRow['edgeGrade'] =
    sampleSize < 3 || expectancyR === null
      ? 'INSUFFICIENT'
      : expectancyR >= 0.45
        ? 'STRONG_EDGE'
        : expectancyR > 0.08
          ? 'POSITIVE'
          : expectancyR >= -0.08
            ? 'NEUTRAL'
            : 'NEGATIVE';

  return {
    id,
    label,
    category,
    sampleSize,
    wins,
    losses,
    winRatePct,
    avgWinR,
    avgLossR,
    expectancyR,
    netR: Number(netR.toFixed(2)),
    avgMfeR: excCount > 0 ? Number((mfeSum / excCount).toFixed(2)) : null,
    avgMaeR: excCount > 0 ? Number((maeSum / excCount).toFixed(2)) : null,
    edgeGrade,
  };
}

/**
 * Lightweight Meta-Labeling & Confluence Expectancy Matrix:
 * Tracks net expectancy E = (P_win * AvgWinR) - (P_loss * AvgLossR),
 * MAE/MFE excursion calibration, Triple-Barrier counts, and Rolling 20-Trade Expectancy Drift.
 */
export function computeConfluenceExpectancyMatrix(
  records: SignalHistoryRecord[] = []
): ConfluenceExpectancyMatrix {
  const radarRecords = records
    .filter(
      (r) =>
        r.sourceEngine === 'ict_radar' ||
        r.sourceEngine === 'sdcv_radar' ||
        r.assetClass === 'crypto' ||
        r.assetClass === 'commodity'
    )
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const barrierBreakdown = {
    upperTp: 0,
    lowerSl: 0,
    timeBarrier: 0,
    breakEven: 0,
    open: 0,
  };

  for (const r of radarRecords) {
    const bo =
      r.barrierOutcome ??
      (r.status === 'TP2_HIT'
        ? 'UPPER_TP'
        : r.status === 'SL_HIT'
          ? 'LOWER_SL'
          : r.status === 'BE_CLOSED'
            ? 'BREAK_EVEN'
            : r.status === 'EXPIRED'
              ? 'TIME_BARRIER'
              : 'OPEN');
    if (bo === 'UPPER_TP') barrierBreakdown.upperTp++;
    else if (bo === 'LOWER_SL') barrierBreakdown.lowerSl++;
    else if (bo === 'TIME_BARRIER') barrierBreakdown.timeBarrier++;
    else if (bo === 'BREAK_EVEN') barrierBreakdown.breakEven++;
    else barrierBreakdown.open++;
  }

  const rows: ConfluenceExpectancyRow[] = [
    buildExpectancyRow(
      'in_killzone',
      'Inside Killzone',
      'Confluence',
      radarRecords.filter((r) => r.inKillzone === true)
    ),
    buildExpectancyRow(
      'po3_aligned',
      'PO3 Midnight Open Aligned',
      'Confluence',
      radarRecords.filter((r) => r.po3Aligned === true)
    ),
    buildExpectancyRow(
      'smt_confirmed',
      'SMT Divergence Confirmed',
      'Confluence',
      radarRecords.filter((r) => r.smtConfirmed === true)
    ),
    buildExpectancyRow(
      'htf_aligned',
      'HTF 1H/4H Aligned',
      'Confluence',
      radarRecords.filter((r) => r.htfAligned === true)
    ),
    buildExpectancyRow(
      'vol_r1',
      'R1 Compression Regime',
      'Regime',
      radarRecords.filter((r) => r.volatilityRegime === 'R1_COMPRESSION')
    ),
    buildExpectancyRow(
      'vol_normal',
      'Normal Volatility Regime',
      'Regime',
      radarRecords.filter((r) => r.volatilityRegime === 'NORMAL')
    ),
    buildExpectancyRow(
      'vol_r2',
      'R2 Expansion Regime',
      'Regime',
      radarRecords.filter((r) => r.volatilityRegime === 'R2_EXPANSION')
    ),
    buildExpectancyRow(
      'exec_enter_now',
      'Enter Now (In-Zone)',
      'Execution',
      radarRecords.filter(
        (r) => r.executionPosture === 'enter_now' || (!r.executionPosture && r.filledOnFirstSight)
      )
    ),
    buildExpectancyRow(
      'exec_limit',
      'Limit Pullback (50% CE)',
      'Execution',
      radarRecords.filter(
        (r) => r.executionPosture !== 'enter_now' && (Boolean(r.executionPosture) || !r.filledOnFirstSight)
      )
    ),
  ];

  const overallRow = buildExpectancyRow('overall', 'All Radar Closed', 'Execution', radarRecords);
  const closedOrdered = radarRecords.filter(
    (r) => getEffectiveRForExpectancy(r).outcomeType !== 'skip'
  );
  const rolling20Slice = closedOrdered.slice(0, 20);
  const rolling20Row = buildExpectancyRow('rolling20', 'Rolling 20 Trades', 'Execution', rolling20Slice);

  const driftWarning =
    rolling20Row.sampleSize >= 5 &&
    rolling20Row.expectancyR !== null &&
    rolling20Row.expectancyR < 0;

  let driftMessage =
    rolling20Row.sampleSize === 0
      ? 'Awaiting closed ICT/S&D trades to calibrate rolling 20-trade expectancy.'
      : driftWarning
        ? `Expectancy Drift Alert: Rolling ${rolling20Row.sampleSize}-trade expectancy dropped to ${rolling20Row.expectancyR}R. Reduce size to 0.5x and require A+ Killzone + PO3 confluence.`
        : `Rolling ${rolling20Row.sampleSize}-trade expectancy is ${rolling20Row.expectancyR !== null && rolling20Row.expectancyR >= 0 ? '+' : ''}${rolling20Row.expectancyR ?? 0}R (${rolling20Row.winRatePct ?? 0}% WR) — edge intact.`;

  const avgMfeR = overallRow.avgMfeR;
  const avgMaeR = overallRow.avgMaeR;
  let edgeCaptureRatioPct: number | null = null;
  if (avgMfeR !== null && avgMfeR > 0.1 && overallRow.expectancyR !== null) {
    edgeCaptureRatioPct = Math.round(clamp((overallRow.expectancyR / avgMfeR) * 100, -100, 100));
  }

  let stopCalibrationNote =
    'MFE/MAE excursion telemetry will auto-calibrate stop tightness once filled trades close.';
  if (avgMaeR !== null && avgMfeR !== null && overallRow.sampleSize >= 3) {
    if (avgMaeR >= 0.85 && (overallRow.winRatePct ?? 0) < 48) {
      stopCalibrationNote = `Avg MAE is ${avgMaeR}R — stops are getting tagged before expansion; favor ATR-wider buffers in R2 Expansion.`;
    } else if (avgMfeR >= 1.8 && (overallRow.expectancyR ?? 0) < 0.35) {
      stopCalibrationNote = `Avg MFE reaches +${avgMfeR}R while realized expectancy is ${overallRow.expectancyR}R — lock Break-Even earlier at TP1.`;
    } else {
      stopCalibrationNote = `Healthy excursion profile: Avg MFE +${avgMfeR}R vs Avg MAE -${avgMaeR}R across ${overallRow.sampleSize} closed trades.`;
    }
  }

  return {
    rows,
    overallExpectancyR: overallRow.expectancyR,
    rolling20ExpectancyR: rolling20Row.expectancyR,
    rolling20Count: rolling20Row.sampleSize,
    driftWarning,
    driftMessage,
    avgMfeR,
    avgMaeR,
    edgeCaptureRatioPct,
    stopCalibrationNote,
    barrierBreakdown,
  };
}

/**
 * Stocks Phase 3 Triple-Barrier & Institutional Meta-Labeling Expectancy Matrix:
 * Quantifies expectancy across Stage 2 Uptrend, RS Rank >= 75, VCP Tight Bases,
 * Top-3 Sector Leaders, IDX Bandarmology, and US Swing setups.
 */
export function computeStockConfluenceExpectancyMatrix(
  records: SignalHistoryRecord[] = []
): ConfluenceExpectancyMatrix {
  const stockRecords = records
    .filter(
      (r) =>
        r.sourceEngine === 'idx_scanner' ||
        r.sourceEngine === 'us_scanner' ||
        r.assetClass === 'stock_id' ||
        r.assetClass === 'stock_us'
    )
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const barrierBreakdown = {
    upperTp: 0,
    lowerSl: 0,
    timeBarrier: 0,
    breakEven: 0,
    open: 0,
  };

  for (const r of stockRecords) {
    const bo =
      r.barrierOutcome ??
      (r.status === 'TP2_HIT'
        ? 'UPPER_TP'
        : r.status === 'SL_HIT'
          ? 'LOWER_SL'
          : r.status === 'BE_CLOSED'
            ? 'BREAK_EVEN'
            : r.status === 'EXPIRED'
              ? 'TIME_BARRIER'
              : 'OPEN');
    if (bo === 'UPPER_TP') barrierBreakdown.upperTp++;
    else if (bo === 'LOWER_SL') barrierBreakdown.lowerSl++;
    else if (bo === 'TIME_BARRIER') barrierBreakdown.timeBarrier++;
    else if (bo === 'BREAK_EVEN') barrierBreakdown.breakEven++;
    else barrierBreakdown.open++;
  }

  const rows: ConfluenceExpectancyRow[] = [
    buildExpectancyRow(
      'stage2_aligned',
      'Stage 2 Minervini Uptrend',
      'Confluence',
      stockRecords.filter((r) => r.stage2Aligned === true || r.htfAligned === true)
    ),
    buildExpectancyRow(
      'rs_leader',
      'RS Rank ≥ 75 Leader',
      'Confluence',
      stockRecords.filter((r) => typeof r.rsRank === 'number' && r.rsRank >= 75)
    ),
    buildExpectancyRow(
      'vcp_base',
      'VCP Tight Base + Dry-Up',
      'Confluence',
      stockRecords.filter((r) => r.vcpDetected === true)
    ),
    buildExpectancyRow(
      'sector_leader',
      'Top-3 Leading Sector',
      'Regime',
      stockRecords.filter((r) => r.sectorLeader === true)
    ),
    buildExpectancyRow(
      'idx_bandar',
      'IDX Bandarmology + Demand',
      'Execution',
      stockRecords.filter((r) => r.assetClass === 'stock_id')
    ),
    buildExpectancyRow(
      'us_swing',
      'US Institutional Swing',
      'Execution',
      stockRecords.filter((r) => r.assetClass === 'stock_us')
    ),
  ];

  const overallRow = buildExpectancyRow('stock_overall', 'All Stocks Closed', 'Execution', stockRecords);
  const closedOrdered = stockRecords.filter(
    (r) => getEffectiveRForExpectancy(r).outcomeType !== 'skip'
  );
  const rolling20Slice = closedOrdered.slice(0, 20);
  const rolling20Row = buildExpectancyRow('stock_rolling20', 'Rolling 20 Stock Trades', 'Execution', rolling20Slice);

  const driftWarning =
    rolling20Row.sampleSize >= 5 &&
    rolling20Row.expectancyR !== null &&
    rolling20Row.expectancyR < 0;

  const driftMessage =
    rolling20Row.sampleSize === 0
      ? 'Awaiting closed IDX/US stock trades to calibrate Stage 2, RS Rank & VCP expectancy.'
      : driftWarning
        ? `Equity Expectancy Drift: Rolling ${rolling20Row.sampleSize}-trade expectancy is ${rolling20Row.expectancyR}R. Restrict sizing to 0.5R and require Stage 2 + RS≥75 + Top-3 Sector.`
        : `Rolling ${rolling20Row.sampleSize}-trade equity expectancy is ${rolling20Row.expectancyR !== null && rolling20Row.expectancyR >= 0 ? '+' : ''}${rolling20Row.expectancyR ?? 0}R (${rolling20Row.winRatePct ?? 0}% WR) — institutional edge intact.`;

  const avgMfeR = overallRow.avgMfeR;
  const avgMaeR = overallRow.avgMaeR;
  let edgeCaptureRatioPct: number | null = null;
  if (avgMfeR !== null && avgMfeR > 0.1 && overallRow.expectancyR !== null) {
    edgeCaptureRatioPct = Math.round(clamp((overallRow.expectancyR / avgMfeR) * 100, -100, 100));
  }

  let stopCalibrationNote =
    'MFE/MAE excursion telemetry will auto-calibrate 10D/20D EMA runner exits once stock trades close.';
  if (avgMaeR !== null && avgMfeR !== null && overallRow.sampleSize >= 3) {
    if (avgMaeR >= 0.85 && (overallRow.winRatePct ?? 0) < 48) {
      stopCalibrationNote = `Avg MAE is ${avgMaeR}R — entries are taking early heat; prioritize VCP dry-up pullbacks near Demand.`;
    } else if (avgMfeR >= 2.0 && (overallRow.expectancyR ?? 0) < 0.4) {
      stopCalibrationNote = `Avg MFE reaches +${avgMfeR}R vs ${overallRow.expectancyR}R realized — scale 50% at TP1 and trail 10D EMA runner.`;
    } else {
      stopCalibrationNote = `Healthy equity excursion: Avg MFE +${avgMfeR}R vs Avg MAE -${avgMaeR}R across ${overallRow.sampleSize} closed trades.`;
    }
  }

  return {
    rows,
    overallExpectancyR: overallRow.expectancyR,
    rolling20ExpectancyR: rolling20Row.expectancyR,
    rolling20Count: rolling20Row.sampleSize,
    driftWarning,
    driftMessage,
    avgMfeR,
    avgMaeR,
    edgeCaptureRatioPct,
    stopCalibrationNote,
    barrierBreakdown,
  };
}
