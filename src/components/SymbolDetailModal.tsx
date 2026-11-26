import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Clock, Loader2, ShieldAlert, Target, TrendingUp, X } from 'lucide-react';
import {
  BandarmologyAnalysis,
  CandlePoint,
  ChartTradeOverlays,
  MarketAsset,
  StockTradePlan,
  Timeframe,
} from '../types/market';
import {
  computeFearGreedIndex,
  computeStockTradeStrategy,
  formatStockCurrencyValue,
  parseFormattedMarketNumber,
} from '../utils/marketSignals';
import { GoogleFinanceDeltaPill } from './GoogleFinanceMiniChart';
import { InteractiveChart } from './InteractiveChart';
import { BandarmologyBadge, FearGreedMeter } from './MarketUiPrimitives';

const DETAIL_TIMEFRAME_STORAGE_KEY = 'stocks_symbol_detail_timeframe_v1';

const INTRADAY_QUICK_TABS: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h'];
const SWING_MACRO_TABS: Timeframe[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'];
const ALL_DETAIL_TIMEFRAMES: Timeframe[] = [...INTRADAY_QUICK_TABS, ...SWING_MACRO_TABS];

function loadSavedDetailTimeframe(): Timeframe {
  if (typeof window === 'undefined') return '15m';
  try {
    const saved = window.localStorage.getItem(DETAIL_TIMEFRAME_STORAGE_KEY) as Timeframe | null;
    if (saved && ALL_DETAIL_TIMEFRAMES.includes(saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return '1D';
}

interface SymbolDetailData {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  shortName: string;
  exchange: string;
  isIndex: boolean;
  currency: 'USD' | 'IDR';
  currencyPrefix?: string;
  decimals: number;
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  open: string;
  dayHigh: string;
  dayLow: string;
  volume: string;
  w52Low: string;
  w52High: string;
  w52Pct: number;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  support: string;
  supportNote: string;
  resistance: string;
  resistanceNote: string;
  commentary: string;
  points: number[];
  timestamps: number[];
  candles?: CandlePoint[];
  chart1D: number[];
  timestamps1D: number[];
  candles1D?: CandlePoint[];
  marketSessionOpen: boolean;
  sessionStateLabel: string;
  sessionProgressRatio: number;
  updatedAtEpoch: number;
  bandarmology?: BandarmologyAnalysis;
  tradePlan?: StockTradePlan;
}

interface SymbolDetailModalProps {
  yahooSymbol: string | null;
  initialTimeframe?: Timeframe;
  tradeOverlays?: ChartTradeOverlays | null;
  onClose: () => void;
}

export const SymbolDetailModal: React.FC<SymbolDetailModalProps> = ({
  yahooSymbol,
  initialTimeframe,
  tradeOverlays = null,
  onClose,
}) => {
  const [timeframe, setTimeframeState] = useState<Timeframe>(
    () => initialTimeframe ?? loadSavedDetailTimeframe()
  );
  const [loadedTimeframe, setLoadedTimeframe] = useState<Timeframe>(timeframe);
  const [detail, setDetail] = useState<SymbolDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectedIdx, setInspectedIdx] = useState<number | null>(null);
  const frameCacheRef = useRef<Record<string, SymbolDetailData>>({});
  const marketSessionOpenRef = useRef<boolean>(false);

  useEffect(() => {
    if (yahooSymbol && initialTimeframe && ALL_DETAIL_TIMEFRAMES.includes(initialTimeframe)) {
      setTimeframeState(initialTimeframe);
    }
  }, [yahooSymbol, initialTimeframe]);

  const setTimeframe = useCallback((nextTf: Timeframe) => {
    setTimeframeState(nextTf);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(DETAIL_TIMEFRAME_STORAGE_KEY, nextTf);
      } catch {
        // ignore storage quota errors
      }
    }
  }, []);

  useEffect(() => {
    if (!yahooSymbol) return;
    setInspectedIdx(null);
    const cacheKey = `${yahooSymbol.toUpperCase()}:${timeframe}`;
    const cached = frameCacheRef.current[cacheKey];
    if (cached) {
      marketSessionOpenRef.current = Boolean(cached.marketSessionOpen);
      setDetail(cached);
      setLoadedTimeframe(timeframe);
    }
  }, [yahooSymbol, timeframe]);

  useEffect(() => {
    if (!yahooSymbol) return;
    let cancelled = false;
    let inFlight = false;
    const cacheKey = `${yahooSymbol.toUpperCase()}:${timeframe}`;
    if (!frameCacheRef.current[cacheKey]) {
      setLoading(true);
    }
    setError(null);

    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(
          `/api/symbol/detail?symbol=${encodeURIComponent(yahooSymbol)}&timeframe=${encodeURIComponent(
            timeframe
          )}`
        );
        if (!res.ok) throw new Error('Unable to load chart data');
        const json = (await res.json()) as SymbolDetailData;
        if (!cancelled) {
          marketSessionOpenRef.current = Boolean(json.marketSessionOpen);
          frameCacheRef.current[cacheKey] = json;
          setDetail(json);
          setLoadedTimeframe(timeframe);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load symbol chart.');
        }
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    const isIntraday =
      timeframe === '1D' || INTRADAY_QUICK_TABS.includes(timeframe);
    const timer = window.setInterval(() => {
      if (marketSessionOpenRef.current && isIntraday) {
        void load();
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [yahooSymbol, timeframe]);

  // Adapt individual stock / symbol response into a MarketAsset for InteractiveChart (Line + Candlestick OHLC)
  const chartAsset = useMemo<MarketAsset | null>(() => {
    if (!detail) return null;
    const activePoints =
      loadedTimeframe === timeframe && detail.points.length >= 2
        ? detail.points
        : detail.chart1D;
    const activeTimestamps =
      loadedTimeframe === timeframe && detail.timestamps.length >= 2
        ? detail.timestamps
        : detail.timestamps1D;
    const activeCandles =
      loadedTimeframe === timeframe && detail.candles && detail.candles.length >= 2
        ? detail.candles
        : detail.candles1D;

    return {
      id: detail.id || detail.symbol,
      symbol: detail.symbol,
      name: detail.name,
      shortName: detail.shortName,
      exchange: detail.exchange,
      category: detail.isIndex ? 'us-indices' : 'us-indices',
      categoryLabel: detail.isIndex ? 'Benchmark Index' : 'Equity Stock',
      price: detail.price,
      prevClose: detail.prevClose,
      changeValue: detail.changeValue,
      changePercent: detail.changePercent,
      currencyPrefix: detail.currencyPrefix,
      decimals: detail.decimals,
      open: detail.open,
      dayHigh: detail.dayHigh,
      dayLow: detail.dayLow,
      volume: detail.volume,
      avgVol: '—',
      peLabel: 'Range',
      peValue: `${detail.w52Pct}th pct`,
      capLabel: 'Exchange',
      capValue: detail.exchange,
      w52Low: detail.w52Low,
      w52High: detail.w52High,
      w52Pct: detail.w52Pct,
      sentiment: detail.sentiment,
      support: detail.support,
      supportNote: detail.supportNote,
      resistance: detail.resistance,
      resistanceNote: detail.resistanceNote,
      commentary: detail.commentary,
      sparklinePoints: detail.chart1D.slice(-16),
      chartSeries: {
        '1D': detail.chart1D,
        [timeframe]: activePoints,
      },
      chartTimestamps: {
        '1D': detail.timestamps1D,
        [timeframe]: activeTimestamps,
      },
      chartCandles: activeCandles
        ? {
            ...(detail.candles1D ? { '1D': detail.candles1D } : {}),
            [timeframe]: activeCandles,
          }
        : undefined,
      marketSessionOpen: detail.marketSessionOpen,
      sessionStateLabel: detail.sessionStateLabel,
      sessionProgressRatio: detail.sessionProgressRatio,
      updatedAtEpoch: detail.updatedAtEpoch,
    };
  }, [detail, timeframe, loadedTimeframe]);

  const detailFearGreed = useMemo(() => {
    if (!detail) return null;
    const openNum = parseFormattedMarketNumber(detail.open);
    const highNum = parseFormattedMarketNumber(detail.dayHigh);
    const lowNum = parseFormattedMarketNumber(detail.dayLow);
    return computeFearGreedIndex({
      price: detail.price,
      prevClose: detail.prevClose,
      changePercent: detail.changePercent,
      open: Number.isFinite(openNum) ? openNum : undefined,
      dayHigh: Number.isFinite(highNum) ? highNum : undefined,
      dayLow: Number.isFinite(lowNum) ? lowNum : undefined,
      series: detail.points,
      w52Pct: detail.w52Pct,
      assetId: detail.yahooSymbol || detail.symbol,
      category: detail.isIndex ? 'indices' : 'stocks',
    });
  }, [detail]);

  const detailTradePlan = useMemo<StockTradePlan | null>(() => {
    if (!detail || detail.isIndex) return null;
    if (
      detail.tradePlan &&
      detail.tradePlan.entryPrice > 0 &&
      detail.tradePlan.stopLoss > 0 &&
      detail.tradePlan.takeProfit1 > 0 &&
      detail.tradePlan.takeProfit2 > 0
    ) {
      return detail.tradePlan;
    }
    const dayHighNum = parseFormattedMarketNumber(detail.dayHigh);
    const dayLowNum = parseFormattedMarketNumber(detail.dayLow);
    return computeStockTradeStrategy({
      symbol: detail.symbol,
      name: detail.name,
      market: detail.currency === 'IDR' ? 'ID' : 'US',
      exchange: detail.exchange,
      currency: detail.currency,
      price: detail.price,
      prevClose: detail.prevClose,
      changeValue: detail.changeValue,
      changePercent: detail.changePercent,
      dayHigh: Number.isFinite(dayHighNum) ? dayHighNum : detail.price * 1.01,
      dayLow: Number.isFinite(dayLowNum) ? dayLowNum : detail.price * 0.99,
      volume: detail.volume,
      volumeRaw: parseFormattedMarketNumber(detail.volume) || 0,
      marketState: detail.marketSessionOpen ? 'REGULAR' : 'CLOSED',
      sparklinePoints: detail.chart1D.slice(-16),
      bandarmology: detail.bandarmology,
    });
  }, [detail]);

  const resolvedOverlays = useMemo<ChartTradeOverlays | null>(() => {
    if (tradeOverlays) return tradeOverlays;
    if (!detailTradePlan) return null;
    return {
      symbolLabel: detail?.symbol,
      direction: detailTradePlan.action,
      entryLow: detailTradePlan.entryPrice,
      stopLoss: detailTradePlan.stopLoss,
      tp1: detailTradePlan.takeProfit1,
      tp2: detailTradePlan.takeProfit2,
      demandLow: detailTradePlan.demandLowNum,
      demandHigh: detailTradePlan.demandHighNum,
      supplyLow: detailTradePlan.supplyLowNum,
      supplyHigh: detailTradePlan.supplyHighNum,
    };
  }, [tradeOverlays, detailTradePlan, detail?.symbol]);

  if (!yahooSymbol) return null;

  const formatVal = (v: number) => {
    if (!detail) return String(v);
    const prefix = detail.currencyPrefix ?? '';
    return `${prefix}${v.toLocaleString('en-US', {
      minimumFractionDigits: detail.decimals,
      maximumFractionDigits: detail.decimals,
    })}`;
  };

  const isTimeframeSynced = loadedTimeframe === timeframe;
  const activePts = chartAsset?.chartSeries[timeframe] ?? detail?.points ?? [];
  const activeVal =
    inspectedIdx !== null && activePts[inspectedIdx] !== undefined
      ? activePts[inspectedIdx]
      : detail?.price ?? 0;

  const parsedOpen = detail?.open ? parseFormattedMarketNumber(detail.open) : NaN;
  const refOpen = Number.isFinite(parsedOpen) && parsedOpen > 0 ? parsedOpen : detail?.prevClose ?? 0;
  const periodStartVal =
    timeframe === '1D'
      ? inspectedIdx !== null
        ? refOpen
        : detail?.prevClose ?? refOpen
      : activePts[0] ?? refOpen;

  const displayChangeVal =
    detail && timeframe === '1D' && inspectedIdx === null
      ? detail.changeValue
      : activeVal - periodStartVal;

  const displayChangePct =
    detail && timeframe === '1D' && inspectedIdx === null
      ? detail.changePercent
      : periodStartVal > 0
        ? (displayChangeVal / periodStartVal) * 100
        : 0;
  const isGain = displayChangePct >= 0;

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const curIdx = ALL_DETAIL_TIMEFRAMES.indexOf(timeframe);
    if (curIdx < 0) return;
    const nextIdx =
      e.key === 'ArrowRight'
        ? (curIdx + 1) % ALL_DETAIL_TIMEFRAMES.length
        : (curIdx - 1 + ALL_DETAIL_TIMEFRAMES.length) % ALL_DETAIL_TIMEFRAMES.length;
    setTimeframe(ALL_DETAIL_TIMEFRAMES[nextIdx]);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        data-testid="symbol-detail-modal"
        className="liquid-glass-strong w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-5 py-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <TrendingUp className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF] shrink-0" />
              <h2 className="text-lg sm:text-xl font-extrabold text-[#1C1C1E] dark:text-white">
                {detail?.symbol ?? yahooSymbol}
              </h2>
              <span className="text-xs font-medium text-[#6C6C70] dark:text-[#AEAEB2]">
                {detail?.exchange ?? 'Live Market'} · {detail?.yahooSymbol ?? yahooSymbol}
              </span>
              {detail && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    detail.marketSessionOpen
                      ? 'bg-[#30D158]/15 text-[#16803C] dark:text-[#30D158]'
                      : 'bg-[#E5E5EA] dark:bg-[#2C2C2E] text-[#6C6C70] dark:text-[#8E8E93]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      detail.marketSessionOpen ? 'bg-[#30D158] animate-pulse' : 'bg-[#8E8E93]'
                    }`}
                  />
                  {detail.sessionStateLabel}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93] truncate mt-0.5">
              {detail?.name ?? 'Loading instrument details...'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close chart modal"
            className="p-2 rounded-full hover:bg-[#E5E5EA] dark:hover:bg-[#2C2C2E] text-[#6C6C70] dark:text-[#AEAEB2]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Persistent Sticky Quick-Switch Timeframe Tab Interface (1m, 5m, 15m, 30m, 1h, 4h + Macro) */}
        <div
          data-testid="symbol-detail-timeframe-tabs"
          onKeyDown={handleTabKeyDown}
          className="px-4 sm:px-5 py-2.5 border-b border-black/8 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] flex flex-wrap items-center justify-between gap-2 shrink-0"
        >
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full" role="tablist" aria-label="Multi-timeframe quick switch">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] pr-1 shrink-0">
              <Clock className="w-3 h-3" />
              MTF
            </span>
            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-black/5 dark:bg-white/8">
              {INTRADAY_QUICK_TABS.map((tf) => {
                const active = tf === timeframe;
                return (
                  <button
                    key={tf}
                    type="button"
                    role="tab"
                    data-timeframe={tf}
                    aria-selected={active}
                    onClick={() => setTimeframe(tf)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#0066CC] text-white shadow-xs'
                        : 'text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>

            <span aria-hidden="true" className="text-black/15 dark:text-white/15 px-0.5 select-none">
              |
            </span>

            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-black/5 dark:bg-white/8">
              {SWING_MACRO_TABS.map((tf) => {
                const active = tf === timeframe;
                return (
                  <button
                    key={tf}
                    type="button"
                    role="tab"
                    data-timeframe={tf}
                    aria-selected={active}
                    onClick={() => setTimeframe(tf)}
                    className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#0066CC] text-white shadow-xs'
                        : 'text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#6C6C70] dark:text-[#9EB5C8] shrink-0">
            {loading && !isTimeframeSynced && (
              <Loader2 className="w-3 h-3 animate-spin text-[#0066CC]" />
            )}
            <span className="font-mono">Saved: {timeframe}</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-5">
          {loading && !detail ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-xs text-[#6C6C70] dark:text-[#8E8E93]">
              <Loader2 className="w-6 h-6 animate-spin text-[#0071E3]" />
              Loading live quote &amp; technical candlestick chart for {yahooSymbol}...
            </div>
          ) : error && !detail ? (
            <div className="py-12 text-center text-xs text-[#D7261C] dark:text-[#FF453A]">
              {error}
            </div>
          ) : detail && chartAsset ? (
            <>
              {/* Price Readout & Timeframe Gain/Loss Return */}
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <div className="text-3xl font-extrabold font-mono tabular-nums text-[#1C1C1E] dark:text-white">
                    {formatVal(activeVal)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                    <GoogleFinanceDeltaPill changePercent={detail.changePercent} />
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        detail.changePercent >= 0
                          ? 'text-[#16803C] dark:text-[#30D158]'
                          : 'text-[#D7261C] dark:text-[#FF453A]'
                      }`}
                    >
                      {detail.changeValue >= 0 ? '+' : '-'}
                      {formatVal(Math.abs(detail.changeValue))} Today
                    </span>

                    {(timeframe !== '1D' || inspectedIdx !== null) &&
                      (!isTimeframeSynced ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full liquid-glass-pill text-[11px] font-semibold text-[#6C6C70] dark:text-[#AEAEB2]">
                          <Loader2 className="w-3 h-3 animate-spin text-[#0071E3]" />
                          Loading {timeframe}...
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-mono tabular-nums ${
                            isGain
                              ? 'bg-[#22C55E]/14 dark:bg-[#4ADE80]/16 border-[#16A34A]/35 text-[#0F7033] dark:text-[#4ADE80]'
                              : 'bg-[#EF4444]/14 dark:bg-[#FF6B63]/16 border-[#DC2626]/35 text-[#C41C16] dark:text-[#FF6B63]'
                          }`}
                        >
                          <span className="font-sans text-[10px] font-extrabold uppercase tracking-wider opacity-85">
                            {inspectedIdx !== null ? `${timeframe} Pt` : timeframe}
                          </span>
                          <span className="inline-flex items-center gap-0.5 font-extrabold">
                            {isGain ? (
                              <ArrowUp className="w-3 h-3 stroke-[2.75]" />
                            ) : (
                              <ArrowDown className="w-3 h-3 stroke-[2.75]" />
                            )}
                            {displayChangePct >= 0 ? '+' : ''}
                            {displayChangePct.toFixed(2)}%
                          </span>
                          <span className="font-semibold opacity-90 hidden sm:inline">
                            ({displayChangeVal >= 0 ? '+' : '-'}
                            {formatVal(Math.abs(displayChangeVal))})
                          </span>
                        </span>
                      ))}
                  </div>
                </div>
              </div>

              {/* Technical Line, Candlestick OHLC Chart & Integrated Key Statistics */}
              <InteractiveChart
                asset={chartAsset}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                onInspectIndexChange={setInspectedIdx}
                tradeOverlays={resolvedOverlays}
                compact
                forceGranularIntraday
                hideTimeframeTabs
              />

              {/* Per-Instrument Fear & Greed Gauge */}
              {detailFearGreed && (
                <FearGreedMeter
                  fearGreed={detailFearGreed}
                  instrumentLabel={detail.symbol}
                  compact
                  showComponents
                />
              )}

              {/* Execution Trade Plan: Bandarmology + Flow + Supply/Demand */}
              {detailTradePlan && (
                <div
                  data-testid="modal-trade-plan-card"
                  className="rounded-2xl liquid-glass-inset p-4 flex flex-col gap-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                        Execution Trade Plan (Bandarmology + Flow + Supply/Demand)
                      </span>
                      <p className="text-[11px] font-semibold text-[#1C1C1E] dark:text-white mt-0.5">
                        {detailTradePlan.strategyTag} · {detailTradePlan.bandarFlowBias}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {detailTradePlan.trendFilterLabel && (
                        <span className="px-2 py-0.5 rounded-md bg-black/[0.05] dark:bg-white/[0.08] font-mono text-[10px] font-bold text-[#4A4D57] dark:text-[#B4C6DA]">
                          {detailTradePlan.trendFilterLabel}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-extrabold font-mono tabular-nums ${
                          detailTradePlan.action === 'BUY'
                            ? 'bg-[#16A34A]/18 text-[#0B5D2A] dark:text-[#4ADE80] border-[#16A34A]/45'
                            : detailTradePlan.action === 'SELL'
                              ? 'bg-[#DC2626]/18 text-[#B91C1C] dark:text-[#FF6B63] border-[#DC2626]/45'
                              : 'bg-[#D97706]/18 text-[#9A5A0A] dark:text-[#FBBF24] border-[#D97706]/45'
                        }`}
                      >
                        {detailTradePlan.action} · {detailTradePlan.conviction}%
                      </span>
                      <span className="px-2 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] font-mono font-bold tabular-nums text-[#1C1C1E] dark:text-white">
                        R:R {detailTradePlan.riskReward}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-black/8 dark:border-white/10 font-mono tabular-nums">
                    <div>
                      <span className="text-[10px] font-sans font-bold uppercase text-[#6C6C70] dark:text-[#9EB5C8] block">
                        1. {detailTradePlan.action === 'WAIT' ? 'Wait Entry' : `Execute ${detailTradePlan.action}`}
                      </span>
                      <span className="font-extrabold text-sm text-[#1C1C1E] dark:text-white block mt-0.5">
                        {formatStockCurrencyValue(detailTradePlan.entryPrice, detail.currency)}
                      </span>
                      <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] block truncate">
                        Zone {detailTradePlan.entryZoneLabel}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans font-bold uppercase text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-[#DC2626] dark:text-[#FF6B63]" />
                        2. Stop Loss (SL)
                      </span>
                      <span className="font-extrabold text-sm text-[#C41C16] dark:text-[#FF6B63] block mt-0.5">
                        {formatStockCurrencyValue(detailTradePlan.stopLoss, detail.currency)}
                      </span>
                      <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] block truncate">
                        Hard Invalidation
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans font-bold uppercase text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1">
                        <Target className="w-3 h-3 text-[#16A34A] dark:text-[#4ADE80]" />
                        3. Take Profit 1
                      </span>
                      <span className="font-extrabold text-sm text-[#0F7033] dark:text-[#4ADE80] block mt-0.5">
                        {formatStockCurrencyValue(detailTradePlan.takeProfit1, detail.currency)}
                      </span>
                      <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] block truncate">
                        Secure 50% + BE
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans font-bold uppercase text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1">
                        <Target className="w-3 h-3 text-[#16A34A] dark:text-[#4ADE80]" />
                        4. Take Profit 2
                      </span>
                      <span className="font-extrabold text-sm text-[#0F7033] dark:text-[#4ADE80] block mt-0.5">
                        {formatStockCurrencyValue(detailTradePlan.takeProfit2, detail.currency)}
                      </span>
                      <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] block truncate">
                        Full Extension Target
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px] font-mono tabular-nums pt-2 border-t border-black/8 dark:border-white/10">
                    <div>
                      <span className="font-sans font-bold text-[#0F7033] dark:text-[#4ADE80] mr-1.5">
                        Demand Zone:
                      </span>
                      <span className="text-[#1C1C1E] dark:text-white">{detailTradePlan.demandZoneLabel}</span>
                    </div>
                    <div>
                      <span className="font-sans font-bold text-[#C41C16] dark:text-[#FF6B63] mr-1.5">
                        Supply Zone:
                      </span>
                      <span className="text-[#1C1C1E] dark:text-white">{detailTradePlan.supplyZoneLabel}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-[#4A4D57] dark:text-[#C7CBD6] leading-relaxed">
                    {detailTradePlan.executionNote}
                  </p>
                </div>
              )}

              {/* Bandarmology & Institutional Flow Position */}
              {detail.bandarmology && (
                <div
                  data-testid="modal-bandarmology-card"
                  className="rounded-2xl liquid-glass-inset p-4 flex flex-col gap-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                        {detail.currency === 'IDR' ? 'IDX Bandarmology Position' : 'Institutional Flow Position'}
                      </span>
                      <p className="text-[11px] text-[#4A4D57] dark:text-[#C7CBD6] mt-0.5">
                        {detail.bandarmology.summary}
                      </p>
                    </div>
                    <BandarmologyBadge bandarmology={detail.bandarmology} showScore />
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-black/8 dark:border-white/10">
                    <div>
                      <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8]">
                        20D Volume Ratio
                      </span>
                      <p className="font-mono font-bold tabular-nums text-[#1C1C1E] dark:text-white mt-0.5">
                        {detail.bandarmology.volumeRatio.toFixed(2)}x
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8]">
                        Acc Flow Pressure
                      </span>
                      <p className="font-mono font-bold tabular-nums text-[#1C1C1E] dark:text-white mt-0.5">
                        {detail.bandarmology.accumulationPressure}%
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8]">
                        Flow Bias
                      </span>
                      <p className="font-mono font-bold text-[#1C1C1E] dark:text-white mt-0.5">
                        {detail.bandarmology.foreignBias}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
