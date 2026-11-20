/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BottomDock } from './components/BottomDock';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { MarketDashboardView } from './components/MarketDashboardView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AuthProvider } from './contexts/AuthContext';
import { useLiveMarket } from './hooks/useLiveMarket';
import { useTheme } from './hooks/useTheme';
import { AppRoute, CalendarCatalyst, NewsStory } from './types/market';

const WatchlistView = lazy(() =>
  import('./components/WatchlistView').then((m) => ({ default: m.WatchlistView }))
);
const PortfolioView = lazy(() =>
  import('./components/PortfolioView').then((m) => ({ default: m.PortfolioView }))
);
const TopStocksView = lazy(() =>
  import('./components/TopStocksView').then((m) => ({ default: m.TopStocksView }))
);
const MarketHeatmapView = lazy(() =>
  import('./components/MarketHeatmapView').then((m) => ({ default: m.MarketHeatmapView }))
);
const NewsFeedView = lazy(() =>
  import('./components/NewsFeedView').then((m) => ({ default: m.NewsFeedView }))
);
const EconomicCalendarView = lazy(() =>
  import('./components/EconomicCalendarView').then((m) => ({ default: m.EconomicCalendarView }))
);
const MarketExtractShareView = lazy(() =>
  import('./components/MarketExtractShareView').then((m) => ({ default: m.MarketExtractShareView }))
);
const NewsModal = lazy(() =>
  import('./components/NewsModal').then((m) => ({ default: m.NewsModal }))
);
const SymbolDetailModal = lazy(() =>
  import('./components/SymbolDetailModal').then((m) => ({ default: m.SymbolDetailModal }))
);

const RouteLoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center py-20 text-xs font-semibold text-[#4A4D57] dark:text-[#B4B8C4] gap-2">
    <Loader2 className="w-4 h-4 animate-spin text-[#0071E3] dark:text-[#3898FF]" />
    <span>Loading terminal view...</span>
  </div>
);

const VALID_ROUTES: AppRoute[] = ['dashboard', 'watchlist', 'portfolio', 'stocks', 'heatmap', 'news', 'calendar', 'extract'];

function getInitialRoute(): AppRoute {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace('#', '') as AppRoute;
  return VALID_ROUTES.includes(hash) ? hash : 'dashboard';
}

