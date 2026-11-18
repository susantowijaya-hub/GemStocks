import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  LineChart,
  Maximize2,
} from 'lucide-react';
import { CATEGORY_META } from '../data/marketData';
import {
  AppRoute,
  MarketAsset,
  WatchlistCategory,
} from '../types/market';
import { formatAssetPrice } from '../utils/formatters';
import { getSessionProgressRatio } from '../utils/marketSessions';
import { GoogleFinanceDeltaPill, GoogleFinanceMiniChart } from './GoogleFinanceMiniChart';

interface WatchlistViewProps {
  assets: MarketAsset[];
  selectedAssetId: string;
  onSelectAsset: (id: string) => void;
  onNavigate: (route: AppRoute) => void;
  onInspectSymbol?: (yahooSymbol: string, builtInAssetId?: string) => void;
  searchQuery: string;
  isPercentMode: boolean;
  onToggleBadgeMode: () => void;
  flashMap: Record<string, 'gain' | 'loss'>;
}

type CategoryFilter = 'all' | WatchlistCategory;

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  assets,
  selectedAssetId,
  onSelectAsset,
  onNavigate,
  onInspectSymbol,
  searchQuery,
  isPercentMode,
  onToggleBadgeMode,
  flashMap,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [openGroups, setOpenGroups] = useState<Record<WatchlistCategory, boolean>>({
    'us-indices': true,
    'asia-indices': true,
    'commodities-crypto': true,
    'forex-yields': true,
  });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return assets.filter((a) => {
      const matchCat = categoryFilter === 'all' || a.category === categoryFilter;
      const matchSearch =
        !q ||
        a.symbol.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.shortName.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.categoryLabel.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [assets, categoryFilter, searchQuery]);

  const activeAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? assets[0],
    [assets, selectedAssetId]
  );

  const visibleCategories = useMemo(
    () =>
      CATEGORY_META.filter(
        (cat) => categoryFilter === 'all' || cat.id === categoryFilter
      ),
    [categoryFilter]
  );

  const allCollapsed = visibleCategories.every((cat) => !openGroups[cat.id]);

  const toggleAllGroups = () => {
    const next = allCollapsed;
    setOpenGroups({
      'us-indices': next,
      'asia-indices': next,
      'commodities-crypto': next,
      'forex-yields': next,
    });
  };

  const handleOpenChart = (assetId: string) => {
    onSelectAsset(assetId);
    onNavigate('dashboard');
  };

  const openCount = useMemo(
    () => assets.filter((a) => a.marketSessionOpen).length,
    [assets]
  );

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 pb-28 flex flex-col gap-5">
      {/* Header matching Market section styling */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#16803C] dark:text-[#30D158]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#16803C] dark:text-[#30D158]">
              Market Watchlist · {openCount} Open Sessions
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white mt-1">
            Global Markets Watchlist
          </h1>
          <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93] mt-0.5">
            {filteredAssets.length} tracked benchmarks across indices, commodities, crypto, FX, and sovereign yields. Tap any asset to view its interactive chart.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleBadgeMode}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] text-xs font-semibold text-[#1C1C1E] dark:text-white hover:bg-[#E5E5EA]/60 dark:hover:bg-[#2C2C2E] transition-colors"
          >
            Delta: {isPercentMode ? '% Change' : 'Points'}
          </button>
          <button
            type="button"
            onClick={toggleAllGroups}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] text-xs font-semibold text-[#0071E3] dark:text-[#0A84FF] hover:bg-[#E5E5EA]/60 dark:hover:bg-[#2C2C2E] transition-colors"
          >
            {allCollapsed ? 'Expand All' : 'Collapse All'}
          </button>
        </div>
      </section>

      {/* Category Strip */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        <button
          type="button"
          onClick={() => setCategoryFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
            categoryFilter === 'all'
              ? 'bg-[#1C1C1E] dark:bg-[#2C2C2E] text-white border-[#1C1C1E] dark:border-[#3A3A3C]'
              : 'bg-white/80 dark:bg-[#1C1C1E]/60 text-[#6C6C70] dark:text-[#AEAEB2] border-[#E5E5EA] dark:border-[#2C2C2E] hover:text-[#1C1C1E] dark:hover:text-white'
          }`}
        >
          All Categories ({assets.length})
        </button>
        {CATEGORY_META.map((cat) => {
          const active = categoryFilter === cat.id;
          const count = assets.filter((a) => a.category === cat.id).length;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
                active
                  ? 'bg-[#1C1C1E] dark:bg-[#2C2C2E] text-white border-[#1C1C1E] dark:border-[#3A3A3C]'
                  : 'bg-white/80 dark:bg-[#1C1C1E]/60 text-[#6C6C70] dark:text-[#AEAEB2] border-[#E5E5EA] dark:border-[#2C2C2E] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Grouped Watchlist Card (preserved directly from Market Section Watchlist style) */}
      <section className="rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between bg-white/95 dark:bg-[#1C1C1E]">
          <div>
            <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">Watchlist</h2>
            <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
              {filteredAssets.length} tracked assets · Tap row to open in Markets chart
            </p>
          </div>
          {activeAsset && (
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0071E3] dark:text-[#0A84FF] hover:underline"
            >
              <LineChart className="w-3.5 h-3.5" />
              <span>Active: {activeAsset.symbol}</span>
            </button>
          )}
        </div>

        <div className="divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E]/60">
          {visibleCategories.map((cat) => {
            const rows = filteredAssets.filter((a) => a.category === cat.id);
            if (rows.length === 0) return null;
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
                      const isActive = asset.id === activeAsset?.id;
                      const isGain = asset.changePercent >= 0;
                      const flash = flashMap[asset.id];
                      return (
                        <div
                          key={asset.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleOpenChart(asset.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleOpenChart(asset.id);
                            }
                          }}
                          className={`cursor-pointer px-4 py-3 flex items-center justify-between gap-3 transition-colors min-h-[60px] ${
                            isActive
                              ? 'bg-[#0071E3]/10 dark:bg-[#2C2C2E]/70'
                              : 'hover:bg-[#E5E5EA]/50 dark:hover:bg-[#2C2C2E]/40'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2.5">
                              <span className="w-7 h-7 rounded-full bg-[#E5E5EA]/70 dark:bg-[#2C2C2E] flex items-center justify-center text-[10px] font-extrabold text-[#1C1C1E] dark:text-white shrink-0">
                                {asset.symbol.slice(0, 2)}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-sm text-[#1C1C1E] dark:text-white truncate">
                                    {asset.symbol}
                                  </p>
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      asset.marketSessionOpen
                                        ? 'bg-[#30D158]'
                                        : 'bg-[#8E8E93]/50'
                                    }`}
                                    title={
                                      asset.marketSessionOpen
                                        ? 'Session Open (1s Live)'
                                        : 'Session Closed'
                                    }
                                  />
                                  {isActive && (
                                    <span className="text-[10px] font-bold text-[#0071E3] dark:text-[#0A84FF]">
                                      · Selected
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] truncate">
                                  {asset.shortName} · {asset.exchange}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="hidden sm:block text-right text-[11px] text-[#6C6C70] dark:text-[#8E8E93] font-mono tabular-nums shrink-0">
                            <div>H {asset.dayHigh}</div>
                            <div>L {asset.dayLow}</div>
                          </div>

                          <div className="w-20 sm:w-24 h-8 shrink-0">
                            <GoogleFinanceMiniChart
                              points={asset.chartSeries['1D'] ?? asset.sparklinePoints}
                              prevClose={asset.prevClose}
                              isGain={isGain}
                              progressRatio={
                                asset.sessionProgressRatio ??
                                getSessionProgressRatio(asset.id, now)
                              }
                              className="w-full h-8"
                              showEndDot={asset.marketSessionOpen}
                              strokeWidth={1.6}
                            />
                          </div>

                          <div className="text-right shrink-0 min-w-[92px]">
                            <p
                              className={`text-xs sm:text-sm font-bold tabular-nums font-mono transition-colors ${
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
                              className="mt-0.5 inline-flex items-center justify-end"
                              title="Tap to toggle % / points"
                            >
                              <GoogleFinanceDeltaPill
                                changePercent={asset.changePercent}
                                label={
                                  isPercentMode
                                    ? `${asset.changePercent >= 0 ? '+' : ''}${asset.changePercent.toFixed(2)}%`
                                    : `${asset.changeValue >= 0 ? '+' : '-'}${Math.abs(asset.changeValue).toFixed(
                                        asset.decimals >= 3 ? asset.decimals : 2
                                      )}`
                                }
                                compact
                              />
                            </button>
                          </div>

                          {onInspectSymbol && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onInspectSymbol(asset.symbol, asset.id);
                              }}
                              className="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white hover:bg-[#E5E5EA]/70 dark:hover:bg-[#3A3A3C]/50 transition-colors shrink-0"
                              title={`Inspect ${asset.symbol}`}
                              aria-label={`Inspect ${asset.symbol}`}
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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
              No watchlist assets match "{searchQuery}".
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
