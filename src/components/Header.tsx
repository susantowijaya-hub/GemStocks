import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  CalendarDays,
  LayoutDashboard,
  LogIn,
  LogOut,
  Megaphone,
  Moon,
  Newspaper,
  Search,
  Sparkles,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppRoute, NewsStory } from '../types/market';
import { formatWibClock } from '../utils/formatters';

interface HeaderProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  isPercentMode: boolean;
  onToggleBadgeMode: () => void;
  isPulseActive: boolean;
  wsConnected: boolean;
  onTogglePulse: () => void;
  onOpenAi: () => void;
  tickerStories: NewsStory[];
  onOpenStory: (story: NewsStory) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeRoute,
  onNavigate,
  searchQuery,
  onSearchChange,
  isDark,
  onToggleTheme,
  isPercentMode,
  onToggleBadgeMode,
  isPulseActive,
  wsConnected,
  onTogglePulse,
  onOpenAi,
  tickerStories,
  onOpenStory,
}) => {
  const { user, authLoading, authError, signInWithGoogle, logout, clearAuthError } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const clock = formatWibClock(now);

  const searchPlaceholder =
    activeRoute === 'news'
      ? 'Search news (Fed, BI-Rate, Gold, OPEC)...'
      : activeRoute === 'calendar'
        ? 'Search events (CPI, BI-Rate, NFP, PMI)...'
        : activeRoute === 'portfolio'
          ? 'Search holdings (SPX, BTC, Gold, ETH)...'
          : activeRoute === 'fx'
            ? 'Filter currency pairs (USD, IDR, EUR)...'
            : 'Search symbol or market (SPX, IHSG, BTC, Gold, US10Y)...';

  return (
    <header className="sticky top-0 z-40 pt-safe backdrop-blur-xl bg-white/90 dark:bg-black/80 border-b border-[#E5E5EA] dark:border-[#2C2C2E] transition-colors">
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
              <span className="hidden xl:inline text-xs font-medium text-[#6C6C70] dark:text-[#8E8E93] tabular-nums whitespace-nowrap">
                {clock.full}
              </span>
              <span className="text-[10px] sm:hidden font-medium text-[#6C6C70] dark:text-[#8E8E93] tabular-nums whitespace-nowrap">
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
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeRoute === 'dashboard'
                  ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Market Dashboard</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('news')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
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
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                activeRoute === 'calendar'
                  ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Economic Calendar</span>
            </button>
          </nav>
        </div>

        {/* Center: Search Input (Desktop & Tablet) */}
        <div className="hidden md:block flex-1 max-w-md mx-2">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6C6C70] dark:text-[#8E8E93] pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Search markets, news, or events"
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
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Live Session Text Metadata (desktop xl+) */}
          <div className="hidden 2xl:flex items-center gap-3 text-[11px] font-medium text-[#6C6C70] dark:text-[#8E8E93] mr-1">
            <span className="flex items-center gap-1.5 text-[#1C1C1E] dark:text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]" />
              US Market: Open
            </span>
            <span aria-hidden="true">·</span>
            <span>IDX/Asia: Closed</span>
          </div>

          {/* % / Pts Toggle */}
          <button
            type="button"
            onClick={onToggleBadgeMode}
            title="Toggle display between percentage and net points change"
            className="min-h-[36px] sm:min-h-[32px] px-2.5 py-1 rounded-full bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] hover:bg-[#D1D1D6] dark:hover:bg-[#2C2C2E] border border-[#D1D1D6] dark:border-[#2C2C2E] text-[11px] font-semibold text-[#1C1C1E] dark:text-white transition-colors flex items-center gap-1 whitespace-nowrap"
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span className="hidden sm:inline">{isPercentMode ? '% Change' : 'Net Points'}</span>
            <span className="sm:hidden">{isPercentMode ? '%' : 'Pts'}</span>
          </button>

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

          {/* AI Search Grounding Trigger */}
          <button
            type="button"
            onClick={onOpenAi}
            title="Live AI Market Intelligence (Google Search Grounded)"
            className="min-h-[36px] sm:min-h-[32px] px-2.5 sm:px-3 py-1 rounded-full bg-[#0071E3] dark:bg-[#0A84FF] text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shadow-sm hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Analyst</span>
            <span className="sm:hidden">AI</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] hover:bg-[#D1D1D6] dark:hover:bg-[#2C2C2E] border border-[#D1D1D6] dark:border-[#2C2C2E] flex items-center justify-center text-[#1C1C1E] dark:text-white transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Google Auth Control */}
          {user ? (
            <button
              type="button"
              onClick={() => void logout()}
              title={`Signed in as ${user.email || user.displayName || 'Investor'} — Click to sign out`}
              className="min-h-[36px] sm:min-h-[32px] pl-1.5 pr-2.5 py-1 rounded-full bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] hover:bg-[#D1D1D6] dark:hover:bg-[#2C2C2E] border border-[#D1D1D6] dark:border-[#2C2C2E] flex items-center gap-1.5 text-[11px] font-semibold text-[#1C1C1E] dark:text-white transition-colors"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-5 h-5 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="w-5 h-5 rounded-full bg-[#0071E3] text-white text-[10px] font-bold flex items-center justify-center">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden xl:inline max-w-[90px] truncate">
                {user.displayName?.split(' ')[0] || 'Account'}
              </span>
              <LogOut className="w-3 h-3 text-[#6C6C70] dark:text-[#8E8E93]" />
            </button>
          ) : (
            <button
              type="button"
              disabled={authLoading}
              onClick={() => void signInWithGoogle()}
              className="min-h-[36px] sm:min-h-[32px] px-2.5 sm:px-3 py-1 rounded-full bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] hover:bg-[#D1D1D6] dark:hover:bg-[#2C2C2E] border border-[#D1D1D6] dark:border-[#2C2C2E] text-[11px] font-semibold text-[#1C1C1E] dark:text-white flex items-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#0A84FF]" />
              <span className="hidden sm:inline">{authLoading ? 'Signing in...' : 'Sign In'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Auth Error Banner (if popup fails) */}
      {authError && (
        <div className="px-4 lg:px-6 py-1.5 bg-[#FF453A]/10 border-t border-[#FF453A]/20 flex items-center justify-between gap-2 text-[11px] text-[#D7261C] dark:text-[#FF453A]">
          <span className="truncate">{authError}</span>
          <button
            type="button"
            onClick={clearAuthError}
            className="font-bold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Mobile Search Bar Row */}
      <div className="md:hidden px-4 pb-2">
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#6C6C70] dark:text-[#8E8E93] pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
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
      </div>

      {/* Breaking News Marquee Ticker Bar */}
      <div className="bg-[#E5E5EA]/60 dark:bg-[#0D0D0E] border-t border-[#E5E5EA] dark:border-[#2C2C2E] py-1.5 px-4 lg:px-6 flex items-center gap-3 overflow-hidden text-[11px] sm:text-xs">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FF453A]/15 text-[#D7261C] dark:text-[#FF453A] font-bold text-[10px] tracking-wider uppercase shrink-0">
          <Megaphone className="w-3 h-3" />
          BREAKING
        </span>
        <div className="overflow-hidden whitespace-nowrap flex-1">
          <div className="ticker-scroll flex items-center gap-6">
            {[...tickerStories, ...tickerStories].map((story, idx) => (
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
    </header>
  );
};