function StocksTerminalShell() {
  const { themeMode, toggleTheme } = useTheme();
  const {
    assets,
    newsStories,
    economicEvents,
    nextCatalyst,
    fxRates,
    usMovers,
    idxMovers,
    usMoversBucket,
    idxMoversBucket,
    stocksUpdatedAt,
    stocksLoading,
    heatmapData,
    heatmapLoading,
    refreshHeatmap,
    dailySummary,
    dailySummaryLoading,
    refreshDailySummary,
    marketIntelligence,
    intelligenceLoading,
    refreshMarketIntelligence,
    isPulseActive,
    wsConnected,
    feedsLive,
    flashMap,
    togglePulse,
    loadChartTimeframe,
    refreshStocks,
    refreshAll,
  } = useLiveMarket();

  const [activeRoute, setActiveRoute] = useState<AppRoute>(getInitialRoute);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('SPX');
  const [inspectedSymbol, setInspectedSymbol] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPercentMode, setIsPercentMode] = useState<boolean>(true);
  const [activeStory, setActiveStory] = useState<NewsStory | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3 * 3600 + 42 * 60 + 15);
  const lastRollRefreshRef = useRef<number>(0);

  // Sync browser hash navigation (Back/Forward on Desktop, Android, and iOS Safari)
  useEffect(() => {
    const handleHashChange = () => {
      const next = window.location.hash.replace('#', '') as AppRoute;
      if (VALID_ROUTES.includes(next)) {
        setActiveRoute(next);
      } else {
        setActiveRoute('dashboard');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Automatically pick the next non-expired catalyst if nextCatalyst's timestamp has elapsed
  const activeCatalyst = useMemo<CalendarCatalyst | null>(() => {
    const now = Date.now();
    if (nextCatalyst && nextCatalyst.targetEpochMs > now) {
      return nextCatalyst;
    }
    const futureEvents = economicEvents
      .map((ev) => ({
        ev,
        ts: ev.isoDate ? Date.parse(ev.isoDate) : NaN,
      }))
      .filter((x) => Number.isFinite(x.ts) && x.ts > now)
      .sort((a, b) => a.ts - b.ts);

    const picked =
      futureEvents.find((x) => x.ev.impact === 'HIGH') ?? futureEvents[0];
    if (picked) {
      return {
        title: picked.ev.title,
        currency: picked.ev.currency,
        timeWib: picked.ev.timeWib,
        targetEpochMs: picked.ts,
        description: picked.ev.description,
      };
    }
    return nextCatalyst;
  }, [nextCatalyst, economicEvents]);

  const activeTargetEpochMs = activeCatalyst?.targetEpochMs ?? null;
  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;

  // Live countdown ticker with automatic reset/roll-forward when hitting 00h 00m 00s
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      if (activeTargetEpochMs && activeTargetEpochMs > now) {
        const diff = Math.floor((activeTargetEpochMs - now) / 1000);
        setCountdownSeconds((prev) => (prev === diff ? prev : diff));
        return;
      }

      // If no future timestamped event is loaded yet, roll smoothly and refresh feeds
      setCountdownSeconds((prev) => {
        if (prev > 1) return prev - 1;
        if (now - lastRollRefreshRef.current > 60_000) {
          lastRollRefreshRef.current = now;
          refreshAllRef.current();
        }
        // Reset to next 4-hour macro window limit so timer never stalls at 00:00:00
        return 4 * 3600;
      });
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [activeTargetEpochMs]);

  const handleNavigate = useCallback((route: AppRoute) => {
    setActiveRoute(route);
    setSearchQuery('');
    if (typeof window !== 'undefined') {
      const nextHash = `#${route}`;
      if (window.location.hash !== nextHash) {
        window.history.pushState(null, '', nextHash);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleToggleBadgeMode = useCallback(() => {
    setIsPercentMode((prev) => !prev);
  }, []);

  const handleInspectSymbol = useCallback(
    (yahooSymbol: string, builtInAssetId?: string) => {
      if (builtInAssetId) {
        setSelectedAssetId(builtInAssetId);
      }
      setInspectedSymbol(yahooSymbol);
    },
    []
  );

  return (
    <div className="min-h-dvh flex flex-col text-[#1C1C1E] dark:text-white transition-colors selection:bg-[#0071E3]/20 dark:selection:bg-[#0A84FF]/30">
      <Header
        activeRoute={activeRoute}
        onNavigate={handleNavigate}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        themeMode={themeMode}
        onToggleTheme={toggleTheme}
        isPulseActive={isPulseActive}
        wsConnected={wsConnected || feedsLive}
        onTogglePulse={togglePulse}
        tickerStories={newsStories}
        onOpenStory={setActiveStory}
        assets={assets}
        usMovers={usMovers}
        idxMovers={idxMovers}
        onSelectAsset={setSelectedAssetId}
        onInspectSymbol={handleInspectSymbol}
      />

      <main className="flex-1 flex flex-col">
        <Suspense fallback={<RouteLoadingFallback />}>
        {activeRoute === 'dashboard' && (
          <MarketDashboardView
            assets={assets}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
            searchQuery={searchQuery}
            flashMap={flashMap}
            onNavigate={handleNavigate}
            onLoadTimeframe={loadChartTimeframe}
            themeMode={themeMode}
            marketIntelligence={marketIntelligence}
            intelligenceLoading={intelligenceLoading}
            onRefreshIntelligence={refreshMarketIntelligence}
          />
        )}

        {activeRoute === 'watchlist' && (
          <WatchlistView
            assets={assets}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
            onNavigate={handleNavigate}
            onInspectSymbol={handleInspectSymbol}
            searchQuery={searchQuery}
            isPercentMode={isPercentMode}
            onToggleBadgeMode={handleToggleBadgeMode}
            flashMap={flashMap}
          />
        )}

        {activeRoute === 'portfolio' && (
          <PortfolioView
            assets={assets}
            fxRates={fxRates}
            searchQuery={searchQuery}
            onInspectSymbol={(sym) => handleInspectSymbol(sym)}
          />
        )}

        {activeRoute === 'stocks' && (
          <TopStocksView
            usBucket={usMoversBucket}
            idxBucket={idxMoversBucket}
            stocksUpdatedAt={stocksUpdatedAt}
            stocksLoading={stocksLoading}
            marketIntelligence={marketIntelligence}
            searchQuery={searchQuery}
            onRefresh={refreshStocks}
            onInspectSymbol={(sym) => handleInspectSymbol(sym)}
            onNavigate={handleNavigate}
            onClearSearch={() => setSearchQuery('')}
          />
        )}

        {activeRoute === 'heatmap' && (
          <MarketHeatmapView
            heatmapData={heatmapData}
            loading={heatmapLoading}
            searchQuery={searchQuery}
            themeMode={themeMode}
            onRefresh={refreshHeatmap}
            onInspectSymbol={(sym) => handleInspectSymbol(sym)}
          />
        )}

        {activeRoute === 'news' && (
          <NewsFeedView
            stories={newsStories}
            searchQuery={searchQuery}
            onOpenStory={setActiveStory}
            dailySummary={dailySummary}
            dailySummaryLoading={dailySummaryLoading}
            onRefreshDailySummary={refreshDailySummary}
            marketIntelligence={marketIntelligence}
            assets={assets}
            economicEvents={economicEvents}
            usBucket={usMoversBucket}
            idxBucket={idxMoversBucket}
            onSelectAsset={setSelectedAssetId}
            onInspectSymbol={handleInspectSymbol}
            onNavigate={handleNavigate}
          />
        )}

        {activeRoute === 'calendar' && (
          <EconomicCalendarView
            events={economicEvents}
            nextCatalyst={activeCatalyst}
            searchQuery={searchQuery}
            countdownSeconds={countdownSeconds}
          />
        )}

        {activeRoute === 'extract' && (
          <MarketExtractShareView
            assets={assets}
            marketIntelligence={marketIntelligence}
            usBucket={usMoversBucket}
            idxBucket={idxMoversBucket}
            onRefreshIntelligence={refreshMarketIntelligence}
          />
        )}
        </Suspense>
      </main>

      <BottomDock
        activeRoute={activeRoute}
        onNavigate={handleNavigate}
        themeMode={themeMode}
        onToggleTheme={toggleTheme}
      />

      <OfflineIndicator />
      <Suspense fallback={null}>
        {activeStory && (
          <NewsModal story={activeStory} onClose={() => setActiveStory(null)} />
        )}
        {inspectedSymbol && (
          <SymbolDetailModal
            yahooSymbol={inspectedSymbol}
            onClose={() => setInspectedSymbol(null)}
          />
        )}
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <StocksTerminalShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
