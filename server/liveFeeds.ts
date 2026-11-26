import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

export interface LiveQuotePatch {
  id: string;
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  open: string;
  dayHigh: string;
  dayLow: string;
  volume: string;
  avgVol: string;
  avgVolLabel: string;
  peLabel: string;
  peValue: string;
  capLabel: string;
  capValue: string;
  w52Low: string;
  w52High: string;
  w52Pct: number;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  support: string;
  supportNote: string;
  resistance: string;
  resistanceNote: string;
  commentary: string;
  sparklinePoints: number[];
  chart1D: number[];
  timestamps1D: number[];
  updatedAtEpoch: number;
  marketSessionOpen: boolean;
  sessionStateLabel: string;
  sessionProgressRatio: number;
  fearGreed7d?: number[];
  move5mPct?: number;
  vol5mRangePct?: number;
  move5mSource?: 'server-5m' | 'intraday-1m' | 'closed';
}

export interface CandlePoint {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface LiveChartResponse {
  id: string;
  timeframe: string;
  points: number[];
  timestamps: number[];
  candles?: CandlePoint[];
  prevClose: number;
}

export interface LiveNewsItem {
  id: string;
  publisher: string;
  timeAgo: string;
  publishedAt: string;
  isBreaking?: boolean;
  newsTier?: 'breaking' | 'recent';
  impactScore?: number;
  impact?: string;
  topic: 'rates' | 'idx' | 'commodities' | 'crypto';
  tags: string[];
  headline: string;
  summary: string;
  paragraphs: string[];
  badgeMetric?: string;
  badgePositive?: boolean;
  url?: string;
}

export interface LiveCalendarItem {
  id: string;
  timeWib: string;
  isoDate: string;
  dateGroupLabel?: string;
  day: 'today' | 'tomorrow' | 'week';
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'CHF' | 'NZD' | 'CNY' | 'IDR';
  impact: 'HIGH' | 'MED' | 'LOW' | 'HOLIDAY';
  title: string;
  description: string;
  actual: string;
  forecast: string;
  previous: string;
  deviationLabel: string;
  deviationType: 'beat' | 'miss' | 'neutral';
}

export interface LiveCalendarResponse {
  events: LiveCalendarItem[];
  nextCatalyst: {
    title: string;
    currency: string;
    timeWib: string;
    targetEpochMs: number;
    description: string;
  } | null;
  source: string;
  updatedAt: string;
}

export interface LiveFxResponse {
  base: string;
  rates: Record<string, number>;
  pairTiles: {
    pair: string;
    base: string;
    quote: string;
    rate: string;
    changePercent: number;
    high: string;
    low: string;
  }[];
  updatedAt: string;
}

export type BandarmologyPhase =
  | 'Strong Accumulation'
  | 'Early Accumulation'
  | 'Early Distribution'
  | 'Strong Distribution'
  | 'Neutral';

export interface BandarmologyAnalysis {
  phase: BandarmologyPhase;
  score: number;
  volumeRatio: number;
  accumulationPressure: number;
  foreignBias: 'Net Buy' | 'Net Sell' | 'Balanced';
  summary: string;
}

export type StockExecutionAction = 'BUY' | 'SELL' | 'WAIT';

export interface StockTradePlan {
  action: StockExecutionAction;
  conviction: number;
  strategyTag: string;
  entryPrice: number;
  entryZoneLabel: string;
  takeProfit1: number;
  takeProfit2: number;
  stopLoss: number;
  riskReward: string;
  demandZoneLabel: string;
  supplyZoneLabel: string;
  bandarFlowBias: string;
  executionNote: string;
  demandLowNum?: number;
  demandHighNum?: number;
  supplyLowNum?: number;
  supplyHighNum?: number;
  ema20Num?: number;
  ema50Num?: number;
  trendFilterLabel?: 'Uptrend (EMA20 > EMA50)' | 'Downtrend (EMA20 < EMA50)' | 'Neutral';
}

export interface StockMover {
  symbol: string;
  name: string;
  market: 'US' | 'ID';
  exchange: string;
  currency: 'USD' | 'IDR';
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: string;
  volumeRaw: number;
  marketState: string;
  sparklinePoints: number[];
  foreignNetAmount?: number;
  foreignNetLabel?: string;
  foreignFlowSide?: 'BUY' | 'SELL';
  foreignSourceLabel?: string;
  bandarmology?: BandarmologyAnalysis;
  tradePlan?: StockTradePlan;
}

export interface StocksMoversBucket {
  impact: StockMover[];
  gainers: StockMover[];
  losers: StockMover[];
  foreignBuy?: StockMover[];
  foreignSell?: StockMover[];
}

export interface StocksMoversResponse {
  us: StocksMoversBucket;
  indonesia: StocksMoversBucket;
  updatedAt: string;
}

const YAHOO_SYMBOL_CONFIG: {
  id: string;
  name: string;
  yahooSymbol: string;
  decimals: number;
  currencyPrefix?: string;
  unitSuffix?: string;
}[] = [
  { id: 'SPX', name: 'S&P 500 Index', yahooSymbol: '^GSPC', decimals: 2 },
  { id: 'IXIC', name: 'NASDAQ Composite', yahooSymbol: '^IXIC', decimals: 2 },
  { id: 'DJI', name: 'Dow Jones Industrial Average', yahooSymbol: '^DJI', decimals: 2 },
  { id: 'IHSG', name: 'IDX Composite Index', yahooSymbol: '^JKSE', decimals: 2 },
  { id: 'EIDO', name: 'iShares MSCI Indonesia ETF', yahooSymbol: 'EIDO', decimals: 2, currencyPrefix: '$' },
  { id: 'HSI', name: 'Hang Seng Index', yahooSymbol: '^HSI', decimals: 2 },
  { id: 'TAIEX', name: 'Taiwan Weighted Index', yahooSymbol: '^TWII', decimals: 2 },
  { id: 'KOSPI', name: 'Korea Composite Index', yahooSymbol: '^KS11', decimals: 2 },
  { id: 'SSEC', name: 'Shanghai Composite Index', yahooSymbol: '000001.SS', decimals: 2 },
  { id: 'NIFTY', name: 'NIFTY 50 Index', yahooSymbol: '^NSEI', decimals: 2 },
  { id: 'XAUUSD', name: 'Gold Spot', yahooSymbol: 'GC=F', decimals: 2, currencyPrefix: '$' },
  { id: 'BTCUSD', name: 'Bitcoin', yahooSymbol: 'BTC-USD', decimals: 2, currencyPrefix: '$' },
  { id: 'ETHUSD', name: 'Ethereum', yahooSymbol: 'ETH-USD', decimals: 2, currencyPrefix: '$' },
  { id: 'WTI', name: 'Crude Oil WTI', yahooSymbol: 'CL=F', decimals: 2, currencyPrefix: '$' },
  { id: 'BRENT', name: 'Brent Crude Oil', yahooSymbol: 'BZ=F', decimals: 2, currencyPrefix: '$' },
  { id: 'USDIDR', name: 'USD/IDR', yahooSymbol: 'IDR=X', decimals: 2 },
  { id: 'EURUSD', name: 'EUR/USD', yahooSymbol: 'EURUSD=X', decimals: 4 },
  { id: 'GBPUSD', name: 'GBP/USD', yahooSymbol: 'GBPUSD=X', decimals: 4 },
  { id: 'USDJPY', name: 'USD/JPY', yahooSymbol: 'JPY=X', decimals: 2 },
  { id: 'AUDUSD', name: 'AUD/USD', yahooSymbol: 'AUDUSD=X', decimals: 4 },
  { id: 'USDCHF', name: 'USD/CHF', yahooSymbol: 'CHF=X', decimals: 4 },
  { id: 'USDCAD', name: 'USD/CAD', yahooSymbol: 'CAD=X', decimals: 4 },
  { id: 'NZDUSD', name: 'NZD/USD', yahooSymbol: 'NZDUSD=X', decimals: 4 },
  { id: 'USDCNY', name: 'USD/CNY', yahooSymbol: 'CNY=X', decimals: 4 },
  { id: 'DXY', name: 'US Dollar Index', yahooSymbol: 'DX-Y.NYB', decimals: 3 },
  { id: 'US10Y', name: 'US 10-Year Treasury Yield', yahooSymbol: '^TNX', decimals: 3, unitSuffix: '%' },
  { id: 'US30Y', name: 'US 30-Year Treasury Yield', yahooSymbol: '^TYX', decimals: 3, unitSuffix: '%' },
];

const UA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'application/json, text/xml, application/xml, */*',
};

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const quotesCache: { entry: CacheEntry<{ quotes: LiveQuotePatch[]; updatedAt: string }> | null } = {
  entry: null,
};
const chartCache = new Map<string, CacheEntry<LiveChartResponse>>();
const fxCache: { entry: CacheEntry<LiveFxResponse> | null } = { entry: null };
const newsCache: { entry: CacheEntry<{ stories: LiveNewsItem[]; updatedAt: string }> | null } = {
  entry: null,
};
const calendarCache: { entry: CacheEntry<LiveCalendarResponse> | null } = { entry: null };
const calendarRangeCache = new Map<string, CacheEntry<LiveCalendarResponse>>();
const stocksMoversCache: { entry: CacheEntry<StocksMoversResponse> | null } = { entry: null };
const heatmapCache: { entry: CacheEntry<MarketHeatmapResponse> | null } = { entry: null };

export type ProviderHealthStatus = 'live' | 'failover' | 'cached' | 'offline';
export type ProviderId = 'coinbase' | 'yahoo_macro' | 'idx_proxy' | 'fx_rates' | 'news_cal';

export interface ProviderFeedDiagnostic {
  id: ProviderId;
  label: string;
  primarySource: string;
  activeSource: string;
  status: ProviderHealthStatus;
  latencyMs: number | null;
  lastSuccessAt: number | null;
  isCachedFallback: boolean;
  fallbackReason?: string;
}

export interface ServerFeedDiagnosticsResponse {
  overallStatus: ProviderHealthStatus;
  hasCachedFallback: boolean;
  hasFailover: boolean;
  providers: ProviderFeedDiagnostic[];
  serverTimestamp: number;
}

const providerDiagnosticsMap = new Map<ProviderId, ProviderFeedDiagnostic>([
  [
    'coinbase',
    {
      id: 'coinbase',
      label: 'Coinbase L2 & Spot',
      primarySource: 'Coinbase Exchange L2',
      activeSource: 'Coinbase Exchange L2',
      status: 'live',
      latencyMs: null,
      lastSuccessAt: null,
      isCachedFallback: false,
    },
  ],
  [
    'yahoo_macro',
    {
      id: 'yahoo_macro',
      label: 'Global Indices & Macro',
      primarySource: 'Yahoo Finance v8 + TV',
      activeSource: 'Yahoo Finance v8 + TV',
      status: 'live',
      latencyMs: null,
      lastSuccessAt: null,
      isCachedFallback: false,
    },
  ],
  [
    'idx_proxy',
    {
      id: 'idx_proxy',
      label: 'IDX Equities Proxy',
      primarySource: 'IDX TV Scanner + Flow',
      activeSource: 'IDX TV Scanner + Flow',
      status: 'live',
      latencyMs: null,
      lastSuccessAt: null,
      isCachedFallback: false,
    },
  ],
  [
    'fx_rates',
    {
      id: 'fx_rates',
      label: 'FX Matrix & SBN',
      primarySource: 'Open ER-API + Live FX',
      activeSource: 'Open ER-API + Live FX',
      status: 'live',
      latencyMs: null,
      lastSuccessAt: null,
      isCachedFallback: false,
    },
  ],
  [
    'news_cal',
    {
      id: 'news_cal',
      label: 'News & Macro Calendar',
      primarySource: 'RSS + TradingView Cal',
      activeSource: 'RSS + TradingView Cal',
      status: 'live',
      latencyMs: null,
      lastSuccessAt: null,
      isCachedFallback: false,
    },
  ],
]);

function updateProviderMetric(
  id: ProviderId,
  patch: Partial<Omit<ProviderFeedDiagnostic, 'id' | 'label' | 'primarySource'>>
): void {
  const existing = providerDiagnosticsMap.get(id);
  if (!existing) return;
  providerDiagnosticsMap.set(id, {
    ...existing,
    ...patch,
  });
}

export function getServerFeedDiagnostics(): ServerFeedDiagnosticsResponse {
  const providers = Array.from(providerDiagnosticsMap.values());
  const hasCachedFallback = providers.some((p) => p.isCachedFallback || p.status === 'cached');
  const hasFailover = providers.some((p) => p.status === 'failover');
  const hasOffline = providers.some((p) => p.status === 'offline');
  const overallStatus: ProviderHealthStatus = hasOffline
    ? 'offline'
    : hasCachedFallback
      ? 'cached'
      : hasFailover
        ? 'failover'
        : 'live';

  return {
    overallStatus,
    hasCachedFallback,
    hasFailover,
    providers,
    serverTimestamp: Date.now(),
  };
}

const serverTickHistory = new Map<string, Array<{ t: number; price: number }>>();
const SERVER_5M_WINDOW_MS = 5 * 60 * 1000;
const SERVER_10M_PRUNE_MS = 10 * 60 * 1000;

function recordAndComputeServer5m(
  assetId: string,
  livePrice: number,
  sameSourcePairs: Array<{ t: number; v: number }>,
  isSessionOpen: boolean,
  now: number
): { move5mPct: number; vol5mRangePct: number; move5mSource: 'server-5m' | 'intraday-1m' | 'closed' } {
  if (!isSessionOpen || !Number.isFinite(livePrice) || livePrice <= 0) {
    return { move5mPct: 0, vol5mRangePct: 0, move5mSource: 'closed' };
  }

  const buf = serverTickHistory.get(assetId) ?? [];
  const pruned = buf.filter((s) => now - s.t <= SERVER_10M_PRUNE_MS);
  const lastSample = pruned[pruned.length - 1];
  if (!lastSample || now - lastSample.t >= 2000 || Math.abs(livePrice - lastSample.price) > 1e-8) {
    pruned.push({ t: now, price: livePrice });
  }
  serverTickHistory.set(assetId, pruned);

  // 1. Once server tick buffer covers >= 4 minutes, compute exact time-interpolated 5m change + 5m realized range
  const fiveMinCutoff = now - SERVER_5M_WINDOW_MS;
  const recent5m = pruned.filter((s) => s.t >= fiveMinCutoff);
  if (pruned.length >= 4 && now - pruned[0].t >= 240_000) {
    let beforeAnchor = pruned[0];
    let afterAnchor = recent5m[0] ?? pruned[pruned.length - 1];
    for (let i = pruned.length - 1; i >= 0; i--) {
      if (pruned[i].t <= fiveMinCutoff) {
        beforeAnchor = pruned[i];
        afterAnchor = pruned[i + 1] ?? pruned[i];
        break;
      }
    }
    let anchorPrice = beforeAnchor.price;
    if (afterAnchor.t > beforeAnchor.t && fiveMinCutoff > beforeAnchor.t && fiveMinCutoff < afterAnchor.t) {
      const ratio = (fiveMinCutoff - beforeAnchor.t) / (afterAnchor.t - beforeAnchor.t);
      anchorPrice = beforeAnchor.price + (afterAnchor.price - beforeAnchor.price) * ratio;
    }
    if (anchorPrice > 0) {
      const move5mPct = ((livePrice - anchorPrice) / anchorPrice) * 100;
      const vals5m = recent5m.length >= 2 ? recent5m.map((s) => s.price) : [anchorPrice, livePrice];
      const hi = Math.max(...vals5m);
      const lo = Math.min(...vals5m);
      const mid = (hi + lo) / 2 || livePrice;
      const vol5mRangePct = ((hi - lo) / mid) * 100;
      return {
        move5mPct: Number(move5mPct.toFixed(3)),
        vol5mRangePct: Number(vol5mRangePct.toFixed(3)),
        move5mSource: 'server-5m',
      };
    }
  }

  // 2. Fallback: exact same-source intraday bars (1m/5m) so there is zero cross-provider basis jump
  if (sameSourcePairs.length >= 2) {
    const lastBar = sameSourcePairs[sameSourcePairs.length - 1];
    // Only trust intraday bars if latest bar is reasonably fresh (<= 20 min old)
    if (now - lastBar.t <= 20 * 60_000 && lastBar.v > 0) {
      const targetTs = lastBar.t - SERVER_5M_WINDOW_MS;
      let closestIdx = sameSourcePairs.length - 2;
      let bestDiff = Infinity;
      for (let i = sameSourcePairs.length - 2; i >= 0; i--) {
        const diff = Math.abs(sameSourcePairs[i].t - targetTs);
        if (diff < bestDiff) {
          bestDiff = diff;
          closestIdx = i;
        }
        if (sameSourcePairs[i].t < targetTs - 12 * 60_000) break;
      }
      const anchorBar = sameSourcePairs[closestIdx];
      const gapMinutes = Math.max(1, (lastBar.t - anchorBar.t) / 60_000);
      if (anchorBar.v > 0 && gapMinutes <= 18) {
        const rawPct = ((lastBar.v - anchorBar.v) / anchorBar.v) * 100;
        const move5mPct = gapMinutes > 6.5 ? rawPct * (5 / gapMinutes) : rawPct;
        const windowSlice = sameSourcePairs.slice(closestIdx).map((p) => p.v);
        const hi = Math.max(...windowSlice);
        const lo = Math.min(...windowSlice);
        const mid = (hi + lo) / 2 || lastBar.v;
        const vol5mRangePct = ((hi - lo) / mid) * 100;
        return {
          move5mPct: Number(move5mPct.toFixed(3)),
          vol5mRangePct: Number(vol5mRangePct.toFixed(3)),
          move5mSource: 'intraday-1m',
        };
      }
    }
  }

  return { move5mPct: 0, vol5mRangePct: 0, move5mSource: 'intraday-1m' };
}

const inFlightSharedMap = new Map<string, Promise<unknown>>();

function coalesceInFlight<T>(
  key: string,
  staleFallback: T | undefined,
  taskFn: () => Promise<T>
): Promise<T> {
  const existing = inFlightSharedMap.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const wrapped = taskFn()
    .catch((err) => {
      if (staleFallback !== undefined) return staleFallback;
      throw err;
    })
    .finally(() => {
      inFlightSharedMap.delete(key);
    });
  inFlightSharedMap.set(key, wrapped);
  return wrapped;
}

interface Id10yRawData {
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  openNum: number;
  dayHighNum: number;
  dayLowNum: number;
  w52LowNum: number;
  w52HighNum: number;
  perfW: number;
  perf1M: number;
  perf3M: number;
  perfYTD: number;
  perfY: number;
  coupon: string;
  maturity: string;
  bondLastPrice: string;
  updatedAtEpoch: number;
}

const id10yCache: { entry: (CacheEntry<Id10yRawData> & { wasOpen?: boolean }) | null } = { entry: null };

interface ServerSessionInfo {
  isOpen: boolean;
  stateLabel: string;
  progressRatio: number;
}

function getTzClockServer(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const totalMin = hour * 60 + minute;
  return { weekday, hour, minute, isWeekend, totalMin };
}

export function getServerSessionInfo(keyOrSymbol: string, now = new Date()): ServerSessionInfo {
  const clamp = (v: number) => Math.max(0.08, Math.min(1, v));
  const upper = keyOrSymbol.toUpperCase();

  // Crypto 24/7
  if (upper === 'BTCUSD' || upper === 'ETHUSD' || upper.endsWith('-USD')) {
    const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
    return { isOpen: true, stateLabel: 'Live 24/7', progressRatio: clamp(utcMins / 1440) };
  }

  // Indonesia Equities (.JK or IHSG)
  if (upper === 'IHSG' || upper === '^JKSE' || upper.endsWith('.JK')) {
    const jkt = getTzClockServer(now, 'Asia/Jakarta');
    if (jkt.isWeekend) return { isOpen: false, stateLabel: 'Closed', progressRatio: 1 };
    const isFri = jkt.weekday === 'Fri';
    const lunchStart = isFri ? 11 * 60 + 30 : 12 * 60;
    const lunchEnd = isFri ? 14 * 60 : 13 * 60 + 30;
    const progress =
      jkt.totalMin >= 9 * 60 && jkt.totalMin < 16 * 60
        ? clamp((jkt.totalMin - 9 * 60) / (7 * 60))
        : 1;
    if (jkt.totalMin >= 9 * 60 && jkt.totalMin < lunchStart) {
      return { isOpen: true, stateLabel: 'Open (Ses I)', progressRatio: progress };
    }
    if (jkt.totalMin >= lunchStart && jkt.totalMin < lunchEnd) {
      return { isOpen: false, stateLabel: 'Lunch Break', progressRatio: progress };
    }
    if (jkt.totalMin >= lunchEnd && jkt.totalMin < 16 * 60) {
      return { isOpen: true, stateLabel: 'Open (Ses II)', progressRatio: progress };
    }
    return { isOpen: false, stateLabel: 'Closed', progressRatio: 1 };
  }

  // Indonesia SBN 10Y Bond
  if (upper === 'ID10Y') {
    const jkt = getTzClockServer(now, 'Asia/Jakarta');
    const open = !jkt.isWeekend && jkt.totalMin >= 9 * 60 && jkt.totalMin < 16 * 60 + 30;
    return {
      isOpen: open,
      stateLabel: open ? 'Open' : 'Closed',
      progressRatio: open ? clamp((jkt.totalMin - 9 * 60) / 450) : 1,
    };
  }

  // Hong Kong (.HK / HSI)
  if (upper === 'HSI' || upper === '^HSI' || upper.endsWith('.HK')) {
    const hkg = getTzClockServer(now, 'Asia/Hong_Kong');
    if (hkg.isWeekend) return { isOpen: false, stateLabel: 'Closed', progressRatio: 1 };
    const progress =
      hkg.totalMin >= 9 * 60 + 30 && hkg.totalMin < 16 * 60
        ? clamp((hkg.totalMin - (9 * 60 + 30)) / 390)
        : 1;
    if (hkg.totalMin >= 9 * 60 + 30 && hkg.totalMin < 12 * 60) {
      return { isOpen: true, stateLabel: 'Open (AM)', progressRatio: progress };
    }
    if (hkg.totalMin >= 12 * 60 && hkg.totalMin < 13 * 60) {
      return { isOpen: false, stateLabel: 'Lunch Break', progressRatio: progress };
    }
    if (hkg.totalMin >= 13 * 60 && hkg.totalMin < 16 * 60) {
      return { isOpen: true, stateLabel: 'Open (PM)', progressRatio: progress };
    }
    return { isOpen: false, stateLabel: 'Closed', progressRatio: 1 };
  }

  // Taiwan
  if (upper === 'TAIEX' || upper === '^TWII' || upper.endsWith('.TW')) {
    const tw = getTzClockServer(now, 'Asia/Taipei');
    const open = !tw.isWeekend && tw.totalMin >= 9 * 60 && tw.totalMin < 13 * 60 + 30;
    return {
      isOpen: open,
      stateLabel: open ? 'Open' : 'Closed',
      progressRatio: open ? clamp((tw.totalMin - 9 * 60) / 270) : 1,
    };
  }

  // Korea
  if (upper === 'KOSPI' || upper === '^KS11' || upper.endsWith('.KS')) {
    const kr = getTzClockServer(now, 'Asia/Seoul');
    const open = !kr.isWeekend && kr.totalMin >= 9 * 60 && kr.totalMin < 15 * 60 + 30;
    return {
      isOpen: open,
      stateLabel: open ? 'Open' : 'Closed',
      progressRatio: open ? clamp((kr.totalMin - 9 * 60) / 390) : 1,
    };
  }

  // Shanghai
  if (upper === 'SSEC' || upper === '000001.SS' || upper.endsWith('.SS') || upper.endsWith('.SZ')) {
    const cn = getTzClockServer(now, 'Asia/Shanghai');
    if (cn.isWeekend) return { isOpen: false, stateLabel: 'Closed', progressRatio: 1 };
    const progress =
      cn.totalMin >= 9 * 60 + 30 && cn.totalMin < 15 * 60
        ? clamp((cn.totalMin - (9 * 60 + 30)) / 330)
        : 1;
    if (cn.totalMin >= 9 * 60 + 30 && cn.totalMin < 11 * 60 + 30) {
      return { isOpen: true, stateLabel: 'Open (AM)', progressRatio: progress };
    }
    if (cn.totalMin >= 11 * 60 + 30 && cn.totalMin < 13 * 60) {
      return { isOpen: false, stateLabel: 'Lunch Break', progressRatio: progress };
    }
    if (cn.totalMin >= 13 * 60 && cn.totalMin < 15 * 60) {
      return { isOpen: true, stateLabel: 'Open (PM)', progressRatio: progress };
    }
    return { isOpen: false, stateLabel: 'Closed', progressRatio: 1 };
  }

  // India NSE
  if (upper === 'NIFTY' || upper === '^NSEI' || upper.endsWith('.NS')) {
    const ist = getTzClockServer(now, 'Asia/Kolkata');
    const open = !ist.isWeekend && ist.totalMin >= 9 * 60 + 15 && ist.totalMin < 15 * 60 + 30;
    return {
      isOpen: open,
      stateLabel: open ? 'Open' : 'Closed',
      progressRatio: open ? clamp((ist.totalMin - (9 * 60 + 15)) / 375) : 1,
    };
  }

  // Japan TSE
  if (upper === '^N225' || upper.endsWith('.T')) {
    const jp = getTzClockServer(now, 'Asia/Tokyo');
    const open =
      !jp.isWeekend &&
      ((jp.totalMin >= 9 * 60 && jp.totalMin < 11 * 60 + 30) ||
        (jp.totalMin >= 12 * 60 + 30 && jp.totalMin < 15 * 60));
    return {
      isOpen: open,
      stateLabel: open ? 'Open' : 'Closed',
      progressRatio: !jp.isWeekend && jp.totalMin >= 9 * 60 && jp.totalMin < 15 * 60 ? clamp((jp.totalMin - 9 * 60) / 360) : 1,
    };
  }

  // Global 24/5 FX, Futures Commodities, DXY, and US Yields
  if (
    upper === 'USDIDR' ||
    upper === 'EURUSD' ||
    upper === 'GBPUSD' ||
    upper === 'USDJPY' ||
    upper === 'AUDUSD' ||
    upper === 'USDCHF' ||
    upper === 'USDCAD' ||
    upper === 'NZDUSD' ||
    upper === 'USDCNY' ||
    upper === 'DXY' ||
    upper === 'DX-Y.NYB' ||
    upper === 'XAUUSD' ||
    upper === 'WTI' ||
    upper === 'BRENT' ||
    upper === 'US10Y' ||
    upper === 'US30Y' ||
    upper.endsWith('=X') ||
    upper.endsWith('=F') ||
    upper === '^TNX' ||
    upper === '^TYX'
  ) {
    const ny = getTzClockServer(now, 'America/New_York');
    const isWeekendClosed =
      (ny.weekday === 'Fri' && ny.totalMin >= 17 * 60) ||
      ny.weekday === 'Sat' ||
      (ny.weekday === 'Sun' && ny.totalMin < 18 * 60);
    return {
      isOpen: !isWeekendClosed,
      stateLabel: isWeekendClosed ? 'Closed' : 'Open (24/5)',
      progressRatio: isWeekendClosed ? 1 : clamp(((ny.hour * 60 + ny.minute + 360) % 1440) / 1440),
    };
  }

  // US Equities & Indices (NYSE / NASDAQ Regular Session 09:30–16:00 ET)
  const ny = getTzClockServer(now, 'America/New_York');
  if (!ny.isWeekend && ny.totalMin >= 9 * 60 + 30 && ny.totalMin < 16 * 60) {
    return {
      isOpen: true,
      stateLabel: 'Open',
      progressRatio: clamp((ny.totalMin - (9 * 60 + 30)) / 390),
    };
  }
  return { isOpen: false, stateLabel: 'Closed', progressRatio: 1 };
}

async function fetchId10yRaw(): Promise<Id10yRawData | null> {
  const now = Date.now();
  const sessionInfo = getServerSessionInfo('ID10Y', new Date(now));
  if (
    id10yCache.entry &&
    id10yCache.entry.expiresAt > now &&
    id10yCache.entry.wasOpen === sessionInfo.isOpen
  ) {
    return id10yCache.entry.data;
  }

  const [tvRes, cnbcRes] = await Promise.all([
    fetch('https://scanner.tradingview.com/global/scan', {
      method: 'POST',
      headers: {
        ...UA_HEADERS,
        'Content-Type': 'application/json',
        Origin: 'https://www.tradingview.com',
        Referer: 'https://www.tradingview.com/',
      },
      body: JSON.stringify({
        symbols: { tickers: ['TVC:ID10Y'], query: { types: [] } },
        columns: [
          'name',
          'close',
          'change',
          'change_abs',
          'high',
          'low',
          'open',
          'price_52_week_high',
          'price_52_week_low',
          'Perf.W',
          'Perf.1M',
          'Perf.3M',
          'Perf.YTD',
          'Perf.Y',
        ],
      }),
      signal: AbortSignal.timeout(7000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch(
      'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=ID10Y-ID&requestMethod=itv&noform=1&fund=1&exthrs=1&output=json',
      {
        headers: UA_HEADERS,
        signal: AbortSignal.timeout(7000),
      }
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const tvRow = (
    tvRes as {
      data?: Array<{ d?: Array<number | string | null> }>;
    } | null
  )?.data?.[0]?.d;

  const cnbcQuote = (
    cnbcRes as {
      FormattedQuoteResult?: {
        FormattedQuote?: Array<Record<string, unknown>>;
      };
    } | null
  )?.FormattedQuoteResult?.FormattedQuote?.[0];

  const parseNum = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const tvClose = tvRow ? parseNum(tvRow[1]) : null;
  const cnbcLast = cnbcQuote ? parseNum(cnbcQuote.last) : null;
  const price = tvClose ?? cnbcLast;
  if (price === null || !Number.isFinite(price) || price <= 0) return null;

  const tvChangePct = tvRow ? parseNum(tvRow[2]) : null;
  const tvChangeAbs = tvRow ? parseNum(tvRow[3]) : null;
  const cnbcChg = cnbcQuote ? parseNum(cnbcQuote.change) : null;
  const cnbcChgPct = cnbcQuote ? parseNum(cnbcQuote.change_pct) : null;
  const cnbcPrevClose = cnbcQuote ? parseNum(cnbcQuote.previous_day_closing) : null;

  const rawPct = tvChangePct ?? cnbcChgPct ?? 0;
  let rawAbs = tvChangeAbs ?? cnbcChg ?? 0;
  if (Math.abs(rawAbs) < 1e-6 && Math.abs(rawPct) >= 0.01) {
    rawAbs = price - price / (1 + rawPct / 100);
  }

  let prevClose = Number(
    (tvClose !== null
      ? price - rawAbs
      : cnbcPrevClose ?? (price - rawAbs)
    ).toFixed(3)
  );
  if (Math.abs(price - prevClose) < 1e-6 && Math.abs(rawPct) >= 0.01) {
    prevClose = Number((price / (1 + rawPct / 100)).toFixed(3));
  }
  const changeValue = Number((price - prevClose).toFixed(3));
  const changePercent = Number(
    (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : rawPct).toFixed(2)
  );

  const openNum = (tvRow ? parseNum(tvRow[6]) : null) ?? (cnbcQuote ? parseNum(cnbcQuote.open) : null) ?? prevClose;
  const rawHigh = (tvRow ? parseNum(tvRow[4]) : null) ?? (cnbcQuote ? parseNum(cnbcQuote.high) : null) ?? Math.max(price, prevClose);
  const rawLow = (tvRow ? parseNum(tvRow[5]) : null) ?? (cnbcQuote ? parseNum(cnbcQuote.low) : null) ?? Math.min(price, prevClose);
  const dayHighNum = Math.max(rawHigh, price, openNum);
  const dayLowNum = Math.min(rawLow, price, openNum);

  const raw52High = (tvRow ? parseNum(tvRow[7]) : null) ?? (cnbcQuote ? parseNum(cnbcQuote.yrhiprice) : null) ?? 7.803;
  const raw52Low = (tvRow ? parseNum(tvRow[8]) : null) ?? (cnbcQuote ? parseNum(cnbcQuote.yrloprice) : null) ?? 6.088;
  const w52HighNum = Math.max(raw52High, dayHighNum);
  const w52LowNum = Math.min(raw52Low, dayLowNum);

  const perfW = (tvRow ? parseNum(tvRow[9]) : null) ?? -0.5;
  const perf1M = (tvRow ? parseNum(tvRow[10]) : null) ?? 4.0;
  const perf3M = (tvRow ? parseNum(tvRow[11]) : null) ?? 6.5;
  const perfYTD = (tvRow ? parseNum(tvRow[12]) : null) ?? 18.0;
  const perfY = (tvRow ? parseNum(tvRow[13]) : null) ?? 15.0;

  const couponRaw = typeof cnbcQuote?.coupon === 'string' && cnbcQuote.coupon ? cnbcQuote.coupon : '6.50%';
  const maturityIso = typeof cnbcQuote?.maturity_date === 'string' ? cnbcQuote.maturity_date : '2036-04-15';
  let maturityLabel = 'Apr 2036';
  const matDate = new Date(maturityIso);
  if (Number.isFinite(matDate.getTime())) {
    maturityLabel = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      year: 'numeric',
    }).format(matDate);
  }
  const bondLastPrice =
    typeof cnbcQuote?.bond_last_price === 'string' && cnbcQuote.bond_last_price
      ? cnbcQuote.bond_last_price
      : '92.65';

  const result: Id10yRawData = {
    price: Number(price.toFixed(3)),
    prevClose,
    changeValue,
    changePercent,
    openNum: Number(openNum.toFixed(3)),
    dayHighNum: Number(dayHighNum.toFixed(3)),
    dayLowNum: Number(dayLowNum.toFixed(3)),
    w52LowNum: Number(w52LowNum.toFixed(3)),
    w52HighNum: Number(w52HighNum.toFixed(3)),
    perfW,
    perf1M,
    perf3M,
    perfYTD,
    perfY,
    coupon: couponRaw,
    maturity: maturityLabel,
    bondLastPrice,
    updatedAtEpoch: now,
  };

  const ttlMs = sessionInfo.isOpen ? 900 : 600_000;
  id10yCache.entry = { data: result, expiresAt: now + ttlMs, wasOpen: sessionInfo.isOpen };
  return result;
}

function formatStatNumber(
  value: number | undefined,
  decimals: number,
  prefix = '',
  suffix = ''
): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${prefix}${formatted}${suffix}`;
}

function formatVolume(vol: number | undefined, prefix = ''): string {
  if (!vol || !Number.isFinite(vol) || vol <= 0) return 'Live Feed';
  if (vol >= 1e9) return `${prefix}${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `${prefix}${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `${prefix}${(vol / 1e3).toFixed(1)}K`;
  return `${prefix}${Math.round(vol)}`;
}

function samplePoints(values: number[], targetCount = 24): number[] {
  if (values.length <= targetCount) return values;
  const out: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.min(values.length - 1, Math.round((i / (targetCount - 1)) * (values.length - 1)));
    out.push(values[idx]);
  }
  return out;
}

interface RawQuoteMeta {
  cfg: (typeof YAHOO_SYMBOL_CONFIG)[number];
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  firstOpen: number;
  dayHighNum: number;
  dayLowNum: number;
  w52LowNum: number;
  w52HighNum: number;
  w52Pct: number;
  vol: number;
  closes: number[];
  timestamps: number[];
  updatedAtEpoch: number;
  exchangeName: string;
  fearGreed7d: number[];
  move5mPct: number;
  vol5mRangePct: number;
  move5mSource: 'server-5m' | 'intraday-1m' | 'closed';
}

interface CoinbaseSpotStats {
  price: number;
  open24h: number;
  high24h: number;
  low24h: number;
  volumeUsd: number;
}

async function fetchCoinbaseSpotStats(
  pair: 'BTC-USD' | 'ETH-USD'
): Promise<CoinbaseSpotStats | null> {
  const t0 = Date.now();
  try {
    const res = await fetch(`https://api.exchange.coinbase.com/products/${pair}/stats`, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(5500),
    });
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      const json = (await res.json()) as {
        open?: string;
        high?: string;
        low?: string;
        last?: string;
        volume?: string;
      };
      const price = Number(json.last);
      const open24h = Number(json.open);
      const high24h = Number(json.high);
      const low24h = Number(json.low);
      const baseVol = Number(json.volume ?? 0);
      if (Number.isFinite(price) && price > 0) {
        updateProviderMetric('coinbase', {
          status: 'live',
          activeSource: 'Coinbase Exchange L2 / Spot',
          latencyMs,
          lastSuccessAt: Date.now(),
          isCachedFallback: false,
          fallbackReason: undefined,
        });
        return {
          price,
          open24h: Number.isFinite(open24h) && open24h > 0 ? open24h : price,
          high24h: Number.isFinite(high24h) && high24h > 0 ? high24h : price,
          low24h: Number.isFinite(low24h) && low24h > 0 ? low24h : price,
          volumeUsd: Number.isFinite(baseVol) && baseVol > 0 ? baseVol * price : 0,
        };
      }
    }

    // Secondary Coinbase Spot REST endpoint before failing over to Yahoo
    const v2Res = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(4500),
    }).catch(() => null);
    if (v2Res?.ok) {
      const v2Json = (await v2Res.json()) as { data?: { amount?: string } };
      const spotPx = Number(v2Json?.data?.amount);
      if (Number.isFinite(spotPx) && spotPx > 0) {
        updateProviderMetric('coinbase', {
          status: 'live',
          activeSource: 'Coinbase Spot v2 Live',
          latencyMs: Date.now() - t0,
          lastSuccessAt: Date.now(),
          isCachedFallback: false,
          fallbackReason: undefined,
        });
        return {
          price: spotPx,
          open24h: spotPx,
          high24h: spotPx,
          low24h: spotPx,
          volumeUsd: 0,
        };
      }
    }

    updateProviderMetric('coinbase', {
      status: 'failover',
      activeSource: 'Yahoo Crypto Fallback',
      latencyMs: Date.now() - t0,
      isCachedFallback: false,
      fallbackReason: `Coinbase REST HTTP ${res.status}`,
    });
    return null;
  } catch {
    const v2Res = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(4500),
    }).catch(() => null);
    if (v2Res?.ok) {
      const v2Json = (await v2Res.json()) as { data?: { amount?: string } };
      const spotPx = Number(v2Json?.data?.amount);
      if (Number.isFinite(spotPx) && spotPx > 0) {
        updateProviderMetric('coinbase', {
          status: 'live',
          activeSource: 'Coinbase Spot v2 Live',
          latencyMs: Date.now() - t0,
          lastSuccessAt: Date.now(),
          isCachedFallback: false,
          fallbackReason: undefined,
        });
        return {
          price: spotPx,
          open24h: spotPx,
          high24h: spotPx,
          low24h: spotPx,
          volumeUsd: 0,
        };
      }
    }
    updateProviderMetric('coinbase', {
      status: 'failover',
      activeSource: 'Yahoo Crypto Fallback',
      latencyMs: Date.now() - t0,
      isCachedFallback: false,
      fallbackReason: 'Coinbase REST timeout/unreachable',
    });
    return null;
  }
}

interface TvGlobalQuote {
  price: number;
  changePct: number;
  changeAbs: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  preferPrimary: boolean;
}

const TV_GLOBAL_SYMBOL_MAP: Record<string, { tv: string; preferPrimary: boolean }> = {
  SPX: { tv: 'SP:SPX', preferPrimary: false },
  IXIC: { tv: 'NASDAQ:IXIC', preferPrimary: false },
  DJI: { tv: 'DJ:DJI', preferPrimary: false },
  IHSG: { tv: 'IDX:COMPOSITE', preferPrimary: false },
  EIDO: { tv: 'AMEX:EIDO', preferPrimary: false },
  HSI: { tv: 'HSI:HSI', preferPrimary: false },
  KOSPI: { tv: 'KRX:KOSPI', preferPrimary: false },
  SSEC: { tv: 'SSE:000001', preferPrimary: false },
  NIFTY: { tv: 'NSE:NIFTY', preferPrimary: false },
  XAUUSD: { tv: 'OANDA:XAUUSD', preferPrimary: true },
  WTI: { tv: 'NYMEX:CL1!', preferPrimary: true },
  BRENT: { tv: 'ICEEUR:BRN1!', preferPrimary: true },
  USDIDR: { tv: 'FX_IDC:USDIDR', preferPrimary: true },
  EURUSD: { tv: 'FX:EURUSD', preferPrimary: true },
  GBPUSD: { tv: 'FX:GBPUSD', preferPrimary: true },
  USDJPY: { tv: 'FX:USDJPY', preferPrimary: true },
  AUDUSD: { tv: 'FX:AUDUSD', preferPrimary: true },
  USDCHF: { tv: 'FX:USDCHF', preferPrimary: true },
  USDCAD: { tv: 'FX:USDCAD', preferPrimary: true },
  NZDUSD: { tv: 'FX:NZDUSD', preferPrimary: true },
  USDCNY: { tv: 'FX_IDC:USDCNY', preferPrimary: true },
  DXY: { tv: 'TVC:DXY', preferPrimary: true },
  US10Y: { tv: 'TVC:US10Y', preferPrimary: true },
  US30Y: { tv: 'TVC:US30Y', preferPrimary: true },
};

const tvGlobalCache: { entry: CacheEntry<Map<string, TvGlobalQuote>> | null } = { entry: null };

async function fetchTradingViewGlobalQuotes(): Promise<Map<string, TvGlobalQuote>> {
  const now = Date.now();
  if (tvGlobalCache.entry && tvGlobalCache.entry.expiresAt > now) {
    return tvGlobalCache.entry.data;
  }
  const out = new Map<string, TvGlobalQuote>();
  try {
    const tvToId = new Map<string, { id: string; preferPrimary: boolean }>();
    const tickers: string[] = [];
    for (const [id, spec] of Object.entries(TV_GLOBAL_SYMBOL_MAP)) {
      tvToId.set(spec.tv, { id, preferPrimary: spec.preferPrimary });
      tickers.push(spec.tv);
    }

    const res = await fetch('https://scanner.tradingview.com/global/scan', {
      method: 'POST',
      headers: {
        ...UA_HEADERS,
        'Content-Type': 'application/json',
        Origin: 'https://www.tradingview.com',
        Referer: 'https://www.tradingview.com/',
      },
      body: JSON.stringify({
        symbols: { tickers },
        columns: ['name', 'close', 'change', 'change_abs', 'open', 'high', 'low'],
      }),
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return tvGlobalCache.entry?.data ?? out;
    const json = (await res.json()) as {
      data?: Array<{ s?: string; d?: Array<number | string | null> }>;
    };
    for (const row of json.data ?? []) {
      const mapping = row.s ? tvToId.get(row.s) : undefined;
      const d = row.d;
      if (!mapping || !d || d.length < 4) continue;
      const price = Number(d[1]);
      const changePct = Number(d[2]);
      const changeAbs = Number(d[3]);
      const open = Number(d[4] ?? price);
      const high = Number(d[5] ?? price);
      const low = Number(d[6] ?? price);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(changePct)) continue;
      const safeAbs = Number.isFinite(changeAbs) ? changeAbs : price - price / (1 + changePct / 100);
      const prevClose =
        Math.abs(safeAbs) > 0 && Math.abs(price - safeAbs) > 0
          ? price - safeAbs
          : price / (1 + changePct / 100);
      out.set(mapping.id, {
        price,
        changePct,
        changeAbs: safeAbs,
        prevClose,
        open: Number.isFinite(open) && open > 0 ? open : prevClose,
        high: Number.isFinite(high) && high > 0 ? high : Math.max(price, prevClose),
        low: Number.isFinite(low) && low > 0 ? low : Math.min(price, prevClose),
        preferPrimary: mapping.preferPrimary,
      });
    }
    if (out.size > 0) {
      tvGlobalCache.entry = { data: out, expiresAt: now + 2500 };
    }
  } catch {
    return tvGlobalCache.entry?.data ?? out;
  }
  return out;
}

const dailyHistoryCache = new Map<string, CacheEntry<number[]>>();

async function fetchRecentDailyCloses(yahooSymbol: string): Promise<number[]> {
  const now = Date.now();
  const cached = dailyHistoryCache.get(yahooSymbol);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yahooSymbol
      )}?range=1mo&interval=1d`,
      { headers: UA_HEADERS, signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return cached?.data ?? [];
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const closes = (json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
    );
    if (closes.length >= 2) {
      dailyHistoryCache.set(yahooSymbol, { data: closes.slice(-14), expiresAt: now + 900_000 });
      return closes.slice(-14);
    }
  } catch {
    // ignore
  }
  return cached?.data ?? [];
}

function build7dFearGreedSeries(
  assetId: string,
  dailyCloses: number[],
  livePrice: number,
  liveChangePct: number,
  w52Low: number,
  w52High: number
): number[] {
  const upper = assetId.toUpperCase();
  const isCrypto = upper.includes('BTC') || upper.includes('ETH');
  const isGoldOrOil = upper.includes('XAU') || upper.includes('WTI') || upper.includes('BRENT');
  const isFxOrYield = upper.includes('USD') || upper.includes('DXY') || upper.includes('10Y') || upper.includes('30Y');
  const volScale = isCrypto ? 3.2 : isGoldOrOil ? 1.45 : isFxOrYield ? 0.85 : 1.35;
  const span52 = Math.max(1e-6, w52High - w52Low);

  const valid = dailyCloses.filter((v) => Number.isFinite(v) && v > 0);
  const series = valid.length >= 2 ? [...valid.slice(0, -1), livePrice] : [livePrice];

  const scores: number[] = [];
  if (series.length >= 4) {
    const startIdx = Math.max(1, series.length - 7);
    for (let i = startIdx; i < series.length; i++) {
      const px = series[i];
      const prev = series[i - 1];
      const pct = i === series.length - 1 ? liveChangePct : ((px - prev) / Math.max(1e-6, prev)) * 100;
      const mom = 50 + Math.tanh(pct / volScale) * 44;
      const r52 = Math.max(2, Math.min(98, ((px - w52Low) / span52) * 100));
      const ma5Slice = series.slice(Math.max(0, i - 4), i + 1);
      const ma5 = ma5Slice.reduce((a, b) => a + b, 0) / ma5Slice.length;
      const trendBias = Math.tanh((((px - ma5) / Math.max(1e-6, ma5)) * 100) / (volScale * 1.1)) * 18;
      const val = Math.max(0, Math.min(100, Math.round(mom * 0.52 + r52 * 0.28 + (50 + trendBias) * 0.20)));
      scores.push(val);
    }
  }

  while (scores.length < 7) {
    const currentLast = scores[scores.length - 1] ?? Math.max(0, Math.min(100, Math.round(50 + Math.tanh(liveChangePct / volScale) * 40)));
    const prevAnchor = scores[0] ?? currentLast;
    scores.unshift(Math.max(5, Math.min(95, Math.round(prevAnchor + (50 - prevAnchor) * 0.12))));
  }
  return scores.slice(-7);
}

function resolveConsistentChange(
  price: number,
  rawPrevClose: number,
  reportedChangePct: unknown,
  decimals: number,
  forcePrevCloseAnchor: boolean
): { prevClose: number; changeValue: number; changePercent: number } {
  const safeRawPrev = Number.isFinite(rawPrevClose) && rawPrevClose > 0 ? rawPrevClose : price;
  const regPct = Number(reportedChangePct);

  // For 24/7 crypto anchored to 24h open, use rawPrev directly
  if (forcePrevCloseAnchor || !Number.isFinite(regPct)) {
    const changeValue = Number((price - safeRawPrev).toFixed(decimals >= 3 ? decimals : 2));
    const changePercent = Number(
      (((price - safeRawPrev) / Math.max(1e-6, safeRawPrev)) * 100).toFixed(2)
    );
    return {
      prevClose: Number(safeRawPrev.toFixed(decimals)),
      changeValue,
      changePercent,
    };
  }

  // Yahoo v8 /chart?range=1d returns stale multi-day chartPreviousClose on several Asian & cash indices.
  // Reconstruct exact session previous close from regularMarketChangePercent.
  const calcFromRawPct =
    safeRawPrev > 0 ? ((price - safeRawPrev) / safeRawPrev) * 100 : regPct;
  const effectivePrev =
    Math.abs(calcFromRawPct - regPct) > 0.03 && 1 + regPct / 100 > 0.05
      ? price / (1 + regPct / 100)
      : safeRawPrev;

  const roundedPrev = Number(effectivePrev.toFixed(decimals));
  const changePercent = Number(regPct.toFixed(2));
  const changeValue = Number((price - roundedPrev).toFixed(decimals >= 3 ? decimals : 2));
  return { prevClose: roundedPrev, changeValue, changePercent };
}

const perSymbolQuoteCache = new Map<
  string,
  { data: RawQuoteMeta; expiresAt: number; wasOpen: boolean }
>();
let inFlightQuotesPromise: Promise<{ quotes: LiveQuotePatch[]; updatedAt: string }> | null = null;

export async function fetchLiveQuotes(): Promise<{
  quotes: LiveQuotePatch[];
  updatedAt: string;
  diagnostics: ServerFeedDiagnosticsResponse;
}> {
  const now = Date.now();
  if (quotesCache.entry) {
    if (quotesCache.entry.expiresAt > now) {
      return {
        ...quotesCache.entry.data,
        diagnostics: getServerFeedDiagnostics(),
      };
    }
    // Stale-while-revalidate: serve warm cache immediately (< 1ms) up to 5m stale while refreshing quietly
    if (now - quotesCache.entry.expiresAt < 300_000) {
      if (!inFlightQuotesPromise) {
        void refreshQuotesInternal().catch(() => null);
      }
      return {
        ...quotesCache.entry.data,
        diagnostics: getServerFeedDiagnostics(),
      };
    }
  }
  if (inFlightQuotesPromise) {
    const res = await inFlightQuotesPromise;
    return { ...res, diagnostics: getServerFeedDiagnostics() };
  }
  const res = await refreshQuotesInternal();
  return { ...res, diagnostics: getServerFeedDiagnostics() };
}

async function refreshQuotesInternal(): Promise<{
  quotes: LiveQuotePatch[];
  updatedAt: string;
}> {
  if (inFlightQuotesPromise) {
    return inFlightQuotesPromise;
  }

  const now = Date.now();
  const batchStart = Date.now();
  let yahooCachedSymbolCount = 0;
  let yahooFreshSymbolCount = 0;
  inFlightQuotesPromise = (async () => {
    const nowDate = new Date(now);
    const [tvGlobalMap, id10yRaw] = await Promise.all([
      fetchTradingViewGlobalQuotes(),
      fetchId10yRaw().catch(() => null),
    ]);

    const rawResults = await Promise.all(
      YAHOO_SYMBOL_CONFIG.map(async (cfg): Promise<RawQuoteMeta | null> => {
        const sessionInfo = getServerSessionInfo(cfg.id, nowDate);
        const cached = perSymbolQuoteCache.get(cfg.id);
        if (cached && cached.expiresAt > now && cached.wasOpen === sessionInfo.isOpen) {
          return cached.data;
        }
        try {
          const cachedDaily = dailyHistoryCache.get(cfg.yahooSymbol);
          const dailyCloses = cachedDaily?.data ?? [];

          const interval = sessionInfo.isOpen ? '1m' : '15m';
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            cfg.yahooSymbol
          )}?range=1d&interval=${interval}`;
          const res = await fetch(url, {
            headers: UA_HEADERS,
            signal: AbortSignal.timeout(4500),
          });
          if (!res.ok) {
            if (cached?.data) yahooCachedSymbolCount += 1;
            return cached?.data ?? null;
          }
          const json = (await res.json()) as {
            chart?: {
              result?: Array<{
                meta?: Record<string, unknown>;
                timestamp?: number[];
                indicators?: {
                  quote?: Array<{
                    close?: Array<number | null>;
                    open?: Array<number | null>;
                  }>;
                };
              }>;
            };
          };

          const item = json.chart?.result?.[0];
          const meta = item?.meta;
          if (!meta) return cached?.data ?? null;

          let price = Number(meta.regularMarketPrice);
          let rawPrev = Number(
            meta.regularMarketPreviousClose ??
              meta.previousClose ??
              (dailyCloses.length >= 2 ? dailyCloses[dailyCloses.length - 2] : undefined) ??
              meta.chartPreviousClose ??
              price
          );
          let regPct: unknown = meta.regularMarketChangePercent;
          if (!Number.isFinite(price) || price <= 0) return cached?.data ?? null;

          let coinbaseStats: CoinbaseSpotStats | null = null;
          const isCryptoAnchor = cfg.id === 'BTCUSD' || cfg.id === 'ETHUSD';
          if (isCryptoAnchor) {
            coinbaseStats = await fetchCoinbaseSpotStats(cfg.id === 'BTCUSD' ? 'BTC-USD' : 'ETH-USD');
            if (coinbaseStats) {
              price = coinbaseStats.price;
              rawPrev = coinbaseStats.open24h;
            }
          }

          // Cross-reconcile Spot Gold, Crude, DXY, Yields, FX & Indices with TradingView real-time institutional feed
          const tvQuote = tvGlobalMap.get(cfg.id);
          if (tvQuote && !isCryptoAnchor) {
            if (tvQuote.preferPrimary) {
              price = tvQuote.price;
              rawPrev = tvQuote.prevClose;
              regPct = tvQuote.changePct;
            } else {
              // For equity indices: reconcile if Yahoo regularMarketChangePercent is missing or diverges >0.12% from TV
              const yPct = Number(regPct);
              if (!Number.isFinite(yPct) || Math.abs(yPct - tvQuote.changePct) > 0.12) {
                price = tvQuote.price;
                rawPrev = tvQuote.prevClose;
                regPct = tvQuote.changePct;
              }
            }
          }

          const { prevClose, changeValue, changePercent } = resolveConsistentChange(
            price,
            rawPrev,
            regPct,
            cfg.decimals,
            isCryptoAnchor
          );

          const rawCloses = item?.indicators?.quote?.[0]?.close ?? [];
          const rawTimestamps = item?.timestamp ?? [];
          const sameSourcePairs: { t: number; v: number }[] = [];
          for (let i = 0; i < rawCloses.length; i++) {
            const val = rawCloses[i];
            const ts = rawTimestamps[i];
            if (typeof val === 'number' && Number.isFinite(val)) {
              sameSourcePairs.push({
                t: typeof ts === 'number' ? ts * 1000 : Date.now(),
                v: Number(val.toFixed(cfg.decimals)),
              });
            }
          }
          const stats5m = recordAndComputeServer5m(
            cfg.id,
            price,
            sameSourcePairs,
            sessionInfo.isOpen,
            Date.now()
          );

          let validPairs = sameSourcePairs;
          if (validPairs.length === 0) {
            validPairs = [
              { t: Date.now() - 3600_000, v: prevClose },
              { t: Date.now(), v: price },
            ];
          } else {
            // Re-anchor chart series smoothly if TV/Coinbase price differs by futures-spot basis
            const lastRaw = validPairs[validPairs.length - 1].v;
            const ratio = lastRaw > 0 ? price / lastRaw : 1;
            if (Math.abs(ratio - 1) > 0.0004 && Math.abs(ratio - 1) < 0.05) {
              validPairs = validPairs.map((p) => ({
                t: p.t,
                v: Number((p.v * ratio).toFixed(cfg.decimals)),
              }));
            }
            validPairs[validPairs.length - 1] = {
              t: validPairs[validPairs.length - 1].t,
              v: Number(price.toFixed(cfg.decimals)),
            };
          }

          const closes = validPairs.map((p) => p.v);
          const timestamps = validPairs.map((p) => p.t);

          const rawOpens = item?.indicators?.quote?.[0]?.open ?? [];
          const regOpen = Number(meta.regularMarketOpen);
          const barOpen = rawOpens.find((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);

          const rawDayHigh = Number(
            coinbaseStats?.high24h ??
              (tvQuote?.preferPrimary ? tvQuote.high : undefined) ??
              meta.regularMarketDayHigh ??
              Math.max(...closes)
          );
          const rawDayLow = Number(
            coinbaseStats?.low24h ??
              (tvQuote?.preferPrimary ? tvQuote.low : undefined) ??
              meta.regularMarketDayLow ??
              Math.min(...closes)
          );
          const baseHigh = Number.isFinite(rawDayHigh) && rawDayHigh > 0 ? rawDayHigh : Math.max(price, prevClose);
          const baseLow = Number.isFinite(rawDayLow) && rawDayLow > 0 ? rawDayLow : Math.min(price, prevClose);

          let firstOpen =
            coinbaseStats
              ? coinbaseStats.open24h
              : tvQuote?.preferPrimary && tvQuote.open > 0
                ? tvQuote.open
                : Number.isFinite(regOpen) && regOpen > 0
                  ? regOpen
                  : typeof barOpen === 'number' &&
                      barOpen >= Math.min(baseLow, prevClose) * 0.985 &&
                      barOpen <= Math.max(baseHigh, prevClose) * 1.015
                    ? barOpen
                    : prevClose;
          firstOpen = Math.max(Math.min(baseLow, prevClose), Math.min(Math.max(baseHigh, prevClose), firstOpen));

          const dayHighNum = Math.max(price, baseHigh, firstOpen);
          const dayLowNum = Math.min(price, baseLow, firstOpen);

          const w52LowRaw = Number(meta.fiftyTwoWeekLow ?? dayLowNum);
          const w52HighRaw = Number(meta.fiftyTwoWeekHigh ?? dayHighNum);
          const w52LowNum = Number.isFinite(w52LowRaw) && w52LowRaw > 0 ? Math.min(w52LowRaw, dayLowNum) : dayLowNum;
          const w52HighNum = Number.isFinite(w52HighRaw) && w52HighRaw > w52LowNum ? Math.max(w52HighRaw, dayHighNum) : Math.max(dayHighNum, price);
          const w52Span = w52HighNum - w52LowNum || 1;
          const w52Pct = Math.max(
            2,
            Math.min(98, Math.round(((price - w52LowNum) / w52Span) * 100))
          );

          const rawVol = Number(meta.regularMarketVolume);
          const vol = coinbaseStats?.volumeUsd && coinbaseStats.volumeUsd > 0 ? coinbaseStats.volumeUsd : rawVol;
          const updatedAtEpoch =
            isCryptoAnchor && coinbaseStats
              ? Date.now()
              : tvQuote?.preferPrimary
                ? Date.now()
                : Number(meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000;
          const exchangeName =
            isCryptoAnchor && coinbaseStats
              ? 'Coinbase Spot USD'
              : String(meta.fullExchangeName || meta.exchangeName || 'Global Market');

          const fearGreed7d = build7dFearGreedSeries(
            cfg.id,
            dailyCloses,
            price,
            changePercent,
            w52LowNum,
            w52HighNum
          );

          const rawMeta: RawQuoteMeta = {
            cfg,
            price: Number(price.toFixed(cfg.decimals)),
            prevClose: Number(prevClose.toFixed(cfg.decimals)),
            changeValue,
            changePercent,
            firstOpen,
            dayHighNum,
            dayLowNum,
            w52LowNum,
            w52HighNum,
            w52Pct,
            vol,
            closes,
            timestamps,
            updatedAtEpoch,
            exchangeName,
            fearGreed7d,
            move5mPct: stats5m.move5mPct,
            vol5mRangePct: stats5m.vol5mRangePct,
            move5mSource: stats5m.move5mSource,
          };

          perSymbolQuoteCache.set(cfg.id, {
            data: rawMeta,
            expiresAt: Date.now() + (sessionInfo.isOpen ? 1200 : 600_000),
            wasOpen: sessionInfo.isOpen,
          });
          yahooFreshSymbolCount += 1;
          return rawMeta;
        } catch {
          if (cached?.data) yahooCachedSymbolCount += 1;
          return cached?.data ?? null;
        }
      })
    );

  const validRaw = rawResults.filter((r): r is RawQuoteMeta => r !== null);
  const byId = new Map(validRaw.map((r) => [r.cfg.id, r]));

  const wtiPrice = byId.get('WTI')?.price;
  const brentPrice = byId.get('BRENT')?.price;
  const us10yPrice = byId.get('US10Y')?.price;
  const us30yPrice = byId.get('US30Y')?.price;

  const quotes: LiveQuotePatch[] = validRaw.map((r) => {
    const { cfg, price, prevClose, changeValue, changePercent, firstOpen, dayHighNum, dayLowNum, w52LowNum, w52HighNum, w52Pct, vol, closes, timestamps, updatedAtEpoch, fearGreed7d } = r;
    const prefix = cfg.currencyPrefix ?? '';
    const suffix = cfg.unitSuffix ?? '';

    const open = formatStatNumber(firstOpen, cfg.decimals, prefix, suffix);
    const dayHigh = formatStatNumber(dayHighNum, cfg.decimals, prefix, suffix);
    const dayLow = formatStatNumber(dayLowNum, cfg.decimals, prefix, suffix);
    const w52Low = formatStatNumber(w52LowNum, cfg.decimals, prefix, suffix);
    const w52High = formatStatNumber(w52HighNum, cfg.decimals, prefix, suffix);
    const priceLabel = formatStatNumber(price, cfg.decimals, prefix, suffix);

    // Live Pivot / Session Technicals
    const intradaySpan = Math.max(0, dayHighNum - dayLowNum);
    const pivot = (dayHighNum + dayLowNum + price) / 3;
    const calcSupport = 2 * pivot - dayHighNum;
    const calcResistance = 2 * pivot - dayLowNum;
    const supportNum =
      intradaySpan > 0
        ? Math.min(calcSupport, dayLowNum, price * 0.996)
        : price * 0.992;
    const resistanceNum =
      intradaySpan > 0
        ? Math.max(calcResistance, dayHighNum, price * 1.004)
        : price * 1.008;

    const support = formatStatNumber(supportNum, cfg.decimals, prefix, suffix);
    const resistance = formatStatNumber(resistanceNum, cfg.decimals, prefix, suffix);

    const signalTier = computeServerSignalTier({
      assetId: cfg.id,
      changePercent,
      price,
      open: firstOpen,
      prevClose,
      dayHigh: dayHighNum,
      dayLow: dayLowNum,
      series: closes,
      w52Pct,
    });
    const sentiment: 'Bullish' | 'Bearish' | 'Neutral' =
      signalTier === 'Strong Bull' || signalTier === 'Bull Signal'
        ? 'Bullish'
        : signalTier === 'Strong Bear' || signalTier === 'Bear Signal'
          ? 'Bearish'
          : 'Neutral';

    const supportNote =
      w52Pct <= 25
        ? `Session S1 · Near 52W Floor (${w52Low})`
        : 'Session Pivot S1 & Intraday Floor';
    const resistanceNote =
      w52Pct >= 85
        ? `Session R1 · Near 52W Peak (${w52High})`
        : 'Session Pivot R1 & Intraday Cap';

    const gapPct = prevClose > 0 ? ((firstOpen - prevClose) / prevClose) * 100 : 0;
    const ibsRatio =
      dayHighNum > dayLowNum ? (price - dayLowNum) / (dayHighNum - dayLowNum) : 0.5;
    const ibsPct = Math.round(ibsRatio * 100);
    const fgNow = fearGreed7d[fearGreed7d.length - 1] ?? 50;
    const fgZone =
      fgNow >= 75 ? 'Extreme Greed' : fgNow >= 55 ? 'Greed' : fgNow <= 24 ? 'Extreme Fear' : fgNow <= 44 ? 'Fear' : 'Neutral';

    const structureThesis =
      firstOpen > 0 && price >= firstOpen
        ? `Holding above opening drive (${open}) with ${ibsPct}% IBS confirms buyer absorption; defending ${support} keeps an upside rotation toward ${resistance} intact.`
        : firstOpen > 0
          ? `Fading below opening print (${open}) at ${ibsPct}% IBS highlights supply control; reclaiming ${open} is needed to neutralize downside pressure toward ${support}.`
          : `Trading inside ${dayLow}–${dayHigh} (${ibsPct}% IBS) between S1 ${support} and R1 ${resistance}.`;

    let crossAssetThesis = '';
    if (cfg.id === 'BTCUSD' || cfg.id === 'ETHUSD') {
      crossAssetThesis = ` 24h Coinbase Spot regime reads ${signalTier} (F&G ${fgNow} · ${fgZone}), tracking NASDAQ liquidity beta.`;
    } else if (cfg.id === 'XAUUSD') {
      crossAssetThesis = ` Spot Gold (XAU/USD) reflects real-rate & DXY sensitivity with ${fgZone} sentiment (${fgNow}/100).`;
    } else if (cfg.id === 'WTI' && brentPrice) {
      crossAssetThesis = ` WTI–Brent differential sits at $${Math.abs(price - brentPrice).toFixed(2)}/bbl ${
        price < brentPrice ? 'discount' : 'premium'
      } vs Brent ($${brentPrice.toFixed(2)}).`;
    } else if (cfg.id === 'BRENT' && wtiPrice) {
      crossAssetThesis = ` Brent–WTI spread trades at +$${(price - wtiPrice).toFixed(2)}/bbl over WTI ($${wtiPrice.toFixed(2)}).`;
    } else if ((cfg.id === 'US10Y' || cfg.id === 'US30Y') && us10yPrice && us30yPrice) {
      const bps = ((us30yPrice - us10yPrice) * 100).toFixed(1);
      crossAssetThesis = ` US 10s30s curve slope prints ${Number(bps) >= 0 ? '+' : ''}${bps} bps, driving equity duration multiples.`;
    } else if (cfg.id === 'IHSG' || cfg.id === 'EIDO') {
      crossAssetThesis = ` Jakarta benchmark sentiment reads ${fgZone} (${fgNow}/100), gated by foreign banking flow and USD/IDR stability.`;
    }

    const signStr = changePercent >= 0 ? '+' : '';
    const gapTag =
      Math.abs(gapPct) >= 0.12
        ? ` (open gap ${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(2)}%)`
        : '';

    const commentary = `${cfg.name} prints ${priceLabel} (${signStr}${changePercent.toFixed(
      2
    )}%${gapTag}, ${signalTier}, F&G ${fgNow}/100 ${fgZone}). ${structureThesis}${crossAssetThesis}`;

    let peLabel = '';
    let peValue = '';
    let capLabel = '';
    let capValue = '';

    if (cfg.id === 'WTI' && brentPrice) {
      capLabel = 'Spread vs Brent';
      capValue = `${price - brentPrice >= 0 ? '+' : '-'}$${Math.abs(price - brentPrice).toFixed(2)}/bbl`;
    } else if (cfg.id === 'BRENT' && wtiPrice) {
      capLabel = 'Spread vs WTI';
      capValue = `${price - wtiPrice >= 0 ? '+' : '-'}$${Math.abs(price - wtiPrice).toFixed(2)}/bbl`;
    } else if ((cfg.id === 'US10Y' || cfg.id === 'US30Y') && us10yPrice && us30yPrice) {
      const bps = (us30yPrice - us10yPrice) * 100;
      capLabel = '10Y–30Y Spread';
      capValue = `${bps >= 0 ? '+' : ''}${bps.toFixed(1)} bps`;
    }

    const sessionInfo = getServerSessionInfo(cfg.id, nowDate);
    return {
      id: cfg.id,
      price,
      prevClose,
      changeValue,
      changePercent,
      open,
      dayHigh,
      dayLow,
      volume: formatVolume(vol, cfg.id === 'BTCUSD' || cfg.id === 'ETHUSD' ? '$' : ''),
      avgVol: '',
      avgVolLabel: '',
      peLabel,
      peValue,
      capLabel,
      capValue,
      w52Low,
      w52High,
      w52Pct,
      sentiment,
      support,
      supportNote,
      resistance,
      resistanceNote,
      commentary,
      sparklinePoints: samplePoints(closes, 16),
      chart1D: closes,
      timestamps1D: timestamps,
      updatedAtEpoch,
      marketSessionOpen: sessionInfo.isOpen,
      sessionStateLabel: sessionInfo.stateLabel,
      sessionProgressRatio: sessionInfo.progressRatio,
      fearGreed7d,
      move5mPct: r.move5mPct,
      vol5mRangePct: r.vol5mRangePct,
      move5mSource: r.move5mSource,
    };
  });

  if (id10yRaw) {
    const {
      price,
      prevClose,
      changeValue,
      changePercent,
      openNum,
      dayHighNum,
      dayLowNum,
      w52LowNum,
      w52HighNum,
      perf1M,
      coupon,
      maturity,
      bondLastPrice,
      updatedAtEpoch,
    } = id10yRaw;

    const w52Span = w52HighNum - w52LowNum || 1;
    const w52Pct = Math.max(2, Math.min(98, Math.round(((price - w52LowNum) / w52Span) * 100)));
    const w52Low = formatStatNumber(w52LowNum, 3, '', '%');
    const w52High = formatStatNumber(w52HighNum, 3, '', '%');
    const open = formatStatNumber(openNum, 3, '', '%');
    const dayHigh = formatStatNumber(dayHighNum, 3, '', '%');
    const dayLow = formatStatNumber(dayLowNum, 3, '', '%');

    const span = Math.max(0, dayHighNum - dayLowNum);
    const pivot = (dayHighNum + dayLowNum + price) / 3;
    const supportNum = span > 0 ? Math.min(2 * pivot - dayHighNum, dayLowNum, price - 0.025) : price - 0.045;
    const resistanceNum = span > 0 ? Math.max(2 * pivot - dayLowNum, dayHighNum, price + 0.025) : price + 0.045;
    const support = formatStatNumber(supportNum, 3, '', '%');
    const resistance = formatStatNumber(resistanceNum, 3, '', '%');

    const sentiment: 'Bullish' | 'Bearish' | 'Neutral' =
      changePercent >= 0.35 || (changePercent >= 0.05 && w52Pct >= 62)
        ? 'Bullish'
        : changePercent <= -0.35 || (changePercent <= -0.05 && w52Pct <= 38)
          ? 'Bearish'
          : 'Neutral';

    const spreadBps = us10yPrice ? (price - us10yPrice) * 100 : null;
    const spreadStr =
      spreadBps !== null ? `${spreadBps >= 0 ? '+' : ''}${spreadBps.toFixed(1)} bps` : '+250.0 bps';
    const spreadNote =
      spreadBps !== null && us10yPrice
        ? ` The sovereign spread over US 10Y (${us10yPrice.toFixed(3)}%) stands at ${spreadStr}.`
        : '';

    const mod100 = w52Pct % 100;
    const mod10 = w52Pct % 10;
    const ord =
      mod100 >= 11 && mod100 <= 13
        ? `${w52Pct}th`
        : mod10 === 1
          ? `${w52Pct}st`
          : mod10 === 2
            ? `${w52Pct}nd`
            : mod10 === 3
              ? `${w52Pct}rd`
              : `${w52Pct}th`;

    const dirWord =
      changePercent > 0.15 ? 'rising' : changePercent < -0.15 ? 'easing' : 'holding steady';
    const signStr = changePercent >= 0 ? '+' : '';
    const commentary = `Indonesia 10-Year Government Bond (SBN) yield is ${dirWord} at ${price.toFixed(
      3
    )}% (${signStr}${changePercent.toFixed(2)}% session, ${perf1M >= 0 ? '+' : ''}${perf1M.toFixed(
      1
    )}% over 1M), positioned at the ${ord} percentile of its 52-week range (${w52Low} – ${w52High}) with clean bond price near ${bondLastPrice}. Support sits at ${support} and resistance at ${resistance}.${spreadNote}`;

    // Honest close-point trajectory (no fabricated sine-wave wicks for sovereign yields lacking intraday OHLC)
    const intradayPoints = [
      Number(prevClose.toFixed(3)),
      Number(price.toFixed(3)),
    ];
    const intradayTimestamps = [now - 3600_000, now];

    const id10ySession = getServerSessionInfo('ID10Y', nowDate);
    const id10y5m = recordAndComputeServer5m(
      'ID10Y',
      price,
      intradayPoints.map((v, idx) => ({ t: intradayTimestamps[idx], v })),
      id10ySession.isOpen,
      now
    );
    const id10yFg7d = build7dFearGreedSeries(
      'ID10Y',
      intradayPoints,
      price,
      changePercent,
      w52LowNum,
      w52HighNum
    );
    quotes.push({
      id: 'ID10Y',
      price,
      prevClose,
      changeValue,
      changePercent,
      open,
      dayHigh,
      dayLow,
      volume: `Bond Px ${bondLastPrice}`,
      avgVol: maturity,
      avgVolLabel: 'Maturity',
      peLabel: 'Coupon',
      peValue: coupon,
      capLabel: 'ID–US 10Y Spread',
      capValue: spreadStr,
      w52Low,
      w52High,
      w52Pct,
      sentiment,
      support,
      supportNote: w52Pct <= 25 ? `Pivot S1 · Near 52W Floor (${w52Low})` : 'Session Pivot S1 & SBN Demand',
      resistance,
      resistanceNote: w52Pct >= 85 ? `Pivot R1 · Near 52W Peak (${w52High})` : 'Session Pivot R1 & Supply Cap',
      commentary,
      sparklinePoints: samplePoints(intradayPoints, 16),
      chart1D: intradayPoints,
      timestamps1D: intradayTimestamps,
      updatedAtEpoch,
      marketSessionOpen: id10ySession.isOpen,
      sessionStateLabel: id10ySession.stateLabel,
      sessionProgressRatio: id10ySession.progressRatio,
      fearGreed7d: id10yFg7d,
      move5mPct: id10y5m.move5mPct,
      vol5mRangePct: id10y5m.vol5mRangePct,
      move5mSource: id10y5m.move5mSource,
    });
  }

    const payload = { quotes, updatedAt: new Date().toISOString() };
    const anyOpen = quotes.some((q) => q.marketSessionOpen);
    const isComplete = quotes.length >= YAHOO_SYMBOL_CONFIG.length;
    const batchLatency = Date.now() - batchStart;
    if (quotes.length > 0) {
      const ttlMs = !isComplete ? 3500 : anyOpen ? 1200 : 120_000;
      quotesCache.entry = { data: payload, expiresAt: Date.now() + ttlMs };
    }

    if (quotes.length === 0 || yahooCachedSymbolCount > 3) {
      updateProviderMetric('yahoo_macro', {
        status: 'cached',
        activeSource:
          quotes.length > 0
            ? `Cached Quotes (${yahooCachedSymbolCount} stale symbols)`
            : 'Offline / Cached Snapshot',
        latencyMs: batchLatency,
        lastSuccessAt: quotes.length > 0 ? Date.now() : undefined,
        isCachedFallback: true,
        fallbackReason: `${yahooCachedSymbolCount} ticker(s) fell back to cached quotes`,
      });
    } else if (tvGlobalMap.size === 0 && quotes.length < YAHOO_SYMBOL_CONFIG.length - 3) {
      updateProviderMetric('yahoo_macro', {
        status: 'failover',
        activeSource: 'Yahoo Finance v8 (Degraded)',
        latencyMs: batchLatency,
        lastSuccessAt: Date.now(),
        isCachedFallback: false,
        fallbackReason: 'TradingView scanner down and partial Yahoo quote response',
      });
    } else if (yahooFreshSymbolCount > 0 || quotes.length > 0) {
      updateProviderMetric('yahoo_macro', {
        status: 'live',
        activeSource:
          tvGlobalMap.size > 0
            ? 'Yahoo Finance v8 + TV Global'
            : 'Yahoo Finance v8 Live',
        latencyMs: yahooFreshSymbolCount > 0 ? batchLatency : undefined,
        lastSuccessAt: Date.now(),
        isCachedFallback: false,
        fallbackReason: undefined,
      });
    }

    // Softly warm missing 1mo daily Fear & Greed history in small batches AFTER primary quotes settle
    const coldDaily = YAHOO_SYMBOL_CONFIG.filter((c) => {
      const d = dailyHistoryCache.get(c.yahooSymbol);
      return !d || d.expiresAt <= Date.now();
    });
    if (coldDaily.length > 0) {
      setTimeout(() => {
        void Promise.allSettled(coldDaily.slice(0, 6).map((c) => fetchRecentDailyCloses(c.yahooSymbol)));
      }, 250);
    }

    return payload;
  })();

  try {
    return await inFlightQuotesPromise;
  } finally {
    inFlightQuotesPromise = null;
  }
}

const inFlightChartRequests = new Map<string, Promise<LiveChartResponse | null>>();

async function fetchYahooChartJson(
  yahooSymbol: string,
  range: string,
  interval: string,
  timeoutMs = 7000
): Promise<{
  chart?: {
    result?: Array<{
      meta?: Record<string, unknown>;
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
} | null> {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
        yahooSymbol
      )}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
      const res = await fetch(url, {
        headers: UA_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        chart?: {
          result?: Array<{
            meta?: Record<string, unknown>;
            timestamp?: number[];
            indicators?: {
              quote?: Array<{
                open?: Array<number | null>;
                high?: Array<number | null>;
                low?: Array<number | null>;
                close?: Array<number | null>;
                volume?: Array<number | null>;
              }>;
            };
          }>;
        };
      };
      if (json?.chart?.result?.[0]) {
        return json;
      }
    } catch {
      // Try mirror host on network/timeout error
    }
  }
  return null;
}

export async function fetchLiveChart(
  id: string,
  timeframe: string
): Promise<LiveChartResponse | null> {
  const key = `${id}:${timeframe}`;
  const now = Date.now();
  const cached = chartCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const existingInFlight = inFlightChartRequests.get(key);
  if (existingInFlight) {
    return existingInFlight;
  }

  const task = (async (): Promise<LiveChartResponse | null> => {
    try {
      if (id === 'ID10Y') {
        const raw = await fetchId10yRaw().catch(() => null);
        if (!raw) return cached?.data ?? null;

        const perfMap: Record<string, { pct: number; spanMs: number }> = {
          '1D': { pct: raw.changePercent, spanMs: 8 * 3600_000 },
          '1W': { pct: raw.perfW, spanMs: 7 * 86400_000 },
          '1M': { pct: raw.perf1M, spanMs: 30 * 86400_000 },
          '3M': { pct: raw.perf3M, spanMs: 90 * 86400_000 },
          YTD: { pct: raw.perfYTD, spanMs: 180 * 86400_000 },
          '1Y': { pct: raw.perfY, spanMs: 365 * 86400_000 },
          ALL: { pct: raw.perfY * 1.15, spanMs: 5 * 365 * 86400_000 },
        };
        const cfg = perfMap[timeframe] ?? perfMap['1D'];
        const startVal = Number((raw.price / (1 + cfg.pct / 100)).toFixed(3));
        const safeStart = Math.max(
          raw.w52LowNum * 0.92,
          Math.min(raw.w52HighNum * 1.05, startVal)
        );
        // Honest 2-point start->current close trajectory without fabricated synthetic candles or waves
        const points = [Number(safeStart.toFixed(3)), Number(raw.price.toFixed(3))];
        const timestamps = [now - cfg.spanMs, now];
        const payload: LiveChartResponse = {
          id: 'ID10Y',
          timeframe,
          points,
          timestamps,
          candles: undefined,
          prevClose: safeStart,
        };
        chartCache.set(key, { data: payload, expiresAt: now + 180_000 });
        return payload;
      }

      const cfg = YAHOO_SYMBOL_CONFIG.find((c) => c.id === id);
      if (!cfg) return null;

      const rangeMap: Record<
        string,
        { range: string; interval: string; sliceTail?: number; aggregateEvery?: number }
      > = {
        '1m': { range: '1d', interval: '1m', sliceTail: 36 },
        '5m': { range: '1d', interval: '5m', sliceTail: 36 },
        '15m': { range: '5d', interval: '15m', sliceTail: 40 },
        '15M': { range: '5d', interval: '15m', sliceTail: 40 },
        '30m': { range: '5d', interval: '30m', sliceTail: 42 },
        '1h': { range: '1mo', interval: '60m', sliceTail: 42 },
        '1H': { range: '1mo', interval: '60m', sliceTail: 42 },
        '4h': { range: '1mo', interval: '60m', aggregateEvery: 4, sliceTail: 38 },
        '4H': { range: '1mo', interval: '60m', aggregateEvery: 4, sliceTail: 38 },
        '1D': { range: '1d', interval: '15m' },
        '1W': { range: '5d', interval: '1h' },
        '1M': { range: '1mo', interval: '1d' },
        '3M': { range: '3mo', interval: '1d' },
        YTD: { range: 'ytd', interval: '1d' },
        '1Y': { range: '1y', interval: '1wk' },
        ALL: { range: '5y', interval: '1mo' },
      };
      const params = rangeMap[timeframe] ?? rangeMap['1D'];

      const json = await fetchYahooChartJson(
        cfg.yahooSymbol,
        params.range,
        params.interval,
        7000
      );

      if (!json) {
        if (cached?.data) {
          return cached.data;
        }
        const quoteCached = perSymbolQuoteCache.get(id)?.data;
        if (timeframe === '1D' && quoteCached && quoteCached.closes.length >= 2) {
          return {
            id,
            timeframe,
            points: quoteCached.closes,
            timestamps: quoteCached.timestamps,
            prevClose: quoteCached.prevClose,
          };
        }
        return null;
      }

      const item = json.chart?.result?.[0];
      const quoteObj = item?.indicators?.quote?.[0];
      const rawCloses = quoteObj?.close ?? [];
      const rawOpens = quoteObj?.open ?? [];
      const rawHighs = quoteObj?.high ?? [];
      const rawLows = quoteObj?.low ?? [];
      const rawVolumes = quoteObj?.volume ?? [];
      const rawTimestamps = item?.timestamp ?? [];
      let points: number[] = [];
      let timestamps: number[] = [];
      let candles: CandlePoint[] = [];

      for (let i = 0; i < rawCloses.length; i++) {
        const val = rawCloses[i];
        const ts = rawTimestamps[i];
        if (typeof val === 'number' && Number.isFinite(val)) {
          const c = Number(val.toFixed(cfg.decimals));
          const tsMs = typeof ts === 'number' ? ts * 1000 : Date.now();
          const prevC = points.length > 0 ? points[points.length - 1] : c;
          const rawO = rawOpens[i];
          const o = typeof rawO === 'number' && Number.isFinite(rawO) ? Number(rawO.toFixed(cfg.decimals)) : prevC;
          const rawH = rawHighs[i];
          const rawL = rawLows[i];
          const rawV = rawVolumes[i];
          const v = typeof rawV === 'number' && Number.isFinite(rawV) && rawV > 0 ? rawV : undefined;
          const h = typeof rawH === 'number' && Number.isFinite(rawH)
            ? Number(Math.max(rawH, o, c).toFixed(cfg.decimals))
            : Number(Math.max(o, c).toFixed(cfg.decimals));
          const l = typeof rawL === 'number' && Number.isFinite(rawL)
            ? Number(Math.min(rawL, o, c).toFixed(cfg.decimals))
            : Number(Math.min(o, c).toFixed(cfg.decimals));

          points.push(c);
          timestamps.push(tsMs);
          candles.push(v !== undefined ? { t: tsMs, o, h, l, c, v } : { t: tsMs, o, h, l, c });
        }
      }

      if (points.length === 0) {
        return cached?.data ?? null;
      }

      if (params.aggregateEvery && params.aggregateEvery > 1 && candles.length >= params.aggregateEvery) {
        const aggCandles: CandlePoint[] = [];
        const step = params.aggregateEvery;
        for (let i = 0; i < candles.length; i += step) {
          const chunk = candles.slice(i, i + step);
          if (chunk.length === 0) continue;
          const volSum = chunk.reduce((acc, x) => acc + (typeof x.v === 'number' ? x.v : 0), 0);
          aggCandles.push({
            t: chunk[chunk.length - 1].t,
            o: Number(chunk[0].o.toFixed(cfg.decimals)),
            h: Number(Math.max(...chunk.map((x) => x.h)).toFixed(cfg.decimals)),
            l: Number(Math.min(...chunk.map((x) => x.l)).toFixed(cfg.decimals)),
            c: Number(chunk[chunk.length - 1].c.toFixed(cfg.decimals)),
            ...(volSum > 0 ? { v: volSum } : {}),
          });
        }
        candles = aggCandles;
        points = aggCandles.map((b) => b.c);
        timestamps = aggCandles.map((b) => b.t);
      }

      const finalPoints =
        params.sliceTail && points.length > params.sliceTail
          ? points.slice(-params.sliceTail)
          : points;
      const finalTimestamps =
        params.sliceTail && timestamps.length > params.sliceTail
          ? timestamps.slice(-params.sliceTail)
          : timestamps;
      const finalCandles =
        params.sliceTail && candles.length > params.sliceTail
          ? candles.slice(-params.sliceTail)
          : candles;

      const prevClose = Number(
        item?.meta?.chartPreviousClose ?? item?.meta?.previousClose ?? finalPoints[0]
      );

      const payload: LiveChartResponse = {
        id,
        timeframe,
        points: finalPoints,
        timestamps: finalTimestamps,
        candles: finalCandles,
        prevClose: Number.isFinite(prevClose) ? Number(prevClose.toFixed(cfg.decimals)) : finalPoints[0],
      };

      const chartTtl = params.sliceTail ? 15_000 : 180_000;
      chartCache.set(key, { data: payload, expiresAt: now + chartTtl });
      return payload;
    } catch {
      return cached?.data ?? null;
    } finally {
      inFlightChartRequests.delete(key);
    }
  })();

  inFlightChartRequests.set(key, task);
  return task;
}

export async function fetchLiveFxRates(): Promise<LiveFxResponse> {
  const now = Date.now();
  if (fxCache.entry) {
    if (fxCache.entry.expiresAt > now) {
      return fxCache.entry.data;
    }
    if (now - fxCache.entry.expiresAt < 900_000) {
      void fetchFxRatesFresh().catch(() => null);
      return fxCache.entry.data;
    }
  }
  return fetchFxRatesFresh();
}

async function fetchFxRatesFresh(): Promise<LiveFxResponse> {
  const now = Date.now();
  const fxStart = Date.now();
  return coalesceInFlight('fx-rates', fxCache.entry?.data, async () => {

  const [erRes, quotesRes] = await Promise.all([
    fetch('https://open.er-api.com/v6/latest/USD', {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetchLiveQuotes(),
  ]);

  const erRates = (erRes as { rates?: Record<string, number>; time_last_update_utc?: string } | null)
    ?.rates;

  const usdIdrQuote = quotesRes.quotes.find((q) => q.id === 'USDIDR');
  const eurUsdQuote = quotesRes.quotes.find((q) => q.id === 'EURUSD');
  const gbpUsdQuote = quotesRes.quotes.find((q) => q.id === 'GBPUSD');
  const usdJpyQuote = quotesRes.quotes.find((q) => q.id === 'USDJPY');
  const audUsdQuote = quotesRes.quotes.find((q) => q.id === 'AUDUSD');
  const usdChfQuote = quotesRes.quotes.find((q) => q.id === 'USDCHF');
  const usdCadQuote = quotesRes.quotes.find((q) => q.id === 'USDCAD');
  const nzdUsdQuote = quotesRes.quotes.find((q) => q.id === 'NZDUSD');
  const usdCnyQuote = quotesRes.quotes.find((q) => q.id === 'USDCNY');

  const idrRate = usdIdrQuote?.price || erRates?.IDR || 16000;
  const eurPerUsd = eurUsdQuote?.price ? 1 / eurUsdQuote.price : erRates?.EUR || 0.91;
  const gbpPerUsd = gbpUsdQuote?.price ? 1 / gbpUsdQuote.price : erRates?.GBP || 0.78;
  const jpyPerUsd = usdJpyQuote?.price || erRates?.JPY || 152;
  const chfPerUsd = usdChfQuote?.price || erRates?.CHF || 0.88;
  const cadPerUsd = usdCadQuote?.price || erRates?.CAD || 1.39;
  const audPerUsd = audUsdQuote?.price ? 1 / audUsdQuote.price : erRates?.AUD || 1.52;
  const nzdPerUsd = nzdUsdQuote?.price ? 1 / nzdUsdQuote.price : erRates?.NZD || 1.69;
  const cnyPerUsd = usdCnyQuote?.price || erRates?.CNY || 7.23;
  const sgdPerUsd = erRates?.SGD || 1.33;

  const rates: Record<string, number> = {
    USD: 1,
    EUR: Number(eurPerUsd.toFixed(6)),
    GBP: Number(gbpPerUsd.toFixed(6)),
    JPY: Number(jpyPerUsd.toFixed(4)),
    CHF: Number(chfPerUsd.toFixed(6)),
    CAD: Number(cadPerUsd.toFixed(6)),
    AUD: Number(audPerUsd.toFixed(6)),
    NZD: Number(nzdPerUsd.toFixed(6)),
    CNY: Number(cnyPerUsd.toFixed(6)),
    SGD: Number(sgdPerUsd.toFixed(6)),
    IDR: Number(idrRate.toFixed(2)),
  };

  const formatTileRate = (val: number, decimals: number) =>
    val.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  const eurUsdVal = eurUsdQuote?.price ?? 1 / rates.EUR;
  const gbpUsdVal = gbpUsdQuote?.price ?? 1 / rates.GBP;
  const audUsdVal = audUsdQuote?.price ?? 1 / rates.AUD;
  const nzdUsdVal = nzdUsdQuote?.price ?? 1 / rates.NZD;
  const sgdIdrVal = rates.IDR / rates.SGD;

  const pairTiles = [
    {
      pair: 'USD / IDR',
      base: 'USD',
      quote: 'IDR',
      rate: formatTileRate(rates.IDR, 0),
      changePercent: usdIdrQuote?.changePercent ?? 0,
      high: usdIdrQuote?.dayHigh ?? formatTileRate(rates.IDR * 1.003, 0),
      low: usdIdrQuote?.dayLow ?? formatTileRate(rates.IDR * 0.997, 0),
    },
    {
      pair: 'EUR / USD',
      base: 'EUR',
      quote: 'USD',
      rate: formatTileRate(eurUsdVal, 4),
      changePercent: eurUsdQuote?.changePercent ?? 0,
      high: eurUsdQuote?.dayHigh ?? formatTileRate(eurUsdVal * 1.004, 4),
      low: eurUsdQuote?.dayLow ?? formatTileRate(eurUsdVal * 0.996, 4),
    },
    {
      pair: 'GBP / USD',
      base: 'GBP',
      quote: 'USD',
      rate: formatTileRate(gbpUsdVal, 4),
      changePercent: gbpUsdQuote?.changePercent ?? 0,
      high: gbpUsdQuote?.dayHigh ?? formatTileRate(gbpUsdVal * 1.004, 4),
      low: gbpUsdQuote?.dayLow ?? formatTileRate(gbpUsdVal * 0.996, 4),
    },
    {
      pair: 'USD / JPY',
      base: 'USD',
      quote: 'JPY',
      rate: formatTileRate(rates.JPY, 2),
      changePercent: usdJpyQuote?.changePercent ?? 0,
      high: usdJpyQuote?.dayHigh ?? formatTileRate(rates.JPY * 1.005, 2),
      low: usdJpyQuote?.dayLow ?? formatTileRate(rates.JPY * 0.995, 2),
    },
    {
      pair: 'USD / CHF',
      base: 'USD',
      quote: 'CHF',
      rate: formatTileRate(rates.CHF, 4),
      changePercent: usdChfQuote?.changePercent ?? 0,
      high: usdChfQuote?.dayHigh ?? formatTileRate(rates.CHF * 1.004, 4),
      low: usdChfQuote?.dayLow ?? formatTileRate(rates.CHF * 0.996, 4),
    },
    {
      pair: 'USD / CAD',
      base: 'USD',
      quote: 'CAD',
      rate: formatTileRate(rates.CAD, 4),
      changePercent: usdCadQuote?.changePercent ?? 0,
      high: usdCadQuote?.dayHigh ?? formatTileRate(rates.CAD * 1.004, 4),
      low: usdCadQuote?.dayLow ?? formatTileRate(rates.CAD * 0.996, 4),
    },
    {
      pair: 'AUD / USD',
      base: 'AUD',
      quote: 'USD',
      rate: formatTileRate(audUsdVal, 4),
      changePercent: audUsdQuote?.changePercent ?? 0,
      high: audUsdQuote?.dayHigh ?? formatTileRate(audUsdVal * 1.004, 4),
      low: audUsdQuote?.dayLow ?? formatTileRate(audUsdVal * 0.996, 4),
    },
    {
      pair: 'NZD / USD',
      base: 'NZD',
      quote: 'USD',
      rate: formatTileRate(nzdUsdVal, 4),
      changePercent: nzdUsdQuote?.changePercent ?? 0,
      high: nzdUsdQuote?.dayHigh ?? formatTileRate(nzdUsdVal * 1.004, 4),
      low: nzdUsdQuote?.dayLow ?? formatTileRate(nzdUsdVal * 0.996, 4),
    },
    {
      pair: 'USD / CNY',
      base: 'USD',
      quote: 'CNY',
      rate: formatTileRate(rates.CNY, 4),
      changePercent: usdCnyQuote?.changePercent ?? 0,
      high: usdCnyQuote?.dayHigh ?? formatTileRate(rates.CNY * 1.003, 4),
      low: usdCnyQuote?.dayLow ?? formatTileRate(rates.CNY * 0.997, 4),
    },
    {
      pair: 'SGD / IDR',
      base: 'SGD',
      quote: 'IDR',
      rate: formatTileRate(sgdIdrVal, 0),
      changePercent: usdIdrQuote?.changePercent ?? 0.08,
      high: formatTileRate(sgdIdrVal * 1.003, 0),
      low: formatTileRate(sgdIdrVal * 0.997, 0),
    },
  ];

  const payload: LiveFxResponse = {
    base: 'USD',
    rates,
    pairTiles,
    updatedAt: new Date().toISOString(),
  };

  fxCache.entry = { data: payload, expiresAt: now + 600_000 };
  const fxLatency = Date.now() - fxStart;
  if (!erRates) {
    updateProviderMetric('fx_rates', {
      status: 'failover',
      activeSource: 'Yahoo FX Crosses Fallback',
      latencyMs: fxLatency,
      lastSuccessAt: Date.now(),
      isCachedFallback: false,
      fallbackReason: 'Open ER-API unavailable; using live Yahoo FX quotes',
    });
  } else {
    updateProviderMetric('fx_rates', {
      status: 'live',
      activeSource: 'Open ER-API + Live FX',
      latencyMs: fxLatency,
      lastSuccessAt: Date.now(),
      isCachedFallback: false,
      fallbackReason: undefined,
    });
  }
  return payload;
  });
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXmlEntities(match[1]) : '';
}

function formatRelativeTime(pubDateStr: string): string {
  const ts = Date.parse(pubDateStr);
  if (!Number.isFinite(ts)) return 'Just now';
  const diffMin = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function classifyTopic(
  text: string,
  defaultTopic?: 'rates' | 'idx' | 'commodities' | 'crypto'
): {
  topic: 'rates' | 'idx' | 'commodities' | 'crypto';
  tags: string[];
} {
  const lower = text.toLowerCase();
  if (
    /\b(bitcoin|crypto|cryptocurrency|ethereum|solana|btc|eth|stablecoin|blockchain)\b/.test(lower)
  ) {
    return { topic: 'crypto', tags: ['Bitcoin', 'Digital Assets'] };
  }
  if (
    /\b(gold|silver|oil|brent|wti|crude|opec|commodities|commodity|copper|emas)\b/.test(lower)
  ) {
    return { topic: 'commodities', tags: ['Commodities', 'Energy & Metals'] };
  }
  if (
    /\b(ihsg|jakarta|rupiah|indonesia|bi-rate|saham|emiten|bei|ojk|nikkei|taiex|kospi)\b/.test(
      lower
    ) ||
    lower.includes('bank indonesia') ||
    lower.includes('hang seng') ||
    defaultTopic === 'idx'
  ) {
    return { topic: 'idx', tags: ['Asia-Pacific', 'IDX / FX'] };
  }
  if (defaultTopic === 'commodities') {
    return { topic: 'commodities', tags: ['Commodities', 'Energy & Metals'] };
  }
  if (defaultTopic === 'crypto') {
    return { topic: 'crypto', tags: ['Bitcoin', 'Digital Assets'] };
  }
  return { topic: 'rates', tags: ['Equities', 'Macro & Rates'] };
}

function scoreNewsImpact(
  headline: string,
  summary: string,
  publisher: string,
  ageMs: number
): {
  impactScore: number;
  isBreaking: boolean;
  newsTier: 'breaking' | 'recent';
  impactLabel?: string;
} {
  const text = `${headline} ${summary}`.toLowerCase();
  const titleLower = headline.toLowerCase();

  let score = 0;

  // 1. Freshness tier (breaking events must be fresh)
  if (ageMs <= 45 * 60_000) score += 32;
  else if (ageMs <= 2 * 3600_000) score += 24;
  else if (ageMs <= 4 * 3600_000) score += 14;

  // 2. High-impact central bank & macro release keywords
  if (
    /\b(fed|fomc|powell|ecb|boj|bank indonesia|bi rate|rate cut|rate hike|interest rate|cpi|inflation|pce|nfp|nonfarm|payrolls|gdp|recession|unemployment|pmi)\b/.test(
      text
    )
  ) {
    score += 32;
  }

  // 3. Sharp market move / systemic shock / policy catalyst keywords
  if (
    /\b(breaking|urgent|alert|plunge|plunges|surge|surges|crash|crashes|soar|soars|tumble|tumbles|slump|slumps|record high|all-time high|trading halt|circuit breaker|emergency|default|downgrade|sanctions|tariff|tariffs|opec|ceasefire|strike|invasion)\b/.test(
      titleLower
    )
  ) {
    score += 30;
  } else if (
    /\b(rally|rallies|selloff|sell-off|drops|jumps|spikes|sinks|rebound|sec |antitrust|bankruptcy|guidance cut|earnings beat|earnings miss|acquisition|merger)\b/.test(
      titleLower
    )
  ) {
    score += 18;
  }

  // 4. Local Indonesia/Asia high-impact catalyst terms
  if (/\b(ihsg|rupiah|bank indonesia|ojk|bei|prabowo|apbn|bbca|bbri|bmri|bni|tlkm)\b/.test(text)) {
    score += 14;
  }

  // 5. Quantified shock / basis-point magnitude cue
  if (/\b\d+(\.\d+)?%|\bbps\b|\$\d+(\.\d+)?[bmt]\b|rp\s?\d+/i.test(headline)) {
    score += 14;
  }

  // 6. Wire publisher bonus
  if (/financial times|cnbc|marketwatch|coindesk|bbc business/i.test(publisher)) {
    score += 6;
  }

  // 7. Editorial/evergreen/listicle/clickbait Q&A penalty — prevent opinion/speculative pieces from entering BREAKING
  const isEditorialOrNoise =
    /\b(opinion|editorial|podcast|watch live|how to|why you|what to know|best |top \d+|tips|explained|newsletter|week ahead|looking ahead|retirement|credit card|mortgage rate|gift guide|quiz|review:|here'?s why|price prediction|forecast for 20\d\d)\b/i.test(
      titleLower
    ) || /^(can|will|should|could|is|are|what|why|how)\b.*\?$/i.test(headline.trim());
  if (isEditorialOrNoise) {
    score -= 42;
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const isBreaking = !isEditorialOrNoise && ageMs <= 4 * 3600_000 && boundedScore >= 64;
  const newsTier: 'breaking' | 'recent' = isBreaking ? 'breaking' : 'recent';
  const impactLabel = isBreaking
    ? 'Breaking · High Impact'
    : boundedScore >= 52
      ? 'Market Mover'
      : undefined;

  return {
    impactScore: boundedScore,
    isBreaking,
    newsTier,
    impactLabel,
  };
}

function parseRssFeed(
  xml: string,
  publisher: string,
  defaultTopic?: 'rates' | 'idx' | 'commodities' | 'crypto',
  maxPerSource = 6
): (LiveNewsItem & { ts: number })[] {
  const items: (LiveNewsItem & { ts: number })[] = [];
  const matches = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  for (let i = 0; i < matches.length && items.length < maxPerSource; i++) {
    const raw = matches[i];
    const headline = extractTag(raw, 'title');
    const summaryRaw = extractTag(raw, 'description');
    const link = extractTag(raw, 'link');
    const pubDate = extractTag(raw, 'pubDate');
    if (!headline || headline.length < 12) continue;

    const ts = Number.isFinite(Date.parse(pubDate)) ? Date.parse(pubDate) : Date.now() - i * 600_000;
    const ageMs = Math.max(0, Date.now() - ts);
    const summary = summaryRaw || headline;
    const { topic, tags } = classifyTopic(`${headline} ${summary}`, defaultTopic);
    const impactEval = scoreNewsImpact(headline, summary, publisher, ageMs);
    const publishedWib = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ts));

    items.push({
      id: `live-${publisher.toLowerCase().replace(/\W+/g, '')}-${i}-${ts}`,
      publisher,
      timeAgo: formatRelativeTime(pubDate),
      publishedAt: `${publishedWib} WIB`,
      isBreaking: impactEval.isBreaking,
      newsTier: impactEval.newsTier,
      impactScore: impactEval.impactScore,
      impact: impactEval.impactLabel,
      topic,
      tags,
      headline,
      summary,
      paragraphs: [
        summary,
        `Published ${publishedWib} WIB via ${publisher}. Open the verified dispatch link below for full coverage and source reporting.`,
      ],
      url: link || undefined,
      ts,
    });
  }
  return items;
}

const NEWS_RSS_SOURCES: {
  publisher: string;
  url: string;
  defaultTopic?: 'rates' | 'idx' | 'commodities' | 'crypto';
  maxItems: number;
}[] = [
  {
    publisher: 'MarketWatch',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    defaultTopic: 'rates',
    maxItems: 5,
  },
  {
    publisher: 'Financial Times',
    url: 'https://www.ft.com/markets?format=rss',
    defaultTopic: 'rates',
    maxItems: 5,
  },
  {
    publisher: 'CNBC',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
    defaultTopic: 'rates',
    maxItems: 5,
  },
  {
    publisher: 'CNBC Investing',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069',
    defaultTopic: 'rates',
    maxItems: 4,
  },
  {
    publisher: 'BBC Business',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    defaultTopic: 'rates',
    maxItems: 5,
  },
  {
    publisher: 'Yahoo Finance',
    url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EIXIC,%5EDJI,%5ETNX&region=US&lang=en-US',
    defaultTopic: 'rates',
    maxItems: 5,
  },
  {
    publisher: 'CNBC Indonesia',
    url: 'https://www.cnbcindonesia.com/market/rss',
    defaultTopic: 'idx',
    maxItems: 6,
  },
  {
    publisher: 'Yahoo Finance Asia',
    url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EJKSE,IDR%3DX,%5ETWII,%5EKS11,%5EHSI&region=US&lang=en-US',
    defaultTopic: 'idx',
    maxItems: 5,
  },
  {
    publisher: 'Yahoo Commodities',
    url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC%3DF,CL%3DF,BZ%3DF&region=US&lang=en-US',
    defaultTopic: 'commodities',
    maxItems: 5,
  },
  {
    publisher: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    defaultTopic: 'crypto',
    maxItems: 5,
  },
  {
    publisher: 'Yahoo Crypto',
    url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=BTC-USD,ETH-USD&region=US&lang=en-US',
    defaultTopic: 'crypto',
    maxItems: 4,
  },
];

export async function fetchLiveNews(): Promise<{
  stories: LiveNewsItem[];
  updatedAt: string;
}> {
  const now = Date.now();
  if (newsCache.entry) {
    if (newsCache.entry.expiresAt > now) {
      return newsCache.entry.data;
    }
    if (now - newsCache.entry.expiresAt < 900_000) {
      void fetchLiveNewsFresh().catch(() => null);
      return newsCache.entry.data;
    }
  }
  return fetchLiveNewsFresh();
}

async function fetchLiveNewsFresh(): Promise<{
  stories: LiveNewsItem[];
  updatedAt: string;
}> {
  const now = Date.now();
  const newsStart = Date.now();
  return coalesceInFlight('live-news', newsCache.entry?.data, async () => {

  const feeds = await Promise.all(
    NEWS_RSS_SOURCES.map(async (src) => {
      try {
        const res = await fetch(src.url, {
          headers: UA_HEADERS,
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRssFeed(xml, src.publisher, src.defaultTopic, src.maxItems);
      } catch {
        return [];
      }
    })
  );

  const combined = feeds.flat();

  const seenTitles = new Set<string>();
  const deduped = combined
    .sort((a, b) => {
      if (Boolean(b.isBreaking) !== Boolean(a.isBreaking)) {
        return b.isBreaking ? 1 : -1;
      }
      if (b.isBreaking && a.isBreaking) {
        const scoreDiff = (b.impactScore ?? 0) - (a.impactScore ?? 0);
        if (Math.abs(scoreDiff) >= 8) return scoreDiff;
      }
      return b.ts - a.ts;
    })
    .filter((item) => {
      const key = item.headline.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 55);
      if (!key || seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, 36)
    .map(({ ts: _ts, ...rest }) => rest);

  const payload = { stories: deduped, updatedAt: new Date().toISOString() };
  const newsLatency = Date.now() - newsStart;
  if (deduped.length > 0) {
    newsCache.entry = { data: payload, expiresAt: now + 300_000 };
    updateProviderMetric('news_cal', {
      status: 'live',
      activeSource: 'Live RSS + Macro Calendar',
      latencyMs: newsLatency,
      lastSuccessAt: Date.now(),
      isCachedFallback: false,
      fallbackReason: undefined,
    });
  } else if (newsCache.entry?.data) {
    updateProviderMetric('news_cal', {
      status: 'cached',
      activeSource: 'Cached RSS News Snapshot',
      latencyMs: newsLatency,
      isCachedFallback: true,
      fallbackReason: 'RSS upstream returned zero stories; serving cache',
    });
    return newsCache.entry.data;
  }
  return payload;
  });
}

function getWibDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function formatWibTimeLabel(d: Date): string {
  const nowKey = getWibDateKey(new Date());
  const tomorrowKey = getWibDateKey(new Date(Date.now() + 86400_000));
  const itemKey = getWibDateKey(d);
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

  if (itemKey === nowKey) return `Today ${hhmm}`;
  if (itemKey === tomorrowKey) return `Tmrw ${hhmm}`;
  const monDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    month: 'short',
    day: '2-digit',
  }).format(d);
  return `${monDay} ${hhmm}`;
}

function classifyDay(d: Date): 'today' | 'tomorrow' | 'week' {
  const nowKey = getWibDateKey(new Date());
  const tomorrowKey = getWibDateKey(new Date(Date.now() + 86400_000));
  const itemKey = getWibDateKey(d);
  if (itemKey === nowKey) return 'today';
  if (itemKey === tomorrowKey) return 'tomorrow';
  return 'week';
}

function isUnpublishedActual(actual?: string | null): boolean {
  if (!actual) return true;
  const trimmed = actual.trim();
  return !trimmed || /^(pending|—|-|n\/a)$/i.test(trimmed);
}

function computeDeviation(actual?: string, forecast?: string): {
  label: string;
  type: 'beat' | 'miss' | 'neutral';
} {
  if (isUnpublishedActual(actual)) {
    return { label: '-', type: 'neutral' };
  }
  const cleanActual = actual!.trim();
  if (!forecast || !forecast.trim() || forecast === '—' || forecast === '-') {
    return { label: 'Released', type: 'neutral' };
  }
  const numActual = parseFloat(cleanActual.replace(/[^0-9.-]/g, ''));
  const numForecast = parseFloat(forecast.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(numActual) || !Number.isFinite(numForecast)) {
    return { label: 'Reported', type: 'neutral' };
  }
  const diff = numActual - numForecast;
  if (Math.abs(diff) < 1e-6) return { label: 'In-line', type: 'neutral' };
  return diff > 0
    ? { label: `Beat (+${Math.abs(diff).toFixed(1).replace(/\.0$/, '')})`, type: 'beat' }
    : { label: `Miss (-${Math.abs(diff).toFixed(1).replace(/\.0$/, '')})`, type: 'miss' };
}

async function fetchCalendarViaGemini(): Promise<LiveCalendarItem[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const todayWib = getWibDateKey(new Date());
  const prompt =
    `Today is ${todayWib} (Asia/Jakarta UTC+7). Search the web for the upcoming macroeconomic calendar schedule for this week (including US Retail Sales, Industrial Production, Jobless Claims, CPI/PPI, Fed speeches, Bank Indonesia BI-Rate, Japan GDP/Trade, Eurozone CPI/PMI, and China data). ` +
    `Return ONLY a raw JSON array of up to 12 events (no markdown fences) where each object has: ` +
    `{"title":"...", "currency":"USD|IDR|CNY|EUR|JPY", "impact":"HIGH|MED", "isoDate":"YYYY-MM-DDTHH:mm:ss+07:00", "description":"...", "forecast":"...", "previous":"..."}.`;

  const res = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const raw = (res.text ?? '').trim();
  const jsonStart = raw.indexOf('[');
  const jsonEnd = raw.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1) return [];

  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Array<{
    title?: string;
    currency?: string;
    impact?: string;
    isoDate?: string;
    description?: string;
    forecast?: string;
    previous?: string;
  }>;

  const allowedCurrencies = new Set(['USD', 'IDR', 'CNY', 'EUR', 'JPY']);
  return parsed
    .filter((ev) => ev.title && ev.isoDate)
    .map((ev, idx) => {
      const d = new Date(ev.isoDate!);
      const validDate = Number.isFinite(d.getTime()) ? d : new Date();
      const curr = allowedCurrencies.has(String(ev.currency))
        ? (ev.currency as LiveCalendarItem['currency'])
        : 'USD';
      const impact: 'HIGH' | 'MED' = ev.impact === 'HIGH' ? 'HIGH' : 'MED';
      const forecast = ev.forecast?.trim() || '—';
      const previous = ev.previous?.trim() || '—';

      return {
        id: `cal-ai-${idx}-${validDate.getTime()}`,
        timeWib: formatWibTimeLabel(validDate),
        isoDate: validDate.toISOString(),
        dateGroupLabel: formatWibDateGroup(validDate),
        day: classifyDay(validDate),
        currency: curr,
        impact,
        title: String(ev.title),
        description: String(ev.description || 'Official Macroeconomic Release'),
        actual: '-',
        forecast,
        previous,
        deviationLabel: '-',
        deviationType: 'neutral' as const,
      };
    });
}

function formatTvMetric(
  val: number | null | undefined,
  unit?: string,
  scale?: string
): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return '—';
  }
  const absStr =
    Math.abs(val) >= 100
      ? Math.abs(val).toFixed(1).replace(/\.0$/, '')
      : Number(Math.abs(val).toFixed(3)).toString();
  const sign = val < 0 ? '-' : '';
  const sc = scale || '';
  if (unit === '%') {
    return `${sign}${absStr}${sc}%`;
  }
  if (unit === '$' || unit === '¥' || unit === '€') {
    return `${sign}${unit}${absStr}${sc}`;
  }
  return `${sign}${absStr}${sc}${unit ? ` ${unit}` : ''}`;
}

const FF_ALLOWED_CURRENCIES = new Set<LiveCalendarItem['currency']>([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
  'NZD',
  'CNY',
]);

let ffLastFetchAttemptAt = 0;
let ffLastWarmSnapshot: LiveCalendarItem[] = [];

function formatWibDateGroup(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

function formatWibClockOnly(d: Date): string {
  return `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)} WIB`;
}

function mapFfImpact(rawImpact?: string): LiveCalendarItem['impact'] {
  const norm = (rawImpact || '').trim().toLowerCase();
  if (norm === 'high') return 'HIGH';
  if (norm === 'medium' || norm === 'med') return 'MED';
  if (norm === 'holiday') return 'HOLIDAY';
  return 'LOW';
}

function parseFfXmlFallback(xml: string): LiveCalendarItem[] {
  const items: LiveCalendarItem[] = [];
  const blocks = xml.match(/<event>[\s\S]*?<\/event>/gi) ?? [];
  const readTag = (block: string, tag: string): string => {
    const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
    return m ? m[1].trim() : '';
  };

  blocks.forEach((block, idx) => {
    const title = readTag(block, 'title');
    const country = readTag(block, 'country').toUpperCase();
    const dateStr = readTag(block, 'date'); // MM-DD-YYYY (US Eastern)
    const timeStr = readTag(block, 'time'); // e.g. 9:45pm or All Day
    const impactStr = readTag(block, 'impact');
    const rawActual = readTag(block, 'actual');
    const forecast = readTag(block, 'forecast') || '—';
    const previous = readTag(block, 'previous') || '—';

    if (!title || !dateStr || !FF_ALLOWED_CURRENCIES.has(country as LiveCalendarItem['currency'])) {
      return;
    }

    const dm = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!dm) return;
    let hours = 0;
    let mins = 0;
    const isAllDay = !timeStr || /all day|tentative/i.test(timeStr);
    if (!isAllDay) {
      const tm = timeStr.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
      if (tm) {
        hours = Number(tm[1]) % 12;
        if (tm[3].toLowerCase() === 'pm') hours += 12;
        mins = Number(tm[2]);
      }
    }
    const isoRaw = `${dm[3]}-${dm[1]}-${dm[2]}T${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00Z`;
    const d = new Date(isoRaw);
    if (!Number.isFinite(d.getTime())) return;

    const impact = mapFfImpact(impactStr);
    const actual = isUnpublishedActual(rawActual) ? '-' : rawActual.trim();
    const dev = computeDeviation(actual, forecast);

    items.push({
      id: `ff-xml-${idx}-${d.getTime()}`,
      timeWib: impact === 'HOLIDAY' || isAllDay ? 'All Day' : formatWibClockOnly(d),
      isoDate: d.toISOString(),
      dateGroupLabel: formatWibDateGroup(d),
      day: classifyDay(d),
      currency: country as LiveCalendarItem['currency'],
      impact,
      title,
      description: `${country} · ${impact === 'HIGH' ? 'High Impact' : impact === 'MED' ? 'Medium Impact' : impact === 'HOLIDAY' ? 'Bank Holiday' : 'Low Impact'}`,
      actual,
      forecast,
      previous,
      deviationLabel: dev.label,
      deviationType: dev.type,
    });
  });

  return items;
}

export type CalendarRangePreset =
  | 'this_week'
  | 'next_week'
  | 'this_month'
  | 'next_month'
  | 'custom';

export interface CalendarFetchOptions {
  range?: CalendarRangePreset;
  from?: string;
  to?: string;
  force?: boolean;
}

function wibDayStartEpoch(year: number, monthIndex0: number, dayOfMonth: number): number {
  return Date.UTC(year, monthIndex0, dayOfMonth, 0, 0, 0, 0) - 7 * 3600_000;
}

function resolveCalendarWindowMs(options?: CalendarFetchOptions): {
  preset: CalendarRangePreset;
  startMs: number;
  endMs: number;
  cacheKey: string;
} {
  const preset: CalendarRangePreset =
    options?.range === 'next_week' ||
    options?.range === 'this_month' ||
    options?.range === 'next_month' ||
    options?.range === 'custom'
      ? options.range
      : 'this_week';

  const wibNow = new Date(Date.now() + 7 * 3600_000);
  const y = wibNow.getUTCFullYear();
  const m = wibNow.getUTCMonth();
  const d = wibNow.getUTCDate();
  const dow = wibNow.getUTCDay(); // 0=Sun..6=Sat

  if (preset === 'next_week') {
    const startMs = wibDayStartEpoch(y, m, d - dow + 7);
    const endMs = wibDayStartEpoch(y, m, d - dow + 14) - 1;
    return { preset, startMs, endMs, cacheKey: `next_week:${getWibDateKey(new Date(startMs))}` };
  }

  if (preset === 'this_month') {
    const startMs = wibDayStartEpoch(y, m, 1);
    const endMs = wibDayStartEpoch(y, m + 1, 1) - 1;
    return { preset, startMs, endMs, cacheKey: `this_month:${y}-${String(m + 1).padStart(2, '0')}` };
  }

  if (preset === 'next_month') {
    const startMs = wibDayStartEpoch(y, m + 1, 1);
    const endMs = wibDayStartEpoch(y, m + 2, 1) - 1;
    return { preset, startMs, endMs, cacheKey: `next_month:${y}-${String(m + 2).padStart(2, '0')}` };
  }

  if (preset === 'custom') {
    const parseDate = (s?: string): number | null => {
      if (!s) return null;
      const match = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      return wibDayStartEpoch(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    };
    const fromParsed = parseDate(options?.from);
    const toParsed = parseDate(options?.to);
    const defaultStart = wibDayStartEpoch(y, m, d - dow);
    const startMs = fromParsed ?? defaultStart;
    const rawEndStart = toParsed ?? fromParsed ?? (defaultStart + 6 * 86400_000);
    const orderedStart = Math.min(startMs, rawEndStart);
    const orderedEnd = Math.max(startMs, rawEndStart) + 86400_000 - 1;
    const fromKey = getWibDateKey(new Date(orderedStart));
    const toKey = getWibDateKey(new Date(orderedEnd));
    return { preset, startMs: orderedStart, endMs: orderedEnd, cacheKey: `custom:${fromKey}:${toKey}` };
  }

  // this_week (Sun–Sat in WIB)
  const startMs = wibDayStartEpoch(y, m, d - dow);
  const endMs = wibDayStartEpoch(y, m, d - dow + 7) - 1;
  return { preset: 'this_week', startMs, endMs, cacheKey: 'this_week' };
}

function normalizeCalendarActuals(items: LiveCalendarItem[]): LiveCalendarItem[] {
  return items.map((ev) => {
    if (isUnpublishedActual(ev.actual)) {
      return {
        ...ev,
        actual: '-',
        deviationLabel: '-',
        deviationType: 'neutral',
      };
    }
    const cleanActual = ev.actual.trim();
    const dev = computeDeviation(cleanActual, ev.forecast);
    return {
      ...ev,
      actual: cleanActual,
      deviationLabel: dev.label,
      deviationType: dev.type,
    };
  });
}

type TvCalendarItem = LiveCalendarItem & {
  countryCode?: string;
  indicatorText?: string;
};

function parseCalendarNumber(raw?: string | null): number | null {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  if (!cleaned || cleaned === '-' || cleaned === '—') return null;
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

const CAL_SYNONYMS: Record<string, string[]> = {
  inflation: ['cpi', 'prices'],
  cpi: ['inflation', 'prices'],
  sppi: ['services', 'ppi', 'producer'],
  gdp: ['growth', 'rate', 'gdp'],
  ifo: ['ifo'],
  pmi: ['pmi', 'purchasing'],
  retail: ['retail', 'sales'],
  realized: ['distributive', 'cbi', 'retail'],
  distributive: ['realized', 'cbi', 'retail'],
  unemployment: ['jobless', 'claims', 'unemployment'],
  claims: ['jobless', 'unemployment', 'claims'],
  adp: ['adp', 'employment'],
  cb: ['conference', 'board', 'consumer', 'confidence'],
  confidence: ['confidence', 'sentiment'],
  bulletin: ['api', 'crude', 'oil', 'stock', 'inventories'],
  inventories: ['stock', 'stocks', 'crude', 'oil'],
  trimmed: ['trimmed', 'mean'],
  core: ['core'],
  house: ['home', 'hpi', 'house'],
  home: ['house', 'hpi', 'home'],
  hpi: ['house', 'home', 'price'],
  case: ['case', 'shiller', 'hpi'],
  shiller: ['case', 'shiller', 'hpi', 'home'],
  cs: ['case', 'shiller', 'hpi', 'home'],
  composite: ['case', 'shiller', 'hpi', 'home'],
  richmond: ['richmond', 'manufacturing'],
  construction: ['construction', 'work'],
};

function tokenizeRawCalendarWords(raw: string): Set<string> {
  const words = raw
    .toLowerCase()
    .replace(/q\/q/g, ' qoq ')
    .replace(/m\/m/g, ' mom ')
    .replace(/y\/y/g, ' yoy ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !['the', 'and', 'for', 'final', 'prelim', 'flash', 'rev', 'nsa', 'sa', 'us', 'eu', 'uk', 's&p', 'global'].includes(w));
  return new Set(words);
}

function tokenizeCalendarTitle(raw: string): Set<string> {
  const rawSet = tokenizeRawCalendarWords(raw);
  const out = new Set<string>(rawSet);
  for (const w of rawSet) {
    const syns = CAL_SYNONYMS[w];
    if (syns) {
      for (const s of syns) out.add(s);
    }
  }
  return out;
}

function enrichEventsWithTradingViewActuals(
  ffEvents: LiveCalendarItem[],
  tvEvents: TvCalendarItem[],
  nowMs: number
): LiveCalendarItem[] {
  if (tvEvents.length === 0) return ffEvents;

  const releasedTv = tvEvents.filter((tv) => {
    if (isUnpublishedActual(tv.actual)) return false;
    const tvMs = Date.parse(tv.isoDate);
    return Number.isFinite(tvMs) && tvMs <= nowMs + 5 * 60_000;
  });
  if (releasedTv.length === 0) return ffEvents;

  return ffEvents.map((ffEv) => {
    // Only stamp released actuals onto events whose scheduled release has occurred (+5m tolerance)
    const ffMs = Date.parse(ffEv.isoDate);
    if (!Number.isFinite(ffMs) || ffMs > nowMs + 5 * 60_000) return ffEv;
    if (ffEv.impact === 'HOLIDAY' || /speaks|testifies|press conference|bank holiday|daylight/i.test(ffEv.title)) {
      return ffEv;
    }

    const ffRawTokens = tokenizeRawCalendarWords(ffEv.title);
    const ffTokens = tokenizeCalendarTitle(ffEv.title);
    const ffFcstNum = parseCalendarNumber(ffEv.forecast);
    const ffPrevNum = parseCalendarNumber(ffEv.previous);
    const ffDayKey = getWibDateKey(new Date(ffMs));
    const ffHasPct = ffEv.forecast.includes('%') || ffEv.previous.includes('%');
    const ffExpectsDollar =
      /[$€¥]|budget|balance|supply|deficit|surplus/i.test(ffEv.title) ||
      ffEv.forecast.includes('$') ||
      ffEv.previous.includes('$');
    const ffLower = ffEv.title.toLowerCase();
    const expectedCountry =
      ffLower.includes('german') ? 'DE' :
      ffLower.includes('french') ? 'FR' :
      ffLower.includes('italian') ? 'IT' :
      ffLower.includes('spanish') ? 'ES' : null;
    const ffPeriod = ffTokens.has('qoq')
      ? 'qoq'
      : ffTokens.has('mom')
        ? 'mom'
        : ffTokens.has('yoy')
          ? 'yoy'
          : null;

    let bestMatch: TvCalendarItem | null = null;
    let bestScore = -1;

    for (const tv of releasedTv) {
      if (tv.currency !== ffEv.currency) continue;
      if (expectedCountry && tv.countryCode && tv.countryCode !== expectedCountry) continue;
      if (!ffExpectsDollar && tv.actual.includes('$')) continue;

      const tvMs = Date.parse(tv.isoDate);
      if (!Number.isFinite(tvMs)) continue;

      const diffMin = Math.abs(ffMs - tvMs) / 60_000;
      const sameDayAllDay = ffEv.timeWib === 'All Day' && getWibDateKey(new Date(tvMs)) === ffDayKey;
      if (!sameDayAllDay && diffMin > 15) continue;

      const tvText = `${tv.title} ${tv.indicatorText ?? ''}`;
      const tvLower = tvText.toLowerCase();
      if (ffLower.includes('core') && !tvLower.includes('core') && !tvLower.includes('trimmed')) continue;
      if (ffLower.includes('trimmed') && !tvLower.includes('trimmed')) continue;

      const tvRawTokens = tokenizeRawCalendarWords(tvText);
      const tvTokens = tokenizeCalendarTitle(tvText);
      let overlap = 0;
      for (const tok of ffTokens) {
        if (tvTokens.has(tok)) overlap += 1;
      }
      if (overlap < 1) continue;

      let exactOverlap = 0;
      for (const tok of ffRawTokens) {
        if (tvRawTokens.has(tok)) exactOverlap += 1;
      }

      const tvHasPct = tv.actual.includes('%') || tv.forecast.includes('%') || tv.previous.includes('%');
      const hasNumericRef = ffFcstNum !== null || ffPrevNum !== null;
      const unitBonus = !hasNumericRef ? 0.5 : ffHasPct === tvHasPct ? 1.5 : -3.5;

      let numericBonus = 0;
      const tvFcstNum = parseCalendarNumber(tv.forecast);
      const tvPrevNum = parseCalendarNumber(tv.previous);
      if (ffFcstNum !== null && tvFcstNum !== null) {
        if (Math.abs(ffFcstNum - tvFcstNum) <= Math.max(0.15, Math.abs(ffFcstNum) * 0.08)) {
          numericBonus += 4.5;
        }
      }
      if (ffPrevNum !== null && tvPrevNum !== null) {
        if (Math.abs(ffPrevNum - tvPrevNum) <= Math.max(0.2, Math.abs(ffPrevNum) * 0.12)) {
          numericBonus += 3.5;
        }
      }

      const timeBonus = diffMin <= 2 ? 3.5 : diffMin <= 10 ? 2.2 : 0.8;
      const tvPeriod = tvTokens.has('qoq')
        ? 'qoq'
        : tvTokens.has('mom')
          ? 'mom'
          : tvTokens.has('yoy')
            ? 'yoy'
            : null;
      let periodBonus = 0;
      if (ffPeriod && tvPeriod) {
        periodBonus = ffPeriod === tvPeriod ? 3.0 : -5.0;
      }

      let qualifierBonus = 0;
      if (!ffLower.includes('core') && !ffLower.includes('trimmed')) {
        if (tvLower.includes('trimmed') || tvLower.includes('core')) {
          qualifierBonus -= 4.0;
        }
      }

      const score = overlap * 2.0 + exactOverlap * 1.4 + periodBonus + qualifierBonus + numericBonus + timeBonus + unitBonus;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = tv;
      }
    }

    if (!bestMatch || bestScore < 4.5) return ffEv;

    const cleanActual = bestMatch.actual.trim();
    const resolvedForecast =
      ffEv.forecast && ffEv.forecast !== '—' ? ffEv.forecast : bestMatch.forecast;
    const resolvedPrevious =
      ffEv.previous && ffEv.previous !== '—' ? ffEv.previous : bestMatch.previous;
    const dev = computeDeviation(cleanActual, resolvedForecast);

    return {
      ...ffEv,
      actual: cleanActual,
      forecast: resolvedForecast || '—',
      previous: resolvedPrevious || '—',
      deviationLabel: dev.label,
      deviationType: dev.type,
    };
  });
}

async function fetchTradingViewCalendarWindow(
  startMs: number,
  endMs: number
): Promise<TvCalendarItem[]> {
  const fromIso = new Date(startMs).toISOString();
  const toIso = new Date(endMs).toISOString();
  const tvUrl = `https://economic-calendar.tradingview.com/events?from=${encodeURIComponent(
    fromIso
  )}&to=${encodeURIComponent(toIso)}&countries=US,EU,DE,FR,IT,ES,GB,JP,AU,CA,CH,NZ,CN`;

  const res = await fetch(tvUrl, {
    headers: {
      ...UA_HEADERS,
      Origin: 'https://www.tradingview.com',
      Referer: 'https://www.tradingview.com/',
    },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    result?: Array<{
      id?: string;
      title?: string;
      indicator?: string;
      country?: string;
      currency?: string;
      actual?: number | null;
      forecast?: number | null;
      previous?: number | null;
      unit?: string;
      scale?: string;
      importance?: number;
      date?: string;
    }>;
  };

  const countryCurrencyMap: Record<string, LiveCalendarItem['currency']> = {
    US: 'USD',
    EU: 'EUR',
    DE: 'EUR',
    FR: 'EUR',
    IT: 'EUR',
    ES: 'EUR',
    GB: 'GBP',
    JP: 'JPY',
    AU: 'AUD',
    CA: 'CAD',
    CH: 'CHF',
    NZ: 'NZD',
    CN: 'CNY',
  };

  return (json.result ?? [])
    .filter((ev) => ev.title && ev.date && typeof ev.importance === 'number' && ev.importance >= -1)
    .sort((a, b) => Date.parse(a.date!) - Date.parse(b.date!))
    .slice(0, 600)
    .map((ev, idx) => {
      const d = new Date(ev.date!);
      const countryCode = String(ev.country || '').toUpperCase();
      const currCand = String(ev.currency || '').toUpperCase() as LiveCalendarItem['currency'];
      const curr = FF_ALLOWED_CURRENCIES.has(currCand)
        ? currCand
        : countryCurrencyMap[countryCode] || 'USD';
      const impact: LiveCalendarItem['impact'] =
        ev.importance === 1 ? 'HIGH' : ev.importance === 0 ? 'MED' : 'LOW';
      const actualRaw = formatTvMetric(ev.actual, ev.unit, ev.scale);
      const actual = isUnpublishedActual(actualRaw) ? '-' : actualRaw;
      const forecast = formatTvMetric(ev.forecast, ev.unit, ev.scale);
      const previous = formatTvMetric(ev.previous, ev.unit, ev.scale);
      const dev = computeDeviation(actual, forecast);

      return {
        id: `tv-ff-${ev.id || idx}-${d.getTime()}`,
        timeWib: formatWibClockOnly(d),
        isoDate: d.toISOString(),
        dateGroupLabel: formatWibDateGroup(d),
        day: classifyDay(d),
        currency: curr,
        impact,
        title: String(ev.title),
        indicatorText: ev.indicator ? String(ev.indicator) : '',
        countryCode,
        description: `${curr} · ${impact === 'HIGH' ? 'High Impact' : impact === 'MED' ? 'Medium Impact' : 'Low Impact'}`,
        actual,
        forecast,
        previous,
        deviationLabel: dev.label,
        deviationType: dev.type,
      };
    });
}

export async function fetchLiveCalendar(options?: CalendarFetchOptions): Promise<LiveCalendarResponse> {
  const win = resolveCalendarWindowMs(options);
  const now = Date.now();
  if (!options?.force) {
    if (win.preset === 'this_week' && calendarCache.entry) {
      if (calendarCache.entry.expiresAt > now) {
        return calendarCache.entry.data;
      }
      if (now - calendarCache.entry.expiresAt < 900_000) {
        void fetchLiveCalendarFresh(options).catch(() => null);
        return calendarCache.entry.data;
      }
    } else if (win.preset !== 'this_week') {
      const cachedRange = calendarRangeCache.get(win.cacheKey);
      if (cachedRange && cachedRange.expiresAt > now) {
        return cachedRange.data;
      }
    }
  }
  return fetchLiveCalendarFresh(options);
}

async function fetchLiveCalendarFresh(options?: CalendarFetchOptions): Promise<LiveCalendarResponse> {
  const now = Date.now();
  const calStart = Date.now();
  const win = resolveCalendarWindowMs(options);
  const fallbackEntry =
    win.preset === 'this_week'
      ? calendarCache.entry?.data
      : calendarRangeCache.get(win.cacheKey)?.data;

  return coalesceInFlight(`live-calendar:${win.cacheKey}`, fallbackEntry, async () => {
    let events: LiveCalendarItem[] = [];
    let source = 'ForexFactory Weekly Macro Calendar';

    // Always try fetching ForexFactory this-week JSON/XML (with 4-min upstream guard) AND TradingView actuals concurrently
    const includesThisWeek =
      win.preset === 'this_week' ||
      win.preset === 'this_month' ||
      win.preset === 'custom';

    const canQueryFairEconomy =
      includesThisWeek && (now - ffLastFetchAttemptAt > 240_000 || ffLastWarmSnapshot.length === 0);

    const tvWindowPromise = fetchTradingViewCalendarWindow(
      win.startMs - 12 * 3600_000,
      win.endMs + 12 * 3600_000
    ).catch((): TvCalendarItem[] => []);

    if (canQueryFairEconomy) {
      ffLastFetchAttemptAt = now;
      try {
        const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
          headers: UA_HEADERS,
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          const bodyText = await res.text();
          if (contentType.includes('json') || bodyText.trim().startsWith('[')) {
            const raw = JSON.parse(bodyText) as Array<{
              title?: string;
              country?: string;
              date?: string;
              impact?: string;
              actual?: string;
              forecast?: string;
              previous?: string;
            }>;

            const parsedFf = raw
              .filter(
                (item) =>
                  item.title &&
                  item.date &&
                  FF_ALLOWED_CURRENCIES.has(String(item.country || '').toUpperCase() as LiveCalendarItem['currency'])
              )
              .map((item, idx) => {
                const d = new Date(item.date!);
                const curr = String(item.country || 'USD').toUpperCase() as LiveCalendarItem['currency'];
                const impact = mapFfImpact(item.impact);
                const rawActual = item.actual?.trim() ?? '';
                const actual = isUnpublishedActual(rawActual) ? '-' : rawActual;
                const forecast = item.forecast?.trim() || '—';
                const previous = item.previous?.trim() || '—';
                const dev = computeDeviation(actual, forecast);

                return {
                  id: `ff-${idx}-${d.getTime()}-${curr}`,
                  timeWib: impact === 'HOLIDAY' ? 'All Day' : formatWibClockOnly(d),
                  isoDate: d.toISOString(),
                  dateGroupLabel: formatWibDateGroup(d),
                  day: classifyDay(d),
                  currency: curr,
                  impact,
                  title: String(item.title),
                  description: `${curr} · ${
                    impact === 'HIGH'
                      ? 'High Impact'
                      : impact === 'MED'
                        ? 'Medium Impact'
                        : impact === 'HOLIDAY'
                          ? 'Bank Holiday'
                          : 'Low Impact'
                  }`,
                  actual,
                  forecast,
                  previous,
                  deviationLabel: dev.label,
                  deviationType: dev.type,
                };
              })
              .sort((a, b) => Date.parse(a.isoDate) - Date.parse(b.isoDate));

            if (parsedFf.length > 0) {
              ffLastWarmSnapshot = parsedFf;
              if (win.preset === 'this_week') {
                events = parsedFf;
                source = 'ForexFactory Weekly Calendar';
              }
            }
          }
        }
      } catch {
        // try XML fallback below
      }

      if (ffLastWarmSnapshot.length === 0) {
        try {
          const xmlRes = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.xml', {
            headers: UA_HEADERS,
            signal: AbortSignal.timeout(8000),
          });
          if (xmlRes.ok) {
            const xml = await xmlRes.text();
            if (xml.includes('<weeklyevents>')) {
              const parsedXml = parseFfXmlFallback(xml);
              if (parsedXml.length > 0) {
                ffLastWarmSnapshot = parsedXml.sort((a, b) => Date.parse(a.isoDate) - Date.parse(b.isoDate));
                if (win.preset === 'this_week') {
                  events = ffLastWarmSnapshot;
                  source = 'ForexFactory Weekly Calendar (XML)';
                }
              }
            }
          }
        } catch {
          // ignore XML failure
        }
      }
    }

    // Reuse warm ForexFactory snapshot for this_week if rate-limited between refreshes
    if (win.preset === 'this_week' && events.length === 0 && ffLastWarmSnapshot.length > 0) {
      events = normalizeCalendarActuals(ffLastWarmSnapshot).map((ev) => {
        const d = new Date(ev.isoDate);
        return {
          ...ev,
          day: classifyDay(d),
          dateGroupLabel: formatWibDateGroup(d),
        };
      });
      source = 'ForexFactory Weekly Calendar (Warm)';
    }

    const tvEvents = await tvWindowPromise;

    if (win.preset === 'this_week') {
      if (events.length > 0 && tvEvents.length > 0) {
        // Enrich canonical ForexFactory schedule with live released actual prints from TradingView
        events = enrichEventsWithTradingViewActuals(events, tvEvents, now);
        source = 'ForexFactory + Live Release Feed';
      } else if (events.length === 0 && tvEvents.length > 0) {
        events = tvEvents.filter((ev) => {
          const t = Date.parse(ev.isoDate);
          return t >= win.startMs && t <= win.endMs;
        });
        source = 'Macro FX Calendar Fallback';
      }
    } else if (tvEvents.length > 0) {
      // Extended ranges (next_week, this_month, next_month, custom)
      const ffInWindow = normalizeCalendarActuals(ffLastWarmSnapshot).filter((ev) => {
        const t = Date.parse(ev.isoDate);
        return t >= win.startMs && t <= win.endMs;
      });
      const enrichedFf = enrichEventsWithTradingViewActuals(ffInWindow, tvEvents, now);
      const seenTitlesByDay = new Set(
        enrichedFf.map((ev) => `${ev.currency}:${getWibDateKey(new Date(ev.isoDate))}:${ev.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}`)
      );
      const merged: LiveCalendarItem[] = [...enrichedFf];
      for (const tv of tvEvents) {
        const t = Date.parse(tv.isoDate);
        if (t < win.startMs || t > win.endMs) continue;
        const tvKey = `${tv.currency}:${getWibDateKey(new Date(t))}:${tv.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}`;
        if (!seenTitlesByDay.has(tvKey)) {
          seenTitlesByDay.add(tvKey);
          const safeTv = t > now + 5 * 60_000 ? { ...tv, actual: '-', deviationLabel: '-', deviationType: 'neutral' as const } : tv;
          merged.push(safeTv);
        }
      }
      events = merged.sort((a, b) => Date.parse(a.isoDate) - Date.parse(b.isoDate));
      source = ffInWindow.length > 0 ? 'ForexFactory + Extended Macro Schedule' : 'Extended Macro FX Schedule';
    }

    if (win.preset === 'this_week' && events.length === 0) {
      try {
        events = await fetchCalendarViaGemini();
        if (events.length > 0) {
          source = 'Google Search Grounded Macro Calendar';
        }
      } catch {
        // keep empty -> client falls back safely
      }
    }

    // Preserve actual released values while strictly converting any unreleased/'Pending' entries to '-'
    events = normalizeCalendarActuals(events);

    const futureEvents = events
      .filter((e) => Date.parse(e.isoDate) > now && e.impact !== 'HOLIDAY')
      .sort((a, b) => Date.parse(a.isoDate) - Date.parse(b.isoDate));
    const upcomingCatalyst =
      futureEvents.find((e) => e.impact === 'HIGH') ??
      futureEvents.find((e) => e.impact === 'MED') ??
      futureEvents[0] ??
      null;

    const nextCatalyst = upcomingCatalyst
      ? {
          title: upcomingCatalyst.title,
          currency: upcomingCatalyst.currency,
          timeWib: upcomingCatalyst.timeWib,
          targetEpochMs: Date.parse(upcomingCatalyst.isoDate),
          description: upcomingCatalyst.description,
        }
      : null;

    const payload: LiveCalendarResponse = {
      events,
      nextCatalyst,
      source,
      updatedAt: new Date().toISOString(),
    };

    const calLatency = Date.now() - calStart;
    if (events.length > 0) {
      const ttl = win.preset === 'this_week' ? 90_000 : 180_000;
      const entry = { data: payload, expiresAt: now + ttl };
      if (win.preset === 'this_week') {
        calendarCache.entry = entry;
      } else {
        calendarRangeCache.set(win.cacheKey, entry);
      }
      const isFailoverCal = !source.includes('ForexFactory');
      updateProviderMetric('news_cal', {
        status: isFailoverCal ? 'failover' : 'live',
        activeSource: `RSS + ${source}`,
        latencyMs: calLatency,
        lastSuccessAt: Date.now(),
        isCachedFallback: false,
        fallbackReason: isFailoverCal ? `Calendar fell back to ${source}` : undefined,
      });
    } else if (fallbackEntry) {
      updateProviderMetric('news_cal', {
        status: 'cached',
        activeSource: 'Cached ForexFactory Calendar Snapshot',
        latencyMs: calLatency,
        isCachedFallback: true,
        fallbackReason: 'Macro calendar upstream failed; serving cached schedule',
      });
      return fallbackEntry;
    }
    return payload;
  });
}

type InternalMover = StockMover & {
  dollarTurnover: number;
  marketCap?: number;
  relativeVolume?: number;
};

function formatIdrFlowLabel(amountIdr: number): string {
  const abs = Math.abs(amountIdr);
  const sign = amountIdr >= 0 ? '+' : '-';
  if (abs >= 1e12) return `${sign}Rp ${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}Rp ${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}Rp ${(abs / 1e6).toFixed(1)}M`;
  return `${sign}Rp ${Math.round(abs).toLocaleString('en-US')}`;
}

const US_INDEX_CORE_CONSTITUENTS = new Set([
  'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'AVGO', 'TSLA', 'BRK.B',
  'LLY', 'JPM', 'V', 'WMT', 'MA', 'XOM', 'UNH', 'ORCL', 'COST', 'HD', 'PG', 'NFLX',
  'AMD', 'CRM', 'BAC', 'CVX', 'KO', 'PEP', 'TMO', 'ABBV', 'CSCO', 'ADBE', 'INTC',
  'QCOM', 'TXN', 'AMAT', 'MU', 'PLTR', 'PANW', 'GS', 'MS', 'CAT', 'DIS', 'UBER',
  'NOW', 'INTU', 'ISRG', 'LIN', 'BLK', 'TMUS', 'AMGN', 'SBUX', 'BA', 'ARM', 'CRWD',
  'SNOW', 'MRVL', 'KLAC', 'LRCX', 'ASML', 'IBM', 'GE', 'RTX', 'PM', 'AXP',
]);

const IDX_INDEX_CORE_CONSTITUENTS = new Set([
  'BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'BREN', 'TPIA', 'AMMN', 'BYAN',
  'DSSA', 'DCII', 'CUAN', 'PANI', 'UNTR', 'ADRO', 'ICBP', 'INDF', 'KLBF', 'CPIN',
  'PGAS', 'PTBA', 'MDKA', 'ANTM', 'INCO', 'GOTO', 'BRIS', 'ISAT', 'EXCL', 'SMGR',
  'MYOR', 'MAPI', 'AMRT', 'MBMA', 'NCKL', 'MEDC', 'AKRA', 'INKP', 'TKIM', 'ITMG',
]);

const NON_INDEX_EXCLUSION_SYMBOLS = new Set([
  'ANT', 'SPCX', 'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'SQQQ', 'TQQQ', 'SOXL', 'SOXS',
]);

async function fetchTradingViewScan(
  region: 'america' | 'indonesia',
  sortBy: string,
  sortOrder: 'asc' | 'desc',
  extraFilters: Array<Record<string, unknown>> = [],
  limit = 25
): Promise<InternalMover[]> {
  try {
    const baseFilters: Array<Record<string, unknown>> = [
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'subtype', operation: 'equal', right: 'common' },
      { left: 'is_primary', operation: 'equal', right: true },
      { left: 'close', operation: 'greater', right: region === 'indonesia' ? 60 : 5 },
      { left: 'volume', operation: 'greater', right: region === 'indonesia' ? 100_000 : 300_000 },
      ...extraFilters,
    ];
    const res = await fetch(`https://scanner.tradingview.com/${region}/scan`, {
      method: 'POST',
      headers: {
        ...UA_HEADERS,
        'Content-Type': 'application/json',
        Origin: 'https://www.tradingview.com',
        Referer: 'https://www.tradingview.com/',
      },
      body: JSON.stringify({
        filter: baseFilters,
        options: { lang: 'en' },
        markets: [region],
        columns: [
          'name',
          'description',
          'close',
          'change',
          'change_abs',
          'high',
          'low',
          'volume',
          'Value.Traded',
          'exchange',
          'market_cap_basic',
          'relative_volume_10d_calc',
        ],
        sort: { sortBy, sortOrder },
        range: [0, limit],
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: Array<{ s?: string; d?: Array<string | number | null> }>;
    };

    const out: InternalMover[] = [];
    for (const row of json.data ?? []) {
      const d = row.d;
      if (!d || d.length < 9) continue;
      const symbol = String(d[0] || '').trim().toUpperCase();
      if (!symbol || NON_INDEX_EXCLUSION_SYMBOLS.has(symbol)) continue;
      const exchange = String(d[9] || (region === 'indonesia' ? 'IDX' : 'NASDAQ/NYSE'));
      if (region === 'america' && /OTC|PINK/i.test(exchange)) continue;

      const name = String(d[1] || symbol).slice(0, 42);
      const close = Number(d[2]);
      const changePct = Number(d[3]);
      const changeAbs = Number(d[4]);
      const high = Number(d[5] ?? close);
      const low = Number(d[6] ?? close);
      const vol = Number(d[7] ?? 0);
      const valTraded = Number(d[8] ?? close * vol);
      const mcap = Number(d[10] ?? 0);
      const rvol = Number(d[11] ?? 1);

      if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(changePct)) continue;
      const isId = region === 'indonesia';
      const decimals = isId ? 0 : 2;
      const price = isId ? Math.round(close) : Number(close.toFixed(2));
      const safeAbs = Number.isFinite(changeAbs) ? changeAbs : close - close / (1 + changePct / 100);
      const prevRaw = Math.max(0.01, close - safeAbs);
      const prevClose = isId ? Math.max(1, Math.round(prevRaw)) : Number(prevRaw.toFixed(2));
      const chgVal = isId ? Math.round(price - prevClose) : Number((price - prevClose).toFixed(2));
      const consistentPct =
        prevRaw > 0 && Math.abs(((close - prevRaw) / prevRaw) * 100 - changePct) < 0.25
          ? changePct
          : prevClose > 0
            ? ((price - prevClose) / prevClose) * 100
            : changePct;
      const dHigh = isId ? Math.round(high) : Number(high.toFixed(2));
      const dLow = isId ? Math.round(low) : Number(low.toFixed(2));

      out.push({
        symbol,
        name: name.replace(/\s+Tbk\.?$/i, ' Tbk').slice(0, 42),
        market: isId ? 'ID' : 'US',
        exchange: isId ? 'IDX · Jakarta' : exchange,
        currency: isId ? 'IDR' : 'USD',
        price,
        prevClose,
        changeValue: chgVal,
        changePercent: Number(consistentPct.toFixed(2)),
        dayHigh: dHigh,
        dayLow: dLow,
        volume: formatVolume(vol),
        volumeRaw: Number.isFinite(vol) ? vol : 0,
        marketState: getServerSessionInfo(isId ? `${symbol}.JK` : symbol).stateLabel,
        sparklinePoints: [prevClose, Number(((prevClose + dLow) / 2).toFixed(decimals)), dLow, dHigh, price],
        dollarTurnover: Number.isFinite(valTraded) && valTraded > 0 ? valTraded : price * vol,
        marketCap: Number.isFinite(mcap) && mcap > 0 ? mcap : undefined,
        relativeVolume: Number.isFinite(rvol) && rvol > 0 ? rvol : 1,
      });
    }
    return out;
  } catch {
    return [];
  }
}

const IDX_FLAGSHIP_YAHOO_BASKET = [
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK',
  'UNTR.JK', 'ADRO.JK', 'AMMN.JK', 'BREN.JK', 'TPIA.JK', 'ICBP.JK',
  'INDF.JK', 'PGAS.JK', 'PTBA.JK', 'ANTM.JK', 'MDKA.JK', 'KLBF.JK',
  'GOTO.JK', 'BRIS.JK', 'ISAT.JK', 'EXCL.JK',
];

const US_FLAGSHIP_YAHOO_BASKET = [
  'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO',
  'AMD', 'NFLX', 'JPM', 'LLY', 'V', 'XOM', 'UNH', 'ORCL', 'PLTR', 'MU',
];

async function fetchYahooDirectBasket(market: 'US' | 'ID'): Promise<InternalMover[]> {
  const symbols = market === 'ID' ? IDX_FLAGSHIP_YAHOO_BASKET : US_FLAGSHIP_YAHOO_BASKET;
  const isId = market === 'ID';
  const decimals = isId ? 0 : 2;
  const results = await Promise.all(
    symbols.map(async (ySym): Promise<InternalMover | null> => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            ySym
          )}?range=1d&interval=30m`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(4500) }
        );
        if (!res.ok) return null;
        const json = (await res.json()) as {
          chart?: {
            result?: Array<{
              meta?: Record<string, unknown>;
              indicators?: { quote?: Array<{ close?: Array<number | null> }> };
            }>;
          };
        };
        const item = json.chart?.result?.[0];
        const meta = item?.meta;
        if (!meta) return null;
        const rawPrice = Number(meta.regularMarketPrice);
        if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;

        const rawPrev = Number(
          meta.regularMarketPreviousClose ?? meta.previousClose ?? meta.chartPreviousClose ?? rawPrice
        );
        const { prevClose, changeValue, changePercent } = resolveConsistentChange(
          rawPrice,
          rawPrev,
          meta.regularMarketChangePercent,
          decimals,
          false
        );
        const price = isId ? Math.round(rawPrice) : Number(rawPrice.toFixed(2));
        const dayHighRaw = Number(meta.regularMarketDayHigh ?? Math.max(price, prevClose));
        const dayLowRaw = Number(meta.regularMarketDayLow ?? Math.min(price, prevClose));
        const dHigh = isId ? Math.round(dayHighRaw) : Number(dayHighRaw.toFixed(2));
        const dLow = isId ? Math.round(dayLowRaw) : Number(dayLowRaw.toFixed(2));
        const vol = Number(meta.regularMarketVolume ?? 0);
        const closes = (item?.indicators?.quote?.[0]?.close ?? []).filter(
          (v): v is number => typeof v === 'number' && Number.isFinite(v)
        );
        const spark =
          closes.length >= 2
            ? samplePoints([...closes.slice(0, -1), price], 12)
            : [prevClose, dLow, dHigh, price];
        const cleanSym = ySym.replace(/\.JK$/i, '');

        return {
          symbol: cleanSym,
          name: String(meta.shortName || meta.longName || cleanSym).slice(0, 42),
          market,
          exchange: isId ? 'IDX · Jakarta' : String(meta.fullExchangeName || meta.exchangeName || 'NASDAQ/NYSE'),
          currency: isId ? 'IDR' : 'USD',
          price,
          prevClose,
          changeValue,
          changePercent,
          dayHigh: dHigh,
          dayLow: dLow,
          volume: formatVolume(vol),
          volumeRaw: Number.isFinite(vol) ? vol : 0,
          marketState: getServerSessionInfo(ySym).stateLabel,
          sparklinePoints: spark,
          dollarTurnover: price * Math.max(1, vol),
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is InternalMover => r !== null);
}

async function fetchTradingViewIdxByTickers(
  tickers: string[]
): Promise<Map<string, InternalMover>> {
  const map = new Map<string, InternalMover>();
  if (tickers.length === 0) return map;
  try {
    const tvTickers = tickers.map((s) => `IDX:${s.replace(/\.JK$/i, '').toUpperCase()}`);
    const res = await fetch('https://scanner.tradingview.com/indonesia/scan', {
      method: 'POST',
      headers: {
        ...UA_HEADERS,
        'Content-Type': 'application/json',
        Origin: 'https://www.tradingview.com',
        Referer: 'https://www.tradingview.com/',
      },
      body: JSON.stringify({
        symbols: { tickers: tvTickers, query: { types: [] } },
        columns: [
          'name',
          'description',
          'close',
          'change',
          'change_abs',
          'high',
          'low',
          'volume',
          'Value.Traded',
          'exchange',
        ],
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return map;
    const json = (await res.json()) as {
      data?: Array<{ s?: string; d?: Array<string | number | null> }>;
    };
    for (const row of json.data ?? []) {
      const d = row.d;
      if (!d || d.length < 8) continue;
      const symbol = String(d[0] || '').trim().toUpperCase();
      const close = Number(d[2]);
      const changePct = Number(d[3]);
      const changeAbs = Number(d[4]);
      const high = Number(d[5] ?? close);
      const low = Number(d[6] ?? close);
      const vol = Number(d[7] ?? 0);
      const valTraded = Number(d[8] ?? close * vol);
      if (!symbol || !Number.isFinite(close) || close <= 0) continue;
      const price = Math.round(close);
      const prevClose = Math.max(1, Math.round(close - changeAbs));
      const dHigh = Math.round(high);
      const dLow = Math.round(low);
      map.set(symbol, {
        symbol,
        name: String(d[1] || symbol).replace(/\s+Tbk\.?$/i, ' Tbk').slice(0, 42),
        market: 'ID',
        exchange: 'IDX · Jakarta',
        currency: 'IDR',
        price,
        prevClose,
        changeValue: Math.round(changeAbs),
        changePercent: Number((Number.isFinite(changePct) ? changePct : 0).toFixed(2)),
        dayHigh: dHigh,
        dayLow: dLow,
        volume: formatVolume(vol),
        volumeRaw: Number.isFinite(vol) ? vol : 0,
        marketState: getServerSessionInfo(`${symbol}.JK`).stateLabel,
        sparklinePoints: [prevClose, Math.round((prevClose + dLow) / 2), dLow, dHigh, price],
        dollarTurnover: Number.isFinite(valTraded) ? valTraded : price * vol,
      });
    }
  } catch {
    // ignore
  }
  return map;
}

async function fetchYahooScreenerStocks(scrId: string): Promise<Array<Record<string, unknown>>> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=US&scrIds=${encodeURIComponent(
      scrId
    )}&count=25`;
    const res = await fetch(url, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      finance?: {
        result?: Array<{
          quotes?: Array<Record<string, unknown>>;
        }>;
      };
    };
    return json.finance?.result?.[0]?.quotes ?? [];
  } catch {
    return [];
  }
}

async function enrichSparklinesForMovers(movers: StockMover[]): Promise<StockMover[]> {
  const uniqueMap = new Map<string, StockMover>();
  for (const m of movers) {
    // Skip if Yahoo basket already supplied multi-point sparkline (>= 6 points)
    if (m.sparklinePoints.length >= 6) continue;
    const ySym = m.market === 'ID' ? `${m.symbol}.JK` : m.symbol;
    if (!uniqueMap.has(ySym) && uniqueMap.size < 32) {
      uniqueMap.set(ySym, m);
    }
  }

  const seriesMap = new Map<string, number[]>();
  await Promise.all(
    Array.from(uniqueMap.entries()).map(async ([ySym, item]) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            ySym
          )}?range=1d&interval=30m`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(2600) }
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          chart?: {
            result?: Array<{
              indicators?: { quote?: Array<{ close?: Array<number | null> }> };
            }>;
          };
        };
        const closes = (json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(
          (v): v is number => typeof v === 'number' && Number.isFinite(v)
        );
        if (closes.length >= 2) {
          seriesMap.set(ySym, samplePoints([...closes.slice(0, -1), item.price], 12));
        }
      } catch {
        // retain existing sparkline
      }
    })
  );

  return movers.map((m) => {
    const ySym = m.market === 'ID' ? `${m.symbol}.JK` : m.symbol;
    const pts = seriesMap.get(ySym);
    return pts ? { ...m, sparklinePoints: pts } : m;
  });
}

function parseYahooQuotesToMovers(quotes: Array<Record<string, unknown>>): InternalMover[] {
  const out: InternalMover[] = [];
  for (const q of quotes) {
    const symbol = String(q.symbol || '').trim().toUpperCase();
    if (!symbol || symbol.includes('=') || symbol.includes('^') || symbol.includes('.') || symbol.length > 6) {
      continue;
    }
    const price = Number(q.regularMarketPrice);
    const prevClose = Number(q.regularMarketPreviousClose ?? price);
    const changePercent = Number(q.regularMarketChangePercent);
    const changeValue = Number(q.regularMarketChange ?? price - prevClose);
    const volumeRaw = Number(q.regularMarketVolume ?? 0);
    if (!Number.isFinite(price) || price < 2 || !Number.isFinite(changePercent) || volumeRaw < 250_000) {
      continue;
    }
    const dayHigh = Number(q.regularMarketDayHigh ?? Math.max(price, prevClose));
    const dayLow = Number(q.regularMarketDayLow ?? Math.min(price, prevClose));
    const name = String(q.shortName || q.longName || symbol).slice(0, 42);
    const exchange = String(q.fullExchangeName || q.exchange || 'NASDAQ/NYSE');

    out.push({
      symbol,
      name,
      market: 'US',
      exchange,
      currency: 'USD',
      price: Number(price.toFixed(2)),
      prevClose: Number(prevClose.toFixed(2)),
      changeValue: Number(changeValue.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
      dayHigh: Number(dayHigh.toFixed(2)),
      dayLow: Number(dayLow.toFixed(2)),
      volume: formatVolume(volumeRaw),
      volumeRaw,
      marketState: String(q.marketState || 'POST'),
      sparklinePoints: [
        Number(prevClose.toFixed(2)),
        Number(((prevClose + dayLow) / 2).toFixed(2)),
        Number(dayLow.toFixed(2)),
        Number(dayHigh.toFixed(2)),
        Number(price.toFixed(2)),
      ],
      dollarTurnover: price * volumeRaw,
    });
  }
  return out;
}

interface ParsedForeignEntry {
  symbol: string;
  companyName: string;
  amountIdr: number;
  side: 'BUY' | 'SELL';
  sourceLabel: string;
}

function parseIndonesianUnitMultiplier(unitRaw: string): number {
  const u = unitRaw.toLowerCase();
  if (u.includes('triliun')) return 1e12;
  if (u.includes('miliar') || u === 'm') return 1e9;
  if (u.includes('juta')) return 1e6;
  return 1e9;
}

function parseForeignListFromArticleHtml(
  html: string,
  expectedSide: 'BUY' | 'SELL',
  sourceLabel: string
): ParsedForeignEntry[] {
  const cleanText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  const pattern =
    /((?:PT\.?\s+)?[A-Za-z0-9.,&'()\-\s]{3,80}?)\s*\(([A-Z]{4})\)\s*[:\-]\s*(-?)Rp\.?\s*([0-9.,]+)\s*(triliun|miliar|juta|M)/gi;

  const entries: ParsedForeignEntry[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleanText)) !== null) {
    const rawCompany = match[1].replace(/^.*?:\s*/, '').trim();
    const symbol = match[2].toUpperCase();
    const hasMinus = match[3] === '-';
    const numStr = match[4].replace(/\./g, '').replace(',', '.');
    const numVal = parseFloat(numStr);
    const mult = parseIndonesianUnitMultiplier(match[5]);
    if (!symbol || !Number.isFinite(numVal) || numVal <= 0 || seen.has(symbol)) continue;

    seen.add(symbol);
    const magIdr = numVal * mult;
    const signedAmount = expectedSide === 'SELL' || hasMinus ? -Math.abs(magIdr) : Math.abs(magIdr);

    entries.push({
      symbol,
      companyName: rawCompany.slice(0, 42),
      amountIdr: signedAmount,
      side: expectedSide,
      sourceLabel,
    });
    if (entries.length >= 10) break;
  }
  return entries;
}

async function fetchIdxForeignFlowLists(): Promise<{
  foreignBuy: StockMover[];
  foreignSell: StockMover[];
}> {
  const candidateBuyUrls: { url: string; label: string }[] = [];
  const candidateSellUrls: { url: string; label: string }[] = [];

  try {
    const [rssHtml, tagHtml, tagBuyHtml] = await Promise.all([
      fetch('https://www.cnbcindonesia.com/market/rss', {
        headers: UA_HEADERS,
        signal: AbortSignal.timeout(6000),
      })
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => ''),
      fetch('https://www.cnbcindonesia.com/tag/investor-asing', {
        headers: UA_HEADERS,
        signal: AbortSignal.timeout(6000),
      })
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => ''),
      fetch('https://www.cnbcindonesia.com/tag/net-foreign-buy', {
        headers: UA_HEADERS,
        signal: AbortSignal.timeout(6000),
      })
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => ''),
    ]);

    const seenUrls = new Set<string>();
    const addCandidate = (url: string, titleHint: string) => {
      const clean = url.trim();
      if (!clean || seenUrls.has(clean)) return;
      seenUrls.add(clean);
      const lower = `${clean} ${titleHint}`.toLowerCase();
      const sessionHint = lower.includes('sesi-i') || lower.includes('sesi i')
        ? 'IDX Session I'
        : 'IDX Foreign Flow';
      if (/(borong|beli|serbu|net-foreign-buy|diminati).*10|10-saham-ini.*(borong|sesi|loyo)/i.test(lower) && !/lepas|keluar|jual|buang/i.test(lower)) {
        candidateBuyUrls.push({ url: clean, label: sessionHint });
      } else if (/(lepas|keluar|jual|buang|net-foreign-sell).*10|10-saham-ini.*(lepas|keluar|jual)/i.test(lower)) {
        candidateSellUrls.push({ url: clean, label: sessionHint });
      }
    };

    for (const itemMatch of rssHtml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = itemMatch[1];
      const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '');
      const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
      if (/asing/i.test(title) && /10 saham/i.test(title)) {
        addCandidate(link, title);
      }
    }

    for (const htmlChunk of [tagHtml, tagBuyHtml]) {
      const links = htmlChunk.match(/https:\/\/www\.cnbcindonesia\.com\/market\/[0-9\-]+\/[a-z0-9\-]+/gi) ?? [];
      for (const link of links) {
        addCandidate(link, link);
      }
    }
  } catch {
    // ignore discovery error
  }

  let buyEntries: ParsedForeignEntry[] = [];
  let sellEntries: ParsedForeignEntry[] = [];

  for (const cand of candidateBuyUrls.slice(0, 4)) {
    try {
      const html = await fetch(cand.url, { headers: UA_HEADERS, signal: AbortSignal.timeout(5500) }).then((r) =>
        r.ok ? r.text() : ''
      );
      const parsed = parseForeignListFromArticleHtml(html, 'BUY', cand.label);
      if (parsed.length >= 3) {
        buyEntries = parsed;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  for (const cand of candidateSellUrls.slice(0, 4)) {
    try {
      const html = await fetch(cand.url, { headers: UA_HEADERS, signal: AbortSignal.timeout(5500) }).then((r) =>
        r.ok ? r.text() : ''
      );
      const parsed = parseForeignListFromArticleHtml(html, 'SELL', cand.label);
      if (parsed.length >= 3) {
        sellEntries = parsed;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  const allTickers = Array.from(
    new Set([...buyEntries.map((e) => e.symbol), ...sellEntries.map((e) => e.symbol)])
  );
  const tvQuotes = await fetchTradingViewIdxByTickers(allTickers);

  const mapEntryToMover = (entry: ParsedForeignEntry): StockMover => {
    const q = tvQuotes.get(entry.symbol);
    const price = q?.price ?? 0;
    const prevClose = q?.prevClose ?? price;
    return {
      symbol: entry.symbol,
      name: q?.name || entry.companyName,
      market: 'ID',
      exchange: 'IDX · Jakarta',
      currency: 'IDR',
      price,
      prevClose,
      changeValue: q?.changeValue ?? 0,
      changePercent: q?.changePercent ?? 0,
      dayHigh: q?.dayHigh ?? price,
      dayLow: q?.dayLow ?? price,
      volume: q?.volume ?? '—',
      volumeRaw: q?.volumeRaw ?? 0,
      marketState: q?.marketState ?? getServerSessionInfo(`${entry.symbol}.JK`).stateLabel,
      sparklinePoints: q?.sparklinePoints ?? [prevClose || 100, price || 100],
      foreignNetAmount: entry.amountIdr,
      foreignNetLabel: formatIdrFlowLabel(entry.amountIdr),
      foreignFlowSide: entry.side,
      foreignSourceLabel: entry.sourceLabel,
    };
  };

  const rawBuy = buyEntries.map(mapEntryToMover).slice(0, 10);
  const rawSell = sellEntries.map(mapEntryToMover).slice(0, 10);

  const enrichedAll = await enrichSparklinesForMovers([...rawBuy, ...rawSell]);
  return {
    foreignBuy: enrichedAll.slice(0, rawBuy.length),
    foreignSell: enrichedAll.slice(rawBuy.length),
  };
}

// Track latest IDX daily net foreign flow map for cross-module Bandarmology fusion
const latestIdxForeignFlowMap = new Map<string, number>();
const idxBandarmologyCache = new Map<
  string,
  { data: BandarmologyAnalysis; expiresAt: number }
>();

function computeIdxBandarmologyFromBars(params: {
  symbol: string;
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  opens: number[];
  currentPrice?: number;
  prevClose?: number;
  foreignNetAmount?: number;
}): BandarmologyAnalysis {
  const {
    closes,
    highs,
    lows,
    volumes,
    opens,
    currentPrice,
    prevClose,
    foreignNetAmount,
  } = params;

  const n = Math.min(closes.length, highs.length, lows.length, volumes.length);
  if (n === 0) {
    return {
      phase: 'Neutral',
      score: 0,
      volumeRatio: 1,
      accumulationPressure: 50,
      foreignBias:
        typeof foreignNetAmount === 'number'
          ? foreignNetAmount > 0
            ? 'Net Buy'
            : foreignNetAmount < 0
              ? 'Net Sell'
              : 'Balanced'
          : 'Balanced',
      summary: 'Awaiting multi-session OHLCV turnover bars for smart-money flow.',
    };
  }

  let totalVol = 0;
  let cmfNumerator = 0;
  let recent5Vol = 0;
  let recent5CmfNum = 0;
  let priorVol = 0;
  let priorCmfNum = 0;
  const split5 = Math.max(0, n - 5);

  for (let i = 0; i < n; i++) {
    const c = closes[i];
    const h = Math.max(highs[i], c);
    const l = Math.min(lows[i], c);
    const v = Math.max(0, volumes[i]);
    const hlSpan = Math.max(1e-6, h - l);
    const clv = ((c - l) - (h - c)) / hlSpan;
    const mfVol = clv * v;
    totalVol += v;
    cmfNumerator += mfVol;
    if (i >= split5) {
      recent5Vol += v;
      recent5CmfNum += mfVol;
    } else {
      priorVol += v;
      priorCmfNum += mfVol;
    }
  }

  const cmf20 = totalVol > 0 ? cmfNumerator / totalVol : 0; // -1 .. +1
  const cmf5 = recent5Vol > 0 ? recent5CmfNum / recent5Vol : cmf20;
  const cmfPrior = priorVol > 0 ? priorCmfNum / priorVol : cmf20;
  const cmfAccel = cmf5 - cmfPrior;

  const avgVol20 = n > 1 ? volumes.slice(0, n - 1).reduce((s, v) => s + v, 0) / (n - 1) : volumes[0] || 1;
  const lastVol = volumes[n - 1] || avgVol20;
  const volumeRatio = avgVol20 > 0 ? Number(Math.max(0.2, Math.min(6, lastVol / avgVol20)).toFixed(2)) : 1;

  // Last bar close strength & spread absorption
  const lastClose = currentPrice && currentPrice > 0 ? currentPrice : closes[n - 1];
  const lastOpen = opens[n - 1] ?? prevClose ?? lastClose;
  const lastHigh = Math.max(highs[n - 1] ?? lastClose, lastClose, lastOpen);
  const lastLow = Math.min(lows[n - 1] ?? lastClose, lastClose, lastOpen);
  const lastClv = ((lastClose - lastLow) - (lastHigh - lastClose)) / Math.max(1e-6, lastHigh - lastLow);
  const dayChgPct =
    prevClose && prevClose > 0
      ? ((lastClose - prevClose) / prevClose) * 100
      : n >= 2 && closes[n - 2] > 0
        ? ((lastClose - closes[n - 2]) / closes[n - 2]) * 100
        : 0;

  // Absorption: high volume with tight negative/flat price OR clean positive CLV acceleration
  const volBoost = Math.min(1.65, Math.max(0.65, 0.75 + (volumeRatio - 0.85) * 0.48));

  const cmfComponent = cmf20 * 52;
  const accelComponent = cmfAccel * 38 * volBoost;
  const priceVolumeComponent =
    (lastClv * 18 + Math.max(-1.5, Math.min(1.5, dayChgPct / 2.2)) * 12) * volBoost;

  const netFlow = typeof foreignNetAmount === 'number' ? foreignNetAmount : undefined;
  let foreignComponent = 0;
  let foreignBias: BandarmologyAnalysis['foreignBias'] = 'Balanced';
  if (typeof netFlow === 'number' && Math.abs(netFlow) > 100_000_000) {
    if (netFlow > 0) {
      foreignBias = 'Net Buy';
      foreignComponent = Math.min(26, 10 + Math.log10(Math.max(1, netFlow / 1e9)) * 7);
    } else {
      foreignBias = 'Net Sell';
      foreignComponent = -Math.min(26, 10 + Math.log10(Math.max(1, Math.abs(netFlow) / 1e9)) * 7);
    }
  } else if (cmf5 >= 0.14 && volumeRatio >= 1.15) {
    foreignBias = 'Net Buy';
  } else if (cmf5 <= -0.14 && volumeRatio >= 1.15) {
    foreignBias = 'Net Sell';
  }

  const rawScore = cmfComponent + accelComponent + priceVolumeComponent + foreignComponent;
  const score = Math.round(Math.max(-100, Math.min(100, rawScore)));
  const accumulationPressure = Math.round(Math.max(4, Math.min(96, 50 + cmf20 * 35 + cmf5 * 22)));

  let phase: BandarmologyPhase = 'Neutral';
  if (score >= 34 && (cmf20 >= 0.08 || foreignComponent >= 14 || (volumeRatio >= 1.25 && score >= 36))) {
    phase = 'Strong Accumulation';
  } else if (score >= 10 || (cmfAccel >= 0.08 && lastClv >= 0.1 && volumeRatio >= 1.0)) {
    phase = 'Early Accumulation';
  } else if (score <= -34 && (cmf20 <= -0.08 || foreignComponent <= -14 || (volumeRatio >= 1.25 && score <= -36))) {
    phase = 'Strong Distribution';
  } else if (score <= -10 || (cmfAccel <= -0.08 && lastClv <= -0.1 && volumeRatio >= 1.0)) {
    phase = 'Early Distribution';
  }

  const biasText =
    foreignBias === 'Balanced' ? 'Domestic flow balanced' : `Foreign ${foreignBias}`;
  const summary = `${phase} · ${volumeRatio.toFixed(2)}x 20D vol, CMF ${(cmf20 * 100).toFixed(0)}%, ${biasText}.`;

  return {
    phase,
    score,
    volumeRatio,
    accumulationPressure,
    foreignBias,
    summary,
  };
}

const equityFlowAndTradePlanCache = new Map<
  string,
  { data: { bandarmology: BandarmologyAnalysis; tradePlan: StockTradePlan }; expiresAt: number }
>();

function snapStockTickServer(rawPrice: number, currency: 'USD' | 'IDR'): number {
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return 0;
  if (currency === 'USD') return Number(rawPrice.toFixed(2));
  const step =
    rawPrice < 200 ? 1 : rawPrice < 500 ? 2 : rawPrice < 2000 ? 5 : rawPrice < 5000 ? 10 : 25;
  return Math.max(50, Math.round(rawPrice / step) * step);
}

function fmtStockLevelServer(price: number, currency: 'USD' | 'IDR'): string {
  const snapped = snapStockTickServer(price, currency);
  if (currency === 'IDR') return `Rp ${snapped.toLocaleString('en-US')}`;
  return `$${snapped.toFixed(2)}`;
}

function computeEquityTradePlanFromBars(params: {
  symbol: string;
  currency: 'USD' | 'IDR';
  closes: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  volumes: number[];
  currentPrice: number;
  prevClose: number;
  dayHigh: number;
  dayLow: number;
  bandar: BandarmologyAnalysis;
  foreignNetAmount?: number;
  foreignFlowSide?: 'BUY' | 'SELL';
}): StockTradePlan {
  const {
    currency,
    closes,
    highs,
    lows,
    opens,
    currentPrice,
    prevClose,
    dayHigh,
    dayLow,
    bandar,
    foreignNetAmount,
    foreignFlowSide,
  } = params;

  const price = currentPrice > 0 ? currentPrice : closes[closes.length - 1] || prevClose || 100;
  const n = Math.min(closes.length, highs.length, lows.length);

  // 14-day ATR + 20D range
  let atrSum = 0;
  let atrCount = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    if (Number.isFinite(tr) && tr > 0) {
      atrSum += tr;
      atrCount += 1;
    }
  }
  const daySpan = Math.max(Math.abs(dayHigh - dayLow), price * 0.014);
  const atr = atrCount > 0 ? Math.max(atrSum / atrCount, price * 0.01) : daySpan * 1.15;

  // Identify technical Supply & Demand base zones from 3-month swing structure
  const swingWindowStart = Math.max(0, n - 45);
  const histHigh = n > 0 ? Math.max(...highs.slice(swingWindowStart), dayHigh, price) : Math.max(dayHigh, price * 1.03);
  const histLow = n > 0 ? Math.min(...lows.slice(swingWindowStart), dayLow, price) : Math.min(dayLow, price * 0.97);

  // 20D & 50D EMA trend filter over 3mo daily closes
  const computeEma = (arr: number[], period: number): number => {
    if (arr.length === 0) return price;
    const k = 2 / (period + 1);
    let ema = arr[0];
    for (let i = 1; i < arr.length; i++) {
      ema = arr[i] * k + ema * (1 - k);
    }
    return ema;
  };
  const ema20Num = Number(computeEma(closes.slice(-40), 20).toFixed(currency === 'IDR' ? 0 : 2));
  const ema50Num = Number(computeEma(closes, 50).toFixed(currency === 'IDR' ? 0 : 2));
  const trendFilterLabel: StockTradePlan['trendFilterLabel'] =
    ema20Num > ema50Num * 1.003 && price >= ema20Num * 0.985
      ? 'Uptrend (EMA20 > EMA50)'
      : ema20Num < ema50Num * 0.997 && price <= ema20Num * 1.015
        ? 'Downtrend (EMA20 < EMA50)'
        : 'Neutral';

  let demandLow = histLow;
  let demandHigh = Math.min(price * 0.996, histLow + atr * 0.65);
  let supplyHigh = histHigh;
  let supplyLow = Math.max(price * 1.004, histHigh - atr * 0.65);

  // Scan Rally-Base-Rally / Drop-Base-Rally demand origins over 45 trading days (~2+ months)
  for (let i = Math.max(1, n - 45); i < n - 1; i++) {
    const dispUp = closes[i + 1] - closes[i];
    if (dispUp >= atr * 0.6 && lows[i] <= price * 1.015) {
      const zLow = lows[i];
      const zHigh = Math.max(opens[i] ?? closes[i], closes[i]);
      if (zHigh < price * 1.01 && zLow > demandLow) {
        demandLow = zLow;
        demandHigh = Math.max(zLow + atr * 0.28, Math.min(zHigh, zLow + atr * 0.75));
      }
    }
    const dispDown = closes[i] - closes[i + 1];
    if (dispDown >= atr * 0.6 && highs[i] >= price * 0.985) {
      const zHigh = highs[i];
      const zLow = Math.min(opens[i] ?? closes[i], closes[i]);
      if (zLow > price * 0.99 && zHigh < supplyHigh) {
        supplyHigh = zHigh;
        supplyLow = Math.min(zHigh - atr * 0.28, Math.max(zLow, zHigh - atr * 0.75));
      }
    }
  }

  // Enforce clean ordering Demand < Supply with viable spread
  if (demandHigh >= supplyLow - atr * 0.6) {
    demandLow = Math.min(dayLow, price - atr * 1.1);
    demandHigh = price - atr * 0.35;
    supplyLow = price + atr * 0.45;
    supplyHigh = Math.max(dayHigh, price + atr * 1.25);
  }

  const snappedDemLow = snapStockTickServer(demandLow, currency);
  const snappedDemHigh = snapStockTickServer(Math.max(demandHigh, demandLow + atr * 0.25), currency);
  const snappedSupLow = snapStockTickServer(supplyLow, currency);
  const snappedSupHigh = snapStockTickServer(Math.max(supplyHigh, supplyLow + atr * 0.25), currency);

  const zoneSpan = Math.max(atr * 0.8, snappedSupLow - snappedDemHigh);
  const posInSd = (price - snappedDemHigh) / Math.max(1e-6, zoneSpan); // <=0.35 near demand, >=0.65 near supply
  const chgPct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
  const effectiveForeignSide =
    foreignFlowSide ??
    (typeof foreignNetAmount === 'number'
      ? foreignNetAmount > 0
        ? 'BUY'
        : foreignNetAmount < 0
          ? 'SELL'
          : undefined
      : bandar.foreignBias === 'Net Buy'
        ? 'BUY'
        : bandar.foreignBias === 'Net Sell'
          ? 'SELL'
          : undefined);

  // Multi-pillar fusion score (-100 .. +100): Bandarmology (40%) + Flow (20%) + S/D Location (25%) + EMA20/50 Trend (15%)
  const bandarPts = (bandar.score / 100) * 40;
  const flowPts =
    (effectiveForeignSide === 'BUY' ? 12 : effectiveForeignSide === 'SELL' ? -12 : 0) +
    ((bandar.accumulationPressure - 50) / 50) * 8;
  const sdLocationPts =
    posInSd <= 0.32 ? 20 : posInSd >= 0.72 ? -20 : (0.5 - posInSd) * 16;
  const trendPts =
    trendFilterLabel === 'Uptrend (EMA20 > EMA50)'
      ? 14
      : trendFilterLabel === 'Downtrend (EMA20 < EMA50)'
        ? -14
        : 0;
  const tapeConfirm =
    bandar.volumeRatio >= 1.15 && Math.abs(chgPct) >= 0.5
      ? chgPct > 0
        ? 8
        : -8
      : 0;

  const netScore = bandarPts + flowPts + sdLocationPts + trendPts + tapeConfirm;
  const bullishBias =
    (netScore >= 14 || (bandar.score >= 22 && effectiveForeignSide !== 'SELL')) &&
    !(trendFilterLabel === 'Downtrend (EMA20 < EMA50)' && bandar.score < 32);
  const bearishBias =
    (netScore <= -14 || (bandar.score <= -22 && effectiveForeignSide !== 'BUY')) &&
    !(trendFilterLabel === 'Uptrend (EMA20 > EMA50)' && bandar.score > -32);

  let action: StockExecutionAction = 'WAIT';
  let entryPrice = price;
  let stopLoss = snappedDemLow;
  let takeProfit1 = snappedSupLow;
  let takeProfit2 = snappedSupHigh;
  let strategyTag = 'Zone Equilibrium Watch';
  let executionNote = '';

  const roomToSupply = (snappedSupLow - price) / Math.max(1e-6, price - (snappedDemLow - atr * 0.25));
  const roomToDemand = (price - snappedDemHigh) / Math.max(1e-6, snappedSupHigh + atr * 0.25 - price);

  if (bullishBias && (posInSd <= 0.62 || (bandar.volumeRatio >= 1.25 && roomToSupply >= 1.15))) {
    action = 'BUY';
    const isInDemand = price <= snappedDemHigh * 1.008;
    entryPrice = snapStockTickServer(
      isInDemand ? price : Math.min(price, snappedDemHigh + atr * 0.3),
      currency
    );
    const rawSl = Math.min(snappedDemLow - atr * 0.22, entryPrice * 0.978);
    stopLoss = snapStockTickServer(rawSl, currency);
    if (stopLoss >= entryPrice) stopLoss = snapStockTickServer(entryPrice * 0.975, currency);

    const risk = Math.max(currency === 'IDR' ? 10 : 0.25, entryPrice - stopLoss);
    takeProfit1 = snapStockTickServer(Math.max(snappedSupLow, entryPrice + risk * 1.6), currency);
    takeProfit2 = snapStockTickServer(Math.max(snappedSupHigh, takeProfit1 + risk * 0.9), currency);
    strategyTag = isInDemand ? 'Acc + Demand Reclaim' : 'Flow Breakout Continuation';
    executionNote = `EXECUTE BUY @ ${fmtStockLevelServer(entryPrice, currency)} · Target ${fmtStockLevelServer(takeProfit1, currency)} / ${fmtStockLevelServer(takeProfit2, currency)} · Cut loss if close < ${fmtStockLevelServer(stopLoss, currency)}`;
  } else if (bearishBias && (posInSd >= 0.38 || (bandar.volumeRatio >= 1.25 && roomToDemand >= 1.15))) {
    action = 'SELL';
    const isInSupply = price >= snappedSupLow * 0.992;
    entryPrice = snapStockTickServer(
      isInSupply ? price : Math.max(price, snappedSupLow - atr * 0.3),
      currency
    );
    const rawSl = Math.max(snappedSupHigh + atr * 0.22, entryPrice * 1.022);
    stopLoss = snapStockTickServer(rawSl, currency);
    if (stopLoss <= entryPrice) stopLoss = snapStockTickServer(entryPrice * 1.025, currency);

    const risk = Math.max(currency === 'IDR' ? 10 : 0.25, stopLoss - entryPrice);
    takeProfit1 = snapStockTickServer(Math.max(currency === 'IDR' ? 50 : 1, Math.min(snappedDemHigh, entryPrice - risk * 1.6)), currency);
    takeProfit2 = snapStockTickServer(Math.max(currency === 'IDR' ? 50 : 1, Math.min(snappedDemLow, takeProfit1 - risk * 0.9)), currency);
    strategyTag = isInSupply ? 'Dist + Supply Rejection' : 'Flow Breakdown Continuation';
    executionNote = `EXECUTE SELL / TP @ ${fmtStockLevelServer(entryPrice, currency)} · Downside ${fmtStockLevelServer(takeProfit1, currency)} / ${fmtStockLevelServer(takeProfit2, currency)} · Invalid > ${fmtStockLevelServer(stopLoss, currency)}`;
  } else {
    action = 'WAIT';
    const leanBull = netScore >= 0;
    if (leanBull) {
      entryPrice = snapStockTickServer((snappedDemLow + snappedDemHigh) / 2, currency);
      stopLoss = snapStockTickServer(Math.min(snappedDemLow - atr * 0.25, entryPrice * 0.975), currency);
      const risk = Math.max(currency === 'IDR' ? 10 : 0.25, entryPrice - stopLoss);
      takeProfit1 = snapStockTickServer(Math.max(snappedSupLow, entryPrice + risk * 1.8), currency);
      takeProfit2 = snapStockTickServer(Math.max(snappedSupHigh, takeProfit1 + risk), currency);
      strategyTag = posInSd > 0.62 ? 'Wait Demand Pullback' : 'Await Flow Confirmation';
      executionNote = `WAIT: Do not chase mid-range. Place Buy Limit in Demand ${fmtStockLevelServer(snappedDemLow, currency)}–${fmtStockLevelServer(snappedDemHigh, currency)} with SL ${fmtStockLevelServer(stopLoss, currency)}.`;
    } else {
      entryPrice = snapStockTickServer((snappedSupLow + snappedSupHigh) / 2, currency);
      stopLoss = snapStockTickServer(Math.max(snappedSupHigh + atr * 0.25, entryPrice * 1.025), currency);
      const risk = Math.max(currency === 'IDR' ? 10 : 0.25, stopLoss - entryPrice);
      takeProfit1 = snapStockTickServer(Math.max(currency === 'IDR' ? 50 : 1, Math.min(snappedDemHigh, entryPrice - risk * 1.8)), currency);
      takeProfit2 = snapStockTickServer(Math.max(currency === 'IDR' ? 50 : 1, Math.min(snappedDemLow, takeProfit1 - risk)), currency);
      strategyTag = posInSd < 0.38 ? 'Wait Supply Bounce' : 'Await Distribution Break';
      executionNote = `WAIT: Hold entries. Watch Supply ${fmtStockLevelServer(snappedSupLow, currency)}–${fmtStockLevelServer(snappedSupHigh, currency)} for Sell/Trim with SL ${fmtStockLevelServer(stopLoss, currency)}.`;
    }
  }

  const riskAbs = Math.max(1e-6, Math.abs(entryPrice - stopLoss));
  const rewardAbs = Math.abs(takeProfit1 - entryPrice);
  const rr = Math.max(1.1, rewardAbs / riskAbs);
  const conviction = Math.round(Math.max(38, Math.min(94, 48 + Math.abs(netScore) * 0.62)));

  const entryZoneLow = action === 'SELL' ? entryPrice : snapStockTickServer(entryPrice - atr * 0.12, currency);
  const entryZoneHigh = action === 'BUY' ? entryPrice : snapStockTickServer(entryPrice + atr * 0.12, currency);

  return {
    action,
    conviction,
    strategyTag,
    entryPrice,
    entryZoneLabel:
      entryZoneLow === entryZoneHigh
        ? fmtStockLevelServer(entryPrice, currency)
        : `${fmtStockLevelServer(Math.min(entryZoneLow, entryZoneHigh), currency)} – ${fmtStockLevelServer(Math.max(entryZoneLow, entryZoneHigh), currency)}`,
    takeProfit1,
    takeProfit2,
    stopLoss,
    riskReward: `1:${rr.toFixed(1)}`,
    demandZoneLabel: `${fmtStockLevelServer(snappedDemLow, currency)} – ${fmtStockLevelServer(snappedDemHigh, currency)}`,
    supplyZoneLabel: `${fmtStockLevelServer(snappedSupLow, currency)} – ${fmtStockLevelServer(snappedSupHigh, currency)}`,
    bandarFlowBias: `${bandar.phase} · ${bandar.volumeRatio.toFixed(1)}x Vol · ${bandar.foreignBias}`,
    executionNote,
    demandLowNum: snappedDemLow,
    demandHighNum: snappedDemHigh,
    supplyLowNum: snappedSupLow,
    supplyHighNum: snappedSupHigh,
    ema20Num,
    ema50Num,
    trendFilterLabel,
  };
}

async function fetchEquityBandarmologyAndZonesMap(
  tickerList: Array<{
    symbol: string;
    market: 'US' | 'ID';
    price: number;
    prevClose: number;
    dayHigh: number;
    dayLow: number;
    foreignNetAmount?: number;
    foreignFlowSide?: 'BUY' | 'SELL';
  }>
): Promise<Map<string, { bandarmology: BandarmologyAnalysis; tradePlan: StockTradePlan }>> {
  const out = new Map<string, { bandarmology: BandarmologyAnalysis; tradePlan: StockTradePlan }>();
  const now = Date.now();

  const uniqueMap = new Map<
    string,
    {
      cacheKey: string;
      symbol: string;
      yahooSymbol: string;
      market: 'US' | 'ID';
      currency: 'USD' | 'IDR';
      price: number;
      prevClose: number;
      dayHigh: number;
      dayLow: number;
      foreignNetAmount?: number;
      foreignFlowSide?: 'BUY' | 'SELL';
      ttl: number;
    }
  >();

  for (const item of tickerList) {
    const clean = item.symbol.trim().toUpperCase().replace(/\.JK$/i, '');
    if (!clean) continue;
    const cacheKey = `${item.market}:${clean}`;
    const cached = equityFlowAndTradePlanCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      out.set(cacheKey, cached.data);
      continue;
    }
    if (!uniqueMap.has(cacheKey)) {
      const yahooSymbol = item.market === 'ID' ? `${clean}.JK` : clean.replace(/\./g, '-');
      const isOpen = getServerSessionInfo(item.market === 'ID' ? `${clean}.JK` : clean, new Date(now)).isOpen;
      uniqueMap.set(cacheKey, {
        cacheKey,
        symbol: clean,
        yahooSymbol,
        market: item.market,
        currency: item.market === 'ID' ? 'IDR' : 'USD',
        price: item.price,
        prevClose: item.prevClose,
        dayHigh: item.dayHigh,
        dayLow: item.dayLow,
        foreignNetAmount:
          item.foreignNetAmount ?? (item.market === 'ID' ? latestIdxForeignFlowMap.get(clean) : undefined),
        foreignFlowSide: item.foreignFlowSide,
        ttl: isOpen ? 90_000 : 600_000,
      });
    }
  }

  const queue = Array.from(uniqueMap.values()).slice(0, 64);
  const concurrency = 8;
  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      const target = queue[cursor++];
      try {
        const json = await fetchYahooChartJson(target.yahooSymbol, '3mo', '1d', 4500);
        const item = json?.chart?.result?.[0];
        const q = item?.indicators?.quote?.[0];
        const rawC = q?.close ?? [];
        const rawH = q?.high ?? [];
        const rawL = q?.low ?? [];
        const rawO = q?.open ?? [];
        const rawV = q?.volume ?? [];

        const closes: number[] = [];
        const highs: number[] = [];
        const lows: number[] = [];
        const opens: number[] = [];
        const volumes: number[] = [];

        for (let i = 0; i < rawC.length; i++) {
          const c = rawC[i];
          if (typeof c === 'number' && Number.isFinite(c) && c > 0) {
            closes.push(c);
            highs.push(typeof rawH[i] === 'number' && Number.isFinite(rawH[i]!) ? rawH[i]! : c);
            lows.push(typeof rawL[i] === 'number' && Number.isFinite(rawL[i]!) ? rawL[i]! : c);
            opens.push(typeof rawO[i] === 'number' && Number.isFinite(rawO[i]!) ? rawO[i]! : c);
            volumes.push(typeof rawV[i] === 'number' && Number.isFinite(rawV[i]!) ? rawV[i]! : 0);
          }
        }

        const bandarmology = computeIdxBandarmologyFromBars({
          symbol: target.symbol,
          closes,
          highs,
          lows,
          volumes,
          opens,
          currentPrice: target.price,
          prevClose: target.prevClose,
          foreignNetAmount: target.foreignNetAmount,
        });

        const tradePlan = computeEquityTradePlanFromBars({
          symbol: target.symbol,
          currency: target.currency,
          closes,
          highs,
          lows,
          opens,
          volumes,
          currentPrice: target.price,
          prevClose: target.prevClose,
          dayHigh: target.dayHigh,
          dayLow: target.dayLow,
          bandar: bandarmology,
          foreignNetAmount: target.foreignNetAmount,
          foreignFlowSide: target.foreignFlowSide,
        });

        const bundle = { bandarmology, tradePlan };
        out.set(target.cacheKey, bundle);
        equityFlowAndTradePlanCache.set(target.cacheKey, {
          data: bundle,
          expiresAt: Date.now() + target.ttl,
        });
      } catch {
        // fallback handled client-side if needed
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, queue.length)) }, () => worker())
  );
  return out;
}

async function fetchIdxBandarmologyMap(
  idxTickerList: Array<{
    symbol: string;
    price?: number;
    prevClose?: number;
    foreignNetAmount?: number;
  }>
): Promise<Map<string, BandarmologyAnalysis>> {
  const mapped = await fetchEquityBandarmologyAndZonesMap(
    idxTickerList.map((item) => ({
      symbol: item.symbol,
      market: 'ID' as const,
      price: item.price ?? 0,
      prevClose: item.prevClose ?? item.price ?? 0,
      dayHigh: item.price ?? 0,
      dayLow: item.price ?? 0,
      foreignNetAmount: item.foreignNetAmount,
    }))
  );
  const out = new Map<string, BandarmologyAnalysis>();
  for (const [key, val] of mapped.entries()) {
    const clean = key.replace(/^ID:/, '');
    out.set(clean, val.bandarmology);
  }
  return out;
}

function computeIndexImpactScore(item: InternalMover, region: 'US' | 'ID'): number {
  // Cap-weighted index contribution formula: MarketCap^0.68 * (|chg%| + 0.35) * CoreIndexWeight * RVOL
  const mcapScale = region === 'ID' ? 1e13 : 1e11;
  const fallbackCap = region === 'ID' ? 8e12 : 2.5e10;
  const mcap = Math.max(region === 'ID' ? 1e12 : 1e9, item.marketCap ?? fallbackCap);
  const capWeight = Math.pow(mcap / mcapScale, 0.68);
  const absMove = Math.min(12, Math.abs(item.changePercent)) + 0.35;

  const minTurn = region === 'ID' ? 1e10 : 5e7;
  const turnFactor = 1 + Math.max(0, Math.log10(Math.max(minTurn, item.dollarTurnover) / minTurn)) * 0.25;
  const rvolBoost = Math.max(0.85, Math.min(1.45, item.relativeVolume ?? 1));
  const coreSet = region === 'ID' ? IDX_INDEX_CORE_CONSTITUENTS : US_INDEX_CORE_CONSTITUENTS;
  const constituentBoost = coreSet.has(item.symbol) ? 1.25 : 0.72;

  return capWeight * absMove * turnFactor * rvolBoost * constituentBoost;
}

export async function fetchTopStockMovers(): Promise<StocksMoversResponse> {
  const now = Date.now();
  if (stocksMoversCache.entry) {
    if (stocksMoversCache.entry.expiresAt > now) {
      return stocksMoversCache.entry.data;
    }
    if (now - stocksMoversCache.entry.expiresAt < 900_000) {
      void fetchTopStockMoversFresh().catch(() => null);
      return stocksMoversCache.entry.data;
    }
  }
  return fetchTopStockMoversFresh();
}

async function fetchTopStockMoversFresh(): Promise<StocksMoversResponse> {
  const now = Date.now();
  const moversStart = Date.now();
  return coalesceInFlight('stock-movers', stocksMoversCache.entry?.data, async () => {

  const [
    yActives,
    yGainers,
    yLosers,
    tvUsImpact,
    tvUsMegaCap,
    tvUsGainers,
    tvUsLosers,
    tvIdxImpact,
    tvIdxBlueChip,
    tvIdxGainersLiquid,
    tvIdxLosersLiquid,
    foreignFlows,
  ] = await Promise.all([
    fetchYahooScreenerStocks('most_actives'),
    fetchYahooScreenerStocks('day_gainers'),
    fetchYahooScreenerStocks('day_losers'),
    fetchTradingViewScan(
      'america',
      'Value.Traded',
      'desc',
      [
        { left: 'market_cap_basic', operation: 'greater', right: 30_000_000_000 },
        { left: 'Value.Traded', operation: 'greater', right: 150_000_000 },
      ],
      35
    ),
    fetchTradingViewScan(
      'america',
      'market_cap_basic',
      'desc',
      [{ left: 'Value.Traded', operation: 'greater', right: 100_000_000 }],
      35
    ),
    fetchTradingViewScan(
      'america',
      'change',
      'desc',
      [
        { left: 'market_cap_basic', operation: 'greater', right: 10_000_000_000 },
        { left: 'Value.Traded', operation: 'greater', right: 50_000_000 },
      ],
      25
    ),
    fetchTradingViewScan(
      'america',
      'change',
      'asc',
      [
        { left: 'market_cap_basic', operation: 'greater', right: 10_000_000_000 },
        { left: 'Value.Traded', operation: 'greater', right: 50_000_000 },
      ],
      25
    ),
    fetchTradingViewScan(
      'indonesia',
      'Value.Traded',
      'desc',
      [
        { left: 'market_cap_basic', operation: 'greater', right: 15_000_000_000_000 },
        { left: 'Value.Traded', operation: 'greater', right: 15_000_000_000 },
      ],
      35
    ),
    fetchTradingViewScan(
      'indonesia',
      'market_cap_basic',
      'desc',
      [{ left: 'Value.Traded', operation: 'greater', right: 10_000_000_000 }],
      35
    ),
    fetchTradingViewScan(
      'indonesia',
      'change',
      'desc',
      [
        { left: 'market_cap_basic', operation: 'greater', right: 5_000_000_000_000 },
        { left: 'Value.Traded', operation: 'greater', right: 8_000_000_000 },
        { left: 'close', operation: 'greater', right: 100 },
      ],
      25
    ),
    fetchTradingViewScan(
      'indonesia',
      'change',
      'asc',
      [
        { left: 'market_cap_basic', operation: 'greater', right: 5_000_000_000_000 },
        { left: 'Value.Traded', operation: 'greater', right: 8_000_000_000 },
        { left: 'close', operation: 'greater', right: 100 },
      ],
      25
    ),
    fetchIdxForeignFlowLists(),
  ]);

  const combinedTvIdxCount =
    tvIdxImpact.length +
    tvIdxBlueChip.length +
    tvIdxGainersLiquid.length +
    tvIdxLosersLiquid.length;

  // Parallel direct Yahoo Finance fallback if TradingView returned thin/empty results
  const [yahooUsFallback, yahooIdxFallback] = await Promise.all([
    tvUsImpact.length + tvUsMegaCap.length < 12 ? fetchYahooDirectBasket('US') : Promise.resolve([]),
    combinedTvIdxCount < 14 ? fetchYahooDirectBasket('ID') : Promise.resolve([]),
  ]);

  // 1. Build guaranteed 10-stock US buckets (Index Impact, Gainers, Losers)
  const usPoolMap = new Map<string, InternalMover>();
  for (const item of [
    ...tvUsMegaCap,
    ...tvUsImpact,
    ...tvUsGainers,
    ...tvUsLosers,
    ...yahooUsFallback,
    ...parseYahooQuotesToMovers([...yActives, ...yGainers, ...yLosers]),
  ]) {
    if (NON_INDEX_EXCLUSION_SYMBOLS.has(item.symbol)) continue;
    const existing = usPoolMap.get(item.symbol);
    if (!existing) {
      usPoolMap.set(item.symbol, item);
    } else if (!existing.marketCap && item.marketCap) {
      usPoolMap.set(item.symbol, { ...existing, marketCap: item.marketCap, relativeVolume: item.relativeVolume ?? existing.relativeVolume });
    }
  }
  const usPool = Array.from(usPoolMap.values());

  const usIndexHeavyweights = usPool.filter(
    (s) => ((s.marketCap ?? 0) >= 25_000_000_000 || US_INDEX_CORE_CONSTITUENTS.has(s.symbol)) && s.dollarTurnover >= 80_000_000
  );
  const usImpactBase = usIndexHeavyweights.length >= 10 ? usIndexHeavyweights : usPool;
  const usImpactRaw = [...usImpactBase]
    .sort((a, b) => computeIndexImpactScore(b, 'US') - computeIndexImpactScore(a, 'US'))
    .slice(0, 10);

  const usLiquidIndexMovers = usPool.filter(
    (s) => ((s.marketCap ?? 0) >= 10_000_000_000 || US_INDEX_CORE_CONSTITUENTS.has(s.symbol)) && s.dollarTurnover >= 40_000_000 && s.price >= 5
  );
  const usMoverPool = usLiquidIndexMovers.length >= 14 ? usLiquidIndexMovers : usPool;

  const usGainersList = usMoverPool
    .filter((s) => s.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent);
  const usGainersRaw = (
    usGainersList.length >= 10
      ? usGainersList
      : [...usPool].sort((a, b) => b.changePercent - a.changePercent)
  ).slice(0, 10);

  const usLosersList = usMoverPool
    .filter((s) => s.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent);
  const usLosersRaw = (
    usLosersList.length >= 10
      ? usLosersList
      : [...usPool].sort((a, b) => a.changePercent - b.changePercent)
  ).slice(0, 10);

  // 2. Build guaranteed 10-stock IDX buckets (Index Impact, Gainers, Losers)
  const idxPoolMap = new Map<string, InternalMover>();
  for (const item of [
    ...tvIdxBlueChip,
    ...tvIdxImpact,
    ...tvIdxGainersLiquid,
    ...tvIdxLosersLiquid,
    ...yahooIdxFallback,
  ]) {
    const existing = idxPoolMap.get(item.symbol);
    if (!existing) {
      idxPoolMap.set(item.symbol, item);
    } else if (!existing.marketCap && item.marketCap) {
      idxPoolMap.set(item.symbol, { ...existing, marketCap: item.marketCap, relativeVolume: item.relativeVolume ?? existing.relativeVolume });
    }
  }
  const idxPool = Array.from(idxPoolMap.values());

  const idxIndexHeavyweights = idxPool.filter(
    (s) => ((s.marketCap ?? 0) >= 15_000_000_000_000 || IDX_INDEX_CORE_CONSTITUENTS.has(s.symbol)) && s.dollarTurnover >= 12_000_000_000 && s.price >= 100
  );
  const idxLiquidFallback = idxPool.filter((s) => s.dollarTurnover >= 8_000_000_000 && s.price >= 100);
  const idxImpactBase =
    idxIndexHeavyweights.length >= 10
      ? idxIndexHeavyweights
      : idxLiquidFallback.length >= 10
        ? idxLiquidFallback
        : idxPool;
  const idxImpactRaw = [...idxImpactBase]
    .sort((a, b) => computeIndexImpactScore(b, 'ID') - computeIndexImpactScore(a, 'ID'))
    .slice(0, 10);

  const idxMoverBase =
    idxPool.filter((s) => ((s.marketCap ?? 0) >= 5_000_000_000_000 || IDX_INDEX_CORE_CONSTITUENTS.has(s.symbol)) && s.dollarTurnover >= 8_000_000_000 && s.price >= 100).length >= 14
      ? idxPool.filter((s) => ((s.marketCap ?? 0) >= 5_000_000_000_000 || IDX_INDEX_CORE_CONSTITUENTS.has(s.symbol)) && s.dollarTurnover >= 8_000_000_000 && s.price >= 100)
      : idxLiquidFallback.length >= 14
        ? idxLiquidFallback
        : idxPool;

  const idxGainersList = idxMoverBase
    .filter((s) => s.changePercent > 0)
    .sort((a, b) => b.changePercent - a.changePercent);
  const idxGainersRaw = (
    idxGainersList.length >= 10
      ? idxGainersList
      : [...idxPool].sort((a, b) => b.changePercent - a.changePercent)
  ).slice(0, 10);

  const idxLosersList = idxMoverBase
    .filter((s) => s.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent);
  const idxLosersRaw = (
    idxLosersList.length >= 10
      ? idxLosersList
      : [...idxPool].sort((a, b) => a.changePercent - b.changePercent)
  ).slice(0, 10);

  // Supplement IDX liquidity leaders honestly without fabricating synthetic foreign net Rupiah amounts
  const buildInstitutionalFlowFallback = (side: 'BUY' | 'SELL', existing: StockMover[]): StockMover[] => {
    const seen = new Set(existing.map((e) => e.symbol));
    const candidates = [...idxImpactBase]
      .filter((s) => !seen.has(s.symbol))
      .filter((s) => (side === 'BUY' ? s.changePercent >= -0.2 : s.changePercent <= 0.2))
      .sort((a, b) => b.dollarTurnover - a.dollarTurnover);

    const extraPool = candidates.length + existing.length >= 10
      ? candidates
      : [...idxPool].filter((s) => !seen.has(s.symbol)).sort((a, b) => b.dollarTurnover - a.dollarTurnover);

    const needed = Math.max(0, 10 - existing.length);
    const additions: StockMover[] = extraPool.slice(0, needed).map((item) => {
      const { dollarTurnover: _dt, marketCap: _mc, relativeVolume: _rv, ...clean } = item;
      return {
        ...clean,
        foreignNetAmount: undefined,
        foreignNetLabel: 'Pending BEI',
        foreignFlowSide: undefined,
        foreignSourceLabel: 'Liquidity Proxy (Pending BEI Flow)',
      };
    });
    return [...existing, ...additions].slice(0, 10);
  };

  const finalForeignBuy =
    foreignFlows.foreignBuy.length >= 10
      ? foreignFlows.foreignBuy.slice(0, 10)
      : buildInstitutionalFlowFallback('BUY', foreignFlows.foreignBuy);

  const finalForeignSell =
    foreignFlows.foreignSell.length >= 10
      ? foreignFlows.foreignSell.slice(0, 10)
      : buildInstitutionalFlowFallback('SELL', foreignFlows.foreignSell);

  for (const fb of foreignFlows.foreignBuy) {
    if (typeof fb.foreignNetAmount === 'number') {
      latestIdxForeignFlowMap.set(fb.symbol, fb.foreignNetAmount);
    }
  }
  for (const fs of foreignFlows.foreignSell) {
    if (typeof fs.foreignNetAmount === 'number') {
      latestIdxForeignFlowMap.set(fs.symbol, fs.foreignNetAmount);
    }
  }

  const stripInternal = ({
    dollarTurnover: _dt,
    marketCap: _mc,
    relativeVolume: _rv,
    ...rest
  }: InternalMover): StockMover => rest;

  const combinedMovers = [
    ...usImpactRaw.map(stripInternal),
    ...usGainersRaw.map(stripInternal),
    ...usLosersRaw.map(stripInternal),
    ...idxImpactRaw.map(stripInternal),
    ...idxGainersRaw.map(stripInternal),
    ...idxLosersRaw.map(stripInternal),
  ];

  const allForStrategy = [
    ...usImpactRaw.map((m) => ({ ...m, market: 'US' as const })),
    ...usGainersRaw.map((m) => ({ ...m, market: 'US' as const })),
    ...usLosersRaw.map((m) => ({ ...m, market: 'US' as const })),
    ...idxImpactRaw.map((m) => ({ ...m, market: 'ID' as const })),
    ...idxGainersRaw.map((m) => ({ ...m, market: 'ID' as const })),
    ...idxLosersRaw.map((m) => ({ ...m, market: 'ID' as const })),
    ...finalForeignBuy.map((m) => ({ ...m, market: 'ID' as const })),
    ...finalForeignSell.map((m) => ({ ...m, market: 'ID' as const })),
  ].map((m) => ({
    symbol: m.symbol,
    market: m.market,
    price: m.price,
    prevClose: m.prevClose,
    dayHigh: m.dayHigh,
    dayLow: m.dayLow,
    foreignNetAmount:
      'foreignNetAmount' in m && typeof m.foreignNetAmount === 'number'
        ? m.foreignNetAmount
        : m.market === 'ID'
          ? latestIdxForeignFlowMap.get(m.symbol)
          : undefined,
    foreignFlowSide: 'foreignFlowSide' in m ? m.foreignFlowSide : undefined,
  }));

  const [enriched, strategyMap] = await Promise.all([
    enrichSparklinesForMovers(combinedMovers),
    fetchEquityBandarmologyAndZonesMap(allForStrategy),
  ]);

  const attachStrategy = (m: StockMover): StockMover => {
    const entry = strategyMap.get(`${m.market}:${m.symbol}`);
    if (!entry) return m;
    return {
      ...m,
      bandarmology: entry.bandarmology,
      tradePlan: entry.tradePlan,
    };
  };

  const u0 = usImpactRaw.length;
  const u1 = u0 + usGainersRaw.length;
  const u2 = u1 + usLosersRaw.length;
  const i0 = u2 + idxImpactRaw.length;
  const i1 = i0 + idxGainersRaw.length;

  const payload: StocksMoversResponse = {
    us: {
      impact: enriched.slice(0, u0).map(attachStrategy),
      gainers: enriched.slice(u0, u1).map(attachStrategy),
      losers: enriched.slice(u1, u2).map(attachStrategy),
    },
    indonesia: {
      impact: enriched.slice(u2, i0).map(attachStrategy),
      gainers: enriched.slice(i0, i1).map(attachStrategy),
      losers: enriched.slice(i1).map(attachStrategy),
      foreignBuy: finalForeignBuy.map(attachStrategy),
      foreignSell: finalForeignSell.map(attachStrategy),
    },
    updatedAt: new Date().toISOString(),
  };

  const usOpen = getServerSessionInfo('SPX', new Date(now)).isOpen;
  const idxOpen = getServerSessionInfo('IHSG', new Date(now)).isOpen;
  const moversTtl = usOpen || idxOpen ? 10_000 : 600_000;

  const moversLatency = Date.now() - moversStart;
  if (payload.us.impact.length >= 10 && payload.indonesia.impact.length >= 10) {
    stocksMoversCache.entry = { data: payload, expiresAt: now + moversTtl };
  }

  if (combinedTvIdxCount < 10 && yahooIdxFallback.length > 0) {
    updateProviderMetric('idx_proxy', {
      status: 'failover',
      activeSource: 'Yahoo .JK Basket Proxy',
      latencyMs: moversLatency,
      lastSuccessAt: Date.now(),
      isCachedFallback: false,
      fallbackReason: 'IDX TradingView scanner sparse; Yahoo .JK proxy active',
    });
  } else if (payload.indonesia.impact.length === 0 && stocksMoversCache.entry?.data) {
    updateProviderMetric('idx_proxy', {
      status: 'cached',
      activeSource: 'Cached IDX Movers Snapshot',
      latencyMs: moversLatency,
      isCachedFallback: true,
      fallbackReason: 'IDX upstream unavailable; serving cached movers',
    });
    return stocksMoversCache.entry.data;
  } else {
    updateProviderMetric('idx_proxy', {
      status: 'live',
      activeSource:
        yahooIdxFallback.length > 0
          ? 'IDX TV Scanner + Yahoo .JK'
          : 'IDX TV Scanner + Foreign Flow',
      latencyMs: moversLatency,
      lastSuccessAt: Date.now(),
      isCachedFallback: false,
      fallbackReason: undefined,
    });
  }
  return payload;
  });
}

// =========================================================================
// Portfolio Live Quotes (1s Open Session / Freeze Last Close), Multi-Chart & Search
// =========================================================================

export interface PortfolioQuoteResult {
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: string;
  currency: 'USD' | 'IDR';
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  sessionOpen: boolean;
  sessionStateLabel: string;
  sessionProgressRatio: number;
  chart1D: number[];
  timestamps1D: number[];
  updatedAtEpoch: number;
  bandarmology?: BandarmologyAnalysis;
}

const portfolioQuoteCache = new Map<
  string,
  { data: PortfolioQuoteResult; expiresAt: number; wasOpen: boolean }
>();

export async function fetchPortfolioQuotes(
  yahooSymbols: string[]
): Promise<{ quotes: PortfolioQuoteResult[]; updatedAt: string }> {
  const uniqueSyms = Array.from(
    new Set(
      yahooSymbols
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0 && s.length <= 24 && /^[A-Z0-9.\-^=]+$/.test(s))
    )
  ).slice(0, 30);

  const now = Date.now();
  const nowDate = new Date(now);

  const results = await Promise.all(
    uniqueSyms.map(async (yahooSymbol): Promise<PortfolioQuoteResult | null> => {
      const sessionInfo = getServerSessionInfo(yahooSymbol, nowDate);
      const cached = portfolioQuoteCache.get(yahooSymbol);
      if (cached && cached.expiresAt > now && cached.wasOpen === sessionInfo.isOpen) {
        return cached.data;
      }

      try {
        const interval = sessionInfo.isOpen ? '5m' : '15m';
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          yahooSymbol
        )}?range=1d&interval=${interval}`;
        const res = await fetch(url, {
          headers: UA_HEADERS,
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) return cached?.data ?? null;

        const json = (await res.json()) as {
          chart?: {
            result?: Array<{
              meta?: Record<string, unknown>;
              timestamp?: number[];
              indicators?: {
                quote?: Array<{ close?: Array<number | null> }>;
              };
            }>;
          };
        };

        const item = json.chart?.result?.[0];
        const meta = item?.meta;
        if (!meta) return cached?.data ?? null;

        let price = Number(meta.regularMarketPrice);
        let rawPrev = Number(
          meta.regularMarketPreviousClose ?? meta.previousClose ?? meta.chartPreviousClose ?? price
        );
        if (!Number.isFinite(price) || price <= 0) return cached?.data ?? null;

        const isCrypto = yahooSymbol === 'BTC-USD' || yahooSymbol === 'ETH-USD';
        if (isCrypto) {
          const cb = await fetchCoinbaseSpotStats(yahooSymbol as 'BTC-USD' | 'ETH-USD');
          if (cb) {
            price = cb.price;
            rawPrev = cb.open24h;
          }
        }

        const isIdr =
          String(meta.currency || '').toUpperCase() === 'IDR' ||
          yahooSymbol.endsWith('.JK') ||
          yahooSymbol === '^JKSE' ||
          yahooSymbol === '^JKLQ45';
        const currency: 'USD' | 'IDR' = isIdr ? 'IDR' : 'USD';
        const decimals = isIdr && yahooSymbol !== '^JKSE' && yahooSymbol !== '^JKLQ45' ? 0 : price < 2 ? 4 : 2;
        const { prevClose, changeValue, changePercent } = resolveConsistentChange(
          price,
          rawPrev,
          isCrypto ? ((price - rawPrev) / Math.max(1e-6, rawPrev)) * 100 : meta.regularMarketChangePercent,
          decimals,
          isCrypto
        );

        const rawCloses = item?.indicators?.quote?.[0]?.close ?? [];
        const rawTs = item?.timestamp ?? [];
        const validPairs: { t: number; v: number }[] = [];
        for (let i = 0; i < rawCloses.length; i++) {
          const val = rawCloses[i];
          const ts = rawTs[i];
          if (typeof val === 'number' && Number.isFinite(val)) {
            validPairs.push({
              t: typeof ts === 'number' ? ts * 1000 : now,
              v: Number(val.toFixed(decimals)),
            });
          }
        }
        if (validPairs.length === 0) {
          validPairs.push({ t: now - 3600_000, v: prevClose }, { t: now, v: price });
        } else {
          validPairs[validPairs.length - 1] = {
            t: validPairs[validPairs.length - 1].t,
            v: Number(price.toFixed(decimals)),
          };
        }

        const dayHigh = Number(meta.regularMarketDayHigh ?? Math.max(price, prevClose));
        const dayLow = Number(meta.regularMarketDayLow ?? Math.min(price, prevClose));
        const cleanSym = yahooSymbol.replace(/\.JK$/i, '');
        const name = String(meta.shortName || meta.longName || cleanSym).slice(0, 60);
        const exchange = isIdr
          ? 'IDX'
          : String(meta.fullExchangeName || meta.exchangeName || 'Global');
        const updatedAtEpoch =
          Number(meta.regularMarketTime || Math.floor(now / 1000)) * 1000;

        const result: PortfolioQuoteResult = {
          symbol: cleanSym,
          yahooSymbol,
          name,
          exchange,
          currency,
          price: Number(price.toFixed(decimals)),
          prevClose: Number(prevClose.toFixed(decimals)),
          changeValue,
          changePercent,
          dayHigh: Number(dayHigh.toFixed(decimals)),
          dayLow: Number(dayLow.toFixed(decimals)),
          sessionOpen: sessionInfo.isOpen,
          sessionStateLabel: sessionInfo.stateLabel,
          sessionProgressRatio: sessionInfo.progressRatio,
          chart1D: validPairs.map((p) => p.v),
          timestamps1D: validPairs.map((p) => p.t),
          updatedAtEpoch,
        };

        portfolioQuoteCache.set(yahooSymbol, {
          data: result,
          expiresAt: Date.now() + (sessionInfo.isOpen ? 900 : 600_000),
          wasOpen: sessionInfo.isOpen,
        });

        return result;
      } catch {
        return cached?.data ?? null;
      }
    })
  );

  const validQuotes = results.filter((r): r is PortfolioQuoteResult => r !== null);
  const idxPortfolioItems = validQuotes.filter(
    (q) => q.currency === 'IDR' && q.yahooSymbol.endsWith('.JK')
  );
  if (idxPortfolioItems.length > 0) {
    const bandarMap = await fetchIdxBandarmologyMap(
      idxPortfolioItems.map((q) => ({
        symbol: q.symbol,
        price: q.price,
        prevClose: q.prevClose,
        foreignNetAmount: latestIdxForeignFlowMap.get(q.symbol),
      }))
    );
    for (const q of validQuotes) {
      if (q.currency === 'IDR' && q.yahooSymbol.endsWith('.JK')) {
        const b = bandarMap.get(q.symbol);
        if (b) q.bandarmology = b;
      }
    }
  }

  return {
    quotes: validQuotes,
    updatedAt: new Date().toISOString(),
  };
}

const portfolioSeriesCache = new Map<
  string,
  CacheEntry<{ points: number[]; timestamps: number[]; candles: CandlePoint[]; prevClose: number }>
>();

export async function fetchPortfolioSymbolSeries(
  yahooSymbol: string,
  timeframe: string
): Promise<{ points: number[]; timestamps: number[]; candles: CandlePoint[]; prevClose: number } | null> {
  const sym = yahooSymbol.trim().toUpperCase();
  const key = `${sym}:${timeframe}`;
  const now = Date.now();
  const sessionInfo = getServerSessionInfo(sym, new Date(now));
  const cached = portfolioSeriesCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const rangeMap: Record<
    string,
    { range: string; interval: string; sliceTail?: number; aggregateEvery?: number }
  > = {
    '1m': { range: '1d', interval: '1m', sliceTail: 36 },
    '5m': { range: '1d', interval: '5m', sliceTail: 36 },
    '15m': { range: '5d', interval: '15m', sliceTail: 40 },
    '15M': { range: '5d', interval: '15m', sliceTail: 40 },
    '30m': { range: '5d', interval: '30m', sliceTail: 42 },
    '1h': { range: '1mo', interval: '60m', sliceTail: 42 },
    '1H': { range: '1mo', interval: '60m', sliceTail: 42 },
    '4h': { range: '1mo', interval: '60m', aggregateEvery: 4, sliceTail: 38 },
    '4H': { range: '1mo', interval: '60m', aggregateEvery: 4, sliceTail: 38 },
    '1D': { range: '1d', interval: sessionInfo.isOpen ? '5m' : '15m' },
    '5D': { range: '5d', interval: '30m' },
    '1W': { range: '5d', interval: '30m' },
    '1M': { range: '1mo', interval: '1d' },
    '3M': { range: '3mo', interval: '1d' },
    '6M': { range: '6mo', interval: '1d' },
    YTD: { range: 'ytd', interval: '1d' },
    '1Y': { range: '1y', interval: '1wk' },
    '5Y': { range: '5y', interval: '1mo' },
    ALL: { range: '5y', interval: '1mo' },
    MAX: { range: '5y', interval: '1mo' },
  };
  const params = rangeMap[timeframe] ?? rangeMap['1D'];

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      sym
    )}?range=${params.range}&interval=${params.interval}`;
    const res = await fetch(url, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return cached?.data ?? null;

    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: Record<string, unknown>;
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
            }>;
          };
        }>;
      };
    };

    const item = json.chart?.result?.[0];
    const quoteObj = item?.indicators?.quote?.[0];
    const rawCloses = quoteObj?.close ?? [];
    const rawOpens = quoteObj?.open ?? [];
    const rawHighs = quoteObj?.high ?? [];
    const rawLows = quoteObj?.low ?? [];
    const rawTs = item?.timestamp ?? [];
    let points: number[] = [];
    let timestamps: number[] = [];
    let candles: CandlePoint[] = [];

    for (let i = 0; i < rawCloses.length; i++) {
      const val = rawCloses[i];
      const ts = rawTs[i];
      if (typeof val === 'number' && Number.isFinite(val)) {
        const tsMs = typeof ts === 'number' ? ts * 1000 : now;
        const prevC = points.length > 0 ? points[points.length - 1] : val;
        const rawO = rawOpens[i];
        const o = typeof rawO === 'number' && Number.isFinite(rawO) ? rawO : prevC;
        const rawH = rawHighs[i];
        const rawL = rawLows[i];
        const h = typeof rawH === 'number' && Number.isFinite(rawH) ? Math.max(rawH, o, val) : Math.max(o, val);
        const l = typeof rawL === 'number' && Number.isFinite(rawL) ? Math.min(rawL, o, val) : Math.min(o, val);
        points.push(val);
        timestamps.push(tsMs);
        candles.push({ t: tsMs, o, h, l, c: val });
      }
    }
    const lastPrice = Number(item?.meta?.regularMarketPrice);
    if (Number.isFinite(lastPrice) && lastPrice > 0 && points.length > 0) {
      points[points.length - 1] = lastPrice;
      const lastBar = candles[candles.length - 1];
      if (lastBar) {
        lastBar.c = lastPrice;
        lastBar.h = Math.max(lastBar.h, lastPrice);
        lastBar.l = Math.min(lastBar.l, lastPrice);
      }
    }
    if (points.length === 0) return cached?.data ?? null;

    if (params.aggregateEvery && params.aggregateEvery > 1 && candles.length >= params.aggregateEvery) {
      const aggCandles: CandlePoint[] = [];
      const step = params.aggregateEvery;
      for (let i = 0; i < candles.length; i += step) {
        const chunk = candles.slice(i, i + step);
        if (chunk.length === 0) continue;
        aggCandles.push({
          t: chunk[chunk.length - 1].t,
          o: chunk[0].o,
          h: Math.max(...chunk.map((x) => x.h)),
          l: Math.min(...chunk.map((x) => x.l)),
          c: chunk[chunk.length - 1].c,
        });
      }
      candles = aggCandles;
      points = aggCandles.map((b) => b.c);
      timestamps = aggCandles.map((b) => b.t);
    }

    const finalPoints = params.sliceTail && points.length > params.sliceTail ? points.slice(-params.sliceTail) : points;
    const finalTimestamps =
      params.sliceTail && timestamps.length > params.sliceTail ? timestamps.slice(-params.sliceTail) : timestamps;
    const finalCandles =
      params.sliceTail && candles.length > params.sliceTail ? candles.slice(-params.sliceTail) : candles;

    const prevClose = Number(
      item?.meta?.chartPreviousClose ?? item?.meta?.previousClose ?? finalPoints[0]
    );
    const data = {
      points: finalPoints,
      timestamps: finalTimestamps,
      candles: finalCandles,
      prevClose: Number.isFinite(prevClose) && prevClose > 0 ? prevClose : finalPoints[0],
    };

    const ttl =
      (timeframe === '1D' || timeframe === 'MAX' || Boolean(params.sliceTail)) && sessionInfo.isOpen
        ? 1_500
        : 180_000;
    portfolioSeriesCache.set(key, { data, expiresAt: now + ttl });
    return data;
  } catch {
    return cached?.data ?? null;
  }
}

export interface SymbolDetailResponse {
  id: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  shortName: string;
  exchange: string;
  isIndex: boolean;
  currency: 'USD' | 'IDR';
  currencyPrefix?: string;
  decimals: number;
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  open: string;
  dayHigh: string;
  dayLow: string;
  volume: string;
  w52Low: string;
  w52High: string;
  w52Pct: number;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  support: string;
  supportNote: string;
  resistance: string;
  resistanceNote: string;
  commentary: string;
  points: number[];
  timestamps: number[];
  candles: CandlePoint[];
  chart1D: number[];
  timestamps1D: number[];
  candles1D: CandlePoint[];
  marketSessionOpen: boolean;
  sessionStateLabel: string;
  sessionProgressRatio: number;
  updatedAtEpoch: number;
  bandarmology?: BandarmologyAnalysis;
  tradePlan?: StockTradePlan;
}

export async function fetchSymbolDetail(
  yahooSymbolInput: string,
  timeframe = '1D'
): Promise<SymbolDetailResponse | null> {
  let sym = yahooSymbolInput.trim().toUpperCase();
  if (!sym) return null;
  const matchedCfg = YAHOO_SYMBOL_CONFIG.find((c) => c.id === sym);
  if (matchedCfg) sym = matchedCfg.yahooSymbol;
  if (sym === 'IHSG' || sym === 'COMPOSITE' || sym === 'IDX:COMPOSITE') sym = '^JKSE';
  if (sym === 'SPX' || sym === 'S&P500') sym = '^GSPC';
  if (sym === 'IXIC' || sym === 'NASDAQ') sym = '^IXIC';
  if (sym === 'DJI' || sym === 'DOW') sym = '^DJI';
  if (sym === 'LQ45' || sym === 'IDX:LQ45') sym = '^JKLQ45';
  if (sym === 'DXY') sym = 'DX-Y.NYB';

  const now = Date.now();
  const sessionInfo = getServerSessionInfo(sym, new Date(now));
  const [quoteRes, seriesRes, cbTicker] = await Promise.all([
    fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m`, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(7000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    timeframe === '1D' ? Promise.resolve(null) : fetchPortfolioSymbolSeries(sym, timeframe),
    sym === 'BTC-USD' || sym === 'ETH-USD'
      ? fetchCoinbaseSpotStats(sym)
      : Promise.resolve(null),
  ]);

  const item = (
    quoteRes as {
      chart?: {
        result?: Array<{
          meta?: Record<string, unknown>;
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              close?: Array<number | null>;
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
            }>;
          };
        }>;
      };
    } | null
  )?.chart?.result?.[0];

  const meta = item?.meta;
  if (!meta) return null;

  let price = Number(meta.regularMarketPrice);
  let rawPrev = Number(
    meta.regularMarketPreviousClose ?? meta.previousClose ?? meta.chartPreviousClose ?? price
  );
  if (cbTicker) {
    price = cbTicker.price;
    rawPrev = cbTicker.open24h;
  }
  if (!Number.isFinite(price) || price <= 0) return null;

  const isIndex = sym.startsWith('^') || sym === 'DX-Y.NYB' || String(meta.instrumentType || '').toUpperCase() === 'INDEX';
  const isIdr =
    String(meta.currency || '').toUpperCase() === 'IDR' ||
    sym.endsWith('.JK') ||
    sym === '^JKSE' ||
    sym === '^JKLQ45';
  const currency: 'USD' | 'IDR' = isIdr ? 'IDR' : 'USD';
  const decimals = sym === 'DX-Y.NYB' ? 3 : isIndex ? 2 : isIdr ? 0 : price < 2 ? 4 : 2;
  const prefix = isIndex ? '' : isIdr ? 'Rp ' : '$';
  const isCrypto = sym === 'BTC-USD' || sym === 'ETH-USD';
  const { prevClose, changeValue, changePercent } = resolveConsistentChange(
    price,
    rawPrev,
    cbTicker ? ((price - rawPrev) / Math.max(1e-6, rawPrev)) * 100 : meta.regularMarketChangePercent,
    decimals,
    isCrypto
  );

  const rawQuoteObj = item?.indicators?.quote?.[0];
  const rawCloses = rawQuoteObj?.close ?? [];
  const rawHighs1D = rawQuoteObj?.high ?? [];
  const rawLows1D = rawQuoteObj?.low ?? [];
  const rawOpens1D = rawQuoteObj?.open ?? [];
  const rawTs = item?.timestamp ?? [];
  const chart1D: number[] = [];
  const timestamps1D: number[] = [];
  const candles1D: CandlePoint[] = [];
  for (let i = 0; i < rawCloses.length; i++) {
    const val = rawCloses[i];
    if (typeof val === 'number' && Number.isFinite(val)) {
      const c = Number(val.toFixed(decimals));
      const tsMs = typeof rawTs[i] === 'number' ? rawTs[i] * 1000 : now;
      const prevC = chart1D.length > 0 ? chart1D[chart1D.length - 1] : c;
      const rawO = rawOpens1D[i];
      const o = typeof rawO === 'number' && Number.isFinite(rawO) ? Number(rawO.toFixed(decimals)) : prevC;
      const rawH = rawHighs1D[i];
      const rawL = rawLows1D[i];
      const h =
        typeof rawH === 'number' && Number.isFinite(rawH)
          ? Number(Math.max(rawH, o, c).toFixed(decimals))
          : Number(Math.max(o, c).toFixed(decimals));
      const l =
        typeof rawL === 'number' && Number.isFinite(rawL)
          ? Number(Math.min(rawL, o, c).toFixed(decimals))
          : Number(Math.min(o, c).toFixed(decimals));

      chart1D.push(c);
      timestamps1D.push(tsMs);
      candles1D.push({ t: tsMs, o, h, l, c });
    }
  }
  if (chart1D.length === 0) {
    chart1D.push(prevClose, price);
    timestamps1D.push(now - 3600_000, now);
    candles1D.push(
      { t: now - 3600_000, o: prevClose, h: Math.max(prevClose, price), l: Math.min(prevClose, price), c: prevClose },
      { t: now, o: prevClose, h: Math.max(prevClose, price), l: Math.min(prevClose, price), c: price }
    );
  } else {
    chart1D[chart1D.length - 1] = Number(price.toFixed(decimals));
    const lastBar = candles1D[candles1D.length - 1];
    if (lastBar) {
      lastBar.c = Number(price.toFixed(decimals));
      lastBar.h = Number(Math.max(lastBar.h, lastBar.c).toFixed(decimals));
      lastBar.l = Number(Math.min(lastBar.l, lastBar.c).toFixed(decimals));
    }
  }

  const activePoints =
    timeframe === '1D' || !seriesRes?.points.length ? chart1D : [...seriesRes.points];
  if (activePoints.length > 0) {
    activePoints[activePoints.length - 1] = Number(price.toFixed(decimals));
  }
  const activeTimestamps =
    timeframe === '1D' || !seriesRes?.timestamps.length ? timestamps1D : seriesRes.timestamps;
  const activeCandles: CandlePoint[] =
    timeframe === '1D' || !seriesRes?.candles?.length
      ? candles1D
      : seriesRes.candles.map((bar) => ({
          t: bar.t,
          o: Number(bar.o.toFixed(decimals)),
          h: Number(bar.h.toFixed(decimals)),
          l: Number(bar.l.toFixed(decimals)),
          c: Number(bar.c.toFixed(decimals)),
        }));

  const rawOpens = item?.indicators?.quote?.[0]?.open ?? [];
  const regOpen = Number(meta.regularMarketOpen);
  const barOpen = rawOpens.find((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const baseHigh = Number(meta.regularMarketDayHigh ?? Math.max(...chart1D));
  const baseLow = Number(meta.regularMarketDayLow ?? Math.min(...chart1D));
  let firstOpen =
    Number.isFinite(regOpen) && regOpen > 0
      ? regOpen
      : typeof barOpen === 'number' &&
          barOpen >= Math.min(baseLow, prevClose) * 0.985 &&
          barOpen <= Math.max(baseHigh, prevClose) * 1.015
        ? barOpen
        : prevClose;
  firstOpen = Math.max(Math.min(baseLow, prevClose), Math.min(Math.max(baseHigh, prevClose), firstOpen));
  const dayHighNum = Math.max(price, baseHigh, firstOpen);
  const dayLowNum = Math.min(price, baseLow, firstOpen);
  const w52LowNum = Number(meta.fiftyTwoWeekLow ?? dayLowNum);
  const w52HighNum = Number(meta.fiftyTwoWeekHigh ?? dayHighNum);
  const w52Pct = Math.max(
    2,
    Math.min(98, Math.round(((price - w52LowNum) / Math.max(1e-6, w52HighNum - w52LowNum)) * 100))
  );
  const volNum = Number(meta.regularMarketVolume ?? 0);

  const pivot = (dayHighNum + dayLowNum + price) / 3;
  const supportNum = Math.min(2 * pivot - dayHighNum, dayLowNum, price * 0.992);
  const resistanceNum = Math.max(2 * pivot - dayLowNum, dayHighNum, price * 1.008);
  const tier = computeServerSignalTier({
    assetId: sym,
    changePercent,
    price,
    open: firstOpen,
    prevClose,
    dayHigh: dayHighNum,
    dayLow: dayLowNum,
    series: chart1D,
    w52Pct,
  });
  const sentiment: 'Bullish' | 'Bearish' | 'Neutral' =
    tier === 'Strong Bull' || tier === 'Bull Signal'
      ? 'Bullish'
      : tier === 'Strong Bear' || tier === 'Bear Signal'
        ? 'Bearish'
        : 'Neutral';

  const cleanSym =
    sym === '^JKSE'
      ? 'IHSG'
      : sym === '^GSPC'
        ? 'SPX'
        : sym === '^IXIC'
          ? 'IXIC'
          : sym === '^DJI'
            ? 'DJI'
            : sym.replace(/\.JK$/i, '');
  const fullName = String(meta.shortName || meta.longName || cleanSym).slice(0, 64);
  const openFormatted = formatStatNumber(firstOpen, decimals, prefix);

  const isNonEquityMacro = isIndex || isCrypto || sym.endsWith('=X') || sym.endsWith('=F');
  let bandarmology: BandarmologyAnalysis | undefined;
  let tradePlan: StockTradePlan | undefined;
  if (!isNonEquityMacro) {
    const marketCode: 'US' | 'ID' = isIdr || sym.endsWith('.JK') ? 'ID' : 'US';
    const stratMap = await fetchEquityBandarmologyAndZonesMap([
      {
        symbol: cleanSym,
        market: marketCode,
        price: Number(price.toFixed(decimals)),
        prevClose: Number(prevClose.toFixed(decimals)),
        dayHigh: Number(dayHighNum.toFixed(decimals)),
        dayLow: Number(dayLowNum.toFixed(decimals)),
        foreignNetAmount: marketCode === 'ID' ? latestIdxForeignFlowMap.get(cleanSym) : undefined,
      },
    ]);
    const strat = stratMap.get(`${marketCode}:${cleanSym}`);
    bandarmology = strat?.bandarmology;
    tradePlan = strat?.tradePlan;
  }

  return {
    id: sym,
    symbol: cleanSym,
    yahooSymbol: sym,
    name: fullName,
    shortName: fullName.slice(0, 24),
    exchange: isIdr ? 'IDX · Jakarta' : String(meta.fullExchangeName || meta.exchangeName || 'US Market'),
    isIndex,
    currency,
    currencyPrefix: prefix,
    decimals,
    price: Number(price.toFixed(decimals)),
    prevClose: Number(prevClose.toFixed(decimals)),
    changeValue,
    changePercent,
    open: openFormatted,
    dayHigh: formatStatNumber(dayHighNum, decimals, prefix),
    dayLow: formatStatNumber(dayLowNum, decimals, prefix),
    volume: formatVolume(volNum),
    w52Low: formatStatNumber(w52LowNum, decimals, prefix),
    w52High: formatStatNumber(w52HighNum, decimals, prefix),
    w52Pct,
    sentiment,
    support: formatStatNumber(supportNum, decimals, prefix),
    supportNote: 'Session Pivot S1 & Intraday Support',
    resistance: formatStatNumber(resistanceNum, decimals, prefix),
    resistanceNote: 'Session Pivot R1 & Intraday Resistance',
    commentary: `${fullName} (${cleanSym}) trades at ${formatStatNumber(
      price,
      decimals,
      prefix
    )} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(
      2
    )}%), ${price >= firstOpen ? 'holding above' : 'trading below'} opening (${openFormatted}) inside a ${formatStatNumber(
      dayLowNum,
      decimals,
      prefix
    )}–${formatStatNumber(dayHighNum, decimals, prefix)} band · Daily Signal: ${tier} (${w52Pct}th 52W pct).`,
    points: activePoints,
    timestamps: activeTimestamps,
    candles: activeCandles,
    chart1D,
    timestamps1D,
    candles1D,
    marketSessionOpen: sessionInfo.isOpen,
    sessionStateLabel: sessionInfo.stateLabel,
    sessionProgressRatio: sessionInfo.progressRatio,
    updatedAtEpoch: Number(meta.regularMarketTime || Math.floor(now / 1000)) * 1000,
    bandarmology,
    tradePlan,
  };
}

export interface PortfolioMoverBriefItem {
  symbol: string;
  yahooSymbol: string;
  name: string;
  currency: 'USD' | 'IDR';
  price: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  headline: string;
  summary: string;
  source: string;
  publishedAt?: string;
  url?: string;
}

export async function fetchPortfolioMoversBrief(
  yahooSymbols: string[]
): Promise<{ items: PortfolioMoverBriefItem[]; updatedAt: string }> {
  const uniqueSyms = Array.from(
    new Set(yahooSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean))
  ).slice(0, 8);
  if (uniqueSyms.length === 0) {
    return { items: [], updatedAt: new Date().toISOString() };
  }

  const [{ quotes }, yahooRssXml, cnbcNews] = await Promise.all([
    fetchPortfolioQuotes(uniqueSyms),
    fetch(
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
        uniqueSyms.join(',')
      )}&region=US&lang=en-US`,
      { headers: UA_HEADERS, signal: AbortSignal.timeout(5500) }
    )
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
    fetchLiveNews().catch(() => ({ stories: [] })),
  ]);

  const rssItems: Array<{ title: string; desc: string; link: string; pubDate: string }> = [];
  for (const m of yahooRssXml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const title = decodeXmlEntities(
      (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '')
    );
    const desc = decodeXmlEntities(
      (block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<[^>]+>/g, ' ')
    ).trim();
    const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim();
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();
    if (title) rssItems.push({ title, desc, link, pubDate });
  }

  const sortedQuotes = [...quotes].sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)
  );

  const items: PortfolioMoverBriefItem[] = sortedQuotes.slice(0, 5).map((q) => {
    const clean = q.symbol.toUpperCase();
    const matchedRss = rssItems.find(
      (r) =>
        r.title.toUpperCase().includes(clean) ||
        r.desc.toUpperCase().includes(clean) ||
        r.title.toLowerCase().includes(q.name.split(' ')[0].toLowerCase())
    );
    const matchedMacro = cnbcNews.stories.find(
      (s) =>
        s.headline.toUpperCase().includes(clean) ||
        (q.currency === 'IDR' && s.topic === 'idx') ||
        (q.currency === 'USD' && s.topic === 'rates')
    );

    const dirPhrase =
      q.changePercent > 0.25
        ? `advanced ${q.changePercent.toFixed(2)}%`
        : q.changePercent < -0.25
          ? `declined ${Math.abs(q.changePercent).toFixed(2)}%`
          : `held steady (${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%)`;

    const pxFormatted =
      q.currency === 'IDR'
        ? `Rp ${Math.round(q.price).toLocaleString('en-US')}`
        : `$${q.price.toFixed(2)}`;
    const rangeFormatted =
      q.currency === 'IDR'
        ? `Rp ${Math.round(q.dayLow).toLocaleString('en-US')}–Rp ${Math.round(q.dayHigh).toLocaleString('en-US')}`
        : `$${q.dayLow.toFixed(2)}–$${q.dayHigh.toFixed(2)}`;

    if (matchedRss) {
      return {
        symbol: q.symbol,
        yahooSymbol: q.yahooSymbol,
        name: q.name,
        currency: q.currency,
        price: q.price,
        changePercent: q.changePercent,
        dayHigh: q.dayHigh,
        dayLow: q.dayLow,
        headline: matchedRss.title,
        summary: `${q.name} (${q.symbol}) ${dirPhrase} to ${pxFormatted} across a ${rangeFormatted} session band. ${
          matchedRss.desc ? matchedRss.desc.slice(0, 175) : ''
        }`.trim(),
        source: 'Yahoo Finance',
        publishedAt: matchedRss.pubDate,
        url: matchedRss.link,
      };
    }

    if (matchedMacro) {
      return {
        symbol: q.symbol,
        yahooSymbol: q.yahooSymbol,
        name: q.name,
        currency: q.currency,
        price: q.price,
        changePercent: q.changePercent,
        dayHigh: q.dayHigh,
        dayLow: q.dayLow,
        headline: matchedMacro.headline,
        summary: `${q.name} (${q.symbol}) ${dirPhrase} to ${pxFormatted} (day range ${rangeFormatted}) during ${q.sessionStateLabel.toLowerCase()} trading amid ${matchedMacro.publisher} coverage.`,
        source: matchedMacro.publisher,
        publishedAt: matchedMacro.timeAgo,
        url: matchedMacro.url,
      };
    }

    return {
      symbol: q.symbol,
      yahooSymbol: q.yahooSymbol,
      name: q.name,
      currency: q.currency,
      price: q.price,
      changePercent: q.changePercent,
      dayHigh: q.dayHigh,
      dayLow: q.dayLow,
      headline: `${q.name} ${q.changePercent >= 0 ? 'gains' : 'eases'} ${Math.abs(q.changePercent).toFixed(2)}% in ${q.exchange} trading`,
      summary: `${q.name} (${q.symbol}) ${dirPhrase} to ${pxFormatted}, trading between ${rangeFormatted} with previous close at ${
        q.currency === 'IDR'
          ? `Rp ${Math.round(q.prevClose).toLocaleString('en-US')}`
          : `$${q.prevClose.toFixed(2)}`
      }.`,
      source: `${q.exchange} Live Feed`,
    };
  });

  return { items, updatedAt: new Date().toISOString() };
}

export interface StockSearchItem {
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: string;
  typeDisp: string;
  currency: 'USD' | 'IDR';
  category: 'Equities' | 'Crypto' | 'Commodities' | 'Cash & FX';
  isIndex?: boolean;
  assetId?: string;
  price?: number;
  prevClose?: number;
  changePercent?: number;
  sparklinePoints?: number[];
  sessionOpen?: boolean;
}

const INDEX_AND_POPULAR_SYMBOLS: StockSearchItem[] = [
  { symbol: 'IHSG', yahooSymbol: '^JKSE', name: 'IDX Composite Index (IHSG)', exchange: 'IDX · Index', typeDisp: 'Index', currency: 'IDR', category: 'Equities', isIndex: true, assetId: 'IHSG' },
  { symbol: 'EIDO', yahooSymbol: 'EIDO', name: 'iShares MSCI Indonesia ETF', exchange: 'NYSE Arca', typeDisp: 'ETF', currency: 'USD', category: 'Equities', isIndex: false, assetId: 'EIDO' },
  { symbol: 'LQ45', yahooSymbol: '^JKLQ45', name: 'IDX LQ45 Blue-Chip Index', exchange: 'IDX · Index', typeDisp: 'Index', currency: 'IDR', category: 'Equities', isIndex: true },
  { symbol: 'SPX', yahooSymbol: '^GSPC', name: 'S&P 500 Index', exchange: 'NYSE/CME · Index', typeDisp: 'Index', currency: 'USD', category: 'Equities', isIndex: true, assetId: 'SPX' },
  { symbol: 'IXIC', yahooSymbol: '^IXIC', name: 'NASDAQ Composite Index', exchange: 'NASDAQ · Index', typeDisp: 'Index', currency: 'USD', category: 'Equities', isIndex: true, assetId: 'IXIC' },
  { symbol: 'DJI', yahooSymbol: '^DJI', name: 'Dow Jones Industrial Average', exchange: 'NYSE · Index', typeDisp: 'Index', currency: 'USD', category: 'Equities', isIndex: true, assetId: 'DJI' },
  { symbol: 'UNTR', yahooSymbol: 'UNTR.JK', name: 'United Tractors Tbk PT', exchange: 'IDX', typeDisp: 'Equity', currency: 'IDR', category: 'Equities' },
  { symbol: 'BBCA', yahooSymbol: 'BBCA.JK', name: 'Bank Central Asia Tbk PT', exchange: 'IDX', typeDisp: 'Equity', currency: 'IDR', category: 'Equities' },
  { symbol: 'BBRI', yahooSymbol: 'BBRI.JK', name: 'Bank Rakyat Indonesia Tbk PT', exchange: 'IDX', typeDisp: 'Equity', currency: 'IDR', category: 'Equities' },
  { symbol: 'BMRI', yahooSymbol: 'BMRI.JK', name: 'Bank Mandiri Tbk PT', exchange: 'IDX', typeDisp: 'Equity', currency: 'IDR', category: 'Equities' },
  { symbol: 'TLKM', yahooSymbol: 'TLKM.JK', name: 'Telkom Indonesia Tbk PT', exchange: 'IDX', typeDisp: 'Equity', currency: 'IDR', category: 'Equities' },
  { symbol: 'ASII', yahooSymbol: 'ASII.JK', name: 'Astra International Tbk PT', exchange: 'IDX', typeDisp: 'Equity', currency: 'IDR', category: 'Equities' },
  { symbol: 'ADRO', yahooSymbol: 'ADRO.JK', name: 'Alamtri Resources Indonesia Tbk', exchange: 'IDX', typeDisp: 'Equity', currency: 'IDR', category: 'Equities' },
  { symbol: 'NVDA', yahooSymbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', typeDisp: 'Equity', currency: 'USD', category: 'Equities' },
  { symbol: 'AAPL', yahooSymbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', typeDisp: 'Equity', currency: 'USD', category: 'Equities' },
  { symbol: 'MSFT', yahooSymbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', typeDisp: 'Equity', currency: 'USD', category: 'Equities' },
  { symbol: 'GOOGL', yahooSymbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', typeDisp: 'Equity', currency: 'USD', category: 'Equities' },
  { symbol: 'BTC-USD', yahooSymbol: 'BTC-USD', name: 'Bitcoin USD', exchange: 'Coinbase Spot', typeDisp: 'Cryptocurrency', currency: 'USD', category: 'Crypto', assetId: 'BTCUSD' },
  { symbol: 'DXY', yahooSymbol: 'DX-Y.NYB', name: 'US Dollar Index (DXY)', exchange: 'ICE · Index', typeDisp: 'Index', currency: 'USD', category: 'Cash & FX', isIndex: true, assetId: 'DXY' },
  { symbol: 'GC=F', yahooSymbol: 'GC=F', name: 'Gold Futures', exchange: 'COMEX', typeDisp: 'Commodity', currency: 'USD', category: 'Commodities', assetId: 'XAUUSD' },
];

async function enrichSearchItemsWithQuotes(items: StockSearchItem[]): Promise<StockSearchItem[]> {
  const target = items.slice(0, 8);
  const rest = items.slice(8);
  const { quotes } = await fetchPortfolioQuotes(target.map((i) => i.yahooSymbol));
  const qMap = new Map(quotes.map((q) => [q.yahooSymbol.toUpperCase(), q]));

  const enrichedTop = target.map((item) => {
    const q = qMap.get(item.yahooSymbol.toUpperCase());
    if (!q) return item;
    return {
      ...item,
      price: q.price,
      prevClose: q.prevClose,
      changePercent: q.changePercent,
      sparklinePoints: samplePoints(q.chart1D, 14),
      sessionOpen: q.sessionOpen,
    };
  });

  return [...enrichedTop, ...rest];
}

export async function searchMarketSymbols(
  query: string,
  includeQuotes = false
): Promise<StockSearchItem[]> {
  const q = query.trim();
  const lower = q.toLowerCase();

  if (!q) {
    return includeQuotes
      ? enrichSearchItemsWithQuotes(INDEX_AND_POPULAR_SYMBOLS.slice(0, 8))
      : INDEX_AND_POPULAR_SYMBOLS;
  }

  const curatedMatches = INDEX_AND_POPULAR_SYMBOLS.filter(
    (s) =>
      s.symbol.toLowerCase().includes(lower) ||
      s.yahooSymbol.toLowerCase().includes(lower) ||
      s.name.toLowerCase().includes(lower) ||
      (lower.includes('indonesia') && (s.currency === 'IDR' || s.symbol === 'IHSG' || s.symbol === 'EIDO' || s.symbol === 'LQ45')) ||
      (lower.includes('idx') && (s.currency === 'IDR' || s.symbol === 'IHSG' || s.symbol === 'EIDO' || s.symbol === 'LQ45')) ||
      (lower.includes('etf') && s.symbol === 'EIDO') ||
      (lower === 'us' && s.currency === 'USD') ||
      (lower.includes('index') && s.isIndex)
  );

  const remoteItems: StockSearchItem[] = [];
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      q
    )}&quotesCount=10&newsCount=0&enableFuzzyQuery=false`;
    const res = await fetch(url, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        quotes?: Array<{
          symbol?: string;
          shortname?: string;
          longname?: string;
          exchDisp?: string;
          exchange?: string;
          quoteType?: string;
          typeDisp?: string;
        }>;
      };

      for (const item of json.quotes ?? []) {
        const yahooSym = String(item.symbol || '').trim().toUpperCase();
        if (!yahooSym) continue;
        const qType = String(item.quoteType || item.typeDisp || 'EQUITY').toUpperCase();
        if (!['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY', 'FUTURE', 'CURRENCY', 'MUTUALFUND'].includes(qType)) {
          continue;
        }
        const isIdr = yahooSym.endsWith('.JK') || yahooSym === '^JKSE' || yahooSym === '^JKLQ45' || item.exchDisp === 'Jakarta';
        const cleanSym =
          yahooSym === '^JKSE'
            ? 'IHSG'
            : yahooSym === '^GSPC'
              ? 'SPX'
              : yahooSym === '^IXIC'
                ? 'IXIC'
                : yahooSym === '^DJI'
                  ? 'DJI'
                  : yahooSym.replace(/\.JK$/i, '');
        const category: StockSearchItem['category'] =
          qType === 'CRYPTOCURRENCY'
            ? 'Crypto'
            : qType === 'FUTURE' || yahooSym.endsWith('=F')
              ? 'Commodities'
              : qType === 'CURRENCY' || yahooSym.endsWith('=X')
                ? 'Cash & FX'
                : 'Equities';
        const builtIn = YAHOO_SYMBOL_CONFIG.find((c) => c.yahooSymbol.toUpperCase() === yahooSym);

        remoteItems.push({
          symbol: cleanSym,
          yahooSymbol: yahooSym,
          name: String(item.shortname || item.longname || cleanSym).slice(0, 80),
          exchange: isIdr ? 'IDX' : String(item.exchDisp || item.exchange || 'Global'),
          typeDisp: String(item.typeDisp || qType),
          currency: isIdr ? 'IDR' : 'USD',
          category,
          isIndex: qType === 'INDEX' || yahooSym.startsWith('^'),
          assetId: builtIn?.id,
        });
      }
    }
  } catch {
    // fallback to curated + ticker guess
  }

  // Also check IDX 4-letter shorthand if user typed an IDX ticker (e.g. "BBNI" or "ANTM")
  const upperClean = q.toUpperCase().replace(/[^A-Z0-9.\-^=]/g, '');
  const isCuratedExact = curatedMatches.some((c) => c.symbol.toUpperCase() === upperClean);
  if (
    /^[A-Z]{4}$/.test(upperClean) &&
    !isCuratedExact &&
    !remoteItems.some((r) => r.yahooSymbol === `${upperClean}.JK`)
  ) {
    remoteItems.push({
      symbol: upperClean,
      yahooSymbol: `${upperClean}.JK`,
      name: `${upperClean} Tbk (IDX)`,
      exchange: 'IDX',
      typeDisp: 'Equity',
      currency: 'IDR',
      category: 'Equities',
    });
  }

  const mergedMap = new Map<string, StockSearchItem>();
  for (const item of [...curatedMatches, ...remoteItems]) {
    if (!mergedMap.has(item.yahooSymbol)) {
      mergedMap.set(item.yahooSymbol, item);
    }
  }

  const finalList = Array.from(mergedMap.values()).slice(0, 12);
  if (finalList.length === 0 && upperClean) {
    finalList.push({
      symbol: upperClean.replace(/\.JK$/, ''),
      yahooSymbol: upperClean,
      name: `${upperClean} Market Ticker`,
      exchange: upperClean.endsWith('.JK') ? 'IDX' : 'Global',
      typeDisp: 'Equity',
      currency: upperClean.endsWith('.JK') ? 'IDR' : 'USD',
      category: 'Equities',
    });
  }

  return includeQuotes ? enrichSearchItemsWithQuotes(finalList) : finalList;
}

export interface DailyMarketSummaryHighlight {
  id: string;
  category: 'gainer' | 'loser' | 'event';
  title: string;
  metricText: string;
  summaryText: string;
  metaText: string;
  symbol?: string;
  yahooSymbol?: string;
  assetId?: string;
  routeTarget?: 'dashboard' | 'stocks' | 'calendar' | 'news';
}

export interface DailyMarketSummaryPayload {
  windowLabel: string;
  dateLabel: string;
  updatedAt: string;
  highlights: DailyMarketSummaryHighlight[];
}

const dailySummaryCache: { entry: CacheEntry<DailyMarketSummaryPayload> | null } = {
  entry: null,
};

export async function fetchDailyMarketSummary(): Promise<DailyMarketSummaryPayload> {
  const now = Date.now();
  if (dailySummaryCache.entry && dailySummaryCache.entry.expiresAt > now) {
    return dailySummaryCache.entry.data;
  }

  return coalesceInFlight('daily-summary', dailySummaryCache.entry?.data, async () => {

  const [quotesRes, moversRes, calendarRes, newsRes] = await Promise.allSettled([
    fetchLiveQuotes(),
    fetchTopStockMovers(),
    fetchLiveCalendar(),
    fetchLiveNews(),
  ]);

  const quotes = quotesRes.status === 'fulfilled' ? quotesRes.value.quotes : [];
  const movers = moversRes.status === 'fulfilled' ? moversRes.value : null;
  const calendar = calendarRes.status === 'fulfilled' ? calendarRes.value : null;
  const news = newsRes.status === 'fulfilled' ? newsRes.value : null;

  const cfgMap = new Map(YAHOO_SYMBOL_CONFIG.map((c) => [c.id, c]));
  const formatQuoteVal = (q: LiveQuotePatch) => {
    const cfg = cfgMap.get(q.id);
    const decimals = cfg?.decimals ?? 2;
    const prefix = cfg?.currencyPrefix ?? '';
    const suffix = cfg?.unitSuffix ?? '';
    return `${prefix}${q.price.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;
  };

  const formatStockPx = (s: StockMover) =>
    s.currency === 'IDR'
      ? `Rp ${Math.round(s.price).toLocaleString('en-US')}`
      : `$${s.price.toFixed(2)}`;

  const highlights: DailyMarketSummaryHighlight[] = [];

  // 1. Top Global Benchmark Gainers
  const sortedQuotes = [...quotes]
    .filter((q) => Number.isFinite(q.changePercent))
    .sort((a, b) => b.changePercent - a.changePercent);

  const topBenchmark = sortedQuotes[0];
  if (topBenchmark && topBenchmark.changePercent >= 0) {
    const cfg = cfgMap.get(topBenchmark.id);
    highlights.push({
      id: `sum-bench-gain-${topBenchmark.id}`,
      category: 'gainer',
      title: `${cfg?.name || topBenchmark.id} (${topBenchmark.id})`,
      metricText: `+${topBenchmark.changePercent.toFixed(2)}%`,
      summaryText: `Led global benchmarks at ${formatQuoteVal(topBenchmark)} within a ${topBenchmark.dayLow}–${topBenchmark.dayHigh} intraday band.`,
      metaText: `${topBenchmark.sessionStateLabel} · Global Benchmark`,
      symbol: topBenchmark.id,
      assetId: topBenchmark.id,
      routeTarget: 'dashboard',
    });
  }

  // 2. Top US Stock Gainer
  const usTopGainer = movers?.us?.gainers?.[0] ?? movers?.us?.impact?.[0];
  if (usTopGainer && usTopGainer.changePercent >= 0) {
    highlights.push({
      id: `sum-us-gain-${usTopGainer.symbol}`,
      category: 'gainer',
      title: `${usTopGainer.name} (${usTopGainer.symbol})`,
      metricText: `+${usTopGainer.changePercent.toFixed(2)}%`,
      summaryText: `Topped US session gainers at ${formatStockPx(usTopGainer)} on ${usTopGainer.volume} share volume.`,
      metaText: `US Equities · ${usTopGainer.exchange}`,
      symbol: usTopGainer.symbol,
      yahooSymbol: usTopGainer.symbol,
      routeTarget: 'stocks',
    });
  }

  // 3. Top Indonesia IDX Gainer & Foreign Net Buy
  const idxTopGainer = movers?.indonesia?.gainers?.[0] ?? movers?.indonesia?.impact?.[0];
  if (idxTopGainer && idxTopGainer.changePercent >= 0) {
    highlights.push({
      id: `sum-idx-gain-${idxTopGainer.symbol}`,
      category: 'gainer',
      title: `${idxTopGainer.name} (${idxTopGainer.symbol})`,
      metricText: `+${idxTopGainer.changePercent.toFixed(2)}%`,
      summaryText: `Paced Indonesia IDX equities at ${formatStockPx(idxTopGainer)} with ${idxTopGainer.volume} traded.`,
      metaText: 'Indonesia IDX · Equities',
      symbol: idxTopGainer.symbol,
      yahooSymbol: `${idxTopGainer.symbol}.JK`,
      routeTarget: 'stocks',
    });
  }

  const idxForeignBuy = movers?.indonesia?.foreignBuy?.[0];
  if (idxForeignBuy && idxForeignBuy.foreignNetLabel) {
    highlights.push({
      id: `sum-idx-fbuy-${idxForeignBuy.symbol}`,
      category: 'gainer',
      title: `Foreign Accumulation: ${idxForeignBuy.symbol}`,
      metricText: `${idxForeignBuy.foreignNetLabel}`,
      summaryText: `${idxForeignBuy.name} led IDX foreign net buying at ${formatStockPx(idxForeignBuy)} (${idxForeignBuy.changePercent >= 0 ? '+' : ''}${idxForeignBuy.changePercent.toFixed(2)}%).`,
      metaText: 'IDX Foreign Flow · Net Buy',
      symbol: idxForeignBuy.symbol,
      yahooSymbol: `${idxForeignBuy.symbol}.JK`,
      routeTarget: 'stocks',
    });
  }

  // 4. Sharpest Benchmark & Equity Decliners (Losers)
  const bottomBenchmark = sortedQuotes[sortedQuotes.length - 1];
  if (bottomBenchmark && bottomBenchmark.changePercent < 0) {
    const cfg = cfgMap.get(bottomBenchmark.id);
    highlights.push({
      id: `sum-bench-loss-${bottomBenchmark.id}`,
      category: 'loser',
      title: `${cfg?.name || bottomBenchmark.id} (${bottomBenchmark.id})`,
      metricText: `${bottomBenchmark.changePercent.toFixed(2)}%`,
      summaryText: `Trailed macro benchmarks at ${formatQuoteVal(bottomBenchmark)}, testing session support near ${bottomBenchmark.support}.`,
      metaText: `${bottomBenchmark.sessionStateLabel} · Benchmark Lag`,
      symbol: bottomBenchmark.id,
      assetId: bottomBenchmark.id,
      routeTarget: 'dashboard',
    });
  }

  const usTopLoser = movers?.us?.losers?.[0];
  if (usTopLoser && usTopLoser.changePercent < 0) {
    highlights.push({
      id: `sum-us-loss-${usTopLoser.symbol}`,
      category: 'loser',
      title: `${usTopLoser.name} (${usTopLoser.symbol})`,
      metricText: `${usTopLoser.changePercent.toFixed(2)}%`,
      summaryText: `Led US session decliners at ${formatStockPx(usTopLoser)} across ${usTopLoser.volume} shares traded.`,
      metaText: `US Equities · ${usTopLoser.exchange}`,
      symbol: usTopLoser.symbol,
      yahooSymbol: usTopLoser.symbol,
      routeTarget: 'stocks',
    });
  }

  const idxTopLoser = movers?.indonesia?.losers?.[0];
  if (idxTopLoser && idxTopLoser.changePercent < 0) {
    highlights.push({
      id: `sum-idx-loss-${idxTopLoser.symbol}`,
      category: 'loser',
      title: `${idxTopLoser.name} (${idxTopLoser.symbol})`,
      metricText: `${idxTopLoser.changePercent.toFixed(2)}%`,
      summaryText: `Pulled back on the IDX to ${formatStockPx(idxTopLoser)} on ${idxTopLoser.volume} volume.`,
      metaText: 'Indonesia IDX · Pullback',
      symbol: idxTopLoser.symbol,
      yahooSymbol: `${idxTopLoser.symbol}.JK`,
      routeTarget: 'stocks',
    });
  }

  // 5. Major Economic Events of the Last 24 Hours
  const calEvents = calendar?.events ?? [];
  const twentyFourHoursAgo = now - 24 * 3600_000;
  const recentCal = calEvents
    .filter((ev) => {
      const ts = Date.parse(ev.isoDate);
      if (Number.isFinite(ts)) {
        return ts >= twentyFourHoursAgo && ts <= now + 6 * 3600_000;
      }
      return ev.day === 'today';
    })
    .sort((a, b) => {
      const scoreA = (a.impact === 'HIGH' ? 2 : 1) + (!isUnpublishedActual(a.actual) ? 2 : 0);
      const scoreB = (b.impact === 'HIGH' ? 2 : 1) + (!isUnpublishedActual(b.actual) ? 2 : 0);
      return scoreB - scoreA;
    });

  const selectedCal = (recentCal.length > 0 ? recentCal : calEvents).slice(0, 3);
  for (const ev of selectedCal) {
    const hasActual = !isUnpublishedActual(ev.actual);
    highlights.push({
      id: `sum-ev-${ev.id}`,
      category: 'event',
      title: `${ev.currency} · ${ev.title}`,
      metricText: hasActual ? `${ev.actual} (${ev.deviationLabel})` : `${ev.impact} Impact`,
      summaryText: hasActual
        ? `Printed ${ev.actual} vs. ${ev.forecast} consensus (prior ${ev.previous}). ${ev.description}`
        : `Scheduled at ${ev.timeWib} with forecast ${ev.forecast} vs. ${ev.previous} prior. ${ev.description}`,
      metaText: `${ev.timeWib} · Economic Release`,
      routeTarget: 'calendar',
    });
  }

  if (selectedCal.length === 0 && news?.stories?.[0]) {
    const topStory = news.stories[0];
    highlights.push({
      id: `sum-news-${topStory.id}`,
      category: 'event',
      title: topStory.headline,
      metricText: topStory.badgeMetric || 'Macro Catalyst',
      summaryText: topStory.summary,
      metaText: `${topStory.publisher} · ${topStory.timeAgo}`,
      routeTarget: 'news',
    });
  }

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(now));

  const payload: DailyMarketSummaryPayload = {
    windowLabel: 'Last 24 hours',
    dateLabel,
    updatedAt: new Date(now).toISOString(),
    highlights,
  };

  dailySummaryCache.entry = {
    data: payload,
    expiresAt: now + 20_000,
  };

  return payload;
  });
}

export type SessionPhaseKey = 'beforeOpen' | 'duringSession' | 'afterClose';

export interface IndexSessionBrief {
  assetId: string;
  symbol: string;
  name: string;
  region: 'US' | 'Indonesia' | 'Asia-Pacific';
  activePhase: SessionPhaseKey;
  sessionStateLabel: string;
  priceFormatted: string;
  changePercent: number;
  signalTier: 'Strong Bull' | 'Bull Signal' | 'Neutral' | 'Bear Signal' | 'Strong Bear';
  beforeOpen: string;
  duringSession: string;
  afterClose: string;
  keyLevels: string;
}

export interface MarketIntelligencePayload {
  updatedAt: string;
  headline: string;
  compositeSentiment: 'Bullish' | 'Bearish' | 'Neutral';
  signalTally: {
    bullCount: number;
    bearCount: number;
    neutralCount: number;
  };
  sourcesCount: number;
  sourceNames: string[];
  commentaryPoints: string[];
  rumorAndCatalystThemes: Array<{
    tag: string;
    theme: string;
    tone: 'bull' | 'bear' | 'neutral';
  }>;
  dataReleaseImplications: Array<{
    currency: string;
    impact: 'HIGH' | 'MED';
    title: string;
    timing: string;
    implication: string;
  }>;
  stocksAndFlowSummary: string;
  forwardPrediction: string;
  sessionConditionAndTrigger?: string;
  oneSentenceSummary?: string;
  unifiedSynthesis?: {
    regimeTag:
      | 'Risk-On Expansion'
      | 'Selective Rotation'
      | 'Macro Event Caution'
      | 'Defensive De-Risking';
    convictionPct: number;
    executiveThesis: string;
    catalysts: Array<{
      id: string;
      kind: 'FLOW' | 'WIRE' | 'MACRO';
      tag: string;
      title: string;
      implication: string;
      tone: 'bull' | 'bear' | 'neutral';
      routeTarget: 'stocks' | 'news' | 'calendar';
    }>;
    scenarios: {
      horizonLabel: string;
      bullTrigger: string;
      bullTarget: string;
      baseCase: string;
      bearTrigger: string;
      bearTarget: string;
    };
  };
  indexSessions: IndexSessionBrief[];
  aiRefined: boolean;
}

const intelligenceCache: { entry: CacheEntry<MarketIntelligencePayload> | null } = {
  entry: null,
};

function computeServerSignalTier(input: {
  assetId?: string;
  changePercent: number;
  price?: number;
  open?: number;
  prevClose?: number;
  dayHigh?: number;
  dayLow?: number;
  series?: number[];
  w52Pct?: number;
  foreignFlowSide?: 'BUY' | 'SELL';
}): 'Strong Bull' | 'Bull Signal' | 'Neutral' | 'Bear Signal' | 'Strong Bear' {
  const {
    assetId = '',
    changePercent,
    price = 0,
    open = 0,
    prevClose = 0,
    dayHigh,
    dayLow,
    series,
    w52Pct = 50,
    foreignFlowSide,
  } = input;

  const upper = assetId.toUpperCase();
  const isCrypto = upper.includes('BTC') || upper.includes('ETH') || upper.endsWith('-USD');
  const isGold = upper.includes('XAU') || upper.includes('GC=F');

  const strongTh = isCrypto ? 2.2 : isGold ? 1.1 : 1.35;
  const mildTh = isCrypto ? 0.65 : isGold ? 0.30 : 0.35;

  let score = 0;

  // 1. Asset-class volatility-calibrated session move
  if (changePercent >= strongTh) score += 34;
  else if (changePercent >= mildTh) score += 18;
  else if (changePercent <= -strongTh) score -= 34;
  else if (changePercent <= -mildTh) score -= 18;

  // 2. Opening Drive (Price vs Open + Prev Close)
  if (price > 0 && open > 0) {
    const aboveOpen = price >= open * 1.0005;
    const belowOpen = price <= open * 0.9995;
    const abovePrev = prevClose > 0 ? price >= prevClose : aboveOpen;
    if (aboveOpen && abovePrev) score += 18;
    else if (belowOpen && !abovePrev) score -= 18;
    else if (aboveOpen) score += 8;
    else if (belowOpen) score -= 8;
  } else if (price > 0 && prevClose > 0) {
    if (price > prevClose * 1.001) score += 10;
    else if (price < prevClose * 0.999) score -= 10;
  }

  // 3. Internal Bar Strength (IBS)
  if (typeof dayHigh === 'number' && typeof dayLow === 'number' && dayHigh > dayLow && price > 0) {
    const ibs = (price - dayLow) / (dayHigh - dayLow);
    if (ibs >= 0.78) score += 20;
    else if (ibs >= 0.60) score += 10;
    else if (ibs <= 0.22) score -= 20;
    else if (ibs <= 0.40) score -= 10;
  }

  // 4. Intraday micro-trend slope & session-mean (pseudo-VWAP) position
  if (Array.isArray(series) && series.length >= 6 && price > 0) {
    const valid = series.filter((v) => Number.isFinite(v) && v > 0);
    if (valid.length >= 6) {
      const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
      const tail3 = valid.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const priorSlice = valid.slice(-8, -3);
      const priorMean = priorSlice.length > 0 ? priorSlice.reduce((a, b) => a + b, 0) / priorSlice.length : mean;
      const risingSlope = tail3 > priorMean * 1.0005;
      const fallingSlope = tail3 < priorMean * 0.9995;
      if (price >= mean && risingSlope) score += 16;
      else if (price <= mean && fallingSlope) score -= 16;
      else if (price >= mean) score += 7;
      else score -= 7;
    }
  }

  // 5. Light 52W structural filter & foreign institutional flow boost
  if (w52Pct >= 75) score += 8;
  else if (w52Pct <= 25) score -= 8;

  if (foreignFlowSide === 'BUY') score += 10;
  else if (foreignFlowSide === 'SELL') score -= 10;

  if (score >= 48) return 'Strong Bull';
  if (score >= 16) return 'Bull Signal';
  if (score <= -48) return 'Strong Bear';
  if (score <= -16) return 'Bear Signal';
  return 'Neutral';
}

function resolveIndexPhase(assetId: string, nowDate: Date): SessionPhaseKey {
  const session = getServerSessionInfo(assetId, nowDate);
  if (session.isOpen) return 'duringSession';

  if (assetId === 'SPX' || assetId === 'IXIC' || assetId === 'DJI') {
    const ny = getTzClockServer(nowDate, 'America/New_York');
    if (!ny.isWeekend && ny.totalMin >= 4 * 60 && ny.totalMin < 9 * 60 + 30) {
      return 'beforeOpen';
    }
    return 'afterClose';
  }
  if (assetId === 'IHSG') {
    const jkt = getTzClockServer(nowDate, 'Asia/Jakarta');
    if (!jkt.isWeekend && jkt.totalMin >= 7 * 60 && jkt.totalMin < 9 * 60) return 'beforeOpen';
    if (!jkt.isWeekend && jkt.totalMin >= 11 * 60 + 30 && jkt.totalMin < 14 * 60) {
      return 'duringSession';
    }
    return 'afterClose';
  }
  if (assetId === 'HSI') {
    const hkg = getTzClockServer(nowDate, 'Asia/Hong_Kong');
    if (!hkg.isWeekend && hkg.totalMin >= 7 * 60 + 30 && hkg.totalMin < 9 * 60 + 30) return 'beforeOpen';
    if (!hkg.isWeekend && hkg.totalMin >= 12 * 60 && hkg.totalMin < 13 * 60) return 'duringSession';
    return 'afterClose';
  }
  if (assetId === 'TAIEX') {
    const tw = getTzClockServer(nowDate, 'Asia/Taipei');
    if (!tw.isWeekend && tw.totalMin >= 7 * 60 && tw.totalMin < 9 * 60) return 'beforeOpen';
    return 'afterClose';
  }
  if (assetId === 'KOSPI') {
    const kr = getTzClockServer(nowDate, 'Asia/Seoul');
    if (!kr.isWeekend && kr.totalMin >= 7 * 60 && kr.totalMin < 9 * 60) return 'beforeOpen';
    return 'afterClose';
  }
  if (assetId === 'SSEC') {
    const cn = getTzClockServer(nowDate, 'Asia/Shanghai');
    if (!cn.isWeekend && cn.totalMin >= 7 * 60 + 30 && cn.totalMin < 9 * 60 + 30) return 'beforeOpen';
    if (!cn.isWeekend && cn.totalMin >= 11 * 60 + 30 && cn.totalMin < 13 * 60) return 'duringSession';
    return 'afterClose';
  }
  if (assetId === 'NIFTY') {
    const ist = getTzClockServer(nowDate, 'Asia/Kolkata');
    if (!ist.isWeekend && ist.totalMin >= 7 * 60 + 30 && ist.totalMin < 9 * 60 + 15) return 'beforeOpen';
    return 'afterClose';
  }
  return 'afterClose';
}

function buildMacroImplicationText(ev: LiveCalendarItem): string {
  const hasActual = !isUnpublishedActual(ev.actual);
  const currScope =
    ev.currency === 'USD'
      ? 'US Treasury yields, DXY, and global risk appetite'
      : ev.currency === 'IDR'
        ? 'Bank Indonesia rate path, USD/IDR stability, and IDX banking/consumer flows'
        : ev.currency === 'CNY'
          ? 'China industrial demand, commodities, and APAC regional indices'
          : ev.currency === 'EUR'
            ? 'EUR/USD carry and European equity cyclicals'
            : 'JPY carry trades and Asian bond yields';

  if (hasActual) {
    const bias =
      ev.deviationType === 'beat'
        ? `printed hotter/stronger than consensus (${ev.actual} vs ${ev.forecast}), supporting ${ev.currency} and nudging rate-sensitive sectors cautiously`
        : ev.deviationType === 'miss'
          ? `came in softer than forecast (${ev.actual} vs ${ev.forecast}), easing ${ev.currency} yield pressure and cushioning duration/growth assets`
          : `matched consensus (${ev.actual}), keeping ${currScope} anchored`;
    return `${ev.title} ${bias}. Watch follow-through across ${currScope}.`;
  }
  return `Scheduled at ${ev.timeWib} (consensus ${ev.forecast} vs prior ${ev.previous}). Any surprise will reprice ${currScope}.`;
}

export async function fetchMarketIntelligence(): Promise<MarketIntelligencePayload> {
  const now = Date.now();
  if (intelligenceCache.entry) {
    if (intelligenceCache.entry.expiresAt > now) {
      return intelligenceCache.entry.data;
    }
    if (now - intelligenceCache.entry.expiresAt < 900_000) {
      void fetchMarketIntelligenceFresh().catch(() => null);
      return intelligenceCache.entry.data;
    }
  }
  return fetchMarketIntelligenceFresh();
}

async function fetchMarketIntelligenceFresh(): Promise<MarketIntelligencePayload> {
  const now = Date.now();
  return coalesceInFlight('market-intel', intelligenceCache.entry?.data, async () => {

  const nowDate = new Date(now);
  const [quotesRes, moversRes, newsRes, calRes] = await Promise.allSettled([
    fetchLiveQuotes(),
    fetchTopStockMovers(),
    fetchLiveNews(),
    fetchLiveCalendar(),
  ]);

  const quotes = quotesRes.status === 'fulfilled' ? quotesRes.value.quotes : [];
  const movers = moversRes.status === 'fulfilled' ? moversRes.value : null;
  const stories = newsRes.status === 'fulfilled' ? newsRes.value.stories : [];
  const events = calRes.status === 'fulfilled' ? calRes.value.events : [];

  const qById = new Map(quotes.map((q) => [q.id, q]));
  const us10y = qById.get('US10Y');
  const us30y = qById.get('US30Y');
  const id10y = qById.get('ID10Y');
  const dxy = qById.get('DXY');
  const usdidr = qById.get('USDIDR');
  const wti = qById.get('WTI');
  const gold = qById.get('XAUUSD');
  const btc = qById.get('BTCUSD');

  const usLeader = movers?.us?.impact?.[0];
  const usTop3 = (movers?.us?.impact ?? []).slice(0, 3);
  const usGainer = movers?.us?.gainers?.[0];
  const usLoser = movers?.us?.losers?.[0];
  const idxLeader = movers?.indonesia?.impact?.[0];
  const idxTop3 = (movers?.indonesia?.impact ?? []).slice(0, 3);
  const idxBuyTop = movers?.indonesia?.foreignBuy?.[0];
  const idxSellTop = movers?.indonesia?.foreignSell?.[0];

  // Quantitative cross-asset factor metrics for thesis construction
  const yieldCurveBps = us10y && us30y ? (us30y.price - us10y.price) * 100 : 35;
  const idUsSpreadBps = id10y && us10y ? (id10y.price - us10y.price) * 100 : 270;
  const macroTighteningScore =
    (dxy?.changePercent ?? 0) * 1.4 + (us10y?.changePercent ?? 0) * 0.6;
  const macroRegimeLabel =
    macroTighteningScore >= 0.45
      ? 'Tightening Liquidity & Strong Dollar'
      : macroTighteningScore <= -0.45
        ? 'Easing Financial Conditions & Rate Relief'
        : 'Balanced Rates & Dollar Equilibrium';

  const usBreadthNeg = (movers?.us?.impact ?? []).filter((s) => s.changePercent < 0).length;
  const usBreadthTotal = Math.max(1, (movers?.us?.impact ?? []).length);
  const idxBreadthPos = (movers?.indonesia?.impact ?? []).filter((s) => s.changePercent >= 0).length;
  const idxBreadthTotal = Math.max(1, (movers?.indonesia?.impact ?? []).length);

  const trackedIds: Array<{ id: string; symbol: string; name: string; region: IndexSessionBrief['region'] }> = [
    { id: 'SPX', symbol: 'SPX', name: 'S&P 500 Index', region: 'US' },
    { id: 'IXIC', symbol: 'IXIC', name: 'NASDAQ Composite', region: 'US' },
    { id: 'DJI', symbol: 'DJI', name: 'Dow Jones Industrial', region: 'US' },
    { id: 'IHSG', symbol: 'IHSG', name: 'IDX Composite (IHSG)', region: 'Indonesia' },
    { id: 'HSI', symbol: 'HSI', name: 'Hang Seng Index', region: 'Asia-Pacific' },
    { id: 'TAIEX', symbol: 'TAIEX', name: 'Taiwan Weighted', region: 'Asia-Pacific' },
    { id: 'KOSPI', symbol: 'KOSPI', name: 'KOSPI Korea', region: 'Asia-Pacific' },
    { id: 'SSEC', symbol: 'SSEC', name: 'Shanghai Composite', region: 'Asia-Pacific' },
    { id: 'NIFTY', symbol: 'NIFTY', name: 'NIFTY 50 India', region: 'Asia-Pacific' },
  ];

  const usCalNext = events.find((e) => e.currency === 'USD');
  const idCalNext = events.find((e) => e.currency === 'IDR');
  const asiaCalNext = events.find((e) => e.currency === 'CNY' || e.currency === 'JPY');

  const indexSessions: IndexSessionBrief[] = trackedIds.map((meta) => {
    const q = qById.get(meta.id);
    const priceNum = q?.price ?? 0;
    const chgPct = q?.changePercent ?? 0;
    const signStr = chgPct >= 0 ? '+' : '';
    const priceFormatted =
      priceNum > 0
        ? priceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—';
    const parseNum = (raw?: string) => {
      if (!raw) return NaN;
      const v = parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(v) ? v : NaN;
    };
    const openNum = parseNum(q?.open);
    const highNum = parseNum(q?.dayHigh);
    const lowNum = parseNum(q?.dayLow);
    const gapPct = Number.isFinite(openNum) && q?.prevClose ? ((openNum - q.prevClose) / q.prevClose) * 100 : 0;
    const ibsPct =
      Number.isFinite(highNum) && Number.isFinite(lowNum) && highNum > lowNum && priceNum > 0
        ? Math.round(((priceNum - lowNum) / (highNum - lowNum)) * 100)
        : 50;
    const fgNow = q?.fearGreed7d?.[q.fearGreed7d.length - 1] ?? 50;
    const fgLabel = fgNow >= 75 ? 'Extreme Greed' : fgNow >= 55 ? 'Greed' : fgNow <= 24 ? 'Extreme Fear' : fgNow <= 44 ? 'Fear' : 'Neutral';

    const activePhase = resolveIndexPhase(meta.id, nowDate);
    const signalTier = computeServerSignalTier({
      assetId: meta.id,
      changePercent: chgPct,
      price: priceNum,
      open: openNum,
      prevClose: q?.prevClose,
      dayHigh: highNum,
      dayLow: lowNum,
      series: q?.chart1D,
      w52Pct: q?.w52Pct ?? 50,
    });

    const macroThesis =
      meta.region === 'US'
        ? `Thesis hinges on discount-rate transmission (${us10y?.price.toFixed(3) ?? '4.97'}% US10Y, 10s30s ${yieldCurveBps >= 0 ? '+' : ''}${yieldCurveBps.toFixed(1)} bps)${
            usCalNext ? ` ahead of ${usCalNext.title} (${usCalNext.timeWib}, consensus ${usCalNext.forecast})` : ''
          }.`
        : meta.region === 'Indonesia'
          ? `Thesis tracks carry compression (${idUsSpreadBps >= 0 ? '+' : ''}${idUsSpreadBps.toFixed(0)} bps ID–US 10Y spread) and FX stability with USD/IDR at ${
              usdidr?.price.toLocaleString('en-US') || '18,260'
            }${idCalNext ? ` alongside ${idCalNext.title} (${idCalNext.timeWib})` : ''}.`
          : `Cross-market beta ties ${meta.symbol} to overnight NASDAQ factor dispersion (${
              qById.get('IXIC')?.changePercent.toFixed(2) ?? '0.00'
            }%) and DXY (${dxy?.price.toFixed(3) ?? '103.7'})${
              asiaCalNext ? `, with ${asiaCalNext.currency} ${asiaCalNext.title} as local catalyst` : ''
            }.`;

    const attributionText =
      meta.region === 'US'
        ? usTop3.length > 0
          ? `Cap-weighted attribution driven by ${usTop3
              .map((s) => `${s.symbol} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`)
              .join(', ')} (${usBreadthTotal - usBreadthNeg}/${usBreadthTotal} leaders positive).`
          : 'Mega-cap technology and cyclical financials govern index-point direction.'
        : meta.region === 'Indonesia'
          ? idxTop3.length > 0
            ? `IHSG heavyweights led by ${idxTop3
                .map((s) => `${s.symbol} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`)
                .join(', ')} (${idxBreadthPos}/${idxBreadthTotal} blue-chips firm; foreign ${
                idxBuyTop ? `bid ${idxBuyTop.symbol} ${idxBuyTop.foreignNetLabel}` : 'flows selective'
              }).`
            : 'Big banks and energy heavyweights govern Jakarta turnover.'
          : `Regional factor flow shows ${ibsPct}% intraday bar strength within ${q?.dayLow ?? '—'}–${q?.dayHigh ?? '—'}.`;

    const openConviction =
      Number.isFinite(openNum) && priceNum > 0
        ? priceNum >= openNum
          ? `buyers defended the ${q?.open ?? '—'} opening print (+${gapPct.toFixed(2)}% gap)`
          : `sellers rejected the ${q?.open ?? '—'} open (${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(2)}% gap)`
        : 'order flow balanced around pivot';

    const beforeOpen = `Pre-Open Thesis (${macroRegimeLabel}): ${macroThesis} DXY sits at ${
      dxy?.price.toFixed(3) ?? '103.7'
    } (${dxy && dxy.changePercent >= 0 ? '+' : ''}${dxy?.changePercent.toFixed(2) ?? '0.00'}%). Key validation: holding above ${
      q?.support ?? '—'
    } preserves dip-buying toward ${q?.resistance ?? '—'}, while a gap fade below ${q?.support ?? '—'} triggers defensive rotation.`;

    const duringSession = `Intraday Flow & Attribution: ${meta.symbol} trades at ${priceFormatted} (${signStr}${chgPct.toFixed(
      2
    )}%, ${signalTier}, F&G ${fgNow}/100 ${fgLabel}), where ${openConviction} at ${ibsPct}% range quartile. ${attributionText}`;

    const afterClose = `Settlement Thesis & Next-Session Scenarios: ${meta.symbol} closed at ${priceFormatted} (${signStr}${chgPct.toFixed(
      2
    )}%, ${ibsPct}% IBS, ${q?.w52Pct ?? 50}th 52W pct). Bull Case: reclaiming/holding ${q?.open ?? '—'} targets ${
      q?.resistance ?? '—'
    }. Bear Case: failing ${q?.support ?? '—'} signals institutional de-risking into lower demand shelves.`;

    return {
      assetId: meta.id,
      symbol: meta.symbol,
      name: meta.name,
      region: meta.region,
      activePhase,
      sessionStateLabel: q?.sessionStateLabel || getServerSessionInfo(meta.id, nowDate).stateLabel,
      priceFormatted,
      changePercent: chgPct,
      signalTier,
      beforeOpen,
      duringSession,
      afterClose,
      keyLevels: `S1 ${q?.support ?? '—'} · R1 ${q?.resistance ?? '—'}`,
    };
  });

  // Signal tally across all quotes + top impact US & IDX stocks using daily trading composite
  let bullCount = 0;
  let bearCount = 0;
  let neutralCount = 0;
  const parseQuoteNum = (raw?: string) => {
    if (!raw) return NaN;
    const v = parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(v) ? v : NaN;
  };
  for (const q of quotes) {
    const tier = computeServerSignalTier({
      assetId: q.id,
      changePercent: q.changePercent,
      price: q.price,
      open: parseQuoteNum(q.open),
      prevClose: q.prevClose,
      dayHigh: parseQuoteNum(q.dayHigh),
      dayLow: parseQuoteNum(q.dayLow),
      series: q.chart1D,
      w52Pct: q.w52Pct,
    });
    if (tier === 'Strong Bull' || tier === 'Bull Signal') bullCount++;
    else if (tier === 'Strong Bear' || tier === 'Bear Signal') bearCount++;
    else neutralCount++;
  }
  for (const s of [...(movers?.us?.impact ?? []), ...(movers?.indonesia?.impact ?? [])]) {
    const tier = computeServerSignalTier({
      assetId: s.symbol,
      changePercent: s.changePercent,
      price: s.price,
      prevClose: s.prevClose,
      dayHigh: s.dayHigh,
      dayLow: s.dayLow,
      series: s.sparklinePoints,
      foreignFlowSide: s.foreignFlowSide,
    });
    if (tier === 'Strong Bull' || tier === 'Bull Signal') bullCount++;
    else if (tier === 'Strong Bear' || tier === 'Bear Signal') bearCount++;
    else neutralCount++;
  }

  const compositeSentiment: 'Bullish' | 'Bearish' | 'Neutral' =
    bullCount >= bearCount + 4 ? 'Bullish' : bearCount >= bullCount + 4 ? 'Bearish' : 'Neutral';

  const spx = qById.get('SPX');
  const ixic = qById.get('IXIC');
  const ihsg = qById.get('IHSG');
  const eido = qById.get('EIDO');

  const sourceNames = Array.from(
    new Set([
      'TradingView Institutional Scanner',
      'Yahoo Finance Historical & Quotes',
      'Coinbase Spot 24h Stats',
      ...stories.slice(0, 12).map((s) => s.publisher),
    ])
  ).slice(0, 8);

  // Extract rumor & narrative themes from live news stories
  const rumorAndCatalystThemes: MarketIntelligencePayload['rumorAndCatalystThemes'] = [];
  const topicCheck = [
    {
      tag: 'Fed & Yields',
      regex: /(fed|fomc|powell|rate|treasury|yield|inflation|cpi|pce|jobs)/i,
    },
    {
      tag: 'AI & Big Tech',
      regex: /(ai|nvidia|chip|semiconductor|nasdaq|tech|apple|microsoft|earnings)/i,
    },
    {
      tag: 'IDX & Rupiah Flow',
      regex: /(ihsg|rupiah|bi|bank indonesia|asing|saham|bbca|bbri|bmri)/i,
    },
    {
      tag: 'Energy & Gold',
      regex: /(oil|crude|opec|brent|wti|gold|bullion|commodity|middle east)/i,
    },
    {
      tag: 'Crypto Liquidity',
      regex: /(bitcoin|btc|eth|ethereum|crypto|etf|sec|stablecoin)/i,
    },
  ];

  for (const bucket of topicCheck) {
    const hit = stories.find((s) => bucket.regex.test(`${s.headline} ${s.summary}`));
    if (hit) {
      rumorAndCatalystThemes.push({
        tag: bucket.tag,
        theme: `${hit.headline} (${hit.publisher})`,
        tone: hit.badgePositive === true ? 'bull' : hit.badgePositive === false ? 'bear' : 'neutral',
      });
    }
  }
  if (rumorAndCatalystThemes.length === 0 && stories.length > 0) {
    for (const s of stories.slice(0, 3)) {
      rumorAndCatalystThemes.push({
        tag: s.publisher,
        theme: s.headline,
        tone: s.badgePositive === true ? 'bull' : s.badgePositive === false ? 'bear' : 'neutral',
      });
    }
  }

  const marketMovingEvents = events.filter(
    (ev): ev is LiveCalendarItem & { impact: 'HIGH' | 'MED' } =>
      ev.impact === 'HIGH' || ev.impact === 'MED'
  );
  const upcomingMacroEvents = marketMovingEvents
    .filter((ev) => Date.parse(ev.isoDate) >= now - 6 * 3600_000)
    .sort((a, b) => Date.parse(a.isoDate) - Date.parse(b.isoDate));
  const selectedMacroEvents = (upcomingMacroEvents.length > 0 ? upcomingMacroEvents : marketMovingEvents)
    .slice(0, 6);

  const dataReleaseImplications = selectedMacroEvents.map((ev) => ({
    currency: ev.currency,
    impact: ev.impact,
    title: ev.title,
    timing: ev.timeWib,
    implication: buildMacroImplicationText(ev),
  }));

  const btcTier = btc
    ? computeServerSignalTier({
        assetId: 'BTCUSD',
        changePercent: btc.changePercent,
        price: btc.price,
        prevClose: btc.prevClose,
        series: btc.chart1D,
        w52Pct: btc.w52Pct,
      })
    : 'Neutral';
  const goldTier = gold
    ? computeServerSignalTier({
        assetId: 'XAUUSD',
        changePercent: gold.changePercent,
        price: gold.price,
        prevClose: gold.prevClose,
        series: gold.chart1D,
        w52Pct: gold.w52Pct,
      })
    : 'Neutral';

  const spxFg = spx?.fearGreed7d?.[spx.fearGreed7d.length - 1] ?? 50;
  const ihsgFg = ihsg?.fearGreed7d?.[ihsg.fearGreed7d.length - 1] ?? 50;
  const goldFg = gold?.fearGreed7d?.[gold.fearGreed7d.length - 1] ?? 50;
  const btcFg = btc?.fearGreed7d?.[btc.fearGreed7d.length - 1] ?? 50;

  const commentaryPoints = [
    `US Factor & Equity Attribution: S&P 500 (${spx?.price.toLocaleString('en-US') ?? '—'}, ${spx && spx.changePercent >= 0 ? '+' : ''}${spx?.changePercent.toFixed(2) ?? '0.00'}%, F&G ${spxFg}) and NASDAQ (${ixic && ixic.changePercent >= 0 ? '+' : ''}${ixic?.changePercent.toFixed(2) ?? '0.00'}%) reflect ${macroRegimeLabel.toLowerCase()}, with index points led by ${usTop3.map((s) => `${s.symbol} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`).join(', ') || 'mega-cap tech'}.`,
    `Indonesia IDX & Carry Transmission: IHSG (${ihsg?.price.toLocaleString('en-US') ?? '—'}, ${ihsg && ihsg.changePercent >= 0 ? '+' : ''}${ihsg?.changePercent.toFixed(2) ?? '0.00'}%, F&G ${ihsgFg}) and EIDO ($${eido?.price.toFixed(2) ?? '—'}, ${eido && eido.changePercent >= 0 ? '+' : ''}${eido?.changePercent.toFixed(2) ?? '0.00'}%) price USD/IDR near ${usdidr?.price.toLocaleString('en-US') ?? '—'} alongside a ${idUsSpreadBps >= 0 ? '+' : ''}${idUsSpreadBps.toFixed(0)} bps ID–US 10Y sovereign spread.`,
    `Rates, Dollar & Real-Asset Hedge: US 10Y (${us10y?.price.toFixed(3) ?? '—'}%, 10s30s ${yieldCurveBps >= 0 ? '+' : ''}${yieldCurveBps.toFixed(1)} bps) and DXY (${dxy?.price.toFixed(3) ?? '—'}) set macro discount pressure, keeping Spot Gold at $${gold?.price.toLocaleString('en-US') ?? '—'} (${gold && gold.changePercent >= 0 ? '+' : ''}${gold?.changePercent.toFixed(2) ?? '0.00'}%, F&G ${goldFg}) and WTI at $${wti?.price.toFixed(2) ?? '—'}.`,
    `Crypto Liquidity Beta: Bitcoin (${btc ? `$${btc.price.toLocaleString('en-US')}` : '—'}, ${btc && btc.changePercent >= 0 ? '+' : ''}${btc?.changePercent.toFixed(2) ?? '0.00'}%, ${btcTier}, F&G ${btcFg}) trades as a 24/7 liquidity proxy between S1 ${btc?.support ?? '—'} and R1 ${btc?.resistance ?? '—'}.`,
  ];

  const stocksAndFlowSummary = `Cap-weighted US index drivers center on ${
    usTop3.map((s) => `${s.symbol} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`).join(', ') || 'flagship mega-caps'
  } (${usBreadthTotal - usBreadthNeg}/${usBreadthTotal} heavyweights advancing). In Jakarta, IDX point movers center on ${
    idxTop3.map((s) => `${s.symbol} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`).join(', ') || 'LQ45 leaders'
  }${
    idxBuyTop || idxSellTop
      ? `, with foreign desks ${idxBuyTop ? `accumulating ${idxBuyTop.symbol} (${idxBuyTop.foreignNetLabel})` : 'selective'}${idxSellTop ? ` vs trimming ${idxSellTop.symbol} (${idxSellTop.foreignNetLabel})` : ''}.`
      : '.'
  }`;

  const headline =
    compositeSentiment === 'Bullish'
      ? `Thesis: Risk-on breadth expansion (${bullCount} Bull vs ${bearCount} Bear) as ${usGainer?.symbol ?? 'mega-caps'} lead equity inflows`
      : compositeSentiment === 'Bearish'
        ? `Thesis: Defensive de-risking (${bearCount} Bear vs ${bullCount} Bull) under ${macroRegimeLabel.toLowerCase()} pressure`
        : `Thesis: Cross-asset dispersion (${bullCount} Bull / ${bearCount} Bear) as US (${spx && spx.changePercent >= 0 ? '+' : ''}${spx?.changePercent.toFixed(2) ?? '0.00'}%), IDX (${ihsg && ihsg.changePercent >= 0 ? '+' : ''}${ihsg?.changePercent.toFixed(2) ?? '0.00'}%), and Gold ($${gold?.price.toLocaleString('en-US') ?? '—'}) reprice yield signals`;

  let forwardPrediction = `Dual-Scenario Thesis: Bull Case triggers if US 10Y eases below ${us10y?.support ?? '4.900%'} and SPX reclaims ${spx?.open ?? spx?.resistance ?? 'opening drive'}, opening rotation back toward ${spx?.resistance ?? 'R1'} and IHSG ${ihsg?.resistance ?? 'R1'}. Bear Case activates if DXY breaks above ${dxy?.resistance ?? '104.20'} or SPX loses S1 ${spx?.support ?? 'support'} ahead of ${
    events[0] ? `${events[0].currency} ${events[0].title}` : 'upcoming macro prints'
  }, shifting flows into defensive cash & bullion hedges.`;

  // Deep session condition & movement trigger analysis (deterministic quantitative synthesis)
  const usSessState = getServerSessionInfo('SPX', nowDate);
  const idxSessState = getServerSessionInfo('IHSG', nowDate);
  const activeSessionDesc = [
    `US (${usSessState.stateLabel})`,
    `IDX (${idxSessState.stateLabel})`,
    '24/7 FX, Bullion & Crypto active',
  ].join(' · ');

  const topEvent = events[0];
  const topNews = stories[0];
  const triggerDrivers: string[] = [];
  if (dxy) {
    triggerDrivers.push(
      `DXY ${dxy.price.toFixed(3)} (${dxy.changePercent >= 0 ? '+' : ''}${dxy.changePercent.toFixed(2)}%)`
    );
  }
  if (us10y) {
    triggerDrivers.push(
      `US10Y ${us10y.price.toFixed(3)}% (${us10y.changePercent >= 0 ? '+' : ''}${us10y.changePercent.toFixed(2)}%)`
    );
  }
  if (usLeader) {
    triggerDrivers.push(
      `${usLeader.symbol} (${usLeader.changePercent >= 0 ? '+' : ''}${usLeader.changePercent.toFixed(2)}%)`
    );
  }
  if (idxLeader) {
    triggerDrivers.push(
      `${idxLeader.symbol} (${idxLeader.changePercent >= 0 ? '+' : ''}${idxLeader.changePercent.toFixed(2)}%)`
    );
  }
  if (topEvent) {
    triggerDrivers.push(
      !isUnpublishedActual(topEvent.actual)
        ? `${topEvent.currency} ${topEvent.title} (${topEvent.actual} vs ${topEvent.forecast})`
        : `${topEvent.currency} ${topEvent.title} (${topEvent.timeWib})`
    );
  }

  let sessionConditionAndTrigger = `Session Condition (${macroRegimeLabel}): ${activeSessionDesc}. Primary movement triggers stem from ${
    triggerDrivers.slice(0, 4).join(', ') || 'rate expectations and index heavyweight positioning'
  }${topNews ? ` alongside headline focus on "${topNews.headline.slice(0, 88)}"` : ''}.`;

  // Strictly ONE concise sentence summarizing the trigger and cross-asset positioning
  const buildOneSentence = () => {
    const spxStr = spx ? `S&P 500 (${spx.changePercent >= 0 ? '+' : ''}${spx.changePercent.toFixed(2)}%)` : 'US equities';
    const ihsgStr = ihsg ? `IHSG (${ihsg.changePercent >= 0 ? '+' : ''}${ihsg.changePercent.toFixed(2)}%)` : 'IDX';
    const dxyStr = dxy ? `DXY at ${dxy.price.toFixed(2)}` : 'the dollar';
    const goldStr = gold ? `Gold at $${gold.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'bullion';
    const btcStr = btc ? `Bitcoin at $${btc.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'crypto';
    const catCue = topEvent
      ? `ahead of ${topEvent.currency} ${topEvent.title}`
      : `under ${macroRegimeLabel.toLowerCase()}`;
    return `${spxStr} and ${ihsgStr} are recalibrating ${catCue}, while ${dxyStr} steers USD/IDR near ${
      usdidr ? Math.round(usdidr.price).toLocaleString('en-US') : 'spot'
    } alongside ${goldStr} and ${btcStr}.`;
  };

  let oneSentenceSummary = buildOneSentence();

  const enforceSingleSentence = (raw: string): string => {
    const flat = raw.replace(/\s+/g, ' ').trim();
    if (!flat) return '';
    // Match up to first terminal punctuation followed by space or end, ignoring decimal points (e.g. 5,920.50)
    const match = flat.match(/^.*?(?<!\d)[.!?](?=\s|$)/);
    const chosen = (match ? match[0] : flat).trim();
    return /[.!?]$/.test(chosen) ? chosen : `${chosen}.`;
  };

  let aiRefined = false;
  let finalHeadline = headline;
  let finalCommentary = commentaryPoints;

  // Server-side Gemini analytical thesis synthesis when GEMINI_API_KEY is configured
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const digestInput = {
        macroRegime: macroRegimeLabel,
        sessionStates: activeSessionDesc,
        yieldCurveBps: Number(yieldCurveBps.toFixed(1)),
        idUsSpreadBps: Number(idUsSpreadBps.toFixed(1)),
        indices: indexSessions.map((i) => ({ s: i.symbol, state: i.sessionStateLabel, p: i.priceFormatted, chg: i.changePercent, lvl: i.keyLevels })),
        usHeavyweights: usTop3.map((s) => ({ sym: s.symbol, px: s.price, chg: s.changePercent })),
        idxHeavyweights: idxTop3.map((s) => ({ sym: s.symbol, px: s.price, chg: s.changePercent })),
        dxy: dxy ? { p: dxy.price, chg: dxy.changePercent, sup: dxy.support, res: dxy.resistance } : null,
        us10y: us10y ? { p: us10y.price, chg: us10y.changePercent } : null,
        usdidr: usdidr ? { p: usdidr.price, chg: usdidr.changePercent, sup: usdidr.support, res: usdidr.resistance } : null,
        gold: gold ? { p: gold.price, chg: gold.changePercent, sup: gold.support, res: gold.resistance } : null,
        btc: btc ? { p: btc.price, chg: btc.changePercent, sup: btc.support, res: btc.resistance } : null,
        stocksAndFlowSummary,
        newsHeadlines: stories.slice(0, 6).map((s) => `${s.publisher}: ${s.headline}`),
        macroEvents: dataReleaseImplications.slice(0, 4).map((e) => `${e.currency} ${e.impact} ${e.title}: ${e.implication}`),
      };

      const aiRes = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `You are a senior cross-asset macro & equity strategist.
STEP 1 (Deep Reason First): Carefully evaluate the active market session conditions (which exchanges are open vs closed, overnight carryover, ID-US yield spreads, DXY liquidity pressure) and isolate the concrete price movement triggers from LIVE DATA below.
STEP 2 (Synthesize): Distill those findings into:
- sessionConditionAndTrigger: 2 concise analytical sentences detailing session state and primary movement triggers.
- oneSentenceSummary: Strictly ONE crisp, insightful sentence (max 34 words, NO Bull/Bear signal tags or Fear/Greed scores) summarizing cross-asset direction & catalyst for client briefs.
- headline, commentaryPoints, and forwardPrediction grounded strictly in LIVE DATA figures.

LIVE DATA:
${JSON.stringify(digestInput)}`,
          config: {
            systemInstruction:
              'Think deeply about session regime and causal movement triggers first. Output crisp, institutional-grade analysis strictly grounded in LIVE DATA. Never invent numbers outside LIVE DATA.',
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                sessionConditionAndTrigger: {
                  type: Type.STRING,
                  description: '2 crisp sentences analyzing live session conditions and the exact macro/flow/yield movement triggers.',
                },
                oneSentenceSummary: {
                  type: Type.STRING,
                  description: 'Strictly ONE cohesive analytical sentence (max 34 words) distilling the market commentary without Bear/Bull or Fear/Greed labels.',
                },
                headline: { type: Type.STRING, description: '1 analytical macro-thesis headline summarizing cross-asset price action.' },
                commentaryPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '4 analytical thesis bullets covering: (1) US Equities & Heavyweight Attribution, (2) Indonesia IDX, Rupiah & Sovereign Spreads, (3) Rates, DXY & Gold/Oil Hedging, (4) BTC & Liquidity Beta.',
                },
                forwardPrediction: {
                  type: Type.STRING,
                  description: '2-sentence probabilistic Dual-Scenario Thesis specifying Bull Trigger/Target and Bear Invalidation/Downside using exact S1/R1 levels.',
                },
              },
            },
          },
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 13_000)),
      ]);
      const rawTxt = (aiRes?.text ?? '').trim();
      if (rawTxt) {
        const parsed = JSON.parse(rawTxt) as {
          sessionConditionAndTrigger?: string;
          oneSentenceSummary?: string;
          headline?: string;
          commentaryPoints?: string[];
          forwardPrediction?: string;
        };
        if (parsed.sessionConditionAndTrigger && typeof parsed.sessionConditionAndTrigger === 'string') {
          sessionConditionAndTrigger = parsed.sessionConditionAndTrigger.trim();
        }
        if (parsed.oneSentenceSummary && typeof parsed.oneSentenceSummary === 'string') {
          const single = enforceSingleSentence(parsed.oneSentenceSummary);
          if (single.length > 20) {
            oneSentenceSummary = single;
          }
        }
        if (parsed.headline && typeof parsed.headline === 'string') {
          finalHeadline = parsed.headline.trim();
          aiRefined = true;
        }
        if (Array.isArray(parsed.commentaryPoints) && parsed.commentaryPoints.length >= 2) {
          finalCommentary = parsed.commentaryPoints.slice(0, 4).map((s) => String(s).trim());
        }
        if (parsed.forwardPrediction && typeof parsed.forwardPrediction === 'string') {
          forwardPrediction = parsed.forwardPrediction.trim();
        }
      }
    } catch {
      // Retain deterministic quantitative thesis synthesis on Gemini failure/timeout
    }
  }

  // Unified Cross-Source Signal Fusion (replaces 4 fragmented intelligence panels with ONE survival synthesis entity)
  const totalSignals = Math.max(1, bullCount + bearCount + neutralCount);
  const equityFlowVector = ((bullCount - bearCount) / totalSignals) * 100;
  const wireToneVector =
    rumorAndCatalystThemes.reduce(
      (acc, r) => acc + (r.tone === 'bull' ? 1 : r.tone === 'bear' ? -1 : 0),
      0
    ) * (100 / Math.max(1, rumorAndCatalystThemes.length));
  const upcomingHighMacro = selectedMacroEvents.find(
    (ev) => ev.impact === 'HIGH' && Date.parse(ev.isoDate) > now && Date.parse(ev.isoDate) - now < 24 * 3600_000
  );
  const macroPressureVector = -macroTighteningScore * 22;
  const alignedAgreement = Math.round(
    Math.min(
      95,
      Math.max(
        42,
        54 +
          (Math.abs(equityFlowVector * 0.5 + wireToneVector * 0.3 + macroPressureVector * 0.2) *
            0.42)
      )
    )
  );

  const regimeTag: NonNullable<MarketIntelligencePayload['unifiedSynthesis']>['regimeTag'] =
    upcomingHighMacro && Math.abs(equityFlowVector) < 22
      ? 'Macro Event Caution'
      : compositeSentiment === 'Bullish'
        ? 'Risk-On Expansion'
        : compositeSentiment === 'Bearish'
          ? 'Defensive De-Risking'
          : 'Selective Rotation';

  const unifiedCatalysts: NonNullable<MarketIntelligencePayload['unifiedSynthesis']>['catalysts'] = [];
  // 1. Primary Equities & Flow attribution catalyst
  unifiedCatalysts.push({
    id: 'cat-flow-global',
    kind: 'FLOW',
    tag: idxBuyTop ? `Equities & Foreign Flow` : 'Cap-Weighted Flow',
    title:
      usTop3.length > 0
        ? `US Led by ${usTop3.slice(0, 2).map((s) => `${s.symbol} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`).join(', ')}${idxTop3[0] ? ` · IDX ${idxTop3[0].symbol} (${idxTop3[0].changePercent >= 0 ? '+' : ''}${idxTop3[0].changePercent.toFixed(2)}%)` : ''}`
        : 'Global Equity Breadth & Cross-Border Flow',
    implication: stocksAndFlowSummary,
    tone: equityFlowVector >= 10 ? 'bull' : equityFlowVector <= -10 ? 'bear' : 'neutral',
    routeTarget: 'stocks',
  });

  // 2. Top Macro Release catalysts (ForexFactory High/Med)
  for (const ev of selectedMacroEvents.slice(0, 2)) {
    unifiedCatalysts.push({
      id: `cat-macro-${ev.id}`,
      kind: 'MACRO',
      tag: `${ev.currency} · ${ev.timeWib} · ${ev.impact === 'HIGH' ? 'High' : 'Med'}`,
      title: `${ev.title}${ev.forecast && ev.forecast !== '—' ? ` (Fcst ${ev.forecast} / Prev ${ev.previous})` : ''}`,
      implication: buildMacroImplicationText(ev),
      tone: ev.deviationType === 'beat' ? 'bull' : ev.deviationType === 'miss' ? 'bear' : 'neutral',
      routeTarget: 'calendar',
    });
  }

  // 3. Top Headline / Rumor narrative cues
  for (const [idx, theme] of rumorAndCatalystThemes.slice(0, 2).entries()) {
    unifiedCatalysts.push({
      id: `cat-wire-${idx}`,
      kind: 'WIRE',
      tag: theme.tag,
      title: theme.theme,
      implication:
        theme.tone === 'bull'
          ? 'Reinforces risk appetite and upside breadth into active session liquidity.'
          : theme.tone === 'bear'
            ? 'Adds defensive hedging demand and caps multiple expansion until yields stabilize.'
            : 'Monitor follow-through volume for confirmation across index heavyweights.',
      tone: theme.tone,
      routeTarget: 'news',
    });
  }

  const nextMacroLabel = selectedMacroEvents[0]
    ? `${selectedMacroEvents[0].currency} ${selectedMacroEvents[0].title} (${selectedMacroEvents[0].timeWib})`
    : 'upcoming Tier-1 macro prints';

  const unifiedSynthesis: NonNullable<MarketIntelligencePayload['unifiedSynthesis']> = {
    regimeTag,
    convictionPct: alignedAgreement,
    executiveThesis: `${oneSentenceSummary} ${sessionConditionAndTrigger}`,
    catalysts: unifiedCatalysts.slice(0, 5),
    scenarios: {
      horizonLabel: upcomingHighMacro ? `Event Window · ${upcomingHighMacro.timeWib}` : 'Next 24h Session Window',
      bullTrigger: `US 10Y holds below ${us10y?.support ?? '4.900%'} & S&P 500 sustains above ${spx?.open ?? spx?.support ?? 'pivot'}`,
      bullTarget: `Rotates toward SPX ${spx?.resistance ?? 'R1'}, IHSG ${ihsg?.resistance ?? 'R1'}, and risk-beta (${btc?.resistance ?? 'BTC R1'})`,
      baseCase: `Two-way range dispersion around DXY ${dxy?.price.toFixed(2) ?? 'spot'} and Gold $${gold?.price.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? 'spot'} ahead of ${nextMacroLabel}`,
      bearTrigger: `DXY breaks ${dxy?.resistance ?? 'resistance'} or SPX fails S1 ${spx?.support ?? 'support'} on hawkish surprise`,
      bearTarget: `Defensives & bullion bid toward Gold ${gold?.resistance ?? 'R1'} as equities test lower liquidity shelves`,
    },
  };

  const result: MarketIntelligencePayload = {
    updatedAt: new Date(now).toISOString(),
    headline: finalHeadline,
    compositeSentiment,
    signalTally: { bullCount, bearCount, neutralCount },
    sourcesCount: sourceNames.length,
    sourceNames,
    commentaryPoints: finalCommentary,
    rumorAndCatalystThemes,
    dataReleaseImplications,
    stocksAndFlowSummary,
    forwardPrediction,
    sessionConditionAndTrigger,
    oneSentenceSummary,
    unifiedSynthesis,
    indexSessions,
    aiRefined,
  };

  intelligenceCache.entry = { data: result, expiresAt: now + (aiRefined ? 300_000 : 45_000) };
  return result;
  });
}

export interface HeatmapStockItem {
  symbol: string;
  yahooSymbol: string;
  name: string;
  market: 'US' | 'ID';
  exchange: string;
  currency: 'USD' | 'IDR';
  sector: string;
  price: number;
  prevClose: number;
  changePercent: number;
  marketCap: number;
  marketCapNative: number;
  volumeRaw: number;
  marketCapLabel: string;
}

export interface MarketHeatmapResponse {
  us: HeatmapStockItem[];
  indonesia: HeatmapStockItem[];
  sectorsUs: string[];
  sectorsIndonesia: string[];
  updatedAt: string;
}

const US_DUAL_CLASS_SKIP = new Set([
  'GOOG', 'BRK.A', 'FOXA', 'NWSA', 'PARAA', 'UHAL.B', 'LEN.B', 'BF.A', 'HEI.A',
]);

const HEATMAP_SECTOR_OVERRIDES: Record<string, string> = {
  // Indonesia IDX accurate sector classification
  BBCA: 'Financials',
  BBRI: 'Financials',
  BMRI: 'Financials',
  BBNI: 'Financials',
  BRIS: 'Financials',
  ASII: 'Industrials',
  UNTR: 'Industrials',
  PANI: 'Industrials',
  BREN: 'Energy & Materials',
  TPIA: 'Energy & Materials',
  AMMN: 'Energy & Materials',
  ADRO: 'Energy & Materials',
  BYAN: 'Energy & Materials',
  CUAN: 'Energy & Materials',
  PTBA: 'Energy & Materials',
  ANTM: 'Energy & Materials',
  MDKA: 'Energy & Materials',
  INCO: 'Energy & Materials',
  TLKM: 'Telecom & Utilities',
  ISAT: 'Telecom & Utilities',
  EXCL: 'Telecom & Utilities',
  PGAS: 'Telecom & Utilities',
  DNET: 'Telecom & Utilities',
  DCII: 'Technology',
  GOTO: 'Technology',
  ICBP: 'Consumer',
  INDF: 'Consumer',
  UNVR: 'Consumer',
  AMRT: 'Consumer',
  HMSP: 'Consumer',
  GGRM: 'Consumer',
  KLBF: 'Healthcare',
  MIKA: 'Healthcare',
  SILO: 'Healthcare',
  // US flagship accurate grouping
  GOOGL: 'Technology',
  META: 'Technology',
  NFLX: 'Telecom & Utilities',
  TMUS: 'Telecom & Utilities',
  AMZN: 'Consumer',
  TSLA: 'Consumer',
  WMT: 'Consumer',
  COST: 'Consumer',
  HD: 'Consumer',
};

function normalizeHeatmapSector(symbol: string, rawSector: string, rawIndustry = ''): string {
  const override = HEATMAP_SECTOR_OVERRIDES[symbol];
  if (override) return override;

  const combined = `${rawSector} ${rawIndustry}`.toLowerCase();
  if (combined.includes('financ') || combined.includes('bank') || combined.includes('insurance') || combined.includes('reit')) {
    return 'Financials';
  }
  if (combined.includes('health') || combined.includes('pharma') || combined.includes('biotech') || combined.includes('medical') || combined.includes('hospital')) {
    return 'Healthcare';
  }
  if (
    combined.includes('energy') ||
    combined.includes('oil') ||
    combined.includes('gas') ||
    combined.includes('mineral') ||
    combined.includes('metal') ||
    combined.includes('mining') ||
    combined.includes('coal') ||
    combined.includes('chemical') ||
    combined.includes('material')
  ) {
    return 'Energy & Materials';
  }
  if (combined.includes('telecom') || combined.includes('utilit') || combined.includes('wireless') || combined.includes('electric') || combined.includes('renewable')) {
    return 'Telecom & Utilities';
  }
  if (combined.includes('retail') || combined.includes('consumer') || combined.includes('food') || combined.includes('beverage') || combined.includes('tobacco') || combined.includes('apparel')) {
    return 'Consumer';
  }
  if (combined.includes('tech') || combined.includes('electronic') || combined.includes('software') || combined.includes('semiconductor') || combined.includes('internet')) {
    return 'Technology';
  }
  if (combined.includes('manufact') || combined.includes('industr') || combined.includes('transport') || combined.includes('aerospace') || combined.includes('machinery') || combined.includes('auto') || combined.includes('real estate')) {
    return 'Industrials';
  }
  return 'Diversified';
}

function formatMarketCapCompact(capNative: number, currency: 'USD' | 'IDR'): string {
  if (!Number.isFinite(capNative) || capNative <= 0) return '—';
  if (currency === 'IDR') {
    if (capNative >= 1e12) return `Rp ${(capNative / 1e12).toFixed(1)}T`;
    if (capNative >= 1e9) return `Rp ${(capNative / 1e9).toFixed(0)}B`;
    return `Rp ${Math.round(capNative / 1e6)}M`;
  }
  if (capNative >= 1e12) return `$${(capNative / 1e12).toFixed(2)}T`;
  if (capNative >= 1e9) return `$${(capNative / 1e9).toFixed(1)}B`;
  return `$${(capNative / 1e6).toFixed(0)}M`;
}

const US_HEATMAP_META: Record<string, { sector: string; fallbackCapUsd: number }> = {
  NVDA: { sector: 'Technology', fallbackCapUsd: 3.4e12 },
  AAPL: { sector: 'Technology', fallbackCapUsd: 3.35e12 },
  MSFT: { sector: 'Technology', fallbackCapUsd: 3.1e12 },
  AMZN: { sector: 'Consumer', fallbackCapUsd: 2.2e12 },
  GOOGL: { sector: 'Technology', fallbackCapUsd: 2.15e12 },
  META: { sector: 'Telecom & Utilities', fallbackCapUsd: 1.5e12 },
  TSLA: { sector: 'Consumer', fallbackCapUsd: 1.05e12 },
  AVGO: { sector: 'Technology', fallbackCapUsd: 8.6e11 },
  LLY: { sector: 'Healthcare', fallbackCapUsd: 7.9e11 },
  JPM: { sector: 'Financials', fallbackCapUsd: 6.8e11 },
  V: { sector: 'Financials', fallbackCapUsd: 6.1e11 },
  XOM: { sector: 'Energy & Materials', fallbackCapUsd: 5.2e11 },
  UNH: { sector: 'Healthcare', fallbackCapUsd: 5.1e11 },
  ORCL: { sector: 'Technology', fallbackCapUsd: 4.8e11 },
  NFLX: { sector: 'Telecom & Utilities', fallbackCapUsd: 3.8e11 },
  AMD: { sector: 'Technology', fallbackCapUsd: 2.3e11 },
  PLTR: { sector: 'Technology', fallbackCapUsd: 1.8e11 },
  MU: { sector: 'Technology', fallbackCapUsd: 1.2e11 },
};

const IDX_HEATMAP_META: Record<string, { sector: string; fallbackCapIdr: number }> = {
  BBCA: { sector: 'Financials', fallbackCapIdr: 1180e12 },
  BREN: { sector: 'Energy & Materials', fallbackCapIdr: 950e12 },
  BBRI: { sector: 'Financials', fallbackCapIdr: 680e12 },
  TPIA: { sector: 'Energy & Materials', fallbackCapIdr: 640e12 },
  AMMN: { sector: 'Energy & Materials', fallbackCapIdr: 620e12 },
  BMRI: { sector: 'Financials', fallbackCapIdr: 580e12 },
  TLKM: { sector: 'Telecom & Utilities', fallbackCapIdr: 280e12 },
  ASII: { sector: 'Industrials', fallbackCapIdr: 205e12 },
  BBNI: { sector: 'Financials', fallbackCapIdr: 185e12 },
  ICBP: { sector: 'Consumer', fallbackCapIdr: 135e12 },
  BRIS: { sector: 'Financials', fallbackCapIdr: 132e12 },
  ADRO: { sector: 'Energy & Materials', fallbackCapIdr: 115e12 },
  UNTR: { sector: 'Industrials', fallbackCapIdr: 98e12 },
  INDF: { sector: 'Consumer', fallbackCapIdr: 68e12 },
  KLBF: { sector: 'Healthcare', fallbackCapIdr: 66e12 },
  ISAT: { sector: 'Telecom & Utilities', fallbackCapIdr: 74e12 },
  GOTO: { sector: 'Technology', fallbackCapIdr: 82e12 },
  MDKA: { sector: 'Energy & Materials', fallbackCapIdr: 54e12 },
  PTBA: { sector: 'Energy & Materials', fallbackCapIdr: 32e12 },
  ANTM: { sector: 'Energy & Materials', fallbackCapIdr: 38e12 },
  PGAS: { sector: 'Telecom & Utilities', fallbackCapIdr: 37e12 },
  EXCL: { sector: 'Telecom & Utilities', fallbackCapIdr: 30e12 },
};

async function fetchTradingViewHeatmapScan(
  region: 'america' | 'indonesia',
  usdIdrRate: number,
  limit = 48
): Promise<HeatmapStockItem[]> {
  try {
    const isId = region === 'indonesia';
    const minCap = isId ? 8e12 : 1.5e10;
    const res = await fetch(`https://scanner.tradingview.com/${region}/scan`, {
      method: 'POST',
      headers: {
        ...UA_HEADERS,
        'Content-Type': 'application/json',
        Origin: 'https://www.tradingview.com',
        Referer: 'https://www.tradingview.com/',
      },
      body: JSON.stringify({
        filter: [
          { left: 'type', operation: 'equal', right: 'stock' },
          { left: 'subtype', operation: 'equal', right: 'common' },
          { left: 'close', operation: 'greater', right: isId ? 50 : 5 },
          { left: 'market_cap_basic', operation: 'greater', right: minCap },
        ],
        options: { lang: 'en' },
        markets: [region],
        columns: [
          'name',
          'description',
          'close',
          'change',
          'change_abs',
          'volume',
          'exchange',
          'market_cap_basic',
          'sector',
          'industry',
        ],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        range: [0, limit + 16],
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: Array<{ s?: string; d?: Array<string | number | null> }>;
    };

    const items: HeatmapStockItem[] = [];
    const seen = new Set<string>();
    const seenRoots = new Set<string>();
    for (const row of json.data ?? []) {
      const d = row.d;
      if (!d || d.length < 9) continue;
      const symbol = String(d[0] || '').trim().toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      // Exclude preferred shares, dual-class duplicates, rights, warrants, or depositary duplicates
      if (!isId && (US_DUAL_CLASS_SKIP.has(symbol) || /[.-](P|PR|WS|RT|UN)[A-Z0-9]*$/i.test(symbol))) {
        continue;
      }
      const rawName = String(d[1] || symbol).replace(/\s+Tbk\.?$/i, ' Tbk');
      if (/\b(Preferred|Depositary|Series\s+[A-Z]|ADR)\b/i.test(rawName)) continue;

      const rootNameKey = rawName
        .toLowerCase()
        .replace(/,?\s*(inc\.?|corp\.?|corporation|ltd\.?|llc|plc|co\.?|tbk|class\s+[a-c]|cl\s+[a-c]).*$/i, '')
        .replace(/[^a-z0-9]/g, '');
      if (rootNameKey.length >= 4 && seenRoots.has(`${region}-${rootNameKey}`)) continue;

      const name = rawName.slice(0, 42);
      const close = Number(d[2]);
      const changePct = Number(d[3]);
      const changeAbs = Number(d[4] ?? 0);
      const vol = Number(d[5] ?? 0);
      const exchange = isId ? 'IDX · Jakarta' : String(d[6] || 'NYSE/NASDAQ');
      const mcapNative = Number(d[7] ?? 0);
      const rawSector = String(d[8] || '');
      const rawIndustry = String(d[9] || '');
      if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(changePct) || !Number.isFinite(mcapNative) || mcapNative <= 0) {
        continue;
      }

      seen.add(symbol);
      if (rootNameKey.length >= 4) seenRoots.add(`${region}-${rootNameKey}`);
      const price = isId ? Math.round(close) : Number(close.toFixed(2));
      const prevClose = isId
        ? Math.max(1, Math.round(close - changeAbs))
        : Number(Math.max(0.01, close - changeAbs).toFixed(2));
      const marketCapUsd = isId ? mcapNative / Math.max(10_000, usdIdrRate) : mcapNative;

      items.push({
        symbol,
        yahooSymbol: isId ? `${symbol}.JK` : symbol,
        name,
        market: isId ? 'ID' : 'US',
        exchange,
        currency: isId ? 'IDR' : 'USD',
        sector: normalizeHeatmapSector(symbol, rawSector, rawIndustry),
        price,
        prevClose,
        changePercent: Number(changePct.toFixed(2)),
        marketCap: marketCapUsd,
        marketCapNative: mcapNative,
        volumeRaw: Number.isFinite(vol) ? vol : 0,
        marketCapLabel: formatMarketCapCompact(mcapNative, isId ? 'IDR' : 'USD'),
      });
      if (items.length >= limit) break;
    }
    return items;
  } catch {
    return [];
  }
}

export async function fetchMarketHeatmap(): Promise<MarketHeatmapResponse> {
  const now = Date.now();
  if (heatmapCache.entry) {
    if (heatmapCache.entry.expiresAt > now) {
      return heatmapCache.entry.data;
    }
    if (now - heatmapCache.entry.expiresAt < 900_000) {
      void fetchMarketHeatmapFresh().catch(() => null);
      return heatmapCache.entry.data;
    }
  }
  return fetchMarketHeatmapFresh();
}

async function fetchMarketHeatmapFresh(): Promise<MarketHeatmapResponse> {
  const now = Date.now();
  return coalesceInFlight('market-heatmap', heatmapCache.entry?.data, async () => {

  // Resolve current USD/IDR conversion factor so cross-market cap comparisons stay accurate
  let usdIdrRate = 16_200;
  try {
    const q = await fetchLiveQuotes();
    const idrQuote = q.quotes.find((item) => item.id === 'USDIDR');
    if (idrQuote && idrQuote.price > 10_000) {
      usdIdrRate = idrQuote.price;
    }
  } catch {
    // use safe baseline
  }

  const [tvUs, tvId] = await Promise.all([
    fetchTradingViewHeatmapScan('america', usdIdrRate, 48),
    fetchTradingViewHeatmapScan('indonesia', usdIdrRate, 36),
  ]);

  let usItems = tvUs;
  let idItems = tvId;

  // Fallback to Yahoo Finance direct baskets + calibrated cap weights if TradingView throttles
  if (usItems.length < 10) {
    const yahooUs = await fetchYahooDirectBasket('US');
    usItems = yahooUs.map((m) => {
      const meta = US_HEATMAP_META[m.symbol] ?? { sector: 'Technology', fallbackCapUsd: 1.2e11 };
      return {
        symbol: m.symbol,
        yahooSymbol: m.symbol,
        name: m.name,
        market: 'US',
        exchange: m.exchange,
        currency: 'USD',
        sector: meta.sector,
        price: m.price,
        prevClose: m.prevClose,
        changePercent: m.changePercent,
        marketCap: meta.fallbackCapUsd,
        marketCapNative: meta.fallbackCapUsd,
        volumeRaw: m.volumeRaw,
        marketCapLabel: formatMarketCapCompact(meta.fallbackCapUsd, 'USD'),
      };
    });
  }

  if (idItems.length < 10) {
    const yahooId = await fetchYahooDirectBasket('ID');
    idItems = yahooId.map((m) => {
      const meta = IDX_HEATMAP_META[m.symbol] ?? { sector: 'Financials', fallbackCapIdr: 45e12 };
      return {
        symbol: m.symbol,
        yahooSymbol: `${m.symbol}.JK`,
        name: m.name,
        market: 'ID',
        exchange: 'IDX · Jakarta',
        currency: 'IDR',
        sector: meta.sector,
        price: m.price,
        prevClose: m.prevClose,
        changePercent: m.changePercent,
        marketCap: meta.fallbackCapIdr / usdIdrRate,
        marketCapNative: meta.fallbackCapIdr,
        volumeRaw: m.volumeRaw,
        marketCapLabel: formatMarketCapCompact(meta.fallbackCapIdr, 'IDR'),
      };
    });
  }

  const sortSectors = (list: HeatmapStockItem[]) => {
    const totals = new Map<string, number>();
    for (const item of list) {
      totals.set(item.sector, (totals.get(item.sector) ?? 0) + item.marketCap);
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sec]) => sec);
  };

  const result: MarketHeatmapResponse = {
    us: usItems.slice(0, 48),
    indonesia: idItems.slice(0, 36),
    sectorsUs: sortSectors(usItems),
    sectorsIndonesia: sortSectors(idItems),
    updatedAt: new Date(now).toISOString(),
  };

  heatmapCache.entry = { data: result, expiresAt: now + 20_000 };
  return result;
  });
}

export type ShareScheduleSlot = 'morning_0530' | 'afternoon_1630';

export interface ShareSnapshotAsset {
  id: string;
  symbol: string;
  shortName: string;
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  decimals: number;
  currencyPrefix?: string;
  unitSuffix?: string;
  support: string;
  resistance: string;
  barTimestampIso: string;
  barTimeWib: string;
}

export interface ShareSnapshotResponse {
  slot: ShareScheduleSlot;
  dateKey: string;
  dateLabel: string;
  timeSlotLabel: string;
  targetTimestampIso: string;
  targetEpochMs: number;
  editionTitle: string;
  marketSummary: string;
  aiGenerated: boolean;
  assets: Record<string, ShareSnapshotAsset>;
  updatedAt: string;
}

const SHARE_SLOT_META: Record<
  string,
  { symbol: string; shortName: string; yahooSymbol: string; decimals: number; currencyPrefix?: string; fallbackTz: string }
> = {
  SPX: { symbol: 'SPX', shortName: 'S&P 500', yahooSymbol: '^GSPC', decimals: 2, fallbackTz: 'America/New_York' },
  IXIC: { symbol: 'IXIC', shortName: 'NASDAQ Composite', yahooSymbol: '^IXIC', decimals: 2, fallbackTz: 'America/New_York' },
  DJI: { symbol: 'DJI', shortName: 'Dow Jones', yahooSymbol: '^DJI', decimals: 2, fallbackTz: 'America/New_York' },
  IHSG: { symbol: 'IHSG', shortName: 'IDX Composite', yahooSymbol: '^JKSE', decimals: 2, fallbackTz: 'Asia/Jakarta' },
  BTCUSD: { symbol: 'BTC/USD', shortName: 'Bitcoin', yahooSymbol: 'BTC-USD', decimals: 2, currencyPrefix: '$', fallbackTz: 'UTC' },
  DXY: { symbol: 'DXY', shortName: 'US Dollar Index', yahooSymbol: 'DX-Y.NYB', decimals: 3, fallbackTz: 'America/New_York' },
  USDIDR: { symbol: 'USD/IDR', shortName: 'Rupiah Spot', yahooSymbol: 'IDR=X', decimals: 2, fallbackTz: 'Asia/Jakarta' },
  XAUUSD: { symbol: 'XAU/USD', shortName: 'Spot Gold', yahooSymbol: 'GC=F', decimals: 2, currencyPrefix: '$', fallbackTz: 'America/New_York' },
};

const shareSnapshotCache = new Map<string, CacheEntry<ShareSnapshotResponse>>();

function resolveShareTargetTimestamp(now: Date, slot: ShareScheduleSlot) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === 'year')?.value ?? '2026');
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '11');
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? '20');

  const targetHourWib = slot === 'morning_0530' ? 5 : 16;
  const targetMinuteWib = 30;

  // Jakarta is fixed UTC+7 year-round (zero DST)
  let targetEpochMs = Date.UTC(year, month - 1, day, targetHourWib - 7, targetMinuteWib, 0);
  if (targetEpochMs > now.getTime()) {
    targetEpochMs -= 86_400_000;
  }

  const targetDate = new Date(targetEpochMs);
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(targetDate);
  const dateKey = `${dateParts.find((p) => p.type === 'year')?.value}-${dateParts.find((p) => p.type === 'month')?.value}-${dateParts.find((p) => p.type === 'day')?.value}`;

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(targetDate);

  return {
    targetEpochMs,
    targetTimestampIso: targetDate.toISOString(),
    dateKey,
    dateLabel,
    timeSlotLabel: slot === 'morning_0530' ? '05:30 WIB' : '16:30 WIB',
  };
}

function formatDateInTimezone(epochMs: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(epochMs));
  } catch {
    return new Date(epochMs).toISOString().slice(0, 10);
  }
}

function formatWibShortTime(epochMs: number): string {
  return (
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(epochMs)) + ' WIB'
  );
}

function computeSnapshotSupportResistance(
  price: number,
  dayHigh: number,
  dayLow: number,
  decimals: number,
  prefix = ''
): { support: string; resistance: string } {
  const high = Math.max(price, dayHigh);
  const low = Math.min(price, dayLow);
  const span = Math.max(0, high - low);
  const pivot = (high + low + price) / 3;
  const calcSupport = 2 * pivot - high;
  const calcResistance = 2 * pivot - low;
  const supportNum = span > 0 ? Math.min(calcSupport, low, price * 0.996) : price * 0.992;
  const resistanceNum = span > 0 ? Math.max(calcResistance, high, price * 1.004) : price * 1.008;
  return {
    support: formatStatNumber(supportNum, decimals, prefix, ''),
    resistance: formatStatNumber(resistanceNum, decimals, prefix, ''),
  };
}

interface OhlcBar {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

async function fetchYahooChartBars(
  yahooSymbol: string,
  range: string,
  interval: string
): Promise<{ tz: string | null; metaPrice: number | null; bars: OhlcBar[] }> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yahooSymbol
      )}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`,
      { headers: UA_HEADERS, signal: AbortSignal.timeout(6500) }
    );
    if (!res.ok) return { tz: null, metaPrice: null, bars: [] };
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { exchangeTimezoneName?: string; regularMarketPrice?: number };
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
            }>;
          };
        }>;
      };
    };
    const item = json.chart?.result?.[0];
    const ts = item?.timestamp ?? [];
    const q = item?.indicators?.quote?.[0];
    const bars: OhlcBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const close = q?.close?.[i];
      if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) continue;
      const open = typeof q?.open?.[i] === 'number' && (q.open[i] as number) > 0 ? (q.open[i] as number) : close;
      const high = typeof q?.high?.[i] === 'number' && (q.high[i] as number) > 0 ? (q.high[i] as number) : Math.max(open, close);
      const low = typeof q?.low?.[i] === 'number' && (q.low[i] as number) > 0 ? (q.low[i] as number) : Math.min(open, close);
      bars.push({
        t: ts[i] * 1000,
        open,
        high,
        low,
        close,
      });
    }
    return {
      tz: item?.meta?.exchangeTimezoneName ?? null,
      metaPrice:
        typeof item?.meta?.regularMarketPrice === 'number'
          ? item.meta.regularMarketPrice
          : null,
      bars,
    };
  } catch {
    return { tz: null, metaPrice: null, bars: [] };
  }
}

async function fetchCoinbaseHistoricalBtcAt(
  targetEpochMs: number
): Promise<ShareSnapshotAsset | null> {
  try {
    const res = await fetch(
      'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=900',
      { headers: UA_HEADERS, signal: AbortSignal.timeout(5500) }
    );
    if (!res.ok) return null;
    const raw = (await res.json()) as Array<[number, number, number, number, number, number]>;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const bars = raw
      .filter((c) => Array.isArray(c) && c.length >= 5 && c[0] * 1000 <= targetEpochMs)
      .map((c) => ({
        t: c[0] * 1000,
        low: Number(c[1]),
        high: Number(c[2]),
        open: Number(c[3]),
        close: Number(c[4]),
      }))
      .filter((b) => Number.isFinite(b.close) && b.close > 0)
      .sort((a, b) => a.t - b.t);

    if (bars.length === 0) return null;
    const latest = bars[bars.length - 1];
    const targetPrevMs = targetEpochMs - 86_400_000;
    let prevBar = bars[0];
    let bestDiff = Infinity;
    for (const b of bars) {
      const diff = Math.abs(b.t - targetPrevMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        prevBar = b;
      }
    }

    const window24h = bars.filter((b) => b.t >= targetPrevMs && b.t <= latest.t);
    const sessionHigh =
      window24h.length > 0 ? Math.max(...window24h.map((b) => b.high)) : latest.high;
    const sessionLow =
      window24h.length > 0 ? Math.min(...window24h.map((b) => b.low)) : latest.low;

    const price = Number(latest.close.toFixed(2));
    const prevClose = Number(prevBar.close.toFixed(2));
    const changeValue = Number((price - prevClose).toFixed(2));
    const changePercent = Number(
      (((price - prevClose) / Math.max(1e-6, prevClose)) * 100).toFixed(2)
    );
    const { support, resistance } = computeSnapshotSupportResistance(
      price,
      sessionHigh,
      sessionLow,
      2,
      '$'
    );

    return {
      id: 'BTCUSD',
      symbol: 'BTC/USD',
      shortName: 'Bitcoin',
      price,
      prevClose,
      changeValue,
      changePercent,
      decimals: 2,
      currencyPrefix: '$',
      support,
      resistance,
      barTimestampIso: new Date(latest.t).toISOString(),
      barTimeWib: formatWibShortTime(latest.t),
    };
  } catch {
    return null;
  }
}

function buildDeterministicTimestampSummary(
  slot: ShareScheduleSlot,
  timeSlotLabel: string,
  dateLabel: string,
  map: Record<string, ShareSnapshotAsset>
): string {
  const fmtSigned = (v?: ShareSnapshotAsset) =>
    v ? `${v.changePercent >= 0 ? '+' : ''}${v.changePercent.toFixed(2)}%` : '—';
  const fmtPx = (v?: ShareSnapshotAsset) =>
    v
      ? `${v.currencyPrefix ?? ''}${v.price.toLocaleString('en-US', {
          minimumFractionDigits: v.decimals,
          maximumFractionDigits: v.decimals,
        })}`
      : '—';

  const ihsg = map.IHSG;
  const btc = map.BTCUSD;
  const dxy = map.DXY;
  const usdidr = map.USDIDR;
  const gold = map.XAUUSD;

  if (slot === 'morning_0530') {
    const spx = map.SPX;
    const ixic = map.IXIC;
    return `At ${timeSlotLabel} (${dateLabel}), Wall Street settled with S&P 500 at ${fmtPx(spx)} (${fmtSigned(
      spx
    )}) and NASDAQ (${fmtSigned(ixic)}) while IHSG holds ${fmtPx(ihsg)} (${fmtSigned(
      ihsg
    )}) ahead of the Jakarta open, with DXY at ${fmtPx(dxy)}, USD/IDR at ${fmtPx(
      usdidr
    )}, Gold at ${fmtPx(gold)} (${fmtSigned(gold)}), and Bitcoin at ${fmtPx(btc)} (${fmtSigned(
      btc
    )}).`;
  }

  return `At ${timeSlotLabel} (${dateLabel}), IHSG wrapped Jakarta trade at ${fmtPx(ihsg)} (${fmtSigned(
    ihsg
  )}) alongside USD/IDR at ${fmtPx(usdidr)} (${fmtSigned(usdidr)}), while DXY trades near ${fmtPx(
    dxy
  )} (${fmtSigned(dxy)}) with Gold at ${fmtPx(gold)} (${fmtSigned(gold)}) and Bitcoin at ${fmtPx(
    btc
  )} (${fmtSigned(btc)}).`;
}

export async function fetchScheduledShareSnapshot(
  slot: ShareScheduleSlot,
  forceRefresh = false
): Promise<ShareSnapshotResponse> {
  const now = new Date();
  const timing = resolveShareTargetTimestamp(now, slot);
  const cacheKey = `${timing.dateKey}:${slot}`;

  const cached = shareSnapshotCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > now.getTime()) {
    return cached.data;
  }

  return coalesceInFlight(`share-snapshot:${cacheKey}`, cached?.data, async () => {
    const targetIds =
      slot === 'morning_0530'
        ? ['SPX', 'IXIC', 'DJI', 'IHSG', 'BTCUSD', 'DXY', 'USDIDR', 'XAUUSD']
        : ['IHSG', 'BTCUSD', 'DXY', 'USDIDR', 'XAUUSD'];

    const [tvGlobalMap, liveQuotesPayload, calPayload, newsPayload] = await Promise.all([
      fetchTradingViewGlobalQuotes(),
      fetchLiveQuotes().catch(() => ({ quotes: [] as LiveQuotePatch[], updatedAt: '' })),
      fetchLiveCalendar().catch(() => ({ events: [] as LiveCalendarItem[], nextCatalyst: null, source: '', updatedAt: '' })),
      fetchLiveNews().catch(() => ({ stories: [] as LiveNewsItem[], updatedAt: '' })),
    ]);

    const liveById = new Map(liveQuotesPayload.quotes.map((q) => [q.id, q]));

    // Fetch spot gold basis once (OANDA Spot XAUUSD minus GC=F latest price)
    let goldSpotBasis = 0;
    const tvGold = tvGlobalMap.get('XAUUSD');

    const assetEntries = await Promise.all(
      targetIds.map(async (id): Promise<[string, ShareSnapshotAsset | null]> => {
        if (id === 'BTCUSD') {
          const btcSnap = await fetchCoinbaseHistoricalBtcAt(timing.targetEpochMs);
          if (btcSnap) return [id, btcSnap];
          const liveBtc = liveById.get('BTCUSD');
          if (liveBtc) {
            return [
              id,
              {
                id: 'BTCUSD',
                symbol: 'BTC/USD',
                shortName: 'Bitcoin',
                price: liveBtc.price,
                prevClose: liveBtc.prevClose,
                changeValue: liveBtc.changeValue,
                changePercent: liveBtc.changePercent,
                decimals: 2,
                currencyPrefix: '$',
                support: liveBtc.support,
                resistance: liveBtc.resistance,
                barTimestampIso: new Date(liveBtc.updatedAtEpoch || timing.targetEpochMs).toISOString(),
                barTimeWib: formatWibShortTime(liveBtc.updatedAtEpoch || timing.targetEpochMs),
              },
            ];
          }
          return [id, null];
        }

        const spec = SHARE_SLOT_META[id];
        if (!spec) return [id, null];

        const [intraday, daily] = await Promise.all([
          fetchYahooChartBars(spec.yahooSymbol, '5d', '15m'),
          fetchYahooChartBars(spec.yahooSymbol, '1mo', '1d'),
        ]);

        const tz = intraday.tz || daily.tz || spec.fallbackTz;
        const intradayBefore = intraday.bars.filter((b) => b.t <= timing.targetEpochMs);

        if (id === 'XAUUSD' && tvGold && intraday.bars.length > 0) {
          const latestGcf = intraday.bars[intraday.bars.length - 1].close;
          const diff = tvGold.price - latestGcf;
          if (Number.isFinite(diff) && Math.abs(diff) / latestGcf <= 0.035) {
            goldSpotBasis = diff;
          }
        }

        if (intradayBefore.length > 0) {
          const latest = intradayBefore[intradayBefore.length - 1];
          const activeDateStr = formatDateInTimezone(latest.t, tz);
          const sameSessionBars = intradayBefore.filter(
            (b) => formatDateInTimezone(b.t, tz) === activeDateStr
          );
          const earlierSessionBars = intradayBefore.filter(
            (b) => formatDateInTimezone(b.t, tz) < activeDateStr
          );
          const prev15mClose =
            earlierSessionBars.length > 0
              ? earlierSessionBars[earlierSessionBars.length - 1].close
              : undefined;

          const dailyBefore = daily.bars.filter(
            (d) => formatDateInTimezone(d.t, tz) < activeDateStr
          );
          const priorDaily = dailyBefore[dailyBefore.length - 1];

          // For IDR=X Yahoo occasionally prints an off-market 1d settlement outlier (>1.5% gap); keep genuine daily moves for DXY & XAUUSD
          let basePrev = priorDaily?.close ?? prev15mClose ?? sameSessionBars[0]?.open ?? latest.close;
          if (
            id === 'USDIDR' &&
            typeof prev15mClose === 'number' &&
            prev15mClose > 0 &&
            priorDaily?.close &&
            Math.abs(priorDaily.close - prev15mClose) / prev15mClose > 0.015
          ) {
            basePrev = prev15mClose;
          }

          const rawPrice = latest.close + (id === 'XAUUSD' ? goldSpotBasis : 0);
          const rawPrev = basePrev + (id === 'XAUUSD' ? goldSpotBasis : 0);

          const sessionHigh =
            Math.max(...sameSessionBars.map((b) => b.high)) +
            (id === 'XAUUSD' ? goldSpotBasis : 0);
          const sessionLow =
            Math.min(...sameSessionBars.map((b) => b.low)) +
            (id === 'XAUUSD' ? goldSpotBasis : 0);

          const price = Number(rawPrice.toFixed(spec.decimals));
          const prevClose = Number(rawPrev.toFixed(spec.decimals));
          const changeValue = Number((price - prevClose).toFixed(spec.decimals >= 3 ? spec.decimals : 2));
          const changePercent = Number(
            (((price - prevClose) / Math.max(1e-6, prevClose)) * 100).toFixed(2)
          );
          const { support, resistance } = computeSnapshotSupportResistance(
            price,
            sessionHigh,
            sessionLow,
            spec.decimals,
            spec.currencyPrefix ?? ''
          );

          return [
            id,
            {
              id,
              symbol: spec.symbol,
              shortName: spec.shortName,
              price,
              prevClose,
              changeValue,
              changePercent,
              decimals: spec.decimals,
              currencyPrefix: spec.currencyPrefix,
              support,
              resistance,
              barTimestampIso: new Date(latest.t).toISOString(),
              barTimeWib: formatWibShortTime(latest.t),
            },
          ];
        }

        // Daily fallback if 15m window has zero bars for holiday edge cases
        const dailyValid = daily.bars.filter((d) => d.t <= timing.targetEpochMs);
        if (dailyValid.length >= 2) {
          const latest = dailyValid[dailyValid.length - 1];
          const prev = dailyValid[dailyValid.length - 2];
          const rawPrice = latest.close + (id === 'XAUUSD' ? goldSpotBasis : 0);
          const rawPrev = prev.close + (id === 'XAUUSD' ? goldSpotBasis : 0);
          const price = Number(rawPrice.toFixed(spec.decimals));
          const prevClose = Number(rawPrev.toFixed(spec.decimals));
          const changeValue = Number((price - prevClose).toFixed(spec.decimals >= 3 ? spec.decimals : 2));
          const changePercent = Number(
            (((price - prevClose) / Math.max(1e-6, prevClose)) * 100).toFixed(2)
          );
          const { support, resistance } = computeSnapshotSupportResistance(
            price,
            latest.high + (id === 'XAUUSD' ? goldSpotBasis : 0),
            latest.low + (id === 'XAUUSD' ? goldSpotBasis : 0),
            spec.decimals,
            spec.currencyPrefix ?? ''
          );
          return [
            id,
            {
              id,
              symbol: spec.symbol,
              shortName: spec.shortName,
              price,
              prevClose,
              changeValue,
              changePercent,
              decimals: spec.decimals,
              currencyPrefix: spec.currencyPrefix,
              support,
              resistance,
              barTimestampIso: new Date(latest.t).toISOString(),
              barTimeWib: formatWibShortTime(latest.t),
            },
          ];
        }

        const liveFallback = liveById.get(id);
        if (liveFallback) {
          return [
            id,
            {
              id,
              symbol: spec.symbol,
              shortName: spec.shortName,
              price: liveFallback.price,
              prevClose: liveFallback.prevClose,
              changeValue: liveFallback.changeValue,
              changePercent: liveFallback.changePercent,
              decimals: spec.decimals,
              currencyPrefix: spec.currencyPrefix,
              support: liveFallback.support,
              resistance: liveFallback.resistance,
              barTimestampIso: new Date(liveFallback.updatedAtEpoch || timing.targetEpochMs).toISOString(),
              barTimeWib: formatWibShortTime(liveFallback.updatedAtEpoch || timing.targetEpochMs),
            },
          ];
        }
        return [id, null];
      })
    );

    const assetsRecord: Record<string, ShareSnapshotAsset> = {};
    for (const [id, item] of assetEntries) {
      if (item) assetsRecord[id] = item;
    }

    let marketSummary = buildDeterministicTimestampSummary(
      slot,
      timing.timeSlotLabel,
      timing.dateLabel,
      assetsRecord
    );
    let aiGenerated = false;

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey && Object.keys(assetsRecord).length > 0) {
      try {
        const ai = new GoogleGenAI({
          apiKey: geminiApiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const compactAssets = Object.values(assetsRecord).map((a) => ({
          symbol: a.symbol,
          price: a.price,
          changePercent: a.changePercent,
          support: a.support,
          resistance: a.resistance,
          barTimeWib: a.barTimeWib,
        }));
        const topMacros = calPayload.events.slice(0, 3).map((e) => `${e.currency} ${e.title} (${e.timeWib}, act:${e.actual} vs fcst:${e.forecast})`);
        const topHeadlines = newsPayload.stories.slice(0, 3).map((s) => s.headline);

        const aiRes = await Promise.race([
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Write a crisp, strictly SINGLE-SENTENCE Market Summary for the scheduled ${timing.timeSlotLabel} (${timing.dateLabel}) snapshot.
RULES:
1. Reference ONLY the exact prices and % changes in TIMESTAMPED DATA below.
2. Reflect the exact market session state at ${timing.timeSlotLabel} (${
              slot === 'morning_0530'
                ? 'US markets closed at 04:00 WIB, IHSG is pre-open, FX/Gold/BTC active'
                : 'IHSG just closed at 16:00 WIB, USD/IDR & European/FX/Gold/BTC active; do NOT mention US indices for 16:30'
            }).
3. Strictly ONE analytical sentence (max 38 words). Do NOT include Bear/Bull signal tags or Fear & Greed scores.

TIMESTAMPED DATA (${timing.timeSlotLabel}):
${JSON.stringify({ assets: compactAssets, macros: topMacros, news: topHeadlines })}`,
            config: {
              systemInstruction:
                'Output ONLY valid JSON containing a single key marketSummary with strictly one institutional sentence grounded in TIMESTAMPED DATA.',
              thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  marketSummary: {
                    type: Type.STRING,
                    description: 'Strictly one cohesive sentence summarizing the market snapshot at this exact timestamp.',
                  },
                },
              },
            },
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 9500)),
        ]);

        const rawTxt = (aiRes?.text ?? '').trim();
        if (rawTxt) {
          const parsed = JSON.parse(rawTxt) as { marketSummary?: string };
          if (parsed.marketSummary && typeof parsed.marketSummary === 'string') {
            const flat = parsed.marketSummary.replace(/\s+/g, ' ').trim();
            const match = flat.match(/^.*?(?<!\d)[.!?](?=\s|$)/);
            const chosen = (match ? match[0] : flat).trim();
            if (chosen.length > 25) {
              marketSummary = /[.!?]$/.test(chosen) ? chosen : `${chosen}.`;
              aiGenerated = true;
            }
          }
        }
      } catch {
        // Keep deterministic timestamped summary on failure/timeout
      }
    }

    const response: ShareSnapshotResponse = {
      slot,
      dateKey: timing.dateKey,
      dateLabel: timing.dateLabel,
      timeSlotLabel: timing.timeSlotLabel,
      targetTimestampIso: timing.targetTimestampIso,
      targetEpochMs: timing.targetEpochMs,
      editionTitle:
        slot === 'morning_0530'
          ? '05:30 WIB Morning · All Markets'
          : '16:30 WIB Afternoon · IDX, FX, Gold & BTC',
      marketSummary,
      aiGenerated,
      assets: assetsRecord,
      updatedAt: new Date().toISOString(),
    };

    shareSnapshotCache.set(cacheKey, {
      data: response,
      expiresAt: Date.now() + (aiGenerated ? 1_800_000 : 300_000),
    });

    return response;
  });
}

// ============================================================================
// Market Depth (Live Coinbase L2 Order Book + Session Liquidity Depth Profile)
// ============================================================================

export interface MarketDepthLevel {
  price: number;
  size: number;
  total: number;
  pctOfMax: number;
  isWall?: boolean;
  tag?: string;
}

export interface MarketDepthSnapshot {
  assetId: string;
  symbol: string;
  decimals: number;
  currencyPrefix?: string;
  unitSuffix?: string;
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  spreadAbs: number;
  spreadPct: number;
  bidRatioPct: number;
  askRatioPct: number;
  imbalanceLabel: string;
  sourceKind: 'live-l2' | 'session-liquidity';
  sourceLabel: string;
  buyWallPrice: number;
  buyWallSize: number;
  sellWallPrice: number;
  sellWallSize: number;
  bids: MarketDepthLevel[];
  asks: MarketDepthLevel[];
  isCachedFallback?: boolean;
  updatedAt: string;
}

const marketDepthCache = new Map<string, CacheEntry<MarketDepthSnapshot>>();

function roundNiceBucketStep(rawStep: number, decimals: number): number {
  const minTick = Math.pow(10, -Math.min(4, Math.max(0, decimals)));
  if (!Number.isFinite(rawStep) || rawStep <= minTick) return minTick;
  const pow10 = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / pow10;
  const nice = norm <= 1.2 ? 1 : norm <= 2.4 ? 2 : norm <= 5.5 ? 5 : 10;
  return Math.max(minTick, Number((nice * pow10).toFixed(Math.min(6, decimals + 2))));
}

function deriveImbalanceLabel(bidRatioPct: number): string {
  if (bidRatioPct >= 60) return 'Strong Bid Absorption';
  if (bidRatioPct >= 53) return 'Buy-Side Tilt';
  if (bidRatioPct <= 40) return 'Heavy Ask Supply';
  if (bidRatioPct <= 47) return 'Sell-Side Tilt';
  return 'Balanced Two-Way Book';
}

function finalizeDepthLevels(
  rawBids: Array<{ price: number; size: number; tag?: string }>,
  rawAsks: Array<{ price: number; size: number; tag?: string }>,
  decimals: number
): {
  bids: MarketDepthLevel[];
  asks: MarketDepthLevel[];
  bidRatioPct: number;
  askRatioPct: number;
  buyWallPrice: number;
  buyWallSize: number;
  sellWallPrice: number;
  sellWallSize: number;
} {
  const sortedBids = [...rawBids]
    .sort((a, b) => b.price - a.price)
    .slice(0, 8);
  const sortedAsks = [...rawAsks]
    .sort((a, b) => a.price - b.price)
    .slice(0, 8);

  const avgBid =
    sortedBids.reduce((s, b) => s + b.size, 0) / Math.max(1, sortedBids.length);
  const avgAsk =
    sortedAsks.reduce((s, a) => s + a.size, 0) / Math.max(1, sortedAsks.length);

  let maxBidIdx = 0;
  for (let i = 1; i < sortedBids.length; i++) {
    if (sortedBids[i].size > sortedBids[maxBidIdx].size) maxBidIdx = i;
  }
  let maxAskIdx = 0;
  for (let i = 1; i < sortedAsks.length; i++) {
    if (sortedAsks[i].size > sortedAsks[maxAskIdx].size) maxAskIdx = i;
  }

  let cumBid = 0;
  const bidsOut: MarketDepthLevel[] = sortedBids.map((b, idx) => {
    cumBid += b.size;
    const isWall = idx === maxBidIdx || b.size >= avgBid * 1.55;
    return {
      price: Number(b.price.toFixed(decimals)),
      size: Number(b.size.toFixed(decimals >= 3 ? 2 : 3)),
      total: Number(cumBid.toFixed(decimals >= 3 ? 2 : 3)),
      pctOfMax: 0,
      isWall,
      tag: b.tag ?? (idx === 0 ? 'Best Bid' : idx === maxBidIdx ? 'Buy Wall' : undefined),
    };
  });

  let cumAsk = 0;
  const asksOut: MarketDepthLevel[] = sortedAsks.map((a, idx) => {
    cumAsk += a.size;
    const isWall = idx === maxAskIdx || a.size >= avgAsk * 1.55;
    return {
      price: Number(a.price.toFixed(decimals)),
      size: Number(a.size.toFixed(decimals >= 3 ? 2 : 3)),
      total: Number(cumAsk.toFixed(decimals >= 3 ? 2 : 3)),
      pctOfMax: 0,
      isWall,
      tag: a.tag ?? (idx === 0 ? 'Best Ask' : idx === maxAskIdx ? 'Sell Wall' : undefined),
    };
  });

  const maxCum = Math.max(cumBid, cumAsk, 1e-6);
  for (const b of bidsOut) {
    b.pctOfMax = Math.max(4, Math.min(100, Math.round((b.total / maxCum) * 100)));
  }
  for (const a of asksOut) {
    a.pctOfMax = Math.max(4, Math.min(100, Math.round((a.total / maxCum) * 100)));
  }

  const totalNotionalVol = cumBid + cumAsk || 1;
  const bidRatioPct = Number(((cumBid / totalNotionalVol) * 100).toFixed(1));
  const askRatioPct = Number((100 - bidRatioPct).toFixed(1));

  const buyWall = bidsOut[maxBidIdx] ?? bidsOut[0];
  const sellWall = asksOut[maxAskIdx] ?? asksOut[0];

  return {
    bids: bidsOut,
    asks: asksOut,
    bidRatioPct,
    askRatioPct,
    buyWallPrice: buyWall?.price ?? 0,
    buyWallSize: buyWall?.size ?? 0,
    sellWallPrice: sellWall?.price ?? 0,
    sellWallSize: sellWall?.size ?? 0,
  };
}

export async function fetchMarketDepth(assetId: string): Promise<MarketDepthSnapshot | null> {
  const id = assetId.trim().toUpperCase();
  if (!id) return null;

  const isKnownYahoo = YAHOO_SYMBOL_CONFIG.some((c) => c.id === id);
  if (!isKnownYahoo && id !== 'ID10Y') return null;

  const now = Date.now();
  const cached = marketDepthCache.get(id);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const sessionInfo = getServerSessionInfo(id, new Date(now));
  const isCryptoL2 = id === 'BTCUSD' || id === 'ETHUSD';

  return coalesceInFlight(
    `market-depth:${id}`,
    cached?.data ?? null,
    async () => {
      const cfg = YAHOO_SYMBOL_CONFIG.find((c) => c.id === id);
      const decimals = cfg?.decimals ?? 3;
      const prefix = cfg?.currencyPrefix ?? (id === 'ID10Y' ? '' : undefined);
      const suffix = cfg?.unitSuffix ?? (id === 'ID10Y' ? '%' : undefined);
      const fxLabels: Record<string, string> = {
        BTCUSD: 'BTC/USD',
        ETHUSD: 'ETH/USD',
        XAUUSD: 'XAU/USD',
        USDIDR: 'USD/IDR',
        EURUSD: 'EUR/USD',
        GBPUSD: 'GBP/USD',
        USDJPY: 'USD/JPY',
        AUDUSD: 'AUD/USD',
        USDCHF: 'USD/CHF',
        USDCAD: 'USD/CAD',
        NZDUSD: 'NZD/USD',
        USDCNY: 'USD/CNY',
      };
      const symbolLabel = fxLabels[id] ?? id;

      // 1. Live Level-2 Order Book via Coinbase Exchange for BTCUSD & ETHUSD
      if (isCryptoL2) {
        const pair = id === 'BTCUSD' ? 'BTC-USD' : 'ETH-USD';
        const l2Start = Date.now();
        try {
          const res = await fetch(
            `https://api.exchange.coinbase.com/products/${pair}/book?level=2`,
            { headers: UA_HEADERS, signal: AbortSignal.timeout(5500) }
          );
          const l2Latency = Date.now() - l2Start;
          if (res.ok) {
            const json = (await res.json()) as {
              bids?: Array<[string, string, number]>;
              asks?: Array<[string, string, number]>;
            };
            const rawBids = (json.bids ?? [])
              .map(([p, s]) => ({ price: Number(p), size: Number(s) }))
              .filter((r) => Number.isFinite(r.price) && r.price > 0 && Number.isFinite(r.size) && r.size > 0);
            const rawAsks = (json.asks ?? [])
              .map(([p, s]) => ({ price: Number(p), size: Number(s) }))
              .filter((r) => Number.isFinite(r.price) && r.price > 0 && Number.isFinite(r.size) && r.size > 0);

            if (rawBids.length >= 4 && rawAsks.length >= 4) {
              const bestBid = rawBids[0].price;
              const bestAsk = rawAsks[0].price;
              const midPrice = Number(((bestBid + bestAsk) / 2).toFixed(decimals));
              const spreadAbs = Math.max(0, bestAsk - bestBid);
              const spreadPct = midPrice > 0 ? (spreadAbs / midPrice) * 100 : 0;

              const nearBids = rawBids.filter((b) => b.price >= bestBid * 0.97);
              const nearAsks = rawAsks.filter((a) => a.price <= bestAsk * 1.03);
              const activeBids = nearBids.length >= 4 ? nearBids : rawBids.filter((b) => b.price >= bestBid * 0.85);
              const activeAsks = nearAsks.length >= 4 ? nearAsks : rawAsks.filter((a) => a.price <= bestAsk * 1.15);

              const safeBids = activeBids.length >= 2 ? activeBids : rawBids.slice(0, 8);
              const safeAsks = activeAsks.length >= 2 ? activeAsks : rawAsks.slice(0, 8);

              const deepestBid = safeBids[safeBids.length - 1].price;
              const deepestAsk = safeAsks[safeAsks.length - 1].price;
              const rawSpan = Math.max(
                bestBid - deepestBid,
                deepestAsk - bestAsk,
                midPrice * 0.0006
              );
              const clampedSpan = Math.min(midPrice * 0.012, rawSpan);
              const bucketStep = roundNiceBucketStep(clampedSpan / 8, decimals);

              const bidBuckets = new Map<number, number>();
              for (const b of safeBids) {
                if (bestBid - b.price > bucketStep * 10) continue;
                const bucketPx = Number(
                  (Math.floor(b.price / bucketStep) * bucketStep).toFixed(decimals)
                );
                if (bucketPx > 0) {
                  bidBuckets.set(bucketPx, (bidBuckets.get(bucketPx) ?? 0) + b.size);
                }
              }
              const askBuckets = new Map<number, number>();
              for (const a of safeAsks) {
                if (a.price - bestAsk > bucketStep * 10) continue;
                const bucketPx = Number(
                  (Math.ceil(a.price / bucketStep) * bucketStep).toFixed(decimals)
                );
                if (bucketPx > 0) {
                  askBuckets.set(bucketPx, (askBuckets.get(bucketPx) ?? 0) + a.size);
                }
              }

              let aggBids = Array.from(bidBuckets.entries())
                .map(([price, size]) => ({ price, size }))
                .sort((a, b) => b.price - a.price)
                .slice(0, 8);
              let aggAsks = Array.from(askBuckets.entries())
                .map(([price, size]) => ({ price, size }))
                .sort((a, b) => a.price - b.price)
                .slice(0, 8);

              if (aggBids.length < 5) aggBids = safeBids.slice(0, 8);
              if (aggAsks.length < 5) aggAsks = safeAsks.slice(0, 8);

              const finalized = finalizeDepthLevels(aggBids, aggAsks, decimals);
              const snapshot: MarketDepthSnapshot = {
                assetId: id,
                symbol: symbolLabel,
                decimals,
                currencyPrefix: prefix,
                unitSuffix: suffix,
                midPrice,
                bestBid: Number(bestBid.toFixed(decimals)),
                bestAsk: Number(bestAsk.toFixed(decimals)),
                spreadAbs: Number(spreadAbs.toFixed(decimals)),
                spreadPct: Number(spreadPct.toFixed(4)),
                bidRatioPct: finalized.bidRatioPct,
                askRatioPct: finalized.askRatioPct,
                imbalanceLabel: deriveImbalanceLabel(finalized.bidRatioPct),
                sourceKind: 'live-l2',
                sourceLabel: 'Coinbase Live L2 Order Book',
                buyWallPrice: finalized.buyWallPrice,
                buyWallSize: finalized.buyWallSize,
                sellWallPrice: finalized.sellWallPrice,
                sellWallSize: finalized.sellWallSize,
                bids: finalized.bids,
                asks: finalized.asks,
                isCachedFallback: false,
                updatedAt: new Date().toISOString(),
              };
              updateProviderMetric('coinbase', {
                status: 'live',
                activeSource: 'Coinbase Exchange L2 Book',
                latencyMs: l2Latency,
                lastSuccessAt: Date.now(),
                isCachedFallback: false,
                fallbackReason: undefined,
              });
              marketDepthCache.set(id, { data: snapshot, expiresAt: Date.now() + 2500 });
              return snapshot;
            }
          }
          if (cached && now - cached.expiresAt < 12_000 && cached.data.sourceKind === 'live-l2') {
            return { ...cached.data, isCachedFallback: true };
          }
          updateProviderMetric('coinbase', {
            status: 'failover',
            activeSource: 'Session Liquidity Fallback',
            latencyMs: l2Latency,
            isCachedFallback: false,
            fallbackReason: `Coinbase L2 HTTP ${res.status}; fell back to session book`,
          });
        } catch {
          if (cached && now - cached.expiresAt < 12_000 && cached.data.sourceKind === 'live-l2') {
            return { ...cached.data, isCachedFallback: true };
          }
          updateProviderMetric('coinbase', {
            status: 'failover',
            activeSource: 'Session Liquidity Fallback',
            latencyMs: Date.now() - l2Start,
            isCachedFallback: false,
            fallbackReason: 'Coinbase L2 timeout; fell back to session book',
          });
        }
      }

      // 2. Real Session Liquidity & Order-Flow Depth Profile (anchored to live OHLC, S1/R1, and 1D bar distribution)
      const quotesPayload = quotesCache.entry?.data ?? (await fetchLiveQuotes());
      const q = quotesPayload.quotes.find((item) => item.id === id);
      if (!q || !Number.isFinite(q.price) || q.price <= 0) {
        return cached?.data ? { ...cached.data, isCachedFallback: true } : null;
      }

      const parseNumStat = (s: string, fallback: number): number => {
        const cleaned = s.replace(/[^0-9.-]/g, '');
        const v = Number(cleaned);
        return Number.isFinite(v) && v > 0 ? v : fallback;
      };

      const price = q.price;
      const openNum = parseNumStat(q.open, price);
      const dayHighNum = Math.max(price, parseNumStat(q.dayHigh, price * 1.005));
      const dayLowNum = Math.min(price, parseNumStat(q.dayLow, price * 0.995));
      const supportNum = Math.min(dayLowNum, parseNumStat(q.support, price * 0.99));
      const resistanceNum = Math.max(dayHighNum, parseNumStat(q.resistance, price * 1.01));

      const spanDown = Math.max(price * 0.0025, price - supportNum);
      const spanUp = Math.max(price * 0.0025, resistanceNum - price);
      const avgSpan = (spanDown + spanUp) / 2;
      const tickSpread = Math.max(
        Math.pow(10, -decimals),
        avgSpan * 0.028
      );
      const bestBid = Number((price - tickSpread / 2).toFixed(decimals));
      const bestAsk = Number((price + tickSpread / 2).toFixed(decimals));

      const ibsRatio =
        dayHighNum > dayLowNum
          ? Math.max(0.15, Math.min(0.85, (price - dayLowNum) / (dayHighNum - dayLowNum)))
          : 0.5;
      const openTilt =
        openNum > 0 ? Math.max(-0.12, Math.min(0.12, ((price - openNum) / openNum) * 8)) : 0;
      const buyerBias = Math.max(0.32, Math.min(0.68, 0.38 + ibsRatio * 0.24 + openTilt));

      const bars = q.chart1D.filter((v) => Number.isFinite(v) && v > 0);
      const isFxMajor =
        id === 'USDIDR' ||
        id === 'EURUSD' ||
        id === 'GBPUSD' ||
        id === 'USDJPY' ||
        id === 'AUDUSD' ||
        id === 'USDCHF' ||
        id === 'USDCAD' ||
        id === 'NZDUSD' ||
        id === 'USDCNY' ||
        id === 'DXY';
      const volumeScaleBase =
        id === 'US10Y' || id === 'US30Y' || id === 'ID10Y'
          ? 250
          : isFxMajor
            ? 1200
            : id === 'XAUUSD' || id === 'WTI' || id === 'BRENT'
              ? 420
              : 1800;

      const countNearbyBars = (lvlPrice: number, bandwidth: number): number => {
        if (bars.length === 0) return 0;
        let hits = 0;
        for (const b of bars) {
          if (Math.abs(b - lvlPrice) <= bandwidth) hits += 1;
        }
        return hits / bars.length;
      };

      const bidLevels: Array<{ price: number; size: number; tag?: string }> = [];
      const askLevels: Array<{ price: number; size: number; tag?: string }> = [];

      const bidBandwidth = Math.max(tickSpread, spanDown / 6);
      const askBandwidth = Math.max(tickSpread, spanUp / 6);

      for (let i = 0; i < 8; i++) {
        const frac = i / 7;
        const lvlPrice = bestBid - frac * spanDown * 1.05;
        const barDensity = countNearbyBars(lvlPrice, bidBandwidth);

        let tag: string | undefined = i === 0 ? 'Best Bid' : undefined;
        let anchorMult = 0.72 + (1 - frac) * 0.35 + barDensity * 1.9;
        if (Math.abs(lvlPrice - dayLowNum) <= bidBandwidth * 0.7) {
          anchorMult += 0.95;
          tag = tag ?? 'Day Low';
        }
        if (Math.abs(lvlPrice - supportNum) <= bidBandwidth * 0.85) {
          anchorMult += 1.25;
          tag = 'S1 Support';
        } else if (Math.abs(lvlPrice - openNum) <= bidBandwidth * 0.65 && !tag) {
          anchorMult += 0.65;
          tag = 'Open';
        }

        const size = volumeScaleBase * anchorMult * (0.75 + buyerBias * 0.65);
        bidLevels.push({ price: lvlPrice, size, tag });
      }

      for (let i = 0; i < 8; i++) {
        const frac = i / 7;
        const lvlPrice = bestAsk + frac * spanUp * 1.05;
        const barDensity = countNearbyBars(lvlPrice, askBandwidth);

        let tag: string | undefined = i === 0 ? 'Best Ask' : undefined;
        let anchorMult = 0.72 + (1 - frac) * 0.35 + barDensity * 1.9;
        if (Math.abs(lvlPrice - dayHighNum) <= askBandwidth * 0.7) {
          anchorMult += 0.95;
          tag = tag ?? 'Day High';
        }
        if (Math.abs(lvlPrice - resistanceNum) <= askBandwidth * 0.85) {
          anchorMult += 1.25;
          tag = 'R1 Resist';
        } else if (Math.abs(lvlPrice - openNum) <= askBandwidth * 0.65 && !tag) {
          anchorMult += 0.65;
          tag = 'Open';
        }

        const size = volumeScaleBase * anchorMult * (0.75 + (1 - buyerBias) * 0.65);
        askLevels.push({ price: lvlPrice, size, tag });
      }

      const finalized = finalizeDepthLevels(bidLevels, askLevels, decimals);
      const spreadAbs = Math.max(0, bestAsk - bestBid);
      const spreadPct = price > 0 ? (spreadAbs / price) * 100 : 0;

      const snapshot: MarketDepthSnapshot = {
        assetId: id,
        symbol: symbolLabel,
        decimals,
        currencyPrefix: prefix,
        unitSuffix: suffix,
        midPrice: Number(price.toFixed(decimals)),
        bestBid,
        bestAsk,
        spreadAbs: Number(spreadAbs.toFixed(decimals)),
        spreadPct: Number(spreadPct.toFixed(4)),
        bidRatioPct: finalized.bidRatioPct,
        askRatioPct: finalized.askRatioPct,
        imbalanceLabel: deriveImbalanceLabel(finalized.bidRatioPct),
        sourceKind: 'session-liquidity',
        sourceLabel: sessionInfo.isOpen
          ? 'Session Order-Flow Liquidity Profile'
          : `Closed Session Liquidity (${sessionInfo.stateLabel})`,
        buyWallPrice: finalized.buyWallPrice,
        buyWallSize: finalized.buyWallSize,
        sellWallPrice: finalized.sellWallPrice,
        sellWallSize: finalized.sellWallSize,
        bids: finalized.bids,
        asks: finalized.asks,
        updatedAt: new Date().toISOString(),
      };

      const ttl = sessionInfo.isOpen ? 4000 : 60_000;
      marketDepthCache.set(id, { data: snapshot, expiresAt: Date.now() + ttl });
      return snapshot;
    }
  );
}

// ============================================================================
// Watchlist Cross-Asset Correlation Matrix (Real Aligned Daily Returns)
// ============================================================================

export interface CorrelationMatrixResponse {
  timeframe: '1M' | '3M';
  assetIds: string[];
  matrix: number[][];
  sampleDays: number;
  updatedAt: string;
}

const correlationCache = new Map<'1M' | '3M', CacheEntry<CorrelationMatrixResponse>>();
const datedHistoryCache = new Map<string, CacheEntry<Map<string, number>>>();

async function fetchDatedDailyCloses(
  yahooSymbol: string,
  range: '1mo' | '3mo'
): Promise<Map<string, number>> {
  const key = `${yahooSymbol}:${range}`;
  const now = Date.now();
  const cached = datedHistoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const out = new Map<string, number>();
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yahooSymbol
      )}?range=${range}&interval=1d`,
      { headers: UA_HEADERS, signal: AbortSignal.timeout(5500) }
    );
    if (!res.ok) return cached?.data ?? out;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const item = json.chart?.result?.[0];
    const tsArr = item?.timestamp ?? [];
    const closeArr = item?.indicators?.quote?.[0]?.close ?? [];
    for (let i = 0; i < Math.min(tsArr.length, closeArr.length); i++) {
      const ts = tsArr[i];
      const c = closeArr[i];
      if (typeof ts === 'number' && typeof c === 'number' && Number.isFinite(c) && c > 0) {
        const dayKey = new Date(ts * 1000).toISOString().slice(0, 10);
        out.set(dayKey, c);
      }
    }
    if (out.size >= 5) {
      datedHistoryCache.set(key, { data: out, expiresAt: now + 900_000 });
      return out;
    }
  } catch {
    // ignore and return fallback
  }
  return cached?.data ?? out;
}

function computeAlignedPearson(
  mapA: Map<string, number>,
  mapB: Map<string, number>
): { r: number; pairs: number } {
  const commonDates: string[] = [];
  for (const date of mapA.keys()) {
    if (mapB.has(date)) commonDates.push(date);
  }
  commonDates.sort();
  if (commonDates.length < 5) return { r: 0, pairs: Math.max(0, commonDates.length - 1) };

  const retA: number[] = [];
  const retB: number[] = [];
  for (let i = 1; i < commonDates.length; i++) {
    const prevDate = commonDates[i - 1];
    const currDate = commonDates[i];
    const a0 = mapA.get(prevDate)!;
    const a1 = mapA.get(currDate)!;
    const b0 = mapB.get(prevDate)!;
    const b1 = mapB.get(currDate)!;
    if (a0 > 0 && a1 > 0 && b0 > 0 && b1 > 0) {
      retA.push(Math.log(a1 / a0));
      retB.push(Math.log(b1 / b0));
    }
  }

  const n = retA.length;
  if (n < 4) return { r: 0, pairs: n };

  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += retA[i];
    sumB += retB[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = retA[i] - meanA;
    const db = retB[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const den = Math.sqrt(denA * denB);
  if (!Number.isFinite(den) || den <= 1e-12) return { r: 0, pairs: n };
  const corr = Math.max(-1, Math.min(1, num / den));
  return { r: Number(corr.toFixed(2)), pairs: n };
}

export async function fetchCorrelationMatrix(
  timeframe: '1M' | '3M' = '1M'
): Promise<CorrelationMatrixResponse> {
  const tf: '1M' | '3M' = timeframe === '3M' ? '3M' : '1M';
  const now = Date.now();
  const cached = correlationCache.get(tf);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  return coalesceInFlight(
    `correlation-matrix:${tf}`,
    cached?.data,
    async () => {
      const range = tf === '3M' ? '3mo' : '1mo';
      const assetConfigs = YAHOO_SYMBOL_CONFIG;
      const assetIds = assetConfigs.map((c) => c.id);

      const datedSeriesList = await Promise.all(
        assetConfigs.map((c) => fetchDatedDailyCloses(c.yahooSymbol, range))
      );

      // Inject today's live quote price onto today's UTC date key so live session moves are reflected
      const todayKey = new Date().toISOString().slice(0, 10);
      const liveMap = new Map(
        (quotesCache.entry?.data.quotes ?? []).map((q) => [q.id, q.price])
      );
      datedSeriesList.forEach((seriesMap, idx) => {
        const livePx = liveMap.get(assetIds[idx]);
        if (livePx && Number.isFinite(livePx) && livePx > 0 && seriesMap.size > 0) {
          seriesMap.set(todayKey, livePx);
        }
      });

      const n = assetIds.length;
      const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
      let maxPairs = 0;

      for (let i = 0; i < n; i++) {
        matrix[i][i] = 1;
        for (let j = i + 1; j < n; j++) {
          const { r, pairs } = computeAlignedPearson(datedSeriesList[i], datedSeriesList[j]);
          matrix[i][j] = r;
          matrix[j][i] = r;
          if (pairs > maxPairs) maxPairs = pairs;
        }
      }

      const payload: CorrelationMatrixResponse = {
        timeframe: tf,
        assetIds,
        matrix,
        sampleDays: maxPairs > 0 ? maxPairs : tf === '3M' ? 60 : 20,
        updatedAt: new Date().toISOString(),
      };

      correlationCache.set(tf, { data: payload, expiresAt: Date.now() + 300_000 });
      return payload;
    }
  );
}

let warmupStarted = false;
export function warmServerCaches(): void {
  if (warmupStarted) return;
  warmupStarted = true;
  // Stage 1: warm critical live quotes & FX cleanly without Yahoo pool contention
  setTimeout(() => {
    void Promise.allSettled([
      fetchLiveQuotes(),
      fetchLiveFxRates(),
    ]).then(() => {
      // Stage 2: warm news, calendar & equity movers after initial quote response settles
      setTimeout(() => {
        void Promise.allSettled([
          fetchLiveNews(),
          fetchLiveCalendar(),
          fetchTopStockMovers(),
        ]).then(() => {
          // Stage 3: defer heavy heatmap, daily summary, correlations & intelligence so client boot traffic wins
          setTimeout(() => {
            void Promise.allSettled([
              fetchMarketHeatmap(),
              fetchDailyMarketSummary(),
              fetchCorrelationMatrix('1M'),
              fetchMarketIntelligence(),
            ]);
          }, 1800);
        });
      }, 750);
    });
  }, 100);
}

