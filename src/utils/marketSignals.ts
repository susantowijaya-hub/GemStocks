import {
  Asset5mVolatility,
  FearGreedInfo,
  FearGreedZone,
  MarketAsset,
  MarketSignalInfo,
  OverallMarketFearGreed,
  RiskRegimeInfo,
  RiskRegimeSectorBreakdown,
  RiskRegimeStatus,
  SignalHistoryRecord,
  SignalTier,
  StockDeskSurvivalStatus,
  StockExecutionAction,
  StockMover,
  StocksMoversBucket,
  StockTradePlan,
  Timeframe,
  UnifiedMarketPulse,
  VolatilityFearGreedInfo,
} from '../types/market';

const parsedNumberCache = new Map<string, number>();
const assetSignalCache = new WeakMap<MarketAsset, MarketSignalInfo>();
const stockSignalCache = new WeakMap<StockMover, MarketSignalInfo>();
const assetFearGreedCache = new WeakMap<MarketAsset, FearGreedInfo>();
const stockFearGreedCache = new WeakMap<StockMover, FearGreedInfo>();
const overallFearGreedCache = new WeakMap<MarketAsset[], OverallMarketFearGreed>();
const assetTimeframeReturnCache = new WeakMap<MarketAsset, Map<string, AssetTimeframeReturn>>();

export function parseFormattedMarketNumber(raw: string | number | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (!raw) return NaN;
  const cached = parsedNumberCache.get(raw);
  if (cached !== undefined) return cached;

  const cleaned = String(raw).replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  const result = Number.isFinite(num) ? num : NaN;
  if (parsedNumberCache.size >= 600) {
    parsedNumberCache.clear();
  }
  parsedNumberCache.set(raw, result);
  return result;
}

