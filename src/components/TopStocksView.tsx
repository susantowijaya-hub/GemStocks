import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BellRing,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  Flame,
  Globe2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  AppRoute,
  BandarmologyPhase,
  ChartTradeOverlays,
  MarketAsset,
  MarketIntelligenceResponse,
  PriceAlertItem,
  SignalHistoryRecord,
  SignalUserOutcome,
  StockExecutionAction,
  StockMover,
  StocksMoversBucket,
  StockTradePlan,
  Timeframe,
} from '../types/market';
import { getAllMarketSessions, MarketSessionStatus } from '../utils/marketSessions';
import {
  buildIdxBuyScannerList,
  computeCrossSectionalStockContext,
  computeStockDeskSurvival,
  computeStockTradeStrategy,
  extractStockMacroContext,
  formatStockCurrencyValue,
  getStockFearGreed,
  getStockSignal,
  IdxScannerCandidate,
  StockCrossSectionalContext,
  StockMacroRegimeContext,
} from '../utils/marketSignals';
import {
  computeStockConfluenceExpectancyMatrix,
  SignalHistoryStats,
} from '../utils/signalHistoryEngine';
import { GoogleFinanceDeltaPill, GoogleFinanceMiniChart } from './GoogleFinanceMiniChart';
import {
  BandarmologyBadge,
  FearGreedInlineBar,
  FearGreedTrendSparkline,
  getFearGreedTextTone,
} from './MarketUiPrimitives';
import { SignalVerificationMetrics } from '../hooks/useSignalVerification';
import { SignalHistoryPanel } from './SignalHistoryPanel';

interface TopStocksViewProps {
  assets?: MarketAsset[];
  usBucket: StocksMoversBucket;
  idxBucket: StocksMoversBucket;
  stocksUpdatedAt: string | null;
  stocksLoading?: boolean;
  marketIntelligence?: MarketIntelligenceResponse | null;
  searchQuery: string;
  alerts?: PriceAlertItem[];
  signalHistory?: SignalHistoryRecord[];
  activeSignalBySymbol?: Map<string, SignalHistoryRecord>;
  signalStats?: SignalHistoryStats;
  signalCloudSynced?: boolean;
  verificationMetrics?: SignalVerificationMetrics;
  onAnnotateSignal?: (
    signalId: string,
    outcome: SignalUserOutcome | null,
    journalNote?: string
  ) => void;
  onDeleteSignal?: (id: string) => void;
  onClearClosedSignals?: () => void;
  onInspectSignal?: (
    yahooSymbol: string,
    builtInAssetId?: string,
    overlays?: ChartTradeOverlays | null,
    initialTf?: Timeframe
  ) => void;
  onRefresh: () => void;
  onScanBandar?: () => void;
  onInspectSymbol?: (yahooSymbol: string) => void;
  onNavigate?: (route: AppRoute) => void;
  onClearSearch?: () => void;
}

type MarketFilter = 'all' | 'us' | 'id';
type DirectionFilter = 'impact' | 'gainers' | 'losers' | 'foreignBuy' | 'foreignSell';
type BandarFilter = 'all' | BandarmologyPhase;
type ActionSetupFilter = 'all' | StockExecutionAction;

function formatStockPrice(stock: StockMover): string {
  return formatStockCurrencyValue(stock.price, stock.currency);
}

function formatStockDelta(stock: StockMover): string {
  if (stock.price <= 0) return '—';
  const sign = stock.changeValue >= 0 ? '+' : '-';
  const absVal = Math.abs(stock.changeValue);
  if (stock.currency === 'IDR') {
    return `${sign}Rp ${Math.round(absVal).toLocaleString('en-US')}`;
  }
  return `${sign}$${absVal.toFixed(2)}`;
}

function formatStockRange(stock: StockMover): string {
  if (stock.dayHigh <= 0 && stock.dayLow <= 0) return '—';
  if (stock.currency === 'IDR') {
    return `${Math.round(stock.dayLow).toLocaleString('en-US')} – ${Math.round(
      stock.dayHigh
    ).toLocaleString('en-US')}`;
  }
  return `$${stock.dayLow.toFixed(2)} – $${stock.dayHigh.toFixed(2)}`;
}

function getActionBadgeClasses(action: StockExecutionAction): string {
  if (action === 'BUY') {
    return 'bg-[#16A34A]/18 text-[#0B5D2A] dark:bg-[#22C55E]/20 dark:text-[#4ADE80] border-[#16A34A]/45';
  }
  if (action === 'SELL') {
    return 'bg-[#DC2626]/18 text-[#B91C1C] dark:bg-[#EF4444]/20 dark:text-[#FF6B63] border-[#DC2626]/45';
  }
  return 'bg-[#D97706]/18 text-[#9A5A0A] dark:bg-[#F59E0B]/20 dark:text-[#FBBF24] border-[#D97706]/45';
}

function getScannerVerdictBadgeClasses(verdict: NonNullable<StockTradePlan['verdictLabel']>): string {
  if (verdict === 'BUY NOW (ACCUMULATION)' || verdict === 'BUY AT DEMAND' || verdict === 'BREAKOUT BUY') {
    return 'bg-[#16A34A]/18 text-[#0B5D2A] dark:bg-[#22C55E]/20 dark:text-[#4ADE80] border-[#16A34A]/45';
  }
  if (verdict === 'AVOID / SELL') {
    return 'bg-[#DC2626]/18 text-[#B91C1C] dark:bg-[#EF4444]/20 dark:text-[#FF6B63] border-[#DC2626]/45';
  }
  if (verdict === 'WAIT PULLBACK') {
    return 'bg-[#D97706]/18 text-[#9A5A0A] dark:bg-[#F59E0B]/20 dark:text-[#FBBF24] border-[#D97706]/45';
  }
  return 'bg-black/[0.06] dark:bg-white/[0.08] text-[#4A4D57] dark:text-[#C7CBD6] border-black/10 dark:border-white/15';
}

type IdxScannerFilterMode = 'buy' | 'pullback' | 'all';

