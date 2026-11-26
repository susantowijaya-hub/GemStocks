import {
  CandlePoint,
  EconomicCalendarCurrency,
  EconomicEvent,
  IctDirection,
  IctSignalAnalysis,
  MarketAsset,
  Timeframe,
} from '../types/market';

const ICT_FX_PAIR_IDS = new Set([
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'AUDUSD',
  'USDCHF',
  'USDCAD',
  'NZDUSD',
]);

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
  if (PURE_ICT_ASSET_IDS.has(asset.id)) return true;
  return ICT_FX_PAIR_IDS.has(asset.id);
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
    confidence >= 80 &&
    realRr >= 2.5 &&
    htfAligned
  ) {
    return { setupGrade: 'A+', isAPlusSetup: true };
  }
  if (confidence >= 72 && realRr >= 2.0) {
    return { setupGrade: 'A', isAPlusSetup: false };
  }
  return { setupGrade: 'B', isAPlusSetup: false };
}

export function resolveUsdExposure(
  assetId: string,
  direction: IctDirection
): 'LONG_USD' | 'SHORT_USD' | undefined {
  if (direction === 'NEUTRAL') return undefined;
  const usdBase = assetId === 'USDJPY' || assetId === 'USDCHF' || assetId === 'USDCAD';
  const usdQuote =
    assetId === 'EURUSD' ||
    assetId === 'GBPUSD' ||
    assetId === 'AUDUSD' ||
    assetId === 'NZDUSD' ||
    assetId === 'XAUUSD';
  if (usdBase) return direction === 'BUY' ? 'LONG_USD' : 'SHORT_USD';
  if (usdQuote) return direction === 'BUY' ? 'SHORT_USD' : 'LONG_USD';
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

export interface ImbalanceZonesResult {
  bullFvg: { low: number; high: number; idx: number; formedAt: number } | null;
  bearFvg: { low: number; high: number; idx: number; formedAt: number } | null;
  bullOb: { low: number; high: number; idx: number; formedAt: number } | null;
  bearOb: { low: number; high: number; idx: number; formedAt: number } | null;
}

export function findUnmitigatedFvgAndOb(
  bars: CandlePoint[],
  atr: number,
  lookback = 28,
  minFvgAtr = 0.14,
  minObAtr = 0.7,
  minFormedAtMs = 0
): ImbalanceZonesResult {
  const n = bars.length;
  let bullFvg: ImbalanceZonesResult['bullFvg'] = null;
  let bearFvg: ImbalanceZonesResult['bearFvg'] = null;
  let bullOb: ImbalanceZonesResult['bullOb'] = null;
  let bearOb: ImbalanceZonesResult['bearOb'] = null;

  for (let i = Math.max(2, n - lookback); i < n; i++) {
    const b0 = bars[i - 2];
    const b1 = bars[i - 1];
    const b2 = bars[i];
    if (minFormedAtMs > 0 && b2.t < minFormedAtMs) continue;

    // Clean 3-candle Bullish FVG (candle[i].low > candle[i-2].high)
    if (b2.l > b0.h && b1.c > b1.o && b2.l - b0.h >= atr * minFvgAtr) {
      const fullyFilled = bars.slice(i + 1).some((sub) => sub.c < b0.h);
      if (!fullyFilled) {
        bullFvg = { low: b0.h, high: b2.l, idx: i, formedAt: b2.t };
      }
    }
    // Clean 3-candle Bearish FVG (candle[i].high < candle[i-2].low)
    if (b2.h < b0.l && b1.c < b1.o && b0.l - b2.h >= atr * minFvgAtr) {
      const fullyFilled = bars.slice(i + 1).some((sub) => sub.c > b0.l);
      if (!fullyFilled) {
        bearFvg = { low: b2.h, high: b0.l, idx: i, formedAt: b2.t };
      }
    }
  }

  for (let i = Math.max(1, n - Math.min(lookback, 22)); i < n - 1; i++) {
    const cur = bars[i];
    const nxt = bars[i + 1];
    if (minFormedAtMs > 0 && nxt.t < minFormedAtMs) continue;

    if (cur.c < cur.o && nxt.c > cur.h && nxt.c - nxt.o >= atr * minObAtr) {
      const mitigated = bars.slice(i + 2).some((sub) => sub.c < cur.l);
      if (!mitigated) {
        bullOb = { low: cur.l, high: Math.max(cur.o, cur.c), idx: i, formedAt: nxt.t };
      }
    }
    if (cur.c > cur.o && nxt.c < cur.l && nxt.o - nxt.c >= atr * minObAtr) {
      const mitigated = bars.slice(i + 2).some((sub) => sub.c > cur.h);
      if (!mitigated) {
        bearOb = { low: Math.min(cur.o, cur.c), high: cur.h, idx: i, formedAt: nxt.t };
      }
    }
  }

  return { bullFvg, bearFvg, bullOb, bearOb };
}

export function getIct15mAtrRangePct(assetId: string): {
  minPct: number;
  maxPct: number;
  assetClassLabel: 'Crypto (BTC/USD)' | 'Commodities (XAU/USD)' | 'G10 FX';
} {
  const id = (assetId || '').toUpperCase();
  if (id === 'BTCUSD') {
    return { minPct: 0.095, maxPct: 0.85, assetClassLabel: 'Crypto (BTC/USD)' };
  }
  if (id === 'XAUUSD') {
    return { minPct: 0.032, maxPct: 0.48, assetClassLabel: 'Commodities (XAU/USD)' };
  }
  return { minPct: 0.018, maxPct: 0.145, assetClassLabel: 'G10 FX' };
}

export function getIctVolatilityFloorPct(assetId: string, _timeframe: Timeframe = '15m'): number {
  return getIct15mAtrRangePct(assetId).minPct;
}

export function getAssetStopFloorBuffer(
  asset: MarketAsset,
  atr15m: number
): { value: number; reason: string } {
  const id = (asset.id || '').toUpperCase();
  if (id === 'BTCUSD') {
    const val = Math.min(250, Math.max(150, Number((atr15m * 0.55).toFixed(asset.decimals))));
    return { value: val, reason: `+$${val.toFixed(0)} BTC vol cushion ($150–$250 rule)` };
  }
  if (id === 'XAUUSD') {
    const val = Math.min(2.5, Math.max(1.5, Number((atr15m * 0.55).toFixed(asset.decimals))));
    return { value: val, reason: `+$${val.toFixed(2)} Gold vol cushion ($1.50–$2.50 rule)` };
  }
  const pipSize = id.endsWith('JPY') ? 0.01 : 0.0001;
  const minFloor = 5 * pipSize;
  const maxFloor = 8 * pipSize;
  const val = Math.min(maxFloor, Math.max(minFloor, Number((atr15m * 0.5).toFixed(asset.decimals))));
  const pips = val / pipSize;
  return {
    value: val,
    reason: `+${pips.toFixed(1)} pip FX wick buffer (5–8 pip floor)`,
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
  assetClassLabel: 'Crypto (BTC/USD)' | 'Commodities (XAU/USD)' | 'G10 FX';
  volatilityStatus: 'in-range' | 'too-low' | 'too-high' | 'warming';
  volatilityPassed: boolean;
  atrSource: '15m' | 'scaled' | 'warming';
} {
  const { minPct, maxPct, assetClassLabel } = getIct15mAtrRangePct(asset.id);
  const { bars: barsForAtr, timeframe: usedTf } = extractBarsForTf(
    asset,
    ['15m', '30m', '5m', '1h', '1D'],
    6
  );
  const rawAtr = computeAtr(barsForAtr, 14);
  const barMins = TF_BAR_MINUTES[usedTf] ?? 15;
  // Random-walk square-root-of-time scaling instead of linear division
  const sqrtScaleTo15m = Math.sqrt(Math.max(1 / 15, barMins / 15));
  const atr15m = rawAtr / sqrtScaleTo15m;
  const atr15mPct = currentPrice > 0 ? (atr15m / currentPrice) * 100 : 0;

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
      ? `Crypto Rule: 15m candle close below SSL sweep & Bullish OB SL (${slFormatted}), OR 15m ATR > ${maxPct.toFixed(3)}% cascade volatility invalidates long.`
      : `Crypto Rule: 15m candle close above BSL sweep & Bearish OB SL (${slFormatted}), OR 15m ATR > ${maxPct.toFixed(3)}% cascade volatility invalidates short.`;
  }
  if (assetClassLabel === 'Commodities (XAU/USD)') {
    return biasBullish
      ? `Gold Rule: 15m candle close below SSL sweep SL (${slFormatted}) & Demand OB, OR XAU 15m ATR > ${maxPct.toFixed(3)}% news whipsaw invalidates long.`
      : `Gold Rule: 15m candle close above BSL sweep SL (${slFormatted}) & Supply OB, OR XAU 15m ATR > ${maxPct.toFixed(3)}% news whipsaw invalidates short.`;
  }
  return biasBullish
    ? `FX Rule: 15m/5m candle close below Asian Low SL (${slFormatted}) before FVG fill, dual-sided sweep, OR FX 15m ATR > ${maxPct.toFixed(3)}% invalidates long.`
    : `FX Rule: 15m/5m candle close above Asian High SL (${slFormatted}) before FVG fill, dual-sided sweep, OR FX 15m ATR > ${maxPct.toFixed(3)}% invalidates short.`;
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
  // Drop live forming bar inside current bucket to avoid intra-bar flicker
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
  EURUSD: ['USD', 'EUR'],
  GBPUSD: ['USD', 'GBP'],
  USDJPY: ['USD', 'JPY'],
  AUDUSD: ['USD', 'AUD'],
  USDCHF: ['USD', 'CHF'],
  USDCAD: ['USD', 'CAD'],
  NZDUSD: ['USD', 'NZD'],
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
    // Blackout window: 15 min prior through 20 min post high-impact release
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
        reason: 'Live spot already closed/traded below Stop Loss — long setup invalidated',
      };
    }
    if (currentPrice >= tp1Val) {
      return {
        valid: false,
        status: 'missed',
        reason: 'Live spot already reached TP1 target — wait for next fresh sweep',
      };
    }
  } else {
    if (currentPrice >= slVal) {
      return {
        valid: false,
        status: 'invalidated',
        reason: 'Live spot already closed/traded above Stop Loss — short setup invalidated',
      };
    }
    if (currentPrice <= tp1Val) {
      return {
        valid: false,
        status: 'missed',
        reason: 'Live spot already reached TP1 target — wait for next fresh sweep',
      };
    }
  }
  return { valid: true, status: 'active' };
}

