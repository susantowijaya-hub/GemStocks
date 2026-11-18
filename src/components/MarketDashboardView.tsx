import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  LineChart,
  Newspaper,
  TrendingUp,
} from 'lucide-react';
import { CATEGORY_META } from '../data/marketData';
import {
  AppRoute,
  CalendarCatalyst,
  EconomicEvent,
  MarketAsset,
  NewsStory,
  Timeframe,
  WatchlistCategory,
} from '../types/market';
import {
  formatAssetPrevClose,
  formatAssetPrice,
  formatChangeBadge,
  formatFullDelta,
} from '../utils/formatters';
import { getAssetSessionStatus } from '../utils/marketSessions';
import { InteractiveChart } from './InteractiveChart';

interface MarketDashboardViewProps {
  assets: MarketAsset[];
  newsStories: NewsStory[];
  economicEvents: EconomicEvent[];
  nextCatalyst: CalendarCatalyst | null;
  selectedAssetId: string;
  onSelectAsset: (id: string) => void;
  searchQuery: string;
  isPercentMode: boolean;
  onToggleBadgeMode: () => void;
  flashMap: Record<string, 'gain' | 'loss'>;
  onOpenStory: (story: NewsStory) => void;
  onNavigate: (route: AppRoute) => void;
  onLoadTimeframe?: (assetId: string, tf: Timeframe) => void;
  countdownSeconds: number;
}

type MobileSubTab = 'chart' | 'watchlist' | 'news' | 'calendar';

