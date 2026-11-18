/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomDock } from './components/BottomDock';
import { EconomicCalendarView } from './components/EconomicCalendarView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { MarketDashboardView } from './components/MarketDashboardView';
import { NewsFeedView } from './components/NewsFeedView';
import { NewsModal } from './components/NewsModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TopStocksView } from './components/TopStocksView';
import { useLiveMarket } from './hooks/useLiveMarket';
import { useTheme } from './hooks/useTheme';
import { AppRoute, CalendarCatalyst, NewsStory } from './types/market';

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
    refreshAll,
  } = useLiveMarket();

  const [activeRoute, setActiveRoute] = useState<AppRoute>(getInitialRoute);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('SPX');
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
        assets={assets}
        usMovers={usMovers}
        idxMovers={idxMovers}
        onSelectAsset={setSelectedAssetId}
      />

      <main className="flex-1 flex flex-col">
        {activeRoute === 'dashboard' && (
          <MarketDashboardView
            assets={assets}
            newsStories={newsStories}
            economicEvents={economicEvents}
            nextCatalyst={activeCatalyst}
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
            nextCatalyst={activeCatalyst}
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

      <OfflineIndicator />
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
