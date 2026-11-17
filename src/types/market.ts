export type AppRoute = 'dashboard' | 'stocks' | 'news' | 'calendar';

export type Timeframe = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL';

export type WatchlistCategory =
  | 'us-indices'
  | 'asia-indices'
  | 'commodities-crypto'
  | 'forex-yields';

export interface MarketAsset {
  id: string;
  symbol: string;
  name: string;
  shortName: string;
  exchange: string;
  category: WatchlistCategory;
  categoryLabel: string;
  price: number;
  prevClose: number;
  changeValue: number;
  changePercent: number;
  currencyPrefix?: string;
  unitSuffix?: string;
  decimals: number;
  isYield?: boolean;
  isSnapshotTile?: boolean;
  open: string;
  dayHigh: string;
  dayLow: string;
  volume: string;
  avgVol: string;
  avgVolLabel?: string;
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
  chartSeries: Record<Timeframe, number[]>;
  chartTimestamps?: Partial<Record<Timeframe, number[]>>;
  liveStreamable?: boolean;
  updatedAtEpoch?: number;
}

export interface NewsStory {
  id: string;
  publisher: string;
  timeAgo: string;
  publishedAt?: string;
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

export interface EditorialInsight {
  id: string;
  sentiment: 'Bullish Macro' | 'Neutral Structuring' | 'Defensive Hedge';
  isPositive: boolean;
  desk: string;
  dateLabel: string;
  title: string;
  summary: string;
}

export interface EconomicEvent {
  id: string;
  timeWib: string;
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

export interface PortfolioPosition {
  id: string;
  symbol: string;
  name: string;
  category: 'Equities' | 'Crypto' | 'Commodities' | 'Cash & FX';
  units: number;
  avgCost: number;
  currentPrice: number;
  linkedAssetId?: string;
}

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'IDR' | 'SGD' | 'AUD';

export interface FxPairTile {
  pair: string;
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: string;
  changePercent: number;
  high: string;
  low: string;
}

export interface GroundedSource {
  title: string;
  uri: string;
}

export interface AiResearchResult {
  answer: string;
  sources: GroundedSource[];
  searchQueries: string[];
  model: string;
  generatedAt: string;
}

export interface SavedAiBrief {
  id: string;
  ownerId: string;
  query: string;
  assetSymbol?: string;
  answer: string;
  sources: GroundedSource[];
  createdAtLabel?: string;
}

export interface CalendarCatalyst {
  title: string;
  currency: string;
  timeWib: string;
  targetEpochMs: number;
  description: string;
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
