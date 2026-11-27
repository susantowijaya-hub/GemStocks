import {
  CandlePoint,
  EconomicEvent,
  IctDirection,
  MarketAsset,
  SdCandleVolumeSignal,
  SignalBiasVerdict,
  SignalClearanceGate,
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
  evaluateLiveExecutionPosture,
  extractBarsForTf,
  extractMacroContextFromAssets,
  findUnmitigatedFvgAndOb,
  formatBand,
  formatPriceWithAsset,
  getAssetStopFloorBuffer,
  isIctEligibleAsset,
  MacroIctContext,
  resolveUsdExposure,
  splitConfirmedClosedBars,
  TF_BAR_MINUTES,
} from './ictSignals';

function isSdcvActiveKillzone(nowMs = Date.now(), assetId = 'XAUUSD'): boolean {
  const now = new Date(nowMs);
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
  const nyMin = toMin('America/New_York');
  if (assetId.toUpperCase() === 'BTCUSD') {
    return (
      (nyMin >= 3 * 60 && nyMin < 6 * 60) ||
      (nyMin >= 8 * 60 && nyMin < 12 * 60) ||
      (nyMin >= 13 * 60 + 30 && nyMin < 16 * 60)
    );
  }
  return (
    (nyMin >= 2 * 60 && nyMin < 5 * 60 + 15) ||
    (nyMin >= 8 * 60 && nyMin < 11 * 60 + 15) ||
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

interface CanonicalSdZone {
  side: 'Demand' | 'Supply';
  pattern: 'RBR' | 'DBR' | 'DBD' | 'RBD' | 'BASE';
  proximal: number;
  distal: number;
  low: number;
  high: number;
  baseIdx: number;
  touchCount: number;
  departureStrengthAtr: number;
}

function detectCanonicalSupplyDemandZones(
  bars: CandlePoint[],
  atr: number,
  currentPrice: number
): { demand: CanonicalSdZone | null; supply: CanonicalSdZone | null } {
  const n = bars.length;
  const candidatesDemand: CanonicalSdZone[] = [];
  const candidatesSupply: CanonicalSdZone[] = [];

  for (let baseStart = 1; baseStart <= n - 3; baseStart++) {
    for (let baseLen = 1; baseLen <= 3 && baseStart + baseLen < n - 1; baseLen++) {
      const baseEnd = baseStart + baseLen - 1;
      const baseBars = bars.slice(baseStart, baseEnd + 1);
      const baseHigh = Math.max(...baseBars.map((b) => b.h));
      const baseLow = Math.min(...baseBars.map((b) => b.l));
      const baseHeight = Math.max(1e-6, baseHigh - baseLow);
      const avgBaseBody =
        baseBars.reduce((acc, b) => acc + Math.abs(b.c - b.o), 0) / baseBars.length;

      // Canonical narrow consolidation Base check
      if (avgBaseBody > atr * 0.65 || baseHeight > atr * 1.55) continue;

      const legIn = bars[baseStart - 1];
      const legOut1 = bars[baseEnd + 1];
      const legOut2 = baseEnd + 2 < n ? bars[baseEnd + 2] : legOut1;

      // Check Bullish ERC Leg-Out Departure (Demand: RBR or DBR)
      const legOut1Span = Math.max(1e-6, legOut1.h - legOut1.l);
      const legOut1BullBody = legOut1.c - legOut1.o;
      const twoBarBullDisp = legOut2.c - baseLow;
      const bullErc =
        (legOut1BullBody >= atr * 0.75 && (legOut1.c - legOut1.l) / legOut1Span >= 0.62) ||
        (twoBarBullDisp >= atr * 1.65 && legOut2.c > legOut1.o);

      if (bullErc && twoBarBullDisp >= baseHeight * 1.65) {
        const proximal = Math.max(...baseBars.map((b) => Math.max(b.o, b.c)));
        const distal = Math.min(baseLow, legIn.l);
        if (proximal > distal) {
          const afterDeparture = bars.slice(baseEnd + 2, n - 1);
          const departed = bars.slice(baseEnd + 1).some((b) => b.h >= proximal + atr * 0.85);
          const breachedDistal = afterDeparture.some((b) => b.c < distal);
          // Count prior completed retests inside zone before current bar
          let touchCount = 0;
          let wasInside = false;
          for (const sub of afterDeparture) {
            const inside = sub.l <= proximal && sub.h >= distal;
            if (inside && !wasInside) {
              touchCount += 1;
            }
            wasInside = inside;
          }
          if (departed && !breachedDistal && touchCount <= 1 && currentPrice >= distal - atr * 0.2) {
            const legInUp = legIn.c > legIn.o;
            candidatesDemand.push({
              side: 'Demand',
              pattern: legInUp ? 'RBR' : 'DBR',
              proximal,
              distal,
              low: distal,
              high: proximal,
              baseIdx: baseStart,
              touchCount,
              departureStrengthAtr: Number((twoBarBullDisp / Math.max(1e-6, atr)).toFixed(2)),
            });
          }
        }
      }

      // Check Bearish ERC Leg-Out Departure (Supply: DBD or RBD)
      const legOut1BearBody = legOut1.o - legOut1.c;
      const twoBarBearDisp = baseHigh - legOut2.c;
      const bearErc =
        (legOut1BearBody >= atr * 0.75 && (legOut1.c - legOut1.l) / legOut1Span <= 0.38) ||
        (twoBarBearDisp >= atr * 1.65 && legOut2.c < legOut1.o);

      if (bearErc && twoBarBearDisp >= baseHeight * 1.65) {
        const proximal = Math.min(...baseBars.map((b) => Math.min(b.o, b.c)));
        const distal = Math.max(baseHigh, legIn.h);
        if (distal > proximal) {
          const afterDeparture = bars.slice(baseEnd + 2, n - 1);
          const departed = bars.slice(baseEnd + 1).some((b) => b.l <= proximal - atr * 0.85);
          const breachedDistal = afterDeparture.some((b) => b.c > distal);
          let touchCount = 0;
          let wasInside = false;
          for (const sub of afterDeparture) {
            const inside = sub.h >= proximal && sub.l <= distal;
            if (inside && !wasInside) {
              touchCount += 1;
            }
            wasInside = inside;
          }
          if (departed && !breachedDistal && touchCount <= 1 && currentPrice <= distal + atr * 0.2) {
            const legInDown = legIn.c < legIn.o;
            candidatesSupply.push({
              side: 'Supply',
              pattern: legInDown ? 'DBD' : 'RBD',
              proximal,
              distal,
              low: proximal,
              high: distal,
              baseIdx: baseStart,
              touchCount,
              departureStrengthAtr: Number((twoBarBearDisp / Math.max(1e-6, atr)).toFixed(2)),
            });
          }
        }
      }
    }
  }

  // Prefer Fresh (0 touch), closest to spot, and strongest ERC departure
  candidatesDemand.sort((a, b) => {
    if (a.touchCount !== b.touchCount) return a.touchCount - b.touchCount;
    const distA = Math.abs(currentPrice - a.proximal);
    const distB = Math.abs(currentPrice - b.proximal);
    return distA - distB;
  });
  candidatesSupply.sort((a, b) => {
    if (a.touchCount !== b.touchCount) return a.touchCount - b.touchCount;
    const distA = Math.abs(a.proximal - currentPrice);
    const distB = Math.abs(b.proximal - currentPrice);
    return distA - distB;
  });

  return {
    demand: candidatesDemand[0] ?? null,
    supply: candidatesSupply[0] ?? null,
  };
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

  if (
    lowerWick >= Math.max(body * 1.7, atr * 0.4) &&
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

  if (
    upperWick >= Math.max(body * 1.7, atr * 0.4) &&
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

  if (cur.c > cur.o && body >= atr * 0.85 && bodyPct >= 62 && closePos >= 0.72) {
    return {
      pattern: 'Bullish Momentum Ignition',
      tone: 'bull',
      detail: `Strong bullish body (${bodyPct}% dominance, ${(body / Math.max(1e-6, atr)).toFixed(2)}x ATR) closing near high.`,
      strength: 26,
    };
  }

  if (cur.c < cur.o && body >= atr * 0.85 && bodyPct >= 62 && closePos <= 0.28) {
    return {
      pattern: 'Bearish Impulse Breakdown',
      tone: 'bear',
      detail: `Heavy bearish body (${bodyPct}% dominance, ${(body / Math.max(1e-6, atr)).toFixed(2)}x ATR) closing near low.`,
      strength: 26,
    };
  }

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
  enforceNewsBlackout = true,
  macroContext?: MacroIctContext
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
      biasLabel: 'FLAT',
      biasVerdict: 'NEUTRAL / RANGE',
      clearanceSummary: '0/5 Cleared · Warming real OHLCV candles',
      clearanceGates: [
        { id: 'curve', label: '1. HTF Curve & Macro', passed: false, state: 'WARN', detail: 'Warming bars' },
        { id: 'zone', label: '2. Fresh S&D Zone', passed: false, state: 'BLOCK', detail: 'Pending' },
        { id: 'candle', label: '3. LTF Candle Read', passed: false, state: 'BLOCK', detail: 'Pending' },
        { id: 'vol', label: '4. Volume Effort', passed: false, state: 'BLOCK', detail: 'Pending' },
        { id: 'risk', label: '5. ATR & R:R Guard', passed: false, state: 'BLOCK', detail: 'Pending' },
      ],
      confidence: 20,
      timeframe,
      currentPrice: asset.price,
      decimals: asset.decimals,
      currencyPrefix: asset.currencyPrefix,
      unitSuffix: asset.unitSuffix,
      evaluatedAt: asset.updatedAtEpoch ?? Date.now(),
      zoneBias: 'Mid-Range',
      zoneStatus: 'Mid-Range',
      sdPattern: 'BASE',
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
      actionSummary: 'WAIT · Warming Real OHLCV Bars — waiting for valid S&D structure.',
      placementSummary: 'NO ORDER (FLAT) — Warming real OHLCV candles',
      triggers: [
        'Awaiting Real OHLC',
        'Supply & Demand Warming',
        'Volume Effort Pending',
        'Warming 15m Bars',
      ],
      isClosedCandleConfirmed: false,
      candleStageLabel: 'Awaiting Real OHLC',
      isRealOhlc: false,
      setupGrade: 'WAIT',
      isAPlusSetup: false,
      executionPosture: 'standby',
      recommendedOrderType: 'WAIT',
      chaseProgressPct: 0,
      hasRunAway: false,
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
  const atr = computeAtr(bars, 14);

  // 1. Canonical Seiden/Moreno Base + ERC Departure Zone Detection
  const canonicalZones = detectCanonicalSupplyDemandZones(bars, atr, currentPrice);
  const fallbackImb = findUnmitigatedFvgAndOb(bars, atr, 30, 0.16, 0.72);

  const structuralHigh = Math.max(...bars.map((b) => b.h), currentPrice);
  const structuralLow = Math.min(...bars.map((b) => b.l), currentPrice);

  const hasCanonicalDemand = Boolean(canonicalZones.demand);
  const hasCanonicalSupply = Boolean(canonicalZones.supply);

  const demandLow =
    canonicalZones.demand?.distal ??
    fallbackImb.bullOb?.low ??
    fallbackImb.bullFvg?.low ??
    structuralLow;
  const demandHigh =
    canonicalZones.demand?.proximal ??
    fallbackImb.bullOb?.high ??
    fallbackImb.bullFvg?.high ??
    Math.min(currentPrice, structuralLow + atr * 0.75);

  const supplyLow =
    canonicalZones.supply?.proximal ??
    fallbackImb.bearOb?.low ??
    fallbackImb.bearFvg?.low ??
    Math.max(currentPrice, structuralHigh - atr * 0.75);
  const supplyHigh =
    canonicalZones.supply?.distal ??
    fallbackImb.bearOb?.high ??
    fallbackImb.bearFvg?.high ??
    structuralHigh;

  const demandLo = Math.min(demandLow, demandHigh);
  const demandHi = Math.max(demandLow, demandHigh);
  const supplyLo = Math.min(supplyLow, supplyHigh);
  const supplyHi = Math.max(supplyLow, supplyHigh);

  // Tightened canonical proximity window (reacting inside zone OR approaching Proximal within 0.45*ATR)
  const touchingDemand =
    hasCanonicalDemand &&
    currentPrice >= demandLo - atr * 0.15 &&
    currentPrice <= demandHi + atr * 0.45;
  const touchingSupply =
    hasCanonicalSupply &&
    currentPrice <= supplyHi + atr * 0.15 &&
    currentPrice >= supplyLo - atr * 0.45;

  const zoneBias: SdCandleVolumeSignal['zoneBias'] =
    touchingDemand && !touchingSupply
      ? 'Demand'
      : touchingSupply && !touchingDemand
        ? 'Supply'
        : touchingDemand && touchingSupply
          ? currentPrice - demandHi <= supplyLo - currentPrice
            ? 'Demand'
            : 'Supply'
          : 'Mid-Range';

  const activeCanonicalZone =
    zoneBias === 'Demand'
      ? canonicalZones.demand
      : zoneBias === 'Supply'
        ? canonicalZones.supply
        : null;

  const zoneStatus: SdCandleVolumeSignal['zoneStatus'] =
    zoneBias === 'Mid-Range'
      ? 'Mid-Range'
      : activeCanonicalZone?.touchCount === 0
        ? 'Fresh'
        : 'Tested 1x';

  const sdPattern: SdCandleVolumeSignal['sdPattern'] = activeCanonicalZone?.pattern ?? 'BASE';

  // 2. Canonical HTF Curve & Trend Alignment (1H + 4H)
  const htf1hSample = extractBarsForTf(asset, ['1h', '4h', '1D'], 6);
  const htf4hSample = extractBarsForTf(asset, ['4h', '1D'], 6);
  const htfBars = htf4hSample.isRealOhlc ? htf4hSample.bars : htf1hSample.bars;
  const htfHigh = htfBars.length > 0 ? Math.max(...htfBars.slice(-36).map((b) => b.h), currentPrice) : structuralHigh;
  const htfLow = htfBars.length > 0 ? Math.min(...htfBars.slice(-36).map((b) => b.l), currentPrice) : structuralLow;
  const htfCurvePct = Math.round(
    Math.min(100, Math.max(0, ((currentPrice - htfLow) / Math.max(1e-6, htfHigh - htfLow)) * 100))
  );
  let htfBias = htf1hSample.isRealOhlc
    ? detectSwingStructureBias(htf1hSample.bars, currentPrice)
    : 'Ranging';
  if (htfBias === 'Ranging' && htf1hSample.bars.length >= 24) {
    const closes = htf1hSample.bars.map((b) => b.c);
    const ema = (vals: number[], period: number) => {
      const k = 2 / (period + 1);
      let e = vals[0];
      for (let idx = 1; idx < vals.length; idx++) e = vals[idx] * k + e * (1 - k);
      return e;
    };
    const ema12 = ema(closes.slice(-30), 12);
    const ema26 = ema(closes.slice(-40), 26);
    if (currentPrice > ema12 && ema12 > ema26 * 1.0008) htfBias = 'Bullish';
    else if (currentPrice < ema12 && ema12 < ema26 * 0.9992) htfBias = 'Bearish';
  }

  // 3. Candle Reading & Volume/Effort Confirmation
  const candle = analyzeCandleReading(bars, atr);
  const volume = analyzeVolumeEffort(asset, bars, atr);

  // 4. 15m ATR Volatility Band Guard & Macro News Blackout
  const atr15m = compute15mAtrMetrics(asset, currentPrice);
  const volatilityPassed = atr15m.volatilityPassed;
  const newsBlackout = checkMacroNewsBlackout(asset.id, economicEvents, refClockMs);
  const newsBlocked = enforceNewsBlackout && newsBlackout.active;
  const slBuf = getAssetStopFloorBuffer(asset, atr15m.atr15m);
  const tfMult = Math.sqrt(Math.max(1, (TF_BAR_MINUTES[timeframe] ?? 15) / 15));
  const minSlDist = atr15m.atr15m * 0.9 * tfMult;
  const maxSlDist = atr15m.atr15m * 2.35 * tfMult;

  const bullPlan =
    zoneBias === 'Demand' ||
    (zoneBias === 'Mid-Range' && htfCurvePct <= 45);
  const entryLow = bullPlan ? demandLo : supplyLo;
  const entryHigh = bullPlan ? demandHi : supplyHi;
  // Canonical S&D places orders strictly on the PROXIMAL line
  const proximalLineNum = bullPlan ? demandHi : supplyLo;
  const distalLineNum = bullPlan ? demandLo : supplyHi;

  let slVal: number;
  let tp1Val: number;
  let tp2Val: number;

  if (bullPlan) {
    slVal = Math.min(distalLineNum - slBuf.value, proximalLineNum - minSlDist);
    const baseRisk = Math.max(1e-6, proximalLineNum - slVal);
    const rawOpp = supplyLo > proximalLineNum + baseRisk * 1.8 ? supplyLo : Math.max(structuralHigh, proximalLineNum + baseRisk * 2.5);
    tp2Val = Math.min(rawOpp, proximalLineNum + baseRisk * 3.6);
    tp1Val = Math.min(proximalLineNum + (tp2Val - proximalLineNum) * 0.52, proximalLineNum + baseRisk * 1.45);
  } else {
    slVal = Math.max(distalLineNum + slBuf.value, proximalLineNum + minSlDist);
    const baseRisk = Math.max(1e-6, slVal - proximalLineNum);
    const rawOpp = demandHi < proximalLineNum - baseRisk * 1.8 ? demandHi : Math.min(structuralLow, proximalLineNum - baseRisk * 2.5);
    tp2Val = Math.max(rawOpp, proximalLineNum - baseRisk * 3.6);
    tp1Val = Math.max(proximalLineNum - (proximalLineNum - tp2Val) * 0.52, proximalLineNum - baseRisk * 1.45);
  }

  const riskAbs = Math.max(1e-6, Math.abs(proximalLineNum - slVal));
  const rr = Math.abs(tp2Val - proximalLineNum) / riskAbs;
  const stopTooWide = riskAbs > maxSlDist;

  // Canonical S&D Execution Rules:
  // - Never buy high in HTF Supply curve (> 68%) or sell low in HTF Demand curve (< 32%)
  // - Demand longs require Bullish HTF OR deep Discount (curve <= 45%)
  // - Supply shorts require Bearish HTF OR deep Premium (curve >= 55%)
  // - Require active reversal candle + volume expansion OR Fresh pro-trend ERC touch
  const curveAllowsBuy = htfCurvePct <= 68 && htfBias !== 'Bearish';
  const curveAllowsSell = htfCurvePct >= 32 && htfBias !== 'Bullish';

  const isBtc = asset.id.toUpperCase() === 'BTCUSD';
  const isGold = asset.id.toUpperCase() === 'XAUUSD';

  // DXY inverse macro tailwind check for Gold S&D setups
  let dxyConfluenceNote: string | undefined;
  let dxyMacroBonus = 0;
  if (isGold && macroContext?.dxyBias) {
    const chg = macroContext.dxyChangePct ?? 0;
    if ((macroContext.dxyBias === 'Bearish' || chg <= -0.15) && bullPlan) {
      dxyMacroBonus = 6;
      dxyConfluenceNote = `DXY Inverse Tailwind (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%) aligns with XAU Demand Long`;
    } else if ((macroContext.dxyBias === 'Bullish' || chg >= 0.15) && !bullPlan) {
      dxyMacroBonus = 6;
      dxyConfluenceNote = `DXY Strength (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%) aligns with XAU Supply Short`;
    } else if (Math.abs(chg) >= 0.3 && ((chg > 0 && bullPlan) || (chg < 0 && !bullPlan))) {
      dxyMacroBonus = -5;
      dxyConfluenceNote = `DXY Counter-Wind (${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%) against ${zoneBias} zone`;
    }
  }

  let direction: IctDirection = 'NEUTRAL';
  let executionStatus: SdCandleVolumeSignal['executionStatus'] = 'standby';
  const volumeConfirmed = volume.ratio >= 1.08 || (candle.strength >= 26 && volume.ratio >= 0.98);
  let invalidationReason = '';

  const gatesPass =
    !newsBlocked &&
    atr15m.volatilityStatus !== 'warming' &&
    (!enforceVolatilityFilter || volatilityPassed) &&
    !stopTooWide &&
    rr >= 2.0;

  if (gatesPass) {
    // BTC requires active LTF candle confirmation even in Fresh zones to avoid getting wicked by crypto stop hunts;
    // Gold allows Fresh pro-trend ERC touch when HTF + Curve + Volume align.
    const bullCandleVol = candle.tone === 'bull' && candle.strength >= 18 && volumeConfirmed;
    const bullFreshProTrend =
      !isBtc &&
      zoneStatus === 'Fresh' &&
      htfBias === 'Bullish' &&
      htfCurvePct <= 52 &&
      candle.tone !== 'bear' &&
      volume.ratio >= 1.02;
    const bullEligible =
      zoneBias === 'Demand' &&
      curveAllowsBuy &&
      (zoneStatus === 'Fresh' ? bullCandleVol || bullFreshProTrend : bullCandleVol && volume.ratio >= 1.15);

    const bearCandleVol = candle.tone === 'bear' && candle.strength >= 18 && volumeConfirmed;
    const bearFreshProTrend =
      !isBtc &&
      zoneStatus === 'Fresh' &&
      htfBias === 'Bearish' &&
      htfCurvePct >= 48 &&
      candle.tone !== 'bull' &&
      volume.ratio >= 1.02;
    const bearEligible =
      zoneBias === 'Supply' &&
      curveAllowsSell &&
      (zoneStatus === 'Fresh' ? bearCandleVol || bearFreshProTrend : bearCandleVol && volume.ratio >= 1.15);

    if (bullEligible) {
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
    } else if (bearEligible) {
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

  const postureEval = evaluateLiveExecutionPosture({
    direction,
    setupArmed: direction !== 'NEUTRAL',
    armedBias: bullPlan ? 'BUY' : 'SELL',
    currentPrice,
    entryLow,
    entryHigh,
    stopLoss: slVal,
    tp1: tp1Val,
    tp2: tp2Val,
    atr: atr15m.atr15m > 0 ? atr15m.atr15m : atr,
    executionStatus,
    exactLimitOverride: proximalLineNum,
  });

  const invalidationTrigger = buildAssetInvalidationTrigger({
    assetClassLabel: atr15m.assetClassLabel,
    biasBullish: bullPlan,
    slFormatted: formatPriceWithAsset(slVal, asset),
    maxPct: atr15m.maxPct,
  });

  let actionSummary: string;
  if (direction === 'BUY') {
    if (postureEval.posture === 'limit_pullback_only') {
      actionSummary = `${zoneStatus} ${sdPattern} Demand displaced (+${postureEval.chaseProgressPct}% to TP1) — BUY LIMIT @ Proximal ${formatPriceWithAsset(proximalLineNum, asset)} only.`;
    } else if (postureEval.posture === 'armed_limit') {
      actionSummary = `${zoneStatus} ${sdPattern} Demand armed — set BUY LIMIT @ Proximal ${formatPriceWithAsset(proximalLineNum, asset)} (Limit 1:${(postureEval.limitRr ?? rr).toFixed(1)}).`;
    } else {
      actionSummary = `${zoneStatus} ${sdPattern} Demand reaction confirmed (${candle.pattern}, ${volume.ratio.toFixed(2)}x ${volume.source}) — SL beyond Distal.`;
    }
  } else if (direction === 'SELL') {
    if (postureEval.posture === 'limit_pullback_only') {
      actionSummary = `${zoneStatus} ${sdPattern} Supply displaced (+${postureEval.chaseProgressPct}% to TP1) — SELL LIMIT @ Proximal ${formatPriceWithAsset(proximalLineNum, asset)} only.`;
    } else if (postureEval.posture === 'armed_limit') {
      actionSummary = `${zoneStatus} ${sdPattern} Supply armed — set SELL LIMIT @ Proximal ${formatPriceWithAsset(proximalLineNum, asset)} (Limit 1:${(postureEval.limitRr ?? rr).toFixed(1)}).`;
    } else {
      actionSummary = `${zoneStatus} ${sdPattern} Supply rejection confirmed (${candle.pattern}, ${volume.ratio.toFixed(2)}x ${volume.source}) — SL beyond Distal.`;
    }
  } else if (invalidationReason) {
    actionSummary = invalidationReason;
  } else if (newsBlocked && newsBlackout.reason) {
    actionSummary = newsBlackout.reason;
  } else if (atr15m.volatilityStatus === 'warming') {
    actionSummary = 'Warming 15m OHLCV bars before validating ATR volatility band.';
  } else if (enforceVolatilityFilter && !volatilityPassed) {
    actionSummary =
      atr15m.volatilityStatus === 'too-high'
        ? `Volatility Filter Blocked: 15m ATR ${atr15m.atr15mPct.toFixed(3)}% exceeds ${atr15m.maxPct.toFixed(3)}% cap (${atr15m.assetClassLabel}).`
        : `Volatility Filter Blocked: 15m ATR ${atr15m.atr15mPct.toFixed(3)}% below ${atr15m.minPct.toFixed(3)}% floor.`;
  } else if (stopTooWide) {
    actionSummary = `Stop Too Wide (${formatPriceWithAsset(riskAbs, asset)} > 2.25x ATR cap). Wait for tighter base.`;
  } else if (zoneBias === 'Mid-Range') {
    actionSummary = `Mid-Range (HTF Curve ${htfCurvePct}%): Wait for price to tap Fresh Demand (${formatBand(demandLo, demandHi, asset)}) or Supply (${formatBand(supplyLo, supplyHi, asset)}).`;
  } else if (zoneBias === 'Demand' && !curveAllowsBuy) {
    actionSummary = `HTF Curve/Trend Filter (${htfCurvePct}% · ${htfBias}): Avoid buying Demand directly into HTF Supply/Bearish trend.`;
  } else if (zoneBias === 'Supply' && !curveAllowsSell) {
    actionSummary = `HTF Curve/Trend Filter (${htfCurvePct}% · ${htfBias}): Avoid selling Supply directly into HTF Demand/Bullish trend.`;
  } else if (rr < 2.0) {
    actionSummary = `Opposing ${bullPlan ? 'Supply' : 'Demand'} zone leaves only 1:${rr.toFixed(1)} R:R (below 1:2.0 minimum).`;
  } else if (!volumeConfirmed) {
    actionSummary = `At ${zoneStatus} ${sdPattern} ${zoneBias} (${candle.pattern}), but ${volume.source} is ${volume.ratio.toFixed(2)}x (< 1.05x). Wait for participation expansion.`;
  } else {
    actionSummary = `At ${zoneStatus} ${sdPattern} ${zoneBias} (${volume.ratio.toFixed(2)}x ${volume.source}) — awaiting decisive ${zoneBias === 'Demand' ? 'bullish' : 'bearish'} reversal close.`;
  }

  const zoneScore =
    zoneBias !== 'Mid-Range' ? (zoneStatus === 'Fresh' ? 36 : 24) : 10;
  const volScore = volume.ratio >= 1.35 ? 28 : volume.ratio >= 1.08 ? 22 : 10;
  const volBandScore = volatilityPassed ? 10 : 0;
  const curveScore =
    (bullPlan && htfCurvePct <= 40) || (!bullPlan && htfCurvePct >= 60) ? 8 : 0;
  const totalScore = Math.max(
    18,
    Math.min(97, zoneScore + candle.strength + volScore + volBandScore + curveScore + dxyMacroBonus)
  );
  const confidence =
    direction === 'NEUTRAL'
      ? Math.min(54, Math.max(22, Math.round(totalScore * 0.56)))
      : Math.max(68, totalScore);

  const triggers: string[] = [
    `${zoneStatus} ${sdPattern} ${zoneBias}`,
    `Curve ${htfCurvePct}% (${htfBias})`,
    candle.pattern,
    `${volume.state} (${volume.ratio.toFixed(2)}x)`,
  ];
  if (dxyMacroBonus > 0) triggers.push('DXY Inverse Aligned');

  const latestBarTs = bars[n - 1]?.t;
  const evaluatedAt =
    typeof asset.updatedAtEpoch === 'number' &&
    asset.updatedAtEpoch > 0 &&
    asset.marketSessionOpen
      ? asset.updatedAtEpoch
      : latestBarTs && latestBarTs > 0 && latestBarTs <= refClockMs
        ? latestBarTs
        : refClockMs;

  const projectedLevelsSummary = `Proximal ${formatPriceWithAsset(proximalLineNum, asset)} · Distal SL ${formatPriceWithAsset(slVal, asset)} · Opposing ${formatPriceWithAsset(tp2Val, asset)}`;

  const htfAligned =
    direction === 'BUY'
      ? htfBias === 'Bullish' || htfCurvePct <= 42
      : direction === 'SELL'
        ? htfBias === 'Bearish' || htfCurvePct >= 58
        : false;
  const { setupGrade, isAPlusSetup } = computeSetupGrade({
    direction,
    inKillzone: isSdcvActiveKillzone(refClockMs, asset.id),
    volatilityPassed,
    newsBlocked,
    confidence,
    realRr: rr,
    htfAligned,
  });
  const usdExposure = resolveUsdExposure(asset.id, direction);

  const biasLabel: SdCandleVolumeSignal['biasLabel'] =
    direction === 'BUY' ? 'BULLISH' : direction === 'SELL' ? 'BEARISH' : 'FLAT';

  const slStr = formatPriceWithAsset(slVal, asset);
  const tp1Str = formatPriceWithAsset(tp1Val, asset);
  const tp2Str = formatPriceWithAsset(tp2Val, asset);
  const proxStr = formatPriceWithAsset(proximalLineNum, asset);
  let placementSummary: string;
  if (direction === 'NEUTRAL') {
    const lean = zoneBias === 'Demand' ? 'BULLISH LEAN' : zoneBias === 'Supply' ? 'BEARISH LEAN' : 'FLAT';
    placementSummary = `NO ORDER (${lean}) — ${actionSummary}`;
  } else if (postureEval.posture === 'enter_now') {
    placementSummary = `${direction} MARKET (IN ${sdPattern} ZONE) · SL ${slStr} · TP1 ${tp1Str} (BE) · TP2 ${tp2Str}`;
  } else {
    placementSummary = `${direction} LIMIT @ Proximal ${proxStr} · SL ${slStr} · TP1 ${tp1Str} (BE) · TP2 ${tp2Str}`;
  }

  const curveGatePass = bullPlan ? curveAllowsBuy : curveAllowsSell;
  const zoneGatePass = zoneBias !== 'Mid-Range' && zoneStatus === 'Fresh';
  const candleGatePass =
    (bullPlan && candle.tone === 'bull' && candle.strength >= 18) ||
    (!bullPlan && candle.tone === 'bear' && candle.strength >= 18);
  const riskGatePass = !newsBlocked && (!enforceVolatilityFilter || volatilityPassed) && !stopTooWide && rr >= 2.0;

  const clearanceGates: SignalClearanceGate[] = [
    {
      id: 'curve',
      label: '1. HTF Curve & Trend',
      passed: curveGatePass,
      state: curveGatePass ? 'PASS' : 'BLOCK',
      detail: `${htfBias} · Curve ${htfCurvePct}%`,
    },
    {
      id: 'zone',
      label: '2. Fresh S&D Zone',
      passed: zoneGatePass,
      state: zoneBias === 'Mid-Range' ? 'BLOCK' : zoneStatus === 'Fresh' ? 'PASS' : 'WARN',
      detail: zoneBias === 'Mid-Range' ? 'Mid-Range' : `${zoneStatus} ${sdPattern} ${zoneBias}`,
    },
    {
      id: 'candle',
      label: '3. LTF Candle Read',
      passed: candleGatePass,
      state: candleGatePass ? 'PASS' : 'WARN',
      detail: candle.pattern,
    },
    {
      id: 'vol',
      label: '4. Volume Effort',
      passed: volumeConfirmed,
      state: volumeConfirmed ? 'PASS' : 'WARN',
      detail: `${volume.ratio.toFixed(2)}x (${volume.state})`,
    },
    {
      id: 'risk',
      label: '5. ATR & R:R Guard',
      passed: riskGatePass,
      state: newsBlocked || stopTooWide ? 'BLOCK' : riskGatePass ? 'PASS' : 'WARN',
      detail: newsBlocked ? 'News blackout' : stopTooWide ? 'Stop > Cap' : `1:${rr.toFixed(1)} R:R`,
    },
  ];

  const passedGateCount = clearanceGates.filter((g) => g.passed).length;
  const blockerGate = clearanceGates.find((g) => !g.passed);
  const clearanceSummary =
    direction !== 'NEUTRAL'
      ? `${passedGateCount}/5 Cleared · Unambiguous ${direction} (${setupGrade} S&D)`
      : `${passedGateCount}/5 Cleared · Blocker: ${blockerGate?.label.replace(/^\d+\.\s*/, '') ?? 'Zone'} (${actionSummary})`;

  const biasVerdict: SignalBiasVerdict =
    direction === 'BUY'
      ? isAPlusSetup || confidence >= 84
        ? 'STRONG BUY'
        : 'BUY'
      : direction === 'SELL'
        ? isAPlusSetup || confidence >= 84
          ? 'STRONG SELL'
          : 'SELL'
        : zoneBias === 'Demand'
          ? 'BULLISH LEAN (WAIT)'
          : zoneBias === 'Supply'
            ? 'BEARISH LEAN (WAIT)'
            : 'NEUTRAL / RANGE';

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.shortName,
    assetClassLabel: atr15m.assetClassLabel,
    direction,
    biasLabel,
    biasVerdict,
    clearanceSummary,
    clearanceGates,
    dxyConfluenceNote,
    confidence,
    timeframe,
    currentPrice,
    decimals: asset.decimals,
    currencyPrefix: asset.currencyPrefix,
    unitSuffix: asset.unitSuffix,
    evaluatedAt,
    zoneBias,
    zoneStatus,
    sdPattern,
    proximalLineNum,
    distalLineNum,
    htfCurvePct,
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
    stopLoss: slStr,
    tp1: tp1Str,
    tp2: tp2Str,
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
    executionPosture: postureEval.posture,
    recommendedOrderType: postureEval.recommendedOrderType,
    limitEntryPriceNum: postureEval.limitEntryPriceNum,
    limitRr: postureEval.limitRr,
    spotRr: postureEval.spotRr,
    chaseProgressPct: postureEval.chaseProgressPct,
    hasRunAway: postureEval.hasRunAway,
    placementSummary,
  };
}

export function scanAllSdCandleVolumeSignals(
  assets: MarketAsset[],
  preferredByAsset?: Record<string, Timeframe>,
  enforceVolatilityFilter = true,
  economicEvents?: EconomicEvent[],
  enforceNewsBlackout = true
): SdCandleVolumeSignal[] {
  const macroContext = extractMacroContextFromAssets(assets);
  return assets
    .filter(isIctEligibleAsset)
    .map((asset) =>
      computeSdCandleVolumeSignal(
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
