import React, { useId, useMemo } from 'react';

interface D3FiveMinSparklineProps {
  points: number[];
  deltaPct: number;
  width?: number;
  height?: number;
  className?: string;
  monochrome?: boolean;
  testId?: string;
}

function buildMonotoneSplinePaths(
  coords: Array<{ x: number; y: number }>,
  baselineY: number
): { lineD: string; areaD: string } {
  const n = coords.length;
  if (n === 0) return { lineD: '', areaD: '' };
  if (n === 1) {
    const pt = `${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
    return {
      lineD: `M${pt}`,
      areaD: `M${pt}L${coords[0].x.toFixed(2)},${baselineY.toFixed(2)}Z`,
    };
  }
  if (n === 2) {
    const p0 = `${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
    const p1 = `${coords[1].x.toFixed(2)},${coords[1].y.toFixed(2)}`;
    return {
      lineD: `M${p0}L${p1}`,
      areaD: `M${p0}L${p1}L${coords[1].x.toFixed(2)},${baselineY.toFixed(2)}L${coords[0].x.toFixed(2)},${baselineY.toFixed(2)}Z`,
    };
  }

  const dx: number[] = new Array(n - 1);
  const dy: number[] = new Array(n - 1);
  const m: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = Math.max(1e-6, coords[i + 1].x - coords[i].x);
    dy[i] = coords[i + 1].y - coords[i].y;
    m[i] = dy[i] / dx[i];
  }

  const tangents: number[] = new Array(n);
  tangents[0] = m[0];
  tangents[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangents[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }

  let lineD = `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const c1x = coords[i].x + h;
    const c1y = coords[i].y + tangents[i] * h;
    const c2x = coords[i + 1].x - h;
    const c2y = coords[i + 1].y - tangents[i + 1] * h;
    lineD += `C${c1x.toFixed(2)},${c1y.toFixed(2)},${c2x.toFixed(2)},${c2y.toFixed(2)},${coords[i + 1].x.toFixed(2)},${coords[i + 1].y.toFixed(2)}`;
  }

  const areaD = `${lineD}L${coords[n - 1].x.toFixed(2)},${baselineY.toFixed(2)}L${coords[0].x.toFixed(2)},${baselineY.toFixed(2)}Z`;
  return { lineD, areaD };
}

export const D3FiveMinSparkline: React.FC<D3FiveMinSparklineProps> = React.memo(
  ({
    points,
    deltaPct,
    width = 88,
    height = 22,
    className = '',
    monochrome = false,
    testId = 'd3-24h-sparkline',
  }) => {
    const uid = useId().replace(/:/g, '');
    const gradId = `d35m-${uid}`;

    const geometry = useMemo(() => {
      const valid = points.filter((v) => typeof v === 'number' && Number.isFinite(v));
      const safePts = valid.length >= 2 ? valid : [1, 1];
      const padX = 2.5;
      const padY = 2.5;

      const maxIdx = Math.max(1, safePts.length - 1);
      const xScale = (idx: number) => padX + (idx / maxIdx) * (width - padX * 2);

      let minVal = safePts[0];
      let maxVal = safePts[0];
      for (let i = 1; i < safePts.length; i++) {
        if (safePts[i] < minVal) minVal = safePts[i];
        if (safePts[i] > maxVal) maxVal = safePts[i];
      }
      const spread = maxVal - minVal;
      const domainPad = spread > 0 ? spread * 0.14 : Math.max(Math.abs(minVal) * 0.001, 1);
      const domMin = minVal - domainPad;
      const domSpan = Math.max(1e-9, maxVal + domainPad - domMin);
      const yScale = (val: number) =>
        height - padY - ((val - domMin) / domSpan) * (height - padY * 2);

      const coords = safePts.map((val, idx) => ({
        x: xScale(idx),
        y: yScale(val),
      }));

      const baselineY = yScale(safePts[0]);
      const { lineD, areaD } = buildMonotoneSplinePaths(coords, baselineY);
      const endX = coords[coords.length - 1].x;
      const endY = coords[coords.length - 1].y;

      const first = safePts[0];
      const last = safePts[safePts.length - 1];
      const trend: 'up' | 'down' | 'flat' =
        deltaPct > 0.005 || (Math.abs(deltaPct) <= 0.005 && last > first)
          ? 'up'
          : deltaPct < -0.005 || (Math.abs(deltaPct) <= 0.005 && last < first)
            ? 'down'
            : 'flat';

      return { lineD, areaD, baselineY, endX, endY, trend };
    }, [points, deltaPct, width, height]);

    const strokeColor = monochrome
      ? geometry.trend === 'up'
        ? '#F4F4F5'
        : geometry.trend === 'down'
          ? '#A1A1AA'
          : '#71717A'
      : geometry.trend === 'up'
        ? '#16A34A'
        : geometry.trend === 'down'
          ? '#DC2626'
          : '#64748B';

    return (
      <svg
        data-testid={testId}
        viewBox={`0 0 ${width} ${height}`}
        className={className || 'w-full h-[22px] overflow-visible'}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={monochrome ? '0.20' : '0.28'} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        <line
          x1={2}
          y1={geometry.baselineY}
          x2={width - 2}
          y2={geometry.baselineY}
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeDasharray="1.5 2.5"
          strokeWidth="1"
        />

        {geometry.areaD && (
          <path d={geometry.areaD} fill={`url(#${gradId})`} />
        )}

        {geometry.lineD && (
          <path
            d={geometry.lineD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        <circle
          cx={geometry.endX}
          cy={geometry.endY}
          r="2"
          fill={strokeColor}
        />
      </svg>
    );
  }
);
