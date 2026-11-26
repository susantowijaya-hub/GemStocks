/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { BottomDock } from './components/BottomDock';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { MarketDashboardView } from './components/MarketDashboardView';
import { MarketSkeleton } from './components/MarketSkeleton';
import { AuthProvider } from './contexts/AuthContext';
import { useLiveMarket } from './hooks/useLiveMarket';
import { usePrefetch } from './hooks/usePrefetch';
import { usePriceAlerts } from './hooks/usePriceAlerts';
import { useRenderPerformance } from './hooks/useRenderPerformance';
import { useTheme } from './hooks/useTheme';
import { AppRoute, CalendarCatalyst, NewsStory, PriceAlertItem } from './types/market';
import { lazyWithRetry } from './utils/lazyWithRetry';

const WatchlistView = lazyWithRetry(() =>
  import('./components/WatchlistView').then((m) => ({ default: m.WatchlistView }))
);
const PortfolioView = lazyWithRetry(() =>
  import('./components/PortfolioView').then((m) => ({ default: m.PortfolioView }))
);
const TopStocksView = lazyWithRetry(() =>
  import('./components/TopStocksView').then((m) => ({ default: m.TopStocksView }))
);
const MarketHeatmapView = lazyWithRetry(() =>
  import('./components/MarketHeatmapView').then((m) => ({ default: m.MarketHeatmapView }))
);
const IctRadarView = lazyWithRetry(() =>
  import('./components/IctRadarView').then((m) => ({ default: m.IctRadarView }))
);
const NewsFeedView = lazyWithRetry(() =>
  import('./components/NewsFeedView').then((m) => ({ default: m.NewsFeedView }))
);
const EconomicCalendarView = lazyWithRetry(() =>
  import('./components/EconomicCalendarView').then((m) => ({ default: m.EconomicCalendarView }))
);
const MarketExtractShareView = lazyWithRetry(() =>
  import('./components/MarketExtractShareView').then((m) => ({ default: m.MarketExtractShareView }))
);
const NewsModal = lazyWithRetry(() =>
  import('./components/NewsModal').then((m) => ({ default: m.NewsModal }))
);
const SymbolDetailModal = lazyWithRetry(() =>
  import('./components/SymbolDetailModal').then((m) => ({ default: m.SymbolDetailModal }))
);
const OfflineIndicator = lazyWithRetry(() =>
  import('./components/OfflineIndicator').then((m) => ({ default: m.OfflineIndicator }))
);
const PriceAlertToastStack = lazyWithRetry(() =>
  import('./components/PriceAlertOverlay').then((m) => ({ default: m.PriceAlertToastStack }))
);

const VALID_ROUTES: AppRoute[] = ['dashboard', 'watchlist', 'portfolio', 'stocks', 'heatmap', 'ict', 'news', 'calendar', 'extract'];

const ROUTE_SHORT_LABELS: Record<AppRoute, string> = {
  dashboard: 'Markets',
  watchlist: 'Watchlist',
  portfolio: 'Portfolio',
  stocks: 'Stocks',
  heatmap: 'Heatmap',
  ict: 'ICT Radar',
  news: 'News',
  calendar: 'Calendar',
  extract: 'Share',
};

function hasHorizontalScrollAncestor(el: EventTarget | null, boundary: HTMLElement | null): boolean {
  let curr = el instanceof HTMLElement ? el : null;
  while (curr && curr !== boundary) {
    if (curr.dataset.noViewSwipe === 'true') return true;
    const tag = curr.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'CANVAS') {
      return true;
    }
    const style = window.getComputedStyle(curr);
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      curr.scrollWidth > curr.clientWidth + 6
    ) {
      return true;
    }
    curr = curr.parentElement;
  }
  return false;
}

function getInitialRoute(): AppRoute {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace('#', '') as AppRoute;
  return VALID_ROUTES.includes(hash) ? hash : 'dashboard';
}

