import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Bell,
  BellOff,
  BellRing,
  Calculator,
  CandlestickChart,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Crosshair,
  HelpCircle,
  Hourglass,
  Layers,
  Newspaper,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  EconomicEvent,
  IctSignalAnalysis,
  MarketAsset,
  PriceAlertItem,
  SdCandleVolumeSignal,
  Timeframe,
} from '../types/market';
import { formatAssetPrice } from '../utils/formatters';
import { computeIctSignal, isIctEligibleAsset, scanAllIctSignals } from '../utils/ictSignals';
import {
  computeSdCandleVolumeSignal,
  scanAllSdCandleVolumeSignals,
} from '../utils/sdCandleVolumeSignals';

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
  ) => number;
  onTriggerIctAlert: (signal: IctSignalAnalysis, strategy?: 'ict' | 'sdcv') => void;
  onLoadTimeframe?: (assetId: string, tf: Timeframe) => void;
  onMarkAlertRead?: (id: string) => void;
  onUpdateAlertOutcome?: (id: string, outcome: 'pending' | 'win' | 'be' | 'loss') => void;
  searchQuery?: string;
}

const ICT_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h'];
const MTF_REQUIRED_TFS: Timeframe[] = ['4h', '1h', '15m', '5m'];
const RADAR_PREFS_STORAGE_KEY = 'stocks-ict-radar-prefs-v1';

type InstrumentScopeFilter = 'all' | 'actionable' | 'crypto-gold' | 'fx';
type IctSortMode = 'occurrence' | 'volatility';
type RadarStrategyMode = 'ict' | 'sdcv';

interface RadarPrefs {
  strategyMode: RadarStrategyMode;
  selectedTf: Timeframe;
  scopeFilter: InstrumentScopeFilter;
  sortMode: IctSortMode;
  volatilityFilterEnabled: boolean;
  newsBlackoutEnabled: boolean;
  accountBalance: number;
  riskPct: number;
}

const DEFAULT_RADAR_PREFS: RadarPrefs = {
  strategyMode: 'ict',
  selectedTf: '15m',
  scopeFilter: 'all',
  sortMode: 'occurrence',
  volatilityFilterEnabled: true,
  newsBlackoutEnabled: true,
  accountBalance: 10000,
  riskPct: 1,
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
        parsed.scopeFilter === 'actionable' ||
        parsed.scopeFilter === 'crypto-gold' ||
        parsed.scopeFilter === 'fx'
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
      accountBalance:
        typeof parsed.accountBalance === 'number' && parsed.accountBalance > 0
          ? parsed.accountBalance
          : 10000,
      riskPct:
        typeof parsed.riskPct === 'number' && parsed.riskPct > 0 && parsed.riskPct <= 25
          ? parsed.riskPct
          : 1,
    };
  } catch {
    return DEFAULT_RADAR_PREFS;
  }
}

function getDirectionBadgeStyle(direction: IctSignalAnalysis['direction']): {
  label: 'BUY' | 'SELL' | 'WAIT';
  classes: string;
} {
  if (direction === 'BUY') {
    return {
      label: 'BUY',
      classes:
        'bg-[#16A34A]/20 text-[#0B5D2A] dark:bg-[#22C55E]/22 dark:text-[#4ADE80] border-[#16A34A]/55 shadow-[0_0_10px_rgba(34,197,94,0.18)]',
    };
  }
  if (direction === 'SELL') {
    return {
      label: 'SELL',
      classes:
        'bg-[#DC2626]/20 text-[#B91C1C] dark:bg-[#EF4444]/22 dark:text-[#FF6B63] border-[#DC2626]/55 shadow-[0_0_10px_rgba(239,68,68,0.18)]',
    };
  }
  return {
    label: 'WAIT',
    classes:
      'bg-[#D97706]/20 text-[#9A5A0A] dark:bg-[#F59E0B]/22 dark:text-[#FBBF24] border-[#D97706]/55 shadow-[0_0_10px_rgba(245,158,11,0.14)]',
  };
}

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

function computeSpotProximity(params: {
  currentPrice: number;
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  tp1?: number;
  direction: IctSignalAnalysis['direction'];
  executionStatus?: 'active' | 'standby' | 'invalidated' | 'missed';
}): {
  label: string;
  tone: 'in-zone' | 'near' | 'risk' | 'neutral';
} {
  const { currentPrice, entryLow, entryHigh, stopLoss, tp1, direction, executionStatus } = params;

  if (direction === 'NEUTRAL') {
    if (executionStatus === 'invalidated') {
      return { label: 'Setup Invalidated', tone: 'risk' };
    }
    if (executionStatus === 'missed') {
      return { label: 'TP1 Reached · Missed', tone: 'neutral' };
    }
    return { label: 'Standby · Awaiting Trigger', tone: 'neutral' };
  }

  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    typeof entryLow !== 'number' ||
    typeof entryHigh !== 'number'
  ) {
    return { label: 'Evaluating Spot', tone: 'neutral' };
  }
  const lo = Math.min(entryLow, entryHigh);
  const hi = Math.max(entryLow, entryHigh);
  if (typeof stopLoss === 'number') {
    if (direction === 'BUY' && currentPrice <= stopLoss) {
      return { label: 'Below Stop Loss', tone: 'risk' };
    }
    if (direction === 'SELL' && currentPrice >= stopLoss) {
      return { label: 'Above Stop Loss', tone: 'risk' };
    }
  }
  if (typeof tp1 === 'number') {
    if (direction === 'BUY' && currentPrice >= tp1) {
      return { label: 'Above TP1 Target', tone: 'in-zone' };
    }
    if (direction === 'SELL' && currentPrice <= tp1) {
      return { label: 'Below TP1 Target', tone: 'in-zone' };
    }
  }
  if (currentPrice >= lo && currentPrice <= hi) {
    return { label: 'IN ENTRY ZONE', tone: 'in-zone' };
  }
  if (currentPrice > hi) {
    const distPct = ((currentPrice - hi) / currentPrice) * 100;
    return {
      label: `${distPct.toFixed(2)}% above Entry`,
      tone: distPct <= 0.15 ? 'near' : 'neutral',
    };
  }
  const distPct = ((lo - currentPrice) / currentPrice) * 100;
  return {
    label: `${distPct.toFixed(2)}% below Entry`,
    tone: distPct <= 0.15 ? 'near' : 'neutral',
  };
}

