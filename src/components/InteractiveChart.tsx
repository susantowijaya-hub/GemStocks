import React, { useId, useMemo, useRef, useState } from 'react';
import { MarketAsset, Timeframe } from '../types/market';
import { parseFormattedMarketNumber } from '../utils/marketSignals';

interface InteractiveChartProps {
  asset: MarketAsset;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'];

const TIME_LABELS: Record<Timeframe, string[]> = {
  '1D': ['Open', 'Morning', 'Midday', 'Afternoon', 'Pre-Close', 'Close'],
  '1W': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Close'],
  '1M': ['W1', 'W2', 'W3', 'W4', 'Now'],
  '3M': ['Aug', 'Sep', 'Oct', 'Nov'],
  YTD: ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'],
  '1Y': ['Q4', 'Q1', 'Q2', 'Q3', 'Now'],
  ALL: ['2022', '2023', '2024', '2025', '2026'],
};

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx = ((p0.x + p1.x) / 2).toFixed(1);
    d += ` C${cx},${p0.y.toFixed(1)} ${cx},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return d;
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  asset,
  timeframe,
  onTimeframeChange,
}) => {
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const rawSeries = asset.chartSeries[timeframe] ?? asset.chartSeries['1D'];
  const series = rawSeries.length >= 2 ? rawSeries : [asset.prevClose || asset.price, asset.price];

  // Anchor split color & horizontal baseline on Opening Price for 1D, or Period Start for >1D
  const openBaseline = useMemo(() => {
    if (timeframe === '1D') {
      const parsedOpen = parseFormattedMarketNumber(asset.open);
      if (Number.isFinite(parsedOpen) && parsedOpen > 0) return parsedOpen;
      if (Number.isFinite(asset.prevClose) && asset.prevClose > 0) return asset.prevClose;
    }
    return series[0];
  }, [timeframe, asset.open, asset.prevClose, series]);

  const effectiveProgress =
    timeframe === '1D' && typeof asset.sessionProgressRatio === 'number'
      ? Math.max(0.15, Math.min(1, asset.sessionProgressRatio))
      : 1;

  const {
    coords,
    linePath,
    baselineAreaPath,
    openingY,
    minVal,
    maxVal,
    lastCoord,
    splitPct,
  } = useMemo(() => {
    const width = 700;
    const height = 220;
    const padY = 18;
    const drawW = width * effectiveProgress;
    const allVals = [...series, openBaseline];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const span = max - min || Math.max(Math.abs(openBaseline) * 0.002, 1);

    const pts = series.map((val, idx) => {
      const x = (idx / Math.max(series.length - 1, 1)) * drawW;
      const y = padY + ((max - val) / span) * (height - padY * 2);
      return { x, y, val };
    });

    const rawOpenY = padY + ((max - openBaseline) / span) * (height - padY * 2);
    const clampedOpenY = Math.max(8, Math.min(height - 8, rawOpenY));
    const line = buildSmoothPath(pts);
    const firstPt = pts[0] ?? { x: 0, y: clampedOpenY, val: openBaseline };
    const lastPt = pts[pts.length - 1] ?? { x: drawW, y: height / 2, val: asset.price };
    const baselineArea = `${line} L${lastPt.x.toFixed(1)},${clampedOpenY.toFixed(1)} L${firstPt.x.toFixed(1)},${clampedOpenY.toFixed(1)} Z`;

    return {
      coords: pts,
      linePath: line,
      baselineAreaPath: baselineArea,
      openingY: clampedOpenY,
      minVal: min,
      maxVal: max,
      lastCoord: lastPt,
      splitPct: Math.max(0, Math.min(100, (clampedOpenY / height) * 100)),
    };
  }, [series, openBaseline, asset.price, effectiveProgress]);

  const handlePointerPosition = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = relX / Math.max(rect.width * effectiveProgress, 1);
    const idx = Math.round(Math.min(1, ratio) * (coords.length - 1));
    setHoverIndex(Math.max(0, Math.min(coords.length - 1, idx)));
  };

  const activePoint = hoverIndex !== null ? coords[hoverIndex] : null;
  const activeDelta = activePoint ? activePoint.val - openBaseline : 0;
  const activeDeltaPct = openBaseline ? (activeDelta / openBaseline) * 100 : 0;

  const lastAboveOpen = lastCoord.val >= openBaseline;
  const activeAboveOpen = activePoint ? activePoint.val >= openBaseline : lastAboveOpen;

  const formatVal = (val: number) => {
    const formatted = val.toLocaleString('en-US', {
      minimumFractionDigits: asset.decimals,
      maximumFractionDigits: asset.decimals,
    });
    return `${asset.currencyPrefix ?? ''}${formatted}${asset.unitSuffix ?? ''}`;
  };

  const formatTimeHint = (idx: number) => {
    const ts = asset.chartTimestamps?.[timeframe]?.[idx];
    if (typeof ts === 'number' && Number.isFinite(ts)) {
      const d = new Date(ts);
      if (timeframe === '1D' || timeframe === '1W') {
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
    if (timeframe === '1D') {
      const totalMins = 9 * 60 + 30 + Math.round((idx / Math.max(coords.length - 1, 1)) * 390);
      const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
      const mm = String(totalMins % 60).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    const labels = TIME_LABELS[timeframe];
    const bucket = Math.min(
      labels.length - 1,
      Math.floor((idx / Math.max(coords.length, 1)) * labels.length)
    );
    return `${timeframe} · ${labels[bucket]}`;
  };

  const strokeGradId = `chartSplitStroke-${uid}`;
  const aboveFillId = `chartAboveFill-${uid}`;
  const belowFillId = `chartBelowFill-${uid}`;
  const aboveClipId = `chartAboveClip-${uid}`;
  const belowClipId = `chartBelowClip-${uid}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Segmented Timeframe Selector + Above/Below Opening Reference Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-0.5">
        <div
          role="tablist"
          aria-label="Chart Timeframes"
          className="liquid-glass-pill inline-flex p-1 rounded-full overflow-x-auto no-scrollbar max-w-full"
        >
          {TIMEFRAMES.map((tf) => {
            const active = tf === timeframe;
            return (
              <button
                key={tf}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTimeframeChange(tf)}
                className={`px-3 sm:px-4 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  active
                    ? 'bg-[#0066CC] dark:bg-[#0A84FF] text-white shadow-sm'
                    : 'text-[#52525A] dark:text-[#AEAEB8] hover:text-[#1C1C1E] dark:hover:text-white'
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-[11px] sm:text-xs text-[#52525A] dark:text-[#B4B4BE] shrink-0">
          <div className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] dark:bg-[#30D158]" />
            <span className="font-semibold text-[#0F7033] dark:text-[#4ADE80]">Above</span>
            <span className="text-[#8E8E93]">/</span>
            <span className="w-2 h-2 rounded-full bg-[#DC2626] dark:bg-[#FF453A]" />
            <span className="font-semibold text-[#C41C16] dark:text-[#FF5A52]">Below</span>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 border-b-2 border-dashed border-[#6E6E78] dark:border-[#9898A2]" />
            <span>
              {timeframe === '1D' ? 'Open' : 'Start'}{' '}
              <span className="tabular-nums font-bold font-mono text-[#1C1C1E] dark:text-white">
                {formatVal(openBaseline)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Interactive SVG Canvas with Liquid Glass Frame */}
      <div className="liquid-glass-card relative w-full h-64 sm:h-72 rounded-2xl p-3 sm:p-4 flex flex-col justify-between overflow-hidden select-none touch-pan-y">
        {/* Range Bounds Hint */}
        <div className="flex items-center justify-between text-[10px] font-mono font-semibold tabular-nums text-[#52525A] dark:text-[#B4B4BE] z-10 pointer-events-none">
          <span>High: {formatVal(maxVal)}</span>
          <span>Low: {formatVal(minVal)}</span>
        </div>

        {/* Floating Tooltip Overlay */}
        {activePoint && hoverIndex !== null && (
          <div
            className="liquid-glass-strong absolute top-3 z-20 pointer-events-none px-3 py-1.5 rounded-xl shadow-lg text-xs flex flex-col"
            style={{
              left: `clamp(12px, calc(${(activePoint.x / 700) * 100}% - 55px), calc(100% - 155px))`,
            }}
          >
            <span className="text-[10px] text-[#52525A] dark:text-[#B4B4BE] font-semibold">
              {formatTimeHint(hoverIndex)} · vs {timeframe === '1D' ? 'Open' : 'Start'}
            </span>
            <span className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono">
              {formatVal(activePoint.val)}
            </span>
            <span
              className={`text-[11px] font-bold tabular-nums font-mono ${
                activeDelta >= 0
                  ? 'text-[#0F7033] dark:text-[#4ADE80]'
                  : 'text-[#C41C16] dark:text-[#FF5A52]'
              }`}
            >
              {activeDelta >= 0 ? '+' : ''}
              {activeDelta.toFixed(asset.decimals >= 3 ? asset.decimals : 2)} (
              {activeDeltaPct >= 0 ? '+' : ''}
              {activeDeltaPct.toFixed(2)}%)
            </span>
          </div>
        )}

        <svg
          ref={svgRef}
          className="w-full h-full cursor-crosshair overflow-visible"
          viewBox="0 0 700 220"
          preserveAspectRatio="none"
          onPointerMove={(e) => handlePointerPosition(e.clientX)}
          onPointerDown={(e) => handlePointerPosition(e.clientX)}
          onPointerLeave={() => setHoverIndex(null)}
          onTouchStart={(e) => {
            if (e.touches[0]) handlePointerPosition(e.touches[0].clientX);
          }}
          onTouchMove={(e) => {
            if (e.touches[0]) handlePointerPosition(e.touches[0].clientX);
          }}
          onTouchEnd={() => setHoverIndex(null)}
        >
          <defs>
            {/* Exact coordinate-space stroke split at Opening Y */}
            <linearGradient
              id={strokeGradId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2="220"
            >
              <stop offset="0%" stopColor="#22C55E" />
              <stop offset={`${splitPct}%`} stopColor="#22C55E" />
              <stop offset={`${splitPct}%`} stopColor="#EF4444" />
              <stop offset="100%" stopColor="#EF4444" />
            </linearGradient>

            <linearGradient
              id={aboveFillId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2={String(Math.max(1, openingY))}
            >
              <stop offset="0%" stopColor="#22C55E" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#22C55E" stopOpacity="0.05" />
            </linearGradient>

            <linearGradient
              id={belowFillId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={String(openingY)}
              x2="0"
              y2="220"
            >
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.34" />
            </linearGradient>

            <clipPath id={aboveClipId}>
              <rect x="0" y="0" width="700" height={openingY} />
            </clipPath>
            <clipPath id={belowClipId}>
              <rect x="0" y={openingY} width="700" height={Math.max(0, 220 - openingY)} />
            </clipPath>
          </defs>

          {/* Horizontal Dashed Opening Reference Line */}
          <line
            x1="0"
            y1={openingY}
            x2="700"
            y2={openingY}
            stroke="#8E8E98"
            strokeWidth="1.5"
            strokeDasharray="3 5"
            strokeLinecap="round"
            opacity="0.75"
          />

          {/* Split Area Fill: Green above Opening, Red below Opening */}
          <path
            d={baselineAreaPath}
            clipPath={`url(#${aboveClipId})`}
            fill={`url(#${aboveFillId})`}
          />
          <path
            d={baselineAreaPath}
            clipPath={`url(#${belowClipId})`}
            fill={`url(#${belowFillId})`}
          />

          {/* Split Main Price Curve (Green above Opening, Red below Opening) */}
          <path
            d={linePath}
            fill="none"
            stroke={`url(#${strokeGradId})`}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Live Session Endpoint Dot */}
          {timeframe === '1D' && asset.marketSessionOpen && !activePoint && (
            <circle
              cx={lastCoord.x}
              cy={lastCoord.y}
              r="4.2"
              fill={lastAboveOpen ? '#22C55E' : '#EF4444'}
              stroke="#FFFFFF"
              strokeWidth="1.5"
              className="pointer-events-none"
            />
          )}

          {/* Crosshair & Active Tracker Dot */}
          {activePoint && (
            <>
              <line
                x1={activePoint.x}
                y1="0"
                x2={activePoint.x}
                y2="220"
                stroke="currentColor"
                className="text-[#1C1C1E]/45 dark:text-white/55 pointer-events-none"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="5.5"
                fill="#FFFFFF"
                stroke={activeAboveOpen ? '#16A34A' : '#DC2626'}
                strokeWidth="3"
                className="pointer-events-none"
              />
            </>
          )}
        </svg>

        {/* Time Axis Labels */}
        <div className="flex items-center justify-between text-[10px] text-[#52525A] dark:text-[#B4B4BE] font-semibold pt-2 border-t border-black/10 dark:border-white/10">
          {TIME_LABELS[timeframe].map((lbl) => (
            <span key={lbl}>{lbl}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
