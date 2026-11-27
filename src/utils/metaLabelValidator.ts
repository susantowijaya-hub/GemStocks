import {
  IctSignalAnalysis,
  SdCandleVolumeSignal,
  SignalHistoryRecord,
} from '../types/market';
import { ConfluenceExpectancyMatrix } from './signalHistoryEngine';

export type MetaLabelVerdict =
  | 'EXECUTE_FULL'
  | 'EXECUTE_REDUCED'
  | 'FILTER_PASS'
  | 'STANDBY';

export type ValidationDisciplineStatus =
  | 'VALIDATED'
  | 'CAUTIOUS_SHRINKAGE'
  | 'HALT_RECALIBRATE';

export type DisciplineCheckState = 'PASS' | 'CAUTION' | 'BLOCK';

export interface MetaFeatureContribution {
  id: string;
  label: string;
  stateLabel: string;
  passed: boolean;
  logOddsDelta: number; // contribution to Stage 2 log-odds
  probImpactPct: number; // approximate percentage-point impact around base
}

export interface ValidationDisciplineCheck {
  id: 'walk_forward' | 'purged_embargo' | 'brier_calibration' | 'leakage_sample';
  label: string;
  metricValue: string;
  detail: string;
  state: DisciplineCheckState;
}

export interface ValidationDisciplineAudit {
  status: ValidationDisciplineStatus;
  statusLabel: string;
  summary: string;
  disciplineCapMultiplier: number; // 0, 0.5, 0.75, or 1.0 (1.25 only when fully validated)
  totalClosed: number;
  inSampleCount: number;
  purgedEmbargoCount: number;
  outOfSampleCount: number;
  isWinRatePct: number | null;
  oosWinRatePct: number | null;
  isExpectancyR: number | null;
  oosExpectancyR: number | null;
  oosRetentionRatio: number | null;
  brierScore: number | null;
  calibrationLabel: 'Well-Calibrated' | 'Moderate' | 'Overconfident' | 'Warming';
  candleLeakageClean: boolean;
  lossStreak: number;
  checks: ValidationDisciplineCheck[];
}

export interface TwoStageMetaLabelEvaluation {
  // Stage 1: Primary Directional Recall Model
  stage1Direction: 'BUY' | 'SELL' | 'NEUTRAL';
  stage1RecallScore: number;
  stage1PassedGates: number;
  stage1TotalGates: number;
  stage1Summary: string;

  // Stage 2: Meta-Labeling Precision & Bet-Sizing Model
  metaProbability: number; // 0..1 calibrated win probability
  metaProbabilityPct: number; // 0..100 integer
  metaThresholdPct: number; // required threshold to execute (e.g. 54%)
  metaExpectedR: number; // P(win) * netRr - (1 - P(win)) * 1.0
  rawBetSizeMultiplier: number; // before validation discipline cap
  effectiveSizeMultiplier: number; // after applying validation discipline cap
  verdict: MetaLabelVerdict;
  verdictLabel: string;
  verdictReason: string;
  features: MetaFeatureContribution[];

