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
  CurrencyCode,
  DailyMarketHighlight,
  DailyMarketSummaryResponse,
  EconomicEvent,
  FxPairTile,
  MarketAsset,
  NewsStory,
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
}

export function useLiveMarket() {
  const [assets, setAssets] = useState<MarketAsset[]>(INITIAL_ASSETS);
  const [newsStories, setNewsStories] = useState<NewsStory[]>(NEWS_STORIES);
  const [economicEvents, setEconomicEvents] = useState<EconomicEvent[]>(ECONOMIC_EVENTS);
  const [nextCatalyst, setNextCatalyst] = useState<CalendarCatalyst | null>(null);
  const [fxRates, setFxRates] = useState<Record<CurrencyCode, number>>(FX_RATES_USD_BASE);
  const [fxPairTiles, setFxPairTiles] = useState<FxPairTile[]>(FX_PAIR_TILES);
  const [usMoversBucket, setUsMoversBucket] = useState<StocksMoversBucket>({
    impact: [],
    gainers: [],
    losers: [],
  });
  const [idxMoversBucket, setIdxMoversBucket] = useState<StocksMoversBucket>({
    impact: [],
    gainers: [],
    losers: [],
    foreignBuy: [],
    foreignSell: [],
  });
  const [stocksUpdatedAt, setStocksUpdatedAt] = useState<string | null>(null);
  const [dailySummary, setDailySummary] = useState<DailyMarketSummaryResponse | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState<boolean>(false);
  const [isPulseActive, setIsPulseActive] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [feedsLive, setFeedsLive] = useState(false);
  const [flashMap, setFlashMap] = useState<Record<string, 'gain' | 'loss'>>({});
  const isPulseRef = useRef(isPulseActive);
  isPulseRef.current = isPulseActive;
  const quotesInFlightRef = useRef(false);
  const stocksInFlightRef = useRef(false);
  const summaryInFlightRef = useRef(false);
  const anySessionOpenRef = useRef(true);
  const lastClosedPollAtRef = useRef(0);

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

  // Fetch all 19 live market quotes from backend aggregator (1s during open session, last settle when closed)
  const refreshQuotes = useCallback(async () => {
    if (quotesInFlightRef.current) return;
    quotesInFlightRef.current = true;
    try {
      const res = await fetch('/api/market/quotes');
      if (!res.ok) return;
      const payload = (await res.json()) as { quotes?: QuotePatch[] };
      const patches = payload.quotes;
      if (!Array.isArray(patches) || patches.length === 0) return;

      const patchMap = new Map(patches.map((p) => [p.id, p]));
      anySessionOpenRef.current = patches.some((p) => p.marketSessionOpen !== false);
      setFeedsLive(true);

      setAssets((prev) =>
        prev.map((asset) => {
          const patch = patchMap.get(asset.id);
          if (!patch) return asset;
          // Freeze Binance-streamed crypto when WS is connected unless backend value is newer
          if (Math.abs(patch.price - asset.price) > 0.0001) {
            triggerFlash(asset.id, patch.price >= asset.price ? 'gain' : 'loss');
          }
          return {
            ...asset,
            price: patch.price,
            prevClose: patch.prevClose,
            changeValue: patch.changeValue,
            changePercent: patch.changePercent,
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
            updatedAtEpoch: patch.updatedAtEpoch,
            marketSessionOpen: patch.marketSessionOpen,
            sessionStateLabel: patch.sessionStateLabel,
            sessionProgressRatio: patch.sessionProgressRatio,
            sparklinePoints: patch.sparklinePoints.length > 1 ? patch.sparklinePoints : asset.sparklinePoints,
            chartSeries: {
              ...asset.chartSeries,
              '1D': patch.chart1D.length > 1 ? patch.chart1D : asset.chartSeries['1D'],
            },
            chartTimestamps: {
              ...asset.chartTimestamps,
              '1D': patch.timestamps1D,
            },
          };
        })
      );
    } catch {
      // keep existing state on transient network failure
    } finally {
      quotesInFlightRef.current = false;
    }
  }, [triggerFlash]);

  // Fetch historical chart series on demand when changing timeframe or symbol
  const loadChartTimeframe = useCallback(async (assetId: string, timeframe: Timeframe) => {
    try {
      const res = await fetch(
        `/api/market/chart?id=${encodeURIComponent(assetId)}&timeframe=${encodeURIComponent(timeframe)}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        points?: number[];
        timestamps?: number[];
        prevClose?: number;
      };
      if (!Array.isArray(data.points) || data.points.length < 2) return;

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
          };
        })
      );
    } catch {
      // keep existing series
    }
  }, []);

  // Fetch live News RSS, Economic Calendar, and FX Rates
  const refreshSecondaryFeeds = useCallback(async () => {
    try {
      const [newsRes, calRes, fxRes] = await Promise.all([
        fetch('/api/news/feed').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/calendar/events').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/fx/rates').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      if (newsRes && Array.isArray(newsRes.stories) && newsRes.stories.length > 0) {
        setNewsStories(newsRes.stories);
      }

      if (calRes && Array.isArray(calRes.events) && calRes.events.length > 0) {
        setEconomicEvents(calRes.events);
        if (calRes.nextCatalyst) {
          setNextCatalyst(calRes.nextCatalyst);
        }
      }

      if (fxRes && fxRes.rates) {
        setFxRates((prev) => ({ ...prev, ...fxRes.rates }));
        if (Array.isArray(fxRes.pairTiles) && fxRes.pairTiles.length > 0) {
          setFxPairTiles(fxRes.pairTiles);
        }
      }
    } catch {
      // keep fallback state
    }
  }, []);

  // Fetch Top 10 US & Indonesia Stock Movers (impact, gainers, losers + IDX foreign buy/sell)
  const refreshStocks = useCallback(async () => {
    if (stocksInFlightRef.current) return;
    stocksInFlightRef.current = true;
    try {
      const res = await fetch('/api/stocks/movers');
      if (!res.ok) return;
      const data = (await res.json()) as {
        us?: StocksMoversBucket;
        indonesia?: StocksMoversBucket;
        updatedAt?: string;
      };
      if (data.us && Array.isArray(data.us.impact)) {
        setUsMoversBucket(data.us);
      }
      if (data.indonesia && Array.isArray(data.indonesia.impact)) {
        setIdxMoversBucket(data.indonesia);
      }
      if (data.updatedAt) setStocksUpdatedAt(data.updatedAt);
    } catch {
      // keep existing state on transient error
    } finally {
      stocksInFlightRef.current = false;
    }
  }, []);

  // Fetch and map summarized 24-hour market activity JSON (top gainers, losers, macro events)
  const fetchDailySummary = useCallback(async () => {
    if (summaryInFlightRef.current) return;
    summaryInFlightRef.current = true;
    setDailySummaryLoading(true);
    try {
      const res = await fetch('/api/market/daily-summary');
      if (!res.ok) return;
      const raw = (await res.json()) as Partial<DailyMarketSummaryResponse>;
      if (!Array.isArray(raw.highlights)) return;

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
    } catch {
      // retain existing summary on transient error
    } finally {
      summaryInFlightRef.current = false;
      setDailySummaryLoading(false);
    }
  }, []);

  // Initial fetch + 1-second live polling during open sessions (last close freeze when closed)
  useEffect(() => {
    void refreshQuotes();
    void refreshSecondaryFeeds();
    void refreshStocks();
    void fetchDailySummary();

    const quoteTimer = window.setInterval(() => {
      if (!isPulseRef.current) return;
      if (anySessionOpenRef.current) {
        void refreshQuotes();
      } else {
        const now = Date.now();
        if (now - lastClosedPollAtRef.current >= 60_000) {
          lastClosedPollAtRef.current = now;
          void refreshQuotes();
        }
      }
    }, 1_000);

    const stocksTimer = window.setInterval(() => {
      if (isPulseRef.current) {
        void refreshStocks();
      }
    }, 5_000);

    const secondaryTimer = window.setInterval(() => {
      if (isPulseRef.current) {
        void refreshSecondaryFeeds();
        void fetchDailySummary();
      }
    }, 60_000);

    return () => {
      window.clearInterval(quoteTimer);
      window.clearInterval(stocksTimer);
      window.clearInterval(secondaryTimer);
    };
  }, [refreshQuotes, refreshSecondaryFeeds, refreshStocks, fetchDailySummary]);

  // Real Binance WebSocket connection for sub-second BTC/USD and ETH/USD updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempts = 0;
    let isDisposed = false;

    const connect = () => {
      if (isDisposed) return;
      try {
        ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker/ethusdt@ticker');

        ws.onopen = () => {
          if (isDisposed) return;
          setWsConnected(true);
          attempts = 0;
        };

        ws.onmessage = (event) => {
          if (isDisposed || !isPulseRef.current) return;
          try {
            const payload = JSON.parse(event.data);
            if (!payload?.s) return;

            const id = payload.s === 'BTCUSDT' ? 'BTCUSD' : payload.s === 'ETHUSDT' ? 'ETHUSD' : null;
            if (!id) return;

            const currentPrice = parseFloat(payload.c);
            const changePercent = parseFloat(payload.P);
            const changeValue = parseFloat(payload.p);
            if (!Number.isFinite(currentPrice) || !Number.isFinite(changePercent)) return;

            setAssets((prev) =>
              prev.map((asset) => {
                if (asset.id !== id) return asset;
                const dir = currentPrice >= asset.price ? 'gain' : 'loss';
                if (Math.abs(currentPrice - asset.price) > 0.01) {
                  triggerFlash(id, dir);
                }
                const nextSeries1D = [...asset.chartSeries['1D'].slice(0, -1), currentPrice];
                const nextSentiment: 'Bullish' | 'Bearish' | 'Neutral' =
                  changePercent >= 0.35
                    ? 'Bullish'
                    : changePercent <= -0.35
                      ? 'Bearish'
                      : 'Neutral';
                return {
                  ...asset,
                  price: currentPrice,
                  prevClose: Number((currentPrice - changeValue).toFixed(2)),
                  changeValue,
                  changePercent,
                  sentiment: nextSentiment,
                  updatedAtEpoch: Date.now(),
                  chartSeries: {
                    ...asset.chartSeries,
                    '1D': nextSeries1D,
                  },
                };
              })
            );
          } catch {
            // ignore malformed tick
          }
        };

        ws.onerror = () => {
          setWsConnected(false);
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!isDisposed && attempts < 4) {
            attempts += 1;
            reconnectTimer = window.setTimeout(connect, 4000);
          }
        };
      } catch {
        setWsConnected(false);
      }
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [triggerFlash]);

  const togglePulse = useCallback(() => {
    setIsPulseActive((prev) => !prev);
  }, []);

  const refreshAll = useCallback(() => {
    void refreshQuotes();
    void refreshSecondaryFeeds();
    void refreshStocks();
    void fetchDailySummary();
  }, [refreshQuotes, refreshSecondaryFeeds, refreshStocks, fetchDailySummary]);

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
    dailySummary,
    dailySummaryLoading,
    refreshDailySummary: fetchDailySummary,
    isPulseActive,
    wsConnected,
    feedsLive,
    flashMap,
    togglePulse,
    loadChartTimeframe,
    refreshStocks,
    refreshAll,
  };
}
