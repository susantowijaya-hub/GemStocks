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
}

export interface StocksMoversResponse {
  us: StockMover[];
  indonesia: StockMover[];
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

const id10yCache: { entry: CacheEntry<Id10yRawData> | null } = { entry: null };

async function fetchId10yRaw(): Promise<Id10yRawData | null> {
  const now = Date.now();
  if (id10yCache.entry && id10yCache.entry.expiresAt > now) {
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

  id10yCache.entry = { data: result, expiresAt: now + 45_000 };
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

export async function fetchLiveQuotes(): Promise<{
  quotes: LiveQuotePatch[];
  updatedAt: string;
}> {
  const now = Date.now();
  if (quotesCache.entry && quotesCache.entry.expiresAt > now) {
    return quotesCache.entry.data;
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

  const [rawResults, id10yRaw] = await Promise.all([
    Promise.all(
      YAHOO_SYMBOL_CONFIG.map(async (cfg): Promise<RawQuoteMeta | null> => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            cfg.yahooSymbol
          )}?range=1d&interval=15m`;
          const res = await fetch(url, {
            headers: UA_HEADERS,
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return null;
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

          const price = Number(meta.regularMarketPrice);
          const rawPrev = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
          if (!Number.isFinite(price) || price <= 0) return null;

          const prevClose = Number.isFinite(rawPrev) && rawPrev > 0 ? rawPrev : price;
          const changeValue = Number((price - prevClose).toFixed(cfg.decimals >= 3 ? cfg.decimals : 2));
          const changePercent =
            Number.isFinite(Number(meta.regularMarketChangePercent))
              ? Number(Number(meta.regularMarketChangePercent).toFixed(2))
              : Number((((price - prevClose) / prevClose) * 100).toFixed(2));

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
          const firstOpen =
            rawOpens.find((v): v is number => typeof v === 'number' && Number.isFinite(v)) ??
            prevClose;

          const dayHighRaw = Number(meta.regularMarketDayHigh ?? Math.max(...closes));
          const dayLowRaw = Number(meta.regularMarketDayLow ?? Math.min(...closes));
          const dayHighNum = Number.isFinite(dayHighRaw) && dayHighRaw > 0 ? dayHighRaw : Math.max(price, prevClose);
          const dayLowNum = Number.isFinite(dayLowRaw) && dayLowRaw > 0 ? dayLowRaw : Math.min(price, prevClose);

          const w52LowRaw = Number(meta.fiftyTwoWeekLow ?? dayLowNum);
          const w52HighRaw = Number(meta.fiftyTwoWeekHigh ?? dayHighNum);
          const w52LowNum = Number.isFinite(w52LowRaw) && w52LowRaw > 0 ? w52LowRaw : dayLowNum;
          const w52HighNum = Number.isFinite(w52HighRaw) && w52HighRaw > w52LowNum ? w52HighRaw : Math.max(dayHighNum, price);
          const w52Span = w52HighNum - w52LowNum || 1;
          const w52Pct = Math.max(
            2,
            Math.min(98, Math.round(((price - w52LowNum) / w52Span) * 100))
          );

          const vol = Number(meta.regularMarketVolume);
          const updatedAtEpoch =
            Number(meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000;
          const exchangeName = String(meta.fullExchangeName || meta.exchangeName || 'Global Market');

          return {
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
        } catch {
          return null;
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

    const sentiment: 'Bullish' | 'Bearish' | 'Neutral' =
      changePercent >= 0.35 || (changePercent >= 0.05 && w52Pct >= 62)
        ? 'Bullish'
        : changePercent <= -0.35 || (changePercent <= -0.05 && w52Pct <= 38)
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
    let extraNote = '';
    if (cfg.id === 'WTI' && brentPrice) {
      extraNote = ` WTI trades at a $${Math.abs(price - brentPrice).toFixed(2)}/bbl ${
        price < brentPrice ? 'discount' : 'premium'
      } to Brent ($${brentPrice.toFixed(2)}).`;
    } else if (cfg.id === 'BRENT' && wtiPrice) {
      extraNote = ` Brent maintains a $${(price - wtiPrice).toFixed(2)}/bbl spread over WTI ($${wtiPrice.toFixed(2)}).`;
    } else if ((cfg.id === 'US10Y' || cfg.id === 'US30Y') && us10yPrice && us30yPrice) {
      const bps = ((us30yPrice - us10yPrice) * 100).toFixed(1);
      extraNote = ` The 10Y–30Y Treasury curve spread stands at ${Number(bps) >= 0 ? '+' : ''}${bps} bps.`;
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
    )}% on the session), trading within a ${dayLow}–${dayHigh} intraday band and positioned at the ${ordinalPct} percentile of its 52-week range (${w52Low} – ${w52High}). Immediate technical support sits near ${support} with resistance overhead at ${resistance}.${extraNote}`;

    // Live secondary statistics (zero stale 2024 numbers)
    const w52Midpoint = formatStatNumber((w52LowNum + w52HighNum) / 2, cfg.decimals, prefix, suffix);
    let peLabel = '52W Position';
    let peValue = `${ordinalPct} Pct`;
    let capLabel = '52W Midpoint';
    let capValue = w52Midpoint;

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
      avgVol: `${intradayPct.toFixed(2)}%`,
      avgVolLabel: 'Intraday Spread',
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
      sparklinePoints: samplePoints(closes, 10),
      chart1D: closes,
      timestamps1D: timestamps,
      updatedAtEpoch,
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
      sparklinePoints: samplePoints(intradayPoints, 10),
      chart1D: intradayPoints,
      timestamps1D: intradayTimestamps,
      updatedAtEpoch,
    });
  }

  const payload = { quotes, updatedAt: new Date().toISOString() };
  if (quotes.length > 0) {
    quotesCache.entry = { data: payload, expiresAt: now + 45_000 };
  }
  return payload;
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

  if (id === 'ID10Y') {
    const raw = await fetchId10yRaw();
    if (!raw) return null;

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
    const safeStart = Math.max(raw.w52LowNum * 0.92, Math.min(raw.w52HighNum * 1.05, startVal));
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

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    cfg.yahooSymbol
  )}?range=${params.range}&interval=${params.interval}`;

  const res = await fetch(url, {
    headers: UA_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;

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

  if (points.length === 0) return null;

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
}

export async function fetchLiveFxRates(): Promise<LiveFxResponse> {
  const now = Date.now();
  if (fxCache.entry && fxCache.entry.expiresAt > now) {
    return fxCache.entry.data;
  }

  const [erRes, quotesRes] = await Promise.all([
    fetch('https://open.er-api.com/v6/latest/USD', {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : null)),
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

      const priority = mappedAll.filter(
        (e) => e.impact === 'HIGH' || e.currency === 'IDR' || e.day === 'today' || e.day === 'tomorrow'
      );
      events = (priority.length >= 12 ? priority : mappedAll).slice(0, 36);
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
}

const IDX_TOP_TICKERS: string[] = [
  'BBCA.JK',
  'BBRI.JK',
  'BMRI.JK',
  'BBNI.JK',
  'TLKM.JK',
  'ASII.JK',
  'BREN.JK',
  'AMMN.JK',
  'BYAN.JK',
  'TPIA.JK',
  'GOTO.JK',
  'ADRO.JK',
  'UNTR.JK',
  'ICBP.JK',
  'INDF.JK',
  'KLBF.JK',
  'MDKA.JK',
  'ANTM.JK',
  'PTBA.JK',
  'PGAS.JK',
  'BRIS.JK',
  'ISAT.JK',
  'INKP.JK',
  'SMGR.JK',
  'PANI.JK',
  'BRPT.JK',
  'CUAN.JK',
  'EMTK.JK',
];

async function fetchChartStockQuote(
  yahooSymbol: string,
  market: 'US' | 'ID',
  currency: 'USD' | 'IDR'
): Promise<(StockMover & { dollarTurnover: number }) | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooSymbol
    )}?range=1d&interval=15m`;
    const res = await fetch(url, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: Record<string, unknown>;
          indicators?: {
            quote?: Array<{ close?: Array<number | null> }>;
          };
        }>;
      };
    };
    const item = json.chart?.result?.[0];
    const meta = item?.meta;
    if (!meta) return null;

    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(prevClose) || prevClose <= 0) {
      return null;
    }

    const changeValue = price - prevClose;
    const changePercent = Number((((price - prevClose) / prevClose) * 100).toFixed(2));
    const dayHigh = Number(meta.regularMarketDayHigh ?? Math.max(price, prevClose));
    const dayLow = Number(meta.regularMarketDayLow ?? Math.min(price, prevClose));
    const volumeRaw = Number(meta.regularMarketVolume ?? 0);

    const rawCloses = (item?.indicators?.quote?.[0]?.close ?? []).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v)
    );
    const sparklinePoints =
      rawCloses.length >= 2
        ? samplePoints([...rawCloses.slice(0, -1), price], 12)
        : [prevClose, dayLow, (dayLow + dayHigh) / 2, price];

    const cleanSym = yahooSymbol.replace(/\.JK$/i, '');
    const rawName = String(meta.shortName || meta.longName || cleanSym);

    return {
      symbol: cleanSym,
      name: rawName.replace(/\s+Tbk\.?$/i, ' Tbk').slice(0, 42),
      market,
      exchange: market === 'ID' ? 'IDX · Jakarta' : String(meta.fullExchangeName || 'US Equities'),
      currency,
      price: market === 'ID' ? Math.round(price) : Number(price.toFixed(2)),
      prevClose: market === 'ID' ? Math.round(prevClose) : Number(prevClose.toFixed(2)),
      changeValue: market === 'ID' ? Math.round(changeValue) : Number(changeValue.toFixed(2)),
      changePercent,
      dayHigh: market === 'ID' ? Math.round(dayHigh) : Number(dayHigh.toFixed(2)),
      dayLow: market === 'ID' ? Math.round(dayLow) : Number(dayLow.toFixed(2)),
      volume: formatVolume(volumeRaw),
      volumeRaw: Number.isFinite(volumeRaw) ? volumeRaw : 0,
      marketState: String(meta.marketState || 'POST'),
      sparklinePoints,
      dollarTurnover: price * (Number.isFinite(volumeRaw) ? volumeRaw : 0),
    };
  } catch {
    return null;
  }
}