function computePositionSizeMetrics(params: {
  assetId: string;
  currentPrice: number;
  decimals: number;
  direction: IctSignalAnalysis['direction'];
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  accountBalance: number;
  riskPct: number;
}): {
  riskUsd: number;
  stopDistLabel: string;
  positionSizeLabel: string;
  unitsSecondaryLabel: string;
  isLocked: boolean;
} {
  const {
    assetId,
    currentPrice,
    decimals,
    direction,
    entryLow,
    entryHigh,
    stopLoss,
    accountBalance,
    riskPct,
  } = params;
  const safeBalance = Math.max(10, Number.isFinite(accountBalance) ? accountBalance : 10000);
  const safeRiskPct = Math.max(0.1, Math.min(25, Number.isFinite(riskPct) ? riskPct : 1));
  const riskUsd = safeBalance * (safeRiskPct / 100);

  const hasValidLevels =
    typeof entryLow === 'number' &&
    typeof entryHigh === 'number' &&
    typeof stopLoss === 'number';
  const entryMid = hasValidLevels ? (entryLow + entryHigh) / 2 : 0;
  const stopDist = hasValidLevels ? Math.abs(entryMid - stopLoss) : 0;
  const validSpread = Number.isFinite(stopDist) && stopDist > 1e-8;

  const id = assetId.toUpperCase();
  const isFx = id !== 'BTCUSD' && id !== 'XAUUSD';
  const isJpy = id.endsWith('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;

  const computedStopDistLabel = !validSpread
    ? '—'
    : isFx
      ? `${(stopDist / pipSize).toFixed(1)} pips`
      : `$${stopDist.toFixed(decimals)}`;

  if (direction === 'NEUTRAL') {
    return {
      riskUsd,
      stopDistLabel: computedStopDistLabel,
      positionSizeLabel: 'Standby (WAIT)',
      unitsSecondaryLabel: 'Unlocks on BUY/SELL',
      isLocked: true,
    };
  }

  if (!hasValidLevels || !validSpread) {
    return {
      riskUsd,
      stopDistLabel: '—',
      positionSizeLabel: '—',
      unitsSecondaryLabel: 'Awaiting levels',
      isLocked: true,
    };
  }

  if (id === 'BTCUSD') {
    const qty = riskUsd / stopDist;
    return {
      riskUsd,
      stopDistLabel: computedStopDistLabel,
      positionSizeLabel: `${qty.toFixed(4)} BTC`,
      unitsSecondaryLabel: `${(qty * currentPrice).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      })} notional`,
      isLocked: false,
    };
  }

  if (id === 'XAUUSD') {
    const oz = riskUsd / stopDist;
    const stdLots = oz / 100;
    return {
      riskUsd,
      stopDistLabel: computedStopDistLabel,
      positionSizeLabel: `${stdLots.toFixed(2)} lots`,
      unitsSecondaryLabel: `${oz.toFixed(2)} oz Gold`,
      isLocked: false,
    };
  }

  // G10 FX lot sizing
  const pips = stopDist / pipSize;
  const quoteIsUsd = id.endsWith('USD');
  const pipUsdPerStdLot = quoteIsUsd
    ? 10
    : currentPrice > 0
      ? (pipSize / currentPrice) * 100_000
      : 10;
  const lots = riskUsd / Math.max(0.01, pips * pipUsdPerStdLot);
  const units = Math.round(lots * 100_000);

  return {
    riskUsd,
    stopDistLabel: computedStopDistLabel,
    positionSizeLabel: `${lots.toFixed(2)} lots`,
    unitsSecondaryLabel: `${units.toLocaleString('en-US')} units`,
    isLocked: false,
  };
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
  onMarkAlertRead,
  onUpdateAlertOutcome,
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
  const [accountBalance, setAccountBalance] = useState<number>(initialPrefs.accountBalance);
  const [riskPct, setRiskPct] = useState<number>(initialPrefs.riskPct);
  const [copiedTicket, setCopiedTicket] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const requestedMtfRef = useRef<Set<string>>(new Set());

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
        accountBalance,
        riskPct,
      };
      window.localStorage.setItem(RADAR_PREFS_STORAGE_KEY, JSON.stringify(nextPrefs));
    } catch {
      // ignore storage quota errors
    }
  }, [
    strategyMode,
    selectedTf,
    scopeFilter,
    sortMode,
    volatilityFilterEnabled,
    newsBlackoutEnabled,
    accountBalance,
    riskPct,
  ]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Ensure multi-timeframe OHLCV data (4H, 1H, 15M, 5M) is fetched for XAU/USD, BTC/USD & FX pairs
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

  const allSignals = useMemo(() => {
    const prefMap: Record<string, Timeframe> = {};
    for (const a of assets) {
      prefMap[a.id] = selectedTf;
    }
    return scanAllIctSignals(
      assets,
      prefMap,
      volatilityFilterEnabled,
      economicEvents,
      newsBlackoutEnabled
    );
  }, [assets, selectedTf, volatilityFilterEnabled, economicEvents, newsBlackoutEnabled]);

  const allSdcvSignals = useMemo(() => {
    const prefMap: Record<string, Timeframe> = {};
    for (const a of assets) {
      prefMap[a.id] = selectedTf;
    }
    return scanAllSdCandleVolumeSignals(
      assets,
      prefMap,
      volatilityFilterEnabled,
      economicEvents,
      newsBlackoutEnabled
    );
  }, [assets, selectedTf, volatilityFilterEnabled, economicEvents, newsBlackoutEnabled]);

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
      if (scopeFilter === 'actionable' && sig.direction === 'NEUTRAL') return false;
      if (scopeFilter === 'crypto-gold' && sig.assetId !== 'BTCUSD' && sig.assetId !== 'XAUUSD') {
        return false;
      }
      if (scopeFilter === 'fx' && (sig.assetId === 'BTCUSD' || sig.assetId === 'XAUUSD')) {
        return false;
      }
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
      if (scopeFilter === 'actionable' && sig.direction === 'NEUTRAL') return false;
      if (scopeFilter === 'crypto-gold' && sig.assetId !== 'BTCUSD' && sig.assetId !== 'XAUUSD') {
        return false;
      }
      if (scopeFilter === 'fx' && (sig.assetId === 'BTCUSD' || sig.assetId === 'XAUUSD')) {
        return false;
      }
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
    if (targetAsset) {
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
    if (targetAsset) {
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

  const ictAlertHistory = useMemo(
    () => alerts.filter((a) => a.alertKind === 'ict'),
    [alerts]
  );

  const alertOutcomeSummary = useMemo(() => {
    let win = 0;
    let be = 0;
    let loss = 0;
    for (const a of ictAlertHistory) {
      if (a.outcomeStatus === 'win') win += 1;
      else if (a.outcomeStatus === 'be') be += 1;
      else if (a.outcomeStatus === 'loss') loss += 1;
    }
    const decided = win + loss;
    const winRate = decided > 0 ? Math.round((win / decided) * 100) : null;
    return { win, be, loss, total: win + be + loss, winRate };
  }, [ictAlertHistory]);

  const actionableCounts = useMemo(() => {
    let buys = 0;
    let sells = 0;
    const source = strategyMode === 'ict' ? allSignals : allSdcvSignals;
    for (const s of source) {
      if (s.direction === 'BUY') buys += 1;
      else if (s.direction === 'SELL') sells += 1;
    }
    return { buys, sells, total: buys + sells };
  }, [strategyMode, allSignals, allSdcvSignals]);

  const handleSelectTimeframe = (tf: Timeframe) => {
    setSelectedTf(tf);
    if (onLoadTimeframe) {
      for (const sig of allSignals) {
        onLoadTimeframe(sig.assetId, tf);
      }
    }
  };

  const focusedSignalLabel =
    focusedSignal?.direction === 'BUY'
      ? 'BUY'
      : focusedSignal?.direction === 'SELL'
        ? 'SELL'
        : 'WAIT';

  const focusedSdcvLabel =
    focusedSdcvSignal?.direction === 'BUY'
      ? 'BUY'
      : focusedSdcvSignal?.direction === 'SELL'
        ? 'SELL'
        : 'WAIT';

  const isPureIctFocused = Boolean(
    focusedSignal &&
      (focusedSignal.assetId === 'BTCUSD' ||
        focusedSignal.assetId === 'XAUUSD' ||
        focusedSignal.oteZone)
  );

  const confluenceChecks = useMemo(() => {
    if (!focusedSignal) return [];
    return getConfluenceChecks(focusedSignal, isPureIctFocused);
  }, [focusedSignal, isPureIctFocused]);

  const activeFocusedId =
    strategyMode === 'ict' ? focusedSignal?.assetId : focusedSdcvSignal?.assetId;
  const focusedSpotAsset = activeFocusedId ? assetById.get(activeFocusedId) : undefined;
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
      });
    }
    return { label: 'Evaluating Spot', tone: 'neutral' as const };
  }, [strategyMode, focusedSignal, focusedSdcvSignal, focusedSpotAsset]);

  const focusedPositionMetrics = useMemo(() => {
    if (strategyMode === 'ict' && focusedSignal) {
      return computePositionSizeMetrics({
        assetId: focusedSignal.assetId,
        currentPrice: focusedSpotAsset?.price ?? focusedSignal.currentPrice,
        decimals: focusedSignal.decimals,
        direction: focusedSignal.direction,
        entryLow: focusedSignal.entryLowNum,
        entryHigh: focusedSignal.entryHighNum,
        stopLoss: focusedSignal.stopLossNum,
        accountBalance,
        riskPct,
      });
    }
    if (strategyMode === 'sdcv' && focusedSdcvSignal) {
      return computePositionSizeMetrics({
        assetId: focusedSdcvSignal.assetId,
        currentPrice: focusedSpotAsset?.price ?? focusedSdcvSignal.currentPrice,
        decimals: focusedSdcvSignal.decimals,
        direction: focusedSdcvSignal.direction,
        entryLow: focusedSdcvSignal.entryLowNum,
        entryHigh: focusedSdcvSignal.entryHighNum,
        stopLoss: focusedSdcvSignal.stopLossNum,
        accountBalance,
        riskPct,
      });
    }
    return {
      riskUsd: accountBalance * (riskPct / 100),
      stopDistLabel: '—',
      positionSizeLabel: '—',
      unitsSecondaryLabel: '—',
      isLocked: true,
    };
  }, [
    strategyMode,
    focusedSignal,
    focusedSdcvSignal,
    focusedSpotAsset,
    accountBalance,
    riskPct,
  ]);

  const handleCopyTicket = async () => {
    const activeObj = strategyMode === 'ict' ? focusedSignal : focusedSdcvSignal;
    if (!activeObj) return;
    const dirLabel =
      activeObj.direction === 'BUY'
        ? 'BUY'
        : activeObj.direction === 'SELL'
          ? 'SELL'
          : 'WAIT';
    const isWait = dirLabel === 'WAIT';
    const spotStr = focusedSpotAsset
      ? formatAssetPrice(focusedSpotAsset)
      : String(activeObj.currentPrice);
    const lines = [
      `${activeObj.symbol} · ${strategyMode === 'ict' ? 'ICT Liquidity' : 'S&D · Candle & Volume'} · ${dirLabel} (${activeObj.confidence}%)`,
      isWait ? '[STANDBY / PROJECTED LEVELS - DO NOT ENTER]' : '',
      `Spot: ${spotStr} (${focusedProximity.label}) · Entry TF: ${activeObj.timeframe}`,
      `${isWait ? 'Projected Zone Ref' : 'Entry Zone'}: ${activeObj.entryZone}`,
      `${isWait ? 'Invalidation Ref' : 'Stop Loss'}: ${activeObj.stopLoss}${focusedPositionMetrics.stopDistLabel !== '—' ? ` (Dist: ${focusedPositionMetrics.stopDistLabel})` : ''}`,
      strategyMode === 'ict' && focusedSignal
        ? `Targets: ${focusedSignal.tp1 ?? focusedSignal.targetPrice} / ${focusedSignal.tp2 ?? focusedSignal.targetPrice}${focusedSignal.tp3 ? ` / ${focusedSignal.tp3}` : ''} (${focusedSignal.riskReward})`
        : focusedSdcvSignal
          ? `Targets: ${focusedSdcvSignal.tp1} / ${focusedSdcvSignal.tp2} (${focusedSdcvSignal.riskReward})`
          : '',
      isWait
        ? `Risk Allocation (${riskPct}% of $${accountBalance.toLocaleString('en-US')} = $${focusedPositionMetrics.riskUsd.toFixed(0)}): Standby (Unlocks on BUY/SELL)`
        : `Position Size (${riskPct}% of $${accountBalance.toLocaleString('en-US')} = $${focusedPositionMetrics.riskUsd.toFixed(0)}): ${focusedPositionMetrics.positionSizeLabel} (${focusedPositionMetrics.unitsSecondaryLabel})`,
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
                    ? 'Pure ICT (XAU/BTC) & 15M Asian Sweep (G10 FX) · 15m ATR Volatility Band Guard & Asset-Class Invalidation'
                    : 'Independent S&D Zones + Price-Action Candle Anatomy + Volume Confirmation · 15m ATR Safe Volatility Band'}
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
              title="Only triggers BUY/SELL when 15-minute ATR% sits inside the safe min–max range for BTC/USD, XAU/USD, and FX pairs (blocks dead chop and erratic whipsaw spikes)."
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

        {/* Strategy System Switcher Bar (Cleanly separates ICT vs Supply/Demand + Candle + Volume) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-black/8 dark:border-white/10">
          <div
            data-testid="radar-strategy-switcher"
            role="tablist"
            aria-label="Radar trading strategy system"
            className="inline-flex items-center gap-1 rounded-xl liquid-glass-pill p-1 w-fit max-w-full overflow-x-auto no-scrollbar"
          >
            <button
              type="button"
              role="tab"
              data-testid="strategy-tab-ict"
              aria-selected={strategyMode === 'ict'}
              onClick={() => setStrategyMode('ict')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
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
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
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
            15m ATR Guards: BTC 0.095–0.850% · Gold 0.032–0.480% · G10 FX 0.018–0.145%
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
                Close 50% at <strong>TP1</strong> and move SL to breakeven, secure remaining profit at <strong>TP2</strong> (and 20% runner to <strong>TP3</strong> on FX sweeps).
              </p>
            </div>
          </div>
        )}

        {/* Summary KPI Strip + Timeframe & Scope Filters (Zero Charts) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-black/8 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `All Pairs (${activeCountTotal})` },
                { id: 'actionable', label: `Confirmed BUY/SELL (${actionableCounts.total})` },
                {
                  id: 'crypto-gold',
                  label: strategyMode === 'ict' ? 'BTC & XAU (Pure ICT)' : 'BTC & XAU (S&D)',
                },
                {
                  id: 'fx',
                  label: strategyMode === 'ict' ? 'G10 FX (Asian Sweep)' : 'G10 FX (S&D)',
                },
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

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Automatic Active Signal Sort Toggle: Time Since Occurrence vs Asset Volatility */}
            <div
              data-testid="ict-sort-toggle"
              role="group"
              aria-label="Sort active signals"
              className="inline-flex items-center gap-1 rounded-xl liquid-glass-pill p-1 shrink-0"
            >
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] px-2">
                <ArrowUpDown className="w-3 h-3" />
                Sort:
              </span>
              <button
                type="button"
                data-testid="ict-sort-occurrence"
                aria-pressed={sortMode === 'occurrence'}
                onClick={() => setSortMode('occurrence')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap ${
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
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap ${
                  sortMode === 'volatility'
                    ? 'bg-[#0066CC] dark:bg-[#B45309] text-white shadow-xs'
                    : 'text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                }`}
              >
                Asset volatility
              </button>
            </div>

            <div className="flex flex-col items-end gap-0.5">
              <div
                role="tablist"
                aria-label="Evaluation timeframe"
                className="flex items-center gap-1 overflow-x-auto no-scrollbar"
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] mr-1 shrink-0">
                  Entry TF:
                </span>
                {ICT_TIMEFRAMES.map((tf) => {
                  const active = selectedTf === tf;
                  const fxAnchored =
                    strategyMode === 'ict' &&
                    focusedSignal &&
                    !isPureIctFocused &&
                    (tf === '1h' || tf === '4h');
                  return (
                    <button
                      key={tf}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => handleSelectTimeframe(tf)}
                      title={
                        fxAnchored
                          ? 'FX Asian Sweep strictly uses 15m Asia Range + 5m/1m LTF; 1h/4h informs HTF bias.'
                          : `Evaluate ${tf} closed-candle structure`
                      }
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-[#0066CC] dark:bg-[#B45309] text-white shadow-xs'
                          : fxAnchored
                            ? 'liquid-glass-pill text-[#6C6C70] dark:text-[#8E8E93] opacity-75 hover:opacity-100'
                            : 'liquid-glass-pill text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                      }`}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
              {strategyMode === 'ict' && focusedSignal && !isPureIctFocused && (
                <span className="text-[10px] font-mono text-[#6C6C70] dark:text-[#9EB5C8]">
                  FX Asian Sweep anchors 15m Range + 5m/1m LTF (1h/4h sets HTF draw)
                </span>
              )}
            </div>
          </div>
        </div>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg sm:text-xl font-extrabold text-[#1C1C1E] dark:text-white">
                      {focusedSignal.symbol}
                    </span>
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
                  <p className="text-xs font-bold text-[#1C1C1E] dark:text-[#F1F5F9] mt-1">
                    <span className="text-[#6C6C70] dark:text-[#9EB5C8] uppercase tracking-wider mr-1.5">
                      {isPureIctFocused ? 'PURE ICT ENGINE:' : 'ASIAN SWEEP ENGINE:'}
                    </span>
                    <span>
                      {focusedSignal.setupName} · {focusedSignal.pdZone} · {focusedSignal.sessionLabel ?? focusedSignal.killzone}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {/* Prominent 3D Illuminated Live Spot Price Plaque + Proximity Status */}
                  {focusedSpotAsset && (
                    <div
                      data-testid="ict-focused-spot-price"
                      className={`spot-plaque-surface rounded-xl px-4 py-2.5 flex flex-col items-end justify-center shrink-0 transition-shadow ${
                        focusedSignal.direction === 'BUY'
                          ? 'spot-plaque-active-buy'
                          : focusedSignal.direction === 'SELL'
                            ? 'spot-plaque-active-sell'
                            : ''
                      }`}
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
                      <span className="spot-price-3d-hero text-2xl sm:text-3xl font-mono font-black tracking-tight tabular-nums leading-none mt-0.5">
                        {formatAssetPrice(focusedSpotAsset)}
                      </span>
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

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <span
                      data-testid="ict-focused-signal-badge"
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-extrabold tracking-wide whitespace-nowrap ${getDirectionBadgeStyle(focusedSignal.direction).classes}`}
                    >
                      {focusedSignal.direction === 'BUY' ? (
                        <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : focusedSignal.direction === 'SELL' ? (
                        <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      {focusedSignalLabel} · {focusedSignal.confidence}%
                    </span>

                    <button
                      type="button"
                      data-testid="ict-copy-ticket-btn"
                      onClick={handleCopyTicket}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg liquid-glass-pill text-xs font-bold text-[#1C1C1E] dark:text-white hover:brightness-95 dark:hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                      title="Copy Entry Zone, Stop Loss, Take Profits & Lot Size to clipboard"
                    >
                      {copiedTicket ? (
                        <Check className="w-3.5 h-3.5 text-[#0F7033] dark:text-[#4ADE80]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedTicket ? 'Copied' : 'Copy Ticket'}
                    </button>

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
                      ? 'ACTION: PREPARE BUY LIMIT — Place order inside Entry Zone below'
                      : focusedSignal.direction === 'SELL'
                        ? 'ACTION: PREPARE SELL LIMIT — Place order inside Entry Zone below'
                        : 'ACTION: DO NOT ENTER YET (WAIT) — Stay flat until conditions confirm'}
                  </span>
                  <span className="text-[11px] font-mono font-bold tabular-nums opacity-90">
                    {isPureIctFocused
                      ? `Entry TF: ${focusedSignal.timeframe}`
                      : `LTF Execution: ${focusedSignal.timeframe}`}
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
                    {isPureIctFocused ? 'Pure ICT (OTE + FVG)' : 'Asian Sweep + MSS/FVG'}
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
                      : `3-Candle FVG (${focusedSignal.timeframe})`}
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
                  <span className="text-[10px] text-[#4A4D57] dark:text-[#9EB5C8] block mt-0.5 truncate">
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
                      : '4. Target & R:R'}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-[#0F7033] dark:text-[#4ADE80] block mt-1">
                    {focusedSignal.targetPrice}
                  </span>
                  <span className="text-[10px] font-mono text-[#4A4D57] dark:text-[#9EB5C8] block mt-0.5 truncate">
                    R:R {focusedSignal.riskReward} · Score {focusedSignal.precisionScore ?? focusedSignal.confidence}/100
                  </span>
                </div>
              </div>

              {isPureIctFocused ? (
                <>
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
                </>
              ) : (
                <>
                  {/* G10 FX Pairs: Top-Down HTF Bias + 3-Tier Take Profit Split */}
                  <div className="rounded-xl liquid-glass-inset p-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1">
                        <Target className="w-3 h-3 text-[#16A34A] dark:text-[#4ADE80]" />
                        TAKE PROFIT MANAGEMENT (50% BE · 30% · 20% RUNNER)
                      </span>
                      <span className="text-[10.5px] font-mono text-[#4A4D57] dark:text-[#9EB5C8]">
                        HTF 4H/1H: {focusedSignal.htfBiasDetail ?? `${focusedSignal.htfBias ?? 'Ranging'} · Target ${focusedSignal.targetPrice}`}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-2.5 py-2 border border-black/6 dark:border-white/8">
                        <span className="text-[10px] font-bold text-[#6C6C70] dark:text-[#9EB5C8] block">
                          TP1 (Close 50% + Move SL to BE)
                        </span>
                        <span className="font-mono font-bold tabular-nums text-[#0F7033] dark:text-[#4ADE80] block mt-0.5">
                          {focusedSignal.tp1 ?? focusedSignal.targetPrice}
                        </span>
                        <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] block truncate">
                          {focusedSignal.tp1Label ?? 'Opposing Asian Boundary'}
                        </span>
                      </div>
                      <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-2.5 py-2 border border-black/6 dark:border-white/8">
                        <span className="text-[10px] font-bold text-[#6C6C70] dark:text-[#9EB5C8] block">
                          TP2 (Close 30% · Min 1:3 R:R)
                        </span>
                        <span className="font-mono font-bold tabular-nums text-[#0F7033] dark:text-[#4ADE80] block mt-0.5">
                          {focusedSignal.tp2 ?? focusedSignal.targetPrice}
                        </span>
                        <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] block truncate">
                          {focusedSignal.tp2Label ?? 'PDH/PDL / 1H Pool'}
                        </span>
                      </div>
                      <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-2.5 py-2 border border-black/6 dark:border-white/8">
                        <span className="text-[10px] font-bold text-[#6C6C70] dark:text-[#9EB5C8] block">
                          TP3 (Trail 20% Runner)
                        </span>
                        <span className="font-mono font-bold tabular-nums text-[#0F7033] dark:text-[#4ADE80] block mt-0.5">
                          {focusedSignal.tp3 ?? focusedSignal.targetPrice}
                        </span>
                        <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] block truncate">
                          {focusedSignal.tp3Label ?? '4H External Pool'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {focusedSignal.pyramidNote && (
                    <p className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] font-mono">
                      {focusedSignal.pyramidNote}
                    </p>
                  )}
                </>
              )}

              {/* Inline Position Size & Risk Calculator */}
              <div
                data-testid="ict-position-calculator"
                className="rounded-xl liquid-glass-inset px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#005BB8] dark:text-[#FBBF24] flex items-center gap-1">
                    <Calculator className="w-3.5 h-3.5 shrink-0" />
                    Position Sizing
                  </span>
                  <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#4A4D57] dark:text-[#C7CBD6]">
                    <span>Balance $</span>
                    <input
                      type="number"
                      min={100}
                      step={500}
                      value={accountBalance}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v) && v >= 10) setAccountBalance(v);
                      }}
                      aria-label="Account balance in USD"
                      className="w-20 px-2 py-1 rounded-lg bg-white/80 dark:bg-black/30 border border-black/12 dark:border-white/15 font-mono font-bold tabular-nums text-[#1C1C1E] dark:text-white text-[11px]"
                    />
                  </label>
                  <div className="inline-flex items-center gap-1">
                    <span className="text-[11px] font-semibold text-[#4A4D57] dark:text-[#C7CBD6]">
                      Risk:
                    </span>
                    {[0.5, 1, 2].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRiskPct(preset)}
                        className={`px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold transition-colors whitespace-nowrap ${
                          riskPct === preset
                            ? 'bg-[#0066CC] dark:bg-[#B45309] text-white'
                            : 'bg-black/[0.05] dark:bg-white/[0.08] text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px]">
                  <span className="text-[#4A4D57] dark:text-[#C7CBD6]">
                    Risk{' '}
                    <strong className="text-[#1C1C1E] dark:text-white">
                      ${focusedPositionMetrics.riskUsd.toFixed(0)}
                    </strong>
                  </span>
                  <span className="text-[#4A4D57] dark:text-[#C7CBD6]">
                    SL Dist{' '}
                    <strong className="text-[#C41C16] dark:text-[#FF6B63]">
                      {focusedPositionMetrics.stopDistLabel}
                    </strong>
                  </span>
                  <span
                    className={`font-extrabold ${
                      focusedPositionMetrics.isLocked
                        ? 'text-[#9A5A0A] dark:text-[#FBBF24]'
                        : 'text-[#0B5D2A] dark:text-[#4ADE80]'
                    }`}
                  >
                    Size {focusedPositionMetrics.positionSizeLabel}
                  </span>
                  <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8]">
                    ({focusedPositionMetrics.unitsSecondaryLabel})
                  </span>
                </div>
              </div>

              {/* Explicit Asset-Type Invalidation & 15m Volatility Cap Trigger Box */}
              <div
                data-testid="ict-invalidation-box"
                className="rounded-xl bg-[#DC2626]/6 dark:bg-[#EF4444]/8 border border-[#DC2626]/25 px-3.5 py-2.5 flex flex-col gap-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#B91C1C] dark:text-[#FF6B63] flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    Invalidation Trigger · {focusedSignal.assetClassLabel ?? (isPureIctFocused ? 'Crypto / Gold' : 'G10 FX')}
                  </span>
                  <span className="text-[10.5px] font-mono font-bold tabular-nums text-[#4A4D57] dark:text-[#C7CBD6]">
                    Allowed 15m ATR: {focusedSignal.volatilityThresholdPct?.toFixed(3) ?? '0.018'}% –{' '}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg sm:text-xl font-extrabold text-[#1C1C1E] dark:text-white">
                      {focusedSdcvSignal.symbol}
                    </span>
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
                  <p className="text-xs font-bold text-[#1C1C1E] dark:text-[#F1F5F9] mt-1">
                    <span className="text-[#6C6C70] dark:text-[#9EB5C8] uppercase tracking-wider mr-1.5">
                      S&amp;D · CANDLE &amp; VOLUME:
                    </span>
                    <span>
                      {focusedSdcvSignal.zoneStatus} {focusedSdcvSignal.zoneBias} · {focusedSdcvSignal.candlePattern} ·{' '}
                      {focusedSdcvSignal.volumeRatio.toFixed(2)}x {focusedSdcvSignal.volumeSource}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {focusedSpotAsset && (
                    <div
                      data-testid="ict-focused-spot-price"
                      className={`spot-plaque-surface rounded-xl px-4 py-2.5 flex flex-col items-end justify-center shrink-0 transition-shadow ${
                        focusedSdcvSignal.direction === 'BUY'
                          ? 'spot-plaque-active-buy'
                          : focusedSdcvSignal.direction === 'SELL'
                            ? 'spot-plaque-active-sell'
                            : ''
                      }`}
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
                      <span className="spot-price-3d-hero text-2xl sm:text-3xl font-mono font-black tracking-tight tabular-nums leading-none mt-0.5">
                        {formatAssetPrice(focusedSpotAsset)}
                      </span>
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

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <span
                      data-testid="ict-focused-signal-badge"
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-extrabold tracking-wide whitespace-nowrap ${getDirectionBadgeStyle(focusedSdcvSignal.direction).classes}`}
                    >
                      {focusedSdcvSignal.direction === 'BUY' ? (
                        <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : focusedSdcvSignal.direction === 'SELL' ? (
                        <ArrowDown className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" />
                      )}
                      {focusedSdcvLabel} · {focusedSdcvSignal.confidence}%
                    </span>

                    <button
                      type="button"
                      data-testid="ict-copy-ticket-btn"
                      onClick={handleCopyTicket}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg liquid-glass-pill text-xs font-bold text-[#1C1C1E] dark:text-white hover:brightness-95 dark:hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                      title="Copy S&D Entry Zone, Stop Loss, Take Profits & Lot Size to clipboard"
                    >
                      {copiedTicket ? (
                        <Check className="w-3.5 h-3.5 text-[#0F7033] dark:text-[#4ADE80]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedTicket ? 'Copied' : 'Copy Ticket'}
                    </button>

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
                      ? 'ACTION: BUY DEMAND REACTION — Candle + Volume confirmed at Demand Zone'
                      : focusedSdcvSignal.direction === 'SELL'
                        ? 'ACTION: SELL SUPPLY REJECTION — Candle + Volume confirmed at Supply Zone'
                        : 'ACTION: WAIT FOR CONFLUENCE — Awaiting S&D Zone Tap + Candle + Volume >= 1.08x'}
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
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6C6C70] dark:text-[#9EB5C8] flex items-center gap-1">
                    <BarChart3 className="w-3.5 h-3.5 text-[#0F7033] dark:text-[#4ADE80]" />
                    {focusedSdcvSignal.volumeSource}: {focusedSdcvSignal.volumeRatio.toFixed(2)}x ({focusedSdcvSignal.volumeState})
                  </span>
                  <p className="text-[11.5px] font-medium text-[#1C1C1E] dark:text-[#F1F5F9]">
                    {focusedSdcvSignal.volumeRatio >= 1.08
                      ? 'Volume expansion confirms institutional participation behind candle reaction.'
                      : 'Participation below 1.08x expansion threshold — avoid forcing premature entries.'}
                  </p>
                </div>
              </div>

              {/* Inline Position Size & Risk Calculator */}
              <div
                data-testid="ict-position-calculator"
                className="rounded-xl liquid-glass-inset px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#005BB8] dark:text-[#FBBF24] flex items-center gap-1">
                    <Calculator className="w-3.5 h-3.5 shrink-0" />
                    Position Sizing
                  </span>
                  <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#4A4D57] dark:text-[#C7CBD6]">
                    <span>Balance $</span>
                    <input
                      type="number"
                      min={100}
                      step={500}
                      value={accountBalance}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v) && v >= 10) setAccountBalance(v);
                      }}
                      aria-label="Account balance in USD"
                      className="w-20 px-2 py-1 rounded-lg bg-white/80 dark:bg-black/30 border border-black/12 dark:border-white/15 font-mono font-bold tabular-nums text-[#1C1C1E] dark:text-white text-[11px]"
                    />
                  </label>
                  <div className="inline-flex items-center gap-1">
                    <span className="text-[11px] font-semibold text-[#4A4D57] dark:text-[#C7CBD6]">
                      Risk:
                    </span>
                    {[0.5, 1, 2].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRiskPct(preset)}
                        className={`px-2 py-0.5 rounded-md text-[10.5px] font-mono font-bold transition-colors whitespace-nowrap ${
                          riskPct === preset
                            ? 'bg-[#0066CC] dark:bg-[#B45309] text-white'
                            : 'bg-black/[0.05] dark:bg-white/[0.08] text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px]">
                  <span className="text-[#4A4D57] dark:text-[#C7CBD6]">
                    Risk{' '}
                    <strong className="text-[#1C1C1E] dark:text-white">
                      ${focusedPositionMetrics.riskUsd.toFixed(0)}
                    </strong>
                  </span>
                  <span className="text-[#4A4D57] dark:text-[#C7CBD6]">
                    SL Dist{' '}
                    <strong className="text-[#C41C16] dark:text-[#FF6B63]">
                      {focusedPositionMetrics.stopDistLabel}
                    </strong>
                  </span>
                  <span
                    className={`font-extrabold ${
                      focusedPositionMetrics.isLocked
                        ? 'text-[#9A5A0A] dark:text-[#FBBF24]'
                        : 'text-[#0B5D2A] dark:text-[#4ADE80]'
                    }`}
                  >
                    Size {focusedPositionMetrics.positionSizeLabel}
                  </span>
                  <span className="text-[10px] text-[#6C6C70] dark:text-[#9EB5C8]">
                    ({focusedPositionMetrics.unitsSecondaryLabel})
                  </span>
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm sm:text-base font-bold text-[#1C1C1E] dark:text-white">
                {strategyMode === 'ict'
                  ? 'ICT Precision Matrix: XAU/USD, BTC/USD & G10 FX'
                  : 'S&D · Candle & Volume Matrix: XAU/USD, BTC/USD & G10 FX'}
              </h2>
              <span className="text-xs font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8]">
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
                  const isPureIctCard =
                    sig.assetId === 'BTCUSD' || sig.assetId === 'XAUUSD' || Boolean(sig.oteZone);
                  const badgeMeta = getDirectionBadgeStyle(sig.direction);

                  return (
                    <button
                      key={sig.assetId}
                      type="button"
                      onClick={() => setFocusedAssetId(sig.assetId)}
                      className={`text-left rounded-xl p-3 border transition-all flex flex-col gap-2 ${
                        isBuy
                          ? `spot-plaque-surface spot-plaque-active-buy ${selected ? 'ring-2 ring-[#16A34A]/60 dark:ring-[#4ADE80]/60' : ''}`
                          : isSell
                            ? `spot-plaque-surface spot-plaque-active-sell ${selected ? 'ring-2 ring-[#DC2626]/60 dark:ring-[#FF6B63]/60' : ''}`
                            : selected
                              ? 'bg-[#0071E3]/10 dark:bg-[#F59E0B]/12 border-[#0071E3]/55 dark:border-[#F59E0B]/55 shadow-sm'
                              : 'liquid-glass-inset hover:border-[#0071E3]/45 dark:hover:border-[#F59E0B]/45'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
                              {sig.symbol}
                            </span>
                            <span
                              data-testid="ict-signal-relative-time"
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] border border-black/10 dark:border-white/12 text-[10px] font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#FBBF24]"
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              {formatRelativeTime(sig.evaluatedAt, nowTick)}
                            </span>
                            <span className="text-[10px] font-mono text-[#6C6C70] dark:text-[#9EB5C8]">
                              {isPureIctCard ? `Pure ICT · ${sig.timeframe}` : `HTF ${sig.htfBias ?? 'Ranging'}`}
                            </span>
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

                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <span
                            data-testid="ict-card-status-badge"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-extrabold font-mono tabular-nums whitespace-nowrap ${badgeMeta.classes}`}
                          >
                            {isBuy ? (
                              <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                            ) : isSell ? (
                              <ArrowDown className="w-3 h-3 stroke-[2.5]" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            {badgeMeta.label} · {sig.confidence}%
                          </span>
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

                      <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono tabular-nums pt-1.5 border-t border-black/6 dark:border-white/8">
                        <div className="min-w-0">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">Spot</span>
                          <span
                            className={`truncate block font-black ${
                              isBuy || isSell
                                ? 'spot-price-3d-hero text-sm sm:text-base leading-tight'
                                : 'spot-price-3d-card text-[13px]'
                            }`}
                          >
                            {asset ? formatAssetPrice(asset) : '—'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">
                            {isPureIctCard ? 'Entry OTE' : 'Entry FVG'}
                          </span>
                          <span className="font-bold text-[#1C1C1E] dark:text-white truncate block">
                            {sig.entryZone}
                          </span>
                        </div>
                        <div className="min-w-0 text-right">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">
                            {isPureIctCard ? 'SL / Target' : 'SL / TP2'}
                          </span>
                          <span className="font-bold text-[#0F7033] dark:text-[#4ADE80] truncate block">
                            {sig.stopLoss} → {isPureIctCard ? sig.targetPrice : sig.tp2 ?? sig.targetPrice}
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
                  const badgeMeta = getDirectionBadgeStyle(sig.direction);

                  return (
                    <button
                      key={sig.assetId}
                      type="button"
                      onClick={() => setFocusedAssetId(sig.assetId)}
                      className={`text-left rounded-xl p-3 border transition-all flex flex-col gap-2 ${
                        isBuy
                          ? `spot-plaque-surface spot-plaque-active-buy ${selected ? 'ring-2 ring-[#16A34A]/60 dark:ring-[#4ADE80]/60' : ''}`
                          : isSell
                            ? `spot-plaque-surface spot-plaque-active-sell ${selected ? 'ring-2 ring-[#DC2626]/60 dark:ring-[#FF6B63]/60' : ''}`
                            : selected
                              ? 'bg-[#0071E3]/10 dark:bg-[#F59E0B]/12 border-[#0071E3]/55 dark:border-[#F59E0B]/55 shadow-sm'
                              : 'liquid-glass-inset hover:border-[#0071E3]/45 dark:hover:border-[#F59E0B]/45'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
                              {sig.symbol}
                            </span>
                            <span
                              data-testid="ict-signal-relative-time"
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] border border-black/10 dark:border-white/12 text-[10px] font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#FBBF24]"
                            >
                              <Clock className="w-2.5 h-2.5 shrink-0" />
                              {formatRelativeTime(sig.evaluatedAt, nowTick)}
                            </span>
                            <span className="text-[10px] font-mono text-[#6C6C70] dark:text-[#9EB5C8]">
                              {sig.zoneBias} · {sig.volumeRatio.toFixed(2)}x Vol
                            </span>
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

                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <span
                            data-testid="ict-card-status-badge"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-extrabold font-mono tabular-nums whitespace-nowrap ${badgeMeta.classes}`}
                          >
                            {isBuy ? (
                              <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                            ) : isSell ? (
                              <ArrowDown className="w-3 h-3 stroke-[2.5]" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            {badgeMeta.label} · {sig.confidence}%
                          </span>
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

                      <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono tabular-nums pt-1.5 border-t border-black/6 dark:border-white/8">
                        <div className="min-w-0">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">Spot</span>
                          <span
                            className={`truncate block font-black ${
                              isBuy || isSell
                                ? 'spot-price-3d-hero text-sm sm:text-base leading-tight'
                                : 'spot-price-3d-card text-[13px]'
                            }`}
                          >
                            {asset ? formatAssetPrice(asset) : '—'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">
                            Zone Entry
                          </span>
                          <span className="font-bold text-[#1C1C1E] dark:text-white truncate block">
                            {sig.entryZone}
                          </span>
                        </div>
                        <div className="min-w-0 text-right">
                          <span className="text-[#6C6C70] dark:text-[#9EB5C8] block">
                            SL / TP2
                          </span>
                          <span className="font-bold text-[#0F7033] dark:text-[#4ADE80] truncate block">
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

        {/* Right: Persistent Timestamped ICT Alert Feed (Retained even when Pop-ups are Deactivated) */}
        <aside
          data-testid="ict-alert-log"
          className="rounded-2xl liquid-glass-card p-4 sm:p-5 flex flex-col gap-3.5"
        >
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-black/8 dark:border-white/10">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Clock className="w-4 h-4 text-[#0071E3] dark:text-[#FBBF24]" />
                <h2 className="text-sm sm:text-base font-bold text-[#1C1C1E] dark:text-white">
                  Radar Signal Alert Log
                </h2>
                {alertOutcomeSummary.total > 0 && (
                  <span className="text-[10.5px] font-mono font-bold tabular-nums text-[#0B5D2A] dark:text-[#4ADE80]">
                    {alertOutcomeSummary.win}W · {alertOutcomeSummary.be}BE · {alertOutcomeSummary.loss}L
                    {alertOutcomeSummary.winRate !== null ? ` (${alertOutcomeSummary.winRate}%)` : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] mt-0.5">
                {ictPopupsEnabled
                  ? 'Pop-up notifications Active — setups persist 48h here with Win/BE/Loss outcome tracking.'
                  : 'Pop-up notifications Deactivated — signals persist 48h silently here with exact timestamps.'}
              </p>
            </div>
            <span className="text-xs font-mono font-bold tabular-nums px-2 py-0.5 rounded-lg liquid-glass-inset text-[#1C1C1E] dark:text-white shrink-0">
              {ictAlertHistory.length}
            </span>
          </div>

          {ictAlertHistory.length === 0 ? (
            <div className="py-8 px-3 text-center flex flex-col items-center gap-2">
              <Crosshair className="w-6 h-6 text-[#6C6C70] dark:text-[#9EB5C8]" />
              <p className="text-xs font-semibold text-[#1C1C1E] dark:text-white">
                No ICT or S&amp;D setups triggered yet
              </p>
              <p className="text-[11px] text-[#6C6C70] dark:text-[#9EB5C8] max-w-xs">
                Setups trigger automatically on Pure ICT OTE (XAU/BTC), Asian sweep + LTF MSS/FVG (G10 FX), and S&amp;D Candle + Volume reactions, or click Scan now.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[620px] overflow-y-auto pr-0.5">
              {ictAlertHistory.map((item) => {
                const isBuy = item.ictAction === 'BUY';
                const isSell = item.ictAction === 'SELL';
                const stratPrefix = item.ictStrategy === 'sdcv' ? 'S&D' : 'ICT';
                const curOutcome = item.outcomeStatus ?? 'pending';
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onMarkAlertRead?.(item.id);
                      setFocusedAssetId(item.assetId);
                      if (item.ictStrategy === 'sdcv') {
                        setStrategyMode('sdcv');
                      } else if (item.ictStrategy === 'ict') {
                        setStrategyMode('ict');
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onMarkAlertRead?.(item.id);
                        setFocusedAssetId(item.assetId);
                      }
                    }}
                    className={`w-full text-left rounded-xl p-3 border transition-colors flex flex-col gap-1.5 cursor-pointer ${
                      activeFocusedId === item.assetId
                        ? 'bg-[#0071E3]/8 dark:bg-[#F59E0B]/10 border-[#0071E3]/45 dark:border-[#F59E0B]/45'
                        : 'liquid-glass-inset hover:border-[#0071E3]/40 dark:hover:border-[#F59E0B]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="text-xs font-extrabold text-[#1C1C1E] dark:text-white">
                          {item.symbol}
                        </span>
                        <span
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase whitespace-nowrap ${
                            isBuy
                              ? 'bg-[#16A34A]/18 text-[#0B5D2A] dark:text-[#4ADE80]'
                              : isSell
                                ? 'bg-[#DC2626]/18 text-[#B91C1C] dark:text-[#FF6B63]'
                                : 'bg-[#D97706]/18 text-[#9A5A0A] dark:text-[#FBBF24]'
                          }`}
                        >
                          {isBuy ? (
                            <ArrowUp className="w-2.5 h-2.5 stroke-[2.5]" />
                          ) : isSell ? (
                            <ArrowDown className="w-2.5 h-2.5 stroke-[2.5]" />
                          ) : (
                            <Clock className="w-2.5 h-2.5" />
                          )}
                          {stratPrefix} {item.ictAction ?? 'WAIT'} · {item.ictTimeframe ?? '15m'}
                        </span>
                        <span className="text-[10px] font-mono font-bold tabular-nums text-[#4A4D57] dark:text-[#C7CBD6]">
                          {item.confidence ?? 45}%
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
                        <span
                          data-testid="ict-alert-relative-time"
                          className="text-[10px] font-mono font-bold tabular-nums text-[#005BB8] dark:text-[#FBBF24]"
                        >
                          {formatRelativeTime(item.triggeredAt, nowTick)}
                        </span>
                        <span
                          data-testid="ict-alert-timestamp"
                          className="text-[9.5px] font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8]"
                        >
                          {formatWibDateTime(item.triggeredAt)}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] font-semibold text-[#1C1C1E] dark:text-[#E5E5EA] truncate">
                      {item.ictSetup}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] font-mono tabular-nums text-[#4A4D57] dark:text-[#9EB5C8]">
                        <span>Entry {item.entryZone}</span>
                        <span className="text-[#C41C16] dark:text-[#FF6B63]">SL {item.stopLoss}</span>
                        <span className="text-[#0F7033] dark:text-[#4ADE80]">TP2 {item.targetPrice}</span>
                      </div>

                      {onUpdateAlertOutcome && (
                        <div
                          data-testid="alert-outcome-controls"
                          className="inline-flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(
                            [
                              { id: 'win', label: 'Win', activeClass: 'bg-[#16A34A] text-white' },
                              { id: 'be', label: 'BE', activeClass: 'bg-[#D97706] text-white' },
                              { id: 'loss', label: 'Loss', activeClass: 'bg-[#DC2626] text-white' },
                            ] as const
                          ).map((btn) => {
                            const selectedOutcome = curOutcome === btn.id;
                            return (
                              <button
                                key={btn.id}
                                type="button"
                                aria-pressed={selectedOutcome}
                                onClick={() =>
                                  onUpdateAlertOutcome(
                                    item.id,
                                    selectedOutcome ? 'pending' : btn.id
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
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
