import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CandlestickChart,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquarePlus,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  CandlePoint,
  ChartTradeOverlays,
  SignalHistoryRecord,
  SignalUserOutcome,
  Timeframe,
} from '../types/market';
import {
  computeActiveTrailingStop,
  formatSignalPrice,
  getExpiredReasonMeta,
  isTerminalSignalStatus,
  normalizeSignalStatus,
} from '../utils/signalHistoryEngine';
import {
  formatPendingExpiryCountdown,
  getPendingExpiryRemainingMs,
} from '../utils/signalCleanupService';

export interface SignalDetailSheetProps {
  record: SignalHistoryRecord | null;
  onClose: () => void;
  onInspectSignal: (
    yahooSymbol: string,
    builtInAssetId: string | undefined,
    overlays: ChartTradeOverlays,
    timeframe?: Timeframe
  ) => void;
  onAnnotateSignal?: (
    signalId: string,
    outcome: SignalUserOutcome | null,
    journalNote?: string
  ) => void;
  onDeleteSignal: (id: string) => void;
}

function formatWibFull(ts?: number | null): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  const d = new Date(ts);
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
  return `${date} · ${time} WIB`;
}

function formatBarStamp(ts: number, isIntraday: boolean): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (isIntraday) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
  }).format(d);
}

function getEngineLabel(engine: SignalHistoryRecord['sourceEngine']): string {
  switch (engine) {
    case 'ict_radar':
      return 'ICT 2022';
    case 'sdcv_radar':
      return 'SMC S&D';
    case 'idx_scanner':
      return 'IDX Equities';
    case 'us_scanner':
      return 'US Equities';
    default:
      return 'Signal Engine';
  }
}

function getStatusDisplay(rec: SignalHistoryRecord): { label: string; toneClass: string } {
  const canonical = normalizeSignalStatus(rec.status);
  if (rec.status === 'TP1_HIT') {
    return { label: 'Active · TP1 Secured (Trailing BE)', toneClass: 'text-[var(--gain-text)]' };
  }
  if (canonical === 'TP') {
    return { label: 'Closed · TP Hit', toneClass: 'text-[var(--gain-text)]' };
  }
  if (canonical === 'SL') {
    return { label: 'Closed · Stop Loss', toneClass: 'text-[var(--loss-text)]' };
  }
  if (canonical === 'FILLED') {
    return { label: 'Active · Filled Live', toneClass: 'text-sky-600 dark:text-sky-400' };
  }
  if (canonical === 'PENDING') {
    return { label: 'Pending · Awaiting Trigger', toneClass: 'text-amber-600 dark:text-amber-300' };
  }
  if (rec.status === 'BE_CLOSED') {
    return { label: 'Closed · Break-Even', toneClass: 'text-[var(--text-secondary)]' };
  }
  return { label: 'Closed / Expired', toneClass: 'text-[var(--text-muted)]' };
}

function pctDistance(from: number, to: number): string {
  if (!Number.isFinite(from) || from === 0 || !Number.isFinite(to)) return '—';
  const pct = ((to - from) / from) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

const SheetPriceSpectrum: React.FC<{ rec: SignalHistoryRecord }> = ({ rec }) => {
  const isBuy = rec.direction === 'BUY';
  const sl = rec.stopLoss;
  const entry = rec.entryPrice;
  const tp1 = rec.tp1;
  const tp2 = rec.tp2;
  const refPrice = rec.closedPrice ?? rec.lastPrice ?? entry;
  const trailingStop = computeActiveTrailingStop(rec);

  const span = isBuy ? tp2 - sl : sl - tp2;
  if (!Number.isFinite(span) || span <= 0) return null;

  const toPct = (val: number) => {
    const raw = isBuy ? ((val - sl) / span) * 100 : ((sl - val) / span) * 100;
    return Math.max(0, Math.min(100, raw));
  };

  const entryPct = toPct(entry);
  const tp1Pct = toPct(tp1);
  const currentPct = toPct(refPrice);
  const trailPct = trailingStop ? toPct(trailingStop) : null;
  const isProfit = isBuy ? refPrice >= entry : refPrice <= entry;
  const leftEdge = Math.min(entryPct, currentPct);
  const barWidth = Math.max(2, Math.abs(currentPct - entryPct));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)]">
        <span>Position Track</span>
        <span className="font-mono tabular-nums text-[var(--text-primary)]">
          {rec.closedPrice ? 'Exit' : 'Live'}{' '}
          {formatSignalPrice(refPrice, rec.currency, rec.decimals)}
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-black/10 dark:bg-white/10">
        <div
          className={`absolute top-0 bottom-0 rounded-full transition-all duration-300 ${
            isProfit ? 'bg-[var(--gain-text)]' : 'bg-[var(--loss-text)]'
          }`}
          style={{ left: `${leftEdge}%`, width: `${barWidth}%` }}
        />
        <div
          className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-[var(--text-primary)]"
          style={{ left: `${entryPct}%` }}
          title="Entry"
        />
        <div
          className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-[var(--gain-text)]/80"
          style={{ left: `${tp1Pct}%` }}
          title="TP1"
        />
        {trailPct !== null && (
          <div
            className="absolute -top-1 -bottom-1 w-1 rounded-full bg-amber-500"
            style={{ left: `${trailPct}%` }}
            title="Trailing Stop"
          />
        )}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-[var(--bg-surface)] shadow-sm ${
            isProfit ? 'bg-[var(--gain-text)]' : 'bg-[var(--loss-text)]'
          }`}
          style={{ left: `${currentPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
        <span className="text-[var(--loss-text)] font-bold">
          SL {formatSignalPrice(sl, rec.currency, rec.decimals)}
        </span>
        <span>Entry</span>
        <span>TP1</span>
        <span className="text-[var(--gain-text)] font-bold">
          TP2 {formatSignalPrice(tp2, rec.currency, rec.decimals)}
        </span>
      </div>
    </div>
  );
};