// ============================================================================
// 1. PURE ICT TRADING RULES ENGINE (Strict Liquidity Sweep + MSS + FVG/OB + Dealing-Range OTE)
//    Used exclusively for BTC/USD and XAU/USD
// ============================================================================

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

function resolvePureIctKillzoneLabel(now = new Date()): { label: string; inKillzone: boolean } {
  const london = getZonedClockParts(now, 'Europe/London');
  const ny = getZonedClockParts(now, 'America/New_York');

  // NY AM Killzone (08:00–11:00 NY local time, automatically tracks EST/EDT DST)
  if (ny.totalMin >= 8 * 60 && ny.totalMin < 11 * 60) {
    const isLondonOverlap = london.totalMin >= 12 * 60 && london.totalMin < 17 * 60;
    return {
      label: isLondonOverlap ? 'NY AM / London Overlap' : 'NY AM Killzone',
      inKillzone: true,
    };
  }
  // London Open Killzone (07:00–10:00 London local time, automatically tracks GMT/BST DST)
  if (london.totalMin >= 7 * 60 && london.totalMin < 10 * 60) {
    return { label: 'London Open Killzone', inKillzone: true };
  }
  // NY PM Silver Bullet (13:30–16:00 NY local time)
  if (ny.totalMin >= 13 * 60 + 30 && ny.totalMin < 16 * 60) {
    return { label: 'NY PM Silver Bullet', inKillzone: true };
  }
  // Asian Session Range (19:00–00:00 NY local time)
  if (ny.totalMin >= 19 * 60) {
    return { label: 'Asia Session Range', inKillzone: false };
  }
  return { label: 'Inter-Session Consolidation', inKillzone: false };
}

function analyzePureIctHtf(
  asset: MarketAsset,
  currentPrice: number
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
  } else if (imb4h.bullFvg && !imb4h.bearFvg) {
    bias = 'Bullish';
  } else if (imb4h.bearFvg && !imb4h.bullFvg) {
    bias = 'Bearish';
  }

  const external4hHigh = Math.max(...bars4h.map((b) => b.h), currentPrice);
  const external4hLow = Math.min(...bars4h.map((b) => b.l), currentPrice);
  const pool1hHigh = Math.max(...bars1h.slice(-24).map((b) => b.h), currentPrice);
  const pool1hLow = Math.min(...bars1h.slice(-24).map((b) => b.l), currentPrice);

  const dayHighNum = parseFloat(String(asset.dayHigh).replace(/[^0-9.-]/g, ''));
  const dayLowNum = parseFloat(String(asset.dayLow).replace(/[^0-9.-]/g, ''));
  const pdh = Number.isFinite(dayHighNum) && dayHighNum > 0 ? Math.max(dayHighNum, pool1hHigh) : pool1hHigh;
  const pdl = Number.isFinite(dayLowNum) && dayLowNum > 0 ? Math.min(dayLowNum, pool1hLow) : pool1hLow;

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

