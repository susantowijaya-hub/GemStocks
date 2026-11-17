import React, { useMemo, useRef, useState } from 'react';
import { MarketAsset, Timeframe } from '../types/market';

interface InteractiveChartProps {
  asset: MarketAsset;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'];

const TIME_LABELS: Record<Timeframe, string[]> = {
  '1D': ['09:30', '11:00', '12:30', '14:00', '15:30', '16:00'],
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
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const series = asset.chartSeries[timeframe] ?? asset.chartSeries['1D'];
  const isGain =
    timeframe === '1D'
      ? asset.changePercent >= 0
      : series[series.length - 1] >= series[0];

  const strokeColor = isGain ? '#30D158' : '#FF453A';
  const gradientId = `chartGrad-${asset.id}-${isGain ? 'gain' : 'loss'}`;

  const { coords, linePath, areaPath, prevCloseY, minVal, maxVal } = useMemo(() => {
    const width = 700;
    const height = 220;
    const padY = 18;
    const allVals = [...series, asset.prevClose];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const span = max - min || 1;

    const pts = series.map((val, idx) => {
      const x = (idx / Math.max(series.length - 1, 1)) * width;
      const y = padY + ((max - val) / span) * (height - padY * 2);
      return { x, y, val };
    });

    const pCloseY = padY + ((max - asset.prevClose) / span) * (height - padY * 2);
    const line = buildSmoothPath(pts);
    const area = `${line} L${width},${height} L0,${height} Z`;

    return {
      coords: pts,
      linePath: line,
      areaPath: area,
      prevCloseY: Math.max(8, Math.min(height - 8, pCloseY)),
      minVal: min,
      maxVal: max,
    };
  }, [series, asset.prevClose]);

  const handlePointerPosition = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = relX / Math.max(rect.width, 1);
    const idx = Math.round(ratio * (coords.length - 1));
    setHoverIndex(Math.max(0, Math.min(coords.length - 1, idx)));
  };

  const activePoint = hoverIndex !== null ? coords[hoverIndex] : null;
  const activeDelta = activePoint ? activePoint.val - asset.prevClose : 0;
  const activeDeltaPct = asset.prevClose ? (activeDelta / asset.prevClose) * 100 : 0;

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
      return `${hh}:${mm} EST`;
    }
    const labels = TIME_LABELS[timeframe];
    const bucket = Math.min(
      labels.length - 1,
      Math.floor((idx / Math.max(coords.length, 1)) * labels.length)
    );
    return `${timeframe} · ${labels[bucket]}`;
  };

  const prevCloseFormatted = formatVal(asset.prevClose);

  return (
    <div className="flex flex-col gap-3">
      {/* Segmented Timeframe Selector + Prev Close Legend */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
        <div
          role="tablist"
          aria-label="Chart Timeframes"
          className="inline-flex p-1 rounded-full bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] border border-[#D1D1D6] dark:border-[#2C2C2E]"
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
                className={`px-3 sm:px-4 py-1 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                    : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
                }`}
              >
                {tf}
              </button>
            );
          })}
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-[#6C6C70] dark:text-[#8E8E93] shrink-0">
          <span className="inline-block w-3 border-b-2 border-dashed border-[#8E8E93]" />
          <span>
            Prev Close (
            <span className="tabular-nums font-semibold text-[#1C1C1E] dark:text-white">
              {prevCloseFormatted}
            </span>
            )
          </span>
        </div>
      </div>

      {/* Interactive SVG Canvas */}
      <div className="relative w-full h-64 sm:h-72 bg-white dark:bg-[#1C1C1E]/60 rounded-2xl border border-[#E5E5EA] dark:border-[#2C2C2E] p-3 sm:p-4 flex flex-col justify-between overflow-hidden select-none touch-pan-y">
        {/* Range Bounds Hint */}
        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#8E8E93] z-10 pointer-events-none">
          <span>High: {formatVal(maxVal)}</span>
          <span>Low: {formatVal(minVal)}</span>
        </div>

        {/* Floating Tooltip Overlay */}
        {activePoint && hoverIndex !== null && (
          <div
            className="absolute top-3 z-20 pointer-events-none bg-white/95 dark:bg-black/90 backdrop-blur-md border border-[#E5E5EA] dark:border-[#2C2C2E] px-3 py-1.5 rounded-xl shadow-lg text-xs flex flex-col"
            style={{
              left: `clamp(12px, calc(${(activePoint.x / 700) * 100}% - 55px), calc(100% - 145px))`,
            }}
          >
            <span className="text-[10px] text-[#6C6C70] dark:text-[#8E8E93] font-medium">
              {formatTimeHint(hoverIndex)}
            </span>
            <span className="font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums font-mono">
              {formatVal(activePoint.val)}
            </span>
            <span
              className={`text-[11px] font-semibold tabular-nums font-mono ${
                activeDelta >= 0
                  ? 'text-[#16803C] dark:text-[#30D158]'
                  : 'text-[#D7261C] dark:text-[#FF453A]'
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
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Dashed Prev Close Reference Line */}
          <line
            x1="0"
            y1={prevCloseY}
            x2="700"
            y2={prevCloseY}
            stroke="#8E8E93"
            strokeWidth="1.25"
            strokeDasharray="4,4"
            opacity="0.55"
          />

          {/* Area Fill */}
          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* Main Price Curve */}
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            className={isGain ? 'sparkline-glow-gain' : 'sparkline-glow-loss'}
          />

          {/* Crosshair & Active Tracker Dot */}
          {activePoint && (
            <>
              <line
                x1={activePoint.x}
                y1="0"
                x2={activePoint.x}
                y2="220"
                stroke="currentColor"
                className="text-[#1C1C1E]/40 dark:text-white/55 pointer-events-none"
                strokeWidth="1"
                strokeDasharray="3,3"
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r="5.5"
                fill="#FFFFFF"
                stroke={strokeColor}
                strokeWidth="3"
                className="pointer-events-none"
              />
            </>
          )}
        </svg>

        {/* Time Axis Labels */}
        <div className="flex items-center justify-between text-[10px] text-[#6C6C70] dark:text-[#8E8E93] font-medium pt-2 border-t border-[#E5E5EA] dark:border-[#2C2C2E]/60">
          {TIME_LABELS[timeframe].map((lbl) => (
            <span key={lbl}>{lbl}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
