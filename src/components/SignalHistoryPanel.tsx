import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  ExternalLink,
  History,
  MessageSquarePlus,
  ShieldCheck,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  ChartTradeOverlays,
  SignalHistoryRecord,
  SignalHistoryStatus,
  SignalUserOutcome,
  Timeframe,
} from '../types/market';
import { SignalVerificationMetrics } from '../hooks/useSignalVerification';
import {
  SignalHistoryStats,
  computeActiveTrailingStop,
  computeSignalHistoryStats,
  formatSignalPrice,
  getExpiredReasonMeta,
  isTerminalSignalStatus,
  isUnfilledExpiredSignal,
  normalizeSignalStatus,
} from '../utils/signalHistoryEngine';
import { SignalQuickViewModal } from './SignalDetailSheet';
import {
  formatPendingExpiryCountdown,
  getPendingExpiryRemainingMs,
} from '../utils/signalCleanupService';

export type SignalJournalCategoryFilter = 'all' | 'xau' | 'btc' | 'stocks' | 'idx' | 'us' | 'radar';
export type SignalJournalStatusFilter = 'all' | 'active' | 'pending' | 'closed';

export interface SignalHistoryPanelProps {
  records: SignalHistoryRecord[];
  stats: SignalHistoryStats;
  cloudSynced: boolean;
  verificationMetrics?: SignalVerificationMetrics;
  defaultCategory?: SignalJournalCategoryFilter;
  hideCategoryFilter?: boolean;
  hideSummaryHeader?: boolean;
  statusFilter?: SignalJournalStatusFilter;
  onStatusFilterChange?: (next: SignalJournalStatusFilter) => void;
  title?: string;
  subtitle?: string;
  onInspectSignal: (
    yahooSymbol: string,
    builtInAssetId: string | undefined,
    overlays: ChartTradeOverlays,
    timeframe?: Timeframe
  ) => void;
  onAnnotateSignal?: (
    signalId: string,
    outcome: SignalUserOutcome | null,
    journalNote?: string
  ) => void;
  onDeleteSignal: (id: string) => void;
  onClearClosedSignals: () => void;
}

type CategoryFilter = SignalJournalCategoryFilter;
type ClosedOutcomeSubFilter = 'all' | 'win' | 'loss' | 'expired';

function formatWibDateTime(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
  return { date, time: `${time} WIB` };
}

function getEngineLabel(engine: SignalHistoryRecord['sourceEngine']): string {
  switch (engine) {
    case 'ict_radar':
      return 'ICT 2022';
    case 'sdcv_radar':
      return 'SMC S&D';
    case 'idx_scanner':
      return 'IDX';
    case 'us_scanner':
      return 'US Stock';
    default:
      return 'Signal';
  }
}

function isWinRecord(rec: SignalHistoryRecord): boolean {
  if (rec.userOutcome === 'WIN') return true;
  if (rec.userOutcome === 'LOSS' || rec.userOutcome === 'BE') return false;
  return normalizeSignalStatus(rec.status) === 'TP';
}

function isLossRecord(rec: SignalHistoryRecord): boolean {
  if (rec.userOutcome === 'LOSS') return true;
  if (rec.userOutcome === 'WIN' || rec.userOutcome === 'BE') return false;
  return normalizeSignalStatus(rec.status) === 'SL';
}

function isActiveRecord(rec: SignalHistoryRecord): boolean {
  return normalizeSignalStatus(rec.status) === 'FILLED';
}

function isPendingRecord(rec: SignalHistoryRecord): boolean {
  return normalizeSignalStatus(rec.status) === 'PENDING';
}

function isClosedRecord(rec: SignalHistoryRecord): boolean {
  return isTerminalSignalStatus(rec.status);
}

/**
 * Compact visual Risk-to-Reward progress bar showing where live/closed price sits
 * between Stop Loss (0%) -> Entry -> TP1 -> TP2 (100%), inspired by TradingView & Binance Futures.
 */
