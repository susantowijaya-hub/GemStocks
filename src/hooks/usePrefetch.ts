import { useCallback, useEffect, useRef } from 'react';
import { AppRoute } from '../types/market';

const prefetchedRoutes = new Set<AppRoute>();
const prefetchedDataAt = new Map<string, number>();
const DATA_PREFETCH_TTL_MS = 45_000;

type RouteChunkLoader = () => Promise<unknown>;

const ROUTE_CHUNK_LOADERS: Partial<Record<AppRoute, RouteChunkLoader>> = {
  watchlist: () => import('../components/WatchlistView'),
  portfolio: () => import('../components/PortfolioView'),
  stocks: () => import('../components/TopStocksView'),
  heatmap: () => import('../components/MarketHeatmapView'),
  news: () => import('../components/NewsFeedView'),
  calendar: () => import('../components/EconomicCalendarView'),
  ict: () => import('../components/IctRadarView'),
  journal: () => import('../components/SignalJournalView'),
};

const ADJACENT_ROUTES: Record<AppRoute, AppRoute[]> = {
  dashboard: ['watchlist', 'ict', 'journal'],
  watchlist: ['dashboard', 'portfolio', 'ict'],
  portfolio: ['watchlist', 'stocks', 'journal'],
  stocks: ['journal', 'heatmap', 'portfolio'],
  heatmap: ['stocks', 'news', 'dashboard'],
  news: ['calendar', 'ict', 'journal'],
  calendar: ['news', 'ict', 'dashboard'],
  ict: ['journal', 'stocks', 'dashboard'],
  journal: ['ict', 'stocks', 'portfolio'],
};

const ROUTE_DATA_ENDPOINTS: Partial<Record<AppRoute, string[]>> = {
  dashboard: ['/api/market/quotes', '/api/fx/rates'],
  watchlist: ['/api/market/quotes'],
  portfolio: ['/api/fx/rates', '/api/stocks/movers'],
  stocks: ['/api/stocks/movers'],
  heatmap: ['/api/market/heatmap'],
  news: ['/api/news/feed', '/api/market/daily-summary'],
  calendar: ['/api/calendar/events'],
  ict: ['/api/market/quotes', '/api/signals/cloud'],
  journal: ['/api/signals/cloud'],
};

function warmEndpoint(url: string): void {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  const now = Date.now();
  const last = prefetchedDataAt.get(url) ?? 0;
  if (now - last < DATA_PREFETCH_TTL_MS) return;
  prefetchedDataAt.set(url, now);

  void fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    priority: 'low',
  } as RequestInit).catch(() => {
    // Best-effort cache warming only
  });
}

export function prefetchRouteComponent(route: AppRoute): void {
  if (prefetchedRoutes.has(route)) return;
  const loader = ROUTE_CHUNK_LOADERS[route];
  if (!loader) {
    prefetchedRoutes.add(route);
    return;
  }
  prefetchedRoutes.add(route);
  void loader().catch(() => {
    prefetchedRoutes.delete(route);
  });
}

export function prefetchRouteData(route: AppRoute): void {
  const endpoints = ROUTE_DATA_ENDPOINTS[route];
  if (!endpoints) return;
  for (const url of endpoints) {
    warmEndpoint(url);
  }
}

export function prefetchRouteAndData(route: AppRoute): void {
  prefetchRouteComponent(route);
  prefetchRouteData(route);
}

/**
 * Coordinates Priority Loading, adjacent-route prefetching, and idle/intersection
 * chunk warming so route transitions feel instant without delaying initial paint.
 */
export function usePrefetch(activeRoute: AppRoute, priorityReady: boolean) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedTargetsRef = useRef<WeakMap<Element, AppRoute>>(new WeakMap());

  // 1. Prefetch adjacent route chunks & data once priority dashboard paint is ready
  useEffect(() => {
    if (!priorityReady || typeof window === 'undefined') return;

    const adjacent = ADJACENT_ROUTES[activeRoute] ?? ['watchlist', 'ict', 'stocks'];
    const winWithIdle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    let idleId: number | null = null;
    let timerId: number | null = null;
    let secondaryTimerId: number | null = null;

    const runStaggeredIdlePrefetch = () => {
      const remaining = [
        ...adjacent,
        'watchlist',
        'ict',
        'journal',
        'stocks',
        'portfolio',
        'heatmap',
        'news',
        'calendar',
      ].filter((r, idx, arr): r is AppRoute => arr.indexOf(r) === idx && !prefetchedRoutes.has(r as AppRoute)) as AppRoute[];

      let stepIdx = 0;
      const scheduleNext = () => {
        if (stepIdx >= remaining.length) return;
        const route = remaining[stepIdx++];
        prefetchRouteComponent(route);
        if (stepIdx < remaining.length) {
          secondaryTimerId = globalThis.setTimeout(() => {
            if (typeof winWithIdle.requestIdleCallback === 'function') {
              idleId = winWithIdle.requestIdleCallback(scheduleNext, { timeout: 1500 });
            } else {
              scheduleNext();
            }
          }, 850) as unknown as number;
        }
      };

      scheduleNext();
    };

    timerId = globalThis.setTimeout(() => {
      if (typeof winWithIdle.requestIdleCallback === 'function') {
        idleId = winWithIdle.requestIdleCallback(runStaggeredIdlePrefetch, { timeout: 2000 });
      } else {
        runStaggeredIdlePrefetch();
      }
    }, 2800) as unknown as number;

    return () => {
      if (idleId !== null && typeof winWithIdle.cancelIdleCallback === 'function') {
        winWithIdle.cancelIdleCallback(idleId);
      }
      if (timerId !== null) globalThis.clearTimeout(timerId);
      if (secondaryTimerId !== null) globalThis.clearTimeout(secondaryTimerId);
    };
  }, [activeRoute, priorityReady]);

  // 2. IntersectionObserver support for nav/shortcut elements annotated with target routes
  useEffect(() => {
    if (!priorityReady || typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const route = observedTargetsRef.current.get(entry.target);
          if (route) {
            prefetchRouteAndData(route);
          }
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '120px' }
    );

    observerRef.current = io;
    return () => {
      io.disconnect();
      observerRef.current = null;
    };
  }, [priorityReady]);

  const registerPrefetchObserver = useCallback(
    (route: AppRoute) => (el: HTMLElement | null) => {
      if (!el || !observerRef.current) return;
      observedTargetsRef.current.set(el, route);
      observerRef.current.observe(el);
    },
    []
  );

  const handlePrefetchRoute = useCallback((route: AppRoute) => {
    prefetchRouteAndData(route);
  }, []);

  return {
    prefetchRoute: handlePrefetchRoute,
    registerPrefetchObserver,
  };
}
