import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  Briefcase,
  CalendarDays,
  Check,
  ChevronRight,
  Crosshair,
  Gem,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Moon,
  Newspaper,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { getThemeMeta, THEME_OPTIONS } from '../hooks/useTheme';
import { AppRoute, ThemeMode } from '../types/market';

interface BottomDockProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  onSelectTheme?: (mode: ThemeMode) => void;
  onOpenSettings?: () => void;
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
];

const MOBILE_PRIMARY_TABS: {
  id: AppRoute;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Market Dashboard', shortLabel: 'Markets', icon: LayoutDashboard },
  { id: 'stocks', label: 'Top 10 Stocks (US & ID)', shortLabel: 'Stocks', icon: BarChart3 },
  { id: 'ict', label: 'ICT Liquidity & OTE Radar', shortLabel: 'ICT Radar', icon: Crosshair },
  { id: 'portfolio', label: 'Portfolios & Lists', shortLabel: 'Portfolio', icon: Briefcase },
];

const MOBILE_MORE_ITEMS: {
  id: AppRoute;
  label: string;
  shortLabel: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'watchlist', label: 'Market Watchlist', shortLabel: 'Watchlist', desc: 'Pinned global tickers', icon: Bookmark },
  { id: 'heatmap', label: 'Market Cap Heatmap', shortLabel: 'Heatmap', desc: 'Sector & cap map', icon: LayoutGrid },
  { id: 'news', label: 'Breaking News', shortLabel: 'News', desc: 'Global & IDX wires', icon: Newspaper },
  { id: 'calendar', label: 'Macro Calendar', shortLabel: 'Calendar', desc: 'High-impact releases', icon: CalendarDays },
];

const MOBILE_MORE_ROUTE_IDS = new Set<AppRoute>(MOBILE_MORE_ITEMS.map((item) => item.id));

