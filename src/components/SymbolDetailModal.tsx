import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2, TrendingUp, X } from 'lucide-react';
import { Timeframe } from '../types/market';
import { GoogleFinanceDeltaPill } from './GoogleFinanceMiniChart';

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
  marketSessionOpen: boolean;
  sessionStateLabel: string;
  sessionProgressRatio: number;
  updatedAtEpoch: number;
}

interface SymbolDetailModalProps {
  yahooSymbol: string | null;
  onClose: () => void;
}

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'];

export const SymbolDetailModal: React.FC<SymbolDetailModalProps> = ({
  yahooSymbol,
  onClose,
}) => {
  const uid = useId().replace(/:/g, '');
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');
  const [detail, setDetail] = useState<SymbolDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!yahooSymbol) return;
    setTimeframe('1D');
    setHoverIdx(null);
  }, [yahooSymbol]);

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

  const geom = useMemo(() => {
    const pts = detail?.points ?? [];
    if (pts.length < 2) return null;
    const width = 680;
    const height = 220;
    const padY = 18;
    const parsedOpen = detail?.open ? parseFloat(String(detail.open).replace(/[^0-9.\-]/g, '')) : NaN;
    const refBaseline =
      timeframe === '1D'
        ? Number.isFinite(parsedOpen) && parsedOpen > 0
          ? parsedOpen
          : detail?.prevClose ?? pts[0]
        : pts[0];
    const all = [...pts, refBaseline].filter((v) => Number.isFinite(v));
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || Math.max(max * 0.01, 1);

    const progress =
      timeframe === '1D' ? Math.max(0.08, Math.min(1, detail?.sessionProgressRatio ?? 1)) : 1;
    const plotWidth = width * progress;

    const coords = pts.map((val, idx) => {
      const x = (idx / Math.max(pts.length - 1, 1)) * plotWidth;
      const y = padY + ((max - val) / span) * (height - padY * 2);
      return { x, y, val };
    });

    const line = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');
    const firstX = coords[0]?.x ?? 0;
    const lastX = coords[coords.length - 1]?.x ?? plotWidth;
    const prevY = Math.max(10, Math.min(height - 10, padY + ((max - refBaseline) / span) * (height - padY * 2)));
    const area = `${line} L${lastX.toFixed(1)},${prevY.toFixed(1)} L${firstX.toFixed(1)},${prevY.toFixed(1)} Z`;
    const splitPct = Math.max(0, Math.min(100, (prevY / height) * 100));

    return { coords, line, area, prevY, refClose: refBaseline, splitPct, width, height, min, max };
  }, [detail, timeframe]);

  if (!yahooSymbol) return null;

  const formatVal = (v: number) => {
    if (!detail) return String(v);
    const prefix = detail.currencyPrefix ?? '';
    return `${prefix}${v.toLocaleString('en-US', {
      minimumFractionDigits: detail.decimals,
      maximumFractionDigits: detail.decimals,
    })}`;
  };

  const handlePointer = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg || !geom) return;
    const rect = svg.getBoundingClientRect();
    const relX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const targetSvgX = (relX / Math.max(rect.width, 1)) * geom.width;
    let nearest = 0;
    let bestDist = Infinity;
    geom.coords.forEach((pt, idx) => {
      const d = Math.abs(pt.x - targetSvgX);
      if (d < bestDist) {
        bestDist = d;
        nearest = idx;
      }
    });
    setHoverIdx(nearest);
  };

  const activePt = hoverIdx !== null && geom ? geom.coords[hoverIdx] : null;
  const activeTs =
    hoverIdx !== null && detail?.timestamps?.[hoverIdx]
      ? detail.timestamps[hoverIdx]
      : detail?.updatedAtEpoch;

  const lastVal = detail?.points?.[detail.points.length - 1] ?? detail?.price ?? 0;
  const activeDotColor =
    activePt
      ? activePt.val >= (geom?.refClose ?? lastVal)
        ? '#16A34A'
        : '#DC2626'
      : lastVal >= (geom?.refClose ?? lastVal)
        ? '#16A34A'
        : '#DC2626';
  const isGain = (detail?.changePercent ?? 0) >= 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
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
              Loading live quote &amp; interactive chart for {yahooSymbol}...
            </div>
          ) : error && !detail ? (
            <div className="py-12 text-center text-xs text-[#D7261C] dark:text-[#FF453A]">
              {error}
            </div>
          ) : detail ? (
            <>
              {/* Price Readout */}
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <div className="text-3xl font-extrabold font-mono tabular-nums text-[#1C1C1E] dark:text-white">
                    {activePt ? formatVal(activePt.val) : formatVal(detail.price)}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs sm:text-sm">
                    <GoogleFinanceDeltaPill changePercent={detail.changePercent} />
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        isGain
                          ? 'text-[#16803C] dark:text-[#30D158]'
                          : 'text-[#D7261C] dark:text-[#FF453A]'
                      }`}
                    >
                      {detail.changeValue >= 0 ? '+' : '-'}
                      {formatVal(Math.abs(detail.changeValue))} Today
                    </span>
                    {activeTs && (
                      <span className="text-[11px] font-mono text-[#6C6C70] dark:text-[#8E8E93]">
                        ·{' '}
                        {new Intl.DateTimeFormat('en-GB', {
                          timeZone: 'Asia/Jakarta',
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        }).format(new Date(activeTs))}{' '}
                        WIB
                      </span>
                    )}
                  </div>
                </div>

                {/* Timeframe Switcher */}
                <div className="inline-flex rounded-xl bg-[#F2F2F7] dark:bg-[#2C2C2E] p-1 border border-[#E5E5EA] dark:border-[#3A3A3C]">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTimeframe(tf)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                        timeframe === tf
                          ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white'
                          : 'text-[#6C6C70] dark:text-[#AEAEB2] hover:text-[#1C1C1E] dark:hover:text-white'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart */}
              {geom && (
                <div className="relative h-56 sm:h-64 rounded-2xl bg-[#F2F2F7]/50 dark:bg-[#141416] border border-[#E5E5EA] dark:border-[#2C2C2E] overflow-hidden select-none">
                  <div
                    className="absolute left-3 z-10 pointer-events-none px-2 py-0.5 rounded bg-white/95 dark:bg-[#2C2C2E]/95 border border-[#E5E5EA] dark:border-[#3A3A3C] text-[10px] font-mono text-[#6C6C70] dark:text-[#AEAEB2]"
                    style={{
                      top: `clamp(8px, calc(${(geom.prevY / geom.height) * 100}% - 12px), calc(100% - 28px))`,
                    }}
                  >
                    {timeframe === '1D' ? 'Open' : 'Start'}: {formatVal(geom.refClose)}
                  </div>

                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${geom.width} ${geom.height}`}
                    preserveAspectRatio="none"
                    className="w-full h-full cursor-crosshair"
                    onPointerMove={(e) => handlePointer(e.clientX)}
                    onPointerDown={(e) => handlePointer(e.clientX)}
                    onPointerLeave={() => setHoverIdx(null)}
                  >
                    <defs>
                      <linearGradient
                        id={`symSplit-${uid}`}
                        gradientUnits="userSpaceOnUse"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2={String(geom.height)}
                      >
                        <stop offset="0%" stopColor="#22C55E" />
                        <stop offset={`${geom.splitPct}%`} stopColor="#22C55E" />
                        <stop offset={`${geom.splitPct}%`} stopColor="#EF4444" />
                        <stop offset="100%" stopColor="#EF4444" />
                      </linearGradient>

                      <linearGradient
                        id={`symAbove-${uid}`}
                        gradientUnits="userSpaceOnUse"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2={String(Math.max(1, geom.prevY))}
                      >
                        <stop offset="0%" stopColor="#22C55E" stopOpacity="0.34" />
                        <stop offset="100%" stopColor="#22C55E" stopOpacity="0.05" />
                      </linearGradient>

                      <linearGradient
                        id={`symBelow-${uid}`}
                        gradientUnits="userSpaceOnUse"
                        x1="0"
                        y1={String(geom.prevY)}
                        x2="0"
                        y2={String(geom.height)}
                      >
                        <stop offset="0%" stopColor="#EF4444" stopOpacity="0.05" />
                        <stop offset="100%" stopColor="#EF4444" stopOpacity="0.34" />
                      </linearGradient>

                      <clipPath id={`symClipA-${uid}`}>
                        <rect x="0" y="0" width={geom.width} height={geom.prevY} />
                      </clipPath>
                      <clipPath id={`symClipB-${uid}`}>
                        <rect x="0" y={geom.prevY} width={geom.width} height={Math.max(0, geom.height - geom.prevY)} />
                      </clipPath>
                    </defs>
                    <line
                      x1="0"
                      y1={geom.prevY}
                      x2={geom.width}
                      y2={geom.prevY}
                      stroke="#8E8E98"
                      strokeWidth="1.5"
                      strokeDasharray="2 5"
                      opacity="0.75"
                    />
                    <path d={geom.area} clipPath={`url(#symClipA-${uid})`} fill={`url(#symAbove-${uid})`} />
                    <path d={geom.area} clipPath={`url(#symClipB-${uid})`} fill={`url(#symBelow-${uid})`} />
                    <path
                      d={geom.line}
                      fill="none"
                      stroke={`url(#symSplit-${uid})`}
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {activePt && (
                      <>
                        <line
                          x1={activePt.x}
                          y1="0"
                          x2={activePt.x}
                          y2={geom.height}
                          stroke="#8E8E93"
                          strokeDasharray="3 3"
                          strokeWidth="1"
                        />
                        <circle
                          cx={activePt.x}
                          cy={activePt.y}
                          r="5"
                          fill="#FFFFFF"
                          stroke={activeDotColor}
                          strokeWidth="2.5"
                        />
                      </>
                    )}
                  </svg>
                </div>
              )}

              {/* Key Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-[#F2F2F7]/60 dark:bg-[#141416] border border-[#E5E5EA] dark:border-[#2C2C2E] p-4 text-xs">
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

              <p className="text-xs text-[#6C6C70] dark:text-[#AEAEB2] leading-relaxed">
                {detail.commentary}
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
