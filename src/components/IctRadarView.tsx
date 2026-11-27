import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Bell,
  BellOff,
  BellRing,
  BookOpen,
  CandlestickChart,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  CloudOff,
  Copy,
  Crosshair,
  HelpCircle,
  Hourglass,
  Layers,
  Newspaper,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Wifi,
} from 'lucide-react';
import {
  Asset5mVolatility,
  ChartTradeOverlays,
  EconomicEvent,
  IctExecutionPosture,
  IctSignalAnalysis,
  MarketAsset,
  PriceAlertItem,
  PriorityStreamStatus,
  SdCandleVolumeSignal,
  SignalBiasVerdict,
  SignalClearanceGate,
  SignalHistoryRecord,
  SignalUserOutcome,
  SyncedRadarConfig,
  Timeframe,
} from '../types/market';
import { formatAssetPrice } from '../utils/formatters';
import {
  computeIctSignal,
  evaluateLiveExecutionPosture,
  isIctEligibleAsset,
  scanAllIctSignals,
} from '../utils/ictSignals';
import {
  computeSdCandleVolumeSignal,
  scanAllSdCandleVolumeSignals,
} from '../utils/sdCandleVolumeSignals';
import {
  computeConfluenceExpectancyMatrix,
  computeExecutionTypePerformance,
  formatSignalPrice,
  SignalHistoryStats,
} from '../utils/signalHistoryEngine';
import { SignalVerificationMetrics } from '../hooks/useSignalVerification';
import { SignalHistoryPanel } from './SignalHistoryPanel';
import { IctPositionSizer } from './IctPositionSizer';
import { MetaLabelValidatorPanel } from './MetaLabelValidatorPanel';
import { evaluateTwoStageMetaLabel } from '../utils/metaLabelValidator';

interface IctRadarViewProps {
  assets: MarketAsset[];
  alerts: PriceAlertItem[];
  economicEvents?: EconomicEvent[];
  ictPopupsEnabled: boolean;
  onToggleIctPopups: () => void;
  onScanIct: (
    assetId?: string,
    strategy?: 'ict' | 'sdcv',
    timeframe?: Timeframe,
    enforceVol?: boolean,
    enforceNews?: boolean
  ) => number | Promise<number>;
  onTriggerIctAlert: (signal: IctSignalAnalysis, strategy?: 'ict' | 'sdcv') => void;
  onLoadTimeframe?: (assetId: string, tf: Timeframe) => void;
  onInspectChart?: (assetId: string, overlays: ChartTradeOverlays, tf: Timeframe) => void;
  onMarkAlertRead?: (id: string) => void;
  onUpdateAlertOutcome?: (id: string, outcome: 'pending' | 'win' | 'be' | 'loss') => void;
  onSyncRadarConfig?: (config: SyncedRadarConfig) => void;
  signalHistory?: SignalHistoryRecord[];
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
  priorityStreamStatus?: PriorityStreamStatus;
  prioritySources?: Record<string, string>;
  jumpTarget?: {
    assetId: string;
    strategy?: 'ict' | 'sdcv';
    timeframe?: Timeframe;
    nonce: number;
  } | null;
  flashMap?: Record<string, 'gain' | 'loss'>;
  volatility5mMap?: Record<string, Asset5mVolatility>;
  searchQuery?: string;
}

const ICT_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h'];
const MTF_REQUIRED_TFS: Timeframe[] = ['4h', '1h', '15m', '5m'];
const RADAR_PREFS_STORAGE_KEY = 'stocks-ict-radar-prefs-v1';

type InstrumentScopeFilter = 'all' | 'a-plus' | 'actionable' | 'btcusd' | 'xauusd';
type IctSortMode = 'occurrence' | 'volatility';
type RadarStrategyMode = 'ict' | 'sdcv';

interface RadarPrefs {
  strategyMode: RadarStrategyMode;
  selectedTf: Timeframe;
  scopeFilter: InstrumentScopeFilter;
  sortMode: IctSortMode;
  volatilityFilterEnabled: boolean;
  newsBlackoutEnabled: boolean;
}

const DEFAULT_RADAR_PREFS: RadarPrefs = {
  strategyMode: 'ict',
  selectedTf: '15m',
  scopeFilter: 'all',
  sortMode: 'occurrence',
  volatilityFilterEnabled: true,
  newsBlackoutEnabled: true,
};

function loadRadarPrefs(): RadarPrefs {
  try {
    if (typeof window === 'undefined') return DEFAULT_RADAR_PREFS;
    const raw = window.localStorage.getItem(RADAR_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_RADAR_PREFS;
    const parsed = JSON.parse(raw) as Partial<RadarPrefs>;
    return {
      strategyMode: parsed.strategyMode === 'sdcv' ? 'sdcv' : 'ict',
      selectedTf: ICT_TIMEFRAMES.includes(parsed.selectedTf as Timeframe)
        ? (parsed.selectedTf as Timeframe)
        : '15m',
      scopeFilter:
        parsed.scopeFilter === 'a-plus' ||
        parsed.scopeFilter === 'actionable' ||
        parsed.scopeFilter === 'btcusd' ||
        parsed.scopeFilter === 'xauusd'
          ? parsed.scopeFilter
          : 'all',
      sortMode: parsed.sortMode === 'volatility' ? 'volatility' : 'occurrence',
      volatilityFilterEnabled:
        typeof parsed.volatilityFilterEnabled === 'boolean'
          ? parsed.volatilityFilterEnabled
          : true,
      newsBlackoutEnabled:
        typeof parsed.newsBlackoutEnabled === 'boolean'
          ? parsed.newsBlackoutEnabled
          : true,
    };
  } catch {
    return DEFAULT_RADAR_PREFS;
  }
}

type DirectionalBias = 'BUY' | 'SELL' | 'NEUTRAL';

function resolveIctExpectedBias(sig: IctSignalAnalysis): DirectionalBias {
  if (sig.direction === 'BUY') return 'BUY';
  if (sig.direction === 'SELL') return 'SELL';

  const statusLower = `${sig.sweepMssStatus ?? ''} ${sig.setupName ?? ''}`.toLowerCase();
  const bothSwept = statusLower.includes('both sides');
  if (!bothSwept) {
    if (
      statusLower.includes('ssl swept') ||
      statusLower.includes('asian low swept') ||
      statusLower.includes('bullish mss') ||
      statusLower.includes('bullish fvg')
    ) {
      return 'BUY';
    }
    if (
      statusLower.includes('bsl swept') ||
      statusLower.includes('asian high swept') ||
      statusLower.includes('bearish mss') ||
      statusLower.includes('bearish fvg')
    ) {
      return 'SELL';
    }
  }

  const targetUpper = (sig.liquidityTarget ?? '').trim().toUpperCase();
  if (targetUpper.startsWith('BSL')) return 'BUY';
  if (targetUpper.startsWith('SSL')) return 'SELL';

  if (
    typeof sig.tp2Num === 'number' &&
    typeof sig.stopLossNum === 'number' &&
    Number.isFinite(sig.tp2Num) &&
    Number.isFinite(sig.stopLossNum) &&
    sig.tp2Num !== sig.stopLossNum
  ) {
    return sig.tp2Num > sig.stopLossNum ? 'BUY' : 'SELL';
  }

  if (sig.htfBias === 'Bullish') return 'BUY';
  if (sig.htfBias === 'Bearish') return 'SELL';
  if (sig.pdZone === 'Discount') return 'BUY';
  if (sig.pdZone === 'Premium') return 'SELL';
  return 'NEUTRAL';
}

function resolveSdcvExpectedBias(sig: SdCandleVolumeSignal): DirectionalBias {
  if (sig.direction === 'BUY') return 'BUY';
  if (sig.direction === 'SELL') return 'SELL';
  if (sig.zoneBias === 'Demand') return 'BUY';
  if (sig.zoneBias === 'Supply') return 'SELL';
  if (sig.candleTone === 'bull') return 'BUY';
  if (sig.candleTone === 'bear') return 'SELL';
  if (
    typeof sig.tp2Num === 'number' &&
    typeof sig.stopLossNum === 'number' &&
    Number.isFinite(sig.tp2Num) &&
    Number.isFinite(sig.stopLossNum) &&
    sig.tp2Num !== sig.stopLossNum
  ) {
    return sig.tp2Num > sig.stopLossNum ? 'BUY' : 'SELL';
  }
  return 'NEUTRAL';
}

function getDirectionBadgeStyle(
  direction: IctSignalAnalysis['direction'],
  expectedBias: DirectionalBias = 'NEUTRAL',
  posture?: IctExecutionPosture
): {
  label:
    | 'BUY'
    | 'SELL'
    | 'BUY LIMIT'
    | 'SELL LIMIT'
    | 'PULLBACK · BUY'
    | 'PULLBACK · SELL'
    | 'WAIT FOR BUY'
    | 'WAIT FOR SELL'
    | 'WAIT · RANGING';
  lean: DirectionalBias;
  classes: string;
} {
  if (direction === 'BUY') {
    if (posture === 'limit_pullback_only') {
      return {
        label: 'PULLBACK · BUY',
        lean: 'BUY',
        classes:
          'bg-[#D97706]/18 text-[#0B5D2A] dark:bg-[#F59E0B]/20 dark:text-[#6EE7B7] border-[#D97706]/60 shadow-[0_0_10px_rgba(245,158,11,0.16)]',
      };
    }
    if (posture === 'armed_limit') {
      return {
        label: 'BUY LIMIT',
        lean: 'BUY',
        classes:
          'bg-[#16A34A]/16 text-[#0B5D2A] dark:bg-[#22C55E]/18 dark:text-[#4ADE80] border-[#16A34A]/50 shadow-[0_0_10px_rgba(34,197,94,0.14)]',
      };
    }
    return {
      label: 'BUY',
      lean: 'BUY',
      classes:
        'bg-[#16A34A]/20 text-[#0B5D2A] dark:bg-[#22C55E]/22 dark:text-[#4ADE80] border-[#16A34A]/55 shadow-[0_0_10px_rgba(34,197,94,0.18)]',
    };
  }
  if (direction === 'SELL') {
    if (posture === 'limit_pullback_only') {
      return {
        label: 'PULLBACK · SELL',
        lean: 'SELL',
        classes:
          'bg-[#D97706]/18 text-[#991B1B] dark:bg-[#F59E0B]/20 dark:text-[#FCA5A5] border-[#D97706]/60 shadow-[0_0_10px_rgba(245,158,11,0.16)]',
      };
    }
    if (posture === 'armed_limit') {
      return {
        label: 'SELL LIMIT',
        lean: 'SELL',
        classes:
          'bg-[#DC2626]/16 text-[#B91C1C] dark:bg-[#EF4444]/18 dark:text-[#FF6B63] border-[#DC2626]/50 shadow-[0_0_10px_rgba(239,68,68,0.14)]',
      };
    }
    return {
      label: 'SELL',
      lean: 'SELL',
      classes:
        'bg-[#DC2626]/20 text-[#B91C1C] dark:bg-[#EF4444]/22 dark:text-[#FF6B63] border-[#DC2626]/55 shadow-[0_0_10px_rgba(239,68,68,0.18)]',
    };
  }
  if (expectedBias === 'BUY') {
    return {
      label: 'WAIT FOR BUY',
      lean: 'BUY',
      classes:
        'bg-[#D97706]/18 text-[#0B5D2A] dark:bg-[#F59E0B]/18 dark:text-[#6EE7B7] border-[#16A34A]/50 dark:border-[#34D399]/50 shadow-[0_0_10px_rgba(16,185,129,0.14)]',
    };
  }
  if (expectedBias === 'SELL') {
    return {
      label: 'WAIT FOR SELL',
      lean: 'SELL',
      classes:
        'bg-[#D97706]/18 text-[#991B1B] dark:bg-[#F59E0B]/18 dark:text-[#FCA5A5] border-[#DC2626]/50 dark:border-[#F87171]/50 shadow-[0_0_10px_rgba(239,68,68,0.14)]',
    };
  }
  return {
    label: 'WAIT · RANGING',
    lean: 'NEUTRAL',
    classes:
      'bg-[#D97706]/20 text-[#9A5A0A] dark:bg-[#F59E0B]/22 dark:text-[#FBBF24] border-[#D97706]/55 shadow-[0_0_10px_rgba(245,158,11,0.14)]',
  };
}

function formatNumericWithAsset(value: number | undefined, asset?: MarketAsset, fallbackDecimals = 4): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (asset) {
    return formatAssetPrice({ ...asset, price: value });
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fallbackDecimals,
    maximumFractionDigits: fallbackDecimals,
  });
}

