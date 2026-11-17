/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AiResearchModal } from './components/AiResearchModal';
import { BottomDock } from './components/BottomDock';
import { EconomicCalendarView } from './components/EconomicCalendarView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FxMatrixView } from './components/FxMatrixView';
import { Header } from './components/Header';
import { MarketDashboardView } from './components/MarketDashboardView';
import { NewsFeedView } from './components/NewsFeedView';
import { NewsModal } from './components/NewsModal';
import { PortfolioView } from './components/PortfolioView';
import { AuthProvider } from './contexts/AuthContext';
import { useLiveMarket } from './hooks/useLiveMarket';
import { useTheme } from './hooks/useTheme';
import { AppRoute, MarketAsset, NewsStory } from './types/market';

const VALID_ROUTES: AppRoute[] = ['dashboard', 'portfolio', 'fx', 'news', 'calendar'];

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
    fxRates,
    fxPairTiles,
    isPulseActive,
    wsConnected,
    feedsLive,
    flashMap,
    togglePulse,
    loadChartTimeframe,
  } = useLiveMarket();

  const [activeRoute, setActiveRoute] = useState<AppRoute>(getInitialRoute);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('SPX');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPercentMode, setIsPercentMode] = useState<boolean>(true);
  const [activeStory, setActiveStory] = useState<NewsStory | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3 * 3600 + 42 * 60 + 15);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState('');
  const [aiInitialMode, setAiInitialMode] = useState<'asset-brief' | 'news-pulse' | 'macro-qa'>(
    'macro-qa'
  );

  const activeAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? assets[0],
    [assets, selectedAssetId]
  );

  // Sync browser hash navigation (Back/Forward on Desktop, Android, and iOS Safari)
  useEffect(() => {
    const handleHashChange = () => {
      const next = window.location.hash.replace('#', '') as AppRoute;
      if (VALID_ROUTES.includes(next)) {
        setActiveRoute(next);
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

  const handleOpenAiGeneral = useCallback(() => {
    setAiInitialPrompt('');
    setAiInitialMode('macro-qa');
    setAiOpen(true);
  }, []);

  const handleOpenAiForAsset = useCallback((asset: MarketAsset) => {
    setAiInitialPrompt(
      `Latest live market briefing, catalysts, and technical outlook for ${asset.name} (${asset.symbol})`
    );
    setAiInitialMode('asset-brief');
    setAiOpen(true);
  }, []);

  const handleFetchLiveNewsPulse = useCallback(() => {
    setAiInitialPrompt(
      'Latest breaking global market headlines today across US equities, Fed policy, Bank Indonesia / IDX / IDR, Gold, Oil, and Bitcoin'
    );
    setAiInitialMode('news-pulse');
    setAiOpen(true);
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
        isPercentMode={isPercentMode}
        onToggleBadgeMode={handleToggleBadgeMode}
        isPulseActive={isPulseActive}
        wsConnected={wsConnected || feedsLive}
        onTogglePulse={togglePulse}
        onOpenAi={handleOpenAiGeneral}
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
            onOpenAiAsset={handleOpenAiForAsset}
            onLoadTimeframe={loadChartTimeframe}
            countdownSeconds={countdownSeconds}
          />
        )}

        {activeRoute === 'portfolio' && (
          <PortfolioView assets={assets} searchQuery={searchQuery} />
        )}

        {activeRoute === 'fx' && (
          <FxMatrixView
            fxRates={fxRates}
            pairTiles={fxPairTiles}
            searchQuery={searchQuery}
          />
        )}

        {activeRoute === 'news' && (
          <NewsFeedView
            stories={newsStories}
            searchQuery={searchQuery}
            onOpenStory={setActiveStory}
            onFetchLiveNewsPulse={handleFetchLiveNewsPulse}
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

      <AiResearchModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        activeAsset={activeAsset}
        initialPrompt={aiInitialPrompt}
        initialMode={aiInitialMode}
      />
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