const MobileSignalProgressTrack: React.FC<{ rec: SignalHistoryRecord }> = ({ rec }) => {
  const isBuy = rec.direction === 'BUY';
  const sl = rec.stopLoss;
  const entry = rec.entryPrice;
  const tp2 = rec.tp2;
  const tp1 = rec.tp1;
  const refPrice = rec.closedPrice ?? rec.lastPrice ?? entry;

  const span = isBuy ? tp2 - sl : sl - tp2;
  if (!Number.isFinite(span) || span <= 0) return null;

  const toPct = (val: number) => {
    const raw = isBuy ? ((val - sl) / span) * 100 : ((sl - val) / span) * 100;
    return Math.max(0, Math.min(100, raw));
  };

  const entryPct = toPct(entry);
  const tp1Pct = toPct(tp1);
  const currentPct = toPct(refPrice);
  const trailingStop = computeActiveTrailingStop(rec);
  const trailPct = trailingStop ? toPct(trailingStop) : null;
  const isProfit = isBuy ? refPrice >= entry : refPrice <= entry;
  const leftEdge = Math.min(entryPct, currentPct);
  const barWidth = Math.max(2, Math.abs(currentPct - entryPct));

  return (
    <div className="space-y-1.5">
      <div className="relative h-2 w-full rounded-full bg-black/8 dark:bg-white/10 overflow-visible">
        {/* Progress fill from Entry to Current/Exit price */}
        <div
          className={`absolute top-0 bottom-0 rounded-full transition-all duration-300 ${
            isProfit ? 'bg-[var(--gain-text)]' : 'bg-[var(--loss-text)]'
          }`}
          style={{ left: `${leftEdge}%`, width: `${barWidth}%` }}
        />
        {/* Entry anchor tick */}
        <div
          className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-[var(--text-primary)]/70"
          style={{ left: `${entryPct}%` }}
          title="Entry"
        />
        {/* TP1 anchor tick */}
        <div
          className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-[var(--gain-text)]/70"
          style={{ left: `${tp1Pct}%` }}
          title="TP1"
        />
        {/* Trailing Stop lock tick when TP1 has been secured */}
        {trailPct !== null && (
          <div
            className="absolute -top-1 -bottom-1 w-1 rounded-full bg-amber-500"
            style={{ left: `${trailPct}%` }}
            title="Trailing Stop"
          />
        )}
        {/* Live/Exit marker */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-[var(--bg-surface)] shadow-xs ${
            isProfit ? 'bg-[var(--gain-text)]' : 'bg-[var(--loss-text)]'
          }`}
          style={{ left: `${currentPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
        <span className="text-[var(--loss-text)]">SL</span>
        <span>Entry</span>
        <span>TP1</span>
        <span className="text-[var(--gain-text)]">TP2</span>
      </div>
    </div>
  );
};

const STATUS_META: Record<
  SignalHistoryStatus,
  {
    label: string;
    className: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  PENDING: {
    label: 'Pending Fill',
    className:
      'bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/35',
    Icon: Clock,
  },
  FILLED: {
    label: 'Filled Live',
    className:
      'bg-sky-500/12 text-sky-800 dark:text-sky-300 border-sky-500/35',
    Icon: Activity,
  },
  TP: {
    label: 'TP Win',
    className:
      'bg-emerald-600/16 text-emerald-800 dark:text-emerald-300 border-emerald-500/50',
    Icon: CheckCircle2,
  },
  SL: {
    label: 'Stop Loss',
    className:
      'bg-rose-500/14 text-rose-800 dark:text-rose-300 border-rose-500/40',
    Icon: XCircle,
  },
  PENDING_LIMIT: {
    label: 'Pending Fill',
    className:
      'bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/35',
    Icon: Clock,
  },
  RUNNING: {
    label: 'Filled Live',
    className:
      'bg-sky-500/12 text-sky-800 dark:text-sky-300 border-sky-500/35',
    Icon: Activity,
  },
  TP1_HIT: {
    label: 'TP1 Hit · SL→BE',
    className:
      'bg-emerald-500/14 text-emerald-800 dark:text-emerald-300 border-emerald-500/40',
    Icon: Target,
  },
  TP2_HIT: {
    label: 'TP Win',
    className:
      'bg-emerald-600/16 text-emerald-800 dark:text-emerald-300 border-emerald-500/50',
    Icon: CheckCircle2,
  },
  SL_HIT: {
    label: 'Stop Loss',
    className:
      'bg-rose-500/14 text-rose-800 dark:text-rose-300 border-rose-500/40',
    Icon: XCircle,
  },
  BE_CLOSED: {
    label: 'Break-Even',
    className:
      'bg-slate-500/14 text-slate-700 dark:text-slate-300 border-slate-500/35',
    Icon: ShieldCheck,
  },
  EXPIRED: {
    label: 'Closed / Expired',
    className:
      'bg-slate-500/12 text-slate-600 dark:text-slate-400 border-slate-500/30',
    Icon: Clock,
  },
};

export const SignalHistoryPanel: React.FC<SignalHistoryPanelProps> = ({
  records,
  cloudSynced,
  defaultCategory = 'all',
  hideCategoryFilter = false,
  hideSummaryHeader = false,
  statusFilter: controlledStatusFilter,
  onStatusFilterChange,
  title = 'Trade Signal Journal',
  subtitle = 'Tap any signal to open Entry, Exit & Stop-Loss details',
  onInspectSignal,
  onAnnotateSignal,
  onDeleteSignal,
  onClearClosedSignals,
}) => {
  const { user } = useAuth();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(defaultCategory);
  const [internalStatusFilter, setInternalStatusFilter] = useState<SignalJournalStatusFilter>('all');
  const [closedSubFilter, setClosedSubFilter] = useState<ClosedOutcomeSubFilter>('all');
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');

  const statusFilter = controlledStatusFilter ?? internalStatusFilter;
  const handleStatusFilterChange = (next: SignalJournalStatusFilter) => {
    if (onStatusFilterChange) {
      onStatusFilterChange(next);
    } else {
      setInternalStatusFilter(next);
    }
    if (next !== 'closed') {
      setClosedSubFilter('all');
    }
  };

  useEffect(() => {
    setCategoryFilter(defaultCategory);
  }, [defaultCategory]);

  const categoryScopedRecords = useMemo(() => {
    return records.filter((rec) => {
      if (isUnfilledExpiredSignal(rec)) return false;
      if (categoryFilter === 'xau') {
        return rec.assetId === 'XAUUSD' || rec.assetClass === 'commodity';
      }
      if (categoryFilter === 'btc') {
        return rec.assetId === 'BTCUSD' || rec.assetClass === 'crypto';
      }
      if (categoryFilter === 'stocks') {
        return rec.assetClass === 'stock_id' || rec.assetClass === 'stock_us';
      }
      if (categoryFilter === 'idx') return rec.assetClass === 'stock_id';
      if (categoryFilter === 'us') return rec.assetClass === 'stock_us';
      if (categoryFilter === 'radar') {
        return rec.assetClass === 'crypto' || rec.assetClass === 'commodity';
      }
      return true;
    });
  }, [records, categoryFilter]);

  const scopedStats = useMemo(
    () => computeSignalHistoryStats(categoryScopedRecords),
    [categoryScopedRecords]
  );

  const tabCounts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let closed = 0;
    let win = 0;
    let loss = 0;
    let expired = 0;
    for (const r of categoryScopedRecords) {
      if (isActiveRecord(r)) active++;
      else if (isPendingRecord(r)) pending++;
      else if (isClosedRecord(r)) closed++;
      if (isWinRecord(r)) win++;
      else if (isLossRecord(r)) loss++;
      else if (normalizeSignalStatus(r.status) === 'EXPIRED') expired++;
    }
    return {
      all: categoryScopedRecords.length,
      active,
      pending,
      closed,
      win,
      loss,
      expired,
    };
  }, [categoryScopedRecords]);

  const visibleRecords = useMemo(() => {
    return categoryScopedRecords.filter((rec) => {
      if (statusFilter === 'active') return isActiveRecord(rec);
      if (statusFilter === 'pending') return isPendingRecord(rec);
      if (statusFilter === 'closed') {
        if (!isClosedRecord(rec)) return false;
        if (closedSubFilter === 'win') return isWinRecord(rec);
        if (closedSubFilter === 'loss') return isLossRecord(rec);
        if (closedSubFilter === 'expired') return normalizeSignalStatus(rec.status) === 'EXPIRED';
        return true;
      }
      return true;
    });
  }, [categoryScopedRecords, statusFilter, closedSubFilter]);

  const selectedDetailRecord = useMemo(
    () => (selectedDetailId ? records.find((r) => r.id === selectedDetailId) ?? null : null),
    [records, selectedDetailId]
  );

  const closedCount = useMemo(
    () => records.filter((r) => isTerminalSignalStatus(r.status)).length,
    [records]
  );

  const handleOpenNoteEditor = (rec: SignalHistoryRecord) => {
    setEditingNoteId(rec.id);
    setNoteDraft(rec.journalNote ?? '');
  };

  const handleSaveNote = (rec: SignalHistoryRecord) => {
    onAnnotateSignal?.(rec.id, rec.userOutcome ?? null, noteDraft.trim());
    setEditingNoteId(null);
    setNoteDraft('');
  };

  return (
    <section
      data-testid="signal-history-journal-table"
      className="rounded-2xl liquid-glass-card border border-[var(--border-subtle)] overflow-hidden"
    >
      {/* Header Row */}
      <div className="px-4 sm:px-5 py-4 border-b border-[var(--border-divider)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <History className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
            <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              {title}
            </h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)]">
              <span aria-hidden="true">·</span>
              {cloudSynced && user ? (
                <>
                  <Cloud className="w-3 h-3 text-[var(--gain-text)]" />
                  <span>24H Cloud Synced</span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3 h-3 text-[var(--text-muted)]" />
                  <span>24H Server Ledger</span>
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
        </div>

        {/* Desktop & Tablet Summary KPI Bar (hidden when parent JournalSummaryCard renders it) */}
        <div className="hidden md:flex items-center gap-2 flex-wrap">
          {!hideSummaryHeader && (
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] font-mono text-xs tabular-nums">
              <div>
                <span className="text-[10px] font-sans uppercase text-[var(--text-muted)] mr-1">WR</span>
                <span className="font-extrabold text-[var(--text-primary)]">
                  {scopedStats.winRatePct !== null ? `${scopedStats.winRatePct.toFixed(1)}%` : '—'}
                </span>
              </div>
              <span className="text-[var(--border-subtle)]">|</span>
              <div className="text-[var(--gain-text)] font-bold">
                {scopedStats.verifiedWins}W
              </div>
              <div className="text-[var(--loss-text)] font-bold">
                {scopedStats.verifiedLosses}L
              </div>
              <div className="text-[var(--text-secondary)] font-semibold">
                {scopedStats.verifiedBe}BE
              </div>
              <span className="text-[var(--border-subtle)]">|</span>
              <div
                className={`font-extrabold ${
                  scopedStats.netR > 0
                    ? 'text-[var(--gain-text)]'
                    : scopedStats.netR < 0
                      ? 'text-[var(--loss-text)]'
                      : 'text-[var(--text-secondary)]'
                }`}
              >
                {scopedStats.netR >= 0 ? '+' : ''}
                {scopedStats.netR.toFixed(2)}R
              </div>
            </div>
          )}

          {closedCount > 0 && (
            <button
              type="button"
              onClick={onClearClosedSignals}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--loss-text)] hover:border-[var(--loss-text)]/40 transition-colors"
              title="Remove all closed/expired signals from journal"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Closed</span>
            </button>
          )}
        </div>

        {/* Mobile-Dedicated Summary KPI Strip (only when panel is standalone, e.g. ICT Radar) */}
        {!hideSummaryHeader && (
          <div className="md:hidden pt-1 space-y-2.5">
            <div className="grid grid-cols-3 divide-x divide-[var(--border-divider)] rounded-xl bg-[var(--bg-inset)]/80 py-2.5 px-1 font-mono tabular-nums">
              <div className="px-2.5">
                <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Win Rate
                </div>
                <div className="text-sm font-black text-[var(--text-primary)] mt-0.5">
                  {scopedStats.winRatePct !== null ? `${scopedStats.winRatePct.toFixed(1)}%` : '—'}
                </div>
              </div>
              <div className="px-2.5">
                <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  W / L / BE
                </div>
                <div className="text-sm font-extrabold mt-0.5 flex items-center gap-1">
                  <span className="text-[var(--gain-text)]">{scopedStats.verifiedWins}</span>
                  <span className="text-[var(--text-muted)] font-normal">/</span>
                  <span className="text-[var(--loss-text)]">{scopedStats.verifiedLosses}</span>
                  <span className="text-[var(--text-muted)] font-normal">/</span>
                  <span className="text-[var(--text-secondary)]">{scopedStats.verifiedBe}</span>
                </div>
              </div>
              <div className="px-2.5 text-right">
                <div className="font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Net R
                </div>
                <div
                  className={`text-sm font-black mt-0.5 ${
                    scopedStats.netR > 0
                      ? 'text-[var(--gain-text)]'
                      : scopedStats.netR < 0
                        ? 'text-[var(--loss-text)]'
                        : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {scopedStats.netR >= 0 ? '+' : ''}
                  {scopedStats.netR.toFixed(2)}R
                </div>
              </div>
            </div>

            {closedCount > 0 && (
              <button
                type="button"
                onClick={onClearClosedSignals}
                className="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-xs font-bold text-[var(--text-secondary)] active:scale-[0.99] transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Closed Signals ({closedCount})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter Bar: Segmented All / Active / Pending / Closed Toggle (>=44px mobile touch height) */}
      <div
        data-testid="journal-status-filter-bar"
        className="px-3.5 sm:px-5 py-3 border-b border-[var(--border-divider)] bg-[var(--bg-inset)]/60 flex flex-col gap-2.5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Primary Segmented Status Filter Bar: All | Active | Pending | Closed */}
          <div
            className="grid grid-cols-4 md:inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
            role="tablist"
            aria-label="Filter journal by signal status"
          >
            {(
              [
                { id: 'all', label: 'All', count: tabCounts.all },
                { id: 'active', label: 'Active', count: tabCounts.active },
                { id: 'pending', label: 'Pending', count: tabCounts.pending },
                { id: 'closed', label: 'Closed', count: tabCounts.closed },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleStatusFilterChange(tab.id)}
                  className={`min-h-[44px] md:min-h-[34px] px-2 md:px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-1.5 ${
                    active
                      ? 'bg-[var(--accent-primary)] text-white monochrome:text-black shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      active ? 'opacity-90' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Asset Class Scope Filter (when not controlled by SignalJournalView) */}
          {!hideCategoryFilter && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'xau', label: 'XAU/USD' },
                  { id: 'btc', label: 'BTC/USD' },
                  { id: 'idx', label: 'IDX' },
                  { id: 'us', label: 'US Stocks' },
                ] as const
              ).map((cat) => {
                const active = categoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`min-h-[36px] md:min-h-0 px-2.5 md:px-2 py-1 rounded-lg text-[11px] md:text-[10px] font-bold whitespace-nowrap border transition-colors ${
                      active
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                        : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Secondary Closed Outcome Filter (only visible when Closed tab is active) */}
        {statusFilter === 'closed' && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { id: 'all', label: `All Closed (${tabCounts.closed})` },
                  { id: 'win', label: `TP Wins (${tabCounts.win})` },
                  { id: 'loss', label: `SL Losses (${tabCounts.loss})` },
                  { id: 'expired', label: `Expired (${tabCounts.expired})` },
                ] as const
              ).map((sub) => {
                const active = closedSubFilter === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setClosedSubFilter(sub.id)}
                    className={`min-h-[36px] md:min-h-[28px] px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap border transition-colors ${
                      active
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {sub.label}
                  </button>
                );
              })}
            </div>

            {hideSummaryHeader && closedCount > 0 && (
              <button
                type="button"
                onClick={onClearClosedSignals}
                className="md:hidden min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-bold text-[var(--text-muted)] active:text-[var(--loss-text)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Empty State vs Separate Mobile & Desktop/Tablet Views */}
      {visibleRecords.length === 0 ? (
        <div className="px-5 py-10 text-center flex flex-col items-center gap-1.5">
          <BookOpen className="w-6 h-6 text-[var(--text-muted)] opacity-70" />
          <p className="text-xs font-bold text-[var(--text-primary)]">
            No {statusFilter === 'all' ? '' : `${statusFilter} `}signals in this journal filter yet
          </p>
          <p className="text-[11px] text-[var(--text-muted)] max-w-md">
            The 24H cloud background engine continuously tracks valid ICT 2022, SMC S&amp;D (5m–4H), and Stock setups and logs exact first-trigger WIB timestamps automatically.
          </p>
        </div>
      ) : (
        <>
          {/* DEDICATED MOBILE VIEW (< 768px): Fast-Scan Interactive Rows -> Tap opens Bottom Sheet */}
          <div
            data-testid="signal-journal-mobile-list"
            className="md:hidden divide-y divide-[var(--border-divider)]"
          >
            {visibleRecords.map((rec) => {
              const triggered = formatWibDateTime(rec.createdAtMs);
              const canonicalStatus = normalizeSignalStatus(rec.status);
              const statusMeta = STATUS_META[rec.status] ?? STATUS_META[canonicalStatus] ?? STATUS_META.PENDING;
              const StatusIcon = statusMeta.Icon;
              const expiredMeta =
                rec.status === 'EXPIRED'
                  ? getExpiredReasonMeta(rec.expiredReason, rec.zoneFillVerified)
                  : null;
              const isBuy = rec.direction === 'BUY';
              const dec = rec.decimals;
              const cur = rec.currency;
              const displayPnl = rec.pnlPct;
              const displayR = rec.rMultiple;
              const trailPx = computeActiveTrailingStop(rec);

              return (
                <button
                  key={rec.id}
                  type="button"
                  data-testid={`journal-signal-row-${rec.id}`}
                  onClick={() => setSelectedDetailId(rec.id)}
                  className="w-full text-left px-4 py-3.5 space-y-2.5 bg-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.03] active:bg-black/[0.04] dark:active:bg-white/[0.06] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
                >
                  {/* Row 1: Asset Direction + Right-Aligned Tabular Outcome + Chevron */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-black tracking-tight text-[var(--text-primary)]">
                          {rec.symbol}
                        </span>
                        <span
                          className={`inline-flex items-center gap-0.5 text-xs font-black ${
                            isBuy ? 'text-[var(--gain-text)]' : 'text-[var(--loss-text)]'
                          }`}
                        >
                          {isBuy ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          {rec.direction}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-[var(--text-muted)]">
                          {rec.timeframe}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                        {getEngineLabel(rec.sourceEngine)} · R:R {rec.riskReward} · {triggered.date} {triggered.time}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right font-mono tabular-nums">
                        {canonicalStatus === 'PENDING' || canonicalStatus === 'EXPIRED' ? (
                          <div className="text-sm font-bold text-[var(--text-muted)]">—</div>
                        ) : (
                          <>
                            <div
                              className={`text-base font-black leading-tight ${
                                displayR > 0
                                  ? 'text-[var(--gain-text)]'
                                  : displayR < 0
                                    ? 'text-[var(--loss-text)]'
                                    : 'text-[var(--text-secondary)]'
                              }`}
                            >
                              {displayR >= 0 ? '+' : ''}
                              {displayR.toFixed(2)}R
                            </div>
                            <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                              {displayPnl >= 0 ? '+' : ''}
                              {displayPnl.toFixed(2)}%
                            </div>
                          </>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    </div>
                  </div>

                  {/* Row 2: Compact Status + Key Entry / Exit / SL Preview */}
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    {rec.status === 'EXPIRED' && expiredMeta ? (
                      <span
                        className={`inline-flex items-center gap-1 font-extrabold ${
                          expiredMeta.isInvalidated
                            ? 'text-[var(--loss-text)]'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {expiredMeta.isInvalidated ? (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{expiredMeta.shortLabel}</span>
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 font-extrabold ${
                          canonicalStatus === 'TP'
                            ? 'text-[var(--gain-text)]'
                            : canonicalStatus === 'SL'
                              ? 'text-[var(--loss-text)]'
                              : canonicalStatus === 'FILLED'
                                ? 'text-sky-600 dark:text-sky-300'
                                : 'text-amber-600 dark:text-amber-300'
                        }`}
                      >
                        <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>{statusMeta.label}</span>
                        {canonicalStatus === 'PENDING' && (
                          <span className="font-mono font-semibold text-[10px] opacity-85">
                            · {formatPendingExpiryCountdown(getPendingExpiryRemainingMs(rec))}
                          </span>
                        )}
                      </span>
                    )}

                    <span className="font-mono tabular-nums text-[var(--text-secondary)] truncate">
                      En {formatSignalPrice(rec.entryPrice, cur, dec)} ·{' '}
                      <span className="text-[var(--loss-text)]">
                        SL {formatSignalPrice(rec.stopLoss, cur, dec)}
                      </span>
                      {trailPx && !isTerminalSignalStatus(rec.status) ? (
                        <span className="text-amber-600 dark:text-amber-300 font-bold"> · Trail</span>
                      ) : null}
                    </span>
                  </div>

                  {/* Row 3: Live Progress Track (SL -> Entry -> TP1 -> TP2) */}
                  {canonicalStatus !== 'PENDING' && <MobileSignalProgressTrack rec={rec} />}

                  {rec.journalNote && (
                    <p className="text-[11px] text-[var(--text-muted)] italic truncate">
                      Note: &ldquo;{rec.journalNote}&rdquo;
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* DESKTOP & TABLET VIEW (>= 768px): Institutional Multi-Column Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[920px]">
              <thead>
                <tr className="border-b border-[var(--border-divider)] bg-[var(--bg-inset)] text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="py-2.5 pl-4 pr-3 whitespace-nowrap">First Triggered (WIB)</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Asset · TF · Engine</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Action &amp; Order</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Entry Zone</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">SL / TP1 / TP2</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Status / Expired Reason</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">P&amp;L · R</th>
                  <th className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">Journal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-divider)] text-xs">
                {visibleRecords.map((rec) => {
                  const triggered = formatWibDateTime(rec.createdAtMs);
                  const canonicalStatus = normalizeSignalStatus(rec.status);
                  const statusMeta = STATUS_META[rec.status] ?? STATUS_META[canonicalStatus] ?? STATUS_META.PENDING;
                  const StatusIcon = statusMeta.Icon;
                  const expiredMeta =
                    rec.status === 'EXPIRED'
                      ? getExpiredReasonMeta(rec.expiredReason, rec.zoneFillVerified)
                      : null;
                  const isBuy = rec.direction === 'BUY';
                  const dec = rec.decimals;
                  const cur = rec.currency;
                  const isEditing = editingNoteId === rec.id;

                  const rowOutcome = rec.userOutcome;
                  const displayPnl = rec.pnlPct;
                  const displayR = rec.rMultiple;

                  return (
                    <React.Fragment key={rec.id}>
                      <tr
                        onClick={() => setSelectedDetailId(rec.id)}
                        className="cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors align-middle"
                      >
                        {/* 1. First Triggered WIB */}
                        <td className="py-2.5 pl-4 pr-3 whitespace-nowrap font-mono tabular-nums">
                          <div className="font-bold text-[var(--text-primary)] text-[11px]">
                            {triggered.date} · {triggered.time}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {rec.filledAtMs
                              ? `Filled ${formatWibDateTime(rec.filledAtMs).time}`
                              : rec.closedAtMs
                                ? `Closed ${formatWibDateTime(rec.closedAtMs).time}`
                                : 'Pending entry fill'}
                          </div>
                        </td>

                        {/* 2. Asset · TF · Engine */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-[var(--text-primary)]">
                              {rec.symbol}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-[var(--bg-inset)] border border-[var(--border-subtle)] font-mono text-[10px] font-bold text-[var(--text-secondary)]">
                              {rec.timeframe}
                            </span>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[170px]" title={rec.strategyTag}>
                            {getEngineLabel(rec.sourceEngine)} · {rec.confidence}%
                          </div>
                        </td>

                        {/* 3. Direction & Order Type */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase tracking-wider border ${
                                isBuy
                                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/35'
                                  : 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/35'
                              }`}
                            >
                              {isBuy ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {rec.direction}
                            </span>
                            {rec.orderType && (
                              <span className="px-1.5 py-0.5 rounded bg-[var(--bg-inset)] border border-[var(--border-subtle)] font-mono text-[10px] font-bold text-[var(--text-secondary)]">
                                {rec.orderType}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            R:R {rec.riskReward}
                          </div>
                        </td>

                        {/* 4. Entry Zone */}
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums">
                          <div className="font-bold text-[var(--text-primary)] text-[11px]">
                            {formatSignalPrice(rec.entryLow, cur, dec)} –{' '}
                            {formatSignalPrice(rec.entryHigh, cur, dec)}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            Ref: {formatSignalPrice(rec.entryPrice, cur, dec)}
                          </div>
                        </td>

                        {/* 5. SL / TP1 / TP2 */}
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums text-[10.5px] leading-tight">
                          <div className="text-[var(--loss-text)] font-bold">
                            SL {formatSignalPrice(rec.stopLoss, cur, dec)}
                          </div>
                          <div className="text-[var(--text-secondary)]">
                            TP1 {formatSignalPrice(rec.tp1, cur, dec)}
                          </div>
                          <div className="text-[var(--gain-text)] font-bold">
                            TP2 {formatSignalPrice(rec.tp2, cur, dec)}
                          </div>
                        </td>

                        {/* 6. Status / Explicit Expired Reason */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {rec.status === 'EXPIRED' && expiredMeta ? (
                            <div className="space-y-0.5" title={expiredMeta.detailLabel}>
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                                  expiredMeta.isInvalidated
                                    ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/35'
                                    : 'bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/35'
                                }`}
                              >
                                {expiredMeta.isInvalidated ? (
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                ) : (
                                  <Clock className="w-3 h-3 shrink-0" />
                                )}
                                <span>{expiredMeta.shortLabel}</span>
                              </span>
                              <div className="text-[10px] text-[var(--text-muted)] max-w-[200px] truncate">
                                {expiredMeta.isInvalidated
                                  ? 'Reason: Invalidation (SL touched first)'
                                  : 'Reason: Price never filled entry zone'}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${statusMeta.className}`}
                              >
                                <StatusIcon className="w-3 h-3 shrink-0" />
                                <span>{statusMeta.label}</span>
                              </span>
                              {rec.journalNote && (
                                <div
                                  className="text-[10px] text-[var(--text-muted)] max-w-[180px] truncate"
                                  title={rec.journalNote}
                                >
                                  Note: {rec.journalNote}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 7. P&L · R */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono tabular-nums">
                          {canonicalStatus === 'PENDING' || canonicalStatus === 'EXPIRED' ? (
                            <span className="text-[11px] font-semibold text-[var(--text-muted)]">—</span>
                          ) : (
                            <>
                              <div
                                className={`font-extrabold text-xs ${
                                  displayR > 0
                                    ? 'text-[var(--gain-text)]'
                                    : displayR < 0
                                      ? 'text-[var(--loss-text)]'
                                      : 'text-[var(--text-secondary)]'
                                }`}
                              >
                                {displayR >= 0 ? '+' : ''}
                                {displayR.toFixed(2)}R
                              </div>
                              <div className="text-[10px] text-[var(--text-muted)]">
                                {displayPnl >= 0 ? '+' : ''}
                                {displayPnl.toFixed(2)}%
                              </div>
                            </>
                          )}
                        </td>

                        {/* 8. Journal Controls & Actions */}
                        <td
                          className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedDetailId(rec.id)}
                              title="Open Quick View modal with Entry, SL, TP & Historical Price Data"
                              className="h-6 px-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-[10px] font-bold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors inline-flex items-center gap-0.5"
                            >
                              <span>Quick View</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                            {onAnnotateSignal && (
                              <>
                                {(['WIN', 'LOSS', 'BE'] as const).map((tag) => {
                                  const active = rowOutcome === tag;
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() =>
                                        onAnnotateSignal(
                                          rec.id,
                                          active ? null : tag,
                                          rec.journalNote
                                        )
                                      }
                                      title={`Mark journal outcome as ${tag}`}
                                      className={`w-6 h-6 rounded text-[10px] font-extrabold border transition-colors ${
                                        active
                                          ? 'bg-[var(--accent-primary)] text-white monochrome:text-black border-transparent'
                                          : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                      }`}
                                    >
                                      {tag === 'WIN' ? 'W' : tag === 'LOSS' ? 'L' : 'B'}
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={() =>
                                    isEditing ? setEditingNoteId(null) : handleOpenNoteEditor(rec)
                                  }
                                  title="Add or edit trade journal note"
                                  className="w-6 h-6 rounded border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                  <MessageSquarePlus className="w-3 h-3" />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                onInspectSignal(
                                  rec.assetClass === 'stock_id' && !rec.symbol.endsWith('.JK')
                                    ? `${rec.symbol}.JK`
                                    : rec.symbol,
                                  rec.assetId,
                                  {
                                    symbolLabel: `${rec.symbol} (${rec.timeframe})`,
                                    direction: rec.direction,
                                    entryLow: rec.entryLow,
                                    entryHigh: rec.entryHigh,
                                    stopLoss: rec.stopLoss,
                                    tp1: rec.tp1,
                                    tp2: rec.tp2,
                                  },
                                  rec.timeframe as Timeframe
                                )
                              }
                              title="Inspect signal levels on chart"
                              className="w-6 h-6 rounded border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent-primary)]"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteSignal(rec.id)}
                              title="Delete signal record"
                              className="w-6 h-6 rounded border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--loss-text)]"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isEditing && onAnnotateSignal && (
                        <tr className="bg-[var(--bg-inset)]/80">
                          <td colSpan={8} className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                maxLength={240}
                                placeholder="Write execution note (e.g., filled on London retest, trailed SL after TP1)..."
                                className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveNote(rec)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] text-white monochrome:text-black text-xs font-bold"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Save Note
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingNoteId(null)}
                                className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)]"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {/* Quick View Modal (Bottom Sheet on Mobile / Centered Modal on Desktop) with Historical Price Data */}
      <SignalQuickViewModal
        record={selectedDetailRecord}
        onClose={() => setSelectedDetailId(null)}
        onInspectSignal={onInspectSignal}
        onAnnotateSignal={onAnnotateSignal}
        onDeleteSignal={onDeleteSignal}
      />
    </section>
  );
};
