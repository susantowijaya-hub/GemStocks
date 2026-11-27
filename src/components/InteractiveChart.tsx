import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  type AreaData,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { CandlestickChart, LineChart, RotateCcw } from 'lucide-react';
import {
  CandlePoint,
  ChartTradeOverlays,
  MarketAsset,
  Timeframe,
} from '../types/market';
import { formatAssetPrevClose } from '../utils/formatters';
import { parseFormattedMarketNumber } from '../utils/marketSignals';

interface InteractiveChartProps {
  asset: MarketAsset;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  onInspectIndexChange?: (idx: number | null) => void;
  tradeOverlays?: ChartTradeOverlays | null;
  compact?: boolean;
  forceGranularIntraday?: boolean;
  hideTimeframeTabs?: boolean;
  showKeyStats?: boolean;
}

type ChartDisplayMode = 'line' | 'candles';

interface NormalizedBar extends CandlePoint {
  time: UTCTimestamp;
  seriesIdx: number;
}

interface NormalizedLinePoint {
  time: UTCTimestamp;
  value: number;
  seriesIdx: number;
}

interface HoveredReadout {
  timeSec: number;
  price: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
}

const STANDARD_TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'];
const GRANULAR_INTRADAY_TIMEFRAMES: Timeframe[] = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1D',
  '1W',
  '1M',
  '3M',
  'YTD',
  '1Y',
  'ALL',
];

const TF_STEP_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1D': 300,
  '1W': 3600,
  '1M': 14400,
  '3M': 86400,
  YTD: 86400,
  '1Y': 86400,
  ALL: 604800,
};

function detectChartPalette() {
  if (typeof document === 'undefined') {
    return {
      isDark: true,
      textColor: '#9CA3AF',
      gridColor: 'rgba(255, 255, 255, 0.045)',
      borderColor: '#2A2E39',
      crosshairColor: 'rgba(41, 98, 255, 0.60)',
      lineColor: '#2962FF',
      upColor: '#26A69A',
      downColor: '#EF5350',
    };
  }
  const cls = document.documentElement.classList;
  const isVelvet = cls.contains('velvet');
  const isObsidian = cls.contains('obsidian') || cls.contains('dark');
  const isParchment = cls.contains('parchment');
  if (isVelvet) {
    return {
      isDark: true,
      textColor: '#9790AB',
      gridColor: 'rgba(246, 244, 250, 0.045)',
      borderColor: '#2D2842',
      crosshairColor: 'rgba(249, 87, 75, 0.65)',
      lineColor: '#F9574B',
      upColor: '#34D399',
      downColor: '#FB6B62',
    };
  }
  if (isObsidian) {
    return {
      isDark: true,
      textColor: '#9CA3AF',
      gridColor: 'rgba(255, 255, 255, 0.045)',
      borderColor: '#2A2E39',
      crosshairColor: 'rgba(41, 98, 255, 0.60)',
      lineColor: '#2962FF',
      upColor: '#26A69A',
      downColor: '#EF5350',
    };
  }
  if (isParchment) {
    return {
      isDark: false,
      textColor: '#4D473C',
      gridColor: 'rgba(120, 95, 65, 0.09)',
      borderColor: '#D8CFBC',
      crosshairColor: 'rgba(180, 65, 14, 0.50)',
      lineColor: '#B4410E',
      upColor: '#0F7638',
      downColor: '#B91C1C',
    };
  }
  return {
    isDark: false,
    textColor: '#425466',
    gridColor: 'rgba(10, 37, 64, 0.06)',
    borderColor: '#DCE2EA',
    crosshairColor: 'rgba(29, 78, 216, 0.55)',
    lineColor: '#1D4ED8',
    upColor: '#0F7638',
    downColor: '#B91C1C',
  };
}

function normalizeRealCandles(
  rawCandles: CandlePoint[] | undefined,
  seriesLen: number
): NormalizedBar[] {
  if (!Array.isArray(rawCandles) || rawCandles.length < 2) return [];
  const bySec = new Map<number, CandlePoint>();
  for (const b of rawCandles) {
    if (
      !Number.isFinite(b.t) ||
      !Number.isFinite(b.o) ||
      !Number.isFinite(b.h) ||
      !Number.isFinite(b.l) ||
      !Number.isFinite(b.c) ||
      b.c <= 0 ||
      b.h < b.l
    ) {
      continue;
    }
    const sec = Math.floor(b.t / 1000);
    if (sec <= 0) continue;
    bySec.set(sec, b);
  }
  const sorted = Array.from(bySec.entries()).sort((a, b) => a[0] - b[0]);
  const total = sorted.length;
  return sorted.map(([sec, b], idx) => ({
    ...b,
    time: sec as UTCTimestamp,
    seriesIdx: Math.min(
      Math.max(0, seriesLen - 1),
      Math.round((idx / Math.max(1, total - 1)) * Math.max(0, seriesLen - 1))
    ),
  }));
}

