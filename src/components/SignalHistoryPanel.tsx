import React, { useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  ExternalLink,
  History,
  Lock,
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
  computeSignalHistoryStats,
  deriveSignalVerificationStatus,
  formatSignalPrice,
  isTerminalSignalStatus,
} from '../utils/signalHistoryEngine';

interface SignalHistoryPanelProps {
  records: SignalHistoryRecord[];
  stats: SignalHistoryStats;
  cloudSynced: boolean;
  verificationMetrics?: SignalVerificationMetrics;
  defaultCategory?: 'all' | 'stocks' | 'idx' | 'us' | 'radar';
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

type CategoryFilter = 'all' | 'stocks' | 'idx' | 'us' | 'radar';
type StatusFilter = 'all' | 'active' | 'pending' | 'tp' | 'sl' | 'journaled';

const STATUS_BADGE_MAP: Record<
  SignalHistoryStatus,
  {
    label: string;
    shortLabel: string;
    className: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  PENDING_LIMIT: {
    label: 'Awaiting Limit Fill',
    shortLabel: 'LIMIT',
    className:
      'bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/35',
    Icon: Clock,
  },
  RUNNING: {
    label: 'Running Live',
    shortLabel: 'RUNNING',
    className:
      'bg-sky-500/12 text-sky-800 dark:text-sky-300 border-sky-500/35',
    Icon: Activity,
  },
  TP1_HIT: {
    label: 'TP1 Hit · SL→BE',
    shortLabel: 'TP1 HIT',
    className:
      'bg-emerald-500/14 text-emerald-800 dark:text-emerald-300 border-emerald-500/40',
    Icon: Target,
  },
  TP2_HIT: {
    label: 'TP2 Target Hit',
    shortLabel: 'TP2 WIN',
    className:
      'bg-emerald-600/16 text-emerald-800 dark:text-emerald-300 border-emerald-500/50',
    Icon: CheckCircle2,
  },
  SL_HIT: {
    label: 'Stop Loss Hit',
    shortLabel: 'SL HIT',
    className:
      'bg-rose-500/14 text-rose-800 dark:text-rose-300 border-rose-500/40',
    Icon: XCircle,
  },
  BE_CLOSED: {
    label: 'Closed Break-Even',
    shortLabel: 'BE CLOSED',
    className:
      'bg-slate-500/14 text-slate-700 dark:text-slate-300 border-slate-500/35',
    Icon: ShieldCheck,
  },
  EXPIRED: {
    label: 'Expired Unfilled',
    shortLabel: 'EXPIRED',
    className:
      'bg-slate-500/12 text-slate-600 dark:text-slate-400 border-slate-500/30',
    Icon: Clock,
  },
};

const ENGINE_LABELS: Record<SignalHistoryRecord['sourceEngine'], string> = {
  idx_scanner: 'IDX Scanner',
  us_scanner: 'US Scanner',
  ict_radar: 'ICT Radar',
  sdcv_radar: 'S&D Matrix',
};

const JOURNAL_OUTCOME_BUTTONS: ReadonlyArray<{
  id: SignalUserOutcome;
  label: string;
  testId: string;
  activeClass: string;
}> = [
  {
    id: 'WIN',
    label: 'Win',
    testId: 'journal-btn-win',
    activeClass: 'bg-[#16A34A] text-white border-[#16A34A] shadow-xs',
  },
  {
    id: 'LOSS',
    label: 'Loss',
    testId: 'journal-btn-loss',
    activeClass: 'bg-[#DC2626] text-white border-[#DC2626] shadow-xs',
  },
  {
    id: 'BE',
    label: 'BE',
    testId: 'journal-btn-be',
    activeClass: 'bg-[#D97706] text-white border-[#D97706] shadow-xs',
  },
  {
    id: 'SKIPPED',
    label: 'Skip',
    testId: 'journal-btn-skipped',
    activeClass: 'bg-[#475569] text-white border-[#475569] shadow-xs',
  },
];

function formatWibTime(epochMs: number): string {
  try {
    return (
      new Date(epochMs).toLocaleString('en-GB', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }) + ' WIB'
    );
  } catch {
    return '—';
  }
}