export function computeTechnicalSignal(params: {
  price: number;
  prevClose: number;
  changePercent: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  series?: number[];
  w52Pct?: number;
  isYield?: boolean;
  assetId?: string;
  category?: string;
  foreignFlowSide?: 'BUY' | 'SELL';
}): MarketSignalInfo {
  const {
    price,
    prevClose,
    changePercent,
    open,
    dayHigh,
    dayLow,
    series,
    w52Pct,
    isYield,
    assetId = '',
    category = '',
    foreignFlowSide,
  } = params;

  const upper = assetId.toUpperCase();
  const isCrypto =
    category === 'Crypto' ||
    upper.includes('BTC') ||
    upper.includes('ETH') ||
    upper.endsWith('-USD');
  const isGold =
    upper.includes('XAU') || upper.includes('GC=F');
  const isStock = category === 'stocks' || category === 'Equities';

  // Daily-trading volatility thresholds per asset class
  const strongTh = isCrypto ? 2.2 : isStock ? 1.75 : isGold ? 1.1 : 1.15;
  const mildTh = isCrypto ? 0.65 : isStock ? 0.45 : isGold ? 0.30 : 0.32;

  let score = 0;
  const reasons: string[] = [];

  // 1. Volatility-calibrated intraday session delta
  if (changePercent >= strongTh) {
    score += 34;
    reasons.push(`Strong session drive (+${changePercent.toFixed(2)}%)`);
  } else if (changePercent >= mildTh) {
    score += 18;
    reasons.push(`Positive session bias (+${changePercent.toFixed(2)}%)`);
  } else if (changePercent <= -strongTh) {
    score -= 34;
    reasons.push(`Heavy selling tape (${changePercent.toFixed(2)}%)`);
  } else if (changePercent <= -mildTh) {
    score -= 18;
    reasons.push(`Negative session drift (${changePercent.toFixed(2)}%)`);
  } else {
    reasons.push(`Tight range (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
  }

  // 2. Opening Drive (Price vs Daily Open & Previous Close)
  if (typeof open === 'number' && Number.isFinite(open) && open > 0 && price > 0) {
    const aboveOpen = price >= open * 1.0005;
    const belowOpen = price <= open * 0.9995;
    const abovePrev = prevClose > 0 ? price >= prevClose : aboveOpen;
    if (aboveOpen && abovePrev) {
      score += 18;
      reasons.push('Holding above Open');
    } else if (belowOpen && !abovePrev) {
      score -= 18;
      reasons.push('Below Open & Prev Close');
    } else if (aboveOpen) {
      score += 8;
      reasons.push('Intraday Open reclaim');
    } else if (belowOpen) {
      score -= 8;
      reasons.push('Fading below Open');
    }
  } else if (prevClose > 0 && price > 0) {
    if (price > prevClose * 1.001) score += 10;
    else if (price < prevClose * 0.999) score -= 10;
  }

  // 3. Internal Bar Strength / Intraday Range Position (IBS)
  if (
    typeof dayHigh === 'number' &&
    typeof dayLow === 'number' &&
    Number.isFinite(dayHigh) &&
    Number.isFinite(dayLow) &&
    dayHigh > dayLow &&
    price > 0
  ) {
    const ibs = (price - dayLow) / (dayHigh - dayLow);
    if (ibs >= 0.78) {
      score += 20;
      reasons.push('Upper quartile close');
    } else if (ibs >= 0.60) {
      score += 10;
    } else if (ibs <= 0.22) {
      score -= 20;
      reasons.push('Lower quartile pressure');
    } else if (ibs <= 0.40) {
      score -= 10;
    }
  }

  // 4. Intraday micro-trend slope & session-mean (pseudo-VWAP) alignment
  if (Array.isArray(series) && series.length >= 6 && price > 0) {
    const valid = series.filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (valid.length >= 6) {
      const sessionMean = valid.reduce((a, b) => a + b, 0) / valid.length;
      const tail3 = valid.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const priorWindow = valid.slice(-8, -3);
      const priorMean =
        priorWindow.length > 0
          ? priorWindow.reduce((a, b) => a + b, 0) / priorWindow.length
          : sessionMean;
      const risingSlope = tail3 > priorMean * 1.0005;
      const fallingSlope = tail3 < priorMean * 0.9995;

      if (price >= sessionMean && risingSlope) {
        score += 16;
        reasons.push('Rising above session mean');
      } else if (price <= sessionMean && fallingSlope) {
        score -= 16;
        reasons.push('Sliding below session mean');
      } else if (price >= sessionMean) {
        score += 7;
      } else {
        score -= 7;
      }
    }
  }

  // 5. Light 52W structural filter & institutional flow alignment
  if (typeof w52Pct === 'number' && Number.isFinite(w52Pct)) {
    if (w52Pct >= 75) score += 8;
    else if (w52Pct <= 25) score -= 8;
  }

  if (foreignFlowSide === 'BUY') {
    score += 10;
    reasons.push('Foreign Net Buy');
  } else if (foreignFlowSide === 'SELL') {
    score -= 10;
    reasons.push('Foreign Net Sell');
  }

  const clamped = Math.max(-100, Math.min(100, Math.round(score)));

  let tier: SignalTier = 'Neutral';
  let direction: MarketSignalInfo['direction'] = 'neutral';
  let shortLabel = 'Neutral';

  if (clamped >= 48) {
    tier = 'Strong Bull';
    direction = 'bull';
    shortLabel = isYield ? 'Yield Surge' : 'Strong Bull';
  } else if (clamped >= 16) {
    tier = 'Bull Signal';
    direction = 'bull';
    shortLabel = 'Bull';
  } else if (clamped <= -48) {
    tier = 'Strong Bear';
    direction = 'bear';
    shortLabel = isYield ? 'Yield Drop' : 'Strong Bear';
  } else if (clamped <= -16) {
    tier = 'Bear Signal';
    direction = 'bear';
    shortLabel = 'Bear';
  }

  return {
    tier,
    direction,
    score: clamped,
    shortLabel,
    reason: reasons.slice(0, 3).join(' · '),
  };
}

export function getAssetSignal(asset: MarketAsset): MarketSignalInfo {
  const cached = assetSignalCache.get(asset);
  if (cached) return cached;

  const highNum = parseFormattedMarketNumber(asset.dayHigh);
  const lowNum = parseFormattedMarketNumber(asset.dayLow);
  const openNum = parseFormattedMarketNumber(asset.open);
  const series = asset.chartSeries['1D']?.length ? asset.chartSeries['1D'] : asset.sparklinePoints;

  const result = computeTechnicalSignal({
    price: asset.price,
    prevClose: asset.prevClose,
    changePercent: asset.changePercent,
    open: Number.isFinite(openNum) ? openNum : undefined,
    dayHigh: Number.isFinite(highNum) ? highNum : undefined,
    dayLow: Number.isFinite(lowNum) ? lowNum : undefined,
    series,
    w52Pct: asset.w52Pct,
    isYield: asset.isYield,
    assetId: asset.id,
    category: asset.category,
  });
  assetSignalCache.set(asset, result);
  return result;
}

export function getStockSignal(stock: StockMover): MarketSignalInfo {
  const cached = stockSignalCache.get(stock);
  if (cached) return cached;

  const result = computeTechnicalSignal({
    price: stock.price,
    prevClose: stock.prevClose,
    changePercent: stock.changePercent,
    dayHigh: stock.dayHigh,
    dayLow: stock.dayLow,
    series: stock.sparklinePoints,
    assetId: stock.symbol,
    category: 'stocks',
    foreignFlowSide: stock.foreignFlowSide,
  });
  stockSignalCache.set(stock, result);
  return result;
}

function clamp0100(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function getFearGreedZone(score: number): { zone: FearGreedZone; shortLabel: string } {
  if (score >= 75) return { zone: 'Extreme Greed', shortLabel: 'Ex. Greed' };
  if (score >= 55) return { zone: 'Greed', shortLabel: 'Greed' };
  if (score <= 24) return { zone: 'Extreme Fear', shortLabel: 'Ex. Fear' };
  if (score <= 44) return { zone: 'Fear', shortLabel: 'Fear' };
  return { zone: 'Neutral', shortLabel: 'Neutral' };
}

function deriveSevenDayHistory(
  currentScore: number,
  providedHistory: number[] | undefined,
  series: number[] | undefined,
  w52Pct: number | undefined,
  changePercent: number,
  seedId: string
): number[] {
  if (Array.isArray(providedHistory) && providedHistory.length >= 2) {
    const cleaned = providedHistory
      .filter((v) => typeof v === 'number' && Number.isFinite(v))
      .map((v) => clamp0100(v));
    if (cleaned.length >= 2) {
      const prior = cleaned.slice(-7, -1);
      const padded =
        prior.length >= 6
          ? prior.slice(-6)
          : [...Array(6 - prior.length).fill(cleaned[0]), ...prior];
      return [...padded, currentScore];
    }
  }

  // Derive 6 prior buckets from intraday/weekly price series when backend 7D series isn't supplied
  if (Array.isArray(series) && series.length >= 7) {
    const valid = series.filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (valid.length >= 7) {
      const sMin = Math.min(...valid);
      const sMax = Math.max(...valid);
      const sRange = sMax - sMin;
      const result: number[] = [];
      for (let i = 0; i < 6; i++) {
        const idx = Math.min(valid.length - 1, Math.floor((i / 6) * (valid.length - 1)));
        const pt = valid[idx];
        const rel = sRange > 0 ? ((pt - sMin) / sRange - 0.5) * 26 : 0;
        const driftWeight = (6 - i) / 6;
        const baseAnchor = typeof w52Pct === 'number' && Number.isFinite(w52Pct) ? w52Pct * 0.35 + 32 : 50;
        result.push(clamp0100(currentScore * (1 - driftWeight * 0.35) + (baseAnchor + rel) * (driftWeight * 0.35)));
      }
      result.push(currentScore);
      return result;
    }
  }

  // Deterministic structural drift back 6 days anchored to 52W range & session slope
  let seed = 0;
  for (let i = 0; i < seedId.length; i++) {
    seed = (seed * 31 + seedId.charCodeAt(i)) % 997;
  }
  const structuralBase =
    typeof w52Pct === 'number' && Number.isFinite(w52Pct)
      ? clamp0100(40 + (w52Pct - 50) * 0.38)
      : clamp0100(currentScore - Math.tanh(changePercent / 2.2) * 10);

  const history: number[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const wave = Math.sin((seed % 11) + i * 1.15) * 4.2;
    const val = structuralBase * (1 - t) + currentScore * t + wave;
    history.push(clamp0100(val));
  }
  history.push(currentScore);
  return history;
}

export function computeFearGreedIndex(params: {
  price: number;
  prevClose: number;
  changePercent: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  series?: number[];
  history7d?: number[];
  w52Pct?: number;
  isYield?: boolean;
  assetId?: string;
  category?: string;
  foreignFlowSide?: 'BUY' | 'SELL';
}): FearGreedInfo {
  const {
    price,
    prevClose,
    changePercent,
    open,
    dayHigh,
    dayLow,
    series,
    history7d,
    w52Pct,
    assetId = '',
    category = '',
    foreignFlowSide,
  } = params;

  const upper = assetId.toUpperCase();
  const isCrypto =
    category === 'Crypto' ||
    upper.includes('BTC') ||
    upper.includes('ETH') ||
    upper.endsWith('-USD');
  const isGoldOrOil =
    upper.includes('XAU') ||
    upper.includes('GC=F') ||
    upper.includes('WTI') ||
    upper.includes('BRENT') ||
    upper.includes('CL=F');
  const isStock = category === 'stocks' || category === 'Equities';
  const isFxOrYield = category === 'forex-yields' || upper.includes('USD') || upper.includes('DXY') || upper.includes('10Y') || upper.includes('30Y');

  // Volatility scale calibrating +-100% saturation per asset class
  const volScale = isCrypto ? 3.2 : isStock ? 2.15 : isGoldOrOil ? 1.45 : isFxOrYield ? 0.85 : 1.35;

  // 1. Price Momentum & Opening Drive (0..100)
  let momentum = 50 + Math.tanh(changePercent / volScale) * 42;
  if (typeof open === 'number' && Number.isFinite(open) && open > 0 && price > 0) {
    const openDeltaPct = ((price - open) / open) * 100;
    momentum += Math.tanh(openDeltaPct / (volScale * 0.8)) * 8;
  } else if (prevClose > 0 && price > 0) {
    const prevDeltaPct = ((price - prevClose) / prevClose) * 100;
    momentum += Math.tanh(prevDeltaPct / volScale) * 5;
  }
  const momentumScore = clamp0100(momentum);

  // 2. Intraday Tape Strength (IBS + Session Mean / Trend Slope + Foreign Flow)
  let ibsComponent = 50;
  if (
    typeof dayHigh === 'number' &&
    typeof dayLow === 'number' &&
    Number.isFinite(dayHigh) &&
    Number.isFinite(dayLow) &&
    dayHigh > dayLow &&
    price > 0
  ) {
    const ibs = Math.max(0, Math.min(1, (price - dayLow) / (dayHigh - dayLow)));
    ibsComponent = ibs * 100;
  } else {
    ibsComponent = momentumScore;
  }

  let seriesBias = 0;
  if (Array.isArray(series) && series.length >= 6 && price > 0) {
    const valid = series.filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (valid.length >= 6) {
      const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
      const distPct = ((price - mean) / mean) * 100;
      const tail3 = valid.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const priorWindow = valid.slice(-8, -3);
      const priorMean =
        priorWindow.length > 0
          ? priorWindow.reduce((a, b) => a + b, 0) / priorWindow.length
          : mean;
      const slopePct = ((tail3 - priorMean) / priorMean) * 100;
      seriesBias = Math.tanh((distPct + slopePct) / (volScale * 0.7)) * 18;
    }
  }

  let flowBias = 0;
  if (foreignFlowSide === 'BUY') flowBias = 8;
  else if (foreignFlowSide === 'SELL') flowBias = -8;

  const intradayStrength = clamp0100(ibsComponent * 0.72 + momentumScore * 0.28 + seriesBias + flowBias);

  // 3. Structural 52-Week Range Position (0..100)
  const has52w = typeof w52Pct === 'number' && Number.isFinite(w52Pct);
  const range52w = has52w
    ? clamp0100(w52Pct)
    : clamp0100(momentumScore * 0.55 + intradayStrength * 0.45);

  // Weighted composite (Momentum 45%, Tape Strength 30%, 52W Position 25%)
  const composite = clamp0100(
    has52w
      ? momentumScore * 0.45 + intradayStrength * 0.30 + range52w * 0.25
      : momentumScore * 0.58 + intradayStrength * 0.42
  );

  const { zone, shortLabel } = getFearGreedZone(composite);

  const driverParts: string[] = [];
  if (Math.abs(changePercent) >= volScale * 0.6) {
    driverParts.push(
      changePercent > 0
        ? `Strong upside drive (+${changePercent.toFixed(2)}%)`
        : `Heavy downside pressure (${changePercent.toFixed(2)}%)`
    );
  } else {
    driverParts.push(`Balanced tape (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
  }
  if (has52w) {
    driverParts.push(`52W range at ${range52w}%`);
  }
  if (intradayStrength >= 68) {
    driverParts.push('buyers controlling high');
  } else if (intradayStrength <= 32) {
    driverParts.push('sellers pressing lows');
  }

  const resolvedHistory7d = deriveSevenDayHistory(
    composite,
    history7d,
    series,
    w52Pct,
    changePercent,
    assetId || category || 'asset'
  );

  return {
    score: composite,
    zone,
    shortLabel,
    driver: driverParts.join(' · '),
    history7d: resolvedHistory7d,
    components: {
      momentum: momentumScore,
      intradayStrength,
      range52w,
    },
  };
}

export function getAssetFearGreed(asset: MarketAsset): FearGreedInfo {
  const cached = assetFearGreedCache.get(asset);
  if (cached) return cached;

  const highNum = parseFormattedMarketNumber(asset.dayHigh);
  const lowNum = parseFormattedMarketNumber(asset.dayLow);
  const openNum = parseFormattedMarketNumber(asset.open);
  const series = asset.chartSeries['1D']?.length ? asset.chartSeries['1D'] : asset.sparklinePoints;

  const result = computeFearGreedIndex({
    price: asset.price,
    prevClose: asset.prevClose,
    changePercent: asset.changePercent,
    open: Number.isFinite(openNum) ? openNum : undefined,
    dayHigh: Number.isFinite(highNum) ? highNum : undefined,
    dayLow: Number.isFinite(lowNum) ? lowNum : undefined,
    series,
    history7d: asset.fearGreed7d,
    w52Pct: asset.w52Pct,
    isYield: asset.isYield,
    assetId: asset.id,
    category: asset.category,
  });
  assetFearGreedCache.set(asset, result);
  return result;
}

export function getStockFearGreed(stock: StockMover): FearGreedInfo {
  const cached = stockFearGreedCache.get(stock);
  if (cached) return cached;

  const result = computeFearGreedIndex({
    price: stock.price,
    prevClose: stock.prevClose,
    changePercent: stock.changePercent,
    dayHigh: stock.dayHigh,
    dayLow: stock.dayLow,
    series: stock.sparklinePoints,
    assetId: stock.symbol,
    category: 'stocks',
    foreignFlowSide: stock.foreignFlowSide,
  });
  stockFearGreedCache.set(stock, result);
  return result;
}

export type { OverallMarketFearGreed };

export function computeOverallMarketFearGreed(assets: MarketAsset[]): OverallMarketFearGreed {
  if (!assets || assets.length === 0) {
    return {
      score: 50,
      zone: 'Neutral',
      shortLabel: 'Neutral',
      history7d: [50, 50, 50, 50, 50, 50, 50],
      delta1d: 0,
      greedCount: 0,
      neutralCount: 0,
      fearCount: 0,
      totalAssets: 0,
      driver: 'Syncing live cross-asset sentiment feeds...',
      sectors: [],
    };
  }

  const cached = overallFearGreedCache.get(assets);
  if (cached) return cached;

  const enriched = assets.map((asset) => ({
    asset,
    fg: getAssetFearGreed(asset),
  }));

  let weightedSum = 0;
  let totalWeight = 0;
  let greedCount = 0;
  let neutralCount = 0;
  let fearCount = 0;
  const histBuckets = [0, 0, 0, 0, 0, 0, 0];
  let histWeights = 0;

  for (const { asset, fg } of enriched) {
    // Give benchmark indices and core macro anchors slightly higher market weight
    const w =
      asset.id === 'SPX' || asset.id === 'IXIC' || asset.id === 'IHSG'
        ? 1.8
        : asset.isSnapshotTile
          ? 1.4
          : 1.0;

    weightedSum += fg.score * w;
    totalWeight += w;

    if (fg.score >= 55) greedCount += 1;
    else if (fg.score <= 44) fearCount += 1;
    else neutralCount += 1;

    const h = fg.history7d;
    if (Array.isArray(h) && h.length >= 7) {
      for (let i = 0; i < 7; i++) {
        histBuckets[i] += h[h.length - 7 + i] * w;
      }
      histWeights += w;
    }
  }

  const score = clamp0100(totalWeight > 0 ? weightedSum / totalWeight : 50);
  const { zone, shortLabel } = getFearGreedZone(score);
  const history7d =
    histWeights > 0
      ? histBuckets.map((sum, idx) => (idx === 6 ? score : clamp0100(sum / histWeights)))
      : [score, score, score, score, score, score, score];
  const delta1d = history7d.length >= 2 ? score - history7d[history7d.length - 2] : 0;

  const avgGroup = (items: typeof enriched) => {
    if (items.length === 0) return 50;
    return clamp0100(items.reduce((acc, x) => acc + x.fg.score, 0) / items.length);
  };

  const usScore = avgGroup(enriched.filter((x) => x.asset.category === 'us-indices'));
  const asiaScore = avgGroup(enriched.filter((x) => x.asset.category === 'asia-indices'));
  const cryptoScore = avgGroup(
    enriched.filter((x) => x.asset.id === 'BTCUSD' || x.asset.id === 'ETHUSD')
  );
  const macroScore = avgGroup(
    enriched.filter(
      (x) =>
        x.asset.category === 'forex-yields' ||
        x.asset.id === 'GOLD' ||
        x.asset.id === 'XAUUSD'
    )
  );

  const sectors: OverallMarketFearGreed['sectors'] = [
    { id: 'us', label: 'US Equities', score: usScore, zone: getFearGreedZone(usScore).zone },
    { id: 'asia', label: 'Asia & IDX', score: asiaScore, zone: getFearGreedZone(asiaScore).zone },
    { id: 'crypto', label: 'Crypto', score: cryptoScore, zone: getFearGreedZone(cryptoScore).zone },
    { id: 'macro', label: 'Gold & Macro', score: macroScore, zone: getFearGreedZone(macroScore).zone },
  ];

  const driver = `${greedCount} Greed · ${neutralCount} Neutral · ${fearCount} Fear across ${assets.length} live markets`;

  const result: OverallMarketFearGreed = {
    score,
    zone,
    shortLabel,
    history7d,
    delta1d,
    greedCount,
    neutralCount,
    fearCount,
    totalAssets: assets.length,
    driver,
    sectors,
  };
  overallFearGreedCache.set(assets, result);
  return result;
}

export interface AssetTimeframeReturn {
  hasSeries: boolean;
  startVal: number;
  endVal: number;
  delta: number;
  pct: number;
  isGain: boolean;
  isInspecting: boolean;
}

export function computeAssetTimeframeReturn(
  asset: MarketAsset,
  timeframe: Timeframe,
  inspectIndex: number | null = null
): AssetTimeframeReturn {
  let perAssetMap = assetTimeframeReturnCache.get(asset);
  const cacheKey = `${timeframe}:${inspectIndex ?? 'full'}`;
  const cached = perAssetMap?.get(cacheKey);
  if (cached) return cached;

  const storeResult = (val: AssetTimeframeReturn): AssetTimeframeReturn => {
    if (!perAssetMap) {
      perAssetMap = new Map();
      assetTimeframeReturnCache.set(asset, perAssetMap);
    }
    perAssetMap.set(cacheKey, val);
    return val;
  };

  const rawSeries = asset.chartSeries[timeframe];
  const hasSeries =
    timeframe === '1D' || (Array.isArray(rawSeries) && rawSeries.length >= 2);
  const fallback1D = asset.chartSeries['1D'] ?? [];
  const activeSeries =
    hasSeries && rawSeries && rawSeries.length >= 2
      ? rawSeries
      : fallback1D.length >= 2
        ? fallback1D
        : [asset.prevClose || asset.price, asset.price];

  const parsedOpen = parseFormattedMarketNumber(asset.open);
  const openBaseline =
    timeframe === '1D'
      ? Number.isFinite(parsedOpen) && parsedOpen > 0
        ? parsedOpen
        : asset.prevClose > 0
          ? asset.prevClose
          : activeSeries[0]
      : activeSeries[0];

  const startVal =
    timeframe === '1D'
      ? asset.prevClose > 0
        ? asset.prevClose
        : openBaseline
      : activeSeries[0] || openBaseline;

  if (
    inspectIndex !== null &&
    inspectIndex >= 0 &&
    inspectIndex < activeSeries.length
  ) {
    const refVal = timeframe === '1D' ? openBaseline : startVal;
    const ptVal = activeSeries[inspectIndex];
    const delta = ptVal - refVal;
    const pct = refVal > 0 ? (delta / refVal) * 100 : 0;
    return storeResult({
      hasSeries,
      startVal: refVal,
      endVal: ptVal,
      delta,
      pct,
      isGain: delta >= 0,
      isInspecting: true,
    });
  }

  if (timeframe === '1D') {
    return storeResult({
      hasSeries: true,
      startVal,
      endVal: asset.price,
      delta: asset.changeValue,
      pct: asset.changePercent,
      isGain: asset.changePercent >= 0,
      isInspecting: false,
    });
  }

  const endVal = asset.price > 0 ? asset.price : activeSeries[activeSeries.length - 1] ?? asset.price;
  const delta = endVal - startVal;
  const pct = startVal > 0 ? (delta / startVal) * 100 : 0;
  return storeResult({
    hasSeries,
    startVal,
    endVal,
    delta,
    pct,
    isGain: delta >= 0,
    isInspecting: false,
  });
}

export function computeVolatilityFearGreed(
  assets: MarketAsset[],
  volatility5mMap: Record<string, Asset5mVolatility>
): VolatilityFearGreedInfo {
  const activeAssets = assets.filter((a) => !a.isYield);
  const openAssets = activeAssets.filter((a) => a.marketSessionOpen !== false);
  const samplePool = openAssets.length >= 3 ? openAssets : activeAssets;

  const ranges5m: number[] = [];
  const moves5m: number[] = [];
  const intradayRanges: number[] = [];
  let negativeMoves = 0;

  for (const a of samplePool) {
    const v5 = volatility5mMap[a.id];
    const r5 = v5?.range5mPct ?? a.vol5mRangePct ?? 0;
    const m5 = v5?.pct5m ?? a.move5mPct ?? 0;
    // Normalize crypto scale (~2.2x equities) so BTC 24/7 doesn't distort calm macro sessions
    const normFactor = a.id === 'BTCUSD' || a.id === 'ETHUSD' ? 0.55 : a.category === 'forex-yields' ? 1.5 : 1.0;
    if (Number.isFinite(r5) && r5 > 0) {
      ranges5m.push(r5 * normFactor);
    }
    if (Number.isFinite(m5)) {
      moves5m.push(m5 * normFactor);
      if (m5 < -0.02 || a.changePercent < -0.25) {
        negativeMoves += 1;
      }
    } else if (a.changePercent < -0.25) {
      negativeMoves += 1;
    }

    const hi = parseFormattedMarketNumber(a.dayHigh);
    const lo = parseFormattedMarketNumber(a.dayLow);
    if (Number.isFinite(hi) && Number.isFinite(lo) && a.price > 0 && hi >= lo) {
      intradayRanges.push(((hi - lo) / a.price) * 100 * normFactor);
    }
  }

  const avg5mRangePct =
    ranges5m.length > 0
      ? ranges5m.reduce((s, x) => s + x, 0) / ranges5m.length
      : 0.14;

  const meanMove =
    moves5m.length > 0 ? moves5m.reduce((s, x) => s + x, 0) / moves5m.length : 0;
  const variance =
    moves5m.length > 1
      ? moves5m.reduce((s, x) => s + Math.pow(x - meanMove, 2), 0) / moves5m.length
      : 0;
  const dispersionSigma = Math.sqrt(variance);

  const intradayRangePct =
    intradayRanges.length > 0
      ? intradayRanges.reduce((s, x) => s + x, 0) / intradayRanges.length
      : 0.85;

  const downsideSkewPct =
    samplePool.length > 0 ? Math.round((negativeMoves / samplePool.length) * 100) : 50;

  // Safe-haven rotation check: Gold & USD rallying while US/IDX equities lag signals Fear
  const byId = new Map(assets.map((a) => [a.id, a]));
  const eqAvg =
    ((byId.get('SPX')?.changePercent ?? 0) +
      (byId.get('IXIC')?.changePercent ?? 0) +
      (byId.get('IHSG')?.changePercent ?? 0)) /
    3;
  const havenAvg =
    ((byId.get('XAUUSD')?.changePercent ?? 0) + (byId.get('DXY')?.changePercent ?? 0)) / 2;
  const safeHavenSpread = eqAvg - havenAvg;
  const safeHavenBidScore = clamp0100(50 + Math.tanh(safeHavenSpread / 1.1) * 38);

  // Convert normalized volatility metrics into Fear (high vol + downside skew) vs Greed (compressed vol + upside drift)
  const volCompressionScore = clamp0100(86 - Math.min(82, avg5mRangePct * 115));
  const intradayStabilityScore = clamp0100(84 - Math.min(78, intradayRangePct * 26));
  const breadthPolarityScore = clamp0100(100 - downsideSkewPct);
  const momentumDirectionScore = clamp0100(50 + Math.tanh(meanMove / 0.22) * 35);

  const score = clamp0100(
    volCompressionScore * 0.28 +
      intradayStabilityScore * 0.22 +
      breadthPolarityScore * 0.24 +
      safeHavenBidScore * 0.14 +
      momentumDirectionScore * 0.12
  );

  const { zone, shortLabel } = getFearGreedZone(score);

  const volRegime: VolatilityFearGreedInfo['volRegime'] =
    avg5mRangePct >= 0.55 || intradayRangePct >= 2.2
      ? 'Panic'
      : avg5mRangePct >= 0.30 || intradayRangePct >= 1.35
        ? 'Elevated'
        : avg5mRangePct <= 0.12 && intradayRangePct <= 0.75
          ? 'Compressed'
          : 'Normal';

  // Build 7-day trend anchored gently from recent market baseline to current volatility score
  const baseline7d = computeOverallMarketFearGreed(assets).history7d;
  const history7d = baseline7d.map((val, idx) =>
    idx === baseline7d.length - 1
      ? score
      : clamp0100(val * 0.55 + score * 0.45 + (idx - 3) * 0.8)
  );

  const driver = `${volRegime} vol (${avg5mRangePct.toFixed(2)}% 5m avg) · ${downsideSkewPct}% downside skew`;

  return {
    score,
    zone,
    shortLabel,
    volRegime,
    avg5mRangePct: Number(avg5mRangePct.toFixed(2)),
    dispersionSigma: Number(dispersionSigma.toFixed(2)),
    intradayRangePct: Number(intradayRangePct.toFixed(2)),
    downsideSkewPct,
    safeHavenBidScore,
    driver,
    history7d,
  };
}

export function extractFiveMinuteTrajectory(
  asset: MarketAsset,
  volInfo?: Asset5mVolatility
): { points: number[]; deltaPct: number } {
  const series = asset.chartSeries?.['1D'] ?? [];
  const timestamps = asset.chartTimestamps?.['1D'] ?? [];
  const livePrice = Number.isFinite(asset.price) && asset.price > 0 ? asset.price : 0;

  let trajectory: number[] = [];

  if (series.length >= 3 && timestamps.length === series.length) {
    const lastTs = timestamps[timestamps.length - 1];
    if (typeof lastTs === 'number' && Number.isFinite(lastTs)) {
      const cutoff = lastTs - 5 * 60_000;
      const inWindow: number[] = [];
      for (let i = 0; i < series.length; i++) {
        const val = series[i];
        if (timestamps[i] >= cutoff && typeof val === 'number' && Number.isFinite(val) && val > 0) {
          inWindow.push(val);
        }
      }
      if (inWindow.length >= 3) {
        trajectory = inWindow;
      }
    }
  }

  if (trajectory.length < 3) {
    const sourcePool =
      series.length >= 3
        ? series
        : asset.sparklinePoints.length >= 3
          ? asset.sparklinePoints
          : [];
    trajectory = sourcePool
      .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)
      .slice(-8);
  }

  if (livePrice > 0) {
    if (trajectory.length >= 2) {
      trajectory = [...trajectory.slice(0, -1), livePrice];
    } else {
      const pctHint =
        volInfo?.isSessionOpen && typeof volInfo.pct5m === 'number'
          ? volInfo.pct5m
          : typeof asset.move5mPct === 'number'
            ? asset.move5mPct
            : asset.changePercent * 0.15;
      const safeHint = Number.isFinite(pctHint) ? pctHint : 0;
      const startVal = livePrice / (1 + safeHint / 100 || 1);
      trajectory = [
        startVal,
        startVal + (livePrice - startVal) * 0.35,
        startVal + (livePrice - startVal) * 0.68,
        livePrice,
      ];
    }
  }

  if (trajectory.length < 2) {
    const base = livePrice || asset.prevClose || 100;
    trajectory = [base, base];
  }

  const first = trajectory[0];
  const last = trajectory[trajectory.length - 1];
  const computedDelta = first > 0 ? ((last - first) / first) * 100 : 0;
  const deltaPct =
    volInfo?.isSessionOpen && typeof volInfo.pct5m === 'number' && Number.isFinite(volInfo.pct5m)
      ? volInfo.pct5m
      : typeof asset.move5mPct === 'number' && Number.isFinite(asset.move5mPct) && asset.marketSessionOpen !== false
        ? asset.move5mPct
        : computedDelta;

  return {
    points: trajectory,
    deltaPct: Number.isFinite(deltaPct) ? Number(deltaPct.toFixed(2)) : 0,
  };
}

export function computeRiskRegimeSentiment(assets: MarketAsset[]): RiskRegimeInfo {
  if (!assets || assets.length === 0) {
    return {
      status: 'Neutral',
      polarity: 'neutral',
      score: 50,
      weightedMovePct: 0,
      advancingSectors: 0,
      totalSectors: 4,
      driver: 'Awaiting live index & sector quotes...',
      sectors: [],
    };
  }

  const byId = new Map(assets.map((a) => [a.id.toUpperCase(), a]));

  const weightedBucketAvg = (items: Array<{ id: string; w: number; scale?: number }>): number => {
    let sum = 0;
    let totalW = 0;
    for (const item of items) {
      const asset = byId.get(item.id.toUpperCase());
      if (!asset || !Number.isFinite(asset.changePercent)) continue;
      const scale = item.scale ?? 1;
      sum += (asset.changePercent / scale) * item.w;
      totalW += item.w;
    }
    return totalW > 0 ? sum / totalW : 0;
  };

  // 1. US Broad & Tech Indices (35% weight)
  const usMove = weightedBucketAvg([
    { id: 'SPX', w: 1.4 },
    { id: 'IXIC', w: 1.3 },
    { id: 'DJI', w: 1.0 },
  ]);

  // 2. Asia & Emerging Markets Indices (25% weight)
  const asiaMove = weightedBucketAvg([
    { id: 'IHSG', w: 1.3 },
    { id: 'EIDO', w: 1.1 },
    { id: 'HSI', w: 1.0 },
    { id: 'TAIEX', w: 1.0 },
    { id: 'KOSPI', w: 1.0 },
    { id: 'SSEC', w: 0.9 },
    { id: 'NIFTY', w: 1.0 },
  ]);

  // 3. Cyclicals & High-Beta Digital Risk Assets (15% weight)
  const cyclicalMove = weightedBucketAvg([
    { id: 'BTCUSD', w: 1.1, scale: 2.2 },
    { id: 'ETHUSD', w: 0.9, scale: 2.4 },
    { id: 'WTI', w: 1.0, scale: 1.3 },
    { id: 'BRENT', w: 1.0, scale: 1.3 },
    { id: 'AUDUSD', w: 0.9, scale: 0.65 },
    { id: 'NZDUSD', w: 0.8, scale: 0.65 },
  ]);

  // 4. Safe-Haven Inverse Sector (25% weight):
  // Rising Gold / DXY / CHF or falling 10Y Treasury yields indicates Risk-Off demand -> negative risk score
  const xau = byId.get('XAUUSD')?.changePercent ?? 0;
  const dxy = byId.get('DXY')?.changePercent ?? 0;
  const usdChf = byId.get('USDCHF')?.changePercent ?? 0;
  const us10y = byId.get('US10Y')?.changePercent ?? 0;
  const safeHavenRiskMove = -(xau * 0.42 + dxy * 0.48 - usdChf * 0.25 - us10y * 0.22);

  const classifyStance = (val: number): RiskRegimeSectorBreakdown['stance'] =>
    val >= 0.12 ? 'Risk-On' : val <= -0.12 ? 'Risk-Off' : 'Neutral';

  const rawBuckets: Array<{ id: string; label: string; weightPct: number; avgMovePct: number }> = [
    { id: 'us-indices', label: 'US Indices', weightPct: 35, avgMovePct: usMove },
    { id: 'asia-indices', label: 'Asia & IDX', weightPct: 25, avgMovePct: asiaMove },
    { id: 'cyclicals-crypto', label: 'Cyclicals & Crypto', weightPct: 15, avgMovePct: cyclicalMove },
    { id: 'safe-havens', label: 'Safe Havens (Inv)', weightPct: 25, avgMovePct: safeHavenRiskMove },
  ];

  const sectors: RiskRegimeSectorBreakdown[] = rawBuckets.map((b) => ({
    id: b.id,
    label: b.label,
    weightPct: b.weightPct,
    avgMovePct: Number(b.avgMovePct.toFixed(2)),
    weightedContributionPct: Number(((b.avgMovePct * b.weightPct) / 100).toFixed(3)),
    stance: classifyStance(b.avgMovePct),
  }));

  const weightedMovePct = sectors.reduce((acc, s) => acc + s.weightedContributionPct, 0);
  const score = clamp0100(50 + Math.tanh(weightedMovePct / 0.85) * 44);

  let status: RiskRegimeStatus = 'Neutral';
  let polarity: RiskRegimeInfo['polarity'] = 'neutral';
  if (score >= 65) {
    status = 'Strong Risk-On';
    polarity = 'risk-on';
  } else if (score >= 54) {
    status = 'Risk-On';
    polarity = 'risk-on';
  } else if (score <= 35) {
    status = 'Strong Risk-Off';
    polarity = 'risk-off';
  } else if (score <= 46) {
    status = 'Risk-Off';
    polarity = 'risk-off';
  }

  const advancingSectors = sectors.filter((s) => s.stance === 'Risk-On').length;
  const driver = `Weighted cross-sector delta ${
    weightedMovePct >= 0 ? '+' : ''
  }${weightedMovePct.toFixed(2)}% · ${advancingSectors}/${sectors.length} sectors Risk-On`;

  return {
    status,
    polarity,
    score,
    weightedMovePct: Number(weightedMovePct.toFixed(2)),
    advancingSectors,
    totalSectors: sectors.length,
    driver,
    sectors,
  };
}

export function computeUnifiedMarketPulse(params: {
  activeAsset: MarketAsset;
  assets: MarketAsset[];
  volatility5mMap: Record<string, Asset5mVolatility>;
  headlineSentimentScore: number;
}): UnifiedMarketPulse {
  const { activeAsset, assets, volatility5mMap, headlineSentimentScore } = params;
  const riskRegime = computeRiskRegimeSentiment(assets);
  const volatilityFearGreed = computeVolatilityFearGreed(assets, volatility5mMap);
  const overallFearGreed = computeOverallMarketFearGreed(assets);
  const activeSignal = getAssetSignal(activeAsset);
  const activeFearGreed = getAssetFearGreed(activeAsset);

  const fearGreedScore = clamp0100(
    volatilityFearGreed.score * 0.55 + overallFearGreed.score * 0.45
  );
  const { zone: fearGreedZone } = getFearGreedZone(fearGreedScore);

  const activeTechScore = clamp0100(
    50 + Math.max(-45, Math.min(45, activeSignal.score))
  );

  // Unified 4-vector composite blending macro Risk-On/Off (36%), Vol & Cross-Asset Fear/Greed (28%),
  // NLP headline sentiment (8% to avoid headline keyword noise), and active instrument technicals (28%)
  const compositeScore = clamp0100(
    riskRegime.score * 0.36 +
      fearGreedScore * 0.28 +
      clamp0100(headlineSentimentScore) * 0.08 +
      (activeTechScore * 0.65 + activeFearGreed.score * 0.35) * 0.28
  );

  let stanceLabel: RiskRegimeStatus = 'Neutral';
  let polarity: UnifiedMarketPulse['polarity'] = 'neutral';
  if (compositeScore >= 65) {
    stanceLabel = 'Strong Risk-On';
    polarity = 'risk-on';
  } else if (compositeScore >= 54) {
    stanceLabel = 'Risk-On';
    polarity = 'risk-on';
  } else if (compositeScore <= 35) {
    stanceLabel = 'Strong Risk-Off';
    polarity = 'risk-off';
  } else if (compositeScore <= 46) {
    stanceLabel = 'Risk-Off';
    polarity = 'risk-off';
  }

  const driver = `${stanceLabel} · ${fearGreedZone} (${fearGreedScore}/100) · ${volatilityFearGreed.volRegime} Vol`;

  return {
    compositeScore,
    stanceLabel,
    polarity,
    fearGreedScore,
    fearGreedZone,
    driver,
    riskRegime,
    volatilityFearGreed,
    overallFearGreed,
    activeSignal,
    activeFearGreed,
  };
}

export function snapStockPriceToTick(price: number, currency: 'USD' | 'IDR'): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (currency !== 'IDR') {
    return Number(price.toFixed(2));
  }
  const step =
    price < 200
      ? 1
      : price < 500
        ? 2
        : price < 2000
          ? 5
          : price < 5000
            ? 10
            : 25;
  return Math.max(step, Math.round(price / step) * step);
}

