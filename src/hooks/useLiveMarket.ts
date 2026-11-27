import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ECONOMIC_EVENTS,
  FX_PAIR_TILES,
  FX_RATES_USD_BASE,
  INITIAL_ASSETS,
  NEWS_STORIES,
} from '../data/marketData';
import {
  CalendarCatalyst,
  ClientFeedTransportDiagnostics,
  CurrencyCode,
  DailyMarketHighlight,
  DailyMarketSummaryResponse,
  EconomicEvent,
  FxPairTile,
  MarketAsset,
  MarketHeatmapResponse,
  MarketIntelligenceResponse,
  NewsStory,
  PriorityStreamStatus,
  ServerFeedDiagnosticsResponse,
  StocksMoversBucket,
  Timeframe,
} from '../types/market';

interface QuotePatch {
  id: string;
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  open: string;
  dayHigh: string;
  dayLow: string;
  volume: string;
  avgVol: string;
  avgVolLabel: string;
  peLabel: string;
  peValue: string;
  capLabel: string;
  capValue: string;
  w52Low: string;
  w52High: string;
  w52Pct: number;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  support: string;
  supportNote: string;
  resistance: string;
  resistanceNote: string;
  commentary: string;
  sparklinePoints: number[];
  chart1D: number[];
  timestamps1D: number[];
  updatedAtEpoch: number;
  marketSessionOpen?: boolean;
  sessionStateLabel?: string;
  sessionProgressRatio?: number;
  fearGreed7d?: number[];
  move5mPct?: number;
  vol5mRangePct?: number;
  move5mSource?: 'server-5m' | 'intraday-1m' | 'closed';
}

interface BackoffTracker {
  failures: number;
  nextAllowedAt: number;
}

const JITTER_WINDOW_SIZE = 5;
const BOOTSTRAP_CACHE_KEY = 'stocks-bootstrap-cache-v1';
const BOOTSTRAP_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const WS_CONNECT_TIMEOUT_MS = 10_000;
const BOOTSTRAP_TIMEOUT_MS = 10_000;

interface BootstrapCachePayload {
  savedAt: number;
  assets?: Array<
    Pick<
      MarketAsset,
      | 'id'
      | 'price'
      | 'prevClose'
      | 'changeValue'
      | 'changePercent'
      | 'open'
      | 'dayHigh'
      | 'dayLow'
      | 'volume'
      | 'sentiment'
      | 'support'
      | 'resistance'
      | 'commentary'
      | 'updatedAtEpoch'
      | 'marketSessionOpen'
      | 'sessionStateLabel'
      | 'fearGreed7d'
      | 'move5mPct'
      | 'vol5mRangePct'
      | 'move5mSource'
    >
  >;
  fxRates?: Record<CurrencyCode, number>;
  fxPairTiles?: FxPairTile[];
  newsStories?: NewsStory[];
  economicEvents?: EconomicEvent[];
  usMoversBucket?: StocksMoversBucket;
  idxMoversBucket?: StocksMoversBucket;
}

