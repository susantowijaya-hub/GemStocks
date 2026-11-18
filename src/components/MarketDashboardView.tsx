import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  CalendarClock,
  LineChart,
  Moon,
  Newspaper,
  Sun,
  TrendingUp,
} from 'lucide-react';
import {
  AppRoute,
  MarketAsset,
  Timeframe,
} from '../types/market';
import {
  formatAssetPrevClose,
  formatAssetPrice,
  formatFullDelta,
} from '../utils/formatters';
import {
  DashboardRegionTab,
  getAssetSessionStatus,
  getRegionStatusSummary,
  getSessionProgressRatio,
} from '../utils/marketSessions';
import { GoogleFinanceDeltaPill, GoogleFinanceMiniChart } from './GoogleFinanceMiniChart';
import { InteractiveChart } from './InteractiveChart';

interface MarketDashboardViewProps {
  assets: MarketAsset[];
  selectedAssetId: string;
  onSelectAsset: (id: string) => void;
  searchQuery: string;
  flashMap: Record<string, 'gain' | 'loss'>;
  onNavigate: (route: AppRoute) => void;
  onLoadTimeframe?: (assetId: string, tf: Timeframe) => void;
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
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [regionTab, setRegionTab] = useState<DashboardRegionTab>('all');
  const [isCompactCards, setIsCompactCards] = useState<boolean>(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  // Sticky card compaction on scroll with hysteresis to prevent boundary flicker
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

  return (
    <div className="flex flex-col flex-1">
      {/* Sticky Google Finance Region Tabs + Market Status + Animated Simplifying Ticker Cards */}
      <section
        style={{ top: 'var(--app-header-height, 148px)' }}
        className={`sticky z-30 border-b border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#F2F2F7]/95 dark:bg-black/95 backdrop-blur-xl shadow-sm px-4 lg:px-6 transition-all duration-300 ease-out flex flex-col ${
          isCompactCards ? 'pt-2 pb-2 gap-1.5' : 'pt-2.5 pb-3 gap-2'
        }`}
      >
        {/* Region Filter Strip & Live Market Status Line */}
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
                      ? 'bg-[#1C1C1E] dark:bg-[#2C2C2E] text-white border-[#1C1C1E] dark:border-[#3A3A3C]'
                      : 'bg-white/80 dark:bg-[#1C1C1E]/60 text-[#6C6C70] dark:text-[#AEAEB2] border-[#E5E5EA] dark:border-[#2C2C2E] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center gap-1.5 text-xs text-[#6C6C70] dark:text-[#AEAEB2]">
            {regionBanner.isOpen ? (
              <Sun className="w-3.5 h-3.5 text-[#D97706] dark:text-[#FBBF24]" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-[#6366F1] dark:text-[#A78BFA]" />
            )}
            <span className="font-medium">{regionBanner.text}</span>
          </div>
        </div>

        {/* Google Finance-style Ticker Cards -> Animates smoothly into Simplified No-Graph Cards on Scroll */}
        <div className="flex xl:grid xl:grid-cols-6 gap-2.5 lg:gap-3 overflow-x-auto no-scrollbar pb-0.5">
          {snapshotAssets.map((tile) => {
            const tileGain = tile.changePercent >= 0;
            const isSelected = tile.id === activeAsset.id;
            const tileFlash = flashMap[tile.id];
            const tileSeries = tile.chartSeries['1D'] ?? tile.sparklinePoints;
            const progress =
              tile.sessionProgressRatio ?? getSessionProgressRatio(tile.id, now);

            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => onSelectAsset(tile.id)}
                className={`text-left shrink-0 xl:min-w-0 border overflow-hidden transition-all duration-300 ease-out flex flex-col justify-between ${
                  isCompactCards
                    ? 'min-w-[148px] rounded-xl'
                    : 'min-w-[166px] rounded-2xl'
                } ${
                  isSelected
                    ? 'bg-white dark:bg-[#1C1C1E] border-[#0071E3] dark:border-[#0A84FF] shadow-sm'
                    : 'bg-white dark:bg-[#1C1C1E]/90 hover:bg-white dark:hover:bg-[#1C1C1E] border-[#E5E5EA] dark:border-[#2C2C2E]'
                }`}
              >
                <div
                  className={`transition-all duration-300 ease-out ${
                    isCompactCards ? 'px-3 py-2' : 'px-3.5 pt-3 pb-1.5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-medium text-[#6C6C70] dark:text-[#D1D1D6] truncate transition-all duration-200 ${
                        isCompactCards ? 'text-[11px]' : 'text-xs'
                      }`}
                    >
                      {tile.shortName}
                    </span>
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

                  {/* Simplified inline layout when scrolled down, stacked prominent layout at top */}
                  <div
                    className={`transition-all duration-300 ease-out ${
                      isCompactCards
                        ? 'mt-1 flex items-center justify-between gap-2'
                        : 'mt-1 flex flex-col items-start'
                    }`}
                  >
                    <div
                      className={`font-bold tabular-nums font-mono tracking-tight transition-all duration-300 ${
                        isCompactCards
                          ? 'text-xs sm:text-sm'
                          : 'text-lg sm:text-xl'
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
                    <div className={isCompactCards ? '' : 'mt-1'}>
                      <GoogleFinanceDeltaPill
                        changePercent={tile.changePercent}
                        compact={isCompactCards}
                      />
                    </div>
                  </div>
                </div>

                {/* Animated Sparkline Container: Collapses cleanly without graph line when scrolled */}
                <div
                  aria-hidden={isCompactCards}
                  className={`w-full overflow-hidden transition-all duration-300 ease-out ${
                    isCompactCards
                      ? 'max-h-0 opacity-0 mt-0 pointer-events-none'
                      : 'max-h-12 opacity-100 mt-1'
                  }`}
                >
                  <GoogleFinanceMiniChart
                    points={tileSeries}
                    prevClose={tile.prevClose}
                    isGain={tileGain}
                    progressRatio={progress}
                    className="w-full h-11"
                    strokeWidth={1.7}
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

        {/* Key Statistics & Market Analysis Side-by-Side on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
          <article className="rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <LineChart className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
                <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
                  Market Analysis &amp; Technicals
                </h2>
              </div>
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

        {/* Clean Tab Shortcuts to Watchlist, Breaking News & Macro Calendar */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('watchlist')}
            className="p-4 rounded-2xl bg-white dark:bg-[#1C1C1E] hover:bg-[#E5E5EA]/50 dark:hover:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between gap-3 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <Bookmark className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF] shrink-0" />
              <div>
                <p className="text-xs font-bold text-[#1C1C1E] dark:text-white">Full Watchlist</p>
                <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
                  Browse all {assets.length} tracked assets
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#6C6C70] dark:text-[#8E8E93] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('news')}
            className="p-4 rounded-2xl bg-white dark:bg-[#1C1C1E] hover:bg-[#E5E5EA]/50 dark:hover:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between gap-3 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <Newspaper className="w-4 h-4 text-[#D7261C] dark:text-[#FF453A] shrink-0" />
              <div>
                <p className="text-xs font-bold text-[#1C1C1E] dark:text-white">Breaking News &amp; Summary</p>
                <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
                  24h recap &amp; live headlines
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#6C6C70] dark:text-[#8E8E93] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="p-4 rounded-2xl bg-white dark:bg-[#1C1C1E] hover:bg-[#E5E5EA]/50 dark:hover:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between gap-3 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <CalendarClock className="w-4 h-4 text-[#16803C] dark:text-[#30D158] shrink-0" />
              <div>
                <p className="text-xs font-bold text-[#1C1C1E] dark:text-white">Macro Calendar</p>
                <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
                  Market-moving economic releases
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#6C6C70] dark:text-[#8E8E93] shrink-0" />
          </button>
        </section>
      </div>
    </div>
  );
};
