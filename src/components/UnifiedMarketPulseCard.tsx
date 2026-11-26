import React, { useEffect, useMemo, useState } from 'react';
import { arc as d3Arc, scaleLinear } from 'd3';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Layers,
  Minus,
  Newspaper,
  TrendingUp,
} from 'lucide-react';
import {
  AppRoute,
  MarketAsset,
  MarketDepthLevel,
  MarketDepthSnapshot,
  NewsStory,
  ThemeMode,
  UnifiedMarketPulse,
} from '../types/market';
import {
  analyzeHeadlineSentiment,
  HeadlinePolarity,
} from '../utils/headlineSentiment';
import { SignalBadge } from './MarketUiPrimitives';

interface YieldCurveInfo {
  spreadBps: number;
  posture: string;
  us10yVal: string;
  us30yVal: string;
  id10yVal: string;
  idUsSpreadBps: number;
}

interface UnifiedMarketPulseCardProps {
  pulse: UnifiedMarketPulse;
  activeAsset: MarketAsset;
  stories: NewsStory[];
  themeMode: ThemeMode;
  yieldCurveInfo?: YieldCurveInfo;
  onOpenStory?: (story: NewsStory) => void;
  onNavigate?: (route: AppRoute) => void;
}

type PulseSectionTab = 'overview' | 'depth' | 'drivers';
type HeadlineFilterView = 'all' | 'bullish' | 'bearish';