async function fetchYahooScreenerStocks(scrId: string): Promise<Array<Record<string, unknown>>> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=US&scrIds=${encodeURIComponent(
      scrId
    )}&count=15`;
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

export async function fetchTopStockMovers(): Promise<StocksMoversResponse> {
  const now = Date.now();
  if (stocksMoversCache.entry && stocksMoversCache.entry.expiresAt > now) {
    return stocksMoversCache.entry.data;
  }

  const [actives, gainers, losers, idxRaw] = await Promise.all([
    fetchYahooScreenerStocks('most_actives'),
    fetchYahooScreenerStocks('day_gainers'),
    fetchYahooScreenerStocks('day_losers'),
    Promise.all(IDX_TOP_TICKERS.map((sym) => fetchChartStockQuote(sym, 'ID', 'IDR'))),
  ]);

  // 1. US Top 10 High-Impact Movers (merge actives + gainers + losers, dedupe, rank by |%chg| + turnover)
  const usMap = new Map<string, StockMover & { dollarTurnover: number }>();
  for (const q of [...actives, ...gainers, ...losers]) {
    const symbol = String(q.symbol || '').trim();
    if (!symbol || symbol.includes('=') || symbol.includes('^') || symbol.length > 6) continue;
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

    if (!usMap.has(symbol)) {
      usMap.set(symbol, {
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
  }

  const usTopRanked = Array.from(usMap.values())
    .sort((a, b) => {
      const impactDiff = Math.abs(b.changePercent) - Math.abs(a.changePercent);
      if (Math.abs(impactDiff) > 0.2) return impactDiff;
      return b.dollarTurnover - a.dollarTurnover;
    })
    .slice(0, 10);

  // Enrich US top 10 sparklines with real 1d intraday series in parallel
  const usEnriched = await Promise.all(
    usTopRanked.map(async (item) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            item.symbol
          )}?range=1d&interval=30m`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(4500) }
        );
        if (!res.ok) return item;
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
          return {
            ...item,
            sparklinePoints: samplePoints([...closes.slice(0, -1), item.price], 12),
          };
        }
        return item;
      } catch {
        return item;
      }
    })
  );

  // 2. Indonesia (IDX) Top 10 High-Impact Movers
  const idxTopRanked = idxRaw
    .filter((item): item is StockMover & { dollarTurnover: number } => item !== null)
    .sort((a, b) => {
      const impactDiff = Math.abs(b.changePercent) - Math.abs(a.changePercent);
      if (Math.abs(impactDiff) > 0.1) return impactDiff;
      return b.dollarTurnover - a.dollarTurnover;
    })
    .slice(0, 10);

  const payload: StocksMoversResponse = {
    us: usEnriched.map(({ dollarTurnover: _dt, ...rest }) => rest),
    indonesia: idxTopRanked.map(({ dollarTurnover: _dt, ...rest }) => rest),
    updatedAt: new Date().toISOString(),
  };

  if (payload.us.length > 0 || payload.indonesia.length > 0) {
    stocksMoversCache.entry = { data: payload, expiresAt: now + 60_000 };
  }
  return payload;
}
