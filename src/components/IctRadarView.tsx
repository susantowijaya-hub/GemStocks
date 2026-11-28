import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellOff,
  Calculator,
  CandlestickChart,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  Copy,
  Crosshair,
  Hourglass,
  Layers,
  RefreshCw,
  ShieldCheck,
  Target,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Asset5mVolatility,
  ChartTradeOverlays,
  EconomicEvent,
  IctSignalAnalysis,
  MarketAsset,
  PriceAlertItem,
  PriorityStreamStatus,
  SdCandleVolumeSignal,
  SignalActionBadge,
  SignalClearanceGate,
  SignalHistoryRecord,
  SignalUserOutcome,
  SyncedRadarConfig,
  Timeframe,
} from '../types/market';
import { formatAssetPrice } from '../utils/formatters';
import {
  isIctEligibleAsset,
  normalizeSignalTimeframe,
  scanAllIctSignals,
} from '../utils/ictSignals';
import { scanAllSdCandleVolumeSignals } from '../utils/sdCandleVolumeSignals';
import {
  computeSignalHistoryStats,
  isTerminalSignalStatus,
  SignalHistoryStats,
} from '../utils/signalHistoryEngine';
import {
  ONE_YEAR_BACKTEST_BENCHMARKS,
  PROVEN_CONFLUENCE_AUDIT,
  STOCKS_ONE_YEAR_BACKTEST_BENCHMARKS,
} from '../utils/backtestSummary';
import { CloudSignalEngineStatus } from '../hooks/useSignalHistory';
import { SignalVerificationMetrics } from '../hooks/useSignalVerification';
import { SignalHistoryPanel } from './SignalHistoryPanel';
import { IctPositionSizer } from './IctPositionSizer';