export const BottomDock: React.FC<BottomDockProps> = ({
  activeRoute,
  onNavigate,
  themeMode,
  onToggleTheme,
  onSelectTheme,
  onOpenSettings,
  onPrefetchRoute,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
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

  // Collapse desktop dock when clicking/tapping outside or pressing Escape
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

  // Close mobile More sheet on Escape
  useEffect(() => {
    if (!mobileMoreOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMoreOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mobileMoreOpen]);

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
  const isMoreRouteActive = MOBILE_MORE_ROUTE_IDS.has(activeRoute);

  return (
    <>
      {/* =====================================================================
          MOBILE (< lg): Ergonomic Thumb-Zone Fixed Bottom Tab Bar + More Sheet
          ===================================================================== */}
      <nav
        data-testid="mobile-bottom-nav"
        aria-label="Mobile Bottom Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 liquid-glass-strong !border-x-0 !border-b-0 shadow-[0_-6px_24px_rgba(10,37,64,0.10)] dark:shadow-[0_-8px_28px_rgba(0,0,0,0.55)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-5 h-[58px] max-w-xl mx-auto px-1">
          {MOBILE_PRIMARY_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeRoute === tab.id && !mobileMoreOpen;
            return (
              <button
                key={tab.id}
                type="button"
                data-route-id={tab.id}
                data-testid={`mobile-nav-${tab.id}`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
                onTouchStart={() => onPrefetchRoute?.(tab.id)}
                onClick={() => {
                  setMobileMoreOpen(false);
                  onNavigate(tab.id);
                }}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl transition-colors focus:outline-none active:scale-95 ${
                  isActive
                    ? 'text-[#1D4ED8] dark:text-[#60A5FA] velvet:text-[#FF786E] parchment:text-[#B4410E]'
                    : 'text-[#425466] dark:text-[#94A3B8] velvet:text-[#9790AB]'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 w-8 h-[3px] rounded-full bg-[#1D4ED8] dark:bg-[#2962FF] velvet:bg-[#F9574B] parchment:bg-[#B4410E]"
                  />
                )}
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'stroke-[2.3]' : 'stroke-[1.9]'}`} />
                <span className="text-[10.5px] font-bold leading-none tracking-tight truncate max-w-full px-0.5">
                  {tab.shortLabel}
                </span>
              </button>
            );
          })}

          {/* 5th Tab: More Drawer Trigger */}
          <button
            type="button"
            data-testid="mobile-more-trigger"
            aria-expanded={mobileMoreOpen}
            aria-label="Open more navigation and theme controls"
            onClick={() => setMobileMoreOpen((prev) => !prev)}
            className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-xl transition-colors focus:outline-none active:scale-95 ${
              mobileMoreOpen || isMoreRouteActive
                ? 'text-[#1D4ED8] dark:text-[#60A5FA] velvet:text-[#FF786E] parchment:text-[#B4410E]'
                : 'text-[#425466] dark:text-[#94A3B8] velvet:text-[#9790AB]'
            }`}
          >
            {(mobileMoreOpen || isMoreRouteActive) && (
              <span
                aria-hidden="true"
                className="absolute top-0.5 w-8 h-[3px] rounded-full bg-[#1D4ED8] dark:bg-[#2962FF] velvet:bg-[#F9574B] parchment:bg-[#B4410E]"
              />
            )}
            {mobileMoreOpen ? (
              <X className="w-5 h-5 shrink-0 stroke-[2.3]" />
            ) : (
              <Menu className="w-5 h-5 shrink-0 stroke-[2]" />
            )}
            <span className="text-[10.5px] font-bold leading-none tracking-tight">
              {isMoreRouteActive && !mobileMoreOpen ? activeItem.shortLabel : 'More'}
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Slide-Up "More" Bottom Sheet Drawer */}
      {mobileMoreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="More Terminal Views and Display Settings"
        >
          {/* Scrim Backdrop */}
          <button
            type="button"
            aria-label="Close navigation drawer"
            onClick={() => setMobileMoreOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          />

          {/* Sheet Body */}
          <div
            data-testid="mobile-more-sheet"
            className="relative z-10 w-full rounded-t-3xl liquid-glass-strong border-t border-black/10 dark:border-white/15 px-4 pt-3 pb-6 shadow-2xl animate-route-enter"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {/* Drag Handle */}
            <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/25 mx-auto mb-3" />

            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-extrabold text-[#0A2540] dark:text-[#F0F3FA]">
                  Terminal Modules
                </h2>
                <p className="text-[11px] text-[#526375] dark:text-[#94A3B8]">
                  Switch tools or adjust daylight/night grading
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                aria-label="Close menu"
                className="w-9 h-9 rounded-full liquid-glass-pill flex items-center justify-center text-[#0A2540] dark:text-[#F0F3FA]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Secondary Routes Grid (large >= 48px touch targets) */}
            <div className="grid grid-cols-2 gap-2.5">
              {MOBILE_MORE_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeRoute === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-route-id={item.id}
                    data-testid={`mobile-more-${item.id}`}
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileMoreOpen(false);
                    }}
                    className={`flex items-center gap-3 min-h-[54px] px-3 py-2.5 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                      isActive
                        ? 'bg-[#1D4ED8]/12 dark:bg-[#2962FF]/18 velvet:bg-[#F9574B]/16 border-[#1D4ED8]/45 dark:border-[#2962FF]/55 velvet:border-[#F9574B]/55 text-[#0A2540] dark:text-white'
                        : 'liquid-glass-inset text-[#0A2540] dark:text-[#F0F3FA]'
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-[#1D4ED8] dark:bg-[#2962FF] velvet:bg-[#F9574B] text-white'
                          : 'bg-black/[0.06] dark:bg-white/[0.08] text-[#1D4ED8] dark:text-[#60A5FA] velvet:text-[#FF786E]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold truncate">{item.shortLabel}</div>
                      <div className="text-[10.5px] text-[#526375] dark:text-[#94A3B8] truncate">
                        {item.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Settings & Theme Switcher */}
            <div className="mt-4 pt-3.5 border-t border-black/10 dark:border-white/10">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#526375] dark:text-[#94A3B8]">
                  Settings · Display Theme
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMoreOpen(false);
                      onOpenSettings();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1D4ED8] dark:text-[#60A5FA] velvet:text-[#FF786E] parchment:text-[#B4410E]"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>All Settings</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {THEME_OPTIONS.map((opt) => {
                  const selected = opt.id === themeMode;
                  const Icon =
                    opt.id === 'obsidian'
                      ? Moon
                      : opt.id === 'velvet'
                        ? Layers
                        : opt.id === 'parchment'
                          ? Gem
                          : Sun;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        if (onSelectTheme) {
                          onSelectTheme(opt.id);
                        } else {
                          onToggleTheme();
                        }
                      }}
                      className={`min-h-[44px] px-2.5 py-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold transition-all ${
                        selected
                          ? 'bg-[#1D4ED8]/14 dark:bg-[#2962FF]/20 velvet:bg-[#F9574B]/18 parchment:bg-[#B4410E]/12 border-[#1D4ED8]/50 dark:border-[#2962FF]/55 velvet:border-[#F9574B]/55 parchment:border-[#B4410E]/50 text-[#0A2540] dark:text-white'
                          : 'liquid-glass-inset text-[#425466] dark:text-[#CBD5E1]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{opt.label}</span>
                      {selected && <Check className="w-3 h-3 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DESKTOP (>= lg): Collapsible Left-Edge Side Dock (Preserved)
          ===================================================================== */}
      <nav
        ref={navRef}
        aria-label="Left Side Dock Navigation"
        className="hidden lg:flex fixed left-3 top-1/2 -translate-y-1/2 z-40 pointer-events-none items-center max-h-[calc(100dvh-2rem)]"
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
            className="pointer-events-auto liquid-glass-strong w-8 h-16 rounded-full flex flex-col items-center justify-center gap-0.5 shadow-xl hover:scale-105 active:scale-95 transition-transform focus:outline-none text-[#1C1C1E] dark:text-white border border-black/10 dark:border-white/20"
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
            className="pointer-events-auto w-[186px] max-h-[calc(100dvh-2.5rem)] overflow-y-auto no-scrollbar rounded-2xl p-2 flex flex-col items-stretch justify-start gap-1 liquid-glass-strong shadow-[0_14px_38px_rgba(0,0,0,0.22)] dark:shadow-[0_18px_46px_rgba(0,0,0,0.72)] border border-black/10 dark:border-white/20 animate-route-enter"
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
                  className={`relative group shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all active:scale-[0.96] hover:translate-x-0.5 focus:outline-none ${
                    isActive
                      ? 'text-white'
                      : 'text-[#1E293B] dark:text-[#F1F5F9] hover:text-[#1D4ED8] dark:hover:text-white'
                  }`}
                >
                  {isActive && (
                    <span className="absolute inset-0 rounded-xl bg-[#1D4ED8] dark:bg-[#2962FF] velvet:bg-[#F9574B] parchment:bg-[#B4410E] transition-all duration-200" />
                  )}
                  <span className="relative z-10 inline-flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="relative z-10 text-xs font-extrabold tracking-tight truncate">
                    {item.shortLabel}
                  </span>
                </button>
              );
            })}

            <div className="w-full h-px bg-black/10 dark:bg-white/15 my-0.5 shrink-0" />

            <button
              type="button"
              onClick={() => {
                if (onOpenSettings) {
                  clearTimers();
                  setExpanded(false);
                  onOpenSettings();
                } else {
                  onToggleTheme();
                  scheduleCollapse(3000);
                }
              }}
              aria-label={`Open Settings (${activeThemeMeta.label} theme)`}
              title={`Settings · Theme: ${activeThemeMeta.label}`}
              className="relative group shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#1E293B] dark:text-[#F1F5F9] hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.96] transition-all"
            >
              <Settings className="w-4 h-4 shrink-0 text-[#1D4ED8] dark:text-[#60A5FA] velvet:text-[#FF786E] parchment:text-[#B4410E]" />
              <span className="text-xs font-bold truncate">
                Settings ({activeThemeMeta.label})
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
              <span className="text-[11px] font-bold truncate">Hide Dock</span>
            </button>
          </div>
        )}
      </nav>
    </>
  );
};
