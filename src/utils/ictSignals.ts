import {
  CandlePoint,
  EconomicCalendarCurrency,
  EconomicEvent,
  IctDirection,
  IctExecutionPosture,
  IctRecommendedOrderType,
  IctSignalAnalysis,
  MarketAsset,
  SignalBiasVerdict,
  SignalClearanceGate,
  Timeframe,
} from '../types/market';

export interface MacroIctContext {
  dxyBias?: 'Bullish' | 'Bearish' | 'Ranging';
  dxyChangePct?: number;
  dxyPrice?: number;
  dxyBars?: CandlePoint[];
  riskBenchSymbol?: string;
  riskBenchBias?: 'Bullish' | 'Bearish' | 'Ranging';
  riskBenchChangePct?: number;
  riskBenchPrice?: number;
  riskBenchBars?: CandlePoint[];
}

const PURE_ICT_ASSET_IDS = new Set(['BTCUSD', 'XAUUSD']);

const ICT_TIMEFRAME_PRIORITY: Timeframe[] = ['15m', '5m', '30m', '1h', '4h', '1m', '1D'];

export const TF_BAR_MINUTES: Partial<Record<Timeframe, number>> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '4h': 240,
  '1D': 1440,
};

export const TF_DURATION_MS: Partial<Record<Timeframe, number>> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1D': 86_400_000,
};

export function isIctEligibleAsset(asset: MarketAsset): boolean {
  if (!asset || asset.isYield) return false;
  return PURE_ICT_ASSET_IDS.has(asset.id);
}

export function formatPriceWithAsset(val: number, asset: MarketAsset): string {
  const safeVal = Number.isFinite(val) ? val : asset.price;
  const formatted = safeVal.toLocaleString('en-US', {
    minimumFractionDigits: asset.decimals,
    maximumFractionDigits: asset.decimals,
  });
  return `${asset.currencyPrefix ?? ''}${formatted}${asset.unitSuffix ?? ''}`;
}

export function formatBand(low: number, high: number, asset: MarketAsset): string {
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  return `${formatPriceWithAsset(lo, asset)}–${formatPriceWithAsset(hi, asset)}`;
}

export function extractBarsForTf(
  asset: MarketAsset,
  candidates: Timeframe[],
  minBars = 6
): { bars: CandlePoint[]; timeframe: Timeframe; isRealOhlc: boolean } {
  for (const tf of candidates) {
    const rawCandles = asset.chartCandles?.[tf];
    if (Array.isArray(rawCandles) && rawCandles.length >= minBars) {
      const valid = rawCandles.filter(
        (b) =>
          Number.isFinite(b.o) &&
          Number.isFinite(b.h) &&
          Number.isFinite(b.l) &&
          Number.isFinite(b.c) &&
          b.c > 0 &&
          b.h >= b.l
      );
      if (valid.length >= minBars) {
        return { bars: valid.slice(-120), timeframe: tf, isRealOhlc: true };
      }
    }
  }

  return {
    bars: [],
    timeframe: candidates[0] ?? '15m',
    isRealOhlc: false,
  };
}

export function computeSetupGrade(params: {
  direction: IctDirection;
  inKillzone: boolean;
  volatilityPassed: boolean;
  newsBlocked: boolean;
  confidence: number;
  realRr: number;
  htfAligned: boolean;
}): { setupGrade: 'A+' | 'A' | 'B' | 'WAIT'; isAPlusSetup: boolean } {
  const {
    direction,
    inKillzone,
    volatilityPassed,
    newsBlocked,
    confidence,
    realRr,
    htfAligned,
  } = params;
  if (direction === 'NEUTRAL') {
    return { setupGrade: 'WAIT', isAPlusSetup: false };
  }
  if (
    inKillzone &&
    volatilityPassed &&
    !newsBlocked &&
    confidence >= 78 &&
    realRr >= 2.4 &&
    htfAligned
  ) {
    return { setupGrade: 'A+', isAPlusSetup: true };
  }
  if (confidence >= 70 && realRr >= 2.0) {
    return { setupGrade: 'A', isAPlusSetup: false };
  }
  return { setupGrade: 'B', isAPlusSetup: false };
}

export function resolveUsdExposure(
  assetId: string,
  direction: IctDirection
): 'LONG_USD' | 'SHORT_USD' | undefined {
  if (direction === 'NEUTRAL') return undefined;
  // Both BTC/USD and XAU/USD are quoted against USD: BUY = anti-USD / risk-bid, SELL = pro-USD
  if (assetId === 'XAUUSD' || assetId === 'BTCUSD') {
    return direction === 'BUY' ? 'SHORT_USD' : 'LONG_USD';
  }
  return undefined;
}

export function computeAtr(bars: CandlePoint[], period = 14): number {
  if (bars.length < 2) return 1e-5;
  const slice = bars.slice(-(period + 1));
  let trSum = 0;
  let count = 0;
  for (let i = 1; i < slice.length; i++) {
    const cur = slice[i];
    const prevClose = slice[i - 1].c;
    const tr = Math.max(
      cur.h - cur.l,
      Math.abs(cur.h - prevClose),
      Math.abs(cur.l - prevClose)
    );
    trSum += tr;
    count += 1;
  }
  return Math.max(1e-6, trSum / Math.max(1, count));
}

export interface ImbalanceZoneBox {
  low: number;
  high: number;
  ceMid: number;
  idx: number;
  formedAt: number;
  touchCount: number;
}

export interface ImbalanceZonesResult {
  bullFvg: ImbalanceZoneBox | null;
  bearFvg: ImbalanceZoneBox | null;
  bullOb: ImbalanceZoneBox | null;
  bearOb: ImbalanceZoneBox | null;
}

export function findUnmitigatedFvgAndOb(
  bars: CandlePoint[],
  atr: number,
  lookback = 32,
  minFvgAtr = 0.16,
  minObAtr = 0.68,
  minFormedAtMs = 0
): ImbalanceZonesResult {
  const n = bars.length;
  let bullFvg: ImbalanceZoneBox | null = null;
  let bearFvg: ImbalanceZoneBox | null = null;
  let bullOb: ImbalanceZoneBox | null = null;
  let bearOb: ImbalanceZoneBox | null = null;

  for (let i = Math.max(2, n - lookback); i < n; i++) {
    const b0 = bars[i - 2];
    const b1 = bars[i - 1];
    const b2 = bars[i];
    if (minFormedAtMs > 0 && b2.t < minFormedAtMs) continue;

    // Canonical ICT Bullish FVG (candle[i].low > candle[i-2].high with displacement body b1)
    if (b2.l > b0.h && b1.c > b1.o && b2.l - b0.h >= atr * minFvgAtr) {
      const fvgLow = b0.h;
      const fvgHigh = b2.l;
      const ceMid = (fvgLow + fvgHigh) / 2;
      const subBars = bars.slice(i + 1);
      // Canonical CE mitigation: invalid if subsequent closed candle closes below 50% CE or tapped >= 2x
      const ceBreached = subBars.some((sub) => sub.c < ceMid);
      const touchCount = subBars.filter((sub) => sub.l <= fvgHigh && sub.h >= fvgLow).length;
      if (!ceBreached && touchCount <= 1) {
        if (!bullFvg || touchCount < bullFvg.touchCount || (touchCount === bullFvg.touchCount && i > bullFvg.idx)) {
          bullFvg = { low: fvgLow, high: fvgHigh, ceMid, idx: i, formedAt: b2.t, touchCount };
        }
      }
    }

    // Canonical ICT Bearish FVG (candle[i].high < candle[i-2].low with displacement body b1)
    if (b2.h < b0.l && b1.c < b1.o && b0.l - b2.h >= atr * minFvgAtr) {
      const fvgLow = b2.h;
      const fvgHigh = b0.l;
      const ceMid = (fvgLow + fvgHigh) / 2;
      const subBars = bars.slice(i + 1);
      const ceBreached = subBars.some((sub) => sub.c > ceMid);
      const touchCount = subBars.filter((sub) => sub.h >= fvgLow && sub.l <= fvgHigh).length;
      if (!ceBreached && touchCount <= 1) {
        if (!bearFvg || touchCount < bearFvg.touchCount || (touchCount === bearFvg.touchCount && i > bearFvg.idx)) {
          bearFvg = { low: fvgLow, high: fvgHigh, ceMid, idx: i, formedAt: b2.t, touchCount };
        }
      }
    }
  }

  for (let i = Math.max(1, n - Math.min(lookback, 24)); i < n - 1; i++) {
    const cur = bars[i];
    const nxt = bars[i + 1];
    if (minFormedAtMs > 0 && nxt.t < minFormedAtMs) continue;

    if (cur.c < cur.o && nxt.c > cur.h && nxt.c - nxt.o >= atr * minObAtr) {
      const obLow = cur.l;
      const obHigh = Math.max(cur.o, cur.c);
      const ceMid = (obLow + obHigh) / 2;
      const subBars = bars.slice(i + 2);
      const mitigated = subBars.some((sub) => sub.c < obLow);
      const touchCount = subBars.filter((sub) => sub.l <= obHigh && sub.h >= obLow).length;
      if (!mitigated && touchCount <= 1) {
        bullOb = { low: obLow, high: obHigh, ceMid, idx: i, formedAt: nxt.t, touchCount };
      }
    }
    if (cur.c > cur.o && nxt.c < cur.l && nxt.o - nxt.c >= atr * minObAtr) {
      const obLow = Math.min(cur.o, cur.c);
      const obHigh = cur.h;
      const ceMid = (obLow + obHigh) / 2;
      const subBars = bars.slice(i + 2);
      const mitigated = subBars.some((sub) => sub.c > obHigh);
      const touchCount = subBars.filter((sub) => sub.h >= obLow && sub.l <= obHigh).length;
      if (!mitigated && touchCount <= 1) {
        bearOb = { low: obLow, high: obHigh, ceMid, idx: i, formedAt: nxt.t, touchCount };
      }
    }
  }

  return { bullFvg, bearFvg, bullOb, bearOb };
}

export function getIct15mAtrRangePct(assetId: string): {
  minPct: number;
  maxPct: number;
  assetClassLabel: 'Crypto (BTC/USD)' | 'Commodities (XAU/USD)';
} {
  const id = (assetId || '').toUpperCase();
  if (id === 'BTCUSD') {
    return { minPct: 0.095, maxPct: 0.85, assetClassLabel: 'Crypto (BTC/USD)' };
  }
  return { minPct: 0.032, maxPct: 0.48, assetClassLabel: 'Commodities (XAU/USD)' };
}

export function getIctVolatilityFloorPct(assetId: string, _timeframe: Timeframe = '15m'): number {
  return getIct15mAtrRangePct(assetId).minPct;
}

export function getEstimatedRoundTripFriction(
  assetId: string,
  referencePrice: number
): { cost: number; label: string } {
  const id = (assetId || '').toUpperCase();
  if (id === 'BTCUSD') {
    const cost = Math.max(1, Number((referencePrice * 0.0008).toFixed(2)));
    return { cost, label: `~$${cost.toFixed(0)} (8 bps fee/spread)` };
  }
  const cost = 0.4;
  return { cost, label: '$0.40/oz spread+slip' };
}

export function getAssetStopFloorBuffer(
  asset: MarketAsset,
  atr15m: number,
  volatilityRegime: 'R1_COMPRESSION' | 'NORMAL' | 'R2_EXPANSION' = 'NORMAL'
): { value: number; reason: string } {
  const id = (asset.id || '').toUpperCase();
  const refPrice = asset.price > 0 ? asset.price : 1;
  const regimeScale =
    volatilityRegime === 'R2_EXPANSION'
      ? 1.18
      : volatilityRegime === 'R1_COMPRESSION'
        ? 0.88
        : 1.0;

  if (id === 'BTCUSD') {
    const floor = Math.max(atr15m * 0.65, refPrice * 0.0022);
    const cap = Math.max(floor * 1.4, atr15m * 2.2);
    const raw = atr15m * 0.9 * regimeScale;
    const val = Number(Math.min(cap, Math.max(floor, raw)).toFixed(asset.decimals));
    const pct = ((val / refPrice) * 100).toFixed(2);
    return {
      value: val,
      reason: `+$${val.toFixed(0)} (${pct}% / ATR-scaled BTC sweep buffer)`,
    };
  }

  const floor = Math.max(atr15m * 0.45, refPrice * 0.0007);
  const cap = Math.max(floor * 1.4, atr15m * 1.55);
  const raw = atr15m * 0.68 * regimeScale;
  const val = Number(Math.min(cap, Math.max(floor, raw)).toFixed(asset.decimals));
  const pct = ((val / refPrice) * 100).toFixed(2);
  return {
    value: val,
    reason: `+$${val.toFixed(2)} (${pct}% / ATR-scaled XAU sweep buffer)`,
  };
}

