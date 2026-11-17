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
  w52Low: string;
  w52High: string;
  w52Pct: number;
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

const YAHOO_SYMBOL_CONFIG: {
  id: string;
  yahooSymbol: string;
  decimals: number;
  currencyPrefix?: string;
  unitSuffix?: string;
}[] = [
  { id: 'SPX', yahooSymbol: '^GSPC', decimals: 2 },
  { id: 'IXIC', yahooSymbol: '^IXIC', decimals: 2 },
  { id: 'DJI', yahooSymbol: '^DJI', decimals: 2 },
  { id: 'VIX', yahooSymbol: '^VIX', decimals: 2 },
  { id: 'IHSG', yahooSymbol: '^JKSE', decimals: 2 },
  { id: 'NIKKEI', yahooSymbol: '^N225', decimals: 2 },
  { id: 'HSI', yahooSymbol: '^HSI', decimals: 2 },
  { id: 'STI', yahooSymbol: '^STI', decimals: 2 },
  { id: 'XAUUSD', yahooSymbol: 'GC=F', decimals: 2, currencyPrefix: '$' },
  { id: 'WTI', yahooSymbol: 'CL=F', decimals: 2, currencyPrefix: '$' },
  { id: 'BRENT', yahooSymbol: 'BZ=F', decimals: 2, currencyPrefix: '$' },
  { id: 'BTCUSD', yahooSymbol: 'BTC-USD', decimals: 2, currencyPrefix: '$' },
  { id: 'ETHUSD', yahooSymbol: 'ETH-USD', decimals: 2, currencyPrefix: '$' },
  { id: 'USDIDR', yahooSymbol: 'IDR=X', decimals: 0 },
  { id: 'EURUSD', yahooSymbol: 'EURUSD=X', decimals: 4 },
  { id: 'DXY', yahooSymbol: 'DX-Y.NYB', decimals: 2 },
  { id: 'US10Y', yahooSymbol: '^TNX', decimals: 3, unitSuffix: '%' },
  { id: 'US30Y', yahooSymbol: '^TYX', decimals: 3, unitSuffix: '%' },
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

function formatVolume(vol: number | undefined): string {
  if (!vol || !Number.isFinite(vol) || vol <= 0) return 'N/A';
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
  return String(Math.round(vol));
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

  const results = await Promise.all(
    YAHOO_SYMBOL_CONFIG.map(async (cfg): Promise<LiveQuotePatch | null> => {
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
            validPairs.push({ t: typeof ts === 'number' ? ts * 1000 : Date.now(), v: Number(val.toFixed(cfg.decimals)) });
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
        const firstOpen = rawOpens.find((v): v is number => typeof v === 'number' && Number.isFinite(v));

        const dayHighNum = Number(meta.regularMarketDayHigh ?? Math.max(...closes));
        const dayLowNum = Number(meta.regularMarketDayLow ?? Math.min(...closes));
        const w52LowNum = Number(meta.fiftyTwoWeekLow ?? dayLowNum);
        const w52HighNum = Number(meta.fiftyTwoWeekHigh ?? dayHighNum);
        const w52Span = w52HighNum - w52LowNum || 1;
        const w52Pct = Math.max(
          2,
          Math.min(98, Math.round(((price - w52LowNum) / w52Span) * 100))
        );

        const vol = Number(meta.regularMarketVolume);
        const prefix = cfg.currencyPrefix ?? '';
        const suffix = cfg.unitSuffix ?? '';

        return {
          id: cfg.id,
          price: Number(price.toFixed(cfg.decimals)),
          prevClose: Number(prevClose.toFixed(cfg.decimals)),
          changeValue,
          changePercent,
          open: formatStatNumber(firstOpen ?? prevClose, cfg.decimals, prefix, suffix),
          dayHigh: formatStatNumber(dayHighNum, cfg.decimals, prefix, suffix),
          dayLow: formatStatNumber(dayLowNum, cfg.decimals, prefix, suffix),
          volume: formatVolume(vol),
          w52Low: formatStatNumber(w52LowNum, cfg.decimals, prefix, suffix),
          w52High: formatStatNumber(w52HighNum, cfg.decimals, prefix, suffix),
          w52Pct,
          sparklinePoints: samplePoints(closes, 10),
          chart1D: closes,
          timestamps1D: timestamps,
          updatedAtEpoch: Number(meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000,
        };
      } catch {
        return null;
      }
    })
  );

  const quotes = results.filter((q): q is LiveQuotePatch => q !== null);
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

function classifyTopic(text: string): {
  topic: 'rates' | 'idx' | 'commodities' | 'crypto';
  tags: string[];
} {
  const lower = text.toLowerCase();
  if (
    lower.includes('ihsg') ||
    lower.includes('jakarta') ||
    lower.includes('rupiah') ||
    lower.includes('indonesia') ||
    lower.includes('nikkei') ||
    lower.includes('asia') ||
    lower.includes('bank indonesia')
  ) {
    return { topic: 'idx', tags: ['Asia-Pacific', 'IDX / FX'] };
  }
  if (
    lower.includes('bitcoin') ||
    lower.includes('crypto') ||
    lower.includes('ethereum') ||
    lower.includes('btc') ||
    lower.includes('eth')
  ) {
    return { topic: 'crypto', tags: ['Bitcoin', 'Crypto Assets'] };
  }
  if (
    lower.includes('gold') ||
    lower.includes('oil') ||
    lower.includes('brent') ||
    lower.includes('crude') ||
    lower.includes('opec') ||
    lower.includes('commodity') ||
    lower.includes('silver')
  ) {
    return { topic: 'commodities', tags: ['Commodities', 'Energy & Metals'] };
  }
  return { topic: 'rates', tags: ['Equities', 'Macro & Rates'] };
}

function parseRssFeed(xml: string, publisher: string): (LiveNewsItem & { ts: number })[] {
  const items: (LiveNewsItem & { ts: number })[] = [];
  const matches = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  for (let i = 0; i < matches.length; i++) {
    const raw = matches[i];
    const headline = extractTag(raw, 'title');
    const summaryRaw = extractTag(raw, 'description');
    const link = extractTag(raw, 'link');
    const pubDate = extractTag(raw, 'pubDate');
    if (!headline) continue;

    const ts = Number.isFinite(Date.parse(pubDate)) ? Date.parse(pubDate) : Date.now() - i * 600_000;
    const summary = summaryRaw || headline;
    const { topic, tags } = classifyTopic(`${headline} ${summary}`);
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
        `Published ${publishedWib} WIB via ${publisher}. Open the verified dispatch link below for full institutional coverage and market quotes.`,
      ],
      url: link || undefined,
      ts,
    });
  }
  return items;
}

