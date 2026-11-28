import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';
import { CurrencyCode, SignalHistoryRecord, ThemeMode } from '../types/market';
import { normalizeSignalStatus } from '../utils/signalHistoryEngine';

type ChartRange = '7D' | '30D' | '90D' | 'ALL';
type MetricMode = 'equity' | 'cumR' | 'dailyPct';

interface DailyPerformancePoint {
  dateKey: string;
  date: Date;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  bes: number;
  dailyR: number;
  cumR: number;
  dailyPct: number;
  cumReturnPct: number;
  equity: number;
  drawdownPct: number;
}

interface D3PortfolioPerformanceChartProps {
  signalHistory: SignalHistoryRecord[];
  basePortfolioValue: number;
  displayCurrency: CurrencyCode;
  formatMoney: (value: number, currency: CurrencyCode, decimals?: number) => string;
  themeMode?: ThemeMode;
}

function toLocalDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getRecordOutcomeContribution(rec: SignalHistoryRecord): {
  included: boolean;
  rVal: number;
  pnlPct: number;
  outcome: 'win' | 'loss' | 'be' | 'open';
  eventMs: number;
} {
  if (rec.userOutcome === 'SKIPPED') {
    return { included: false, rVal: 0, pnlPct: 0, outcome: 'open', eventMs: rec.createdAtMs };
  }
  const st = normalizeSignalStatus(rec.status);
  if (st === 'PENDING' && !rec.userOutcome) {
    return { included: false, rVal: 0, pnlPct: 0, outcome: 'open', eventMs: rec.createdAtMs };
  }
  if (st === 'EXPIRED' && !rec.zoneFillVerified && !rec.userOutcome) {
    return { included: false, rVal: 0, pnlPct: 0, outcome: 'open', eventMs: rec.createdAtMs };
  }

  const eventMs = rec.closedAtMs ?? rec.tp1HitAtMs ?? rec.filledAtMs ?? rec.createdAtMs;

  if (rec.userOutcome === 'WIN') {
    const rVal = rec.rMultiple > 0 ? rec.rMultiple : 2.0;
    return { included: true, rVal, pnlPct: rec.pnlPct || rVal * 1.0, outcome: 'win', eventMs };
  }
  if (rec.userOutcome === 'LOSS') {
    const rVal = rec.rMultiple < 0 ? rec.rMultiple : -1.0;
    return { included: true, rVal, pnlPct: rec.pnlPct || rVal * 1.0, outcome: 'loss', eventMs };
  }
  if (rec.userOutcome === 'BE') {
    return { included: true, rVal: 0, pnlPct: 0, outcome: 'be', eventMs };
  }

  const safeR = Number.isFinite(rec.rMultiple) ? rec.rMultiple : 0;
  const safePct = Number.isFinite(rec.pnlPct) ? rec.pnlPct : 0;

  if (st === 'TP') {
    const rVal = safeR > 0 ? safeR : rec.status === 'TP2_HIT' ? 2.0 : 1.0;
    return { included: true, rVal, pnlPct: safePct > 0 ? safePct : rVal, outcome: 'win', eventMs };
  }
  if (st === 'SL') {
    const rVal = safeR < 0 ? safeR : -1.0;
    return { included: true, rVal, pnlPct: safePct < 0 ? safePct : rVal, outcome: 'loss', eventMs };
  }
  if (rec.status === 'BE_CLOSED' || rec.barrierOutcome === 'BREAK_EVEN') {
    return { included: true, rVal: safeR, pnlPct: safePct, outcome: 'be', eventMs };
  }
  if (st === 'FILLED') {
    return { included: true, rVal: safeR, pnlPct: safePct, outcome: 'open', eventMs };
  }
  return { included: false, rVal: 0, pnlPct: 0, outcome: 'open', eventMs };
}