export function compute15mAtrMetrics(
  asset: MarketAsset,
  currentPrice: number
): {
  atr15m: number;
  atr15mPct: number;
  minPct: number;
  maxPct: number;
  assetClassLabel: 'Crypto (BTC/USD)' | 'Commodities (XAU/USD)';
  volatilityStatus: 'in-range' | 'too-low' | 'too-high' | 'warming';
  volatilityPassed: boolean;
  atrSource: '15m' | 'scaled' | 'warming';
  volatilityRegime: 'R1_COMPRESSION' | 'NORMAL' | 'R2_EXPANSION';
  atrBaselineRatio: number;
} {
  const { minPct, maxPct, assetClassLabel } = getIct15mAtrRangePct(asset.id);
  const { bars: barsForAtr, timeframe: usedTf } = extractBarsForTf(
    asset,
    ['15m', '30m', '5m', '1h', '1D'],
    6
  );
  const rawAtr = computeAtr(barsForAtr, 14);
  const barMins = TF_BAR_MINUTES[usedTf] ?? 15;
  const sqrtScaleTo15m = Math.sqrt(Math.max(1 / 15, barMins / 15));
  const atr15m = rawAtr / sqrtScaleTo15m;
  const atr15mPct = currentPrice > 0 ? (atr15m / currentPrice) * 100 : 0;

  // Dual-TF Volatility Regime: compare 14-bar 15m ATR against 60-bar 15m or 1H baseline
  let baselineAtr15m = atr15m;
  if (barsForAtr.length >= 36) {
    baselineAtr15m = computeAtr(barsForAtr, Math.min(60, barsForAtr.length - 1)) / sqrtScaleTo15m;
  } else {
    const { bars: bars1h } = extractBarsForTf(asset, ['1h', '4h'], 14);
    if (bars1h.length >= 14) {
      baselineAtr15m = computeAtr(bars1h, Math.min(30, bars1h.length - 1)) / 2; // sqrt(60/15) = 2
    }
  }
  const atrBaselineRatio =
    baselineAtr15m > 1e-8 ? Number((atr15m / baselineAtr15m).toFixed(2)) : 1.0;
  const volatilityRegime: 'R1_COMPRESSION' | 'NORMAL' | 'R2_EXPANSION' =
    atrBaselineRatio < 0.75
      ? 'R1_COMPRESSION'
      : atrBaselineRatio > 1.25
        ? 'R2_EXPANSION'
        : 'NORMAL';

  const hasIntraday = usedTf === '15m' || usedTf === '30m' || usedTf === '5m';
  const atrSource: '15m' | 'scaled' | 'warming' =
    usedTf === '15m' && barsForAtr.length >= 14
      ? '15m'
      : hasIntraday
        ? 'scaled'
        : 'warming';

  let volatilityStatus: 'in-range' | 'too-low' | 'too-high' | 'warming' = 'in-range';
  if (atrSource === 'warming') {
    volatilityStatus = 'warming';
  } else if (atr15mPct < minPct) {
    volatilityStatus = 'too-low';
  } else if (atr15mPct > maxPct) {
    volatilityStatus = 'too-high';
  }

  return {
    atr15m,
    atr15mPct: Number(atr15mPct.toFixed(4)),
    minPct,
    maxPct,
    assetClassLabel,
    volatilityStatus,
    volatilityPassed: volatilityStatus === 'in-range',
    atrSource,
    volatilityRegime,
    atrBaselineRatio,
  };
}

export function buildAssetInvalidationTrigger(params: {
  assetClassLabel: 'Crypto (BTC/USD)' | 'Commodities (XAU/USD)' | 'G10 FX';
  biasBullish: boolean;
  slFormatted: string;
  maxPct: number;
}): string {
  const { assetClassLabel, biasBullish, slFormatted, maxPct } = params;
  if (assetClassLabel === 'Crypto (BTC/USD)') {
    return biasBullish
      ? `BTC Rule: 15m candle close below Sweep/Distal SL (${slFormatted}), OR 15m ATR > ${maxPct.toFixed(3)}% cascade volatility invalidates long.`
      : `BTC Rule: 15m candle close above Sweep/Distal SL (${slFormatted}), OR 15m ATR > ${maxPct.toFixed(3)}% cascade volatility invalidates short.`;
  }
  return biasBullish
    ? `XAU Rule: 15m candle close below Sweep/Distal SL (${slFormatted}), OR 15m ATR > ${maxPct.toFixed(3)}% spike whipsaw invalidates long.`
    : `XAU Rule: 15m candle close above Sweep/Distal SL (${slFormatted}), OR 15m ATR > ${maxPct.toFixed(3)}% spike whipsaw invalidates short.`;
}

export function splitConfirmedClosedBars(
  bars: CandlePoint[],
  timeframe: Timeframe,
  nowMs = Date.now()
): {
  evalBars: CandlePoint[];
  isClosedCandleConfirmed: boolean;
  candleStageLabel: 'Confirmed Close' | 'Forming Preview';
} {
  if (bars.length < 14) {
    return {
      evalBars: bars,
      isClosedCandleConfirmed: false,
      candleStageLabel: 'Forming Preview',
    };
  }
  const lastBar = bars[bars.length - 1];
  const tfMs = TF_DURATION_MS[timeframe] ?? 900_000;
  const ageMs = nowMs - (lastBar?.t ?? 0);
  if (lastBar && lastBar.t > 0 && ageMs >= 0 && ageMs < tfMs * 0.92) {
    return {
      evalBars: bars.slice(0, -1),
      isClosedCandleConfirmed: true,
      candleStageLabel: 'Confirmed Close',
    };
  }
  return {
    evalBars: bars,
    isClosedCandleConfirmed: true,
    candleStageLabel: 'Confirmed Close',
  };
}

const ASSET_NEWS_CURRENCIES: Record<string, EconomicCalendarCurrency[]> = {
  BTCUSD: ['USD'],
  XAUUSD: ['USD'],
};

export function checkMacroNewsBlackout(
  assetId: string,
  events?: EconomicEvent[],
  nowMs = Date.now()
): {
  active: boolean;
  reason?: string;
} {
  if (!Array.isArray(events) || events.length === 0) {
    return { active: false };
  }
  const relevantCurrencies = new Set(
    ASSET_NEWS_CURRENCIES[assetId.toUpperCase()] ?? ['USD']
  );

  for (const ev of events) {
    if (ev.impact !== 'HIGH') continue;
    if (!relevantCurrencies.has(ev.currency)) continue;
    const evTs = ev.isoDate ? Date.parse(ev.isoDate) : NaN;
    if (!Number.isFinite(evTs)) continue;
    const diffMin = (evTs - nowMs) / 60_000;
    if (diffMin >= -20 && diffMin <= 15) {
      const timing =
        diffMin > 1
          ? `in ${Math.round(diffMin)}m`
          : diffMin < -1
            ? `${Math.abs(Math.round(diffMin))}m ago`
            : 'releasing now';
      return {
        active: true,
        reason: `Macro News Guard: High-impact ${ev.currency} "${ev.title}" (${timing}) — erratic sweep risk.`,
      };
    }
  }
  return { active: false };
}

export function detectSwingStructureBias(
  bars: CandlePoint[],
  currentPrice: number
): 'Bullish' | 'Bearish' | 'Ranging' {
  if (bars.length < 8) return 'Ranging';
  const slice = bars.slice(-36);
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = 2; i < slice.length - 1; i++) {
    if (
      slice[i].h >= slice[i - 1].h &&
      slice[i].h > slice[i - 2].h &&
      slice[i].h >= slice[i + 1].h
    ) {
      swingHighs.push(slice[i].h);
    }
    if (
      slice[i].l <= slice[i - 1].l &&
      slice[i].l < slice[i - 2].l &&
      slice[i].l <= slice[i + 1].l
    ) {
      swingLows.push(slice[i].l);
    }
  }

  const lastClose = slice[slice.length - 1]?.c ?? currentPrice;
  const hh = swingHighs.length >= 2 && swingHighs[swingHighs.length - 1] > swingHighs[swingHighs.length - 2];
  const hl = swingLows.length >= 2 && swingLows[swingLows.length - 1] > swingLows[swingLows.length - 2];
  const ll = swingLows.length >= 2 && swingLows[swingLows.length - 1] < swingLows[swingLows.length - 2];
  const lh = swingHighs.length >= 2 && swingHighs[swingHighs.length - 1] < swingHighs[swingHighs.length - 2];

  const latestSwingHigh = swingHighs[swingHighs.length - 1];
  const latestSwingLow = swingLows[swingLows.length - 1];
  const bosUp = typeof latestSwingHigh === 'number' && lastClose > latestSwingHigh;
  const bosDown = typeof latestSwingLow === 'number' && lastClose < latestSwingLow;

  if ((hh && hl) || (bosUp && !ll)) return 'Bullish';
  if ((ll && lh) || (bosDown && !hh)) return 'Bearish';
  return 'Ranging';
}

export function checkLiveSetupValidity(params: {
  direction: 'BUY' | 'SELL';
  currentPrice: number;
  slVal: number;
  tp1Val: number;
}): {
  valid: boolean;
  status: 'active' | 'invalidated' | 'missed';
  reason?: string;
} {
  const { direction, currentPrice, slVal, tp1Val } = params;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { valid: true, status: 'active' };
  }
  if (direction === 'BUY') {
    if (currentPrice <= slVal) {
      return {
        valid: false,
        status: 'invalidated',
        reason: 'Live spot breached Stop Loss — long setup invalidated',
      };
    }
    if (currentPrice >= tp1Val) {
      return {
        valid: false,
        status: 'missed',
        reason: 'Live spot already reached TP1 target — wait for fresh sweep',
      };
    }
  } else {
    if (currentPrice >= slVal) {
      return {
        valid: false,
        status: 'invalidated',
        reason: 'Live spot breached Stop Loss — short setup invalidated',
      };
    }
    if (currentPrice <= tp1Val) {
      return {
        valid: false,
        status: 'missed',
        reason: 'Live spot already reached TP1 target — wait for fresh sweep',
      };
    }
  }
  return { valid: true, status: 'active' };
}

export function evaluateLiveExecutionPosture(params: {
  direction: IctDirection;
  setupArmed: boolean;
  armedBias?: 'BUY' | 'SELL';
  currentPrice: number;
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  atr?: number;
  executionStatus?: 'active' | 'standby' | 'invalidated' | 'missed';
  exactLimitOverride?: number;
  frictionCost?: number;
}): {
  posture: IctExecutionPosture;
  recommendedOrderType: IctRecommendedOrderType;
  limitEntryPriceNum?: number;
  limitRr?: number;
  spotRr?: number;
  chaseProgressPct: number;
  hasRunAway: boolean;
} {
  const {
    direction,
    setupArmed,
    armedBias,
    currentPrice,
    entryLow,
    entryHigh,
    stopLoss,
    tp1,
    tp2,
    atr,
    executionStatus,
    exactLimitOverride,
    frictionCost = 0,
  } = params;

  const bias: 'BUY' | 'SELL' | undefined =
    direction === 'BUY' || direction === 'SELL' ? direction : armedBias;

  const hasValidNums =
    Boolean(bias) &&
    Number.isFinite(currentPrice) &&
    currentPrice > 0 &&
    typeof entryLow === 'number' &&
    typeof entryHigh === 'number' &&
    typeof stopLoss === 'number' &&
    typeof tp2 === 'number' &&
    Number.isFinite(entryLow) &&
    Number.isFinite(entryHigh) &&
    Number.isFinite(stopLoss) &&
    Number.isFinite(tp2);

  if (!hasValidNums || !bias) {
    return {
      posture:
        executionStatus === 'invalidated'
          ? 'invalidated'
          : executionStatus === 'missed'
            ? 'missed'
            : 'standby',
      recommendedOrderType: 'WAIT',
      chaseProgressPct: 0,
      hasRunAway: false,
    };
  }

  const lo = Math.min(entryLow!, entryHigh!);
  const hi = Math.max(entryLow!, entryHigh!);
  // Use canonical exact limit price (FVG 50% CE or S&D Proximal) when provided, else 55% inside zone
  const defaultSweetSpot = bias === 'BUY' ? lo + (hi - lo) * 0.55 : hi - (hi - lo) * 0.55;
  const limitEntryPriceNum =
    typeof exactLimitOverride === 'number' &&
    Number.isFinite(exactLimitOverride) &&
    exactLimitOverride >= lo * 0.99 &&
    exactLimitOverride <= hi * 1.01
      ? exactLimitOverride
      : defaultSweetSpot;

  const safeFriction = Math.max(0, Number.isFinite(frictionCost) ? frictionCost : 0);
  const limitRisk = Math.abs(limitEntryPriceNum - stopLoss!) + safeFriction;
  const limitReward = Math.max(0, Math.abs(tp2! - limitEntryPriceNum) - safeFriction);
  const limitRr =
    limitRisk > 1e-8 ? Number((limitReward / limitRisk).toFixed(2)) : undefined;

  const spotRisk =
    (bias === 'BUY'
      ? Math.max(1e-8, currentPrice - stopLoss!)
      : Math.max(1e-8, stopLoss! - currentPrice)) + safeFriction;
  const spotReward =
    (bias === 'BUY' ? tp2! - currentPrice : currentPrice - tp2!) - safeFriction;
  const spotRr = Number((Math.max(0, spotReward) / spotRisk).toFixed(2));

  const tp1Ref =
    typeof tp1 === 'number' && Number.isFinite(tp1) ? tp1 : tp2!;
  const pathToTp1 =
    bias === 'BUY'
      ? Math.max(1e-8, tp1Ref - limitEntryPriceNum)
      : Math.max(1e-8, limitEntryPriceNum - tp1Ref);
  const traveledBeyondEntry =
    bias === 'BUY'
      ? Math.max(0, currentPrice - hi)
      : Math.max(0, lo - currentPrice);
  const chaseProgressPct = Math.round(
    Math.min(100, Math.max(0, (traveledBeyondEntry / pathToTp1) * 100))
  );

  if (executionStatus === 'invalidated') {
    return {
      posture: 'invalidated',
      recommendedOrderType: 'WAIT',
      limitEntryPriceNum,
      limitRr,
      spotRr,
      chaseProgressPct,
      hasRunAway: false,
    };
  }
  if (executionStatus === 'missed') {
    return {
      posture: 'missed',
      recommendedOrderType: 'WAIT',
      limitEntryPriceNum,
      limitRr,
      spotRr,
      chaseProgressPct: 100,
      hasRunAway: true,
    };
  }

  if (!setupArmed || direction === 'NEUTRAL') {
    return {
      posture: 'standby',
      recommendedOrderType: 'WAIT',
      limitEntryPriceNum,
      limitRr,
      spotRr,
      chaseProgressPct,
      hasRunAway: false,
    };
  }

  if (bias === 'BUY') {
    if (currentPrice <= stopLoss!) {
      return {
        posture: 'invalidated',
        recommendedOrderType: 'WAIT',
        limitEntryPriceNum,
        limitRr,
        spotRr: 0,
        chaseProgressPct,
        hasRunAway: false,
      };
    }
    if (typeof tp1 === 'number' && Number.isFinite(tp1) && currentPrice >= tp1) {
      return {
        posture: 'missed',
        recommendedOrderType: 'WAIT',
        limitEntryPriceNum,
        limitRr,
        spotRr,
        chaseProgressPct: 100,
        hasRunAway: true,
      };
    }
  } else {
    if (currentPrice >= stopLoss!) {
      return {
        posture: 'invalidated',
        recommendedOrderType: 'WAIT',
        limitEntryPriceNum,
        limitRr,
        spotRr: 0,
        chaseProgressPct,
        hasRunAway: false,
      };
    }
    if (typeof tp1 === 'number' && Number.isFinite(tp1) && currentPrice <= tp1) {
      return {
        posture: 'missed',
        recommendedOrderType: 'WAIT',
        limitEntryPriceNum,
        limitRr,
        spotRr,
        chaseProgressPct: 100,
        hasRunAway: true,
      };
    }
  }

  const atrPad = typeof atr === 'number' && Number.isFinite(atr) && atr > 0 ? atr * 0.1 : 0;
  const inZone =
    (currentPrice >= lo - atrPad && currentPrice <= hi + atrPad) ||
    (bias === 'BUY' && currentPrice < lo && currentPrice > stopLoss!) ||
    (bias === 'SELL' && currentPrice > hi && currentPrice < stopLoss!);

  if (inZone) {
    return {
      posture: 'enter_now',
      recommendedOrderType: 'MARKET / ZONE FILL',
      limitEntryPriceNum,
      limitRr,
      spotRr,
      chaseProgressPct: 0,
      hasRunAway: false,
    };
  }

  const atrRunThreshold =
    typeof atr === 'number' && Number.isFinite(atr) && atr > 0
      ? atr * 0.35
      : Infinity;
  const tooFarByAtr = traveledBeyondEntry > atrRunThreshold;
  const tooFarByTp1 = chaseProgressPct > 32;

  if (tooFarByAtr || tooFarByTp1) {
    return {
      posture: 'limit_pullback_only',
      recommendedOrderType: bias === 'BUY' ? 'BUY LIMIT' : 'SELL LIMIT',
      limitEntryPriceNum,
      limitRr,
      spotRr,
      chaseProgressPct,
      hasRunAway: true,
    };
  }

  return {
    posture: 'armed_limit',
    recommendedOrderType: bias === 'BUY' ? 'BUY LIMIT' : 'SELL LIMIT',
    limitEntryPriceNum,
    limitRr,
    spotRr,
    chaseProgressPct,
    hasRunAway: false,
  };
}