function formatDepthPrice(
  value: number,
  decimals: number,
  prefix = '',
  suffix = ''
): string {
  if (!Number.isFinite(value)) return '—';
  return `${prefix}${value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
}

function formatCompactSize(size: number, decimals: number): string {
  if (!Number.isFinite(size)) return '—';
  if (size >= 1000) {
    return size.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
  }
  if (size >= 10) {
    return size.toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    });
  }
  return size.toLocaleString('en-US', {
    minimumFractionDigits: decimals >= 3 ? 2 : 3,
    maximumFractionDigits: 3,
  });
}

function buildImmediateSeedDepth(asset: MarketAsset): MarketDepthSnapshot {
  const parseNum = (raw: string, fallback: number): number => {
    const cleaned = raw.replace(/[^0-9.-]/g, '');
    const v = Number(cleaned);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  const price = asset.price > 0 ? asset.price : 100;
  const dec = asset.decimals;
  const dayHigh = Math.max(price, parseNum(asset.dayHigh, price * 1.005));
  const dayLow = Math.min(price, parseNum(asset.dayLow, price * 0.995));
  const sup = Math.min(dayLow, parseNum(asset.support, price * 0.99));
  const res = Math.max(dayHigh, parseNum(asset.resistance, price * 1.01));
  const spanDown = Math.max(price * 0.002, price - sup);
  const spanUp = Math.max(price * 0.002, res - price);
  const spreadAbs = Math.max(Math.pow(10, -dec), ((spanDown + spanUp) / 2) * 0.025);
  const bestBid = Number((price - spreadAbs / 2).toFixed(dec));
  const bestAsk = Number((price + spreadAbs / 2).toFixed(dec));

  const bids: MarketDepthLevel[] = [];
  const asks: MarketDepthLevel[] = [];
  let cumBid = 0;
  let cumAsk = 0;

  for (let i = 0; i < 8; i++) {
    const frac = i / 7;
    const bPx = Number((bestBid - frac * spanDown).toFixed(dec));
    const bSize = Number((420 * (0.85 + (i === 5 ? 0.9 : (1 - frac) * 0.4))).toFixed(2));
    cumBid += bSize;
    bids.push({
      price: bPx,
      size: bSize,
      total: Number(cumBid.toFixed(2)),
      pctOfMax: 0,
      isWall: i === 5,
      tag: i === 0 ? 'Best Bid' : i === 5 ? 'S1 Support' : undefined,
    });

    const aPx = Number((bestAsk + frac * spanUp).toFixed(dec));
    const aSize = Number((400 * (0.85 + (i === 5 ? 0.9 : (1 - frac) * 0.4))).toFixed(2));
    cumAsk += aSize;
    asks.push({
      price: aPx,
      size: aSize,
      total: Number(cumAsk.toFixed(2)),
      pctOfMax: 0,
      isWall: i === 5,
      tag: i === 0 ? 'Best Ask' : i === 5 ? 'R1 Resist' : undefined,
    });
  }
  const maxCum = Math.max(cumBid, cumAsk, 1);
  bids.forEach((b) => {
    b.pctOfMax = Math.max(6, Math.round((b.total / maxCum) * 100));
  });
  asks.forEach((a) => {
    a.pctOfMax = Math.max(6, Math.round((a.total / maxCum) * 100));
  });
  const totalVol = cumBid + cumAsk || 1;
  const bidRatioPct = Number(((cumBid / totalVol) * 100).toFixed(1));

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    decimals: dec,
    currencyPrefix: asset.currencyPrefix,
    unitSuffix: asset.unitSuffix,
    midPrice: Number(price.toFixed(dec)),
    bestBid,
    bestAsk,
    spreadAbs: Number(spreadAbs.toFixed(dec)),
    spreadPct: Number(((spreadAbs / price) * 100).toFixed(4)),
    bidRatioPct,
    askRatioPct: Number((100 - bidRatioPct).toFixed(1)),
    imbalanceLabel: 'Balanced Two-Way Book',
    sourceKind: asset.id === 'BTCUSD' || asset.id === 'ETHUSD' ? 'live-l2' : 'session-liquidity',
    sourceLabel:
      asset.id === 'BTCUSD' || asset.id === 'ETHUSD'
        ? 'Connecting Live L2 Book...'
        : 'Session Liquidity Profile',
    buyWallPrice: bids[5]?.price ?? bestBid,
    buyWallSize: bids[5]?.size ?? 0,
    sellWallPrice: asks[5]?.price ?? bestAsk,
    sellWallSize: asks[5]?.size ?? 0,
    bids,
    asks,
    updatedAt: new Date().toISOString(),
  };
}

export const UnifiedMarketPulseCard: React.FC<UnifiedMarketPulseCardProps> = React.memo(
  ({ pulse, activeAsset, stories, themeMode, yieldCurveInfo, onOpenStory, onNavigate }) => {
    const [activeTab, setActiveTab] = useState<PulseSectionTab>('overview');
    const [headlineFilter, setHeadlineFilter] = useState<HeadlineFilterView>('all');
    const [depth, setDepth] = useState<MarketDepthSnapshot | null>(null);
    const [hoveredLevel, setHoveredLevel] = useState<{
      side: 'bid' | 'ask';
      level: MarketDepthLevel;
    } | null>(null);

    const isDarkSurface = themeMode === 'obsidian';
    const headlineAnalysis = useMemo(() => analyzeHeadlineSentiment(stories), [stories]);

    const visibleHeadlines = useMemo(() => {
      if (headlineFilter === 'all') return headlineAnalysis.scoredHeadlines.slice(0, 3);
      const target: HeadlinePolarity = headlineFilter;
      return headlineAnalysis.scoredHeadlines
        .filter((h) => h.polarity === target)
        .slice(0, 3);
    }, [headlineAnalysis.scoredHeadlines, headlineFilter]);

    useEffect(() => {
      let active = true;
      setHoveredLevel(null);

      const loadDepth = async () => {
        try {
          const res = await fetch(
            `/api/market/depth?id=${encodeURIComponent(activeAsset.id)}`
          );
          if (!res.ok) return;
          const json = (await res.json()) as MarketDepthSnapshot;
          if (active && json && json.assetId === activeAsset.id) {
            setDepth(json);
          }
        } catch {
          // Retain fallback snapshot gracefully
        }
      };

      void loadDepth();
      const intervalMs =
        activeAsset.id === 'BTCUSD' || activeAsset.id === 'ETHUSD'
          ? 3000
          : activeAsset.marketSessionOpen
            ? 6500
            : 30_000;
      const timer = window.setInterval(() => {
        void loadDepth();
      }, intervalMs);

      return () => {
        active = false;
        window.clearInterval(timer);
      };
    }, [activeAsset.id, activeAsset.marketSessionOpen]);

    const activeDepth = useMemo(() => {
      if (depth && depth.assetId === activeAsset.id) return depth;
      return buildImmediateSeedDepth(activeAsset);
    }, [depth, activeAsset]);

    const clampedComposite = Math.max(0, Math.min(100, pulse.compositeScore));

    // D3 Semicircular Composite Gauge Geometry
    const { backgroundPath, segmentPaths, needleCoords } = useMemo(() => {
      const innerR = 58;
      const outerR = 70;
      const angleScale = scaleLinear()
        .domain([0, 100])
        .range([-Math.PI / 2, Math.PI / 2]);

      const arcGen = d3Arc<void>()
        .innerRadius(innerR)
        .outerRadius(outerR)
        .cornerRadius(4);

      const bg = arcGen.startAngle(-Math.PI / 2).endAngle(Math.PI / 2)() ?? '';

      const zones = [
        { from: 0, to: 34, color: isDarkSurface ? '#FF6B63' : '#DC2626' },
        { from: 36, to: 46, color: isDarkSurface ? '#FB923C' : '#EA580C' },
        { from: 48, to: 52, color: isDarkSurface ? '#FBBF24' : '#CA8A04' },
        { from: 54, to: 64, color: isDarkSurface ? '#34D399' : '#22C55E' },
        { from: 66, to: 100, color: isDarkSurface ? '#4ADE80' : '#15803D' },
      ];

      const paths = zones.map((z) => ({
        d:
          d3Arc<void>()
            .innerRadius(innerR + 1)
            .outerRadius(outerR - 1)
            .cornerRadius(3)
            .startAngle(angleScale(z.from))
            .endAngle(angleScale(z.to))() ?? '',
        color: z.color,
      }));

      const theta = angleScale(clampedComposite);
      const cx = 110;
      const cy = 92;
      const tipLen = innerR - 6;
      const tailLen = 9;

      return {
        backgroundPath: bg,
        segmentPaths: paths,
        needleCoords: {
          cx,
          cy,
          tipX: cx + tipLen * Math.sin(theta),
          tipY: cy - tipLen * Math.cos(theta),
          tailX: cx - tailLen * Math.sin(theta),
          tailY: cy + tailLen * Math.cos(theta),
        },
      };
    }, [clampedComposite, isDarkSurface]);

    // Depth Curve Geometry
    const curveGeometry = useMemo(() => {
      const bidsAsc = [...activeDepth.bids].sort((a, b) => a.price - b.price);
      const asksAsc = [...activeDepth.asks].sort((a, b) => a.price - b.price);
      if (bidsAsc.length === 0 || asksAsc.length === 0) return null;

      const minPx = bidsAsc[0].price;
      const maxPx = asksAsc[asksAsc.length - 1].price;
      const pxSpan = Math.max(1e-6, maxPx - minPx);
      const maxTotal = Math.max(
        1e-6,
        bidsAsc[0].total,
        asksAsc[asksAsc.length - 1].total
      );

      const W = 540;
      const H = 148;
      const PAD_X = 10;
      const PAD_TOP = 12;
      const PAD_BOT = 22;
      const plotW = W - PAD_X * 2;
      const plotH = H - PAD_TOP - PAD_BOT;
      const baseY = PAD_TOP + plotH;

      const mapX = (px: number) =>
        PAD_X + Math.max(0, Math.min(1, (px - minPx) / pxSpan)) * plotW;
      const mapY = (tot: number) =>
        baseY - Math.max(0.03, Math.min(1, tot / maxTotal)) * plotH;

      const bidPoints = bidsAsc.map((b) => ({ x: mapX(b.price), y: mapY(b.total), level: b }));
      let bidLinePath = `M ${bidPoints[0].x.toFixed(1)} ${bidPoints[0].y.toFixed(1)}`;
      for (let i = 1; i < bidPoints.length; i++) {
        bidLinePath += ` L ${bidPoints[i].x.toFixed(1)} ${bidPoints[i - 1].y.toFixed(1)}`;
        bidLinePath += ` L ${bidPoints[i].x.toFixed(1)} ${bidPoints[i].y.toFixed(1)}`;
      }
      const bidAreaPath = `${bidLinePath} L ${bidPoints[bidPoints.length - 1].x.toFixed(
        1
      )} ${baseY.toFixed(1)} L ${bidPoints[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;

      const askPoints = asksAsc.map((a) => ({ x: mapX(a.price), y: mapY(a.total), level: a }));
      let askLinePath = `M ${askPoints[0].x.toFixed(1)} ${askPoints[0].y.toFixed(1)}`;
      for (let i = 1; i < askPoints.length; i++) {
        askLinePath += ` L ${askPoints[i].x.toFixed(1)} ${askPoints[i - 1].y.toFixed(1)}`;
        askLinePath += ` L ${askPoints[i].x.toFixed(1)} ${askPoints[i].y.toFixed(1)}`;
      }
      const askAreaPath = `${askLinePath} L ${askPoints[askPoints.length - 1].x.toFixed(
        1
      )} ${baseY.toFixed(1)} L ${askPoints[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;

      return {
        W,
        H,
        baseY,
        PAD_TOP,
        bidLinePath,
        bidAreaPath,
        askLinePath,
        askAreaPath,
        midX: mapX(activeDepth.midPrice),
        buyWallX: mapX(activeDepth.buyWallPrice),
        sellWallX: mapX(activeDepth.sellWallPrice),
        allPlotPoints: [
          ...bidPoints.map((p) => ({ side: 'bid' as const, ...p })),
          ...askPoints.map((p) => ({ side: 'ask' as const, ...p })),
        ],
      };
    }, [activeDepth]);

    const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
      if (!curveGeometry) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      const svgX = ((e.clientX - rect.left) / rect.width) * curveGeometry.W;
      let nearest = curveGeometry.allPlotPoints[0];
      let minDist = Infinity;
      for (const pt of curveGeometry.allPlotPoints) {
        const d = Math.abs(pt.x - svgX);
        if (d < minDist) {
          minDist = d;
          nearest = pt;
        }
      }
      if (nearest) {
        setHoveredLevel({ side: nearest.side, level: nearest.level });
      }
    };

    const stanceTone =
      pulse.polarity === 'risk-on'
        ? 'text-[#0D6B31] dark:text-[#4ADE80]'
        : pulse.polarity === 'risk-off'
          ? 'text-[#B91C1C] dark:text-[#FF6B63]'
          : 'text-[#9A4E00] dark:text-[#FBBF24]';

    const hubFill =
      pulse.polarity === 'risk-on'
        ? isDarkSurface
          ? '#4ADE80'
          : '#16A34A'
        : pulse.polarity === 'risk-off'
          ? isDarkSurface
            ? '#FF6B63'
            : '#DC2626'
          : isDarkSurface
            ? '#FBBF24'
            : '#D97706';

    const dec = activeDepth.decimals;
    const pfx = activeDepth.currencyPrefix ?? '';
    const sfx = activeDepth.unitSuffix ?? '';

    const activeTechScore = Math.max(
      0,
      Math.min(100, Math.round(50 + Math.max(-45, Math.min(45, pulse.activeSignal.score))))
    );

    return (
      <section
        data-testid="unified-market-pulse-card"
        aria-label="Unified Market Pulse, Sentiment & Order Book"
        className="rounded-2xl liquid-glass-card p-4 flex flex-col gap-3.5"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-black/8 dark:border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0066CC] dark:text-[#38BDF8] shrink-0" />
              <h2 className="text-sm font-bold text-[#151821] dark:text-white truncate">
                Market Pulse &amp; Sentiment
              </h2>
            </div>
            <p className="text-[11px] text-[#454954] dark:text-[#9EB5C8] truncate mt-0.5">
              Unified Regime, Fear &amp; Greed, Headlines, Technicals &amp; Depth
            </p>
          </div>
          <SignalBadge signal={pulse.activeSignal} compact />
        </div>

        {/* Unified Composite Semicircular Dial */}
        <div className="flex flex-col items-center">
          <svg
            viewBox="0 0 220 110"
            className="w-full max-w-[228px] h-auto overflow-visible"
            role="img"
            aria-label={`Unified Market Pulse score ${clampedComposite} out of 100: ${pulse.stanceLabel}`}
          >
            <g transform="translate(110, 92)">
              <path
                d={backgroundPath}
                fill={isDarkSurface ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}
              />
              {segmentPaths.map((seg, idx) => (
                <path key={idx} d={seg.d} fill={seg.color} opacity={0.92} />
              ))}
            </g>

            <line
              x1={needleCoords.tailX}
              y1={needleCoords.tailY}
              x2={needleCoords.tipX}
              y2={needleCoords.tipY}
              stroke={isDarkSurface ? '#F8FAFC' : '#151821'}
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <circle
              cx={needleCoords.cx}
              cy={needleCoords.cy}
              r="5.5"
              fill={hubFill}
              stroke={isDarkSurface ? '#0B1019' : '#FFFFFF'}
              strokeWidth="2"
            />

            <text
              x="24"
              y="106"
              className="fill-[#454954] dark:fill-[#B4C6DA] text-[9px] font-bold"
            >
              Fear / Risk-Off
            </text>
            <text
              x="196"
              y="106"
              textAnchor="end"
              className="fill-[#454954] dark:fill-[#B4C6DA] text-[9px] font-bold"
            >
              Greed / Risk-On
            </text>
          </svg>

          <div className="-mt-1.5 flex items-baseline gap-2">
            <span
              data-testid="unified-pulse-score"
              className="text-2xl font-extrabold font-mono tabular-nums text-[#151821] dark:text-white"
            >
              {clampedComposite}
            </span>
            <span
              data-testid="unified-pulse-stance"
              className={`text-xs font-extrabold ${stanceTone}`}
            >
              {pulse.stanceLabel}
            </span>
          </div>
          <p className="text-[11px] text-[#454954] dark:text-[#B4C6DA] text-center mt-0.5 tabular-nums">
            {pulse.driver}
          </p>
        </div>

        {/* 4-Pillar Composite Hairline Grid */}
        <div className="grid grid-cols-4 gap-2 py-2.5 border-y border-black/8 dark:border-white/10 text-center font-mono tabular-nums">
          <div>
            <span className="block font-sans text-[10px] font-semibold text-[#6C6C70] dark:text-[#9EB5C8]">
              Risk-On
            </span>
            <span className="text-xs font-extrabold text-[#151821] dark:text-white">
              {pulse.riskRegime.score}
            </span>
          </div>
          <div>
            <span className="block font-sans text-[10px] font-semibold text-[#6C6C70] dark:text-[#9EB5C8]">
              Fear/Greed
            </span>
            <span className="text-xs font-extrabold text-[#151821] dark:text-white">
              {pulse.fearGreedScore}
            </span>
          </div>
          <div>
            <span className="block font-sans text-[10px] font-semibold text-[#6C6C70] dark:text-[#9EB5C8]">
              Headlines
            </span>
            <span className="text-xs font-extrabold text-[#151821] dark:text-white">
              {headlineAnalysis.score}
            </span>
          </div>
          <div>
            <span className="block font-sans text-[10px] font-semibold text-[#6C6C70] dark:text-[#9EB5C8]">
              {activeAsset.shortName}
            </span>
            <span className="text-xs font-extrabold text-[#151821] dark:text-white">
              {activeTechScore}
            </span>
          </div>
        </div>

        {/* Internal Consolidated Switcher (Zero Extra Cards) */}
        <div
          role="tablist"
          aria-label="Market Pulse Views"
          className="grid grid-cols-3 gap-1 p-0.5 rounded-xl bg-black/5 dark:bg-white/6 border border-black/8 dark:border-white/10"
        >
          {(
            [
              { id: 'overview', label: 'Overview & S/R' },
              { id: 'depth', label: 'Depth Book' },
              { id: 'drivers', label: 'News & Vol' },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-pulse-tab={tab.id}
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-[#1C1C1E] dark:bg-white text-white dark:text-[#111318] shadow-xs'
                    : 'text-[#4A4D57] dark:text-[#9EB5C8] hover:text-[#1C1C1E] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: OVERVIEW, KEY SUPPORT/RESISTANCE, YIELD SPREAD, BOOK IMBALANCE & THESIS */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-3">
            {/* Active Instrument Support & Resistance */}
            <div className="grid grid-cols-2 gap-3 pb-2.5 border-b border-black/8 dark:border-white/10">
              <div>
                <span className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] font-semibold">
                  Key Support ({activeAsset.symbol})
                </span>
                <p className="text-sm font-extrabold text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                  {activeAsset.support}
                </p>
                <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] leading-tight block">
                  {activeAsset.supportNote}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] font-semibold">
                  Key Resistance ({activeAsset.symbol})
                </span>
                <p className="text-sm font-extrabold text-[#1C1C1E] dark:text-white tabular-nums font-mono mt-0.5">
                  {activeAsset.resistance}
                </p>
                <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] leading-tight block">
                  {activeAsset.resistanceNote}
                </span>
              </div>
            </div>

            {/* Order-Book Pressure Snapshot */}
            <div className="flex flex-col gap-1.5 pb-2.5 border-b border-black/8 dark:border-white/10">
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                <span className="font-bold text-[#0F7033] dark:text-[#4ADE80]">
                  Bid {activeDepth.bidRatioPct.toFixed(1)}%
                </span>
                <span className="font-sans font-bold text-[#1C1C1E] dark:text-white">
                  {activeDepth.imbalanceLabel}
                </span>
                <span className="font-bold text-[#C41C16] dark:text-[#FF6B63]">
                  Ask {activeDepth.askRatioPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-black/8 dark:bg-white/10">
                <div
                  className="h-full bg-[#16A34A] dark:bg-[#4ADE80] transition-all duration-300"
                  style={{ width: `${activeDepth.bidRatioPct}%` }}
                />
                <div
                  className="h-full bg-[#DC2626] dark:bg-[#FF6B63] transition-all duration-300"
                  style={{ width: `${activeDepth.askRatioPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8]">
                <span>Buy Wall {formatDepthPrice(activeDepth.buyWallPrice, dec, pfx, sfx)}</span>
                <span>Spread {activeDepth.spreadPct.toFixed(3)}%</span>
                <span>Sell Wall {formatDepthPrice(activeDepth.sellWallPrice, dec, pfx, sfx)}</span>
              </div>
            </div>

            {/* Sector Stance Summary */}
            <div className="divide-y divide-black/6 dark:divide-white/8 text-[11px]">
              {pulse.riskRegime.sectors.map((sec) => {
                const isPos = sec.avgMovePct >= 0;
                return (
                  <div
                    key={sec.id}
                    className="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-[#151821] dark:text-white truncate">
                        {sec.label}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8]">
                        {sec.weightPct}%
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 font-mono font-bold tabular-nums shrink-0 ${
                        isPos
                          ? 'text-[#0D6B31] dark:text-[#4ADE80]'
                          : 'text-[#B91C1C] dark:text-[#FF6B63]'
                      }`}
                    >
                      {isPos ? (
                        <ArrowUp className="w-2.5 h-2.5" />
                      ) : sec.avgMovePct < 0 ? (
                        <ArrowDown className="w-2.5 h-2.5" />
                      ) : (
                        <Minus className="w-2.5 h-2.5" />
                      )}
                      {isPos ? '+' : ''}
                      {sec.avgMovePct.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>

            {activeAsset.isYield && yieldCurveInfo && (
              <div className="pt-2.5 border-t border-black/8 dark:border-white/10 flex flex-col gap-1">
                {activeAsset.id === 'ID10Y' ? (
                  <>
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-[#1C1C1E] dark:text-white flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#38BDF8]" />
                        ID–US 10Y Spread
                      </span>
                      <span className="font-bold font-mono tabular-nums text-[#0071E3] dark:text-[#38BDF8]">
                        {yieldCurveInfo.idUsSpreadBps >= 0 ? '+' : ''}
                        {yieldCurveInfo.idUsSpreadBps.toFixed(1)} bps
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">
                      SBN 10Y ({yieldCurveInfo.id10yVal}%) vs US 10Y ({yieldCurveInfo.us10yVal}%).
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-[#1C1C1E] dark:text-white flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#38BDF8]" />
                        30Y–10Y Spread
                      </span>
                      <span
                        className={`font-bold font-mono tabular-nums ${
                          yieldCurveInfo.spreadBps >= 0
                            ? 'text-[#16803C] dark:text-[#4ADE80]'
                            : 'text-[#D7261C] dark:text-[#FF6B63]'
                        }`}
                      >
                        {yieldCurveInfo.spreadBps >= 0 ? '+' : ''}
                        {yieldCurveInfo.spreadBps.toFixed(1)} bps ({yieldCurveInfo.posture})
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">
                      US 30Y ({yieldCurveInfo.us30yVal}%) vs US 10Y ({yieldCurveInfo.us10yVal}%).
                    </p>
                  </>
                )}
              </div>
            )}

            <div className="pt-2.5 border-t border-black/8 dark:border-white/10">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] mb-1">
                Session Technical Thesis
              </h3>
              <p className="text-xs text-[#1C1C1E] dark:text-[#D5E3EE] leading-relaxed">
                {activeAsset.commentary}
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: ORDER BOOK & CUMULATIVE DEPTH CURVE (WITH SWIPE GUARD) */}
        {activeTab === 'depth' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#1C1C1E] dark:text-white">
                <Layers className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#38BDF8]" />
                {activeDepth.symbol} · {activeDepth.sourceLabel}
              </span>
              <span className="font-mono tabular-nums">
                Spread {formatDepthPrice(activeDepth.spreadAbs, dec, pfx, sfx)} ({activeDepth.spreadPct.toFixed(3)}%)
              </span>
            </div>

            {curveGeometry && (
              <div
                data-no-view-swipe="true"
                className="relative pt-2 border-t border-black/8 dark:border-white/10"
              >
                <div className="flex items-center justify-between text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] mb-1 min-h-[18px]">
                  <span>Cumulative Depth Curve</span>
                  {hoveredLevel ? (
                    <span className="font-mono tabular-nums font-semibold text-[#1C1C1E] dark:text-white">
                      <span
                        className={
                          hoveredLevel.side === 'bid'
                            ? 'text-[#0F7033] dark:text-[#4ADE80]'
                            : 'text-[#C41C16] dark:text-[#FF6B63]'
                        }
                      >
                        {hoveredLevel.side.toUpperCase()}
                      </span>{' '}
                      {formatDepthPrice(hoveredLevel.level.price, dec, pfx, sfx)} · Size{' '}
                      {formatCompactSize(hoveredLevel.level.size, dec)}
                    </span>
                  ) : (
                    <span className="text-[10px]">Inspect bids &amp; asks</span>
                  )}
                </div>

                <svg
                  viewBox={`0 0 ${curveGeometry.W} ${curveGeometry.H}`}
                  className="w-full h-[132px] overflow-visible select-none cursor-crosshair"
                  onPointerMove={handleSvgPointerMove}
                  onPointerLeave={() => setHoveredLevel(null)}
                >
                  <line
                    x1={10}
                    y1={curveGeometry.baseY}
                    x2={curveGeometry.W - 10}
                    y2={curveGeometry.baseY}
                    stroke="currentColor"
                    className="text-black/15 dark:text-white/15"
                    strokeWidth={1}
                  />
                  <path
                    d={curveGeometry.bidAreaPath}
                    fill={isDarkSurface ? 'rgba(74,222,128,0.22)' : 'rgba(22,163,74,0.18)'}
                  />
                  <path
                    d={curveGeometry.bidLinePath}
                    fill="none"
                    stroke={isDarkSurface ? '#4ADE80' : '#16803C'}
                    strokeWidth={2}
                  />
                  <path
                    d={curveGeometry.askAreaPath}
                    fill={isDarkSurface ? 'rgba(255,107,99,0.22)' : 'rgba(220,38,38,0.18)'}
                  />
                  <path
                    d={curveGeometry.askLinePath}
                    fill="none"
                    stroke={isDarkSurface ? '#FF6B63' : '#C41C16'}
                    strokeWidth={2}
                  />
                  <line
                    x1={curveGeometry.midX}
                    y1={curveGeometry.PAD_TOP}
                    x2={curveGeometry.midX}
                    y2={curveGeometry.baseY}
                    stroke="currentColor"
                    className="text-[#4A4D57]/55 dark:text-[#9EB5C8]/55"
                    strokeDasharray="3 3"
                    strokeWidth={1.2}
                  />
                  <text
                    x={curveGeometry.midX}
                    y={curveGeometry.baseY + 13}
                    textAnchor="middle"
                    className="fill-[#1C1C1E] dark:fill-white text-[9.5px] font-mono font-bold"
                  >
                    Mid {formatDepthPrice(activeDepth.midPrice, dec, pfx, sfx)}
                  </text>
                </svg>
              </div>
            )}

            {/* Compact Order Ladder (Top 6 Bids & Asks) */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-black/8 dark:border-white/10 text-[11px] font-mono tabular-nums">
              <div>
                <div className="flex justify-between text-[10px] font-sans font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] pb-1 border-b border-black/8 dark:border-white/10">
                  <span>Bid</span>
                  <span>Size</span>
                </div>
                <div className="divide-y divide-black/5 dark:divide-white/5">
                  {activeDepth.bids.slice(0, 6).map((lvl, idx) => (
                    <div
                      key={`${lvl.price}-${idx}`}
                      className="relative flex items-center justify-between py-1 px-1"
                    >
                      <div
                        className="absolute inset-y-0 right-0 pointer-events-none"
                        style={{
                          width: `${lvl.pctOfMax}%`,
                          backgroundColor: isDarkSurface
                            ? 'rgba(74, 222, 128, 0.13)'
                            : 'rgba(22, 163, 74, 0.10)',
                        }}
                      />
                      <span className="relative z-10 font-bold text-[#0F7033] dark:text-[#4ADE80]">
                        {formatDepthPrice(lvl.price, dec, pfx, sfx)}
                      </span>
                      <span className="relative z-10 text-[#1C1C1E] dark:text-white">
                        {formatCompactSize(lvl.size, dec)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-sans font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] pb-1 border-b border-black/8 dark:border-white/10">
                  <span>Ask</span>
                  <span>Size</span>
                </div>
                <div className="divide-y divide-black/5 dark:divide-white/5">
                  {activeDepth.asks.slice(0, 6).map((lvl, idx) => (
                    <div
                      key={`${lvl.price}-${idx}`}
                      className="relative flex items-center justify-between py-1 px-1"
                    >
                      <div
                        className="absolute inset-y-0 left-0 pointer-events-none"
                        style={{
                          width: `${lvl.pctOfMax}%`,
                          backgroundColor: isDarkSurface
                            ? 'rgba(255, 107, 99, 0.13)'
                            : 'rgba(220, 38, 38, 0.10)',
                        }}
                      />
                      <span className="relative z-10 font-bold text-[#C41C16] dark:text-[#FF6B63]">
                        {formatDepthPrice(lvl.price, dec, pfx, sfx)}
                      </span>
                      <span className="relative z-10 text-[#1C1C1E] dark:text-white">
                        {formatCompactSize(lvl.size, dec)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: HEADLINE NLP WIRE SENTIMENT + VOLATILITY TELEMETRY */}
        {activeTab === 'drivers' && (
          <div className="flex flex-col gap-3">
            {/* Headline Sentiment Summary + Filter Tabs */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                <Newspaper className="w-3.5 h-3.5 text-[#005BB8] dark:text-[#38BDF8]" />
                <span className="font-bold text-[#1C1C1E] dark:text-white">
                  {headlineAnalysis.regime}
                </span>
                <span className="font-mono text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] tabular-nums">
                  ({headlineAnalysis.bullishCount}B / {headlineAnalysis.bearishCount}S)
                </span>
              </div>

              <div
                role="tablist"
                aria-label="Filter parsed headlines"
                className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-black/5 dark:bg-white/6"
              >
                {(
                  [
                    { id: 'all', label: 'Top' },
                    { id: 'bullish', label: 'Bull' },
                    { id: 'bearish', label: 'Bear' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={headlineFilter === tab.id}
                    onClick={() => setHeadlineFilter(tab.id)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                      headlineFilter === tab.id
                        ? 'bg-[#1C1C1E] dark:bg-white text-white dark:text-[#111318]'
                        : 'text-[#4A4D57] dark:text-[#B4B8C4]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-black/6 dark:divide-white/8">
              {visibleHeadlines.length === 0 ? (
                <p className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] py-1">
                  No matching headlines in current batch.
                </p>
              ) : (
                visibleHeadlines.map((item) => (
                  <button
                    key={item.story.id}
                    type="button"
                    onClick={() => onOpenStory?.(item.story)}
                    className="w-full text-left py-1.5 first:pt-0 flex items-start justify-between gap-2 hover:opacity-85 transition-opacity"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-[#1C1C1E] dark:text-white line-clamp-1">
                        {item.story.headline}
                      </div>
                      <div className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] truncate">
                        {item.story.publisher} · {item.story.timeAgo}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-extrabold shrink-0 ${
                        item.polarity === 'bullish'
                          ? 'text-[#0F7033] dark:text-[#4ADE80]'
                          : item.polarity === 'bearish'
                            ? 'text-[#C41C16] dark:text-[#FF6B63]'
                            : 'text-[#6C6C70] dark:text-[#9EB5C8]'
                      }`}
                    >
                      {item.polarity === 'bullish'
                        ? 'Bull'
                        : item.polarity === 'bearish'
                          ? 'Bear'
                          : 'Flat'}
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Volatility & Dispersion Breakdown */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2.5 border-t border-black/8 dark:border-white/10 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-[#454954] dark:text-[#9EB5C8]">Avg 5m Range</span>
                <span className="font-mono font-bold tabular-nums text-[#151821] dark:text-white">
                  {pulse.volatilityFearGreed.avg5mRangePct.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#454954] dark:text-[#9EB5C8]">5m Dispersion</span>
                <span className="font-mono font-bold tabular-nums text-[#151821] dark:text-white">
                  {pulse.volatilityFearGreed.dispersionSigma.toFixed(2)}σ
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#454954] dark:text-[#9EB5C8]">Intraday Band</span>
                <span className="font-mono font-bold tabular-nums text-[#151821] dark:text-white">
                  {pulse.volatilityFearGreed.intradayRangePct.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#454954] dark:text-[#9EB5C8]">Down Skew</span>
                <span className="font-mono font-bold tabular-nums text-[#151821] dark:text-white">
                  {pulse.volatilityFearGreed.downsideSkewPct}%
                </span>
              </div>
            </div>

            {onNavigate && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('news')}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#005BB8] dark:text-[#38BDF8] hover:underline"
                >
                  <span>Open News Wire</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    );
  }
);