export function formatStockCurrencyValue(price: number, currency: 'USD' | 'IDR'): string {
  if (!Number.isFinite(price) || price <= 0) return '—';
  if (currency === 'IDR') {
    return `Rp ${Math.round(price).toLocaleString('en-US')}`;
  }
  return `$${price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function deriveIdxVerdictAndScore(
  stock: StockMover,
  plan: StockTradePlan,
  rangePos: number,
  isOverextended: boolean
): Pick<StockTradePlan, 'verdictLabel' | 'scannerScore' | 'buyReasons' | 'cautionNote'> {
  const bandar = stock.bandarmology;
  const bandarScore = bandar?.score ?? Math.round(Math.tanh(stock.changePercent / 2) * 35);
  const foreignBuy =
    stock.foreignFlowSide === 'BUY' ||
    (stock.foreignNetAmount ?? 0) > 0 ||
    bandar?.foreignBias === 'Net Buy';
  const foreignSell =
    stock.foreignFlowSide === 'SELL' ||
    (stock.foreignNetAmount ?? 0) < 0 ||
    bandar?.foreignBias === 'Net Sell';
  const volRatio = bandar?.volumeRatio ?? 1.0;

  const rawScanner =
    50 +
    bandarScore * 0.34 +
    (foreignBuy ? 14 : foreignSell ? -14 : 0) +
    (rangePos <= 0.42 ? 12 : rangePos >= 0.75 ? -14 : 4) +
    (plan.trendFilterLabel === 'Uptrend (EMA20 > EMA50)'
      ? 10
      : plan.trendFilterLabel === 'Downtrend (EMA20 < EMA50)'
        ? -12
        : 0) +
    (volRatio >= 1.2 ? 6 : 0) -
    (isOverextended ? 18 : 0);
  const scannerScore = plan.scannerScore ?? Math.round(Math.max(5, Math.min(98, rawScanner)));

  let verdictLabel: StockTradePlan['verdictLabel'] = plan.verdictLabel;
  if (!verdictLabel) {
    if (plan.action === 'BUY') {
      if (bandar?.phase === 'Strong Accumulation' && (foreignBuy || rangePos <= 0.48)) {
        verdictLabel = 'BUY NOW (ACCUMULATION)';
      } else if (rangePos <= 0.45) {
        verdictLabel = 'BUY AT DEMAND';
      } else {
        verdictLabel = 'BREAKOUT BUY';
      }
    } else if (
      plan.action === 'WAIT' &&
      (isOverextended || bandarScore >= 12 || foreignBuy)
    ) {
      verdictLabel = 'WAIT PULLBACK';
    } else if (
      plan.action === 'SELL' ||
      bandar?.phase === 'Strong Distribution' ||
      (bandarScore <= -20 && foreignSell)
    ) {
      verdictLabel = 'AVOID / SELL';
    } else {
      verdictLabel = 'WATCH';
    }
  }

  let buyReasons = plan.buyReasons;
  if (!buyReasons || buyReasons.length === 0) {
    const reasons: string[] = [];
    if (bandar?.phase === 'Strong Accumulation' || bandar?.phase === 'Early Accumulation') {
      reasons.push(`${bandar.phase} (${bandar.score >= 0 ? '+' : ''}${bandar.score})`);
    }
    if (foreignBuy) {
      reasons.push(
        stock.foreignNetLabel ? `Foreign Buy (${stock.foreignNetLabel})` : 'Foreign Net Buy'
      );
    }
    if (rangePos <= 0.48) {
      reasons.push('Near Fresh Demand Zone');
    }
    if (plan.trendFilterLabel === 'Uptrend (EMA20 > EMA50)') {
      reasons.push('Uptrend (EMA20 > EMA50)');
    }
    if (volRatio >= 1.2) {
      reasons.push(`${volRatio.toFixed(1)}x 20D Volume`);
    }
    if (reasons.length === 0) {
      reasons.push(bandar?.phase && bandar.phase !== 'Neutral' ? bandar.phase : 'Consolidating Base');
    }
    buyReasons = reasons.slice(0, 4);
  }

  let cautionNote = plan.cautionNote;
  if (!cautionNote) {
    if (isOverextended) {
      cautionNote = `Extended (+${stock.changePercent.toFixed(1)}% / Supply ceiling) — wait pullback to Demand.`;
    } else if (bandar?.summary?.includes('Upper-wick supply')) {
      cautionNote = 'Upper-wick supply / distribution trap risk on elevated volume.';
    } else if (foreignSell) {
      cautionNote = 'Foreign Net Sell outflow active — wait Demand absorption.';
    } else if (plan.trendFilterLabel === 'Downtrend (EMA20 < EMA50)') {
      cautionNote = 'Below EMA50 downtrend — treat rebounds defensively.';
    }
  }

  return { verdictLabel, scannerScore, buyReasons, cautionNote };
}

// ============================================================================
// STOCKS PHASE 1, 2 & 3 INSTITUTIONAL STRATEGY INFRASTRUCTURE
// ============================================================================

const CANONICAL_SECTOR_MAP: Record<string, string> = {
  // US Mega-Cap & Leaders
  NVDA: 'Semiconductors', AMD: 'Semiconductors', AVGO: 'Semiconductors', TSM: 'Semiconductors',
  INTC: 'Semiconductors', QCOM: 'Semiconductors', MU: 'Semiconductors', ARM: 'Semiconductors',
  AMAT: 'Semiconductors', LRCX: 'Semiconductors', KLAC: 'Semiconductors', MRVL: 'Semiconductors',
  AAPL: 'Big Tech', MSFT: 'Big Tech', GOOGL: 'Big Tech', GOOG: 'Big Tech', META: 'Big Tech',
  AMZN: 'Big Tech', ORCL: 'Software & Cloud', CRM: 'Software & Cloud', PLTR: 'Software & Cloud',
  NOW: 'Software & Cloud', SNOW: 'Software & Cloud', CRWD: 'Software & Cloud', PANW: 'Software & Cloud',
  NFLX: 'Comm Services', DIS: 'Comm Services', SPOT: 'Comm Services',
  TSLA: 'Auto & EV', RIVN: 'Auto & EV', F: 'Auto & EV', GM: 'Auto & EV',
  JPM: 'Financials', BAC: 'Financials', GS: 'Financials', MS: 'Financials', WFC: 'Financials',
  V: 'Financials', MA: 'Financials', BRK: 'Financials', 'BRK-B': 'Financials', COIN: 'Financials',
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy', SLB: 'Energy', OXY: 'Energy',
  LLY: 'Healthcare', UNH: 'Healthcare', JNJ: 'Healthcare', NVO: 'Healthcare', ABBV: 'Healthcare', MRK: 'Healthcare',
  WMT: 'Consumer', COST: 'Consumer', HD: 'Consumer', NKE: 'Consumer', SBUX: 'Consumer', MCD: 'Consumer',
  CAT: 'Industrials', BA: 'Industrials', GE: 'Industrials', LMT: 'Industrials', RTX: 'Industrials',
  MSTR: 'Digital Assets', MARA: 'Digital Assets', RIOT: 'Digital Assets',
  // IDX Blue-Chips & Institutional Movers
  BBCA: 'Banking', BBRI: 'Banking', BMRI: 'Banking', BBNI: 'Banking', BRIS: 'Banking',
  BBTN: 'Banking', BDMN: 'Banking', BNGA: 'Banking', ARTO: 'Banking',
  ADRO: 'Energy & Coal', AADI: 'Energy & Coal', ITMG: 'Energy & Coal', PTBA: 'Energy & Coal',
  BUMI: 'Energy & Coal', INDY: 'Energy & Coal', HRUM: 'Energy & Coal', PGAS: 'Energy & Coal',
  MEDC: 'Energy & Coal', AKRA: 'Energy & Coal', ENRG: 'Energy & Coal', RAJA: 'Energy & Coal',
  AMMN: 'Metals & Mining', ANTM: 'Metals & Mining', INCO: 'Metals & Mining', MDKA: 'Metals & Mining',
  MBMA: 'Metals & Mining', NCKL: 'Metals & Mining', TINS: 'Metals & Mining', BRMS: 'Metals & Mining',
  PSAB: 'Metals & Mining', UNTR: 'Metals & Mining',
  BREN: 'Renewables & Chem', TPIA: 'Renewables & Chem', BRPT: 'Renewables & Chem',
  PGEO: 'Renewables & Chem', CUAN: 'Renewables & Chem', PTRO: 'Renewables & Chem',
  TLKM: 'Telecom & Infra', ISAT: 'Telecom & Infra', EXCL: 'Telecom & Infra',
  TOWR: 'Telecom & Infra', TBIG: 'Telecom & Infra', JSMR: 'Telecom & Infra',
  ASII: 'Industrials & Auto', AUTO: 'Industrials & Auto', INTP: 'Industrials & Auto', SMGR: 'Industrials & Auto',
  ICBP: 'Consumer', INDF: 'Consumer', UNVR: 'Consumer', KLBF: 'Consumer',
  AMRT: 'Consumer', MAPI: 'Consumer', ACES: 'Consumer', MYOR: 'Consumer', CPIN: 'Consumer', JPFA: 'Consumer',
  GOTO: 'Tech & Media', BUKA: 'Tech & Media', EMTK: 'Tech & Media', SCMA: 'Tech & Media', DCII: 'Tech & Media',
  BSDE: 'Property', CTRA: 'Property', PWON: 'Property', SMRA: 'Property', PANI: 'Property',
};

export function getStockSector(symbol: string, market: 'US' | 'ID'): string {
  const clean = symbol.trim().toUpperCase().replace(/\.JK$/i, '');
  if (CANONICAL_SECTOR_MAP[clean]) return CANONICAL_SECTOR_MAP[clean];
  return market === 'ID' ? 'IDX Diversified' : 'US Broad Market';
}

export interface StockMacroRegimeContext {
  idxThrottled: boolean;
  usThrottled: boolean;
  ihsgChgPct: number;
  spxChgPct: number;
  usdidrChgPct: number;
  dxyChgPct: number;
  idxNote: string;
  usNote: string;
}

export function extractStockMacroContext(assets: MarketAsset[] = []): StockMacroRegimeContext {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const ihsg = byId.get('IHSG');
  const spx = byId.get('SPX');
  const usdidr = byId.get('USDIDR');
  const dxy = byId.get('DXY');

  const ihsgChgPct = ihsg?.changePercent ?? 0;
  const spxChgPct = spx?.changePercent ?? 0;
  const usdidrChgPct = usdidr?.changePercent ?? 0;
  const dxyChgPct = dxy?.changePercent ?? 0;

  // Check if benchmark index is trading below its medium-term candle average if available
  const isBelowBenchMa = (asset?: MarketAsset): boolean => {
    const candles = asset?.chartCandles?.['1D'] ?? asset?.chartCandles?.['1h'];
    if (!candles || candles.length < 15) return false;
    const recent = candles.slice(-20);
    const avg = recent.reduce((s, c) => s + c.c, 0) / recent.length;
    return asset!.price < avg * 0.992;
  };

  const ihsgBelowMa = isBelowBenchMa(ihsg);
  const spxBelowMa = isBelowBenchMa(spx);

  const idxThrottled = ihsgChgPct <= -0.55 || usdidrChgPct >= 0.45 || (ihsgBelowMa && ihsgChgPct < 0);
  const usThrottled = spxChgPct <= -0.65 || (dxyChgPct >= 0.55 && spxChgPct < 0) || (spxBelowMa && spxChgPct < -0.2);

  const idxNote = idxThrottled
    ? `IDX Macro Throttle: IHSG ${ihsgChgPct >= 0 ? '+' : ''}${ihsgChgPct.toFixed(2)}% · USD/IDR ${usdidrChgPct >= 0 ? '+' : ''}${usdidrChgPct.toFixed(2)}% — require Stage 2 + RS≥75`
    : `IDX Macro Constructive: IHSG ${ihsgChgPct >= 0 ? '+' : ''}${ihsgChgPct.toFixed(2)}% · USD/IDR stable`;

  const usNote = usThrottled
    ? `US Macro Throttle: SPX ${spxChgPct >= 0 ? '+' : ''}${spxChgPct.toFixed(2)}% · DXY ${dxyChgPct >= 0 ? '+' : ''}${dxyChgPct.toFixed(2)}% — require Stage 2 + RS≥75`
    : `US Macro Constructive: SPX ${spxChgPct >= 0 ? '+' : ''}${spxChgPct.toFixed(2)}% · DXY orderly`;

  return {
    idxThrottled,
    usThrottled,
    ihsgChgPct,
    spxChgPct,
    usdidrChgPct,
    dxyChgPct,
    idxNote,
    usNote,
  };
}

export interface SectorLeaderSummary {
  sector: string;
  rank: number;
  avgRsRank: number;
  avgChangePct: number;
  stockCount: number;
  topSymbol: string;
  isTop3: boolean;
}

export interface StockCrossSectionalContext {
  bySymbol: Map<
    string,
    {
      rsRank: number;
      rsVsBenchPct: number;
      sector: string;
      sectorRank: number;
      isTopSector: boolean;
    }
  >;
  sectorLeaderboard: SectorLeaderSummary[];
}

export function computeCrossSectionalStockContext(
  stocks: StockMover[],
  market: 'US' | 'ID',
  benchmarkChgPct = 0
): StockCrossSectionalContext {
  const deduped = new Map<string, StockMover>();
  for (const s of stocks) {
    if (s.market !== market) continue;
    const sym = s.symbol.trim().toUpperCase().replace(/\.JK$/i, '');
    if (!sym || s.price <= 0) continue;
    if (!deduped.has(sym)) deduped.set(sym, s);
  }

  const list = Array.from(deduped.entries()).map(([sym, s]) => {
    const rawRet =
      typeof s.tradePlan?.rsVsBenchPct === 'number' && Number.isFinite(s.tradePlan.rsVsBenchPct)
        ? s.tradePlan.rsVsBenchPct
        : s.changePercent * 3.2;
    const excessRet = Number((rawRet - benchmarkChgPct * 2.5).toFixed(2));
    const sector = s.sector || getStockSector(sym, market);
    return { sym, stock: s, excessRet, sector };
  });

  // Compute percentile RS Rank (1..99)
  const sorted = [...list].sort((a, b) => a.excessRet - b.excessRet);
  const rankMap = new Map<string, { rsRank: number; rsVsBenchPct: number; sector: string }>();
  const total = sorted.length;
  sorted.forEach((item, idx) => {
    const pct = total <= 1 ? 50 : Math.round(1 + (idx / (total - 1)) * 98);
    rankMap.set(item.sym, {
      rsRank: Math.max(1, Math.min(99, pct)),
      rsVsBenchPct: item.excessRet,
      sector: item.sector,
    });
  });

  // Aggregate Sector Leadership Ranking
  const sectorAgg = new Map<
    string,
    { rsSum: number; chgSum: number; count: number; bestSym: string; bestRs: number }
  >();
  for (const item of list) {
    const entry = rankMap.get(item.sym)!;
    const prev = sectorAgg.get(item.sector);
    if (!prev) {
      sectorAgg.set(item.sector, {
        rsSum: entry.rsRank,
        chgSum: item.stock.changePercent,
        count: 1,
        bestSym: item.sym,
        bestRs: entry.rsRank,
      });
    } else {
      prev.rsSum += entry.rsRank;
      prev.chgSum += item.stock.changePercent;
      prev.count += 1;
      if (entry.rsRank > prev.bestRs) {
        prev.bestRs = entry.rsRank;
        prev.bestSym = item.sym;
      }
    }
  }

  const sectorLeaderboard: SectorLeaderSummary[] = Array.from(sectorAgg.entries())
    .map(([sector, v]) => ({
      sector,
      rank: 0,
      avgRsRank: Math.round(v.rsSum / v.count),
      avgChangePct: Number((v.chgSum / v.count).toFixed(2)),
      stockCount: v.count,
      topSymbol: v.bestSym,
      isTop3: false,
    }))
    .sort((a, b) => b.avgRsRank - a.avgRsRank || b.avgChangePct - a.avgChangePct)
    .map((row, idx) => ({
      ...row,
      rank: idx + 1,
      isTop3: idx < 3,
    }));

  const sectorRankLookup = new Map(sectorLeaderboard.map((s) => [s.sector, s]));
  const bySymbol = new Map<
    string,
    {
      rsRank: number;
      rsVsBenchPct: number;
      sector: string;
      sectorRank: number;
      isTopSector: boolean;
    }
  >();
  for (const [sym, r] of rankMap.entries()) {
    const secInfo = sectorRankLookup.get(r.sector);
    bySymbol.set(sym, {
      rsRank: r.rsRank,
      rsVsBenchPct: r.rsVsBenchPct,
      sector: r.sector,
      sectorRank: secInfo?.rank ?? 99,
      isTopSector: Boolean(secInfo?.isTop3),
    });
  }

  return { bySymbol, sectorLeaderboard };
}

function checkIdxAraArbGuard(stock: StockMover): { blocked: boolean; note?: string } {
  if (stock.market !== 'ID' || stock.currency !== 'IDR') return { blocked: false };
  const refPx = stock.prevClose > 0 ? stock.prevClose : stock.price;
  // BEI / IDX symmetric Auto-Rejection tiers
  const limitPct = refPx < 200 ? 35 : refPx <= 5000 ? 25 : 20;
  const araWarnThreshold = limitPct * 0.78;
  const arbWarnThreshold = -limitPct * 0.75;
  if (stock.changePercent >= araWarnThreshold) {
    return {
      blocked: true,
      note: `IDX ARA Guard (+${stock.changePercent.toFixed(1)}% near +${limitPct}% ceiling) — do not chase into Auto-Rejection.`,
    };
  }
  if (stock.changePercent <= arbWarnThreshold) {
    return {
      blocked: true,
      note: `IDX ARB Guard (${stock.changePercent.toFixed(1)}% near -${limitPct}% floor) — lock-down liquidity trap.`,
    };
  }
  return { blocked: false };
}

export interface StockDataValidityReport {
  status: 'verified' | 'partial' | 'invalid';
  note: string;
  hasValidPrice: boolean;
  hasLiquidity: boolean;
  hasRangeSanity: boolean;
  hasSeriesDepth: boolean;
}

/**
 * Multi-check institutional data validity filter:
 * Blocks corrupt, stale, zero-liquidity, or bad-tick quotes from generating actionable BUY/SELL calls.
 */
export function validateStockData(stock: StockMover): StockDataValidityReport {
  const hasValidPrice =
    Number.isFinite(stock.price) &&
    stock.price > 0 &&
    Number.isFinite(stock.prevClose) &&
    stock.prevClose > 0;

  const hasRangeSanity =
    stock.dayHigh <= 0 ||
    stock.dayLow <= 0 ||
    (stock.dayHigh >= stock.dayLow && stock.price >= stock.dayLow * 0.985 && stock.price <= stock.dayHigh * 1.015);

  const volStr = (stock.volume ?? '').trim().toUpperCase();
  const hasLiquidity =
    (Number.isFinite(stock.volumeRaw) && stock.volumeRaw > 0) ||
    (volStr.length > 0 && volStr !== '0' && volStr !== '—' && volStr !== 'N/A');

  const absChg = Math.abs(stock.changePercent);
  const badTickArtifact = absChg > 38 && !hasLiquidity;
  const minPriceOk = stock.currency === 'IDR' ? stock.price >= 50 : stock.price >= 1.0;

  const validPts = (stock.sparklinePoints ?? []).filter(
    (v) => typeof v === 'number' && Number.isFinite(v) && v > 0
  );
  const hasSeriesDepth = validPts.length >= 4;

  if (!hasValidPrice || !hasRangeSanity || badTickArtifact || !minPriceOk) {
    const reasons: string[] = [];
    if (!hasValidPrice) reasons.push('missing live/prev close');
    if (!hasRangeSanity) reasons.push('OHLC range mismatch');
    if (badTickArtifact) reasons.push('unverified extreme tick');
    if (!minPriceOk) reasons.push(stock.currency === 'IDR' ? 'penny/FCA < Rp 50' : 'sub-$1 illiquid');
    return {
      status: 'invalid',
      note: `Filtered (${reasons.join(', ')})`,
      hasValidPrice,
      hasLiquidity,
      hasRangeSanity,
      hasSeriesDepth,
    };
  }

  const adtvFailed = stock.tradePlan?.adtvPassed === false;
  const araArb = checkIdxAraArbGuard(stock);

  if (!hasLiquidity || !hasSeriesDepth || adtvFailed || araArb.blocked) {
    return {
      status: 'partial',
      note: araArb.blocked
        ? araArb.note!
        : adtvFailed
          ? `Low 20D ADTV (${stock.tradePlan?.adtvLabel ?? 'thin'}) — below institutional liquidity floor`
          : !hasLiquidity
            ? 'Volume feed partial — verify orderbook depth before sizing'
            : 'Limited intraday bars — confirm on full chart',
      hasValidPrice,
      hasLiquidity: hasLiquidity && !adtvFailed,
      hasRangeSanity,
      hasSeriesDepth,
    };
  }

  return {
    status: 'verified',
    note: 'Live price, OHLC range & 20D ADTV liquidity verified',
    hasValidPrice,
    hasLiquidity,
    hasRangeSanity,
    hasSeriesDepth,
  };
}

function attachInstitutionalTradeMetadata(
  stock: StockMover,
  plan: StockTradePlan,
  validity: StockDataValidityReport,
  rangePos: number,
  isOverextended: boolean,
  macroCtx?: StockMacroRegimeContext,
  crossCtx?: StockCrossSectionalContext
): StockTradePlan {
  const px = Math.max(stock.price, stock.prevClose, 1);
  const daySpanPct =
    stock.dayHigh > 0 && stock.dayLow > 0 && stock.dayHigh >= stock.dayLow
      ? ((stock.dayHigh - stock.dayLow) / px) * 100
      : Math.max(1.2, Math.abs(stock.changePercent));
  // Phase 1: prefer true 14-day Wilder ATR% from server 1y bars over single-day span
  const atrPct = Number(
    (plan.atr14Pct && plan.atr14Pct > 0
      ? plan.atr14Pct
      : Math.max(0.8, Math.min(12, daySpanPct))
    ).toFixed(2)
  );

  const demHi = plan.demandHighNum ?? plan.entryPrice;
  const extensionPct = Number((((px - demHi) / Math.max(1e-6, demHi)) * 100).toFixed(2));
  const atrMultipleExtension = extensionPct / Math.max(0.8, atrPct);

  // Cross-sectional Relative Strength & Sector Leadership (Phase 1 & 3)
  const cleanSym = stock.symbol.trim().toUpperCase().replace(/\.JK$/i, '');
  const cs = crossCtx?.bySymbol.get(cleanSym);
  const sector = cs?.sector ?? plan.sector ?? stock.sector ?? getStockSector(cleanSym, stock.market);
  const rsRank =
    cs?.rsRank ??
    plan.rsRank ??
    Math.max(10, Math.min(95, Math.round(50 + stock.changePercent * 6)));
  const rsVsBenchPct = cs?.rsVsBenchPct ?? plan.rsVsBenchPct;
  const sectorRank = cs?.sectorRank ?? plan.sectorRank;
  const isTopSector = cs?.isTopSector ?? plan.isTopSector ?? false;

  // Stage 2 / Minervini alignment refined with real RS Rank >= 70
  const baseMinervini = plan.minerviniPassedCount ?? (plan.trendFilterLabel === 'Uptrend (EMA20 > EMA50)' ? 6 : 3);
  const rsBonusPoint = rsRank >= 70 && !plan.minerviniPassedCount ? 1 : 0;
  const minerviniPassedCount = Math.min(8, baseMinervini + rsBonusPoint);
  const stage: StockTradePlan['stage'] =
    plan.stage ??
    (plan.trendFilterLabel === 'Uptrend (EMA20 > EMA50)' && rsRank >= 60
      ? 'Stage 2 Advancing'
      : plan.trendFilterLabel === 'Downtrend (EMA20 < EMA50)'
        ? 'Stage 4 Declining'
        : 'Stage 1 Base');

  const araArb = checkIdxAraArbGuard(stock);
  const macroThrottled =
    stock.market === 'ID' ? Boolean(macroCtx?.idxThrottled) : Boolean(macroCtx?.usThrottled);
  const macroRegimeNote = macroCtx
    ? stock.market === 'ID'
      ? macroCtx.idxNote
      : macroCtx.usNote
    : undefined;

  const volRatio = stock.bandarmology?.volumeRatio ?? 1.0;
  const accPersistence5d = plan.accPersistence5d ?? (stock.changePercent > 0 ? 3 : 2);
  const hasFlowSponsorship =
    stock.foreignFlowSide === 'BUY' ||
    (stock.foreignNetAmount ?? 0) > 0 ||
    stock.bandarmology?.phase === 'Strong Accumulation' ||
    stock.bandarmology?.phase === 'Early Accumulation' ||
    accPersistence5d >= 3 ||
    volRatio >= 1.15;

  const trendOk =
    stage !== 'Stage 4 Declining' &&
    plan.trendFilterLabel !== 'Downtrend (EMA20 < EMA50)' &&
    (stage === 'Stage 2 Advancing' || plan.trendFilterLabel === 'Uptrend (EMA20 > EMA50)' || Boolean(plan.episodicPivot));

  const riskDist = Math.abs(plan.entryPrice - plan.stopLoss);
  const rewardDist = Math.abs(plan.takeProfit2 - plan.entryPrice);
  const rrNumeric = riskDist > 0 ? rewardDist / riskDist : 0;
  const rrPassed = rrNumeric >= 1.95;

  // 7-Gate Institutional Checklist (Minervini / O'Neil / Bandarmology / Van Tharp / Qullamaggie)
  const gate1Data = validity.status !== 'invalid' && plan.adtvPassed !== false;
  const gate2Stage2 = trendOk;
  const gate3Flow = hasFlowSponsorship;
  const gate4NotExtended = !isOverextended && !araArb.blocked && atrMultipleExtension <= 2.35;
  const gate5AsymmetricRr = rrPassed;
  const gate6RsLeader = rsRank >= 65 || Boolean(plan.episodicPivot);
  const gate7MacroClear = !macroThrottled || (stage === 'Stage 2 Advancing' && rsRank >= 75);

  const gatesPassed = [
    gate1Data,
    gate2Stage2,
    gate3Flow,
    gate4NotExtended,
    gate5AsymmetricRr,
    gate6RsLeader,
    gate7MacroClear,
  ].filter(Boolean).length;
  const gatesTotal = 7;

  // Enforce hard data-validity, Stage 4 filter, IDX ARA/ARB guard, Macro Throttle & anti-chase survival discipline
  let finalAction: StockExecutionAction = plan.action;
  let finalVerdict = plan.verdictLabel;
  let finalCaution = plan.cautionNote;

  if (validity.status === 'invalid') {
    finalAction = 'WAIT';
    finalVerdict = 'WATCH';
    finalCaution = `Data Guard: ${validity.note} — blocked from active BUY/SELL execution.`;
  } else if (finalAction === 'BUY' && araArb.blocked) {
    finalAction = 'WAIT';
    finalVerdict = 'WAIT PULLBACK';
    finalCaution = araArb.note;
  } else if (finalAction === 'BUY' && plan.adtvPassed === false) {
    finalAction = 'WAIT';
    finalVerdict = 'WATCH';
    finalCaution = `Liquidity Floor: 20D ADTV (${plan.adtvLabel}) below institutional floor — blocked from active BUY.`;
  } else if (finalAction === 'BUY' && stage === 'Stage 4 Declining' && !plan.episodicPivot) {
    finalAction = 'WAIT';
    finalVerdict = 'AVOID / SELL';
    finalCaution = `Stage 4 Downtrend Filter (${minerviniPassedCount}/8) — avoid catching falling knives below 50/150/200D SMA.`;
  } else if (finalAction === 'BUY' && (atrMultipleExtension > 2.4 || !rrPassed) && !plan.episodicPivot) {
    finalAction = 'WAIT';
    finalVerdict = 'WAIT PULLBACK';
    finalCaution = !rrPassed
      ? `R:R below 1:2.0 minimum (${rrNumeric.toFixed(1)}R) — wait deeper Demand retest.`
      : `Stretched +${extensionPct.toFixed(1)}% (${atrMultipleExtension.toFixed(1)}x 14D ATR) above Demand — do not chase.`;
  } else if (finalAction === 'BUY' && macroThrottled && !(stage === 'Stage 2 Advancing' && rsRank >= 75 && (plan.vcpDetected || plan.episodicPivot || rangePos <= 0.48))) {
    finalAction = 'WAIT';
    finalVerdict = 'WAIT PULLBACK';
    finalCaution = `${macroRegimeNote ?? 'Macro Regime Throttled'} — deferred to Demand pullback.`;
  }

  // Upgrade scannerScore with Phase 1–3 structural edge bonuses
  const baseScanner = plan.scannerScore ?? 50;
  const phaseBonus =
    (stage === 'Stage 2 Advancing' ? 8 : stage === 'Stage 4 Declining' ? -16 : 0) +
    (rsRank >= 80 ? 7 : rsRank >= 65 ? 3 : rsRank < 35 ? -8 : 0) +
    (plan.vcpDetected ? 7 : 0) +
    (plan.episodicPivot ? 8 : 0) +
    (isTopSector ? 4 : 0) +
    (accPersistence5d >= 4 ? 4 : 0) -
    (araArb.blocked ? 20 : 0) -
    (plan.adtvPassed === false ? 15 : 0);
  const scannerScore = Math.round(Math.max(5, Math.min(99, baseScanner + phaseBonus)));

  // Enrich buyReasons with Phase 1-3 institutional drivers
  const enhancedReasons = [...(plan.buyReasons ?? [])];
  if (stage === 'Stage 2 Advancing' && !enhancedReasons.some((r) => r.includes('Stage 2'))) {
    enhancedReasons.unshift(`Stage 2 (${minerviniPassedCount}/8)`);
  }
  if (rsRank >= 75 && !enhancedReasons.some((r) => r.includes('RS '))) {
    enhancedReasons.push(`RS Rank ${rsRank}`);
  }
  if (plan.vcpDetected && !enhancedReasons.some((r) => r.includes('VCP'))) {
    enhancedReasons.push(`VCP Tight (${plan.vcpContractionPct ?? 6}% · ${plan.vcpDryUpRatio ?? 0.7}x Vol)`);
  }
  if (plan.episodicPivot && !enhancedReasons.some((r) => r.includes('EP'))) {
    enhancedReasons.unshift('Episodic Pivot (EP)');
  }
  if (isTopSector && !enhancedReasons.some((r) => r.includes('Top Sector'))) {
    enhancedReasons.push(`Top-${sectorRank ?? 3} Sector (${sector})`);
  }

  const setupGrade: StockTradePlan['setupGrade'] =
    finalAction === 'WAIT' || validity.status === 'invalid'
      ? 'WATCH'
      : gatesPassed >= 6 && plan.conviction >= 68 && !macroThrottled
        ? 'A+'
        : gatesPassed >= 5 && plan.conviction >= 58
          ? 'A'
          : 'B';

  const positionSizeNote =
    setupGrade === 'A+'
      ? 'Full Risk Unit (1.0R) · 50% at TP1 → Trail 10D/20D EMA'
      : setupGrade === 'A'
        ? macroThrottled
          ? 'Throttled Size (0.5R) · Macro headwind active'
          : 'Standard Risk (0.75R) · Confirm closing volume'
        : setupGrade === 'B'
          ? 'Half Size (0.5R) · Strict hard stop discipline'
          : '0R Flat · Wait for limit fill inside Demand';

  const invalidationRule =
    finalAction === 'SELL'
      ? `Thesis invalidated on daily close above ${formatStockCurrencyValue(plan.stopLoss, stock.currency)}`
      : `Thesis invalidated on close below ${formatStockCurrencyValue(plan.stopLoss, stock.currency)} (Demand broken)`;

  const trailingExitNote =
    plan.trailingExitNote ??
    `Scale 50% at TP1 (${formatStockCurrencyValue(plan.takeProfit1, stock.currency)}) → SL to BE → Trail runner on daily close < 10D/20D EMA.`;

  return {
    ...plan,
    action: finalAction,
    verdictLabel: finalVerdict,
    cautionNote: finalCaution,
    scannerScore,
    buyReasons: enhancedReasons.slice(0, 5),
    dataValidity: validity.status,
    dataValidityNote: validity.note,
    setupGrade,
    atrPct,
    extensionPct,
    positionSizeNote,
    invalidationRule,
    gatesPassed,
    gatesTotal,
    stage,
    minerviniPassedCount,
    minerviniTotalCount: 8,
    rsRank,
    rsVsBenchPct,
    araArbBlocked: araArb.blocked,
    araArbGuardNote: araArb.note,
    macroRegimeThrottled: macroThrottled,
    macroRegimeNote,
    accPersistence5d,
    trailingExitNote,
    sector,
    sectorRank,
    isTopSector,
  };
}

export function computeStockTradeStrategy(
  stock: StockMover,
  macroCtx?: StockMacroRegimeContext,
  crossCtx?: StockCrossSectionalContext
): StockTradePlan {
  const validity = validateStockData(stock);
  const px = Math.max(stock.price, stock.prevClose, 1);
  if (
    stock.tradePlan &&
    stock.tradePlan.entryPrice > 0 &&
    stock.tradePlan.stopLoss > 0 &&
    stock.tradePlan.takeProfit1 > 0 &&
    stock.tradePlan.takeProfit2 > 0
  ) {
    const demHi = stock.tradePlan.demandHighNum ?? px * 0.985;
    const supLo = stock.tradePlan.supplyLowNum ?? px * 1.015;
    const posInSd = (px - demHi) / Math.max(1e-6, supLo - demHi);
    const overextended = stock.changePercent >= 8.5 || (posInSd >= 0.78 && stock.changePercent >= 3.0);
    const enriched = deriveIdxVerdictAndScore(stock, stock.tradePlan, posInSd, overextended);
    return attachInstitutionalTradeMetadata(
      stock,
      {
        ...stock.tradePlan,
        ...enriched,
      },
      validity,
      posInSd,
      overextended,
      macroCtx,
      crossCtx
    );
  }

  const cur = stock.currency;
  const validPts = (stock.sparklinePoints ?? []).filter(
    (v) => typeof v === 'number' && Number.isFinite(v) && v > 0
  );
  const seriesLow = validPts.length > 0 ? Math.min(...validPts) : px * 0.985;
  const seriesHigh = validPts.length > 0 ? Math.max(...validPts) : px * 1.015;
  const dayLow = stock.dayLow > 0 ? Math.min(stock.dayLow, px) : seriesLow;
  const dayHigh = stock.dayHigh > 0 ? Math.max(stock.dayHigh, px) : seriesHigh;
  const swingLow = Math.min(dayLow, seriesLow, stock.prevClose > 0 ? stock.prevClose * 0.992 : px * 0.985);
  const swingHigh = Math.max(dayHigh, seriesHigh, stock.prevClose > 0 ? stock.prevClose * 1.008 : px * 1.015);
  const totalSpan = Math.max(swingHigh - swingLow, px * 0.025);

  const demandLow = snapStockPriceToTick(swingLow, cur);
  const demandHigh = snapStockPriceToTick(swingLow + totalSpan * 0.24, cur);
  const supplyLow = snapStockPriceToTick(swingHigh - totalSpan * 0.24, cur);
  const supplyHigh = snapStockPriceToTick(swingHigh, cur);

  const rangePos = Math.max(0, Math.min(1, (px - swingLow) / totalSpan));
  const bandar = stock.bandarmology;
  const bandarScore = bandar?.score ?? Math.round(Math.tanh(stock.changePercent / 2) * 35);
  const accPressure = bandar?.accumulationPressure ?? 50;
  const volRatio = bandar?.volumeRatio ?? 1.0;

  let flowBonus = 0;
  if (stock.foreignFlowSide === 'BUY' || (stock.foreignNetAmount ?? 0) > 0) flowBonus = 18;
  else if (stock.foreignFlowSide === 'SELL' || (stock.foreignNetAmount ?? 0) < 0) flowBonus = -18;

  const zoneBias = rangePos <= 0.38 ? 16 : rangePos >= 0.72 ? -14 : 0;
  const composite = bandarScore * 0.65 + (accPressure - 50) * 0.65 + flowBonus + zoneBias;
  const isOverextended = stock.changePercent >= 8.5 || (rangePos >= 0.78 && stock.changePercent >= 3.0);

  let action: StockExecutionAction = 'WAIT';
  if (!isOverextended && composite >= 14 && rangePos <= 0.74) {
    action = 'BUY';
  } else if (composite <= -14 && rangePos >= 0.22) {
    action = 'SELL';
  }

  const conviction = Math.max(
    44,
    Math.min(95, Math.round(52 + Math.abs(composite) * 0.55 + Math.min(12, Math.max(0, (volRatio - 1) * 8))))
  );

  const demandZoneLabel = `${formatStockCurrencyValue(demandLow, cur)} – ${formatStockCurrencyValue(demandHigh, cur)}`;
  const supplyZoneLabel = `${formatStockCurrencyValue(supplyLow, cur)} – ${formatStockCurrencyValue(supplyHigh, cur)}`;
  const bandarFlowBias =
    stock.foreignFlowSide === 'BUY'
      ? `Net Foreign Buy${stock.foreignNetLabel ? ` (${stock.foreignNetLabel})` : ''}`
      : stock.foreignFlowSide === 'SELL'
        ? `Net Foreign Sell${stock.foreignNetLabel ? ` (${stock.foreignNetLabel})` : ''}`
        : bandar?.foreignBias || (accPressure >= 55 ? 'Smart-Money Inflow' : accPressure <= 45 ? 'Distribution Flow' : 'Balanced Flow');

  const tickStep =
    cur === 'IDR'
      ? px < 200 ? 1 : px < 500 ? 2 : px < 2000 ? 5 : px < 5000 ? 10 : 25
      : 0.01;

  let basePlan: StockTradePlan;

  if (action === 'BUY') {
    const rawEntry = rangePos <= 0.45 ? px : Math.min(px, (px + demandHigh) / 2);
    const entryPrice = snapStockPriceToTick(rawEntry, cur);
    const entryHi = snapStockPriceToTick(Math.max(entryPrice, Math.min(px, entryPrice * 1.006)), cur);
    const stopLoss = snapStockPriceToTick(Math.min(demandLow - tickStep * 2, entryPrice - totalSpan * 0.42), cur);
    const risk = Math.max(tickStep * 2, entryPrice - stopLoss);
    const tp1 = snapStockPriceToTick(Math.max(supplyLow, entryPrice + risk * 1.5), cur);
    const tp2 = snapStockPriceToTick(Math.max(tp1 + risk * 0.75, supplyHigh, entryPrice + risk * 2.4), cur);
    const rrVal = Math.max(1.5, Number(((tp2 - entryPrice) / risk).toFixed(1)));
    const phaseText = bandar?.phase && bandar.phase !== 'Neutral' ? bandar.phase : 'Demand Accumulation';

    basePlan = {
      action,
      conviction,
      strategyTag: `${phaseText} + Demand Entry`,
      entryPrice,
      entryZoneLabel:
        entryHi > entryPrice
          ? `${formatStockCurrencyValue(entryPrice, cur)} – ${formatStockCurrencyValue(entryHi, cur)}`
          : formatStockCurrencyValue(entryPrice, cur),
      takeProfit1: tp1,
      takeProfit2: tp2,
      stopLoss,
      riskReward: `1:${rrVal.toFixed(1)}`,
      demandZoneLabel,
      supplyZoneLabel,
      bandarFlowBias,
      executionNote: `BUY limit/market near ${formatStockCurrencyValue(entryPrice, cur)} on ${bandarFlowBias}; take 50% at ${formatStockCurrencyValue(tp1, cur)} (Supply), trail runner to ${formatStockCurrencyValue(tp2, cur)}, SL below demand at ${formatStockCurrencyValue(stopLoss, cur)}.`,
      demandLowNum: demandLow,
      demandHighNum: demandHigh,
      supplyLowNum: supplyLow,
      supplyHighNum: supplyHigh,
    };
  } else if (action === 'SELL') {
    const rawEntry = rangePos >= 0.55 ? px : Math.max(px, (px + supplyLow) / 2);
    const entryPrice = snapStockPriceToTick(rawEntry, cur);
    const entryLo = snapStockPriceToTick(Math.min(entryPrice, Math.max(px, entryPrice * 0.994)), cur);
    const stopLoss = snapStockPriceToTick(Math.max(supplyHigh + tickStep * 2, entryPrice + totalSpan * 0.42), cur);
    const risk = Math.max(tickStep * 2, stopLoss - entryPrice);
    const tp1 = snapStockPriceToTick(Math.min(demandHigh, entryPrice - risk * 1.5), cur);
    const tp2 = snapStockPriceToTick(Math.min(tp1 - risk * 0.75, demandLow, entryPrice - risk * 2.4), cur);
    const rrVal = Math.max(1.5, Number(((entryPrice - tp2) / risk).toFixed(1)));
    const phaseText = bandar?.phase && bandar.phase !== 'Neutral' ? bandar.phase : 'Supply Distribution';

    basePlan = {
      action,
      conviction,
      strategyTag: `${phaseText} + Supply Reject`,
      entryPrice,
      entryZoneLabel:
        entryLo < entryPrice
          ? `${formatStockCurrencyValue(entryLo, cur)} – ${formatStockCurrencyValue(entryPrice, cur)}`
          : formatStockCurrencyValue(entryPrice, cur),
      takeProfit1: tp1,
      takeProfit2: tp2,
      stopLoss,
      riskReward: `1:${rrVal.toFixed(1)}`,
      demandZoneLabel,
      supplyZoneLabel,
      bandarFlowBias,
      executionNote: `SELL / Take-Profit near Supply ${formatStockCurrencyValue(entryPrice, cur)} on distribution flow; scale down into ${formatStockCurrencyValue(tp1, cur)} & Demand ${formatStockCurrencyValue(tp2, cur)}, hard SL above ${formatStockCurrencyValue(stopLoss, cur)}.`,
      demandLowNum: demandLow,
      demandHighNum: demandHigh,
      supplyLowNum: supplyLow,
      supplyHighNum: supplyHigh,
    };
  } else {
    // WAIT setup: expose clear conditional buy limit at Demand Zone with protective SL and Supply TP targets
    const entryPrice = snapStockPriceToTick(demandHigh, cur);
    const stopLoss = snapStockPriceToTick(Math.min(demandLow - tickStep * 2, entryPrice - totalSpan * 0.45), cur);
    const risk = Math.max(tickStep * 2, entryPrice - stopLoss);
    const tp1 = snapStockPriceToTick(Math.max(supplyLow, entryPrice + risk * 1.5), cur);
    const tp2 = snapStockPriceToTick(Math.max(tp1 + risk * 0.65, supplyHigh), cur);
    const rrVal = Math.max(1.5, Number(((tp2 - entryPrice) / risk).toFixed(1)));

    basePlan = {
      action: 'WAIT',
      conviction,
      strategyTag: isOverextended
        ? 'Extended · Wait Demand Pullback'
        : 'Neutral Zone · Await Pullback / Flow',
      entryPrice,
      entryZoneLabel: demandZoneLabel,
      takeProfit1: tp1,
      takeProfit2: tp2,
      stopLoss,
      riskReward: `1:${rrVal.toFixed(1)}`,
      demandZoneLabel,
      supplyZoneLabel,
      bandarFlowBias,
      executionNote: isOverextended
        ? `CHASE GUARD (+${stock.changePercent.toFixed(1)}%): Do not chase near Supply. Place BUY limit inside Demand ${demandZoneLabel} (TP ${formatStockCurrencyValue(tp1, cur)}, SL ${formatStockCurrencyValue(stopLoss, cur)}).`
        : `WAIT mid-range: only place BUY limit inside Demand ${demandZoneLabel} on volume/foreign confirmation (TP ${formatStockCurrencyValue(tp1, cur)}, SL ${formatStockCurrencyValue(stopLoss, cur)}), or sell rallies into ${supplyZoneLabel}.`,
      demandLowNum: demandLow,
      demandHighNum: demandHigh,
      supplyLowNum: supplyLow,
      supplyHighNum: supplyHigh,
    };
  }

  return attachInstitutionalTradeMetadata(
    stock,
    {
      ...basePlan,
      ...deriveIdxVerdictAndScore(stock, basePlan, rangePos, isOverextended),
    },
    validity,
    rangePos,
    isOverextended,
    macroCtx,
    crossCtx
  );
}

/**
 * Combined Macro Regime + Breadth + Signal Ledger Survival Engine (Minervini / Van Tharp / Seykota).
 * Dynamically adapts stock position sizing and selectivity when market breadth deteriorates or ledger hits drawdown.
 */
export function computeStockDeskSurvival(
  assets: MarketAsset[],
  idxBucket: StocksMoversBucket,
  usBucket: StocksMoversBucket,
  signalHistory: SignalHistoryRecord[] = []
): StockDeskSurvivalStatus {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const spx = byId.get('SPX');
  const ihsg = byId.get('IHSG');
  const dxy = byId.get('DXY');
  const usdidr = byId.get('USDIDR');

  const allStocks = [
    ...(idxBucket.impact ?? []),
    ...(idxBucket.gainers ?? []),
    ...(idxBucket.losers ?? []),
    ...(usBucket.impact ?? []),
    ...(usBucket.gainers ?? []),
    ...(usBucket.losers ?? []),
  ];
  const uniqueMap = new Map<string, StockMover>();
  for (const s of allStocks) {
    uniqueMap.set(`${s.market}:${s.symbol}`, s);
  }
  const uniqueStocks = Array.from(uniqueMap.values());

  let verifiedDataCount = 0;
  let filteredOutCount = 0;
  let advancingCount = 0;

  for (const s of uniqueStocks) {
    const v = validateStockData(s);
    if (v.status === 'invalid') {
      filteredOutCount += 1;
    } else {
      verifiedDataCount += 1;
      if (s.changePercent > 0.1) advancingCount += 1;
    }
  }

  const breadthPct =
    verifiedDataCount > 0 ? Math.round((advancingCount / verifiedDataCount) * 100) : 50;

  const idxChg = ihsg?.changePercent ?? 0;
  const spxChg = spx?.changePercent ?? 0;
  const fxStress = (dxy?.changePercent ?? 0) >= 0.45 || (usdidr?.changePercent ?? 0) >= 0.35;

  const idxRegime: StockDeskSurvivalStatus['idxRegime'] =
    idxChg >= 0.25 && (usdidr?.changePercent ?? 0) < 0.3
      ? 'Bullish'
      : idxChg <= -0.45 || (usdidr?.changePercent ?? 0) >= 0.45
        ? 'Defensive'
        : 'Neutral';

  const usRegime: StockDeskSurvivalStatus['usRegime'] =
    spxChg >= 0.25 && (dxy?.changePercent ?? 0) < 0.45
      ? 'Bullish'
      : spxChg <= -0.45
        ? 'Defensive'
        : 'Neutral';

  // Evaluate stock ledger drawdown & consecutive losses from unified Signal History
  const stockRecords = signalHistory
    .filter((r) => r.assetClass === 'stock_id' || r.assetClass === 'stock_us')
    .sort((a, b) => (b.closedAtMs ?? b.createdAtMs) - (a.closedAtMs ?? a.createdAtMs));

  let wins = 0;
  let losses = 0;
  let netR = 0;
  let consecutiveLosses = 0;
  let streakBroken = false;

  for (const r of stockRecords) {
    if (r.status === 'TP1_HIT' || r.status === 'TP2_HIT') {
      wins += 1;
      netR += r.rMultiple;
      streakBroken = true;
    } else if (r.status === 'SL_HIT') {
      losses += 1;
      netR += r.rMultiple;
      if (!streakBroken) consecutiveLosses += 1;
    } else if (r.status === 'BE_CLOSED') {
      netR += r.rMultiple;
      streakBroken = true;
    }
  }
  const decided = wins + losses;
  const ledgerWinRatePct = decided > 0 ? Math.round((wins / decided) * 100) : null;

  const macroDefensive = idxRegime === 'Defensive' && usRegime === 'Defensive';
  const breadthWeak = breadthPct < 36;
  const ledgerDrawdown = consecutiveLosses >= 3 || netR <= -2.5;
  const ledgerCaution = consecutiveLosses === 2 || netR <= -1.2;

  let mode: StockDeskSurvivalStatus['mode'] = 'NORMAL';
  if (macroDefensive || ledgerDrawdown || (breadthWeak && fxStress)) {
    mode = 'DEFENSIVE';
  } else if (
    idxRegime === 'Defensive' ||
    usRegime === 'Defensive' ||
    breadthPct < 46 ||
    fxStress ||
    ledgerCaution
  ) {
    mode = 'CAUTION';
  }

  const riskPerTradePct = mode === 'NORMAL' ? 1.0 : mode === 'CAUTION' ? 0.5 : 0.25;
  const maxConcurrentPositions = mode === 'NORMAL' ? 5 : mode === 'CAUTION' ? 3 : 2;
  const minConvictionRequired = mode === 'NORMAL' ? 60 : mode === 'CAUTION' ? 68 : 76;

  const headline =
    mode === 'NORMAL'
      ? 'Constructive tape & clean ledger — execute A+/A Demand & Accumulation setups at 1.0% risk/trade.'
      : mode === 'CAUTION'
        ? 'Mixed macro breadth or FX pressure — cut size to 0.5% risk/trade and avoid mid-range entries.'
        : 'Capital Preservation Protocol active — cap risk at 0.25%/trade, A+ verified setups only, keep cash heavy.';

  const rules: StockDeskSurvivalStatus['rules'] = [
    {
      id: 'macro-regime',
      label: 'Index & FX Regime',
      passed: idxRegime !== 'Defensive' && usRegime !== 'Defensive' && !fxStress,
      detail: `IDX ${idxRegime} (${idxChg >= 0 ? '+' : ''}${idxChg.toFixed(2)}%) · US ${usRegime} (${spxChg >= 0 ? '+' : ''}${spxChg.toFixed(2)}%)${fxStress ? ' · FX Stress' : ''}`,
    },
    {
      id: 'market-breadth',
      label: 'Screener Breadth',
      passed: breadthPct >= 46,
      detail: `${breadthPct}% advancing across ${verifiedDataCount} verified tickers`,
    },
    {
      id: 'data-validity',
      label: 'Data Validity Guard',
      passed: filteredOutCount === 0,
      detail:
        filteredOutCount > 0
          ? `${verifiedDataCount} verified · ${filteredOutCount} corrupt/illiquid blocked`
          : `${verifiedDataCount} quotes passed OHLC & liquidity audit`,
    },
    {
      id: 'ledger-guard',
      label: 'Drawdown & Streak Guard',
      passed: !ledgerDrawdown && !ledgerCaution,
      detail:
        decided > 0
          ? `${wins}W/${losses}L (${ledgerWinRatePct}% WR · ${netR >= 0 ? '+' : ''}${netR.toFixed(1)}R · ${consecutiveLosses} streak L)`
          : 'No closed stock drawdowns — fresh risk budget',
    },
  ];

  return {
    mode,
    riskPerTradePct,
    maxConcurrentPositions,
    minConvictionRequired,
    breadthPct,
    idxRegime,
    usRegime,
    ledgerWinRatePct,
    consecutiveLosses,
    netR: Number(netR.toFixed(2)),
    verifiedDataCount,
    filteredOutCount,
    headline,
    rules,
  };
}

export interface IdxScannerCandidate {
  stock: StockMover;
  plan: StockTradePlan;
  scannerScore: number;
  verdictLabel: NonNullable<StockTradePlan['verdictLabel']>;
  isBuyReady: boolean;
  isPullbackQueue: boolean;
}

export function buildIdxBuyScannerList(
  idxBucket: StocksMoversBucket,
  macroCtx?: StockMacroRegimeContext,
  crossCtx?: StockCrossSectionalContext
): IdxScannerCandidate[] {
  const pool = [
    ...(idxBucket.foreignBuy ?? []),
    ...(idxBucket.impact ?? []),
    ...(idxBucket.gainers ?? []),
    ...(idxBucket.losers ?? []),
    ...(idxBucket.foreignSell ?? []),
  ];

  const deduped = new Map<string, StockMover>();
  for (const item of pool) {
    if (item.market !== 'ID') continue;
    const sym = item.symbol.trim().toUpperCase().replace(/\.JK$/i, '');
    if (!sym || item.price <= 0) continue;
    const existing = deduped.get(sym);
    if (!existing) {
      deduped.set(sym, { ...item, symbol: sym });
    } else {
      deduped.set(sym, {
        ...existing,
        ...item,
        symbol: sym,
        bandarmology: item.bandarmology ?? existing.bandarmology,
        tradePlan: item.tradePlan ?? existing.tradePlan,
        foreignNetAmount: item.foreignNetAmount ?? existing.foreignNetAmount,
        foreignNetLabel: item.foreignNetLabel ?? existing.foreignNetLabel,
        foreignFlowSide: item.foreignFlowSide ?? existing.foreignFlowSide,
      });
    }
  }

  const dedupedList = Array.from(deduped.values());
  const effectiveCrossCtx =
    crossCtx ?? computeCrossSectionalStockContext(dedupedList, 'ID', macroCtx?.ihsgChgPct ?? 0);

  const results: IdxScannerCandidate[] = [];
  for (const stock of dedupedList) {
    const plan = computeStockTradeStrategy(stock, macroCtx, effectiveCrossCtx);
    const verdictLabel = plan.verdictLabel ?? 'WATCH';
    const scannerScore = plan.scannerScore ?? 50;
    const isBuyReady =
      plan.action === 'BUY' ||
      verdictLabel === 'BUY NOW (ACCUMULATION)' ||
      verdictLabel === 'BUY AT DEMAND' ||
      verdictLabel === 'BREAKOUT BUY';
    const isPullbackQueue =
      !isBuyReady &&
      verdictLabel === 'WAIT PULLBACK' &&
      ((stock.bandarmology?.score ?? 0) >= 8 ||
        stock.foreignFlowSide === 'BUY' ||
        (stock.foreignNetAmount ?? 0) > 0);

    results.push({
      stock,
      plan,
      scannerScore,
      verdictLabel,
      isBuyReady,
      isPullbackQueue,
    });
  }

  return results.sort((a, b) => {
    if (a.isBuyReady !== b.isBuyReady) return a.isBuyReady ? -1 : 1;
    if (b.scannerScore !== a.scannerScore) return b.scannerScore - a.scannerScore;
    return b.plan.conviction - a.plan.conviction;
  });
}