function readBootstrapCache(): BootstrapCachePayload | null {
  try {
    const raw = localStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BootstrapCachePayload;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > BOOTSTRAP_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function mergeBootstrapAssets(base: MarketAsset[], cached?: BootstrapCachePayload['assets']): MarketAsset[] {
  if (!Array.isArray(cached) || cached.length === 0) return base;
  const map = new Map(cached.map((c) => [c.id, c]));
  return base.map((asset) => {
    const patch = map.get(asset.id);
    if (!patch || !Number.isFinite(patch.price) || patch.price <= 0) return asset;
    return {
      ...asset,
      price: patch.price,
      prevClose: patch.prevClose > 0 ? patch.prevClose : asset.prevClose,
      changeValue: Number.isFinite(patch.changeValue) ? patch.changeValue : asset.changeValue,
      changePercent: Number.isFinite(patch.changePercent) ? patch.changePercent : asset.changePercent,
      open: patch.open || asset.open,
      dayHigh: patch.dayHigh || asset.dayHigh,
      dayLow: patch.dayLow || asset.dayLow,
      volume: patch.volume || asset.volume,
      sentiment: patch.sentiment || asset.sentiment,
      support: patch.support || asset.support,
      resistance: patch.resistance || asset.resistance,
      commentary: patch.commentary || asset.commentary,
      updatedAtEpoch: patch.updatedAtEpoch || asset.updatedAtEpoch,
      marketSessionOpen: patch.marketSessionOpen ?? asset.marketSessionOpen,
      sessionStateLabel: patch.sessionStateLabel ?? asset.sessionStateLabel,
      fearGreed7d: patch.fearGreed7d ?? asset.fearGreed7d,
      move5mPct: patch.move5mPct ?? asset.move5mPct,
      vol5mRangePct: patch.vol5mRangePct ?? asset.vol5mRangePct,
      move5mSource: patch.move5mSource ?? asset.move5mSource,
    };
  });
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

async function fetchJsonWithLatency<T>(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>
): Promise<{ data: T | null; rttMs: number | null }> {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    const rttMs = Math.max(1, Math.round(performance.now() - start));
    if (!res.ok) return { data: null, rttMs };
    return { data: (await res.json()) as T, rttMs };
  } catch {
    return { data: null, rttMs: null };
  } finally {
    window.clearTimeout(timerId);
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T | null> {
  const { data } = await fetchJsonWithLatency<T>(url, timeoutMs);
  return data;
}

export function useLiveMarket() {
  const bootstrapRef = useRef<BootstrapCachePayload | null | undefined>(undefined);
  if (bootstrapRef.current === undefined) {
    bootstrapRef.current = typeof window !== 'undefined' ? readBootstrapCache() : null;
  }
  const boot = bootstrapRef.current;

  const [assets, setAssets] = useState<MarketAsset[]>(() =>
    mergeBootstrapAssets(INITIAL_ASSETS, boot?.assets)
  );
  const [newsStories, setNewsStories] = useState<NewsStory[]>(() =>
    boot?.newsStories && boot.newsStories.length > 0 ? boot.newsStories : NEWS_STORIES
  );
  const [economicEvents, setEconomicEvents] = useState<EconomicEvent[]>(() =>
    boot?.economicEvents && boot.economicEvents.length > 0 ? boot.economicEvents : ECONOMIC_EVENTS
  );
  const [nextCatalyst, setNextCatalyst] = useState<CalendarCatalyst | null>(null);
  const [fxRates, setFxRates] = useState<Record<CurrencyCode, number>>(() =>
    boot?.fxRates ? { ...FX_RATES_USD_BASE, ...boot.fxRates } : FX_RATES_USD_BASE
  );
  const [fxPairTiles, setFxPairTiles] = useState<FxPairTile[]>(() =>
    boot?.fxPairTiles && boot.fxPairTiles.length > 0 ? boot.fxPairTiles : FX_PAIR_TILES
  );
  const [usMoversBucket, setUsMoversBucket] = useState<StocksMoversBucket>(() =>
    boot?.usMoversBucket ?? {
      impact: [],
      gainers: [],
      losers: [],
    }
  );
  const [idxMoversBucket, setIdxMoversBucket] = useState<StocksMoversBucket>(() =>
    boot?.idxMoversBucket ?? {
      impact: [],
      gainers: [],
      losers: [],
      foreignBuy: [],
      foreignSell: [],
    }
  );
  const [stocksUpdatedAt, setStocksUpdatedAt] = useState<string | null>(null);
  const [stocksLoading, setStocksLoading] = useState<boolean>(
    !(boot?.usMoversBucket?.impact?.length || boot?.idxMoversBucket?.impact?.length)
  );
  const [heatmapData, setHeatmapData] = useState<MarketHeatmapResponse | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState<boolean>(true);
  const [dailySummary, setDailySummary] = useState<DailyMarketSummaryResponse | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState<boolean>(false);
  const [marketIntelligence, setMarketIntelligence] = useState<MarketIntelligenceResponse | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState<boolean>(false);
  const [isPulseActive, setIsPulseActive] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsTimedOut, setWsTimedOut] = useState(false);
  const [cachedFallbackActive, setCachedFallbackActive] = useState(false);
  const [priorityStreamStatus, setPriorityStreamStatus] =
    useState<PriorityStreamStatus>('reconnecting');
  const [prioritySources, setPrioritySources] = useState<Record<string, string>>({});
  const [feedsLive, setFeedsLive] = useState(false);
  const [flashMap, setFlashMap] = useState<Record<string, 'gain' | 'loss'>>({});
  const [serverDiagnostics, setServerDiagnostics] = useState<ServerFeedDiagnosticsResponse | null>(
    null
  );
  const [quotesRttMs, setQuotesRttMs] = useState<number | null>(null);
  const [lastQuotesAt, setLastQuotesAt] = useState<number | null>(null);
  const [lastWsTickState, setLastWsTickState] = useState<number | null>(null);

  const isPulseRef = useRef(isPulseActive);
  isPulseRef.current = isPulseActive;
  const wsConnectedRef = useRef(false);
  wsConnectedRef.current = wsConnected;
  const feedsLiveRef = useRef(false);
  feedsLiveRef.current = feedsLive;
  const quotesInFlightRef = useRef(false);
  const priorityRadarInFlightRef = useRef(false);
  const stocksInFlightRef = useRef(false);
  const heatmapInFlightRef = useRef(false);
  const summaryInFlightRef = useRef(false);
  const intelInFlightRef = useRef(false);
  const anySessionOpenRef = useRef(true);
  const lastClosedPollAtRef = useRef(0);
  const lastFullQuotesAtRef = useRef(0);
  const lastWsTickAtRef = useRef<Record<string, number>>({});

  // Forces immediate fallback to cached local snapshot (or bundled INITIAL_ASSETS) if WS or boot exceeds 10s
  const activateCachedLocalFallback = useCallback(() => {
    setCachedFallbackActive(true);
    const cached = typeof window !== 'undefined' ? readBootstrapCache() : null;
    if (cached?.assets && cached.assets.length > 0) {
      setAssets((prev) => mergeBootstrapAssets(prev, cached.assets));
      if (cached.fxRates) {
        setFxRates((prev) => ({ ...prev, ...cached.fxRates }));
      }
      if (cached.fxPairTiles && cached.fxPairTiles.length > 0) {
        setFxPairTiles(cached.fxPairTiles);
      }
      if (cached.newsStories && cached.newsStories.length > 0) {
        setNewsStories(cached.newsStories);
      }
      if (cached.economicEvents && cached.economicEvents.length > 0) {
        setEconomicEvents(cached.economicEvents);
      }
    }
    setStocksLoading(false);
    setHeatmapLoading(false);
  }, []);

  // Jitter-buffer, adaptive EMA filter, spike guard, and per-endpoint exponential backoff
  const tickWindowRef = useRef<Record<string, number[]>>({});
  const emaPriceRef = useRef<Record<string, number>>({});
  const pendingOutlierRef = useRef<Record<string, { price: number; count: number }>>({});
  const backoffRef = useRef<Record<string, BackoffTracker>>({});

  const shouldSkipForBackoff = useCallback((key: string, force = false): boolean => {
    if (force) return false;
    const tracker = backoffRef.current[key];
    return Boolean(tracker && tracker.failures > 0 && Date.now() < tracker.nextAllowedAt);
  }, []);

  const recordFetchOutcome = useCallback((key: string, ok: boolean, baseDelayMs = 1500, maxDelayMs = 15_000) => {
    if (ok) {
      backoffRef.current[key] = { failures: 0, nextAllowedAt: 0 };
      return;
    }
    const prev = backoffRef.current[key]?.failures ?? 0;
    const failures = prev + 1;
    const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.min(4, failures - 1)));
    backoffRef.current[key] = { failures, nextAllowedAt: Date.now() + delay };
  }, []);

  /**
   * Live tick validator + outlier spike guard.
   * - Closed markets and normal live ticks snap directly to incoming spot price with zero EMA damping lag.
   * - Single-tick flash spikes deviating > 2.5%–3.5% from rolling median are held 1 tick until a 2nd sample confirms.
   */
  const smoothTickPrice = useCallback(
    (
      assetId: string,
      incomingPrice: number,
      decimals: number,
      marketSessionOpen: boolean,
      currentDisplayPrice: number
    ): number => {
      if (!Number.isFinite(incomingPrice) || incomingPrice <= 0) {
        return currentDisplayPrice;
      }

      if (!marketSessionOpen) {
        tickWindowRef.current[assetId] = [incomingPrice];
        emaPriceRef.current[assetId] = incomingPrice;
        delete pendingOutlierRef.current[assetId];
        return Number(incomingPrice.toFixed(decimals));
      }

      const window = tickWindowRef.current[assetId] ?? [];
      if (window.length === 0) {
        tickWindowRef.current[assetId] = [incomingPrice];
        emaPriceRef.current[assetId] = incomingPrice;
        return Number(incomingPrice.toFixed(decimals));
      }

      const median = computeMedian(window);
      const outlierThreshold = assetId === 'BTCUSD' || assetId === 'ETHUSD' ? 0.035 : 0.025;
      const relDev = median > 0 ? Math.abs(incomingPrice - median) / median : 0;

      // Reject unconfirmed 1-tick spikes; confirm immediately if 2 consecutive ticks hold the new level
      if (window.length >= 3 && relDev > outlierThreshold) {
        const pending = pendingOutlierRef.current[assetId];
        const matchesPending =
          pending && Math.abs(incomingPrice - pending.price) / Math.max(1e-6, pending.price) < 0.015;
        if (!matchesPending) {
          pendingOutlierRef.current[assetId] = { price: incomingPrice, count: 1 };
          return currentDisplayPrice > 0
            ? Number(currentDisplayPrice.toFixed(decimals))
            : Number(median.toFixed(decimals));
        }
        // 2nd tick confirmed breakout: reset buffer cleanly to new price regime
        delete pendingOutlierRef.current[assetId];
        tickWindowRef.current[assetId] = [incomingPrice];
        emaPriceRef.current[assetId] = incomingPrice;
        return Number(incomingPrice.toFixed(decimals));
      }

      delete pendingOutlierRef.current[assetId];
      tickWindowRef.current[assetId] = [...window.slice(-(JITTER_WINDOW_SIZE - 1)), incomingPrice];
      emaPriceRef.current[assetId] = incomingPrice;

      return Number(incomingPrice.toFixed(decimals));
    },
    []
  );

  const triggerFlash = useCallback((id: string, dir: 'gain' | 'loss') => {
    setFlashMap((prev) => ({ ...prev, [id]: dir }));
    window.setTimeout(() => {
      setFlashMap((prev) => {
        if (!prev[id]) return prev;
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }, 650);
  }, []);

  // Top-Priority Fast-Lane strictly for BTC/USD, XAU/USD, and DXY (highest refresh priority above all feeds)
  const refreshPriorityRadar = useCallback(
    async (force = false) => {
      if ((!force && priorityRadarInFlightRef.current) || shouldSkipForBackoff('priorityRadar', force)) {
        return;
      }
      priorityRadarInFlightRef.current = true;
      try {
        const data = await fetchJsonWithTimeout<{
          quotes?: Array<{
            id: 'BTCUSD' | 'XAUUSD' | 'DXY';
            price: number;
            prevClose: number;
            changeValue: number;
            changePercent: number;
            dayHigh?: number;
            dayLow?: number;
            marketSessionOpen: boolean;
            sessionStateLabel: string;
            updatedAtEpoch: number;
            sourceLabel: string;
          }>;
          updatedAt?: string;
          latencyMs?: number;
        }>('/api/market/priority-radar', 3500);

        if (!data || !Array.isArray(data.quotes) || data.quotes.length === 0) {
          recordFetchOutcome('priorityRadar', false, 1500, 10_000);
          return;
        }
        recordFetchOutcome('priorityRadar', true);
        setFeedsLive(true);
        setCachedFallbackActive(false);

        const patchMap = new Map(data.quotes.map((q) => [q.id, q]));
        const flashes: Array<{ id: string; dir: 'gain' | 'loss' }> = [];

        setAssets((prev) =>
          prev.map((asset) => {
            const patch = patchMap.get(asset.id as 'BTCUSD' | 'XAUUSD' | 'DXY');
            if (!patch || !Number.isFinite(patch.price) || patch.price <= 0) return asset;

            // Preserve active /ws/priority-radar ticks if a socket tick arrived within 3s
            if (
              asset.id === 'BTCUSD' ||
              asset.id === 'XAUUSD' ||
              asset.id === 'DXY' ||
              asset.id === 'ETHUSD'
            ) {
              const lastWs = lastWsTickAtRef.current[asset.id] ?? 0;
              if (Date.now() - lastWs < 3000) {
                return asset;
              }
            }

            const smoothed = smoothTickPrice(
              asset.id,
              patch.price,
              asset.decimals,
              patch.marketSessionOpen,
              asset.price
            );
            if (smoothed !== asset.price && asset.price > 0) {
              flashes.push({ id: asset.id, dir: smoothed > asset.price ? 'gain' : 'loss' });
            }

            const nextCandles = asset.chartCandles ? { ...asset.chartCandles } : undefined;
            if (nextCandles) {
              for (const tfKey of ['1m', '5m', '15m', '30m', '1h', '4h'] as Timeframe[]) {
                const bars = nextCandles[tfKey];
                if (Array.isArray(bars) && bars.length > 0) {
                  const last = bars[bars.length - 1];
                  if (last.c !== smoothed) {
                    nextCandles[tfKey] = [
                      ...bars.slice(0, -1),
                      {
                        ...last,
                        c: smoothed,
                        h: Math.max(last.h, smoothed),
                        l: Math.min(last.l, smoothed),
                      },
                    ];
                  }
                }
              }
            }

            const next1D =
              asset.chartSeries['1D'] && asset.chartSeries['1D'].length > 0
                ? [...asset.chartSeries['1D'].slice(0, -1), smoothed]
                : asset.chartSeries['1D'];

            const fmtHiLo = (v?: number) =>
              typeof v === 'number' && Number.isFinite(v) && v > 0
                ? v.toLocaleString('en-US', {
                    minimumFractionDigits: asset.decimals,
                    maximumFractionDigits: asset.decimals,
                  })
                : undefined;

            return {
              ...asset,
              price: smoothed,
              prevClose: patch.prevClose > 0 ? patch.prevClose : asset.prevClose,
              changeValue: Number((smoothed - (patch.prevClose > 0 ? patch.prevClose : asset.prevClose)).toFixed(asset.decimals >= 3 ? asset.decimals : 2)),
              changePercent: patch.changePercent,
              dayHigh: fmtHiLo(patch.dayHigh) ?? asset.dayHigh,
              dayLow: fmtHiLo(patch.dayLow) ?? asset.dayLow,
              marketSessionOpen: patch.marketSessionOpen,
              sessionStateLabel: patch.sessionStateLabel,
              updatedAtEpoch: patch.updatedAtEpoch,
              chartSeries: { ...asset.chartSeries, '1D': next1D },
              ...(nextCandles ? { chartCandles: nextCandles } : {}),
            };
          })
        );

        for (const f of flashes) {
          triggerFlash(f.id, f.dir);
        }
      } finally {
        priorityRadarInFlightRef.current = false;
      }
    },
    [recordFetchOutcome, shouldSkipForBackoff, smoothTickPrice, triggerFlash]
  );

  // Fetch all live market quotes from backend aggregator (1s compact ticks after initial full series hydration)
  const refreshQuotes = useCallback(
    async (force = false) => {
      if ((!force && quotesInFlightRef.current) || shouldSkipForBackoff('quotes', force)) return;
      quotesInFlightRef.current = true;
      try {
        const now = Date.now();
        if (force) {
          lastFullQuotesAtRef.current = 0;
        }
        const needFullSeries =
          lastFullQuotesAtRef.current === 0 || now - lastFullQuotesAtRef.current >= 30_000;
        const { data: payload, rttMs } = await fetchJsonWithLatency<{
          quotes?: QuotePatch[];
          diagnostics?: ServerFeedDiagnosticsResponse;
        }>(
          '/api/market/quotes',
          needFullSeries ? 10_000 : 4500,
          needFullSeries ? undefined : { 'X-Quotes-Mode': 'compact' }
        );
        if (rttMs !== null) {
          setQuotesRttMs(rttMs);
        }
        const patches = payload?.quotes;
        if (!Array.isArray(patches) || patches.length === 0) {
          recordFetchOutcome('quotes', false, 2000, 15_000);
          return;
        }

        if (needFullSeries || patches.some((p) => Array.isArray(p.chart1D) && p.chart1D.length > 1)) {
          lastFullQuotesAtRef.current = Date.now();
        }
        recordFetchOutcome('quotes', true);
        setLastQuotesAt(Date.now());
        if (payload?.diagnostics) {
          setServerDiagnostics(payload.diagnostics);
        }
        const patchMap = new Map(patches.map((p) => [p.id, p]));
        anySessionOpenRef.current = patches.some((p) => p.marketSessionOpen !== false);
        setFeedsLive(true);
        setCachedFallbackActive(false);

        setAssets((prev) =>
          prev.map((asset) => {
            const patch = patchMap.get(asset.id);
            if (!patch) return asset;
            // Preserve live /ws/priority-radar ticks for BTC/XAU/DXY/ETH so REST quotes never ping-pong
            const wsFresh =
              (asset.id === 'BTCUSD' ||
                asset.id === 'XAUUSD' ||
                asset.id === 'DXY' ||
                asset.id === 'ETHUSD') &&
              Date.now() - (lastWsTickAtRef.current[asset.id] ?? 0) < 5500;

            const sessionOpen = patch.marketSessionOpen !== false;
            const nextPrice = wsFresh
              ? asset.price
              : smoothTickPrice(asset.id, patch.price, asset.decimals, sessionOpen, asset.price);

            const safePrev = patch.prevClose > 0 ? patch.prevClose : asset.prevClose;
            const nextChangeValue = Number((nextPrice - safePrev).toFixed(asset.decimals));
            const nextChangePercent = Number(
              (((nextPrice - safePrev) / Math.max(1e-6, safePrev)) * 100).toFixed(2)
            );

            const priceChanged =
              !wsFresh && Math.abs(nextPrice - asset.price) > Math.pow(10, -(asset.decimals + 1));
            if (priceChanged) {
              triggerFlash(asset.id, nextPrice >= asset.price ? 'gain' : 'loss');
            }
            const hasFullPatch1D = Array.isArray(patch.chart1D) && patch.chart1D.length > 1;
            const existing1D = asset.chartSeries['1D'];
            const patchedSeries = hasFullPatch1D
              ? [...patch.chart1D.slice(0, -1), nextPrice]
              : existing1D.length > 1 && priceChanged
                ? [...existing1D.slice(0, -1), nextPrice]
                : existing1D;
            const patchedTimestamps =
              Array.isArray(patch.timestamps1D) && patch.timestamps1D.length > 1
                ? patch.timestamps1D
                : asset.chartTimestamps?.['1D'];

            return {
              ...asset,
              price: nextPrice,
              prevClose: safePrev,
              changeValue: nextChangeValue,
              changePercent: nextChangePercent,
              open: patch.open,
              dayHigh: patch.dayHigh,
              dayLow: patch.dayLow,
              volume: patch.volume,
              avgVol: patch.avgVol,
              avgVolLabel: patch.avgVolLabel,
              peLabel: patch.peLabel,
              peValue: patch.peValue,
              capLabel: patch.capLabel,
              capValue: patch.capValue,
              w52Low: patch.w52Low,
              w52High: patch.w52High,
              w52Pct: patch.w52Pct,
              sentiment: patch.sentiment,
              support: patch.support,
              supportNote: patch.supportNote,
              resistance: patch.resistance,
              resistanceNote: patch.resistanceNote,
              commentary: patch.commentary,
              updatedAtEpoch: wsFresh ? asset.updatedAtEpoch : patch.updatedAtEpoch,
              marketSessionOpen: patch.marketSessionOpen,
              sessionStateLabel: patch.sessionStateLabel,
              sessionProgressRatio: patch.sessionProgressRatio,
              fearGreed7d:
                Array.isArray(patch.fearGreed7d) && patch.fearGreed7d.length >= 2
                  ? patch.fearGreed7d
                  : asset.fearGreed7d,
              move5mPct:
                typeof patch.move5mPct === 'number' && Number.isFinite(patch.move5mPct)
                  ? patch.move5mPct
                  : asset.move5mPct,
              vol5mRangePct:
                typeof patch.vol5mRangePct === 'number' && Number.isFinite(patch.vol5mRangePct)
                  ? patch.vol5mRangePct
                  : asset.vol5mRangePct,
              move5mSource: patch.move5mSource ?? asset.move5mSource,
              sparklinePoints: patch.sparklinePoints.length > 1 ? patch.sparklinePoints : asset.sparklinePoints,
              chartSeries: {
                ...asset.chartSeries,
                '1D': patchedSeries,
              },
              chartTimestamps: {
                ...asset.chartTimestamps,
                '1D': patchedTimestamps,
              },
            };
          })
        );
      } finally {
        quotesInFlightRef.current = false;
      }
    },
    [recordFetchOutcome, shouldSkipForBackoff, smoothTickPrice, triggerFlash]
  );

  // Fetch historical chart series on demand when changing timeframe or symbol
  const loadChartTimeframe = useCallback(async (assetId: string, timeframe: Timeframe) => {
    const data = await fetchJsonWithTimeout<{
      points?: number[];
      timestamps?: number[];
      candles?: Array<{ t: number; o: number; h: number; l: number; c: number; v?: number }>;
      prevClose?: number;
    }>(
      `/api/market/chart?id=${encodeURIComponent(assetId)}&timeframe=${encodeURIComponent(timeframe)}`,
      8500
    );
    if (!data || !Array.isArray(data.points) || data.points.length < 2) return;

    setAssets((prev) =>
      prev.map((asset) => {
        if (asset.id !== assetId) return asset;
        return {
          ...asset,
          chartSeries: {
            ...asset.chartSeries,
            [timeframe]: data.points!,
          },
          chartTimestamps: {
            ...asset.chartTimestamps,
            [timeframe]: data.timestamps,
          },
          chartCandles:
            Array.isArray(data.candles) && data.candles.length >= 2
              ? {
                  ...asset.chartCandles,
                  [timeframe]: data.candles,
                }
              : asset.chartCandles,
        };
      })
    );
  }, []);

  // Fetch FX Rates independently on boot for instant portfolio conversion
  const refreshFxRates = useCallback(async (force = false) => {
    if (shouldSkipForBackoff('fx', force)) return;
    const fxRes = await fetchJsonWithTimeout<{ rates?: Record<CurrencyCode, number>; pairTiles?: FxPairTile[] }>(
      '/api/fx/rates',
      6000
    );
    recordFetchOutcome('fx', Boolean(fxRes), 4000, 25_000);
    if (fxRes && fxRes.rates) {
      setFxRates((prev) => ({ ...prev, ...fxRes.rates }));
      if (Array.isArray(fxRes.pairTiles) && fxRes.pairTiles.length > 0) {
        setFxPairTiles(fxRes.pairTiles);
      }
    }
  }, [recordFetchOutcome, shouldSkipForBackoff]);

  // Fetch live News RSS and Economic Calendar
  const refreshSecondaryFeeds = useCallback(async (force = false) => {
    if (shouldSkipForBackoff('secondary', force)) return;
    const calendarUrl = force ? '/api/calendar/events?range=this_week&refresh=1' : '/api/calendar/events';
    const [newsRes, calRes] = await Promise.all([
      fetchJsonWithTimeout<{ stories?: NewsStory[] }>('/api/news/feed', 7500),
      fetchJsonWithTimeout<{ events?: EconomicEvent[]; nextCatalyst?: CalendarCatalyst | null }>(
        calendarUrl,
        9000
      ),
    ]);

    const anyOk = Boolean(newsRes || calRes);
    recordFetchOutcome('secondary', anyOk, 5000, 30_000);

    if (newsRes && Array.isArray(newsRes.stories) && newsRes.stories.length > 0) {
      setNewsStories(newsRes.stories);
    }

    if (calRes && Array.isArray(calRes.events) && calRes.events.length > 0) {
      setEconomicEvents(calRes.events);
      if (calRes.nextCatalyst) {
        setNextCatalyst(calRes.nextCatalyst);
      }
    }
  }, [recordFetchOutcome, shouldSkipForBackoff]);

  const refreshCalendar = useCallback(async (force = true) => {
    const calRes = await fetchJsonWithTimeout<{
      events?: EconomicEvent[];
      nextCatalyst?: CalendarCatalyst | null;
    }>(`/api/calendar/events?range=this_week${force ? '&refresh=1' : ''}`, 9000);
    if (calRes && Array.isArray(calRes.events) && calRes.events.length > 0) {
      setEconomicEvents(calRes.events);
      if (calRes.nextCatalyst) {
        setNextCatalyst(calRes.nextCatalyst);
      }
    }
  }, []);

  // Fetch Top 10 US & Indonesia Stock Movers (impact, gainers, losers + IDX foreign buy/sell)
  const refreshStocks = useCallback(
    async (force = false) => {
      if (stocksInFlightRef.current || shouldSkipForBackoff('stocks', force)) return;
      stocksInFlightRef.current = true;
      setStocksLoading(true);
      try {
        const data = await fetchJsonWithTimeout<{
          us?: StocksMoversBucket;
          indonesia?: StocksMoversBucket;
          updatedAt?: string;
        }>('/api/stocks/movers', 10_000);
        if (!data) {
          recordFetchOutcome('stocks', false, 3000, 20_000);
          return;
        }
        recordFetchOutcome('stocks', true);
        if (data.us && Array.isArray(data.us.impact)) {
          setUsMoversBucket(data.us);
        }
        if (data.indonesia && Array.isArray(data.indonesia.impact)) {
          setIdxMoversBucket(data.indonesia);
        }
        if (data.updatedAt) setStocksUpdatedAt(data.updatedAt);
      } finally {
        stocksInFlightRef.current = false;
        setStocksLoading(false);
      }
    },
    [recordFetchOutcome, shouldSkipForBackoff]
  );

  // Fetch Market Cap & Sector Heatmap Data
  const refreshHeatmap = useCallback(
    async (force = false) => {
      if (heatmapInFlightRef.current || shouldSkipForBackoff('heatmap', force)) return;
      heatmapInFlightRef.current = true;
      setHeatmapLoading(true);
      try {
        const data = await fetchJsonWithTimeout<MarketHeatmapResponse>('/api/market/heatmap', 10_000);
        if (!data) {
          recordFetchOutcome('heatmap', false, 4000, 25_000);
          return;
        }
        recordFetchOutcome('heatmap', true);
        if (Array.isArray(data.us) || Array.isArray(data.indonesia)) {
          setHeatmapData(data);
        }
      } finally {
        heatmapInFlightRef.current = false;
        setHeatmapLoading(false);
      }
    },
    [recordFetchOutcome, shouldSkipForBackoff]
  );

  // Fetch and map summarized 24-hour market activity JSON (top gainers, losers, macro events)
  const fetchDailySummary = useCallback(
    async (force = false) => {
      if (summaryInFlightRef.current || shouldSkipForBackoff('dailySummary', force)) return;
      summaryInFlightRef.current = true;
      setDailySummaryLoading(true);
      try {
        const raw = await fetchJsonWithTimeout<Partial<DailyMarketSummaryResponse>>(
          '/api/market/daily-summary',
          10_000
        );
        if (!raw || !Array.isArray(raw.highlights)) {
          recordFetchOutcome('dailySummary', false, 5000, 30_000);
          return;
        }
        recordFetchOutcome('dailySummary', true);

        const mappedHighlights: DailyMarketHighlight[] = raw.highlights
          .filter((h) => h && typeof h.title === 'string' && typeof h.summaryText === 'string')
          .map((h) => ({
            id: String(h.id || `${h.category}-${h.title}`),
            category: h.category === 'loser' || h.category === 'event' ? h.category : 'gainer',
            title: h.title.trim(),
            metricText: String(h.metricText || '').trim(),
            summaryText: h.summaryText.trim(),
            metaText: String(h.metaText || '').trim(),
            symbol: h.symbol,
            yahooSymbol: h.yahooSymbol,
            assetId: h.assetId,
            routeTarget: h.routeTarget,
          }));

        setDailySummary({
          windowLabel: raw.windowLabel || 'Last 24 hours',
          dateLabel: raw.dateLabel || new Date().toLocaleDateString('en-US'),
          updatedAt: raw.updatedAt || new Date().toISOString(),
          highlights: mappedHighlights,
        });
      } finally {
        summaryInFlightRef.current = false;
        setDailySummaryLoading(false);
      }
    },
    [recordFetchOutcome, shouldSkipForBackoff]
  );

  // Fetch multi-source Market & Stocks Intelligence + 3-Phase Index Session Summaries
  const fetchMarketIntelligence = useCallback(
    async (force = false) => {
      if (intelInFlightRef.current || shouldSkipForBackoff('intel', force)) return;
      intelInFlightRef.current = true;
      setIntelligenceLoading(true);
      try {
        const data = await fetchJsonWithTimeout<MarketIntelligenceResponse>(
          '/api/market/intelligence',
          18_000
        );
        if (!data || !Array.isArray(data.indexSessions)) {
          recordFetchOutcome('intel', false, 5000, 30_000);
          return;
        }
        recordFetchOutcome('intel', true);
        setMarketIntelligence(data);
      } finally {
        intelInFlightRef.current = false;
        setIntelligenceLoading(false);
      }
    },
    [recordFetchOutcome, shouldSkipForBackoff]
  );

  // Idle-scheduled localStorage persistence so re-opening the terminal hydrates immediately without dropping live frames
  const lastBootSaveAtRef = useRef(0);
  useEffect(() => {
    if (!feedsLive) return;
    const now = Date.now();
    if (now - lastBootSaveAtRef.current < 25_000) return;
    lastBootSaveAtRef.current = now;

    const persistSnapshot = () => {
      try {
        const compactAssets: BootstrapCachePayload['assets'] = assets.map((a) => ({
          id: a.id,
          price: a.price,
          prevClose: a.prevClose,
          changeValue: a.changeValue,
          changePercent: a.changePercent,
          open: a.open,
          dayHigh: a.dayHigh,
          dayLow: a.dayLow,
          volume: a.volume,
          sentiment: a.sentiment,
          support: a.support,
          resistance: a.resistance,
          commentary: a.commentary,
          updatedAtEpoch: a.updatedAtEpoch,
          marketSessionOpen: a.marketSessionOpen,
          sessionStateLabel: a.sessionStateLabel,
          fearGreed7d: a.fearGreed7d,
          move5mPct: a.move5mPct,
          vol5mRangePct: a.vol5mRangePct,
          move5mSource: a.move5mSource,
        }));
        const payload: BootstrapCachePayload = {
          savedAt: now,
          assets: compactAssets,
          fxRates,
          fxPairTiles,
          newsStories: newsStories.slice(0, 20),
          economicEvents: economicEvents.slice(0, 20),
          usMoversBucket,
          idxMoversBucket,
        };
        localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(payload));
      } catch {
        // ignore storage quota errors
      }
    };

    const winWithIdle =
      typeof window !== 'undefined'
        ? (window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (id: number) => void;
          })
        : null;
    if (winWithIdle && typeof winWithIdle.requestIdleCallback === 'function') {
      const id = winWithIdle.requestIdleCallback(persistSnapshot, { timeout: 1500 });
      return () => winWithIdle.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(persistSnapshot, 250);
    return () => window.clearTimeout(timer);
  }, [feedsLive, assets, fxRates, fxPairTiles, newsStories, economicEvents, usMoversBucket, idxMoversBucket]);

  // 10-second bootstrap liveness safeguard: guarantees the terminal never stalls on "Initializing live feeds"
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bootstrapSafeguardTimer = window.setTimeout(() => {
      if (!feedsLiveRef.current) {
        activateCachedLocalFallback();
        setPriorityStreamStatus((prev) => (prev === 'ws-live' ? prev : 'http-fallback'));
      }
    }, BOOTSTRAP_TIMEOUT_MS);

    return () => {
      window.clearTimeout(bootstrapSafeguardTimer);
    };
  }, [activateCachedLocalFallback]);

  // Priority-Based Data Stream Architecture:
  // - Tier 1 (High-Frequency): XAU/USD & BTC/USD (+ DXY/ETH) via dedicated /ws/priority-radar WebSocket (with 2.5s HTTP failover)
  // - Tier 2 (Throttled Background Sync): Broad market quotes (4s), stocks movers (12s), heatmap (30s), news/FX (60s), intel (75s), summary (90s)
  useEffect(() => {
    let isTabHidden =
      typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false;
    let lastBackgroundPollAt = 0;

    // T=0: Tier-1 Priority Radar + initial core quotes & FX snapshot
    void refreshPriorityRadar(true);
    void refreshQuotes(true);
    void refreshFxRates(true);

    // T=450ms: Tier-2 Stocks movers & live news/calendar after initial interactive paint
    const t1 = window.setTimeout(() => {
      void refreshStocks(true);
      void refreshSecondaryFeeds(true);
    }, 450);

    // T=900ms: Dashboard market intelligence panel
    const t2 = window.setTimeout(() => {
      void fetchMarketIntelligence(true);
    }, 900);

    // T=1600ms: Heavy secondary analytics (heatmap, 24h summary) deferred past initial interactive budget
    const t3 = window.setTimeout(() => {
      void refreshHeatmap(true);
      void fetchDailySummary(true);
    }, 1600);

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      const nowHidden = document.visibilityState === 'hidden';
      const wasHidden = isTabHidden;
      isTabHidden = nowHidden;

      if (!nowHidden && wasHidden && isPulseRef.current) {
        // Immediate Tier-1 refresh for XAU/BTC first, then Tier-2 background sync
        void refreshPriorityRadar(true);
        void refreshQuotes(true);
        void refreshFxRates(false);
        void refreshStocks(false);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Tier-1 HTTP failover strictly when /ws/priority-radar is disconnected, timed out, or stale (>6s)
    const priorityRadarTimer = window.setInterval(() => {
      if (!isPulseRef.current || isTabHidden) return;
      const now = Date.now();
      const btcFresh = now - (lastWsTickAtRef.current['BTCUSD'] ?? 0) < 6000;
      const xauFresh = now - (lastWsTickAtRef.current['XAUUSD'] ?? 0) < 6000;
      if (wsConnectedRef.current && btcFresh && xauFresh) {
        return;
      }
      void refreshPriorityRadar(false);
    }, 2_500);

    // Tier-2 Throttled Background Sync for non-priority markets (4s open, 60s closed, 20s tab hidden)
    const quoteTimer = window.setInterval(() => {
      if (!isPulseRef.current) return;
      const now = Date.now();
      if (isTabHidden) {
        if (now - lastBackgroundPollAt >= 20_000) {
          lastBackgroundPollAt = now;
          void refreshPriorityRadar(false);
          void refreshQuotes(false);
          void refreshFxRates(false);
        }
        return;
      }

      if (anySessionOpenRef.current) {
        void refreshQuotes(false);
      } else if (now - lastClosedPollAtRef.current >= 60_000) {
        lastClosedPollAtRef.current = now;
        void refreshQuotes(false);
      }
    }, 4_000);

    const stocksTimer = window.setInterval(() => {
      if (isPulseRef.current && !isTabHidden) {
        void refreshStocks(false);
      }
    }, 12_000);

    const heatmapTimer = window.setInterval(() => {
      if (isPulseRef.current && !isTabHidden) {
        void refreshHeatmap(false);
      }
    }, 30_000);

    const secondaryTimer = window.setInterval(() => {
      if (isPulseRef.current && !isTabHidden) {
        void refreshFxRates(false);
        void refreshSecondaryFeeds(false);
      }
    }, 60_000);

    const intelligenceTimer = window.setInterval(() => {
      if (isPulseRef.current && !isTabHidden) {
        void fetchMarketIntelligence(false);
      }
    }, 75_000);

    const dailySummaryTimer = window.setInterval(() => {
      if (isPulseRef.current && !isTabHidden) {
        void fetchDailySummary(false);
      }
    }, 90_000);

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearInterval(priorityRadarTimer);
      window.clearInterval(quoteTimer);
      window.clearInterval(stocksTimer);
      window.clearInterval(heatmapTimer);
      window.clearInterval(secondaryTimer);
      window.clearInterval(intelligenceTimer);
      window.clearInterval(dailySummaryTimer);
    };
  }, [
    refreshPriorityRadar,
    refreshQuotes,
    refreshFxRates,
    refreshSecondaryFeeds,
    refreshStocks,
    refreshHeatmap,
    fetchDailySummary,
    fetchMarketIntelligence,
  ]);

  // Top-Priority OHLCV Candle Warmer & High-Frequency Refresher strictly for BTC/USD & XAU/USD
  // Boots at 200ms (15m & 5m first) and refreshes intraday candles every 20s so ICT/S&D accuracy never lags spot
  useEffect(() => {
    const ICT_WARM_IDS = ['XAUUSD', 'BTCUSD'];
    let cancelled = false;

    const warmIntraday = async () => {
      const fastTfs: Timeframe[] = ['15m', '5m'];
      for (const tf of fastTfs) {
        if (cancelled) return;
        await Promise.allSettled(ICT_WARM_IDS.map((id) => loadChartTimeframe(id, tf)));
      }
    };

    const warmHtf = async () => {
      const htfTfs: Timeframe[] = ['1h', '4h'];
      for (const tf of htfTfs) {
        if (cancelled) return;
        await Promise.allSettled(ICT_WARM_IDS.map((id) => loadChartTimeframe(id, tf)));
      }
    };

    const bootFastTimer = window.setTimeout(() => {
      void warmIntraday();
    }, 200);

    const bootHtfTimer = window.setTimeout(() => {
      void warmHtf();
    }, 850);

    const fastCandleTimer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (!isPulseRef.current) return;
      void warmIntraday();
    }, 20_000);

    const htfCandleTimer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (!isPulseRef.current) return;
      void warmHtf();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearTimeout(bootFastTimer);
      window.clearTimeout(bootHtfTimer);
      window.clearInterval(fastCandleTimer);
      window.clearInterval(htfCandleTimer);
    };
  }, [loadChartTimeframe]);

  // Dedicated High-Frequency Server WebSocket (/ws/priority-radar) for XAU/USD, BTC/USD, DXY & ETH/USD
  // Streams real-time Coinbase Exchange WS + TradingView OANDA WS frames with 220ms micro-batching
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let connectTimeoutTimer: number | null = null;
    let flushTimer: number | null = null;
    let attempts = 0;
    let isDisposed = false;

    const clearConnectTimeout = () => {
      if (connectTimeoutTimer !== null) {
        window.clearTimeout(connectTimeoutTimer);
        connectTimeoutTimer = null;
      }
    };

    interface WsPriorityQuote {
      id: 'BTCUSD' | 'XAUUSD' | 'DXY' | 'ETHUSD';
      price: number;
      prevClose?: number;
      changeValue?: number;
      changePercent?: number;
      dayHigh?: number;
      dayLow?: number;
      marketSessionOpen?: boolean;
      sessionStateLabel?: string;
      updatedAtEpoch?: number;
      sourceLabel?: string;
    }

    const pendingTicks = new Map<string, WsPriorityQuote>();

    const flushPendingTicks = () => {
      flushTimer = null;
      if (isDisposed || pendingTicks.size === 0) return;
      const batch = Array.from(pendingTicks.values());
      pendingTicks.clear();

      const batchMap = new Map(batch.map((q) => [q.id, q]));
      const flashes: Array<{ id: string; dir: 'gain' | 'loss' }> = [];
      const sourceUpdates: Record<string, string> = {};

      for (const q of batch) {
        if (q.sourceLabel) {
          sourceUpdates[q.id] = q.sourceLabel;
        }
      }
      if (Object.keys(sourceUpdates).length > 0) {
        setPrioritySources((prev) => {
          let changed = false;
          for (const [k, v] of Object.entries(sourceUpdates)) {
            if (prev[k] !== v) {
              changed = true;
              break;
            }
          }
          return changed ? { ...prev, ...sourceUpdates } : prev;
        });
      }

      setAssets((prev) =>
        prev.map((asset) => {
          const patch = batchMap.get(asset.id as WsPriorityQuote['id']);
          if (!patch || !Number.isFinite(patch.price) || patch.price <= 0) return asset;

          const sessionOpen = patch.marketSessionOpen !== false;
          const smoothedPrice = smoothTickPrice(
            asset.id,
            patch.price,
            asset.decimals,
            sessionOpen,
            asset.price
          );
          if (Math.abs(smoothedPrice - asset.price) > Math.pow(10, -(asset.decimals + 1)) && asset.price > 0) {
            flashes.push({
              id: asset.id,
              dir: smoothedPrice >= asset.price ? 'gain' : 'loss',
            });
          }

          const anchorPrev =
            typeof patch.prevClose === 'number' && Number.isFinite(patch.prevClose) && patch.prevClose > 0
              ? patch.prevClose
              : asset.prevClose > 0
                ? asset.prevClose
                : smoothedPrice;

          const changeValue = Number(
            (smoothedPrice - anchorPrev).toFixed(asset.decimals >= 3 ? asset.decimals : 2)
          );
          const changePercent =
            typeof patch.changePercent === 'number' && Number.isFinite(patch.changePercent)
              ? Number(patch.changePercent.toFixed(2))
              : Number((((smoothedPrice - anchorPrev) / Math.max(1e-6, anchorPrev)) * 100).toFixed(2));

          // Keep active forming intraday candles locked to live WebSocket ticks for ICT/S&D accuracy
          const nextCandles = asset.chartCandles ? { ...asset.chartCandles } : undefined;
          if (nextCandles) {
            for (const tfKey of ['1m', '5m', '15m', '30m', '1h', '4h', '1D'] as Timeframe[]) {
              const bars = nextCandles[tfKey];
              if (Array.isArray(bars) && bars.length > 0) {
                const last = bars[bars.length - 1];
                if (last.c !== smoothedPrice) {
                  nextCandles[tfKey] = [
                    ...bars.slice(0, -1),
                    {
                      ...last,
                      c: smoothedPrice,
                      h: Math.max(last.h, smoothedPrice),
                      l: Math.min(last.l, smoothedPrice),
                    },
                  ];
                }
              }
            }
          }

          const nextSeries1D =
            asset.chartSeries['1D'] && asset.chartSeries['1D'].length > 0
              ? [...asset.chartSeries['1D'].slice(0, -1), smoothedPrice]
              : asset.chartSeries['1D'];

          const nextSentiment: 'Bullish' | 'Bearish' | 'Neutral' =
            changePercent >= 0.35
              ? 'Bullish'
              : changePercent <= -0.35
                ? 'Bearish'
                : 'Neutral';

          const fmtHiLo = (v?: number) =>
            typeof v === 'number' && Number.isFinite(v) && v > 0
              ? v.toLocaleString('en-US', {
                  minimumFractionDigits: asset.decimals,
                  maximumFractionDigits: asset.decimals,
                })
              : undefined;

          return {
            ...asset,
            price: smoothedPrice,
            prevClose: anchorPrev,
            changeValue,
            changePercent,
            dayHigh: fmtHiLo(patch.dayHigh) ?? asset.dayHigh,
            dayLow: fmtHiLo(patch.dayLow) ?? asset.dayLow,
            sentiment: nextSentiment,
            marketSessionOpen: patch.marketSessionOpen ?? asset.marketSessionOpen,
            sessionStateLabel: patch.sessionStateLabel ?? asset.sessionStateLabel,
            updatedAtEpoch: patch.updatedAtEpoch ?? Date.now(),
            chartSeries: {
              ...asset.chartSeries,
              '1D': nextSeries1D,
            },
            ...(nextCandles ? { chartCandles: nextCandles } : {}),
          };
        })
      );

      for (const f of flashes) {
        triggerFlash(f.id, f.dir);
      }
    };

    const scheduleFlush = (immediate = false) => {
      if (immediate) {
        if (flushTimer !== null) {
          window.clearTimeout(flushTimer);
          flushTimer = null;
        }
        flushPendingTicks();
        return;
      }
      if (flushTimer === null) {
        flushTimer = window.setTimeout(flushPendingTicks, 220);
      }
    };

    const connect = () => {
      if (isDisposed) return;
      clearConnectTimeout();
      try {
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProto}//${window.location.host}/ws/priority-radar`;
        setPriorityStreamStatus(attempts === 0 ? 'reconnecting' : 'http-fallback');
        const socket = new WebSocket(wsUrl);
        ws = socket;

        // 10-second WebSocket handshake timeout safeguard:
        // If WS stalls in CONNECTING > 10s, immediately fall back to cached local data + HTTP priority failover
        connectTimeoutTimer = window.setTimeout(() => {
          connectTimeoutTimer = null;
          if (isDisposed || socket !== ws) return;
          if (socket.readyState === WebSocket.CONNECTING) {
            setWsTimedOut(true);
            setWsConnected(false);
            setPriorityStreamStatus('http-fallback');
            activateCachedLocalFallback();
            void refreshPriorityRadar(true);
            try {
              socket.close();
            } catch {
              // ignore close error on hung handshake
            }
          }
        }, WS_CONNECT_TIMEOUT_MS);

        socket.onopen = () => {
          clearConnectTimeout();
          if (isDisposed || socket !== ws) return;
          setWsConnected(true);
          setWsTimedOut(false);
          setCachedFallbackActive(false);
          setPriorityStreamStatus('ws-live');
          attempts = 0;
        };

        socket.onmessage = (event) => {
          if (isDisposed || !isPulseRef.current || socket !== ws) return;
          try {
            const payload = JSON.parse(event.data) as {
              type?: 'snapshot' | 'tick';
              quotes?: WsPriorityQuote[];
              quote?: WsPriorityQuote;
            };
            const nowTick = Date.now();
            if (payload.type === 'snapshot' && Array.isArray(payload.quotes)) {
              for (const q of payload.quotes) {
                if (q && q.id && Number.isFinite(q.price) && q.price > 0) {
                  lastWsTickAtRef.current[q.id] = nowTick;
                  pendingTicks.set(q.id, q);
                }
              }
              if (pendingTicks.size > 0) {
                setFeedsLive(true);
                setCachedFallbackActive(false);
                setLastWsTickState(nowTick);
                scheduleFlush(true);
              }
              return;
            }
            if (payload.type === 'tick' && payload.quote && payload.quote.id) {
              const q = payload.quote;
              if (!Number.isFinite(q.price) || q.price <= 0) return;
              lastWsTickAtRef.current[q.id] = nowTick;
              setFeedsLive(true);
              setCachedFallbackActive(false);
              setLastWsTickState(nowTick);
              pendingTicks.set(q.id, q);
              scheduleFlush(false);
            }
          } catch {
            // ignore malformed frame
          }
        };

        socket.onerror = () => {
          clearConnectTimeout();
          if (socket !== ws) return;
          setWsConnected(false);
        };

        socket.onclose = () => {
          clearConnectTimeout();
          if (socket !== ws) return;
          setWsConnected(false);
          if (!isDisposed) {
            attempts += 1;
            setPriorityStreamStatus(attempts >= 2 ? 'http-fallback' : 'reconnecting');
            const delay = Math.min(15_000, 1000 * Math.pow(2, Math.min(4, attempts - 1)));
            reconnectTimer = window.setTimeout(connect, delay);
          }
        };
      } catch {
        clearConnectTimeout();
        setWsConnected(false);
        setWsTimedOut(true);
        setPriorityStreamStatus('http-fallback');
        activateCachedLocalFallback();
        void refreshPriorityRadar(true);
      }
    };

    connect();

    return () => {
      isDisposed = true;
      clearConnectTimeout();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [activateCachedLocalFallback, refreshPriorityRadar, smoothTickPrice, triggerFlash]);

  const togglePulse = useCallback(() => {
    setIsPulseActive((prev) => !prev);
  }, []);

  const refreshDiagnostics = useCallback(async () => {
    const { data, rttMs } = await fetchJsonWithLatency<ServerFeedDiagnosticsResponse>(
      '/api/market/diagnostics',
      4000
    );
    if (data && Array.isArray(data.providers)) {
      setServerDiagnostics(data);
    }
    if (rttMs !== null && quotesRttMs === null) {
      setQuotesRttMs(rttMs);
    }
  }, [quotesRttMs]);

  const refreshAll = useCallback(async () => {
    await refreshPriorityRadar(true);
    await Promise.allSettled([
      refreshQuotes(true),
      refreshFxRates(true),
      refreshSecondaryFeeds(true),
      refreshStocks(true),
      refreshHeatmap(true),
      fetchDailySummary(true),
      fetchMarketIntelligence(true),
      refreshDiagnostics(),
    ]);
  }, [
    refreshPriorityRadar,
    refreshQuotes,
    refreshFxRates,
    refreshSecondaryFeeds,
    refreshStocks,
    refreshHeatmap,
    fetchDailySummary,
    fetchMarketIntelligence,
    refreshDiagnostics,
  ]);

  const nowMs = Date.now();
  const activeBackoffs = Object.entries(backoffRef.current)
    .filter(([, tracker]) => tracker.failures > 0 && tracker.nextAllowedAt > nowMs)
    .map(([endpoint, tracker]) => ({
      endpoint,
      failures: tracker.failures,
      retryInSec: Math.max(1, Math.ceil((tracker.nextAllowedAt - nowMs) / 1000)),
    }));

  const clientTransport: ClientFeedTransportDiagnostics = {
    quotesRttMs,
    wsConnected,
    wsTimedOut,
    cachedFallbackActive,
    lastWsTickAt: lastWsTickState,
    wsFresh: Boolean(wsConnected && lastWsTickState && nowMs - lastWsTickState < 15_000),
    usingBootstrapCache:
      cachedFallbackActive || (!feedsLive && Boolean(boot?.assets && boot.assets.length > 0)),
    bootstrapSavedAt: boot?.savedAt ?? null,
    activeBackoffs,
    lastQuotesAt,
  };

  return {
    assets,
    newsStories,
    economicEvents,
    nextCatalyst,
    fxRates,
    fxPairTiles,
    usMovers: usMoversBucket.impact,
    idxMovers: idxMoversBucket.impact,
    usMoversBucket,
    idxMoversBucket,
    stocksUpdatedAt,
    stocksLoading,
    heatmapData,
    heatmapLoading,
    refreshHeatmap: () => refreshHeatmap(true),
    dailySummary,
    dailySummaryLoading,
    refreshDailySummary: () => fetchDailySummary(true),
    marketIntelligence,
    intelligenceLoading,
    refreshMarketIntelligence: () => fetchMarketIntelligence(true),
    isPulseActive,
    wsConnected,
    priorityStreamStatus,
    prioritySources,
    feedsLive,
    flashMap,
    serverDiagnostics,
    clientTransport,
    refreshDiagnostics,
    togglePulse,
    loadChartTimeframe,
    refreshCalendar,
    refreshStocks: () => refreshStocks(true),
    refreshAll,
  };
}

