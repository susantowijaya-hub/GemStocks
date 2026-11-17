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
  EconomicEvent,
  FxPairTile,
  MarketAsset,
  NewsStory,
  StockMover,
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
}

export function useLiveMarket() {
  const [assets, setAssets] = useState<MarketAsset[]>(INITIAL_ASSETS);
  const [newsStories, setNewsStories] = useState<NewsStory[]>(NEWS_STORIES);
  const [economicEvents, setEconomicEvents] = useState<EconomicEvent[]>(ECONOMIC_EVENTS);
  const [nextCatalyst, setNextCatalyst] = useState<CalendarCatalyst | null>(null);
  const [fxRates, setFxRates] = useState<Record<CurrencyCode, number>>(FX_RATES_USD_BASE);
  const [fxPairTiles, setFxPairTiles] = useState<FxPairTile[]>(FX_PAIR_TILES);
  const [usMovers, setUsMovers] = useState<StockMover[]>([]);
  const [idxMovers, setIdxMovers] = useState<StockMover[]>([]);
  const [stocksUpdatedAt, setStocksUpdatedAt] = useState<string | null>(null);
  const [isPulseActive, setIsPulseActive] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [feedsLive, setFeedsLive] = useState(false);
  const [flashMap, setFlashMap] = useState<Record<string, 'gain' | 'loss'>>({});
  const isPulseRef = useRef(isPulseActive);
  isPulseRef.current = isPulseActive;

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

  // Fetch all 18 live market quotes from backend Yahoo Finance aggregator
  const refreshQuotes = useCallback(async () => {
    try {
      const res = await fetch('/api/market/quotes');
      if (!res.ok) return;
      const payload = (await res.json()) as { quotes?: QuotePatch[] };
      const patches = payload.quotes;
      if (!Array.isArray(patches) || patches.length === 0) return;

      const patchMap = new Map(patches.map((p) => [p.id, p]));
      setFeedsLive(true);

      setAssets((prev) =>
        prev.map((asset) => {
          const patch = patchMap.get(asset.id);
          if (!patch) return asset;
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

  // Fetch Top 10 US & Indonesia Stock Movers
  const refreshStocks = useCallback(async () => {
    try {
      const res = await fetch('/api/stocks/movers');
      if (!res.ok) return;
      const data = (await res.json()) as {
        us?: StockMover[];
        indonesia?: StockMover[];
        updatedAt?: string;
      };
      if (Array.isArray(data.us)) setUsMovers(data.us);
      if (Array.isArray(data.indonesia)) setIdxMovers(data.indonesia);
      if (data.updatedAt) setStocksUpdatedAt(data.updatedAt);
    } catch {
      // keep existing state on transient error
    }
  }, []);

  // Initial fetch + periodic live polling
  useEffect(() => {
    void refreshQuotes();
    void refreshSecondaryFeeds();
    void refreshStocks();

    const quoteTimer = window.setInterval(() => {
      if (isPulseRef.current) {
        void refreshQuotes();
      }
    }, 45_000);

    const stocksTimer = window.setInterval(() => {
      if (isPulseRef.current) {
        void refreshStocks();
      }
    }, 60_000);

    const secondaryTimer = window.setInterval(() => {
      if (isPulseRef.current) {
        void refreshSecondaryFeeds();
      }
    }, 300_000);

    return () => {
      window.clearInterval(quoteTimer);
      window.clearInterval(stocksTimer);
      window.clearInterval(secondaryTimer);
    };
  }, [refreshQuotes, refreshSecondaryFeeds, refreshStocks]);

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

  return {
    assets,
    newsStories,
    economicEvents,
    nextCatalyst,
    fxRates,
    fxPairTiles,
    usMovers,
    idxMovers,
    stocksUpdatedAt,
    isPulseActive,
    wsConnected,
    feedsLive,
    flashMap,
    togglePulse,
    loadChartTimeframe,
    refreshStocks,
    refreshAll: () => {
      void refreshQuotes();
      void refreshSecondaryFeeds();
      void refreshStocks();
    },
  };
}
