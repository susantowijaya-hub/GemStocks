import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bookmark,
  CalendarClock,
  Clock,
  LineChart,
  Moon,
  Newspaper,
  Sun,
  TrendingUp,
} from 'lucide-react';
import {
  AppRoute,
  MarketAsset,
  MarketIntelligenceResponse,
  ThemeMode,
  Timeframe,
} from '../types/market';
import {
  formatAssetPrevClose,
  formatAssetPrice,
  formatFullDelta,
} from '../utils/formatters';
import {
  DashboardRegionTab,
  getAllMarketSessions,
  getRegionStatusSummary,
} from '../utils/marketSessions';
import { getAssetSignal } from '../utils/marketSignals';
import { GoogleFinanceDeltaPill } from './GoogleFinanceMiniChart';
import { InteractiveChart } from './InteractiveChart';
import { MarketIntelligencePanel } from './MarketIntelligencePanel';
import { AssetCategoryMiniIcon, SignalBadge } from './MarketUiPrimitives';

interface MarketDashboardViewProps {
  assets: MarketAsset[];
  selectedAssetId: string;
  onSelectAsset: (id: string) => void;
  searchQuery: string;
  flashMap: Record<string, 'gain' | 'loss'>;
  onNavigate: (route: AppRoute) => void;
  onLoadTimeframe?: (assetId: string, tf: Timeframe) => void;
  themeMode: ThemeMode;
  marketIntelligence?: MarketIntelligenceResponse | null;
  intelligenceLoading?: boolean;
  onRefreshIntelligence?: () => void;
}

const REGION_TABS: { id: DashboardRegionTab; label: string }[] = [
  { id: 'all', label: 'All Markets' },
  { id: 'us', label: 'US' },
  { id: 'asia', label: 'Asia' },
  { id: 'commodities', label: 'Commodities & Crypto' },
  { id: 'currencies', label: 'Currencies & Yields' },
];