export const SignalHistoryPanel: React.FC<SignalHistoryPanelProps> = ({
  records,
  cloudSynced,
  verificationMetrics,
  defaultCategory = 'all',
  title = 'Signal History & Automated Trade Journal',
  subtitle = 'Every setup automatically captures entry zone, timeframe, strategy, and zone-fill status in the database — track live TP/SL performance and annotate your actual Win/Loss trade journal directly below.',
  onInspectSignal,
  onAnnotateSignal,
  onDeleteSignal,
  onClearClosedSignals,
}) => {
  const { user, signInWithGoogle, authLoading } = useAuth();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(defaultCategory);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showAllRows, setShowAllRows] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');

  const categoryRecords = useMemo(() => {
    return records.filter((r) => {
      if (categoryFilter === 'all') return true;
      if (categoryFilter === 'stocks') {
        return r.assetClass === 'stock_id' || r.assetClass === 'stock_us';
      }
      if (categoryFilter === 'idx') return r.assetClass === 'stock_id';
      if (categoryFilter === 'us') return r.assetClass === 'stock_us';
      return r.assetClass === 'crypto' || r.assetClass === 'commodity';
    });
  }, [records, categoryFilter]);

  const scopedStats = useMemo(
    () => computeSignalHistoryStats(categoryRecords),
    [categoryRecords]
  );

  const verifiedFillCount = useMemo(
    () =>
      categoryRecords.filter(
        (r) =>
          r.zoneFillVerified ||
          r.filledOnFirstSight ||
          Boolean(r.filledAtMs) ||
          (r.status !== 'PENDING_LIMIT' && r.status !== 'EXPIRED')
      ).length,
    [categoryRecords]
  );

  const filteredRecords = useMemo(() => {
    return categoryRecords.filter((r) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'active') return r.status === 'RUNNING' || r.status === 'TP1_HIT';
      if (statusFilter === 'pending') return r.status === 'PENDING_LIMIT';
      if (statusFilter === 'tp') return r.status === 'TP1_HIT' || r.status === 'TP2_HIT';
      if (statusFilter === 'journaled') return Boolean(r.userOutcome || r.journalNote);
      return r.status === 'SL_HIT' || r.status === 'BE_CLOSED' || r.status === 'EXPIRED';
    });
  }, [categoryRecords, statusFilter]);

  const visibleRecords = showAllRows ? filteredRecords : filteredRecords.slice(0, 12);
  const closedCount = records.filter((r) => isTerminalSignalStatus(r.status)).length;

  const openNoteEditor = (rec: SignalHistoryRecord) => {
    if (editingNoteId === rec.id) {
      setEditingNoteId(null);
      setNoteDraft('');
      return;
    }
    setEditingNoteId(rec.id);
    setNoteDraft(rec.journalNote ?? '');
  };

  const handleSaveNote = (rec: SignalHistoryRecord) => {
    onAnnotateSignal?.(rec.id, rec.userOutcome ?? null, noteDraft);
    setEditingNoteId(null);
    setNoteDraft('');
  };

  return (
    <section
      id="signal-history-ledger"
      data-testid="signal-history-panel"
      aria-label="Signal History and Automated Trade Journal"
      className="liquid-glass-card rounded-2xl p-4 sm:p-5 space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-[#1D4ED8]/10 dark:bg-[#2962FF]/15 text-[#1D4ED8] dark:text-[#60A5FA] shrink-0">
              <History className="w-4 h-4" />
            </span>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight text-[#0A2540] dark:text-[#F0F3FA]">
              {title}
            </h2>
            {cloudSynced && user ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                <Cloud className="w-3 h-3" />
                Cloud DB Synced
              </span>
            ) : (
              <button
                type="button"
                disabled={authLoading}
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#1D4ED8]/10 dark:bg-[#2962FF]/18 text-[#1D4ED8] dark:text-[#93C5FD] border border-[#1D4ED8]/25 dark:border-[#2962FF]/35 hover:bg-[#1D4ED8]/18 transition-colors cursor-pointer"
              >
                <CloudOff className="w-3 h-3" />
                Local Ledger · Sign in to Sync Cloud DB
              </button>
            )}
            {verificationMetrics?.isMonitoring && (
              <span
                data-testid="live-zone-monitor-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/12 text-sky-800 dark:text-sky-300 border border-sky-500/30"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                Monitoring {verificationMetrics.pendingCount} Entry Zone
                {verificationMetrics.pendingCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs sm:text-[13px] leading-relaxed text-[#425466] dark:text-[#A9B4C4] max-w-3xl">
            {subtitle}
          </p>
        </div>

        {closedCount > 0 && (
          <button
            type="button"
            onClick={onClearClosedSignals}
            className="self-start shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-black/10 dark:border-white/15 text-[#425466] dark:text-[#CBD5E1] hover:text-rose-700 dark:hover:text-rose-300 hover:border-rose-500/35 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Closed ({closedCount})
          </button>
        )}
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <div className="liquid-glass-inset rounded-xl px-3 py-2.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#526375] dark:text-[#94A3B8]">
            Running · Pending
          </div>
          <div className="mt-0.5 num-card text-[#0A2540] dark:text-[#F8FAFC] flex items-baseline gap-1.5">
            <span>{scopedStats.runningCount + scopedStats.tp1Count}</span>
            <span className="text-xs font-mono text-amber-700 dark:text-amber-300">
              +{scopedStats.pendingCount} lim
            </span>
          </div>
          <div className="text-[11px] text-[#526375] dark:text-[#94A3B8]">
            {verifiedFillCount}/{scopedStats.total} zone-fill verified
          </div>
        </div>

        <div className="liquid-glass-inset rounded-xl px-3 py-2.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#526375] dark:text-[#94A3B8]">
            Auto TP / SL
          </div>
          <div className="mt-0.5 num-card flex items-baseline gap-1.5">
            <span className="text-[#0F7638] dark:text-[#34D399]">
              {scopedStats.tp1Count + scopedStats.tp2Count}
            </span>
            <span className="text-xs text-[#64748B]">/</span>
            <span className="text-[#B91C1C] dark:text-[#F87171]">{scopedStats.slCount}</span>
          </div>
          <div className="text-[11px] text-[#526375] dark:text-[#94A3B8]">
            {scopedStats.beCount} BE · {scopedStats.expiredCount} Unfilled
          </div>
        </div>

        <div
          data-testid="true-hit-rate-kpi"
          className="liquid-glass-inset rounded-xl px-3 py-2.5"
        >
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
            True Hit Rate
          </div>
          <div className="mt-0.5 num-card text-[#0A2540] dark:text-[#F8FAFC] flex items-baseline gap-1.5">
            <span>
              {scopedStats.trueHitRatePct !== null ? `${scopedStats.trueHitRatePct}%` : '—'}
            </span>
            {scopedStats.fillConversionRatePct !== null && (
              <span className="text-[11px] font-mono font-bold text-[#526375] dark:text-[#94A3B8]">
                ({scopedStats.fillConversionRatePct}% fill)
              </span>
            )}
          </div>
          <div className="text-[11px] text-[#526375] dark:text-[#94A3B8]">
            {scopedStats.verifiedCount} Verified · {scopedStats.verifiedExpiredCount} Expired
          </div>
        </div>

        <div
          data-testid="trade-journal-kpi"
          className="liquid-glass-inset rounded-xl px-3 py-2.5"
        >
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#1D4ED8] dark:text-[#60A5FA] flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            Journal W / L
          </div>
          <div className="mt-0.5 num-card flex items-baseline gap-1.5">
            <span className="text-[#0F7638] dark:text-[#34D399]">{scopedStats.journalWins}W</span>
            <span className="text-xs text-[#64748B]">/</span>
            <span className="text-[#B91C1C] dark:text-[#F87171]">{scopedStats.journalLosses}L</span>
            {scopedStats.journalWinRatePct !== null && (
              <span className="text-xs font-mono font-bold text-[#0A2540] dark:text-[#E2E8F0]">
                ({scopedStats.journalWinRatePct}%)
              </span>
            )}
          </div>
          <div className="text-[11px] text-[#526375] dark:text-[#94A3B8]">
            {scopedStats.journalBe} BE · {scopedStats.journalSkipped} Skipped
          </div>
        </div>

        <div className="liquid-glass-inset rounded-xl px-3 py-2.5 col-span-2 sm:col-span-1">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#526375] dark:text-[#94A3B8]">
            Cumulative R
          </div>
          <div
            className={`mt-0.5 num-card ${
              scopedStats.netR > 0
                ? 'text-[#0F7638] dark:text-[#34D399]'
                : scopedStats.netR < 0
                  ? 'text-[#B91C1C] dark:text-[#F87171]'
                  : 'text-[#0A2540] dark:text-[#F8FAFC]'
            }`}
          >
            {scopedStats.netR > 0 ? '+' : ''}
            {scopedStats.netR.toFixed(2)}R
          </div>
          <div className="text-[11px] text-[#526375] dark:text-[#94A3B8]">
            {scopedStats.total} logged setups
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-1 border-t border-black/8 dark:border-white/10">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Signal Asset Class Filter"
        >
          {(
            [
              { id: 'all', label: 'All Signals' },
              { id: 'radar', label: 'ICT · BTC & XAU' },
              { id: 'stocks', label: 'All Stocks' },
              { id: 'idx', label: 'IDX Stocks' },
              { id: 'us', label: 'US Stocks' },
            ] as { id: CategoryFilter; label: string }[]
          ).map((tab) => {
            const active = categoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#1D4ED8] dark:bg-[#2962FF] text-white shadow-xs'
                    : 'bg-black/[0.04] dark:bg-white/[0.06] text-[#334155] dark:text-[#CBD5E1] hover:bg-black/[0.08] dark:hover:bg-white/[0.11]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'All Status' },
              { id: 'active', label: 'Running' },
              { id: 'pending', label: 'Pending Limit' },
              { id: 'tp', label: 'TP Hit' },
              { id: 'sl', label: 'SL / Closed' },
              { id: 'journaled', label: 'Journaled' },
            ] as { id: StatusFilter; label: string }[]
          ).map((st) => {
            const active = statusFilter === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0A2540] dark:bg-white text-white dark:text-[#0B0E14]'
                    : 'text-[#425466] dark:text-[#94A3B8] hover:text-[#0A2540] dark:hover:text-white'
                }`}
              >
                {st.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Signal Ledger Cards / Rows */}
      {visibleRecords.length === 0 ? (
        <div className="liquid-glass-inset rounded-xl p-6 text-center space-y-1.5">
          <p className="text-sm font-bold text-[#0A2540] dark:text-[#F0F3FA]">
            No signals match this filter yet
          </p>
          <p className="text-xs text-[#526375] dark:text-[#94A3B8] max-w-md mx-auto">
            As soon as live BTC/XAU radar or IDX/US scanners qualify an actionable BUY/SELL setup, its exact entry zone, timeframe, strategy, and zone-fill status lock here automatically for continuous tracking and trade journaling.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleRecords.map((rec) => {
            const badge = STATUS_BADGE_MAP[rec.status];
            const BadgeIcon = badge.Icon;
            const isBuy = rec.direction === 'BUY';
            const isPositive = rec.pnlPct > 0;
            const isNegative = rec.pnlPct < 0;
            const isLockedActive = !isTerminalSignalStatus(rec.status);
            const verificationStatus = deriveSignalVerificationStatus(rec);
            const postureLabel =
              rec.executionPosture === 'enter_now'
                ? 'Enter Now'
                : rec.executionPosture === 'limit_pullback_only'
                  ? 'Limit Pullback'
                  : rec.executionPosture === 'armed_limit'
                    ? 'Armed Limit'
                    : rec.filledOnFirstSight
                      ? 'Enter Now'
                      : 'Limit Pullback';

            const overlays: ChartTradeOverlays = {
              symbolLabel: `${rec.symbol} (${badge.shortLabel})`,
              direction: rec.direction,
              entryLow: rec.entryLow,
              entryHigh: rec.entryHigh,
              stopLoss: rec.stopLoss,
              tp1: rec.tp1,
              tp2: rec.tp2,
            };

            const builtInAssetId =
              rec.assetClass === 'crypto' || rec.assetClass === 'commodity'
                ? rec.assetId
                : undefined;

            const isEditingNote = editingNoteId === rec.id;

            return (
              <div
                key={rec.id}
                data-testid="signal-history-row"
                className="liquid-glass-inset rounded-xl p-3 sm:p-3.5 transition-colors hover:border-[#1D4ED8]/35 dark:hover:border-[#2962FF]/45"
              >
                {/* Row Top: Identity + Badges + P&L */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold tracking-wide ${
                        isBuy
                          ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/35'
                          : 'bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/35'
                      }`}
                    >
                      {isBuy ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {rec.direction}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        onInspectSignal(
                          rec.assetId,
                          builtInAssetId,
                          overlays,
                          (rec.timeframe as Timeframe) || '1D'
                        )
                      }
                      className="inline-flex items-center gap-1.5 text-sm sm:text-[15px] font-extrabold text-[#0A2540] dark:text-[#F8FAFC] hover:text-[#1D4ED8] dark:hover:text-[#60A5FA] transition-colors cursor-pointer"
                    >
                      <span>{rec.symbol}</span>
                      <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                    </button>

                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-black/[0.05] dark:bg-white/[0.07] text-[#334155] dark:text-[#CBD5E1]">
                      {ENGINE_LABELS[rec.sourceEngine]} · {rec.timeframe}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${badge.className}`}
                    >
                      <BadgeIcon className="w-3 h-3" />
                      {badge.label}
                    </span>

                    <span
                      data-testid="signal-zone-fill-badge"
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        verificationStatus === 'Verified'
                          ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                          : verificationStatus === 'Pending'
                            ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30'
                            : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25'
                      }`}
                    >
                      {isLockedActive && <Lock className="w-2.5 h-2.5" />}
                      {verificationStatus === 'Verified'
                        ? `Verified · ${postureLabel}`
                        : verificationStatus === 'Pending'
                          ? `Monitoring Zone · ${postureLabel}`
                          : `Expired Unfilled · ${postureLabel}`}
                    </span>
                  </div>

                  {/* Right: P&L + R-Multiple + Delete */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-left sm:text-right">
                      <div
                        className={`num-table font-extrabold ${
                          rec.status === 'PENDING_LIMIT' || rec.status === 'EXPIRED'
                            ? 'text-[#526375] dark:text-[#94A3B8]'
                            : isPositive
                              ? 'text-[#0F7638] dark:text-[#34D399]'
                              : isNegative
                                ? 'text-[#B91C1C] dark:text-[#F87171]'
                                : 'text-[#0A2540] dark:text-[#F8FAFC]'
                        }`}
                      >
                        {rec.status === 'PENDING_LIMIT'
                          ? 'Awaiting Fill'
                          : rec.status === 'EXPIRED'
                            ? 'Unfilled'
                            : `${rec.pnlPct > 0 ? '+' : ''}${rec.pnlPct.toFixed(2)}% (${
                                rec.rMultiple > 0 ? '+' : ''
                              }${rec.rMultiple.toFixed(2)}R)`}
                      </div>
                      <div className="text-[11px] text-[#526375] dark:text-[#94A3B8]">
                        Locked {formatWibTime(rec.createdAtMs)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteSignal(rec.id)}
                      aria-label={`Remove ${rec.symbol} signal from ledger`}
                      title="Remove from ledger"
                      className="p-2 rounded-lg text-[#526375] dark:text-[#94A3B8] hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Locked Setup Parameters Continuity Strip */}
                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                  <div className="rounded-lg bg-white/70 dark:bg-[#131722]/90 px-2.5 py-1.5 border border-black/6 dark:border-white/8">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#526375] dark:text-[#94A3B8]">
                      1st Shown → Live
                    </div>
                    <div className="mt-0.5 num-delta font-bold text-[#0A2540] dark:text-[#F0F3FA] truncate">
                      {formatSignalPrice(rec.firstShownPrice, rec.currency, rec.decimals)} →{' '}
                      {formatSignalPrice(
                        rec.closedPrice ?? rec.lastPrice,
                        rec.currency,
                        rec.decimals
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/70 dark:bg-[#131722]/90 px-2.5 py-1.5 border border-black/6 dark:border-white/8">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#526375] dark:text-[#94A3B8]">
                      Entry Zone ({rec.timeframe})
                    </div>
                    <div className="mt-0.5 num-delta font-bold text-[#0A2540] dark:text-[#F0F3FA] truncate">
                      {formatSignalPrice(rec.entryLow, rec.currency, rec.decimals)}–
                      {formatSignalPrice(rec.entryHigh, rec.currency, rec.decimals)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/70 dark:bg-[#131722]/90 px-2.5 py-1.5 border border-rose-500/20">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                      Stop Loss
                    </div>
                    <div className="mt-0.5 num-delta font-bold text-rose-700 dark:text-rose-300">
                      {formatSignalPrice(rec.stopLoss, rec.currency, rec.decimals)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/70 dark:bg-[#131722]/90 px-2.5 py-1.5 border border-emerald-500/20">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                      TP1 (SL→BE)
                    </div>
                    <div className="mt-0.5 num-delta font-bold text-emerald-800 dark:text-emerald-300">
                      {formatSignalPrice(rec.tp1, rec.currency, rec.decimals)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/70 dark:bg-[#131722]/90 px-2.5 py-1.5 border border-emerald-500/25">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                      TP2 Target
                    </div>
                    <div className="mt-0.5 num-delta font-bold text-emerald-800 dark:text-emerald-300">
                      {formatSignalPrice(rec.tp2, rec.currency, rec.decimals)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/70 dark:bg-[#131722]/90 px-2.5 py-1.5 border border-black/6 dark:border-white/8">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#526375] dark:text-[#94A3B8]">
                      R:R · Confidence
                    </div>
                    <div className="mt-0.5 text-[11px] font-bold text-[#0A2540] dark:text-[#F0F3FA] truncate">
                      {rec.riskReward} · {rec.confidence}%
                    </div>
                  </div>
                </div>

                {/* Automated Trade Journal Bar: Captured Strategy + 1-Click Win/Loss Outcome & Note */}
                <div
                  data-testid="trade-journal-bar"
                  className="mt-2.5 pt-2.5 border-t border-black/8 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0 text-[11px]">
                    <span className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider text-[10px] text-[#1D4ED8] dark:text-[#60A5FA] shrink-0">
                      <BookOpen className="w-3 h-3" />
                      Setup Captured:
                    </span>
                    <span className="font-semibold text-[#1C1C1E] dark:text-[#E2E8F0] truncate max-w-[340px]">
                      {rec.strategyTag}
                    </span>
                    {rec.userOutcome && (
                      <span
                        data-testid="journal-annotated-badge"
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black uppercase ${
                          rec.userOutcome === 'WIN'
                            ? 'bg-emerald-500/18 text-emerald-800 dark:text-emerald-300'
                            : rec.userOutcome === 'LOSS'
                              ? 'bg-rose-500/18 text-rose-800 dark:text-rose-300'
                              : rec.userOutcome === 'BE'
                                ? 'bg-amber-500/18 text-amber-800 dark:text-amber-300'
                                : 'bg-slate-500/18 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        Journaled: {rec.userOutcome}
                      </span>
                    )}
                  </div>

                  {onAnnotateSignal && (
                    <div className="flex flex-wrap items-center gap-1 shrink-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#526375] dark:text-[#94A3B8] mr-0.5">
                        My Trade:
                      </span>
                      {JOURNAL_OUTCOME_BUTTONS.map((btn) => {
                        const isSelected = rec.userOutcome === btn.id;
                        return (
                          <button
                            key={btn.id}
                            type="button"
                            data-testid={btn.testId}
                            aria-pressed={isSelected}
                            onClick={() =>
                              onAnnotateSignal(rec.id, isSelected ? null : btn.id)
                            }
                            className={`px-2 py-0.5 rounded-md border text-[10.5px] font-extrabold transition-colors cursor-pointer ${
                              isSelected
                                ? btn.activeClass
                                : 'bg-black/[0.04] dark:bg-white/[0.06] border-black/10 dark:border-white/12 text-[#334155] dark:text-[#CBD5E1] hover:text-[#0A2540] dark:hover:text-white'
                            }`}
                          >
                            {btn.label}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        data-testid="journal-btn-note"
                        onClick={() => openNoteEditor(rec)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-bold transition-colors cursor-pointer ${
                          isEditingNote || rec.journalNote
                            ? 'bg-[#1D4ED8]/12 dark:bg-[#2962FF]/20 border-[#1D4ED8]/35 text-[#1D4ED8] dark:text-[#93C5FD]'
                            : 'bg-black/[0.04] dark:bg-white/[0.06] border-black/10 dark:border-white/12 text-[#425466] dark:text-[#94A3B8] hover:text-[#0A2540] dark:hover:text-white'
                        }`}
                      >
                        <MessageSquarePlus className="w-3 h-3" />
                        <span>{rec.journalNote ? 'Edit Note' : 'Note'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Saved Journal Note Display */}
                {!isEditingNote && rec.journalNote && (
                  <div
                    data-testid="journal-saved-note"
                    className="mt-2 px-2.5 py-1.5 rounded-lg bg-[#1D4ED8]/[0.05] dark:bg-[#2962FF]/[0.08] border border-[#1D4ED8]/15 dark:border-[#2962FF]/20 text-[11.5px] text-[#334155] dark:text-[#CBD5E1] italic"
                  >
                    &ldquo;{rec.journalNote}&rdquo;
                  </div>
                )}

                {/* Inline Journal Note Editor */}
                {isEditingNote && onAnnotateSignal && (
                  <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      maxLength={300}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveNote(rec);
                        }
                      }}
                      placeholder="Add execution review note (e.g. Filled on 15m FVG CE, scaled 50% at TP1)..."
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-[#0F172A] border border-black/15 dark:border-white/15 text-[#0A2540] dark:text-[#F8FAFC] focus:outline-none focus:border-[#1D4ED8] dark:focus:border-[#38BDF8]"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSaveNote(rec)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1D4ED8] dark:bg-[#2962FF] text-white text-xs font-bold hover:brightness-110 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Save Note
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNoteId(null);
                          setNoteDraft('');
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#425466] dark:text-[#94A3B8] hover:text-[#0A2540] dark:hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredRecords.length > 12 && (
            <button
              type="button"
              onClick={() => setShowAllRows((prev) => !prev)}
              className="w-full py-2.5 rounded-xl text-xs font-bold border border-black/10 dark:border-white/15 text-[#1D4ED8] dark:text-[#60A5FA] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              {showAllRows
                ? 'Show Recent 12 Signals'
                : `Show All ${filteredRecords.length} Tracked Signals`}
            </button>
          )}
        </div>
      )}
    </section>
  );
};