export interface IctRadarViewProps {
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
  cloudEngineStatus?: CloudSignalEngineStatus;
  onTriggerCloudScan?: () => Promise<void>;
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

const ICT_TIMEFRAMES: Timeframe[] = ['5m', '15m', '30m', '1h', '4h'];
const MTF_REQUIRED_TFS: Timeframe[] = ['4h', '1h', '15m', '5m'];
const RADAR_PREFS_STORAGE_KEY = 'stocks-ict-radar-prefs-v1';

type RadarStrategyMode = 'ict' | 'sdcv';

interface RadarPrefs {
  strategyMode: RadarStrategyMode;
  selectedTf: Timeframe;
  selectedAssetId: string;
  volatilityFilterEnabled: boolean;
  newsBlackoutEnabled: boolean;
}

const DEFAULT_RADAR_PREFS: RadarPrefs = {
  strategyMode: 'ict',
  selectedTf: '15m',
  selectedAssetId: 'XAUUSD',
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
      selectedTf: normalizeSignalTimeframe(parsed.selectedTf) ?? '15m',
      selectedAssetId: parsed.selectedAssetId === 'BTCUSD' ? 'BTCUSD' : 'XAUUSD',
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

function formatWibStamp(ts: number): string {
  return (
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(ts)) + ' WIB'
  );
}

function formatNum(
  val: number | undefined,
  decimals: number,
  prefix = '',
  suffix = ''
): string {
  if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) return '—';
  return `${prefix}${val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
}

function getActionBadgeClasses(badge: SignalActionBadge): string {
  switch (badge) {
    case 'BUY NOW':
      return 'bg-emerald-600 text-white border-emerald-500 shadow-sm';
    case 'SELL NOW':
      return 'bg-rose-600 text-white border-rose-500 shadow-sm';
    case 'WAIT BUY':
      return 'bg-emerald-500/14 text-emerald-700 dark:text-emerald-300 border-emerald-500/45';
    case 'WAIT SELL':
      return 'bg-rose-500/14 text-rose-700 dark:text-rose-300 border-rose-500/45';
    case 'WAIT':
    default:
      return 'bg-amber-500/14 text-amber-800 dark:text-amber-300 border-amber-500/40';
  }
}

interface UnifiedDisplaySignal {
  assetId: string;
  symbol: string;
  name: string;
  strategy: RadarStrategyMode;
  timeframe: Timeframe;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  actionBadge: SignalActionBadge;
  orderType: string;
  orderInstruction: string;
  waitWhy: string;
  waitAtWhere: string;
  entryZone: string;
  entryLowNum?: number;
  entryHighNum?: number;
  limitEntryPriceNum?: number;
  stopEntryPriceNum?: number;
  stopLoss: string;
  stopLossNum?: number;
  tp1: string;
  tp1Num?: number;
  tp2: string;
  tp2Num?: number;
  riskReward: string;
  netRr?: number;
  confidence: number;
  adx14?: number;
  htfBiasLabel: string;
  killzoneLabel: string;
  setupTitle: string;
  currentPrice: number;
  decimals: number;
  currencyPrefix?: string;
  unitSuffix?: string;
  evaluatedAt: number;
  gates: SignalClearanceGate[];
  rawIct?: IctSignalAnalysis;
}

function toUnifiedFromIct(sig: IctSignalAnalysis): UnifiedDisplaySignal {
  const actionBadge: SignalActionBadge =
    sig.actionBadge ??
    (sig.direction === 'BUY'
      ? sig.executionPosture === 'enter_now'
        ? 'BUY NOW'
        : 'WAIT BUY'
      : sig.direction === 'SELL'
        ? sig.executionPosture === 'enter_now'
          ? 'SELL NOW'
          : 'WAIT SELL'
        : 'WAIT');

  return {
    assetId: sig.assetId,
    symbol: sig.symbol,
    name: sig.name,
    strategy: 'ict',
    timeframe: sig.timeframe,
    direction: sig.direction,
    actionBadge,
    orderType: sig.recommendedOrderType ?? 'WAIT',
    orderInstruction:
      sig.orderInstruction ??
      sig.placementSummary ??
      (actionBadge === 'WAIT'
        ? 'Stand aside until all 5 proven gates align.'
        : `${sig.recommendedOrderType ?? actionBadge} inside ${sig.entryZone}`),
    waitWhy:
      sig.waitWhy ??
      sig.clearanceSummary ??
      'Waiting for price to reach the institutional discount/premium zone with full confluence.',
    waitAtWhere:
      sig.waitAtWhere ??
      (sig.entryZone && sig.entryZone !== '—'
        ? `Zone ${sig.entryZone} (${sig.recommendedOrderType ?? 'LIMIT'})`
        : 'Wait for fresh virgin FVG / OB formation'),
    entryZone: sig.entryZone,
    entryLowNum: sig.entryLowNum,
    entryHighNum: sig.entryHighNum,
    limitEntryPriceNum: sig.limitEntryPriceNum,
    stopEntryPriceNum: sig.stopEntryPriceNum,
    stopLoss: sig.stopLoss,
    stopLossNum: sig.stopLossNum,
    tp1: sig.tp1 ?? formatNum(sig.tp1Num, sig.decimals, sig.currencyPrefix, sig.unitSuffix),
    tp1Num: sig.tp1Num,
    tp2: sig.tp2 ?? sig.targetPrice,
    tp2Num: sig.tp2Num,
    riskReward: sig.riskReward,
    netRr: sig.netRr,
    confidence: sig.confidence,
    adx14: sig.adx14,
    htfBiasLabel: sig.htfBias ?? 'Ranging',
    killzoneLabel: sig.killzone ?? sig.sessionLabel ?? 'Off-Session',
    setupTitle: sig.setupName,
    currentPrice: sig.currentPrice,
    decimals: sig.decimals,
    currencyPrefix: sig.currencyPrefix,
    unitSuffix: sig.unitSuffix,
    evaluatedAt: sig.evaluatedAt,
    gates: (sig.clearanceGates ?? []).slice(0, 5),
    rawIct: sig,
  };
}

function toUnifiedFromSdcv(sig: SdCandleVolumeSignal): UnifiedDisplaySignal {
  const actionBadge: SignalActionBadge =
    sig.actionBadge ??
    (sig.direction === 'BUY'
      ? sig.executionPosture === 'enter_now'
        ? 'BUY NOW'
        : 'WAIT BUY'
      : sig.direction === 'SELL'
        ? sig.executionPosture === 'enter_now'
          ? 'SELL NOW'
          : 'WAIT SELL'
        : 'WAIT');

  return {
    assetId: sig.assetId,
    symbol: sig.symbol,
    name: sig.name,
    strategy: 'sdcv',
    timeframe: sig.timeframe,
    direction: sig.direction,
    actionBadge,
    orderType: sig.recommendedOrderType ?? 'WAIT',
    orderInstruction:
      sig.orderInstruction ??
      sig.placementSummary ??
      sig.actionSummary,
    waitWhy:
      sig.waitWhy ??
      sig.clearanceSummary ??
      'Waiting for price to test fresh pro-trend Supply/Demand zone with volume confirmation.',
    waitAtWhere:
      sig.waitAtWhere ??
      (sig.entryZone && sig.entryZone !== '—'
        ? `Zone ${sig.entryZone} (${sig.recommendedOrderType ?? 'LIMIT'})`
        : `Demand ${sig.demandZone} · Supply ${sig.supplyZone}`),
    entryZone: sig.entryZone,
    entryLowNum: sig.entryLowNum,
    entryHighNum: sig.entryHighNum,
    limitEntryPriceNum: sig.limitEntryPriceNum,
    stopEntryPriceNum: sig.stopEntryPriceNum,
    stopLoss: sig.stopLoss,
    stopLossNum: sig.stopLossNum,
    tp1: sig.tp1,
    tp1Num: sig.tp1Num,
    tp2: sig.tp2,
    tp2Num: sig.tp2Num,
    riskReward: sig.riskReward,
    netRr: sig.netRr,
    confidence: sig.confidence,
    adx14: sig.adx14,
    htfBiasLabel: sig.zoneBias,
    killzoneLabel: `${sig.zoneStatus} · ${sig.volumeRatio.toFixed(2)}x Vol`,
    setupTitle: `${sig.zoneStatus} ${sig.zoneBias} · ${sig.candlePattern}`,
    currentPrice: sig.currentPrice,
    decimals: sig.decimals,
    currencyPrefix: sig.currencyPrefix,
    unitSuffix: sig.unitSuffix,
    evaluatedAt: sig.evaluatedAt,
    gates: (sig.clearanceGates ?? []).slice(0, 5),
  };
}

const PriceSpectrumBar: React.FC<{
  signal: UnifiedDisplaySignal;
}> = ({ signal }) => {
  const sl = signal.stopLossNum;
  const tp1 = signal.tp1Num;
  const tp2 = signal.tp2Num;
  const entryMid =
    typeof signal.limitEntryPriceNum === 'number' && signal.limitEntryPriceNum > 0
      ? signal.limitEntryPriceNum
      : typeof signal.entryLowNum === 'number' && typeof signal.entryHighNum === 'number'
        ? (signal.entryLowNum + signal.entryHighNum) / 2
        : signal.currentPrice;

  if (
    typeof sl !== 'number' ||
    typeof tp2 !== 'number' ||
    !Number.isFinite(sl) ||
    !Number.isFinite(tp2) ||
    sl <= 0 ||
    tp2 <= 0
  ) {
    return null;
  }

  const prices = [sl, entryMid, signal.currentPrice, tp2];
  if (typeof tp1 === 'number' && tp1 > 0) prices.push(tp1);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const span = Math.max(maxP - minP, Math.abs(signal.currentPrice) * 0.0005);

  const toPct = (v: number) => Math.max(2, Math.min(98, ((v - minP) / span) * 100));

  const slPct = toPct(sl);
  const entryPct = toPct(entryMid);
  const spotPct = toPct(signal.currentPrice);
  const tp1Pct = typeof tp1 === 'number' && tp1 > 0 ? toPct(tp1) : null;
  const tp2Pct = toPct(tp2);

  return (
    <div
      data-testid="signal-price-spectrum"
      className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3.5 py-3 space-y-2"
    >
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <span>Price Map · SL → Entry → TP1 (BE) → TP2</span>
        <span className="font-mono tabular-nums text-[var(--text-primary)]">
          Spot {formatNum(signal.currentPrice, signal.decimals, signal.currencyPrefix, signal.unitSuffix)}
        </span>
      </div>

      <div className="relative h-6 flex items-center">
        {/* Track */}
        <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/15 relative">
          {/* Risk segment SL..Entry */}
          <div
            className="absolute top-0 bottom-0 bg-rose-500/45 rounded-full"
            style={{
              left: `${Math.min(slPct, entryPct)}%`,
              width: `${Math.abs(entryPct - slPct)}%`,
            }}
          />
          {/* Reward segment Entry..TP2 */}
          <div
            className="absolute top-0 bottom-0 bg-emerald-500/45 rounded-full"
            style={{
              left: `${Math.min(entryPct, tp2Pct)}%`,
              width: `${Math.abs(tp2Pct - entryPct)}%`,
            }}
          />
        </div>

        {/* Markers */}
        <span
          title={`SL ${signal.stopLoss}`}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-rose-500 border border-white dark:border-black"
          style={{ left: `${slPct}%` }}
        />
        <span
          title={`Entry ${signal.entryZone}`}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-sm rotate-45 bg-[var(--accent-primary)] border border-white dark:border-black"
          style={{ left: `${entryPct}%` }}
        />
        {tp1Pct !== null && (
          <span
            title={`TP1 ${signal.tp1} (Move SL to BE)`}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white dark:border-black"
            style={{ left: `${tp1Pct}%` }}
          />
        )}
        <span
          title={`TP2 ${signal.tp2}`}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-emerald-600 border border-white dark:border-black"
          style={{ left: `${tp2Pct}%` }}
        />
        {/* Live Spot Pin */}
        <span
          title={`Live Spot ${signal.currentPrice}`}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[var(--text-primary)] ring-2 ring-[var(--bg-surface)] shadow"
          style={{ left: `${spotPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
        <span className="text-[var(--loss-text)] font-bold">SL {signal.stopLoss}</span>
        <span>Entry {signal.entryZone}</span>
        <span className="text-[var(--gain-text)] font-bold">TP2 {signal.tp2}</span>
      </div>
    </div>
  );
};