function StocksTerminalShell() {
  useRenderPerformance('StocksTerminalShell');
  const { themeMode, setThemeMode, toggleTheme } = useTheme();
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
    serverDiagnostics,
    clientTransport,
    refreshDiagnostics,
    togglePulse,
    loadChartTimeframe,
    refreshCalendar,
    refreshStocks,
    refreshAll,
  } = useLiveMarket();

  const [activeRoute, setActiveRoute] = useState<AppRoute>(getInitialRoute);
  const [priorityReady, setPriorityReady] = useState<boolean>(false);
  const [swipeSlideDir, setSwipeSlideDir] = useState<1 | -1 | 0>(0);
  const [swipeHint, setSwipeHint] = useState<{
    direction: 'prev' | 'next';
    targetRoute: AppRoute;
    progress: number;
  } | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('SPX');
  const [inspectedSymbol, setInspectedSymbol] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPercentMode, setIsPercentMode] = useState<boolean>(true);
  const [activeStory, setActiveStory] = useState<NewsStory | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3 * 3600 + 42 * 60 + 15);
  const lastRollRefreshRef = useRef<number>(0);
  const mainSwipeRef = useRef<HTMLElement | null>(null);
  const swipeSessionRef = useRef<{
    active: boolean;
    locked: 'horizontal' | 'vertical' | null;
    startX: number;
    startY: number;
    startAt: number;
    lastDx: number;
  }>({
    active: false,
    locked: null,
    startX: 0,
    startY: 0,
    startAt: 0,
    lastDx: 0,
  });

  // Priority Loading: mark dashboard interactive after first browser paint before warming non-critical views
  useEffect(() => {
    let rafId = 0;
    let fallbackTimer: number | null = null;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      rafId = window.requestAnimationFrame(() => {
        setPriorityReady(true);
      });
    } else {
      fallbackTimer = globalThis.setTimeout(() => setPriorityReady(true), 60) as unknown as number;
    }
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (fallbackTimer !== null) globalThis.clearTimeout(fallbackTimer);
    };
  }, []);

  const { prefetchRoute } = usePrefetch(activeRoute, priorityReady);

  const {
    alerts,
    toasts,
    unreadCount,
    ictPopupsEnabled,
    toggleIctPopups,
    volatility5mMap,
    market5mStats,
    dismissToast,
    markRead,
    markAllRead,
    updateAlertOutcome,
    clearAlerts,
    triggerTestAlert,
    pushIctSignalAlert,
    scanIctAlerts,
    scanBandarmologyAlerts,
  } = usePriceAlerts(assets, idxMoversBucket, economicEvents);

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

  const handleNavigate = useCallback((route: AppRoute, dir: 1 | -1 | 0 = 0) => {
    setSwipeSlideDir(dir);
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

  const handleSwipeTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (activeStory || inspectedSymbol || e.touches.length !== 1) {
        swipeSessionRef.current.active = false;
        return;
      }
      if (hasHorizontalScrollAncestor(e.target, mainSwipeRef.current)) {
        swipeSessionRef.current.active = false;
        return;
      }
      const touch = e.touches[0];
      swipeSessionRef.current = {
        active: true,
        locked: null,
        startX: touch.clientX,
        startY: touch.clientY,
        startAt: Date.now(),
        lastDx: 0,
      };
    },
    [activeStory, inspectedSymbol]
  );

  const handleSwipeTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const sess = swipeSessionRef.current;
      if (!sess.active || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - sess.startX;
      const dy = touch.clientY - sess.startY;
      sess.lastDx = dx;

      if (sess.locked === null) {
        if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.45) {
          sess.locked = 'horizontal';
        } else {
          sess.locked = 'vertical';
          sess.active = false;
          setSwipeHint(null);
          return;
        }
      }

      if (sess.locked === 'horizontal') {
        const curIdx = VALID_ROUTES.indexOf(activeRoute);
        const targetIdx = dx < 0 ? curIdx + 1 : curIdx - 1;
        if (targetIdx < 0 || targetIdx >= VALID_ROUTES.length || Math.abs(dx) < 20) {
          setSwipeHint(null);
          return;
        }
        setSwipeHint({
          direction: dx < 0 ? 'next' : 'prev',
          targetRoute: VALID_ROUTES[targetIdx],
          progress: Math.min(1, Math.abs(dx) / 72),
        });
      }
    },
    [activeRoute]
  );

  const handleSwipeTouchEnd = useCallback(() => {
    const sess = swipeSessionRef.current;
    setSwipeHint(null);
    if (!sess.active || sess.locked !== 'horizontal') {
      sess.active = false;
      return;
    }
    sess.active = false;
    const dx = sess.lastDx;
    const elapsed = Date.now() - sess.startAt;
    const absDx = Math.abs(dx);
    const shouldSwitch = absDx >= 68 || (absDx >= 42 && elapsed < 260);
    if (!shouldSwitch) return;

    const curIdx = VALID_ROUTES.indexOf(activeRoute);
    const nextIdx = dx < 0 ? curIdx + 1 : curIdx - 1;
    if (nextIdx >= 0 && nextIdx < VALID_ROUTES.length) {
      handleNavigate(VALID_ROUTES[nextIdx], dx < 0 ? 1 : -1);
    }
  }, [activeRoute, handleNavigate]);

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
    <div className="relative min-h-dvh flex flex-col text-[#1C1C1E] dark:text-white selection:bg-[#0066CC]/20 dark:selection:bg-[#F59E0B]/30">
      <div aria-hidden="true" data-testid="ambient-glass-backdrop" className="ambient-theme-canvas" />
      <div className="relative z-10 min-h-dvh flex flex-col">
      <Header
        activeRoute={activeRoute}
        onNavigate={handleNavigate}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        themeMode={themeMode}
        onToggleTheme={toggleTheme}
        onSelectTheme={setThemeMode}
        isPulseActive={isPulseActive}
        wsConnected={wsConnected || feedsLive}
        onTogglePulse={togglePulse}
        tickerStories={newsStories}
        onOpenStory={setActiveStory}
        assets={assets}
        usMovers={usMovers}
        idxMovers={idxMovers}
        marketIntelligence={marketIntelligence}
        economicEvents={economicEvents}
        onSelectAsset={setSelectedAssetId}
        onInspectSymbol={handleInspectSymbol}
        serverDiagnostics={serverDiagnostics}
        clientTransport={clientTransport}
        feedsLive={feedsLive}
        onRefreshAll={refreshAll}
        onRefreshDiagnostics={refreshDiagnostics}
        onPrefetchRoute={prefetchRoute}
      />

      <main
        ref={mainSwipeRef}
        onTouchStart={handleSwipeTouchStart}
        onTouchMove={handleSwipeTouchMove}
        onTouchEnd={handleSwipeTouchEnd}
        onTouchCancel={handleSwipeTouchEnd}
        className="flex-1 flex flex-col relative"
      >
        {/* Tactile Edge Swipe Indicator on Mobile */}
        {swipeHint && (
          <div
            aria-hidden="true"
            style={{
              opacity: Math.max(0.25, swipeHint.progress),
              transform: `translateY(-50%) scale(${0.92 + swipeHint.progress * 0.08})`,
            }}
            className={`fixed top-1/2 z-50 pointer-events-none px-3 py-2 rounded-full liquid-glass-strong shadow-lg flex items-center gap-1.5 text-xs font-bold text-[#1C1C1E] dark:text-white transition-transform duration-75 ${
              swipeHint.direction === 'next' ? 'right-3' : 'left-3'
            }`}
          >
            {swipeHint.direction === 'prev' && <ChevronLeft className="w-4 h-4" />}
            <span>{ROUTE_SHORT_LABELS[swipeHint.targetRoute]}</span>
            {swipeHint.direction === 'next' && <ChevronRight className="w-4 h-4" />}
          </div>
        )}

        <motion.div
          key={activeRoute}
          initial={
            swipeSlideDir !== 0
              ? { opacity: 0.72, x: swipeSlideDir * 16 }
              : false
          }
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 flex flex-col"
        >
        <Suspense fallback={<MarketSkeleton variant="route" label="Loading terminal view..." />}>
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
            newsStories={newsStories}
            onOpenStory={setActiveStory}
            marketIntelligence={marketIntelligence}
            intelligenceLoading={intelligenceLoading}
            onRefreshIntelligence={refreshMarketIntelligence}
            alerts={alerts}
            unreadAlertCount={unreadCount}
            volatility5mMap={volatility5mMap}
            market5mStats={market5mStats}
            onMarkAllAlertsRead={markAllRead}
            onMarkAlertRead={markRead}
            onClearAlerts={clearAlerts}
            onTriggerTestAlert={triggerTestAlert}
            onScanIct={scanIctAlerts}
            onScanBandar={scanBandarmologyAlerts}
            onInspectSymbol={(sym) => handleInspectSymbol(sym)}
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
            themeMode={themeMode}
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
            alerts={alerts}
            onRefresh={refreshStocks}
            onScanBandar={scanBandarmologyAlerts}
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

        {activeRoute === 'ict' && (
          <IctRadarView
            assets={assets}
            alerts={alerts}
            economicEvents={economicEvents}
            ictPopupsEnabled={ictPopupsEnabled}
            onToggleIctPopups={toggleIctPopups}
            onScanIct={scanIctAlerts}
            onTriggerIctAlert={pushIctSignalAlert}
            onLoadTimeframe={loadChartTimeframe}
            onMarkAlertRead={markRead}
            onUpdateAlertOutcome={updateAlertOutcome}
            searchQuery={searchQuery}
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
            onRefreshCalendar={() => refreshCalendar(true)}
          />
        )}

        {activeRoute === 'extract' && (
          <MarketExtractShareView
            assets={assets}
            marketIntelligence={marketIntelligence}
            usBucket={usMoversBucket}
            idxBucket={idxMoversBucket}
            feedsLive={feedsLive}
            onRefreshIntelligence={refreshMarketIntelligence}
          />
        )}
        </Suspense>
        </motion.div>
      </main>

      <BottomDock
        activeRoute={activeRoute}
        onNavigate={handleNavigate}
        themeMode={themeMode}
        onToggleTheme={toggleTheme}
        onPrefetchRoute={prefetchRoute}
      />

      {priorityReady && (
        <Suspense fallback={null}>
          <OfflineIndicator />
          <PriceAlertToastStack
            toasts={toasts}
            onDismiss={dismissToast}
            onSelectAlert={(alert: PriceAlertItem) => {
              markRead(alert.id);
              dismissToast(alert.id);
              if (alert.alertKind === 'bandarmology') {
                handleInspectSymbol(alert.assetId);
                return;
              }
              if (alert.alertKind === 'ict') {
                handleNavigate('ict');
                return;
              }
              setSelectedAssetId(alert.assetId);
              if (activeRoute !== 'dashboard') {
                handleNavigate('dashboard');
              }
            }}
          />
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
      )}
      </div>
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
