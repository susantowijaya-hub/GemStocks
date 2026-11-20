import { MarketAsset, MarketSignalInfo, SignalTier, StockMover } from '../types/market';

export function parseFormattedMarketNumber(raw: string | number | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (!raw) return NaN;
  const cleaned = String(raw).replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : NaN;
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
  const highNum = parseFormattedMarketNumber(asset.dayHigh);
  const lowNum = parseFormattedMarketNumber(asset.dayLow);
  const openNum = parseFormattedMarketNumber(asset.open);
  const series = asset.chartSeries['1D']?.length ? asset.chartSeries['1D'] : asset.sparklinePoints;

  return computeTechnicalSignal({
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
}

export function getStockSignal(stock: StockMover): MarketSignalInfo {
  return computeTechnicalSignal({
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
}