export const D3PortfolioPerformanceChart: React.FC<D3PortfolioPerformanceChartProps> = ({
  signalHistory,
  basePortfolioValue,
  displayCurrency,
  formatMoney,
  themeMode = 'obsidian',
}) => {
  const [range, setRange] = useState<ChartRange>('30D');
  const [metricMode, setMetricMode] = useState<MetricMode>('cumR');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(640);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const next = Math.max(280, Math.floor(el.getBoundingClientRect().width));
      setContainerWidth(next);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const anchorCapital = basePortfolioValue > 0 ? basePortfolioValue : 10000;

  const { dailySeries, totalTrades, totalWins, totalLosses, maxDrawdownPct, netCumR, netReturnPct } =
    useMemo(() => {
      const now = Date.now();
      const rangeDaysMap: Record<ChartRange, number> = {
        '7D': 7,
        '30D': 30,
        '90D': 90,
        ALL: 3650,
      };
      const cutoffMs =
        range === 'ALL' ? 0 : now - rangeDaysMap[range] * 24 * 60 * 60 * 1000;

      const buckets = new Map<
        string,
        {
          dateKey: string;
          trades: number;
          wins: number;
          losses: number;
          bes: number;
          dailyR: number;
          dailyPctSum: number;
        }
      >();

      let tTrades = 0;
      let tWins = 0;
      let tLosses = 0;

      for (const rec of signalHistory) {
        const contrib = getRecordOutcomeContribution(rec);
        if (!contrib.included) continue;
        if (contrib.eventMs < cutoffMs) continue;

        const key = toLocalDateKey(contrib.eventMs);
        const existing = buckets.get(key) ?? {
          dateKey: key,
          trades: 0,
          wins: 0,
          losses: 0,
          bes: 0,
          dailyR: 0,
          dailyPctSum: 0,
        };
        existing.trades += 1;
        if (contrib.outcome === 'win') existing.wins += 1;
        else if (contrib.outcome === 'loss') existing.losses += 1;
        else if (contrib.outcome === 'be') existing.bes += 1;

        existing.dailyR += contrib.rVal;
        // 1R = 1% risk-unit equity impact so equity curve stays realistic & bounded
        existing.dailyPctSum += contrib.rVal * 1.0;
        buckets.set(key, existing);

        tTrades += 1;
        if (contrib.outcome === 'win') tWins += 1;
        if (contrib.outcome === 'loss') tLosses += 1;
      }

      const sortedKeys = Array.from(buckets.keys()).sort();
      const points: DailyPerformancePoint[] = [];

      // Insert baseline start anchor one day prior when only 1 active day exists so D3 renders a clean trend line
      if (sortedKeys.length === 1) {
        const onlyDate = new Date(`${sortedKeys[0]}T00:00:00`);
        const prevDate = new Date(onlyDate.getTime() - 24 * 60 * 60 * 1000);
        const prevKey = toLocalDateKey(prevDate.getTime());
        points.push({
          dateKey: prevKey,
          date: prevDate,
          label: d3.timeFormat('%b %d')(prevDate),
          trades: 0,
          wins: 0,
          losses: 0,
          bes: 0,
          dailyR: 0,
          cumR: 0,
          dailyPct: 0,
          cumReturnPct: 0,
          equity: anchorCapital,
          drawdownPct: 0,
        });
      }

      let runningR = 0;
      let runningEquity = anchorCapital;
      let peakEquity = anchorCapital;
      let maxDd = 0;

      for (const key of sortedKeys) {
        const b = buckets.get(key)!;
        const d = new Date(`${key}T00:00:00`);
        runningR = Number((runningR + b.dailyR).toFixed(2));
        const dailyPct = Number(b.dailyPctSum.toFixed(2));
        runningEquity = Number((runningEquity * (1 + dailyPct / 100)).toFixed(2));
        if (runningEquity > peakEquity) peakEquity = runningEquity;
        const dd =
          peakEquity > 0 ? Number((((peakEquity - runningEquity) / peakEquity) * 100).toFixed(2)) : 0;
        if (dd > maxDd) maxDd = dd;

        const cumReturnPct = Number(
          (((runningEquity - anchorCapital) / anchorCapital) * 100).toFixed(2)
        );

        points.push({
          dateKey: key,
          date: d,
          label: d3.timeFormat('%b %d')(d),
          trades: b.trades,
          wins: b.wins,
          losses: b.losses,
          bes: b.bes,
          dailyR: Number(b.dailyR.toFixed(2)),
          cumR: runningR,
          dailyPct,
          cumReturnPct,
          equity: runningEquity,
          drawdownPct: dd,
        });
      }

      const last = points[points.length - 1];
      return {
        dailySeries: points,
        totalTrades: tTrades,
        totalWins: tWins,
        totalLosses: tLosses,
        maxDrawdownPct: maxDd,
        netCumR: last ? last.cumR : 0,
        netReturnPct: last ? last.cumReturnPct : 0,
      };
    }, [signalHistory, range, anchorCapital]);

  const chartHeight = 236;

  // Render D3 line + gradient area + axes + interactive hover overlay
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (dailySeries.length === 0) return;

    const margin = { top: 18, right: 16, bottom: 28, left: 56 };
    const innerW = Math.max(120, containerWidth - margin.left - margin.right);
    const innerH = Math.max(80, chartHeight - margin.top - margin.bottom);

    const getValue = (p: DailyPerformancePoint): number => {
      if (metricMode === 'equity') return p.equity;
      if (metricMode === 'dailyPct') return p.dailyPct;
      return p.cumR;
    };

    const values = dailySeries.map(getValue);
    const baselineVal = metricMode === 'equity' ? anchorCapital : 0;
    const rawMin = Math.min(...values, baselineVal);
    const rawMax = Math.max(...values, baselineVal);
    const span = rawMax - rawMin;
    const pad = span > 1e-6 ? span * 0.16 : metricMode === 'equity' ? anchorCapital * 0.02 : 1.0;

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(dailySeries, (d) => d.date) as [Date, Date])
      .range([0, innerW]);

    const yScale = d3
      .scaleLinear()
      .domain([rawMin - pad, rawMax + pad])
      .nice(4)
      .range([innerH, 0]);

    const lastVal = values[values.length - 1] ?? baselineVal;
    const isPositive = lastVal >= baselineVal;
    const isDarkTheme = themeMode === 'obsidian' || themeMode === 'monochrome';
    const strokeColor =
      themeMode === 'monochrome'
        ? isPositive
          ? '#ffffff'
          : '#c4c4cc'
        : isPositive
          ? isDarkTheme
            ? '#34d399'
            : '#059669'
          : isDarkTheme
            ? '#f87171'
            : '#dc2626';
    const gridColor =
      themeMode === 'monochrome'
        ? 'rgba(255, 255, 255, 0.12)'
        : isDarkTheme
          ? 'rgba(148, 163, 184, 0.14)'
          : 'rgba(100, 116, 139, 0.18)';
    const textColor =
      themeMode === 'monochrome'
        ? '#d4d4d8'
        : isDarkTheme
          ? '#94a3b8'
          : themeMode === 'parchment'
            ? '#57534e'
            : '#475569';

    const defs = svg.append('defs');
    const gradId = `d3-perf-grad-${metricMode}-${isPositive ? 'pos' : 'neg'}`;
    const gradient = defs
      .append('linearGradient')
      .attr('id', gradId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    gradient.append('stop').attr('offset', '0%').attr('stop-color', strokeColor).attr('stop-opacity', 0.28);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', strokeColor).attr('stop-opacity', 0.01);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Horizontal gridlines
    const yTicks = yScale.ticks(4);
    g.selectAll('.d3-grid-line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '3,3');

    // Zero / Starting Equity baseline reference line
    const zeroY = yScale(baselineVal);
    if (zeroY >= 0 && zeroY <= innerH) {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerW)
        .attr('y1', zeroY)
        .attr('y2', zeroY)
        .attr('stroke', textColor)
        .attr('stroke-opacity', 0.45)
        .attr('stroke-dasharray', '4,4')
        .attr('stroke-width', 1);
    }

    // Y Axis
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(4)
      .tickSize(0)
      .tickPadding(8)
      .tickFormat((v) => {
        const num = Number(v);
        if (metricMode === 'cumR') return `${num >= 0 ? '+' : ''}${num.toFixed(1)}R`;
        if (metricMode === 'dailyPct') return `${num >= 0 ? '+' : ''}${num.toFixed(1)}%`;
        return formatMoney(num, displayCurrency, 0);
      });

    g.append('g')
      .call(yAxis)
      .call((sel) => sel.select('.domain').remove())
      .selectAll('text')
      .attr('fill', textColor)
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace');

    // X Axis
    const tickCount = Math.min(dailySeries.length, containerWidth < 460 ? 4 : 6);
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(tickCount)
      .tickSize(0)
      .tickPadding(10)
      .tickFormat((d) => d3.timeFormat('%b %d')(d as Date));

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').remove())
      .selectAll('text')
      .attr('fill', textColor)
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace');

    // Area + Line
    const areaGen = d3
      .area<DailyPerformancePoint>()
      .x((d) => xScale(d.date))
      .y0(innerH)
      .y1((d) => yScale(getValue(d)))
      .curve(d3.curveMonotoneX);

    const lineGen = d3
      .line<DailyPerformancePoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(getValue(d)))
      .curve(d3.curveMonotoneX);

    g.append('path').datum(dailySeries).attr('fill', `url(#${gradId})`).attr('d', areaGen);

    g.append('path')
      .datum(dailySeries)
      .attr('fill', 'none')
      .attr('stroke', strokeColor)
      .attr('stroke-width', 2.25)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round')
      .attr('d', lineGen);

    // Data point dots
    g.selectAll('.d3-point')
      .data(dailySeries)
      .join('circle')
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScale(getValue(d)))
      .attr('r', (_, idx) => (idx === hoveredIdx ? 5 : dailySeries.length <= 16 ? 3 : 0))
      .attr('fill', strokeColor)
      .attr(
        'stroke',
        themeMode === 'monochrome' ? '#0a0a0b' : isDarkTheme ? '#0f172a' : '#ffffff'
      )
      .attr('stroke-width', 1.8);

    // Crosshair on active hovered point
    if (hoveredIdx !== null && dailySeries[hoveredIdx]) {
      const pt = dailySeries[hoveredIdx];
      const cx = xScale(pt.date);
      const cy = yScale(getValue(pt));

      g.append('line')
        .attr('x1', cx)
        .attr('x2', cx)
        .attr('y1', 0)
        .attr('y2', innerH)
        .attr('stroke', strokeColor)
        .attr('stroke-opacity', 0.45)
        .attr('stroke-dasharray', '3,3');

      g.append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 8)
        .attr('fill', strokeColor)
        .attr('fill-opacity', 0.2);
    }

    // Interactive invisible pointer overlay using d3.bisector
    const bisectDate = d3.bisector<DailyPerformancePoint, Date>((d) => d.date).center;

    g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('pointermove', (event: PointerEvent) => {
        const [mx] = d3.pointer(event);
        const hoveredDate = xScale.invert(mx);
        const idx = bisectDate(dailySeries, hoveredDate);
        const clamped = Math.max(0, Math.min(dailySeries.length - 1, idx));
        setHoveredIdx(clamped);
      })
      .on('pointerleave', () => {
        setHoveredIdx(null);
      });
  }, [dailySeries, containerWidth, metricMode, anchorCapital, displayCurrency, formatMoney, themeMode, hoveredIdx]);

  const activePoint =
    hoveredIdx !== null && dailySeries[hoveredIdx]
      ? dailySeries[hoveredIdx]
      : dailySeries[dailySeries.length - 1] ?? null;

  const decidedTotal = totalWins + totalLosses;
  const winRatePct = decidedTotal > 0 ? Math.round((totalWins / decidedTotal) * 100) : null;

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent-primary)]" />
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)] tracking-tight">
              Daily Signal-Backed Performance Trend
            </h3>
          </div>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            D3 daily equity &amp; R-multiple curve aggregated from verified signal history outcomes
          </p>
        </div>

        {/* Range & Metric Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5">
            {(
              [
                { id: 'cumR', label: 'Cum R' },
                { id: 'equity', label: 'Equity' },
                { id: 'dailyPct', label: 'Daily %' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetricMode(m.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  metricMode === m.id
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-0.5">
            {(['7D', '30D', '90D', 'ALL'] as ChartRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRange(r);
                  setHoveredIdx(null);
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors ${
                  range === r
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Cumulative R
          </div>
          <div
            className={`mt-0.5 text-[16px] font-mono font-bold tabular-nums flex items-center gap-1 ${
              netCumR >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
            }`}
          >
            {netCumR >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {netCumR >= 0 ? '+' : ''}
            {netCumR.toFixed(2)}R
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Trend Return (1R=1%)
          </div>
          <div
            className={`mt-0.5 text-[16px] font-mono font-bold tabular-nums ${
              netReturnPct >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
            }`}
          >
            {netReturnPct >= 0 ? '+' : ''}
            {netReturnPct.toFixed(2)}%
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Tracked Signals
          </div>
          <div className="mt-0.5 text-[16px] font-mono font-bold tabular-nums text-[var(--text-primary)]">
            {totalTrades}{' '}
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              {winRatePct !== null ? `(${winRatePct}% WR)` : '(Live)'}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Max Drawdown
          </div>
          <div className="mt-0.5 text-[16px] font-mono font-bold tabular-nums text-[var(--color-danger)]">
            -{maxDrawdownPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Interactive Day Readout Banner */}
      {activePoint && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50 px-3 py-1.5 text-[11px]">
          <div className="flex items-center gap-2 font-mono tabular-nums text-[var(--text-primary)]">
            <span className="font-semibold">{activePoint.label}</span>
            <span className="text-[var(--text-muted)]">·</span>
            <span>
              {activePoint.trades} signal{activePoint.trades === 1 ? '' : 's'} ({activePoint.wins}W/
              {activePoint.losses}L)
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono tabular-nums">
            <span
              className={
                activePoint.dailyR >= 0
                  ? 'text-[var(--color-success)] font-semibold'
                  : 'text-[var(--color-danger)] font-semibold'
              }
            >
              Day: {activePoint.dailyR >= 0 ? '+' : ''}
              {activePoint.dailyR.toFixed(2)}R
            </span>
            <span className="text-[var(--text-secondary)]">
              Cum: {activePoint.cumR >= 0 ? '+' : ''}
              {activePoint.cumR.toFixed(2)}R
            </span>
            <span className="text-[var(--text-primary)] font-semibold">
              {formatMoney(activePoint.equity, displayCurrency, 0)}
            </span>
          </div>
        </div>
      )}

      {/* D3 SVG Canvas */}
      <div ref={containerRef} className="w-full relative">
        {dailySeries.length === 0 ? (
          <div className="h-[200px] rounded-lg border border-dashed border-[var(--border-subtle)] flex flex-col items-center justify-center text-center px-4">
            <BarChart3 className="w-6 h-6 text-[var(--text-muted)] mb-2" />
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              No filled signal history in the {range} window yet
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-md">
              As ICT Radar and Stock Scanner signals trigger and verify in your ledger, your daily D3 performance curve will plot automatically here.
            </p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={containerWidth}
            height={chartHeight}
            className="block w-full overflow-visible select-none"
            role="img"
            aria-label="Daily portfolio performance trend line chart"
          />
        )}
      </div>
    </div>
  );
};
