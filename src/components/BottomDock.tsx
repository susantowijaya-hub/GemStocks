import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  Briefcase,
  CalendarDays,
  ChevronRight,
  Crosshair,
  Gem,
  LayoutDashboard,
  LayoutGrid,
  Moon,
  Newspaper,
  Share2,
  Sun,
  X,
} from 'lucide-react';
import { getThemeMeta } from '../hooks/useTheme';
import { AppRoute, ThemeMode } from '../types/market';

interface BottomDockProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  onPrefetchRoute?: (route: AppRoute) => void;
}

const DOCK_ITEMS: {
  id: AppRoute;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Market Dashboard', shortLabel: 'Markets', icon: LayoutDashboard },
  { id: 'watchlist', label: 'Market Watchlist', shortLabel: 'Watchlist', icon: Bookmark },
  { id: 'portfolio', label: 'Portfolios & Lists', shortLabel: 'Portfolio', icon: Briefcase },
  { id: 'stocks', label: 'Top 10 Stocks (US & ID)', shortLabel: 'Stocks', icon: BarChart3 },
  { id: 'heatmap', label: 'Market Cap Heatmap', shortLabel: 'Heatmap', icon: LayoutGrid },
  { id: 'ict', label: 'ICT Liquidity & OTE Radar', shortLabel: 'ICT Radar', icon: Crosshair },
  { id: 'news', label: 'Breaking News', shortLabel: 'News', icon: Newspaper },
  { id: 'calendar', label: 'Macro Calendar', shortLabel: 'Calendar', icon: CalendarDays },
  { id: 'extract', label: 'Extract & Social Brief', shortLabel: 'Share', icon: Share2 },
];