function getZonedClockParts(
  date: Date,
  timeZone: string
): { hour: number; minute: number; totalMin: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const rawHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute, totalMin: hour * 60 + minute };
}

function getZonedDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function extractMacroContextFromAssets(assets: MarketAsset[]): MacroIctContext | undefined {
  const dxy = assets.find((a) => a.id.toUpperCase() === 'DXY');
  const riskBench =
    assets.find((a) => a.id.toUpperCase() === 'IXIC' || a.symbol.toUpperCase() === '^IXIC') ??
    assets.find((a) => a.id.toUpperCase() === 'SPX' || a.symbol.toUpperCase() === '^GSPC');

  if (!dxy && !riskBench) return undefined;

  let dxyBias: 'Bullish' | 'Bearish' | 'Ranging' | undefined;
  let dxyBars: CandlePoint[] | undefined;
  if (dxy) {
    const { bars: bars1h } = extractBarsForTf(dxy, ['1h', '4h', '1D'], 8);
    const { bars: barsSmt } = extractBarsForTf(dxy, ['15m', '30m', '1h', '4h'], 8);
    dxyBars = barsSmt.length >= 8 ? barsSmt : bars1h;
    dxyBias = bars1h.length >= 8 ? detectSwingStructureBias(bars1h, dxy.price) : 'Ranging';
    if (dxyBias === 'Ranging') {
      if (dxy.changePercent >= 0.16) dxyBias = 'Bullish';
      else if (dxy.changePercent <= -0.16) dxyBias = 'Bearish';
    }
  }

  let riskBenchBias: 'Bullish' | 'Bearish' | 'Ranging' | undefined;
  let riskBenchBars: CandlePoint[] | undefined;
  if (riskBench) {
    const { bars: bars1h } = extractBarsForTf(riskBench, ['1h', '4h', '1D'], 8);
    const { bars: barsSmt } = extractBarsForTf(riskBench, ['15m', '30m', '1h', '4h'], 8);
    riskBenchBars = barsSmt.length >= 8 ? barsSmt : bars1h;
    riskBenchBias =
      bars1h.length >= 8 ? detectSwingStructureBias(bars1h, riskBench.price) : 'Ranging';
    if (riskBenchBias === 'Ranging') {
      if (riskBench.changePercent >= 0.25) riskBenchBias = 'Bullish';
      else if (riskBench.changePercent <= -0.25) riskBenchBias = 'Bearish';
    }
  }

  return {
    dxyBias,
    dxyChangePct: dxy && Number.isFinite(dxy.changePercent) ? dxy.changePercent : 0,
    dxyPrice: dxy?.price,
    dxyBars,
    riskBenchSymbol: riskBench?.shortName ?? riskBench?.symbol,
    riskBenchBias,
    riskBenchChangePct:
      riskBench && Number.isFinite(riskBench.changePercent) ? riskBench.changePercent : 0,
    riskBenchPrice: riskBench?.price,
    riskBenchBars,
  };
}

function getRecentSwingPair(bars: CandlePoint[]): {
  high1: number;
  high2: number;
  low1: number;
  low2: number;
} | null {
  if (bars.length < 10) return null;
  const slice = bars.slice(-28);
  const mid = Math.floor(slice.length / 2);
  const firstHalf = slice.slice(0, mid);
  const secondHalf = slice.slice(mid);
  if (firstHalf.length < 3 || secondHalf.length < 3) return null;
  return {
    high1: Math.max(...firstHalf.map((b) => b.h)),
    high2: Math.max(...secondHalf.map((b) => b.h)),
    low1: Math.min(...firstHalf.map((b) => b.l)),
    low2: Math.min(...secondHalf.map((b) => b.l)),
  };
}

function detectSmtDivergence(params: {
  assetId: string;
  assetBars: CandlePoint[];
  macroContext?: MacroIctContext;
}): {
  status: 'Bullish SMT' | 'Bearish SMT' | 'No Divergence' | 'Unavailable';
  pair: string;
  detail: string;
} {
  const { assetId, assetBars, macroContext } = params;
  const isGold = assetId.toUpperCase() === 'XAUUSD';
  const pair = isGold ? 'XAU vs DXY (Inverse)' : `BTC vs ${macroContext?.riskBenchSymbol ?? 'NASDAQ'} (Risk)`;

  const assetSwings = getRecentSwingPair(assetBars);
  if (!assetSwings || !macroContext) {
    return { status: 'Unavailable', pair, detail: 'Awaiting macro correlation bars' };
  }

  const assetMadeLL = assetSwings.low2 < assetSwings.low1 * 0.9997;
  const assetMadeHH = assetSwings.high2 > assetSwings.high1 * 1.0003;

  if (isGold) {
    const dxySwings = macroContext.dxyBars ? getRecentSwingPair(macroContext.dxyBars) : null;
    if (!dxySwings) {
      return { status: 'Unavailable', pair, detail: 'Warming DXY structure bars' };
    }
    const dxyMadeHH = dxySwings.high2 > dxySwings.high1 * 1.0002;
    const dxyMadeLL = dxySwings.low2 < dxySwings.low1 * 0.9998;
    // Inverse SMT: XAU makes Lower Low while DXY fails to make Higher High -> Bullish Gold SMT
    if (assetMadeLL && !dxyMadeHH) {
      return {
        status: 'Bullish SMT',
        pair,
        detail: 'XAU swept lower low while DXY printed lower high (inverse accumulation crack)',
      };
    }
    // Inverse SMT: XAU makes Higher High while DXY refuses Lower Low -> Bearish Gold SMT
    if (assetMadeHH && !dxyMadeLL) {
      return {
        status: 'Bearish SMT',
        pair,
        detail: 'XAU pushed higher high while DXY held higher low (inverse distribution crack)',
      };
    }
    return {
      status: 'No Divergence',
      pair,
      detail: 'XAU & DXY swings moving symmetrically — no structural crack',
    };
  }

  // BTC vs NASDAQ / S&P 500 (Positive Correlation SMT)
  const benchSwings = macroContext.riskBenchBars
    ? getRecentSwingPair(macroContext.riskBenchBars)
    : null;
  if (!benchSwings) {
    return { status: 'Unavailable', pair, detail: 'Warming NASDAQ/SPX structure bars' };
  }
  const benchMadeLL = benchSwings.low2 < benchSwings.low1 * 0.9997;
  const benchMadeHH = benchSwings.high2 > benchSwings.high1 * 1.0003;

  if ((assetMadeLL && !benchMadeLL) || (!assetMadeLL && benchMadeLL && assetSwings.low2 > assetSwings.low1)) {
    return {
      status: 'Bullish SMT',
      pair,
      detail: assetMadeLL
        ? `BTC swept lower low while ${macroContext.riskBenchSymbol ?? 'NASDAQ'} held higher low`
        : `BTC held higher low while ${macroContext.riskBenchSymbol ?? 'NASDAQ'} swept lows`,
    };
  }
  if ((assetMadeHH && !benchMadeHH) || (!assetMadeHH && benchMadeHH && assetSwings.high2 < assetSwings.high1)) {
    return {
      status: 'Bearish SMT',
      pair,
      detail: assetMadeHH
        ? `BTC swept higher high while ${macroContext.riskBenchSymbol ?? 'NASDAQ'} failed to confirm`
        : `BTC failed higher high while ${macroContext.riskBenchSymbol ?? 'NASDAQ'} swept highs`,
    };
  }
  return {
    status: 'No Divergence',
    pair,
    detail: `BTC & ${macroContext.riskBenchSymbol ?? 'NASDAQ'} highs/lows aligned`,
  };
}

function computeDisplacementRvol(bars: CandlePoint[], targetIdx: number): number {
  if (targetIdx < 1 || targetIdx >= bars.length) return 1.0;
  const lookbackStart = Math.max(0, targetIdx - 20);
  const prior = bars.slice(lookbackStart, targetIdx);
  if (prior.length < 4) return 1.2;

  const cur = bars[targetIdx];
  const validVols = prior.map((b) => b.v ?? 0).filter((v) => Number.isFinite(v) && v > 0);
  if (validVols.length >= 6 && typeof cur.v === 'number' && cur.v > 0) {
    const avgVol = validVols.reduce((s, v) => s + v, 0) / validVols.length;
    if (avgVol > 0) {
      return Number(Math.min(5, cur.v / avgVol).toFixed(2));
    }
  }
  // Fallback Effort Proxy when tick volume is omitted by FX/Gold feed: real body expansion vs 20-bar avg body
  const avgBody =
    prior.reduce((s, b) => s + Math.abs(b.c - b.o), 0) / Math.max(1, prior.length);
  const curBody = Math.abs(cur.c - cur.o);
  if (avgBody > 1e-8) {
    return Number(Math.min(5, curBody / avgBody).toFixed(2));
  }
  return 1.2;
}

