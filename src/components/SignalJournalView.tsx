import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Cloud,
  CloudOff,
  Crosshair,
  DatabaseZap,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { CloudSignalEngineStatus } from '../hooks/useSignalHistory';
import { SignalVerificationMetrics } from '../hooks/useSignalVerification';
import {
  AppRoute,
  ChartTradeOverlays,
  SignalHistoryRecord,
  SignalUserOutcome,
  Timeframe,
} from '../types/market';
import {
  SignalHistoryStats,
  computeSignalHistoryStats,
  isUnfilledExpiredSignal,
  normalizeSignalStatus,
} from '../utils/signalHistoryEngine';
import { JournalSummaryCard } from './JournalSummaryCard';
import {
  SignalHistoryPanel,
  SignalJournalCategoryFilter,
  SignalJournalStatusFilter,
} from './SignalHistoryPanel';

export interface SignalJournalViewProps {
  records: SignalHistoryRecord[];
  stats: SignalHistoryStats;
  cloudSynced: boolean;
  cloudEngineStatus: CloudSignalEngineStatus;
  verificationMetrics?: SignalVerificationMetrics;
  onTriggerCloudScan: () => Promise<void>;
  onRefreshDatabase?: () => Promise<void>;
  onAnnotateSignal: (
    signalId: string,
    outcome: SignalUserOutcome | null,
    journalNote?: string
  ) => void;
  onDeleteSignal: (id: string) => void;
  onClearClosedSignals: () => void;
  onInspectSignal: (
    yahooSymbol: string,
    builtInAssetId?: string,
    overlays?: ChartTradeOverlays | null,
    initialTf?: Timeframe
  ) => void;
  onNavigate: (route: AppRoute) => void;
}

type JournalPathKey = 'all' | 'stocks' | 'idx' | 'us' | 'xau' | 'btc';

interface InstrumentSessionBadge {
  key: 'btc' | 'xau' | 'idx' | 'us';
  label: string;
  isOpen: boolean;
  windowLabel: string;
}

function getInstrumentMarketSessions(nowMs: number = Date.now()): InstrumentSessionBadge[] {
  const now = new Date(nowMs);
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();

  const xauOpen =
    (utcDay >= 1 && utcDay <= 4) ||
    (utcDay === 0 && utcHour >= 22) ||
    (utcDay === 5 && utcHour < 22);

  const wibParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const wibWeekday = wibParts.find((p) => p.type === 'weekday')?.value ?? '';
  const wibHour = Number(wibParts.find((p) => p.type === 'hour')?.value ?? '0');
  const wibMin = Number(wibParts.find((p) => p.type === 'minute')?.value ?? '0');
  const wibTotalMin = wibHour * 60 + wibMin;
  const idxOpen =
    !['Sat', 'Sun'].includes(wibWeekday) && wibTotalMin >= 9 * 60 && wibTotalMin <= 16 * 60;

  const nyParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const nyWeekday = nyParts.find((p) => p.type === 'weekday')?.value ?? '';
  const nyHour = Number(nyParts.find((p) => p.type === 'hour')?.value ?? '0');
  const nyMin = Number(nyParts.find((p) => p.type === 'minute')?.value ?? '0');
  const nyTotalMin = nyHour * 60 + nyMin;
  const usOpen =
    !['Sat', 'Sun'].includes(nyWeekday) && nyTotalMin >= 9 * 60 + 30 && nyTotalMin <= 16 * 60;

  return [
    { key: 'btc', label: 'BTC', isOpen: true, windowLabel: '24/7' },
    { key: 'xau', label: 'XAU', isOpen: xauOpen, windowLabel: xauOpen ? 'Open' : 'Closed' },
    { key: 'idx', label: 'IDX', isOpen: idxOpen, windowLabel: idxOpen ? 'Open' : 'Closed' },
    { key: 'us', label: 'US', isOpen: usOpen, windowLabel: usOpen ? 'Open' : 'Closed' },
  ];
}

function matchesJournalPath(rec: SignalHistoryRecord, path: JournalPathKey): boolean {
  if (path === 'all') return true;
  if (path === 'stocks') return rec.assetClass === 'stock_id' || rec.assetClass === 'stock_us';
  if (path === 'idx') return rec.sourceEngine === 'idx_scanner' || rec.assetClass === 'stock_id';
  if (path === 'us') return rec.sourceEngine === 'us_scanner' || rec.assetClass === 'stock_us';
  if (path === 'xau') return rec.symbol === 'XAUUSD' || rec.assetId === 'XAUUSD';
  if (path === 'btc') return rec.symbol === 'BTCUSD' || rec.assetId === 'BTCUSD';
  return true;
}