function SparklineSvg({
  points,
  isGain,
  className = 'w-16 h-6',
}: {
  points: number[];
  isGain: boolean;
  className?: string;
}) {
  const path = useMemo(() => {
    const w = 60;
    const h = 20;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    return points
      .map((val, idx) => {
        const x = (idx / Math.max(points.length - 1, 1)) * w;
        const y = 2 + ((val - min) / span) * (h - 4);
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points]);

  return (
    <svg className={className} viewBox="0 0 60 20" preserveAspectRatio="none">
      <path
        d={path}
        fill="none"
        stroke={isGain ? '#30D158' : '#FF453A'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatCountdown(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

export const MarketDashboardView: React.FC<MarketDashboardViewProps> = ({
  assets,
  newsStories,
  economicEvents,
  nextCatalyst,
  selectedAssetId,
  onSelectAsset,
  searchQuery,
  isPercentMode,
  onToggleBadgeMode,
  flashMap,
  onOpenStory,
  onNavigate,
  onLoadTimeframe,
  countdownSeconds,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [mobileTab, setMobileTab] = useState<MobileSubTab>('chart');
  const [openGroups, setOpenGroups] = useState<Record<WatchlistCategory, boolean>>({
    'us-indices': true,
    'asia-indices': true,
    'commodities-crypto': true,
    'forex-yields': true,
  });
  const [calDayFilter, setCalDayFilter] = useState<'today' | 'tomorrow' | 'week'>('today');
  const [highOnly, setHighOnly] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // When searching on mobile, switch to watchlist if user is on chart tab
  useEffect(() => {
    if (searchQuery.trim().length > 0 && mobileTab === 'chart') {
      setMobileTab('watchlist');
    }
  }, [searchQuery, mobileTab]);

  const activeAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? assets[0],
    [assets, selectedAssetId]
  );

  const activeSession = useMemo(
    () => getAssetSessionStatus(activeAsset.id, activeAsset.category, now),
    [activeAsset.id, activeAsset.category, now]
  );

  const yieldCurveInfo = useMemo(() => {
    const us10y = assets.find((a) => a.id === 'US10Y');
    const us30y = assets.find((a) => a.id === 'US30Y');
    const id10y = assets.find((a) => a.id === 'ID10Y');
    const spreadBps = ((us30y?.price ?? 4.62) - (us10y?.price ?? 4.44)) * 100;
    const prevSpreadBps = ((us30y?.prevClose ?? 4.61) - (us10y?.prevClose ?? 4.45)) * 100;
    const deltaBps = spreadBps - prevSpreadBps;
    const posture =
      spreadBps < 0 ? 'Inverted' : deltaBps >= 0.3 ? 'Steepening' : deltaBps <= -0.3 ? 'Flattening' : 'Steady';
    const idUsSpreadBps = ((id10y?.price ?? 7.607) - (us10y?.price ?? 4.44)) * 100;
    return {
      spreadBps,
      posture,
      us10yVal: us10y?.price.toFixed(3) ?? '—',
      us30yVal: us30y?.price.toFixed(3) ?? '—',
      id10yVal: id10y?.price.toFixed(3) ?? '—',
      idUsSpreadBps,
    };
  }, [assets]);

  const snapshotAssets = useMemo(
    () => assets.filter((a) => a.isSnapshotTile),
    [assets]
  );

  const filteredAssets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return assets;
    return assets.filter(
      (a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.shortName.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.categoryLabel.toLowerCase().includes(q)
    );
  }, [assets, searchQuery]);

  const allCollapsed = Object.values(openGroups).every((v) => !v);

  const toggleAllGroups = () => {
    const next = allCollapsed;
    setOpenGroups({
      'us-indices': next,
      'asia-indices': next,
      'commodities-crypto': next,
      'forex-yields': next,
    });
  };

  useEffect(() => {
    if (onLoadTimeframe && activeAsset?.id) {
      onLoadTimeframe(activeAsset.id, timeframe);
    }
  }, [activeAsset?.id, timeframe, onLoadTimeframe]);

  const filteredEvents = useMemo(() => {
    return economicEvents.filter((ev) => {
      const matchDay = calDayFilter === 'week' ? true : ev.day === calDayFilter;
      const matchImpact = highOnly ? ev.impact === 'HIGH' : true;
      return matchDay && matchImpact;
    });
  }, [economicEvents, calDayFilter, highOnly]);

  const handleSelectRow = (id: string) => {
    onSelectAsset(id);
    setMobileTab('chart');
  };

  const renderWatchlistContent = () => (
    <div className="divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E]/60">
      {CATEGORY_META.map((cat) => {
        const rows = filteredAssets.filter((a) => a.category === cat.id);
        if (rows.length === 0 && searchQuery.trim()) return null;
        const isOpen = searchQuery.trim() ? true : openGroups[cat.id];

        return (
          <div key={cat.id}>
            <button
              type="button"
              onClick={() =>
                setOpenGroups((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))
              }
              className="w-full px-4 py-2.5 bg-[#E5E5EA]/40 dark:bg-[#1C1C1E]/50 hover:bg-[#E5E5EA]/80 dark:hover:bg-[#1C1C1E] flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#8E8E93] transition-colors"
            >
              <span className="flex items-center gap-1.5">
                {isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                <span>{cat.label}</span>
              </span>
              <span className="text-[11px] font-mono tabular-nums">{rows.length}</span>
            </button>

            {isOpen && (
              <div className="divide-y divide-[#E5E5EA]/70 dark:divide-[#2C2C2E]/30">
                {rows.map((asset) => {
                  const isActive = asset.id === activeAsset.id;
                  const isGain = asset.changePercent >= 0;
                  const flash = flashMap[asset.id];
                  return (
                    <div
                      key={asset.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectRow(asset.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectRow(asset.id);
                        }
                      }}
                      className={`cursor-pointer px-4 py-3 flex items-center justify-between gap-2 transition-colors min-h-[56px] ${
                        isActive
                          ? 'bg-[#0071E3]/10 dark:bg-[#1C1C1E]'
                          : 'hover:bg-[#E5E5EA]/50 dark:hover:bg-[#1C1C1E]/50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-sm text-[#1C1C1E] dark:text-white truncate">
                            {asset.symbol}
                          </p>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] dark:bg-[#0A84FF] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93] truncate">
                          {asset.shortName}
                        </p>
                      </div>

                      <SparklineSvg points={asset.sparklinePoints} isGain={isGain} />

                      <div className="text-right shrink-0">
                        <p
                          className={`text-xs font-bold tabular-nums font-mono transition-colors ${
                            flash === 'gain'
                              ? 'text-[#16803C] dark:text-[#30D158]'
                              : flash === 'loss'
                                ? 'text-[#D7261C] dark:text-[#FF453A]'
                                : 'text-[#1C1C1E] dark:text-white'
                          }`}
                        >
                          {formatAssetPrice(asset)}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleBadgeMode();
                          }}
                          className={`mt-1 inline-flex items-center justify-center min-w-[64px] px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums font-mono transition-colors ${
                            isGain
                              ? 'bg-[#30D158] text-black'
                              : 'bg-[#FF453A] text-white'
                          }`}
                        >
                          {formatChangeBadge(asset, isPercentMode)}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {filteredAssets.length === 0 && (
        <div className="p-8 text-center text-xs text-[#6C6C70] dark:text-[#8E8E93]">
          No assets match "{searchQuery}".
        </div>
      )}
    </div>
  );

  const renderChartAndAnalysis = () => {
    const isGain = activeAsset.changePercent >= 0;
    const flash = flashMap[activeAsset.id];

    return (
      <div className="flex flex-col gap-5">
        {/* Asset Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white">
                {activeAsset.symbol}
              </h1>
              <span className="text-xs font-medium text-[#6C6C70] dark:text-[#8E8E93]">
                {activeAsset.exchange}
              </span>
              {activeAsset.liveStreamable && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#16803C] dark:text-[#30D158]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
                  Live Stream
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-[#6C6C70] dark:text-[#8E8E93] mt-0.5">
              {activeAsset.name}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div
              className={`text-2xl sm:text-3xl font-extrabold tabular-nums font-mono tracking-tight transition-colors ${
                flash === 'gain'
                  ? 'text-[#16803C] dark:text-[#30D158]'
                  : flash === 'loss'
                    ? 'text-[#D7261C] dark:text-[#FF453A]'
                    : 'text-[#1C1C1E] dark:text-white'
              }`}
            >
              {formatAssetPrice(activeAsset)}
            </div>
            <div className="flex flex-wrap items-center sm:justify-end gap-2 mt-1">
              <span
                className={`font-bold text-xs sm:text-sm tabular-nums font-mono ${
                  isGain
                    ? 'text-[#16803C] dark:text-[#30D158]'
                    : 'text-[#D7261C] dark:text-[#FF453A]'
                }`}
              >
                {formatFullDelta(activeAsset)}
              </span>
              <span
                title={activeSession.detail}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  activeSession.tone === 'open'
                    ? 'bg-[#30D158]/15 text-[#16803C] dark:text-[#30D158]'
                    : activeSession.tone === 'extended' || activeSession.tone === 'break'
                      ? 'bg-[#FF9F0A]/15 text-[#B25E09] dark:text-[#FF9F0A]'
                      : 'bg-[#E5E5EA] dark:bg-[#2C2C2E] text-[#6C6C70] dark:text-[#8E8E93]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    activeSession.tone === 'open'
                      ? 'bg-[#30D158]'
                      : activeSession.tone === 'extended' || activeSession.tone === 'break'
                        ? 'bg-[#FF9F0A]'
                        : 'bg-[#8E8E93]'
                  }`}
                />
                {activeSession.shortLabel}: {activeSession.stateLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Chart */}
        <InteractiveChart
          asset={activeAsset}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
        />

        {/* Key Statistics Grid */}
        <div className="rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#E5E5EA] dark:border-[#2C2C2E]/70 pb-2.5">
            <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
              Key Statistics
            </h2>
            <span className="text-xs text-[#6C6C70] dark:text-[#8E8E93] font-medium tabular-nums">
              {activeAsset.updatedAtEpoch
                ? `Updated ${new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'Asia/Jakarta',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  }).format(new Date(activeAsset.updatedAtEpoch))} WIB`
                : 'Session Snapshot'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">Open</span>
              <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                {activeAsset.open}
              </p>
            </div>
            <div>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">Prev Close</span>
              <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                {formatAssetPrevClose(activeAsset)}
              </p>
            </div>
            <div>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">Day High</span>
              <p className="font-bold text-sm text-[#16803C] dark:text-[#30D158] tabular-nums font-mono mt-0.5">
                {activeAsset.dayHigh}
              </p>
            </div>
            <div>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">Day Low</span>
              <p className="font-bold text-sm text-[#D7261C] dark:text-[#FF453A] tabular-nums font-mono mt-0.5">
                {activeAsset.dayLow}
              </p>
            </div>
            <div>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">Volume</span>
              <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                {activeAsset.volume}
              </p>
            </div>
            <div>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">
                {activeAsset.avgVolLabel || 'Intraday Spread'}
              </span>
              <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                {activeAsset.avgVol}
              </p>
            </div>
            <div>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">{activeAsset.peLabel}</span>
              <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                {activeAsset.peValue}
              </p>
            </div>
            <div>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">{activeAsset.capLabel}</span>
              <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                {activeAsset.capValue}
              </p>
            </div>
          </div>

          {/* 52-Week Range Progress Bar */}
          <div className="pt-3 border-t border-[#E5E5EA] dark:border-[#2C2C2E]/60">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[#6C6C70] dark:text-[#8E8E93] font-medium">
                52-Week Range
              </span>
              <span className="font-bold text-[#1C1C1E] dark:text-white tabular-nums font-mono">
                {activeAsset.w52Low} — {activeAsset.w52High}
              </span>
            </div>
            <div className="relative w-full h-2 rounded-full bg-[#E5E5EA] dark:bg-[#2C2C2E] overflow-hidden">
              <div
                className="absolute top-0 bottom-0 left-0 rounded-full bg-gradient-to-r from-[#0071E3] dark:from-[#0A84FF] to-[#30D158]"
                style={{ width: `${activeAsset.w52Pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#6C6C70] dark:text-[#8E8E93] mt-1.5 tabular-nums font-mono">
              <span>52W Low: {activeAsset.w52Low}</span>
              <span>52W High: {activeAsset.w52High}</span>
            </div>
          </div>
        </div>

        {/* Market Analysis & Technicals */}
        <article className="rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LineChart className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
              <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
                Market Analysis &amp; Technicals
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  activeAsset.sentiment === 'Bullish'
                    ? 'bg-[#30D158]/15 text-[#16803C] dark:text-[#30D158]'
                    : activeAsset.sentiment === 'Bearish'
                      ? 'bg-[#FF453A]/15 text-[#D7261C] dark:text-[#FF453A]'
                      : 'bg-[#E5E5EA] dark:bg-[#2C2C2E] text-[#6C6C70] dark:text-[#8E8E93]'
                }`}
              >
                {activeAsset.sentiment}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 py-3 border-y border-[#E5E5EA] dark:border-[#2C2C2E]/70">
            <div>
              <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] font-semibold">
                Key Support
              </span>
              <p className="text-base font-extrabold text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                {activeAsset.support}
              </p>
              <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
                {activeAsset.supportNote}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] font-semibold">
                Key Resistance
              </span>
              <p className="text-base font-extrabold text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                {activeAsset.resistance}
              </p>
              <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
                {activeAsset.resistanceNote}
              </span>
            </div>
          </div>

          {activeAsset.isYield && (
            <div className="p-3.5 rounded-xl bg-[#F2F2F7] dark:bg-[#2C2C2E]/60 border border-[#E5E5EA] dark:border-[#38383A] flex flex-col gap-1">
              {activeAsset.id === 'ID10Y' ? (
                <>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-[#1C1C1E] dark:text-white flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
                      Indonesia–US 10Y Sovereign Spread
                    </span>
                    <span className="font-bold font-mono tabular-nums text-[#0071E3] dark:text-[#0A84FF]">
                      {yieldCurveInfo.idUsSpreadBps >= 0 ? '+' : ''}
                      {yieldCurveInfo.idUsSpreadBps.toFixed(1)} bps
                    </span>
                  </div>
                  <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
                    Live sovereign yield differential between Indonesia 10Y SBN ({yieldCurveInfo.id10yVal}%) and US 10Y Treasury ({yieldCurveInfo.us10yVal}%).
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-[#1C1C1E] dark:text-white flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
                      US Yield Curve Spread (30Y vs 10Y)
                    </span>
                    <span
                      className={`font-bold font-mono tabular-nums ${
                        yieldCurveInfo.spreadBps >= 0
                          ? 'text-[#16803C] dark:text-[#30D158]'
                          : 'text-[#D7261C] dark:text-[#FF453A]'
                      }`}
                    >
                      {yieldCurveInfo.spreadBps >= 0 ? '+' : ''}
                      {yieldCurveInfo.spreadBps.toFixed(1)} bps ({yieldCurveInfo.posture})
                    </span>
                  </div>
                  <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
                    Live benchmark differential between US 30Y ({yieldCurveInfo.us30yVal}%) and US 10Y (
                    {yieldCurveInfo.us10yVal}%) Treasury yields.
                  </p>
                </>
              )}
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-[#6C6C70] dark:text-[#8E8E93] mb-1.5">
              Live Session Technical Summary
            </h3>
            <p className="text-sm text-[#1C1C1E] dark:text-[#E5E5EA] leading-relaxed">
              {activeAsset.commentary}
            </p>
          </div>
        </article>
      </div>
    );
  };

  const renderNewsColumn = () => (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-[#D7261C] dark:text-[#FF453A]" />
          <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">Breaking News</h2>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('news')}
          className="text-xs font-semibold text-[#0071E3] dark:text-[#0A84FF] hover:underline"
        >
          View All
        </button>
      </div>

      {newsStories.slice(0, 3).map((story) => (
        <article
          key={story.id}
          onClick={() => onOpenStory(story)}
          className="p-3.5 rounded-2xl bg-white dark:bg-[#1C1C1E] hover:bg-[#E5E5EA]/50 dark:hover:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#2C2C2E] cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between mb-1.5 text-xs">
            <div className="flex items-center gap-2">
              {story.isBreaking && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-[#FF453A] text-white">
                  BREAKING
                </span>
              )}
              <span className="font-bold text-[#1C1C1E] dark:text-white">{story.publisher}</span>
            </div>
            <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">{story.timeAgo}</span>
          </div>
          <h3 className="text-xs font-bold text-[#1C1C1E] dark:text-white leading-snug">
            {story.headline}
          </h3>
          <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] mt-1.5 line-clamp-2 leading-relaxed">
            {story.summary}
          </p>
        </article>
      ))}
    </section>
  );

  const renderCalendarColumn = () => (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[#16803C] dark:text-[#30D158]" />
          <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">Forex Calendar</h2>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('calendar')}
          className="text-xs font-semibold text-[#0071E3] dark:text-[#0A84FF] hover:underline"
        >
          Full Agenda
        </button>
      </div>

      {/* High Impact Countdown Banner */}
      <div className="p-3.5 rounded-2xl bg-[#0071E3]/10 dark:bg-[#0A84FF]/10 border border-[#0071E3]/25 dark:border-[#0A84FF]/30 flex items-center justify-between gap-2">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#0071E3] dark:text-[#0A84FF] block">
            Next High Impact Release
          </span>
          <p className="text-xs font-bold text-[#1C1C1E] dark:text-white mt-0.5">
            {nextCatalyst ? `${nextCatalyst.currency} · ${nextCatalyst.title}` : 'Macro Data Release'}
          </p>
        </div>
        <div className="px-2.5 py-1 rounded-lg bg-white dark:bg-black/60 font-mono text-xs font-bold text-[#16803C] dark:text-[#30D158] tabular-nums border border-[#E5E5EA] dark:border-[#2C2C2E]">
          {formatCountdown(countdownSeconds)}
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex items-center justify-between gap-2 text-xs pt-0.5">
        <div className="inline-flex rounded-lg bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] p-0.5 border border-[#D1D1D6] dark:border-[#2C2C2E]">
          {(['today', 'tomorrow', 'week'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setCalDayFilter(d)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors ${
                calDayFilter === d
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
          <input
            type="checkbox"
            checked={highOnly}
            onChange={(e) => setHighOnly(e.target.checked)}
            className="rounded border-[#D1D1D6] dark:border-[#38383A] text-[#FF453A] focus:ring-0"
          />
          <span>High Only</span>
        </label>
      </div>

      {/* Event Cards */}
      <div className="flex flex-col gap-2.5">
        {filteredEvents.slice(0, 6).map((ev) => (
          <div
            key={ev.id}
            className="p-3.5 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col gap-2"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-[#6C6C70] dark:text-[#8E8E93]">
                <span className="font-bold text-[#1C1C1E] dark:text-white">{ev.currency}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{ev.timeWib}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-semibold ${
                    ev.impact === 'HIGH'
                      ? 'text-[#D7261C] dark:text-[#FF453A]'
                      : 'text-[#B25E09] dark:text-[#FF9F0A]'
                  }`}
                >
                  {ev.impact === 'HIGH' ? 'High' : 'Med'}
                </span>
              </div>
              <span
                className={`text-[11px] font-semibold ${
                  ev.deviationType === 'beat'
                    ? 'text-[#16803C] dark:text-[#30D158]'
                    : ev.deviationType === 'miss'
                      ? 'text-[#D7261C] dark:text-[#FF453A]'
                      : 'text-[#6C6C70] dark:text-[#8E8E93]'
                }`}
              >
                {ev.deviationLabel}
              </span>
            </div>

            <h3 className="text-xs font-bold text-[#1C1C1E] dark:text-white">{ev.title}</h3>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E5E5EA] dark:border-[#2C2C2E]/60 text-[11px] text-center font-mono tabular-nums">
              <div>
                <span className="text-[9px] text-[#6C6C70] dark:text-[#8E8E93] block font-sans uppercase">
                  Actual
                </span>
                <span
                  className={`font-bold ${
                    ev.deviationType === 'beat'
                      ? 'text-[#16803C] dark:text-[#30D158]'
                      : ev.deviationType === 'miss'
                        ? 'text-[#D7261C] dark:text-[#FF453A]'
                        : 'text-[#1C1C1E] dark:text-white'
                  }`}
                >
                  {ev.actual}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-[#6C6C70] dark:text-[#8E8E93] block font-sans uppercase">
                  Forecast
                </span>
                <span className="font-semibold text-[#1C1C1E] dark:text-[#E5E5EA]">
                  {ev.forecast}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-[#6C6C70] dark:text-[#8E8E93] block font-sans uppercase">
                  Prev
                </span>
                <span className="text-[#6C6C70] dark:text-[#8E8E93]">{ev.previous}</span>
              </div>
            </div>
          </div>
        ))}
        {filteredEvents.length === 0 && (
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] text-center text-xs text-[#6C6C70] dark:text-[#8E8E93] flex flex-col items-center gap-2">
            <span>No releases match this filter window.</span>
            <button
              type="button"
              onClick={() => {
                setCalDayFilter('week');
                setHighOnly(false);
              }}
              className="text-[#0071E3] dark:text-[#0A84FF] font-semibold hover:underline"
            >
              Show This Week
            </button>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="flex flex-col flex-1">
      {/* Top Snapshot Carousel (Mobile horizontal scroll -> Desktop 6-col grid) */}
      <section className="border-b border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#E5E5EA]/40 dark:bg-black/40 px-4 lg:px-6 py-3">
        <div className="flex xl:grid xl:grid-cols-6 gap-2.5 lg:gap-3 overflow-x-auto no-scrollbar">
          {snapshotAssets.map((tile) => {
            const isGain = tile.changePercent >= 0;
            const isSelected = tile.id === activeAsset.id;
            const flash = flashMap[tile.id];
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => handleSelectRow(tile.id)}
                className={`text-left shrink-0 min-w-[140px] xl:min-w-0 p-3 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-white dark:bg-[#1C1C1E] border-[#0071E3] dark:border-[#0A84FF]'
                    : 'bg-white/80 dark:bg-[#1C1C1E]/70 hover:bg-white dark:hover:bg-[#1C1C1E] border-[#E5E5EA] dark:border-[#2C2C2E]'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-[#1C1C1E] dark:text-white">
                    {tile.shortName}
                  </span>
                  <span
                    className={`font-semibold tabular-nums font-mono ${
                      isGain
                        ? 'text-[#16803C] dark:text-[#30D158]'
                        : 'text-[#D7261C] dark:text-[#FF453A]'
                    }`}
                  >
                    {isGain ? '+' : ''}
                    {tile.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-sm sm:text-base font-bold tabular-nums font-mono transition-colors ${
                      flash === 'gain'
                        ? 'text-[#16803C] dark:text-[#30D158]'
                        : flash === 'loss'
                          ? 'text-[#D7261C] dark:text-[#FF453A]'
                          : 'text-[#1C1C1E] dark:text-white'
                    }`}
                  >
                    {formatAssetPrice(tile)}
                  </span>
                  <span className="hidden sm:inline text-[10px] text-[#6C6C70] dark:text-[#8E8E93] tabular-nums font-mono">
                    ref {formatAssetPrevClose(tile)}
                  </span>
                </div>
                <div className="mt-1.5">
                  <SparklineSvg
                    points={tile.sparklinePoints}
                    isGain={isGain}
                    className="w-full h-4"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Mobile Segmented Sub-Tab Switcher (< lg) */}
      <div className="lg:hidden px-4 pt-3 pb-1">
        <div className="grid grid-cols-4 p-1 rounded-xl bg-[#E5E5EA] dark:bg-[#1C1C1E] border border-[#D1D1D6] dark:border-[#2C2C2E] text-xs font-semibold">
          {(
            [
              { id: 'chart', label: 'Chart' },
              { id: 'watchlist', label: 'Watchlist' },
              { id: 'news', label: 'News' },
              { id: 'calendar', label: 'Calendar' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileTab(tab.id)}
              className={`min-h-[36px] py-1.5 rounded-lg text-center transition-colors ${
                mobileTab === tab.id
                  ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Content Panels (< lg) */}
      <div className="lg:hidden px-4 py-4 pb-28 flex flex-col gap-5">
        {mobileTab === 'chart' && renderChartAndAnalysis()}
        {mobileTab === 'watchlist' && (
          <div className="rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] overflow-hidden">
            <div className="p-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
                  Full Market Watchlist
                </h2>
                <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
                  {assets.length} tracked assets · Tap any row for chart
                </p>
              </div>
              <Activity className="w-4 h-4 text-[#16803C] dark:text-[#30D158]" />
            </div>
            {renderWatchlistContent()}
          </div>
        )}
        {mobileTab === 'news' && renderNewsColumn()}
        {mobileTab === 'calendar' && renderCalendarColumn()}
      </div>

      {/* Desktop 3-Column Terminal Layout (lg+) */}
      <div className="hidden lg:grid lg:grid-cols-12 flex-1">
        {/* Left Watchlist Sidebar */}
        <aside className="lg:col-span-3 border-r border-[#E5E5EA] dark:border-[#2C2C2E] bg-white/60 dark:bg-black/60 overflow-y-auto lg:max-h-[calc(100dvh-258px)] flex flex-col">
          <div className="p-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur z-10">
            <div>
              <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">Watchlist</h2>
              <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
                {filteredAssets.length} tracked assets
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAllGroups}
              className="text-xs font-semibold text-[#0071E3] dark:text-[#0A84FF] hover:underline"
            >
              {allCollapsed ? 'Expand' : 'Collapse'}
            </button>
          </div>
          {renderWatchlistContent()}
        </aside>

        {/* Center Interactive Stage */}
        <section className="lg:col-span-6 border-r border-[#E5E5EA] dark:border-[#2C2C2E] p-6 pb-28 overflow-y-auto lg:max-h-[calc(100dvh-258px)]">
          {renderChartAndAnalysis()}
        </section>

        {/* Right News & Forex Calendar Column */}
        <aside className="lg:col-span-3 bg-white/60 dark:bg-black/60 p-5 pb-28 overflow-y-auto lg:max-h-[calc(100dvh-258px)] flex flex-col gap-6">
          {renderNewsColumn()}
          {renderCalendarColumn()}
        </aside>
      </div>
    </div>
  );
};