export const IctRadarView: React.FC<IctRadarViewProps> = ({
  assets,
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
  cloudEngineStatus,
  onTriggerCloudScan,
  verificationMetrics,
  onAnnotateSignal,
  onDeleteSignal,
  onClearClosedSignals,
  onInspectSignal,
  jumpTarget,
  flashMap = {},
}) => {
  const initialPrefs = useMemo(loadRadarPrefs, []);
  const [strategyMode, setStrategyMode] = useState<RadarStrategyMode>(initialPrefs.strategyMode);
  const [selectedTf, setSelectedTf] = useState<Timeframe>(initialPrefs.selectedTf);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(initialPrefs.selectedAssetId);
  const [volatilityFilterEnabled] = useState<boolean>(initialPrefs.volatilityFilterEnabled);
  const [newsBlackoutEnabled] = useState<boolean>(initialPrefs.newsBlackoutEnabled);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [showAuditDrawer, setShowAuditDrawer] = useState<boolean>(false);
  const [showPositionSizer, setShowPositionSizer] = useState<boolean>(false);
  const [backtestTab, setBacktestTab] = useState<'XAUUSD' | 'BTCUSD' | 'IDX' | 'US'>(
    initialPrefs.selectedAssetId === 'BTCUSD' ? 'BTCUSD' : 'XAUUSD'
  );

  const eligibleAssets = useMemo(
    () => assets.filter((a) => isIctEligibleAsset(a)),
    [assets]
  );

  // Persist prefs & sync to background hooks
  useEffect(() => {
    try {
      window.localStorage.setItem(
        RADAR_PREFS_STORAGE_KEY,
        JSON.stringify({
          strategyMode,
          selectedTf,
          selectedAssetId,
          volatilityFilterEnabled,
          newsBlackoutEnabled,
        })
      );
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
    selectedAssetId,
    volatilityFilterEnabled,
    newsBlackoutEnabled,
    onSyncRadarConfig,
  ]);

  // Handle jump from alert toast / drawer
  useEffect(() => {
    if (!jumpTarget) return;
    if (jumpTarget.assetId) setSelectedAssetId(jumpTarget.assetId);
    if (jumpTarget.strategy) setStrategyMode(jumpTarget.strategy);
    if (jumpTarget.timeframe) {
      setSelectedTf(normalizeSignalTimeframe(jumpTarget.timeframe) ?? '15m');
    }
  }, [jumpTarget]);

  // Ensure required MTF candles are fetched for XAUUSD & BTCUSD
  useEffect(() => {
    if (!onLoadTimeframe) return;
    const tfsToLoad = Array.from(new Set([...MTF_REQUIRED_TFS, selectedTf]));
    for (const asset of eligibleAssets) {
      for (const tf of tfsToLoad) {
        if ((asset.chartCandles?.[tf]?.length ?? 0) < 12) {
          onLoadTimeframe(asset.id, tf);
        }
      }
    }
  }, [eligibleAssets, selectedTf, onLoadTimeframe]);

  // Compute live unified signals (with full DXY/ETH SMT macro context) for XAU/USD & BTC/USD
  const assetSignals = useMemo(() => {
    const prefMap = Object.fromEntries(
      eligibleAssets.map((a) => [a.id, selectedTf])
    ) as Record<string, Timeframe>;
    const ictList = scanAllIctSignals(
      assets,
      prefMap,
      volatilityFilterEnabled,
      economicEvents,
      newsBlackoutEnabled
    );
    const sdcvList = scanAllSdCandleVolumeSignals(
      assets,
      prefMap,
      volatilityFilterEnabled,
      economicEvents,
      newsBlackoutEnabled
    );
    const ictById = new Map(ictList.map((s) => [s.assetId, s]));
    const sdcvById = new Map(sdcvList.map((s) => [s.assetId, s]));

    return eligibleAssets
      .map((asset) => {
        const ict = ictById.get(asset.id);
        const sdcv = sdcvById.get(asset.id);
        if (!ict || !sdcv) return null;
        const unified = strategyMode === 'ict' ? toUnifiedFromIct(ict) : toUnifiedFromSdcv(sdcv);
        return { asset, ict, sdcv, unified };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [
    eligibleAssets,
    assets,
    selectedTf,
    strategyMode,
    volatilityFilterEnabled,
    economicEvents,
    newsBlackoutEnabled,
  ]);

  const activeBundle =
    assetSignals.find((x) => x.asset.id === selectedAssetId) ?? assetSignals[0] ?? null;

  // Match active cloud-locked record for exact first-trigger WIB timestamp
  const matchingActiveRecord = useMemo(() => {
    if (!activeBundle) return null;
    const engineKey = strategyMode === 'ict' ? 'ict_radar' : 'sdcv_radar';
    return (
      signalHistory.find(
        (r) =>
          r.assetId === activeBundle.asset.id &&
          r.sourceEngine === engineKey &&
          r.timeframe === selectedTf &&
          !isTerminalSignalStatus(r.status)
      ) ?? null
    );
  }, [signalHistory, activeBundle, strategyMode, selectedTf]);

  const firstTriggeredAtMs =
    matchingActiveRecord?.createdAtMs ?? activeBundle?.unified.evaluatedAt ?? Date.now();

  useEffect(() => {
    setBacktestTab((prev) => {
      if (prev === 'IDX' || prev === 'US') return prev;
      return activeBundle?.asset.id === 'BTCUSD' ? 'BTCUSD' : 'XAUUSD';
    });
  }, [activeBundle?.asset.id]);

  const handleManualScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      await Promise.all([
        Promise.resolve(
          onScanIct(
            activeBundle?.asset.id,
            strategyMode,
            selectedTf,
            volatilityFilterEnabled,
            newsBlackoutEnabled
          )
        ),
        onTriggerCloudScan ? onTriggerCloudScan() : Promise.resolve(),
      ]);
    } finally {
      setIsScanning(false);
    }
  };

  const handleCopySignal = async () => {
    if (!activeBundle) return;
    const sig = activeBundle.unified;
    const lines = [
      `${sig.symbol} · ${sig.strategy === 'ict' ? 'ICT 2022' : 'SMC S&D'} (${sig.timeframe})`,
      `Action: ${sig.actionBadge} | Order: ${sig.orderType}`,
      `Entry Zone: ${sig.entryZone}`,
      `Stop Loss: ${sig.stopLoss}`,
      `TP1 (Move SL→BE): ${sig.tp1}`,
      `TP2 (Target): ${sig.tp2} (${sig.riskReward})`,
      ...(sig.actionBadge.startsWith('WAIT')
        ? [`Why Wait: ${sig.waitWhy}`, `Wait At: ${sig.waitAtWhere}`]
        : [`Instruction: ${sig.orderInstruction}`]),
      `First Triggered: ${formatWibStamp(firstTriggeredAtMs)}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedId(sig.assetId);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // clipboard unavailable
    }
  };

  const handleInspectActiveChart = () => {
    if (!activeBundle) return;
    const sig = activeBundle.unified;
    const overlays: ChartTradeOverlays = {
      symbolLabel: `${sig.symbol} · ${sig.actionBadge} (${sig.timeframe})`,
      direction: sig.direction === 'NEUTRAL' ? 'WAIT' : sig.direction,
      entryLow: sig.entryLowNum,
      entryHigh: sig.entryHighNum,
      stopLoss: sig.stopLossNum,
      tp1: sig.tp1Num,
      tp2: sig.tp2Num,
    };
    if (onInspectChart) {
      onInspectChart(activeBundle.asset.id, overlays, selectedTf);
    } else if (onInspectSignal) {
      onInspectSignal(activeBundle.asset.symbol, activeBundle.asset.id, overlays, selectedTf);
    }
  };

  const defaultStats: SignalHistoryStats = useMemo(
    () => signalStats ?? computeSignalHistoryStats(signalHistory),
    [signalStats, signalHistory]
  );

  return (
    <div
      data-testid="ict-radar-view"
      className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-28 flex flex-col gap-5"
    >
      {/* SECTION 1: Compact Control Bar + 24H Cloud Engine Status (order-1 on all viewports) */}
      <section className="order-1 rounded-2xl liquid-glass-card border border-[var(--border-subtle)] p-4 flex flex-col gap-3.5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Crosshair className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                ICT &amp; Smart Money Signal Desk
              </h1>
              <span
                data-testid="cloud-engine-status-badge"
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]"
              >
                <Cloud className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>
                  24H Cloud Engine {cloudEngineStatus?.running ? 'Online' : 'Syncing'}
                </span>
                {cloudEngineStatus?.lastScanAtMs && (
                  <span className="font-mono">
                    · {formatWibStamp(cloudEngineStatus.lastScanAtMs).replace(/^[0-9]+ [A-Za-z]+,?\s*/, '')}
                  </span>
                )}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Proven 1Y backtested ruleset · Runs 24/7 when markets are open · Strict 5m–4H timeframes only
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => void handleManualScan()}
              disabled={isScanning}
              data-testid="ict-scan-now-btn"
              className="min-h-[40px] md:min-h-0 inline-flex items-center gap-1.5 px-3.5 py-2 md:py-1.5 rounded-xl bg-[var(--accent-primary)] text-white monochrome:text-black text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning...' : 'Scan 24H Cloud'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleIctPopups}
              className="min-h-[40px] md:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-xs font-bold text-[var(--text-primary)]"
            >
              {ictPopupsEnabled ? (
                <Bell className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              ) : (
                <BellOff className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              )}
              <span>Alerts {ictPopupsEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>

        {/* Asset Tabs + Strategy Toggle + 5m–4H Timeframes */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-[var(--border-divider)]">
          {/* Asset Switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            {assetSignals.map(({ asset, unified }) => {
              const selected = activeBundle?.asset.id === asset.id;
              const flash = flashMap[asset.id];
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => {
                    setSelectedAssetId(asset.id);
                    if (asset.id === 'XAUUSD' || asset.id === 'BTCUSD') {
                      setBacktestTab(asset.id);
                    }
                  }}
                  data-testid={`radar-asset-btn-${asset.id}`}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                    selected
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] shadow-xs'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-inset)] hover:border-[var(--accent-primary)]/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-[var(--text-primary)]">
                        {asset.symbol}
                      </span>
                      <span
                        className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${getActionBadgeClasses(
                          unified.actionBadge
                        )}`}
                      >
                        {unified.actionBadge}
                      </span>
                    </div>
                    <div
                      className={`text-xs font-mono font-bold tabular-nums mt-0.5 ${
                        flash === 'gain'
                          ? 'text-[var(--gain-text)]'
                          : flash === 'loss'
                            ? 'text-[var(--loss-text)]'
                            : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {formatAssetPrice(asset)}{' '}
                      <span className="text-[10px]">
                        ({asset.changePercent >= 0 ? '+' : ''}
                        {asset.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Strategy & Timeframe Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex p-1 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setStrategyMode('ict')}
                data-testid="strategy-tab-ict"
                className={`min-h-[36px] md:min-h-0 px-3 md:px-2.5 py-1.5 md:py-1 rounded-lg text-xs font-bold transition-colors ${
                  strategyMode === 'ict'
                    ? 'bg-[var(--accent-primary)] text-white monochrome:text-black'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                ICT 2022
              </button>
              <button
                type="button"
                onClick={() => setStrategyMode('sdcv')}
                data-testid="strategy-tab-sdcv"
                className={`min-h-[36px] md:min-h-0 px-3 md:px-2.5 py-1.5 md:py-1 rounded-lg text-xs font-bold transition-colors ${
                  strategyMode === 'sdcv'
                    ? 'bg-[var(--accent-primary)] text-white monochrome:text-black'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                SMC S&amp;D
              </button>
            </div>

            <div
              className="inline-flex p-1 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)]"
              role="group"
              aria-label="Signal timeframe"
              data-testid="ict-timeframe-selector"
            >
              {ICT_TIMEFRAMES.map((tf) => {
                const active = selectedTf === tf;
                return (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setSelectedTf(tf)}
                    className={`min-h-[36px] md:min-h-0 px-2.5 py-1.5 md:py-1 rounded-lg font-mono text-xs font-bold transition-colors ${
                      active
                        ? 'bg-[var(--accent-primary)] text-white monochrome:text-black'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 ON MOBILE / SECTION 2 ON DESKTOP: 1-Year Multi-Timeframe Backtest Results Card */}
      <section
        data-testid="one-year-backtest-card"
        className="order-4 md:order-2 rounded-2xl liquid-glass-card border border-[var(--border-subtle)] p-4 flex flex-col gap-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <ShieldCheck className="w-4 h-4 text-[var(--gain-text)] shrink-0" />
            <span className="font-extrabold text-[var(--text-primary)]">
              1-Year Proven Backtest Results
            </span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              {backtestTab === 'IDX' || backtestTab === 'US'
                ? `${STOCKS_ONE_YEAR_BACKTEST_BENCHMARKS[backtestTab].barsTested.toLocaleString('en-US')} daily bars · $10,000 start`
                : `${ONE_YEAR_BACKTEST_BENCHMARKS[backtestTab].barsTested.toLocaleString('en-US')} 5m bars · $10,000 start`}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex p-0.5 rounded-lg bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
              {(
                [
                  { id: 'XAUUSD', label: 'XAU' },
                  { id: 'BTCUSD', label: 'BTC' },
                  { id: 'IDX', label: 'IDX 1Y' },
                  { id: 'US', label: 'US 1Y' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBacktestTab(tab.id)}
                  className={`min-h-[32px] md:min-h-0 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    backtestTab === tab.id
                      ? 'bg-[var(--accent-primary)] text-white monochrome:text-black'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowAuditDrawer((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent-primary)] hover:underline shrink-0"
            >
              <span>{showAuditDrawer ? 'Hide Rules' : 'Rules'}</span>
              {showAuditDrawer ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {backtestTab === 'IDX' || backtestTab === 'US' ? (() => {
          const sb = STOCKS_ONE_YEAR_BACKTEST_BENCHMARKS[backtestTab];
          return (
            <div className="space-y-3">
              <div className="text-[11px] text-[var(--text-muted)]">
                <strong className="text-[var(--text-primary)]">{sb.label}</strong> · {sb.universe}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums">
                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3 py-2.5">
                  <div className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Proven Win Rate
                  </div>
                  <div className="text-base font-black text-[var(--gain-text)] mt-0.5">
                    {sb.proven.winRatePct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {sb.proven.wins}W / {sb.proven.losses}L · Old {sb.baseline.winRatePct}%
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3 py-2.5">
                  <div className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    1Y Ending Equity
                  </div>
                  <div className="text-base font-black text-[var(--gain-text)] mt-0.5">
                    ${sb.proven.finalEquityUsd.toLocaleString('en-US')}
                  </div>
                  <div className="text-[10px] text-[var(--gain-text)]">
                    +{sb.proven.returnPct.toFixed(1)}% vs Old {sb.baseline.returnPct.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3 py-2.5">
                  <div className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Profit Factor · Net R
                  </div>
                  <div className="text-base font-black text-[var(--gain-text)] mt-0.5">
                    PF {sb.proven.profitFactor.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    +{sb.proven.netR.toFixed(1)}R vs Old {sb.baseline.netR.toFixed(1)}R
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3 py-2.5">
                  <div className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Max Drawdown
                  </div>
                  <div className="text-base font-black text-[var(--text-primary)] mt-0.5">
                    -{sb.proven.maxDrawdownPct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    Old DD -{sb.baseline.maxDrawdownPct.toFixed(1)}%
                  </div>
                </div>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Active Rule: <strong className="text-[var(--text-primary)]">{sb.proven.label}</strong> (eliminates low-WR green breakout chasing).
              </p>
            </div>
          );
        })() : (() => {
          const activeBench = ONE_YEAR_BACKTEST_BENCHMARKS[backtestTab];
          return (
            <>
              {/* Headline Proven KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums">
                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3 py-2">
                  <div className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Best Timeframe
                  </div>
                  <div className="text-sm sm:text-base font-black text-[var(--text-primary)] mt-0.5">
                    {activeBench.bestTimeframe}{' '}
                    <span className="text-[11px] font-bold text-[var(--gain-text)]">
                      ({activeBench.proven.winRatePct.toFixed(1)}% WR)
                    </span>
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3 py-2">
                  <div className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    1Y Ending Equity
                  </div>
                  <div className="text-sm sm:text-base font-black text-[var(--gain-text)] mt-0.5">
                    ${activeBench.proven.finalEquityUsd.toLocaleString('en-US')}{' '}
                    <span className="text-[11px]">
                      (+{activeBench.proven.returnPct.toFixed(1)}%)
                    </span>
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3 py-2">
                  <div className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Profit Factor · Net R
                  </div>
                  <div className="text-sm sm:text-base font-black text-[var(--gain-text)] mt-0.5">
                    PF {activeBench.proven.profitFactor.toFixed(2)}{' '}
                    <span className="text-[11px]">
                      (+{activeBench.proven.netR.toFixed(1)}R)
                    </span>
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] px-3 py-2">
                  <div className="font-sans text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Max Drawdown
                  </div>
                  <div className="text-sm sm:text-base font-black text-[var(--text-primary)] mt-0.5">
                    -{activeBench.proven.maxDrawdownPct.toFixed(1)}%{' '}
                    <span className="text-[10px] font-normal text-[var(--text-muted)]">
                      vs Old {activeBench.baseline.winRatePct}% WR
                    </span>
                  </div>
                </div>
              </div>

              {/* Multi-Timeframe 5m–4H Results Table (Desktop/Tablet) */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                  <thead>
                    <tr className="border-b border-[var(--border-divider)] bg-[var(--bg-inset)]/70 font-sans text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="py-2 pl-3 pr-2">TF</th>
                      <th className="py-2 px-2 text-right">Trades (W/L)</th>
                      <th className="py-2 px-2 text-right">Win Rate</th>
                      <th className="py-2 px-2 text-right">PF</th>
                      <th className="py-2 px-2 text-right">Net R</th>
                      <th className="py-2 px-2 text-right">1Y Equity</th>
                      <th className="py-2 px-2 text-right">Max DD</th>
                      <th className="py-2 pl-2 pr-3 font-sans">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-divider)]">
                    {activeBench.timeframeBreakdown.map((row) => {
                      const isPos = row.returnPct >= 0;
                      const tfLower = row.timeframe.toLowerCase() as Timeframe;
                      const isSelectedTf = selectedTf.toLowerCase() === tfLower;
                      return (
                        <tr
                          key={row.timeframe}
                          onClick={() => setSelectedTf(tfLower)}
                          className={`cursor-pointer transition-colors ${
                            row.recommended
                              ? 'bg-emerald-500/[0.06] dark:bg-emerald-500/[0.08]'
                              : isSelectedTf
                                ? 'bg-[var(--accent-soft)]/50'
                                : 'hover:bg-black/[0.025] dark:hover:bg-white/[0.03]'
                          }`}
                        >
                          <td className="py-2 pl-3 pr-2 font-black text-[var(--text-primary)] whitespace-nowrap">
                            {row.timeframe}
                            {row.recommended && (
                              <span className="ml-1.5 font-sans text-[9px] font-extrabold uppercase tracking-wider text-[var(--gain-text)]">
                                BEST
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right text-[var(--text-secondary)] whitespace-nowrap">
                            {row.trades}{' '}
                            <span className="text-[10px] text-[var(--text-muted)]">
                              ({row.wins}W/{row.losses}L)
                            </span>
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-extrabold whitespace-nowrap ${
                              row.winRatePct >= 53 ? 'text-[var(--gain-text)]' : row.winRatePct < 48 ? 'text-[var(--loss-text)]' : 'text-[var(--text-primary)]'
                            }`}
                          >
                            {row.winRatePct.toFixed(1)}%
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-bold whitespace-nowrap ${
                              row.profitFactor >= 1.15 ? 'text-[var(--gain-text)]' : row.profitFactor < 1.0 ? 'text-[var(--loss-text)]' : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {row.profitFactor.toFixed(2)}
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-extrabold whitespace-nowrap ${
                              row.netR > 0 ? 'text-[var(--gain-text)]' : row.netR < 0 ? 'text-[var(--loss-text)]' : 'text-[var(--text-secondary)]'
                            }`}
                          >
                            {row.netR >= 0 ? '+' : ''}
                            {row.netR.toFixed(1)}R
                          </td>
                          <td
                            className={`py-2 px-2 text-right font-extrabold whitespace-nowrap ${
                              isPos ? 'text-[var(--gain-text)]' : 'text-[var(--loss-text)]'
                            }`}
                          >
                            ${row.finalEquityUsd.toLocaleString('en-US')}{' '}
                            <span className="text-[10px]">
                              ({isPos ? '+' : ''}
                              {row.returnPct.toFixed(1)}%)
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right text-[var(--text-secondary)] whitespace-nowrap">
                            -{row.maxDrawdownPct.toFixed(1)}%
                          </td>
                          <td className="py-2 pl-2 pr-3 font-sans text-[11px] text-[var(--text-muted)]">
                            {row.note ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Multi-Timeframe 5m–4H Results List */}
              <div className="md:hidden divide-y divide-[var(--border-divider)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                {activeBench.timeframeBreakdown.map((row) => {
                  const isPos = row.returnPct >= 0;
                  const tfLower = row.timeframe.toLowerCase() as Timeframe;
                  return (
                    <button
                      key={row.timeframe}
                      type="button"
                      onClick={() => setSelectedTf(tfLower)}
                      className={`w-full min-h-[48px] px-3 py-2.5 text-left flex items-center justify-between gap-2 font-mono tabular-nums ${
                        row.recommended ? 'bg-emerald-500/[0.06]' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-[var(--text-primary)]">{row.timeframe}</span>
                          {row.recommended && (
                            <span className="font-sans text-[9px] font-extrabold uppercase text-[var(--gain-text)]">
                              BEST
                            </span>
                          )}
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {row.trades} tr · PF {row.profitFactor.toFixed(2)}
                          </span>
                        </div>
                        {row.note && (
                          <div className="font-sans text-[10.5px] text-[var(--text-muted)] mt-0.5">
                            {row.note}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`text-xs font-black ${
                            isPos ? 'text-[var(--gain-text)]' : 'text-[var(--loss-text)]'
                          }`}
                        >
                          {row.winRatePct.toFixed(1)}% WR · {isPos ? '+' : ''}
                          {row.returnPct.toFixed(1)}%
                        </div>
                        <div className="text-[10.5px] text-[var(--text-muted)]">
                          ${row.finalEquityUsd.toLocaleString('en-US')} · DD -{row.maxDrawdownPct.toFixed(1)}%
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          );
        })()}

        {showAuditDrawer && (
          <div className="pt-2 border-t border-[var(--border-divider)] grid grid-cols-1 md:grid-cols-2 gap-2">
            {PROVEN_CONFLUENCE_AUDIT.map((rule) => (
              <div
                key={rule.id}
                className="p-2.5 rounded-lg bg-[var(--bg-inset)] border border-[var(--border-subtle)] flex items-start gap-2"
              >
                <span
                  className={`mt-0.5 text-[10px] font-extrabold uppercase shrink-0 ${
                    rule.status === 'KEPT'
                      ? 'text-[var(--gain-text)]'
                      : 'text-[var(--loss-text)]'
                  }`}
                >
                  {rule.status}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)]">
                    {rule.label}{' '}
                    <span className="font-mono text-[10px] text-[var(--accent-primary)]">
                      ({rule.impactDelta})
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-0.5">
                    {rule.rationale}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2 ON MOBILE / SECTION 3 ON DESKTOP: Single Institutional Signal Card */}
      {activeBundle && (() => {
        const sig = activeBundle.unified;
        const isWaiting = sig.actionBadge.startsWith('WAIT');
        const riskPct =
          typeof sig.stopLossNum === 'number' && sig.currentPrice > 0
            ? Math.abs(((sig.currentPrice - sig.stopLossNum) / sig.currentPrice) * 100)
            : null;

        return (
          <section
            data-testid="institutional-signal-card"
            className="order-2 md:order-3 rounded-2xl liquid-glass-card border border-[var(--border-subtle)] overflow-hidden"
          >
            {/* Card Header */}
            <div className="px-4 sm:px-5 py-4 border-b border-[var(--border-divider)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg sm:text-xl font-black tracking-tight text-[var(--text-primary)]">
                    {sig.symbol}
                  </span>
                  <span
                    data-testid="signal-action-badge"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider border ${getActionBadgeClasses(
                      sig.actionBadge
                    )}`}
                  >
                    {sig.actionBadge === 'BUY NOW' ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : sig.actionBadge === 'SELL NOW' ? (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    ) : (
                      <Hourglass className="w-3.5 h-3.5" />
                    )}
                    {sig.actionBadge}
                  </span>
                  <span
                    data-testid="signal-order-type-badge"
                    className="px-2.5 py-1 rounded-lg bg-[var(--bg-inset)] border border-[var(--border-subtle)] font-mono text-xs font-extrabold text-[var(--text-primary)]"
                  >
                    {sig.orderType}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-[var(--bg-inset)] font-mono text-[11px] font-bold text-[var(--text-secondary)]">
                    {sig.strategy === 'ict' ? 'ICT 2022' : 'SMC S&D'} · {sig.timeframe}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap text-xs text-[var(--text-muted)]">
                  <span>{sig.setupTitle}</span>
                  <span>·</span>
                  <span>HTF: <strong className="text-[var(--text-primary)]">{sig.htfBiasLabel}</strong></span>
                  {typeof sig.adx14 === 'number' && (
                    <>
                      <span>·</span>
                      <span className="font-mono tabular-nums">
                        ADX(14) <strong className="text-[var(--text-primary)]">{sig.adx14.toFixed(1)}</strong>
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span>{sig.killzoneLabel}</span>
                </div>
              </div>

              {/* Right Price + First Trigger WIB Timestamp */}
              <div className="sm:text-right shrink-0">
                <div className="text-2xl sm:text-3xl font-black font-mono tabular-nums tracking-tight text-[var(--text-primary)]">
                  {formatAssetPrice(activeBundle.asset)}
                </div>
                <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
                  <Clock className="w-3 h-3 text-[var(--accent-primary)]" />
                  <span>
                    {matchingActiveRecord ? 'First Triggered:' : 'Evaluated:'}{' '}
                    <strong className="text-[var(--text-primary)]">
                      {formatWibStamp(firstTriggeredAtMs)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Explicit WHY WAIT & WAIT AT WHERE Banner (or Clear Execution Directive when BUY NOW / SELL NOW) */}
              {isWaiting ? (
                <div
                  data-testid="wait-clarity-callout"
                  className="rounded-xl bg-amber-500/8 border border-amber-500/35 p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        Why Wait
                      </div>
                      <p className="text-xs font-semibold text-[var(--text-primary)] mt-0.5 leading-snug">
                        {sig.waitWhy}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 md:border-l md:border-amber-500/25 md:pl-3">
                    <Target className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent-primary)]">
                        Wait At Where (Exact Level &amp; Order)
                      </div>
                      <p className="text-xs font-mono font-bold text-[var(--text-primary)] mt-0.5 leading-snug">
                        {sig.waitAtWhere}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  data-testid="execute-now-callout"
                  className="rounded-xl bg-emerald-500/10 border border-emerald-500/35 px-3.5 py-2.5 flex items-center gap-2.5"
                >
                  <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <p className="text-xs font-bold text-[var(--text-primary)]">
                    {sig.orderInstruction}
                  </p>
                </div>
              )}

              {/* 4-Cell Institutional Execution Matrix */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                    Entry Zone
                  </div>
                  <div className="mt-1 text-sm sm:text-base font-black font-mono tabular-nums text-[var(--text-primary)]">
                    {sig.entryZone}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                    {sig.limitEntryPriceNum
                      ? `Limit @ ${formatNum(sig.limitEntryPriceNum, sig.decimals, sig.currencyPrefix, sig.unitSuffix)}`
                      : sig.stopEntryPriceNum
                        ? `Stop @ ${formatNum(sig.stopEntryPriceNum, sig.decimals, sig.currencyPrefix, sig.unitSuffix)}`
                        : sig.orderType}
                  </div>
                </div>

                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--loss-text)]">
                    Stop Loss (Invalidation)
                  </div>
                  <div className="mt-1 text-sm sm:text-base font-black font-mono tabular-nums text-[var(--loss-text)]">
                    {sig.stopLoss}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                    {riskPct !== null ? `${riskPct.toFixed(2)}% from spot · Sweep-buffered` : 'Hard invalidation'}
                  </div>
                </div>

                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-muted)]">
                    TP1 · Lock Break-Even
                  </div>
                  <div className="mt-1 text-sm sm:text-base font-black font-mono tabular-nums text-[var(--text-primary)]">
                    {sig.tp1}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    1.05R · Scale 50% &amp; SL → Entry
                  </div>
                </div>

                <div className="rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] p-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--gain-text)]">
                    TP2 · Full Target
                  </div>
                  <div className="mt-1 text-sm sm:text-base font-black font-mono tabular-nums text-[var(--gain-text)]">
                    {sig.tp2}
                  </div>
                  <div className="text-[11px] font-mono font-bold text-[var(--text-secondary)] mt-0.5">
                    {sig.riskReward} · Conf {sig.confidence}%
                  </div>
                </div>
              </div>

              {/* Horizontal Price Spectrum */}
              <PriceSpectrumBar signal={sig} />

              {/* 5 Proven Confluences Strip (ONLY the 5 empirically verified gates) */}
              {sig.gates.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      <Layers className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      5 Proven High-WR Confluence Gates ({sig.gates.filter((g) => g.passed).length}/{sig.gates.length})
                    </span>
                  </div>

                  <div
                    data-testid="proven-confluence-strip"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2"
                  >
                    {sig.gates.map((gate) => (
                      <div
                        key={gate.id}
                        className={`rounded-xl border px-3 py-2 flex flex-col gap-1 ${
                          gate.passed
                            ? 'bg-emerald-500/6 border-emerald-500/30'
                            : gate.state === 'WARN'
                              ? 'bg-amber-500/6 border-amber-500/30'
                              : 'bg-rose-500/6 border-rose-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-extrabold text-[var(--text-primary)] truncate">
                            {gate.label}
                          </span>
                          {gate.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : gate.state === 'WARN' ? (
                            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-[10.5px] leading-snug text-[var(--text-muted)] line-clamp-2">
                          {gate.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Card Action Footer */}
              <div className="pt-3 border-t border-[var(--border-divider)] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => void handleCopySignal()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
                  >
                    {copiedId === sig.assetId ? (
                      <Check className="w-3.5 h-3.5 text-[var(--gain-text)]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedId === sig.assetId ? 'Copied Plan' : 'Copy Signal'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleInspectActiveChart}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
                  >
                    <CandlestickChart className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>Inspect on Chart</span>
                  </button>

                  {sig.rawIct && (
                    <button
                      type="button"
                      onClick={() => onTriggerIctAlert(sig.rawIct!, strategyMode)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Preview Alert</span>
                    </button>
                  )}
                </div>

                {sig.rawIct && (
                  <button
                    type="button"
                    onClick={() => setShowPositionSizer((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <Calculator className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                    <span>{showPositionSizer ? 'Hide Lot Sizer' : 'Position Sizer'}</span>
                  </button>
                )}
              </div>

              {showPositionSizer && sig.rawIct && (
                <div className="pt-2">
                  <IctPositionSizer signal={sig.rawIct} />
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* SECTION 3 ON MOBILE / SECTION 4 ON DESKTOP: Table-Style Win/Loss Signal Journal */}
      <div className="order-3 md:order-4">
        <SignalHistoryPanel
          records={signalHistory}
          stats={defaultStats}
          cloudSynced={signalCloudSynced}
          verificationMetrics={verificationMetrics}
          defaultCategory="radar"
          title="Win / Loss Signal Journal (24H Cloud Tracked)"
          subtitle="Non-repainting first-trigger WIB timestamps · Running, Pending, Trailing BE, TP & SL outcomes"
          onInspectSignal={(sym, assetId, overlays, tf) => {
            onInspectSignal?.(sym, assetId, overlays, tf);
          }}
          onAnnotateSignal={onAnnotateSignal}
          onDeleteSignal={(id) => onDeleteSignal?.(id)}
          onClearClosedSignals={() => onClearClosedSignals?.()}
        />
      </div>
    </div>
  );
};
