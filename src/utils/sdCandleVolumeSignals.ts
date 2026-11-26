import {
  CandlePoint,
  EconomicEvent,
  IctDirection,
  MarketAsset,
  SdCandleVolumeSignal,
  Timeframe,
} from '../types/market';
import {
  buildAssetInvalidationTrigger,
  checkLiveSetupValidity,
  checkMacroNewsBlackout,
  compute15mAtrMetrics,
  computeAtr,
  computeSetupGrade,
  detectSwingStructureBias,
  extractBarsForTf,
  findUnmitigatedFvgAndOb,
  formatBand,
  formatPriceWithAsset,
  getAssetStopFloorBuffer,
  isIctEligibleAsset,
  resolveUsdExposure,
  splitConfirmedClosedBars,
  TF_BAR_MINUTES,
} from './ictSignals';

function isSdcvActiveKillzone(now = new Date()): boolean {
  const toMin = (tz: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return h * 60 + m;
  };
  const londonMin = toMin('Europe/London');
  const nyMin = toMin('America/New_York');
  return (
    (londonMin >= 7 * 60 && londonMin < 10 * 60) ||
    (nyMin >= 8 * 60 && nyMin < 11 * 60) ||
    (nyMin >= 13 * 60 + 30 && nyMin < 16 * 60)
  );
}

const SD_TF_PRIORITY: Timeframe[] = ['15m', '1h', '30m', '5m', '4h', '1m', '1D'];

