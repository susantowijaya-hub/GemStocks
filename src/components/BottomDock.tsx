import React from 'react';
import {
  BarChart3,
  Bookmark,
  Briefcase,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Moon,
  Newspaper,
  Sun,
} from 'lucide-react';
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
  { id: 'news', label: 'Breaking News', shortLabel: 'News', icon: Newspaper },
  { id: 'calendar', label: 'Macro Calendar', shortLabel: 'Calendar', icon: CalendarDays },
];

export const BottomDock: React.FC<BottomDockProps> = ({
  activeRoute,
  onNavigate,
  themeMode,
  onToggleTheme,
}) => {
  const themeLabel =
    themeMode === 'monochrome' ? 'Matte' : themeMode === 'dark' ? 'Dark' : 'Light';

  return (
    <nav
      aria-label="Bottom Dock Navigation"
      className="fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.25rem)] max-w-md sm:max-w-none sm:w-auto pb-safe pointer-events-none flex justify-center"
    >
      <div className="pointer-events-auto w-full sm:w-auto rounded-2xl px-2 py-1.5 sm:px-3 sm:py-2 flex items-center justify-around sm:justify-center gap-0.5 sm:gap-1.5 backdrop-blur-2xl bg-white/90 dark:bg-[#1C1C1E]/85 border border-black/10 dark:border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.16)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.65)]">
        {DOCK_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              title={item.label}
              className={`relative group flex-1 sm:flex-none flex flex-col items-center justify-center min-w-[44px] sm:w-14 h-12 sm:h-14 rounded-xl transition-transform duration-150 active:scale-95 sm:hover:-translate-y-1 ${
                isActive
                  ? 'bg-black/10 dark:bg-white/15 text-[#1C1C1E] dark:text-white shadow-inner'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <Icon className="w-[18px] h-[18px] sm:w-[22px] sm:h-[22px]" />
              <span
                className={`text-[9px] sm:text-[10px] tracking-tight mt-0.5 whitespace-nowrap ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {item.shortLabel}
              </span>
              {isActive && (
                <span className="absolute -bottom-0.5 w-1.5 h-1.5 rounded-full bg-[#30D158]" />
              )}
              <span className="hidden lg:block absolute -top-9 px-2.5 py-1 rounded-md bg-[#1C1C1E] dark:bg-black/95 text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/10 shadow-lg">
                {item.label}
              </span>
            </button>
          );
        })}

        <div className="hidden sm:block h-8 w-px bg-black/10 dark:bg-white/15 mx-1" />

        <button
          type="button"
          onClick={onToggleTheme}
          title={`Theme: ${themeMode === 'monochrome' ? 'Paper Matte' : themeMode === 'dark' ? 'Dark' : 'Light'} (click to cycle)`}
          className="hidden sm:flex relative group flex-col items-center justify-center w-14 h-14 rounded-xl text-[#6C6C70] dark:text-[#8E8E93] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#1C1C1E] dark:hover:text-white transition-transform duration-150 active:scale-95 hover:-translate-y-1"
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
        </button>
      </div>
    </nav>
  );
};