function resolvePureIctKillzoneLabel(
  refTsMs = Date.now(),
  assetId = 'XAUUSD'
): { label: string; inKillzone: boolean } {
  const now = new Date(refTsMs);
  const london = getZonedClockParts(now, 'Europe/London');
  const ny = getZonedClockParts(now, 'America/New_York');
  const isBtc = assetId.toUpperCase() === 'BTCUSD';

  if (isBtc) {
    // BTC/USD Institutional Windows (NY EST): London Open 03:00–06:00, NY ETF/Futures Open 08:00–12:00, NY PM 13:30–16:00
    if (ny.totalMin >= 8 * 60 && ny.totalMin < 12 * 60) {
      return {
        label:
          ny.totalMin < 10 * 60 + 30
            ? 'BTC NY ETF / Futures Open Killzone'
            : 'BTC NY Institutional Flow',
        inKillzone: true,
      };
    }
    if (ny.totalMin >= 3 * 60 && ny.totalMin < 6 * 60) {
      return { label: 'BTC London Open Killzone', inKillzone: true };
    }
    if (ny.totalMin >= 13 * 60 + 30 && ny.totalMin < 16 * 60) {
      return { label: 'BTC NY PM Close Window', inKillzone: true };
    }
    if (ny.totalMin >= 19 * 60 || ny.totalMin < 3 * 60) {
      return { label: 'BTC Asia Low-Liquidity Range', inKillzone: false };
    }
    return { label: 'BTC Inter-Session Consolidation', inKillzone: false };
  }

  // XAU/USD Gold Institutional Windows (NY EST): London Judas 02:00–05:00, NY AM COMEX 08:00–11:15, NY PM Silver Bullet 13:30–16:00
  if (ny.totalMin >= 8 * 60 && ny.totalMin < 11 * 60 + 15) {
    const isLondonOverlap = london.totalMin >= 12 * 60 && london.totalMin < 17 * 60;
    return {
      label: isLondonOverlap ? 'XAU NY AM / London Overlap' : 'XAU NY AM COMEX Killzone',
      inKillzone: true,
    };
  }
  if (ny.totalMin >= 2 * 60 && ny.totalMin < 5 * 60 + 15) {
    return { label: 'XAU London Judas Killzone', inKillzone: true };
  }
  if (ny.totalMin >= 13 * 60 + 30 && ny.totalMin < 16 * 60) {
    return { label: 'XAU NY PM Silver Bullet', inKillzone: true };
  }
  if (ny.totalMin >= 19 * 60 || ny.totalMin < 2 * 60) {
    return { label: 'XAU Asia Accumulation Range', inKillzone: false };
  }
  return { label: 'XAU Inter-Session Lunch', inKillzone: false };
}

interface CalendarSessionAnchors {
  pdh?: number;
  pdl?: number;
  midnightOpen?: number;
  ny0830Open?: number;
  asianHigh?: number;
  asianLow?: number;
  asianRangeAtrRatio?: number;
  po3Phase: 'Accumulation' | 'Manipulation' | 'Distribution';
}

function extractCalendarSessionAnchors(
  asset: MarketAsset,
  atr15m: number,
  refClockMs = Date.now()
): CalendarSessionAnchors {
  const nyNow = getZonedClockParts(new Date(refClockMs), 'America/New_York');
  const todayKey = getZonedDateKey(new Date(refClockMs), 'America/New_York');

  const po3Phase: 'Accumulation' | 'Manipulation' | 'Distribution' =
    nyNow.hour >= 19 || nyNow.hour < 0
      ? 'Accumulation'
      : (nyNow.hour >= 0 && nyNow.hour < 5) ||
          (nyNow.totalMin >= 8 * 60 && nyNow.totalMin < 9 * 60 + 45)
        ? 'Manipulation'
        : 'Distribution';

  const { bars: intradayBars } = extractBarsForTf(asset, ['15m', '30m', '1h'], 8);
  const { bars: bars1h } = extractBarsForTf(asset, ['1h', '4h', '1D'], 8);
  const combined = intradayBars.length >= 8 ? intradayBars : bars1h;

  let midnightOpen: number | undefined;
  let ny0830Open: number | undefined;
  let asianHigh: number | undefined;
  let asianLow: number | undefined;

  if (combined.length > 0) {
    const todayBars = combined.filter(
      (b) => b.t > 0 && getZonedDateKey(new Date(b.t), 'America/New_York') === todayKey
    );
    if (todayBars.length > 0) {
      midnightOpen = todayBars[0].o;
      const bar0830 = todayBars.find(
        (b) => getZonedClockParts(new Date(b.t), 'America/New_York').totalMin >= 8 * 60 + 30
      );
      if (bar0830) ny0830Open = bar0830.o;
    }

    // Strict Asian Accumulation Range (19:00–00:00 NY)
    const asianBars = combined.filter((b) => {
      if (!b.t || !Number.isFinite(b.t)) return false;
      const ny = getZonedClockParts(new Date(b.t), 'America/New_York');
      return ny.hour >= 19 || ny.hour < 1;
    });
    if (asianBars.length >= 2) {
      const recentAsia = asianBars.slice(-24);
      asianHigh = Math.max(...recentAsia.map((b) => b.h));
      asianLow = Math.min(...recentAsia.map((b) => b.l));
    }
  }

  // Exact Calendar Previous Day High / Low (NY date immediately prior to todayKey)
  let pdh: number | undefined;
  let pdl: number | undefined;
  const pdSource = bars1h.length >= 12 ? bars1h : combined;
  if (pdSource.length > 0) {
    const priorDayKeys = Array.from(
      new Set(
        pdSource
          .filter((b) => b.t > 0)
          .map((b) => getZonedDateKey(new Date(b.t), 'America/New_York'))
          .filter((k) => k < todayKey)
      )
    ).sort();
    const prevDateKey = priorDayKeys[priorDayKeys.length - 1];
    if (prevDateKey) {
      const prevDayBars = pdSource.filter(
        (b) => b.t > 0 && getZonedDateKey(new Date(b.t), 'America/New_York') === prevDateKey
      );
      if (prevDayBars.length >= 2) {
        pdh = Math.max(...prevDayBars.map((b) => b.h));
        pdl = Math.min(...prevDayBars.map((b) => b.l));
      }
    }
  }

  const asianRangeAtrRatio =
    typeof asianHigh === 'number' && typeof asianLow === 'number' && atr15m > 0
      ? Number(((asianHigh - asianLow) / atr15m).toFixed(2))
      : undefined;

  return {
    pdh,
    pdl,
    midnightOpen,
    ny0830Open,
    asianHigh,
    asianLow,
    asianRangeAtrRatio,
    po3Phase,
  };
}

function analyzePureIctHtf(
  asset: MarketAsset,
  currentPrice: number,
  sessionAnchors?: CalendarSessionAnchors
): {
  bias: 'Bullish' | 'Bearish' | 'Ranging';
  bullDemandAligned: boolean;
  bearSupplyAligned: boolean;
  pdh: number;
  pdl: number;
  pool1hHigh: number;
  pool1hLow: number;
  external4hHigh: number;
  external4hLow: number;
} {
  const { bars: bars4h } = extractBarsForTf(asset, ['4h', '1D'], 6);
  const { bars: bars1h } = extractBarsForTf(asset, ['1h', '4h', '1D'], 6);

  const atr4h = computeAtr(bars4h, 14);
  const atr1h = computeAtr(bars1h, 14);
  const imb4h = findUnmitigatedFvgAndOb(bars4h, atr4h, 24);
  const imb1h = findUnmitigatedFvgAndOb(bars1h, atr1h, 24);

  const bias4h = detectSwingStructureBias(bars4h, currentPrice);
  const bias1h = detectSwingStructureBias(bars1h, currentPrice);

  let bias: 'Bullish' | 'Bearish' | 'Ranging' = 'Ranging';
  if (bias4h !== 'Ranging' && (bias1h === bias4h || bias1h === 'Ranging')) {
    bias = bias4h;
  } else if (bias1h !== 'Ranging' && bias4h === 'Ranging') {
    bias = bias1h;
  } else if (bias1h !== 'Ranging') {
    bias = bias1h;
  } else if (imb4h.bullFvg && !imb4h.bearFvg) {
    bias = 'Bullish';
  } else if (imb4h.bearFvg && !imb4h.bullFvg) {
    bias = 'Bearish';
  }

  const external4hHigh = bars4h.length > 0 ? Math.max(...bars4h.map((b) => b.h), currentPrice) : currentPrice;
  const external4hLow = bars4h.length > 0 ? Math.min(...bars4h.map((b) => b.l), currentPrice) : currentPrice;
  const pool1hHigh = bars1h.length > 0 ? Math.max(...bars1h.slice(-24).map((b) => b.h), currentPrice) : currentPrice;
  const pool1hLow = bars1h.length > 0 ? Math.min(...bars1h.slice(-24).map((b) => b.l), currentPrice) : currentPrice;

  // Prefer exact calendar NY Previous Day High/Low over rolling 35h fallback
  const sessionSlice1h = bars1h.slice(-36, -1);
  const fallbackPdh =
    sessionSlice1h.length > 0 ? Math.max(...sessionSlice1h.map((b) => b.h), pool1hHigh) : pool1hHigh;
  const fallbackPdl =
    sessionSlice1h.length > 0 ? Math.min(...sessionSlice1h.map((b) => b.l), pool1hLow) : pool1hLow;
  const pdh = typeof sessionAnchors?.pdh === 'number' ? sessionAnchors.pdh : fallbackPdh;
  const pdl = typeof sessionAnchors?.pdl === 'number' ? sessionAnchors.pdl : fallbackPdl;

  // 1H EMA-12 / EMA-26 structural trend confirmation when swing pivots look mixed
  if (bias === 'Ranging' && bars1h.length >= 24) {
    const closes = bars1h.map((b) => b.c);
    const ema = (vals: number[], period: number) => {
      const k = 2 / (period + 1);
      let e = vals[0];
      for (let idx = 1; idx < vals.length; idx++) e = vals[idx] * k + e * (1 - k);
      return e;
    };
    const ema12 = ema(closes.slice(-30), 12);
    const ema26 = ema(closes.slice(-40), 26);
    if (currentPrice > ema12 && ema12 > ema26 * 1.0008) bias = 'Bullish';
    else if (currentPrice < ema12 && ema12 < ema26 * 0.9992) bias = 'Bearish';
  }

  const bullDemandZone = imb4h.bullFvg || imb4h.bullOb || imb1h.bullFvg || imb1h.bullOb;
  const bearSupplyZone = imb4h.bearFvg || imb4h.bearOb || imb1h.bearFvg || imb1h.bearOb;

  const bullDemandAligned = Boolean(
    bullDemandZone &&
      currentPrice >= bullDemandZone.low - atr1h * 0.8 &&
      currentPrice <= bullDemandZone.high + atr1h * 1.6
  );
  const bearSupplyAligned = Boolean(
    bearSupplyZone &&
      currentPrice <= bearSupplyZone.high + atr1h * 0.8 &&
      currentPrice >= bearSupplyZone.low - atr1h * 1.6
  );

  return {
    bias,
    bullDemandAligned,
    bearSupplyAligned,
    pdh,
    pdl,
    pool1hHigh,
    pool1hLow,
    external4hHigh,
    external4hLow,
  };
}

function buildPlacementSummary(params: {
  direction: IctDirection;
  expectedBias: 'BUY' | 'SELL' | 'NEUTRAL';
  posture: IctExecutionPosture;
  limitEntryPriceNum?: number;
  stopLossNum?: number;
  tp1Num?: number;
  tp2Num?: number;
  asset: MarketAsset;
  waitReason?: string;
}): string {
  const {
    direction,
    expectedBias,
    posture,
    limitEntryPriceNum,
    stopLossNum,
    tp1Num,
    tp2Num,
    asset,
    waitReason,
  } = params;
  if (direction === 'NEUTRAL') {
    const lean =
      expectedBias === 'BUY'
        ? 'BULLISH LEAN'
        : expectedBias === 'SELL'
          ? 'BEARISH LEAN'
          : 'FLAT';
    const refPx =
      typeof limitEntryPriceNum === 'number'
        ? ` @ ${formatPriceWithAsset(limitEntryPriceNum, asset)}`
        : '';
    return `NO ORDER (${lean}${refPx}) — ${waitReason ?? 'Await Sweep + Displacement MSS + Fresh FVG'}`;
  }

  const slStr = typeof stopLossNum === 'number' ? formatPriceWithAsset(stopLossNum, asset) : '—';
  const tp1Str = typeof tp1Num === 'number' ? formatPriceWithAsset(tp1Num, asset) : '—';
  const tp2Str = typeof tp2Num === 'number' ? formatPriceWithAsset(tp2Num, asset) : '—';
  const limStr =
    typeof limitEntryPriceNum === 'number'
      ? formatPriceWithAsset(limitEntryPriceNum, asset)
      : 'Zone';

  if (posture === 'enter_now') {
    return `${direction} MARKET (IN ZONE) · SL ${slStr} · TP1 ${tp1Str} (BE) · TP2 ${tp2Str}`;
  }
  if (posture === 'limit_pullback_only') {
    return `${direction} LIMIT PULLBACK @ ${limStr} (NO CHASE) · SL ${slStr} · TP1 ${tp1Str} · TP2 ${tp2Str}`;
  }
  return `${direction} LIMIT @ ${limStr} · SL ${slStr} · TP1 ${tp1Str} (BE) · TP2 ${tp2Str}`;
}