function computePureIctSignalForXauBtc(
  asset: MarketAsset,
  preferredTimeframe?: Timeframe,
  enforceVolatilityFilter = true,
  economicEvents?: EconomicEvent[],
  enforceNewsBlackout = true
): IctSignalAnalysis {
  const candidates: Timeframe[] = preferredTimeframe
    ? [preferredTimeframe, ...ICT_TIMEFRAME_PRIORITY.filter((tf) => tf !== preferredTimeframe)]
    : ICT_TIMEFRAME_PRIORITY;

  const { bars: rawBars, timeframe, isRealOhlc } = extractBarsForTf(asset, candidates, 12);
  if (!isRealOhlc || rawBars.length < 12) {
    const { label: killzone } = resolvePureIctKillzoneLabel();
    const atr15mMetrics = compute15mAtrMetrics(asset, asset.price);
    const warmingPrice = formatPriceWithAsset(asset.price, asset);
    return {
      assetId: asset.id,
      symbol: asset.symbol,
      name: asset.shortName,
      direction: 'NEUTRAL',
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
      candleStageLabel: 'Awaiting Real OHLC',
      isClosedCandleConfirmed: false,
      isRealOhlc: false,
      setupGrade: 'WAIT',
      isAPlusSetup: false,
      invalidationTrigger: 'Hold flat until real OHLC candlestick bars finish syncing.',
      invalidationNote: 'Awaiting verified multi-bar OHLC data (synthetic candle fallback disabled).',
    };
  }

  const {
    evalBars: closedOrLiveBars,
    isClosedCandleConfirmed,
    candleStageLabel,
  } = splitConfirmedClosedBars(rawBars, timeframe);
  const bars = closedOrLiveBars.slice(-56);
  const n = bars.length;

  const currentPrice = asset.price > 0 ? asset.price : bars[n - 1]?.c ?? 0;
  const rangeHigh = Math.max(...bars.map((b) => b.h), currentPrice);
  const rangeLow = Math.min(...bars.map((b) => b.l), currentPrice);
  const rangeSpan = Math.max(1e-6, rangeHigh - rangeLow);

  const posInRange = (currentPrice - rangeLow) / rangeSpan;
  const pdZone: IctSignalAnalysis['pdZone'] =
    posInRange <= 0.44 ? 'Discount' : posInRange >= 0.56 ? 'Premium' : 'Equilibrium';

  // Separate prior structural swings (excluding recent 10-bar sweep window)
  const sweepWindowLen = Math.min(10, Math.max(4, Math.floor(n * 0.22)));
  const priorEndIdx = Math.max(4, n - sweepWindowLen);
  const priorSlice = bars.slice(0, priorEndIdx);

  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];
  for (let i = 1; i < priorSlice.length - 1; i++) {
    if (priorSlice[i].h > priorSlice[i - 1].h && priorSlice[i].h > priorSlice[i + 1].h) {
      pivotHighs.push(priorSlice[i].h);
    }
    if (priorSlice[i].l < priorSlice[i - 1].l && priorSlice[i].l < priorSlice[i + 1].l) {
      pivotLows.push(priorSlice[i].l);
    }
  }

  const priorSwingHigh =
    pivotHighs.length > 0 ? pivotHighs[pivotHighs.length - 1] : Math.max(...priorSlice.map((b) => b.h));
  const priorSwingLow =
    pivotLows.length > 0 ? pivotLows[pivotLows.length - 1] : Math.min(...priorSlice.map((b) => b.l));

  // Scan recent sweep window strictly for SSL / BSL liquidity sweep
  let sslSweepIdx = -1;
  let bslSweepIdx = -1;
  let sslSweepLow = priorSwingLow;
  let bslSweepHigh = priorSwingHigh;

  for (let i = priorEndIdx; i < n; i++) {
    const b = bars[i];
    if (b.l < priorSwingLow && b.c > priorSwingLow) {
      sslSweepIdx = i;
      sslSweepLow = Math.min(sslSweepLow, b.l);
    }
    if (b.h > priorSwingHigh && b.c < priorSwingHigh) {
      bslSweepIdx = i;
      bslSweepHigh = Math.max(bslSweepHigh, b.h);
    }
  }

  const sslSweptStrict = sslSweepIdx >= 0;
  const bslSweptStrict = bslSweepIdx >= 0;
  const dualSideSwept = sslSweptStrict && bslSweptStrict;

  const atr = computeAtr(bars, 14);
  const atr15mMetrics = compute15mAtrMetrics(asset, currentPrice);
  const atrPct = atr15mMetrics.atr15mPct;
  const volatilityThresholdPct = atr15mMetrics.minPct;
  const volatilityMaxPct = atr15mMetrics.maxPct;
  const volatilityStatus = atr15mMetrics.volatilityStatus;
  const volatilityPassed = atr15mMetrics.volatilityPassed;

  // Chronological MSS Break strictly at/after sweep candle
  let bullMss = false;
  let bullMssIdx = -1;
  let mssImpulseHigh = rangeHigh;
  if (sslSweptStrict) {
    const preLookback = bars.slice(Math.max(0, sslSweepIdx - 8), sslSweepIdx + 1);
    const microHigh = preLookback.length > 0 ? Math.max(...preLookback.map((b) => b.h)) : priorSwingHigh;
    const sweepSlice = bars.slice(sslSweepIdx);
    mssImpulseHigh = Math.max(...sweepSlice.map((b) => b.h));
    for (let k = sslSweepIdx + 1; k < n; k++) {
      const cur = bars[k];
      const prev = bars[k - 1];
      const disp = (cur.c > cur.o && cur.c - cur.o >= atr * 0.7) || (prev.c > prev.o && prev.c - prev.o >= atr * 0.7);
      if (cur.c > microHigh && disp) {
        bullMss = true;
        bullMssIdx = k;
        break;
      }
    }
    if (!bullMss) {
      const dispExists = sweepSlice.some((b) => b.c > b.o && b.c - b.o >= atr * 0.85);
      if (dispExists && currentPrice > microHigh) {
        bullMss = true;
        bullMssIdx = n - 1;
      }
    }
  }

  let bearMss = false;
  let bearMssIdx = -1;
  let mssImpulseLow = rangeLow;
  if (bslSweptStrict) {
    const preLookback = bars.slice(Math.max(0, bslSweepIdx - 8), bslSweepIdx + 1);
    const microLow = preLookback.length > 0 ? Math.min(...preLookback.map((b) => b.l)) : priorSwingLow;
    const sweepSlice = bars.slice(bslSweepIdx);
    mssImpulseLow = Math.min(...sweepSlice.map((b) => b.l));
    for (let k = bslSweepIdx + 1; k < n; k++) {
      const cur = bars[k];
      const prev = bars[k - 1];
      const disp = (cur.c < cur.o && cur.o - cur.c >= atr * 0.7) || (prev.c < prev.o && prev.o - prev.c >= atr * 0.7);
      if (cur.c < microLow && disp) {
        bearMss = true;
        bearMssIdx = k;
        break;
      }
    }
    if (!bearMss) {
      const dispExists = sweepSlice.some((b) => b.c < b.o && b.o - b.c >= atr * 0.85);
      if (dispExists && currentPrice < microLow) {
        bearMss = true;
        bearMssIdx = n - 1;
      }
    }
  }

  // Dealing-Range OTE (0.618–0.786) anchored strictly on Sweep -> MSS impulse leg
  const bullLegLow = sslSweptStrict ? sslSweepLow : priorSwingLow;
  const bullLegHigh = sslSweptStrict && mssImpulseHigh > bullLegLow ? mssImpulseHigh : Math.max(...bars.slice(-24).map((b) => b.h));
  const bullLegSpan = Math.max(1e-6, bullLegHigh - bullLegLow);
  const bullOteLow = bullLegHigh - bullLegSpan * 0.786;
  const bullOteHigh = bullLegHigh - bullLegSpan * 0.618;

  const bearLegHigh = bslSweptStrict ? bslSweepHigh : priorSwingHigh;
  const bearLegLow = bslSweptStrict && mssImpulseLow < bearLegHigh ? mssImpulseLow : Math.min(...bars.slice(-24).map((b) => b.l));
  const bearLegSpan = Math.max(1e-6, bearLegHigh - bearLegLow);
  const bearOteLow = bearLegLow + bearLegSpan * 0.618;
  const bearOteHigh = bearLegLow + bearLegSpan * 0.786;

  const inBullOte = currentPrice >= bullOteLow && currentPrice <= bullOteHigh;
  const inBearOte = currentPrice >= bearOteLow && currentPrice <= bearOteHigh;

  // Unmitigated FVG / OB anchored after sweep when sweep occurred
  const bullMinTs = sslSweptStrict ? bars[Math.max(0, sslSweepIdx - 1)].t : 0;
  const bearMinTs = bslSweptStrict ? bars[Math.max(0, bslSweepIdx - 1)].t : 0;
  const imbBull = findUnmitigatedFvgAndOb(bars, atr, 28, 0.14, 0.7, bullMinTs);
  const imbBear = findUnmitigatedFvgAndOb(bars, atr, 28, 0.14, 0.7, bearMinTs);

  const nearBullFvg = Boolean(
    imbBull.bullFvg &&
      currentPrice >= imbBull.bullFvg.low - atr * 0.6 &&
      currentPrice <= imbBull.bullFvg.high + atr * 1.4
  );
  const nearBullOb = Boolean(
    imbBull.bullOb &&
      currentPrice >= imbBull.bullOb.low - atr * 0.6 &&
      currentPrice <= imbBull.bullOb.high + atr * 1.4
  );
  const nearBearFvg = Boolean(
    imbBear.bearFvg &&
      currentPrice <= imbBear.bearFvg.high + atr * 0.6 &&
      currentPrice >= imbBear.bearFvg.low - atr * 1.4
  );
  const nearBearOb = Boolean(
    imbBear.bearOb &&
      currentPrice <= imbBear.bearOb.high + atr * 0.6 &&
      currentPrice >= imbBear.bearOb.low - atr * 1.4
  );

  // HTF Swing Structure & Killzone
  const htf = analyzePureIctHtf(asset, currentPrice);
  const { label: killzone, inKillzone } = resolvePureIctKillzoneLabel();

  // Score breakdown reflects verified structural pillars (not phantom shortcuts)
  const bullSweepPts = sslSweptStrict && !dualSideSwept ? 24 : 0;
  const bearSweepPts = bslSweptStrict && !dualSideSwept ? 24 : 0;
  const bullMssPts = bullMss ? 24 : 0;
  const bearMssPts = bearMss ? 24 : 0;
  const bullImbPts = Math.min(24, (nearBullFvg ? 14 : imbBull.bullFvg ? 6 : 0) + (nearBullOb ? 10 : imbBull.bullOb ? 4 : 0));
  const bearImbPts = Math.min(24, (nearBearFvg ? 14 : imbBear.bearFvg ? 6 : 0) + (nearBearOb ? 10 : imbBear.bearOb ? 4 : 0));
  const bullOtePts = inBullOte ? 16 : pdZone === 'Discount' ? 10 : 0;
  const bearOtePts = inBearOte ? 16 : pdZone === 'Premium' ? 10 : 0;
  const bullHtfPts = (htf.bias === 'Bullish' ? 8 : htf.bullDemandAligned ? 6 : htf.bias === 'Ranging' ? 3 : 0) + (inKillzone ? 4 : 0);
  const bearHtfPts = (htf.bias === 'Bearish' ? 8 : htf.bearSupplyAligned ? 6 : htf.bias === 'Ranging' ? 3 : 0) + (inKillzone ? 4 : 0);

  const bullTotal = bullSweepPts + bullMssPts + bullImbPts + bullOtePts + bullHtfPts;
  const bearTotal = bearSweepPts + bearMssPts + bearImbPts + bearOtePts + bearHtfPts;

  const newsBlackout = checkMacroNewsBlackout(asset.id, economicEvents);
  const newsBlocked = enforceNewsBlackout && newsBlackout.active;

  // Strict 3-Pillar Gate: Sweep + Chronological MSS + FVG/OB pullback + HTF compatibility
  const buyCoreConfirmed =
    !dualSideSwept &&
    sslSweptStrict &&
    bullMss &&
    bullMssIdx >= sslSweepIdx &&
    (nearBullFvg || nearBullOb) &&
    (htf.bias !== 'Bearish' || htf.bullDemandAligned);

  const sellCoreConfirmed =
    !dualSideSwept &&
    bslSweptStrict &&
    bearMss &&
    bearMssIdx >= bslSweepIdx &&
    (nearBearFvg || nearBearOb) &&
    (htf.bias !== 'Bullish' || htf.bearSupplyAligned);

  const bullBiasDominant =
    buyCoreConfirmed ||
    (!sellCoreConfirmed && (sslSweptStrict || bullTotal > bearTotal || (bullTotal === bearTotal && htf.bias !== 'Bearish')));

  // Entry Zone selection (Unmitigated FVG/OB inside/near Dealing Range, else Dealing-Range OTE)
  let entryLow = bullBiasDominant ? bullOteLow : bearOteLow;
  let entryHigh = bullBiasDominant ? bullOteHigh : bearOteHigh;
  if (bullBiasDominant) {
    if (nearBullFvg && imbBull.bullFvg) {
      entryLow = imbBull.bullFvg.low;
      entryHigh = imbBull.bullFvg.high;
    } else if (nearBullOb && imbBull.bullOb) {
      entryLow = imbBull.bullOb.low;
      entryHigh = imbBull.bullOb.high;
    }
  } else {
    if (nearBearFvg && imbBear.bearFvg) {
      entryLow = imbBear.bearFvg.low;
      entryHigh = imbBear.bearFvg.high;
    } else if (nearBearOb && imbBear.bearOb) {
      entryLow = imbBear.bearOb.low;
      entryHigh = imbBear.bearOb.high;
    }
  }

  const entryMid = (entryLow + entryHigh) / 2;
  const slBuffer = getAssetStopFloorBuffer(asset, atr15mMetrics.atr15m);
  const tfMult = Math.sqrt(Math.max(1, (TF_BAR_MINUTES[timeframe] ?? 15) / 15));
  const maxSlDist = atr15mMetrics.atr15m * 2.5 * tfMult;

  let slVal: number;
  let tp1Val: number;
  let tp2Val: number;
  let risk: number;
  let liquidityTarget: string;

  if (bullBiasDominant) {
    const structuralStopAnchor = sslSweptStrict ? Math.min(sslSweepLow, entryLow) : Math.min(priorSwingLow, entryLow);
    slVal = structuralStopAnchor - slBuffer.value;
    risk = Math.max(1e-6, entryMid - slVal);

    // Real structural upside liquidity pools (zero synthetic risk multipliers!)
    const rawUpsidePools = [
      bullLegHigh,
      priorSwingHigh,
      rangeHigh,
      htf.pool1hHigh,
      htf.pdh,
      htf.external4hHigh,
    ]
      .filter((p) => Number.isFinite(p) && p > entryMid + risk * 0.6)
      .sort((a, b) => a - b);

    tp1Val =
      rawUpsidePools.find((p) => p >= entryMid + risk * 1.0) ??
      rawUpsidePools[0] ??
      Math.max(rangeHigh, htf.pool1hHigh);
    tp2Val =
      rawUpsidePools.find((p) => p >= entryMid + risk * 2.0 && p >= tp1Val) ??
      rawUpsidePools[rawUpsidePools.length - 1] ??
      tp1Val;
    liquidityTarget = `BSL (${formatPriceWithAsset(tp2Val, asset)})`;
  } else {
    const structuralStopAnchor = bslSweptStrict ? Math.max(bslSweepHigh, entryHigh) : Math.max(priorSwingHigh, entryHigh);
    slVal = structuralStopAnchor + slBuffer.value;
    risk = Math.max(1e-6, slVal - entryMid);

    // Real structural downside liquidity pools (zero synthetic risk multipliers!)
    const rawDownsidePools = [
      bearLegLow,
      priorSwingLow,
      rangeLow,
      htf.pool1hLow,
      htf.pdl,
      htf.external4hLow,
    ]
      .filter((p) => Number.isFinite(p) && p < entryMid - risk * 0.6)
      .sort((a, b) => b - a);

    tp1Val =
      rawDownsidePools.find((p) => p <= entryMid - risk * 1.0) ??
      rawDownsidePools[0] ??
      Math.min(rangeLow, htf.pool1hLow);
    tp2Val =
      rawDownsidePools.find((p) => p <= entryMid - risk * 2.0 && p <= tp1Val) ??
      rawDownsidePools[rawDownsidePools.length - 1] ??
      tp1Val;
    liquidityTarget = `SSL (${formatPriceWithAsset(tp2Val, asset)})`;
  }

  const realRr = risk > 0 ? Math.abs(tp2Val - entryMid) / risk : 0;
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
    waitReasons.push('Both SSL & BSL liquidity swept inside window — choppy range');
  } else if (!sslSweptStrict && !bslSweptStrict) {
    waitReasons.push('Awaiting clean SSL or BSL liquidity sweep');
  }
  if (stopTooWide) {
    waitReasons.push(`Stop Too Wide (${formatPriceWithAsset(risk, asset)} > 2.5x ATR cap)`);
  }
  if (realRr < 2.0) {
    waitReasons.push(`Real liquidity pool R:R is 1:${realRr.toFixed(1)} (below 1:2.0 min)`);
  }

  if (
    !newsBlocked &&
    volatilityStatus !== 'warming' &&
    (!enforceVolatilityFilter || volatilityPassed) &&
    !stopTooWide &&
    realRr >= 2.0
  ) {
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

  if (direction === 'NEUTRAL' && waitReasons.length === 0) {
    if (sslSweptStrict && !bullMss) {
      waitReasons.push('SSL swept — awaiting LTF Bullish MSS break');
    } else if (bslSweptStrict && !bearMss) {
      waitReasons.push('BSL swept — awaiting LTF Bearish MSS break');
    } else if ((bullMss || bearMss) && !nearBullFvg && !nearBullOb && !nearBearFvg && !nearBearOb) {
      waitReasons.push('MSS confirmed — awaiting pullback into unmitigated FVG/OB');
    } else {
      waitReasons.push('Awaiting Sweep + MSS + FVG/OB + OTE alignment');
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
    triggers.push('SSL Liquidity Swept');
    triggers.push('Bullish MSS Break');
    if (nearBullFvg) triggers.push('Unmitigated Bull FVG');
    if (nearBullOb) triggers.push('Bullish Order Block');
    if (inBullOte) triggers.push('0.618–0.786 OTE Discount');
    if (htf.bias === 'Bullish') triggers.push('HTF Swing Bullish');
  } else if (direction === 'SELL') {
    triggers.push('BSL Liquidity Swept');
    triggers.push('Bearish MSS Break');
    if (nearBearFvg) triggers.push('Unmitigated Bear FVG');
    if (nearBearOb) triggers.push('Bearish Order Block');
    if (inBearOte) triggers.push('0.618–0.786 OTE Premium');
    if (htf.bias === 'Bearish') triggers.push('HTF Swing Bearish');
  } else {
    triggers.push(`${pdZone} Zone`);
    triggers.push(waitReasons[0] ?? 'Awaiting 3-Pillar Setup');
    if (inKillzone) triggers.push(killzone);
  }

  let setupName: string;
  if (direction === 'BUY') {
    setupName = 'Pure ICT SSL Sweep + MSS & FVG/OB Long';
  } else if (direction === 'SELL') {
    setupName = 'Pure ICT BSL Sweep + MSS & FVG/OB Short';
  } else if (newsBlocked) {
    setupName = 'Pure ICT Filtered · High-Impact Macro Blackout';
  } else if (stopTooWide) {
    setupName = 'WAIT · Stop Too Wide (> 2.5x ATR)';
  } else if (volatilityStatus === 'warming') {
    setupName = 'WAIT · Warming 15m Candles';
  } else if (enforceVolatilityFilter && !volatilityPassed) {
    setupName =
      volatilityStatus === 'too-high'
        ? 'Pure ICT Filtered · Erratic High-Volatility Session'
        : 'Pure ICT Filtered · Low Volatility Consolidation';
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
  const nowMs = Date.now();
  const evaluatedAt =
    typeof asset.updatedAtEpoch === 'number' &&
    asset.updatedAtEpoch > 0 &&
    asset.marketSessionOpen
      ? asset.updatedAtEpoch
      : latestBarTs && latestBarTs > 0 && latestBarTs <= nowMs
        ? latestBarTs
        : nowMs;

  const projectedLevelsSummary = `Ref Zone ${formatBand(entryLow, entryHigh, asset)} · SL Ref ${formatPriceWithAsset(slVal, asset)} · Draw ${formatPriceWithAsset(tp2Val, asset)}`;

  const { setupGrade, isAPlusSetup } = computeSetupGrade({
    direction,
    inKillzone,
    volatilityPassed,
    newsBlocked,
    confidence,
    realRr,
    htfAligned:
      direction === 'BUY'
        ? htf.bias === 'Bullish' || htf.bullDemandAligned
        : htf.bias === 'Bearish' || htf.bearSupplyAligned,
  });
  const usdExposure = resolveUsdExposure(asset.id, direction);

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.shortName,
    direction,
    confidence,
    setupName,
    pdZone,
    entryZone: formatBand(entryLow, entryHigh, asset),
    stopLoss: formatPriceWithAsset(slVal, asset),
    targetPrice: formatPriceWithAsset(tp2Val, asset),
    riskReward: realRr > 0 ? `1:${realRr.toFixed(1)}` : 'WAIT',
    triggers: triggers.slice(0, 5),
    timeframe,
    currentPrice,
    decimals: asset.decimals,
    currencyPrefix: asset.currencyPrefix,
    unitSuffix: asset.unitSuffix,
    evaluatedAt,
    htfBias: htf.bias,
    killzone,
    sessionLabel: killzone,
    stopLossReason: `${slBuffer.reason}`,
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
  };
}

// ============================================================================
// 2. SESSION RANGE LIQUIDITY SWEEP + ICT (MSS/FVG) ENGINE
//    Used for G10 FX Pairs (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CHF, USD/CAD, NZD/USD)
// ============================================================================

function resolveCurrentSession(now = new Date()): {
  label: string;
  killzone: 'london' | 'ny' | 'asia' | 'off';
  inKillzone: boolean;
} {
  const london = getZonedClockParts(now, 'Europe/London');
  const ny = getZonedClockParts(now, 'America/New_York');

  // NY Killzone (08:00–11:00 NY local, tracks EST/EDT automatically)
  if (ny.totalMin >= 8 * 60 && ny.totalMin < 11 * 60) {
    return { label: 'New York Killzone (08:00–11:00 NY DST)', killzone: 'ny', inKillzone: true };
  }
  // London Killzone (07:00–10:00 London local, tracks GMT/BST automatically)
  if (london.totalMin >= 7 * 60 && london.totalMin < 10 * 60) {
    return { label: 'London Killzone (07:00–10:00 LDN DST)', killzone: 'london', inKillzone: true };
  }
  // NY PM Silver Bullet (13:30–16:00 NY local)
  if (ny.totalMin >= 13 * 60 + 30 && ny.totalMin < 16 * 60) {
    return { label: 'NY PM Silver Bullet (13:30–16:00 NY DST)', killzone: 'ny', inKillzone: true };
  }
  // Asian Session Range (19:00–00:00 NY local, tracks DST cleanly)
  if (ny.totalMin >= 19 * 60) {
    return { label: 'Asian Range Window (19:00–00:00 NY)', killzone: 'asia', inKillzone: false };
  }
  return { label: 'Inter-Session Transition (Outside Killzone)', killzone: 'off', inKillzone: false };
}

function isKillzoneUtcTimestamp(tsMs: number): boolean {
  const d = new Date(tsMs);
  const london = getZonedClockParts(d, 'Europe/London');
  const ny = getZonedClockParts(d, 'America/New_York');
  const inLondon = london.totalMin >= 7 * 60 && london.totalMin <= 10 * 60 + 15;
  const inNyAm = ny.totalMin >= 8 * 60 && ny.totalMin <= 11 * 60 + 15;
  const inNyPm = ny.totalMin >= 13 * 60 + 30 && ny.totalMin <= 16 * 60;
  return inLondon || inNyAm || inNyPm;
}

function isAsianSessionUtcTimestamp(tsMs: number): boolean {
  const ny = getZonedClockParts(new Date(tsMs), 'America/New_York');
  // 19:00–00:00 America/New_York automatically shifts for EST/EDT
  return ny.totalMin >= 19 * 60;
}

interface HtfAnalysis {
  bias: 'Bullish' | 'Bearish' | 'Ranging';
  bullDemandAligned: boolean;
  bearSupplyAligned: boolean;
  pdh: number;
  pdl: number;
  external4hHigh: number;
  external4hLow: number;
  pool1hHigh: number;
  pool1hLow: number;
  detailText: string;
}

function analyzeHtfForFx(asset: MarketAsset, currentPrice: number): HtfAnalysis {
  const { bars: bars4h } = extractBarsForTf(asset, ['4h', '1D'], 6);
  const { bars: bars1h } = extractBarsForTf(asset, ['1h', '4h', '1D'], 6);

  const atr4h = computeAtr(bars4h, 14);
  const atr1h = computeAtr(bars1h, 14);
  const htfImb4h = findUnmitigatedFvgAndOb(bars4h, atr4h, 24);
  const htfImb1h = findUnmitigatedFvgAndOb(bars1h, atr1h, 24);

  const external4hHigh = Math.max(...bars4h.map((b) => b.h), currentPrice);
  const external4hLow = Math.min(...bars4h.map((b) => b.l), currentPrice);
  const pool1hHigh = Math.max(...bars1h.slice(-24).map((b) => b.h), currentPrice);
  const pool1hLow = Math.min(...bars1h.slice(-24).map((b) => b.l), currentPrice);

  const dayHighNum = parseFloat(String(asset.dayHigh).replace(/[^0-9.-]/g, ''));
  const dayLowNum = parseFloat(String(asset.dayLow).replace(/[^0-9.-]/g, ''));
  const pdh = Number.isFinite(dayHighNum) && dayHighNum > 0 ? Math.max(dayHighNum, pool1hHigh) : pool1hHigh;
  const pdl = Number.isFinite(dayLowNum) && dayLowNum > 0 ? Math.min(dayLowNum, pool1hLow) : pool1hLow;

  // Swing-Structure HTF bias (eliminates SMA crossover lag at sweep reversals)
  const bias4h = detectSwingStructureBias(bars4h, currentPrice);
  const bias1h = detectSwingStructureBias(bars1h, currentPrice);

  let bias: 'Bullish' | 'Bearish' | 'Ranging' = 'Ranging';
  if (bias4h !== 'Ranging' && (bias1h === bias4h || bias1h === 'Ranging')) {
    bias = bias4h;
  } else if (bias1h !== 'Ranging' && bias4h === 'Ranging') {
    bias = bias1h;
  } else if (htfImb4h.bullFvg && !htfImb4h.bearFvg) {
    bias = 'Bullish';
  } else if (htfImb4h.bearFvg && !htfImb4h.bullFvg) {
    bias = 'Bearish';
  }

  const bullDemandZone = htfImb4h.bullFvg || htfImb4h.bullOb || htfImb1h.bullFvg || htfImb1h.bullOb;
  const bearSupplyZone = htfImb4h.bearFvg || htfImb4h.bearOb || htfImb1h.bearFvg || htfImb1h.bearOb;

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

  const primaryTarget =
    bias === 'Bullish'
      ? `PDH / 4H Pool ${formatPriceWithAsset(Math.max(pdh, external4hHigh), asset)}`
      : bias === 'Bearish'
        ? `PDL / 4H Pool ${formatPriceWithAsset(Math.min(pdl, external4hLow), asset)}`
        : `Range Liq ${formatPriceWithAsset(pdl, asset)} / ${formatPriceWithAsset(pdh, asset)}`;

  const imbalanceText =
    bias === 'Bullish' && bullDemandZone
      ? `Unmitigated HTF Demand (${formatBand(bullDemandZone.low, bullDemandZone.high, asset)})`
      : bias === 'Bearish' && bearSupplyZone
        ? `Unmitigated HTF Supply (${formatBand(bearSupplyZone.low, bearSupplyZone.high, asset)})`
        : bullDemandZone
          ? 'HTF Demand active'
          : bearSupplyZone
            ? 'HTF Supply active'
            : 'No clean HTF imbalance';

  return {
    bias,
    bullDemandAligned,
    bearSupplyAligned,
    pdh,
    pdl,
    external4hHigh,
    external4hLow,
    pool1hHigh,
    pool1hLow,
    detailText: `${bias} · ${imbalanceText} · Draw: ${primaryTarget}`,
  };
}

function computeAsianSweepIctSignalForFx(
  asset: MarketAsset,
  preferredTimeframe?: Timeframe,
  enforceVolatilityFilter = true,
  economicEvents?: EconomicEvent[],
  enforceNewsBlackout = true
): IctSignalAnalysis {
  const sessionInfo = resolveCurrentSession();
  const { bars: rawMtfBars, timeframe: mtfTf, isRealOhlc: hasRealMtf } = extractBarsForTf(
    asset,
    preferredTimeframe === '30m' ? ['30m', '15m', '1h', '1D'] : ['15m', '30m', '1h', '1D'],
    6
  );
  const ltfPriority: Timeframe[] =
    preferredTimeframe === '1m' ? ['1m', '5m', '15m', '1D'] : ['5m', '1m', '15m', '1D'];
  const { bars: rawLtfBars, timeframe: ltfTf, isRealOhlc: hasRealLtf } = extractBarsForTf(
    asset,
    ltfPriority,
    6
  );

  if (!hasRealMtf || !hasRealLtf || rawMtfBars.length < 6 || rawLtfBars.length < 6) {
    const atr15mMetrics = compute15mAtrMetrics(asset, asset.price);
    const warmingPrice = formatPriceWithAsset(asset.price, asset);
    return {
      assetId: asset.id,
      symbol: asset.symbol,
      name: asset.shortName,
      direction: 'NEUTRAL',
      confidence: 20,
      setupName: 'WAIT · Warming Real OHLCV Bars',
      pdZone: 'Equilibrium',
      entryZone: `Standby (${warmingPrice})`,
      stopLoss: warmingPrice,
      targetPrice: warmingPrice,
      riskReward: 'WAIT',
      triggers: ['Awaiting real 15m/5m OHLC bars'],
      timeframe: ltfTf,
      currentPrice: asset.price,
      decimals: asset.decimals,
      currencyPrefix: asset.currencyPrefix,
      unitSuffix: asset.unitSuffix,
      evaluatedAt: asset.updatedAtEpoch ?? Date.now(),
      htfBias: 'Ranging',
      killzone: sessionInfo.label,
      sessionLabel: sessionInfo.label,
      sweepMssStatus: 'Awaiting verified multi-bar OHLC candles for Asian Range & MSS analysis.',
      assetClassLabel: atr15mMetrics.assetClassLabel,
      volatilityThresholdPct: atr15mMetrics.minPct,
      volatilityMaxPct: atr15mMetrics.maxPct,
      volatilityStatus: 'warming',
      volatilityPassed: false,
      atrSource: 'warming',
      executionStatus: 'standby',
      candleStageLabel: 'Awaiting Real OHLC',
      isClosedCandleConfirmed: false,
      isRealOhlc: false,
      setupGrade: 'WAIT',
      isAPlusSetup: false,
      invalidationTrigger: 'Hold flat until real OHLC candlestick bars finish syncing.',
      invalidationNote: 'Awaiting verified multi-bar OHLC data (synthetic candle fallback disabled).',
    };
  }

  const mtfSplit = splitConfirmedClosedBars(rawMtfBars, mtfTf);
  const mtfBars = mtfSplit.evalBars;
  const ltfSplit = splitConfirmedClosedBars(rawLtfBars, ltfTf);
  const ltfBars = ltfSplit.evalBars;

  const currentPrice = asset.price > 0 ? asset.price : ltfBars[ltfBars.length - 1]?.c ?? 0;

  // 1. HTF (4H/1H) Swing Structure Analysis
  const htf = analyzeHtfForFx(asset, currentPrice);
  const atr15mMetrics = compute15mAtrMetrics(asset, currentPrice);
  const slBuf = getAssetStopFloorBuffer(asset, atr15mMetrics.atr15m);
  const newsBlackout = checkMacroNewsBlackout(asset.id, economicEvents);
  const newsBlocked = enforceNewsBlackout && newsBlackout.active;

  // 2. Genuine Asian Session Range (07:00–12:00 WIB / 00:00–05:00 UTC) — NO fake 45% slice fallback
  const asianIndices: number[] = [];
  for (let i = 0; i < mtfBars.length; i++) {
    if (isAsianSessionUtcTimestamp(mtfBars[i].t)) {
      asianIndices.push(i);
    }
  }

  let asianBars: CandlePoint[] = [];
  let postAsianBars: CandlePoint[] = [];
  let hasGenuineAsianRange = false;

  if (asianIndices.length >= 4) {
    const blocks: Array<{ start: number; end: number }> = [];
    let bStart = asianIndices[0];
    let bPrev = asianIndices[0];
    for (let k = 1; k < asianIndices.length; k++) {
      if (asianIndices[k] - bPrev <= 2) {
        bPrev = asianIndices[k];
      } else {
        blocks.push({ start: bStart, end: bPrev });
        bStart = asianIndices[k];
        bPrev = asianIndices[k];
      }
    }
    blocks.push({ start: bStart, end: bPrev });

    const completedBlock =
      [...blocks].reverse().find((b) => b.end - b.start + 1 >= 4 && mtfBars.length - 1 - b.end >= 2) ??
      blocks[blocks.length - 1];

    if (completedBlock && completedBlock.end - completedBlock.start + 1 >= 4) {
      asianBars = mtfBars.slice(completedBlock.start, completedBlock.end + 1);
      postAsianBars = mtfBars.slice(completedBlock.end + 1);
      hasGenuineAsianRange = mtfTf === '15m' || mtfTf === '30m';
    }
  }

  const latestBarTs = ltfBars[ltfBars.length - 1]?.t;
  const nowMs = Date.now();
  const evaluatedAt =
    typeof asset.updatedAtEpoch === 'number' &&
    asset.updatedAtEpoch > 0 &&
    asset.marketSessionOpen
      ? asset.updatedAtEpoch
      : latestBarTs && latestBarTs > 0 && latestBarTs <= nowMs
        ? latestBarTs
        : nowMs;

  // If genuine Asian range is not available yet, never fabricate sweep signals
  if (!hasGenuineAsianRange || asianBars.length < 4) {
    const waitReason =
      asianIndices.length < 4
        ? 'Awaiting complete 07:00–12:00 WIB Asian Session 15M range bars'
        : 'Asian Session currently forming — waiting for post-Asia London/NY sweep';
    const refSl = htf.bias === 'Bearish' ? htf.pool1hHigh + slBuf.value : htf.pool1hLow - slBuf.value;
    const refTp2 = htf.bias === 'Bearish' ? htf.pdl : htf.pdh;
    const fxInvalidationTrigger = buildAssetInvalidationTrigger({
      assetClassLabel: atr15mMetrics.assetClassLabel,
      biasBullish: htf.bias !== 'Bearish',
      slFormatted: formatPriceWithAsset(refSl, asset),
      maxPct: atr15mMetrics.maxPct,
    });

    return {
      assetId: asset.id,
      symbol: asset.symbol,
      name: asset.shortName,
      direction: 'NEUTRAL',
      confidence: 28,
      setupName: `WAIT · ${waitReason.split('—')[0].trim()}`,
      pdZone: 'Equilibrium',
      entryZone: 'Standby (Awaiting Asian Range)',
      stopLoss: formatPriceWithAsset(refSl, asset),
      targetPrice: formatPriceWithAsset(refTp2, asset),
      riskReward: 'WAIT',
      triggers: ['Awaiting Asian Session Range', `HTF ${htf.bias}`],
      timeframe: ltfTf,
      currentPrice,
      decimals: asset.decimals,
      currencyPrefix: asset.currencyPrefix,
      unitSuffix: asset.unitSuffix,
      evaluatedAt,
      htfBias: htf.bias,
      killzone: sessionInfo.label,
      sessionLabel: sessionInfo.label,
      htfBiasDetail: htf.detailText,
      sweepMssStatus: waitReason,
      stopLossReason: `HTF structural invalidation ref (${slBuf.reason})`,
      tp1: formatPriceWithAsset(htf.bias === 'Bearish' ? htf.pool1hLow : htf.pool1hHigh, asset),
      tp2: formatPriceWithAsset(refTp2, asset),
      tp3: formatPriceWithAsset(htf.bias === 'Bearish' ? htf.external4hLow : htf.external4hHigh, asset),
      tp1Label: htf.bias === 'Bearish' ? '1H Range Low' : '1H Range High',
      tp2Label: 'PDH/PDL / 1H Liq Pool',
      tp3Label: '4H External Liq Pool',
      pyramidNote: 'Pyramiding inactive until Asian range sweep confirms.',
      invalidationNote: `NO TRADE (${waitReason}). ${fxInvalidationTrigger}`,
      invalidationTrigger: fxInvalidationTrigger,
      assetClassLabel: atr15mMetrics.assetClassLabel,
      liquidityTarget: `${formatPriceWithAsset(refTp2, asset)} (Projected)`,
      atrPct: atr15mMetrics.atr15mPct,
      volatilityThresholdPct: atr15mMetrics.minPct,
      volatilityMaxPct: atr15mMetrics.maxPct,
      volatilityStatus: atr15mMetrics.volatilityStatus,
      volatilityPassed: atr15mMetrics.volatilityPassed,
      atrSource: atr15mMetrics.atrSource,
      executionStatus: 'standby',
      projectedLevelsSummary: `Projected HTF Pool: ${formatPriceWithAsset(refTp2, asset)} · Ref SL ${formatPriceWithAsset(refSl, asset)}`,
      stopLossNum: refSl,
      tp2Num: refTp2,
      isClosedCandleConfirmed: ltfSplit.isClosedCandleConfirmed,
      candleStageLabel: ltfSplit.candleStageLabel,
      newsBlackoutActive: newsBlackout.active,
      newsBlackoutReason: newsBlackout.reason,
    };
  }

  const asianHigh = Math.max(...asianBars.map((b) => b.h));
  const asianLow = Math.min(...asianBars.map((b) => b.l));
  const asianSpan = Math.max(1e-6, asianHigh - asianLow);

  const atr15m = computeAtr(mtfBars, 14);
  const atrLtf = computeAtr(ltfBars, 14);
  const historicalSpans: number[] = [];
  if (mtfBars.length >= 20) {
    for (let i = 0; i <= mtfBars.length - 16; i += 4) {
      const seg = mtfBars.slice(i, i + 16);
      const sp = Math.max(...seg.map((x) => x.h)) - Math.min(...seg.map((x) => x.l));
      if (sp > 0) historicalSpans.push(sp);
    }
  }
  const medianHistoricalSpan =
    historicalSpans.length >= 2
      ? [...historicalSpans].sort((a, b) => a - b)[Math.floor(historicalSpans.length / 2)]
      : atr15m * 5.2;
  const normalAsianAtr = Math.max(atr15m * 4.5, medianHistoricalSpan);
  const asianRangeAtrRatio = Number((asianSpan / Math.max(1e-6, normalAsianAtr)).toFixed(2));
  const asianRangeTooWide = asianRangeAtrRatio > 1.5;

  const sweepScanBars = postAsianBars.slice(-24);
  const postHigh = sweepScanBars.length > 0 ? Math.max(...sweepScanBars.map((b) => b.h)) : asianHigh;
  const postLow = sweepScanBars.length > 0 ? Math.min(...sweepScanBars.map((b) => b.l)) : asianLow;

  const lowSweepBar = sweepScanBars.find((b) => b.l < asianLow);
  const highSweepBar = sweepScanBars.find((b) => b.h > asianHigh);
  const sweptAsianLow = Boolean(lowSweepBar);
  const sweptAsianHigh = Boolean(highSweepBar);
  const lowSweepTs = lowSweepBar?.t ?? 0;
  const highSweepTs = highSweepBar?.t ?? 0;

  const sweepOccurredInKillzone = sweepScanBars.some(
    (b) => (b.l < asianLow || b.h > asianHigh) && (isKillzoneUtcTimestamp(b.t) || sessionInfo.inKillzone)
  );

  // 3. Chronological LTF (5M/1M) Close Back Inside Range + MSS + Clean FVG strictly AFTER Sweep
  const lastLtf = ltfBars[ltfBars.length - 1];
  const postLowSweepLtf = lowSweepTs > 0 ? ltfBars.filter((b) => b.t >= lowSweepTs) : ltfBars.slice(-12);
  const postHighSweepLtf = highSweepTs > 0 ? ltfBars.filter((b) => b.t >= highSweepTs) : ltfBars.slice(-12);

  const preLowSweepLtf = ltfBars.filter((b) => lowSweepTs === 0 || b.t < lowSweepTs).slice(-8);
  const preHighSweepLtf = ltfBars.filter((b) => highSweepTs === 0 || b.t < highSweepTs).slice(-8);

  const ltfSwingHighBeforeLowSweep =
    preLowSweepLtf.length >= 2 ? Math.max(...preLowSweepLtf.map((b) => b.h)) : asianHigh;
  const ltfSwingLowBeforeHighSweep =
    preHighSweepLtf.length >= 2 ? Math.min(...preHighSweepLtf.map((b) => b.l)) : asianLow;

  const closedBackInsideFromLow =
    sweptAsianLow &&
    lastLtf.c > asianLow &&
    postLowSweepLtf.some((b) => b.c > asianLow);
  const closedBackInsideFromHigh =
    sweptAsianHigh &&
    lastLtf.c < asianHigh &&
    postHighSweepLtf.some((b) => b.c < asianHigh);

  const bullDisplacement = postLowSweepLtf
    .slice(-6)
    .some((b) => b.c > b.o && b.c - b.o >= atrLtf * 0.8 && b.c > asianLow);
  const bearDisplacement = postHighSweepLtf
    .slice(-6)
    .some((b) => b.c < b.o && b.o - b.c >= atrLtf * 0.8 && b.c < asianHigh);

  const bullMssConfirmed =
    closedBackInsideFromLow &&
    bullDisplacement &&
    (currentPrice > ltfSwingHighBeforeLowSweep ||
      postLowSweepLtf.slice(-5).some((b) => b.c > ltfSwingHighBeforeLowSweep));
  const bearMssConfirmed =
    closedBackInsideFromHigh &&
    bearDisplacement &&
    (currentPrice < ltfSwingLowBeforeHighSweep ||
      postHighSweepLtf.slice(-5).some((b) => b.c < ltfSwingLowBeforeHighSweep));

  // Chronological FVG: formed strictly after sweep timestamp
  const imbBullLtf = findUnmitigatedFvgAndOb(ltfBars, atrLtf, 22, 0.14, 0.7, lowSweepTs);
  const imbBearLtf = findUnmitigatedFvgAndOb(ltfBars, atrLtf, 22, 0.14, 0.7, highSweepTs);

  const bullPullbackFvg = Boolean(
    imbBullLtf.bullFvg &&
      currentPrice >= imbBullLtf.bullFvg.low - atrLtf * 0.55 &&
      currentPrice <= imbBullLtf.bullFvg.high + atrLtf * 1.4
  );
  const bearPullbackFvg = Boolean(
    imbBearLtf.bearFvg &&
      currentPrice <= imbBearLtf.bearFvg.high + atrLtf * 0.55 &&
      currentPrice >= imbBearLtf.bearFvg.low - atrLtf * 1.4
  );

  const atrPct = atr15mMetrics.atr15mPct;
  const volatilityThresholdPct = atr15mMetrics.minPct;
  const volatilityMaxPct = atr15mMetrics.maxPct;
  const volatilityStatus = atr15mMetrics.volatilityStatus;
  const volatilityPassed = atr15mMetrics.volatilityPassed;

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
        ? `15m ATR ${atrPct.toFixed(3)}% > ${volatilityMaxPct.toFixed(3)}% erratic volatility cap (sweeps unstable)`
        : `15m ATR ${atrPct.toFixed(3)}% < ${volatilityThresholdPct.toFixed(3)}% minimum floor`
    );
  }
  if (asianRangeTooWide) {
    waitReasons.push(
      `Asian range abnormally wide (${asianRangeAtrRatio.toFixed(2)}x normal ATR > 1.50x cap)`
    );
  }
  if (sweptAsianLow && sweptAsianHigh) {
    waitReasons.push('Both Asian High & Asian Low liquidity already swept');
  } else if (!sweptAsianLow && !sweptAsianHigh) {
    waitReasons.push(
      `Neither Asian High (${formatPriceWithAsset(asianHigh, asset)}) nor Asian Low (${formatPriceWithAsset(asianLow, asset)}) swept yet`
    );
  }

  const buyValidPreRR =
    !asianRangeTooWide &&
    sweptAsianLow &&
    !sweptAsianHigh &&
    bullMssConfirmed &&
    Boolean(imbBullLtf.bullFvg) &&
    bullPullbackFvg &&
    (htf.bias === 'Bullish' || htf.bullDemandAligned);

  const sellValidPreRR =
    !asianRangeTooWide &&
    sweptAsianHigh &&
    !sweptAsianLow &&
    bearMssConfirmed &&
    Boolean(imbBearLtf.bearFvg) &&
    bearPullbackFvg &&
    (htf.bias === 'Bearish' || htf.bearSupplyAligned);

  if (!buyValidPreRR && !sellValidPreRR && waitReasons.length === 0) {
    if (sweptAsianLow && !sweptAsianHigh) {
      if (!closedBackInsideFromLow || !bullMssConfirmed) {
        waitReasons.push('Asian Low swept — awaiting post-sweep LTF Bullish MSS inside range');
      } else if (!imbBullLtf.bullFvg || !bullPullbackFvg) {
        waitReasons.push('Bullish MSS printed — awaiting pullback into post-sweep Bullish FVG');
      } else {
        waitReasons.push(`HTF (${htf.bias}) does not support counter-trend Buy yet`);
      }
    } else if (sweptAsianHigh && !sweptAsianLow) {
      if (!closedBackInsideFromHigh || !bearMssConfirmed) {
        waitReasons.push('Asian High swept — awaiting post-sweep LTF Bearish MSS inside range');
      } else if (!imbBearLtf.bearFvg || !bearPullbackFvg) {
        waitReasons.push('Bearish MSS printed — awaiting pullback into post-sweep Bearish FVG');
      } else {
        waitReasons.push(`HTF (${htf.bias}) does not support counter-trend Sell yet`);
      }
    }
  }

  let projLow = htf.bias === 'Bearish' ? (asianLow + asianHigh) / 2 : asianLow;
  let projHigh = htf.bias === 'Bearish' ? asianHigh : (asianLow + asianHigh) / 2;
  let slVal = htf.bias === 'Bearish' ? asianHigh + slBuf.value : asianLow - slBuf.value;
  let tp1Val = htf.bias === 'Bearish' ? asianLow : asianHigh;
  let tp2Val = htf.bias === 'Bearish' ? htf.pdl : htf.pdh;
  let tp3Val = htf.bias === 'Bearish' ? htf.external4hLow : htf.external4hHigh;
  let rrRatio = 0;
  let stopLossReason = `Reference invalidation beyond Asian boundary (${slBuf.reason})`;
  let invalidationNote = '';
  let pyramidNote = '';
  let sweepMssStatus = '';
  let setupName = '';
  let activeFvgZone: string | undefined;

  const maxAllowedFxSl = atr15mMetrics.atr15m * 2.5;

  if (buyValidPreRR && imbBullLtf.bullFvg) {
    projLow = imbBullLtf.bullFvg.low;
    projHigh = imbBullLtf.bullFvg.high;
    activeFvgZone = formatBand(projLow, projHigh, asset);
    const entryMid = (projLow + projHigh) / 2;
    slVal = Math.min(postLow, asianLow, projLow) - slBuf.value;
    const risk = Math.max(1e-6, entryMid - slVal);

    // Strictly anchor targets to REAL liquidity pools (monotonic: entryMid < TP1 <= TP2 <= TP3, NO synthetic 3R inflation!)
    const rawTp1 = asianHigh > entryMid + risk * 0.6 ? asianHigh : Math.min(htf.pool1hHigh, htf.pdh);
    tp1Val = Math.max(entryMid + risk * 0.5, rawTp1);
    tp2Val = Math.max(tp1Val, htf.pdh, htf.pool1hHigh);
    tp3Val = Math.max(tp2Val, htf.external4hHigh);
    rrRatio = (tp2Val - entryMid) / risk;

    if (risk > maxAllowedFxSl) {
      waitReasons.push(`Stop Too Wide (${formatPriceWithAsset(risk, asset)} > 2.5x 15m ATR cap)`);
    } else if (rrRatio < 3.0) {
      waitReasons.push(`Real liquidity R:R to TP2 is 1:${rrRatio.toFixed(1)} (below strict 1:3.0 minimum)`);
    } else if (newsBlocked && newsBlackout.reason) {
      waitReasons.push(newsBlackout.reason);
    } else if (volatilityStatus === 'warming' || (enforceVolatilityFilter && !volatilityPassed)) {
      if (waitReasons.length === 0) {
        waitReasons.push(`15m ATR ${atrPct.toFixed(3)}% outside safe band`);
      }
    } else {
      const liveCheck = checkLiveSetupValidity({
        direction: 'BUY',
        currentPrice,
        slVal,
        tp1Val,
      });
      if (!liveCheck.valid) {
        executionStatus = liveCheck.status;
        if (liveCheck.reason) waitReasons.unshift(liveCheck.reason);
      } else {
        direction = 'BUY';
        executionStatus = 'active';
        setupName = 'Asian Low Sweep + Bullish MSS & FVG';
        stopLossReason = `Below sweep wick (${formatPriceWithAsset(postLow, asset)}) + ${slBuf.reason}`;
        sweepMssStatus = `15M swept Asian Low (${formatPriceWithAsset(asianLow, asset)} → ${formatPriceWithAsset(postLow, asset)})${sweepOccurredInKillzone ? ' in Killzone' : ''}; ${ltfTf.toUpperCase()} closed inside range with post-sweep Bullish MSS + clean FVG`;
        invalidationNote = buildAssetInvalidationTrigger({
          assetClassLabel: atr15mMetrics.assetClassLabel,
          biasBullish: true,
          slFormatted: formatPriceWithAsset(slVal, asset),
          maxPct: volatilityMaxPct,
        });
        pyramidNote = `Pyramid Trigger: Move SL to BE at TP1 (${formatPriceWithAsset(tp1Val, asset)}); add 2nd pyramid leg on fresh 15M Bullish FVG retest toward ${formatPriceWithAsset(tp3Val, asset)}.`;
      }
    }
  } else if (sellValidPreRR && imbBearLtf.bearFvg) {
    projLow = imbBearLtf.bearFvg.low;
    projHigh = imbBearLtf.bearFvg.high;
    activeFvgZone = formatBand(projLow, projHigh, asset);
    const entryMid = (projLow + projHigh) / 2;
    slVal = Math.max(postHigh, asianHigh, projHigh) + slBuf.value;
    const risk = Math.max(1e-6, slVal - entryMid);

    // Strictly anchor targets to REAL liquidity pools (monotonic: entryMid > TP1 >= TP2 >= TP3, NO synthetic 3R inflation!)
    const rawTp1 = asianLow < entryMid - risk * 0.6 ? asianLow : Math.max(htf.pool1hLow, htf.pdl);
    tp1Val = Math.min(entryMid - risk * 0.5, rawTp1);
    tp2Val = Math.min(tp1Val, htf.pdl, htf.pool1hLow);
    tp3Val = Math.min(tp2Val, htf.external4hLow);
    rrRatio = (entryMid - tp2Val) / risk;

    if (risk > maxAllowedFxSl) {
      waitReasons.push(`Stop Too Wide (${formatPriceWithAsset(risk, asset)} > 2.5x 15m ATR cap)`);
    } else if (rrRatio < 3.0) {
      waitReasons.push(`Real liquidity R:R to TP2 is 1:${rrRatio.toFixed(1)} (below strict 1:3.0 minimum)`);
    } else if (newsBlocked && newsBlackout.reason) {
      waitReasons.push(newsBlackout.reason);
    } else if (volatilityStatus === 'warming' || (enforceVolatilityFilter && !volatilityPassed)) {
      if (waitReasons.length === 0) {
        waitReasons.push(`15m ATR ${atrPct.toFixed(3)}% outside safe band`);
      }
    } else {
      const liveCheck = checkLiveSetupValidity({
        direction: 'SELL',
        currentPrice,
        slVal,
        tp1Val,
      });
      if (!liveCheck.valid) {
        executionStatus = liveCheck.status;
        if (liveCheck.reason) waitReasons.unshift(liveCheck.reason);
      } else {
        direction = 'SELL';
        executionStatus = 'active';
        setupName = 'Asian High Sweep + Bearish MSS & FVG';
        stopLossReason = `Above sweep wick (${formatPriceWithAsset(postHigh, asset)}) + ${slBuf.reason}`;
        sweepMssStatus = `15M swept Asian High (${formatPriceWithAsset(asianHigh, asset)} → ${formatPriceWithAsset(postHigh, asset)})${sweepOccurredInKillzone ? ' in Killzone' : ''}; ${ltfTf.toUpperCase()} closed inside range with post-sweep Bearish MSS + clean FVG`;
        invalidationNote = buildAssetInvalidationTrigger({
          assetClassLabel: atr15mMetrics.assetClassLabel,
          biasBullish: false,
          slFormatted: formatPriceWithAsset(slVal, asset),
          maxPct: volatilityMaxPct,
        });
        pyramidNote = `Pyramid Trigger: Move SL to BE at TP1 (${formatPriceWithAsset(tp1Val, asset)}); add 2nd pyramid leg on fresh 15M Bearish FVG retest toward ${formatPriceWithAsset(tp3Val, asset)}.`;
      }
    }
  }

  const fxInvalidationTrigger = buildAssetInvalidationTrigger({
    assetClassLabel: atr15mMetrics.assetClassLabel,
    biasBullish: direction === 'SELL' ? false : htf.bias !== 'Bearish',
    slFormatted: formatPriceWithAsset(slVal, asset),
    maxPct: volatilityMaxPct,
  });

  if (direction === 'NEUTRAL') {
    const primaryWait = waitReasons[0] || 'Awaiting Asian range sweep & LTF MSS/FVG displacement';
    setupName = `WAIT · ${primaryWait.split('(')[0].trim()}`;
    sweepMssStatus = `Asian Range ${formatBand(asianLow, asianHigh, asset)} (${asianRangeAtrRatio.toFixed(2)}x ATR) · ${primaryWait}`;
    invalidationNote = `NO TRADE (${primaryWait}). ${fxInvalidationTrigger}`;
    pyramidNote = 'Pyramiding inactive until primary TP1 (50% + BE) triggers on a confirmed setup.';
  }

  const posInAsian = (currentPrice - asianLow) / asianSpan;
  const pdZone: IctSignalAnalysis['pdZone'] =
    posInAsian <= 0.44 ? 'Discount' : posInAsian >= 0.56 ? 'Premium' : 'Equilibrium';

  const scoreBreakdown = {
    sweep: sweptAsianLow !== sweptAsianHigh ? (sweepOccurredInKillzone ? 24 : 18) : 0,
    displacementMss: bullMssConfirmed || bearMssConfirmed ? 24 : 0,
    imbalanceFvgOb:
      (direction === 'BUY' && bullPullbackFvg) || (direction === 'SELL' && bearPullbackFvg)
        ? 24
        : imbBullLtf.bullFvg || imbBearLtf.bearFvg
          ? 12
          : 0,
    oteFib: rrRatio >= 3.0 ? 16 : 4,
    htfConfluence:
      (htf.bias !== 'Ranging' ? 12 : htf.bullDemandAligned || htf.bearSupplyAligned ? 8 : 0) +
      (sessionInfo.inKillzone ? 4 : 0),
  };

  const precisionScore = Math.min(
    100,
    scoreBreakdown.sweep +
      scoreBreakdown.displacementMss +
      scoreBreakdown.imbalanceFvgOb +
      scoreBreakdown.oteFib +
      Math.min(12, scoreBreakdown.htfConfluence)
  );

  const confidence =
    direction === 'NEUTRAL'
      ? Math.min(48, Math.max(20, Math.round(precisionScore * 0.5)))
      : Math.min(97, Math.max(76, Math.round(precisionScore)));

  const triggers: string[] = [];
  if (sweptAsianLow && !sweptAsianHigh) triggers.push('Asian Low Swept');
  if (sweptAsianHigh && !sweptAsianLow) triggers.push('Asian High Swept');
  if (sweptAsianLow && sweptAsianHigh) triggers.push('Both Sides Swept (Skip)');
  if (asianRangeTooWide) triggers.push(`Asian >1.5x ATR (${asianRangeAtrRatio}x)`);
  if (bullMssConfirmed || bearMssConfirmed) triggers.push('Post-Sweep LTF MSS');
  if (imbBullLtf.bullFvg || imbBearLtf.bearFvg) triggers.push('Post-Sweep FVG');
  if (rrRatio >= 3.0) triggers.push(`R:R 1:${rrRatio.toFixed(1)}`);

  const projectedLevelsSummary = `Asian ${formatBand(asianLow, asianHigh, asset)} · SL Ref ${formatPriceWithAsset(slVal, asset)} · Pool ${formatPriceWithAsset(tp2Val, asset)}`;

  const { setupGrade, isAPlusSetup } = computeSetupGrade({
    direction,
    inKillzone: sessionInfo.inKillzone,
    volatilityPassed,
    newsBlocked,
    confidence,
    realRr: rrRatio,
    htfAligned:
      direction === 'BUY'
        ? htf.bias === 'Bullish' || htf.bullDemandAligned
        : htf.bias === 'Bearish' || htf.bearSupplyAligned,
  });
  const usdExposure = resolveUsdExposure(asset.id, direction);

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.shortName,
    direction,
    confidence,
    setupName,
    pdZone,
    entryZone:
      direction === 'NEUTRAL'
        ? `Standby (${formatBand(projLow, projHigh, asset)})`
        : formatBand(projLow, projHigh, asset),
    stopLoss: formatPriceWithAsset(slVal, asset),
    targetPrice: formatPriceWithAsset(tp2Val, asset),
    riskReward: rrRatio >= 3.0 ? `1:${rrRatio.toFixed(1)}` : rrRatio > 0 ? `WAIT (1:${rrRatio.toFixed(1)} < 1:3)` : 'WAIT',
    triggers: triggers.length > 0 ? triggers : ['Wait for Asian Sweep'],
    timeframe: ltfTf,
    currentPrice,
    decimals: asset.decimals,
    currencyPrefix: asset.currencyPrefix,
    unitSuffix: asset.unitSuffix,
    evaluatedAt,
    htfBias: htf.bias,
    killzone: sessionInfo.label,
    sessionLabel: sessionInfo.label,
    htfBiasDetail: htf.detailText,
    sweepMssStatus,
    stopLossReason,
    tp1: formatPriceWithAsset(tp1Val, asset),
    tp2: formatPriceWithAsset(tp2Val, asset),
    tp3: formatPriceWithAsset(tp3Val, asset),
    tp1Label: direction === 'SELL' ? 'Opposing Asian Low' : 'Opposing Asian High',
    tp2Label: 'PDH/PDL / 1H Liq Pool',
    tp3Label: '4H External Liq Pool',
    pyramidNote,
    invalidationNote,
    invalidationTrigger: fxInvalidationTrigger,
    assetClassLabel: atr15mMetrics.assetClassLabel,
    liquidityTarget: `${formatPriceWithAsset(tp2Val, asset)} (TP2)`,
    atrPct,
    volatilityThresholdPct,
    volatilityMaxPct,
    volatilityStatus,
    volatilityPassed,
    atrSource: atr15mMetrics.atrSource,
    executionStatus,
    projectedLevelsSummary,
    asianHigh,
    asianLow,
    asianRangeAtrRatio,
    fvgZone: activeFvgZone,
    precisionScore,
    scoreBreakdown,
    entryLowNum: direction === 'NEUTRAL' ? undefined : Math.min(projLow, projHigh),
    entryHighNum: direction === 'NEUTRAL' ? undefined : Math.max(projLow, projHigh),
    stopLossNum: slVal,
    tp1Num: tp1Val,
    tp2Num: tp2Val,
    tp3Num: tp3Val,
    isClosedCandleConfirmed: ltfSplit.isClosedCandleConfirmed,
    candleStageLabel: ltfSplit.candleStageLabel,
    newsBlackoutActive: newsBlackout.active,
    newsBlackoutReason: newsBlackout.reason,
    isRealOhlc: true,
    setupGrade,
    isAPlusSetup,
    usdExposure,
  };
}

