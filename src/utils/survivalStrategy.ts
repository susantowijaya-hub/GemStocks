import {
  IctSignalAnalysis,
  PriceAlertItem,
  SdCandleVolumeSignal,
  SurvivalMetrics,
  SurvivalRuleCheck,
} from '../types/market';

export const SURVIVAL_RESET_STORAGE_KEY = 'stocks-survival-shield-reset-v1';
const LOCKDOWN_COOLDOWN_MS = 4 * 60 * 60_000; // 4 hours capital preservation cooldown
const WINDOW_48H_MS = 48 * 60 * 60_000;

export function getSurvivalResetAt(): number {
  try {
    if (typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(SURVIVAL_RESET_STORAGE_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function setSurvivalResetAt(ts = Date.now()): number {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SURVIVAL_RESET_STORAGE_KEY, String(ts));
    }
  } catch {
    // ignore storage errors
  }
  return ts;
}

export function evaluateSurvivalState(
  alerts: PriceAlertItem[],
  nowMs = Date.now(),
  resetAtMs?: number
): SurvivalMetrics {
  const effectiveResetAt =
    typeof resetAtMs === 'number' && Number.isFinite(resetAtMs)
      ? resetAtMs
      : getSurvivalResetAt();
  const windowFloor = Math.max(effectiveResetAt, nowMs - WINDOW_48H_MS);

  const settled = alerts
    .filter(
      (a) =>
        a.alertKind === 'ict' &&
        (a.assetId === 'BTCUSD' || a.assetId === 'XAUUSD') &&
        a.fillStatus !== 'expired_unfilled' &&
        a.triggeredAt >= windowFloor &&
        (a.outcomeStatus === 'win' ||
          a.outcomeStatus === 'be' ||
          a.outcomeStatus === 'loss')
    )
    .sort((a, b) => {
      const ta = a.outcomeGradedAt ?? a.triggeredAt;
      const tb = b.outcomeGradedAt ?? b.triggeredAt;
      return tb - ta;
    });

  let wins = 0;
  let bes = 0;
  let losses = 0;
  for (const item of settled) {
    if (item.outcomeStatus === 'win') wins += 1;
    else if (item.outcomeStatus === 'be') bes += 1;
    else if (item.outcomeStatus === 'loss') losses += 1;
  }

  let consecutiveLosses = 0;
  let lastStreakLossAt = 0;
  for (const item of settled) {
    if (item.outcomeStatus === 'loss') {
      consecutiveLosses += 1;
      if (lastStreakLossAt === 0) {
        lastStreakLossAt = item.outcomeGradedAt ?? item.triggeredAt;
      }
    } else if (item.outcomeStatus === 'win') {
      break;
    }
    // BE preserves streak without incrementing or resetting
  }

  const netR48h = Number((wins * 2 - losses).toFixed(2));
  const decided = wins + losses;
  const winRatePct = decided > 0 ? Math.round((wins / decided) * 100) : null;

  const latestSettledAt = settled[0]?.outcomeGradedAt ?? settled[0]?.triggeredAt ?? 0;
  const lockdownTriggerAt = lastStreakLossAt || latestSettledAt;
  const cooldownUntil =
    lockdownTriggerAt > 0 ? lockdownTriggerAt + LOCKDOWN_COOLDOWN_MS : undefined;
  const inLockdownWindow =
    Boolean(cooldownUntil && nowMs < cooldownUntil) &&
    (consecutiveLosses >= 3 || netR48h <= -3.0);

  if (inLockdownWindow) {
    const cooldownRemainingMin = Math.max(
      1,
      Math.ceil(((cooldownUntil ?? nowMs) - nowMs) / 60_000)
    );
    const rules: SurvivalRuleCheck[] = [
      {
        id: 'streak',
        label: '3-Loss Circuit Breaker',
        passed: consecutiveLosses < 3,
        detail: `${consecutiveLosses}L streak (Max 2L before pause)`,
      },
      {
        id: 'dd',
        label: '48h Drawdown Cap (-3.0R)',
        passed: netR48h > -3.0,
        detail: `${netR48h >= 0 ? '+' : ''}${netR48h.toFixed(1)}R net`,
      },
      {
        id: 'chase',
        label: 'No-Chase Limit Discipline',
        passed: false,
        detail: 'Locked during cooldown',
      },
      {
        id: 'exposure',
        label: 'BTC/XAU Single-Focus Rule',
        passed: false,
        detail: 'All signals paused -> WAIT',
      },
    ];
    return {
      mode: 'LOCKDOWN',
      consecutiveLosses,
      netR48h,
      wins,
      bes,
      losses,
      winRatePct,
      riskMultiplierLabel: '0x · CAPITAL PRESERVATION LOCKDOWN',
      minRrRequired: 3.0,
      requireAPlusOnly: true,
      cooldownRemainingMin,
      cooldownUntil,
      headline:
        consecutiveLosses >= 3
          ? `SURVIVAL LOCKDOWN (${consecutiveLosses} consecutive losses) — All new orders forced to WAIT for ${cooldownRemainingMin}m`
          : `SURVIVAL LOCKDOWN (48h Drawdown ${netR48h.toFixed(1)}R <= -3.0R) — Capital preservation cooldown (${cooldownRemainingMin}m left)`,
      rules,
    };
  }

  if (consecutiveLosses === 2 || netR48h <= -2.0) {
    const rules: SurvivalRuleCheck[] = [
      {
        id: 'streak',
        label: 'Loss Streak Guard (Max 3L)',
        passed: true,
        detail: `${consecutiveLosses}L / 3L limit`,
      },
      {
        id: 'dd',
        label: 'Drawdown Defensive (-2.0R)',
        passed: false,
        detail: `${netR48h >= 0 ? '+' : ''}${netR48h.toFixed(1)}R -> 0.5x Size`,
      },
      {
        id: 'aplus',
        label: 'A+ Confluence & >= 1:2.5 R:R',
        passed: true,
        detail: 'Only A+ In-Zone/Limit permitted',
      },
      {
        id: 'nochase',
        label: 'Chase Block Enforced',
        passed: true,
        detail: 'Pullback chase setups blocked',
      },
    ];
    return {
      mode: 'CAUTION',
      consecutiveLosses,
      netR48h,
      wins,
      bes,
      losses,
      winRatePct,
      riskMultiplierLabel: '0.5x HALF-RISK · A+ SETUPS ONLY',
      minRrRequired: 2.5,
      requireAPlusOnly: true,
      cooldownRemainingMin: 0,
      headline: `SURVIVAL CAUTION (${consecutiveLosses}L streak · ${netR48h >= 0 ? '+' : ''}${netR48h.toFixed(1)}R) — Cut risk 50%, A+ Confluence >= 1:2.5 R:R only`,
      rules,
    };
  }

  const rules: SurvivalRuleCheck[] = [
    {
      id: 'streak',
      label: '3-Loss Circuit Breaker',
      passed: true,
      detail: `${consecutiveLosses}L / 3L threshold`,
    },
    {
      id: 'dd',
      label: '48h Drawdown Floor (-3.0R)',
      passed: true,
      detail: `${netR48h >= 0 ? '+' : ''}${netR48h.toFixed(1)}R healthy`,
    },
    {
      id: 'atr',
      label: '15m ATR & News Blackout',
      passed: true,
      detail: 'Filters erratic whipsaws',
    },
    {
      id: 'focus',
      label: 'BTC/XAU Focus + TP1 BE',
      passed: true,
      detail: '50% TP1 moves SL -> BE',
    },
  ];

  return {
    mode: 'NORMAL',
    consecutiveLosses,
    netR48h,
    wins,
    bes,
    losses,
    winRatePct,
    riskMultiplierLabel: '1.0x STANDARD · MIN 1:2.0 R:R',
    minRrRequired: 2.0,
    requireAPlusOnly: false,
    cooldownRemainingMin: 0,
    headline: `SURVIVAL SHIELD ACTIVE — Normal Execution (${wins}W · ${bes}BE · ${losses}L · ${netR48h >= 0 ? '+' : ''}${netR48h.toFixed(1)}R)`,
    rules,
  };
}

export function applySurvivalGateToIct(
  signal: IctSignalAnalysis,
  survival: SurvivalMetrics
): IctSignalAnalysis {
  if (signal.direction === 'NEUTRAL' || survival.mode === 'NORMAL') {
    return signal;
  }

  if (survival.mode === 'LOCKDOWN') {
    const note = `SURVIVAL LOCKDOWN: ${survival.headline}`;
    return {
      ...signal,
      direction: 'NEUTRAL',
      biasLabel: 'FLAT',
      setupGrade: 'WAIT',
      isAPlusSetup: false,
      executionStatus: 'standby',
      executionPosture: 'standby',
      recommendedOrderType: 'WAIT',
      setupName: `WAIT · Survival Lockdown (${survival.cooldownRemainingMin}m)`,
      invalidationNote: note,
      placementSummary: `NO ORDER — WAIT (${survival.headline})`,
      survivalBlocked: true,
      survivalNote: survival.headline,
      triggers: [
        'Survival Shield Lockdown',
        `${survival.consecutiveLosses}L / ${survival.netR48h.toFixed(1)}R Guard`,
        ...signal.triggers.slice(0, 2),
      ],
    };
  }

  // CAUTION mode: enforce A+ setup + >= 1:2.5 R:R + no runaway chasing
  const effectiveRr = signal.limitRr ?? signal.spotRr ?? 0;
  const blockedInCaution =
    !signal.isAPlusSetup ||
    effectiveRr < survival.minRrRequired ||
    signal.executionPosture === 'limit_pullback_only';

  if (!blockedInCaution) {
    return {
      ...signal,
      survivalBlocked: false,
      survivalNote: `CAUTION 0.5x Size: ${signal.setupGrade} approved (Limit 1:${effectiveRr.toFixed(1)} >= 1:${survival.minRrRequired.toFixed(1)})`,
    };
  }

  const reason =
    signal.executionPosture === 'limit_pullback_only'
      ? 'Survival Caution blocks runaway pullback chase'
      : !signal.isAPlusSetup
        ? `Survival Caution requires A+ confluence (got ${signal.setupGrade ?? 'B'})`
        : `Survival Caution requires >= 1:${survival.minRrRequired.toFixed(1)} R:R`;

  return {
    ...signal,
    direction: 'NEUTRAL',
    biasLabel: 'FLAT',
    setupGrade: 'WAIT',
    isAPlusSetup: false,
    executionStatus: 'standby',
    executionPosture: 'standby',
    recommendedOrderType: 'WAIT',
    setupName: `WAIT · ${reason}`,
    invalidationNote: `SURVIVAL CAUTION: ${reason}. ${signal.invalidationTrigger ?? ''}`,
    placementSummary: `NO ORDER — WAIT (${reason})`,
    survivalBlocked: true,
    survivalNote: reason,
    triggers: ['Survival Caution (0.5x A+ Only)', reason, ...signal.triggers.slice(0, 2)],
  };
}

export function applySurvivalGateToSdcv(
  signal: SdCandleVolumeSignal,
  survival: SurvivalMetrics
): SdCandleVolumeSignal {
  if (signal.direction === 'NEUTRAL' || survival.mode === 'NORMAL') {
    return signal;
  }

  if (survival.mode === 'LOCKDOWN') {
    return {
      ...signal,
      direction: 'NEUTRAL',
      biasLabel: 'FLAT',
      setupGrade: 'WAIT',
      isAPlusSetup: false,
      executionStatus: 'standby',
      executionPosture: 'standby',
      recommendedOrderType: 'WAIT',
      actionSummary: `SURVIVAL LOCKDOWN: ${survival.headline}`,
      placementSummary: `NO ORDER — WAIT (${survival.headline})`,
      survivalBlocked: true,
      survivalNote: survival.headline,
      triggers: [
        'Survival Shield Lockdown',
        `${survival.consecutiveLosses}L / ${survival.netR48h.toFixed(1)}R Guard`,
        ...signal.triggers.slice(0, 2),
      ],
    };
  }

  const effectiveRr = signal.limitRr ?? signal.spotRr ?? 0;
  const blockedInCaution =
    !signal.isAPlusSetup ||
    effectiveRr < survival.minRrRequired ||
    signal.executionPosture === 'limit_pullback_only';

  if (!blockedInCaution) {
    return {
      ...signal,
      survivalBlocked: false,
      survivalNote: `CAUTION 0.5x Size: ${signal.setupGrade} approved (Limit 1:${effectiveRr.toFixed(1)} >= 1:${survival.minRrRequired.toFixed(1)})`,
    };
  }

  const reason =
    signal.executionPosture === 'limit_pullback_only'
      ? 'Survival Caution blocks runaway pullback chase'
      : !signal.isAPlusSetup
        ? `Survival Caution requires A+ Fresh S&D (got ${signal.setupGrade ?? 'B'})`
        : `Survival Caution requires >= 1:${survival.minRrRequired.toFixed(1)} R:R`;

  return {
    ...signal,
    direction: 'NEUTRAL',
    biasLabel: 'FLAT',
    setupGrade: 'WAIT',
    isAPlusSetup: false,
    executionStatus: 'standby',
    executionPosture: 'standby',
    recommendedOrderType: 'WAIT',
    actionSummary: `SURVIVAL CAUTION: ${reason}.`,
    placementSummary: `NO ORDER — WAIT (${reason})`,
    survivalBlocked: true,
    survivalNote: reason,
    triggers: ['Survival Caution (0.5x A+ Only)', reason, ...signal.triggers.slice(0, 2)],
  };
}
