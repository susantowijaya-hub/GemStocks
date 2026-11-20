import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bookmark,
  Briefcase,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  Megaphone,
  Moon,
  Newspaper,
  Search,
  Share2,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AppRoute,
  MarketAsset,
  NewsStory,
  StockMover,
  StockSearchResult,
  ThemeMode,
} from '../types/market';
import { formatAssetPrice, formatWibClock } from '../utils/formatters';
import { isIndexOpenSession } from '../utils/marketSessions';
import { GoogleFinanceDeltaPill, GoogleFinanceMiniChart } from './GoogleFinanceMiniChart';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  isPulseActive: boolean;
  wsConnected: boolean;
  onTogglePulse: () => void;
  tickerStories: NewsStory[];
  onOpenStory: (story: NewsStory) => void;
  assets: MarketAsset[];
  usMovers: StockMover[];
  idxMovers: StockMover[];
  onSelectAsset: (id: string) => void;
  onInspectSymbol: (yahooSymbol: string, builtInAssetId?: string) => void;
}

const INDEX_IDS = ['SPX', 'IXIC', 'DJI', 'IHSG', 'EIDO', 'HSI', 'TAIEX', 'KOSPI', 'SSEC', 'NIFTY'];

const NAV_TABS: {
  id: AppRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Markets', icon: LayoutDashboard },
  { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
  { id: 'portfolio', label: 'Portfolio', icon: Briefcase },
  { id: 'stocks', label: 'Stocks', icon: BarChart3 },
  { id: 'heatmap', label: 'Heatmap', icon: LayoutGrid },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'extract', label: 'Share', icon: Share2 },
];