function IdxBuyScannerSection({
  candidates,
  searchQuery = '',
  loading = false,
  onInspectSymbol,
}: {
  candidates: IdxScannerCandidate[];
  searchQuery?: string;
  loading?: boolean;
  onInspectSymbol?: (yahooSymbol: string) => void;
}) {
  const [selectedTab, setSelectedTab] = useState<IdxScannerFilterMode | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);

  const buyCandidates = useMemo(() => candidates.filter((c) => c.isBuyReady), [candidates]);
  const pullbackCandidates = useMemo(() => candidates.filter((c) => c.isPullbackQueue), [candidates]);

  const effectiveTab: IdxScannerFilterMode =
    selectedTab ?? (buyCandidates.length > 0 ? 'buy' : 'all');

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base =
      effectiveTab === 'buy'
        ? buyCandidates
        : effectiveTab === 'pullback'
          ? pullbackCandidates
          : candidates;
    if (!q) return base;
    return base.filter(
      (c) =>
        c.stock.symbol.toLowerCase().includes(q) ||
        c.stock.name.toLowerCase().includes(q)
    );
  }, [candidates, buyCandidates, pullbackCandidates, effectiveTab, searchQuery]);

  const visibleCandidates = showAllRows
    ? filteredCandidates
    : filteredCandidates.slice(0, 8);

  return (
    <motion.section
      data-testid="idx-buy-scanner"
      initial={{ opacity: 0.85, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl liquid-glass-card overflow-hidden"
    >
      <div className="px-4 sm:px-5 py-3.5 border-b border-black/8 dark:border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Target className="w-4 h-4 text-[#0F7033] dark:text-[#4ADE80] shrink-0" />
            <h2 className="text-base sm:text-lg font-extrabold text-[#1C1C1E] dark:text-white">
              IDX Smart-Money Buy Scanner
            </h2>
            <span
              data-testid="idx-buy-ready-count"
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-mono font-extrabold tabular-nums ${
                buyCandidates.length > 0
                  ? 'bg-[#16A34A]/18 text-[#0B5D2A] dark:bg-[#22C55E]/20 dark:text-[#4ADE80] border-[#16A34A]/45'
                  : 'bg-[#D97706]/18 text-[#9A5A0A] dark:bg-[#F59E0B]/20 dark:text-[#FBBF24] border-[#D97706]/45'
              }`}
            >
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              {buyCandidates.length} Can Buy Now
            </span>
          </div>
          <p className="text-xs text-[#4A4D57] dark:text-[#9EB5C8] mt-0.5">
            Ranks BEI equities by Bandarmology VSA Absorption, Foreign Net Flow (NBSA), Fresh Demand Zone &amp; EMA20/50 trend with Fraksi Harga chase protection.
          </p>
        </div>

        <div
          data-testid="idx-buy-scanner-tabs"
          role="tablist"
          aria-label="IDX scanner filter"
          className="inline-flex flex-wrap rounded-xl liquid-glass-pill p-1 gap-1 self-start lg:self-auto"
        >
          {(
            [
              { id: 'buy', label: `Can Buy Now (${buyCandidates.length})` },
              { id: 'pullback', label: `Pullback Queue (${pullbackCandidates.length})` },
              { id: 'all', label: `All Screened IDX (${candidates.length})` },
            ] as const
          ).map((tab) => {
            const active = effectiveTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-testid={`idx-scanner-tab-${tab.id}`}
                aria-selected={active}
                onClick={() => setSelectedTab(tab.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                  active
                    ? tab.id === 'buy'
                      ? 'bg-[#16803C] text-white shadow-sm'
                      : tab.id === 'pullback'
                        ? 'bg-[#B45309] text-white shadow-sm'
                        : 'bg-[#1C1C1E] dark:bg-white text-white dark:text-[#111318] shadow-sm'
                    : 'text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Executive Summary Banner */}
      <div className="px-4 sm:px-5 py-2.5 bg-black/[0.025] dark:bg-white/[0.025] border-b border-black/6 dark:border-white/8 flex flex-wrap items-center justify-between gap-2 text-xs">
        {buyCandidates.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="font-extrabold text-[#0B5D2A] dark:text-[#4ADE80] uppercase text-[10.5px] tracking-wider">
              Top Buy Pick{buyCandidates.length > 1 ? 's' : ''}:
            </span>
            {buyCandidates.slice(0, 5).map((item) => (
              <button
                key={item.stock.symbol}
                type="button"
                onClick={() => onInspectSymbol?.(`${item.stock.symbol}.JK`)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#16A34A]/14 dark:bg-[#22C55E]/16 border border-[#16A34A]/35 text-[11px] font-mono font-extrabold text-[#0B5D2A] dark:text-[#4ADE80] hover:brightness-95 dark:hover:brightness-110 transition-all"
              >
                <span>{item.stock.symbol}</span>
                <span className="opacity-80">{item.scannerScore}</span>
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11.5px] font-semibold text-[#9A5A0A] dark:text-[#FBBF24] flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            Zero IDX stocks meet immediate low-chase BUY criteria right now — inspect Pullback Queue or wait Demand retest.
          </span>
        )}
        <span className="text-[10.5px] font-mono text-[#6C6C70] dark:text-[#9EB5C8] tabular-nums">
          BEI Fraksi Harga · Click row for chart &amp; trade levels
        </span>
      </div>

      {filteredCandidates.length === 0 ? (
        loading ? (
          <div className="p-6 flex items-center justify-center gap-2 text-xs text-[#6C6C70] dark:text-[#8E8E93]">
            <Loader2 className="w-4 h-4 animate-spin text-[#0071E3] dark:text-[#0A84FF]" />
            <span>Scanning IDX order flow &amp; Demand/Supply zones...</span>
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-[#6C6C70] dark:text-[#9EB5C8] flex flex-col items-center gap-2">
            <span>
              {effectiveTab === 'buy'
                ? 'No IDX stocks cleared all immediate BUY criteria under current filters.'
                : effectiveTab === 'pullback'
                  ? 'No extended IDX accumulation stocks are queued for pullback right now.'
                  : 'No IDX stocks matched your current search query.'}
            </span>
            {effectiveTab !== 'all' && candidates.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedTab('all')}
                className="px-3 py-1 rounded-lg bg-[#0071E3] text-white text-xs font-bold"
              >
                View All {candidates.length} Screened IDX Stocks
              </button>
            )}
          </div>
        )
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E5EA] dark:border-[#2C2C2E] text-[10.5px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#8E8E93]">
                  <th className="py-2.5 pl-5 pr-2 w-12">Score</th>
                  <th className="py-2.5 px-3">IDX Ticker</th>
                  <th className="py-2.5 px-3">Scanner Verdict</th>
                  <th className="py-2.5 px-3">Bandarmology &amp; Flow</th>
                  <th className="py-2.5 px-3">Reasons / Guard</th>
                  <th className="py-2.5 px-3">Entry · TP1 / TP2 · SL (IDR)</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Last / Chg%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5EA]/70 dark:divide-[#2C2C2E]/60 text-xs">
                {visibleCandidates.map((item) => {
                  const { stock, plan, scannerScore, verdictLabel } = item;
                  const verdictCls = getScannerVerdictBadgeClasses(verdictLabel);
                  return (
                    <tr
                      key={`scanner-${stock.symbol}`}
                      data-testid={`idx-scanner-row-${stock.symbol}`}
                      onClick={() => onInspectSymbol?.(`${stock.symbol}.JK`)}
                      className="hover:bg-[#E5E5EA]/35 dark:hover:bg-[#2C2C2E]/40 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 pl-5 pr-2">
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`font-mono font-black text-sm tabular-nums ${
                              scannerScore >= 68
                                ? 'text-[#0F7033] dark:text-[#4ADE80]'
                                : scannerScore >= 50
                                  ? 'text-[#005BB8] dark:text-[#FBBF24]'
                                  : 'text-[#C41C16] dark:text-[#FF6B63]'
                            }`}
                          >
                            {scannerScore}
                          </span>
                          <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                            <div
                              style={{ width: `${scannerScore}%` }}
                              className={`h-full rounded-full ${
                                scannerScore >= 68
                                  ? 'bg-[#16A34A]'
                                  : scannerScore >= 50
                                    ? 'bg-[#D97706]'
                                    : 'bg-[#DC2626]'
                              }`}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-extrabold text-sm text-[#1C1C1E] dark:text-white">
                          {stock.symbol}
                        </div>
                        <div className="text-[10.5px] text-[#6C6C70] dark:text-[#8E8E93] truncate max-w-[160px]">
                          {stock.name}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-extrabold font-mono whitespace-nowrap ${verdictCls}`}
                          >
                            {verdictLabel}
                          </span>
                          {plan.setupGrade && plan.setupGrade !== 'WATCH' && (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-mono font-black ${
                                plan.setupGrade === 'A+'
                                  ? 'bg-[#16A34A] text-white'
                                  : plan.setupGrade === 'A'
                                    ? 'bg-[#0066CC] text-white'
                                    : 'bg-black/10 dark:bg-white/15 text-[#1C1C1E] dark:text-white'
                              }`}
                            >
                              {plan.setupGrade}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8] mt-0.5 whitespace-nowrap">
                          R:R {plan.riskReward} · Conv {plan.conviction}%
                          {typeof plan.gatesPassed === 'number'
                            ? ` · ${plan.gatesPassed}/${plan.gatesTotal ?? 7} Gates`
                            : ''}
                          {plan.stage ? ` · ${plan.stage}` : ''}
                          {typeof plan.rsRank === 'number' ? ` · RS ${plan.rsRank}` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col items-start gap-0.5">
                          <BandarmologyBadge bandarmology={stock.bandarmology} compact />
                          <span className="text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8] whitespace-nowrap">
                            {stock.foreignNetLabel
                              ? `Foreign ${stock.foreignFlowSide ?? ''}: ${stock.foreignNetLabel}`
                              : plan.trendFilterLabel ?? plan.bandarFlowBias}
                            {typeof plan.accPersistence5d === 'number' ? ` · ${plan.accPersistence5d}/5d Acc` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-[260px]">
                        <div className="text-[10.5px] font-semibold text-[#1C1C1E] dark:text-[#E5E5EA] leading-snug">
                          {(plan.buyReasons ?? []).slice(0, 3).join(' · ')}
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8] mt-0.5 truncate">
                          {plan.vcpSummary ? `${plan.vcpSummary}` : plan.sector ? `${plan.sector}${plan.isTopSector ? ' (Top-3)' : ''}` : ''}
                          {plan.adtvLabel && plan.adtvLabel !== 'N/A' ? ` · ADTV ${plan.adtvLabel}` : ''}
                          {plan.atr14Pct ? ` · ATR ${plan.atr14Pct}%` : ''}
                        </div>
                        {plan.cautionNote && (
                          <div className="text-[10px] font-semibold text-[#9A5A0A] dark:text-[#FBBF24] mt-0.5 truncate">
                            {plan.cautionNote}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[10.5px]">
                        <div className="font-bold text-[#1C1C1E] dark:text-white whitespace-nowrap">
                          {plan.action === 'BUY' ? 'Buy' : plan.action === 'SELL' ? 'Sell' : 'Limit'} {formatStockCurrencyValue(plan.entryPrice, 'IDR')}
                        </div>
                        <div className="flex items-center gap-2 whitespace-nowrap mt-0.5">
                          <span className="text-[#0F7033] dark:text-[#4ADE80] font-semibold">
                            TP {formatStockCurrencyValue(plan.takeProfit1, 'IDR')} / {formatStockCurrencyValue(plan.takeProfit2, 'IDR')}
                          </span>
                          <span className="text-[#C41C16] dark:text-[#FF6B63] font-semibold">
                            SL {formatStockCurrencyValue(plan.stopLoss, 'IDR')}
                          </span>
                        </div>
                        {plan.ema10Num && (
                          <div className="text-[9.5px] text-[#6C6C70] dark:text-[#9EB5C8] mt-0.5 whitespace-nowrap">
                            Runner Trail: 10D EMA {formatStockCurrencyValue(plan.ema10Num, 'IDR')}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pl-3 pr-5 text-right font-mono tabular-nums">
                        <div className="font-bold text-sm text-[#1C1C1E] dark:text-white">
                          {formatStockPrice(stock)}
                        </div>
                        <div className="mt-0.5 flex justify-end">
                          <GoogleFinanceDeltaPill changePercent={stock.changePercent} compact />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="md:hidden divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E]/70">
            {visibleCandidates.map((item) => {
              const { stock, plan, scannerScore, verdictLabel } = item;
              const verdictCls = getScannerVerdictBadgeClasses(verdictLabel);
              return (
                <div
                  key={`scanner-m-${stock.symbol}`}
                  onClick={() => onInspectSymbol?.(`${stock.symbol}.JK`)}
                  className="p-3.5 flex flex-col gap-2 cursor-pointer active:bg-[#E5E5EA]/40 dark:active:bg-[#2C2C2E]/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
                          {stock.symbol}
                        </span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9.5px] font-extrabold font-mono ${verdictCls}`}
                        >
                          {verdictLabel}
                        </span>
                        <span className="text-[10.5px] font-mono font-black text-[#005BB8] dark:text-[#FBBF24] tabular-nums">
                          Score {scannerScore}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] truncate mt-0.5">
                        {stock.name}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold font-mono text-[#1C1C1E] dark:text-white tabular-nums">
                        {formatStockPrice(stock)}
                      </div>
                      <div className="mt-0.5 flex justify-end">
                        <GoogleFinanceDeltaPill changePercent={stock.changePercent} compact />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] font-mono tabular-nums text-[#4A4D57] dark:text-[#C7CBD6]">
                    <BandarmologyBadge bandarmology={stock.bandarmology} compact />
                    <span>
                      {[
                        plan.stage,
                        typeof plan.rsRank === 'number' ? `RS ${plan.rsRank}` : null,
                        plan.vcpDetected ? 'VCP' : null,
                        plan.episodicPivot ? 'EP' : null,
                        typeof plan.accPersistence5d === 'number' ? `${plan.accPersistence5d}/5d Acc` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>

                  {plan.cautionNote && (
                    <p className="text-[10.5px] font-semibold text-[#9A5A0A] dark:text-[#FBBF24]">
                      {plan.cautionNote}
                    </p>
                  )}

                  <div className="rounded-xl liquid-glass-inset px-3 py-2 grid grid-cols-3 gap-2 text-[10.5px] font-mono tabular-nums">
                    <div>
                      <span className="text-[#6C6C70] dark:text-[#9EB5C8] block text-[9.5px] font-sans uppercase">
                        {plan.action === 'BUY' ? 'Entry' : 'Limit'}
                      </span>
                      <span className="font-bold text-[#1C1C1E] dark:text-white">
                        {formatStockCurrencyValue(plan.entryPrice, 'IDR')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6C6C70] dark:text-[#9EB5C8] block text-[9.5px] font-sans uppercase">
                        TP1
                      </span>
                      <span className="font-bold text-[#0F7033] dark:text-[#4ADE80]">
                        {formatStockCurrencyValue(plan.takeProfit1, 'IDR')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[#6C6C70] dark:text-[#9EB5C8] block text-[9.5px] font-sans uppercase">
                        SL · {plan.riskReward}
                      </span>
                      <span className="font-bold text-[#C41C16] dark:text-[#FF6B63]">
                        {formatStockCurrencyValue(plan.stopLoss, 'IDR')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredCandidates.length > 8 && (
            <div className="px-4 py-2.5 border-t border-black/8 dark:border-white/10 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAllRows((prev) => !prev)}
                className="text-xs font-bold text-[#0071E3] dark:text-[#8AB4F8] hover:underline"
              >
                {showAllRows
                  ? 'Show Top 8 Candidates'
                  : `Show All ${filteredCandidates.length} Screened IDX Stocks`}
              </button>
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}

function SessionStatusCard({
  session,
  count,
}: {
  session: MarketSessionStatus;
  count: number;
}) {
  const toneStyles =
    session.tone === 'open'
      ? 'bg-[#30D158]/15 text-[#16803C] dark:text-[#30D158] border-[#30D158]/30'
      : session.tone === 'extended' || session.tone === 'break'
        ? 'bg-[#FF9F0A]/15 text-[#B25E09] dark:text-[#FF9F0A] border-[#FF9F0A]/30'
        : 'bg-[#E5E5EA] dark:bg-[#2C2C2E] text-[#6C6C70] dark:text-[#8E8E93] border-[#D1D1D6] dark:border-[#38383A]';

  const dotColor =
    session.tone === 'open'
      ? 'bg-[#30D158] animate-pulse'
      : session.tone === 'extended' || session.tone === 'break'
        ? 'bg-[#FF9F0A]'
        : 'bg-[#8E8E93]';

  return (
    <div className="rounded-2xl liquid-glass-card p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {session.id === 'idx' ? (
            <Globe2 className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#8AB4F8] shrink-0" />
          ) : (
            <Building2 className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#8AB4F8] shrink-0" />
          )}
          <span className="text-xs font-bold text-[#1C1C1E] dark:text-white truncate">
            {session.label}
          </span>
          <span className="text-[11px] font-mono font-semibold text-[#6C6C70] dark:text-[#8E8E93]">
            Top {count}
          </span>
        </div>
        <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] mt-0.5 truncate">
          {session.isLiveRunning ? 'Running Session Movers · ' : 'Last Session Movers · '}
          {session.detail}
        </p>
      </div>
      <span
        className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${toneStyles}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        {session.stateLabel}
      </span>
    </div>
  );
}

function MarketMoversSection({
  title,
  subtitle,
  session,
  stocks,
  isForeignFlow = false,
  foreignSide,
  loading = false,
  searchQuery = '',
  activeSignalBySymbol,
  macroCtx,
  crossCtx,
  onRefresh,
  onClearSearch,
  onInspectSymbol,
}: {
  title: string;
  subtitle: string;
  session: MarketSessionStatus;
  stocks: StockMover[];
  isForeignFlow?: boolean;
  foreignSide?: 'BUY' | 'SELL';
  loading?: boolean;
  searchQuery?: string;
  activeSignalBySymbol?: Map<string, SignalHistoryRecord>;
  macroCtx?: StockMacroRegimeContext;
  crossCtx?: StockCrossSectionalContext;
  onRefresh?: () => void;
  onClearSearch?: () => void;
  onInspectSymbol?: (yahooSymbol: string) => void;
}) {
  const openChartForStock = (stock: StockMover) => {
    if (!onInspectSymbol) return;
    const sym = stock.market === 'ID' ? `${stock.symbol}.JK` : stock.symbol;
    onInspectSymbol(sym);
  };

  return (
    <motion.section
      initial={{ opacity: 0.85, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl liquid-glass-card overflow-hidden"
    >
      <div className="px-4 sm:px-5 py-3.5 border-b border-black/8 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#1C1C1E] dark:text-white">{title}</h2>
          <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">{subtitle}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6C6C70] dark:text-[#8E8E93]">
          <Clock className="w-3.5 h-3.5" />
          {session.isLiveRunning
            ? `Running Session (${session.stateLabel})`
            : `Last Completed Session (${session.stateLabel})`}
        </span>
      </div>

      {stocks.length === 0 ? (
        loading ? (
          <div className="p-8 flex flex-col items-center justify-center gap-2 text-xs text-[#6C6C70] dark:text-[#8E8E93]">
            <Loader2 className="w-5 h-5 animate-spin text-[#0071E3] dark:text-[#0A84FF]" />
            <span>Loading live equity movers &amp; institutional liquidity ranking...</span>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-[#6C6C70] dark:text-[#8E8E93] flex flex-col items-center gap-2.5">
            <span>
              {searchQuery.trim()
                ? `No equity tickers match "${searchQuery.trim()}".`
                : isForeignFlow
                  ? 'Syncing latest IDX Foreign Flow report...'
                  : 'No stocks match the active Bandarmology / Execution filters.'}
            </span>
            <div className="flex items-center gap-2">
              {searchQuery.trim() && onClearSearch && (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="px-3 py-1 rounded-lg bg-[#0071E3] text-white font-semibold"
                >
                  Clear search filter
                </button>
              )}
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  className="px-3 py-1 rounded-lg border border-[#D1D1D6] dark:border-[#2C2C2E] font-semibold text-[#1C1C1E] dark:text-white"
                >
                  Retry Live Sync
                </button>
              )}
            </div>
          </div>
        )
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E5EA] dark:border-[#2C2C2E] text-[11px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#8E8E93]">
                  <th className="py-3 pl-5 pr-2 w-12">Rank</th>
                  <th className="py-3 px-3">Stock</th>
                  <th className="py-3 px-3">Flow / Bandarmology</th>
                  <th className="py-3 px-3">Execution Signal &amp; Levels</th>
                  <th className="py-3 px-3">Fear &amp; Greed</th>
                  <th className="py-3 px-3">Trend</th>
                  {isForeignFlow && (
                    <th className="py-3 px-3 text-right">
                      {foreignSide === 'BUY' ? 'Foreign Net Buy' : 'Foreign Net Sell'}
                    </th>
                  )}
                  <th className="py-3 px-3 text-right">Last Price</th>
                  <th className="py-3 px-3 text-right">Session Chg</th>
                  <th className="py-3 px-3 text-right">Change %</th>
                  <th className="py-3 px-3 text-right">Day Range</th>
                  <th className="py-3 pl-3 pr-5 text-right">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5EA]/70 dark:divide-[#2C2C2E]/60 text-xs">
                {stocks.map((stock, idx) => {
                  const isGain = stock.changePercent >= 0;
                  const isForeignBuy = (stock.foreignNetAmount ?? 0) >= 0;
                  const fearGreed = getStockFearGreed(stock);
                  const plan = computeStockTradeStrategy(stock, macroCtx, crossCtx);
                  const badgeCls = getActionBadgeClasses(plan.action);

                  return (
                    <tr
                      key={`${stock.market}-${stock.symbol}-${idx}`}
                      onClick={() => openChartForStock(stock)}
                      className={`hover:bg-[#E5E5EA]/35 dark:hover:bg-[#2C2C2E]/40 transition-colors ${
                        onInspectSymbol ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="py-3 pl-5 pr-2 font-mono font-bold text-[#6C6C70] dark:text-[#8E8E93]">
                        #{idx + 1}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-[#1C1C1E] dark:text-white">
                            {stock.symbol}
                          </span>
                          {idx < 3 && (
                            <Flame
                              className="w-3.5 h-3.5 text-[#FF9F0A] shrink-0"
                              aria-label="Top mover"
                            />
                          )}
                        </div>
                        <div className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] truncate max-w-[175px]">
                          {stock.name} · {stock.exchange}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-start gap-0.5">
                          <BandarmologyBadge bandarmology={stock.bandarmology} compact />
                          <span className="text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8] whitespace-nowrap">
                            {stock.bandarmology
                              ? `${stock.bandarmology.volumeRatio.toFixed(1)}x vol · Flow ${stock.bandarmology.accumulationPressure}%`
                              : plan.bandarFlowBias}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div
                          data-testid={`stock-trade-plan-${stock.symbol}`}
                          className="flex flex-col gap-1 min-w-[215px]"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-extrabold font-mono tabular-nums whitespace-nowrap ${badgeCls}`}
                            >
                              {plan.action} · {plan.conviction}%
                            </span>
                            {(() => {
                              const tracked =
                                activeSignalBySymbol?.get(stock.symbol) ??
                                activeSignalBySymbol?.get(`${stock.symbol}.JK`);
                              if (!tracked) return null;
                              const isRunning =
                                tracked.status === 'RUNNING' || tracked.status === 'TP1_HIT';
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold tabular-nums whitespace-nowrap ${
                                    tracked.status === 'TP1_HIT'
                                      ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/35'
                                      : isRunning
                                        ? 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/35'
                                        : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35'
                                  }`}
                                  title={`Locked signal continuity (${tracked.status})`}
                                >
                                  {tracked.status === 'TP1_HIT'
                                    ? 'TP1 HIT'
                                    : isRunning
                                      ? `RUNNING ${tracked.pnlPct >= 0 ? '+' : ''}${tracked.pnlPct.toFixed(1)}%`
                                      : 'LIMIT ARMED'}
                                </span>
                              );
                            })()}
                            <span className="text-[10px] font-mono font-bold text-[#4A4D57] dark:text-[#C7CBD6] whitespace-nowrap">
                              R:R {plan.riskReward}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-bold text-[#1C1C1E] dark:text-white">
                              {plan.action === 'WAIT' ? 'Wait' : 'Entry'} {formatStockCurrencyValue(plan.entryPrice, stock.currency)}
                            </span>
                            <span className="text-[#0F7033] dark:text-[#4ADE80] font-semibold">
                              TP1 {formatStockCurrencyValue(plan.takeProfit1, stock.currency)}
                            </span>
                            <span className="text-[#C41C16] dark:text-[#FF6B63] font-semibold">
                              SL {formatStockCurrencyValue(plan.stopLoss, stock.currency)}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8] truncate max-w-[260px]">
                            {[
                              plan.stage,
                              typeof plan.rsRank === 'number' ? `RS ${plan.rsRank}` : null,
                              plan.vcpDetected ? `VCP ${plan.vcpContractionPct ?? ''}%` : null,
                              plan.episodicPivot ? 'EP Catalyst' : null,
                              plan.sector ? `${plan.sector}${plan.isTopSector ? ' ★' : ''}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || plan.strategyTag}
                          </span>
                          {plan.ema10Num && (
                            <span className="text-[9.5px] font-mono tabular-nums text-[#6C6C70] dark:text-[#8E8E93] truncate max-w-[260px]">
                              Runner Trail &lt; 10D EMA {formatStockCurrencyValue(plan.ema10Num, stock.currency)} · ATR {plan.atrPct ?? 0}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <FearGreedInlineBar fearGreed={fearGreed} compact />
                      </td>
                      <td className="py-3 px-3">
                        <div className="w-20 h-8">
                          <GoogleFinanceMiniChart
                            points={stock.sparklinePoints}
                            prevClose={stock.prevClose}
                            isGain={isGain}
                            progressRatio={session.isLiveRunning ? 0.85 : 1}
                            className="w-20 h-8"
                            showEndDot={session.isLiveRunning}
                          />
                        </div>
                      </td>
                      {isForeignFlow && (
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono font-bold text-xs tabular-nums ${
                              isForeignBuy
                                ? 'bg-[#30D158]/15 text-[#16803C] dark:text-[#30D158]'
                                : 'bg-[#FF453A]/15 text-[#D7261C] dark:text-[#FF453A]'
                            }`}
                          >
                            {isForeignBuy ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                            )}
                            {stock.foreignNetLabel || '—'}
                          </span>
                        </td>
                      )}
                      <td className="py-3 px-3 text-right num-table font-bold text-[#1C1C1E] dark:text-white">
                        {formatStockPrice(stock)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-semibold tabular-nums ${
                          isGain
                            ? 'text-[#16803C] dark:text-[#30D158]'
                            : 'text-[#D7261C] dark:text-[#FF453A]'
                        }`}
                      >
                        {formatStockDelta(stock)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex justify-end">
                          <GoogleFinanceDeltaPill changePercent={stock.changePercent} />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[11px] text-[#6C6C70] dark:text-[#8E8E93] tabular-nums">
                        {formatStockRange(stock)}
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right font-mono font-semibold text-[#1C1C1E] dark:text-[#E5E5EA] tabular-nums">
                        {stock.volume}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="md:hidden divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E]/70">
            {stocks.map((stock, idx) => {
              const isGain = stock.changePercent >= 0;
              const isForeignBuy = (stock.foreignNetAmount ?? 0) >= 0;
              const fearGreed = getStockFearGreed(stock);
              const plan = computeStockTradeStrategy(stock, macroCtx, crossCtx);
              const badgeCls = getActionBadgeClasses(plan.action);

              return (
                <div
                  key={`${stock.market}-${stock.symbol}-m-${idx}`}
                  onClick={() => openChartForStock(stock)}
                  className={`p-4 flex flex-col gap-2.5 ${
                    onInspectSymbol ? 'cursor-pointer active:bg-[#E5E5EA]/40 dark:active:bg-[#2C2C2E]/40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-mono font-bold text-[#6C6C70] dark:text-[#8E8E93]">
                          #{idx + 1}
                        </span>
                        <span className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
                          {stock.symbol}
                        </span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-extrabold font-mono tabular-nums ${badgeCls}`}
                        >
                          {plan.action} · {plan.conviction}%
                        </span>
                        <BandarmologyBadge bandarmology={stock.bandarmology} compact />
                      </div>
                      <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93] truncate mt-0.5">
                        {stock.name} · Vol {stock.volume}
                        {stock.bandarmology
                          ? ` · ${stock.bandarmology.volumeRatio.toFixed(1)}x Vol`
                          : ''}
                      </p>
                      {isForeignFlow && stock.foreignNetLabel ? (
                        <div
                          className={`text-[11px] font-mono font-bold mt-1 tabular-nums flex items-center gap-1.5 flex-wrap ${
                            isForeignBuy
                              ? 'text-[#16803C] dark:text-[#30D158]'
                              : 'text-[#D7261C] dark:text-[#FF453A]'
                          }`}
                        >
                          <span>
                            {isForeignBuy ? 'Foreign Buy: ' : 'Foreign Sell: '}
                            {stock.foreignNetLabel}
                          </span>
                          <span className={`inline-flex items-center gap-1 ${getFearGreedTextTone(fearGreed.zone)}`}>
                            <span>· F&amp;G {fearGreed.score}</span>
                            <FearGreedTrendSparkline
                              history7d={fearGreed.history7d}
                              score={fearGreed.score}
                              zone={fearGreed.zone}
                              compact
                              showLabel={false}
                            />
                          </span>
                        </div>
                      ) : (
                        <div className="text-[10px] font-mono text-[#6C6C70] dark:text-[#8E8E93] mt-0.5 tabular-nums flex items-center gap-1.5 flex-wrap">
                          <span>Range: {formatStockRange(stock)} ·</span>
                          <span className={`inline-flex items-center gap-1 font-bold ${getFearGreedTextTone(fearGreed.zone)}`}>
                            <span>F&amp;G {fearGreed.score}</span>
                            <FearGreedTrendSparkline
                              history7d={fearGreed.history7d}
                              score={fearGreed.score}
                              zone={fearGreed.zone}
                              compact
                              showLabel={false}
                            />
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="w-16 h-7 shrink-0">
                      <GoogleFinanceMiniChart
                        points={stock.sparklinePoints}
                        prevClose={stock.prevClose}
                        isGain={isGain}
                        progressRatio={session.isLiveRunning ? 0.85 : 1}
                        className="w-16 h-7"
                        showEndDot={session.isLiveRunning}
                      />
                    </div>

                    <div className="text-right shrink-0">
                      <div className="num-table font-bold text-[#1C1C1E] dark:text-white">
                        {formatStockPrice(stock)}
                      </div>
                      <div className="mt-0.5 flex justify-end">
                        <GoogleFinanceDeltaPill changePercent={stock.changePercent} compact />
                      </div>
                    </div>
                  </div>

                  {/* Mobile Execution Plan Strip */}
                  <div className="rounded-xl liquid-glass-inset px-3 py-2 flex flex-col gap-1.5 text-[10.5px] font-mono tabular-nums">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[#6C6C70] dark:text-[#9EB5C8] block text-[9.5px] font-sans uppercase">
                          {plan.action === 'WAIT' ? 'Trigger Entry' : `${plan.action} Entry`}
                        </span>
                        <span className="font-bold text-[#1C1C1E] dark:text-white">
                          {formatStockCurrencyValue(plan.entryPrice, stock.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#6C6C70] dark:text-[#9EB5C8] block text-[9.5px] font-sans uppercase">
                          TP1 / TP2
                        </span>
                        <span className="font-bold text-[#0F7033] dark:text-[#4ADE80]">
                          {formatStockCurrencyValue(plan.takeProfit1, stock.currency)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[#6C6C70] dark:text-[#9EB5C8] block text-[9.5px] font-sans uppercase">
                          SL · {plan.riskReward}
                        </span>
                        <span className="font-bold text-[#C41C16] dark:text-[#FF6B63]">
                          {formatStockCurrencyValue(plan.stopLoss, stock.currency)}
                        </span>
                      </div>
                    </div>
                    <div className="text-[9.5px] text-[#6C6C70] dark:text-[#9EB5C8] border-t border-black/5 dark:border-white/8 pt-1 truncate">
                      {[
                        plan.stage ? `${plan.stage} (${plan.minerviniPassedCount ?? 0}/8)` : null,
                        typeof plan.rsRank === 'number' ? `RS ${plan.rsRank}` : null,
                        plan.vcpDetected ? 'VCP' : null,
                        plan.episodicPivot ? 'EP' : null,
                        plan.ema10Num ? `10D EMA ${formatStockCurrencyValue(plan.ema10Num, stock.currency)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.section>
  );
}

export const TopStocksView: React.FC<TopStocksViewProps> = ({
  assets = [],
  usBucket,
  idxBucket,
  stocksUpdatedAt,
  stocksLoading = false,
  marketIntelligence = null,
  searchQuery,
  alerts = [],
  signalHistory = [],
  activeSignalBySymbol,
  signalStats,
  signalCloudSynced = false,
  verificationMetrics,
  onAnnotateSignal,
  onDeleteSignal,
  onClearClosedSignals,
  onInspectSignal,
  onRefresh,
  onScanBandar,
  onInspectSymbol,
  onNavigate,
  onClearSearch,
}) => {
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('impact');
  const [bandarFilter, setBandarFilter] = useState<BandarFilter>('all');
  const [actionFilter, setActionFilter] = useState<ActionSetupFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const bandarShiftAlerts = useMemo(
    () => alerts.filter((a) => a.alertKind === 'bandarmology').slice(0, 4),
    [alerts]
  );
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const sessions = getAllMarketSessions(now);

  // If user switches to US-only while a Foreign Flow tab is active, snap cleanly to Highest Impact
  useEffect(() => {
    if (marketFilter === 'us' && (directionFilter === 'foreignBuy' || directionFilter === 'foreignSell')) {
      setDirectionFilter('impact');
    }
  }, [marketFilter, directionFilter]);

  // Phase 1-3 Institutional Macro & Cross-Sectional Relative Strength Context
  const macroCtx = useMemo(() => extractStockMacroContext(assets), [assets]);

  const usCrossCtx = useMemo(
    () =>
      computeCrossSectionalStockContext(
        [...usBucket.impact, ...usBucket.gainers, ...usBucket.losers],
        'US',
        macroCtx.spxChgPct
      ),
    [usBucket, macroCtx.spxChgPct]
  );

  const idxCrossCtx = useMemo(
    () =>
      computeCrossSectionalStockContext(
        [
          ...idxBucket.impact,
          ...idxBucket.gainers,
          ...idxBucket.losers,
          ...(idxBucket.foreignBuy ?? []),
          ...(idxBucket.foreignSell ?? []),
        ],
        'ID',
        macroCtx.ihsgChgPct
      ),
    [idxBucket, macroCtx.ihsgChgPct]
  );

  const filterSearchAndSetup = (list: StockMover[], crossCtx: StockCrossSectionalContext) => {
    const q = searchQuery.toLowerCase().trim();
    const base = !q
      ? list.slice(0, 10)
      : list.filter(
          (s) =>
            s.symbol.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            s.exchange.toLowerCase().includes(q)
        );
    const byBandar =
      bandarFilter === 'all'
        ? base
        : base.filter((s) => (s.bandarmology?.phase ?? 'Neutral') === bandarFilter);
    if (actionFilter === 'all') return byBandar;
    return byBandar.filter((s) => computeStockTradeStrategy(s, macroCtx, crossCtx).action === actionFilter);
  };

  const activeUsList = useMemo(() => {
    const raw =
      directionFilter === 'gainers'
        ? usBucket.gainers
        : directionFilter === 'losers'
          ? usBucket.losers
          : usBucket.impact;
    return filterSearchAndSetup(raw, usCrossCtx);
  }, [usBucket, directionFilter, searchQuery, bandarFilter, actionFilter, macroCtx, usCrossCtx]);

  const activeIdxList = useMemo(() => {
    const raw =
      directionFilter === 'gainers'
        ? idxBucket.gainers
        : directionFilter === 'losers'
          ? idxBucket.losers
          : directionFilter === 'foreignBuy'
            ? idxBucket.foreignBuy ?? []
            : directionFilter === 'foreignSell'
              ? idxBucket.foreignSell ?? []
              : idxBucket.impact;
    return filterSearchAndSetup(raw, idxCrossCtx);
  }, [idxBucket, directionFilter, searchQuery, bandarFilter, actionFilter, macroCtx, idxCrossCtx]);

  const combinedSignalTally = useMemo(() => {
    let bull = 0;
    let bear = 0;
    let buy = 0;
    let sell = 0;
    let wait = 0;
    for (const s of activeUsList) {
      const sig = getStockSignal(s);
      if (sig.direction === 'bull') bull += 1;
      else if (sig.direction === 'bear') bear += 1;
      const plan = computeStockTradeStrategy(s, macroCtx, usCrossCtx);
      if (plan.action === 'BUY') buy += 1;
      else if (plan.action === 'SELL') sell += 1;
      else wait += 1;
    }
    for (const s of activeIdxList) {
      const sig = getStockSignal(s);
      if (sig.direction === 'bull') bull += 1;
      else if (sig.direction === 'bear') bear += 1;
      const plan = computeStockTradeStrategy(s, macroCtx, idxCrossCtx);
      if (plan.action === 'BUY') buy += 1;
      else if (plan.action === 'SELL') sell += 1;
      else wait += 1;
    }
    return { bull, bear, buy, sell, wait };
  }, [activeUsList, activeIdxList, macroCtx, usCrossCtx, idxCrossCtx]);

  const idxBandarSummary = useMemo(() => {
    let acc = 0;
    let dist = 0;
    for (const s of idxBucket.impact) {
      const ph = s.bandarmology?.phase;
      if (ph === 'Strong Accumulation' || ph === 'Early Accumulation') acc += 1;
      else if (ph === 'Strong Distribution' || ph === 'Early Distribution') dist += 1;
    }
    return { acc, dist };
  }, [idxBucket.impact]);

  const idxScannerCandidates = useMemo(
    () => buildIdxBuyScannerList(idxBucket, macroCtx, idxCrossCtx),
    [idxBucket, macroCtx, idxCrossCtx]
  );

  const survivalStatus = useMemo(
    () => computeStockDeskSurvival(assets, idxBucket, usBucket, signalHistory),
    [assets, idxBucket, usBucket, signalHistory]
  );

  const stockExpectancyMatrix = useMemo(
    () => computeStockConfluenceExpectancyMatrix(signalHistory),
    [signalHistory]
  );

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    window.setTimeout(() => setIsRefreshing(false), 750);
  };

  const updatedWib = stocksUpdatedAt
    ? `${new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(stocksUpdatedAt))} WIB`
    : 'Syncing...';

  const isForeignTab = directionFilter === 'foreignBuy' || directionFilter === 'foreignSell';

  const directionTitleSuffix =
    directionFilter === 'gainers'
      ? 'Top 10 Gainers'
      : directionFilter === 'losers'
        ? 'Top 10 Losers'
        : directionFilter === 'foreignBuy'
          ? 'Top 10 Foreign Buy'
          : directionFilter === 'foreignSell'
            ? 'Top 10 Foreign Sell'
            : 'Top 10 High-Impact Stocks';

  const showUsSection = !isForeignTab && (marketFilter === 'all' || marketFilter === 'us');
  const showIdxSection = isForeignTab || marketFilter === 'all' || marketFilter === 'id';

  return (
    <div className="max-w-7xl mx-auto w-full px-4 lg:px-6 py-5 sm:py-7 pb-28 flex flex-col gap-5">
      {/* Page Title & Live Sync Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#0071E3] dark:text-[#0A84FF]" />
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white">
              Top 10 Session Stock Movers
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93] mt-1">
            US: CMF Flow + EMA Trend · IDX: Bandarmology + Foreign Flow · 3M Supply/Demand Execution Prices (Entry, TP1/TP2, SL).
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <span className="text-[11px] font-mono text-[#6C6C70] dark:text-[#8E8E93]">
            Updated {updatedWib}
          </span>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-pill hover:border-[#0071E3] text-xs font-semibold text-[#1C1C1E] dark:text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || stocksLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Live Market Session Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SessionStatusCard session={sessions.us} count={activeUsList.length || 10} />
        <SessionStatusCard session={sessions.idx} count={activeIdxList.length || 10} />
      </div>

      {/* Connected Equity & Foreign Flow Intelligence Summary Banner */}
      <section className="rounded-2xl liquid-glass-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Compass className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF] shrink-0" />
            <span className="text-xs font-bold text-[#1C1C1E] dark:text-white">
              Bandarmology + Flow + Supply/Demand Brief
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#30D158]/15 text-[#16803C] dark:text-[#30D158] text-[10px] font-bold tabular-nums">
              <TrendingUp className="w-3 h-3" />
              {combinedSignalTally.buy} BUY · {combinedSignalTally.bull} Bull
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FF453A]/15 text-[#D7261C] dark:text-[#FF453A] text-[10px] font-bold tabular-nums">
              <TrendingDown className="w-3 h-3" />
              {combinedSignalTally.sell} SELL · {combinedSignalTally.bear} Bear
            </span>
            <span className="text-[11px] font-semibold text-[#4A4D57] dark:text-[#C7CBD6] tabular-nums">
              IDX Bandarmology: {idxBandarSummary.acc} Acc · {idxBandarSummary.dist} Dist
            </span>
          </div>
          <p className="text-xs text-[#3A3A3C] dark:text-[#D1D1D6] leading-relaxed mt-1.5">
            {marketIntelligence?.stocksAndFlowSummary ||
              'Synchronizing US institutional capitalization leaders, Jakarta IDX liquidity movers, and Supply/Demand execution zones across active sessions.'}
          </p>
        </div>

        {onNavigate && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F2F2F7] dark:bg-[#2C2C2E] text-xs font-semibold text-[#1C1C1E] dark:text-white hover:opacity-85 transition-opacity"
            >
              <span>Indices</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('news')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 text-xs font-semibold text-[#0071E3] dark:text-[#8AB4F8] hover:opacity-85 transition-opacity"
            >
              <span>News &amp; Recap</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </section>

      {/* Combined Strategy + Data Validity + Capital Survival Risk Desk */}
      <section
        data-testid="stocks-survival-desk"
        className="rounded-2xl liquid-glass-card p-4 flex flex-col gap-3"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldAlert
                className={`w-4 h-4 shrink-0 ${
                  survivalStatus.mode === 'NORMAL'
                    ? 'text-[#0F7033] dark:text-[#4ADE80]'
                    : survivalStatus.mode === 'CAUTION'
                      ? 'text-[#B45309] dark:text-[#FBBF24]'
                      : 'text-[#C41C16] dark:text-[#FF6B63]'
                }`}
              />
              <h2 className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
                Strategy &amp; Survival Risk Desk
              </h2>
              <span
                data-testid="stocks-survival-mode"
                className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10.5px] font-mono font-black uppercase tracking-wider ${
                  survivalStatus.mode === 'NORMAL'
                    ? 'bg-[#16A34A]/16 text-[#0B5D2A] dark:bg-[#22C55E]/18 dark:text-[#4ADE80] border-[#16A34A]/45'
                    : survivalStatus.mode === 'CAUTION'
                      ? 'bg-[#D97706]/16 text-[#9A5A0A] dark:bg-[#F59E0B]/18 dark:text-[#FBBF24] border-[#D97706]/45'
                      : 'bg-[#DC2626]/16 text-[#B91C1C] dark:bg-[#EF4444]/18 dark:text-[#FF6B63] border-[#DC2626]/45'
                }`}
              >
                {survivalStatus.mode} MODE
              </span>
              <span className="text-[11px] font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#7DD3FC]">
                Risk {survivalStatus.riskPerTradePct.toFixed(2)}%/Trade · Max {survivalStatus.maxConcurrentPositions} Open · Min Conv {survivalStatus.minConvictionRequired}%
              </span>
            </div>
            <p className="text-xs text-[#3A3A3C] dark:text-[#D1D1D6] mt-1 leading-relaxed">
              {survivalStatus.headline}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {survivalStatus.rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl liquid-glass-inset px-3 py-2 flex flex-col gap-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                  {rule.label}
                </span>
                <span
                  className={`text-[9.5px] font-mono font-black uppercase px-1.5 py-0.5 rounded ${
                    rule.passed
                      ? 'bg-[#16A34A]/15 text-[#0B5D2A] dark:text-[#4ADE80]'
                      : 'bg-[#D97706]/18 text-[#9A5A0A] dark:text-[#FBBF24]'
                  }`}
                >
                  {rule.passed ? 'PASS' : 'GUARD'}
                </span>
              </div>
              <span className="text-[11px] font-mono font-semibold text-[#1C1C1E] dark:text-white leading-snug">
                {rule.detail}
              </span>
            </div>
          ))}
        </div>

        {/* Phase 2 & 3 Macro Regime Throttle + Top-3 Sector Leadership Strip */}
        <div className="pt-2 border-t border-black/8 dark:border-white/10 grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                Top-3 Leading Sectors · US Market
              </span>
              <span
                className={`text-[10px] font-mono font-bold ${
                  macroCtx.usThrottled
                    ? 'text-[#B45309] dark:text-[#FBBF24]'
                    : 'text-[#0F7033] dark:text-[#4ADE80]'
                }`}
              >
                {macroCtx.usThrottled ? 'SPX/DXY Throttled' : 'SPX Constructive'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {usCrossCtx.sectorLeaderboard.slice(0, 3).map((sec) => (
                <button
                  key={`us-sec-${sec.sector}`}
                  type="button"
                  onClick={() => onInspectSymbol?.(sec.topSymbol)}
                  className="text-left rounded-xl liquid-glass-inset px-2.5 py-2 hover:border-[#0071E3] transition-colors"
                >
                  <div className="text-[10px] font-mono font-bold text-[#005BB8] dark:text-[#7DD3FC] tabular-nums">
                    #{sec.rank} · RS {sec.avgRsRank}
                  </div>
                  <div className="text-[11px] font-bold text-[#1C1C1E] dark:text-white truncate">
                    {sec.sector}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8] truncate">
                    {sec.topSymbol} · {sec.avgChangePct >= 0 ? '+' : ''}
                    {sec.avgChangePct.toFixed(1)}%
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                Top-3 Leading Sectors · IDX / BEI
              </span>
              <span
                className={`text-[10px] font-mono font-bold ${
                  macroCtx.idxThrottled
                    ? 'text-[#B45309] dark:text-[#FBBF24]'
                    : 'text-[#0F7033] dark:text-[#4ADE80]'
                }`}
              >
                {macroCtx.idxThrottled ? 'IHSG/IDR Throttled' : 'IHSG Constructive'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {idxCrossCtx.sectorLeaderboard.slice(0, 3).map((sec) => (
                <button
                  key={`idx-sec-${sec.sector}`}
                  type="button"
                  onClick={() => onInspectSymbol?.(`${sec.topSymbol}.JK`)}
                  className="text-left rounded-xl liquid-glass-inset px-2.5 py-2 hover:border-[#0071E3] transition-colors"
                >
                  <div className="text-[10px] font-mono font-bold text-[#0F7033] dark:text-[#4ADE80] tabular-nums">
                    #{sec.rank} · RS {sec.avgRsRank}
                  </div>
                  <div className="text-[11px] font-bold text-[#1C1C1E] dark:text-white truncate">
                    {sec.sector}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8] truncate">
                    {sec.topSymbol} · {sec.avgChangePct >= 0 ? '+' : ''}
                    {sec.avgChangePct.toFixed(1)}%
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Market, Category & Action Setup Filter Bar */}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl liquid-glass-pill p-1">
            {(
              [
                {
                  id: 'all',
                  label: `All Markets (${(showUsSection ? activeUsList.length : 0) + activeIdxList.length})`,
                },
                { id: 'us', label: `United States (${activeUsList.length})` },
                { id: 'id', label: `Indonesia IDX (${activeIdxList.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMarketFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  marketFilter === tab.id
                    ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                    : 'text-[#4A4D57] dark:text-[#B4B8C4] hover:text-[#1C1C1E] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="inline-flex flex-wrap rounded-xl liquid-glass-pill p-1 gap-0.5">
            {(
              [
                { id: 'impact', label: 'Highest Impact', idxOnly: false },
                { id: 'gainers', label: 'Top Gainers', idxOnly: false },
                { id: 'losers', label: 'Top Losers', idxOnly: false },
                { id: 'foreignBuy', label: 'IDX Foreign Buy', idxOnly: true },
                { id: 'foreignSell', label: 'IDX Foreign Sell', idxOnly: true },
              ] as const
            )
              .filter((item) => (marketFilter === 'us' ? !item.idxOnly : true))
              .map((dir) => (
                <button
                  key={dir.id}
                  type="button"
                  onClick={() => {
                    setDirectionFilter(dir.id);
                    if (dir.idxOnly && marketFilter === 'all') {
                      setMarketFilter('id');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    directionFilter === dir.id
                      ? dir.id === 'foreignBuy'
                        ? 'bg-[#16803C] text-white shadow-sm'
                        : dir.id === 'foreignSell'
                          ? 'bg-[#D7261C] text-white shadow-sm'
                          : 'bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm'
                      : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {dir.label}
                </button>
              ))}
          </div>
        </div>

        {/* Action Signal Setup Filter (BUY / SELL / WAIT) */}
        <div
          data-testid="stocks-action-filter"
          className="flex flex-wrap items-center gap-1.5 text-xs"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] mr-1">
            Execution Setup:
          </span>
          {(
            [
              { id: 'all', label: 'All Setups' },
              { id: 'BUY', label: 'BUY (Demand + Acc)' },
              { id: 'SELL', label: 'SELL (Supply + Dist)' },
              { id: 'WAIT', label: 'WAIT (Zone Pullback)' },
            ] as const
          ).map((act) => (
            <button
              key={act.id}
              type="button"
              onClick={() => setActionFilter(act.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors border ${
                actionFilter === act.id
                  ? act.id === 'BUY'
                    ? 'bg-[#16803C] text-white border-transparent shadow-sm'
                    : act.id === 'SELL'
                      ? 'bg-[#D7261C] text-white border-transparent shadow-sm'
                      : act.id === 'WAIT'
                        ? 'bg-[#B45309] text-white border-transparent shadow-sm'
                        : 'bg-[#1C1C1E] dark:bg-white text-white dark:text-[#111318] border-transparent shadow-sm'
                  : 'liquid-glass-pill text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              {act.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div
          data-testid="idx-bandarmology-filter"
          className="flex flex-wrap items-center gap-1.5 text-xs"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] mr-1">
            Bandarmology Phase:
          </span>
          {(
            [
              { id: 'all', label: 'All Phases' },
              { id: 'Strong Accumulation', label: 'Strong Accumulation' },
              { id: 'Early Accumulation', label: 'Early Accumulation' },
              { id: 'Early Distribution', label: 'Early Distribution' },
              { id: 'Strong Distribution', label: 'Strong Distribution' },
            ] as const
          ).map((phase) => (
            <button
              key={phase.id}
              type="button"
              onClick={() => setBandarFilter(phase.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors border ${
                bandarFilter === phase.id
                  ? 'bg-[#1C1C1E] dark:bg-white text-white dark:text-[#111318] border-transparent shadow-sm'
                  : 'liquid-glass-pill text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              {phase.label}
            </button>
          ))}
        </div>

        {showIdxSection && (
          <div
            data-testid="idx-bandar-shift-monitor"
            className="rounded-xl liquid-glass-inset px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs"
          >
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <BellRing className="w-3.5 h-3.5 text-[#0F7033] dark:text-[#4ADE80] shrink-0" />
              <span className="font-bold text-[#1C1C1E] dark:text-white">
                Accumulation Shift Monitor
              </span>
              <span className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">
                Auto-alerts when IDX stocks shift Early ↔ Strong Accumulation ({bandarShiftAlerts.length} recent)
              </span>
              {bandarShiftAlerts.map((sh) => {
                const isUp = sh.bandarToPhase === 'Strong Accumulation';
                return (
                  <button
                    key={sh.id}
                    type="button"
                    onClick={() => onInspectSymbol?.(sh.assetId)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold transition-opacity hover:opacity-85 ${
                      isUp
                        ? 'bg-[#16A34A]/15 text-[#0F7033] dark:text-[#4ADE80]'
                        : 'bg-[#D97706]/15 text-[#9A5A0A] dark:text-[#FBBF24]'
                    }`}
                  >
                    {sh.symbol}: {isUp ? 'Early → Strong Acc' : 'Strong → Early Acc'}
                  </button>
                );
              })}
            </div>
            {onScanBandar && (
              <button
                type="button"
                data-testid="stocks-scan-bandar-btn"
                onClick={onScanBandar}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg liquid-glass-pill text-[11px] font-bold text-[#0F7033] dark:text-[#4ADE80] hover:brightness-95 dark:hover:brightness-110 transition-all whitespace-nowrap shrink-0"
              >
                <Activity className="w-3 h-3" />
                Scan IDX Shifts
              </button>
            )}
          </div>
        )}
      </div>

      {/* Indonesian IDX Smart-Money Buy Scanner */}
      {showIdxSection && (
        <IdxBuyScannerSection
          candidates={idxScannerCandidates}
          searchQuery={searchQuery}
          loading={stocksLoading}
          onInspectSymbol={onInspectSymbol}
        />
      )}

      {/* Tables */}
      {showUsSection && (
        <MarketMoversSection
          title={`United States · ${directionTitleSuffix}`}
          subtitle="Stage 2 Minervini + RS Rank + VCP/EP + 1Y Supply/Demand & 10D EMA Runner Exit (USD)"
          session={sessions.us}
          stocks={activeUsList}
          loading={stocksLoading}
          searchQuery={searchQuery}
          activeSignalBySymbol={activeSignalBySymbol}
          macroCtx={macroCtx}
          crossCtx={usCrossCtx}
          onRefresh={handleManualRefresh}
          onClearSearch={onClearSearch}
          onInspectSymbol={onInspectSymbol}
        />
      )}

      {showIdxSection && (
        <MarketMoversSection
          title={`Indonesia (IDX / BEI) · ${directionTitleSuffix}`}
          subtitle={
            directionFilter === 'foreignBuy'
              ? 'Top 10 Indonesian equities by net foreign institutional buy value (IDR) with Stage 2, RS Rank & ARA/ARB Guard'
              : directionFilter === 'foreignSell'
                ? 'Top 10 Indonesian equities by net foreign institutional sell value (IDR) with Supply/Demand levels'
                : 'Bandarmology + Foreign Flow + Stage 2 + RS Rank + 20D ADTV & ARA/ARB Guard (Fraksi Harga IDR)'
          }
          session={sessions.idx}
          stocks={activeIdxList}
          isForeignFlow={isForeignTab}
          foreignSide={directionFilter === 'foreignBuy' ? 'BUY' : directionFilter === 'foreignSell' ? 'SELL' : undefined}
          loading={stocksLoading}
          searchQuery={searchQuery}
          activeSignalBySymbol={activeSignalBySymbol}
          macroCtx={macroCtx}
          crossCtx={idxCrossCtx}
          onRefresh={handleManualRefresh}
          onClearSearch={onClearSearch}
          onInspectSymbol={onInspectSymbol}
        />
      )}

      {/* Phase 3 Stocks Triple-Barrier & Institutional Meta-Labeling Expectancy Matrix */}
      <section
        data-testid="stocks-expectancy-matrix"
        className="rounded-2xl liquid-glass-card p-4 sm:p-5 flex flex-col gap-3.5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[#0071E3] dark:text-[#7DD3FC]" />
              <h2 className="text-sm sm:text-base font-extrabold text-[#1C1C1E] dark:text-white">
                Stocks Triple-Barrier &amp; Confluence Expectancy Matrix
              </h2>
            </div>
            <p className="text-xs text-[#6C6C70] dark:text-[#9EB5C8] mt-0.5">
              {stockExpectancyMatrix.driftMessage}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-[#4A4D57] dark:text-[#C7CBD6]">
            <span>
              TP: <strong className="text-[#0F7033] dark:text-[#4ADE80]">{stockExpectancyMatrix.barrierBreakdown.upperTp}</strong>
            </span>
            <span>
              SL: <strong className="text-[#C41C16] dark:text-[#FF6B63]">{stockExpectancyMatrix.barrierBreakdown.lowerSl}</strong>
            </span>
            <span>
              Time: <strong>{stockExpectancyMatrix.barrierBreakdown.timeBarrier}</strong>
            </span>
            <span>
              Open: <strong className="text-[#005BB8] dark:text-[#7DD3FC]">{stockExpectancyMatrix.barrierBreakdown.open}</strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
          <div className="rounded-xl liquid-glass-inset px-3 py-2">
            <span className="text-[10px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8] block">
              Overall Expectancy
            </span>
            <span className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
              {stockExpectancyMatrix.overallExpectancyR !== null
                ? `${stockExpectancyMatrix.overallExpectancyR >= 0 ? '+' : ''}${stockExpectancyMatrix.overallExpectancyR}R`
                : 'Calibrating'}
            </span>
          </div>
          <div className="rounded-xl liquid-glass-inset px-3 py-2">
            <span className="text-[10px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8] block">
              Rolling 20-Trade
            </span>
            <span
              className={`text-sm font-extrabold ${
                stockExpectancyMatrix.driftWarning
                  ? 'text-[#C41C16] dark:text-[#FF6B63]'
                  : 'text-[#0F7033] dark:text-[#4ADE80]'
              }`}
            >
              {stockExpectancyMatrix.rolling20ExpectancyR !== null
                ? `${stockExpectancyMatrix.rolling20ExpectancyR >= 0 ? '+' : ''}${stockExpectancyMatrix.rolling20ExpectancyR}R`
                : '0 Closed'}
            </span>
          </div>
          <div className="rounded-xl liquid-glass-inset px-3 py-2">
            <span className="text-[10px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8] block">
              Avg MFE / MAE
            </span>
            <span className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
              {stockExpectancyMatrix.avgMfeR !== null ? `+${stockExpectancyMatrix.avgMfeR}R` : '—'} /{' '}
              {stockExpectancyMatrix.avgMaeR !== null ? `-${stockExpectancyMatrix.avgMaeR}R` : '—'}
            </span>
          </div>
          <div className="rounded-xl liquid-glass-inset px-3 py-2">
            <span className="text-[10px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8] block">
              Edge Capture
            </span>
            <span className="text-sm font-extrabold text-[#005BB8] dark:text-[#7DD3FC]">
              {stockExpectancyMatrix.edgeCaptureRatioPct !== null
                ? `${stockExpectancyMatrix.edgeCaptureRatioPct}%`
                : '—'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10 text-[10.5px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                <th className="py-2 pr-3">Meta-Labeling Factor</th>
                <th className="py-2 px-2 text-right">Sample</th>
                <th className="py-2 px-2 text-right">Win Rate</th>
                <th className="py-2 px-2 text-right">Expectancy</th>
                <th className="py-2 px-2 text-right">Net R</th>
                <th className="py-2 pl-2 text-right">Edge Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/6 dark:divide-white/8 font-mono tabular-nums">
              {stockExpectancyMatrix.rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-3 font-sans font-semibold text-[#1C1C1E] dark:text-white">
                    {row.label}
                  </td>
                  <td className="py-2 px-2 text-right text-[#6C6C70] dark:text-[#9EB5C8]">
                    {row.sampleSize}
                  </td>
                  <td className="py-2 px-2 text-right text-[#1C1C1E] dark:text-white">
                    {row.winRatePct !== null ? `${row.winRatePct}%` : '—'}
                  </td>
                  <td
                    className={`py-2 px-2 text-right font-bold ${
                      row.expectancyR === null
                        ? 'text-[#6C6C70] dark:text-[#8E8E93]'
                        : row.expectancyR >= 0
                          ? 'text-[#0F7033] dark:text-[#4ADE80]'
                          : 'text-[#C41C16] dark:text-[#FF6B63]'
                    }`}
                  >
                    {row.expectancyR !== null
                      ? `${row.expectancyR >= 0 ? '+' : ''}${row.expectancyR}R`
                      : '—'}
                  </td>
                  <td className="py-2 px-2 text-right text-[#1C1C1E] dark:text-white">
                    {row.sampleSize > 0 ? `${row.netR >= 0 ? '+' : ''}${row.netR}R` : '—'}
                  </td>
                  <td className="py-2 pl-2 text-right font-sans text-[10.5px] font-bold text-[#4A4D57] dark:text-[#C7CBD6]">
                    {row.edgeGrade}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8]">
          {stockExpectancyMatrix.stopCalibrationNote}
        </p>
      </section>

      {/* Unified Persistent Signal History & Continuity Ledger */}
      {signalStats && onDeleteSignal && onClearClosedSignals && (
        <SignalHistoryPanel
          records={signalHistory}
          stats={signalStats}
          cloudSynced={signalCloudSynced}
          verificationMetrics={verificationMetrics}
          defaultCategory="stocks"
          title="Stock & Multi-Asset Signal Continuity Ledger"
          subtitle="Tracks every qualified IDX, US, BTC, and XAU signal from first-shown price through live running P&L, TP1/TP2 hits, or SL — locked in database so live ticks never reset your active setups."
          onInspectSignal={(sym, builtInId, overlays, tf) => {
            if (onInspectSignal) {
              onInspectSignal(sym, builtInId, overlays, tf);
            } else {
              onInspectSymbol?.(sym);
            }
          }}
          onAnnotateSignal={onAnnotateSignal}
          onDeleteSignal={onDeleteSignal}
          onClearClosedSignals={onClearClosedSignals}
        />
      )}
    </div>
  );
};