export async function fetchLiveNews(): Promise<{
  stories: LiveNewsItem[];
  updatedAt: string;
}> {
  const now = Date.now();
  if (newsCache.entry && newsCache.entry.expiresAt > now) {
    return newsCache.entry.data;
  }

  const [yahooUs, yahooAsia, cnbc] = await Promise.all([
    fetch(
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EIXIC,BTC-USD,GC=F,CL=F,%5ETNX&region=US&lang=en-US',
      { headers: UA_HEADERS, signal: AbortSignal.timeout(8000) }
    )
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
    fetch(
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EJKSE,IDR%3DX,%5EN225,%5EHSI&region=US&lang=en-US',
      { headers: UA_HEADERS, signal: AbortSignal.timeout(8000) }
    )
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
    fetch('https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
  ]);

  const combined = [
    ...parseRssFeed(cnbc, 'CNBC'),
    ...parseRssFeed(yahooUs, 'Yahoo Finance'),
    ...parseRssFeed(yahooAsia, 'Yahoo Finance Asia'),
  ];

  const seenTitles = new Set<string>();
  const deduped = combined
    .sort((a, b) => b.ts - a.ts)
    .filter((item) => {
      const key = item.headline.toLowerCase().slice(0, 70);
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    })
    .slice(0, 24)
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