const ExecutionDecisionBanner: React.FC<{
  direction: IctSignalAnalysis['direction'];
  posture: IctExecutionPosture;
  limitEntryPriceNum?: number;
  limitRr?: number;
  spotRr?: number;
  chaseProgressPct: number;
  asset?: MarketAsset;
  fallbackDecimals: number;
}> = ({
  direction,
  posture,
  limitEntryPriceNum,
  limitRr,
  spotRr,
  chaseProgressPct,
  asset,
  fallbackDecimals,
}) => {
  const limitPriceFormatted = formatNumericWithAsset(limitEntryPriceNum, asset, fallbackDecimals);
  const isActive = direction === 'BUY' || direction === 'SELL';

  let headline = 'HOLD FLAT · AWAITING CONFLUENCE';
  let subline = 'No chase risk — setup stays locked until structural confirmation completes.';
  let toneClasses =
    'bg-black/[0.03] dark:bg-white/[0.04] border-black/10 dark:border-white/12 text-[#1C1C1E] dark:text-[#F1F5F9]';
  let tagLabel = 'STANDBY';
  let tagClasses =
    'bg-[#D97706]/18 text-[#9A5A0A] dark:bg-[#F59E0B]/20 dark:text-[#FBBF24] border-[#D97706]/45';

  if (isActive && posture === 'enter_now') {
    headline = `ENTER NOW · ${direction} MARKET / ZONE FILL`;
    subline = 'Spot is trading inside the optimal Entry Zone with protected R:R. Execute cleanly with Stop Loss.';
    toneClasses =
      direction === 'BUY'
        ? 'bg-[#16A34A]/10 dark:bg-[#22C55E]/12 border-[#16A34A]/40 text-[#0B5D2A] dark:text-[#4ADE80]'
        : 'bg-[#DC2626]/10 dark:bg-[#EF4444]/12 border-[#DC2626]/40 text-[#B91C1C] dark:text-[#FF6B63]';
    tagLabel = 'IN ENTRY ZONE';
    tagClasses =
      direction === 'BUY'
        ? 'bg-[#16A34A] text-white border-[#16A34A]'
        : 'bg-[#DC2626] text-white border-[#DC2626]';
  } else if (isActive && posture === 'armed_limit') {
    headline = `SET ${direction} LIMIT ORDER @ ${limitPriceFormatted}`;
    subline = 'Setup armed with full confluence — place pending Limit Order at proximal sweet-spot and wait for fill.';
    toneClasses =
      direction === 'BUY'
        ? 'bg-[#16A34A]/8 dark:bg-[#22C55E]/10 border-[#16A34A]/35 text-[#0B5D2A] dark:text-[#4ADE80]'
        : 'bg-[#DC2626]/8 dark:bg-[#EF4444]/10 border-[#DC2626]/35 text-[#B91C1C] dark:text-[#FF6B63]';
    tagLabel = 'ARMED LIMIT';
    tagClasses =
      'bg-[#0066CC]/15 text-[#005BB8] dark:bg-[#38BDF8]/18 dark:text-[#7DD3FC] border-[#0066CC]/40';
  } else if (isActive && posture === 'limit_pullback_only') {
    headline = `PULLBACK LIMIT ONLY · DO NOT CHASE (${direction} LIMIT @ ${limitPriceFormatted})`;
    subline = `Price displaced +${chaseProgressPct}% toward TP1 beyond Entry Zone. Wait for pullback fill rather than paying poor Spot R:R.`;
    toneClasses =
      'bg-[#D97706]/12 dark:bg-[#F59E0B]/14 border-[#D97706]/45 text-[#9A5A0A] dark:text-[#FBBF24]';
    tagLabel = 'CHASE GUARD';
    tagClasses =
      'bg-[#D97706] text-white border-[#D97706]';
  } else if (posture === 'invalidated') {
    headline = 'SETUP INVALIDATED · DO NOT ENTER';
    subline = 'Live spot breached invalidation stop level. Wait for next fresh Liquidity Sweep + MSS.';
    toneClasses =
      'bg-[#DC2626]/8 dark:bg-[#EF4444]/10 border-[#DC2626]/35 text-[#B91C1C] dark:text-[#FF6B63]';
    tagLabel = 'INVALIDATED';
    tagClasses = 'bg-[#DC2626]/20 text-[#B91C1C] dark:text-[#FF6B63] border-[#DC2626]/45';
  } else if (posture === 'missed') {
    headline = 'TP1 TARGET REACHED · SETUP MISSED';
    subline = 'Move completed without returning to Entry Zone. Wait for new dealing range.';
    tagLabel = 'MISSED';
  }

  return (
    <div
      data-testid="ict-execution-banner"
      data-posture={posture}
      className={`rounded-xl px-3.5 py-2.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${toneClasses}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9.5px] font-mono font-black uppercase tracking-wider whitespace-nowrap shrink-0 ${tagClasses}`}
          >
            {tagLabel}
          </span>
          <span className="text-xs sm:text-[13px] font-extrabold tracking-tight text-[#1C1C1E] dark:text-white">
            {headline}
          </span>
        </div>
        <p className="text-[11px] font-medium text-[#4A4D57] dark:text-[#C7CBD6] mt-0.5 leading-snug">
          {subline}
        </p>
      </div>

      <div
        data-testid="ict-rr-comparison"
        className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums text-[11px] px-2.5 py-1.5 rounded-lg bg-white/60 dark:bg-black/25 border border-black/8 dark:border-white/10"
      >
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
            Spot R:R
          </span>
          <span
            className={`font-extrabold ${
              typeof spotRr === 'number' && spotRr < 1.5
                ? 'text-[#C41C16] dark:text-[#FF6B63]'
                : 'text-[#1C1C1E] dark:text-white'
            }`}
          >
            {typeof spotRr === 'number' ? `1:${spotRr.toFixed(1)}` : '—'}
          </span>
        </div>
        <span className="h-5 w-px bg-black/10 dark:bg-white/15" aria-hidden="true" />
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
            Limit R:R
          </span>
          <span className="font-extrabold text-[#0F7033] dark:text-[#4ADE80]">
            {typeof limitRr === 'number' ? `1:${limitRr.toFixed(1)}` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
};

function getBiasVerdictStyle(verdict?: SignalBiasVerdict): string {
  if (verdict === 'STRONG BUY' || verdict === 'BUY') {
    return 'bg-[#16A34A]/18 text-[#0B5D2A] dark:bg-[#22C55E]/20 dark:text-[#4ADE80] border-[#16A34A]/45';
  }
  if (verdict === 'STRONG SELL' || verdict === 'SELL') {
    return 'bg-[#DC2626]/18 text-[#B91C1C] dark:bg-[#EF4444]/20 dark:text-[#FF6B63] border-[#DC2626]/45';
  }
  if (verdict === 'BULLISH LEAN (WAIT)') {
    return 'bg-[#16A34A]/10 text-[#0B5D2A] dark:bg-[#22C55E]/12 dark:text-[#6EE7B7] border-[#D97706]/45';
  }
  if (verdict === 'BEARISH LEAN (WAIT)') {
    return 'bg-[#DC2626]/10 text-[#991B1B] dark:bg-[#EF4444]/12 dark:text-[#FCA5A5] border-[#D97706]/45';
  }
  return 'bg-[#D97706]/15 text-[#9A5A0A] dark:bg-[#F59E0B]/18 dark:text-[#FBBF24] border-[#D97706]/45';
}

const ClearanceScorecardPanel: React.FC<{
  biasVerdict?: SignalBiasVerdict;
  clearanceSummary?: string;
  clearanceGates?: SignalClearanceGate[];
  dxyConfluenceNote?: string;
  roundPoolNote?: string;
  asianHigh?: number;
  asianLow?: number;
  asset?: MarketAsset;
  decimals: number;
}> = ({
  biasVerdict,
  clearanceSummary,
  clearanceGates,
  dxyConfluenceNote,
  roundPoolNote,
  asianHigh,
  asianLow,
  asset,
  decimals,
}) => {
  if (!biasVerdict && (!clearanceGates || clearanceGates.length === 0)) {
    return null;
  }

  const hasAsianRange =
    typeof asianHigh === 'number' &&
    typeof asianLow === 'number' &&
    Number.isFinite(asianHigh) &&
    Number.isFinite(asianLow) &&
    asianHigh > asianLow;

  return (
    <div
      data-testid="ict-clearance-scorecard"
      className="rounded-xl liquid-glass-inset p-3 flex flex-col gap-2.5 border border-black/8 dark:border-white/10"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
            5-Gate Signal Clearance
          </span>
          {biasVerdict && (
            <span
              data-testid="ict-bias-verdict-badge"
              className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10.5px] font-mono font-black tracking-wide whitespace-nowrap ${getBiasVerdictStyle(
                biasVerdict
              )}`}
            >
              {biasVerdict}
            </span>
          )}
        </div>
        {clearanceSummary && (
          <span className="text-[11px] font-mono font-bold text-[#1C1C1E] dark:text-[#F1F5F9]">
            {clearanceSummary}
          </span>
        )}
      </div>

      {(hasAsianRange || dxyConfluenceNote || roundPoolNote) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono">
          {hasAsianRange && (
            <span className="px-2 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] border border-black/8 dark:border-white/12 text-[#1C1C1E] dark:text-[#E5E5EA] tabular-nums">
              Asian Range: {formatNumericWithAsset(asianLow, asset, decimals)} –{' '}
              {formatNumericWithAsset(asianHigh, asset, decimals)}
            </span>
          )}
          {dxyConfluenceNote && (
            <span className="px-2 py-0.5 rounded-md bg-[#0071E3]/10 dark:bg-[#38BDF8]/12 border border-[#0071E3]/30 text-[#005BB8] dark:text-[#7DD3FC]">
              {dxyConfluenceNote}
            </span>
          )}
          {roundPoolNote && (
            <span className="px-2 py-0.5 rounded-md bg-[#D97706]/12 dark:bg-[#F59E0B]/14 border border-[#D97706]/35 text-[#9A5A0A] dark:text-[#FBBF24]">
              {roundPoolNote}
            </span>
          )}
        </div>
      )}

      {clearanceGates && clearanceGates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {clearanceGates.map((gate, idx) => (
            <div
              key={gate.id}
              className={`rounded-lg px-2.5 py-2 border flex flex-col gap-1 min-w-0 ${
                gate.state === 'PASS'
                  ? 'bg-[#16A34A]/8 dark:bg-[#22C55E]/10 border-[#16A34A]/30 text-[#0B5D2A] dark:text-[#4ADE80]'
                  : gate.state === 'BLOCK'
                    ? 'bg-[#DC2626]/8 dark:bg-[#EF4444]/10 border-[#DC2626]/30 text-[#B91C1C] dark:text-[#FF6B63]'
                    : 'bg-black/[0.03] dark:bg-white/[0.04] border-black/10 dark:border-white/12 text-[#4A4D57] dark:text-[#C7CBD6]'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <span className="text-[10px] font-extrabold truncate">
                  {idx + 1}. {gate.label}
                </span>
                <span className="text-[9.5px] font-mono font-black shrink-0 uppercase">
                  {gate.state}
                </span>
              </div>
              <span className="text-[10px] font-mono font-semibold text-[#1C1C1E] dark:text-[#E5E5EA] truncate">
                {gate.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function formatWibDateTime(ts: number): string {
  const datePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
  const timePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ts));
  return `${timePart} WIB · ${datePart}`;
}

function formatRelativeTime(ts: number, nowMs: number): string {
  const diffMs = Math.max(0, nowMs - ts);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 15) return 'Just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getVolatilityStatusLabel(
  status?: 'in-range' | 'too-low' | 'too-high' | 'warming',
  passed?: boolean
): string {
  if (status === 'warming') return 'Warming 15m';
  if (status === 'too-high') return 'Erratic High Vol';
  if (status === 'too-low') return 'Low Vol';
  return passed ? 'Safe Band' : 'Out of Band';
}

function getConfluenceChecks(signal: IctSignalAnalysis, isPureIct: boolean): Array<{
  label: string;
  passed: boolean;
  detail: string;
}> {
  const isActionable = signal.direction === 'BUY' || signal.direction === 'SELL';
  const atrDetail = signal.volatilityPassed
    ? 'In Range'
    : signal.volatilityStatus === 'warming'
      ? 'Warming'
      : signal.volatilityStatus === 'too-high'
        ? 'Erratic'
        : 'Too Low';

  if (isPureIct && signal.scoreBreakdown) {
    return [
      {
        label: 'Liquidity Sweep',
        passed: signal.scoreBreakdown.sweep >= 14,
        detail: signal.scoreBreakdown.sweep >= 14 ? 'Confirmed' : 'Pending',
      },
      {
        label: 'MSS Break',
        passed: signal.scoreBreakdown.displacementMss >= 14,
        detail: signal.scoreBreakdown.displacementMss >= 14 ? 'Confirmed' : 'Pending',
      },
      {
        label: 'FVG / Entry Zone',
        passed: signal.scoreBreakdown.imbalanceFvgOb >= 14,
        detail: signal.scoreBreakdown.imbalanceFvgOb >= 14 ? 'Confirmed' : 'Pending',
      },
      {
        label: '15m ATR Band',
        passed: Boolean(signal.volatilityPassed),
        detail: atrDetail,
      },
    ];
  }

  const statusText = `${signal.sweepMssStatus ?? ''} ${signal.setupName}`.toLowerCase();
  const sweepConfirmed =
    isActionable ||
    (statusText.includes('swept') && !statusText.includes('not swept') && !statusText.includes('both sides'));
  const mssConfirmed =
    isActionable ||
    (statusText.includes('mss confirmed') || (statusText.includes('mss') && statusText.includes('fvg confirmed')));
  const fvgConfirmed =
    isActionable ||
    Boolean(signal.entryZone && signal.entryZone !== '—' && !statusText.includes('await') && !statusText.includes('standby'));

  return [
    {
      label: 'Liquidity Sweep',
      passed: sweepConfirmed,
      detail: sweepConfirmed ? 'Confirmed' : 'Pending',
    },
    {
      label: 'MSS Break',
      passed: mssConfirmed,
      detail: mssConfirmed ? 'Confirmed' : 'Pending',
    },
    {
      label: 'FVG / Entry Zone',
      passed: fvgConfirmed,
      detail: fvgConfirmed ? 'Confirmed' : 'Pending',
    },
    {
      label: '15m ATR Band',
      passed: Boolean(signal.volatilityPassed),
      detail: atrDetail,
    },
  ];
}

interface SignalConfidenceGaugeResult {
  level: 'Low' | 'Med' | 'High';
  score: number;
  bars: 1 | 2 | 3;
  badgeClass: string;
  activeBarClass: string;
  tooltip: string;
}

function computeSignalConfidenceGauge(
  volInfo: Asset5mVolatility | undefined,
  signalConfidence: number,
  volatilityPassed?: boolean
): SignalConfidenceGaugeResult {
  let score = 0;
  let detailParts: string[] = [];

  if (!volInfo) {
    score =
      (volatilityPassed ? 34 : 16) +
      Math.round(Math.max(0, Math.min(100, signalConfidence)) * 0.45);
    detailParts = ['5m telemetry warming', `Signal ${signalConfidence}%`];
  } else if (!volInfo.isSessionOpen || volInfo.sampleSource === 'closed') {
    score = 22;
    detailParts = ['Session closed (stale 5m tape)'];
  } else {
    const sourcePts =
      volInfo.sampleSource === 'live-5m'
        ? 34
        : volInfo.sampleSource === 'server-5m'
          ? 28
          : 18;
    const absZ = Math.abs(volInfo.zScore);
    const zPts =
      absZ >= 0.15 && absZ <= 1.65
        ? 36
        : absZ < 0.15 && volInfo.range5mPct >= 0.004
          ? 24
          : absZ <= 2.35
            ? 20
            : 8;
    const rangePts =
      volInfo.range5mPct >= 0.015 ? 20 : volInfo.range5mPct >= 0.004 ? 14 : 4;
    const gatePts = volatilityPassed ? 10 : 0;

    score = Math.max(0, Math.min(100, sourcePts + zPts + rangePts + gatePts));
    detailParts = [
      `Source: ${volInfo.sampleSource}`,
      `5m Range: ${volInfo.range5mPct.toFixed(3)}%`,
      `Z: ${volInfo.zScore >= 0 ? '+' : ''}${volInfo.zScore.toFixed(2)}σ`,
    ];
  }

  if (score >= 72) {
    return {
      level: 'High',
      score,
      bars: 3,
      badgeClass:
        'bg-[#16A34A]/14 text-[#0B5D2A] dark:bg-[#22C55E]/16 dark:text-[#4ADE80] border-[#16A34A]/35 dark:border-[#4ADE80]/35',
      activeBarClass: 'bg-[#16A34A] dark:bg-[#4ADE80]',
      tooltip: `5m Telemetry Reliability: High (${score}/100) · ${detailParts.join(' · ')}`,
    };
  }
  if (score >= 46) {
    return {
      level: 'Med',
      score,
      bars: 2,
      badgeClass:
        'bg-[#D97706]/14 text-[#9A5A0A] dark:bg-[#F59E0B]/16 dark:text-[#FBBF24] border-[#D97706]/35 dark:border-[#FBBF24]/35',
      activeBarClass: 'bg-[#D97706] dark:bg-[#FBBF24]',
      tooltip: `5m Telemetry Reliability: Med (${score}/100) · ${detailParts.join(' · ')}`,
    };
  }
  return {
    level: 'Low',
    score,
    bars: 1,
    badgeClass:
      'bg-[#DC2626]/14 text-[#B91C1C] dark:bg-[#EF4444]/16 dark:text-[#FF6B63] border-[#DC2626]/35 dark:border-[#FF6B63]/35',
    activeBarClass: 'bg-[#DC2626] dark:bg-[#FF6B63]',
    tooltip: `5m Telemetry Reliability: Low (${score}/100) · ${detailParts.join(' · ')}`,
  };
}

const VolatilityConfidenceGauge: React.FC<{
  gauge: SignalConfidenceGaugeResult;
  compact?: boolean;
}> = ({ gauge, compact = false }) => {
  const clampedPct = Math.max(6, Math.min(100, gauge.score));
  return (
    <span
      data-testid="ict-confidence-gauge"
      data-confidence-level={gauge.level.toLowerCase()}
      data-confidence-score={gauge.score}
      title={gauge.tooltip}
      className={`inline-flex items-center gap-1.5 rounded-md border font-mono font-extrabold whitespace-nowrap shrink-0 transition-colors duration-500 ease-out motion-reduce:transition-none ${
        compact ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2 py-1 text-[10.5px]'
      } ${gauge.badgeClass}`}
    >
      <span className="inline-flex items-end gap-[2px] h-2.5" aria-hidden="true">
        <span
          className={`w-[3px] h-[5px] rounded-[1px] origin-bottom transition-all duration-500 ease-out motion-reduce:transition-none ${
            gauge.bars >= 1
              ? `${gauge.activeBarClass} scale-y-100 opacity-100`
              : 'bg-black/15 dark:bg-white/15 scale-y-75 opacity-55'
          }`}
        />
        <span
          className={`w-[3px] h-[7px] rounded-[1px] origin-bottom transition-all duration-500 delay-75 ease-out motion-reduce:transition-none ${
            gauge.bars >= 2
              ? `${gauge.activeBarClass} scale-y-100 opacity-100`
              : 'bg-black/15 dark:bg-white/15 scale-y-75 opacity-55'
          }`}
        />
        <span
          className={`w-[3px] h-[10px] rounded-[1px] origin-bottom transition-all duration-500 delay-150 ease-out motion-reduce:transition-none ${
            gauge.bars >= 3
              ? `${gauge.activeBarClass} scale-y-100 opacity-100`
              : 'bg-black/15 dark:bg-white/15 scale-y-75 opacity-55'
          }`}
        />
      </span>
      <span className="transition-colors duration-500 ease-out motion-reduce:transition-none">
        Tel · {gauge.level}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-1 rounded-full bg-black/10 dark:bg-white/12 overflow-visible ${
          compact ? 'w-6' : 'w-8'
        }`}
      >
        <span
          style={{ width: `${clampedPct}%` }}
          className={`block h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none ${gauge.activeBarClass}`}
        />
        <span
          style={{ left: `calc(${clampedPct}% - 2.5px)` }}
          className={`absolute top-1/2 -translate-y-1/2 w-[5px] h-[5px] rounded-full ring-1 ring-white/90 dark:ring-black/70 transition-[left,background-color] duration-500 ease-out motion-reduce:transition-none ${gauge.activeBarClass}`}
        />
      </span>
    </span>
  );
};

function getSpotPulseClass(
  isInEntryZone: boolean,
  direction: IctSignalAnalysis['direction']
): string {
  if (!isInEntryZone || direction === 'NEUTRAL') return '';
  if (direction === 'BUY') return 'spot-plaque-entry-pulse spot-plaque-entry-pulse-buy';
  return 'spot-plaque-entry-pulse spot-plaque-entry-pulse-sell';
}

function getPriceFlashClass(flash?: 'gain' | 'loss'): string {
  if (flash === 'gain') return 'spot-price-flash-up';
  if (flash === 'loss') return 'spot-price-flash-down';
  return '';
}

function computeSpotProximity(params: {
  currentPrice: number;
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  tp1?: number;
  direction: IctSignalAnalysis['direction'];
  executionStatus?: 'active' | 'standby' | 'invalidated' | 'missed';
  posture?: IctExecutionPosture;
  chaseProgressPct?: number;
}): {
  label: string;
  tone: 'in-zone' | 'near' | 'risk' | 'neutral';
  isInEntryZone: boolean;
} {
  const {
    currentPrice,
    entryLow,
    entryHigh,
    stopLoss,
    tp1,
    direction,
    executionStatus,
    posture,
    chaseProgressPct,
  } = params;

  if (direction === 'NEUTRAL') {
    if (executionStatus === 'invalidated') {
      return { label: 'Setup Invalidated', tone: 'risk', isInEntryZone: false };
    }
    if (executionStatus === 'missed') {
      return { label: 'TP1 Reached · Missed', tone: 'neutral', isInEntryZone: false };
    }
    return { label: 'Standby · Awaiting Trigger', tone: 'neutral', isInEntryZone: false };
  }

  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    typeof entryLow !== 'number' ||
    typeof entryHigh !== 'number'
  ) {
    return { label: 'Evaluating Spot', tone: 'neutral', isInEntryZone: false };
  }
  const lo = Math.min(entryLow, entryHigh);
  const hi = Math.max(entryLow, entryHigh);
  if (typeof stopLoss === 'number') {
    if (direction === 'BUY' && currentPrice <= stopLoss) {
      return { label: 'Below Stop Loss', tone: 'risk', isInEntryZone: false };
    }
    if (direction === 'SELL' && currentPrice >= stopLoss) {
      return { label: 'Above Stop Loss', tone: 'risk', isInEntryZone: false };
    }
  }
  if (typeof tp1 === 'number') {
    if (direction === 'BUY' && currentPrice >= tp1) {
      return { label: 'Above TP1 Target', tone: 'in-zone', isInEntryZone: false };
    }
    if (direction === 'SELL' && currentPrice <= tp1) {
      return { label: 'Below TP1 Target', tone: 'in-zone', isInEntryZone: false };
    }
  }
  if (currentPrice >= lo && currentPrice <= hi) {
    return { label: 'IN ENTRY ZONE', tone: 'in-zone', isInEntryZone: true };
  }
  if (posture === 'limit_pullback_only') {
    return {
      label: `CHASE GUARD · +${chaseProgressPct ?? 0}% to TP1`,
      tone: 'risk',
      isInEntryZone: false,
    };
  }
  if (currentPrice > hi) {
    const distPct = ((currentPrice - hi) / currentPrice) * 100;
    return {
      label: `${distPct.toFixed(2)}% above Entry · Set Limit`,
      tone: distPct <= 0.15 ? 'near' : 'neutral',
      isInEntryZone: false,
    };
  }
  const distPct = ((lo - currentPrice) / currentPrice) * 100;
  return {
    label: `${distPct.toFixed(2)}% below Entry · Set Limit`,
    tone: distPct <= 0.15 ? 'near' : 'neutral',
    isInEntryZone: false,
  };
}

function parseZoneNumbers(zoneText?: string): [number | undefined, number | undefined] {
  if (!zoneText || zoneText === '—') return [undefined, undefined];
  const matches = zoneText.replace(/,/g, '').match(/-?\d+(\.\d+)?/g);
  if (!matches || matches.length < 2) return [undefined, undefined];
  const a = Number(matches[0]);
  const b = Number(matches[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [undefined, undefined];
  return [Math.min(a, b), Math.max(a, b)];
}

function buildCandleScanSignature(assets: MarketAsset[], tf: Timeframe): string {
  const parts: string[] = [];
  for (const a of assets) {
    if (!isIctEligibleAsset(a)) continue;
    const candles = a.chartCandles?.[tf] ?? a.chartCandles?.['15m'];
    const len = Array.isArray(candles) ? candles.length : 0;
    const lastT = len > 0 ? candles![len - 1].t : 0;
    parts.push(`${a.id}:${len}:${lastT}`);
  }
  return parts.join('|');
}

function toAlertSignalFromSdcv(sdcv: SdCandleVolumeSignal): IctSignalAnalysis {
  return {
    assetId: sdcv.assetId,
    symbol: sdcv.symbol,
    name: sdcv.name,
    direction: sdcv.direction,
    confidence: sdcv.confidence,
    setupName: `${sdcv.zoneStatus} ${sdcv.zoneBias} · ${sdcv.candlePattern} (${sdcv.volumeRatio.toFixed(2)}x)`,
    pdZone: sdcv.zoneBias === 'Demand' ? 'Discount' : sdcv.zoneBias === 'Supply' ? 'Premium' : 'Equilibrium',
    entryZone: sdcv.entryZone,
    stopLoss: sdcv.stopLoss,
    targetPrice: sdcv.tp2,
    riskReward: sdcv.riskReward,
    triggers: sdcv.triggers,
    timeframe: sdcv.timeframe,
    currentPrice: sdcv.currentPrice,
    decimals: sdcv.decimals,
    currencyPrefix: sdcv.currencyPrefix,
    unitSuffix: sdcv.unitSuffix,
    evaluatedAt: sdcv.evaluatedAt,
    invalidationNote: sdcv.invalidationTrigger,
    tp1: sdcv.tp1,
    tp2: sdcv.tp2,
    atrPct: sdcv.atr15mPct,
    volatilityThresholdPct: sdcv.volatilityMinPct,
    volatilityMaxPct: sdcv.volatilityMaxPct,
    volatilityStatus: sdcv.volatilityStatus,
    volatilityPassed: sdcv.volatilityPassed,
    atrSource: sdcv.atrSource,
    executionStatus: sdcv.executionStatus,
    projectedLevelsSummary: sdcv.projectedLevelsSummary,
    assetClassLabel: sdcv.assetClassLabel,
    entryLowNum: sdcv.entryLowNum,
    entryHighNum: sdcv.entryHighNum,
    stopLossNum: sdcv.stopLossNum,
    tp1Num: sdcv.tp1Num,
    tp2Num: sdcv.tp2Num,
    isClosedCandleConfirmed: sdcv.isClosedCandleConfirmed,
    candleStageLabel: sdcv.candleStageLabel,
    newsBlackoutActive: sdcv.newsBlackoutActive,
    newsBlackoutReason: sdcv.newsBlackoutReason,
    isRealOhlc: sdcv.isRealOhlc,
    setupGrade: sdcv.setupGrade,
    isAPlusSetup: sdcv.isAPlusSetup,
    usdExposure: sdcv.usdExposure,
    executionPosture: sdcv.executionPosture,
    recommendedOrderType: sdcv.recommendedOrderType,
    limitEntryPriceNum: sdcv.limitEntryPriceNum,
    limitRr: sdcv.limitRr,
    spotRr: sdcv.spotRr,
    chaseProgressPct: sdcv.chaseProgressPct,
    hasRunAway: sdcv.hasRunAway,
    biasVerdict: sdcv.biasVerdict,
    clearanceSummary: sdcv.clearanceSummary,
    clearanceGates: sdcv.clearanceGates,
    dxyConfluenceNote: sdcv.dxyConfluenceNote,
  };
}

export const IctRadarView: React.FC<IctRadarViewProps> = ({
  assets,
  alerts,
  economicEvents,
  ictPopupsEnabled,
  onToggleIctPopups,
  onScanIct,
  onTriggerIctAlert,
  onLoadTimeframe,
  onInspectChart,
  onSyncRadarConfig,
  signalHistory = [],
  signalStats,
  signalCloudSynced = false,
  verificationMetrics,
  onAnnotateSignal,
  onDeleteSignal,
  onClearClosedSignals,
  onInspectSignal,
  priorityStreamStatus = 'http-fallback',
  prioritySources = {},
  jumpTarget,
  flashMap = {},
  volatility5mMap = {},
  searchQuery = '',
}) => {
  const initialPrefsRef = useRef<RadarPrefs | null>(null);
  if (!initialPrefsRef.current) {
    initialPrefsRef.current = loadRadarPrefs();
  }
  const initialPrefs = initialPrefsRef.current;

  const [strategyMode, setStrategyMode] = useState<RadarStrategyMode>(initialPrefs.strategyMode);
  const [selectedTf, setSelectedTf] = useState<Timeframe>(initialPrefs.selectedTf);
  const [scopeFilter, setScopeFilter] = useState<InstrumentScopeFilter>(initialPrefs.scopeFilter);
  const [sortMode, setSortMode] = useState<IctSortMode>(initialPrefs.sortMode);
  const [focusedAssetId, setFocusedAssetId] = useState<string>('XAUUSD');
  const [volatilityFilterEnabled, setVolatilityFilterEnabled] = useState<boolean>(
    initialPrefs.volatilityFilterEnabled
  );
  const [newsBlackoutEnabled, setNewsBlackoutEnabled] = useState<boolean>(
    initialPrefs.newsBlackoutEnabled
  );
  const [copiedTicket, setCopiedTicket] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [localFlashMap, setLocalFlashMap] = useState<Record<string, 'gain' | 'loss'>>({});
  const prevPriceMapRef = useRef<Record<string, number>>({});
  const flashTimersRef = useRef<Record<string, number>>({});
  const requestedMtfRef = useRef<Set<string>>(new Set());

  // Local tick-change flash detector in sync with live price updates
  useEffect(() => {
    const prevPrices = prevPriceMapRef.current;
    const updates: Array<{ id: string; dir: 'gain' | 'loss' }> = [];

    for (const asset of assets) {
      if (!Number.isFinite(asset.price) || asset.price <= 0) continue;
      const prev = prevPrices[asset.id];
      if (typeof prev === 'number' && prev > 0 && asset.price !== prev) {
        updates.push({ id: asset.id, dir: asset.price > prev ? 'gain' : 'loss' });
      }
      prevPrices[asset.id] = asset.price;
    }

    if (updates.length === 0) return;

    setLocalFlashMap((curr) => {
      const next = { ...curr };
      for (const u of updates) {
        next[u.id] = u.dir;
      }
      return next;
    });

    for (const u of updates) {
      if (flashTimersRef.current[u.id]) {
        window.clearTimeout(flashTimersRef.current[u.id]);
      }
      flashTimersRef.current[u.id] = window.setTimeout(() => {
        setLocalFlashMap((curr) => {
          if (!curr[u.id]) return curr;
          const copy = { ...curr };
          delete copy[u.id];
          return copy;
        });
        delete flashTimersRef.current[u.id];
      }, 650);
    }
  }, [assets]);

  useEffect(() => {
    const timers = flashTimersRef.current;
    return () => {
      for (const timerId of Object.values(timers)) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const nextPrefs: RadarPrefs = {
        strategyMode,
        selectedTf,
        scopeFilter,
        sortMode,
        volatilityFilterEnabled,
        newsBlackoutEnabled,
      };
      window.localStorage.setItem(RADAR_PREFS_STORAGE_KEY, JSON.stringify(nextPrefs));
    } catch {
      // ignore storage quota errors
    }
    onSyncRadarConfig?.({
      strategyMode,
      timeframe: selectedTf,
      enforceVolatilityFilter: volatilityFilterEnabled,
      enforceNewsBlackout: newsBlackoutEnabled,
    });
  }, [
    strategyMode,
    selectedTf,
    scopeFilter,
    sortMode,
    volatilityFilterEnabled,
    newsBlackoutEnabled,
    onSyncRadarConfig,
  ]);

  useEffect(() => {
    if (!jumpTarget) return;
    if (jumpTarget.assetId === 'BTCUSD' || jumpTarget.assetId === 'XAUUSD') {
      setFocusedAssetId(jumpTarget.assetId);
    }
    if (jumpTarget.strategy === 'sdcv' || jumpTarget.strategy === 'ict') {
      setStrategyMode(jumpTarget.strategy);
    }
    if (jumpTarget.timeframe && ICT_TIMEFRAMES.includes(jumpTarget.timeframe)) {
      setSelectedTf(jumpTarget.timeframe);
    }
  }, [jumpTarget]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Ensure multi-timeframe OHLCV data (4H, 1H, 15M, 5M) is fetched strictly for BTC/USD & XAU/USD
  useEffect(() => {
    if (!onLoadTimeframe) return;
    const tfsToWarm = Array.from(new Set<Timeframe>([...MTF_REQUIRED_TFS, selectedTf]));
    for (const asset of assets) {
      if (!isIctEligibleAsset(asset)) continue;
      for (const tf of tfsToWarm) {
        const key = `${asset.id}:${tf}`;
        if (requestedMtfRef.current.has(key)) continue;
        const candles = asset.chartCandles?.[tf];
        const series = asset.chartSeries?.[tf];
        const hasBars =
          (Array.isArray(candles) && candles.length >= 10) ||
          (Array.isArray(series) && series.length >= 10);
        if (!hasBars) {
          requestedMtfRef.current.add(key);
          onLoadTimeframe(asset.id, tf);
        }
      }
    }
  }, [assets, selectedTf, onLoadTimeframe]);

  // Throttle heavy signal scans (4s cap) unless structural OHLC bars or TF/filters change,
  // while keeping live spot plaques, proximity & tick flashes instant every 1s.
  const [scanAssets, setScanAssets] = useState<MarketAsset[]>(assets);
  const lastScanAtRef = useRef<number>(0);
  const lastScanSigRef = useRef<string>('');
  const scanTimerRef = useRef<number | null>(null);
  const latestAssetsRef = useRef<MarketAsset[]>(assets);
  latestAssetsRef.current = assets;

  useEffect(() => {
    const nextSig = `${selectedTf}::${buildCandleScanSignature(assets, selectedTf)}`;
    const now = Date.now();
    const sigChanged = nextSig !== lastScanSigRef.current;
    const elapsed = now - lastScanAtRef.current;

    if (sigChanged || elapsed >= 4000) {
      if (scanTimerRef.current !== null) {
        window.clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      lastScanSigRef.current = nextSig;
      lastScanAtRef.current = now;
      setScanAssets(assets);
      return;
    }

    if (scanTimerRef.current === null) {
      const waitMs = Math.max(250, 4000 - elapsed);
      scanTimerRef.current = window.setTimeout(() => {
        scanTimerRef.current = null;
        lastScanSigRef.current = `${selectedTf}::${buildCandleScanSignature(
          latestAssetsRef.current,
          selectedTf
        )}`;
        lastScanAtRef.current = Date.now();
        setScanAssets(latestAssetsRef.current);
      }, waitMs);
    }
  }, [assets, selectedTf]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current !== null) {
        window.clearTimeout(scanTimerRef.current);
      }
    };
  }, []);

  const allSignals = useMemo(() => {
    const prefMap: Record<string, Timeframe> = {};
    for (const a of scanAssets) {
      prefMap[a.id] = selectedTf;
    }
    return scanAllIctSignals(
      scanAssets,
      prefMap,
      volatilityFilterEnabled,
      economicEvents,
      newsBlackoutEnabled
    );
  }, [
    scanAssets,
    selectedTf,
    volatilityFilterEnabled,
    economicEvents,
    newsBlackoutEnabled,
  ]);

  const allSdcvSignals = useMemo(() => {
    const prefMap: Record<string, Timeframe> = {};
    for (const a of scanAssets) {
      prefMap[a.id] = selectedTf;
    }
    return scanAllSdCandleVolumeSignals(
      scanAssets,
      prefMap,
      volatilityFilterEnabled,
      economicEvents,
      newsBlackoutEnabled
    );
  }, [
    scanAssets,
    selectedTf,
    volatilityFilterEnabled,
    economicEvents,
    newsBlackoutEnabled,
  ]);

  const dualConfluenceByAsset = useMemo(() => {
    const sdMap = new Map(allSdcvSignals.map((s) => [s.assetId, s.direction]));
    const out = new Map<string, 'BUY' | 'SELL'>();
    for (const sig of allSignals) {
      if (sig.direction === 'NEUTRAL') continue;
      if (sdMap.get(sig.assetId) === sig.direction) {
        out.set(sig.assetId, sig.direction);
      }
    }
    return out;
  }, [allSignals, allSdcvSignals]);

  const assetById = useMemo(
    () => new Map(assets.map((a) => [a.id, a])),
    [assets]
  );

  const filteredSignals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allSignals.filter((sig) => {
      if (scopeFilter === 'a-plus' && !sig.isAPlusSetup && sig.setupGrade !== 'A+') return false;
      if (scopeFilter === 'actionable' && sig.direction === 'NEUTRAL') return false;
      if (scopeFilter === 'btcusd' && sig.assetId !== 'BTCUSD') return false;
      if (scopeFilter === 'xauusd' && sig.assetId !== 'XAUUSD') return false;
      if (!q) return true;
      return (
        sig.symbol.toLowerCase().includes(q) ||
        sig.name.toLowerCase().includes(q) ||
        sig.setupName.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const aActive = a.direction === 'NEUTRAL' ? 0 : 1;
      const bActive = b.direction === 'NEUTRAL' ? 0 : 1;
      if (aActive !== bActive) return bActive - aActive;

      if (sortMode === 'volatility') {
        const volDiff = (b.atrPct ?? 0) - (a.atrPct ?? 0);
        if (Math.abs(volDiff) > 1e-6) return volDiff;
      } else {
        const timeDiff = b.evaluatedAt - a.evaluatedAt;
        if (timeDiff !== 0) return timeDiff;
      }
      return b.confidence - a.confidence;
    });
  }, [allSignals, scopeFilter, searchQuery, sortMode]);

  const filteredSdcvSignals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allSdcvSignals.filter((sig) => {
      if (scopeFilter === 'a-plus' && !sig.isAPlusSetup && sig.setupGrade !== 'A+') return false;
      if (scopeFilter === 'actionable' && sig.direction === 'NEUTRAL') return false;
      if (scopeFilter === 'btcusd' && sig.assetId !== 'BTCUSD') return false;
      if (scopeFilter === 'xauusd' && sig.assetId !== 'XAUUSD') return false;
      if (!q) return true;
      return (
        sig.symbol.toLowerCase().includes(q) ||
        sig.name.toLowerCase().includes(q) ||
        sig.candlePattern.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      const aActive = a.direction === 'NEUTRAL' ? 0 : 1;
      const bActive = b.direction === 'NEUTRAL' ? 0 : 1;
      if (aActive !== bActive) return bActive - aActive;

      if (sortMode === 'volatility') {
        const volDiff = b.atr15mPct - a.atr15mPct;
        if (Math.abs(volDiff) > 1e-6) return volDiff;
      } else {
        const timeDiff = b.evaluatedAt - a.evaluatedAt;
        if (timeDiff !== 0) return timeDiff;
      }
      return b.confidence - a.confidence;
    });
  }, [allSdcvSignals, scopeFilter, searchQuery, sortMode]);

  const focusedSignal = useMemo(() => {
    const targetAsset = assetById.get(focusedAssetId);
    if (targetAsset && isIctEligibleAsset(targetAsset)) {
      return (
        allSignals.find((s) => s.assetId === targetAsset.id) ??
        computeIctSignal(
          targetAsset,
          selectedTf,
          volatilityFilterEnabled,
          economicEvents,
          newsBlackoutEnabled
        )
      );
    }
    return filteredSignals[0] ?? allSignals[0] ?? null;
  }, [
    assetById,
    focusedAssetId,
    allSignals,
    filteredSignals,
    selectedTf,
    volatilityFilterEnabled,
    economicEvents,
    newsBlackoutEnabled,
  ]);

  const focusedSdcvSignal = useMemo(() => {
    const targetAsset = assetById.get(focusedAssetId);
    if (targetAsset && isIctEligibleAsset(targetAsset)) {
      return (
        allSdcvSignals.find((s) => s.assetId === targetAsset.id) ??
        computeSdCandleVolumeSignal(
          targetAsset,
          selectedTf,
          volatilityFilterEnabled,
          economicEvents,
          newsBlackoutEnabled
        )
      );
    }
    return filteredSdcvSignals[0] ?? allSdcvSignals[0] ?? null;
  }, [
    assetById,
    focusedAssetId,
    allSdcvSignals,
    filteredSdcvSignals,
    selectedTf,
    volatilityFilterEnabled,
    economicEvents,
    newsBlackoutEnabled,
  ]);

  const persistentRadarSignals = useMemo(
    () =>
      signalHistory.filter(
        (r) =>
          r.sourceEngine === 'ict_radar' ||
          r.sourceEngine === 'sdcv_radar' ||
          r.assetClass === 'crypto' ||
          r.assetClass === 'commodity'
      ),
    [signalHistory]
  );

  const executionPerf = useMemo(
    () => computeExecutionTypePerformance(signalHistory, alerts),
    [signalHistory, alerts]
  );

  const expectancyMatrix = useMemo(
    () => computeConfluenceExpectancyMatrix(signalHistory),
    [signalHistory]
  );

  const sizerSurvival = useMemo(() => {
    const closed = persistentRadarSignals
      .filter(
        (r) =>
          r.status === 'SL_HIT' ||
          r.status === 'TP1_HIT' ||
          r.status === 'TP2_HIT' ||
          r.userOutcome === 'LOSS' ||
          r.userOutcome === 'WIN'
      )
      .sort((a, b) => (b.closedAtMs ?? b.createdAtMs) - (a.closedAtMs ?? a.createdAtMs));
    let lossStreak = 0;
    for (const r of closed) {
      if (r.userOutcome === 'LOSS' || r.status === 'SL_HIT') lossStreak++;
      else break;
    }
    if (lossStreak >= 3) return { multiplier: 0, mode: 'LOCKDOWN (3L Streak)' };
    if (lossStreak >= 2 || expectancyMatrix.driftWarning) {
      return { multiplier: 0.5, mode: lossStreak >= 2 ? 'CAUTION (2L Streak)' : 'CAUTION (Drift)' };
    }
    return { multiplier: 1.0, mode: 'NORMAL' };
  }, [persistentRadarSignals, expectancyMatrix.driftWarning]);

  const [enforceValidationDiscipline, setEnforceValidationDiscipline] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stocks-enforce-validation-discipline');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const handleToggleValidationDiscipline = () => {
    setEnforceValidationDiscipline((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('stocks-enforce-validation-discipline', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const focusedIctMetaEval = useMemo(
    () =>
      evaluateTwoStageMetaLabel(
        focusedSignal ?? null,
        signalHistory,
        expectancyMatrix,
        enforceValidationDiscipline
      ),
    [focusedSignal, signalHistory, expectancyMatrix, enforceValidationDiscipline]
  );

  const focusedSdcvMetaEval = useMemo(
    () =>
      evaluateTwoStageMetaLabel(
        focusedSdcvSignal ?? null,
        signalHistory,
        expectancyMatrix,
        enforceValidationDiscipline
      ),
    [focusedSdcvSignal, signalHistory, expectancyMatrix, enforceValidationDiscipline]
  );

  const effectiveIctSizer = useMemo(() => {
    const baseMult = sizerSurvival.multiplier;
    const metaMult = focusedIctMetaEval.effectiveSizeMultiplier;
    if (!enforceValidationDiscipline) {
      return { multiplier: baseMult, mode: sizerSurvival.mode };
    }
    if (baseMult === 0 || metaMult === 0) {
      return {
        multiplier: 0,
        mode:
          focusedIctMetaEval.discipline.status === 'HALT_RECALIBRATE'
            ? focusedIctMetaEval.discipline.statusLabel
            : focusedIctMetaEval.verdict === 'FILTER_PASS'
              ? 'META-FILTER PASS (0x)'
              : sizerSurvival.mode,
      };
    }
    const combined = Number(Math.min(baseMult, metaMult).toFixed(2));
    const modeLabel =
      metaMult < baseMult
        ? `META ${metaMult.toFixed(2)}x · ${focusedIctMetaEval.discipline.statusLabel}`
        : metaMult > 1 && baseMult >= 1
          ? `META ${metaMult.toFixed(2)}x · Validated`
          : sizerSurvival.mode;
    return {
      multiplier: baseMult >= 1 ? metaMult : combined,
      mode: modeLabel,
    };
  }, [sizerSurvival, focusedIctMetaEval, enforceValidationDiscipline]);

  const topSwitchAssets = useMemo(() => {
    const ids = ['XAUUSD', 'BTCUSD'] as const;
    return ids.map((id) => {
      const asset = assetById.get(id);
      const ictSig = allSignals.find((s) => s.assetId === id);
      const sdSig = allSdcvSignals.find((s) => s.assetId === id);
      const activeSig = strategyMode === 'ict' ? ictSig : sdSig;
      const dir = activeSig?.direction ?? 'NEUTRAL';
      const posture = activeSig?.executionPosture;
      const badge = getDirectionBadgeStyle(
        dir,
        activeSig
          ? strategyMode === 'ict'
            ? resolveIctExpectedBias(activeSig as IctSignalAnalysis)
            : resolveSdcvExpectedBias(activeSig as SdCandleVolumeSignal)
          : 'NEUTRAL',
        posture
      );
      return {
        id,
        label: id === 'BTCUSD' ? 'BTC/USD' : 'XAU/USD',
        subLabel: id === 'BTCUSD' ? 'Bitcoin Spot' : 'Gold Spot',
        asset,
        badge,
        confidence: activeSig?.confidence ?? null,
      };
    });
  }, [assetById, allSignals, allSdcvSignals, strategyMode]);

  const radarLogSummary = useMemo(() => {
    let filled = 0;
    let wins = 0;
    let losses = 0;
    let bes = 0;
    let journalWins = 0;
    let journalLosses = 0;
    for (const r of persistentRadarSignals) {
      const isFilled =
        r.zoneFillVerified === true ||
        r.status === 'RUNNING' ||
        r.status === 'TP1_HIT' ||
        r.status === 'TP2_HIT' ||
        r.status === 'SL_HIT' ||
        r.status === 'BE_CLOSED';
      if (isFilled) filled += 1;
      if (r.status === 'TP1_HIT' || r.status === 'TP2_HIT') wins += 1;
      else if (r.status === 'SL_HIT') losses += 1;
      else if (r.status === 'BE_CLOSED') bes += 1;
      if (r.userOutcome === 'WIN') journalWins += 1;
      else if (r.userOutcome === 'LOSS') journalLosses += 1;
    }
    const decided = wins + losses;
    const hitRate = decided > 0 ? Math.round((wins / decided) * 100) : null;
    const journalDecided = journalWins + journalLosses;
    const journalWr =
      journalDecided > 0 ? Math.round((journalWins / journalDecided) * 100) : null;
    return {
      total: persistentRadarSignals.length,
      filled,
      wins,
      losses,
      bes,
      hitRate,
      journalWins,
      journalLosses,
      journalDecided,
      journalWr,
    };
  }, [persistentRadarSignals]);

  const actionableCounts = useMemo(() => {
    let buys = 0;
    let sells = 0;
    let aPlus = 0;
    const longUsdSymbols: string[] = [];
    const shortUsdSymbols: string[] = [];
    const source = strategyMode === 'ict' ? allSignals : allSdcvSignals;
    for (const s of source) {
      if (s.isAPlusSetup || s.setupGrade === 'A+') {
        aPlus += 1;
      }
      if (s.direction === 'BUY') buys += 1;
      else if (s.direction === 'SELL') sells += 1;
      if (s.direction === 'BUY' || s.direction === 'SELL') {
        if (s.usdExposure === 'LONG_USD') longUsdSymbols.push(`${s.symbol} (${s.direction})`);
        else if (s.usdExposure === 'SHORT_USD') shortUsdSymbols.push(`${s.symbol} (${s.direction})`);
      }
    }
    const usdCorrelationWarning =
      longUsdSymbols.length >= 2
        ? { exposure: 'LONG USD', pairs: longUsdSymbols }
        : shortUsdSymbols.length >= 2
          ? { exposure: 'SHORT USD', pairs: shortUsdSymbols }
          : null;
    return { buys, sells, total: buys + sells, aPlus, usdCorrelationWarning };
  }, [strategyMode, allSignals, allSdcvSignals]);

  const handleSelectTimeframe = (tf: Timeframe) => {
    setSelectedTf(tf);
    if (onLoadTimeframe) {
      for (const sig of allSignals) {
        onLoadTimeframe(sig.assetId, tf);
      }
    }
  };

  const activeFocusedId =
    strategyMode === 'ict' ? focusedSignal?.assetId : focusedSdcvSignal?.assetId;
  const focusedSpotAsset = activeFocusedId ? assetById.get(activeFocusedId) : undefined;

  const focusedIctExpectedBias: DirectionalBias = focusedSignal
    ? resolveIctExpectedBias(focusedSignal)
    : 'NEUTRAL';
  const focusedIctLivePosture = useMemo(() => {
    if (!focusedSignal) return null;
    const livePx =
      focusedSignal.assetId === focusedSpotAsset?.id
        ? focusedSpotAsset.price
        : assetById.get(focusedSignal.assetId)?.price ?? focusedSignal.currentPrice;
    const atrAbs =
      typeof focusedSignal.atrPct === 'number' && livePx > 0
        ? livePx * (focusedSignal.atrPct / 100)
        : undefined;
    return evaluateLiveExecutionPosture({
      direction: focusedSignal.direction,
      setupArmed: focusedSignal.direction !== 'NEUTRAL',
      armedBias: focusedIctExpectedBias === 'SELL' ? 'SELL' : 'BUY',
      currentPrice: livePx,
      entryLow: focusedSignal.entryLowNum,
      entryHigh: focusedSignal.entryHighNum,
      stopLoss: focusedSignal.stopLossNum,
      tp1: focusedSignal.tp1Num,
      tp2: focusedSignal.tp2Num,
      atr: atrAbs,
      executionStatus: focusedSignal.executionStatus,
      exactLimitOverride: focusedSignal.limitEntryPriceNum,
    });
  }, [focusedSignal, focusedSpotAsset, assetById, focusedIctExpectedBias]);

  const focusedIctBadge = focusedSignal
    ? getDirectionBadgeStyle(
        focusedSignal.direction,
        focusedIctExpectedBias,
        focusedIctLivePosture?.posture ?? focusedSignal.executionPosture
      )
    : getDirectionBadgeStyle('NEUTRAL', 'NEUTRAL');
  const focusedSignalLabel = focusedIctBadge.label;

  const focusedSdcvExpectedBias: DirectionalBias = focusedSdcvSignal
    ? resolveSdcvExpectedBias(focusedSdcvSignal)
    : 'NEUTRAL';
  const focusedSdcvLivePosture = useMemo(() => {
    if (!focusedSdcvSignal) return null;
    const livePx =
      focusedSdcvSignal.assetId === focusedSpotAsset?.id
        ? focusedSpotAsset.price
        : assetById.get(focusedSdcvSignal.assetId)?.price ?? focusedSdcvSignal.currentPrice;
    const atrAbs = livePx > 0 ? livePx * (focusedSdcvSignal.atr15mPct / 100) : undefined;
    return evaluateLiveExecutionPosture({
      direction: focusedSdcvSignal.direction,
      setupArmed: focusedSdcvSignal.direction !== 'NEUTRAL',
      armedBias: focusedSdcvExpectedBias === 'SELL' ? 'SELL' : 'BUY',
      currentPrice: livePx,
      entryLow: focusedSdcvSignal.entryLowNum,
      entryHigh: focusedSdcvSignal.entryHighNum,
      stopLoss: focusedSdcvSignal.stopLossNum,
      tp1: focusedSdcvSignal.tp1Num,
      tp2: focusedSdcvSignal.tp2Num,
      atr: atrAbs,
      executionStatus: focusedSdcvSignal.executionStatus,
      exactLimitOverride: focusedSdcvSignal.proximalLineNum ?? focusedSdcvSignal.limitEntryPriceNum,
    });
  }, [focusedSdcvSignal, focusedSpotAsset, assetById, focusedSdcvExpectedBias]);

  const focusedSdcvBadge = focusedSdcvSignal
    ? getDirectionBadgeStyle(
        focusedSdcvSignal.direction,
        focusedSdcvExpectedBias,
        focusedSdcvLivePosture?.posture ?? focusedSdcvSignal.executionPosture
      )
    : getDirectionBadgeStyle('NEUTRAL', 'NEUTRAL');
  const focusedSdcvLabel = focusedSdcvBadge.label;

  const confluenceChecks = useMemo(() => {
    if (!focusedSignal) return [];
    return getConfluenceChecks(focusedSignal, true);
  }, [focusedSignal]);

  const activeCountTotal =
    strategyMode === 'ict' ? allSignals.length : allSdcvSignals.length;
  const activeDualConfluence = activeFocusedId
    ? dualConfluenceByAsset.get(activeFocusedId)
    : undefined;

  const focusedProximity = useMemo(() => {
    if (strategyMode === 'ict' && focusedSignal) {
      return computeSpotProximity({
        currentPrice: focusedSpotAsset?.price ?? focusedSignal.currentPrice,
        entryLow: focusedSignal.entryLowNum,
        entryHigh: focusedSignal.entryHighNum,
        stopLoss: focusedSignal.stopLossNum,
        tp1: focusedSignal.tp1Num,
        direction: focusedSignal.direction,
        executionStatus: focusedSignal.executionStatus,
        posture: focusedIctLivePosture?.posture ?? focusedSignal.executionPosture,
        chaseProgressPct:
          focusedIctLivePosture?.chaseProgressPct ?? focusedSignal.chaseProgressPct,
      });
    }
    if (strategyMode === 'sdcv' && focusedSdcvSignal) {
      return computeSpotProximity({
        currentPrice: focusedSpotAsset?.price ?? focusedSdcvSignal.currentPrice,
        entryLow: focusedSdcvSignal.entryLowNum,
        entryHigh: focusedSdcvSignal.entryHighNum,
        stopLoss: focusedSdcvSignal.stopLossNum,
        tp1: focusedSdcvSignal.tp1Num,
        direction: focusedSdcvSignal.direction,
        executionStatus: focusedSdcvSignal.executionStatus,
        posture: focusedSdcvLivePosture?.posture ?? focusedSdcvSignal.executionPosture,
        chaseProgressPct:
          focusedSdcvLivePosture?.chaseProgressPct ?? focusedSdcvSignal.chaseProgressPct,
      });
    }
    return { label: 'Evaluating Spot', tone: 'neutral' as const, isInEntryZone: false };
  }, [
    strategyMode,
    focusedSignal,
    focusedSdcvSignal,
    focusedSpotAsset,
    focusedIctLivePosture,
    focusedSdcvLivePosture,
  ]);

  const focusedConfidenceGauge = useMemo(() => {
    const activeSig = strategyMode === 'ict' ? focusedSignal : focusedSdcvSignal;
    if (!activeSig) return null;
    return computeSignalConfidenceGauge(
      volatility5mMap[activeSig.assetId],
      activeSig.confidence,
      activeSig.volatilityPassed
    );
  }, [strategyMode, focusedSignal, focusedSdcvSignal, volatility5mMap]);

  const focusedSpotFlash = activeFocusedId
    ? flashMap[activeFocusedId] ?? localFlashMap[activeFocusedId]
    : undefined;

  const handleCopyTicket = async () => {
    const activeObj = strategyMode === 'ict' ? focusedSignal : focusedSdcvSignal;
    if (!activeObj) return;
    const livePosture =
      strategyMode === 'ict' ? focusedIctLivePosture : focusedSdcvLivePosture;
    const dirLabel =
      strategyMode === 'ict' ? focusedIctBadge.label : focusedSdcvBadge.label;
    const isWait = activeObj.direction === 'NEUTRAL';
    const spotStr = focusedSpotAsset
      ? formatAssetPrice(focusedSpotAsset)
      : String(activeObj.currentPrice);
    const limitStr =
      typeof livePosture?.limitEntryPriceNum === 'number'
        ? formatNumericWithAsset(livePosture.limitEntryPriceNum, focusedSpotAsset, activeObj.decimals)
        : undefined;
    const biasWord =
      activeObj.direction === 'BUY'
        ? 'BULLISH (LONG)'
        : activeObj.direction === 'SELL'
          ? 'BEARISH (SHORT)'
          : 'FLAT / NO TRADE';
    const orderLine = isWait
      ? 'Placement: NO ORDER — WAIT'
      : livePosture?.posture === 'enter_now'
        ? `Placement: ${activeObj.direction} MARKET (IN ZONE)`
        : livePosture?.posture === 'limit_pullback_only'
          ? `Placement: ${activeObj.direction} LIMIT PULLBACK @ ${limitStr ?? activeObj.entryZone} (NO CHASE)`
          : `Placement: ${activeObj.direction} LIMIT @ ${limitStr ?? activeObj.entryZone}`;
    const rrComparisonLine =
      typeof livePosture?.spotRr === 'number' || typeof livePosture?.limitRr === 'number'
        ? `R:R Telemetry: Spot 1:${(livePosture?.spotRr ?? 0).toFixed(1)} vs Limit 1:${(livePosture?.limitRr ?? 0).toFixed(1)}`
        : '';
    const lines = [
      `${activeObj.symbol} · ${strategyMode === 'ict' ? 'ICT 2022 Model' : 'Canonical S&D'} · ${dirLabel} (${activeObj.confidence}%)`,
      `Verdict: ${activeObj.biasVerdict ?? biasWord}${activeObj.clearanceSummary ? ` · ${activeObj.clearanceSummary}` : ''}`,
      orderLine,
      `Spot: ${spotStr} (${focusedProximity.label}) · Entry TF: ${activeObj.timeframe}`,
      `${isWait ? 'Projected Zone Ref' : 'Entry Zone'}: ${activeObj.entryZone}`,
      `${isWait ? 'Invalidation Ref' : 'Hard Stop Loss'}: ${activeObj.stopLoss}`,
      strategyMode === 'ict' && focusedSignal
        ? `TP1 (50% + SL->BE): ${focusedSignal.tp1 ?? focusedSignal.targetPrice} | TP2 (Pool): ${focusedSignal.tp2 ?? focusedSignal.targetPrice} (${focusedSignal.riskReward})`
        : focusedSdcvSignal
          ? `TP1 (50% + SL->BE): ${focusedSdcvSignal.tp1} | TP2 (Opposing): ${focusedSdcvSignal.tp2} (${focusedSdcvSignal.riskReward})`
          : '',
      rrComparisonLine,
      `Invalidation: ${activeObj.invalidationTrigger ?? ''}`,
    ].filter(Boolean);
    const text = lines.join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedTicket(true);
      window.setTimeout(() => setCopiedTicket(false), 1800);
    } catch {
      setCopiedTicket(true);
      window.setTimeout(() => setCopiedTicket(false), 1800);
    }
  };

  return (
    <div
      data-testid="ict-radar-view"
      className="max-w-[1440px] w-full mx-auto px-4 lg:px-6 py-5 pb-24 flex flex-col gap-5"
    >
      {/* Top Precision Radar Header + Strategy Switcher + Pop-up Notification Toggle */}
      <section className="rounded-2xl liquid-glass-card p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[#0071E3]/14 dark:bg-[#F59E0B]/16 border border-[#0071E3]/30 dark:border-[#F59E0B]/35 flex items-center justify-center shrink-0">
                {strategyMode === 'ict' ? (
                  <Crosshair className="w-5 h-5 text-[#0071E3] dark:text-[#FBBF24]" />
                ) : (
                  <CandlestickChart className="w-5 h-5 text-[#0071E3] dark:text-[#FBBF24]" />
                )}
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white">
                  {strategyMode === 'ict'
                    ? 'ICT Liquidity, OTE & Session Sweep Radar'
                    : 'Supply & Demand · Candle Reading & Volume System'}
                </h1>
                <p className="text-xs text-[#4A4D57] dark:text-[#9EB5C8]">
                  {strategyMode === 'ict'
                    ? 'Asset-Tuned ICT 2022 (BTC/USD & XAU/USD) · Sweep + MSS + 50% CE / OTE + 5-Gate Clearance'
                    : 'Asset-Tuned S&D (BTC/USD & XAU/USD) · Fresh ERC Zones + Candle Confirmation + DXY Confluence'}
                </p>
              </div>
            </div>
          </div>

          {/* Controls: How-To Guide + 15m ATR Vol Filter + Pop-up Switch + Scan */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              data-testid="ict-guide-toggle"
              aria-expanded={showGuide}
              onClick={() => setShowGuide((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                showGuide
                  ? 'bg-[#0071E3]/14 dark:bg-[#F59E0B]/16 border-[#0071E3]/40 dark:border-[#F59E0B]/45 text-[#005BB8] dark:text-[#FBBF24]'
                  : 'liquid-glass-pill text-[#1C1C1E] dark:text-[#E5E5EA] border-[#C7C7CC] dark:border-white/15'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              <span>How to Use</span>
              {showGuide ? (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>

            <button
              type="button"
              data-testid="ict-vol-filter-toggle"
              role="switch"
              aria-checked={volatilityFilterEnabled}
              onClick={() => setVolatilityFilterEnabled((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                volatilityFilterEnabled
                  ? 'bg-[#0071E3]/14 dark:bg-[#F59E0B]/16 border-[#0071E3]/40 dark:border-[#F59E0B]/45 text-[#005BB8] dark:text-[#FBBF24]'
                  : 'liquid-glass-pill text-[#4A4D57] dark:text-[#C7CBD6] border-[#C7C7CC] dark:border-white/15'
              }`}
              title="Only triggers BUY/SELL when 15-minute ATR% sits inside the safe min–max range for BTC/USD and XAU/USD (blocks dead chop and erratic whipsaw spikes)."
            >
              <Activity className="w-3.5 h-3.5 shrink-0" />
              <span>Vol Filter:</span>
              <span className="font-extrabold uppercase tracking-wider">
                {volatilityFilterEnabled ? 'On' : 'Off'}
              </span>
            </button>

            <button
              type="button"
              data-testid="ict-news-guard-toggle"
              role="switch"
              aria-checked={newsBlackoutEnabled}
              onClick={() => setNewsBlackoutEnabled((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                newsBlackoutEnabled
                  ? 'bg-[#0071E3]/14 dark:bg-[#F59E0B]/16 border-[#0071E3]/40 dark:border-[#F59E0B]/45 text-[#005BB8] dark:text-[#FBBF24]'
                  : 'liquid-glass-pill text-[#4A4D57] dark:text-[#C7CBD6] border-[#C7C7CC] dark:border-white/15'
              }`}
              title="Automatically holds signals on WAIT 15 min before through 20 min after HIGH-impact macro calendar releases matching USD or pair currency."
            >
              <Newspaper className="w-3.5 h-3.5 shrink-0" />
              <span>News Guard:</span>
              <span className="font-extrabold uppercase tracking-wider">
                {newsBlackoutEnabled ? 'On' : 'Off'}
              </span>
            </button>

            <button
              type="button"
              data-testid="ict-popup-toggle"
              role="switch"
              aria-checked={ictPopupsEnabled}
              onClick={onToggleIctPopups}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                ictPopupsEnabled
                  ? 'bg-[#16A34A]/16 dark:bg-[#22C55E]/18 border-[#16A34A]/45 text-[#0B5D2A] dark:text-[#4ADE80]'
                  : 'liquid-glass-pill text-[#4A4D57] dark:text-[#C7CBD6] border-[#C7C7CC] dark:border-white/15'
              }`}
              title={
                ictPopupsEnabled
                  ? 'Pop-up toast notifications are Active. Click to deactivate pop-ups while keeping signals logged in this tab.'
                  : 'Pop-up toast notifications are Deactivated. Signals are still recorded in this tab with timestamps.'
              }
            >
              {ictPopupsEnabled ? (
                <Bell className="w-4 h-4 shrink-0" />
              ) : (
                <BellOff className="w-4 h-4 shrink-0" />
              )}
              <span>Pop-up Alerts:</span>
              <span className="font-extrabold uppercase tracking-wider">
                {ictPopupsEnabled ? 'Active' : 'Deactive'}
              </span>
            </button>

            <button
              type="button"
              data-testid="ict-scan-now-btn"
              onClick={() => {
                onScanIct(
                  activeFocusedId,
                  strategyMode,
                  selectedTf,
                  volatilityFilterEnabled,
                  newsBlackoutEnabled
                );
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0066CC] dark:bg-[#B45309] text-white text-xs font-bold shadow-sm hover:brightness-110 transition-all whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span>{strategyMode === 'ict' ? 'Scan ICT Signals' : 'Scan S&D Signals'}</span>
            </button>
          </div>
        </div>

        {/* Top Quick Asset Switcher: Instant XAU/USD <-> BTC/USD Toggle with Priority Live Spot */}
        <div
          data-testid="ict-top-asset-toggle"
          role="tablist"
          aria-label="Switch focused radar instrument between XAU/USD and BTC/USD"
          className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-black/8 dark:border-white/10"
        >
          {topSwitchAssets.map((item) => {
            const isSelected = focusedAssetId === item.id;
            const liveFlash = flashMap?.[item.id] ?? localFlashMap[item.id];
            const chgPct = item.asset?.changePercent ?? 0;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                data-testid={`ict-toggle-${item.id.toLowerCase()}`}
                aria-selected={isSelected}
                onClick={() => {
                  setFocusedAssetId(item.id);
                  if (
                    (scopeFilter === 'btcusd' && item.id !== 'BTCUSD') ||
                    (scopeFilter === 'xauusd' && item.id !== 'XAUUSD')
                  ) {
                    setScopeFilter('all');
                  }
                }}
                className={`w-full text-left rounded-xl px-3.5 py-2.5 border transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-[#0066CC]/10 dark:bg-[#F59E0B]/14 border-[#0066CC]/55 dark:border-[#F59E0B]/60 ring-1 ring-[#0066CC]/25 dark:ring-[#F59E0B]/30 shadow-xs'
                    : 'liquid-glass-inset hover:border-[#0066CC]/40 dark:hover:border-[#F59E0B]/40'
                }`}
              >
                <div className="min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isSelected
                          ? 'bg-[#16A34A] dark:bg-[#4ADE80] animate-pulse'
                          : 'bg-[#8E8E93]/60'
                      }`}
                    />
                    <span className="text-sm font-extrabold tracking-tight text-[#1C1C1E] dark:text-white">
                      {item.label}
                    </span>
                    <span
                      data-testid="ict-priority-stream-badge"
                      className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                        priorityStreamStatus === 'ws-live'
                          ? 'bg-[#16A34A]/14 text-[#0B5D2A] dark:bg-[#22C55E]/16 dark:text-[#4ADE80]'
                          : priorityStreamStatus === 'reconnecting'
                            ? 'bg-[#D97706]/16 text-[#9A5A0A] dark:text-[#FBBF24]'
                            : 'bg-black/[0.05] dark:bg-white/[0.08] text-[#4A4D57] dark:text-[#9EB5C8]'
                      }`}
                    >
                      <Wifi className="w-2.5 h-2.5 shrink-0" />
                      {priorityStreamStatus === 'ws-live'
                        ? `WS Live${prioritySources[item.id] ? ` · ${prioritySources[item.id]}` : ''}`
                        : priorityStreamStatus === 'reconnecting'
                          ? 'WS Reconnecting'
                          : 'HTTP 2s Fallback'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9.5px] font-extrabold uppercase whitespace-nowrap ${item.badge.classes}`}
                    >
                      {item.badge.label}
                    </span>
                    {typeof item.confidence === 'number' && (
                      <span className="text-[10.5px] font-mono font-bold tabular-nums text-[#6C6C70] dark:text-[#9EB5C8]">
                        {item.confidence}% Conf
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono tabular-nums">
                  <div
                    className={`text-base sm:text-lg font-extrabold tracking-tight transition-colors ${
                      liveFlash === 'gain'
                        ? 'text-[#0F7033] dark:text-[#4ADE80]'
                        : liveFlash === 'loss'
                          ? 'text-[#C41C16] dark:text-[#FF6B63]'
                          : 'text-[#1C1C1E] dark:text-white'
                    }`}
                  >
                    {item.asset ? formatAssetPrice(item.asset) : '—'}
                  </div>
                  <div
                    className={`text-[11px] font-bold ${
                      chgPct >= 0
                        ? 'text-[#0F7033] dark:text-[#4ADE80]'
                        : 'text-[#C41C16] dark:text-[#FF6B63]'
                    }`}
                  >
                    {chgPct >= 0 ? '+' : ''}
                    {chgPct.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Strategy System Switcher Bar (Cleanly separates ICT vs Supply/Demand + Candle + Volume) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-black/8 dark:border-white/10">
          <div
            data-testid="radar-strategy-switcher"
            role="tablist"
            aria-label="Radar trading strategy system"
            className="flex sm:inline-flex items-center gap-1 rounded-xl liquid-glass-pill p-1 w-full sm:w-fit max-w-full overflow-x-auto no-scrollbar"
          >
            <button
              type="button"
              role="tab"
              data-testid="strategy-tab-ict"
              aria-selected={strategyMode === 'ict'}
              onClick={() => setStrategyMode('ict')}
              className={`inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                strategyMode === 'ict'
                  ? 'bg-[#0066CC] dark:bg-[#B45309] text-white shadow-sm'
                  : 'text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5 shrink-0" />
              <span>ICT Liquidity &amp; Sweep</span>
            </button>
            <button
              type="button"
              role="tab"
              data-testid="strategy-tab-sdcv"
              aria-selected={strategyMode === 'sdcv'}
              onClick={() => setStrategyMode('sdcv')}
              className={`inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-none px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                strategyMode === 'sdcv'
                  ? 'bg-[#0066CC] dark:bg-[#B45309] text-white shadow-sm'
                  : 'text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>S&amp;D · Candle &amp; Volume</span>
            </button>
          </div>

          <span className="text-[11px] font-mono text-[#4A4D57] dark:text-[#9EB5C8] tabular-nums">
            15m ATR Guards: BTC/USD 0.095–0.850% · XAU/USD 0.032–0.480%
          </span>
        </div>

        {/* Collapsible 3-Step Execution Guide */}
        {showGuide && (
          <div
            data-testid="ict-how-to-guide"
            className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-black/8 dark:border-white/10"
          >
            <div className="rounded-xl liquid-glass-inset p-3.5 flex flex-col gap-1">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#005BB8] dark:text-[#FBBF24]">
                Step 1 · Verify Signal &amp; 15m ATR Band
              </span>
              <p className="text-xs font-semibold text-[#1C1C1E] dark:text-white leading-relaxed">
                {strategyMode === 'ict' ? (
                  <>
                    Trade only when a pair shows <span className="text-[#0B5D2A] dark:text-[#4ADE80] font-extrabold">BUY</span> or{' '}
                    <span className="text-[#B91C1C] dark:text-[#FF6B63] font-extrabold">SELL</span> inside the safe 15m ATR range.{' '}
                    <span className="text-[#9A5A0A] dark:text-[#FBBF24] font-extrabold">WAIT</span> keeps you out during erratic spikes or unfinished sweeps.
                  </>
                ) : (
                  <>
                    <strong>S&amp;D · Candle &amp; Volume</strong> triggers <span className="text-[#0B5D2A] dark:text-[#4ADE80] font-extrabold">BUY</span>/<span className="text-[#B91C1C] dark:text-[#FF6B63] font-extrabold">SELL</span> only when price reacts inside a Fresh Demand/Supply zone with a decisive reversal candle and &ge; 1.08x volume/effort.
                  </>
                )}
              </p>
            </div>
            <div className="rounded-xl liquid-glass-inset p-3.5 flex flex-col gap-1">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#005BB8] dark:text-[#FBBF24]">
                Step 2 · Set Entry Zone &amp; Check Invalidation
              </span>
              <p className="text-xs font-semibold text-[#1C1C1E] dark:text-white leading-relaxed">
                Place your limit order inside the highlighted <strong>Entry Zone</strong> and check the{' '}
                <strong>Asset Invalidation Rule</strong> below before submitting. Cancel immediately if the 15m close breaks invalidation.
              </p>
            </div>
            <div className="rounded-xl liquid-glass-inset p-3.5 flex flex-col gap-1">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#005BB8] dark:text-[#FBBF24]">
                Step 3 · Take Profits &amp; Move to Breakeven
              </span>
              <p className="text-xs font-semibold text-[#1C1C1E] dark:text-white leading-relaxed">
                Close 50% at <strong>TP1</strong> and immediately move Stop Loss to breakeven; let remaining 50% run to opposing liquidity / zone at <strong>TP2</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Summary KPI Strip + Timeframe & Scope Filters (Zero Charts) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-black/8 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All (${activeCountTotal})` },
                { id: 'a-plus', label: `A+ Only (${actionableCounts.aPlus})` },
                { id: 'actionable', label: `Confirmed BUY/SELL (${actionableCounts.total})` },
                { id: 'btcusd', label: 'BTC/USD' },
                { id: 'xauusd', label: 'XAU/USD' },
              ] as const
            ).map((tab) => {
              const active = scopeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScopeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#1C1C1E] dark:bg-white text-white dark:text-[#111318]'
                      : 'liquid-glass-pill text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 min-w-0">
            {/* Automatic Active Signal Sort Toggle: Time Since Occurrence vs Asset Volatility */}
            <div
              data-testid="ict-sort-toggle"
              role="group"
              aria-label="Sort active signals"
              className="inline-flex flex-wrap sm:flex-nowrap items-center gap-1 rounded-xl liquid-glass-pill p-1 max-w-full"
            >
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] px-1.5 sm:px-2">
                <ArrowUpDown className="w-3 h-3" />
                Sort:
              </span>
              <button
                type="button"
                data-testid="ict-sort-occurrence"
                aria-pressed={sortMode === 'occurrence'}
                onClick={() => setSortMode('occurrence')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10.5px] sm:text-[11px] font-bold transition-colors whitespace-nowrap ${
                  sortMode === 'occurrence'
                    ? 'bg-[#0066CC] dark:bg-[#B45309] text-white shadow-xs'
                    : 'text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                }`}
              >
                Time since occurrence
              </button>
              <button
                type="button"
                data-testid="ict-sort-volatility"
                aria-pressed={sortMode === 'volatility'}
                onClick={() => setSortMode('volatility')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10.5px] sm:text-[11px] font-bold transition-colors whitespace-nowrap ${
                  sortMode === 'volatility'
                    ? 'bg-[#0066CC] dark:bg-[#B45309] text-white shadow-xs'
                    : 'text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                }`}
              >
                Asset volatility
              </button>
            </div>

            <div className="flex flex-col items-start sm:items-end gap-0.5 w-full sm:w-auto max-w-full">
              <div
                role="tablist"
                aria-label="Evaluation timeframe"
                className="flex flex-wrap sm:flex-nowrap items-center gap-1 max-w-full"
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] mr-1 shrink-0">
                  Entry TF:
                </span>
                {ICT_TIMEFRAMES.map((tf) => {
                  const active = selectedTf === tf;
                  return (
                    <button
                      key={tf}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => handleSelectTimeframe(tf)}
                      title={`Evaluate ${tf} closed-candle structure`}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-[#0066CC] dark:bg-[#B45309] text-white shadow-xs'
                          : 'liquid-glass-pill text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                      }`}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {actionableCounts.usdCorrelationWarning && (
          <div
            data-testid="usd-correlation-warning"
            className="rounded-xl px-3.5 py-2 border border-[#D97706]/40 dark:border-[#F59E0B]/40 bg-[#D97706]/10 dark:bg-[#F59E0B]/12 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="inline-flex items-center gap-1.5 font-extrabold text-[#9A5A0A] dark:text-[#FBBF24]">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              BTC/XAU Macro Correlation Alert: {actionableCounts.usdCorrelationWarning.pairs.length}{' '}
              active setups share {actionableCounts.usdCorrelationWarning.exposure} exposure — split risk across correlated legs.
            </span>
            <span className="font-mono text-[11px] font-bold text-[#4A4D57] dark:text-[#FDE68A]">
              {actionableCounts.usdCorrelationWarning.pairs.join(' · ')}
            </span>
          </div>
        )}

      </section>

      {/* Main 2-Column Analytical Grid (Actionable Execution Ticket + Persistent Alert Log) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5 items-start">
        {/* Left: Structured Execution Ticket & Cross-Pair Scanner */}
        <div className="flex flex-col gap-5 min-w-0">
          {strategyMode === 'ict' && focusedSignal && (
            <section
              data-testid="ict-focused-setup"
              className="rounded-2xl liquid-glass-card p-4 sm:p-5 flex flex-col gap-4"
            >
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg sm:text-xl font-extrabold text-[#1C1C1E] dark:text-white">
                      {focusedSignal.symbol}
                    </span>
                    {focusedSignal.setupGrade === 'A+' && (
                      <span
                        data-testid="ict-aplus-badge"
                        className="px-1.5 py-0.5 rounded bg-[#16A34A]/18 dark:bg-[#22C55E]/20 border border-[#16A34A]/45 text-[10px] font-mono font-black tracking-wide text-[#0B5D2A] dark:text-[#4ADE80]"
                      >
                        A+
                      </span>
                    )}
                    <span
                      data-testid="ict-focused-relative-time"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/[0.05] dark:bg-white/[0.08] border border-black/10 dark:border-white/15 text-[11px] font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#FBBF24]"
                    >
                      <Clock className="w-3 h-3 shrink-0" />
                      {formatRelativeTime(focusedSignal.evaluatedAt, nowTick)}
                    </span>
                    {focusedSignal.candleStageLabel && (
                      <span className="text-[10.5px] font-mono font-bold text-[#4A4D57] dark:text-[#9EB5C8]">
                        {focusedSignal.candleStageLabel}
                      </span>
                    )}
                    {activeDualConfluence && (
                      <span
                        data-testid="radar-dual-confluence"
                        className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider text-[#0B5D2A] dark:text-[#4ADE80]"
                      >
                        <Sparkles className="w-3 h-3 shrink-0" />
                        2-Engine Confluence ({activeDualConfluence})
                      </span>
                    )}
                    {typeof focusedSignal.atrPct === 'number' &&
                      typeof focusedSignal.volatilityThresholdPct === 'number' && (
                        <span
                          data-testid="ict-focused-vol-status"
                          className={`text-[10.5px] font-mono font-bold tabular-nums ${
                            focusedSignal.volatilityPassed
                              ? 'text-[#0F7033] dark:text-[#4ADE80]'
                              : 'text-[#B45309] dark:text-[#FBBF24]'
                          }`}
                        >
                          15m ATR {focusedSignal.atrPct.toFixed(3)}% ({focusedSignal.volatilityThresholdPct.toFixed(3)}%–
                          {(focusedSignal.volatilityMaxPct ?? focusedSignal.volatilityThresholdPct * 10).toFixed(3)}% ·{' '}
                          {getVolatilityStatusLabel(focusedSignal.volatilityStatus, focusedSignal.volatilityPassed)})
                        </span>
                      )}
                  </div>
                  <p className="text-xs font-bold text-[#1C1C1E] dark:text-[#F1F5F9] mt-1 leading-relaxed">
                    ICT 2022 ENGINE: {focusedSignal.setupName} · {focusedSignal.pdZone} · {focusedSignal.sessionLabel ?? focusedSignal.killzone}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto min-w-0">
                  {/* Prominent 3D Illuminated Live Spot Price Plaque + Proximity Status */}
                  {focusedSpotAsset && (
                    <div
                      data-testid="ict-focused-spot-price"
                      data-in-entry-zone={focusedProximity.isInEntryZone ? 'true' : 'false'}
                      className={`spot-plaque-surface rounded-xl px-3.5 sm:px-4 py-2.5 flex flex-col items-start sm:items-end justify-center w-full sm:w-auto max-w-full transition-shadow ${
                        focusedSignal.direction === 'BUY'
                          ? 'spot-plaque-active-buy'
                          : focusedSignal.direction === 'SELL'
                            ? 'spot-plaque-active-sell'
                            : ''
                      } ${getSpotPulseClass(focusedProximity.isInEntryZone, focusedSignal.direction)}`}
                    >
                      <div className="flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-wider text-[#4A4D57] dark:text-[#B4C6DA]">
                        <span>Live Spot</span>
                        <span
                          className={`font-mono tabular-nums ${
                            focusedSpotAsset.changePercent >= 0
                              ? 'text-[#0F7033] dark:text-[#4ADE80]'
                              : 'text-[#C41C16] dark:text-[#FF6B63]'
                          }`}
                        >
                          {focusedSpotAsset.changePercent >= 0 ? '+' : ''}
                          {focusedSpotAsset.changePercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 max-w-full">
                        <span
                          data-price-flash={focusedSpotFlash ?? 'none'}
                          className={`spot-price-3d-hero text-xl sm:text-3xl font-mono font-black tracking-tight tabular-nums leading-none ${getPriceFlashClass(focusedSpotFlash)}`}
                        >
                          {formatAssetPrice(focusedSpotAsset)}
                        </span>
                        <span
                          data-testid="ict-focused-spot-bias-badge"
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] sm:text-[10.5px] font-extrabold uppercase tracking-wider leading-none whitespace-nowrap shrink-0 ${focusedIctBadge.classes}`}
                        >
                          {focusedSignal.direction === 'BUY' ? (
                            <ArrowUp className="w-3 h-3 stroke-[2.75]" />
                          ) : focusedSignal.direction === 'SELL' ? (
                            <ArrowDown className="w-3 h-3 stroke-[2.75]" />
                          ) : focusedIctBadge.lean === 'BUY' ? (
                            <>
                              <Clock className="w-2.5 h-2.5" />
                              <ArrowUp className="w-2.5 h-2.5 stroke-[2.75]" />
                            </>
                          ) : focusedIctBadge.lean === 'SELL' ? (
                            <>
                              <Clock className="w-2.5 h-2.5" />
                              <ArrowDown className="w-2.5 h-2.5 stroke-[2.75]" />
                            </>
                          ) : (
                            <Clock className="w-2.5 h-2.5" />
                          )}
                          {focusedIctBadge.label}
                        </span>
                      </div>
                      <span
                        data-testid="ict-spot-proximity"
                        className={`text-[10px] font-mono font-extrabold tabular-nums mt-1 ${
                          focusedProximity.tone === 'in-zone'
                            ? 'text-[#0B5D2A] dark:text-[#4ADE80]'
                            : focusedProximity.tone === 'risk'
                              ? 'text-[#B91C1C] dark:text-[#FF6B63]'
                              : focusedProximity.tone === 'near'
                                ? 'text-[#005BB8] dark:text-[#FBBF24]'
                                : 'text-[#4A4D57] dark:text-[#C7CBD6]'
                        }`}
                      >
                        {focusedProximity.label}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto min-w-0">
                    <span
                      data-testid="ict-focused-signal-badge"
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-extrabold tracking-wide whitespace-nowrap ${focusedIctBadge.classes}`}
                    >
                      {focusedSignal.direction === 'BUY' ? (
                        <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : focusedSignal.direction === 'SELL' ? (
                        <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : focusedIctBadge.lean === 'BUY' ? (
                        <>
                          <Clock className="w-3 h-3" />
                          <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                        </>
                      ) : focusedIctBadge.lean === 'SELL' ? (
                        <>
                          <Clock className="w-3 h-3" />
                          <ArrowDown className="w-3 h-3 stroke-[2.5]" />
                        </>
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      {focusedSignalLabel} · {focusedSignal.confidence}%
                    </span>

                    {focusedConfidenceGauge && (
                      <VolatilityConfidenceGauge gauge={focusedConfidenceGauge} />
                    )}

                    <button
                      type="button"
                      data-testid="ict-copy-ticket-btn"
                      onClick={handleCopyTicket}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg liquid-glass-pill text-xs font-bold text-[#1C1C1E] dark:text-white hover:brightness-95 dark:hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                      title="Copy Directional Bias, Order Placement, Stop Loss & Take Profits to clipboard"
                    >
                      {copiedTicket ? (
                        <Check className="w-3.5 h-3.5 text-[#0F7033] dark:text-[#4ADE80]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedTicket ? 'Copied' : 'Copy Ticket'}
                    </button>

                    {onInspectChart && (
                      <button
                        type="button"
                        data-testid="ict-inspect-chart-btn"
                        onClick={() =>
                          onInspectChart(
                            focusedSignal.assetId,
                            {
                              symbolLabel: focusedSignal.symbol,
                              direction:
                                focusedSignal.direction === 'NEUTRAL'
                                  ? 'WAIT'
                                  : focusedSignal.direction,
                              entryLow: focusedSignal.entryLowNum,
                              entryHigh: focusedSignal.entryHighNum,
                              stopLoss: focusedSignal.stopLossNum,
                              tp1: focusedSignal.tp1Num,
                              tp2: focusedSignal.tp2Num,
                            },
                            focusedSignal.timeframe
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg liquid-glass-pill text-xs font-bold text-[#1C1C1E] dark:text-white hover:brightness-95 dark:hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                        title="Open interactive TradingView chart with ICT Entry, SL & TP levels"
                      >
                        <CandlestickChart className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#FBBF24]" />
                        Inspect Chart
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onTriggerIctAlert(focusedSignal, 'ict')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg liquid-glass-pill text-xs font-bold text-[#0071E3] dark:text-[#FBBF24] hover:brightness-95 dark:hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                      title="Log this ICT evaluation into the alert feed"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      Log Alert
                    </button>
                  </div>
                </div>
              </div>

              {/* Enter Now vs Set Limit Execution Decision Banner + Spot R:R vs Limit R:R */}
              <ExecutionDecisionBanner
                direction={focusedSignal.direction}
                posture={
                  focusedIctLivePosture?.posture ??
                  focusedSignal.executionPosture ??
                  (focusedSignal.direction === 'NEUTRAL' ? 'standby' : 'armed_limit')
                }
                limitEntryPriceNum={
                  focusedIctLivePosture?.limitEntryPriceNum ?? focusedSignal.limitEntryPriceNum
                }
                limitRr={focusedIctLivePosture?.limitRr ?? focusedSignal.limitRr}
                spotRr={focusedIctLivePosture?.spotRr ?? focusedSignal.spotRr}
                chaseProgressPct={
                  focusedIctLivePosture?.chaseProgressPct ?? focusedSignal.chaseProgressPct ?? 0
                }
                asset={focusedSpotAsset}
                fallbackDecimals={focusedSignal.decimals}
              />

              {/* Unmistakable Signal Bias -> Order Placement Ticket */}
              <div
                data-testid="signal-placement-ticket"
                className="rounded-xl liquid-glass-inset p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs"
              >
                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                    Directional Bias
                  </span>
                  <span
                    className={`font-mono font-black text-sm ${
                      focusedSignal.direction === 'BUY'
                        ? 'text-[#0B5D2A] dark:text-[#4ADE80]'
                        : focusedSignal.direction === 'SELL'
                          ? 'text-[#B91C1C] dark:text-[#FF6B63]'
                          : 'text-[#9A5A0A] dark:text-[#FBBF24]'
                    }`}
                  >
                    {focusedSignal.direction === 'BUY'
                      ? 'BULLISH (LONG)'
                      : focusedSignal.direction === 'SELL'
                        ? 'BEARISH (SHORT)'
                        : 'FLAT (NO TRADE)'}
                  </span>
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    HTF {focusedSignal.htfBias ?? 'Ranging'} · {focusedSignal.pdZone}
                  </span>
                </div>

                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                    Order Placement
                  </span>
                  <span className="font-mono font-black text-sm text-[#005BB8] dark:text-[#FBBF24] truncate">
                    {focusedSignal.direction === 'NEUTRAL'
                      ? 'NO ORDER — STAND BY'
                      : (focusedIctLivePosture?.posture ?? focusedSignal.executionPosture) === 'enter_now'
                        ? `${focusedSignal.direction} MARKET (IN ZONE)`
                        : (focusedIctLivePosture?.posture ?? focusedSignal.executionPosture) === 'limit_pullback_only'
                          ? `${focusedSignal.direction} LIMIT PULLBACK @ ${formatNumericWithAsset(
                              focusedIctLivePosture?.limitEntryPriceNum ?? focusedSignal.limitEntryPriceNum,
                              focusedSpotAsset,
                              focusedSignal.decimals
                            )}`
                          : `${focusedSignal.direction} LIMIT @ ${formatNumericWithAsset(
                              focusedIctLivePosture?.limitEntryPriceNum ?? focusedSignal.limitEntryPriceNum,
                              focusedSpotAsset,
                              focusedSignal.decimals
                            )}`}
                  </span>
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    50% CE / OTE Anchor · Zone {focusedSignal.entryZone}
                  </span>
                </div>

                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                    Hard Stop Loss
                  </span>
                  <span className="font-mono font-black text-sm text-[#C41C16] dark:text-[#FF6B63] tabular-nums">
                    {focusedSignal.stopLoss}
                  </span>
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    {focusedSignal.stopLossReason || 'Beyond OB / Sweep'}
                  </span>
                </div>

                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                    Take Profit Plan
                  </span>
                  <span className="font-mono font-black text-sm text-[#0F7033] dark:text-[#4ADE80] tabular-nums truncate">
                    {focusedSignal.tp1 ?? focusedSignal.targetPrice} → {focusedSignal.tp2 ?? focusedSignal.targetPrice}
                  </span>
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    50% TP1 (SL→BE) · R:R {focusedSignal.riskReward}
                  </span>
                </div>
              </div>

              {/* Plain-English Action Callout Banner */}
              <div
                data-testid="ict-action-callout"
                className={`rounded-xl p-3.5 border flex flex-col gap-1.5 ${
                  focusedSignal.direction === 'BUY'
                    ? 'bg-[#16A34A]/12 dark:bg-[#22C55E]/12 border-[#16A34A]/35 text-[#0B5D2A] dark:text-[#4ADE80]'
                    : focusedSignal.direction === 'SELL'
                      ? 'bg-[#DC2626]/12 dark:bg-[#EF4444]/12 border-[#DC2626]/35 text-[#B91C1C] dark:text-[#FF6B63]'
                      : 'bg-[#D97706]/12 dark:bg-[#F59E0B]/12 border-[#D97706]/35 text-[#9A5A0A] dark:text-[#FBBF24]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider">
                    {focusedSignal.direction === 'BUY'
                      ? focusedIctLivePosture?.posture === 'enter_now'
                        ? 'ACTION: BUY NOW (IN ENTRY ZONE) — Execute Market/Zone Fill with SL below'
                        : focusedIctLivePosture?.posture === 'limit_pullback_only'
                          ? 'ACTION: BUY LIMIT PULLBACK ONLY — Do not chase displacement; bid inside Entry Zone'
                          : 'ACTION: BUY LIMIT ARMED — Place Buy Limit inside Entry Zone below'
                      : focusedSignal.direction === 'SELL'
                        ? focusedIctLivePosture?.posture === 'enter_now'
                          ? 'ACTION: SELL NOW (IN ENTRY ZONE) — Execute Market/Zone Fill with SL above'
                          : focusedIctLivePosture?.posture === 'limit_pullback_only'
                            ? 'ACTION: SELL LIMIT PULLBACK ONLY — Do not chase displacement; offer inside Entry Zone'
                            : 'ACTION: SELL LIMIT ARMED — Place Sell Limit inside Entry Zone below'
                        : focusedIctBadge.lean === 'BUY'
                          ? 'ACTION: WAIT FOR BUY — Stay flat until bullish Sweep/MSS/FVG confirms'
                          : focusedIctBadge.lean === 'SELL'
                            ? 'ACTION: WAIT FOR SELL — Stay flat until bearish Sweep/MSS/FVG confirms'
                            : 'ACTION: DO NOT ENTER YET (WAIT) — Stay flat until directional conditions confirm'}
                  </span>
                  <span className="text-[11px] font-mono font-bold tabular-nums opacity-90">
                    Entry TF: {focusedSignal.timeframe}
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#1C1C1E] dark:text-[#F1F5F9] leading-relaxed">
                  <span className="font-extrabold uppercase tracking-wider text-[10.5px] text-[#4A4D57] dark:text-[#9EB5C8] mr-1.5">
                    {focusedSignal.direction === 'NEUTRAL' ? 'What To Watch Next:' : 'Setup Reason:'}
                  </span>
                  {focusedSignal.sweepMssStatus || focusedSignal.invalidationNote || focusedSignal.setupName}
                </p>
                {focusedSignal.direction === 'NEUTRAL' && focusedSignal.projectedLevelsSummary && (
                  <p className="text-[11px] font-mono text-[#4A4D57] dark:text-[#C7CBD6] tabular-nums">
                    Projected Reference: {focusedSignal.projectedLevelsSummary}
                  </p>
                )}
              </div>

              {/* 5-Gate Clearance Scorecard & Bias Verdict */}
              <ClearanceScorecardPanel
                biasVerdict={focusedSignal.biasVerdict}
                clearanceSummary={focusedSignal.clearanceSummary}
                clearanceGates={focusedSignal.clearanceGates}
                dxyConfluenceNote={focusedSignal.dxyConfluenceNote}
                roundPoolNote={focusedSignal.roundPoolNote}
                asianHigh={focusedSignal.asianHigh}
                asianLow={focusedSignal.asianLow}
                asset={focusedSpotAsset}
                decimals={focusedSignal.decimals}
              />

              {/* 4-Check Confluence Strip */}
              <div
                data-testid="ict-confluence-strip"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              >
                {confluenceChecks.map((check) => (
                  <div
                    key={check.label}
                    className={`rounded-xl px-3 py-2 border flex items-center justify-between gap-1.5 text-[11px] ${
                      check.passed
                        ? 'bg-[#16A34A]/8 dark:bg-[#22C55E]/10 border-[#16A34A]/30 text-[#0B5D2A] dark:text-[#4ADE80]'
                        : 'liquid-glass-inset border-black/8 dark:border-white/10 text-[#4A4D57] dark:text-[#C7CBD6]'
                    }`}
                  >
                    <span className="font-bold truncate">{check.label}</span>
                    <span className="inline-flex items-center gap-1 font-extrabold shrink-0">
                      {check.passed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Hourglass className="w-3.5 h-3.5 shrink-0 text-[#B45309] dark:text-[#FBBF24]" />
                      )}
                      {check.detail}
                    </span>
                  </div>
                ))}
              </div>

              {/* Phase 1 Institutional Telemetry: PO3 Midnight Open, SMT Divergence, Vol Regime & Net-of-Friction R:R */}
              <div
                data-testid="ict-phase1-telemetry"
                className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]"
              >
                <div className="rounded-xl liquid-glass-inset p-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                      PO3 / NY 00:00
                    </span>
                    <span
                      className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                        focusedSignal.po3Aligned
                          ? 'bg-[#16A34A]/15 text-[#0B5D2A] dark:text-[#4ADE80]'
                          : 'bg-black/[0.06] dark:bg-white/[0.08] text-[#4A4D57] dark:text-[#C7CBD6]'
                      }`}
                    >
                      {focusedSignal.po3Phase ?? 'Session'}
                    </span>
                  </div>
                  <div className="font-mono font-bold tabular-nums text-[#1C1C1E] dark:text-white mt-1 truncate">
                    {typeof focusedSignal.midnightOpen === 'number'
                      ? formatNumericWithAsset(
                          focusedSignal.midnightOpen,
                          focusedSpotAsset,
                          focusedSignal.decimals
                        )
                      : 'Syncing Open'}
                  </div>
                  <div className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    {focusedSignal.po3Aligned ? 'Aligned w/ Midnight Open' : 'Monitor AMD side'}
                  </div>
                </div>

                <div className="rounded-xl liquid-glass-inset p-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                      SMT Divergence
                    </span>
                    <span
                      className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                        focusedSignal.smtStatus === 'Bullish SMT'
                          ? 'bg-[#16A34A]/15 text-[#0B5D2A] dark:text-[#4ADE80]'
                          : focusedSignal.smtStatus === 'Bearish SMT'
                            ? 'bg-[#DC2626]/15 text-[#B91C1C] dark:text-[#FF6B63]'
                            : 'bg-black/[0.06] dark:bg-white/[0.08] text-[#4A4D57] dark:text-[#C7CBD6]'
                      }`}
                    >
                      {focusedSignal.smtStatus ?? 'Checking'}
                    </span>
                  </div>
                  <div className="font-mono font-bold text-[#1C1C1E] dark:text-white mt-1 truncate">
                    {focusedSignal.smtPair ?? 'Macro Pair'}
                  </div>
                  <div className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate" title={focusedSignal.smtDetail}>
                    {focusedSignal.smtDetail ?? 'Comparing structural swings'}
                  </div>
                </div>

                <div className="rounded-xl liquid-glass-inset p-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                      Vol Regime
                    </span>
                    <span
                      className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                        focusedSignal.volatilityRegime === 'R2_EXPANSION'
                          ? 'bg-[#D97706]/15 text-[#9A5A0A] dark:text-[#FBBF24]'
                          : focusedSignal.volatilityRegime === 'R1_COMPRESSION'
                            ? 'bg-[#0066CC]/15 text-[#005BB8] dark:text-[#60A5FA]'
                            : 'bg-[#16A34A]/15 text-[#0B5D2A] dark:text-[#4ADE80]'
                      }`}
                    >
                      {focusedSignal.volatilityRegime === 'R2_EXPANSION'
                        ? 'R2 Expand'
                        : focusedSignal.volatilityRegime === 'R1_COMPRESSION'
                          ? 'R1 Compress'
                          : 'Normal'}
                    </span>
                  </div>
                  <div className="font-mono font-bold tabular-nums text-[#1C1C1E] dark:text-white mt-1">
                    {(focusedSignal.atrBaselineRatio ?? 1).toFixed(2)}x Baseline ATR
                  </div>
                  <div className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    {focusedSignal.sweptPoolLabel
                      ? `Pool: ${focusedSignal.sweptPoolLabel}`
                      : 'EQH/EQL + Session Pools'}
                  </div>
                </div>

                <div className="rounded-xl liquid-glass-inset p-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                      Net R:R &amp; RVOL
                    </span>
                    <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/[0.06] dark:bg-white/[0.08] text-[#1C1C1E] dark:text-white tabular-nums">
                      {(focusedSignal.displacementRvol ?? 1).toFixed(2)}x Vol
                    </span>
                  </div>
                  <div className="font-mono font-bold tabular-nums text-[#1C1C1E] dark:text-white mt-1">
                    Net 1:{(focusedSignal.netRr ?? 0).toFixed(1)} R:R
                  </div>
                  <div className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    After {focusedSignal.frictionLabel ?? 'spread/fee'}
                  </div>
                </div>
              </div>

              {/* 2-Stage Meta-Labeling Confluence Validator + Validation Discipline */}
              <MetaLabelValidatorPanel
                evaluation={focusedIctMetaEval}
                assetLabel={focusedSignal.symbol}
                strategyLabel={`ICT 2022 · ${focusedSignal.timeframe}`}
                enforceDiscipline={enforceValidationDiscipline}
                onToggleEnforceDiscipline={handleToggleValidationDiscipline}
              />

              {/* Phase 2 Volatility-, Survival-, & Correlation-Adjusted Position Sizer */}
              <IctPositionSizer
                signal={focusedSignal}
                survivalRiskMultiplier={effectiveIctSizer.multiplier}
                survivalModeLabel={effectiveIctSizer.mode}
                usdCorrelationOverlap={Boolean(actionableCounts.usdCorrelationWarning)}
              />

              {/* Unified Numbered 1-4 Execution Ticket */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-black/8 dark:border-white/10 text-xs">
                <div className="rounded-xl liquid-glass-inset p-3 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] block">
                    1. Market Bias &amp; Engine
                  </span>
                  <span className="font-mono font-bold text-[#1C1C1E] dark:text-white block mt-1 truncate">
                    {focusedSignal.htfBias ?? 'Ranging'} · {focusedSignal.pdZone}
                  </span>
                  <span className="text-[10.5px] text-[#4A4D57] dark:text-[#9EB5C8] block mt-0.5 truncate">
                    ICT 2022 (Sweep + MSS + FVG/CE)
                  </span>
                </div>

                <div className="rounded-xl liquid-glass-inset p-3 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] block">
                    {focusedSignal.direction === 'NEUTRAL'
                      ? '2. Projected Zone (WAIT)'
                      : '2. Execute Entry Zone'}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#FBBF24] block mt-1">
                    {focusedSignal.entryZone}
                  </span>
                  <span className="text-[10.5px] text-[#4A4D57] dark:text-[#9EB5C8] block mt-0.5 truncate">
                    {focusedSignal.oteZone
                      ? `0.618–0.786 OTE (${focusedSignal.timeframe})`
                      : `3-Candle FVG CE (${focusedSignal.timeframe})`}
                  </span>
                </div>

                <div className="rounded-xl liquid-glass-inset p-3 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-[#DC2626] dark:text-[#FF6B63]" />
                    {focusedSignal.direction === 'NEUTRAL'
                      ? '3. Invalidation Ref (WAIT)'
                      : '3. Stop Loss (Max Risk)'}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-[#C41C16] dark:text-[#FF6B63] block mt-1">
                    {focusedSignal.stopLoss}
                  </span>
                  <span className="text-[10.5px] text-[#4A4D57] dark:text-[#9EB5C8] block mt-0.5 truncate">
                    {focusedSignal.stopLossReason ||
                      (focusedSignal.obZone
                        ? `Beyond OB ${focusedSignal.obZone}`
                        : `Beyond ${focusedSignal.pdZone} Sweep`)}
                  </span>
                </div>

                <div className="rounded-xl liquid-glass-inset p-3 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1">
                    <Target className="w-3 h-3 text-[#16A34A] dark:text-[#4ADE80]" />
                    {focusedSignal.direction === 'NEUTRAL'
                      ? '4. Target Pool (WAIT)'
                      : '4. TP1 (BE) → TP2 Pool'}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-[#0F7033] dark:text-[#4ADE80] block mt-1 truncate">
                    {focusedSignal.tp1 ?? focusedSignal.targetPrice} → {focusedSignal.tp2 ?? focusedSignal.targetPrice}
                  </span>
                  <span className="text-[10px] font-mono text-[#4A4D57] dark:text-[#9EB5C8] block mt-0.5 truncate">
                    R:R {focusedSignal.riskReward} · Score {focusedSignal.precisionScore ?? focusedSignal.confidence}/100
                  </span>
                </div>
              </div>

              {focusedSignal.scoreBreakdown && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10.5px] font-mono tabular-nums">
                  {[
                    { label: 'Sweep', val: focusedSignal.scoreBreakdown.sweep, max: 24 },
                    { label: 'MSS', val: focusedSignal.scoreBreakdown.displacementMss, max: 24 },
                    { label: 'FVG/OB', val: focusedSignal.scoreBreakdown.imbalanceFvgOb, max: 24 },
                    { label: 'OTE Fib', val: focusedSignal.scoreBreakdown.oteFib, max: 16 },
                    { label: 'HTF/KZ', val: focusedSignal.scoreBreakdown.htfConfluence, max: 12 },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-lg liquid-glass-inset px-2.5 py-1.5 flex items-center justify-between gap-1"
                    >
                      <span className="text-[#6C6C70] dark:text-[#9EB5C8] truncate">{metric.label}</span>
                      <span className="font-bold text-[#1C1C1E] dark:text-white shrink-0">
                        {metric.val}/{metric.max}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {focusedSignal.triggers.map((trig) => (
                  <span
                    key={trig}
                    className="px-2 py-0.5 rounded-md text-[10.5px] font-bold liquid-glass-pill text-[#1C1C1E] dark:text-[#E5E5EA]"
                  >
                    {trig}
                  </span>
                ))}
              </div>

              {/* Explicit Asset-Type Invalidation & 15m Volatility Cap Trigger Box */}
              <div
                data-testid="ict-invalidation-box"
                className="rounded-xl bg-[#DC2626]/6 dark:bg-[#EF4444]/8 border border-[#DC2626]/25 px-3.5 py-2.5 flex flex-col gap-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#B91C1C] dark:text-[#FF6B63] flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    Invalidation Trigger · {focusedSignal.assetClassLabel ?? 'Crypto / Gold'}
                  </span>
                  <span className="text-[10px] font-mono font-bold tabular-nums text-[#4A4D57] dark:text-[#C7CBD6]">
                    Allowed 15m ATR: {focusedSignal.volatilityThresholdPct?.toFixed(3) ?? '0.032'}% –{' '}
                    {(focusedSignal.volatilityMaxPct ?? 0.48).toFixed(3)}%
                  </span>
                </div>
                <p className="text-[11.5px] font-semibold text-[#1C1C1E] dark:text-[#F1F5F9] leading-relaxed">
                  {focusedSignal.invalidationTrigger ??
                    focusedSignal.invalidationNote ??
                    '15m candle close beyond Stop Loss invalidates setup.'}
                </p>
              </div>
            </section>
          )}

          {strategyMode === 'sdcv' && focusedSdcvSignal && (
            <section
              data-testid="ict-focused-setup"
              className="rounded-2xl liquid-glass-card p-4 sm:p-5 flex flex-col gap-4"
            >
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg sm:text-xl font-extrabold text-[#1C1C1E] dark:text-white">
                      {focusedSdcvSignal.symbol}
                    </span>
                    {focusedSdcvSignal.setupGrade === 'A+' && (
                      <span
                        data-testid="ict-aplus-badge"
                        className="px-1.5 py-0.5 rounded bg-[#16A34A]/18 dark:bg-[#22C55E]/20 border border-[#16A34A]/45 text-[10px] font-mono font-black tracking-wide text-[#0B5D2A] dark:text-[#4ADE80]"
                      >
                        A+
                      </span>
                    )}
                    <span
                      data-testid="ict-focused-relative-time"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/[0.05] dark:bg-white/[0.08] border border-black/10 dark:border-white/15 text-[11px] font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#FBBF24]"
                    >
                      <Clock className="w-3 h-3 shrink-0" />
                      {formatRelativeTime(focusedSdcvSignal.evaluatedAt, nowTick)}
                    </span>
                    {focusedSdcvSignal.candleStageLabel && (
                      <span className="text-[10.5px] font-mono font-bold text-[#4A4D57] dark:text-[#9EB5C8]">
                        {focusedSdcvSignal.candleStageLabel}
                      </span>
                    )}
                    {activeDualConfluence && (
                      <span
                        data-testid="radar-dual-confluence"
                        className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wider text-[#0B5D2A] dark:text-[#4ADE80]"
                      >
                        <Sparkles className="w-3 h-3 shrink-0" />
                        2-Engine Confluence ({activeDualConfluence})
                      </span>
                    )}
                    <span
                      data-testid="ict-focused-vol-status"
                      className={`text-[10.5px] font-mono font-bold tabular-nums ${
                        focusedSdcvSignal.volatilityPassed
                          ? 'text-[#0F7033] dark:text-[#4ADE80]'
                          : 'text-[#B45309] dark:text-[#FBBF24]'
                      }`}
                    >
                      15m ATR {focusedSdcvSignal.atr15mPct.toFixed(3)}% ({focusedSdcvSignal.volatilityMinPct.toFixed(3)}%–
                      {focusedSdcvSignal.volatilityMaxPct.toFixed(3)}% ·{' '}
                      {getVolatilityStatusLabel(focusedSdcvSignal.volatilityStatus, focusedSdcvSignal.volatilityPassed)})
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[#1C1C1E] dark:text-[#F1F5F9] mt-1 leading-relaxed">
                    S&amp;D · CANDLE &amp; VOLUME: {focusedSdcvSignal.zoneStatus} {focusedSdcvSignal.zoneBias} · {focusedSdcvSignal.candlePattern} ·{' '}
                    {focusedSdcvSignal.volumeRatio.toFixed(2)}x {focusedSdcvSignal.volumeSource}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto min-w-0">
                  {focusedSpotAsset && (
                    <div
                      data-testid="ict-focused-spot-price"
                      data-in-entry-zone={focusedProximity.isInEntryZone ? 'true' : 'false'}
                      className={`spot-plaque-surface rounded-xl px-3.5 sm:px-4 py-2.5 flex flex-col items-start sm:items-end justify-center w-full sm:w-auto max-w-full transition-shadow ${
                        focusedSdcvSignal.direction === 'BUY'
                          ? 'spot-plaque-active-buy'
                          : focusedSdcvSignal.direction === 'SELL'
                            ? 'spot-plaque-active-sell'
                            : ''
                      } ${getSpotPulseClass(focusedProximity.isInEntryZone, focusedSdcvSignal.direction)}`}
                    >
                      <div className="flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-wider text-[#4A4D57] dark:text-[#B4C6DA]">
                        <span>Live Spot</span>
                        <span
                          className={`font-mono tabular-nums ${
                            focusedSpotAsset.changePercent >= 0
                              ? 'text-[#0F7033] dark:text-[#4ADE80]'
                              : 'text-[#C41C16] dark:text-[#FF6B63]'
                          }`}
                        >
                          {focusedSpotAsset.changePercent >= 0 ? '+' : ''}
                          {focusedSpotAsset.changePercent.toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 max-w-full">
                        <span
                          data-price-flash={focusedSpotFlash ?? 'none'}
                          className={`spot-price-3d-hero text-xl sm:text-3xl font-mono font-black tracking-tight tabular-nums leading-none ${getPriceFlashClass(focusedSpotFlash)}`}
                        >
                          {formatAssetPrice(focusedSpotAsset)}
                        </span>
                        <span
                          data-testid="ict-focused-spot-bias-badge"
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] sm:text-[10.5px] font-extrabold uppercase tracking-wider leading-none whitespace-nowrap shrink-0 ${focusedSdcvBadge.classes}`}
                        >
                          {focusedSdcvSignal.direction === 'BUY' ? (
                            <ArrowUp className="w-3 h-3 stroke-[2.75]" />
                          ) : focusedSdcvSignal.direction === 'SELL' ? (
                            <ArrowDown className="w-3 h-3 stroke-[2.75]" />
                          ) : focusedSdcvBadge.lean === 'BUY' ? (
                            <>
                              <Clock className="w-2.5 h-2.5" />
                              <ArrowUp className="w-2.5 h-2.5 stroke-[2.75]" />
                            </>
                          ) : focusedSdcvBadge.lean === 'SELL' ? (
                            <>
                              <Clock className="w-2.5 h-2.5" />
                              <ArrowDown className="w-2.5 h-2.5 stroke-[2.75]" />
                            </>
                          ) : (
                            <Clock className="w-2.5 h-2.5" />
                          )}
                          {focusedSdcvBadge.label}
                        </span>
                      </div>
                      <span
                        data-testid="ict-spot-proximity"
                        className={`text-[10px] font-mono font-extrabold tabular-nums mt-1 ${
                          focusedProximity.tone === 'in-zone'
                            ? 'text-[#0B5D2A] dark:text-[#4ADE80]'
                            : focusedProximity.tone === 'risk'
                              ? 'text-[#B91C1C] dark:text-[#FF6B63]'
                              : focusedProximity.tone === 'near'
                                ? 'text-[#005BB8] dark:text-[#FBBF24]'
                                : 'text-[#4A4D57] dark:text-[#C7CBD6]'
                        }`}
                      >
                        {focusedProximity.label}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto min-w-0">
                    <span
                      data-testid="ict-focused-signal-badge"
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-extrabold tracking-wide whitespace-nowrap ${focusedSdcvBadge.classes}`}
                    >
                      {focusedSdcvSignal.direction === 'BUY' ? (
                        <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : focusedSdcvSignal.direction === 'SELL' ? (
                        <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : focusedSdcvBadge.lean === 'BUY' ? (
                        <>
                          <Clock className="w-3 h-3" />
                          <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                        </>
                      ) : focusedSdcvBadge.lean === 'SELL' ? (
                        <>
                          <Clock className="w-3 h-3" />
                          <ArrowDown className="w-3 h-3 stroke-[2.5]" />
                        </>
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      {focusedSdcvLabel} · {focusedSdcvSignal.confidence}%
                    </span>

                    {focusedConfidenceGauge && (
                      <VolatilityConfidenceGauge gauge={focusedConfidenceGauge} />
                    )}

                    <button
                      type="button"
                      data-testid="ict-copy-ticket-btn"
                      onClick={handleCopyTicket}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg liquid-glass-pill text-xs font-bold text-[#1C1C1E] dark:text-white hover:brightness-95 dark:hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                      title="Copy Directional Bias, S&D Proximal Placement, Stop Loss & Take Profits to clipboard"
                    >
                      {copiedTicket ? (
                        <Check className="w-3.5 h-3.5 text-[#0F7033] dark:text-[#4ADE80]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedTicket ? 'Copied' : 'Copy Ticket'}
                    </button>

                    {onInspectChart && (
                      <button
                        type="button"
                        data-testid="ict-inspect-chart-btn"
                        onClick={() => {
                          const [demandLow, demandHigh] = parseZoneNumbers(
                            focusedSdcvSignal.demandZone
                          );
                          const [supplyLow, supplyHigh] = parseZoneNumbers(
                            focusedSdcvSignal.supplyZone
                          );
                          onInspectChart(
                            focusedSdcvSignal.assetId,
                            {
                              symbolLabel: focusedSdcvSignal.symbol,
                              direction:
                                focusedSdcvSignal.direction === 'NEUTRAL'
                                  ? 'WAIT'
                                  : focusedSdcvSignal.direction,
                              entryLow: focusedSdcvSignal.entryLowNum,
                              entryHigh: focusedSdcvSignal.entryHighNum,
                              stopLoss: focusedSdcvSignal.stopLossNum,
                              tp1: focusedSdcvSignal.tp1Num,
                              tp2: focusedSdcvSignal.tp2Num,
                              demandLow,
                              demandHigh,
                              supplyLow,
                              supplyHigh,
                            },
                            focusedSdcvSignal.timeframe
                          );
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg liquid-glass-pill text-xs font-bold text-[#1C1C1E] dark:text-white hover:brightness-95 dark:hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                        title="Open interactive TradingView chart with S&D Demand, Supply, Entry, SL & TP levels"
                      >
                        <CandlestickChart className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#FBBF24]" />
                        Inspect Chart
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onTriggerIctAlert(toAlertSignalFromSdcv(focusedSdcvSignal), 'sdcv')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg liquid-glass-pill text-xs font-bold text-[#0071E3] dark:text-[#FBBF24] hover:brightness-95 dark:hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                      title="Log this Supply & Demand setup into the alert feed"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      Log Alert
                    </button>
                  </div>
                </div>
              </div>

              {/* Enter Now vs Set Limit Execution Decision Banner + Spot R:R vs Limit R:R */}
              <ExecutionDecisionBanner
                direction={focusedSdcvSignal.direction}
                posture={
                  focusedSdcvLivePosture?.posture ??
                  focusedSdcvSignal.executionPosture ??
                  (focusedSdcvSignal.direction === 'NEUTRAL' ? 'standby' : 'armed_limit')
                }
                limitEntryPriceNum={
                  focusedSdcvLivePosture?.limitEntryPriceNum ??
                  focusedSdcvSignal.limitEntryPriceNum
                }
                limitRr={focusedSdcvLivePosture?.limitRr ?? focusedSdcvSignal.limitRr}
                spotRr={focusedSdcvLivePosture?.spotRr ?? focusedSdcvSignal.spotRr}
                chaseProgressPct={
                  focusedSdcvLivePosture?.chaseProgressPct ??
                  focusedSdcvSignal.chaseProgressPct ??
                  0
                }
                asset={focusedSpotAsset}
                fallbackDecimals={focusedSdcvSignal.decimals}
              />

              {/* Unmistakable Signal Bias -> Order Placement Ticket (S&D Proximal / Distal) */}
              <div
                data-testid="signal-placement-ticket"
                className="rounded-xl liquid-glass-inset p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs"
              >
                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                    Directional Bias
                  </span>
                  <span
                    className={`font-mono font-black text-sm ${
                      focusedSdcvSignal.direction === 'BUY'
                        ? 'text-[#0B5D2A] dark:text-[#4ADE80]'
                        : focusedSdcvSignal.direction === 'SELL'
                          ? 'text-[#B91C1C] dark:text-[#FF6B63]'
                          : 'text-[#9A5A0A] dark:text-[#FBBF24]'
                    }`}
                  >
                    {focusedSdcvSignal.direction === 'BUY'
                      ? 'BULLISH (DEMAND)'
                      : focusedSdcvSignal.direction === 'SELL'
                        ? 'BEARISH (SUPPLY)'
                        : 'FLAT (NO TRADE)'}
                  </span>
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    {focusedSdcvSignal.zoneStatus} {focusedSdcvSignal.sdPattern ?? 'BASE'} · Curve {focusedSdcvSignal.htfCurvePct ?? '—'}%
                  </span>
                </div>

                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                    Order Placement
                  </span>
                  <span className="font-mono font-black text-sm text-[#005BB8] dark:text-[#FBBF24] truncate">
                    {focusedSdcvSignal.direction === 'NEUTRAL'
                      ? 'NO ORDER — STAND BY'
                      : (focusedSdcvLivePosture?.posture ?? focusedSdcvSignal.executionPosture) === 'enter_now'
                        ? `${focusedSdcvSignal.direction} MARKET (IN ZONE)`
                        : (focusedSdcvLivePosture?.posture ?? focusedSdcvSignal.executionPosture) === 'limit_pullback_only'
                          ? `${focusedSdcvSignal.direction} LIMIT PULLBACK @ ${formatNumericWithAsset(
                              focusedSdcvLivePosture?.limitEntryPriceNum ??
                                focusedSdcvSignal.proximalLineNum ??
                                focusedSdcvSignal.limitEntryPriceNum,
                              focusedSpotAsset,
                              focusedSdcvSignal.decimals
                            )}`
                          : `${focusedSdcvSignal.direction} LIMIT @ ${formatNumericWithAsset(
                              focusedSdcvLivePosture?.limitEntryPriceNum ??
                                focusedSdcvSignal.proximalLineNum ??
                                focusedSdcvSignal.limitEntryPriceNum,
                              focusedSpotAsset,
                              focusedSdcvSignal.decimals
                            )}`}
                  </span>
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    Proximal Line · Zone {focusedSdcvSignal.entryZone}
                  </span>
                </div>

                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                    Hard Stop Loss
                  </span>
                  <span className="font-mono font-black text-sm text-[#C41C16] dark:text-[#FF6B63] tabular-nums">
                    {focusedSdcvSignal.stopLoss}
                  </span>
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    Beyond Distal Zone Edge
                  </span>
                </div>

                <div className="min-w-0 flex flex-col gap-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                    Take Profit Plan
                  </span>
                  <span className="font-mono font-black text-sm text-[#0F7033] dark:text-[#4ADE80] tabular-nums truncate">
                    {focusedSdcvSignal.tp1} → {focusedSdcvSignal.tp2}
                  </span>
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] truncate">
                    50% TP1 (SL→BE) · R:R {focusedSdcvSignal.riskReward}
                  </span>
                </div>
              </div>

              {/* Plain-English Action Callout */}
              <div
                data-testid="ict-action-callout"
                className={`rounded-xl p-3.5 border flex flex-col gap-1.5 ${
                  focusedSdcvSignal.direction === 'BUY'
                    ? 'bg-[#16A34A]/12 dark:bg-[#22C55E]/12 border-[#16A34A]/35 text-[#0B5D2A] dark:text-[#4ADE80]'
                    : focusedSdcvSignal.direction === 'SELL'
                      ? 'bg-[#DC2626]/12 dark:bg-[#EF4444]/12 border-[#DC2626]/35 text-[#B91C1C] dark:text-[#FF6B63]'
                      : 'bg-[#D97706]/12 dark:bg-[#F59E0B]/12 border-[#D97706]/35 text-[#9A5A0A] dark:text-[#FBBF24]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider">
                    {focusedSdcvSignal.direction === 'BUY'
                      ? focusedSdcvLivePosture?.posture === 'enter_now'
                        ? 'ACTION: BUY NOW (IN DEMAND ZONE) — Candle + Volume confirmed at Demand Zone'
                        : focusedSdcvLivePosture?.posture === 'limit_pullback_only'
                          ? 'ACTION: BUY LIMIT PULLBACK ONLY — Do not chase displacement away from Demand'
                          : 'ACTION: BUY LIMIT ARMED — Set Buy Limit at Fresh Demand Zone'
                      : focusedSdcvSignal.direction === 'SELL'
                        ? focusedSdcvLivePosture?.posture === 'enter_now'
                          ? 'ACTION: SELL NOW (IN SUPPLY ZONE) — Candle + Volume confirmed at Supply Zone'
                          : focusedSdcvLivePosture?.posture === 'limit_pullback_only'
                            ? 'ACTION: SELL LIMIT PULLBACK ONLY — Do not chase displacement away from Supply'
                            : 'ACTION: SELL LIMIT ARMED — Set Sell Limit at Fresh Supply Zone'
                        : focusedSdcvBadge.lean === 'BUY'
                          ? 'ACTION: WAIT FOR BUY — Awaiting Demand Zone tap + bullish Candle + Volume >= 1.05x'
                          : focusedSdcvBadge.lean === 'SELL'
                            ? 'ACTION: WAIT FOR SELL — Awaiting Supply Zone tap + bearish Candle + Volume >= 1.05x'
                            : 'ACTION: WAIT FOR CONFLUENCE — Awaiting S&D Zone tap + Candle + Volume >= 1.05x'}
                  </span>
                  <span className="text-[11px] font-mono font-bold tabular-nums opacity-90">
                    Entry TF: {focusedSdcvSignal.timeframe}
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#1C1C1E] dark:text-[#F1F5F9] leading-relaxed">
                  {focusedSdcvSignal.actionSummary}
                </p>
                {focusedSdcvSignal.direction === 'NEUTRAL' && focusedSdcvSignal.projectedLevelsSummary && (
                  <p className="text-[11px] font-mono text-[#4A4D57] dark:text-[#C7CBD6] tabular-nums">
                    Projected Reference: {focusedSdcvSignal.projectedLevelsSummary}
                  </p>
                )}
              </div>

              {/* 5-Gate Clearance Scorecard & Bias Verdict */}
              <ClearanceScorecardPanel
                biasVerdict={focusedSdcvSignal.biasVerdict}
                clearanceSummary={focusedSdcvSignal.clearanceSummary}
                clearanceGates={focusedSdcvSignal.clearanceGates}
                dxyConfluenceNote={focusedSdcvSignal.dxyConfluenceNote}
                asset={focusedSpotAsset}
                decimals={focusedSdcvSignal.decimals}
              />

              {/* 4-Check S&D + Candle + Volume + ATR Strip */}
              <div
                data-testid="sdcv-pillar-strip"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              >
                {[
                  {
                    label: 'S&D Zone',
                    passed: focusedSdcvSignal.zoneBias !== 'Mid-Range',
                    detail:
                      focusedSdcvSignal.zoneBias === 'Mid-Range'
                        ? 'Mid-Range'
                        : `${focusedSdcvSignal.zoneStatus} ${focusedSdcvSignal.zoneBias}`,
                  },
                  {
                    label: 'Candle Read',
                    passed: focusedSdcvSignal.candleTone !== 'neutral',
                    detail:
                      focusedSdcvSignal.candleTone === 'bull'
                        ? 'Bullish PA'
                        : focusedSdcvSignal.candleTone === 'bear'
                          ? 'Bearish PA'
                          : 'Neutral',
                  },
                  {
                    label: 'Volume / Effort',
                    passed: focusedSdcvSignal.volumeRatio >= 1.08,
                    detail: `${focusedSdcvSignal.volumeRatio.toFixed(2)}x (${focusedSdcvSignal.volumeState})`,
                  },
                  {
                    label: '15m ATR Band',
                    passed: focusedSdcvSignal.volatilityPassed,
                    detail: focusedSdcvSignal.volatilityPassed
                      ? 'In Range'
                      : focusedSdcvSignal.volatilityStatus === 'warming'
                        ? 'Warming'
                        : focusedSdcvSignal.volatilityStatus === 'too-high'
                          ? 'Erratic'
                          : 'Too Low',
                  },
                ].map((pillar) => (
                  <div
                    key={pillar.label}
                    className={`rounded-xl px-3 py-2 border flex items-center justify-between gap-1.5 text-[11px] ${
                      pillar.passed
                        ? 'bg-[#16A34A]/8 dark:bg-[#22C55E]/10 border-[#16A34A]/30 text-[#0B5D2A] dark:text-[#4ADE80]'
                        : 'liquid-glass-inset border-black/8 dark:border-white/10 text-[#4A4D57] dark:text-[#C7CBD6]'
                    }`}
                  >
                    <span className="font-bold truncate">{pillar.label}</span>
                    <span className="inline-flex items-center gap-1 font-extrabold shrink-0">
                      {pillar.passed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Hourglass className="w-3.5 h-3.5 shrink-0 text-[#B45309] dark:text-[#FBBF24]" />
                      )}
                      {pillar.detail}
                    </span>
                  </div>
                ))}
              </div>

              {/* 2-Stage Meta-Labeling Confluence Validator + Validation Discipline */}
              <MetaLabelValidatorPanel
                evaluation={focusedSdcvMetaEval}
                assetLabel={focusedSdcvSignal.symbol}
                strategyLabel={`S&D Candle+Volume · ${focusedSdcvSignal.timeframe}`}
                enforceDiscipline={enforceValidationDiscipline}
                onToggleEnforceDiscipline={handleToggleValidationDiscipline}
              />

              {/* Numbered 1-4 Execution Ticket */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-black/8 dark:border-white/10 text-xs">
                <div className="rounded-xl liquid-glass-inset p-3 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] block">
                    1. Active Demand / Supply
                  </span>
                  <span className="font-mono font-bold text-[#1C1C1E] dark:text-white block mt-1 truncate">
                    {focusedSdcvSignal.zoneBias} ({focusedSdcvSignal.zoneStatus})
                  </span>
                  <span className="text-[10px] font-mono text-[#4A4D57] dark:text-[#9EB5C8] block mt-0.5 truncate">
                    Dem {focusedSdcvSignal.demandZone}
                  </span>
                </div>

                <div className="rounded-xl liquid-glass-inset p-3 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] block">
                    {focusedSdcvSignal.direction === 'NEUTRAL'
                      ? '2. Projected Zone (WAIT)'
                      : '2. Proximal Entry Zone'}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#FBBF24] block mt-1">
                    {focusedSdcvSignal.entryZone}
                  </span>
                  <span className="text-[10px] font-mono text-[#4A4D57] dark:text-[#9EB5C8] block mt-0.5 truncate">
                    Sup {focusedSdcvSignal.supplyZone}
                  </span>
                </div>

                <div className="rounded-xl liquid-glass-inset p-3 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-[#DC2626] dark:text-[#FF6B63]" />
                    {focusedSdcvSignal.direction === 'NEUTRAL'
                      ? '3. Invalidation Ref (WAIT)'
                      : '3. Distal Stop Loss'}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-[#C41C16] dark:text-[#FF6B63] block mt-1">
                    {focusedSdcvSignal.stopLoss}
                  </span>
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] block mt-0.5 truncate">
                    Beyond Distal Zone Edge
                  </span>
                </div>

                <div className="rounded-xl liquid-glass-inset p-3 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1">
                    <Target className="w-3 h-3 text-[#16A34A] dark:text-[#4ADE80]" />
                    {focusedSdcvSignal.direction === 'NEUTRAL'
                      ? `4. Target Pool (${focusedSdcvSignal.riskReward})`
                      : `4. TP1 / TP2 (${focusedSdcvSignal.riskReward})`}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-[#0F7033] dark:text-[#4ADE80] block mt-1">
                    {focusedSdcvSignal.tp1} → {focusedSdcvSignal.tp2}
                  </span>
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] block mt-0.5 truncate">
                    50% TP1 + BE · 50% Opposing Zone
                  </span>
                </div>
              </div>

              {/* Candle Anatomy + Volume Detail */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-xl liquid-glass-inset p-3 flex flex-col gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1">
                    <CandlestickChart className="w-3.5 h-3.5 text-[#005BB8] dark:text-[#FBBF24]" />
                    Candle Reading: {focusedSdcvSignal.candlePattern}
                  </span>
                  <p className="text-[11.5px] font-medium text-[#1C1C1E] dark:text-[#F1F5F9]">
                    {focusedSdcvSignal.candleDetail}
                  </p>
                </div>

                <div className="rounded-xl liquid-glass-inset p-3 flex flex-col gap-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1 flex-wrap">
                    <BarChart3 className="w-3.5 h-3.5 text-[#0F7033] dark:text-[#4ADE80]" />
                    <span>
                      {focusedSdcvSignal.volumeSource}: {focusedSdcvSignal.volumeRatio.toFixed(2)}x ({focusedSdcvSignal.volumeState})
                    </span>
                    {focusedSdcvSignal.volumeSource === 'Tick-Range Effort' && (
                      <span className="text-[9.5px] font-mono font-bold normal-case text-[#9A5A0A] dark:text-[#FBBF24]">
                        (Proxy — No Exchange Vol)
                      </span>
                    )}
                  </span>
                  <p className="text-[11.5px] font-medium text-[#1C1C1E] dark:text-[#F1F5F9]">
                    {focusedSdcvSignal.volumeRatio >= 1.08
                      ? 'Volume expansion confirms institutional participation behind candle reaction.'
                      : 'Participation below 1.08x expansion threshold — avoid forcing premature entries.'}
                  </p>
                </div>
              </div>

              {/* Asset-Type Invalidation Box */}
              <div
                data-testid="ict-invalidation-box"
                className="rounded-xl bg-[#DC2626]/6 dark:bg-[#EF4444]/8 border border-[#DC2626]/25 px-3.5 py-2.5 flex flex-col gap-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#B91C1C] dark:text-[#FF6B63] flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    Invalidation Trigger · {focusedSdcvSignal.assetClassLabel}
                  </span>
                  <span className="text-[10.5px] font-mono font-bold tabular-nums text-[#4A4D57] dark:text-[#C7CBD6]">
                    Allowed 15m ATR: {focusedSdcvSignal.volatilityMinPct.toFixed(3)}% –{' '}
                    {focusedSdcvSignal.volatilityMaxPct.toFixed(3)}%
                  </span>
                </div>
                <p className="text-[11.5px] font-semibold text-[#1C1C1E] dark:text-[#F1F5F9] leading-relaxed">
                  {focusedSdcvSignal.invalidationTrigger}
                </p>
              </div>
            </section>
          )}

          {/* Cross-Instrument Radar Matrix (Zero Charts) */}
          <section className="rounded-2xl liquid-glass-card p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2">
              <h2 className="text-sm sm:text-base font-bold text-[#1C1C1E] dark:text-white leading-snug">
                {strategyMode === 'ict'
                  ? 'ICT 2022 Precision Matrix: BTC/USD & XAU/USD'
                  : 'Canonical S&D · Candle & Volume Matrix: BTC/USD & XAU/USD'}
              </h2>
              <span className="text-[11px] sm:text-xs font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8] shrink-0">
                {(strategyMode === 'ict' ? filteredSignals : filteredSdcvSignals).length} instruments ·{' '}
                {actionableCounts.buys} BUY / {actionableCounts.sells} SELL
              </span>
            </div>

            {strategyMode === 'ict' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" data-testid="ict-pairs-grid">
                {filteredSignals.map((sig) => {
                  const asset = assetById.get(sig.assetId);
                  const selected = focusedSignal?.assetId === sig.assetId;
                  const isBuy = sig.direction === 'BUY';
                  const isSell = sig.direction === 'SELL';
                  const expectedBias = resolveIctExpectedBias(sig);
                  const liveCardPrice = asset?.price ?? sig.currentPrice;
                  const cardAtrAbs =
                    typeof sig.atrPct === 'number' && liveCardPrice > 0
                      ? liveCardPrice * (sig.atrPct / 100)
                      : undefined;
                  const cardPosture = evaluateLiveExecutionPosture({
                    direction: sig.direction,
                    setupArmed: sig.direction !== 'NEUTRAL',
                    armedBias: expectedBias === 'SELL' ? 'SELL' : 'BUY',
                    currentPrice: liveCardPrice,
                    entryLow: sig.entryLowNum,
                    entryHigh: sig.entryHighNum,
                    stopLoss: sig.stopLossNum,
                    tp1: sig.tp1Num,
                    tp2: sig.tp2Num,
                    atr: cardAtrAbs,
                    executionStatus: sig.executionStatus,
                    exactLimitOverride: sig.limitEntryPriceNum,
                  });
                  const badgeMeta = getDirectionBadgeStyle(
                    sig.direction,
                    expectedBias,
                    cardPosture.posture
                  );
                  const cardProximity = computeSpotProximity({
                    currentPrice: liveCardPrice,
                    entryLow: sig.entryLowNum,
                    entryHigh: sig.entryHighNum,
                    stopLoss: sig.stopLossNum,
                    tp1: sig.tp1Num,
                    direction: sig.direction,
                    executionStatus: sig.executionStatus,
                    posture: cardPosture.posture,
                    chaseProgressPct: cardPosture.chaseProgressPct,
                  });
                  const cardFlash = flashMap[sig.assetId] ?? localFlashMap[sig.assetId];
                  const cardGauge = computeSignalConfidenceGauge(
                    volatility5mMap[sig.assetId],
                    sig.confidence,
                    sig.volatilityPassed
                  );

                  return (
                    <button
                      key={sig.assetId}
                      type="button"
                      data-testid="ict-signal-card"
                      data-in-entry-zone={cardProximity.isInEntryZone ? 'true' : 'false'}
                      onClick={() => setFocusedAssetId(sig.assetId)}
                      className={`spot-plaque-surface text-left rounded-xl p-3 transition-all flex flex-col gap-2 ${
                        isBuy
                          ? `spot-plaque-active-buy ${selected ? 'ring-2 ring-[#16A34A]/65 dark:ring-[#4ADE80]/65' : ''}`
                          : isSell
                            ? `spot-plaque-active-sell ${selected ? 'ring-2 ring-[#DC2626]/65 dark:ring-[#FF6B63]/65' : ''}`
                            : selected
                              ? 'ring-2 ring-[#0071E3]/65 dark:ring-[#FBBF24]/65'
                              : 'hover:brightness-[1.01]'
                      } ${getSpotPulseClass(cardProximity.isInEntryZone, sig.direction)}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="min-w-0 w-full sm:flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
                              {sig.symbol}
                            </span>
                            {sig.setupGrade === 'A+' && (
                              <span
                                data-testid="ict-card-aplus-badge"
                                className="px-1 py-0.5 rounded bg-[#16A34A]/18 dark:bg-[#22C55E]/20 border border-[#16A34A]/45 text-[9.5px] font-mono font-black leading-none text-[#0B5D2A] dark:text-[#4ADE80]"
                              >
                                A+
                              </span>
                            )}
                            <span
                              data-testid="ict-signal-relative-time"
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] border border-black/10 dark:border-white/12 text-[10px] font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#FBBF24]"
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              {formatRelativeTime(sig.evaluatedAt, nowTick)}
                            </span>
                            <span className="text-[10px] font-mono text-[#6C6C70] dark:text-[#9EB5C8]">
                              ICT 2022 · {sig.timeframe}
                            </span>
                            {cardProximity.isInEntryZone && (
                              <span
                                data-testid="ict-card-entry-zone-pill"
                                className={`text-[9.5px] font-mono font-extrabold uppercase tracking-wider ${
                                  isBuy
                                    ? 'text-[#0B5D2A] dark:text-[#4ADE80]'
                                    : 'text-[#B91C1C] dark:text-[#FF6B63]'
                                }`}
                              >
                                · IN ENTRY ZONE
                              </span>
                            )}
                            {dualConfluenceByAsset.has(sig.assetId) && (
                              <span className="text-[9.5px] font-extrabold text-[#0B5D2A] dark:text-[#4ADE80]">
                                · 2-Engine Match
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-semibold text-[#4A4D57] dark:text-[#C7CBD6] truncate mt-0.5">
                            {isBuy || isSell ? `Ready: ${sig.setupName}` : `Wait: ${sig.setupName}`}
                          </p>
                        </div>

                        <div className="flex flex-col items-start sm:items-end gap-1 w-full sm:w-auto sm:shrink-0">
                          <div className="flex items-center gap-1.5 flex-wrap justify-start sm:justify-end">
                            <span
                              data-testid="ict-card-status-badge"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] sm:text-[11px] font-extrabold font-mono tabular-nums whitespace-nowrap ${badgeMeta.classes}`}
                            >
                              {isBuy ? (
                                <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                              ) : isSell ? (
                                <ArrowDown className="w-3 h-3 stroke-[2.5]" />
                              ) : badgeMeta.lean === 'BUY' ? (
                                <>
                                  <Clock className="w-2.5 h-2.5" />
                                  <ArrowUp className="w-2.5 h-2.5 stroke-[2.5]" />
                                </>
                              ) : badgeMeta.lean === 'SELL' ? (
                                <>
                                  <Clock className="w-2.5 h-2.5" />
                                  <ArrowDown className="w-2.5 h-2.5 stroke-[2.5]" />
                                </>
                              ) : (
                                <Clock className="w-3 h-3" />
                              )}
                              {badgeMeta.label} · {sig.confidence}%
                            </span>
                            <VolatilityConfidenceGauge gauge={cardGauge} compact />
                          </div>
                          {typeof sig.atrPct === 'number' && (
                            <span
                              className={`text-[9.5px] font-mono tabular-nums ${
                                sig.volatilityPassed
                                  ? 'text-[#0F7033] dark:text-[#4ADE80]'
                                  : 'text-[#B45309] dark:text-[#FBBF24]'
                              }`}
                            >
                              15m ATR {sig.atrPct.toFixed(3)}% ·{' '}
                              {getVolatilityStatusLabel(sig.volatilityStatus, sig.volatilityPassed)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)_minmax(0,1fr)] gap-2 sm:gap-1.5 text-[10px] font-mono tabular-nums pt-1.5 border-t border-black/8 dark:border-white/10">
                        <div className="col-span-2 sm:col-span-1 min-w-0">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">Spot</span>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span
                              data-price-flash={cardFlash ?? 'none'}
                              className={`spot-price-3d-hero text-sm sm:text-base leading-tight font-black truncate ${getPriceFlashClass(cardFlash)}`}
                            >
                              {asset ? formatAssetPrice(asset) : '—'}
                            </span>
                            <span
                              data-testid="ict-card-spot-bias-badge"
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-extrabold uppercase tracking-wider leading-none whitespace-nowrap shrink-0 ${badgeMeta.classes}`}
                            >
                              {isBuy ? (
                                <ArrowUp className="w-2.5 h-2.5 stroke-[2.75]" />
                              ) : isSell ? (
                                <ArrowDown className="w-2.5 h-2.5 stroke-[2.75]" />
                              ) : badgeMeta.lean === 'BUY' ? (
                                <ArrowUp className="w-2.5 h-2.5 stroke-[2.75]" />
                              ) : badgeMeta.lean === 'SELL' ? (
                                <ArrowDown className="w-2.5 h-2.5 stroke-[2.75]" />
                              ) : (
                                <Clock className="w-2.5 h-2.5" />
                              )}
                              {badgeMeta.label}
                            </span>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">
                            Entry CE / OTE
                          </span>
                          <span className="font-bold text-[#1C1C1E] dark:text-white truncate block mt-0.5">
                            {sig.entryZone}
                          </span>
                        </div>
                        <div className="min-w-0 text-right">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">
                            SL / TP2
                          </span>
                          <span className="font-bold text-[#0F7033] dark:text-[#4ADE80] truncate block mt-0.5">
                            {sig.stopLoss} → {sig.tp2 ?? sig.targetPrice}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" data-testid="ict-pairs-grid">
                {filteredSdcvSignals.map((sig) => {
                  const asset = assetById.get(sig.assetId);
                  const selected = focusedSdcvSignal?.assetId === sig.assetId;
                  const isBuy = sig.direction === 'BUY';
                  const isSell = sig.direction === 'SELL';
                  const expectedBias = resolveSdcvExpectedBias(sig);
                  const liveCardPrice = asset?.price ?? sig.currentPrice;
                  const cardAtrAbs =
                    liveCardPrice > 0 ? liveCardPrice * (sig.atr15mPct / 100) : undefined;
                  const cardPosture = evaluateLiveExecutionPosture({
                    direction: sig.direction,
                    setupArmed: sig.direction !== 'NEUTRAL',
                    armedBias: expectedBias === 'SELL' ? 'SELL' : 'BUY',
                    currentPrice: liveCardPrice,
                    entryLow: sig.entryLowNum,
                    entryHigh: sig.entryHighNum,
                    stopLoss: sig.stopLossNum,
                    tp1: sig.tp1Num,
                    tp2: sig.tp2Num,
                    atr: cardAtrAbs,
                    executionStatus: sig.executionStatus,
                    exactLimitOverride: sig.proximalLineNum ?? sig.limitEntryPriceNum,
                  });
                  const badgeMeta = getDirectionBadgeStyle(
                    sig.direction,
                    expectedBias,
                    cardPosture.posture
                  );
                  const cardProximity = computeSpotProximity({
                    currentPrice: liveCardPrice,
                    entryLow: sig.entryLowNum,
                    entryHigh: sig.entryHighNum,
                    stopLoss: sig.stopLossNum,
                    tp1: sig.tp1Num,
                    direction: sig.direction,
                    executionStatus: sig.executionStatus,
                    posture: cardPosture.posture,
                    chaseProgressPct: cardPosture.chaseProgressPct,
                  });
                  const cardFlash = flashMap[sig.assetId] ?? localFlashMap[sig.assetId];
                  const cardGauge = computeSignalConfidenceGauge(
                    volatility5mMap[sig.assetId],
                    sig.confidence,
                    sig.volatilityPassed
                  );

                  return (
                    <button
                      key={sig.assetId}
                      type="button"
                      data-testid="ict-signal-card"
                      data-in-entry-zone={cardProximity.isInEntryZone ? 'true' : 'false'}
                      onClick={() => setFocusedAssetId(sig.assetId)}
                      className={`spot-plaque-surface text-left rounded-xl p-3 transition-all flex flex-col gap-2 ${
                        isBuy
                          ? `spot-plaque-active-buy ${selected ? 'ring-2 ring-[#16A34A]/65 dark:ring-[#4ADE80]/65' : ''}`
                          : isSell
                            ? `spot-plaque-active-sell ${selected ? 'ring-2 ring-[#DC2626]/65 dark:ring-[#FF6B63]/65' : ''}`
                            : selected
                              ? 'ring-2 ring-[#0071E3]/65 dark:ring-[#FBBF24]/65'
                              : 'hover:brightness-[1.01]'
                      } ${getSpotPulseClass(cardProximity.isInEntryZone, sig.direction)}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div className="min-w-0 w-full sm:flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
                              {sig.symbol}
                            </span>
                            {sig.setupGrade === 'A+' && (
                              <span
                                data-testid="ict-card-aplus-badge"
                                className="px-1 py-0.5 rounded bg-[#16A34A]/18 dark:bg-[#22C55E]/20 border border-[#16A34A]/45 text-[9.5px] font-mono font-black leading-none text-[#0B5D2A] dark:text-[#4ADE80]"
                              >
                                A+
                              </span>
                            )}
                            <span
                              data-testid="ict-signal-relative-time"
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] border border-black/10 dark:border-white/12 text-[10px] font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#FBBF24]"
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              {formatRelativeTime(sig.evaluatedAt, nowTick)}
                            </span>
                            <span className="text-[10px] font-mono text-[#6C6C70] dark:text-[#9EB5C8]">
                              {sig.sdPattern ?? sig.zoneBias} · {sig.volumeRatio.toFixed(2)}x Vol
                            </span>
                            {cardProximity.isInEntryZone && (
                              <span
                                data-testid="ict-card-entry-zone-pill"
                                className={`text-[9.5px] font-mono font-extrabold uppercase tracking-wider ${
                                  isBuy
                                    ? 'text-[#0B5D2A] dark:text-[#4ADE80]'
                                    : 'text-[#B91C1C] dark:text-[#FF6B63]'
                                }`}
                              >
                                · IN ENTRY ZONE
                              </span>
                            )}
                            {dualConfluenceByAsset.has(sig.assetId) && (
                              <span className="text-[9.5px] font-extrabold text-[#0B5D2A] dark:text-[#4ADE80]">
                                · 2-Engine Match
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] font-semibold text-[#4A4D57] dark:text-[#C7CBD6] truncate mt-0.5">
                            {sig.candlePattern}
                          </p>
                        </div>

                        <div className="flex flex-col items-start sm:items-end gap-1 w-full sm:w-auto sm:shrink-0">
                          <div className="flex items-center gap-1.5 flex-wrap justify-start sm:justify-end">
                            <span
                              data-testid="ict-card-status-badge"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] sm:text-[11px] font-extrabold font-mono tabular-nums whitespace-nowrap ${badgeMeta.classes}`}
                            >
                              {isBuy ? (
                                <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                              ) : isSell ? (
                                <ArrowDown className="w-3 h-3 stroke-[2.5]" />
                              ) : badgeMeta.lean === 'BUY' ? (
                                <>
                                  <Clock className="w-2.5 h-2.5" />
                                  <ArrowUp className="w-2.5 h-2.5 stroke-[2.5]" />
                                </>
                              ) : badgeMeta.lean === 'SELL' ? (
                                <>
                                  <Clock className="w-2.5 h-2.5" />
                                  <ArrowDown className="w-2.5 h-2.5 stroke-[2.5]" />
                                </>
                              ) : (
                                <Clock className="w-3 h-3" />
                              )}
                              {badgeMeta.label} · {sig.confidence}%
                            </span>
                            <VolatilityConfidenceGauge gauge={cardGauge} compact />
                          </div>
                          <span
                            className={`text-[9.5px] font-mono tabular-nums ${
                              sig.volatilityPassed
                                ? 'text-[#0F7033] dark:text-[#4ADE80]'
                                : 'text-[#B45309] dark:text-[#FBBF24]'
                            }`}
                          >
                            15m ATR {sig.atr15mPct.toFixed(3)}% ·{' '}
                            {getVolatilityStatusLabel(sig.volatilityStatus, sig.volatilityPassed)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)_minmax(0,1fr)] gap-2 sm:gap-1.5 text-[10px] font-mono tabular-nums pt-1.5 border-t border-black/8 dark:border-white/10">
                        <div className="col-span-2 sm:col-span-1 min-w-0">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">Spot</span>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span
                              data-price-flash={cardFlash ?? 'none'}
                              className={`spot-price-3d-hero text-sm sm:text-base leading-tight font-black truncate ${getPriceFlashClass(cardFlash)}`}
                            >
                              {asset ? formatAssetPrice(asset) : '—'}
                            </span>
                            <span
                              data-testid="ict-card-spot-bias-badge"
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9px] font-extrabold uppercase tracking-wider leading-none whitespace-nowrap shrink-0 ${badgeMeta.classes}`}
                            >
                              {isBuy ? (
                                <ArrowUp className="w-2.5 h-2.5 stroke-[2.75]" />
                              ) : isSell ? (
                                <ArrowDown className="w-2.5 h-2.5 stroke-[2.75]" />
                              ) : badgeMeta.lean === 'BUY' ? (
                                <ArrowUp className="w-2.5 h-2.5 stroke-[2.75]" />
                              ) : badgeMeta.lean === 'SELL' ? (
                                <ArrowDown className="w-2.5 h-2.5 stroke-[2.75]" />
                              ) : (
                                <Clock className="w-2.5 h-2.5" />
                              )}
                              {badgeMeta.label}
                            </span>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">
                            Zone Entry
                          </span>
                          <span className="font-bold text-[#1C1C1E] dark:text-white truncate block mt-0.5">
                            {sig.entryZone}
                          </span>
                        </div>
                        <div className="min-w-0 text-right">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">
                            SL / TP2
                          </span>
                          <span className="font-bold text-[#0F7033] dark:text-[#4ADE80] truncate block mt-0.5">
                            {sig.stopLoss} → {sig.tp2}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right: Unified Persistent ICT Signal Log & Quick Trade Journal (Database-Backed) */}
        <aside
          data-testid="ict-alert-log"
          className="rounded-2xl liquid-glass-card p-4 sm:p-5 flex flex-col gap-3.5"
        >
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-black/8 dark:border-white/10">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <BookOpen className="w-4 h-4 text-[#0071E3] dark:text-[#FBBF24] shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-[#1C1C1E] dark:text-white">
                  Persistent ICT Signal Log &amp; Journal
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                    signalCloudSynced
                      ? 'bg-[#16A34A]/14 text-[#0B5D2A] dark:text-[#4ADE80]'
                      : 'bg-black/[0.06] dark:bg-white/[0.08] text-[#4A4D57] dark:text-[#C7CBD6]'
                  }`}
                >
                  {signalCloudSynced ? (
                    <Cloud className="w-2.5 h-2.5" />
                  ) : (
                    <CloudOff className="w-2.5 h-2.5" />
                  )}
                  {signalCloudSynced ? 'DB Synced' : 'Local DB'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-1 text-[10.5px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8]">
                <span data-testid="ict-alert-expectancy">
                  {radarLogSummary.filled}/{radarLogSummary.total} Filled
                  {radarLogSummary.wins + radarLogSummary.losses > 0
                    ? ` · Auto ${radarLogSummary.wins}W/${radarLogSummary.losses}L (${radarLogSummary.hitRate}%)`
                    : ''}
                </span>
                {radarLogSummary.journalDecided > 0 && (
                  <span className="text-[#0B5D2A] dark:text-[#4ADE80] font-bold">
                    · Journal {radarLogSummary.journalWins}W/{radarLogSummary.journalLosses}L ({radarLogSummary.journalWr}%)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] mt-0.5">
                Auto-captures Entry Zone, Timeframe &amp; Strategy with Zone-Fill verification. Tag your actual Win/Loss directly below.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs font-mono font-bold tabular-nums px-2 py-0.5 rounded-lg liquid-glass-inset text-[#1C1C1E] dark:text-white">
                {persistentRadarSignals.length}
              </span>
              {persistentRadarSignals.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    document
                      .getElementById('signal-history-ledger')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="text-[10px] font-bold text-[#0066CC] dark:text-[#FBBF24] hover:underline whitespace-nowrap"
                >
                  Full Journal ↓
                </button>
              )}
            </div>
          </div>

          {persistentRadarSignals.length === 0 ? (
            <div className="py-8 px-3 text-center flex flex-col items-center gap-2">
              <Crosshair className="w-6 h-6 text-[#6C6C70] dark:text-[#9EB5C8]" />
              <p className="text-xs font-semibold text-[#1C1C1E] dark:text-white">
                No persistent ICT / S&amp;D signals logged yet
              </p>
              <p className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] max-w-xs">
                When BTC/USD or XAU/USD prints a qualified ICT 2022 or Canonical S&amp;D setup, its exact entry zone, timeframe, strategy, and zone-fill status are locked here automatically.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[620px] overflow-y-auto pr-0.5">
              {persistentRadarSignals.slice(0, 18).map((rec) => {
                const isBuy = rec.direction === 'BUY';
                const stratPrefix = rec.sourceEngine === 'sdcv_radar' ? 'S&D' : 'ICT';
                const isFilled =
                  rec.zoneFillVerified === true ||
                  rec.status === 'RUNNING' ||
                  rec.status === 'TP1_HIT' ||
                  rec.status === 'TP2_HIT' ||
                  rec.status === 'SL_HIT' ||
                  rec.status === 'BE_CLOSED';
                const isExpired = rec.status === 'EXPIRED';
                const isEnterNow =
                  rec.executionPosture === 'enter_now' ||
                  (rec.filledOnFirstSight &&
                    rec.executionPosture !== 'limit_pullback_only' &&
                    rec.executionPosture !== 'armed_limit');
                const statusLabel =
                  rec.status === 'TP2_HIT'
                    ? 'TP2 Hit'
                    : rec.status === 'TP1_HIT'
                      ? 'TP1 · BE'
                      : rec.status === 'SL_HIT'
                        ? 'SL Hit'
                        : rec.status === 'BE_CLOSED'
                          ? 'Closed BE'
                          : rec.status === 'RUNNING'
                            ? 'Running'
                            : rec.status === 'EXPIRED'
                              ? 'Unfilled'
                              : 'Pending Limit';
                const statusBadgeCls =
                  rec.status === 'TP2_HIT' || rec.status === 'TP1_HIT'
                    ? 'bg-[#16A34A]/18 text-[#0B5D2A] dark:text-[#4ADE80]'
                    : rec.status === 'SL_HIT'
                      ? 'bg-[#DC2626]/18 text-[#B91C1C] dark:text-[#FF6B63]'
                      : rec.status === 'RUNNING'
                        ? 'bg-[#0071E3]/16 text-[#005BB8] dark:bg-[#F59E0B]/18 dark:text-[#FBBF24]'
                        : 'bg-black/[0.06] dark:bg-white/[0.08] text-[#4A4D57] dark:text-[#C7CBD6]';
                const tfCandidate = rec.timeframe as Timeframe | undefined;
                return (
                  <div
                    key={rec.id}
                    data-testid="ict-persistent-log-row"
                    onClick={() => {
                      if (rec.assetId) setFocusedAssetId(rec.assetId);
                      setStrategyMode(rec.sourceEngine === 'sdcv_radar' ? 'sdcv' : 'ict');
                      if (tfCandidate && ICT_TIMEFRAMES.includes(tfCandidate)) {
                        setSelectedTf(tfCandidate);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (rec.assetId) setFocusedAssetId(rec.assetId);
                      }
                    }}
                    className={`w-full text-left rounded-xl p-3 border transition-colors flex flex-col gap-1.5 cursor-pointer ${
                      activeFocusedId === rec.assetId
                        ? 'bg-[#0071E3]/8 dark:bg-[#F59E0B]/10 border-[#0071E3]/45 dark:border-[#F59E0B]/45'
                        : 'liquid-glass-inset hover:border-[#0071E3]/40 dark:hover:border-[#F59E0B]/40'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="text-xs font-extrabold text-[#1C1C1E] dark:text-white">
                          {rec.symbol}
                        </span>
                        <span
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase whitespace-nowrap ${
                            isBuy
                              ? 'bg-[#16A34A]/18 text-[#0B5D2A] dark:text-[#4ADE80]'
                              : 'bg-[#DC2626]/18 text-[#B91C1C] dark:text-[#FF6B63]'
                          }`}
                        >
                          {isBuy ? (
                            <ArrowUp className="w-2.5 h-2.5 stroke-[2.5]" />
                          ) : (
                            <ArrowDown className="w-2.5 h-2.5 stroke-[2.5]" />
                          )}
                          {stratPrefix} {rec.direction} · {rec.timeframe ?? '15m'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] text-[9.5px] font-bold uppercase text-[#4A4D57] dark:text-[#C7CBD6] whitespace-nowrap">
                          {isEnterNow ? 'Enter Now' : 'Limit Pullback'}
                        </span>
                        <span
                          data-testid="ict-alert-fill-status"
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase whitespace-nowrap ${
                            isFilled
                              ? 'bg-[#16A34A]/14 text-[#0B5D2A] dark:text-[#4ADE80]'
                              : isExpired
                                ? 'bg-black/[0.08] dark:bg-white/[0.12] text-[#6C6C70] dark:text-[#9CA3AF]'
                                : 'bg-[#D97706]/14 text-[#9A5A0A] dark:text-[#FBBF24]'
                          }`}
                        >
                          {isFilled && <ShieldCheck className="w-2.5 h-2.5" />}
                          {isFilled ? 'Zone Filled' : isExpired ? 'Unfilled' : 'Awaiting Fill'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold uppercase whitespace-nowrap ${statusBadgeCls}`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-0.5 shrink-0 text-left sm:text-right">
                        <span
                          data-testid="ict-alert-relative-time"
                          className="text-[10px] font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#FBBF24]"
                        >
                          {formatRelativeTime(rec.createdAtMs, nowTick)}
                        </span>
                        <span
                          data-testid="ict-alert-timestamp"
                          className="text-[9.5px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8]"
                        >
                          {formatWibDateTime(rec.createdAtMs)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-[#1C1C1E] dark:text-[#E5E5EA] truncate">
                        {rec.strategyTag}
                      </p>
                      <span
                        className={`text-[10.5px] font-mono font-extrabold tabular-nums shrink-0 ${
                          rec.pnlPct > 0
                            ? 'text-[#0F7033] dark:text-[#4ADE80]'
                            : rec.pnlPct < 0
                              ? 'text-[#C41C16] dark:text-[#FF6B63]'
                              : 'text-[#6C6C70] dark:text-[#9EB5C8]'
                        }`}
                      >
                        {rec.pnlPct >= 0 ? '+' : ''}
                        {rec.pnlPct.toFixed(2)}% ({rec.rMultiple >= 0 ? '+' : ''}
                        {rec.rMultiple.toFixed(2)}R)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] font-mono tabular-nums text-[#4A4D57] dark:text-[#9EB5C8]">
                        <span>
                          Entry {formatSignalPrice(rec.entryLow, rec.currency, rec.decimals)}–{formatSignalPrice(rec.entryHigh, rec.currency, rec.decimals)}
                        </span>
                        <span className="text-[#C41C16] dark:text-[#FF6B63]">
                          SL {formatSignalPrice(rec.stopLoss, rec.currency, rec.decimals)}
                        </span>
                        <span className="text-[#0F7033] dark:text-[#4ADE80]">
                          TP2 {formatSignalPrice(rec.tp2, rec.currency, rec.decimals)}
                        </span>
                      </div>

                      {onAnnotateSignal && (
                        <div
                          data-testid="alert-outcome-controls"
                          className="inline-flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] mr-0.5">
                            Journal:
                          </span>
                          {(
                            [
                              { id: 'WIN', label: 'Win', activeClass: 'bg-[#16A34A] text-white' },
                              { id: 'LOSS', label: 'Loss', activeClass: 'bg-[#DC2626] text-white' },
                              { id: 'BE', label: 'BE', activeClass: 'bg-[#D97706] text-white' },
                            ] as const
                          ).map((btn) => {
                            const selectedOutcome = rec.userOutcome === btn.id;
                            return (
                              <button
                                key={btn.id}
                                type="button"
                                aria-pressed={selectedOutcome}
                                onClick={() =>
                                  onAnnotateSignal(
                                    rec.id,
                                    selectedOutcome ? null : btn.id,
                                    rec.journalNote
                                  )
                                }
                                className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold transition-colors whitespace-nowrap ${
                                  selectedOutcome
                                    ? btn.activeClass
                                    : 'bg-black/[0.06] dark:bg-white/[0.08] text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                                }`}
                              >
                                {btn.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {rec.journalNote && (
                      <p className="text-[10.5px] italic text-[#4A4D57] dark:text-[#C7CBD6] bg-black/[0.03] dark:bg-white/[0.05] rounded-lg px-2 py-1">
                        “{rec.journalNote}”
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {/* Historical Performance Summary: 'Enter Now' vs 'Limit Pullback' Hit-Rate & Fill Verification */}
      <section
        data-testid="ict-historical-performance"
        className="rounded-2xl liquid-glass-card p-4 sm:p-5 flex flex-col gap-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-black/8 dark:border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <BarChart3 className="w-4 h-4 text-[#0071E3] dark:text-[#FBBF24] shrink-0" />
              <h2 className="text-sm sm:text-base font-extrabold text-[#1C1C1E] dark:text-white">
                Historical Performance · Enter Now vs Limit Pullback
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-black/[0.05] dark:bg-white/[0.08] text-[10px] font-mono font-bold tabular-nums text-[#4A4D57] dark:text-[#C7CBD6]">
                {executionPerf.combined.total} Logged · {executionPerf.combined.filledCount} Verified Fills
              </span>
            </div>
            <p className="text-xs text-[#4A4D57] dark:text-[#9EB5C8] mt-1">
              {executionPerf.edgeNote}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums text-xs">
            <div className="text-right">
              <span className="block text-[9.5px] font-sans uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                Combined Hit Rate
              </span>
              <span className="text-base font-extrabold text-[#1C1C1E] dark:text-white">
                {executionPerf.combined.hitRatePct !== null
                  ? `${executionPerf.combined.hitRatePct}%`
                  : '—'}
              </span>
            </div>
            <span className="h-6 w-px bg-black/10 dark:bg-white/15" aria-hidden="true" />
            <div className="text-right">
              <span className="block text-[9.5px] font-sans uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                Net Return
              </span>
              <span
                className={`text-base font-extrabold ${
                  executionPerf.combined.netR > 0
                    ? 'text-[#0F7033] dark:text-[#4ADE80]'
                    : executionPerf.combined.netR < 0
                      ? 'text-[#C41C16] dark:text-[#FF6B63]'
                      : 'text-[#1C1C1E] dark:text-white'
                }`}
              >
                {executionPerf.combined.netR >= 0 ? '+' : ''}
                {executionPerf.combined.netR.toFixed(1)}R
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {(
            [
              {
                key: 'enterNow',
                testId: 'perf-bucket-enter-now',
                title: 'Enter Now (Market / Zone Fill)',
                subtitle: 'Spot verified inside Entry Zone upon signal emission',
                accentBar: 'bg-[#16A34A] dark:bg-[#4ADE80]',
                badgeCls:
                  'bg-[#16A34A]/16 text-[#0B5D2A] dark:bg-[#22C55E]/18 dark:text-[#4ADE80] border-[#16A34A]/40',
                bucket: executionPerf.enterNow,
              },
              {
                key: 'limitPullback',
                testId: 'perf-bucket-limit-pullback',
                title: 'Limit Pullback (Armed / Chase Guard)',
                subtitle: 'Pending limit awaiting retracement fill into Entry Zone',
                accentBar: 'bg-[#0066CC] dark:bg-[#F59E0B]',
                badgeCls:
                  'bg-[#0066CC]/14 text-[#005BB8] dark:bg-[#F59E0B]/18 dark:text-[#FBBF24] border-[#0066CC]/40 dark:border-[#F59E0B]/45',
                bucket: executionPerf.limitPullback,
              },
            ] as const
          ).map(({ key, testId, title, subtitle, accentBar, badgeCls, bucket }) => (
            <div
              key={key}
              data-testid={testId}
              className="rounded-xl liquid-glass-inset p-3.5 sm:p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-extrabold uppercase tracking-wider ${badgeCls}`}
                  >
                    {title}
                  </span>
                  <p className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] mt-1">
                    {subtitle}
                  </p>
                </div>
                <div className="text-right shrink-0 font-mono tabular-nums">
                  <span className="block text-[9.5px] font-sans uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                    Hit Rate
                  </span>
                  <span className="text-xl font-extrabold text-[#1C1C1E] dark:text-white">
                    {bucket.hitRatePct !== null ? `${bucket.hitRatePct}%` : '—'}
                  </span>
                </div>
              </div>

              {/* Visual Hit-Rate Bar */}
              <div className="w-full h-2 rounded-full bg-black/[0.08] dark:bg-white/[0.10] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${accentBar}`}
                  style={{ width: `${bucket.hitRatePct ?? 0}%` }}
                />
              </div>

              {/* Tabular Performance Telemetry */}
              <div className="grid grid-cols-4 gap-2 pt-1 font-mono tabular-nums text-[11px]">
                <div>
                  <span className="block text-[9.5px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8]">
                    Fill Rate
                  </span>
                  <span className="font-bold text-[#1C1C1E] dark:text-white">
                    {bucket.fillRatePct !== null ? `${bucket.fillRatePct}%` : '—'}
                  </span>
                  <span className="block text-[9.5px] text-[#6C6C70] dark:text-[#9EB5C8]">
                    {bucket.filledCount}/{bucket.total}
                  </span>
                </div>
                <div>
                  <span className="block text-[9.5px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8]">
                    W / BE / L
                  </span>
                  <span className="font-bold text-[#1C1C1E] dark:text-white">
                    {bucket.wins}/{bucket.bes}/{bucket.losses}
                  </span>
                  <span className="block text-[9.5px] text-[#6C6C70] dark:text-[#9EB5C8]">
                    {bucket.awaitingCount} open
                  </span>
                </div>
                <div>
                  <span className="block text-[9.5px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8]">
                    Expectancy
                  </span>
                  <span
                    className={`font-bold ${
                      (bucket.expectancyR ?? 0) > 0
                        ? 'text-[#0F7033] dark:text-[#4ADE80]'
                        : (bucket.expectancyR ?? 0) < 0
                          ? 'text-[#C41C16] dark:text-[#FF6B63]'
                          : 'text-[#1C1C1E] dark:text-white'
                    }`}
                  >
                    {bucket.expectancyR !== null
                      ? `${bucket.expectancyR >= 0 ? '+' : ''}${bucket.expectancyR.toFixed(2)}R`
                      : '—'}
                  </span>
                  <span className="block text-[9.5px] text-[#6C6C70] dark:text-[#9EB5C8]">
                    {bucket.expiredCount} unfilled
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-[9.5px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8]">
                    Net R
                  </span>
                  <span
                    className={`font-extrabold ${
                      bucket.netR > 0
                        ? 'text-[#0F7033] dark:text-[#4ADE80]'
                        : bucket.netR < 0
                          ? 'text-[#C41C16] dark:text-[#FF6B63]'
                          : 'text-[#1C1C1E] dark:text-white'
                    }`}
                  >
                    {bucket.netR >= 0 ? '+' : ''}
                    {bucket.netR.toFixed(1)}R
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Phase 2: Confluence Expectancy Matrix, Triple-Barrier & MAE/MFE Diagnostics */}
        <div
          data-testid="ict-confluence-expectancy-matrix"
          className="pt-3 border-t border-black/8 dark:border-white/10 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-[#1C1C1E] dark:text-white flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#FBBF24]" />
                Confluence Expectancy Matrix &amp; Triple-Barrier MFE/MAE Diagnostics
              </h3>
              <p className="text-[11px] text-[#4A4D57] dark:text-[#9EB5C8] mt-0.5">
                {expectancyMatrix.stopCalibrationNote}
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono tabular-nums text-[11px] shrink-0">
              <div className="px-2.5 py-1 rounded-lg liquid-glass-inset">
                <span className="text-[#6C6C70] dark:text-[#9EB5C8] mr-1">Avg MFE:</span>
                <span className="font-bold text-[#0F7033] dark:text-[#4ADE80]">
                  {expectancyMatrix.avgMfeR !== null ? `+${expectancyMatrix.avgMfeR.toFixed(2)}R` : '—'}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg liquid-glass-inset">
                <span className="text-[#6C6C70] dark:text-[#9EB5C8] mr-1">Avg MAE:</span>
                <span className="font-bold text-[#C41C16] dark:text-[#FF6B63]">
                  {expectancyMatrix.avgMaeR !== null ? `-${expectancyMatrix.avgMaeR.toFixed(2)}R` : '—'}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg liquid-glass-inset">
                <span className="text-[#6C6C70] dark:text-[#9EB5C8] mr-1">Capture:</span>
                <span className="font-bold text-[#1C1C1E] dark:text-white">
                  {expectancyMatrix.edgeCaptureRatioPct !== null
                    ? `${expectancyMatrix.edgeCaptureRatioPct}%`
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Rolling 20-Trade Expectancy Drift & Triple-Barrier Counters */}
          <div
            className={`rounded-xl px-3.5 py-2.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
              expectancyMatrix.driftWarning
                ? 'bg-[#DC2626]/12 border-[#DC2626]/35 text-[#B91C1C] dark:text-[#FF6B63]'
                : 'liquid-glass-inset border-black/8 dark:border-white/10 text-[#1C1C1E] dark:text-[#E2E8F0]'
            }`}
          >
            <div className="flex items-center gap-2">
              {expectancyMatrix.driftWarning ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#0F7033] dark:text-[#4ADE80]" />
              )}
              <span className="font-semibold">{expectancyMatrix.driftMessage}</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10.5px] tabular-nums shrink-0 text-[#4A4D57] dark:text-[#9EB5C8]">
              <span>TP: {expectancyMatrix.barrierBreakdown.upperTp}</span>
              <span>·</span>
              <span>SL: {expectancyMatrix.barrierBreakdown.lowerSl}</span>
              <span>·</span>
              <span>BE: {expectancyMatrix.barrierBreakdown.breakEven}</span>
              <span>·</span>
              <span>Time: {expectancyMatrix.barrierBreakdown.timeBarrier}</span>
            </div>
          </div>

          {/* Per-Feature Expectancy Table */}
          <div className="overflow-x-auto rounded-xl border border-black/8 dark:border-white/10">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-black/8 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] text-[10px] uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8]">
                  <th className="py-2 px-3 font-bold">Confluence / Regime Tag</th>
                  <th className="py-2 px-2.5 text-right font-bold">Trades</th>
                  <th className="py-2 px-2.5 text-right font-bold">Win Rate</th>
                  <th className="py-2 px-2.5 text-right font-bold">Expectancy (E)</th>
                  <th className="py-2 px-2.5 text-right font-bold">MFE / MAE</th>
                  <th className="py-2 px-3 text-right font-bold">Net R</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/6 dark:divide-white/8 font-mono tabular-nums">
                {expectancyMatrix.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-2 px-3 font-sans font-semibold text-[#1C1C1E] dark:text-white">
                      <span>{row.label}</span>
                      <span className="ml-2 text-[9.5px] uppercase text-[#6C6C70] dark:text-[#9EB5C8]">
                        {row.category}
                      </span>
                    </td>
                    <td className="py-2 px-2.5 text-right text-[#4A4D57] dark:text-[#C7CBD6]">
                      {row.sampleSize}
                    </td>
                    <td className="py-2 px-2.5 text-right text-[#1C1C1E] dark:text-white font-semibold">
                      {row.winRatePct !== null ? `${row.winRatePct}%` : '—'}
                    </td>
                    <td
                      className={`py-2 px-2.5 text-right font-bold ${
                        row.expectancyR === null
                          ? 'text-[#6C6C70] dark:text-[#9EB5C8]'
                          : row.expectancyR > 0
                            ? 'text-[#0F7033] dark:text-[#4ADE80]'
                            : row.expectancyR < 0
                              ? 'text-[#C41C16] dark:text-[#FF6B63]'
                              : 'text-[#1C1C1E] dark:text-white'
                      }`}
                    >
                      {row.expectancyR !== null
                        ? `${row.expectancyR >= 0 ? '+' : ''}${row.expectancyR.toFixed(2)}R`
                        : '—'}
                    </td>
                    <td className="py-2 px-2.5 text-right text-[#4A4D57] dark:text-[#C7CBD6]">
                      {row.avgMfeR !== null && row.avgMaeR !== null
                        ? `+${row.avgMfeR.toFixed(1)} / -${row.avgMaeR.toFixed(1)}`
                        : '—'}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        row.netR > 0
                          ? 'text-[#0F7033] dark:text-[#4ADE80]'
                          : row.netR < 0
                            ? 'text-[#C41C16] dark:text-[#FF6B63]'
                            : 'text-[#4A4D57] dark:text-[#C7CBD6]'
                      }`}
                    >
                      {row.sampleSize > 0 ? `${row.netR >= 0 ? '+' : ''}${row.netR.toFixed(1)}R` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Unified Persistent Signal History & Automated Trade Journal */}
      {signalStats && onDeleteSignal && onClearClosedSignals && (
        <div id="signal-history-ledger">
          <SignalHistoryPanel
            records={signalHistory}
            stats={signalStats}
            cloudSynced={signalCloudSynced}
            verificationMetrics={verificationMetrics}
            defaultCategory="radar"
            title="Unified Signal History & Automated Trade Journal"
            subtitle="Continuously captures ICT Radar & S&D setups (entry zone, timeframe, strategy, zone-fill verification) in the database — track live TP1/TP2/SL hit-rates and annotate your actual Win/Loss outcomes."
            onInspectSignal={(sym, builtInId, overlays, tf) => {
              if (onInspectSignal) {
                onInspectSignal(sym, builtInId, overlays, tf);
              } else if (onInspectChart && builtInId) {
                onInspectChart(builtInId, overlays, tf || selectedTf);
              }
            }}
            onAnnotateSignal={onAnnotateSignal}
            onDeleteSignal={onDeleteSignal}
            onClearClosedSignals={onClearClosedSignals}
          />
        </div>
      )}
    </div>
  );
};
