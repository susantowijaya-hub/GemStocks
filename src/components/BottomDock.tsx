import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  Briefcase,
  CalendarDays,
  ChevronUp,
  Gem,
  LayoutDashboard,
  LayoutGrid,
  Moon,
  Newspaper,
  Share2,
  Sun,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { getThemeMeta } from '../hooks/useTheme';
import { AppRoute, ThemeMode } from '../types/market';

interface BottomDockProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
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
  { id: 'news', label: 'Breaking News', shortLabel: 'News', icon: Newspaper },
  { id: 'calendar', label: 'Macro Calendar', shortLabel: 'Calendar', icon: CalendarDays },
  { id: 'extract', label: 'Extract & Social Brief', shortLabel: 'Share', icon: Share2 },
];

export const BottomDock: React.FC<BottomDockProps> = ({
  activeRoute,
  onNavigate,
  themeMode,
  onToggleTheme,
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
    (autoCollapseMs = 4500) => {
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
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeRoute, expanded]);

  const activeItem = DOCK_ITEMS.find((item) => item.id === activeRoute) ?? DOCK_ITEMS[0];
  const ActiveIcon = activeItem.icon;
  const activeThemeMeta = getThemeMeta(themeMode);
  const themeLabel = activeThemeMeta.shortLabel;

  return (
    <nav
      ref={navRef}
      aria-label="Bottom Dock Navigation"
      onMouseEnter={() => {
        clearTimers();
        setExpanded(true);
      }}
      onMouseLeave={() => scheduleCollapse(260)}
      className="fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 pb-safe pointer-events-none flex justify-center max-w-[calc(100vw-1rem)]"
    >
      <AnimatePresence mode="wait" initial={false}>
        {!expanded ? (
          <motion.button
            key="dock-collapsed-fab"
            data-testid="bottom-dock-trigger"
            type="button"
            aria-expanded="false"
            aria-label={`Quick terminal navigation (${activeItem.shortLabel})`}
            initial={{ opacity: 0, scale: 0.88, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            whileTap={{ scale: 0.94 }}
            onClick={() => openDock(4500)}
            onTouchStart={() => openDock(4500)}
            onFocus={() => setExpanded(true)}
            className="pointer-events-auto liquid-glass-strong rounded-full px-3.5 py-2.5 flex items-center gap-2 shadow-xl hover:scale-[1.03] active:scale-[0.97] transition-transform focus:outline-none"
          >
            <span className="w-2 h-2 rounded-full bg-[#30D158] shrink-0" />
            <ActiveIcon className="w-4 h-4 text-[#1C1C1E] dark:text-white shrink-0" />
            <span className="text-xs font-bold text-[#1C1C1E] dark:text-white whitespace-nowrap">
              {activeItem.shortLabel}
            </span>
            <ChevronUp className="w-3.5 h-3.5 text-[#6C6C70] dark:text-[#9EB5C8] shrink-0" />
          </motion.button>
        ) : (
          <motion.div
            key="dock-expanded-bar"
            data-testid="bottom-dock-bar"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            ref={dockScrollRef}
            onTouchStart={() => openDock(4500)}
            className="pointer-events-auto w-full sm:w-auto overflow-x-auto no-scrollbar rounded-2xl px-2 py-1.5 sm:px-3 sm:py-2 flex items-center justify-start sm:justify-center gap-0.5 sm:gap-1.5 liquid-glass-strong shadow-2xl"
          >
            {DOCK_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeRoute === item.id;
              return (
                <motion.button
                  key={item.id}
                  data-route-id={item.id}
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    onNavigate(item.id);
                    scheduleCollapse(360);
                  }}
                  title={item.label}
                  className={`relative group shrink-0 flex flex-col items-center justify-center min-w-[48px] sm:w-14 h-12 sm:h-14 rounded-xl transition-colors sm:hover:-translate-y-0.5 focus:outline-none ${
                    isActive
                      ? 'text-[#1C1C1E] dark:text-white'
                      : 'text-[#4A4D57] dark:text-[#B4B8C4] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="dock-active-tab-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 30 }}
                      className="absolute inset-0 rounded-xl bg-white/90 dark:bg-white/18 border border-black/10 dark:border-white/20 shadow-sm"
                    />
                  )}
                  <motion.span
                    animate={
                      isActive ? { scale: [1, 1.2, 1], y: [0, -2, 0] } : { scale: 1, y: 0 }
                    }
                    transition={{ duration: 0.28 }}
                    className="relative z-10 inline-flex items-center justify-center"
                  >
                    <Icon className="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px]" />
                  </motion.span>
                  <span
                    className={`relative z-10 text-[9px] sm:text-[10px] tracking-tight mt-0.5 whitespace-nowrap ${
                      isActive ? 'font-bold' : 'font-medium'
                    }`}
                  >
                    {item.shortLabel}
                  </span>
                  {isActive && (
                    <motion.span
                      layoutId="dock-active-dot"
                      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                      className="relative z-10 -mb-0.5 mt-0.5 w-1.5 h-1.5 rounded-full bg-[#30D158]"
                    />
                  )}
                  <span className="hidden lg:block absolute -top-9 px-2.5 py-1 rounded-md bg-[#1C1C1E] dark:bg-black/95 text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/10 shadow-lg">
                    {item.label}
                  </span>
                </motion.button>
              );
            })}

            <div className="h-7 w-px bg-black/10 dark:bg-white/15 mx-1 shrink-0" />

            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                onToggleTheme();
                scheduleCollapse(2400);
              }}
              title={`Theme: ${activeThemeMeta.label} (click to cycle)`}
              className="hidden sm:flex relative group shrink-0 flex-col items-center justify-center w-14 h-14 rounded-xl text-[#6C6C70] dark:text-[#8E8E93] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#1C1C1E] dark:hover:text-white transition-colors hover:-translate-y-0.5"
            >
              {themeMode === 'obsidian' ? (
                <Moon className="w-[22px] h-[22px]" />
              ) : themeMode === 'parchment' ? (
                <Gem className="w-[22px] h-[22px]" />
              ) : (
                <Sun className="w-[22px] h-[22px]" />
              )}
              <span className="text-[10px] font-medium tracking-tight mt-0.5 truncate max-w-[52px]">
                {themeLabel}
              </span>
              <span className="hidden lg:block absolute -top-9 px-2.5 py-1 rounded-md bg-[#1C1C1E] dark:bg-black/95 text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/10 shadow-lg">
                {activeThemeMeta.label} · Click to Cycle
              </span>
            </motion.button>

            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                clearTimers();
                setExpanded(false);
              }}
              aria-label="Collapse floating dock"
              title="Minimize dock"
              className="shrink-0 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-[#6C6C70] dark:text-[#9EB5C8] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#1C1C1E] dark:hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
