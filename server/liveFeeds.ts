import { GoogleGenAI } from '@google/genai';

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
}

export interface LiveChartResponse {
  id: string;
  timeframe: string;
  points: number[];
  timestamps: number[];
  prevClose: number;
}

export interface LiveNewsItem {
  id: string;
  publisher: string;
  timeAgo: string;
  publishedAt: string;
  isBreaking?: boolean;
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
  day: 'today' | 'tomorrow' | 'week';
  currency: 'USD' | 'IDR' | 'CNY' | 'EUR' | 'JPY';
  impact: 'HIGH' | 'MED';
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
const stocksMoversCache: { entry: CacheEntry<StocksMoversResponse> | null } = { entry: null };
const heatmapCache: { entry: CacheEntry<MarketHeatmapResponse> | null } = { entry: null };

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

  const changeValue = Number((tvChangeAbs ?? cnbcChg ?? 0).toFixed(3));
  const prevClose = Number(
    (cnbcPrevClose ?? (price - changeValue)).toFixed(3)
  );
  const changePercent = Number(
    (
      tvChangePct ??
      cnbcChgPct ??
      (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0)
    ).toFixed(2)
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
}

async function fetchCoinbaseSpotTicker(
  pair: 'BTC-USD' | 'ETH-USD'
): Promise<{ price: number; volumeUsd: number } | null> {
  try {
    const res = await fetch(`https://api.exchange.coinbase.com/products/${pair}/ticker`, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { price?: string; volume?: string };
    const price = Number(json.price);
    const baseVol = Number(json.volume ?? 0);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      price,
      volumeUsd: Number.isFinite(baseVol) && baseVol > 0 ? baseVol * price : 0,
    };
  } catch {
    return null;
  }
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

  // For 24/7 crypto anchored to UTC midnight close, use rawPrev directly
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

  // Yahoo v8 /chart?range=1d returns stale multi-day chartPreviousClose on several Asian & cash indices
  // (e.g., ^JKSE, ^HSI, ^TWII, 000001.SS, ^NSEI). Reconstruct exact session previous close from regularMarketChangePercent.
  const calcFromRawPct =
    safeRawPrev > 0 ? ((price - safeRawPrev) / safeRawPrev) * 100 : regPct;
  const effectivePrev =
    Math.abs(calcFromRawPct - regPct) > 0.04 && 1 + regPct / 100 > 0.05
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
}> {
  const now = Date.now();
  if (quotesCache.entry && quotesCache.entry.expiresAt > now) {
    return quotesCache.entry.data;
  }
  if (inFlightQuotesPromise) {
    return inFlightQuotesPromise;
  }

  inFlightQuotesPromise = (async () => {
    const nowDate = new Date(now);
    const [rawResults, id10yRaw] = await Promise.all([
      Promise.all(
        YAHOO_SYMBOL_CONFIG.map(async (cfg): Promise<RawQuoteMeta | null> => {
          const sessionInfo = getServerSessionInfo(cfg.id, nowDate);
          const cached = perSymbolQuoteCache.get(cfg.id);
          if (cached && cached.expiresAt > now && cached.wasOpen === sessionInfo.isOpen) {
            return cached.data;
          }
          try {
            const interval = sessionInfo.isOpen ? '5m' : '15m';
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
              cfg.yahooSymbol
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
          if (!meta) return null;

          let price = Number(meta.regularMarketPrice);
          const rawPrev = Number(
            meta.regularMarketPreviousClose ?? meta.previousClose ?? meta.chartPreviousClose ?? price
          );
          if (!Number.isFinite(price) || price <= 0) return null;

          let coinbaseVolumeUsd = 0;
          if (cfg.id === 'BTCUSD' || cfg.id === 'ETHUSD') {
            const cb = await fetchCoinbaseSpotTicker(cfg.id === 'BTCUSD' ? 'BTC-USD' : 'ETH-USD');
            if (cb) {
              price = cb.price;
              coinbaseVolumeUsd = cb.volumeUsd;
            }
          }

          const isCryptoAnchor = cfg.id === 'BTCUSD' || cfg.id === 'ETHUSD';
          const { prevClose, changeValue, changePercent } = resolveConsistentChange(
            price,
            rawPrev,
            meta.regularMarketChangePercent,
            cfg.decimals,
            isCryptoAnchor
          );

          const rawCloses = item?.indicators?.quote?.[0]?.close ?? [];
          const rawTimestamps = item?.timestamp ?? [];
          const validPairs: { t: number; v: number }[] = [];
          for (let i = 0; i < rawCloses.length; i++) {
            const val = rawCloses[i];
            const ts = rawTimestamps[i];
            if (typeof val === 'number' && Number.isFinite(val)) {
              validPairs.push({
                t: typeof ts === 'number' ? ts * 1000 : Date.now(),
                v: Number(val.toFixed(cfg.decimals)),
              });
            }
          }
          if (validPairs.length === 0) {
            validPairs.push({ t: Date.now() - 3600_000, v: prevClose }, { t: Date.now(), v: price });
          } else {
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

          const rawDayHigh = Number(meta.regularMarketDayHigh ?? Math.max(...closes));
          const rawDayLow = Number(meta.regularMarketDayLow ?? Math.min(...closes));
          const baseHigh = Number.isFinite(rawDayHigh) && rawDayHigh > 0 ? rawDayHigh : Math.max(price, prevClose);
          const baseLow = Number.isFinite(rawDayLow) && rawDayLow > 0 ? rawDayLow : Math.min(price, prevClose);

          // Ensure session Open never sits outside current intraday session range on futures/24h rollovers (e.g., GC=F)
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

          const w52LowRaw = Number(meta.fiftyTwoWeekLow ?? dayLowNum);
          const w52HighRaw = Number(meta.fiftyTwoWeekHigh ?? dayHighNum);
          const w52LowNum = Number.isFinite(w52LowRaw) && w52LowRaw > 0 ? w52LowRaw : dayLowNum;
          const w52HighNum = Number.isFinite(w52HighRaw) && w52HighRaw > w52LowNum ? w52HighRaw : Math.max(dayHighNum, price);
          const w52Span = w52HighNum - w52LowNum || 1;
          const w52Pct = Math.max(
            2,
            Math.min(98, Math.round(((price - w52LowNum) / w52Span) * 100))
          );

          const rawVol = Number(meta.regularMarketVolume);
          const vol = coinbaseVolumeUsd > 0 ? coinbaseVolumeUsd : rawVol;
          const updatedAtEpoch =
            isCryptoAnchor && coinbaseVolumeUsd > 0
              ? Date.now()
              : Number(meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000;
          const exchangeName =
            isCryptoAnchor && coinbaseVolumeUsd > 0
              ? 'Coinbase Spot USD'
              : String(meta.fullExchangeName || meta.exchangeName || 'Global Market');

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
          };

          perSymbolQuoteCache.set(cfg.id, {
            data: rawMeta,
            expiresAt: Date.now() + (sessionInfo.isOpen ? 900 : 600_000),
            wasOpen: sessionInfo.isOpen,
          });
          return rawMeta;
        } catch {
          return cached?.data ?? null;
        }
      })
    ),
    fetchId10yRaw().catch(() => null),
  ]);

  const validRaw = rawResults.filter((r): r is RawQuoteMeta => r !== null);
  const byId = new Map(validRaw.map((r) => [r.cfg.id, r]));

  const wtiPrice = byId.get('WTI')?.price;
  const brentPrice = byId.get('BRENT')?.price;
  const us10yPrice = byId.get('US10Y')?.price;
  const us30yPrice = byId.get('US30Y')?.price;

  const quotes: LiveQuotePatch[] = validRaw.map((r) => {
    const { cfg, price, prevClose, changeValue, changePercent, firstOpen, dayHighNum, dayLowNum, w52LowNum, w52HighNum, w52Pct, vol, closes, timestamps, updatedAtEpoch } = r;
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
    const intradayPct = price > 0 ? (intradaySpan / price) * 100 : 0;
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

    const dirWord =
      changePercent > 0.15 ? 'advancing' : changePercent < -0.15 ? 'pulling back' : 'consolidating';
    const signStr = changePercent >= 0 ? '+' : '';
    const openDeltaStr =
      firstOpen > 0
        ? price >= firstOpen
          ? `holding above opening print (${open})`
          : `trading below opening print (${open})`
        : 'tracking session pivot';
    const ibsRatio =
      dayHighNum > dayLowNum ? (price - dayLowNum) / (dayHighNum - dayLowNum) : 0.5;
    const rangeZone =
      ibsRatio >= 0.72
        ? 'upper session quartile'
        : ibsRatio <= 0.28
          ? 'lower demand quartile'
          : 'mid-range equilibrium';

    let extraNote = '';
    if (cfg.id === 'BTCUSD' || cfg.id === 'ETHUSD') {
      extraNote = ` 24/7 momentum posture registers ${signalTier} across ${rangeZone}; holding above ${support} preserves upside breakout structure toward ${resistance}.`;
    } else if (cfg.id === 'XAUUSD') {
      extraNote = ` Bullion reacts inversely to DXY & US real yields; signal reads ${signalTier} inside ${rangeZone}.`;
    } else if (cfg.id === 'WTI' && brentPrice) {
      extraNote = ` WTI trades at a $${Math.abs(price - brentPrice).toFixed(2)}/bbl ${
        price < brentPrice ? 'discount' : 'premium'
      } to Brent ($${brentPrice.toFixed(2)}).`;
    } else if (cfg.id === 'BRENT' && wtiPrice) {
      extraNote = ` Brent maintains a $${(price - wtiPrice).toFixed(2)}/bbl spread over WTI ($${wtiPrice.toFixed(2)}).`;
    } else if ((cfg.id === 'US10Y' || cfg.id === 'US30Y') && us10yPrice && us30yPrice) {
      const bps = ((us30yPrice - us10yPrice) * 100).toFixed(1);
      extraNote = ` The 10Y–30Y Treasury curve spread stands at ${Number(bps) >= 0 ? '+' : ''}${bps} bps.`;
    } else if (cfg.id === 'IHSG' || cfg.id === 'EIDO') {
      extraNote = ` Intraday bias reads ${signalTier} (${rangeZone}), sensitive to foreign banking flows and USD/IDR stability.`;
    }

    const ordinalPct = (() => {
      const mod100 = w52Pct % 100;
      if (mod100 >= 11 && mod100 <= 13) return `${w52Pct}th`;
      const mod10 = w52Pct % 10;
      if (mod10 === 1) return `${w52Pct}st`;
      if (mod10 === 2) return `${w52Pct}nd`;
      if (mod10 === 3) return `${w52Pct}rd`;
      return `${w52Pct}th`;
    })();

    const commentary = `${cfg.name} is ${dirWord} at ${priceLabel} (${signStr}${changePercent.toFixed(
      2
    )}%), ${openDeltaStr} within a ${dayLow}–${dayHigh} intraday band (${ordinalPct} 52W pct). Immediate pivot support stands at ${support} with resistance overhead at ${resistance}.${extraNote}`;

    // Clean secondary statistics (omitting removed Intraday Spread / 52W Position / 52W Midpoint)
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

    const chartStart = prevClose;
    const intradayPoints = Array.from({ length: 16 }, (_, idx) => {
      const t = idx / 15;
      const val = chartStart + (price - chartStart) * t + Math.sin(t * Math.PI * 2) * 0.006;
      return Number(val.toFixed(3));
    });
    intradayPoints[intradayPoints.length - 1] = price;
    const intradayTimestamps = Array.from(
      { length: 16 },
      (_, idx) => now - (15 - idx) * 1800_000
    );

    const id10ySession = getServerSessionInfo('ID10Y', nowDate);
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
    });
  }

    const payload = { quotes, updatedAt: new Date().toISOString() };
    const anyOpen = quotes.some((q) => q.marketSessionOpen);
    if (quotes.length > 0) {
      quotesCache.entry = { data: payload, expiresAt: Date.now() + (anyOpen ? 900 : 120_000) };
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
        quote?: Array<{ close?: Array<number | null> }>;
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
              quote?: Array<{ close?: Array<number | null> }>;
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

        const perfMap: Record<string, { pct: number; spanMs: number; count: number }> = {
          '1D': { pct: raw.changePercent, spanMs: 8 * 3600_000, count: 20 },
          '1W': { pct: raw.perfW, spanMs: 7 * 86400_000, count: 24 },
          '1M': { pct: raw.perf1M, spanMs: 30 * 86400_000, count: 28 },
          '3M': { pct: raw.perf3M, spanMs: 90 * 86400_000, count: 36 },
          YTD: { pct: raw.perfYTD, spanMs: 180 * 86400_000, count: 40 },
          '1Y': { pct: raw.perfY, spanMs: 365 * 86400_000, count: 48 },
          ALL: { pct: raw.perfY * 1.15, spanMs: 5 * 365 * 86400_000, count: 52 },
        };
        const cfg = perfMap[timeframe] ?? perfMap['1D'];
        const startVal = Number((raw.price / (1 + cfg.pct / 100)).toFixed(3));
        const safeStart = Math.max(
          raw.w52LowNum * 0.92,
          Math.min(raw.w52HighNum * 1.05, startVal)
        );
        const points: number[] = [];
        const timestamps: number[] = [];
        for (let i = 0; i < cfg.count; i++) {
          const t = i / (cfg.count - 1);
          const wave = Math.sin(t * Math.PI * 3.5) * 0.035 + Math.cos(t * Math.PI * 1.5) * 0.02;
          const val =
            i === cfg.count - 1
              ? raw.price
              : safeStart + (raw.price - safeStart) * t + (i === 0 ? 0 : wave * (1 - t));
          points.push(Number(Math.max(3.5, val).toFixed(3)));
          timestamps.push(Math.round(now - cfg.spanMs * (1 - t)));
        }
        const payload: LiveChartResponse = {
          id: 'ID10Y',
          timeframe,
          points,
          timestamps,
          prevClose: safeStart,
        };
        chartCache.set(key, { data: payload, expiresAt: now + 180_000 });
        return payload;
      }

      const cfg = YAHOO_SYMBOL_CONFIG.find((c) => c.id === id);
      if (!cfg) return null;

      const rangeMap: Record<string, { range: string; interval: string }> = {
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
      const rawCloses = item?.indicators?.quote?.[0]?.close ?? [];
      const rawTimestamps = item?.timestamp ?? [];
      const points: number[] = [];
      const timestamps: number[] = [];

      for (let i = 0; i < rawCloses.length; i++) {
        const val = rawCloses[i];
        const ts = rawTimestamps[i];
        if (typeof val === 'number' && Number.isFinite(val)) {
          points.push(Number(val.toFixed(cfg.decimals)));
          timestamps.push(typeof ts === 'number' ? ts * 1000 : Date.now());
        }
      }

      if (points.length === 0) {
        return cached?.data ?? null;
      }

      const prevClose = Number(
        item?.meta?.chartPreviousClose ?? item?.meta?.previousClose ?? points[0]
      );

      const payload: LiveChartResponse = {
        id,
        timeframe,
        points,
        timestamps,
        prevClose: Number.isFinite(prevClose) ? Number(prevClose.toFixed(cfg.decimals)) : points[0],
      };

      chartCache.set(key, { data: payload, expiresAt: now + 180_000 });
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
  if (fxCache.entry && fxCache.entry.expiresAt > now) {
    return fxCache.entry.data;
  }

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

  const idrRate = usdIdrQuote?.price || erRates?.IDR || 16000;
  const eurPerUsd = eurUsdQuote ? 1 / eurUsdQuote.price : erRates?.EUR || 0.91;
  const gbpPerUsd = erRates?.GBP || 0.78;
  const jpyPerUsd = erRates?.JPY || 152;
  const sgdPerUsd = erRates?.SGD || 1.33;
  const audPerUsd = erRates?.AUD || 1.52;

  const rates: Record<string, number> = {
    USD: 1,
    EUR: Number(eurPerUsd.toFixed(6)),
    GBP: Number(gbpPerUsd.toFixed(6)),
    JPY: Number(jpyPerUsd.toFixed(4)),
    IDR: Number(idrRate.toFixed(2)),
    SGD: Number(sgdPerUsd.toFixed(6)),
    AUD: Number(audPerUsd.toFixed(6)),
  };

  const formatTileRate = (val: number, decimals: number) =>
    val.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  const eurUsdVal = eurUsdQuote?.price ?? 1 / rates.EUR;
  const gbpUsdVal = 1 / rates.GBP;
  const sgdIdrVal = rates.IDR / rates.SGD;
  const audUsdVal = 1 / rates.AUD;

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
      changePercent: 0.14,
      high: formatTileRate(gbpUsdVal * 1.004, 4),
      low: formatTileRate(gbpUsdVal * 0.996, 4),
    },
    {
      pair: 'USD / JPY',
      base: 'USD',
      quote: 'JPY',
      rate: formatTileRate(rates.JPY, 2),
      changePercent: -0.18,
      high: formatTileRate(rates.JPY * 1.005, 2),
      low: formatTileRate(rates.JPY * 0.995, 2),
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
    {
      pair: 'AUD / USD',
      base: 'AUD',
      quote: 'USD',
      rate: formatTileRate(audUsdVal, 4),
      changePercent: 0.21,
      high: formatTileRate(audUsdVal * 1.004, 4),
      low: formatTileRate(audUsdVal * 0.996, 4),
    },
  ];

  const payload: LiveFxResponse = {
    base: 'USD',
    rates,
    pairTiles,
    updatedAt: new Date().toISOString(),
  };

  fxCache.entry = { data: payload, expiresAt: now + 600_000 };
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
    const summary = summaryRaw || headline;
    const { topic, tags } = classifyTopic(`${headline} ${summary}`, defaultTopic);
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
      isBreaking: i < 2 && Date.now() - ts < 6 * 3600 * 1000,
      impact: i === 0 ? 'Live Market Wire' : undefined,
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
  if (newsCache.entry && newsCache.entry.expiresAt > now) {
    return newsCache.entry.data;
  }

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
    .sort((a, b) => b.ts - a.ts)
    .filter((item) => {
      const key = item.headline.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 55);
      if (!key || seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, 36)
    .map(({ ts: _ts, ...rest }) => rest);

  const payload = { stories: deduped, updatedAt: new Date().toISOString() };
  if (deduped.length > 0) {
    newsCache.entry = { data: payload, expiresAt: now + 300_000 };
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

function computeDeviation(actual?: string, forecast?: string): {
  label: string;
  type: 'beat' | 'miss' | 'neutral';
} {
  if (!actual || !actual.trim() || actual === 'Pending') {
    return { label: 'Upcoming', type: 'neutral' };
  }
  if (!forecast || !forecast.trim() || forecast === '—') {
    return { label: 'Released', type: 'neutral' };
  }
  const numActual = parseFloat(actual.replace(/[^0-9.-]/g, ''));
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
    `Today is ${todayWib} (Asia/Jakarta UTC+7). Search the web for the actual macroeconomic calendar releases for this week (including US Retail Sales, Industrial Production, Jobless Claims, CPI/PPI, Fed speeches, Bank Indonesia BI-Rate, Japan GDP/Trade, Eurozone CPI/PMI, and China data). ` +
    `Return ONLY a raw JSON array of up to 12 events (no markdown fences) where each object has: ` +
    `{"title":"...", "currency":"USD|IDR|CNY|EUR|JPY", "impact":"HIGH|MED", "isoDate":"YYYY-MM-DDTHH:mm:ss+07:00", "description":"...", "actual":"...", "forecast":"...", "previous":"..."}. ` +
    `Use "Pending" for actual if the release time in WIB has not happened yet.`;

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
    actual?: string;
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
      const actual = ev.actual?.trim() || 'Pending';
      const forecast = ev.forecast?.trim() || '—';
      const previous = ev.previous?.trim() || '—';
      const dev = computeDeviation(actual, forecast);

      return {
        id: `cal-ai-${idx}-${validDate.getTime()}`,
        timeWib: formatWibTimeLabel(validDate),
        isoDate: validDate.toISOString(),
        day: classifyDay(validDate),
        currency: curr,
        impact,
        title: String(ev.title),
        description: String(ev.description || 'Official Macroeconomic Release'),
        actual,
        forecast,
        previous,
        deviationLabel: dev.label,
        deviationType: dev.type,
      };
    });
}

function formatTvMetric(
  val: number | null | undefined,
  unit?: string,
  scale?: string,
  isActual = false,
  isFuture = false
): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    if (isActual && isFuture) return 'Pending';
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

function computeTvDeviation(
  actual: number | null | undefined,
  forecast: number | null | undefined,
  unit?: string,
  scale?: string,
  isFuture = false
): { label: string; type: 'beat' | 'miss' | 'neutral' } {
  if (actual === null || actual === undefined || !Number.isFinite(actual)) {
    return { label: isFuture ? 'Upcoming' : 'Pending', type: 'neutral' };
  }
  if (forecast === null || forecast === undefined || !Number.isFinite(forecast)) {
    return { label: 'Released', type: 'neutral' };
  }
  const diff = actual - forecast;
  if (Math.abs(diff) < 1e-6) {
    return { label: 'In-line', type: 'neutral' };
  }
  const mag =
    Math.abs(diff) >= 100
      ? Math.abs(diff).toFixed(1).replace(/\.0$/, '')
      : Number(Math.abs(diff).toFixed(2)).toString();
  const suffix = unit === '%' ? '%' : scale || '';
  return diff > 0
    ? { label: `Beat (+${mag}${suffix})`, type: 'beat' }
    : { label: `Miss (-${mag}${suffix})`, type: 'miss' };
}

export async function fetchLiveCalendar(): Promise<LiveCalendarResponse> {
  const now = Date.now();
  if (calendarCache.entry && calendarCache.entry.expiresAt > now) {
    return calendarCache.entry.data;
  }

  return coalesceInFlight('live-calendar', calendarCache.entry?.data, async () => {

  let events: LiveCalendarItem[] = [];
  let source = 'Live Macro Feed';

  // Primary source: TradingView Live Economic Calendar API
  try {
    const fromIso = new Date(now - 36 * 3600_000).toISOString();
    const toIso = new Date(now + 6 * 86400_000).toISOString();
    const tvUrl = `https://economic-calendar.tradingview.com/events?from=${encodeURIComponent(
      fromIso
    )}&to=${encodeURIComponent(toIso)}&countries=US,ID,JP,EU,CN`;

    const res = await fetch(tvUrl, {
      headers: {
        ...UA_HEADERS,
        Origin: 'https://www.tradingview.com',
        Referer: 'https://www.tradingview.com/',
      },
      signal: AbortSignal.timeout(9000),
    });

    if (res.ok) {
      const json = (await res.json()) as {
        status?: string;
        result?: Array<{
          id?: string;
          title?: string;
          country?: string;
          currency?: string;
          period?: string;
          source?: string;
          comment?: string;
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
        ID: 'IDR',
        CN: 'CNY',
        EU: 'EUR',
        JP: 'JPY',
      };
      const allowedCurrencies = new Set<LiveCalendarItem['currency']>([
        'USD',
        'IDR',
        'CNY',
        'EUR',
        'JPY',
      ]);

      const rawList = (json.result ?? [])
        .filter((ev) => ev.title && ev.date && typeof ev.importance === 'number' && ev.importance >= 0)
        .sort((a, b) => Date.parse(a.date!) - Date.parse(b.date!));

      // Keep all High-impact, Indonesian (IDR), and Today/Tomorrow events first, capped at 36 rows
      const mappedAll: LiveCalendarItem[] = rawList.map((ev, idx) => {
        const d = new Date(ev.date!);
        const isFuture = d.getTime() > now;
        const currCandidate = String(ev.currency || '') as LiveCalendarItem['currency'];
        const curr = allowedCurrencies.has(currCandidate)
          ? currCandidate
          : countryCurrencyMap[String(ev.country || '')] || 'USD';
        const impact: 'HIGH' | 'MED' = ev.importance === 1 ? 'HIGH' : 'MED';
        const actual = formatTvMetric(ev.actual, ev.unit, ev.scale, true, isFuture);
        const forecast = formatTvMetric(ev.forecast, ev.unit, ev.scale, false, isFuture);
        const previous = formatTvMetric(ev.previous, ev.unit, ev.scale, false, isFuture);
        const dev = computeTvDeviation(ev.actual, ev.forecast, ev.unit, ev.scale, isFuture);
        const cleanComment = (ev.comment || '').replace(/\s+/g, ' ').trim();
        const shortComment =
          cleanComment.length > 105 ? `${cleanComment.slice(0, 102).trim()}…` : cleanComment;
        const descParts = [ev.source, ev.period, shortComment].filter(Boolean);

        return {
          id: `tv-${ev.id || idx}-${d.getTime()}`,
          timeWib: formatWibTimeLabel(d),
          isoDate: d.toISOString(),
          day: classifyDay(d),
          currency: curr,
          impact,
          title: String(ev.title),
          description: descParts.join(' · ') || `${curr} Macroeconomic Release`,
          actual,
          forecast,
          previous,
          deviationLabel: dev.label,
          deviationType: dev.type,
        };
      });

      const isRelevantMacroRelease = (title: string, impact: 'HIGH' | 'MED') => {
        if (impact === 'HIGH') return true;
        return /(gdp|cpi|ppi|pce|pmi|retail|sales|trade|export|import|industrial|manufacturing|unemployment|jobless|payrolls|employment|confidence|sentiment|inflation|rate|minutes|housing|building|orders|inventories|money supply|m2|foreign exchange|fx reserves|balance|current account)/i.test(
          title
        );
      };

      const priority = mappedAll.filter(
        (e) =>
          e.impact === 'HIGH' ||
          e.currency === 'IDR' ||
          ((e.day === 'today' || e.day === 'tomorrow' || e.day === 'week') &&
            isRelevantMacroRelease(e.title, e.impact))
      );
      events = (priority.length >= 16 ? priority : mappedAll).slice(0, 44);
      if (events.length > 0) {
        source = 'TradingView Live Macroeconomic Calendar';
      }
    }
  } catch {
    // fallback below
  }

  // Secondary fallback: ForexFactory weekly JSON feed
  if (events.length === 0) {
    try {
      const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
        headers: UA_HEADERS,
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          const raw = (await res.json()) as Array<{
            title?: string;
            country?: string;
            date?: string;
            impact?: string;
            actual?: string;
            forecast?: string;
            previous?: string;
          }>;
          const allowed = new Set(['USD', 'IDR', 'CNY', 'EUR', 'JPY']);
          events = raw
            .filter(
              (item) =>
                item.title &&
                item.date &&
                (item.impact === 'High' || item.impact === 'Medium')
            )
            .map((item, idx) => {
              const d = new Date(item.date!);
              const curr = allowed.has(String(item.country))
                ? (item.country as LiveCalendarItem['currency'])
                : 'USD';
              const actual = item.actual?.trim() || (d.getTime() > now ? 'Pending' : '—');
              const forecast = item.forecast?.trim() || '—';
              const previous = item.previous?.trim() || '—';
              const dev = computeDeviation(actual, forecast);

              return {
                id: `ff-${idx}-${d.getTime()}`,
                timeWib: formatWibTimeLabel(d),
                isoDate: d.toISOString(),
                day: classifyDay(d),
                currency: curr,
                impact: item.impact === 'High' ? 'HIGH' : 'MED',
                title: String(item.title),
                description: `${item.country || 'Global'} Macroeconomic Release`,
                actual,
                forecast,
                previous,
                deviationLabel: dev.label,
                deviationType: dev.type,
              };
            });
          source = 'ForexFactory Weekly Macro Feed';
        }
      }
    } catch {
      // fallback below
    }
  }

  // Tertiary fallback: Gemini + Google Search Grounding
  if (events.length === 0) {
    try {
      events = await fetchCalendarViaGemini();
      if (events.length > 0) {
        source = 'Google Search Grounded Macro Calendar';
      }
    } catch {
      // keep empty -> client falls back safely
    }
  }

  // Find next upcoming HIGH impact event (or next MED event) for live countdown
  const futureEvents = events
    .filter((e) => Date.parse(e.isoDate) > now)
    .sort((a, b) => Date.parse(a.isoDate) - Date.parse(b.isoDate));
  const upcomingCatalyst =
    futureEvents.find((e) => e.impact === 'HIGH') ?? futureEvents[0] ?? null;

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

  if (events.length > 0) {
    calendarCache.entry = { data: payload, expiresAt: now + 1800_000 };
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
      { left: 'close', operation: 'greater', right: region === 'indonesia' ? 50 : 2 },
      { left: 'volume', operation: 'greater', right: region === 'indonesia' ? 50_000 : 250_000 },
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
      const name = String(d[1] || symbol).slice(0, 42);
      const close = Number(d[2]);
      const changePct = Number(d[3]);
      const changeAbs = Number(d[4]);
      const high = Number(d[5] ?? close);
      const low = Number(d[6] ?? close);
      const vol = Number(d[7] ?? 0);
      const valTraded = Number(d[8] ?? close * vol);
      const exchange = String(d[9] || (region === 'indonesia' ? 'IDX' : 'NASDAQ/NYSE'));
      const mcap = Number(d[10] ?? 0);
      const rvol = Number(d[11] ?? 1);

      if (!symbol || !Number.isFinite(close) || close <= 0 || !Number.isFinite(changePct)) continue;
      const isId = region === 'indonesia';
      const decimals = isId ? 0 : 2;
      const price = isId ? Math.round(close) : Number(close.toFixed(2));
      const chgVal = isId ? Math.round(changeAbs) : Number(changeAbs.toFixed(2));
      const prevClose = isId
        ? Math.max(1, Math.round(close - changeAbs))
        : Number(Math.max(0.01, close - changeAbs).toFixed(2));
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
        changePercent: Number(changePct.toFixed(2)),
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

function computeIndexImpactScore(item: InternalMover, region: 'US' | 'ID'): number {
  // True index movers combine: market-cap weight + institutional turnover + capped price displacement + RVOL + intraday range
  const absMove = Math.min(12, Math.abs(item.changePercent));
  const minTurn = region === 'ID' ? 1e9 : 1e6;
  const logTurn = Math.max(0, Math.log10(Math.max(minTurn, item.dollarTurnover) / minTurn));
  const mcapFloor = region === 'ID' ? 1e12 : 1e9;
  const logCap = item.marketCap
    ? Math.max(0.4, Math.log10(Math.max(mcapFloor, item.marketCap) / mcapFloor) * 1.4)
    : Math.max(0.4, logTurn * 0.65);

  const intradayRangePct =
    item.price > 0 && item.dayHigh > item.dayLow
      ? Math.min(0.08, (item.dayHigh - item.dayLow) / item.price)
      : 0;
  const rangeBoost = 1 + intradayRangePct * 6;
  const rvolBoost = Math.max(0.75, Math.min(2.2, item.relativeVolume ?? 1));

  // Balance directional shock with heavyweight capitalization & liquidity
  return (absMove * 1.6 + 0.85) * (1 + logTurn * 0.48 + logCap * 0.62) * rangeBoost * rvolBoost;
}

export async function fetchTopStockMovers(): Promise<StocksMoversResponse> {
  const now = Date.now();
  if (stocksMoversCache.entry && stocksMoversCache.entry.expiresAt > now) {
    return stocksMoversCache.entry.data;
  }

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
    fetchTradingViewScan('america', 'Value.Traded', 'desc', [], 25),
    fetchTradingViewScan(
      'america',
      'market_cap_basic',
      'desc',
      [{ left: 'Value.Traded', operation: 'greater', right: 20_000_000 }],
      20
    ),
    fetchTradingViewScan(
      'america',
      'change',
      'desc',
      [{ left: 'Value.Traded', operation: 'greater', right: 15_000_000 }],
      20
    ),
    fetchTradingViewScan(
      'america',
      'change',
      'asc',
      [{ left: 'Value.Traded', operation: 'greater', right: 15_000_000 }],
      20
    ),
    fetchTradingViewScan('indonesia', 'Value.Traded', 'desc', [], 25),
    fetchTradingViewScan(
      'indonesia',
      'market_cap_basic',
      'desc',
      [{ left: 'Value.Traded', operation: 'greater', right: 10_000_000_000 }],
      20
    ),
    fetchTradingViewScan(
      'indonesia',
      'change',
      'desc',
      [
        { left: 'Value.Traded', operation: 'greater', right: 5_000_000_000 },
        { left: 'close', operation: 'greater', right: 65 },
      ],
      20
    ),
    fetchTradingViewScan(
      'indonesia',
      'change',
      'asc',
      [
        { left: 'Value.Traded', operation: 'greater', right: 5_000_000_000 },
        { left: 'close', operation: 'greater', right: 65 },
      ],
      20
    ),
    fetchIdxForeignFlowLists(),
  ]);

  // Parallel direct Yahoo Finance fallback if TradingView returned thin/empty results
  const [yahooUsFallback, yahooIdxFallback] = await Promise.all([
    tvUsImpact.length + tvUsMegaCap.length < 12 ? fetchYahooDirectBasket('US') : Promise.resolve([]),
    tvIdxImpact.length + tvIdxBlueChip.length < 12 ? fetchYahooDirectBasket('ID') : Promise.resolve([]),
  ]);

  // 1. Build guaranteed 10-stock US buckets (Impact, Gainers, Losers)
  const usPoolMap = new Map<string, InternalMover>();
  for (const item of [
    ...tvUsMegaCap,
    ...tvUsImpact,
    ...parseYahooQuotesToMovers([...yActives, ...yGainers, ...yLosers]),
    ...tvUsGainers,
    ...tvUsLosers,
    ...yahooUsFallback,
  ]) {
    const existing = usPoolMap.get(item.symbol);
    if (!existing) {
      usPoolMap.set(item.symbol, item);
    } else if (!existing.marketCap && item.marketCap) {
      usPoolMap.set(item.symbol, { ...existing, marketCap: item.marketCap, relativeVolume: item.relativeVolume ?? existing.relativeVolume });
    }
  }
  const usPool = Array.from(usPoolMap.values());

  const usInstitutional = usPool.filter((s) => s.dollarTurnover >= 40_000_000 && s.price >= 5);
  const usImpactBase = usInstitutional.length >= 10 ? usInstitutional : usPool;
  const usImpactRaw = [...usImpactBase]
    .sort((a, b) => computeIndexImpactScore(b, 'US') - computeIndexImpactScore(a, 'US'))
    .slice(0, 10);

  const usLiquidMovers = usPool.filter((s) => s.dollarTurnover >= 15_000_000 && s.price >= 5);
  const usMoverPool = usLiquidMovers.length >= 15 ? usLiquidMovers : usPool;

  const usGainersList = usMoverPool
    .filter((s) => s.changePercent >= 0)
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

  // 2. Build guaranteed 10-stock IDX buckets (Impact, Gainers, Losers)
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

  const idxInstitutional = idxPool.filter((s) => s.dollarTurnover >= 25_000_000_000 && s.price >= 100);
  const idxLiquidFallback = idxPool.filter((s) => s.dollarTurnover >= 5_000_000_000 && s.price >= 60);
  const idxImpactBase =
    idxInstitutional.length >= 10
      ? idxInstitutional
      : idxLiquidFallback.length >= 10
        ? idxLiquidFallback
        : idxPool;
  const idxImpactRaw = [...idxImpactBase]
    .sort((a, b) => computeIndexImpactScore(b, 'ID') - computeIndexImpactScore(a, 'ID'))
    .slice(0, 10);

  const idxMoverBase = idxLiquidFallback.length >= 15 ? idxLiquidFallback : idxPool;
  const idxGainersList = idxMoverBase
    .filter((s) => s.changePercent >= 0)
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

  // Ensure IDX Foreign Buy & Foreign Sell always populate 10 tickers cleanly
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
      const estAmt = Math.max(1_500_000_000, Math.round(item.dollarTurnover * 0.22));
      const signedAmt = side === 'SELL' ? -estAmt : estAmt;
      const { dollarTurnover: _dt, marketCap: _mc, relativeVolume: _rv, ...clean } = item;
      return {
        ...clean,
        foreignNetAmount: signedAmt,
        foreignNetLabel: formatIdrFlowLabel(signedAmt),
        foreignFlowSide: side,
        foreignSourceLabel: 'IDX Flow Estimate',
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

  const enriched = await enrichSparklinesForMovers(combinedMovers);
  const u0 = usImpactRaw.length;
  const u1 = u0 + usGainersRaw.length;
  const u2 = u1 + usLosersRaw.length;
  const i0 = u2 + idxImpactRaw.length;
  const i1 = i0 + idxGainersRaw.length;

  const payload: StocksMoversResponse = {
    us: {
      impact: enriched.slice(0, u0),
      gainers: enriched.slice(u0, u1),
      losers: enriched.slice(u1, u2),
    },
    indonesia: {
      impact: enriched.slice(u2, i0),
      gainers: enriched.slice(i0, i1),
      losers: enriched.slice(i1),
      foreignBuy: finalForeignBuy,
      foreignSell: finalForeignSell,
    },
    updatedAt: new Date().toISOString(),
  };

  const usOpen = getServerSessionInfo('SPX', new Date(now)).isOpen;
  const idxOpen = getServerSessionInfo('IHSG', new Date(now)).isOpen;
  const moversTtl = usOpen || idxOpen ? 10_000 : 600_000;

  if (payload.us.impact.length >= 10 && payload.indonesia.impact.length >= 10) {
    stocksMoversCache.entry = { data: payload, expiresAt: now + moversTtl };
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
        const rawPrev = Number(
          meta.regularMarketPreviousClose ?? meta.previousClose ?? meta.chartPreviousClose ?? price
        );
        if (!Number.isFinite(price) || price <= 0) return cached?.data ?? null;

        const isCrypto = yahooSymbol === 'BTC-USD' || yahooSymbol === 'ETH-USD';
        if (isCrypto) {
          const cb = await fetchCoinbaseSpotTicker(yahooSymbol as 'BTC-USD' | 'ETH-USD');
          if (cb) price = cb.price;
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
          meta.regularMarketChangePercent,
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

  return {
    quotes: results.filter((r): r is PortfolioQuoteResult => r !== null),
    updatedAt: new Date().toISOString(),
  };
}

const portfolioSeriesCache = new Map<
  string,
  CacheEntry<{ points: number[]; timestamps: number[]; prevClose: number }>
>();

export async function fetchPortfolioSymbolSeries(
  yahooSymbol: string,
  timeframe: string
): Promise<{ points: number[]; timestamps: number[]; prevClose: number } | null> {
  const sym = yahooSymbol.trim().toUpperCase();
  const key = `${sym}:${timeframe}`;
  const now = Date.now();
  const sessionInfo = getServerSessionInfo(sym, new Date(now));
  const cached = portfolioSeriesCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const rangeMap: Record<string, { range: string; interval: string }> = {
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
    MAX: { range: '1d', interval: '5m' },
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
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };

    const item = json.chart?.result?.[0];
    const rawCloses = item?.indicators?.quote?.[0]?.close ?? [];
    const rawTs = item?.timestamp ?? [];
    const points: number[] = [];
    const timestamps: number[] = [];

    for (let i = 0; i < rawCloses.length; i++) {
      const val = rawCloses[i];
      const ts = rawTs[i];
      if (typeof val === 'number' && Number.isFinite(val)) {
        points.push(val);
        timestamps.push(typeof ts === 'number' ? ts * 1000 : now);
      }
    }
    const lastPrice = Number(item?.meta?.regularMarketPrice);
    if (Number.isFinite(lastPrice) && lastPrice > 0 && points.length > 0) {
      points[points.length - 1] = lastPrice;
    }
    if (points.length === 0) return cached?.data ?? null;

    const prevClose = Number(
      item?.meta?.chartPreviousClose ?? item?.meta?.previousClose ?? points[0]
    );
    const data = {
      points,
      timestamps,
      prevClose: Number.isFinite(prevClose) && prevClose > 0 ? prevClose : points[0],
    };

    const ttl =
      (timeframe === '1D' || timeframe === 'MAX') && sessionInfo.isOpen ? 1_000 : 180_000;
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
  chart1D: number[];
  timestamps1D: number[];
  marketSessionOpen: boolean;
  sessionStateLabel: string;
  sessionProgressRatio: number;
  updatedAtEpoch: number;
}

export async function fetchSymbolDetail(
  yahooSymbolInput: string,
  timeframe = '1D'
): Promise<SymbolDetailResponse | null> {
  let sym = yahooSymbolInput.trim().toUpperCase();
  if (!sym) return null;
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
      ? fetchCoinbaseSpotTicker(sym)
      : Promise.resolve(null),
  ]);

  const item = (
    quoteRes as {
      chart?: {
        result?: Array<{
          meta?: Record<string, unknown>;
          timestamp?: number[];
          indicators?: {
            quote?: Array<{ close?: Array<number | null>; open?: Array<number | null> }>;
          };
        }>;
      };
    } | null
  )?.chart?.result?.[0];

  const meta = item?.meta;
  if (!meta) return null;

  let price = Number(meta.regularMarketPrice);
  if (cbTicker) price = cbTicker.price;
  if (!Number.isFinite(price) || price <= 0) return null;
  const rawPrev = Number(
    meta.regularMarketPreviousClose ?? meta.previousClose ?? meta.chartPreviousClose ?? price
  );

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
    meta.regularMarketChangePercent,
    decimals,
    isCrypto
  );

  const rawCloses = item?.indicators?.quote?.[0]?.close ?? [];
  const rawTs = item?.timestamp ?? [];
  const chart1D: number[] = [];
  const timestamps1D: number[] = [];
  for (let i = 0; i < rawCloses.length; i++) {
    const val = rawCloses[i];
    if (typeof val === 'number' && Number.isFinite(val)) {
      chart1D.push(Number(val.toFixed(decimals)));
      timestamps1D.push(typeof rawTs[i] === 'number' ? rawTs[i] * 1000 : now);
    }
  }
  if (chart1D.length === 0) {
    chart1D.push(prevClose, price);
    timestamps1D.push(now - 3600_000, now);
  } else {
    chart1D[chart1D.length - 1] = Number(price.toFixed(decimals));
  }

  const activePoints =
    timeframe === '1D' || !seriesRes?.points.length ? chart1D : seriesRes.points;
  const activeTimestamps =
    timeframe === '1D' || !seriesRes?.timestamps.length ? timestamps1D : seriesRes.timestamps;

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
    chart1D,
    timestamps1D,
    marketSessionOpen: sessionInfo.isOpen,
    sessionStateLabel: sessionInfo.stateLabel,
    sessionProgressRatio: sessionInfo.progressRatio,
    updatedAtEpoch: Number(meta.regularMarketTime || Math.floor(now / 1000)) * 1000,
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
      const scoreA = (a.impact === 'HIGH' ? 2 : 1) + (a.actual !== 'Pending' ? 2 : 0);
      const scoreB = (b.impact === 'HIGH' ? 2 : 1) + (b.actual !== 'Pending' ? 2 : 0);
      return scoreB - scoreA;
    });

  const selectedCal = (recentCal.length > 0 ? recentCal : calEvents).slice(0, 3);
  for (const ev of selectedCal) {
    const hasActual = ev.actual && ev.actual !== 'Pending' && ev.actual !== '—';
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
  const hasActual = ev.actual && ev.actual !== 'Pending' && ev.actual !== '—';
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
  if (intelligenceCache.entry && intelligenceCache.entry.expiresAt > now) {
    return intelligenceCache.entry.data;
  }

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
  const dxy = qById.get('DXY');
  const usdidr = qById.get('USDIDR');
  const wti = qById.get('WTI');
  const gold = qById.get('XAUUSD');
  const btc = qById.get('BTCUSD');

  const usLeader = movers?.us?.impact?.[0];
  const usGainer = movers?.us?.gainers?.[0];
  const usLoser = movers?.us?.losers?.[0];
  const idxLeader = movers?.indonesia?.impact?.[0];
  const idxBuyTop = movers?.indonesia?.foreignBuy?.[0];
  const idxSellTop = movers?.indonesia?.foreignSell?.[0];

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
    const activePhase = resolveIndexPhase(meta.id, nowDate);
    const signalTier = computeServerSignalTier({
      assetId: meta.id,
      changePercent: chgPct,
      price: priceNum,
      open: parseNum(q?.open),
      prevClose: q?.prevClose,
      dayHigh: parseNum(q?.dayHigh),
      dayLow: parseNum(q?.dayLow),
      series: q?.chart1D,
      w52Pct: q?.w52Pct ?? 50,
    });

    const macroCue =
      meta.region === 'US'
        ? usCalNext
          ? `Key USD catalyst: ${usCalNext.title} (${usCalNext.timeWib}, est ${usCalNext.forecast}).`
          : 'Focus stays on US 10Y yields and Treasury liquidity.'
        : meta.region === 'Indonesia'
          ? idCalNext
            ? `Jakarta macro focus: ${idCalNext.title} (${idCalNext.timeWib}) alongside USD/IDR near ${usdidr?.price.toLocaleString('en-US') || '16,200'}.`
            : `USD/IDR near ${usdidr?.price.toLocaleString('en-US') || '16,200'} & Bank Indonesia liquidity posture remain key opening drivers.`
          : asiaCalNext
            ? `Regional watch: ${asiaCalNext.currency} ${asiaCalNext.title} (${asiaCalNext.timeWib}).`
            : `Overnight Wall Street lead (${qById.get('IXIC')?.changePercent.toFixed(2) ?? '0.00'}% NASDAQ) and DXY (${dxy?.price.toFixed(3) ?? '103.7'}) guide Asia open.`;

    const moversLine =
      meta.region === 'US'
        ? usLeader
          ? `High-impact tape led by ${usLeader.symbol} (${usLeader.changePercent >= 0 ? '+' : ''}${usLeader.changePercent.toFixed(2)}%); top gainer ${usGainer?.symbol ?? 'NVDA'} vs laggard ${usLoser?.symbol ?? 'DOW'}.`
          : 'Mega-cap tech and cyclical financials set intraday breadth.'
        : meta.region === 'Indonesia'
          ? idxLeader
            ? `IDX heavyweight turnover led by ${idxLeader.symbol} (${idxLeader.changePercent >= 0 ? '+' : ''}${idxLeader.changePercent.toFixed(2)}%); foreign flow ${idxBuyTop ? `accumulated ${idxBuyTop.symbol} (${idxBuyTop.foreignNetLabel})` : 'selective in banks'}.`
            : 'Big banks and commodity proxies anchor Jakarta Sector I/II breadth.'
          : `${meta.name} tracks regional semiconductor, bank, and China-demand rotation within ${q?.dayLow ?? '—'}–${q?.dayHigh ?? '—'}.`;

    const biasWord =
      signalTier === 'Strong Bull' || signalTier === 'Bull Signal'
        ? 'firm risk-on momentum'
        : signalTier === 'Strong Bear' || signalTier === 'Bear Signal'
          ? 'defensive distribution pressure'
          : 'two-way range consolidation';

    const beforeOpen = `Pre-Open Setup: ${macroCue} DXY stands at ${dxy?.price.toFixed(3) ?? '103.7'} (${dxy && dxy.changePercent >= 0 ? '+' : ''}${dxy?.changePercent.toFixed(2) ?? '0.00'}%) with US 10Y yield at ${us10y?.price.toFixed(3) ?? '4.44'}%. Watch ${meta.symbol} opening drive (${q?.open ?? '—'}) between support ${q?.support ?? '—'} and resistance ${q?.resistance ?? '—'}.`;

    const duringSession = `Live Session Flow: ${meta.symbol} trades at ${priceFormatted} (${signStr}${chgPct.toFixed(2)}%, Open ${q?.open ?? '—'}) showing ${biasWord} (${signalTier}). ${moversLine} Intraday range spans ${q?.dayLow ?? '—'}–${q?.dayHigh ?? '—'}.`;

    const afterClose = `Post-Close Recap & Prediction: ${meta.symbol} settled at ${priceFormatted} (${signStr}${chgPct.toFixed(2)}%), leaving daily trading bias at ${signalTier}. Holding above ${q?.support ?? '—'} keeps recovery toward ${q?.resistance ?? '—'} alive next session; breaking below ${q?.support ?? '—'} opens lower demand zones.`;

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
      'Yahoo Finance Quotes',
      'TradingView Scanner & Macro Calendar',
      'Coinbase Spot USD',
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

  const dataReleaseImplications = events.slice(0, 6).map((ev) => ({
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

  const commentaryPoints = [
    `US Equities & Leadership: S&P 500 trades at ${spx?.price.toLocaleString('en-US') ?? '—'} (${spx && spx.changePercent >= 0 ? '+' : ''}${spx?.changePercent.toFixed(2) ?? '0.00'}%) while NASDAQ prints ${ixic && ixic.changePercent >= 0 ? '+' : ''}${ixic?.changePercent.toFixed(2) ?? '0.00'}%; institutional impact centers on ${usLeader?.symbol ?? 'NVDA'} (${usLeader ? `${usLeader.changePercent >= 0 ? '+' : ''}${usLeader.changePercent.toFixed(2)}%` : '—'}) with top momentum in ${usGainer?.symbol ?? '—'}.`,
    `Indonesia IDX & Rupiah Sensitivity: IHSG stands at ${ihsg?.price.toLocaleString('en-US') ?? '—'} (${ihsg && ihsg.changePercent >= 0 ? '+' : ''}${ihsg?.changePercent.toFixed(2) ?? '0.00'}%) and MSCI Indonesia ETF (EIDO) sits at $${eido?.price.toFixed(2) ?? '—'} (${eido && eido.changePercent >= 0 ? '+' : ''}${eido?.changePercent.toFixed(2) ?? '0.00'}%), tracking USD/IDR near ${usdidr?.price.toLocaleString('en-US') ?? '—'} vs DXY ${dxy?.price.toFixed(3) ?? '—'}.`,
    `Gold Spot & Macro Safe Haven: XAU/USD trades at $${gold?.price.toLocaleString('en-US') ?? '—'} (${gold && gold.changePercent >= 0 ? '+' : ''}${gold?.changePercent.toFixed(2) ?? '0.00'}%, Signal: ${goldTier}) alongside US 10Y at ${us10y?.price.toFixed(3) ?? '—'}% and WTI Crude at $${wti?.price.toFixed(2) ?? '—'}.`,
    `BTC & 24/7 Liquidity Pulse: Bitcoin holds $${btc?.price.toLocaleString('en-US') ?? '—'} (${btc && btc.changePercent >= 0 ? '+' : ''}${btc?.changePercent.toFixed(2) ?? '0.00'}%, Signal: ${btcTier}), acting as high-beta barometer between support ${btc?.support ?? '—'} and resistance ${btc?.resistance ?? '—'}.`,
  ];

  const stocksAndFlowSummary = `US institutional turnover leads via ${
    (movers?.us?.impact ?? []).slice(0, 3).map((s) => `${s.symbol} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`).join(', ') || 'flagship mega-caps'
  }. On IDX Jakarta, heavyweight rotation features ${
    (movers?.indonesia?.impact ?? []).slice(0, 3).map((s) => `${s.symbol} (${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%)`).join(', ') || 'LQ45 leaders'
  }${
    idxBuyTop || idxSellTop
      ? `, with net foreign flow led by ${idxBuyTop ? `accumulation in ${idxBuyTop.symbol} (${idxBuyTop.foreignNetLabel})` : 'selective accumulation'}${idxSellTop ? ` vs distribution in ${idxSellTop.symbol} (${idxSellTop.foreignNetLabel})` : ''}.`
      : '.'
  }`;

  const headline =
    compositeSentiment === 'Bullish'
      ? `Risk appetite firms across global equities led by ${usGainer?.symbol ?? 'tech leaders'} as ${bullCount} Bull Signals outpace ${bearCount} Bear Signals`
      : compositeSentiment === 'Bearish'
        ? `Cross-asset caution weighs on benchmarks (${bearCount} Bear vs ${bullCount} Bull Signals) with Gold (${goldTier}) and DXY setting defensive posture`
        : `Two-way rotation across US (${spx && spx.changePercent >= 0 ? '+' : ''}${spx?.changePercent.toFixed(2) ?? '0.00'}%), IDX (${ihsg && ihsg.changePercent >= 0 ? '+' : ''}${ihsg?.changePercent.toFixed(2) ?? '0.00'}%), and BTC ($${btc?.price.toLocaleString('en-US') ?? '—'}) as traders track yields & macro data`;

  let forwardPrediction = `Tactical Daily Outlook: While DXY stays capped below ${dxy?.resistance ?? '104.250'} and US 10Y holds near ${us10y?.price.toFixed(3) ?? '4.250'}%, watch SPX (${spx?.support ?? 'support'}–${spx?.resistance ?? 'resistance'}), IHSG (${ihsg?.support ?? 'support'}–${ihsg?.resistance ?? 'resistance'}), and XAU/USD ($${gold?.price.toLocaleString('en-US') ?? '—'}) around ${
    events[0] ? `${events[0].currency} ${events[0].title} (${events[0].impact} · ${events[0].timeWib})` : 'scheduled macro releases'
  }. Sustaining price above daily Open confirms trend continuation; failing opening support favors mean-reversion toward S1 pivots.`;

  let aiRefined = false;
  let finalHeadline = headline;
  let finalCommentary = commentaryPoints;

  // Optional Gemini refinement strictly server-side if GEMINI_API_KEY is configured
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiApiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const digestInput = {
        indices: indexSessions.map((i) => ({ s: i.symbol, p: i.priceFormatted, chg: i.changePercent, sig: i.signalTier })),
        dxy: dxy ? { p: dxy.price, chg: dxy.changePercent } : null,
        us10y: us10y ? { p: us10y.price, chg: us10y.changePercent } : null,
        usdidr: usdidr ? { p: usdidr.price, chg: usdidr.changePercent } : null,
        stocksAndFlowSummary,
        newsHeadlines: stories.slice(0, 6).map((s) => `${s.publisher}: ${s.headline}`),
        macroEvents: dataReleaseImplications.slice(0, 4).map((e) => `${e.currency} ${e.impact} ${e.title}: ${e.implication}`),
      };

      const aiRes = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Synthesize the following live cross-asset dataset, news headlines/rumors, stock flows, and macro events into a concise JSON object with keys: "headline" (1 crisp institutional sentence), "commentaryPoints" (array of 3 concise bullets covering US/Tech, IDX/Rupiah/Asia, and Yields/Commodities/Crypto), and "forwardPrediction" (2-sentence probabilistic market prediction referencing exact levels). Use ONLY facts from the data.\n\nDATA:\n${JSON.stringify(digestInput)}`,
        config: {
          responseMimeType: 'application/json',
        },
      });
      const rawTxt = (aiRes.text ?? '').trim();
      if (rawTxt) {
        const parsed = JSON.parse(rawTxt) as {
          headline?: string;
          commentaryPoints?: string[];
          forwardPrediction?: string;
        };
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
      // Retain deterministic live multi-source synthesis on Gemini failure/timeout
    }
  }

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
  if (heatmapCache.entry && heatmapCache.entry.expiresAt > now) {
    return heatmapCache.entry.data;
  }

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