function computePureIctSignalForXauBtc(
  asset: MarketAsset,
  preferredTimeframe?: Timeframe,
  enforceVolatilityFilter = true,
  economicEvents?: EconomicEvent[],
  enforceNewsBlackout = true,
  macroContext?: MacroIctContext
): IctSignalAnalysis {
  const candidates: Timeframe[] = preferredTimeframe
    ? [preferredTimeframe, ...ICT_TIMEFRAME_PRIORITY.filter((tf) => tf !== preferredTimeframe)]
    : ICT_TIMEFRAME_PRIORITY;

  const { bars: rawBars, timeframe, isRealOhlc } = extractBarsForTf(asset, candidates, 12);
  if (!isRealOhlc || rawBars.length < 12) {
    const { label: killzone } = resolvePureIctKillzoneLabel(Date.now(), asset.id);
    const atr15mMetrics = compute15mAtrMetrics(asset, asset.price);
    const warmingPrice = formatPriceWithAsset(asset.price, asset);
    return {
      assetId: asset.id,
      symbol: asset.symbol,
      name: asset.shortName,
      direction: 'NEUTRAL',
      biasLabel: 'FLAT',
      biasVerdict: 'NEUTRAL / RANGE',
      clearanceSummary: '0/5 Gates · Warming real OHLCV candles',
      clearanceGates: [
        { id: 'htf', label: 'HTF Bias', passed: false, state: 'WARN', detail: 'Warming bars' },
        { id: 'kz', label: 'Killzone', passed: false, state: 'WARN', detail: killzone },
        { id: 'sweep', label: 'Liquidity Sweep', passed: false, state: 'BLOCK', detail: 'Awaiting OHLC' },
        { id: 'mss', label: 'Displacement MSS', passed: false, state: 'BLOCK', detail: 'Pending' },
        { id: 'zone', label: 'FVG / OTE & Risk', passed: false, state: 'BLOCK', detail: 'Pending' },
      ],
      confidence: 20,
      setupName: 'WAIT · Warming Real OHLCV Bars',
      pdZone: 'Equilibrium',
      entryZone: warmingPrice,
      stopLoss: warmingPrice,
      targetPrice: warmingPrice,
      riskReward: 'WAIT',
      triggers: ['Awaiting real 15m/5m OHLC bars'],
      timeframe,
      currentPrice: asset.price,
      decimals: asset.decimals,
      currencyPrefix: asset.currencyPrefix,
      unitSuffix: asset.unitSuffix,
      evaluatedAt: asset.updatedAtEpoch ?? Date.now(),
      htfBias: 'Ranging',
      killzone,
      sessionLabel: killzone,
      assetClassLabel: atr15mMetrics.assetClassLabel,
      volatilityThresholdPct: atr15mMetrics.minPct,
      volatilityMaxPct: atr15mMetrics.maxPct,
      volatilityStatus: 'warming',
      volatilityPassed: false,
      atrSource: 'warming',
      executionStatus: 'standby',
      executionPosture: 'standby',
      recommendedOrderType: 'WAIT',
      candleStageLabel: 'Awaiting Real OHLC',
      isClosedCandleConfirmed: false,
      isRealOhlc: false,
      setupGrade: 'WAIT',
      isAPlusSetup: false,
      placementSummary: 'NO ORDER (FLAT) — Warming real OHLCV candles',
      invalidationTrigger: 'Hold flat until real OHLC candlestick bars finish syncing.',
      invalidationNote: 'Awaiting verified multi-bar OHLC data.',
    };
  }

  const refClockMs =
    typeof asset.updatedAtEpoch === 'number' && asset.updatedAtEpoch > 0
      ? asset.updatedAtEpoch
      : rawBars[rawBars.length - 1]?.t ?? Date.now();

  const {
    evalBars: closedOrLiveBars,
    isClosedCandleConfirmed,
    candleStageLabel,
  } = splitConfirmedClosedBars(rawBars, timeframe, refClockMs);
  const bars = closedOrLiveBars.slice(-56);
  const n = bars.length;

  const currentPrice = asset.price > 0 ? asset.price : bars[n - 1]?.c ?? 0;
  const rangeHigh = Math.max(...bars.map((b) => b.h), currentPrice);
  const rangeLow = Math.min(...bars.map((b) => b.l), currentPrice);
  const rangeSpan = Math.max(1e-6, rangeHigh - rangeLow);

  const posInRange = (currentPrice - rangeLow) / rangeSpan;
  const pdZone: IctSignalAnalysis['pdZone'] =
    posInRange <= 0.44 ? 'Discount' : posInRange >= 0.56 ? 'Premium' : 'Equilibrium';

  // Prior structural fractal swings (excluding recent 14-bar sweep window)
  const sweepWindowLen = Math.min(14, Math.max(5, Math.floor(n * 0.25)));
  const priorEndIdx = Math.max(5, n - sweepWindowLen);
  const priorSlice = bars.slice(0, priorEndIdx);

  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  for (let i = 2; i < priorSlice.length - 2; i++) {
    if (
      priorSlice[i].h >= priorSlice[i - 1].h &&
      priorSlice[i].h > priorSlice[i - 2].h &&
      priorSlice[i].h >= priorSlice[i + 1].h &&
      priorSlice[i].h > priorSlice[i + 2].h
    ) {
      pivotHighs.push(priorSlice[i].h);
    }
    if (
      priorSlice[i].l <= priorSlice[i - 1].l &&
      priorSlice[i].l < priorSlice[i - 2].l &&
      priorSlice[i].l <= priorSlice[i + 1].l &&
      priorSlice[i].l < priorSlice[i + 2].l
    ) {
      pivotLows.push(priorSlice[i].l);
    }
  }
  // Fallback to 3-bar fractals if 5-bar fractals empty
  if (pivotHighs.length === 0 || pivotLows.length === 0) {
    for (let i = 1; i < priorSlice.length - 1; i++) {
      if (pivotHighs.length === 0 && priorSlice[i].h > priorSlice[i - 1].h && priorSlice[i].h > priorSlice[i + 1].h) {
        pivotHighs.push(priorSlice[i].h);
      }
      if (pivotLows.length === 0 && priorSlice[i].l < priorSlice[i - 1].l && priorSlice[i].l < priorSlice[i + 1].l) {
        pivotLows.push(priorSlice[i].l);
      }
    }
  }

  const atr = computeAtr(bars, 14);
  const atr15mMetrics = compute15mAtrMetrics(asset, currentPrice);
  const atrPct = atr15mMetrics.atr15mPct;
  const volatilityThresholdPct = atr15mMetrics.minPct;
  const volatilityMaxPct = atr15mMetrics.maxPct;
  const volatilityStatus = atr15mMetrics.volatilityStatus;
  const volatilityPassed = atr15mMetrics.volatilityPassed;
  const volatilityRegime = atr15mMetrics.volatilityRegime;
  const atrBaselineRatio = atr15mMetrics.atrBaselineRatio;

  // Weighted Liquidity Pool Clustering: detect Equal Highs (EQH) / Equal Lows (EQL) within 0.15 × ATR
  const eqTol = Math.max(atr * 0.15, currentPrice * 0.00035);
  let eqhLevel: number | undefined;
  let eqlLevel: number | undefined;
  for (let i = pivotHighs.length - 1; i >= 1; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (Math.abs(pivotHighs[i] - pivotHighs[j]) <= eqTol) {
        eqhLevel = Math.max(pivotHighs[i], pivotHighs[j]);
        break;
      }
    }
    if (eqhLevel !== undefined) break;
  }
  for (let i = pivotLows.length - 1; i >= 1; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (Math.abs(pivotLows[i] - pivotLows[j]) <= eqTol) {
        eqlLevel = Math.min(pivotLows[i], pivotLows[j]);
        break;
      }
    }
    if (eqlLevel !== undefined) break;
  }

  const priorSwingHigh =
    pivotHighs.length > 0 ? pivotHighs[pivotHighs.length - 1] : Math.max(...priorSlice.map((b) => b.h));
  const priorSwingLow =
    pivotLows.length > 0 ? pivotLows[pivotLows.length - 1] : Math.min(...priorSlice.map((b) => b.l));

  // Step 1: Liquidity Sweep + Reclaim (SSL or BSL, including EQH/EQL pools)
  const sslSweepTarget = eqlLevel !== undefined ? Math.min(priorSwingLow, eqlLevel) : priorSwingLow;
  const bslSweepTarget = eqhLevel !== undefined ? Math.max(priorSwingHigh, eqhLevel) : priorSwingHigh;

  let sslSweepIdx = -1;
  let bslSweepIdx = -1;
  let sslSweepLow = sslSweepTarget;
  let bslSweepHigh = bslSweepTarget;

  for (let i = priorEndIdx; i < n; i++) {
    const b = bars[i];
    const prevB = i > 0 ? bars[i - 1] : b;
    if (
      (b.l < priorSwingLow && b.c > priorSwingLow) ||
      (prevB.l < priorSwingLow && b.c > priorSwingLow && b.c > b.o) ||
      (eqlLevel !== undefined && b.l < eqlLevel && b.c > eqlLevel)
    ) {
      sslSweepIdx = i;
      sslSweepLow = Math.min(sslSweepLow, b.l, prevB.l);
    }
    if (
      (b.h > priorSwingHigh && b.c < priorSwingHigh) ||
      (prevB.h > priorSwingHigh && b.c < priorSwingHigh && b.c < b.o) ||
      (eqhLevel !== undefined && b.h > eqhLevel && b.c < eqhLevel)
    ) {
      bslSweepIdx = i;
      bslSweepHigh = Math.max(bslSweepHigh, b.h, prevB.h);
    }
  }

  const simultaneousDualSweep =
    sslSweepIdx >= 0 && bslSweepIdx >= 0 && Math.abs(sslSweepIdx - bslSweepIdx) <= 4;
  const sslSweptStrict =
    sslSweepIdx >= 0 && !simultaneousDualSweep && (bslSweepIdx < 0 || sslSweepIdx > bslSweepIdx);
  const bslSweptStrict =
    bslSweepIdx >= 0 && !simultaneousDualSweep && (sslSweepIdx < 0 || bslSweepIdx > sslSweepIdx);
  const dualSideSwept = simultaneousDualSweep;

  const eqlSwept = Boolean(eqlLevel !== undefined && sslSweptStrict && sslSweepLow <= eqlLevel);
  const eqhSwept = Boolean(eqhLevel !== undefined && bslSweptStrict && bslSweepHigh >= eqhLevel);

  // Step 2: Volume / Effort-Confirmed Displacement + MSS Body Close strictly AFTER Sweep
  let bullMss = false;
  let bullMssIdx = -1;
  let bullDisplacementRvol = 1.0;
  let mssImpulseHigh = rangeHigh;
  if (sslSweptStrict) {
    const preLookback = bars.slice(Math.max(0, sslSweepIdx - 8), sslSweepIdx + 1);
    const microHigh = preLookback.length > 0 ? Math.max(...preLookback.map((b) => b.h)) : priorSwingHigh;
    const sweepSlice = bars.slice(sslSweepIdx);
    mssImpulseHigh = Math.max(...sweepSlice.map((b) => b.h));
    for (let k = sslSweepIdx + 1; k < n; k++) {
      const cur = bars[k];
      const prev = bars[k - 1];
      const curSpan = Math.max(1e-6, cur.h - cur.l);
      const curStrongClose = (cur.c - cur.l) / curSpan >= 0.62;
      const twoBarBullPush = cur.c > prev.o ? cur.c - prev.o : 0;
      const rvol = Math.max(computeDisplacementRvol(bars, k), computeDisplacementRvol(bars, k - 1));
      const disp =
        ((cur.c > cur.o && cur.c - cur.o >= atr * 0.62 && curStrongClose) ||
          (prev.c > prev.o && prev.c - prev.o >= atr * 0.65) ||
          twoBarBullPush >= atr * 0.85) &&
        rvol >= 1.15;
      if (cur.c > microHigh && disp) {
        bullMss = true;
        bullMssIdx = k;
        bullDisplacementRvol = rvol;
        break;
      }
    }
  }

  let bearMss = false;
  let bearMssIdx = -1;
  let bearDisplacementRvol = 1.0;
  let mssImpulseLow = rangeLow;
  if (bslSweptStrict) {
    const preLookback = bars.slice(Math.max(0, bslSweepIdx - 8), bslSweepIdx + 1);
    const microLow = preLookback.length > 0 ? Math.min(...preLookback.map((b) => b.l)) : priorSwingLow;
    const sweepSlice = bars.slice(bslSweepIdx);
    mssImpulseLow = Math.min(...sweepSlice.map((b) => b.l));
    for (let k = bslSweepIdx + 1; k < n; k++) {
      const cur = bars[k];
      const prev = bars[k - 1];
      const curSpan = Math.max(1e-6, cur.h - cur.l);
      const curStrongClose = (cur.c - cur.l) / curSpan <= 0.38;
      const twoBarBearPush = prev.o > cur.c ? prev.o - cur.c : 0;
      const rvol = Math.max(computeDisplacementRvol(bars, k), computeDisplacementRvol(bars, k - 1));
      const disp =
        ((cur.c < cur.o && cur.o - cur.c >= atr * 0.62 && curStrongClose) ||
          (prev.c < prev.o && prev.o - prev.c >= atr * 0.65) ||
          twoBarBearPush >= atr * 0.85) &&
        rvol >= 1.15;
      if (cur.c < microLow && disp) {
        bearMss = true;
        bearMssIdx = k;
        bearDisplacementRvol = rvol;
        break;
      }
    }
  }

  // Dealing-Range OTE (0.618–0.786) strictly anchored on Sweep -> MSS impulse leg
  const bullLegLow = sslSweptStrict ? sslSweepLow : priorSwingLow;
  const bullLegHigh =
    sslSweptStrict && mssImpulseHigh > bullLegLow
      ? mssImpulseHigh
      : Math.max(...bars.slice(-24).map((b) => b.h));
  const bullLegSpan = Math.max(1e-6, bullLegHigh - bullLegLow);
  const bullOteLow = bullLegHigh - bullLegSpan * 0.786;
  const bullOteHigh = bullLegHigh - bullLegSpan * 0.618;

  const bearLegHigh = bslSweptStrict ? bslSweepHigh : priorSwingHigh;
  const bearLegLow =
    bslSweptStrict && mssImpulseLow < bearLegHigh
      ? mssImpulseLow
      : Math.min(...bars.slice(-24).map((b) => b.l));
  const bearLegSpan = Math.max(1e-6, bearLegHigh - bearLegLow);
  const bearOteLow = bearLegLow + bearLegSpan * 0.618;
  const bearOteHigh = bearLegLow + bearLegSpan * 0.786;

  const inBullOte = currentPrice >= bullOteLow && currentPrice <= bullOteHigh;
  const inBearOte = currentPrice >= bearOteLow && currentPrice <= bearOteHigh;

  // Step 3: Canonical Fresh FVG / OB formed strictly at/after the Sweep leg
  const bullMinTs = sslSweptStrict ? bars[Math.max(0, sslSweepIdx - 1)].t : 0;
  const bearMinTs = bslSweptStrict ? bars[Math.max(0, bslSweepIdx - 1)].t : 0;
  const imbBull = findUnmitigatedFvgAndOb(bars, atr, 28, 0.16, 0.68, bullMinTs);
  const imbBear = findUnmitigatedFvgAndOb(bars, atr, 28, 0.16, 0.68, bearMinTs);

  const bullAnchor = imbBull.bullFvg ?? imbBull.bullOb;
  const bearAnchor = imbBear.bearFvg ?? imbBear.bearOb;

  const bullDiscountValid = Boolean(
    bullAnchor && (bullAnchor.ceMid <= bullLegLow + bullLegSpan * 0.62 || pdZone === 'Discount')
  );
  const bearPremiumValid = Boolean(
    bearAnchor && (bearAnchor.ceMid >= bearLegHigh - bearLegSpan * 0.62 || pdZone === 'Premium')
  );

  const nearBullFvg = Boolean(
    imbBull.bullFvg &&
      currentPrice >= imbBull.bullFvg.low - atr * 0.5 &&
      currentPrice <= imbBull.bullFvg.high + atr * 1.15
  );
  const nearBullOb = Boolean(
    imbBull.bullOb &&
      currentPrice >= imbBull.bullOb.low - atr * 0.5 &&
      currentPrice <= imbBull.bullOb.high + atr * 1.15
  );
  const nearBearFvg = Boolean(
    imbBear.bearFvg &&
      currentPrice <= imbBear.bearFvg.high + atr * 0.5 &&
      currentPrice >= imbBear.bearFvg.low - atr * 1.15
  );
  const nearBearOb = Boolean(
    imbBear.bearOb &&
      currentPrice <= imbBear.bearOb.high + atr * 0.5 &&
      currentPrice >= imbBear.bearOb.low - atr * 1.15
  );

  // Calendar Session Anchors (Exact PDH/PDL, NY 00:00 Midnight Open, NY 08:30 Open, Asian Range, PO3)
  const isGold = asset.id.toUpperCase() === 'XAUUSD';
  const isBtc = asset.id.toUpperCase() === 'BTCUSD';
  const sessionAnchors = extractCalendarSessionAnchors(asset, atr15mMetrics.atr15m, refClockMs);
  const htf = analyzePureIctHtf(asset, currentPrice, sessionAnchors);
  const asianRange = sessionAnchors;

  const asianLowSwept = Boolean(
    typeof asianRange.asianLow === 'number' && sslSweptStrict && sslSweepLow <= asianRange.asianLow
  );
  const asianHighSwept = Boolean(
    typeof asianRange.asianHigh === 'number' && bslSweptStrict && bslSweepHigh >= asianRange.asianHigh
  );
  const pdlSwept = Boolean(
    typeof sessionAnchors.pdl === 'number' && sslSweptStrict && sslSweepLow <= sessionAnchors.pdl
  );
  const pdhSwept = Boolean(
    typeof sessionAnchors.pdh === 'number' && bslSweptStrict && bslSweepHigh >= sessionAnchors.pdh
  );

  // BTC/USD Psychological Round-Number Liquidity Pools ($1,000 & $500 key magnets)
  let roundPoolNote: string | undefined;
  let btcRoundPoolSwept = false;
  let btcSweptPsychLabel: string | undefined;
  if (isBtc && currentPrice > 0) {
    const step = currentPrice >= 20_000 ? 1000 : 500;
    const nearestDown = Math.floor(currentPrice / step) * step;
    const nearestUp = Math.ceil(currentPrice / step) * step;
    if (sslSweptStrict && sslSweepLow <= nearestDown && currentPrice > nearestDown) {
      btcRoundPoolSwept = true;
      btcSweptPsychLabel = `BTC $${nearestDown.toLocaleString('en-US')} Psych SSL`;
      roundPoolNote = `BTC Swept $${nearestDown.toLocaleString('en-US')} Psychological SSL Pool`;
    } else if (bslSweptStrict && bslSweepHigh >= nearestUp && currentPrice < nearestUp) {
      btcRoundPoolSwept = true;
      btcSweptPsychLabel = `BTC $${nearestUp.toLocaleString('en-US')} Psych BSL`;
      roundPoolNote = `BTC Swept $${nearestUp.toLocaleString('en-US')} Psychological BSL Pool`;
    } else {
      const distUpPct = ((nearestUp - currentPrice) / currentPrice) * 100;
      const distDnPct = ((currentPrice - nearestDown) / currentPrice) * 100;
      if (distUpPct <= 0.85) {
        roundPoolNote = `Near $${nearestUp.toLocaleString('en-US')} Psych BSL Magnet (${distUpPct.toFixed(2)}% away)`;
      } else if (distDnPct <= 0.85) {
        roundPoolNote = `Near $${nearestDown.toLocaleString('en-US')} Psych SSL Magnet (${distDnPct.toFixed(2)}% away)`;
      }
    }
  }

  // Structural SMT (Smart Money Technique) Divergence: XAU vs DXY (Inverse), BTC vs NASDAQ/SPX (Risk)
  const smt = detectSmtDivergence({
    assetId: asset.id,
    assetBars: bars,
    macroContext,
  });
  const smtBullBonus = smt.status === 'Bullish SMT' ? 8 : 0;
  const smtBearBonus = smt.status === 'Bearish SMT' ? 8 : 0;

  // DXY Inverse Macro Confluence specifically for Gold (XAU/USD)
  let dxyConfluenceNote: string | undefined;
  let dxyBullBonus = 0;
  let dxyBearBonus = 0;
  if (isGold && macroContext?.dxyBias) {
    const chg = macroContext.dxyChangePct ?? 0;
    if (macroContext.dxyBias === 'Bearish' || chg <= -0.15) {
      dxyBullBonus = 6;
      dxyBearBonus = chg <= -0.3 ? -6 : 0;
      dxyConfluenceNote = `DXY Inverse Tailwind (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%) supports Gold Longs`;
    } else if (macroContext.dxyBias === 'Bullish' || chg >= 0.15) {
      dxyBearBonus = 6;
      dxyBullBonus = chg >= 0.3 ? -6 : 0;
      dxyConfluenceNote = `DXY Strength (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%) supports Gold Shorts / Headwind for Longs`;
    } else {
      dxyConfluenceNote = `DXY Flat (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%) — Neutral USD macro bias`;
    }
  }

  const activeSweepTs = sslSweptStrict
    ? bars[sslSweepIdx]?.t
    : bslSweptStrict
      ? bars[bslSweepIdx]?.t
      : undefined;
  const liveKz = resolvePureIctKillzoneLabel(refClockMs, asset.id);
  const sweepKz = activeSweepTs ? resolvePureIctKillzoneLabel(activeSweepTs, asset.id) : liveKz;
  const killzone = sweepKz.inKillzone ? sweepKz.label : liveKz.label;
  const inKillzone = sweepKz.inKillzone || liveKz.inKillzone;

  const highWeightBullPool = pdlSwept || asianLowSwept || eqlSwept || btcRoundPoolSwept;
  const highWeightBearPool = pdhSwept || asianHighSwept || eqhSwept || btcRoundPoolSwept;

  const bullSweepPts = sslSweptStrict && !dualSideSwept ? (highWeightBullPool ? 26 : 22) : 0;
  const bearSweepPts = bslSweptStrict && !dualSideSwept ? (highWeightBearPool ? 26 : 22) : 0;
  const bullMssPts = bullMss ? (bullDisplacementRvol >= 1.35 ? 24 : 21) : 0;
  const bearMssPts = bearMss ? (bearDisplacementRvol >= 1.35 ? 24 : 21) : 0;
  const bullImbPts = Math.min(
    24,
    (imbBull.bullFvg ? (imbBull.bullFvg.touchCount === 0 ? 16 : 12) : 0) +
      (imbBull.bullOb ? 8 : 0)
  );
  const bearImbPts = Math.min(
    24,
    (imbBear.bearFvg ? (imbBear.bearFvg.touchCount === 0 ? 16 : 12) : 0) +
      (imbBear.bearOb ? 8 : 0)
  );
  const bullOtePts = inBullOte ? 14 : bullDiscountValid ? 10 : 0;
  const bearOtePts = inBearOte ? 14 : bearPremiumValid ? 10 : 0;

  // PO3 Midnight Open alignment bonus
  const bullPo3Preview =
    typeof sessionAnchors.midnightOpen === 'number'
      ? currentPrice <= sessionAnchors.midnightOpen * 1.0005 || asianLowSwept || pdlSwept
      : false;
  const bearPo3Preview =
    typeof sessionAnchors.midnightOpen === 'number'
      ? currentPrice >= sessionAnchors.midnightOpen * 0.9995 || asianHighSwept || pdhSwept
      : false;

  const bullHtfPts = Math.max(
    0,
    (htf.bias === 'Bullish' ? 8 : htf.bullDemandAligned ? 6 : htf.bias === 'Ranging' ? 4 : 0) +
      (inKillzone ? 4 : 0) +
      (bullPo3Preview ? 4 : 0) +
      smtBullBonus +
      dxyBullBonus
  );
  const bearHtfPts = Math.max(
    0,
    (htf.bias === 'Bearish' ? 8 : htf.bearSupplyAligned ? 6 : htf.bias === 'Ranging' ? 4 : 0) +
      (inKillzone ? 4 : 0) +
      (bearPo3Preview ? 4 : 0) +
      smtBearBonus +
      dxyBearBonus
  );

  const bullTotal = bullSweepPts + bullMssPts + bullImbPts + bullOtePts + bullHtfPts;
  const bearTotal = bearSweepPts + bearMssPts + bearImbPts + bearOtePts + bearHtfPts;

  const newsBlackout = checkMacroNewsBlackout(asset.id, economicEvents, refClockMs);
  const newsBlocked = enforceNewsBlackout && newsBlackout.active;

  // Canonical ICT 2022 requires real FVG/OB imbalance in Discount/Premium + fresh post-MSS window + virgin FVG
  const hasBullImbalanceZone = Boolean(
    bullAnchor &&
      bullDiscountValid &&
      bullAnchor.touchCount === 0 &&
      bullMssIdx >= n - 10
  );
  const hasBearImbalanceZone = Boolean(
    bearAnchor &&
      bearPremiumValid &&
      bearAnchor.touchCount === 0 &&
      bearMssIdx >= n - 10
  );

  const buyCoreConfirmed =
    !dualSideSwept &&
    sslSweptStrict &&
    bullMss &&
    bullMssIdx > sslSweepIdx &&
    hasBullImbalanceZone &&
    (htf.bias === 'Bullish' || (htf.bias === 'Ranging' && inKillzone) || (htf.bullDemandAligned && inKillzone));

  const sellCoreConfirmed =
    !dualSideSwept &&
    bslSweptStrict &&
    bearMss &&
    bearMssIdx > bslSweepIdx &&
    hasBearImbalanceZone &&
    (htf.bias === 'Bearish' || (htf.bias === 'Ranging' && inKillzone) || (htf.bearSupplyAligned && inKillzone));

  const bullBiasDominant =
    buyCoreConfirmed ||
    (!sellCoreConfirmed &&
      (sslSweptStrict ||
        bullTotal > bearTotal ||
        (bullTotal === bearTotal && htf.bias !== 'Bearish')));

  const activeDisplacementRvol = bullBiasDominant ? bullDisplacementRvol : bearDisplacementRvol;

  const sweptPoolLabel = bullBiasDominant
    ? pdlSwept
      ? 'PDL + SSL Pool'
      : asianLowSwept
        ? 'Asian Low + SSL'
        : eqlSwept
          ? 'EQL Cluster Pool'
          : btcSweptPsychLabel ?? (sslSweptStrict ? 'Fractal SSL' : undefined)
    : pdhSwept
      ? 'PDH + BSL Pool'
      : asianHighSwept
        ? 'Asian High + BSL'
        : eqhSwept
          ? 'EQH Cluster Pool'
          : btcSweptPsychLabel ?? (bslSweptStrict ? 'Fractal BSL' : undefined);

  // Entry Zone + Exact Canonical Placement Price (FVG 50% CE or OB CE)
  let entryLow = bullBiasDominant ? bullOteLow : bearOteLow;
  let entryHigh = bullBiasDominant ? bullOteHigh : bearOteHigh;
  let canonicalLimitPx: number | undefined;
  if (bullBiasDominant) {
    if (imbBull.bullFvg) {
      entryLow = imbBull.bullFvg.low;
      entryHigh = imbBull.bullFvg.high;
      canonicalLimitPx = imbBull.bullFvg.ceMid;
    } else if (imbBull.bullOb) {
      entryLow = imbBull.bullOb.low;
      entryHigh = imbBull.bullOb.high;
      canonicalLimitPx = entryLow + (entryHigh - entryLow) * 0.65;
    }
  } else {
    if (imbBear.bearFvg) {
      entryLow = imbBear.bearFvg.low;
      entryHigh = imbBear.bearFvg.high;
      canonicalLimitPx = imbBear.bearFvg.ceMid;
    } else if (imbBear.bearOb) {
      entryLow = imbBear.bearOb.low;
      entryHigh = imbBear.bearOb.high;
      canonicalLimitPx = entryHigh - (entryHigh - entryLow) * 0.65;
    }
  }

  const entryAnchorPx = canonicalLimitPx ?? (entryLow + entryHigh) / 2;

  // Power of 3 (AMD) NY Midnight Open alignment evaluation
  const midnightOpen = sessionAnchors.midnightOpen;
  const po3Aligned =
    typeof midnightOpen === 'number'
      ? bullBiasDominant
        ? entryAnchorPx <= midnightOpen * 1.0006
        : entryAnchorPx >= midnightOpen * 0.9994
      : false;
  const po3Note =
    typeof midnightOpen === 'number'
      ? `${sessionAnchors.po3Phase} · ${
          bullBiasDominant
            ? po3Aligned
              ? `Long discount below NY 00:00 Open (${formatPriceWithAsset(midnightOpen, asset)})`
              : `Above NY 00:00 Open (${formatPriceWithAsset(midnightOpen, asset)}) — premium long caution`
            : po3Aligned
              ? `Short premium above NY 00:00 Open (${formatPriceWithAsset(midnightOpen, asset)})`
              : `Below NY 00:00 Open (${formatPriceWithAsset(midnightOpen, asset)}) — discount short caution`
        }`
      : `${sessionAnchors.po3Phase} session phase`;

  // Dynamic Volatility-Scaled Stop Architecture (eliminates fixed-dollar caps)
  const slBuffer = getAssetStopFloorBuffer(asset, atr15mMetrics.atr15m, volatilityRegime);
  const tfMult = Math.sqrt(Math.max(1, (TF_BAR_MINUTES[timeframe] ?? 15) / 15));
  const minSlMult = isBtc ? 1.15 : 0.9;
  const maxSlMult = isBtc ? 3.2 : 2.6;
  const minSlDist = atr15mMetrics.atr15m * minSlMult * tfMult;
  const maxSlDist = atr15mMetrics.atr15m * maxSlMult * tfMult;

  let slVal: number;
  let tp1Val: number;
  let tp2Val: number;
  let risk: number;
  let liquidityTarget: string;

  if (bullBiasDominant) {
    const structuralStopAnchor = sslSweptStrict
      ? Math.min(sslSweepLow, entryLow)
      : Math.min(priorSwingLow, entryLow);
    slVal = Math.min(structuralStopAnchor - slBuffer.value, entryAnchorPx - minSlDist);
    risk = Math.max(1e-6, entryAnchorPx - slVal);

    const rawUpsidePools = [
      bullLegHigh,
      priorSwingHigh,
      eqhLevel ?? NaN,
      rangeHigh,
      htf.pool1hHigh,
      htf.pdh,
    ]
      .filter((p) => Number.isFinite(p) && p >= entryAnchorPx + risk * 1.15)
      .sort((a, b) => a - b);

    const tp1Candidate = rawUpsidePools.find(
      (p) => p >= entryAnchorPx + risk * 1.2 && p <= entryAnchorPx + risk * 1.7
    );
    tp1Val = tp1Candidate ?? entryAnchorPx + risk * 1.35;
    const optimalTp2Pool = rawUpsidePools.find(
      (p) => p >= entryAnchorPx + risk * 2.25 && p <= entryAnchorPx + risk * 4.0 && p > tp1Val
    );
    tp2Val = optimalTp2Pool ?? entryAnchorPx + risk * 2.75;
    liquidityTarget = `BSL (${formatPriceWithAsset(tp2Val, asset)})`;
  } else {
    const structuralStopAnchor = bslSweptStrict
      ? Math.max(bslSweepHigh, entryHigh)
      : Math.max(priorSwingHigh, entryHigh);
    slVal = Math.max(structuralStopAnchor + slBuffer.value, entryAnchorPx + minSlDist);
    risk = Math.max(1e-6, slVal - entryAnchorPx);

    const rawDownsidePools = [
      bearLegLow,
      priorSwingLow,
      eqlLevel ?? NaN,
      rangeLow,
      htf.pool1hLow,
      htf.pdl,
    ]
      .filter((p) => Number.isFinite(p) && p <= entryAnchorPx - risk * 1.15)
      .sort((a, b) => b - a);

    const tp1Candidate = rawDownsidePools.find(
      (p) => p <= entryAnchorPx - risk * 1.2 && p >= entryAnchorPx - risk * 1.7
    );
    tp1Val = tp1Candidate ?? entryAnchorPx - risk * 1.35;
    const optimalTp2Pool = rawDownsidePools.find(
      (p) => p <= entryAnchorPx - risk * 2.25 && p >= entryAnchorPx - risk * 4.0 && p < tp1Val
    );
    tp2Val = optimalTp2Pool ?? entryAnchorPx - risk * 2.75;
    liquidityTarget = `SSL (${formatPriceWithAsset(tp2Val, asset)})`;
  }

  // Net-of-Friction R:R & Spread Guard
  const friction = getEstimatedRoundTripFriction(asset.id, entryAnchorPx);
  const grossReward = Math.abs(tp2Val - entryAnchorPx);
  const netReward = Math.max(0, grossReward - friction.cost);
  const netRisk = risk + friction.cost;
  const netRr = netRisk > 1e-8 ? Number((netReward / netRisk).toFixed(2)) : 0;
  const stopTooWide = risk > maxSlDist;

  let direction: IctDirection = 'NEUTRAL';
  let executionStatus: IctSignalAnalysis['executionStatus'] = 'standby';
  const waitReasons: string[] = [];

  if (newsBlocked && newsBlackout.reason) {
    waitReasons.push(newsBlackout.reason);
  }
  if (volatilityStatus === 'warming') {
    waitReasons.push('Warming 15m OHLCV bars for ATR volatility verification');
  } else if (enforceVolatilityFilter && !volatilityPassed) {
    waitReasons.push(
      volatilityStatus === 'too-high'
        ? `15m ATR ${atrPct.toFixed(3)}% > ${volatilityMaxPct.toFixed(3)}% cap (${atr15mMetrics.assetClassLabel})`
        : `15m ATR ${atrPct.toFixed(3)}% < ${volatilityThresholdPct.toFixed(3)}% floor (${atr15mMetrics.assetClassLabel})`
    );
  }
  if (dualSideSwept) {
    waitReasons.push('Both SSL & BSL liquidity swept within 4 bars — choppy range');
  } else if (!sslSweptStrict && !bslSweptStrict) {
    waitReasons.push('Awaiting clean SSL/EQL or BSL/EQH liquidity sweep');
  }
  if (stopTooWide) {
    waitReasons.push(
      `Stop Too Wide (${formatPriceWithAsset(risk, asset)} > ${maxSlMult.toFixed(1)}x ATR cap)`
    );
  }
  if (netRr < 2.0) {
    waitReasons.push(
      `Net-of-friction R:R is 1:${netRr.toFixed(1)} after ${friction.label} (below 1:2.0 min)`
    );
  }

  const gatesPass =
    !newsBlocked &&
    volatilityStatus !== 'warming' &&
    (!enforceVolatilityFilter || volatilityPassed) &&
    !stopTooWide &&
    netRr >= 2.0;

  if (gatesPass) {
    if (buyCoreConfirmed) {
      const liveCheck = checkLiveSetupValidity({
        direction: 'BUY',
        currentPrice,
        slVal,
        tp1Val,
      });
      if (liveCheck.valid) {
        direction = 'BUY';
        executionStatus = 'active';
      } else {
        executionStatus = liveCheck.status;
        if (liveCheck.reason) waitReasons.unshift(liveCheck.reason);
      }
    } else if (sellCoreConfirmed) {
      const liveCheck = checkLiveSetupValidity({
        direction: 'SELL',
        currentPrice,
        slVal,
        tp1Val,
      });
      if (liveCheck.valid) {
        direction = 'SELL';
        executionStatus = 'active';
      } else {
        executionStatus = liveCheck.status;
        if (liveCheck.reason) waitReasons.unshift(liveCheck.reason);
      }
    }
  }

  const postureEval = evaluateLiveExecutionPosture({
    direction,
    setupArmed: direction === 'BUY' || direction === 'SELL',
    armedBias: bullBiasDominant ? 'BUY' : 'SELL',
    currentPrice,
    entryLow,
    entryHigh,
    stopLoss: slVal,
    tp1: tp1Val,
    tp2: tp2Val,
    atr,
    executionStatus,
    exactLimitOverride: canonicalLimitPx,
    frictionCost: friction.cost,
  });

  if (direction === 'NEUTRAL' && waitReasons.length === 0) {
    if (sslSweptStrict && !bullMss) {
      waitReasons.push('SSL swept — awaiting RVOL >= 1.15x displacement + Bullish MSS close');
    } else if (bslSweptStrict && !bearMss) {
      waitReasons.push('BSL swept — awaiting RVOL >= 1.15x displacement + Bearish MSS close');
    } else if ((bullMss && !hasBullImbalanceZone) || (bearMss && !hasBearImbalanceZone)) {
      waitReasons.push('MSS printed — awaiting fresh Discount/Premium FVG or OB');
    } else if ((bullMss && htf.bias === 'Bearish') || (bearMss && htf.bias === 'Bullish')) {
      waitReasons.push(`Counter-trend vs HTF ${htf.bias} outside Killzone/HTF Zone`);
    } else {
      waitReasons.push('Awaiting Sweep + RVOL Displacement MSS + Fresh FVG');
    }
  }

  const invalidationTrigger = buildAssetInvalidationTrigger({
    assetClassLabel: atr15mMetrics.assetClassLabel,
    biasBullish: bullBiasDominant,
    slFormatted: formatPriceWithAsset(slVal, asset),
    maxPct: volatilityMaxPct,
  });

  const invalidationNote =
    direction === 'NEUTRAL'
      ? `NO TRADE (${waitReasons[0]}). ${invalidationTrigger}`
      : invalidationTrigger;

  const activeBreakdown = bullBiasDominant
    ? {
        sweep: bullSweepPts,
        displacementMss: bullMssPts,
        imbalanceFvgOb: bullImbPts,
        oteFib: bullOtePts,
        htfConfluence: bullHtfPts,
      }
    : {
        sweep: bearSweepPts,
        displacementMss: bearMssPts,
        imbalanceFvgOb: bearImbPts,
        oteFib: bearOtePts,
        htfConfluence: bearHtfPts,
      };

  const precisionScore = Math.min(
    100,
    activeBreakdown.sweep +
      activeBreakdown.displacementMss +
      activeBreakdown.imbalanceFvgOb +
      activeBreakdown.oteFib +
      activeBreakdown.htfConfluence
  );

  const confidence =
    direction === 'NEUTRAL'
      ? Math.min(54, Math.max(20, Math.round(precisionScore * 0.72)))
      : Math.min(97, Math.max(68, Math.round(precisionScore)));

  const triggers: string[] = [];
  if (direction === 'BUY') {
    triggers.push(`${sweptPoolLabel ?? 'SSL Liquidity'} Swept`);
    triggers.push(`Displacement MSS (${activeDisplacementRvol.toFixed(2)}x RVOL)`);
    if (imbBull.bullFvg) triggers.push(imbBull.bullFvg.touchCount === 0 ? 'Virgin Bull FVG (50% CE)' : 'Unmitigated Bull FVG');
    if (po3Aligned) triggers.push('PO3 Below NY 00:00 Open');
    if (smt.status === 'Bullish SMT') triggers.push(`Bullish SMT (${smt.pair})`);
    if (htf.bias === 'Bullish') triggers.push('HTF 1H/4H Bullish');
    if (dxyBullBonus > 0) triggers.push('DXY Inverse Tailwind');
  } else if (direction === 'SELL') {
    triggers.push(`${sweptPoolLabel ?? 'BSL Liquidity'} Swept`);
    triggers.push(`Displacement MSS (${activeDisplacementRvol.toFixed(2)}x RVOL)`);
    if (imbBear.bearFvg) triggers.push(imbBear.bearFvg.touchCount === 0 ? 'Virgin Bear FVG (50% CE)' : 'Unmitigated Bear FVG');
    if (po3Aligned) triggers.push('PO3 Above NY 00:00 Open');
    if (smt.status === 'Bearish SMT') triggers.push(`Bearish SMT (${smt.pair})`);
    if (htf.bias === 'Bearish') triggers.push('HTF 1H/4H Bearish');
    if (dxyBearBonus > 0) triggers.push('DXY Strength Aligned');
  } else {
    triggers.push(`${pdZone} · ${sessionAnchors.po3Phase}`);
    triggers.push(waitReasons[0] ?? 'Awaiting Canonical 2022 ICT');
    if (smt.status === 'Bullish SMT' || smt.status === 'Bearish SMT') triggers.push(smt.status);
    if (inKillzone) triggers.push(killzone);
    if (dxyConfluenceNote && isGold) triggers.push(dxyBullBonus > 0 ? 'DXY Tailwind Long' : dxyBearBonus > 0 ? 'DXY Tailwind Short' : 'DXY Neutral');
  }

  let setupName: string;
  if (direction === 'BUY') {
    setupName = pdlSwept
      ? 'ICT 2022 PDL Judas Sweep + RVOL MSS & Virgin FVG Long'
      : asianLowSwept
        ? 'ICT 2022 Asian Low Judas Sweep + RVOL MSS & Virgin FVG Long'
        : 'ICT 2022 SSL Sweep + RVOL MSS & Virgin FVG Long';
  } else if (direction === 'SELL') {
    setupName = pdhSwept
      ? 'ICT 2022 PDH Judas Sweep + RVOL MSS & Virgin FVG Short'
      : asianHighSwept
        ? 'ICT 2022 Asian High Judas Sweep + RVOL MSS & Virgin FVG Short'
        : 'ICT 2022 BSL Sweep + RVOL MSS & Virgin FVG Short';
  } else if (newsBlocked) {
    setupName = 'ICT Filtered · High-Impact Macro Blackout';
  } else if (stopTooWide) {
    setupName = `WAIT · Stop Too Wide (> ${maxSlMult.toFixed(1)}x ATR)`;
  } else if (volatilityStatus === 'warming') {
    setupName = 'WAIT · Warming 15m Candles';
  } else if (enforceVolatilityFilter && !volatilityPassed) {
    setupName =
      volatilityStatus === 'too-high'
        ? 'ICT Filtered · Erratic High-Volatility Session'
        : 'ICT Filtered · Low Volatility Consolidation';
  } else {
    setupName = `WAIT · ${waitReasons[0].split('(')[0].trim()}`;
  }

  const oteZone = formatBand(
    bullBiasDominant ? bullOteLow : bearOteLow,
    bullBiasDominant ? bullOteHigh : bearOteHigh,
    asset
  );
  const fvgZone = bullBiasDominant
    ? imbBull.bullFvg
      ? formatBand(imbBull.bullFvg.low, imbBull.bullFvg.high, asset)
      : undefined
    : imbBear.bearFvg
      ? formatBand(imbBear.bearFvg.low, imbBear.bearFvg.high, asset)
      : undefined;
  const obZone = bullBiasDominant
    ? imbBull.bullOb
      ? formatBand(imbBull.bullOb.low, imbBull.bullOb.high, asset)
      : undefined
    : imbBear.bearOb
      ? formatBand(imbBear.bearOb.low, imbBear.bearOb.high, asset)
      : undefined;

  const latestBarTs = bars[n - 1]?.t;
  const evaluatedAt =
    typeof asset.updatedAtEpoch === 'number' &&
    asset.updatedAtEpoch > 0 &&
    asset.marketSessionOpen
      ? asset.updatedAtEpoch
      : latestBarTs && latestBarTs > 0 && latestBarTs <= refClockMs
        ? latestBarTs
        : refClockMs;

  const projectedLevelsSummary = `Ref Zone ${formatBand(entryLow, entryHigh, asset)} · SL Ref ${formatPriceWithAsset(slVal, asset)} · Draw ${formatPriceWithAsset(tp2Val, asset)}`;

  const htfAligned =
    bullBiasDominant
      ? htf.bias === 'Bullish' || htf.bullDemandAligned
      : htf.bias === 'Bearish' || htf.bearSupplyAligned;

  const { setupGrade, isAPlusSetup } = computeSetupGrade({
    direction,
    inKillzone,
    volatilityPassed,
    newsBlocked,
    confidence,
    realRr: netRr,
    htfAligned,
  });
  const usdExposure = resolveUsdExposure(asset.id, direction);

  const biasLabel: IctSignalAnalysis['biasLabel'] =
    direction === 'BUY' ? 'BULLISH' : direction === 'SELL' ? 'BEARISH' : 'FLAT';

  const expectedBias: 'BUY' | 'SELL' | 'NEUTRAL' =
    direction !== 'NEUTRAL'
      ? direction
      : sslSweptStrict
        ? 'BUY'
        : bslSweptStrict
          ? 'SELL'
          : bullTotal > bearTotal
            ? 'BUY'
            : bearTotal > bullTotal
              ? 'SELL'
              : 'NEUTRAL';

  const placementSummary = buildPlacementSummary({
    direction,
    expectedBias,
    posture: postureEval.posture,
    limitEntryPriceNum: postureEval.limitEntryPriceNum ?? canonicalLimitPx,
    stopLossNum: slVal,
    tp1Num: tp1Val,
    tp2Num: tp2Val,
    asset,
    waitReason: waitReasons[0],
  });

  const htfClearPass = bullBiasDominant
    ? htf.bias === 'Bullish' || (htf.bias === 'Ranging' && inKillzone) || (htf.bullDemandAligned && inKillzone)
    : htf.bias === 'Bearish' || (htf.bias === 'Ranging' && inKillzone) || (htf.bearSupplyAligned && inKillzone);
  const sweepClearPass = bullBiasDominant ? sslSweptStrict && !dualSideSwept : bslSweptStrict && !dualSideSwept;
  const mssClearPass = bullBiasDominant ? bullMss && bullMssIdx > sslSweepIdx : bearMss && bearMssIdx > bslSweepIdx;
  const zoneClearPass = bullBiasDominant ? hasBullImbalanceZone : hasBearImbalanceZone;
  const riskClearPass = !newsBlocked && (!enforceVolatilityFilter || volatilityPassed) && !stopTooWide && netRr >= 2.0;

  const clearanceGates: SignalClearanceGate[] = [
    {
      id: 'htf',
      label: '1. HTF, PO3 & SMT',
      passed: htfClearPass,
      state: htfClearPass ? 'PASS' : 'WARN',
      detail: `${htf.bias} 1H/4H · ${po3Aligned ? 'PO3 OK' : sessionAnchors.po3Phase}${smt.status === 'Bullish SMT' || smt.status === 'Bearish SMT' ? ` · ${smt.status}` : ''}`,
    },
    {
      id: 'kz',
      label: '2. Session Killzone',
      passed: inKillzone,
      state: inKillzone ? 'PASS' : 'WARN',
      detail: `${killzone} · ${volatilityRegime.replace('_', ' ')}`,
    },
    {
      id: 'sweep',
      label: '3. Liquidity Pool Sweep',
      passed: sweepClearPass,
      state: dualSideSwept ? 'BLOCK' : sweepClearPass ? 'PASS' : 'BLOCK',
      detail: dualSideSwept
        ? 'Dual-side chop'
        : sweptPoolLabel
          ? `${sweptPoolLabel} swept & reclaimed`
          : 'Awaiting pool sweep',
    },
    {
      id: 'mss',
      label: '4. RVOL Displacement MSS',
      passed: mssClearPass,
      state: mssClearPass ? 'PASS' : sweepClearPass ? 'WARN' : 'BLOCK',
      detail: mssClearPass
        ? `${bullBiasDominant ? 'Bullish' : 'Bearish'} MSS · ${activeDisplacementRvol.toFixed(2)}x RVOL`
        : 'Awaiting RVOL >= 1.15x close',
    },
    {
      id: 'risk',
      label: '5. Virgin FVG & Net R:R',
      passed: zoneClearPass && riskClearPass,
      state: newsBlocked || stopTooWide ? 'BLOCK' : zoneClearPass && riskClearPass ? 'PASS' : 'WARN',
      detail: newsBlocked
        ? 'News blackout'
        : stopTooWide
          ? `SL > ${maxSlMult.toFixed(1)}x ATR`
          : zoneClearPass
            ? `Virgin Zone · Net 1:${netRr.toFixed(1)} R:R`
            : netRr < 2.0
              ? `Net R:R 1:${netRr.toFixed(1)} < 2.0`
              : 'Awaiting Virgin FVG/OB',
    },
  ];

  const passedGateCount = clearanceGates.filter((g) => g.passed).length;
  const blockerGate = clearanceGates.find((g) => !g.passed);
  const clearanceSummary =
    direction !== 'NEUTRAL'
      ? `${passedGateCount}/5 Cleared · Unambiguous ${direction} (${setupGrade} · Net 1:${netRr.toFixed(1)})`
      : `${passedGateCount}/5 Cleared · Blocker: ${blockerGate?.label.replace(/^\d+\.\s*/, '') ?? 'Structure'} (${waitReasons[0] ?? 'Standby'})`;

  const biasVerdict: SignalBiasVerdict =
    direction === 'BUY'
      ? isAPlusSetup || precisionScore >= 84
        ? 'STRONG BUY'
        : 'BUY'
      : direction === 'SELL'
        ? isAPlusSetup || precisionScore >= 84
          ? 'STRONG SELL'
          : 'SELL'
        : expectedBias === 'BUY'
          ? 'BULLISH LEAN (WAIT)'
          : expectedBias === 'SELL'
            ? 'BEARISH LEAN (WAIT)'
            : 'NEUTRAL / RANGE';

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.shortName,
    direction,
    biasLabel,
    biasVerdict,
    clearanceSummary,
    clearanceGates,
    dxyConfluenceNote,
    roundPoolNote,
    confidence,
    setupName,
    pdZone,
    entryZone: formatBand(entryLow, entryHigh, asset),
    stopLoss: formatPriceWithAsset(slVal, asset),
    targetPrice: formatPriceWithAsset(tp2Val, asset),
    riskReward: netRr > 0 ? `1:${netRr.toFixed(1)}` : 'WAIT',
    triggers: triggers.slice(0, 6),
    timeframe,
    currentPrice,
    decimals: asset.decimals,
    currencyPrefix: asset.currencyPrefix,
    unitSuffix: asset.unitSuffix,
    evaluatedAt,
    htfBias: htf.bias,
    killzone,
    sessionLabel: killzone,
    asianHigh: asianRange.asianHigh,
    asianLow: asianRange.asianLow,
    asianRangeAtrRatio: asianRange.asianRangeAtrRatio,
    sweepMssStatus:
      direction === 'NEUTRAL'
        ? waitReasons[0]
        : `${sweptPoolLabel ?? (bullBiasDominant ? 'SSL' : 'BSL')} Sweep -> ${activeDisplacementRvol.toFixed(2)}x RVOL MSS -> ${nearBullFvg || nearBearFvg ? 'Virgin FVG 50% CE' : nearBullOb || nearBearOb ? 'Order Block' : 'FVG Zone'}`,
    stopLossReason: `${slBuffer.reason} beyond Sweep Wick`,
    tp1: formatPriceWithAsset(tp1Val, asset),
    tp2: formatPriceWithAsset(tp2Val, asset),
    invalidationNote,
    invalidationTrigger,
    assetClassLabel: atr15mMetrics.assetClassLabel,
    liquidityTarget,
    fvgZone,
    obZone,
    oteZone,
    precisionScore,
    scoreBreakdown: activeBreakdown,
    atrPct,
    volatilityThresholdPct,
    volatilityMaxPct,
    volatilityStatus,
    volatilityPassed,
    atrSource: atr15mMetrics.atrSource,
    executionStatus,
    projectedLevelsSummary,
    entryLowNum: Math.min(entryLow, entryHigh),
    entryHighNum: Math.max(entryLow, entryHigh),
    stopLossNum: slVal,
    tp1Num: tp1Val,
    tp2Num: tp2Val,
    isClosedCandleConfirmed,
    candleStageLabel,
    newsBlackoutActive: newsBlackout.active,
    newsBlackoutReason: newsBlackout.reason,
    isRealOhlc: true,
    setupGrade,
    isAPlusSetup,
    usdExposure,
    executionPosture: postureEval.posture,
    recommendedOrderType: postureEval.recommendedOrderType,
    limitEntryPriceNum: postureEval.limitEntryPriceNum,
    limitRr: postureEval.limitRr,
    spotRr: postureEval.spotRr,
    chaseProgressPct: postureEval.chaseProgressPct,
    hasRunAway: postureEval.hasRunAway,
    placementSummary,
    // Phase 1 Institutional Telemetry
    midnightOpen,
    ny0830Open: sessionAnchors.ny0830Open,
    pdh: htf.pdh,
    pdl: htf.pdl,
    po3Phase: sessionAnchors.po3Phase,
    po3Aligned,
    po3Note,
    smtStatus: smt.status,
    smtPair: smt.pair,
    smtDetail: smt.detail,
    displacementRvol: activeDisplacementRvol,
    sweptPoolLabel,
    volatilityRegime,
    atrBaselineRatio,
    netRr,
    frictionCost: friction.cost,
    frictionLabel: friction.label,
    htfAligned,
  };
}

