import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  Briefcase,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Moon,
  Newspaper,
  Share2,
  Sun,
} from 'lucide-react';
import { motion } from 'motion/react';
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
  const [awake, setAwake] = useState(false);
  const idleTimerRef = useRef<number | null>(null);

  const wakeDock = () => {
    setAwake(true);
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setAwake(false), 2600);
  };

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, []);

  const themeLabel =
    themeMode === 'monochrome' ? 'Matte' : themeMode === 'dark' ? 'Dark' : 'Light';

  return (
    <nav
      aria-label="Bottom Dock Navigation"
      className="fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1rem)] max-w-lg sm:max-w-none sm:w-auto pb-safe pointer-events-none flex justify-center"
    >
      <div
        onMouseEnter={() => setAwake(true)}
        onMouseLeave={() => setAwake(false)}
        onTouchStart={wakeDock}
        className={`pointer-events-auto w-full sm:w-auto overflow-x-auto no-scrollbar rounded-2xl px-2 py-1.5 sm:px-3 sm:py-2 flex items-center justify-start sm:justify-center gap-0.5 sm:gap-1.5 liquid-glass-strong transition-all duration-500 ${
          awake
            ? 'opacity-100 scale-100'
            : 'opacity-65 hover:opacity-100 focus-within:opacity-100'
        }`}
      >
        {DOCK_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.id;
          return (
            <motion.button
              key={item.id}
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                wakeDock();
                onNavigate(item.id);
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
                animate={isActive ? { scale: [1, 1.2, 1], y: [0, -2, 0] } : { scale: 1, y: 0 }}
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

        <div className="hidden sm:block h-8 w-px bg-black/10 dark:bg-white/15 mx-1" />

        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            wakeDock();
            onToggleTheme();
          }}
          title={`Theme: ${themeMode === 'monochrome' ? 'Paper Matte' : themeMode === 'dark' ? 'Dark' : 'Light'} (click to cycle)`}
          className="hidden sm:flex relative group flex-col items-center justify-center w-14 h-14 rounded-xl text-[#6C6C70] dark:text-[#8E8E93] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#1C1C1E] dark:hover:text-white transition-colors hover:-translate-y-0.5"
        >
          {themeMode === 'dark' ? (
            <Moon className="w-[22px] h-[22px]" />
          ) : themeMode === 'monochrome' ? (
            <FileText className="w-[22px] h-[22px]" />
          ) : (
            <Sun className="w-[22px] h-[22px]" />
          )}
          <span className="text-[10px] font-medium tracking-tight mt-0.5">{themeLabel}</span>
          <span className="hidden lg:block absolute -top-9 px-2.5 py-1 rounded-md bg-[#1C1C1E] dark:bg-black/95 text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/10 shadow-lg">
            Light / Dark / Paper Matte
          </span>
        </motion.button>
      </div>
    </nav>
  );
};
