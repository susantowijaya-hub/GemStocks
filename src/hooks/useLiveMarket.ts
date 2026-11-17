import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_ASSETS } from '../data/marketData';
import { MarketAsset } from '../types/market';

export function useLiveMarket() {
  const [assets, setAssets] = useState<MarketAsset[]>(INITIAL_ASSETS);
  const [isPulseActive, setIsPulseActive] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
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

  // Real Binance WebSocket connection for BTC/USD and ETH/USD
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
                return {
                  ...asset,
                  price: currentPrice,
                  prevClose: Number((currentPrice - changeValue).toFixed(2)),
                  changeValue,
                  changePercent,
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

  // Micro-tick pulse simulation for non-WebSocket indices, commodities & FX
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!isPulseRef.current) return;

      setAssets((prev) => {
        const candidates = prev.filter((a) => !a.liveStreamable);
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        if (!picked) return prev;

        const stepRatio = (Math.random() - 0.48) * 0.0005;
        const nextPrice = Number((picked.price * (1 + stepRatio)).toFixed(picked.decimals));
        const nextChangeVal = Number((nextPrice - picked.prevClose).toFixed(picked.decimals >= 3 ? picked.decimals : 2));
        const nextChangePct = Number(((nextChangeVal / picked.prevClose) * 100).toFixed(2));
        const dir = nextPrice >= picked.price ? 'gain' : 'loss';
        triggerFlash(picked.id, dir);

        return prev.map((asset) => {
          if (asset.id !== picked.id) return asset;
          const nextSeries1D = [...asset.chartSeries['1D'].slice(0, -1), nextPrice];
          return {
            ...asset,
            price: nextPrice,
            changeValue: nextChangeVal,
            changePercent: nextChangePct,
            chartSeries: {
              ...asset.chartSeries,
              '1D': nextSeries1D,
            },
          };
        });
      });
    }, 2800);

    return () => window.clearInterval(interval);
  }, [triggerFlash]);

  const togglePulse = useCallback(() => {
    setIsPulseActive((prev) => !prev);
  }, []);

  return {
    assets,
    isPulseActive,
    wsConnected,
    flashMap,
    togglePulse,
  };
}