export function computeIctSignal(
  asset: MarketAsset,
  preferredTimeframe?: Timeframe,
  enforceVolatilityFilter = true,
  economicEvents?: EconomicEvent[],
  enforceNewsBlackout = true,
  macroContext?: MacroIctContext
): IctSignalAnalysis {
  return computePureIctSignalForXauBtc(
    asset,
    preferredTimeframe,
    enforceVolatilityFilter,
    economicEvents,
    enforceNewsBlackout,
    macroContext
  );
}

export function scanAllIctSignals(
  assets: MarketAsset[],
  preferredByAsset?: Record<string, Timeframe>,
  enforceVolatilityFilter = true,
  economicEvents?: EconomicEvent[],
  enforceNewsBlackout = true
): IctSignalAnalysis[] {
  const macroContext = extractMacroContextFromAssets(assets);
  return assets
    .filter(isIctEligibleAsset)
    .map((asset) =>
      computeIctSignal(
        asset,
        preferredByAsset?.[asset.id],
        enforceVolatilityFilter,
        economicEvents,
        enforceNewsBlackout,
        macroContext
      )
    )
    .sort((a, b) => {
      const aActive = a.direction === 'NEUTRAL' ? 0 : 1;
      const bActive = b.direction === 'NEUTRAL' ? 0 : 1;
      if (aActive !== bActive) return bActive - aActive;
      return b.confidence - a.confidence;
    });
}
