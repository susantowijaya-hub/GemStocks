/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { BottomDock } from './components/BottomDock';
import { EconomicCalendarView } from './components/EconomicCalendarView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { MarketDashboardView } from './components/MarketDashboardView';
import { NewsFeedView } from './components/NewsFeedView';
import { NewsModal } from './components/NewsModal';
import { TopStocksView } from './components/TopStocksView';
import { useLiveMarket } from './hooks/useLiveMarket';
import { useTheme } from './hooks/useTheme';
import { AppRoute, NewsStory } from './types/market';

const VALID_ROUTES: AppRoute[] = ['dashboard', 'stocks', 'news', 'calendar'];

function getInitialRoute(): AppRoute {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace('#', '') as AppRoute;
  return VALID_ROUTES.includes(hash) ? hash : 'dashboard';
}

function StocksTerminalShell() {
  const { isDark, toggleTheme } = useTheme();
  const {
    assets,
    newsStories,
    economicEvents,
    nextCatalyst,
    usMovers,
    idxMovers,
    stocksUpdatedAt,
    isPulseActive,
    wsConnected,
    feedsLive,
    flashMap,
    togglePulse,
    loadChartTimeframe,
    refreshStocks,
  } = useLiveMarket();

  const [activeRoute, setActiveRoute] = useState<AppRoute>(getInitialRoute);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('SPX');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPercentMode, setIsPercentMode] = useState<boolean>(true);
  const [activeStory, setActiveStory] = useState<NewsStory | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3 * 3600 + 42 * 60 + 15);

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

  // Sync live countdown to real nextCatalyst target timestamp
  useEffect(() => {
    if (nextCatalyst?.targetEpochMs) {
      const diff = Math.max(0, Math.floor((nextCatalyst.targetEpochMs - Date.now()) / 1000));
      setCountdownSeconds(diff);
    }
  }, [nextCatalyst]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (nextCatalyst?.targetEpochMs) {
        const diff = Math.max(0, Math.floor((nextCatalyst.targetEpochMs - Date.now()) / 1000));
        setCountdownSeconds(diff);
      } else {
        setCountdownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [nextCatalyst]);

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

  return (
    <div className="min-h-dvh flex flex-col bg-[#F2F2F7] dark:bg-black text-[#1C1C1E] dark:text-white transition-colors selection:bg-[#0071E3]/20 dark:selection:bg-[#0A84FF]/30">
      <Header
        activeRoute={activeRoute}
        onNavigate={handleNavigate}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        isPulseActive={isPulseActive}
        wsConnected={wsConnected || feedsLive}
        onTogglePulse={togglePulse}
        tickerStories={newsStories}
        onOpenStory={setActiveStory}
      />

      <main className="flex-1 flex flex-col">
        {activeRoute === 'dashboard' && (
          <MarketDashboardView
            assets={assets}
            newsStories={newsStories}
            economicEvents={economicEvents}
            nextCatalyst={nextCatalyst}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
            searchQuery={searchQuery}
            isPercentMode={isPercentMode}
            onToggleBadgeMode={handleToggleBadgeMode}
            flashMap={flashMap}
            onOpenStory={setActiveStory}
            onNavigate={handleNavigate}
            onLoadTimeframe={loadChartTimeframe}
            countdownSeconds={countdownSeconds}
          />
        )}

        {activeRoute === 'stocks' && (
          <TopStocksView
            usMovers={usMovers}
            idxMovers={idxMovers}
            stocksUpdatedAt={stocksUpdatedAt}
            searchQuery={searchQuery}
            onRefresh={refreshStocks}
          />
        )}

        {activeRoute === 'news' && (
          <NewsFeedView
            stories={newsStories}
            searchQuery={searchQuery}
            onOpenStory={setActiveStory}
          />
        )}

        {activeRoute === 'calendar' && (
          <EconomicCalendarView
            events={economicEvents}
            nextCatalyst={nextCatalyst}
            searchQuery={searchQuery}
            countdownSeconds={countdownSeconds}
          />
        )}
      </main>

      <BottomDock
        activeRoute={activeRoute}
        onNavigate={handleNavigate}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      <NewsModal story={activeStory} onClose={() => setActiveStory(null)} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StocksTerminalShell />
    </ErrorBoundary>
  );
}
