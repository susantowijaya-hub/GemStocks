import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, TrendingUp, X } from 'lucide-react';
import { CandlePoint, MarketAsset, Timeframe } from '../types/market';
import { computeFearGreedIndex, parseFormattedMarketNumber } from '../utils/marketSignals';
import { GoogleFinanceDeltaPill } from './GoogleFinanceMiniChart';
import { InteractiveChart } from './InteractiveChart';
import { FearGreedMeter } from './MarketUiPrimitives';

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
}

interface SymbolDetailModalProps {
  yahooSymbol: string | null;
  onClose: () => void;
}

export const SymbolDetailModal: React.FC<SymbolDetailModalProps> = ({
  yahooSymbol,
  onClose,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [loadedTimeframe, setLoadedTimeframe] = useState<Timeframe>('1D');
  const [detail, setDetail] = useState<SymbolDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectedIdx, setInspectedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!yahooSymbol) return;
    setTimeframe('1D');
    setLoadedTimeframe('1D');
    setInspectedIdx(null);
  }, [yahooSymbol]);

  useEffect(() => {
    setInspectedIdx(null);
  }, [timeframe]);

  useEffect(() => {
    if (!yahooSymbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const res = await fetch(
          `/api/symbol/detail?symbol=${encodeURIComponent(yahooSymbol)}&timeframe=${encodeURIComponent(
            timeframe
          )}`
        );
        if (!res.ok) throw new Error('Unable to load chart data');
        const json = (await res.json()) as SymbolDetailData;
        if (!cancelled) {
          setDetail(json);
          setLoadedTimeframe(timeframe);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load symbol chart.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    const timer = window.setInterval(() => {
      if (detail?.marketSessionOpen && timeframe === '1D') {
        void load();
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [yahooSymbol, timeframe, detail?.marketSessionOpen]);

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

              {/* Technical Line & Candlestick OHLC Chart (Unified with Index Terminal) */}
              <InteractiveChart
                asset={chartAsset}
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
                onInspectIndexChange={setInspectedIdx}
                compact
              />

              {/* Key Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl liquid-glass-inset p-4 text-xs">
                <div>
                  <span className="text-[#6C6C70] dark:text-[#8E8E93]">Open</span>
                  <p className="font-mono font-bold text-[#1C1C1E] dark:text-white mt-0.5">
                    {detail.open}
                  </p>
                </div>
                <div>
                  <span className="text-[#6C6C70] dark:text-[#8E8E93]">Day High</span>
                  <p className="font-mono font-bold text-[#16803C] dark:text-[#30D158] mt-0.5">
                    {detail.dayHigh}
                  </p>
                </div>
                <div>
                  <span className="text-[#6C6C70] dark:text-[#8E8E93]">Day Low</span>
                  <p className="font-mono font-bold text-[#D7261C] dark:text-[#FF453A] mt-0.5">
                    {detail.dayLow}
                  </p>
                </div>
                <div>
                  <span className="text-[#6C6C70] dark:text-[#8E8E93]">Volume</span>
                  <p className="font-mono font-bold text-[#1C1C1E] dark:text-white mt-0.5">
                    {detail.volume}
                  </p>
                </div>
              </div>

              {/* Per-Instrument Fear & Greed Gauge */}
              {detailFearGreed && (
                <FearGreedMeter
                  fearGreed={detailFearGreed}
                  instrumentLabel={detail.symbol}
                  compact
                  showComponents
                />
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
