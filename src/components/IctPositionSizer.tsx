import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, ShieldAlert, Scale, Layers } from 'lucide-react';
import { IctSignalAnalysis } from '../types/market';

const STORAGE_EQUITY_KEY = 'ict-position-sizer-equity-v1';
const STORAGE_RISK_PCT_KEY = 'ict-position-sizer-riskpct-v1';

interface IctPositionSizerProps {
  signal: IctSignalAnalysis;
  survivalRiskMultiplier?: number; // 1.0 Normal, 0.5 Caution, 0 Lockdown
  survivalModeLabel?: string;
  usdCorrelationOverlap?: boolean;
}

function loadStoredNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) return parsed;
  } catch {
    // ignore storage restriction
  }
  return fallback;
}

export const IctPositionSizer: React.FC<IctPositionSizerProps> = ({
  signal,
  survivalRiskMultiplier = 1,
  survivalModeLabel = 'NORMAL',
  usdCorrelationOverlap = false,
}) => {
  const [accountEquity, setAccountEquity] = useState<number>(() =>
    loadStoredNumber(STORAGE_EQUITY_KEY, 10000, 100, 50_000_000)
  );
  const [baseRiskPct, setBaseRiskPct] = useState<number>(() =>
    loadStoredNumber(STORAGE_RISK_PCT_KEY, 1.0, 0.1, 5.0)
  );
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_EQUITY_KEY, String(accountEquity));
    } catch {
      // ignore
    }
  }, [accountEquity]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_RISK_PCT_KEY, String(baseRiskPct));
    } catch {
      // ignore
    }
  }, [baseRiskPct]);

  const calc = useMemo(() => {
    const isGold = signal.assetId.toUpperCase() === 'XAUUSD';
    const entryPx =
      signal.executionPosture === 'enter_now'
        ? signal.currentPrice
        : signal.limitEntryPriceNum ??
          (typeof signal.entryLowNum === 'number' && typeof signal.entryHighNum === 'number'
            ? (signal.entryLowNum + signal.entryHighNum) / 2
            : signal.currentPrice);
    const stopPx = signal.stopLossNum ?? 0;
    const tp1Px = signal.tp1Num ?? 0;
    const tp2Px = signal.tp2Num ?? 0;
    const frictionCost = signal.frictionCost ?? (isGold ? 0.4 : entryPx * 0.0008);

    const rawStopDist = Math.abs(entryPx - stopPx);
    const netStopDist = rawStopDist + frictionCost;

    // Multi-factor risk throttling: Survival Mode × USD Correlation Split × Volatility Regime
    const corrMult = usdCorrelationOverlap ? 0.5 : 1.0;
    const volMult = signal.volatilityRegime === 'R2_EXPANSION' ? 0.75 : 1.0;
    const combinedMult = Math.max(0, survivalRiskMultiplier * corrMult * volMult);
    const effectiveRiskPct = Number((baseRiskPct * combinedMult).toFixed(2));
    const dollarRisk = Number(((accountEquity * effectiveRiskPct) / 100).toFixed(2));

    const validLevels = entryPx > 0 && stopPx > 0 && netStopDist > 1e-6;
    const units = validLevels && dollarRisk > 0 ? dollarRisk / netStopDist : 0;
    // Standard Gold CFD/FX contract = 100 troy oz per 1.00 lot
    const xauLots = isGold ? units / 100 : 0;
    const notionalUsd = units * entryPx;
    const impliedLeverage = accountEquity > 0 ? notionalUsd / accountEquity : 0;

    const tp1NetMove = tp1Px > 0 ? Math.max(0, Math.abs(tp1Px - entryPx) - frictionCost) : 0;
    const tp2NetMove = tp2Px > 0 ? Math.max(0, Math.abs(tp2Px - entryPx) - frictionCost) : 0;
    const estTp1Usd = units * tp1NetMove;
    const estTp2Usd = units * tp2NetMove;

    const adjustments: string[] = [];
    if (survivalRiskMultiplier < 1) {
      adjustments.push(
        survivalRiskMultiplier === 0
          ? `Survival ${survivalModeLabel} (0x Lock)`
          : `Survival ${survivalModeLabel} (${survivalRiskMultiplier}x)`
      );
    }
    if (usdCorrelationOverlap) adjustments.push('USD Overlap Split (0.5x)');
    if (signal.volatilityRegime === 'R2_EXPANSION') adjustments.push('R2 Expansion Throttle (0.75x)');

    return {
      isGold,
      entryPx,
      rawStopDist,
      netStopDist,
      frictionCost,
      effectiveRiskPct,
      dollarRisk,
      units,
      xauLots,
      notionalUsd,
      impliedLeverage,
      estTp1Usd,
      estTp2Usd,
      validLevels,
      adjustments,
      locked: combinedMult === 0,
    };
  }, [accountEquity, baseRiskPct, signal, survivalRiskMultiplier, survivalModeLabel, usdCorrelationOverlap]);

  const primarySizeLabel = calc.isGold
    ? `${calc.xauLots.toFixed(2)} lots (${calc.units.toFixed(1)} oz)`
    : `${calc.units.toFixed(4)} BTC`;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full min-h-[44px] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-left hover:bg-[var(--bg-elevated)]/60 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calculator className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">
            Position Sizer
          </span>
          <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
            {calc.effectiveRiskPct}% risk · ${calc.dollarRisk.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {calc.validLevels && !calc.locked ? (
            <span className="text-[12px] font-mono font-bold tabular-nums text-[var(--text-primary)]">
              {primarySizeLabel}
            </span>
          ) : calc.locked ? (
            <span className="text-[11px] font-semibold text-[var(--color-danger)]">
              0x LOCKDOWN
            </span>
          ) : (
            <span className="text-[11px] text-[var(--text-muted)]">Awaiting levels</span>
          )}
          <span className="text-[11px] font-medium text-[var(--accent-primary)]">
            {expanded ? 'Hide' : 'Configure'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-2 border-t border-[var(--border-subtle)] space-y-3">
          {/* Equity & Risk % Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Account Equity (USD)
              </span>
              <input
                type="number"
                min={100}
                max={50000000}
                step={500}
                value={accountEquity}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val) && val >= 0) setAccountEquity(val);
                }}
                className="w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[13px] font-mono tabular-nums text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </label>

            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Base Risk / Trade (%)
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {[0.5, 1.0, 1.5, 2.0].map((pct) => {
                  const active = Math.abs(baseRiskPct - pct) < 0.05;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setBaseRiskPct(pct)}
                      className={`h-10 rounded-lg border text-[12px] font-mono font-semibold tabular-nums transition-colors ${
                        active
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Risk Throttles */}
          {calc.adjustments.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Auto Risk Throttle Active:</span>{' '}
                {calc.adjustments.join(' · ')} → Effective risk{' '}
                <span className="font-mono font-bold tabular-nums">{calc.effectiveRiskPct}%</span>
              </div>
            </div>
          )}

          {/* Sizing Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                Dollar Risk
              </div>
              <div className="mt-0.5 text-[14px] font-mono font-bold tabular-nums text-[var(--color-danger)]">
                -${calc.dollarRisk.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
                {calc.effectiveRiskPct}% eff. equity
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {calc.isGold ? 'Gold Lots / Oz' : 'BTC Units'}
              </div>
              <div className="mt-0.5 text-[14px] font-mono font-bold tabular-nums text-[var(--text-primary)]">
                {calc.isGold ? `${calc.xauLots.toFixed(2)} lot` : `${calc.units.toFixed(4)}`}
              </div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
                {calc.isGold
                  ? `${calc.units.toFixed(1)} oz · ${calc.impliedLeverage.toFixed(1)}x`
                  : `$${Math.round(calc.notionalUsd).toLocaleString('en-US')} · ${calc.impliedLeverage.toFixed(1)}x`}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                <Scale className="w-3 h-3" />
                Net Stop Dist
              </div>
              <div className="mt-0.5 text-[14px] font-mono font-bold tabular-nums text-[var(--text-primary)]">
                ${calc.netStopDist.toFixed(calc.isGold ? 2 : 0)}
              </div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
                Incl. ${calc.frictionCost.toFixed(calc.isGold ? 2 : 0)} friction
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                Est. Net TP1 / TP2
              </div>
              <div className="mt-0.5 text-[13px] font-mono font-bold tabular-nums text-[var(--color-success)]">
                +${Math.round(calc.estTp1Usd).toLocaleString('en-US')} / +${Math.round(calc.estTp2Usd).toLocaleString('en-US')}
              </div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
                Net 1:{(signal.netRr ?? 0).toFixed(1)} R:R
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