  // Institutional Validation Discipline Audit
  discipline: ValidationDisciplineAudit;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function logit(p: number): number {
  const c = clamp(p, 0.02, 0.98);
  return Math.log(c / (1 - c));
}

function getClosedTradeOutcome(
  rec: SignalHistoryRecord
): { isWin: boolean; rValue: number; isSkip: boolean } {
  if (rec.userOutcome === 'SKIPPED') {
    return { isWin: false, rValue: 0, isSkip: true };
  }
  if (rec.userOutcome === 'WIN') {
    const r = Number.isFinite(rec.rMultiple) && rec.rMultiple > 0 ? rec.rMultiple : 1.5;
    return { isWin: true, rValue: clamp(r, 0.25, 10), isSkip: false };
  }
  if (rec.userOutcome === 'LOSS') {
    const r = Number.isFinite(rec.rMultiple) && rec.rMultiple < 0 ? rec.rMultiple : -1.0;
    return { isWin: false, rValue: clamp(r, -3, -0.25), isSkip: false };
  }
  if (rec.userOutcome === 'BE') {
    return { isWin: false, rValue: 0, isSkip: false };
  }

  switch (rec.status) {
    case 'TP2_HIT':
      return {
        isWin: true,
        rValue: clamp(Number.isFinite(rec.rMultiple) && rec.rMultiple > 0 ? rec.rMultiple : 2.2, 0.5, 10),
        isSkip: false,
      };
    case 'TP1_HIT':
      return {
        isWin: true,
        rValue: clamp(Number.isFinite(rec.rMultiple) && rec.rMultiple > 0 ? rec.rMultiple : 1.1, 0.3, 8),
        isSkip: false,
      };
    case 'SL_HIT':
      return {
        isWin: false,
        rValue: clamp(Number.isFinite(rec.rMultiple) && rec.rMultiple < 0 ? rec.rMultiple : -1.0, -3, -0.5),
        isSkip: false,
      };
    case 'BE_CLOSED':
      return { isWin: false, rValue: 0, isSkip: false };
    default:
      return { isWin: false, rValue: 0, isSkip: true };
  }
}

function computeSplitStats(trades: SignalHistoryRecord[]): {
  count: number;
  winRatePct: number | null;
  expectancyR: number | null;
} {
  if (trades.length === 0) {
    return { count: 0, winRatePct: null, expectancyR: null };
  }
  let wins = 0;
  let rSum = 0;
  for (const t of trades) {
    const out = getClosedTradeOutcome(t);
    if (out.isWin) wins++;
    rSum += out.rValue;
  }
  return {
    count: trades.length,
    winRatePct: Math.round((wins / trades.length) * 100),
    expectancyR: Number((rSum / trades.length).toFixed(2)),
  };
}

/**
 * Institutional Validation Discipline Audit:
 * - Chronological Walk-Forward Split (60% In-Sample / Purged Embargo / 40% Out-of-Sample)
 * - Embargo Purge removes trades whose active lifecycle overlaps the IS/OOS boundary
 * - Brier Calibration Score measures confidence calibration against realized outcomes
 * - Closed-Candle Leakage Guard & Minimum Sample-Size Shrinkage Gate
 */
export function computeValidationDiscipline(
  signalHistory: SignalHistoryRecord[],
  expectancyMatrix: ConfluenceExpectancyMatrix,
  activeSignal: Pick<
    IctSignalAnalysis | SdCandleVolumeSignal,
    'isClosedCandleConfirmed' | 'isRealOhlc' | 'candleStageLabel'
  > | null
): ValidationDisciplineAudit {
  const closedRadar = signalHistory
    .filter((r) => {
      const isRadar =
        r.sourceEngine === 'ict_radar' ||
        r.sourceEngine === 'sdcv_radar' ||
        r.assetClass === 'crypto' ||
        r.assetClass === 'commodity';
      if (!isRadar) return false;
      return !getClosedTradeOutcome(r).isSkip;
    })
    .sort((a, b) => a.createdAtMs - b.createdAtMs);

  const totalClosed = closedRadar.length;

  // 1. Consecutive loss streak (newest first)
  let lossStreak = 0;
  for (let i = closedRadar.length - 1; i >= 0; i--) {
    const out = getClosedTradeOutcome(closedRadar[i]);
    if (!out.isWin && out.rValue < 0) {
      lossStreak++;
    } else if (out.rValue > 0) {
      break;
    }
  }

  // 2. Chronological Walk-Forward with Purged Embargo Gap (López de Prado Ch. 7)
  let inSample: SignalHistoryRecord[] = [];
  let outOfSample: SignalHistoryRecord[] = [];
  let purgedEmbargoCount = 0;

  if (totalClosed >= 5) {
    const splitIdx = Math.max(2, Math.floor(totalClosed * 0.6));
    const rawIs = closedRadar.slice(0, splitIdx);
    const rawOos = closedRadar.slice(splitIdx);
    const splitBoundaryMs = rawOos[0]?.createdAtMs ?? Date.now();
    // Embargo gap = max(1 trade, 8% of sample) after split boundary + any overlapping IS trades
    const embargoSlots = Math.max(1, Math.floor(totalClosed * 0.08));

    // Purge any IS trade whose exit time leaked past the OOS boundary
    inSample = rawIs.filter((t) => {
      const endMs = t.closedAtMs ?? t.lastCheckedAtMs ?? t.createdAtMs;
      if (endMs > splitBoundaryMs) {
        purgedEmbargoCount++;
        return false;
      }
      return true;
    });

    // Drop embargo buffer trades right at the start of OOS to remove serial autocorrelation
    const actualEmbargo = rawOos.length > embargoSlots + 1 ? embargoSlots : 0;
    purgedEmbargoCount += actualEmbargo;
    outOfSample = rawOos.slice(actualEmbargo);
  } else {
    inSample = closedRadar;
    outOfSample = [];
  }

  const isStats = computeSplitStats(inSample);
  const oosStats = computeSplitStats(outOfSample);

  let oosRetentionRatio: number | null = null;
  if (
    isStats.expectancyR !== null &&
    oosStats.expectancyR !== null &&
    isStats.expectancyR > 0.05
  ) {
    oosRetentionRatio = Number(clamp(oosStats.expectancyR / isStats.expectancyR, -2, 2).toFixed(2));
  }

  // 3. Brier Calibration Score: mean((p_pred - y)^2)
  let brierScore: number | null = null;
  if (totalClosed >= 3) {
    let sqErrSum = 0;
    for (const r of closedRadar) {
      const pPred = clamp((Number(r.confidence) || 60) / 100, 0.05, 0.95);
      const y = getClosedTradeOutcome(r).isWin ? 1 : 0;
      sqErrSum += (pPred - y) * (pPred - y);
    }
    brierScore = Number((sqErrSum / totalClosed).toFixed(3));
  }

  const calibrationLabel: ValidationDisciplineAudit['calibrationLabel'] =
    brierScore === null
      ? 'Warming'
      : brierScore <= 0.21
        ? 'Well-Calibrated'
        : brierScore <= 0.27
          ? 'Moderate'
          : 'Overconfident';

  // 4. Closed-Candle Leakage Guard
  const candleLeakageClean = activeSignal
    ? Boolean(activeSignal.isRealOhlc && activeSignal.isClosedCandleConfirmed)
    : true;

  // 5. Determine Validation Discipline Status & Size Cap
  const severeOosDecay =
    oosStats.count >= 6 &&
    oosStats.expectancyR !== null &&
    oosStats.expectancyR <= -0.35;
  const oosNegative =
    oosStats.count >= 4 &&
    oosStats.expectancyR !== null &&
    oosStats.expectancyR < 0;
  const sampleWarmed = totalClosed >= 20 && oosStats.count >= 6;
  const sampleModerate = totalClosed >= 8 && oosStats.count >= 3;

  let status: ValidationDisciplineStatus = 'CAUTIOUS_SHRINKAGE';
  let statusLabel = 'Empirical Shrinkage (0.5x Cap)';
  let disciplineCapMultiplier = 0.5;
  let summary = `Sample warming (${totalClosed}/20 closed trades) — applying Empirical Bayes shrinkage and 0.5x max risk cap until OOS edge matures.`;

  if (lossStreak >= 3 || severeOosDecay) {
    status = 'HALT_RECALIBRATE';
    statusLabel = lossStreak >= 3 ? 'Halt — 3L Circuit Breaker' : 'Halt — OOS Decay Breach';
    disciplineCapMultiplier = 0;
    summary =
      lossStreak >= 3
        ? `Validation discipline halt active (${lossStreak} consecutive losses). Pause live execution and audit MFE/MAE excursions before resuming.`
        : `Out-of-sample expectancy (${oosStats.expectancyR}R across ${oosStats.count} OOS trades) breached decay threshold. Recalibrate confluence weights.`;
  } else if (lossStreak >= 2 || expectancyMatrix.driftWarning || oosNegative || calibrationLabel === 'Overconfident') {
    status = 'CAUTIOUS_SHRINKAGE';
    statusLabel = 'Throttle — Drift / Calibration Guard';
    disciplineCapMultiplier = 0.5;
    summary = expectancyMatrix.driftWarning
      ? 'Rolling 20-trade drift detected — risk capped at 0.5x and Stage 2 meta-threshold tightened.'
      : calibrationLabel === 'Overconfident'
        ? `Brier score (${brierScore?.toFixed(3)}) indicates confidence overestimation — applying 0.5x shrinkage cap.`
        : 'Out-of-sample variance caution — risk capped at 0.5x until OOS expectancy recovers positive.';
  } else if (!candleLeakageClean) {
    status = 'CAUTIOUS_SHRINKAGE';
    statusLabel = 'Leakage Guard — Forming Bar';
    disciplineCapMultiplier = 0.5;
    summary =
      'Active bar has not closed yet — look-ahead leakage guard restricts sizing until confirmed candle close.';
  } else if (sampleWarmed && (oosStats.expectancyR ?? 0) >= 0.15) {
    status = 'VALIDATED';
    statusLabel = 'OOS Validated (Full Size)';
    disciplineCapMultiplier = 1.0;
    summary = `Walk-forward OOS expectancy +${oosStats.expectancyR?.toFixed(2)}R (${oosStats.winRatePct}% WR, Brier ${brierScore?.toFixed(3)}) passes all validation discipline gates.`;
  } else if (sampleModerate && (oosStats.expectancyR ?? 0) >= 0) {
    status = 'CAUTIOUS_SHRINKAGE';
    statusLabel = 'Provisional OOS (0.75x Cap)';
    disciplineCapMultiplier = 0.75;
    summary = `Provisional OOS edge (${oosStats.count} OOS trades, +${(oosStats.expectancyR ?? 0).toFixed(2)}R) — 0.75x sizing until 20-trade calibration milestone.`;
  }

  const checks: ValidationDisciplineCheck[] = [
    {
      id: 'walk_forward',
      label: 'Walk-Forward IS vs OOS',
      metricValue:
        oosStats.expectancyR !== null && isStats.expectancyR !== null
          ? `IS ${isStats.expectancyR >= 0 ? '+' : ''}${isStats.expectancyR.toFixed(2)}R · OOS ${oosStats.expectancyR >= 0 ? '+' : ''}${oosStats.expectancyR.toFixed(2)}R`
          : `${totalClosed}/5 trades for split`,
      detail:
        oosRetentionRatio !== null
          ? `OOS retention ${(oosRetentionRatio * 100).toFixed(0)}% (${oosStats.count} OOS trades)`
          : 'Chronological 60/40 split activates at 5+ closed signals',
      state:
        severeOosDecay
          ? 'BLOCK'
          : oosStats.expectancyR !== null && oosStats.expectancyR >= 0.1
            ? 'PASS'
            : 'CAUTION',
    },
    {
      id: 'purged_embargo',
      label: 'Purged Embargo Isolation',
      metricValue:
        totalClosed >= 5
          ? `${purgedEmbargoCount} purged · ${oosStats.count} clean OOS`
          : 'Armed',
      detail: 'Removes overlapping active windows between IS & OOS to stop serial leakage',
      state: totalClosed >= 5 && oosStats.count >= 3 ? 'PASS' : 'CAUTION',
    },
    {
      id: 'brier_calibration',
      label: 'Brier Calibration Score',
      metricValue: brierScore !== null ? `${brierScore.toFixed(3)} · ${calibrationLabel}` : 'Warming',
      detail: 'Target ≤ 0.210 (measures real accuracy of locked confidence vs Win/Loss)',
      state:
        brierScore === null
          ? 'CAUTION'
          : brierScore <= 0.21
            ? 'PASS'
            : brierScore <= 0.27
              ? 'CAUTION'
              : 'BLOCK',
    },
    {
      id: 'leakage_sample',
      label: 'Candle Close & Sample Gate',
      metricValue: `${candleLeakageClean ? 'Closed Bar' : 'Forming'} · n=${totalClosed}`,
      detail: candleLeakageClean
        ? sampleWarmed
          ? 'Confirmed close OHLC + full sample size (n ≥ 20)'
          : `Confirmed close OHLC · shrinkage cap until n ≥ 20`
        : 'Wait for candle close to eliminate intra-bar look-ahead leakage',
      state: !candleLeakageClean
        ? 'CAUTION'
        : sampleWarmed
          ? 'PASS'
          : 'CAUTION',
    },
  ];

  return {
    status,
    statusLabel,
    summary,
    disciplineCapMultiplier,
    totalClosed,
    inSampleCount: isStats.count,
    purgedEmbargoCount,
    outOfSampleCount: oosStats.count,
    isWinRatePct: isStats.winRatePct,
    oosWinRatePct: oosStats.winRatePct,
    isExpectancyR: isStats.expectancyR,
    oosExpectancyR: oosStats.expectancyR,
    oosRetentionRatio,
    brierScore,
    calibrationLabel,
    candleLeakageClean,
    lossStreak,
    checks,
  };
}

/**
 * 2-Stage Meta-Labeling Confluence Validator (López de Prado AFML Ch. 3):
 * Stage 1: High-recall primary setup direction (ICT 2022 or S&D Candle+Volume)
 * Stage 2: Orthogonal meta-classifier predicting P(Trade Profitable | Stage 1 Side, Market Context)
 *          and mapping calibrated probability -> fractional bet size throttled by Validation Discipline.
 */
export function evaluateTwoStageMetaLabel(
  signal: IctSignalAnalysis | SdCandleVolumeSignal | null,
  signalHistory: SignalHistoryRecord[],
  expectancyMatrix: ConfluenceExpectancyMatrix,
  enforceValidationDiscipline = true
): TwoStageMetaLabelEvaluation {
  const discipline = computeValidationDiscipline(signalHistory, expectancyMatrix, signal);

  if (!signal) {
    return {
      stage1Direction: 'NEUTRAL',
      stage1RecallScore: 0,
      stage1PassedGates: 0,
      stage1TotalGates: 5,
      stage1Summary: 'Awaiting live primary setup feed',
      metaProbability: 0.5,
      metaProbabilityPct: 50,
      metaThresholdPct: 54,
      metaExpectedR: 0,
      rawBetSizeMultiplier: 0,
      effectiveSizeMultiplier: 0,
      verdict: 'STANDBY',
      verdictLabel: 'Stage 1 Standby',
      verdictReason: 'No active primary signal to meta-label.',
      features: [],
      discipline,
    };
  }

  const gates = signal.clearanceGates ?? [];
  const passedGates = gates.filter((g) => g.passed).length;
  const totalGates = gates.length || 5;
  const stage1Direction = signal.direction;
  const stage1RecallScore = Math.round(clamp(signal.confidence ?? 0, 0, 100));

  const isIct = 'killzone' in signal;
  const inKillzone = isIct
    ? Boolean(
        gates.find((g) => g.id === 'kz')?.passed ??
          (signal.killzone && !/asia|lunch|inter-session/i.test(signal.killzone))
      )
    : Boolean(gates.find((g) => g.id === 'vol')?.passed ?? signal.volatilityPassed);

  const po3Aligned = Boolean(signal.po3Aligned);
  const smtConfirmed =
    (stage1Direction === 'BUY' && signal.smtStatus === 'Bullish SMT') ||
    (stage1Direction === 'SELL' && signal.smtStatus === 'Bearish SMT');
  const smtOpposing =
    (stage1Direction === 'BUY' && signal.smtStatus === 'Bearish SMT') ||
    (stage1Direction === 'SELL' && signal.smtStatus === 'Bullish SMT');

  const htfAligned = Boolean(signal.htfAligned);
  const volRegime = signal.volatilityRegime ?? 'NORMAL';
  const netRr = Number.isFinite(signal.netRr) && (signal.netRr ?? 0) > 0 ? (signal.netRr as number) : 2.0;

  // Empirical Bayes Historical Prior from closed signals on this engine/asset
  const relevantClosed = signalHistory.filter((r) => {
    const out = getClosedTradeOutcome(r);
    if (out.isSkip) return false;
    return r.assetId === signal.assetId || r.sourceEngine === (isIct ? 'ict_radar' : 'sdcv_radar');
  });
  const priorStrength = 10; // pseudo-observations (conservative 50% prior)
  const priorWins = 5;
  let empWins = 0;
  for (const r of relevantClosed) {
    if (getClosedTradeOutcome(r).isWin) empWins++;
  }
  const shrunkEmpiricalWr = (priorWins + empWins) / (priorStrength + relevantClosed.length);
  const empiricalDelta = Number(clamp((shrunkEmpiricalWr - 0.5) * 1.4, -0.35, 0.35).toFixed(2));

  // Build Stage 2 Orthogonal Feature Contributions (log-odds weights)
  const features: MetaFeatureContribution[] = [
    {
      id: 'htf_alignment',
      label: 'HTF 1H/4H Structural Bias',
      stateLabel: htfAligned ? 'Aligned' : 'Counter / Flat',
      passed: htfAligned,
      logOddsDelta: htfAligned ? 0.36 : -0.34,
      probImpactPct: htfAligned ? 9 : -8,
    },
    {
      id: 'killzone_liquidity',
      label: isIct ? 'Session Killzone Window' : 'Volume & Liquidity Effort',
      stateLabel: inKillzone ? 'Active Window' : 'Off-Peak',
      passed: inKillzone,
      logOddsDelta: inKillzone ? 0.28 : -0.26,
      probImpactPct: inKillzone ? 7 : -6,
    },
    {
      id: 'po3_amd',
      label: 'PO3 / Midnight Open AMD',
      stateLabel: po3Aligned ? 'AMD Aligned' : signal.po3Phase ?? 'Neutral',
      passed: po3Aligned,
      logOddsDelta: po3Aligned ? 0.24 : -0.1,
      probImpactPct: po3Aligned ? 6 : -2,
    },
    {
      id: 'smt_divergence',
      label: 'Cross-Asset SMT Divergence',
      stateLabel: smtConfirmed
        ? signal.smtStatus ?? 'Confirmed'
        : smtOpposing
          ? 'Opposing SMT'
          : 'Neutral',
      passed: smtConfirmed,
      logOddsDelta: smtConfirmed ? 0.32 : smtOpposing ? -0.32 : 0,
      probImpactPct: smtConfirmed ? 8 : smtOpposing ? -8 : 0,
    },
    {
      id: 'vol_regime',
      label: 'Volatility Regime Filter',
      stateLabel:
        volRegime === 'R2_EXPANSION'
          ? 'R2 Expansion'
          : volRegime === 'R1_COMPRESSION'
            ? 'R1 Compression'
            : 'Normal ATR',
      passed: Boolean(signal.volatilityPassed) && volRegime !== 'R2_EXPANSION',
      logOddsDelta: !signal.volatilityPassed
        ? -0.36
        : volRegime === 'R2_EXPANSION'
          ? -0.18
          : volRegime === 'R1_COMPRESSION'
            ? 0.14
            : 0.2,
      probImpactPct: !signal.volatilityPassed
        ? -9
        : volRegime === 'R2_EXPANSION'
          ? -4
          : volRegime === 'R1_COMPRESSION'
            ? 3
            : 5,
    },
    {
      id: 'net_rr_surplus',
      label: 'Net-of-Friction R:R Edge',
      stateLabel: `Net 1:${netRr.toFixed(1)}`,
      passed: netRr >= 2.0,
      logOddsDelta: netRr >= 2.5 ? 0.26 : netRr >= 2.0 ? 0.14 : -0.35,
      probImpactPct: netRr >= 2.5 ? 6 : netRr >= 2.0 ? 3 : -9,
    },
    {
      id: 'empirical_bayes',
      label: 'Empirical Bayes OOS Prior',
      stateLabel:
        relevantClosed.length > 0
          ? `${Math.round(shrunkEmpiricalWr * 100)}% shrunk (n=${relevantClosed.length})`
          : '50% neutral prior',
      passed: shrunkEmpiricalWr >= 0.5,
      logOddsDelta: empiricalDelta,
      probImpactPct: Math.round(empiricalDelta * 25),
    },
  ];

  // Penalty for news blackout, runaway chase, or unclosed forming bar
  let structuralPenalty = 0;
  if (signal.newsBlackoutActive) structuralPenalty -= 0.85;
  if (signal.hasRunAway) structuralPenalty -= 0.45;
  if (!signal.isClosedCandleConfirmed) structuralPenalty -= 0.22;

  // Base log-odds anchored conservatively at 48% prior (avoiding inflated primary confidence)
  const baseLogOdds = logit(0.48) + ((stage1RecallScore - 65) / 100) * 0.45;
  const totalLogOdds =
    baseLogOdds +
    features.reduce((sum, f) => sum + f.logOddsDelta, 0) +
    structuralPenalty;

  const metaProbability = Number(clamp(sigmoid(totalLogOdds), 0.08, 0.92).toFixed(3));
  const metaProbabilityPct = Math.round(metaProbability * 100);
  const metaExpectedR = Number(
    (metaProbability * netRr - (1 - metaProbability) * 1.0).toFixed(2)
  );

  // Dynamic Stage 2 threshold tightens slightly if Brier score or OOS drift shows caution
  const metaThresholdPct =
    discipline.status === 'CAUTIOUS_SHRINKAGE' && enforceValidationDiscipline ? 56 : 52;

  // López de Prado probability-calibrated bet sizing: 2 * P(win) - 1 scaled to discrete tiers
  let rawBetSizeMultiplier = 0;
  if (stage1Direction !== 'NEUTRAL' && !signal.newsBlackoutActive) {
    if (metaProbabilityPct >= 70 && metaExpectedR >= 0.9 && signal.isAPlusSetup) {
      rawBetSizeMultiplier = 1.25;
    } else if (metaProbabilityPct >= 62 && metaExpectedR >= 0.55) {
      rawBetSizeMultiplier = 1.0;
    } else if (metaProbabilityPct >= metaThresholdPct && metaExpectedR >= 0.25) {
      rawBetSizeMultiplier = 0.5;
    } else {
      rawBetSizeMultiplier = 0;
    }
  }

  // Apply Validation Discipline ceiling when enabled
  const disciplineCeiling = enforceValidationDiscipline
    ? discipline.status === 'VALIDATED'
      ? 1.25
      : discipline.disciplineCapMultiplier
    : 1.25;

  const effectiveSizeMultiplier = Number(
    Math.min(rawBetSizeMultiplier, disciplineCeiling).toFixed(2)
  );

  let verdict: MetaLabelVerdict = 'STANDBY';
  let verdictLabel = 'Stage 1 Standby';
  let verdictReason = `Primary model is flat (${passedGates}/${totalGates} gates). Wait for directional structural trigger before Stage 2 meta-labeling.`;

  if (stage1Direction !== 'NEUTRAL') {
    if (enforceValidationDiscipline && discipline.status === 'HALT_RECALIBRATE') {
      verdict = 'FILTER_PASS';
      verdictLabel = 'Blocked by Discipline Halt (0.0x)';
      verdictReason = discipline.summary;
    } else if (effectiveSizeMultiplier === 0) {
      verdict = 'FILTER_PASS';
      verdictLabel = 'Stage 2 Filter Reject (0.0x)';
      verdictReason = signal.newsBlackoutActive
        ? 'High-impact macro news blackout overrides Stage 1 direction.'
        : `Calibrated P(Win) ${metaProbabilityPct}% is below Stage 2 threshold (${metaThresholdPct}%) or Meta-EV (${metaExpectedR >= 0 ? '+' : ''}${metaExpectedR}R) is insufficient — skip trade.`;
    } else if (effectiveSizeMultiplier < 1.0) {
      verdict = 'EXECUTE_REDUCED';
      verdictLabel = `Execute Reduced (${effectiveSizeMultiplier.toFixed(2)}x)`;
      verdictReason =
        rawBetSizeMultiplier > disciplineCeiling && enforceValidationDiscipline
          ? `Stage 2 cleared (${metaProbabilityPct}% P(Win), +${metaExpectedR}R EV), throttled from ${rawBetSizeMultiplier.toFixed(2)}x to ${effectiveSizeMultiplier.toFixed(2)}x by Validation Discipline (${discipline.statusLabel}).`
          : `Stage 2 cleared with moderate confluence (${metaProbabilityPct}% P(Win), +${metaExpectedR}R EV) — deploy reduced ${effectiveSizeMultiplier.toFixed(2)}x fractional risk.`;
    } else {
      verdict = 'EXECUTE_FULL';
      verdictLabel =
        effectiveSizeMultiplier > 1
          ? `Execute Conviction (${effectiveSizeMultiplier.toFixed(2)}x)`
          : 'Execute Full (1.00x)';
      verdictReason = `Both stages aligned: Stage 1 ${stage1Direction} + Stage 2 calibrated ${metaProbabilityPct}% P(Win) (+${metaExpectedR}R Meta-EV) with Validation Discipline clear.`;
    }
  }

  return {
    stage1Direction,
    stage1RecallScore,
    stage1PassedGates: passedGates,
    stage1TotalGates: totalGates,
    stage1Summary:
      stage1Direction === 'NEUTRAL'
        ? `${passedGates}/${totalGates} structural gates · Flat`
        : `${stage1Direction} thesis · ${passedGates}/${totalGates} gates · ${stage1RecallScore}% primary score`,
    metaProbability,
    metaProbabilityPct,
    metaThresholdPct,
    metaExpectedR,
    rawBetSizeMultiplier,
    effectiveSizeMultiplier,
    verdict,
    verdictLabel,
    verdictReason,
    features,
    discipline,
  };
}
