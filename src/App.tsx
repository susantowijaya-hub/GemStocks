/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { useSignalHistory } from './hooks/useSignalHistory';
import { useSignalVerification } from './hooks/useSignalVerification';
import { useSwipeNavigation } from './hooks/useSwipeNavigation';
import { useTheme } from './hooks/useTheme';
import {
  AppRoute,
  AssetSortOption,
  CalendarCatalyst,
  ChartTradeOverlays,
  NewsStory,
  PriceAlertItem,
  SyncedRadarConfig,
  Timeframe,
} from './types/market';
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
const SignalJournalView = lazyWithRetry(() =>
  import('./components/SignalJournalView').then((m) => ({ default: m.SignalJournalView }))
);
const NewsFeedView = lazyWithRetry(() =>
  import('./components/NewsFeedView').then((m) => ({ default: m.NewsFeedView }))
);
const EconomicCalendarView = lazyWithRetry(() =>
  import('./components/EconomicCalendarView').then((m) => ({ default: m.EconomicCalendarView }))
);
const SettingsModal = lazyWithRetry(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
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

const VALID_ROUTES: AppRoute[] = ['dashboard', 'watchlist', 'portfolio', 'stocks', 'heatmap', 'ict', 'journal', 'news', 'calendar'];

const ROUTE_SHORT_LABELS: Record<AppRoute, string> = {
  dashboard: 'Markets',
  watchlist: 'Watchlist',
  portfolio: 'Portfolio',
  stocks: 'Stocks',
  heatmap: 'Heatmap',
  ict: 'ICT Radar',
  journal: 'Journal',
  news: 'News',
  calendar: 'Calendar',
};

function getInitialRoute(): AppRoute {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace('#', '') as AppRoute;
  return VALID_ROUTES.includes(hash) ? hash : 'dashboard';
}

function getInitialSyncedRadarConfig(): SyncedRadarConfig {
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem('stocks-ict-radar-prefs-v1');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SyncedRadarConfig>;
        const safeTf: Timeframe =
          parsed.timeframe &&
          ['5m', '15m', '30m', '1h', '4h'].includes(parsed.timeframe)
            ? parsed.timeframe
            : '15m';
        return {
          strategyMode: parsed.strategyMode === 'sdcv' ? 'sdcv' : 'ict',
          timeframe: safeTf,
          enforceVolatilityFilter:
            typeof parsed.enforceVolatilityFilter === 'boolean'
              ? parsed.enforceVolatilityFilter
              : true,
          enforceNewsBlackout:
            typeof parsed.enforceNewsBlackout === 'boolean'
              ? parsed.enforceNewsBlackout
              : true,
        };
      }
    }
  } catch {
    // ignore storage access issues
  }
  return {
    strategyMode: 'ict',
    timeframe: '15m',
    enforceVolatilityFilter: true,
    enforceNewsBlackout: true,
  };
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
    isPulseActive,
    wsConnected,
    priorityStreamStatus,
    prioritySources,
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
  const [selectedAssetId, setSelectedAssetId] = useState<string>('SPX');
  const [syncedRadarConfig, setSyncedRadarConfig] = useState<SyncedRadarConfig>(
    getInitialSyncedRadarConfig
  );
  const [radarJumpTarget, setRadarJumpTarget] = useState<{
    assetId: string;
    strategy?: 'ict' | 'sdcv';
    timeframe?: Timeframe;
    nonce: number;
  } | null>(null);
  const [inspectedSymbol, setInspectedSymbol] = useState<string | null>(null);
  const [inspectedOverlays, setInspectedOverlays] = useState<ChartTradeOverlays | null>(null);
  const [inspectedInitialTf, setInspectedInitialTf] = useState<Timeframe | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [assetSort, setAssetSort] = useState<AssetSortOption>('default');
  const [assetSortDir, setAssetSortDir] = useState<'desc' | 'asc'>('desc');
  const [isPercentMode, setIsPercentMode] = useState<boolean>(true);
  const [activeStory, setActiveStory] = useState<NewsStory | null>(null);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3 * 3600 + 42 * 60 + 15);
  const lastRollRefreshRef = useRef<number>(0);

  const handleChangeAssetSort = useCallback((nextSort: AssetSortOption) => {
    if (nextSort === 'default') {
      setAssetSort('default');
      setAssetSortDir('desc');
      return;
    }
    setAssetSort((prev) => {
      if (prev === nextSort) {
        setAssetSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
        return prev;
      }
      setAssetSortDir('desc');
      return nextSort;
    });
  }, []);

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
    alertThresholdPct,
    setAlertThresholdPct,
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
  } = usePriceAlerts(assets, idxMoversBucket, economicEvents, syncedRadarConfig);

  const {
    records: signalHistory,
    activeBySymbol: activeSignalBySymbol,
    stats: signalHistoryStats,
    cloudSynced: signalCloudSynced,
    cloudEngineStatus,
    triggerCloudScan,
    refreshSignalDatabase,
    annotateSignal,
    applyVerificationPatch,
    isRecordConfirmedOnServer,
    tryAcquireSignalWriteLock,
    releaseSignalWriteLock,
    deleteSignal,
    clearClosedSignals,
  } = useSignalHistory(
    assets,
    idxMoversBucket,
    usMoversBucket,
    economicEvents,
    syncedRadarConfig,
    feedsLive
  );

  const signalVerificationMetrics = useSignalVerification({
    records: signalHistory,
    assets,
    idxMoversBucket,
    usMoversBucket,
    feedsLive,
    cloudSynced: signalCloudSynced,
    isRecordConfirmedOnServer,
    tryAcquireSignalWriteLock,
    releaseSignalWriteLock,
    applyVerificationPatch,
    onRemoveUnfilledSignal: deleteSignal,
  });

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

  const {
    containerRef: mainSwipeRef,
    swipeHint,
    dragOffsetPx,
    bindSwipeHandlers,
  } = useSwipeNavigation({
    routes: VALID_ROUTES,
    activeRoute,
    disabled: Boolean(activeStory || inspectedSymbol || settingsOpen),
    onNavigate: handleNavigate,
  });

  const handleToggleBadgeMode = useCallback(() => {
    setIsPercentMode((prev) => !prev);
  }, []);

  const handleInspectSymbol = useCallback(
    (
      yahooSymbol: string,
      builtInAssetId?: string,
      overlays?: ChartTradeOverlays | null,
      initialTf?: Timeframe
    ) => {
      if (builtInAssetId) {
        setSelectedAssetId(builtInAssetId);
      }
      setInspectedOverlays(overlays ?? null);
      setInspectedInitialTf(initialTf);
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
        onOpenSettings={() => setSettingsOpen(true)}
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
        serverDiagnostics={serverDiagnostics}
        clientTransport={clientTransport}
        feedsLive={feedsLive}
        onRefreshAll={refreshAll}
        onRefreshDiagnostics={refreshDiagnostics}
        onPrefetchRoute={prefetchRoute}
        assetSort={assetSort}
        assetSortDir={assetSortDir}
        onChangeAssetSort={handleChangeAssetSort}
      />

      <main
        ref={mainSwipeRef}
        {...bindSwipeHandlers}
        className="flex-1 flex flex-col relative pb-[72px] lg:pb-0 touch-pan-y"
      >
        {/* Tactile Edge Swipe Indicator on Touch Devices */}
        {swipeHint && (
          <div
            aria-hidden="true"
            data-testid="swipe-nav-hint"
            style={{
              opacity: Math.max(0.3, swipeHint.progress),
              transform: `translateY(-50%) scale(${0.92 + swipeHint.progress * 0.08})`,
            }}
            className={`fixed top-1/2 z-50 pointer-events-none px-3 py-2 rounded-full liquid-glass-strong shadow-lg flex items-center gap-1.5 text-xs font-bold transition-all duration-75 border ${
              swipeHint.readyToCommit
                ? 'border-[#1D4ED8] dark:border-[#38BDF8] text-[#1D4ED8] dark:text-[#38BDF8]'
                : 'border-black/10 dark:border-white/15 text-[#1C1C1E] dark:text-white'
            } ${swipeHint.direction === 'next' ? 'right-3' : 'left-3'}`}
          >
            {swipeHint.direction === 'prev' && <ChevronLeft className="w-4 h-4" />}
            <span>{ROUTE_SHORT_LABELS[swipeHint.targetRoute]}</span>
            {swipeHint.direction === 'next' && <ChevronRight className="w-4 h-4" />}
          </div>
        )}

        <div
          key={activeRoute}
          style={
            dragOffsetPx !== 0
              ? { transform: `translate3d(${dragOffsetPx}px, 0, 0)`, willChange: 'transform' }
              : undefined
          }
          className={`flex-1 flex flex-col transition-transform duration-150 ease-out ${
            swipeSlideDir === 1
              ? 'animate-route-enter-next'
              : swipeSlideDir === -1
                ? 'animate-route-enter-prev'
                : ''
          }`}
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
            assetSort={assetSort}
            assetSortDir={assetSortDir}
            alertThresholdPct={alertThresholdPct}
            onChangeAlertThresholdPct={setAlertThresholdPct}
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
            assetSort={assetSort}
            assetSortDir={assetSortDir}
          />
        )}

        {activeRoute === 'portfolio' && (
          <PortfolioView
            assets={assets}
            fxRates={fxRates}
            signalHistory={signalHistory}
            searchQuery={searchQuery}
            themeMode={themeMode}
            onInspectSymbol={(sym) => handleInspectSymbol(sym)}
          />
        )}

        {activeRoute === 'stocks' && (
          <TopStocksView
            assets={assets}
            usBucket={usMoversBucket}
            idxBucket={idxMoversBucket}
            stocksUpdatedAt={stocksUpdatedAt}
            stocksLoading={stocksLoading}
            marketIntelligence={marketIntelligence}
            searchQuery={searchQuery}
            alerts={alerts}
            signalHistory={signalHistory}
            activeSignalBySymbol={activeSignalBySymbol}
            signalStats={signalHistoryStats}
            signalCloudSynced={signalCloudSynced}
            verificationMetrics={signalVerificationMetrics}
            onAnnotateSignal={annotateSignal}
            onDeleteSignal={deleteSignal}
            onClearClosedSignals={clearClosedSignals}
            onInspectSignal={handleInspectSymbol}
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
            onInspectChart={(assetId, overlays, tf) =>
              handleInspectSymbol(assetId, assetId, overlays, tf)
            }
            onMarkAlertRead={markRead}
            onUpdateAlertOutcome={updateAlertOutcome}
            onSyncRadarConfig={setSyncedRadarConfig}
            signalHistory={signalHistory}
            signalStats={signalHistoryStats}
            signalCloudSynced={signalCloudSynced}
            cloudEngineStatus={cloudEngineStatus}
            onTriggerCloudScan={triggerCloudScan}
            verificationMetrics={signalVerificationMetrics}
            onAnnotateSignal={annotateSignal}
            onDeleteSignal={deleteSignal}
            onClearClosedSignals={clearClosedSignals}
            onInspectSignal={handleInspectSymbol}
            priorityStreamStatus={priorityStreamStatus}
            prioritySources={prioritySources}
            jumpTarget={radarJumpTarget}
            flashMap={flashMap}
            volatility5mMap={volatility5mMap}
            searchQuery={searchQuery}
          />
        )}

        {activeRoute === 'journal' && (
          <SignalJournalView
            records={signalHistory}
            stats={signalHistoryStats}
            cloudSynced={signalCloudSynced}
            cloudEngineStatus={cloudEngineStatus}
            verificationMetrics={signalVerificationMetrics}
            onTriggerCloudScan={triggerCloudScan}
            onRefreshDatabase={refreshSignalDatabase}
            onAnnotateSignal={annotateSignal}
            onDeleteSignal={deleteSignal}
            onClearClosedSignals={clearClosedSignals}
            onInspectSignal={handleInspectSymbol}
            onNavigate={handleNavigate}
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
        </Suspense>
        </div>
      </main>

      <BottomDock
        activeRoute={activeRoute}
        onNavigate={handleNavigate}
        themeMode={themeMode}
        onToggleTheme={toggleTheme}
        onSelectTheme={setThemeMode}
        onOpenSettings={() => setSettingsOpen(true)}
        onPrefetchRoute={prefetchRoute}
      />

      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            themeMode={themeMode}
            onSelectTheme={setThemeMode}
            isPulseActive={isPulseActive}
            onTogglePulse={togglePulse}
            alertThresholdPct={alertThresholdPct}
            onChangeAlertThresholdPct={setAlertThresholdPct}
            onRefreshAll={refreshAll}
          />
        </Suspense>
      )}

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
                setRadarJumpTarget({
                  assetId: alert.assetId,
                  strategy: alert.ictStrategy,
                  timeframe: alert.ictTimeframe,
                  nonce: Date.now(),
                });
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
              initialTimeframe={inspectedInitialTf}
              tradeOverlays={inspectedOverlays}
              onClose={() => {
                setInspectedSymbol(null);
                setInspectedOverlays(null);
                setInspectedInitialTf(undefined);
              }}
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
