import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge } from 'lucide-react';
import { Asset5mVolatility, MarketAsset, ThemeMode } from '../types/market';

interface MomentumGaugeProps {
  asset: MarketAsset;
  volInfo?: Asset5mVolatility;
  themeMode: ThemeMode;
}

interface TickSample {
  price: number;
  ts: number;
}

const WINDOW_MS = 60_000;
const MAX_SAMPLES = 90;

/**
 * Real-Time Price Velocity Momentum Gauge driven by live WebSocket/feed ticks
 * blended with 5-minute structural impulse for the selected asset.
 */
export const MomentumGauge: React.FC<MomentumGaugeProps> = ({
  asset,
  volInfo,
  themeMode,
}) => {
  const samplesRef = useRef<Map<string, TickSample[]>>(new Map());
  const [tickStats, setTickStats] = useState<{
    bpsPerMin: number;
    ticksPerMin: number;
    lastTickDir: 'up' | 'down' | 'flat';
    liveTickCount: number;
  }>({
    bpsPerMin: 0,
    ticksPerMin: 0,
    lastTickDir: 'flat',
    liveTickCount: 0,
  });

  useEffect(() => {
    const now = Date.now();
    const list = samplesRef.current.get(asset.id) ?? [];
    const prev = list[list.length - 1];

    // Record every genuinely new price or live epoch update
    if (!prev || prev.price !== asset.price || now - prev.ts >= 1500) {
      const next = [...list, { price: asset.price, ts: now }]
        .filter((s) => now - s.ts <= WINDOW_MS)
        .slice(-MAX_SAMPLES);
      samplesRef.current.set(asset.id, next);

      const first = next[0];
      const latest = next[next.length - 1];
      const elapsedMin = Math.max(0.08, (latest.ts - first.ts) / 60_000);
      const rawBps =
        first && first.price > 0
          ? ((latest.price - first.price) / first.price) * 10_000
          : 0;
      const bpsPerMin = next.length >= 2 ? rawBps / elapsedMin : 0;
      const ticksPerMin = Math.min(180, Math.round(next.length / Math.max(0.25, elapsedMin)));
      const lastTickDir: 'up' | 'down' | 'flat' =
        prev && latest.price > prev.price
          ? 'up'
          : prev && latest.price < prev.price
            ? 'down'
            : 'flat';

      setTickStats({
        bpsPerMin: Number(bpsPerMin.toFixed(1)),
        ticksPerMin,
        lastTickDir,
        liveTickCount: next.length,
      });
    }
  }, [asset.id, asset.price, asset.updatedAtEpoch]);

  const metrics = useMemo(() => {
    // Baseline impulse from live 5m volatility stream (in bps/min equivalent)
    const pct5m = volInfo?.isSessionOpen ? volInfo.pct5m : 0;
    const baselineBpsPerMin = (pct5m * 100) / 5; // 1% over 5m = 20 bps/min
    const liveWeight = Math.min(0.8, Math.max(0, (tickStats.liveTickCount - 1) / 8));
    const blendedBpsPerMin =
      tickStats.liveTickCount >= 2
        ? tickStats.bpsPerMin * liveWeight + baselineBpsPerMin * (1 - liveWeight)
        : baselineBpsPerMin || (asset.changePercent * 100) / 30;

    // Normalize velocity to -100..+100 using smooth tanh scaling (15 bps/min ≈ ±76)
    const scaleDivisor =
      asset.category === 'commodities-crypto'
        ? 18
        : asset.category === 'forex-yields'
          ? 6
          : 12;
    const score = Math.round(Math.tanh(blendedBpsPerMin / scaleDivisor) * 100);
    const clampedScore = Math.max(-100, Math.min(100, score));
    const needleDeg = (clampedScore / 100) * 86;

    let posture = 'Balanced Tape';
    let toneClass = 'text-[#425466] dark:text-[#9EB5C8]';
    if (clampedScore >= 48) {
      posture = 'Accelerating Bid';
      toneClass = 'text-[#0F7033] dark:text-[#4ADE80]';
    } else if (clampedScore >= 16) {
      posture = 'Steady Upside';
      toneClass = 'text-[#0F7033] dark:text-[#34D399]';
    } else if (clampedScore <= -48) {
      posture = 'Accelerating Offer';
      toneClass = 'text-[#C41C16] dark:text-[#FF6B63]';
    } else if (clampedScore <= -16) {
      posture = 'Steady Downside';
      toneClass = 'text-[#C41C16] dark:text-[#F87171]';
    }

    return {
      score: clampedScore,
      needleDeg,
      blendedBpsPerMin: Number(blendedBpsPerMin.toFixed(1)),
      posture,
      toneClass,
      pct5m,
    };
  }, [asset.category, asset.changePercent, tickStats, volInfo]);

  const isMonochrome = themeMode === 'monochrome';
  const isDark = themeMode === 'obsidian' || isMonochrome;
  const trackStroke = isMonochrome
    ? 'rgba(255, 255, 255, 0.12)'
    : isDark
      ? 'rgba(255,255,255,0.1)'
      : 'rgba(15,23,42,0.1)';
  const needleColor = isMonochrome ? '#FFFFFF' : isDark ? '#F6F4FA' : '#091E36';
  const pivotBg = isMonochrome ? '#0A0A0B' : isDark ? '#171C28' : '#FFFFFF';

  return (
    <section
      data-testid="momentum-velocity-gauge"
      className="rounded-2xl liquid-glass-card p-4 flex flex-col gap-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Gauge className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8] shrink-0" />
          <h2 className="text-sm font-bold text-[#1C1C1E] dark:text-white truncate">
            Momentum Velocity · {asset.shortName}
          </h2>
        </div>
        <span className="text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8] shrink-0">
          {asset.marketSessionOpen ? `${tickStats.ticksPerMin} t/m` : 'Closed'}
        </span>
      </div>

      {/* Semicircular SVG Velocity Dial */}
      <div className="relative flex flex-col items-center pt-1">
        <svg
          viewBox="0 0 200 112"
          className="w-full max-w-[220px] h-auto overflow-visible"
          role="img"
          aria-label={`Momentum velocity gauge for ${asset.shortName}: ${metrics.score}, ${metrics.posture}`}
        >
          {/* Base Neutral Track */}
          <path
            d="M 22 98 A 78 78 0 0 1 178 98"
            fill="none"
            stroke={trackStroke}
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Bearish Zone Arc (Left) */}
          <path
            d="M 22 98 A 78 78 0 0 1 73 25"
            fill="none"
            stroke={
              isMonochrome
                ? 'rgba(113, 113, 122, 0.68)'
                : isDark
                  ? 'rgba(248, 113, 113, 0.65)'
                  : 'rgba(220, 38, 38, 0.58)'
            }
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Neutral Center Arc */}
          <path
            d="M 80 23 A 78 78 0 0 1 120 23"
            fill="none"
            stroke={
              isMonochrome
                ? 'rgba(161, 161, 170, 0.44)'
                : isDark
                  ? 'rgba(148, 163, 184, 0.45)'
                  : 'rgba(100, 116, 139, 0.35)'
            }
            strokeWidth="12"
            strokeLinecap="butt"
          />
          {/* Bullish Zone Arc (Right) */}
          <path
            d="M 127 25 A 78 78 0 0 1 178 98"
            fill="none"
            stroke={
              isMonochrome
                ? 'rgba(255, 255, 255, 0.94)'
                : isDark
                  ? 'rgba(52, 211, 153, 0.68)'
                  : 'rgba(22, 163, 74, 0.62)'
            }
            strokeWidth="12"
            strokeLinecap="round"
          />

          {/* Subtle Scale Ticks */}
          <text x="16" y="111" fontSize="9" className="fill-[#6C6C70] dark:fill-[#9EB5C8] font-mono">
            -100
          </text>
          <text x="96" y="13" fontSize="9" textAnchor="middle" className="fill-[#6C6C70] dark:fill-[#9EB5C8] font-mono">
            0
          </text>
          <text x="184" y="111" fontSize="9" textAnchor="end" className="fill-[#6C6C70] dark:fill-[#9EB5C8] font-mono">
            +100
          </text>

          {/* Animated Compositor Needle */}
          <g
            style={{
              transformOrigin: '100px 98px',
              transform: `rotate(${metrics.needleDeg}deg)`,
              transition: 'transform 340ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <line
              x1="100"
              y1="98"
              x2="100"
              y2="30"
              stroke={needleColor}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <polygon points="100,24 96.5,33 103.5,33" fill={needleColor} />
          </g>
          <circle cx="100" cy="98" r="6" fill={needleColor} />
          <circle cx="100" cy="98" r="2.6" fill={pivotBg} />
        </svg>

        <div className="flex flex-col items-center -mt-1">
          <span className={`text-lg font-extrabold font-mono tabular-nums leading-none ${metrics.toneClass}`}>
            {metrics.score >= 0 ? `+${metrics.score}` : metrics.score}
          </span>
          <span className={`text-[11px] font-bold mt-1 ${metrics.toneClass}`}>
            {metrics.posture}
          </span>
        </div>
      </div>

      {/* Inline Velocity Telemetry Footer */}
      <div className="pt-2 border-t border-black/8 dark:border-white/10 grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
        <div>
          <span className="block text-[9.5px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8]">
            Velocity
          </span>
          <span className="text-[11px] font-bold text-[#1C1C1E] dark:text-white">
            {metrics.blendedBpsPerMin >= 0 ? '+' : ''}
            {metrics.blendedBpsPerMin} bps/m
          </span>
        </div>
        <div>
          <span className="block text-[9.5px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8]">
            5m Move
          </span>
          <span
            className={`text-[11px] font-bold ${
              metrics.pct5m > 0
                ? 'text-[#0F7033] dark:text-[#4ADE80]'
                : metrics.pct5m < 0
                  ? 'text-[#C41C16] dark:text-[#FF6B63]'
                  : 'text-[#1C1C1E] dark:text-white'
            }`}
          >
            {metrics.pct5m >= 0 ? '+' : ''}
            {metrics.pct5m.toFixed(2)}%
          </span>
        </div>
        <div>
          <span className="block text-[9.5px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8]">
            Last Tick
          </span>
          <span className="text-[11px] font-bold text-[#1C1C1E] dark:text-white">
            {tickStats.lastTickDir === 'up'
              ? '▲ Uptick'
              : tickStats.lastTickDir === 'down'
                ? '▼ Downtick'
                : '• Steady'}
          </span>
        </div>
      </div>
    </section>
  );
};
