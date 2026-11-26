import React, { useMemo } from 'react';
import {
  ArrowRight,
  Compass,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  AppRoute,
  MarketIntelligenceResponse,
  UnifiedCatalystDriver,
} from '../types/market';

interface MarketIntelligencePanelProps {
  intelligence: MarketIntelligenceResponse | null;
  onNavigate: (route: AppRoute) => void;
}

export const MarketIntelligencePanel: React.FC<MarketIntelligencePanelProps> = ({
  intelligence,
  onNavigate,
}) => {
  const bullRatio = useMemo(() => {
    if (!intelligence) return 50;
    const total =
      intelligence.signalTally.bullCount +
      intelligence.signalTally.bearCount +
      intelligence.signalTally.neutralCount;
    if (total === 0) return 50;
    return Math.round((intelligence.signalTally.bullCount / total) * 100);
  }, [intelligence]);

  const unified = useMemo(() => {
    if (!intelligence) return null;
    if (intelligence.unifiedSynthesis) return intelligence.unifiedSynthesis;

    // Client-side graceful synthesis fallback if cached snapshot predates unifiedSynthesis
    const catalysts: UnifiedCatalystDriver[] = [
      {
        id: 'fb-flow',
        kind: 'FLOW' as const,
        tag: 'Equities & Flow',
        title: intelligence.headline,
        implication: intelligence.stocksAndFlowSummary,
        tone:
          intelligence.compositeSentiment === 'Bullish'
            ? ('bull' as const)
            : intelligence.compositeSentiment === 'Bearish'
              ? ('bear' as const)
              : ('neutral' as const),
        routeTarget: 'stocks' as const,
      },
      ...intelligence.dataReleaseImplications.slice(0, 2).map((ev, i) => ({
        id: `fb-macro-${i}`,
        kind: 'MACRO' as const,
        tag: `${ev.currency} · ${ev.timing} · ${ev.impact === 'HIGH' ? 'High' : 'Med'}`,
        title: ev.title,
        implication: ev.implication,
        tone: 'neutral' as const,
        routeTarget: 'calendar' as const,
      })),
      ...intelligence.rumorAndCatalystThemes.slice(0, 2).map((r, i) => ({
        id: `fb-wire-${i}`,
        kind: 'WIRE' as const,
        tag: r.tag,
        title: r.theme,
        implication:
          r.tone === 'bull'
            ? 'Supports upward risk breadth across session leaders.'
            : r.tone === 'bear'
              ? 'Reinforces defensive positioning until yields ease.'
              : 'Monitor price confirmation around intraday pivots.',
        tone: r.tone,
        routeTarget: 'news' as const,
      })),
    ].slice(0, 5);

    return {
      regimeTag:
        intelligence.compositeSentiment === 'Bullish'
          ? ('Risk-On Expansion' as const)
          : intelligence.compositeSentiment === 'Bearish'
            ? ('Defensive De-Risking' as const)
            : ('Selective Rotation' as const),
      convictionPct: Math.max(50, Math.min(90, Math.abs(bullRatio - 50) + 55)),
      executiveThesis:
        intelligence.oneSentenceSummary ||
        intelligence.sessionConditionAndTrigger ||
        intelligence.commentaryPoints[0] ||
        intelligence.headline,
      catalysts,
      scenarios: {
        horizonLabel: 'Next 24h Session Window',
        bullTrigger: 'Rates & dollar soften below intraday pivot levels',
        bullTarget: intelligence.forwardPrediction,
        baseCase: intelligence.stocksAndFlowSummary,
        bearTrigger: 'DXY breakout or hawkish macro surprise',
        bearTarget: 'Defensive rotation into cash & bullion hedges',
      },
    };
  }, [intelligence, bullRatio]);

  if (!intelligence || !unified) {
    return null;
  }

  return (
    <section
      aria-label="Unified Market Intelligence"
      data-testid="market-intelligence-unified-card"
      className="rounded-2xl liquid-glass-card overflow-hidden flex flex-col"
    >
      {/* Header Band: Unified Thesis Title, Regime & Tabular Conviction */}
      <div className="px-4 py-4 sm:px-5 border-b border-black/8 dark:border-white/10 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Compass className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8] shrink-0" />
            <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white tracking-tight">
              Unified Market Thesis &amp; Outlook
            </h2>
            <span className="text-[11px] font-medium text-[#6C6C70] dark:text-[#9EB5C8]">
              · {unified.regimeTag} · {intelligence.sourcesCount} sources
            </span>
          </div>

          <p className="mt-2 text-sm font-bold text-[#1C1C1E] dark:text-white leading-snug">
            {intelligence.headline}
          </p>
          <p className="mt-1.5 text-xs sm:text-[13px] text-[#3A3A3C] dark:text-[#D1D1D6] leading-relaxed">
            {unified.executiveThesis}
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0 tabular-nums font-mono text-xs pt-0.5">
          <div className="text-right">
            <span className="block text-[10px] font-sans uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
              Alignment
            </span>
            <span className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
              {unified.convictionPct}%
            </span>
          </div>
          <div className="h-7 w-px bg-black/8 dark:bg-white/10" aria-hidden="true" />
          <div className="flex items-center gap-3 font-bold">
            <span className="inline-flex items-center gap-1 text-[#16803C] dark:text-[#4ADE80]">
              <TrendingUp className="w-3.5 h-3.5" />
              {intelligence.signalTally.bullCount}
            </span>
            <span className="inline-flex items-center gap-1 text-[#D7261C] dark:text-[#FF6B63]">
              <TrendingDown className="w-3.5 h-3.5" />
              {intelligence.signalTally.bearCount}
            </span>
          </div>
        </div>
      </div>

      {/* Slim Cross-Source Breadth Bar */}
      <div className="px-4 py-2.5 sm:px-5 border-b border-black/8 dark:border-white/10 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#6C6C70] dark:text-[#9EB5C8]">
          <span className="tabular-nums font-mono">
            Cross-Source Signal Breadth · {bullRatio}% Bullish
          </span>
          <span className="truncate max-w-[55%] text-right">
            {intelligence.sourceNames.slice(0, 4).join(' · ')}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[#D7261C]/20 dark:bg-[#FF453A]/20 overflow-hidden">
          <div
            className="h-full bg-[#16803C] dark:bg-[#30D158] transition-all duration-500"
            style={{ width: `${bullRatio}%` }}
          />
        </div>
      </div>

      {/* Band 2: Fused Catalysts & Macro Drivers Stream (Single Flat Hairline Table — Zero Nested Cards) */}
      <div className="divide-y divide-black/6 dark:divide-white/8">
        {unified.catalysts.map((item) => {
          const kindLabel =
            item.kind === 'FLOW' ? 'FLOW' : item.kind === 'MACRO' ? 'MACRO' : 'WIRE';
          const kindColor =
            item.kind === 'FLOW'
              ? 'text-[#005BB8] dark:text-[#38BDF8]'
              : item.kind === 'MACRO'
                ? 'text-[#16803C] dark:text-[#4ADE80]'
                : 'text-[#B25E09] dark:text-[#FBBF24]';
          const routeText =
            item.routeTarget === 'stocks'
              ? 'Stocks'
              : item.routeTarget === 'calendar'
                ? 'Calendar'
                : 'News';

          return (
            <div
              key={item.id}
              className="px-4 py-3 sm:px-5 flex flex-col sm:flex-row sm:items-start justify-between gap-2 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`font-mono font-extrabold tracking-wider ${kindColor}`}>
                    {kindLabel}
                  </span>
                  <span className="text-[#6C6C70] dark:text-[#9EB5C8] font-medium">
                    · {item.tag}
                  </span>
                  <span
                    className={`font-semibold ${
                      item.tone === 'bull'
                        ? 'text-[#16803C] dark:text-[#4ADE80]'
                        : item.tone === 'bear'
                          ? 'text-[#D7261C] dark:text-[#FF6B63]'
                          : 'text-[#6C6C70] dark:text-[#9EB5C8]'
                    }`}
                  >
                    · {item.tone === 'bull' ? 'Bullish' : item.tone === 'bear' ? 'Bearish' : 'Neutral'}
                  </span>
                </div>
                <p className="mt-1 text-xs sm:text-[13px] font-bold text-[#1C1C1E] dark:text-white leading-snug">
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs text-[#4A4D57] dark:text-[#AEAEB2] leading-relaxed">
                  {item.implication}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onNavigate(item.routeTarget)}
                className="self-start inline-flex items-center gap-1 text-[11px] font-semibold text-[#005BB8] dark:text-[#38BDF8] hover:underline whitespace-nowrap shrink-0 sm:mt-1"
              >
                <span>{routeText}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Band 3: Forward Market Outlook Scenarios (Hairline-Divided 3-Column Strip) */}
      <div className="border-t border-black/8 dark:border-white/10">
        <div className="px-4 py-2.5 sm:px-5 border-b border-black/6 dark:border-white/8 flex items-center justify-between gap-2 text-[11px]">
          <span className="font-bold uppercase tracking-wider text-[#005BB8] dark:text-[#38BDF8]">
            Forward Market Outlook
          </span>
          <span className="font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8]">
            {unified.scenarios.horizonLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-black/6 dark:divide-white/8 text-xs">
          <div className="p-4 sm:px-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#16803C] dark:text-[#4ADE80]">
              Bullish Scenario
            </span>
            <p className="font-semibold text-[#1C1C1E] dark:text-white leading-snug">
              {unified.scenarios.bullTrigger}
            </p>
            <p className="text-[11px] text-[#4A4D57] dark:text-[#AEAEB2] leading-relaxed">
              {unified.scenarios.bullTarget}
            </p>
          </div>

          <div className="p-4 sm:px-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
              Base Equilibrium
            </span>
            <p className="text-xs text-[#3A3A3C] dark:text-[#D1D1D6] leading-relaxed">
              {unified.scenarios.baseCase}
            </p>
          </div>

          <div className="p-4 sm:px-5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#D7261C] dark:text-[#FF6B63]">
              Bearish Invalidation
            </span>
            <p className="font-semibold text-[#1C1C1E] dark:text-white leading-snug">
              {unified.scenarios.bearTrigger}
            </p>
            <p className="text-[11px] text-[#4A4D57] dark:text-[#AEAEB2] leading-relaxed">
              {unified.scenarios.bearTarget}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
