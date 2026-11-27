import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  Briefcase,
  CalendarDays,
  Crosshair,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  Megaphone,
  Newspaper,
  RefreshCw,
  Search,
  Settings,
  TrendingUp,
  X,
} from 'lucide-react';
import { getThemeMeta } from '../hooks/useTheme';
import {
  AppRoute,
  ClientFeedTransportDiagnostics,
  MarketAsset,
  NewsStory,
  ServerFeedDiagnosticsResponse,
  StockMover,
  StockSearchResult,
  ThemeMode,
} from '../types/market';
import { formatAssetPrice, formatWibClock } from '../utils/formatters';
import { getAllMarketSessions, isIndexOpenSession } from '../utils/marketSessions';
import { FeedDiagnosticsBadge } from './FeedDiagnosticsBadge';
import { GoogleFinanceDeltaPill, GoogleFinanceMiniChart } from './GoogleFinanceMiniChart';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  themeMode: ThemeMode;
  onOpenSettings: () => void;
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
  serverDiagnostics: ServerFeedDiagnosticsResponse | null;
  clientTransport: ClientFeedTransportDiagnostics;
  feedsLive: boolean;
  onRefreshAll: () => void | Promise<void>;
  onRefreshDiagnostics: () => void;
  onPrefetchRoute?: (route: AppRoute) => void;
}

const INDEX_IDS = ['SPX', 'IXIC', 'DJI', 'IHSG', 'EIDO', 'N225', 'HSI', 'TAIEX', 'KOSPI', 'SSEC', 'NIFTY'];

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
  { id: 'ict', label: 'ICT Radar', icon: Crosshair },
  { id: 'news', label: 'News', icon: Newspaper },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
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

const HeaderLiveClock: React.FC = React.memo(() => {
  const [tickNow, setTickNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setTickNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const clock = formatWibClock(tickNow);
  return (
    <>
      <span
        data-testid="header-clock-full"
        className="hidden xl:inline text-xs font-mono font-semibold text-[#4A4D57] dark:text-[#B4B8C4] tabular-nums whitespace-nowrap"
      >
        {clock.full}
      </span>
      <span
        data-testid="header-clock-short"
        className="hidden sm:inline xl:hidden text-xs font-mono font-semibold text-[#4A4D57] dark:text-[#B4B8C4] tabular-nums whitespace-nowrap"
      >
        {clock.short}
      </span>
      <span className="sm:hidden text-[9px] font-mono font-semibold text-[#4A4D57] dark:text-[#B4B8C4] tabular-nums whitespace-nowrap truncate">
        {tickNow.toLocaleTimeString('en-GB', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })}{' '}
        WIB
      </span>
    </>
  );
});