interface HistoricalPriceSectionProps {
  record: SignalHistoryRecord;
  candles: CandlePoint[];
  loading: boolean;
  error: string | null;
}

const HistoricalPriceSection: React.FC<HistoricalPriceSectionProps> = ({
  record,
  candles,
  loading,
  error,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const isIntraday = record.assetClass === 'crypto' || record.assetClass === 'commodity';
  const trailingStop = computeActiveTrailingStop(record);

  const normalizedBars = useMemo(() => {
    return candles
      .map((c) => ({
        ...c,
        t: c.t < 1e12 ? c.t * 1000 : c.t,
      }))
      .filter((c) => Number.isFinite(c.c) && c.c > 0 && Number.isFinite(c.h) && Number.isFinite(c.l))
      .sort((a, b) => a.t - b.t)
      .slice(-28);
  }, [candles]);

  const entryBarIdx = useMemo(() => {
    if (normalizedBars.length === 0) return -1;
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < normalizedBars.length; i++) {
      const diff = Math.abs(normalizedBars[i].t - record.createdAtMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    const maxWindow = isIntraday ? 12 * 60 * 60 * 1000 : 3 * 24 * 60 * 60 * 1000;
    return bestDiff <= maxWindow ? bestIdx : -1;
  }, [normalizedBars, record.createdAtMs, isIntraday]);

  const activeBar =
    hoverIdx !== null && normalizedBars[hoverIdx]
      ? normalizedBars[hoverIdx]
      : normalizedBars[normalizedBars.length - 1] ?? null;

  const recentRows = useMemo(() => {
    const slice = normalizedBars.slice(-6);
    return slice.map((bar, idx) => {
      const globalIdx = normalizedBars.length - slice.length + idx;
      const prevClose = globalIdx > 0 ? normalizedBars[globalIdx - 1].c : bar.o;
      const chgPct = prevClose > 0 ? ((bar.c - prevClose) / prevClose) * 100 : 0;
      return {
        bar,
        chgPct,
        isEntryBar: globalIdx === entryBarIdx,
      };
    }).reverse();
  }, [normalizedBars, entryBarIdx]);

  if (loading) {
    return (
      <div className="rounded-xl bg-[var(--bg-inset)]/70 border border-[var(--border-subtle)] p-4 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] min-h-[168px]">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
        <span>Loading historical price data for {record.symbol}...</span>
      </div>
    );
  }

  if (error || normalizedBars.length < 3) {
    return (
      <div className="rounded-xl bg-[var(--bg-inset)]/70 border border-[var(--border-subtle)] p-4 text-xs text-[var(--text-muted)] space-y-1">
        <div className="font-bold text-[var(--text-primary)]">Historical Price Snapshot</div>
        <p className="leading-relaxed">
          {error || 'Intraday candle series is refreshing. Entry, Stop-Loss, and Take-Profit benchmarks remain locked below.'}
        </p>
      </div>
    );
  }

  // Compute SVG bounds encompassing both historical candles and SL/Entry/TP1/TP2 levels
  const allPrices: number[] = [
    record.entryLow,
    record.entryHigh,
    record.stopLoss,
    record.tp1,
    record.tp2,
  ];
  if (trailingStop) allPrices.push(trailingStop);
  for (const b of normalizedBars) {
    allPrices.push(b.h, b.l);
  }
  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const pad = Math.max((rawMax - rawMin) * 0.08, rawMax * 0.004);
  const minP = rawMin - pad;
  const maxP = rawMax + pad;
  const spanP = Math.max(maxP - minP, 1e-6);

  const W = 560;
  const H = 188;
  const padLeft = 10;
  const padRight = 76;
  const padTop = 14;
  const padBottom = 22;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const yOf = (price: number) => padTop + ((maxP - price) / spanP) * plotH;
  const stepX = plotW / Math.max(1, normalizedBars.length);
  const xOf = (idx: number) => padLeft + stepX * idx + stepX / 2;
  const bodyW = Math.max(3, Math.min(11, stepX * 0.56));

  const zoneTopY = yOf(Math.max(record.entryLow, record.entryHigh));
  const zoneBottomY = yOf(Math.min(record.entryLow, record.entryHigh));
  const zoneH = Math.max(2, zoneBottomY - zoneTopY);

  const refLines: Array<{
    key: string;
    label: string;
    price: number;
    stroke: string;
    textColor: string;
    dash?: string;
  }> = [
    {
      key: 'tp2',
      label: 'TP2',
      price: record.tp2,
      stroke: 'var(--gain-text)',
      textColor: 'var(--gain-text)',
      dash: '4 3',
    },
    {
      key: 'tp1',
      label: 'TP1',
      price: record.tp1,
      stroke: 'var(--gain-text)',
      textColor: 'var(--text-secondary)',
      dash: '2 3',
    },
    {
      key: 'entry',
      label: 'EN',
      price: record.entryPrice,
      stroke: 'var(--accent-primary)',
      textColor: 'var(--text-primary)',
    },
    {
      key: 'sl',
      label: 'SL',
      price: record.stopLoss,
      stroke: 'var(--loss-text)',
      textColor: 'var(--loss-text)',
      dash: '4 3',
    },
  ];
  if (trailingStop) {
    refLines.push({
      key: 'trail',
      label: 'TRL',
      price: trailingStop,
      stroke: '#f59e0b',
      textColor: '#f59e0b',
      dash: '3 2',
    });
  }

  return (
    <div data-testid="quick-view-historical-prices" className="space-y-3">
      {/* Header + Live/Hovered OHLC Bar Readout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
        <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--text-primary)]">
          <CandlestickChart className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>Historical Price Data ({isIntraday ? record.timeframe : 'Daily'})</span>
        </div>
        {activeBar && (
          <div className="text-[10.5px] font-mono tabular-nums text-[var(--text-muted)] flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[var(--text-primary)]">
              {formatBarStamp(activeBar.t, isIntraday)}
            </span>
            <span>O {formatSignalPrice(activeBar.o, record.currency, record.decimals)}</span>
            <span>H {formatSignalPrice(activeBar.h, record.currency, record.decimals)}</span>
            <span>L {formatSignalPrice(activeBar.l, record.currency, record.decimals)}</span>
            <span className="font-bold text-[var(--text-primary)]">
              C {formatSignalPrice(activeBar.c, record.currency, record.decimals)}
            </span>
          </div>
        )}
      </div>

      {/* SVG Historical Candlestick Chart with Entry / SL / TP Overlays */}
      <div className="rounded-xl bg-[var(--bg-inset)]/75 border border-[var(--border-subtle)] p-2 overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-[176px] sm:h-[192px] select-none touch-pan-y"
          onMouseLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={`Historical price chart for ${record.symbol} with entry, stop-loss, and take-profit levels`}
        >
          {/* Entry Zone Shaded Band */}
          <rect
            x={padLeft}
            y={zoneTopY}
            width={plotW}
            height={zoneH}
            fill="var(--accent-primary)"
            opacity="0.12"
          />

          {/* Entry Trigger Candle Vertical Guide */}
          {entryBarIdx >= 0 && (
            <line
              x1={xOf(entryBarIdx)}
              x2={xOf(entryBarIdx)}
              y1={padTop}
              y2={H - padBottom}
              stroke="var(--accent-primary)"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.55"
            />
          )}

          {/* Reference Price Lines (TP2, TP1, Entry, SL, Trailing) */}
          {refLines.map((rl) => {
            const y = yOf(rl.price);
            return (
              <g key={rl.key}>
                <line
                  x1={padLeft}
                  x2={W - padRight}
                  y1={y}
                  y2={y}
                  stroke={rl.stroke}
                  strokeWidth={rl.key === 'entry' ? 1.25 : 1}
                  strokeDasharray={rl.dash}
                  opacity={rl.key === 'tp1' ? 0.55 : 0.85}
                />
                <text
                  x={W - padRight + 5}
                  y={y + 3}
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  fill={rl.textColor}
                >
                  {rl.label} {formatSignalPrice(rl.price, record.currency, record.decimals)}
                </text>
              </g>
            );
          })}

          {/* Historical Candlesticks */}
          {normalizedBars.map((bar, idx) => {
            const cx = xOf(idx);
            const isUp = bar.c >= bar.o;
            const color = isUp ? 'var(--gain-text)' : 'var(--loss-text)';
            const highY = yOf(bar.h);
            const lowY = yOf(bar.l);
            const openY = yOf(bar.o);
            const closeY = yOf(bar.c);
            const rectY = Math.min(openY, closeY);
            const rectH = Math.max(1.5, Math.abs(closeY - openY));
            const isHovered = hoverIdx === idx;
            const isEntry = entryBarIdx === idx;

            return (
              <g
                key={`${bar.t}-${idx}`}
                onMouseEnter={() => setHoverIdx(idx)}
                onClick={() => setHoverIdx(idx)}
                className="cursor-crosshair"
              >
                {/* Invisible wider hit column for easy tap/hover */}
                <rect
                  x={cx - stepX / 2}
                  y={padTop}
                  width={stepX}
                  height={plotH}
                  fill={isHovered ? 'currentColor' : 'transparent'}
                  opacity={isHovered ? 0.06 : 0}
                />
                {/* Wick */}
                <line
                  x1={cx}
                  x2={cx}
                  y1={highY}
                  y2={lowY}
                  stroke={color}
                  strokeWidth={isHovered || isEntry ? 1.6 : 1.1}
                />
                {/* Body */}
                <rect
                  x={cx - bodyW / 2}
                  y={rectY}
                  width={bodyW}
                  height={rectH}
                  rx="1"
                  fill={color}
                  opacity={isHovered || isEntry ? 1 : 0.88}
                />
                {/* Entry Trigger Pin */}
                {isEntry && (
                  <circle
                    cx={cx}
                    cy={yOf(record.entryPrice)}
                    r="3.5"
                    fill="var(--accent-primary)"
                    stroke="var(--bg-surface)"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}

          {/* Bottom Axis Dates (First, Trigger/Mid, Latest) */}
          <text
            x={padLeft}
            y={H - 5}
            fontSize="9"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill="var(--text-muted)"
          >
            {formatBarStamp(normalizedBars[0].t, isIntraday)}
          </text>
          {entryBarIdx > 2 && entryBarIdx < normalizedBars.length - 3 && (
            <text
              x={xOf(entryBarIdx)}
              y={H - 5}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fill="var(--accent-primary)"
            >
              Trigger
            </text>
          )}
          <text
            x={W - padRight}
            y={H - 5}
            textAnchor="end"
            fontSize="9"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill="var(--text-muted)"
          >
            {formatBarStamp(normalizedBars[normalizedBars.length - 1].t, isIntraday)}
          </text>
        </svg>
      </div>

      {/* Compact Recent Historical Price Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)]/40">
        <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
          <thead>
            <tr className="border-b border-[var(--border-divider)] font-sans text-[10px] font-bold text-[var(--text-muted)]">
              <th className="py-1.5 pl-3 pr-2">Session</th>
              <th className="py-1.5 px-2 text-right">Open</th>
              <th className="py-1.5 px-2 text-right">High</th>
              <th className="py-1.5 px-2 text-right">Low</th>
              <th className="py-1.5 px-2 text-right">Close</th>
              <th className="py-1.5 pl-2 pr-3 text-right">Chg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-divider)]">
            {recentRows.map(({ bar, chgPct, isEntryBar }, idx) => (
              <tr
                key={`${bar.t}-${idx}`}
                className={isEntryBar ? 'bg-[var(--accent-soft)]/50' : ''}
              >
                <td className="py-1.5 pl-3 pr-2 whitespace-nowrap text-[var(--text-primary)] font-semibold">
                  {formatBarStamp(bar.t, isIntraday)}
                  {isEntryBar && (
                    <span className="ml-1.5 font-sans text-[10px] font-extrabold text-[var(--accent-primary)]">
                      Entry
                    </span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-right text-[var(--text-secondary)]">
                  {formatSignalPrice(bar.o, record.currency, record.decimals)}
                </td>
                <td className="py-1.5 px-2 text-right text-[var(--text-secondary)]">
                  {formatSignalPrice(bar.h, record.currency, record.decimals)}
                </td>
                <td className="py-1.5 px-2 text-right text-[var(--text-secondary)]">
                  {formatSignalPrice(bar.l, record.currency, record.decimals)}
                </td>
                <td className="py-1.5 px-2 text-right font-bold text-[var(--text-primary)]">
                  {formatSignalPrice(bar.c, record.currency, record.decimals)}
                </td>
                <td
                  className={`py-1.5 pl-2 pr-3 text-right font-bold ${
                    chgPct > 0
                      ? 'text-[var(--gain-text)]'
                      : chgPct < 0
                        ? 'text-[var(--loss-text)]'
                        : 'text-[var(--text-muted)]'
                  }`}
                >
                  {chgPct >= 0 ? '+' : ''}
                  {chgPct.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const SignalDetailSheet: React.FC<SignalDetailSheetProps> = ({
  record,
  onClose,
  onInspectSignal,
  onAnnotateSignal,
  onDeleteSignal,
}) => {
  const [noteDraft, setNoteDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (record) {
      setNoteDraft(record.journalNote ?? '');
      setSavedFeedback(false);
      setCopied(false);
    }
  }, [record?.id, record?.journalNote]);

  // Fetch real historical OHLCV price data for the selected trade whenever the Quick View modal opens
  useEffect(() => {
    if (!record) {
      setCandles([]);
      setHistoryError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const loadHistoricalPrices = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const isStock = record.assetClass === 'stock_id' || record.assetClass === 'stock_us';
        const url = isStock
          ? `/api/portfolio/chart?symbol=${encodeURIComponent(
              record.assetClass === 'stock_id' && !record.symbol.endsWith('.JK')
                ? `${record.symbol}.JK`
                : record.symbol
            )}&timeframe=1M`
          : `/api/market/chart?id=${encodeURIComponent(record.assetId)}&timeframe=${encodeURIComponent(
              record.timeframe || '15m'
            )}`;

        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) {
          throw new Error('Historical candles unavailable');
        }
        const data = (await res.json()) as { candles?: CandlePoint[] };
        if (!cancelled) {
          setCandles(Array.isArray(data?.candles) ? data.candles : []);
        }
      } catch (err) {
        if (!cancelled && (err as Error)?.name !== 'AbortError') {
          setCandles([]);
          setHistoryError('Historical candle feed temporarily unavailable.');
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistoricalPrices();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [record?.id, record?.symbol, record?.assetId, record?.assetClass, record?.timeframe]);

  // Close on Escape and lock background scroll while open
  useEffect(() => {
    if (!record) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [record, onClose]);

  if (!record) return null;

  const isBuy = record.direction === 'BUY';
  const cur = record.currency;
  const dec = record.decimals;
  const canonical = normalizeSignalStatus(record.status);
  const statusDisplay = getStatusDisplay(record);
  const trailingStop = computeActiveTrailingStop(record);
  const isClosed = isTerminalSignalStatus(record.status);
  const pendingRemainingMs = getPendingExpiryRemainingMs(record);
  const expiredMeta =
    canonical === 'EXPIRED'
      ? getExpiredReasonMeta(record.expiredReason, record.zoneFillVerified)
      : null;

  const riskDist = Math.abs(record.entryPrice - record.stopLoss);
  const rewardDist = Math.abs(record.tp2 - record.entryPrice);
  const computedRR =
    riskDist > 0 && rewardDist > 0
      ? `1 : ${(rewardDist / riskDist).toFixed(2)}`
      : record.riskReward;

  const handleCopyLevels = async () => {
    const lines = [
      `${record.symbol} · ${record.direction} (${record.timeframe}) · ${statusDisplay.label}`,
      `Entry: ${formatSignalPrice(record.entryPrice, cur, dec)} (Zone ${formatSignalPrice(record.entryLow, cur, dec)} – ${formatSignalPrice(record.entryHigh, cur, dec)})`,
      `Stop Loss: ${formatSignalPrice(record.stopLoss, cur, dec)} (${pctDistance(record.entryPrice, record.stopLoss)})`,
      ...(trailingStop
        ? [`Trailing Stop: ${formatSignalPrice(trailingStop, cur, dec)}`]
        : []),
      `TP1 (SL→BE): ${formatSignalPrice(record.tp1, cur, dec)} (${pctDistance(record.entryPrice, record.tp1)})`,
      `TP2 (Target): ${formatSignalPrice(record.tp2, cur, dec)} (${pctDistance(record.entryPrice, record.tp2)})`,
      ...(record.closedPrice
        ? [`Exit Price: ${formatSignalPrice(record.closedPrice, cur, dec)} · ${record.rMultiple >= 0 ? '+' : ''}${record.rMultiple.toFixed(2)}R (${record.pnlPct >= 0 ? '+' : ''}${record.pnlPct.toFixed(2)}%)`]
        : [`Live Spot: ${formatSignalPrice(record.lastPrice, cur, dec)}`]),
      `Triggered: ${formatWibFull(record.createdAtMs)}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleSaveNote = () => {
    if (!onAnnotateSignal) return;
    onAnnotateSignal(record.id, record.userOutcome ?? null, noteDraft.trim());
    setSavedFeedback(true);
    window.setTimeout(() => setSavedFeedback(false), 1600);
  };

  return (
    <div
      data-testid="signal-quick-view-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Quick View for ${record.symbol} trade`}
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center md:p-6"
    >
      {/* Backdrop Scrim */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Responsive Quick View Modal: Bottom Sheet on Mobile (<768px) / Centered Modal on Desktop (>=768px) */}
      <div className="relative z-10 w-full md:max-w-2xl max-h-[92dvh] md:max-h-[88dvh] rounded-t-3xl md:rounded-2xl bg-[var(--bg-surface)] border-t md:border border-[var(--border-subtle)] shadow-2xl flex flex-col overflow-hidden">
        {/* Mobile Drag Handle */}
        <div className="md:hidden pt-3 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-black/20 dark:bg-white/25" />
        </div>

        {/* Sticky Modal Header */}
        <div className="px-5 pt-2 pb-3.5 md:pt-5 border-b border-[var(--border-divider)] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-[var(--text-muted)]">Quick View</span>
              <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
              <span className={`text-[11px] font-extrabold ${statusDisplay.toneClass}`}>
                {statusDisplay.label}
              </span>
              {pendingRemainingMs !== null && (
                <>
                  <span aria-hidden="true" className="text-[var(--text-muted)]">·</span>
                  <span className="font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                    48h auto-expiry ({formatPendingExpiryCountdown(pendingRemainingMs)})
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2.5 flex-wrap mt-1">
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-[var(--text-primary)]">
                {record.symbol}
              </h2>
              <span
                className={`inline-flex items-center gap-1 text-xs font-black ${
                  isBuy ? 'text-[var(--gain-text)]' : 'text-[var(--loss-text)]'
                }`}
              >
                {isBuy ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {record.direction}
              </span>
              <span className="font-mono text-xs font-bold text-[var(--text-muted)]">
                {record.timeframe} · {getEngineLabel(record.sourceEngine)}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
              {record.name} · {record.strategyTag}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Quick View modal"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Quick View Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 1. Headline Outcome + 4-Level Price Strip (Entry · Stop-Loss · TP1 · TP2) */}
          <div className="space-y-3.5">
            <div className="flex items-baseline justify-between gap-3 font-mono tabular-nums">
              <div>
                <div className="font-sans text-[11px] font-semibold text-[var(--text-muted)]">
                  {canonical === 'EXPIRED'
                    ? 'Cleanup Outcome'
                    : isClosed
                      ? 'Realized Outcome'
                      : canonical === 'PENDING'
                        ? 'Order Status'
                        : 'Floating P&L'}
                </div>
                {canonical === 'PENDING' ? (
                  <div className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-300 mt-0.5">
                    Awaiting Entry Fill
                  </div>
                ) : canonical === 'EXPIRED' ? (
                  <div className="text-lg sm:text-xl font-black text-[var(--text-muted)] mt-0.5">
                    Closed / Expired (0.00R)
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2.5 mt-0.5">
                    <span
                      className={`text-2xl font-black ${
                        record.rMultiple > 0
                          ? 'text-[var(--gain-text)]'
                          : record.rMultiple < 0
                            ? 'text-[var(--loss-text)]'
                            : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {record.rMultiple >= 0 ? '+' : ''}
                      {record.rMultiple.toFixed(2)}R
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        record.pnlPct > 0
                          ? 'text-[var(--gain-text)]'
                          : record.pnlPct < 0
                            ? 'text-[var(--loss-text)]'
                            : 'text-[var(--text-muted)]'
                      }`}
                    >
                      ({record.pnlPct >= 0 ? '+' : ''}
                      {record.pnlPct.toFixed(2)}%)
                    </span>
                  </div>
                )}
              </div>

              <div className="text-right">
                <div className="font-sans text-[11px] font-semibold text-[var(--text-muted)]">
                  Target R:R · Conf
                </div>
                <div className="text-base font-black text-[var(--text-primary)] mt-0.5">
                  {computedRR} · {record.confidence}%
                </div>
              </div>
            </div>

            {/* Key Levels Grid: Entry · Stop-Loss · TP1 · TP2 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-[var(--border-divider)] font-mono tabular-nums">
              <div>
                <div className="font-sans text-[11px] font-semibold text-[var(--text-muted)]">
                  Entry Price
                </div>
                <div className="text-sm sm:text-base font-black text-[var(--text-primary)] mt-0.5">
                  {formatSignalPrice(record.entryPrice, cur, dec)}
                </div>
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  {record.orderType || (isBuy ? 'BUY LIMIT' : 'SELL LIMIT')}
                </div>
              </div>

              <div>
                <div className="font-sans text-[11px] font-semibold text-[var(--text-muted)]">
                  Stop-Loss
                </div>
                <div className="text-sm sm:text-base font-black text-[var(--loss-text)] mt-0.5">
                  {formatSignalPrice(record.stopLoss, cur, dec)}
                </div>
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  {pctDistance(record.entryPrice, record.stopLoss)} risk
                </div>
              </div>

              <div>
                <div className="font-sans text-[11px] font-semibold text-[var(--text-muted)]">
                  Take-Profit 1
                </div>
                <div className="text-sm sm:text-base font-black text-[var(--gain-text)] mt-0.5">
                  {formatSignalPrice(record.tp1, cur, dec)}
                </div>
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  {pctDistance(record.entryPrice, record.tp1)} · SL→BE
                </div>
              </div>

              <div>
                <div className="font-sans text-[11px] font-semibold text-[var(--text-muted)]">
                  Take-Profit 2
                </div>
                <div className="text-sm sm:text-base font-black text-[var(--gain-text)] mt-0.5">
                  {formatSignalPrice(record.tp2, cur, dec)}
                </div>
                <div className="text-[10.5px] text-[var(--text-muted)]">
                  {pctDistance(record.entryPrice, record.tp2)} target
                </div>
              </div>
            </div>

            <SheetPriceSpectrum rec={record} />
          </div>

          {/* Expiry Reason Notice when Closed/Expired */}
          {canonical === 'EXPIRED' && expiredMeta && (
            <div className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)] py-2.5 border-y border-[var(--border-divider)]">
              {expiredMeta.isInvalidated ? (
                <AlertTriangle className="w-4 h-4 text-[var(--loss-text)] shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              )}
              <span>{expiredMeta.detailLabel}</span>
            </div>
          )}

          {/* 2. Real Historical Price Chart & Recent Sessions Table */}
          <HistoricalPriceSection
            record={record}
            candles={candles}
            loading={historyLoading}
            error={historyError}
          />

          {/* 3. Execution Timestamps & Protection Audit */}
          <div className="space-y-2 pt-2 border-t border-[var(--border-divider)]">
            <h3 className="text-xs font-extrabold text-[var(--text-primary)]">
              Trade Execution &amp; Protection Details
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 text-xs font-mono tabular-nums">
              <div className="py-1.5 flex items-center justify-between gap-3 sm:border-b sm:border-[var(--border-divider)]">
                <dt className="font-sans text-[var(--text-muted)]">Entry Zone</dt>
                <dd className="font-bold text-[var(--text-primary)]">
                  {formatSignalPrice(record.entryLow, cur, dec)} –{' '}
                  {formatSignalPrice(record.entryHigh, cur, dec)}
                </dd>
              </div>
              <div className="py-1.5 flex items-center justify-between gap-3 sm:border-b sm:border-[var(--border-divider)]">
                <dt className="font-sans text-[var(--text-muted)]">
                  {record.closedPrice ? 'Exit Price' : 'Live Spot'}
                </dt>
                <dd className="font-black text-[var(--text-primary)]">
                  {formatSignalPrice(record.closedPrice ?? record.lastPrice, cur, dec)}
                </dd>
              </div>
              <div className="py-1.5 flex items-center justify-between gap-3 sm:border-b sm:border-[var(--border-divider)]">
                <dt className="font-sans text-[var(--text-muted)]">First Triggered</dt>
                <dd className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  {formatWibFull(record.createdAtMs)}
                </dd>
              </div>
              <div className="py-1.5 flex items-center justify-between gap-3 sm:border-b sm:border-[var(--border-divider)]">
                <dt className="font-sans text-[var(--text-muted)]">Zone Filled</dt>
                <dd className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  {record.filledAtMs ? formatWibFull(record.filledAtMs) : 'Not filled'}
                </dd>
              </div>
              <div className="py-1.5 flex items-center justify-between gap-3 sm:border-b sm:border-[var(--border-divider)]">
                <dt className="font-sans text-[var(--text-muted)]">Trailing Stop</dt>
                <dd className="font-bold text-amber-600 dark:text-amber-300 flex items-center gap-1">
                  {trailingStop ? (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>{formatSignalPrice(trailingStop, cur, dec)}</span>
                    </>
                  ) : (
                    <span className="font-sans font-normal text-[var(--text-muted)]">
                      Locks at TP1
                    </span>
                  )}
                </dd>
              </div>
              <div className="py-1.5 flex items-center justify-between gap-3 sm:border-b sm:border-[var(--border-divider)]">
                <dt className="font-sans text-[var(--text-muted)]">MFE / MAE</dt>
                <dd className="text-[11px] font-bold">
                  <span className="text-[var(--gain-text)]">+{(record.mfeR ?? 0).toFixed(2)}R</span>
                  <span className="text-[var(--text-muted)] mx-1.5">/</span>
                  <span className="text-[var(--loss-text)]">-{(record.maeR ?? 0).toFixed(2)}R</span>
                </dd>
              </div>
              {record.closedAtMs && (
                <div className="py-1.5 flex items-center justify-between gap-3 sm:col-span-2">
                  <dt className="font-sans text-[var(--text-muted)]">Closed At</dt>
                  <dd className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    {formatWibFull(record.closedAtMs)}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* 4. Personal Trade Journal Tag & Note */}
          {onAnnotateSignal && (
            <div className="space-y-2.5 pt-2 border-t border-[var(--border-divider)]">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold text-[var(--text-primary)] inline-flex items-center gap-1.5">
                  <MessageSquarePlus className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>Execution Log</span>
                </h3>
                {savedFeedback && (
                  <span className="text-[11px] font-bold text-[var(--gain-text)]">Saved</span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(['WIN', 'LOSS', 'BE'] as const).map((tag) => {
                  const active = record.userOutcome === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        onAnnotateSignal(record.id, active ? null : tag, noteDraft.trim())
                      }
                      className={`min-h-[40px] rounded-xl text-xs font-extrabold border transition-colors ${
                        active
                          ? 'bg-[var(--accent-primary)] text-white monochrome:text-black border-transparent'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-inset)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {tag === 'WIN' ? 'Mark Win' : tag === 'LOSS' ? 'Mark Loss' : 'Break-Even'}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  maxLength={240}
                  placeholder="Add execution note (slippage, partial exit, etc.)..."
                  className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="min-h-[44px] px-4 rounded-xl bg-[var(--accent-primary)] text-white monochrome:text-black text-xs font-bold shrink-0 inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Fixed Bottom Action Bar */}
        <div className="px-5 py-3.5 border-t border-[var(--border-divider)] bg-[var(--bg-surface)] flex items-center gap-2 shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              onInspectSignal(
                record.assetClass === 'stock_id' && !record.symbol.endsWith('.JK')
                  ? `${record.symbol}.JK`
                  : record.symbol,
                record.assetId,
                {
                  symbolLabel: `${record.symbol} (${record.timeframe})`,
                  direction: record.direction,
                  entryLow: record.entryLow,
                  entryHigh: record.entryHigh,
                  stopLoss: record.stopLoss,
                  tp1: record.tp1,
                  tp2: record.tp2,
                },
                record.timeframe as Timeframe
              );
              onClose();
            }}
            className="flex-1 min-h-[44px] px-4 rounded-xl bg-[var(--accent-primary)] text-white monochrome:text-black text-xs font-extrabold inline-flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-[0.99] transition-all whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open Full Chart</span>
          </button>

          <button
            type="button"
            onClick={() => void handleCopyLevels()}
            className="min-h-[44px] px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] text-xs font-bold text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 hover:border-[var(--accent-primary)] transition-colors whitespace-nowrap"
          >
            {copied ? (
              <Check className="w-4 h-4 text-[var(--gain-text)]" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onDeleteSignal(record.id);
              onClose();
            }}
            aria-label="Delete signal from journal"
            className="min-h-[44px] min-w-[44px] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-inset)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--loss-text)] hover:border-[var(--loss-text)]/40 transition-colors shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const SignalQuickViewModal = SignalDetailSheet;
