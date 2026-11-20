export type AppRoute = 'dashboard' | 'watchlist' | 'portfolio' | 'stocks' | 'heatmap' | 'news' | 'calendar' | 'extract';

export type ThemeMode = 'light' | 'dark' | 'monochrome';

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
  marketSessionOpen?: boolean;
  sessionStateLabel?: string;
  sessionProgressRatio?: number;
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
  isoDate?: string;
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

export type PortfolioAssetCategory = 'Equities' | 'Crypto' | 'Commodities' | 'Cash & FX';

export interface PortfolioGroup {
  id: string;
  name: string;
  displayCurrency: 'IDR' | 'USD';
  createdAt: string;
}

export interface PortfolioPurchaseLot {
  id: string;
  portfolioId: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  category: PortfolioAssetCategory;
  currency: 'USD' | 'IDR';
  units: number;
  remainingUnits: number;
  pricePerUnit: number;
  purchaseDateIso: string;
}

export interface PortfolioHolding {
  id: string;
  portfolioId: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  category: PortfolioAssetCategory;
  currency: 'USD' | 'IDR';
  units: number;
  avgCost: number;
  linkedAssetId?: string;
  createdAt: string;
}

export interface PortfolioTransaction {
  id: string;
  portfolioId: string;
  lotId?: string;
  symbol: string;
  yahooSymbol: string;
  name: string;
  type: 'BUY' | 'SELL';
  units: number;
  pricePerUnit: number;
  currency: 'USD' | 'IDR';
  dateIso: string;
  note?: string;
}

export interface PortfolioQuoteItem {
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

export interface PortfolioMoverItem {
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

export interface StockSearchResult {
  symbol: string;
  yahooSymbol: string;
  name: string;
  exchange: string;
  typeDisp: string;
  currency: 'USD' | 'IDR';
  category: PortfolioAssetCategory;
  isIndex?: boolean;
  assetId?: string;
  price?: number;
  prevClose?: number;
  changePercent?: number;
  sparklinePoints?: number[];
  sessionOpen?: boolean;
}

export type DailySummaryCategory = 'gainer' | 'loser' | 'event';

export interface DailyMarketHighlight {
  id: string;
  category: DailySummaryCategory;
  title: string;
  metricText: string;
  summaryText: string;
  metaText: string;
  symbol?: string;
  yahooSymbol?: string;
  assetId?: string;
  routeTarget?: AppRoute;
}

export interface DailyMarketSummaryResponse {
  windowLabel: string;
  dateLabel: string;
  updatedAt: string;
  highlights: DailyMarketHighlight[];
}

export type SignalTier = 'Strong Bull' | 'Bull Signal' | 'Neutral' | 'Bear Signal' | 'Strong Bear';

export interface MarketSignalInfo {
  tier: SignalTier;
  direction: 'bull' | 'bear' | 'neutral';
  score: number;
  shortLabel: string;
  reason: string;
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
  signalTier: SignalTier;
  beforeOpen: string;
  duringSession: string;
  afterClose: string;
  keyLevels: string;
}

export interface MarketIntelligenceResponse {
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

export type HeatmapMarketFilter = 'us' | 'indonesia' | 'all';

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