function parseCompactVolume(val: string | undefined): number {
  if (!val) return 0;
  const clean = val.trim().replace(/,/g, '').toUpperCase();
  const num = parseFloat(clean.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return 0;
  if (clean.endsWith('B')) return num * 1_000_000_000;
  if (clean.endsWith('M')) return num * 1_000_000;
  if (clean.endsWith('K')) return num * 1_000;
  return num;
}

function analyzeCandleReading(bars: CandlePoint[], atr: number): {
  pattern: string;
  tone: 'bull' | 'bear' | 'neutral';
  detail: string;
  strength: number;
} {
  if (bars.length < 3) {
    return {
      pattern: 'Consolidation Bar',
      tone: 'neutral',
      detail: 'Insufficient candles for pattern confirmation.',
      strength: 0,
    };
  }

  const prev = bars[bars.length - 2];
  const cur = bars[bars.length - 1];
  const fullRange = Math.max(1e-6, cur.h - cur.l);
  const body = Math.abs(cur.c - cur.o);
  const prevBody = Math.abs(prev.c - prev.o);
  const upperWick = cur.h - Math.max(cur.o, cur.c);
  const lowerWick = Math.min(cur.o, cur.c) - cur.l;
  const bodyPct = Math.round((body / fullRange) * 100);
  const closePos = (cur.c - cur.l) / fullRange;

  // 1. Bullish Rejection Pin Bar / Hammer
  if (
    lowerWick >= Math.max(body * 1.75, atr * 0.42) &&
    upperWick <= Math.max(body * 0.7, fullRange * 0.22) &&
    closePos >= 0.58
  ) {
    return {
      pattern: 'Bullish Rejection Pin Bar',
      tone: 'bull',
      detail: `Long lower rejection wick (${((lowerWick / fullRange) * 100).toFixed(0)}% of bar) closing in upper ${(closePos * 100).toFixed(0)}% range.`,
      strength: 28,
    };
  }

  // 2. Bearish Shooting Star / Supply Rejection
  if (
    upperWick >= Math.max(body * 1.75, atr * 0.42) &&
    lowerWick <= Math.max(body * 0.7, fullRange * 0.22) &&
    closePos <= 0.42
  ) {
    return {
      pattern: 'Bearish Shooting Star',
      tone: 'bear',
      detail: `Long upper supply wick (${((upperWick / fullRange) * 100).toFixed(0)}% of bar) closing in lower ${((1 - closePos) * 100).toFixed(0)}% range.`,
      strength: 28,
    };
  }

  // 3. Bullish Engulfing
  if (
    cur.c > cur.o &&
    prev.c < prev.o &&
    cur.c >= prev.o &&
    cur.o <= prev.c &&
    body >= Math.max(prevBody * 1.05, atr * 0.55)
  ) {
    return {
      pattern: 'Bullish Engulfing',
      tone: 'bull',
      detail: `Green expansion candle (${bodyPct}% body) fully engulfs prior bearish candle.`,
      strength: 30,
    };
  }

  // 4. Bearish Engulfing
  if (
    cur.c < cur.o &&
    prev.c > prev.o &&
    cur.c <= prev.o &&
    cur.o >= prev.c &&
    body >= Math.max(prevBody * 1.05, atr * 0.55)
  ) {
    return {
      pattern: 'Bearish Engulfing',
      tone: 'bear',
      detail: `Red supply candle (${bodyPct}% body) fully engulfs prior bullish candle.`,
      strength: 30,
    };
  }

  // 5. Bullish Momentum Ignition (Marubozu-like)
  if (cur.c > cur.o && body >= atr * 0.85 && bodyPct >= 62 && closePos >= 0.72) {
    return {
      pattern: 'Bullish Momentum Ignition',
      tone: 'bull',
      detail: `Strong bullish body (${bodyPct}% dominance, ${(body / Math.max(1e-6, atr)).toFixed(2)}x ATR) closing near high.`,
      strength: 26,
    };
  }

  // 6. Bearish Impulse Breakdown
  if (cur.c < cur.o && body >= atr * 0.85 && bodyPct >= 62 && closePos <= 0.28) {
    return {
      pattern: 'Bearish Impulse Breakdown',
      tone: 'bear',
      detail: `Heavy bearish body (${bodyPct}% dominance, ${(body / Math.max(1e-6, atr)).toFixed(2)}x ATR) closing near low.`,
      strength: 26,
    };
  }

  // 7. Inside Bar Compression / Indecision
  if (cur.h <= prev.h && cur.l >= prev.l) {
    return {
      pattern: 'Inside Bar Compression',
      tone: 'neutral',
      detail: `Range contained within prior candle (${bodyPct}% body) — awaiting directional break.`,
      strength: 8,
    };
  }

  if (cur.c > cur.o && closePos >= 0.65 && body >= atr * 0.45) {
    return {
      pattern: 'Bullish Continuation Close',
      tone: 'bull',
      detail: `Buyers hold upper ${(closePos * 100).toFixed(0)}% close with ${bodyPct}% candle body.`,
      strength: 18,
    };
  }

  if (cur.c < cur.o && closePos <= 0.35 && body >= atr * 0.45) {
    return {
      pattern: 'Bearish Continuation Close',
      tone: 'bear',
      detail: `Sellers hold lower ${((1 - closePos) * 100).toFixed(0)}% close with ${bodyPct}% candle body.`,
      strength: 18,
    };
  }

  return {
    pattern: 'Indecision / Doji Spin',
    tone: 'neutral',
    detail: `Balanced upper & lower wicks (${bodyPct}% body) — no directional candle edge yet.`,
    strength: 6,
  };
}

function analyzeVolumeEffort(
  asset: MarketAsset,
  bars: CandlePoint[],
  atr: number
): {
  ratio: number;
  state: 'Expansion' | 'Above Avg' | 'Normal' | 'Dry / Low';
  source: 'Bar Volume (OHLCV)' | 'Relative Volume' | 'Tick-Range Effort';
} {
  // 1. Prioritize real per-candle OHLCV volume when intraday feed includes bar volume
  const recentVolSlice = bars.slice(-20);
  const volBars = recentVolSlice.filter((b) => typeof b.v === 'number' && Number.isFinite(b.v) && b.v > 0);
  const latestBarVol = recentVolSlice[recentVolSlice.length - 1]?.v;
  if (volBars.length >= 6 && typeof latestBarVol === 'number' && latestBarVol > 0) {
    const priorVols = recentVolSlice
      .slice(0, -1)
      .map((b) => b.v)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (priorVols.length >= 4) {
      const sortedPrior = [...priorVols].sort((a, b) => a - b);
      const medianPrior = sortedPrior[Math.floor(sortedPrior.length / 2)];
      const meanPrior = priorVols.reduce((acc, v) => acc + v, 0) / priorVols.length;
      const baselineVol = medianPrior * 0.55 + meanPrior * 0.45;
      const barVolRatio = Number((latestBarVol / Math.max(1, baselineVol)).toFixed(2));
      const barVolState: 'Expansion' | 'Above Avg' | 'Normal' | 'Dry / Low' =
        barVolRatio >= 1.35
          ? 'Expansion'
          : barVolRatio >= 1.08
            ? 'Above Avg'
            : barVolRatio >= 0.8
              ? 'Normal'
              : 'Dry / Low';
      return {
        ratio: barVolRatio,
        state: barVolState,
        source: 'Bar Volume (OHLCV)',
      };
    }
  }

  const volNum = parseCompactVolume(asset.volume);
  const avgVolNum = parseCompactVolume(asset.avgVol);
  const hasRealSessionVol = volNum > 0 && avgVolNum > 0;

  const recentSlice = bars.slice(-14);
  const efforts = recentSlice.map((b) => {
    const r = Math.max(1e-6, b.h - b.l);
    const bodyEff = Math.abs(b.c - b.o) / r;
    return (r / Math.max(1e-6, atr)) * (0.65 + bodyEff * 0.55);
  });

  const lastEffort = efforts[efforts.length - 1] ?? 1;
  const prevEffort = efforts[efforts.length - 2] ?? 1;
  const baselineSlice = efforts.slice(0, -1);
  const sortedBase = [...baselineSlice].sort((a, b) => a - b);
  const medianBase =
    sortedBase.length > 0 ? sortedBase[Math.floor(sortedBase.length / 2)] : 1;

  const tickEffortRatio = Math.max(lastEffort, (lastEffort + prevEffort) * 0.55) / Math.max(0.25, medianBase);
  const sessionVolRatio = hasRealSessionVol ? volNum / avgVolNum : tickEffortRatio;

  const blended = hasRealSessionVol
    ? Number((sessionVolRatio * 0.55 + tickEffortRatio * 0.45).toFixed(2))
    : Number(tickEffortRatio.toFixed(2));

  const state: 'Expansion' | 'Above Avg' | 'Normal' | 'Dry / Low' =
    blended >= 1.35
      ? 'Expansion'
      : blended >= 1.08
        ? 'Above Avg'
        : blended >= 0.8
          ? 'Normal'
          : 'Dry / Low';

  return {
    ratio: blended,
    state,
    source: hasRealSessionVol ? 'Relative Volume' : 'Tick-Range Effort',
  };
}

export function computeSdCandleVolumeSignal(
  asset: MarketAsset,
  preferredTimeframe?: Timeframe,
  enforceVolatilityFilter = true,
  economicEvents?: EconomicEvent[],
  enforceNewsBlackout = true
): SdCandleVolumeSignal {
  const candidates: Timeframe[] = preferredTimeframe
    ? [preferredTimeframe, ...SD_TF_PRIORITY.filter((tf) => tf !== preferredTimeframe)]
    : SD_TF_PRIORITY;

  const { bars: rawBars, timeframe, isRealOhlc } = extractBarsForTf(asset, candidates, 10);
  if (!isRealOhlc || rawBars.length < 10) {
    const atr15m = compute15mAtrMetrics(asset, asset.price);
    const warmingPrice = formatPriceWithAsset(asset.price, asset);
    return {
      assetId: asset.id,
      symbol: asset.symbol,
      name: asset.shortName,
      assetClassLabel: atr15m.assetClassLabel,
      direction: 'NEUTRAL',
      confidence: 20,
      timeframe,
      currentPrice: asset.price,
      decimals: asset.decimals,
      currencyPrefix: asset.currencyPrefix,
      unitSuffix: asset.unitSuffix,
      evaluatedAt: asset.updatedAtEpoch ?? Date.now(),
      zoneBias: 'Mid-Range',
      zoneStatus: 'Mid-Range',
      demandZone: '—',
      supplyZone: '—',
      candlePattern: 'Awaiting Real OHLC',
      candleTone: 'neutral',
      candleDetail: 'Waiting for real multi-bar OHLC candlestick history to load.',
      volumeRatio: 1,
      volumeState: 'Normal',
      volumeSource: 'Tick-Range Effort',
      entryZone: `Standby (${warmingPrice})`,
      stopLoss: '—',
      tp1: '—',
      tp2: '—',
      riskReward: 'WAIT',
      atr15mPct: atr15m.atr15mPct,
      volatilityMinPct: atr15m.minPct,
      volatilityMaxPct: atr15m.maxPct,
      volatilityStatus: 'warming',
      volatilityPassed: false,
      atrSource: 'warming',
      executionStatus: 'standby',
      projectedLevelsSummary: `Warming real ${timeframe} OHLCV bars for ${asset.symbol}`,
      invalidationTrigger: 'Hold flat until real OHLC candlestick bars finish syncing.',
      actionSummary: 'WAIT · Warming Real OHLCV Bars — synthetic fallback candles disabled.',
      triggers: [
        'Awaiting Real OHLC',
        'Supply & Demand Warming',
        'Tick-Range Effort Pending',
        'Warming 15m Bars',
      ],
      isClosedCandleConfirmed: false,
      candleStageLabel: 'Awaiting Real OHLC',
      isRealOhlc: false,
      setupGrade: 'WAIT',
      isAPlusSetup: false,
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
  const atr = computeAtr(bars, 14);

  // 1. Supply & Demand Zone Mapping (unmitigated base imbalance or structural extremes)
  const imb = findUnmitigatedFvgAndOb(bars, atr, 30, 0.14, 0.7);
  const structuralHigh = Math.max(...bars.map((b) => b.h), currentPrice);
  const structuralLow = Math.min(...bars.map((b) => b.l), currentPrice);

  const demandLow = imb.bullOb?.low ?? imb.bullFvg?.low ?? structuralLow;
  const demandHigh = imb.bullOb?.high ?? imb.bullFvg?.high ?? Math.min(currentPrice, structuralLow + atr * 0.85);
  const supplyLow = imb.bearOb?.low ?? imb.bearFvg?.low ?? Math.max(currentPrice, structuralHigh - atr * 0.85);
  const supplyHigh = imb.bearOb?.high ?? imb.bearFvg?.high ?? structuralHigh;

  const demandLo = Math.min(demandLow, demandHigh);
  const demandHi = Math.max(demandLow, demandHigh);
  const supplyLo = Math.min(supplyLow, supplyHigh);
  const supplyHi = Math.max(supplyLow, supplyHigh);

  const touchingDemand =
    currentPrice >= demandLo - atr * 0.45 && currentPrice <= demandHi + atr * 1.1;
  const touchingSupply =
    currentPrice <= supplyHi + atr * 0.45 && currentPrice >= supplyLo - atr * 1.1;

  const zoneBias: SdCandleVolumeSignal['zoneBias'] = touchingDemand && !touchingSupply
    ? 'Demand'
    : touchingSupply && !touchingDemand
      ? 'Supply'
      : touchingDemand && touchingSupply
        ? currentPrice - demandLo <= supplyHi - currentPrice
          ? 'Demand'
          : 'Supply'
        : 'Mid-Range';

  const demandTouches = bars.slice(-16).filter((b) => b.l <= demandHi && b.h >= demandLo).length;
  const supplyTouches = bars.slice(-16).filter((b) => b.h >= supplyLo && b.l <= supplyHi).length;
  const zoneStatus: SdCandleVolumeSignal['zoneStatus'] =
    zoneBias === 'Demand'
      ? demandTouches <= 2
        ? 'Fresh'
        : 'Tested 1x'
      : zoneBias === 'Supply'
        ? supplyTouches <= 2
          ? 'Fresh'
          : 'Tested 1x'
        : 'Mid-Range';

  // 2. Candle Reading & 3. Volume/Effort Confirmation
  const candle = analyzeCandleReading(bars, atr);
  const volume = analyzeVolumeEffort(asset, bars, atr);

  // 4. Strict 15m ATR Volatility Band Guard & Macro News Blackout
  const atr15m = compute15mAtrMetrics(asset, currentPrice);
  const volatilityPassed = atr15m.volatilityPassed;
  const newsBlackout = checkMacroNewsBlackout(asset.id, economicEvents);
  const newsBlocked = enforceNewsBlackout && newsBlackout.active;
  const slBuf = getAssetStopFloorBuffer(asset, atr15m.atr15m);
  const tfMult = Math.sqrt(Math.max(1, (TF_BAR_MINUTES[timeframe] ?? 15) / 15));
  const maxSlDist = atr15m.atr15m * 2.5 * tfMult;

  const bullPlan =
    zoneBias === 'Demand' ||
    (zoneBias === 'Mid-Range' && candle.tone === 'bull');
  const entryLow = bullPlan ? demandLo : supplyLo;
  const entryHigh = bullPlan ? demandHi : supplyHi;
  const entryMid = (entryLow + entryHigh) / 2;

  let slVal: number;
  let tp1Val: number;
  let tp2Val: number;

  if (bullPlan) {
    slVal = Math.min(demandLo, entryLow) - slBuf.value;
    // Anchor TP2 strictly at opposing Supply proximal edge (never shoot through Supply!)
    const opposingBoundary = Math.max(structuralHigh, supplyLo);
    tp2Val = supplyLo > entryMid ? supplyLo : opposingBoundary;
    tp1Val = entryMid + (tp2Val - entryMid) * 0.55;
  } else {
    slVal = Math.max(supplyHi, entryHigh) + slBuf.value;
    // Anchor TP2 strictly at opposing Demand proximal edge (never shoot through Demand!)
    const opposingBoundary = Math.min(structuralLow, demandHi);
    tp2Val = demandHi < entryMid ? demandHi : opposingBoundary;
    tp1Val = entryMid - (entryMid - tp2Val) * 0.55;
  }

  const riskAbs = Math.max(1e-6, Math.abs(entryMid - slVal));
  const rr = Math.abs(tp2Val - entryMid) / riskAbs;
  const stopTooWide = riskAbs > maxSlDist;

  // Fusion Decision Logic with Real R:R >= 2.0, Stop Cap, Volatility Band, News Guard & Live Validity
  let direction: IctDirection = 'NEUTRAL';
  let executionStatus: SdCandleVolumeSignal['executionStatus'] = 'standby';
  const volumeConfirmed = volume.ratio >= 1.08;
  let invalidationReason = '';

  if (
    !newsBlocked &&
    atr15m.volatilityStatus !== 'warming' &&
    (!enforceVolatilityFilter || volatilityPassed) &&
    !stopTooWide &&
    rr >= 2.0
  ) {
    if (zoneBias === 'Demand' && candle.tone === 'bull' && volumeConfirmed) {
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
        invalidationReason = liveCheck.reason ?? '';
      }
    } else if (zoneBias === 'Supply' && candle.tone === 'bear' && volumeConfirmed) {
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
        invalidationReason = liveCheck.reason ?? '';
      }
    }
  }

  const invalidationTrigger = buildAssetInvalidationTrigger({
    assetClassLabel: atr15m.assetClassLabel,
    biasBullish: bullPlan,
    slFormatted: formatPriceWithAsset(slVal, asset),
    maxPct: atr15m.maxPct,
  });

  let actionSummary: string;
  if (direction === 'BUY') {
    actionSummary = `${zoneStatus} Demand reaction confirmed by ${candle.pattern} on ${volume.ratio.toFixed(2)}x ${volume.source} (1:${rr.toFixed(1)} to Supply).`;
  } else if (direction === 'SELL') {
    actionSummary = `${zoneStatus} Supply rejection confirmed by ${candle.pattern} on ${volume.ratio.toFixed(2)}x ${volume.source} (1:${rr.toFixed(1)} to Demand).`;
  } else if (invalidationReason) {
    actionSummary = invalidationReason;
  } else if (newsBlocked && newsBlackout.reason) {
    actionSummary = newsBlackout.reason;
  } else if (atr15m.volatilityStatus === 'warming') {
    actionSummary = 'Warming 15m OHLCV bars before validating ATR volatility band.';
  } else if (enforceVolatilityFilter && !volatilityPassed) {
    actionSummary =
      atr15m.volatilityStatus === 'too-high'
        ? `Volatility Filter Blocked: 15m ATR ${atr15m.atr15mPct.toFixed(3)}% exceeds ${atr15m.maxPct.toFixed(3)}% cap (${atr15m.assetClassLabel}). Erratic swings suppressed.`
        : `Volatility Filter Blocked: 15m ATR ${atr15m.atr15mPct.toFixed(3)}% below ${atr15m.minPct.toFixed(3)}% dead-market floor.`;
  } else if (stopTooWide) {
    actionSummary = `Stop Too Wide (${formatPriceWithAsset(riskAbs, asset)} exceeds 2.5x ATR cap). Wait for tighter base.`;
  } else if (rr < 2.0 && zoneBias !== 'Mid-Range') {
    actionSummary = `Opposing ${bullPlan ? 'Supply' : 'Demand'} zone leaves only 1:${rr.toFixed(1)} R:R (below 1:2.0 minimum).`;
  } else if (zoneBias === 'Mid-Range') {
    actionSummary = `Price is mid-range between Demand (${formatBand(demandLo, demandHi, asset)}) and Supply (${formatBand(supplyLo, supplyHi, asset)}). Wait for zone tap + volume spike.`;
  } else if (!volumeConfirmed) {
    actionSummary = `Inside ${zoneBias} zone (${candle.pattern}), but ${volume.source} is only ${volume.ratio.toFixed(2)}x (< 1.08x threshold). Awaiting participation expansion.`;
  } else {
    actionSummary = `Inside ${zoneBias} zone with ${volume.ratio.toFixed(2)}x ${volume.source}, awaiting decisive ${zoneBias === 'Demand' ? 'bullish' : 'bearish'} reversal candle close.`;
  }

  const zoneScore = zoneBias !== 'Mid-Range' ? (zoneStatus === 'Fresh' ? 34 : 26) : 10;
  const volScore = volume.ratio >= 1.35 ? 32 : volume.ratio >= 1.08 ? 24 : 10;
  const volBandScore = volatilityPassed ? 10 : 0;
  const totalScore = Math.min(97, zoneScore + candle.strength + volScore + volBandScore);
  const confidence =
    direction === 'NEUTRAL'
      ? Math.min(54, Math.max(22, Math.round(totalScore * 0.58)))
      : Math.max(66, totalScore);

  const triggers: string[] = [
    `${zoneStatus} ${zoneBias} Zone`,
    candle.pattern,
    `${volume.state} (${volume.ratio.toFixed(2)}x)`,
    volatilityPassed
      ? `15m ATR ${atr15m.atr15mPct.toFixed(3)}% OK`
      : atr15m.volatilityStatus === 'warming'
        ? 'Warming 15m Bars'
        : atr15m.volatilityStatus === 'too-high'
          ? `Erratic 15m ATR > ${atr15m.maxPct.toFixed(3)}%`
          : `Low 15m ATR < ${atr15m.minPct.toFixed(3)}%`,
  ];

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

  const projectedLevelsSummary = `Ref Zone ${formatBand(entryLow, entryHigh, asset)} · SL Ref ${formatPriceWithAsset(slVal, asset)} · Opposing ${formatPriceWithAsset(tp2Val, asset)}`;

  const htfSample = extractBarsForTf(asset, ['1h', '4h', '1D'], 6);
  const htfBias = htfSample.isRealOhlc ? detectSwingStructureBias(htfSample.bars, currentPrice) : 'Ranging';
  const htfAligned =
    direction === 'BUY'
      ? htfBias === 'Bullish'
      : direction === 'SELL'
        ? htfBias === 'Bearish'
        : false;
  const { setupGrade, isAPlusSetup } = computeSetupGrade({
    direction,
    inKillzone: isSdcvActiveKillzone(),
    volatilityPassed,
    newsBlocked,
    confidence,
    realRr: rr,
    htfAligned,
  });
  const usdExposure = resolveUsdExposure(asset.id, direction);

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.shortName,
    assetClassLabel: atr15m.assetClassLabel,
    direction,
    confidence,
    timeframe,
    currentPrice,
    decimals: asset.decimals,
    currencyPrefix: asset.currencyPrefix,
    unitSuffix: asset.unitSuffix,
    evaluatedAt,
    zoneBias,
    zoneStatus,
    demandZone: formatBand(demandLo, demandHi, asset),
    supplyZone: formatBand(supplyLo, supplyHi, asset),
    candlePattern: candle.pattern,
    candleTone: candle.tone,
    candleDetail: candle.detail,
    volumeRatio: volume.ratio,
    volumeState: volume.state,
    volumeSource: volume.source,
    entryZone:
      direction === 'NEUTRAL'
        ? `Standby (${formatBand(entryLow, entryHigh, asset)})`
        : formatBand(entryLow, entryHigh, asset),
    stopLoss: formatPriceWithAsset(slVal, asset),
    tp1: formatPriceWithAsset(tp1Val, asset),
    tp2: formatPriceWithAsset(tp2Val, asset),
    riskReward: rr >= 2.0 ? `1:${rr.toFixed(1)}` : `WAIT (1:${rr.toFixed(1)} < 1:2)`,
    atr15mPct: atr15m.atr15mPct,
    volatilityMinPct: atr15m.minPct,
    volatilityMaxPct: atr15m.maxPct,
    volatilityStatus: atr15m.volatilityStatus,
    volatilityPassed,
    atrSource: atr15m.atrSource,
    executionStatus,
    projectedLevelsSummary,
    invalidationTrigger,
    actionSummary,
    triggers,
    entryLowNum: direction === 'NEUTRAL' ? undefined : Math.min(entryLow, entryHigh),
    entryHighNum: direction === 'NEUTRAL' ? undefined : Math.max(entryLow, entryHigh),
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

export function scanAllSdCandleVolumeSignals(
  assets: MarketAsset[],
  preferredByAsset?: Record<string, Timeframe>,
  enforceVolatilityFilter = true,
  economicEvents?: EconomicEvent[],
  enforceNewsBlackout = true
): SdCandleVolumeSignal[] {
  return assets
    .filter(isIctEligibleAsset)
    .map((asset) =>
      computeSdCandleVolumeSignal(
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
      return b.confidence - a.confidence;
    });
}