export const BottomDock: React.FC<BottomDockProps> = ({
  activeRoute,
  onNavigate,
  themeMode,
  onToggleTheme,
  onPrefetchRoute,
}) => {
  const [expanded, setExpanded] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const dockScrollRef = useRef<HTMLDivElement | null>(null);
  const collapseTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const scheduleCollapse = useCallback(
    (delayMs: number) => {
      clearTimers();
      collapseTimerRef.current = window.setTimeout(() => {
        setExpanded(false);
      }, delayMs);
    },
    [clearTimers]
  );

  const openDock = useCallback(
    (autoCollapseMs = 6500) => {
      setExpanded(true);
      scheduleCollapse(autoCollapseMs);
    },
    [scheduleCollapse]
  );

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // Collapse when clicking/tapping outside or pressing Escape
  useEffect(() => {
    if (!expanded) return;

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (!navRef.current?.contains(e.target as Node)) {
        clearTimers();
        setExpanded(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearTimers();
        setExpanded(false);
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
  }, [expanded, clearTimers]);

  useEffect(() => {
    if (!expanded) return;
    const container = dockScrollRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>(`[data-route-id="${activeRoute}"]`);
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeRoute, expanded]);

  const activeItem = DOCK_ITEMS.find((item) => item.id === activeRoute) ?? DOCK_ITEMS[0];
  const ActiveIcon = activeItem.icon;
  const activeThemeMeta = getThemeMeta(themeMode);

  return (
    <nav
      ref={navRef}
      aria-label="Left Side Dock Navigation"
      className="fixed left-2 sm:left-3 top-1/2 -translate-y-1/2 z-40 pointer-events-none flex items-center max-h-[calc(100dvh-2rem)]"
    >
      {!expanded ? (
        <button
          key="side-dock-pill"
          data-testid="bottom-dock-trigger"
          type="button"
          aria-expanded="false"
          aria-label={`Open side navigation (${activeItem.shortLabel})`}
          title={`Open navigation (${activeItem.label})`}
          onClick={() => openDock(6500)}
          className="pointer-events-auto liquid-glass-strong w-7 h-14 sm:w-8 sm:h-16 rounded-full flex flex-col items-center justify-center gap-0.5 shadow-xl hover:scale-105 active:scale-95 transition-transform focus:outline-none text-[#1C1C1E] dark:text-white border border-black/10 dark:border-white/20"
        >
          <ActiveIcon className="w-3.5 h-3.5 shrink-0" />
          <ChevronRight className="w-3 h-3 opacity-70 shrink-0" />
        </button>
      ) : (
        <div
          key="side-dock-expanded"
          data-testid="bottom-dock-bar"
          ref={dockScrollRef}
          onMouseEnter={clearTimers}
          onMouseLeave={() => scheduleCollapse(2500)}
          className="pointer-events-auto w-[172px] sm:w-[186px] max-h-[calc(100dvh-2.5rem)] overflow-y-auto no-scrollbar rounded-2xl p-2 flex flex-col items-stretch justify-start gap-1 liquid-glass-strong shadow-[0_14px_38px_rgba(0,0,0,0.22),0_0_24px_rgba(56,189,248,0.18)] dark:shadow-[0_18px_46px_rgba(0,0,0,0.72),0_0_28px_rgba(251,191,36,0.20)] border border-black/10 dark:border-white/20 animate-route-enter"
        >
          {DOCK_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeRoute === item.id;
            return (
              <button
                key={item.id}
                data-route-id={item.id}
                type="button"
                onMouseEnter={() => onPrefetchRoute?.(item.id)}
                onFocus={() => onPrefetchRoute?.(item.id)}
                onClick={() => {
                  onNavigate(item.id);
                  scheduleCollapse(260);
                }}
                aria-label={item.label}
                title={item.label}
                className={`relative group shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all active:scale-[0.96] sm:hover:translate-x-0.5 focus:outline-none ${
                  isActive
                    ? 'text-[#0B172A] dark:text-white'
                    : 'text-[#1E293B] dark:text-[#F1F5F9] hover:text-[#005BB8] dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-xl bg-white/95 dark:bg-white/20 border border-[#38BDF8]/55 dark:border-[#FBBF24]/55 shadow-[0_0_18px_rgba(56,189,248,0.45),0_0_8px_rgba(255,255,255,0.8)] dark:shadow-[0_0_20px_rgba(251,191,36,0.42),0_0_8px_rgba(255,255,255,0.24)] transition-all duration-200"
                  />
                )}
                <span
                  className={`relative z-10 inline-flex items-center justify-center shrink-0 transition-transform duration-200 ${
                    isActive
                      ? 'scale-105 text-[#0066CC] dark:text-[#FDE68A] drop-shadow-[0_0_8px_rgba(56,189,248,0.75)] dark:drop-shadow-[0_0_8px_rgba(251,191,36,0.85)]'
                      : 'drop-shadow-[0_0_6px_rgba(255,255,255,0.7)] dark:drop-shadow-[0_0_6px_rgba(255,255,255,0.35)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span
                  className={`relative z-10 text-xs font-extrabold tracking-tight truncate transition-all ${
                    isActive
                      ? '[text-shadow:0_0_10px_rgba(255,255,255,0.98),0_0_18px_rgba(56,189,248,0.78)] dark:[text-shadow:0_0_10px_rgba(255,255,255,0.95),0_0_20px_rgba(251,191,36,0.85)]'
                      : '[text-shadow:0_0_8px_rgba(255,255,255,0.95),0_0_14px_rgba(56,189,248,0.48)] dark:[text-shadow:0_0_8px_rgba(255,255,255,0.55),0_0_14px_rgba(251,191,36,0.45)] group-hover:[text-shadow:0_0_10px_rgba(255,255,255,1),0_0_18px_rgba(56,189,248,0.75)] dark:group-hover:[text-shadow:0_0_10px_rgba(255,255,255,0.9),0_0_18px_rgba(251,191,36,0.75)]'
                  }`}
                >
                  {item.shortLabel}
                </span>
              </button>
            );
          })}

          <div className="w-full h-px bg-black/10 dark:bg-white/15 my-0.5 shrink-0" />

          <button
            type="button"
            onClick={() => {
              onToggleTheme();
              scheduleCollapse(3000);
            }}
            aria-label={`Cycle theme (${activeThemeMeta.label})`}
            title={`Theme: ${activeThemeMeta.label} (click to cycle)`}
            className="relative group shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#1E293B] dark:text-[#F1F5F9] hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.96] transition-all"
          >
            {themeMode === 'obsidian' ? (
              <Moon className="w-4 h-4 shrink-0 text-[#FBBF24] drop-shadow-[0_0_8px_rgba(251,191,36,0.65)]" />
            ) : themeMode === 'parchment' ? (
              <Gem className="w-4 h-4 shrink-0 text-[#C2410C] drop-shadow-[0_0_8px_rgba(251,146,60,0.55)]" />
            ) : (
              <Sun className="w-4 h-4 shrink-0 text-[#0071E3] drop-shadow-[0_0_8px_rgba(56,189,248,0.65)]" />
            )}
            <span className="text-xs font-bold truncate [text-shadow:0_0_8px_rgba(255,255,255,0.9),0_0_14px_rgba(56,189,248,0.45)] dark:[text-shadow:0_0_8px_rgba(255,255,255,0.55),0_0_14px_rgba(251,191,36,0.45)]">
              {activeThemeMeta.shortLabel} Theme
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              clearTimers();
              setExpanded(false);
            }}
            aria-label="Hide side navigation dock"
            title="Collapse dock"
            className="shrink-0 flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-[#4A4D57] dark:text-[#C7CBD6] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#1C1C1E] dark:hover:text-white active:scale-[0.96] transition-all"
          >
            <X className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-bold truncate [text-shadow:0_0_6px_rgba(255,255,255,0.85)] dark:[text-shadow:0_0_8px_rgba(255,255,255,0.45)]">
              Hide Dock
            </span>
          </button>
        </div>
      )}
    </nav>
  );
};