function formatDropdownPrice(item: StockSearchResult): string {
  if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price <= 0) {
    return 'View chart';
  }
  if (item.isIndex) {
    return item.price.toLocaleString('en-US', {
      minimumFractionDigits: item.symbol === 'DXY' ? 3 : 2,
      maximumFractionDigits: item.symbol === 'DXY' ? 3 : 2,
    });
  }
  if (item.currency === 'IDR') {
    return `Rp ${Math.round(item.price).toLocaleString('en-US')}`;
  }
  const decimals = item.price < 2 ? 4 : 2;
  return `$${item.price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export const Header: React.FC<HeaderProps> = ({
  activeRoute,
  onNavigate,
  searchQuery,
  onSearchChange,
  themeMode,
  onToggleTheme,
  isPulseActive,
  wsConnected,
  onTogglePulse,
  tickerStories,
  onOpenStory,
  assets,
  usMovers,
  idxMovers,
  onSelectAsset,
  onInspectSymbol,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [navAwake, setNavAwake] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const navIdleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof window === 'undefined') return;
    const updateHeight = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--app-header-height', `${Math.round(h)}px`);
    };
    updateHeight();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (navIdleTimerRef.current) window.clearTimeout(navIdleTimerRef.current);
    };
  }, []);

  // Auto-focus expanded search input
  useEffect(() => {
    if (searchExpanded) {
      const t = window.setTimeout(() => searchInputRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, [searchExpanded]);

  // Close search on outside click or Escape key
  useEffect(() => {
    if (!searchExpanded) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!searchWrapRef.current?.contains(target)) {
        setSearchExpanded(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [searchExpanded]);

  // Query live US + Indonesia stocks & indices with mini sparklines when search is expanded
  useEffect(() => {
    if (!searchExpanded) return;
    const trimmed = searchQuery.trim();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/stocks/search?q=${encodeURIComponent(trimmed)}&quotes=1`
        );
        if (res.ok) {
          const data = (await res.json()) as { results?: StockSearchResult[] };
          if (Array.isArray(data.results)) {
            setSearchResults(data.results);
          }
        }
      } catch {
        // retain prior results
      } finally {
        setSearchLoading(false);
      }
    }, trimmed ? 220 : 40);

    return () => window.clearTimeout(timer);
  }, [searchQuery, searchExpanded]);

  const clock = formatWibClock(now);
  const marqueeStories = tickerStories.slice(0, 16);
  const tickerDurationSec = Math.max(176, Math.round(marqueeStories.length * 17));

  const liveTapeItems = useMemo(() => {
    const openIndices = assets.filter(
      (a) => INDEX_IDS.includes(a.id) && isIndexOpenSession(a.id, now)
    );
    const cryptoFallback =
      openIndices.length === 0
        ? assets.filter((a) => a.id === 'BTCUSD' || a.id === 'ETHUSD')
        : [];
    const activeBenchmarks = openIndices.length > 0 ? openIndices : cryptoFallback;

    const topUs = usMovers.slice(0, 3);
    const topIdx = idxMovers.slice(0, 3);

    type TapeEntry =
      | {
          kind: 'index';
          key: string;
          badge: string;
          symbol: string;
          priceText: string;
          changePercent: number;
          assetId: string;
        }
      | {
          kind: 'stock';
          key: string;
          badge: string;
          symbol: string;
          yahooSymbol: string;
          priceText: string;
          changePercent: number;
        };

    const entries: TapeEntry[] = [];

    for (const idxAsset of activeBenchmarks) {
      entries.push({
        kind: 'index',
        key: `idx-${idxAsset.id}`,
        badge: openIndices.length > 0 ? 'OPEN' : '24/7',
        symbol: idxAsset.symbol,
        priceText: formatAssetPrice(idxAsset),
        changePercent: idxAsset.changePercent,
        assetId: idxAsset.id,
      });
    }

    topUs.forEach((stk, i) => {
      entries.push({
        kind: 'stock',
        key: `us-${stk.symbol}`,
        badge: `US #${i + 1}`,
        symbol: stk.symbol,
        yahooSymbol: stk.symbol,
        priceText: `$${stk.price.toFixed(2)}`,
        changePercent: stk.changePercent,
      });
    });

    topIdx.forEach((stk, i) => {
      entries.push({
        kind: 'stock',
        key: `id-${stk.symbol}`,
        badge: `IDX #${i + 1}`,
        symbol: stk.symbol,
        yahooSymbol: `${stk.symbol}.JK`,
        priceText: `Rp ${Math.round(stk.price).toLocaleString('en-US')}`,
        changePercent: stk.changePercent,
      });
    });

    return {
      entries,
      openIndexCount: openIndices.length,
    };
  }, [assets, usMovers, idxMovers, now]);

  const tapeDurationSec = Math.max(
    120,
    Math.round(Math.max(1, liveTapeItems.entries.length) * 16)
  );

  const searchPlaceholder =
    activeRoute === 'watchlist'
      ? 'Filter watchlist or lookup symbol (SPX, DXY, BBCA)...'
      : activeRoute === 'portfolio'
        ? 'Lookup US/IDX stocks or filter portfolio...'
        : activeRoute === 'stocks'
          ? 'Search US or IDX stock & chart (NVDA, BBCA)...'
          : activeRoute === 'heatmap'
            ? 'Filter heatmap by symbol, company, or sector...'
            : 'Search US & IDX stocks, EIDO, DXY, indices (SPX, IHSG)...';

  const handleSelectSearchItem = (item: StockSearchResult) => {
    setSearchExpanded(false);
    if (item.assetId) {
      onSelectAsset(item.assetId);
    }
    onInspectSymbol(item.yahooSymbol, item.assetId);
  };

  const handleNavClick = (route: AppRoute) => {
    setNavAwake(true);
    if (navIdleTimerRef.current) window.clearTimeout(navIdleTimerRef.current);
    navIdleTimerRef.current = window.setTimeout(() => setNavAwake(false), 2400);
    onNavigate(route);
  };

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 pt-safe liquid-glass-strong !border-x-0 !border-t-0 transition-colors"
    >
      {/* Main Row */}
      <div className="px-4 lg:px-6 py-2.5 lg:py-3 flex items-center justify-between gap-3">
        {/* Left: Brand + Clock + Translucent Glass Tab Switcher */}
        <div className="flex items-center gap-4 xl:gap-5 min-w-0">
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-2 text-left shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] rounded-lg"
          >
            <TrendingUp className="w-6 h-6 text-[#0F7033] dark:text-[#4ADE80]" />
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2.5">
              <span className="text-lg lg:text-xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white whitespace-nowrap">
                Stocks
              </span>
              <span className="hidden xl:inline text-xs font-mono font-semibold text-[#4A4D57] dark:text-[#B4B8C4] tabular-nums whitespace-nowrap">
                {clock.full}
              </span>
              <span className="xl:hidden text-[10px] sm:text-xs font-mono font-semibold text-[#4A4D57] dark:text-[#B4B8C4] tabular-nums whitespace-nowrap">
                {clock.short}
              </span>
            </div>
          </button>

          {/* Desktop Translucent Liquid Glass Tab Switcher (subtle idle contrast, wakes & animates on click/hover) */}
          <nav
            aria-label="Primary Navigation"
            onMouseEnter={() => setNavAwake(true)}
            onMouseLeave={() => setNavAwake(false)}
            className={`hidden lg:flex items-center gap-0.5 xl:gap-1 p-1 rounded-full max-w-full overflow-x-auto no-scrollbar liquid-glass-pill transition-all duration-500 ${
              navAwake
                ? 'opacity-100 scale-100'
                : 'opacity-65 hover:opacity-100 focus-within:opacity-100'
            }`}
          >
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeRoute === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={() => handleNavClick(tab.id)}
                  className={`relative px-2.5 xl:px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors focus:outline-none ${
                    isActive
                      ? 'text-white'
                      : 'text-[#6C6C70] dark:text-[#AEAEB2] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="header-active-tab-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 32 }}
                      className="absolute inset-0 rounded-full bg-[#0071E3]/90 dark:bg-[#0A84FF]/90 shadow-[0_2px_10px_rgba(0,113,227,0.35)]"
                    />
                  )}
                  <motion.span
                    animate={isActive ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                    transition={{ duration: 0.28 }}
                    className="relative z-10 inline-flex items-center"
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </motion.span>
                  <span className="relative z-10">{tab.label}</span>
                </motion.button>
              );
            })}
          </nav>
        </div>

        {/* Right Controls: Icon-Only Expandable Search beside Live Button + Theme Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />

          {/* Expandable Search beside Live WSS (Icon-only until clicked) */}
          <div ref={searchWrapRef} className="relative flex items-center">
            <AnimatePresence mode="wait" initial={false}>
              {!searchExpanded ? (
                <motion.button
                  key="search-trigger-btn"
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.16 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setSearchExpanded(true)}
                  aria-label="Open symbol search"
                  title="Search US & IDX stocks, indices, DXY"
                  className="min-h-[36px] sm:min-h-[32px] w-9 sm:w-8 rounded-full liquid-glass-pill hover:brightness-95 dark:hover:brightness-110 flex items-center justify-center text-[#1C1C1E] dark:text-white transition-all shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                </motion.button>
              ) : (
                <motion.div
                  key="search-expanded-box"
                  initial={{ width: 40, opacity: 0.4 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 40, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="relative flex items-center"
                >
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#0071E3] dark:text-[#0A84FF] pointer-events-none z-10" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    aria-label="Search markets, stocks, indices, or news"
                    className="w-[175px] sm:w-[255px] lg:w-[290px] bg-white dark:bg-[#1C1C1E] text-[#1C1C1E] dark:text-white placeholder:text-[#6C6C70] dark:placeholder:text-[#8E8E93] text-xs rounded-full pl-8 pr-8 py-1.5 border border-[#0071E3] dark:border-[#0A84FF] shadow-sm focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (searchQuery) {
                        onSearchChange('');
                        searchInputRef.current?.focus();
                      } else {
                        setSearchExpanded(false);
                      }
                    }}
                    aria-label={searchQuery ? 'Clear search' : 'Close search'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dropdown Anchored Cleanly Under Search Button/Input */}
            {searchExpanded && (
              <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[54px] sm:top-full sm:mt-2 sm:w-[390px] z-50 rounded-2xl liquid-glass-strong shadow-2xl overflow-hidden max-h-[420px] flex flex-col">
                <div className="px-3.5 py-2 border-b border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between text-[11px] font-semibold text-[#6C6C70] dark:text-[#8E8E93]">
                  <span className="truncate">
                    {searchQuery.trim()
                      ? `US & IDX Results for "${searchQuery.trim()}"`
                      : 'Popular US, Indonesia & Macro Symbols'}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {searchLoading && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0071E3]" />
                    )}
                    <button
                      type="button"
                      onClick={() => setSearchExpanded(false)}
                      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#E5E5EA]/70 dark:bg-[#2C2C2E] text-[#6C6C70] dark:text-[#AEAEB2]"
                    >
                      Esc
                    </button>
                  </div>
                </div>

                <div className="overflow-y-auto divide-y divide-[#E5E5EA]/70 dark:divide-[#2C2C2E]/60">
                  {searchResults.length === 0 && !searchLoading ? (
                    <div className="p-4 text-center text-xs text-[#6C6C70] dark:text-[#8E8E93]">
                      No matching US or Indonesia tickers found.
                    </div>
                  ) : (
                    searchResults.map((item) => {
                      const hasQuote = typeof item.price === 'number' && item.price > 0;
                      const isGain = (item.changePercent ?? 0) >= 0;
                      return (
                        <button
                          key={item.yahooSymbol}
                          type="button"
                          onClick={() => handleSelectSearchItem(item)}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-[#F2F2F7] dark:hover:bg-[#2C2C2E]/70 flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs sm:text-sm text-[#1C1C1E] dark:text-white truncate">
                                {item.symbol}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E5E5EA]/80 dark:bg-[#2C2C2E] text-[#6C6C70] dark:text-[#AEAEB2] shrink-0">
                                {item.exchange}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] truncate">
                              {item.name}
                            </p>
                          </div>

                          {item.sparklinePoints && item.sparklinePoints.length >= 2 && (
                            <div className="w-14 h-7 shrink-0">
                              <GoogleFinanceMiniChart
                                points={item.sparklinePoints}
                                prevClose={item.prevClose ?? item.sparklinePoints[0]}
                                isGain={isGain}
                                progressRatio={item.sessionOpen ? 0.85 : 1}
                                className="w-14 h-7"
                                showEndDot={Boolean(item.sessionOpen)}
                              />
                            </div>
                          )}

                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-xs text-[#1C1C1E] dark:text-white tabular-nums">
                              {formatDropdownPrice(item)}
                            </div>
                            {hasQuote && typeof item.changePercent === 'number' && (
                              <div className="mt-0.5 flex justify-end">
                                <GoogleFinanceDeltaPill changePercent={item.changePercent} compact />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Live Pulse / WSS Toggle */}
          <button
            type="button"
            onClick={onTogglePulse}
            className={`min-h-[36px] sm:min-h-[32px] px-2.5 sm:px-3 py-1 rounded-full border text-[11px] sm:text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              isPulseActive
                ? 'bg-[#22C55E]/16 dark:bg-[#4ADE80]/18 border-[#22C55E]/45 dark:border-[#4ADE80]/45 text-[#0F7033] dark:text-[#4ADE80]'
                : 'liquid-glass-pill text-[#4A4D57] dark:text-[#B4B8C4]'
            }`}
          >
            <Activity className={`w-3.5 h-3.5 ${isPulseActive ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">
              {isPulseActive ? (wsConnected ? 'Live WSS' : 'Live Pulse') : 'Pulse Paused'}
            </span>
            <span className="sm:hidden">{isPulseActive ? 'Live' : 'Paused'}</span>
          </button>

          {/* Theme Toggle (Light -> Dark -> Paper Matte Monochrome) */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={`Theme: ${themeMode === 'monochrome' ? 'Paper Matte' : themeMode === 'dark' ? 'Dark' : 'Light'} (tap to cycle)`}
            aria-label={`Current theme ${themeMode === 'monochrome' ? 'Paper Matte Monochrome' : themeMode}. Tap to switch theme.`}
            className="min-h-[36px] sm:min-h-[32px] px-2.5 py-1 rounded-full liquid-glass-pill hover:brightness-95 dark:hover:brightness-110 flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-bold text-[#1C1C1E] dark:text-white transition-all shrink-0 whitespace-nowrap"
          >
            {themeMode === 'dark' ? (
              <Moon className="w-3.5 h-3.5" />
            ) : themeMode === 'monochrome' ? (
              <FileText className="w-3.5 h-3.5" />
            ) : (
              <Sun className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {themeMode === 'monochrome' ? 'Matte' : themeMode === 'dark' ? 'Dark' : 'Light'}
            </span>
          </button>
        </div>
      </div>

      {/* Breaking News Marquee Ticker Bar */}
      <div className="bg-[#E5E5EA]/55 dark:bg-black/45 border-t border-black/8 dark:border-white/10 py-1.5 px-4 lg:px-6 flex items-center gap-3 overflow-hidden text-[11px] sm:text-xs">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EF4444]/18 text-[#C41C16] dark:text-[#FF6B63] font-bold text-[10px] tracking-wider uppercase shrink-0">
          <Megaphone className="w-3 h-3" />
          BREAKING
        </span>
        <div className="relative overflow-hidden whitespace-nowrap flex-1 min-w-0">
          <div
            className="ticker-scroll gap-8"
            style={{ animationDuration: `${tickerDurationSec}s` }}
          >
            {[...marqueeStories, ...marqueeStories].map((story, idx) => (
              <button
                key={`${story.id}-${idx}`}
                type="button"
                onClick={() => onOpenStory(story)}
                className="flex items-center gap-2 text-left text-[#1C1C1E] dark:text-[#E5E5EA] hover:text-[#0071E3] dark:hover:text-[#0A84FF] transition-colors shrink-0"
              >
                <span className="font-bold text-[#1C1C1E] dark:text-white">{story.publisher}</span>
                <span aria-hidden="true">·</span>
                <span>{story.headline}</span>
                <span className="text-[#4A4D57] dark:text-[#B4B8C4]">{story.timeAgo}</span>
                <span aria-hidden="true" className="text-[#D1D1D6] dark:text-[#38383A] ml-4">
                  •
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Open Session Indices & Top 3 High-Impact Stocks Running Strip */}
      <div className="bg-white/60 dark:bg-black/60 border-t border-black/8 dark:border-white/10 py-1.5 px-4 lg:px-6 flex items-center gap-3 overflow-hidden text-[11px] sm:text-xs">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#22C55E]/16 text-[#0F7033] dark:text-[#4ADE80] font-bold text-[10px] tracking-wider uppercase shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] dark:bg-[#4ADE80] animate-pulse" />
          {liveTapeItems.openIndexCount > 0 ? 'OPEN & TOP 3' : 'LIVE TOP 3'}
        </span>
        <div className="relative overflow-hidden whitespace-nowrap flex-1 min-w-0">
          {liveTapeItems.entries.length > 0 ? (
            <div
              className="ticker-scroll gap-6"
              style={{ animationDuration: `${tapeDurationSec}s` }}
            >
              {[...liveTapeItems.entries, ...liveTapeItems.entries].map((item, idx) => {
                const isGain = item.changePercent >= 0;
                return (
                  <button
                    key={`${item.key}-${idx}`}
                    type="button"
                    onClick={() => {
                      if (item.kind === 'index') {
                        onSelectAsset(item.assetId);
                        onNavigate('dashboard');
                      } else {
                        onInspectSymbol(item.yahooSymbol);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full liquid-glass-pill hover:border-[#0071E3] dark:hover:border-[#0A84FF] transition-colors shrink-0"
                  >
                    <span
                      className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.2 rounded ${
                        item.kind === 'index'
                          ? 'bg-[#30D158]/20 text-[#16803C] dark:text-[#30D158]'
                          : 'bg-[#0071E3]/15 text-[#0071E3] dark:text-[#0A84FF]'
                      }`}
                    >
                      {item.badge}
                    </span>
                    <span className="font-bold text-[#1C1C1E] dark:text-white">{item.symbol}</span>
                    <span className="font-mono font-semibold text-[#1C1C1E] dark:text-[#E5E5EA] tabular-nums">
                      {item.priceText}
                    </span>
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        isGain
                          ? 'text-[#16803C] dark:text-[#30D158]'
                          : 'text-[#D7261C] dark:text-[#FF453A]'
                      }`}
                    >
                      {isGain ? '+' : ''}
                      {item.changePercent.toFixed(2)}%
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-[#6C6C70] dark:text-[#8E8E93] text-[11px]">
              Loading open-session indices &amp; top impact stocks...
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
