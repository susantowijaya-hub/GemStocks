import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bookmark,
  Briefcase,
  CalendarDays,
  Clock,
  FileText,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Moon,
  Newspaper,
  Search,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  AppRoute,
  MarketAsset,
  NewsStory,
  StockMover,
  StockSearchResult,
  ThemeMode,
} from '../types/market';
import { formatAssetPrice, formatWibClock } from '../utils/formatters';
import { getAllMarketSessions, isIndexOpenSession } from '../utils/marketSessions';
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

const INDEX_IDS = ['SPX', 'IXIC', 'DJI', 'IHSG', 'HSI', 'TAIEX', 'KOSPI', 'SSEC', 'NIFTY'];

function formatDropdownPrice(item: StockSearchResult): string {
  if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price <= 0) {
    return 'View chart';
  }
  if (item.isIndex) {
    return item.price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const desktopSearchWrapRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchWrapRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

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

  // Close search dropdown on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const inDesktop = desktopSearchWrapRef.current?.contains(target);
      const inMobile = mobileSearchWrapRef.current?.contains(target);
      if (!inDesktop && !inMobile) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, []);

  // Query live US + Indonesia stocks & indices with mini sparklines when search dropdown is active
  useEffect(() => {
    if (!searchOpen) return;
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
  }, [searchQuery, searchOpen]);

  const clock = formatWibClock(now);
  const sessions = getAllMarketSessions(now);
  const sessionList = [sessions.us, sessions.idx, sessions.asia, sessions.crypto];

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
      ? 'Filter watchlist or lookup symbol chart (SPX, IHSG, BBCA, NVDA)...'
      : activeRoute === 'portfolio'
        ? 'Search US/IDX stocks, indices, or filter portfolio...'
        : activeRoute === 'stocks'
          ? 'Search US or IDX stock & chart (NVDA, AAPL, BBCA, IHSG)...'
          : activeRoute === 'news'
            ? 'Search news or lookup symbol chart (SPX, IHSG, BBCA)...'
            : activeRoute === 'calendar'
              ? 'Search macro releases or lookup symbol chart...'
              : 'Search US & IDX stocks or indices for chart (SPX, IHSG, BBCA, NVDA)...';

  const handleSelectSearchItem = (item: StockSearchResult) => {
    setSearchOpen(false);
    if (item.assetId) {
      onSelectAsset(item.assetId);
    }
    onInspectSymbol(item.yahooSymbol, item.assetId);
  };

  const renderSearchDropdown = () => {
    if (!searchOpen) return null;
    return (
      <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#D1D1D6] dark:border-[#2C2C2E] shadow-2xl overflow-hidden max-h-[420px] flex flex-col">
        <div className="px-3.5 py-2 border-b border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between text-[11px] font-semibold text-[#6C6C70] dark:text-[#8E8E93]">
          <span>
            {searchQuery.trim()
              ? `US & IDX Results for "${searchQuery.trim()}"`
              : 'Popular US & Indonesia Indices and Stocks'}
          </span>
          {searchLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0071E3]" />}
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

                  {/* Mini Chart Preview inside Search Dropdown */}
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
    );
  };

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 pt-safe backdrop-blur-xl bg-white/90 dark:bg-black/80 border-b border-[#E5E5EA] dark:border-[#2C2C2E] transition-colors"
    >
      {/* Main Row */}
      <div className="px-4 lg:px-6 py-2.5 lg:py-3 flex items-center justify-between gap-3">
        {/* Left: Brand + Clock + Desktop Tabs */}
        <div className="flex items-center gap-5 min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2 text-left shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3] rounded-lg"
          >
            <TrendingUp className="w-6 h-6 text-[#16803C] dark:text-[#30D158]" />
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2.5">
              <span className="text-lg lg:text-xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white whitespace-nowrap">
                Stocks
              </span>
              <span className="hidden xl:inline text-xs font-mono font-medium text-[#6C6C70] dark:text-[#8E8E93] tabular-nums whitespace-nowrap">
                {clock.full}
              </span>
              <span className="xl:hidden text-[10px] sm:text-xs font-mono font-medium text-[#6C6C70] dark:text-[#8E8E93] tabular-nums whitespace-nowrap">
                {clock.short}
              </span>
            </div>
          </button>

          {/* Desktop Primary Nav */}
          <nav
            aria-label="Primary Navigation"
            className="hidden lg:flex items-center gap-1 p-1 rounded-full bg-[#E5E5EA]/70 dark:bg-[#1C1C1E] border border-[#D1D1D6] dark:border-[#2C2C2E]"
          >
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeRoute === 'dashboard'
                  ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Markets</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('watchlist')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeRoute === 'watchlist'
                  ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Watchlist</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('portfolio')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeRoute === 'portfolio'
                  ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Portfolio</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('stocks')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeRoute === 'stocks'
                  ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Top Stocks</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('news')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeRoute === 'news'
                  ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <Newspaper className="w-3.5 h-3.5" />
              <span>Breaking News</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeRoute === 'calendar'
                  ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
          </nav>
        </div>

        {/* Center: Search Input with Live Chart Dropdown (Desktop & Tablet) */}
        <div ref={desktopSearchWrapRef} className="hidden md:block flex-1 max-w-md mx-2 relative">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6C6C70] dark:text-[#8E8E93] pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setSearchOpen(true);
              }}
              placeholder={searchPlaceholder}
              aria-label="Search markets, stocks, indices, or news"
              className="w-full bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] hover:bg-[#E5E5EA] dark:hover:bg-[#2C2C2E] focus:bg-white dark:focus:bg-[#1C1C1E] text-[#1C1C1E] dark:text-white placeholder:text-[#6C6C70] dark:placeholder:text-[#8E8E93] text-xs rounded-full pl-9 pr-8 py-2 border border-[#D1D1D6] dark:border-[#2C2C2E] focus:border-[#0071E3] dark:focus:border-[#0A84FF] focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {renderSearchDropdown()}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />

          {/* Live Pulse / WSS Toggle */}
          <button
            type="button"
            onClick={onTogglePulse}
            className={`min-h-[36px] sm:min-h-[32px] px-2.5 sm:px-3 py-1 rounded-full border text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              isPulseActive
                ? 'bg-[#30D158]/15 border-[#30D158]/40 text-[#16803C] dark:text-[#30D158]'
                : 'bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] border-[#D1D1D6] dark:border-[#2C2C2E] text-[#6C6C70] dark:text-[#8E8E93]'
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
            className="min-h-[36px] sm:min-h-[32px] px-2.5 py-1 rounded-full bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] hover:bg-[#D1D1D6] dark:hover:bg-[#2C2C2E] border border-[#D1D1D6] dark:border-[#2C2C2E] flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-semibold text-[#1C1C1E] dark:text-white transition-colors shrink-0"
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

      {/* Mobile Search Bar Row */}
      <div ref={mobileSearchWrapRef} className="md:hidden px-4 pb-2 relative">
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#6C6C70] dark:text-[#8E8E93] pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setSearchOpen(true);
            }}
            placeholder={searchPlaceholder}
            aria-label="Search"
            className="w-full bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] text-[#1C1C1E] dark:text-white placeholder:text-[#6C6C70] dark:placeholder:text-[#8E8E93] text-xs rounded-full pl-8 pr-8 py-2 border border-[#D1D1D6] dark:border-[#2C2C2E] focus:border-[#0071E3] dark:focus:border-[#0A84FF] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6C6C70] dark:text-[#8E8E93] p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {renderSearchDropdown()}
      </div>

      {/* Global Market Session Status Strip */}
      <div className="border-t border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#F2F2F7]/70 dark:bg-[#121214] px-4 lg:px-6 py-1.5 flex items-center gap-3 overflow-x-auto no-scrollbar text-[11px]">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#8E8E93] shrink-0">
          <Clock className="w-3 h-3" />
          Sessions
        </span>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {sessionList.map((s) => {
            const dotColor =
              s.tone === 'open'
                ? 'bg-[#30D158]'
                : s.tone === 'extended' || s.tone === 'break'
                  ? 'bg-[#FF9F0A]'
                  : 'bg-[#8E8E93]';
            const badgeText =
              s.tone === 'open'
                ? 'text-[#16803C] dark:text-[#30D158]'
                : s.tone === 'extended' || s.tone === 'break'
                  ? 'text-[#B25E09] dark:text-[#FF9F0A]'
                  : 'text-[#6C6C70] dark:text-[#8E8E93]';

            return (
              <div
                key={s.id}
                title={`${s.label}: ${s.stateLabel} (${s.detail})`}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/80 dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] whitespace-nowrap"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                <span className="font-semibold text-[#1C1C1E] dark:text-white">{s.shortLabel}:</span>
                <span className={`font-bold ${badgeText}`}>{s.stateLabel}</span>
                <span className="hidden xl:inline text-[10px] text-[#6C6C70] dark:text-[#8E8E93]">
                  · {s.detail}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Breaking News Marquee Ticker Bar (0.5x slower readable speed) */}
      <div className="bg-[#E5E5EA]/60 dark:bg-[#0D0D0E] border-t border-[#E5E5EA] dark:border-[#2C2C2E] py-1.5 px-4 lg:px-6 flex items-center gap-3 overflow-hidden text-[11px] sm:text-xs">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FF453A]/15 text-[#D7261C] dark:text-[#FF453A] font-bold text-[10px] tracking-wider uppercase shrink-0">
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
                <span className="text-[#6C6C70] dark:text-[#8E8E93]">{story.timeAgo}</span>
                <span aria-hidden="true" className="text-[#D1D1D6] dark:text-[#38383A] ml-4">
                  •
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Open Session Indices & Top 3 High-Impact Stocks Running Strip (0.5x speed) */}
      <div className="bg-white/95 dark:bg-[#07080A] border-t border-[#E5E5EA] dark:border-[#2C2C2E] py-1.5 px-4 lg:px-6 flex items-center gap-3 overflow-hidden text-[11px] sm:text-xs">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#30D158]/15 text-[#16803C] dark:text-[#30D158] font-bold text-[10px] tracking-wider uppercase shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
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
                    className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#F2F2F7] dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] hover:border-[#0071E3] dark:hover:border-[#0A84FF] transition-colors shrink-0"
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