function normalizeLinePoints(
  series: number[],
  timestamps: number[] | undefined,
  timeframe: Timeframe
): NormalizedLinePoint[] {
  const stepSec = TF_STEP_SECONDS[timeframe] ?? 300;
  const fallbackEndSec = Math.floor(Date.now() / 1000);
  const bySec = new Map<number, { value: number; seriesIdx: number }>();

  for (let i = 0; i < series.length; i++) {
    const val = series[i];
    if (!Number.isFinite(val)) continue;
    const rawTs = timestamps?.[i];
    let sec =
      typeof rawTs === 'number' && Number.isFinite(rawTs) && rawTs > 1_000_000_000
        ? Math.floor(rawTs / 1000)
        : fallbackEndSec - (series.length - 1 - i) * stepSec;
    if (bySec.has(sec)) {
      sec += 1;
    }
    bySec.set(sec, { value: val, seriesIdx: i });
  }

  return Array.from(bySec.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sec, pt]) => ({
      time: sec as UTCTimestamp,
      value: pt.value,
      seriesIdx: pt.seriesIdx,
    }));
}

function formatCrosshairTime(sec: number, timeframe: Timeframe): string {
  const d = new Date(sec * 1000);
  if (
    timeframe === '1m' ||
    timeframe === '5m' ||
    timeframe === '15m' ||
    timeframe === '30m' ||
    timeframe === '1h' ||
    timeframe === '4h' ||
    timeframe === '1D' ||
    timeframe === '1W'
  ) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  asset,
  timeframe,
  onTimeframeChange,
  onInspectIndexChange,
  tradeOverlays = null,
  compact = false,
  forceGranularIntraday = false,
  hideTimeframeTabs = false,
  showKeyStats = true,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<
    ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null
  >(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const fitSignatureRef = useRef<string>('');

  const [chartMode, setChartMode] = useState<ChartDisplayMode>('line');
  const [hoveredReadout, setHoveredReadout] = useState<HoveredReadout | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [paletteVersion, setPaletteVersion] = useState(0);

  const upperId = (asset.id || '').toUpperCase();
  const upperSym = (asset.symbol || '').toUpperCase();
  const isGranularIntradayAsset =
    forceGranularIntraday ||
    (asset.category === 'forex-yields' && !asset.isYield) ||
    upperId === 'BTCUSD' ||
    upperId === 'BTC-USD' ||
    upperSym === 'BTC/USD' ||
    upperId === 'XAUUSD' ||
    upperId === 'GC=F' ||
    upperSym === 'XAU/USD' ||
    upperId.endsWith('=X');
  const availableTimeframes = isGranularIntradayAsset
    ? GRANULAR_INTRADAY_TIMEFRAMES
    : STANDARD_TIMEFRAMES;

  useEffect(() => {
    if (!availableTimeframes.includes(timeframe)) {
      onTimeframeChange('1D');
    }
  }, [availableTimeframes, timeframe, onTimeframeChange]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(() => {
      setPaletteVersion((v) => v + 1);
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => obs.disconnect();
  }, []);

  const rawSeries = asset.chartSeries[timeframe];
  const hasLoadedSeries =
    timeframe === '1D' || (Array.isArray(rawSeries) && rawSeries.length >= 2);
  const fallback1D = asset.chartSeries['1D'] ?? [];
  const baseSeries = hasLoadedSeries
    ? rawSeries && rawSeries.length >= 2
      ? rawSeries
      : fallback1D
    : fallback1D;
  const series = useMemo(
    () =>
      baseSeries.length >= 2
        ? baseSeries
        : [asset.prevClose || asset.price, asset.price],
    [baseSeries, asset.prevClose, asset.price]
  );

  const openBaseline = useMemo(() => {
    if (timeframe === '1D') {
      const parsedOpen = parseFormattedMarketNumber(asset.open);
      if (Number.isFinite(parsedOpen) && parsedOpen > 0) return parsedOpen;
      if (Number.isFinite(asset.prevClose) && asset.prevClose > 0) return asset.prevClose;
    }
    return series[0];
  }, [timeframe, asset.open, asset.prevClose, series]);

  const normalizedCandles = useMemo(
    () => normalizeRealCandles(asset.chartCandles?.[timeframe], series.length),
    [asset.chartCandles, timeframe, series.length]
  );

  const normalizedLine = useMemo(
    () => normalizeLinePoints(series, asset.chartTimestamps?.[timeframe], timeframe),
    [series, asset.chartTimestamps, timeframe]
  );

  const hasRealOhlc = normalizedCandles.length >= 2;
  const isCloseOnlyFallback = chartMode === 'candles' && !hasRealOhlc;
  const hasVolumeBars = useMemo(
    () =>
      normalizedCandles.some(
        (b) => typeof b.v === 'number' && Number.isFinite(b.v) && b.v > 0
      ),
    [normalizedCandles]
  );

  // Refs for stable crosshair lookup without re-creating chart
  const candlesByTimeRef = useRef<Map<number, NormalizedBar>>(new Map());
  const lineByTimeRef = useRef<Map<number, NormalizedLinePoint>>(new Map());
  const onInspectRef = useRef(onInspectIndexChange);
  onInspectRef.current = onInspectIndexChange;

  useEffect(() => {
    candlesByTimeRef.current = new Map(normalizedCandles.map((b) => [b.time, b]));
    lineByTimeRef.current = new Map(normalizedLine.map((p) => [p.time, p]));
  }, [normalizedCandles, normalizedLine]);

  // Create & manage TradingView Lightweight Charts instance
  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    const palette = detectChartPalette();
    const initialHeight = compact ? 228 : 268;
    const chart = createChart(container, {
      width: Math.max(260, container.clientWidth || 640),
      height: Math.max(190, container.clientHeight || initialHeight),
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: palette.textColor,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: palette.gridColor },
        horzLines: { color: palette.gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: palette.crosshairColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: palette.isDark ? '#1E293B' : '#0F172A',
        },
        horzLine: {
          color: palette.crosshairColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: palette.isDark ? '#1E293B' : '#0F172A',
        },
      },
      rightPriceScale: {
        borderColor: palette.borderColor,
        scaleMargins: {
          top: 0.1,
          bottom: hasVolumeBars ? 0.22 : 0.1,
        },
      },
      timeScale: {
        borderColor: palette.borderColor,
        timeVisible:
          timeframe === '1m' ||
          timeframe === '5m' ||
          timeframe === '15m' ||
          timeframe === '30m' ||
          timeframe === '1h' ||
          timeframe === '4h' ||
          timeframe === '1D' ||
          timeframe === '1W',
        secondsVisible: false,
        rightOffset: 4,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;
    priceLinesRef.current = [];

    const precision = Math.max(0, Math.min(6, asset.decimals));
    const minMove = Number((1 / Math.pow(10, precision)).toFixed(precision));

    if (chartMode === 'candles' && hasRealOhlc) {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: palette.upColor,
        downColor: palette.downColor,
        borderVisible: false,
        wickUpColor: palette.upColor,
        wickDownColor: palette.downColor,
        priceFormat: {
          type: 'price',
          precision,
          minMove,
        },
      });
      priceSeriesRef.current = candleSeries;
    } else {
      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: palette.lineColor,
        topColor: palette.isDark
          ? 'rgba(56, 189, 248, 0.28)'
          : 'rgba(0, 102, 204, 0.22)',
        bottomColor: palette.isDark
          ? 'rgba(56, 189, 248, 0.02)'
          : 'rgba(0, 102, 204, 0.02)',
        lineWidth: 2,
        priceFormat: {
          type: 'price',
          precision,
          minMove,
        },
      });
      priceSeriesRef.current = areaSeries;
    }

    if (hasVolumeBars) {
      const volSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      volumeSeriesRef.current = volSeries;
    } else {
      volumeSeriesRef.current = null;
    }

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.time === undefined) {
        setHoveredReadout(null);
        onInspectRef.current?.(null);
        return;
      }
      const timeSec =
        typeof param.time === 'number' ? param.time : Number(param.time);
      if (!Number.isFinite(timeSec)) {
        setHoveredReadout(null);
        onInspectRef.current?.(null);
        return;
      }

      const bar = candlesByTimeRef.current.get(timeSec);
      if (bar) {
        setHoveredReadout({
          timeSec,
          price: bar.c,
          o: bar.o,
          h: bar.h,
          l: bar.l,
          c: bar.c,
          v: bar.v,
        });
        onInspectRef.current?.(bar.seriesIdx);
        return;
      }

      const pt = lineByTimeRef.current.get(timeSec);
      if (pt) {
        setHoveredReadout({
          timeSec,
          price: pt.value,
        });
        onInspectRef.current?.(pt.seriesIdx);
      }
    });

    const unsubRange = () => {
      const handler = () => {
        setIsZoomed(true);
      };
      chart.timeScale().subscribeVisibleTimeRangeChange(handler);
      return () => chart.timeScale().unsubscribeVisibleTimeRangeChange(handler);
    };
    const cleanupRangeSub = unsubRange();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w > 40 && h > 40) {
          chart.applyOptions({ width: w, height: h });
        }
      });
      ro.observe(container);
    }

    fitSignatureRef.current = '';

    return () => {
      cleanupRangeSub();
      if (ro) ro.disconnect();
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
      priceLinesRef.current = [];
      setHoveredReadout(null);
      setIsZoomed(false);
    };
  }, [chartMode, hasRealOhlc, hasVolumeBars, timeframe, asset.id, asset.decimals, compact]);

  // Sync theme palette dynamically without resetting zoom
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const palette = detectChartPalette();
    chart.applyOptions({
      layout: { textColor: palette.textColor },
      grid: {
        vertLines: { color: palette.gridColor },
        horzLines: { color: palette.gridColor },
      },
      rightPriceScale: { borderColor: palette.borderColor },
      timeScale: { borderColor: palette.borderColor },
    });
  }, [paletteVersion]);

  // Push series data + price lines cleanly on live ticks or overlay updates
  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = priceSeriesRef.current;
    if (!chart || !mainSeries) return;

    if (chartMode === 'candles' && hasRealOhlc) {
      const candleData: CandlestickData<Time>[] = normalizedCandles.map((b) => ({
        time: b.time,
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
      }));
      (mainSeries as ISeriesApi<'Candlestick'>).setData(candleData);
    } else {
      const endColor =
        (normalizedLine[normalizedLine.length - 1]?.value ?? asset.price) >=
        openBaseline
          ? '#22C55E'
          : '#EF4444';
      (mainSeries as ISeriesApi<'Area'>).applyOptions({
        lineColor: endColor,
        topColor:
          endColor === '#22C55E'
            ? 'rgba(34, 197, 94, 0.26)'
            : 'rgba(239, 68, 68, 0.26)',
        bottomColor:
          endColor === '#22C55E'
            ? 'rgba(34, 197, 94, 0.02)'
            : 'rgba(239, 68, 68, 0.02)',
      });
      const areaData: AreaData<Time>[] = normalizedLine.map((p) => ({
        time: p.time,
        value: p.value,
      }));
      (mainSeries as ISeriesApi<'Area'>).setData(areaData);
    }

    if (volumeSeriesRef.current && hasVolumeBars) {
      const volData: HistogramData<Time>[] = normalizedCandles
        .filter((b) => typeof b.v === 'number' && b.v >= 0)
        .map((b) => ({
          time: b.time,
          value: b.v ?? 0,
          color:
            b.c >= b.o
              ? 'rgba(34, 197, 94, 0.34)'
              : 'rgba(239, 68, 68, 0.34)',
        }));
      volumeSeriesRef.current.setData(volData);
    }

    // Clear prior price lines cleanly
    for (const ln of priceLinesRef.current) {
      try {
        mainSeries.removePriceLine(ln);
      } catch {
        // ignore detached line
      }
    }
    priceLinesRef.current = [];

    const addLine = (
      price: number | undefined,
      title: string,
      color: string,
      style: LineStyle,
      width: 1 | 2 = 1
    ) => {
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return;
      const ln = mainSeries.createPriceLine({
        price,
        color,
        lineWidth: width,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.push(ln);
    };

    addLine(
      openBaseline,
      timeframe === '1D' ? 'Open' : `${timeframe} Start`,
      'rgba(148, 163, 184, 0.65)',
      LineStyle.Dashed,
      1
    );

    if (tradeOverlays) {
      addLine(tradeOverlays.entryLow, 'Entry', '#0EA5E9', LineStyle.Dashed, 1);
      if (
        typeof tradeOverlays.entryHigh === 'number' &&
        tradeOverlays.entryHigh !== tradeOverlays.entryLow
      ) {
        addLine(tradeOverlays.entryHigh, 'Entry Hi', '#0EA5E9', LineStyle.Dotted, 1);
      }
      addLine(tradeOverlays.stopLoss, 'SL', '#EF4444', LineStyle.Dashed, 2);
      addLine(tradeOverlays.tp1, 'TP1', '#22C55E', LineStyle.Dashed, 1);
      addLine(tradeOverlays.tp2, 'TP2', '#16A34A', LineStyle.Dashed, 2);
      addLine(tradeOverlays.demandLow, 'Demand', 'rgba(34,197,94,0.75)', LineStyle.Dotted, 1);
      addLine(tradeOverlays.supplyHigh, 'Supply', 'rgba(239,68,68,0.75)', LineStyle.Dotted, 1);
      addLine(tradeOverlays.asianHigh, 'Asia Hi', '#F59E0B', LineStyle.Dotted, 1);
      addLine(tradeOverlays.asianLow, 'Asia Lo', '#F59E0B', LineStyle.Dotted, 1);
    }

    const fitSig = `${asset.id}:${timeframe}:${chartMode}:${hasRealOhlc}`;
    if (fitSignatureRef.current !== fitSig) {
      fitSignatureRef.current = fitSig;
      chart.timeScale().fitContent();
      setIsZoomed(false);
    }
  }, [
    asset.id,
    asset.price,
    timeframe,
    chartMode,
    hasRealOhlc,
    hasVolumeBars,
    normalizedCandles,
    normalizedLine,
    openBaseline,
    tradeOverlays,
  ]);

  const timeframeRange = useMemo(() => {
    const label =
      timeframe === '1D'
        ? 'Day Range'
        : timeframe === '1Y'
          ? '52-Week Range'
          : timeframe === 'ALL'
            ? 'All-Time Range'
            : `${timeframe} Range`;

    const pool: number[] = [...series];
    const tfCandles = asset.chartCandles?.[timeframe];
    if (Array.isArray(tfCandles)) {
      for (const c of tfCandles) {
        if (Number.isFinite(c.h) && c.h > 0) pool.push(c.h);
        if (Number.isFinite(c.l) && c.l > 0) pool.push(c.l);
      }
    }
    if (Number.isFinite(asset.price) && asset.price > 0) {
      pool.push(asset.price);
    }

    if (timeframe === '1D') {
      const hi = parseFormattedMarketNumber(asset.dayHigh);
      const lo = parseFormattedMarketNumber(asset.dayLow);
      if (Number.isFinite(hi) && hi > 0) pool.push(hi);
      if (Number.isFinite(lo) && lo > 0) pool.push(lo);
    } else if (timeframe === '1Y') {
      const w52Lo = parseFormattedMarketNumber(asset.w52Low);
      const w52Hi = parseFormattedMarketNumber(asset.w52High);
      if (Number.isFinite(w52Lo) && w52Lo > 0) pool.push(w52Lo);
      if (Number.isFinite(w52Hi) && w52Hi > 0) pool.push(w52Hi);
    }

    const valid = pool.filter((v) => Number.isFinite(v));
    const low = valid.length > 0 ? Math.min(...valid) : asset.price;
    const high = valid.length > 0 ? Math.max(...valid) : asset.price;
    const span = high - low;
    const pct =
      span > 0
        ? Math.max(0, Math.min(100, ((asset.price - low) / span) * 100))
        : 50;

    return { label, low, high, pct };
  }, [
    series,
    asset.chartCandles,
    asset.price,
    asset.dayHigh,
    asset.dayLow,
    asset.w52Low,
    asset.w52High,
    timeframe,
  ]);

  const primaryExtraStat = useMemo(() => {
    const blocked = new Set(['Intraday Spread', '52W Position', '52W Midpoint', 'Venue', 'Range']);
    const candidates = [
      { label: asset.avgVolLabel, value: asset.avgVol },
      { label: asset.peLabel, value: asset.peValue },
      { label: asset.capLabel, value: asset.capValue },
    ];
    return candidates.find((c) => c.label && c.value && !blocked.has(c.label)) ?? null;
  }, [asset.avgVolLabel, asset.avgVol, asset.peLabel, asset.peValue, asset.capLabel, asset.capValue]);

  const formatVal = (val: number) => {
    const formatted = val.toLocaleString('en-US', {
      minimumFractionDigits: asset.decimals,
      maximumFractionDigits: asset.decimals,
    });
    return `${asset.currencyPrefix ?? ''}${formatted}${asset.unitSuffix ?? ''}`;
  };

  const activeDelta = hoveredReadout ? hoveredReadout.price - openBaseline : 0;
  const activeDeltaPct = openBaseline ? (activeDelta / openBaseline) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Segmented Timeframe Selector + Chart Type Toggle (Line / Candles) + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-0.5">
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {!hideTimeframeTabs && (
            <div
              role="tablist"
              aria-label="Chart Timeframes"
              className="liquid-glass-pill inline-flex p-1 rounded-full overflow-x-auto no-scrollbar max-w-full"
            >
              {availableTimeframes.map((tf) => {
                const active = tf === timeframe;
                return (
                  <button
                    key={tf}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTimeframeChange(tf)}
                    className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#0066CC] dark:bg-[#0066CC] text-white shadow-sm'
                        : 'text-[#52525A] dark:text-[#AEAEB8] hover:text-[#1C1C1E] dark:hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
          )}

          {/* Line vs Candlestick Display Toggle */}
          <div
            role="group"
            aria-label="Chart Display Mode"
            data-testid="chart-type-toggle"
            className="liquid-glass-pill inline-flex p-1 rounded-full shrink-0"
          >
            <button
              type="button"
              aria-pressed={chartMode === 'line'}
              onClick={() => setChartMode('line')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                chartMode === 'line'
                  ? 'bg-[#0066CC] text-white shadow-sm'
                  : 'text-[#52525A] dark:text-[#AEAEB8] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
              title="Line / Area Chart"
            >
              <LineChart className="w-3.5 h-3.5" />
              <span>Line</span>
            </button>
            <button
              type="button"
              aria-pressed={chartMode === 'candles'}
              onClick={() => setChartMode('candles')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                chartMode === 'candles'
                  ? 'bg-[#0066CC] text-white shadow-sm'
                  : 'text-[#52525A] dark:text-[#AEAEB8] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
              title="OHLC Candlestick Chart"
            >
              <CandlestickChart className="w-3.5 h-3.5" />
              <span>Candles</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isZoomed && (
            <button
              type="button"
              onClick={() => {
                chartRef.current?.timeScale().fitContent();
                setIsZoomed(false);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-pill text-[11px] font-bold text-[#1C1C1E] dark:text-white hover:opacity-85 transition-opacity"
              title="Reset chart zoom and scroll"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Zoom
            </button>
          )}

          {!compact && (
            <div className="hidden md:flex items-center gap-3 text-[11px] text-[#52525A] dark:text-[#B4B4BE] shrink-0">
              <div className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#16A34A] dark:bg-[#30D158]" />
                <span className="font-semibold text-[#0F7033] dark:text-[#4ADE80]">
                  {chartMode === 'candles' ? 'Bull' : 'Above'}
                </span>
                <span className="text-[#8E8E93]">/</span>
                <span className="w-2 h-2 rounded-full bg-[#DC2626] dark:bg-[#FF453A]" />
                <span className="font-semibold text-[#C41C16] dark:text-[#FF5A52]">
                  {chartMode === 'candles' ? 'Bear' : 'Below'}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 border-b-2 border-dashed border-[#6E6E78] dark:border-[#9898A2]" />
                <span>
                  {timeframe === '1D' ? 'Open' : `${timeframe} Start`}{' '}
                  <span className="tabular-nums font-bold font-mono text-[#1C1C1E] dark:text-white">
                    {formatVal(openBaseline)}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unified TradingView Lightweight Charts Canvas + Key Statistics */}
      <div className="liquid-glass-card rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
        <div
          data-no-view-swipe="true"
          className={`relative w-full ${
            compact ? 'h-60 sm:h-68' : 'h-72 sm:h-80'
          } flex flex-col justify-between overflow-hidden select-none`}
        >
          {/* Compact Top HUD: OHLC Crosshair Legend / Trade Overlay Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono tabular-nums text-[#52525A] dark:text-[#B4C6DA] z-10 pb-1">
            {hoveredReadout ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[#1C1C1E] dark:text-white">
                  {formatCrosshairTime(hoveredReadout.timeSec, timeframe)}
                </span>
                {typeof hoveredReadout.o === 'number' &&
                typeof hoveredReadout.h === 'number' &&
                typeof hoveredReadout.l === 'number' &&
                typeof hoveredReadout.c === 'number' ? (
                  <span>
                    O {formatVal(hoveredReadout.o)} · H {formatVal(hoveredReadout.h)} · L{' '}
                    {formatVal(hoveredReadout.l)} · C {formatVal(hoveredReadout.c)}
                  </span>
                ) : (
                  <span className="font-bold text-[#1C1C1E] dark:text-white">
                    {formatVal(hoveredReadout.price)}
                  </span>
                )}
                <span
                  className={
                    activeDelta >= 0
                      ? 'font-bold text-[#0F7033] dark:text-[#4ADE80]'
                      : 'font-bold text-[#C41C16] dark:text-[#FF6B63]'
                  }
                >
                  ({activeDelta >= 0 ? '+' : ''}
                  {activeDeltaPct.toFixed(2)}%)
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  High {formatVal(timeframeRange.high)} · Low {formatVal(timeframeRange.low)}
                </span>
                {tradeOverlays?.direction && tradeOverlays.direction !== 'WAIT' && (
                  <span className="px-1.5 py-0.5 rounded bg-[#0EA5E9]/14 text-[#0284C7] dark:text-[#38BDF8] font-bold">
                    {tradeOverlays.direction} Plan Overlay
                  </span>
                )}
              </div>
            )}

            {isCloseOnlyFallback && (
              <span className="px-2 py-0.5 rounded-md bg-[#D97706]/15 text-[#9A5A0A] dark:text-[#FBBF24] text-[10px] font-bold">
                Close-only series (No Exchange OHLC)
              </span>
            )}
          </div>

          {/* TradingView Lightweight Charts Canvas Container */}
          <div
            ref={hostRef}
            data-testid={chartMode === 'candles' ? 'candlestick-series' : 'line-series'}
            data-chart-mode={chartMode}
            className="relative flex-1 min-h-0 w-full cursor-crosshair"
          />
        </div>

        {/* Key Statistics & Dynamic Timeframe Range Incorporated Directly Into Chart */}
        {showKeyStats && (
          <div
            data-testid="chart-key-statistics"
            className="pt-3 border-t border-black/8 dark:border-white/10 flex flex-col gap-3"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">Open</span>
                <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                  {asset.open}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">Prev Close</span>
                <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                  {formatAssetPrevClose(asset)}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">Day High</span>
                <p className="font-bold text-sm text-[#16803C] dark:text-[#4ADE80] tabular-nums font-mono mt-0.5">
                  {asset.dayHigh}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">Day Low</span>
                <p className="font-bold text-sm text-[#D7261C] dark:text-[#FF6B63] tabular-nums font-mono mt-0.5">
                  {asset.dayLow}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">Volume</span>
                <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                  {asset.volume}
                </p>
              </div>
              {primaryExtraStat && (
                <div>
                  <span className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">
                    {primaryExtraStat.label}
                  </span>
                  <p className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5 truncate">
                    {primaryExtraStat.value}
                  </p>
                </div>
              )}
            </div>

            {/* Dynamic Price Range by Chosen Timeframe */}
            <div
              data-testid="chart-timeframe-range"
              className="pt-2.5 border-t border-black/6 dark:border-white/8"
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[#6C6C70] dark:text-[#9EB5C8] font-medium">
                  {timeframeRange.label}
                </span>
                <span className="font-bold text-[#1C1C1E] dark:text-white tabular-nums font-mono">
                  {formatVal(timeframeRange.low)} — {formatVal(timeframeRange.high)}
                </span>
              </div>
              <div className="relative w-full h-2 rounded-full bg-[#E5E5EA] dark:bg-[#172838] overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 left-0 rounded-full bg-gradient-to-r from-[#0EA5E9] to-[#34D399]"
                  style={{ width: `${timeframeRange.pct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] mt-1 tabular-nums font-mono">
                <span>
                  {timeframe} Low: {formatVal(timeframeRange.low)}
                </span>
                <span>
                  {timeframe} High: {formatVal(timeframeRange.high)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
