import React, { useId, useMemo } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

interface GoogleFinanceMiniChartProps {
  points: number[];
  prevClose?: number;
  isGain: boolean;
  progressRatio?: number; // 0.08..1.0; < 1 leaves dotted future baseline tail like Google Finance intraday
  className?: string;
  showEndDot?: boolean;
  strokeWidth?: number;
}

export const GoogleFinanceMiniChart: React.FC<GoogleFinanceMiniChartProps> = ({
  points,
  prevClose,
  isGain,
  progressRatio = 1,
  className = 'w-full h-12',
  showEndDot = false,
  strokeWidth = 1.65,
}) => {
  const uid = useId().replace(/:/g, '');
  const gradId = `gfGrad-${uid}`;

  const { linePath, areaPath, baselineY, endPoint } = useMemo(() => {
    const w = 160;
    const h = 52;
    const padTop = 4;
    const padBottom = 3;
    const usableH = h - padTop - padBottom;

    const safePts = points.length >= 2 ? points : [1, 1];
    const refVal =
      typeof prevClose === 'number' && Number.isFinite(prevClose) && prevClose > 0
        ? prevClose
        : safePts[0];

    const allVals = [...safePts, refVal];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const span = max - min || Math.max(Math.abs(refVal) * 0.002, 1);

    const clampedProgress = Math.max(0.15, Math.min(1, progressRatio));
    const drawW = w * clampedProgress;

    const mapY = (val: number) => {
      const norm = (val - min) / span;
      return padTop + (1 - norm) * usableH;
    };

    const coords = safePts.map((val, idx) => {
      const x = (idx / Math.max(safePts.length - 1, 1)) * drawW;
      const y = mapY(val);
      return { x, y };
    });

    const line = coords
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
      .join(' ');

    const lastPt = coords[coords.length - 1];
    const area = `${line} L${lastPt.x.toFixed(1)},${h} L0,${h} Z`;
    const pCloseY = Math.max(2, Math.min(h - 2, mapY(refVal)));

    return {
      linePath: line,
      areaPath: area,
      baselineY: pCloseY,
      endPoint: lastPt,
    };
  }, [points, prevClose, progressRatio]);

  const strokeColor = isGain ? '#30D158' : '#F28B82';
  const strokeColorDark = isGain ? '#4ADE80' : '#FF6961';

  return (
    <svg
      className={className}
      viewBox="0 0 160 52"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColorDark} stopOpacity="0.34" />
          <stop offset="85%" stopColor={strokeColor} stopOpacity="0.06" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Horizontal Dotted Prev Close Baseline */}
      <line
        x1="0"
        y1={baselineY}
        x2="160"
        y2={baselineY}
        stroke="#8E8E93"
        strokeWidth="1.5"
        strokeDasharray="1.5 4.2"
        strokeLinecap="round"
        opacity="0.7"
      />

      {/* Gradient Area Fill */}
      <path d={areaPath} fill={`url(#${gradId})`} />

      {/* Crisp Price Curve */}
      <path
        d={linePath}
        fill="none"
        stroke={strokeColorDark}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Active session endpoint dot */}
      {showEndDot && (
        <circle
          cx={endPoint.x}
          cy={endPoint.y}
          r="2.4"
          fill={strokeColorDark}
        />
      )}
    </svg>
  );
};

interface GoogleFinanceDeltaPillProps {
  changePercent: number;
  label?: string;
  compact?: boolean;
}

export const GoogleFinanceDeltaPill: React.FC<GoogleFinanceDeltaPillProps> = ({
  changePercent,
  label,
  compact = false,
}) => {
  const isGain = changePercent >= 0;
  const text = label ?? `${isGain ? '+' : ''}${changePercent.toFixed(2)}%`;

  return (
    <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
      <span
        className={`${compact ? 'text-[11px]' : 'text-xs sm:text-sm'} font-bold ${
          isGain
            ? 'text-[#16803C] dark:text-[#6EE7B7]'
            : 'text-[#D7261C] dark:text-[#FCA5A5]'
        }`}
      >
        {text}
      </span>
      <span
        className={`inline-flex items-center justify-center rounded-full ${
          compact ? 'w-4 h-4' : 'w-6 h-4'
        } ${
          isGain
            ? 'bg-[#30D158]/25 dark:bg-[#86EFAC] text-[#14532D]'
            : 'bg-[#FF453A]/20 dark:bg-[#FCA5A5] text-[#7F1D1D]'
        }`}
      >
        {isGain ? (
          <ArrowUp className={compact ? 'w-2.5 h-2.5 stroke-[2.5]' : 'w-3 h-3 stroke-[2.5]'} />
        ) : (
          <ArrowDown className={compact ? 'w-2.5 h-2.5 stroke-[2.5]' : 'w-3 h-3 stroke-[2.5]'} />
        )}
      </span>
    </span>
  );
};