function formatWibClockShort(ts: number | null): string {
  if (!ts || !Number.isFinite(ts)) return 'Syncing';
  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts))} WIB`;
}

const PATH_TABS: {
  id: JournalPathKey;
  label: string;
  shortLabel: string;
  subtitle: string;
}[] = [
  {
    id: 'all',
    label: 'All Signals',
    shortLabel: 'All',
    subtitle: 'Unified non-overlay ledger across Stocks (7D), XAU/USD & BTC/USD',
  },
  {
    id: 'stocks',
    label: 'Stocks (7D)',
    shortLabel: 'Stocks 7D',
    subtitle: 'Past 7 working days IDX & US equity signals (RSI-2 / 2-Day Pullback + Trailing BE / EMA5 Exit)',
  },
  {
    id: 'idx',
    label: 'IDX (7D)',
    shortLabel: 'IDX 7D',
    subtitle: 'Past 7 working days Indonesian equities verified bar-by-bar',
  },
  {
    id: 'us',
    label: 'US (7D)',
    shortLabel: 'US 7D',
    subtitle: 'Past 7 working days US mega-cap leaders verified bar-by-bar',
  },
  {
    id: 'xau',
    label: 'XAU / USD',
    shortLabel: 'XAU',
    subtitle: 'Fresh today spot gold ICT 2022 & SMC S&D fills (5m–4H)',
  },
  {
    id: 'btc',
    label: 'BTC / USD',
    shortLabel: 'BTC',
    subtitle: 'Fresh today 24/7 Bitcoin ICT 2022 & SMC S&D fills (5m–4H)',
  },
];

export const SignalJournalView: React.FC<SignalJournalViewProps> = ({
  records,
  cloudSynced,
  cloudEngineStatus,
  verificationMetrics,
  onTriggerCloudScan,
  onRefreshDatabase,
  onAnnotateSignal,
  onDeleteSignal,
  onClearClosedSignals,
  onInspectSignal,
  onNavigate,
}) => {
  const [activePath, setActivePath] = useState<JournalPathKey>('all');
  const [statusFilter, setStatusFilter] = useState<SignalJournalStatusFilter>('all');
  const [scanning, setScanning] = useState(false);
  const [refreshingDb, setRefreshingDb] = useState(false);

  const visibleRecords = useMemo(
    () => records.filter((rec) => !isUnfilledExpiredSignal(rec)),
    [records]
  );

  const pathCounts = useMemo(() => {
    const counts: Record<JournalPathKey, { total: number; active: number }> = {
      all: { total: 0, active: 0 },
      stocks: { total: 0, active: 0 },
      idx: { total: 0, active: 0 },
      us: { total: 0, active: 0 },
      xau: { total: 0, active: 0 },
      btc: { total: 0, active: 0 },
    };
    for (const rec of visibleRecords) {
      const st = normalizeSignalStatus(rec.status);
      const isActive = st === 'FILLED' || st === 'PENDING';
      counts.all.total += 1;
      if (isActive) counts.all.active += 1;

      if (matchesJournalPath(rec, 'idx')) {
        counts.idx.total += 1;
        counts.stocks.total += 1;
        if (isActive) {
          counts.idx.active += 1;
          counts.stocks.active += 1;
        }
      } else if (matchesJournalPath(rec, 'us')) {
        counts.us.total += 1;
        counts.stocks.total += 1;
        if (isActive) {
          counts.us.active += 1;
          counts.stocks.active += 1;
        }
      } else if (matchesJournalPath(rec, 'xau')) {
        counts.xau.total += 1;
        if (isActive) counts.xau.active += 1;
      } else if (matchesJournalPath(rec, 'btc')) {
        counts.btc.total += 1;
        if (isActive) counts.btc.active += 1;
      }
    }
    return counts;
  }, [visibleRecords]);

  const scopedRecords = useMemo(
    () => visibleRecords.filter((rec) => matchesJournalPath(rec, activePath)),
    [visibleRecords, activePath]
  );

  const scopedStats = useMemo(
    () => computeSignalHistoryStats(scopedRecords),
    [scopedRecords]
  );

  const stocks7dRecords = useMemo(
    () => visibleRecords.filter((rec) => rec.assetClass === 'stock_id' || rec.assetClass === 'stock_us'),
    [visibleRecords]
  );

  const sessions = useMemo(
    () => getInstrumentMarketSessions(cloudEngineStatus.lastScanAtMs ?? Date.now()),
    [cloudEngineStatus.lastScanAtMs]
  );

  const activeTabMeta = PATH_TABS.find((t) => t.id === activePath) ?? PATH_TABS[0];

  const handleManualScan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      await onTriggerCloudScan();
    } finally {
      setScanning(false);
    }
  };

  const handleRefreshDb = async () => {
    if (refreshingDb || !onRefreshDatabase) return;
    setRefreshingDb(true);
    try {
      await onRefreshDatabase();
    } finally {
      setRefreshingDb(false);
    }
  };

  return (
    <div
      data-testid="signal-journal-view"
      className="w-full max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 py-3 sm:py-5 pb-24 lg:pb-8 space-y-3.5 sm:space-y-4"
    >
      {/* 1. Mobile-First Compact Header + Actions */}
      <section className="liquid-glass-card rounded-2xl border border-[var(--border-subtle)] p-3.5 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--accent-primary)] shrink-0" />
              <h1 className="text-base sm:text-xl font-black tracking-tight text-[var(--text-primary)]">
                Signal Performance &amp; Journal
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--text-muted)]">
                {cloudSynced ? (
                  <>
                    <Cloud className="w-3.5 h-3.5 text-[var(--gain-text)]" />
                    <span>Cloud Synced</span>
                  </>
                ) : (
                  <>
                    <CloudOff className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>24H Server Ledger</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-snug">
              Locked on first trigger · No overlays · Exits strictly on TP, SL, Trailing BE, or Strategy Exit.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleManualScan}
              disabled={scanning}
              className="flex-1 sm:flex-none min-h-[42px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--accent-primary)] text-white monochrome:text-black hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {scanning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>{scanning ? 'Scanning...' : 'Scan 24H'}</span>
            </button>

            {onRefreshDatabase && (
              <button
                type="button"
                onClick={handleRefreshDb}
                disabled={refreshingDb}
                title="Recalibrate & rebuild 7-day stock history and today's fresh signals"
                className="flex-1 sm:flex-none min-h-[42px] sm:min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] disabled:opacity-60 transition-colors"
              >
                {refreshingDb ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <DatabaseZap className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                )}
                <span>{refreshingDb ? 'Refreshing...' : 'Refresh DB'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('ict')}
              className="hidden sm:inline-flex min-h-[36px] items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>ICT Radar</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('stocks')}
              className="hidden sm:inline-flex min-h-[36px] items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Stocks</span>
            </button>
          </div>
        </div>

        {/* Clean Unboxed Session Status Row */}
        <div className="pt-2.5 border-t border-[var(--border-divider)] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
          <div className="flex items-center gap-x-3.5 gap-y-1 flex-wrap">
            {sessions.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1">
                <strong className="text-[var(--text-primary)]">{s.label}</strong>
                <span className={s.isOpen ? 'text-[var(--gain-text)] font-bold' : 'text-[var(--text-muted)]'}>
                  {s.windowLabel}
                </span>
              </span>
            ))}
          </div>
          <span className="inline-flex items-center gap-1 text-[var(--text-muted)] tabular-nums">
            <Activity className="w-3 h-3" />
            <span>Scan {formatWibClockShort(cloudEngineStatus.lastScanAtMs)}</span>
          </span>
        </div>
      </section>

      {/* 2. Thumb-Friendly Horizontal Instrument Path Switcher (>= 44px touch height) */}
      <nav
        aria-label="Signal Journal Instrument Paths"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 sm:grid sm:grid-cols-6 sm:overflow-visible"
      >
        {PATH_TABS.map((tab) => {
          const isSelected = activePath === tab.id;
          const count = pathCounts[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActivePath(tab.id)}
              className={`min-h-[46px] shrink-0 px-3.5 py-2 rounded-xl border text-left transition-all whitespace-nowrap ${
                isSelected
                  ? 'bg-[var(--accent-primary)] text-white monochrome:text-black border-transparent shadow-sm'
                  : 'liquid-glass-card border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold">{tab.shortLabel}</span>
                <span
                  className={`font-mono text-xs font-black tabular-nums ${
                    isSelected ? 'opacity-90' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {count.total}
                </span>
              </div>
              <div
                className={`text-[10px] font-mono tabular-nums mt-0.5 ${
                  isSelected ? 'opacity-80' : 'text-[var(--text-muted)]'
                }`}
              >
                {count.active > 0 ? `${count.active} live` : 'Verified'}
              </div>
            </button>
          );
        })}
      </nav>

      {/* 3. Dynamic Journal Summary Component (Win Rate, Total P&L, Average R:R, 7D Stocks Track Record) */}
      <JournalSummaryCard
        records={scopedRecords}
        scopeLabel={activeTabMeta.shortLabel}
        stocks7dRecords={stocks7dRecords}
        activePath={activePath}
        onSelectPath={(path) => setActivePath(path)}
      />

      {/* 4. Mobile-First Signal Ledger with Active/Pending/Closed Filtering Bar & Expandable Detail Sheet */}
      <SignalHistoryPanel
        records={visibleRecords}
        stats={scopedStats}
        cloudSynced={cloudSynced}
        verificationMetrics={verificationMetrics}
        defaultCategory={activePath as SignalJournalCategoryFilter}
        hideCategoryFilter={true}
        hideSummaryHeader={true}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        title={`${activeTabMeta.label} Ledger`}
        subtitle={`${activeTabMeta.subtitle} · Tap any signal for Entry, Exit & SL details`}
        onInspectSignal={(yahooSym, builtInId, overlays, tf) =>
          onInspectSignal(yahooSym, builtInId, overlays, tf)
        }
        onAnnotateSignal={onAnnotateSignal}
        onDeleteSignal={onDeleteSignal}
        onClearClosedSignals={onClearClosedSignals}
      />
    </div>
  );
};