export const Header: React.FC<HeaderProps> = ({
  activeRoute,
  onNavigate,
  searchQuery,
  onSearchChange,
  themeMode,
  onOpenSettings,
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
  serverDiagnostics,
  clientTransport,
  feedsLive,
  onRefreshAll,
  onRefreshDiagnostics,
  onPrefetchRoute,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [navAwake, setNavAwake] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
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
    const id = window.setInterval(() => setNow(new Date()), 30_000);
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
  const marqueeStories = useMemo(
    () => tickerStories.filter((s) => Boolean(s.isBreaking)).slice(0, 12),
    [tickerStories]
  );
  const tickerDurationSec = Math.max(96, Math.round(Math.max(1, marqueeStories.length) * 16));

  const liveTapeItems = useMemo(() => {
    const sessions = getAllMarketSessions(now);
    const openIndices = assets.filter(
      (a) => INDEX_IDS.includes(a.id) && isIndexOpenSession(a.id, now)
    );
    const openMacroMovers = assets
      .filter((a) => !INDEX_IDS.includes(a.id) && a.marketSessionOpen !== false)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 8);

    // Strictly surface individual US / IDX equities only while their cash equity session is live/open
    const topUs = sessions.us.tone === 'open' ? usMovers.slice(0, 8) : [];
    const topIdx = sessions.idx.tone === 'open' ? idxMovers.slice(0, 8) : [];

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

    for (const idxAsset of openIndices.slice(0, 8)) {
      entries.push({
        kind: 'index',
        key: `idx-${idxAsset.id}`,
        badge: 'OPEN',
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

    // If neither US nor IDX equities cash session is open (or to fill live open tape to 8 movers), include live 24/5-24/7 open FX, commodities, bonds & crypto
    if (entries.length < 8) {
      for (const macroAsset of openMacroMovers) {
        if (entries.length >= 8 && topUs.length === 0 && topIdx.length === 0) break;
        if (entries.some((e) => e.kind === 'index' && e.assetId === macroAsset.id)) continue;
        entries.push({
          kind: 'index',
          key: `open-${macroAsset.id}`,
          badge: macroAsset.id === 'BTCUSD' || macroAsset.id === 'ETHUSD' ? '24/7' : 'LIVE',
          symbol: macroAsset.symbol,
          priceText: formatAssetPrice(macroAsset),
          changePercent: macroAsset.changePercent,
          assetId: macroAsset.id,
        });
        if (entries.length >= 16) break;
      }
    }

    return {
      entries,
      openIndexCount: openIndices.length + topUs.length + topIdx.length,
      hasOpenEquityExchange: topUs.length > 0 || topIdx.length > 0,
    };
  }, [assets, usMovers, idxMovers, now]);

  const tapeDurationSec = Math.max(
    110,
    Math.round(Math.max(1, liveTapeItems.entries.length) * 14)
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

  const handleRefreshAllClick = async () => {
    if (isRefreshingAll) return;
    setIsRefreshingAll(true);
    try {
      await Promise.all([
        Promise.resolve(onRefreshAll()),
        new Promise((resolve) => window.setTimeout(resolve, 450)),
      ]);
    } finally {
      setIsRefreshingAll(false);
    }
  };

  return (
    <>
    <header
      ref={headerRef}
      className="sticky top-0 z-40 pt-safe liquid-glass-strong !border-x-0 !border-t-0"
    >
      {/* Main Row: Mobile stays flex; Desktop uses CSS Grid to isolate Brand+Clock from Search+Actions */}
      <div className="relative px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-4">
        {/* Left Grid Track: Brand + Full Date/Time Clock */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 lg:justify-self-start lg:overflow-hidden">
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-1.5 sm:gap-2 text-left min-w-0 shrink lg:shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] dark:focus-visible:ring-[#2962FF] rounded-lg"
          >
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-[#0F7638] dark:text-[#26A69A] shrink-0" />
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2.5 leading-tight min-w-0">
              <span className="text-base sm:text-lg lg:text-xl font-extrabold tracking-tight text-[#0A2540] dark:text-[#F0F3FA] whitespace-nowrap">
                Stocks
              </span>
              <HeaderLiveClock />
            </div>
          </button>
        </div>

        {/* Right Grid Track: Mobile-Safe Compact Bar (PWA + Search + Refresh All + Live Diagnostics + Settings) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 lg:justify-self-end" data-testid="header-actions-bar">
          <PWAInstallButton />

          {/* Expandable Search (Full-row overlay on mobile <640px so icons never overlap, inline on sm+) */}
          <div ref={searchWrapRef} className="sm:relative flex items-center shrink-0">
            {!searchExpanded ? (
              <button
                type="button"
                onClick={() => setSearchExpanded(true)}
                aria-label="Open symbol search"
                title="Search US & IDX stocks, indices, DXY"
                className="h-8 w-8 rounded-full liquid-glass-pill hover:brightness-95 dark:hover:brightness-110 flex items-center justify-center text-[#1C1C1E] dark:text-white transition-all shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSearchExpanded(false)}
                  aria-label="Close symbol search"
                  className="sm:hidden h-8 w-8 rounded-full liquid-glass-pill flex items-center justify-center text-[#1C1C1E] dark:text-white shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="fixed sm:static inset-x-3 top-2 sm:inset-auto z-50 sm:z-auto flex items-center">
                  <div className="relative w-full sm:w-[255px] lg:w-[290px]">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#0071E3] dark:text-[#38BDF8] pointer-events-none z-10" />
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={searchQuery}
                      onChange={(e) => onSearchChange(e.target.value)}
                      placeholder={searchPlaceholder}
                      aria-label="Search markets, stocks, indices, or news"
                      className="w-full bg-white dark:bg-[#141B28] text-[#1C1C1E] dark:text-white placeholder:text-[#6C6C70] dark:placeholder:text-[#8E8E93] text-xs rounded-full pl-8 pr-8 py-1.5 border border-[#0071E3] dark:border-[#38BDF8] shadow-md sm:shadow-sm focus:outline-none"
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
                  </div>
                </div>
              </>
            )}

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

          {/* Manual Refresh All Market Feeds Button (Assets, News & Economic Calendar) */}
          <button
            type="button"
            data-testid="header-refresh-all-btn"
            onClick={() => void handleRefreshAllClick()}
            disabled={isRefreshingAll}
            aria-label="Refresh All feeds"
            title="Refresh All (Assets, News & Economic Calendar)"
            className="h-8 w-8 md:w-auto md:px-2.5 rounded-full liquid-glass-pill hover:border-[#1D4ED8]/60 dark:hover:border-[#2962FF]/70 velvet:hover:border-[#F9574B]/65 flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-bold text-[#0A2540] dark:text-[#F0F3FA] transition-colors shrink-0 whitespace-nowrap disabled:opacity-75"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 shrink-0 ${
                isRefreshingAll ? 'animate-spin text-[#1D4ED8] dark:text-[#3B82F6] velvet:text-[#F9574B]' : ''
              }`}
            />
            <span className="hidden md:inline">
              {isRefreshingAll ? 'Refreshing...' : 'Refresh All'}
            </span>
          </button>

          {/* Unified Live Stream + Cached/Failover Diagnostics Badge & Drawer */}
          <FeedDiagnosticsBadge
            serverDiagnostics={serverDiagnostics}
            clientTransport={clientTransport}
            feedsLive={feedsLive}
            isPulseActive={isPulseActive}
            wsConnected={wsConnected}
            onTogglePulse={onTogglePulse}
            onRefreshAll={onRefreshAll}
            onRefreshDiagnostics={onRefreshDiagnostics}
          />

          {/* Dedicated Settings & Theme Switcher Trigger */}
          {(() => {
            const activeThemeMeta = getThemeMeta(themeMode);
            return (
              <button
                type="button"
                data-testid="header-settings-btn"
                onClick={onOpenSettings}
                title={`Settings · Theme: ${activeThemeMeta.label}`}
                aria-label={`Open Settings (Current theme: ${activeThemeMeta.label})`}
                className="h-8 w-8 sm:w-auto sm:px-2.5 rounded-full liquid-glass-pill hover:border-[#1D4ED8]/60 dark:hover:border-[#2962FF]/70 velvet:hover:border-[#F9574B]/65 parchment:hover:border-[#B4410E]/60 flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-bold text-[#0A2540] dark:text-[#F0F3FA] transition-colors shrink-0 whitespace-nowrap"
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{activeThemeMeta.label}</span>
              </button>
            );
          })()}
        </div>
      </div>

      {/* Desktop Row 2: Dedicated CSS Grid Centered Top Menu (zero overlap with Brand & Clock; hidden on mobile) */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center px-6 pb-2">
        <nav
          aria-label="Primary Navigation"
          onMouseEnter={() => setNavAwake(true)}
          onMouseLeave={() => setNavAwake(false)}
          className={`lg:col-start-2 lg:justify-self-center flex items-center gap-0.5 xl:gap-1 p-1 rounded-xl max-w-full overflow-x-auto no-scrollbar liquid-glass-pill transition-all duration-300 ${
            navAwake
              ? 'opacity-100'
              : 'opacity-95 hover:opacity-100 focus-within:opacity-100'
          }`}
        >
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeRoute === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onMouseEnter={() => onPrefetchRoute?.(tab.id)}
                onFocus={() => onPrefetchRoute?.(tab.id)}
                onClick={() => handleNavClick(tab.id)}
                className={`relative px-2.5 xl:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors duration-150 focus:outline-none ${
                  isActive
                    ? 'text-white'
                    : 'text-[#425466] dark:text-[#9CA3AF] hover:text-[#0A2540] dark:hover:text-[#F0F3FA]'
                }`}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-lg bg-[#1D4ED8] dark:bg-[#2962FF] velvet:bg-[#F9574B] parchment:bg-[#B4410E] transition-all duration-150"
                  />
                )}
                <span
                  className={`relative z-10 inline-flex items-center transition-transform duration-200 ${
                    isActive ? 'scale-105' : 'scale-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Compact Nerve-Style News & Live Tape Bar (Non-sticky below header to keep mobile sticky chrome <= 13%) */}
    </header>
    <div className="relative z-20">
      {/* Verified High-Impact Breaking News Marquee Ticker Bar */}
      <div
        data-testid="breaking-news-bar"
        className="bg-[#E5E5EA]/55 dark:bg-black/45 border-b border-black/8 dark:border-white/10 py-1.5 px-4 lg:px-6 flex items-center gap-3 overflow-hidden text-[11px] sm:text-xs"
      >
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#EF4444]/18 text-[#C41C16] dark:text-[#FF6B63] font-bold text-[10px] tracking-wider uppercase shrink-0">
          <Megaphone className="w-3 h-3" />
          BREAKING
        </span>
        <div className="relative overflow-hidden whitespace-nowrap flex-1 min-w-0">
          {marqueeStories.length > 0 ? (
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
          ) : (
            <span className="text-[11px] text-[#4A4D57] dark:text-[#B4B8C4] font-medium truncate block">
              Monitoring live global &amp; IDX wires — no verified high-impact breaking alerts in the past 4 hours
            </span>
          )}
        </div>
      </div>

      {/* Open Session Indices & Top 8 Live Session Movers Running Strip */}
      <div
        data-testid="live-ticker-strip"
        className="bg-white/60 dark:bg-black/60 border-t border-black/8 dark:border-white/10 py-1.5 px-4 lg:px-6 flex items-center gap-3 overflow-hidden text-[11px] sm:text-xs"
      >
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#22C55E]/16 text-[#0F7033] dark:text-[#4ADE80] font-bold text-[10px] tracking-wider uppercase shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] dark:bg-[#4ADE80] animate-pulse" />
          {liveTapeItems.hasOpenEquityExchange ? 'OPEN TOP 8' : 'LIVE TOP 8'}
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
    </div>
    </>
  );
};
