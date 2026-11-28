import React, { useMemo } from 'react';
import { SignalHistoryRecord } from '../types/market';
import {
  SignalHistoryStats,
  computeSignalHistoryStats,
  normalizeSignalStatus,
} from '../utils/signalHistoryEngine';

export interface JournalSummaryCardProps {
  records: SignalHistoryRecord[];
  scopeLabel: string;
  stocks7dRecords?: SignalHistoryRecord[];
  activePath?: string;
  onSelectPath?: (path: 'idx' | 'us') => void;
}

interface DynamicSummaryMetrics {
  stats: SignalHistoryStats;
  totalPnlPct: number;
  closedPnlPct: number;
  floatingPnlPct: number;
  avgPlannedRR: number | null;
  realizedRR: number | null;
  activeCount: number;
  pendingCount: number;
  closedCount: number;
}

function parseRiskRewardRatio(rec: SignalHistoryRecord): number | null {
  const risk = Math.abs(rec.entryPrice - rec.stopLoss);
  const reward = Math.abs(rec.tp2 - rec.entryPrice);
  if (Number.isFinite(risk) && risk > 0 && Number.isFinite(reward) && reward > 0) {
    const ratio = reward / risk;
    if (ratio > 0 && ratio < 20) return ratio;
  }
  if (typeof rec.riskReward === 'string') {
    const match = rec.riskReward.match(/1\s*:\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
}

const WinRateGaugeRing: React.FC<{ winRatePct: number | null }> = ({ winRatePct }) => {
  const pct = winRatePct !== null ? Math.max(0, Math.min(100, winRatePct)) : 0;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;
  const strokeClass =
    winRatePct === null
      ? 'stroke-[var(--text-muted)]'
      : winRatePct >= 55
        ? 'stroke-[var(--gain-text)]'
        : winRatePct >= 45
          ? 'stroke-[var(--text-primary)]'
          : 'stroke-[var(--loss-text)]';

  return (
    <div className="relative w-[68px] h-[68px] shrink-0 flex items-center justify-center">
      <svg className="w-[68px] h-[68px] -rotate-90" viewBox="0 0 68 68" aria-hidden="true">
        <circle
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          strokeWidth="5.5"
          className="stroke-black/10 dark:stroke-white/10"
        />
        <circle
          cx="34"
          cy="34"
          r={radius}
          fill="none"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={`${strokeClass} transition-all duration-300`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center font-mono tabular-nums">
        <span className="text-[15px] font-black leading-none text-[var(--text-primary)]">
          {winRatePct !== null ? `${Math.round(winRatePct)}%` : '—'}
        </span>
        <span className="text-[9px] font-sans font-bold text-[var(--text-muted)] mt-0.5">
          Win Rate
        </span>
      </div>
    </div>
  );
};

export const JournalSummaryCard: React.FC<JournalSummaryCardProps> = ({
  records,
  scopeLabel,
  stocks7dRecords = [],
  activePath,
  onSelectPath,
}) => {
  const metrics = useMemo<DynamicSummaryMetrics>(() => {
    const stats = computeSignalHistoryStats(records);

    let closedPnlPct = 0;
    let floatingPnlPct = 0;
    let activeCount = 0;
    let pendingCount = 0;
    let closedCount = 0;

    const rrValues: number[] = [];

    for (const rec of records) {
      const canonical = normalizeSignalStatus(rec.status);
      const ratio = parseRiskRewardRatio(rec);
      if (ratio !== null) rrValues.push(ratio);

      if (canonical === 'PENDING') {
        pendingCount += 1;
      } else if (canonical === 'FILLED') {
        activeCount += 1;
        if (Number.isFinite(rec.pnlPct)) {
          floatingPnlPct += rec.pnlPct;
        }
      } else if (canonical === 'TP' || canonical === 'SL') {
        closedCount += 1;
        if (Number.isFinite(rec.pnlPct)) {
          closedPnlPct += rec.pnlPct;
        }
      } else {
        closedCount += 1;
      }
    }

    const totalPnlPct = Number((closedPnlPct + floatingPnlPct).toFixed(2));
    const avgPlannedRR =
      rrValues.length > 0
        ? Number((rrValues.reduce((sum, v) => sum + v, 0) / rrValues.length).toFixed(2))
        : null;

    const realizedRR =
      stats.avgWinR !== null && stats.avgLossR !== null && stats.avgLossR > 0
        ? Number((stats.avgWinR / stats.avgLossR).toFixed(2))
        : null;

    return {
      stats,
      totalPnlPct,
      closedPnlPct: Number(closedPnlPct.toFixed(2)),
      floatingPnlPct: Number(floatingPnlPct.toFixed(2)),
      avgPlannedRR,
      realizedRR,
      activeCount,
      pendingCount,
      closedCount,
    };
  }, [records]);

  const stocks7dStats = useMemo(
    () => computeSignalHistoryStats(stocks7dRecords),
    [stocks7dRecords]
  );

  const { stats, totalPnlPct, avgPlannedRR, realizedRR } = metrics;

  return (
    <section
      data-testid="journal-summary-card"
      aria-label="Journal performance summary"
      className="liquid-glass-card rounded-2xl border border-[var(--border-subtle)] p-4 sm:p-5 space-y-4"
    >
      {/* Primary Metrics Row: Win Rate Ring + Total P&L + Average R:R + Live Exposure */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Win Rate Ring + Exact W/L Breakdown */}
        <div className="flex items-center gap-3.5 sm:pr-4 sm:border-r sm:border-[var(--border-divider)] shrink-0">
          <WinRateGaugeRing winRatePct={stats.winRatePct} />
          <div className="font-mono tabular-nums min-w-[116px]">
            <div className="font-sans text-[11px] font-semibold text-[var(--text-muted)]">
              Win Rate · {scopeLabel}
            </div>
            <div className="text-xl sm:text-2xl font-black leading-tight mt-0.5 text-[var(--text-primary)]">
              {stats.winRatePct !== null ? `${stats.winRatePct.toFixed(1)}%` : '—'}
            </div>
            <div className="text-[11px] font-semibold text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
              <span className="text-[var(--gain-text)] font-bold">{stats.verifiedWins}W</span>
              <span aria-hidden="true">/</span>
              <span className="text-[var(--loss-text)] font-bold">{stats.verifiedLosses}L</span>
              {stats.verifiedBe > 0 && (
                <>
                  <span aria-hidden="true">/</span>
                  <span>{stats.verifiedBe}BE</span>
                </>
              )}
              {stats.profitFactor !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>PF {stats.profitFactor.toFixed(2)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 3-Column Dynamic KPI Grid: Total P&L · Average R:R · Position Status */}
        <div className="flex-1 min-w-0 grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3.5 font-mono tabular-nums">
          {/* 1. Total P&L (Cumulative % + Net R) */}
          <div data-testid="journal-summary-total-pnl">
            <div className="font-sans text-[11px] font-semibold text-[var(--text-muted)]">
              Total P&amp;L
            </div>
            <div
              className={`text-xl sm:text-2xl font-black leading-tight mt-0.5 ${
                totalPnlPct > 0
                  ? 'text-[var(--gain-text)]'
                  : totalPnlPct < 0
                    ? 'text-[var(--loss-text)]'
                    : 'text-[var(--text-primary)]'
              }`}
            >
              {totalPnlPct > 0 ? '+' : ''}
              {totalPnlPct.toFixed(2)}%
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span
                className={
                  stats.netR > 0
                    ? 'text-[var(--gain-text)] font-bold'
                    : stats.netR < 0
                      ? 'text-[var(--loss-text)] font-bold'
                      : 'text-[var(--text-secondary)] font-bold'
                }
              >
                {stats.netR >= 0 ? '+' : ''}
                {stats.netR.toFixed(2)}R
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-sans">
                Max DD -{stats.maxDrawdownR.toFixed(1)}R
              </span>
            </div>
          </div>

          {/* 2. Average R:R (Dynamic Target & Realized) */}
          <div data-testid="journal-summary-avg-rr">
            <div className="font-sans text-[11px] font-semibold text-[var(--text-muted)]">
              Average R:R
            </div>
            <div className="text-xl sm:text-2xl font-black leading-tight mt-0.5 text-[var(--text-primary)]">
              {avgPlannedRR !== null ? `1 : ${avgPlannedRR.toFixed(2)}` : '—'}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
              {realizedRR !== null
                ? `Realized 1 : ${realizedRR.toFixed(2)}`
                : stats.avgWinR !== null
                  ? `Avg Win +${stats.avgWinR.toFixed(2)}R`
                  : `Exp ${stats.expectancyR >= 0 ? '+' : ''}${stats.expectancyR.toFixed(2)}R`}
            </div>
          </div>

          {/* 3. Live Exposure Summary */}
          <div className="col-span-2 lg:col-span-1 pt-2.5 border-t border-[var(--border-divider)] lg:pt-0 lg:border-t-0">
            <div className="font-sans text-[11px] font-semibold text-[var(--text-muted)]">
              Signal Pipeline
            </div>
            <div className="text-base sm:text-lg font-black leading-tight mt-1 flex items-center gap-2.5 flex-wrap">
              <span className="text-sky-600 dark:text-sky-400">
                {metrics.activeCount} Active
              </span>
              <span className="text-[var(--border-subtle)] font-normal">/</span>
              <span className="text-amber-600 dark:text-amber-300">
                {metrics.pendingCount} Pending
              </span>
              <span className="text-[var(--border-subtle)] font-normal">/</span>
              <span className="text-[var(--text-secondary)]">
                {metrics.closedCount} Closed
              </span>
            </div>
            <div className="font-sans text-[11px] text-[var(--text-muted)] mt-0.5">
              {stats.trailingCount > 0
                ? `${stats.trailingCount} protected by Trailing BE`
                : `Expectancy ${stats.expectancyR >= 0 ? '+' : ''}${stats.expectancyR.toFixed(2)}R per trade`}
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Past 7 Working Days Stocks Track Record Strip */}
      {stocks7dRecords.length > 0 && (
        <div className="pt-3.5 border-t border-[var(--border-divider)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="text-xs font-extrabold text-[var(--text-primary)]">
              Past 7 Working Days Stocks Track Record (IDX &amp; US)
            </div>
            <div className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>
                <strong className="text-[var(--text-primary)]">{stocks7dRecords.length}</strong> signals
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Win Rate{' '}
                <strong
                  className={
                    (stocks7dStats.winRatePct ?? 0) >= 55
                      ? 'text-[var(--gain-text)]'
                      : 'text-[var(--text-primary)]'
                  }
                >
                  {stocks7dStats.winRatePct !== null ? `${stocks7dStats.winRatePct}%` : '—'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong className="text-[var(--gain-text)]">{stocks7dStats.verifiedWins} TP</strong> /{' '}
                <strong className="text-[var(--loss-text)]">{stocks7dStats.verifiedLosses} SL</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong className="text-sky-600 dark:text-sky-400">
                  {stocks7dStats.runningCount + stocks7dStats.tp1Count} Active
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  stocks7dStats.netR >= 0
                    ? 'text-[var(--gain-text)] font-bold'
                    : 'text-[var(--loss-text)] font-bold'
                }
              >
                {stocks7dStats.netR >= 0 ? '+' : ''}
                {stocks7dStats.netR.toFixed(2)}R
              </span>
            </div>
          </div>

          {onSelectPath && activePath !== 'stocks' && activePath !== 'idx' && activePath !== 'us' && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onSelectPath('idx')}
                className="min-h-[40px] sm:min-h-[34px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors whitespace-nowrap"
              >
                View IDX 7D
              </button>
              <button
                type="button"
                onClick={() => onSelectPath('us')}
                className="min-h-[40px] sm:min-h-[34px] px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors whitespace-nowrap"
              >
                View US 7D
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