export const MarketDashboardView: React.FC<MarketDashboardViewProps> = ({
  assets,
  selectedAssetId,
  onSelectAsset,
  searchQuery,
  flashMap,
  onNavigate,
  onLoadTimeframe,
  marketIntelligence = null,
  intelligenceLoading = false,
  onRefreshIntelligence,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [regionTab, setRegionTab] = useState<DashboardRegionTab>('all');
  const [isCompactCards, setIsCompactCards] = useState<boolean>(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  // Sticky card compaction on scroll with hysteresis
  useEffect(() => {
    let rafId = 0;
    const updateScrollState = () => {
      rafId = 0;
      const y = window.scrollY || window.pageYOffset || 0;
      setIsCompactCards((prev) => {
        if (!prev && y > 56) return true;
        if (prev && y < 20) return false;
        return prev;
      });
    };

    const handleScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateScrollState);
    };

    updateScrollState();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const activeAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? assets[0],
    [assets, selectedAssetId]
  );

  const sessions = useMemo(() => getAllMarketSessions(now), [now]);
  const sessionList = [sessions.us, sessions.idx, sessions.asia, sessions.crypto];

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

  const snapshotAssets = useMemo(() => {
    const baseTiles =
      regionTab === 'all'
        ? assets.filter((a) => a.isSnapshotTile)
        : regionTab === 'us'
          ? assets.filter((a) => a.category === 'us-indices')
          : regionTab === 'asia'
            ? assets.filter((a) => a.category === 'asia-indices')
            : regionTab === 'commodities'
              ? assets.filter((a) => a.category === 'commodities-crypto')
              : assets.filter((a) => a.category === 'forex-yields');

    const q = searchQuery.toLowerCase().trim();
    const list = baseTiles.length > 0 ? baseTiles : assets.filter((a) => a.isSnapshotTile);
    if (!q) return list;

    const matchingAll = assets.filter(
      (a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.shortName.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
    );
    return matchingAll.length > 0 ? matchingAll.slice(0, 6) : list;
  }, [assets, regionTab, searchQuery]);

  const regionBanner = useMemo(
    () => getRegionStatusSummary(regionTab, now),
    [regionTab, now]
  );

  useEffect(() => {
    if (onLoadTimeframe && activeAsset?.id) {
      onLoadTimeframe(activeAsset.id, timeframe);
    }
  }, [activeAsset?.id, timeframe, onLoadTimeframe]);

  const isGain = activeAsset.changePercent >= 0;
  const flash = flashMap[activeAsset.id];
  const activeSignal = useMemo(() => getAssetSignal(activeAsset), [activeAsset]);

  // Clean secondary Key Statistics excluding removed Intraday Spread / 52W Position / 52W Midpoint / Venue
  const extraStats = useMemo(() => {
    const blocked = new Set(['Intraday Spread', '52W Position', '52W Midpoint', 'Venue']);
    const items: { label: string; value: string }[] = [];
    const candidates = [
      { label: activeAsset.avgVolLabel, value: activeAsset.avgVol },
      { label: activeAsset.peLabel, value: activeAsset.peValue },
      { label: activeAsset.capLabel, value: activeAsset.capValue },
    ];
    for (const c of candidates) {
      if (c.label && c.value && !blocked.has(c.label)) {
        items.push({ label: c.label, value: c.value });
      }
    }
    return items;
  }, [activeAsset]);

  return (
    <div className="flex flex-col flex-1">
      {/* Sticky Region Tabs + Sessions Shown Above Cards Only + Simple No-Chart Ticker Cards */}
      <section
        style={{ top: 'var(--app-header-height, 108px)' }}
        className={`sticky z-30 liquid-glass-strong !border-x-0 !border-t-0 px-4 lg:px-6 transition-all duration-300 ease-out flex flex-col ${
          isCompactCards ? 'pt-2 pb-2 gap-1.5' : 'pt-2.5 pb-3 gap-2'
        }`}
      >
        {/* Region Filter Strip & Summary */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {REGION_TABS.map((tab) => {
              const active = regionTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRegionTab(tab.id)}
                  className={`px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
                    isCompactCards ? 'py-1' : 'py-1.5'
                  } ${
                    active
                      ? 'bg-[#1C1C1E] dark:bg-white text-white dark:text-[#111318] border-transparent shadow-sm'
                      : 'liquid-glass-pill text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center gap-1.5 text-xs text-[#4A4D57] dark:text-[#C7CBD6]">
            {regionBanner.isOpen ? (
              <Sun className="w-3.5 h-3.5 text-[#D97706] dark:text-[#FBBF24]" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-[#6366F1] dark:text-[#A78BFA]" />
            )}
            <span className="font-semibold">{regionBanner.text}</span>
          </div>
        </div>

        {/* Market Sessions Shown Strictly Above Ticker Cards */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-[11px]">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#4A4D57] dark:text-[#B4B8C4] shrink-0">
            <Clock className="w-3 h-3" />
            Sessions
          </span>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {sessionList.map((s) => {
              const dotColor =
                s.tone === 'open'
                  ? 'bg-[#22C55E] dark:bg-[#4ADE80]'
                  : s.tone === 'extended' || s.tone === 'break'
                    ? 'bg-[#FF9F0A]'
                    : 'bg-[#8E8E93]';
              const badgeText =
                s.tone === 'open'
                  ? 'text-[#0F7033] dark:text-[#4ADE80]'
                  : s.tone === 'extended' || s.tone === 'break'
                    ? 'text-[#9A4E00] dark:text-[#FFB340]'
                    : 'text-[#4A4D57] dark:text-[#B4B8C4]';

              return (
                <div
                  key={s.id}
                  title={`${s.label}: ${s.stateLabel} (${s.detail})`}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full liquid-glass-pill whitespace-nowrap"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                  <span className="font-semibold text-[#1C1C1E] dark:text-white">{s.shortLabel}:</span>
                  <span className={`font-bold ${badgeText}`}>{s.stateLabel}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Simple Ticker Cards (Chart Removed Completely per User Request) */}
        <div className="flex xl:grid xl:grid-cols-6 gap-2.5 lg:gap-3 overflow-x-auto no-scrollbar pb-0.5">
          {snapshotAssets.map((tile) => {
            const isSelected = tile.id === activeAsset.id;
            const tileFlash = flashMap[tile.id];

            const tileSignal = getAssetSignal(tile);
            const signalTextClass =
              tileSignal.direction === 'bull'
                ? 'text-[#0F7033] dark:text-[#4ADE80]'
                : tileSignal.direction === 'bear'
                  ? 'text-[#C41C16] dark:text-[#FF6B63]'
                  : 'text-[#4A4D57] dark:text-[#B4B8C4]';

            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => onSelectAsset(tile.id)}
                className={`text-left shrink-0 xl:min-w-0 liquid-glass-card overflow-hidden transition-all duration-200 ease-out flex flex-col justify-between ${
                  isCompactCards
                    ? 'min-w-[148px] rounded-xl px-3 py-2'
                    : 'min-w-[162px] rounded-2xl px-3.5 py-2.5'
                } ${
                  isSelected
                    ? '!border-[#0071E3] dark:!border-[#3898FF] ring-1 ring-[#0071E3]/25 dark:ring-[#3898FF]/30 shadow-md'
                    : 'hover:brightness-[0.98] dark:hover:brightness-110'
                }`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <span
                    className={`font-medium text-[#6C6C70] dark:text-[#D1D1D6] truncate ${
                      isCompactCards ? 'text-[11px]' : 'text-xs'
                    }`}
                  >
                    {tile.shortName}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isCompactCards && (
                      <span
                        className={`text-[9px] font-bold uppercase tracking-tight whitespace-nowrap ${signalTextClass}`}
                        title={tileSignal.reason}
                      >
                        {tileSignal.direction === 'bull'
                          ? 'Bull'
                          : tileSignal.direction === 'bear'
                            ? 'Bear'
                            : 'Flat'}
                      </span>
                    )}
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        tile.marketSessionOpen ? 'bg-[#30D158]' : 'bg-[#8E8E93]/60'
                      }`}
                      title={
                        tile.marketSessionOpen
                          ? 'Session Open (1s Live)'
                          : 'Session Closed (Last Close)'
                      }
                    />
                  </div>
                </div>

                <div
                  className={`w-full ${
                    isCompactCards
                      ? 'mt-1 flex items-center justify-between gap-2'
                      : 'mt-1.5 flex items-baseline justify-between gap-2'
                  }`}
                >
                  <div
                    className={`font-bold tabular-nums font-mono tracking-tight ${
                      isCompactCards ? 'text-xs sm:text-sm' : 'text-base sm:text-lg'
                    } ${
                      tileFlash === 'gain'
                        ? 'text-[#16803C] dark:text-[#30D158]'
                        : tileFlash === 'loss'
                          ? 'text-[#D7261C] dark:text-[#FF453A]'
                          : 'text-[#1C1C1E] dark:text-white'
                    }`}
                  >
                    {formatAssetPrice(tile)}
                  </div>
                  <GoogleFinanceDeltaPill
                    changePercent={tile.changePercent}
                    compact
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Focused Markets Chart & Analysis Stage */}
      <div className="max-w-6xl w-full mx-auto px-4 lg:px-6 py-5 pb-28 flex flex-col gap-5">
        {/* Asset Header */}
        <motion.div
          key={activeAsset.id}
          initial={{ opacity: 0.7, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E]"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <AssetCategoryMiniIcon
                category={activeAsset.category}
                idOrSymbol={activeAsset.id}
                size="md"
              />
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white">
                {activeAsset.symbol}
              </h1>
              <span className="text-xs font-medium text-[#6C6C70] dark:text-[#8E8E93]">
                {activeAsset.exchange}
              </span>
              <SignalBadge signal={activeSignal} showScore />
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
            </div>
          </div>
        </motion.div>

        {/* Interactive Chart */}
        <InteractiveChart
          asset={activeAsset}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
        />

        {/* Key Statistics & Market Analysis Side-by-Side on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Key Statistics Grid (Intraday Spread, 52W Position, 52W Midpoint removed) */}
          <div className="rounded-2xl liquid-glass-card p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-black/8 dark:border-white/10 pb-2.5">
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

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
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
              {extraStats.map((stat) => (
                <div key={stat.label}>
                  <span className="text-[#6C6C70] dark:text-[#8E8E93]">{stat.label}</span>
                  <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5 truncate">
                    {stat.value}
                  </p>
                </div>
              ))}
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
          <article className="rounded-2xl liquid-glass-card p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <LineChart className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
                <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
                  Market Analysis &amp; Technicals
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <SignalBadge signal={activeSignal} />
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
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

        {/* Connected 3-Phase Index Session Briefings & Multi-Source Market/Stocks Intelligence */}
        <MarketIntelligencePanel
          intelligence={marketIntelligence}
          loading={intelligenceLoading}
          selectedAssetId={activeAsset.id}
          assets={assets}
          onSelectAsset={onSelectAsset}
          onNavigate={onNavigate}
          onRefresh={onRefreshIntelligence}
        />

        {/* Clean Tab Shortcuts to Watchlist, Breaking News & Macro Calendar */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('watchlist')}
            className="p-4 rounded-2xl liquid-glass-card hover:brightness-[0.98] dark:hover:brightness-110 flex items-center justify-between gap-3 text-left transition-all"
          >
            <div className="flex items-center gap-3">
              <Bookmark className="w-4 h-4 text-[#0071E3] dark:text-[#3898FF] shrink-0" />
              <div>
                <p className="text-xs font-bold text-[#1C1C1E] dark:text-white">Full Watchlist</p>
                <p className="text-[11px] text-[#4A4D57] dark:text-[#B4B8C4]">
                  Browse all {assets.length} tracked assets
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#4A4D57] dark:text-[#B4B8C4] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('news')}
            className="p-4 rounded-2xl liquid-glass-card hover:brightness-[0.98] dark:hover:brightness-110 flex items-center justify-between gap-3 text-left transition-all"
          >
            <div className="flex items-center gap-3">
              <Newspaper className="w-4 h-4 text-[#C41C16] dark:text-[#FF6B63] shrink-0" />
              <div>
                <p className="text-xs font-bold text-[#1C1C1E] dark:text-white">Breaking News &amp; Summary</p>
                <p className="text-[11px] text-[#4A4D57] dark:text-[#B4B8C4]">
                  24h recap &amp; live headlines
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#4A4D57] dark:text-[#B4B8C4] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="p-4 rounded-2xl liquid-glass-card hover:brightness-[0.98] dark:hover:brightness-110 flex items-center justify-between gap-3 text-left transition-all"
          >
            <div className="flex items-center gap-3">
              <CalendarClock className="w-4 h-4 text-[#0F7033] dark:text-[#4ADE80] shrink-0" />
              <div>
                <p className="text-xs font-bold text-[#1C1C1E] dark:text-white">Macro Calendar</p>
                <p className="text-[11px] text-[#4A4D57] dark:text-[#B4B8C4]">
                  Market-moving economic releases
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#4A4D57] dark:text-[#B4B8C4] shrink-0" />
          </button>
        </section>
      </div>
    </div>
  );
};