export function computeIctSignal(
  asset: MarketAsset,
  preferredTimeframe?: Timeframe,
  enforceVolatilityFilter = true,
  economicEvents?: EconomicEvent[],
  enforceNewsBlackout = true
): IctSignalAnalysis {
  if (PURE_ICT_ASSET_IDS.has(asset.id)) {
    return computePureIctSignalForXauBtc(
      asset,
      preferredTimeframe,
      enforceVolatilityFilter,
      economicEvents,
      enforceNewsBlackout
    );
  }
  return computeAsianSweepIctSignalForFx(
    asset,
    preferredTimeframe,
    enforceVolatilityFilter,
    economicEvents,
    enforceNewsBlackout
  );
}

export function scanAllIctSignals(
  assets: MarketAsset[],
  preferredByAsset?: Record<string, Timeframe>,
  enforceVolatilityFilter = true,
  economicEvents?: EconomicEvent[],
  enforceNewsBlackout = true
): IctSignalAnalysis[] {
  return assets
    .filter(isIctEligibleAsset)
    .map((asset) =>
      computeIctSignal(
        asset,
        preferredByAsset?.[asset.id],
        enforceVolatilityFilter,
        economicEvents,
        enforceNewsBlackout
      )
    )
    .sort((a, b) => {
      const aActive = a.direction === 'NEUTRAL' ? 0 : 1;
      const bActive = b.direction === 'NEUTRAL' ? 0 : 1;
      if (aActive !== bActive) return bActive - aActive;
      const aCore = PURE_ICT_ASSET_IDS.has(a.assetId) ? 1 : 0;
      const bCore = PURE_ICT_ASSET_IDS.has(b.assetId) ? 1 : 0;
      if (aCore !== bCore) return bCore - aCore;
      return b.confidence - a.confidence;
    });
}
