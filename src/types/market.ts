export type AppRoute = 'dashboard' | 'watchlist' | 'portfolio' | 'stocks' | 'heatmap' | 'news' | 'calendar' | 'ict';

export type ThemeMode = 'obsidian' | 'arctic' | 'parchment' | 'velvet';

export interface CandlePoint {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export type Timeframe =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '4h'
  | '1D'
  | '1W'
  | '1M'
  | '3M'
  | 'YTD'
  | '1Y'
  | 'ALL';

export type BandarmologyPhase =
  | 'Strong Accumulation'
  | 'Early Accumulation'
  | 'Neutral'
  | 'Early Distribution'
  | 'Strong Distribution';

export interface BandarmologyAnalysis {
  phase: BandarmologyPhase;
  score: number; // -100 (Strong Distribution) to +100 (Strong Accumulation)
  volumeRatio: number; // Current vs 20D average volume
  accumulationPressure: number; // Chaikin / money flow scaled 0..100
  foreignBias: 'Net Buy' | 'Net Sell' | 'Balanced';
  summary: string;
}

export type IctDirection = 'BUY' | 'SELL' | 'NEUTRAL';

export type IctExecutionPosture =
  | 'enter_now'
  | 'armed_limit'
  | 'limit_pullback_only'
  | 'standby'
  | 'invalidated'
  | 'missed';

export type IctRecommendedOrderType =
  | 'MARKET / ZONE FILL'
  | 'BUY LIMIT'
  | 'SELL LIMIT'
  | 'WAIT';

export interface SyncedRadarConfig {
  strategyMode: 'ict' | 'sdcv';
  timeframe: Timeframe;
  enforceVolatilityFilter: boolean;
  enforceNewsBlackout: boolean;
}

export type SurvivalModeStatus = 'NORMAL' | 'CAUTION' | 'LOCKDOWN';

export interface SurvivalRuleCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface SurvivalMetrics {
  mode: SurvivalModeStatus;
  consecutiveLosses: number;
  netR48h: number;
  wins: number;
  bes: number;
  losses: number;
  winRatePct: number | null;
  riskMultiplierLabel: string;
  minRrRequired: number;
  requireAPlusOnly: boolean;
  cooldownRemainingMin: number;
  cooldownUntil?: number;
  headline: string;
  rules: SurvivalRuleCheck[];
}

export type SignalBiasVerdict =
  | 'STRONG BUY'
  | 'BUY'
  | 'BULLISH LEAN (WAIT)'
  | 'NEUTRAL / RANGE'
  | 'BEARISH LEAN (WAIT)'
  | 'SELL'
  | 'STRONG SELL';

export interface SignalClearanceGate {
  id: string;
  label: string;
  passed: boolean;
  state: 'PASS' | 'WARN' | 'BLOCK';
  detail: string;
}

export interface IctSignalAnalysis {
  assetId: string;
  symbol: string;
  name: string;
  direction: IctDirection;
  biasLabel?: 'BULLISH' | 'BEARISH' | 'FLAT';
  biasVerdict?: SignalBiasVerdict;
  clearanceSummary?: string;
  clearanceGates?: SignalClearanceGate[];
  dxyConfluenceNote?: string;
  roundPoolNote?: string;
  confidence: number; // 0..100
  setupName: string;
  pdZone: 'Discount' | 'Equilibrium' | 'Premium';
  entryZone: string;
  stopLoss: string;
  targetPrice: string;
  riskReward: string;
  triggers: string[];
  timeframe: Timeframe;
  currentPrice: number;
  decimals: number;
  currencyPrefix?: string;
  unitSuffix?: string;
  evaluatedAt: number;
  htfBias?: 'Bullish' | 'Bearish' | 'Ranging';
  killzone?: string;
  invalidationNote?: string;
  liquidityTarget?: string;
  fvgZone?: string;
  obZone?: string;
  oteZone?: string;
  precisionScore?: number;
  scoreBreakdown?: {
    sweep: number;
    displacementMss: number;
    imbalanceFvgOb: number;
    oteFib: number;
    htfConfluence: number;
  };
  atrPct?: number;
  volatilityThresholdPct?: number;
  volatilityMaxPct?: number;
  volatilityStatus?: 'in-range' | 'too-low' | 'too-high' | 'warming';
  volatilityPassed?: boolean;
  atrSource?: '15m' | 'scaled' | 'warming';
  executionStatus?: 'active' | 'standby' | 'invalidated' | 'missed';
  projectedLevelsSummary?: string;
  assetClassLabel?: 'Crypto (BTC/USD)' | 'Commodities (XAU/USD)' | 'G10 FX';
  invalidationTrigger?: string;
  sessionLabel?: string;
  htfBiasDetail?: string;
  sweepMssStatus?: string;
  stopLossReason?: string;
  tp1?: string;
  tp2?: string;
  tp3?: string;
  tp1Label?: string;
  tp2Label?: string;
  tp3Label?: string;
  pyramidNote?: string;
  asianHigh?: number;
  asianLow?: number;
  asianRangeAtrRatio?: number;
  entryLowNum?: number;
  entryHighNum?: number;
  stopLossNum?: number;
  tp1Num?: number;
  tp2Num?: number;
  tp3Num?: number;
  isClosedCandleConfirmed?: boolean;
  candleStageLabel?: 'Confirmed Close' | 'Forming Preview' | 'Awaiting Real OHLC';
  newsBlackoutActive?: boolean;
  newsBlackoutReason?: string;
  isRealOhlc?: boolean;
  setupGrade?: 'A+' | 'A' | 'B' | 'WAIT';
  isAPlusSetup?: boolean;
  usdExposure?: 'LONG_USD' | 'SHORT_USD';
  executionPosture?: IctExecutionPosture;
  recommendedOrderType?: IctRecommendedOrderType;
  limitEntryPriceNum?: number;
  limitRr?: number;
  spotRr?: number;
  chaseProgressPct?: number;
  hasRunAway?: boolean;
  placementSummary?: string;
  survivalBlocked?: boolean;
  survivalNote?: string;
  // Phase 1 Institutional Upgrades: PO3 / Calendar Anchors, SMT Divergence, Liquidity Pools, Vol Regime & Net-of-Friction R:R
  midnightOpen?: number;
  ny0830Open?: number;
  pdh?: number;
  pdl?: number;
  po3Phase?: 'Accumulation' | 'Manipulation' | 'Distribution';
  po3Aligned?: boolean;
  po3Note?: string;
  smtStatus?: 'Bullish SMT' | 'Bearish SMT' | 'No Divergence' | 'Unavailable';
  smtPair?: string;
  smtDetail?: string;
  displacementRvol?: number;
  sweptPoolLabel?: string;
  volatilityRegime?: 'R1_COMPRESSION' | 'NORMAL' | 'R2_EXPANSION';
  atrBaselineRatio?: number;
  netRr?: number;
  frictionCost?: number;
  frictionLabel?: string;
  htfAligned?: boolean;
}

export interface SdCandleVolumeSignal {
  assetId: string;
  symbol: string;
  name: string;
  assetClassLabel: 'Crypto (BTC/USD)' | 'Commodities (XAU/USD)' | 'G10 FX';
  direction: IctDirection;
  biasLabel?: 'BULLISH' | 'BEARISH' | 'FLAT';
  biasVerdict?: SignalBiasVerdict;
  clearanceSummary?: string;
  clearanceGates?: SignalClearanceGate[];
  dxyConfluenceNote?: string;
  confidence: number;
  timeframe: Timeframe;
  currentPrice: number;
  decimals: number;
  currencyPrefix?: string;
  unitSuffix?: string;
  evaluatedAt: number;
  zoneBias: 'Demand' | 'Supply' | 'Mid-Range';
  zoneStatus: 'Fresh' | 'Tested 1x' | 'Mid-Range';
  sdPattern?: 'RBR' | 'DBR' | 'DBD' | 'RBD' | 'BASE';
  proximalLineNum?: number;
  distalLineNum?: number;
  htfCurvePct?: number;
  demandZone: string;
  supplyZone: string;
  candlePattern: string;
  candleTone: 'bull' | 'bear' | 'neutral';
  candleDetail: string;
  volumeRatio: number;
  volumeState: 'Expansion' | 'Above Avg' | 'Normal' | 'Dry / Low';
  volumeSource: 'Bar Volume (OHLCV)' | 'Relative Volume' | 'Tick-Range Effort';
  entryZone: string;
  stopLoss: string;
  tp1: string;
  tp2: string;
  riskReward: string;
  atr15mPct: number;
  volatilityMinPct: number;
  volatilityMaxPct: number;
  volatilityStatus: 'in-range' | 'too-low' | 'too-high' | 'warming';
  volatilityPassed: boolean;
  atrSource?: '15m' | 'scaled' | 'warming';
  executionStatus?: 'active' | 'standby' | 'invalidated' | 'missed';
  projectedLevelsSummary?: string;
  invalidationTrigger: string;
  actionSummary: string;
  triggers: string[];
  entryLowNum?: number;
  entryHighNum?: number;
  stopLossNum?: number;
  tp1Num?: number;
  tp2Num?: number;
  isClosedCandleConfirmed?: boolean;
  candleStageLabel?: 'Confirmed Close' | 'Forming Preview' | 'Awaiting Real OHLC';
  newsBlackoutActive?: boolean;
  newsBlackoutReason?: string;
  isRealOhlc?: boolean;
  setupGrade?: 'A+' | 'A' | 'B' | 'WAIT';
  isAPlusSetup?: boolean;
  usdExposure?: 'LONG_USD' | 'SHORT_USD';
  executionPosture?: IctExecutionPosture;
  recommendedOrderType?: IctRecommendedOrderType;
  limitEntryPriceNum?: number;
  limitRr?: number;
  spotRr?: number;
  chaseProgressPct?: number;
  hasRunAway?: boolean;
  placementSummary?: string;
  survivalBlocked?: boolean;
  survivalNote?: string;
  // Phase 1 Institutional Upgrades: PO3 / Calendar Anchors, SMT Divergence, Liquidity Pools, Vol Regime & Net-of-Friction R:R
  midnightOpen?: number;
  ny0830Open?: number;
  pdh?: number;
  pdl?: number;
  po3Phase?: 'Accumulation' | 'Manipulation' | 'Distribution';
  po3Aligned?: boolean;
  po3Note?: string;
  smtStatus?: 'Bullish SMT' | 'Bearish SMT' | 'No Divergence' | 'Unavailable';
  smtPair?: string;
  smtDetail?: string;
  displacementRvol?: number;
  sweptPoolLabel?: string;
  volatilityRegime?: 'R1_COMPRESSION' | 'NORMAL' | 'R2_EXPANSION';
  atrBaselineRatio?: number;
  netRr?: number;
  frictionCost?: number;
  frictionLabel?: string;
  htfAligned?: boolean;
}

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
  chartSeries: Partial<Record<Timeframe, number[]>> & { '1D': number[] };
  chartTimestamps?: Partial<Record<Timeframe, number[]>>;
  chartCandles?: Partial<Record<Timeframe, CandlePoint[]>>;
  liveStreamable?: boolean;
  updatedAtEpoch?: number;
  marketSessionOpen?: boolean;
  sessionStateLabel?: string;
  sessionProgressRatio?: number;
  fearGreed7d?: number[];
  move5mPct?: number;
  vol5mRangePct?: number;
  move5mSource?: 'server-5m' | 'intraday-1m' | 'closed';
}

export interface NewsStory {
  id: string;
  publisher: string;
  timeAgo: string;
  publishedAt?: string;
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

export interface EditorialInsight {
  id: string;
  sentiment: 'Bullish Macro' | 'Neutral Structuring' | 'Defensive Hedge';
  isPositive: boolean;
  desk: string;
  dateLabel: string;
  title: string;
  summary: string;
}

export type EconomicCalendarCurrency =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'AUD'
  | 'CAD'
  | 'CHF'
  | 'NZD'
  | 'CNY'
  | 'IDR';

export type EconomicCalendarImpact = 'HIGH' | 'MED' | 'LOW' | 'HOLIDAY';

export type CalendarRangePreset = 'this_week' | 'next_week' | 'this_month' | 'next_month' | 'custom';

export interface EconomicEvent {
  id: string;
  timeWib: string;
  isoDate?: string;
  dateGroupLabel?: string;
  day: 'today' | 'tomorrow' | 'week';
  currency: EconomicCalendarCurrency;
  impact: EconomicCalendarImpact;
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

export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'CHF'
  | 'CAD'
  | 'AUD'
  | 'NZD'
  | 'CNY'
  | 'SGD'
  | 'IDR';

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

export type StockExecutionAction = 'BUY' | 'SELL' | 'WAIT';

export interface StockTradePlan {
  action: StockExecutionAction;
  conviction: number; // 0..100
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
  verdictLabel?:
    | 'BUY NOW (ACCUMULATION)'
    | 'BUY AT DEMAND'
    | 'BREAKOUT BUY'
    | 'WAIT PULLBACK'
    | 'AVOID / SELL'
    | 'WATCH';
  scannerScore?: number; // 0..100 composite buy readiness score
  buyReasons?: string[];
  cautionNote?: string;
  dataValidity?: 'verified' | 'partial' | 'invalid';
  dataValidityNote?: string;
  setupGrade?: 'A+' | 'A' | 'B' | 'WATCH';
  atrPct?: number;
  extensionPct?: number;
  positionSizeNote?: string;
  invalidationRule?: string;
  gatesPassed?: number;
  gatesTotal?: number;
  // Stocks Phase 1: Stage 2 / Minervini 8-Point Trend Template, Benchmark RS Rank, True 14D ATR/ADR, 20D ADTV & ARA/ARB Guard
  stage?: 'Stage 1 Base' | 'Stage 2 Advancing' | 'Stage 3 Topping' | 'Stage 4 Declining';
  minerviniPassedCount?: number;
  minerviniTotalCount?: number;
  trendTemplateSummary?: string;
  rsRank?: number; // 1..99 cross-sectional & benchmark-relative strength rank
  rsVsBenchPct?: number; // excess return vs IHSG or SPX
  atr14Pct?: number; // true 14-day Wilder ATR %
  adr20Pct?: number; // 20-day Average Daily Range %
  w52HighDistPct?: number; // % below 52W high (0 = at high, -20 = 20% below)
  w52LowGainPct?: number; // % above 52W low
  adtv20d?: number; // 20-day Average Daily Traded Value (native currency)
  adtvLabel?: string;
  adtvPassed?: boolean;
  araArbBlocked?: boolean;
  araArbGuardNote?: string;
  // Stocks Phase 2: Macro Regime Throttle, VCP Tightness & Volume Dry-Up, Multi-Day Accumulation Persistence
  macroRegimeThrottled?: boolean;
  macroRegimeNote?: string;
  vcpDetected?: boolean;
  vcpContractionPct?: number; // latest swing contraction depth %
  vcpDryUpRatio?: number; // pre-breakout 5d vol / 20d vol
  vcpSummary?: string;
  accPersistence5d?: number; // 0..5 positive institutional accumulation sessions in last 5 days
  // Stocks Phase 3: Hybrid Runner Trailing MA Exit, Episodic Pivot Catalyst & Sector Leadership
  ema10Num?: number;
  sma50Num?: number;
  sma150Num?: number;
  sma200Num?: number;
  trailingExitNote?: string;
  episodicPivot?: boolean;
  epNote?: string;
  sector?: string;
  sectorRank?: number;
  isTopSector?: boolean;
}

export interface StockDeskSurvivalStatus {
  mode: 'NORMAL' | 'CAUTION' | 'DEFENSIVE';
  riskPerTradePct: number;
  maxConcurrentPositions: number;
  minConvictionRequired: number;
  breadthPct: number;
  idxRegime: 'Bullish' | 'Neutral' | 'Defensive';
  usRegime: 'Bullish' | 'Neutral' | 'Defensive';
  ledgerWinRatePct: number | null;
  consecutiveLosses: number;
  netR: number;
  verifiedDataCount: number;
  filteredOutCount: number;
  headline: string;
  rules: Array<{
    id: string;
    label: string;
    passed: boolean;
    detail: string;
  }>;
}

export interface ChartTradeOverlays {
  symbolLabel?: string;
  direction?: 'BUY' | 'SELL' | 'WAIT';
  entryLow?: number;
  entryHigh?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  demandLow?: number;
  demandHigh?: number;
  supplyLow?: number;
  supplyHigh?: number;
  asianHigh?: number;
  asianLow?: number;
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
  sector?: string;
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

export type PortfolioAssetCategory = 'Equities' | 'Crypto' | 'Commodities' | 'Cash & FX';

export interface PortfolioGroup {
  id: string;
  name: string;
  displayCurrency: CurrencyCode;
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
  bandarmology?: BandarmologyAnalysis;
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

export type FearGreedZone =
  | 'Extreme Fear'
  | 'Fear'
  | 'Neutral'
  | 'Greed'
  | 'Extreme Greed';

export interface FearGreedInfo {
  score: number;
  zone: FearGreedZone;
  shortLabel: string;
  driver: string;
  history7d: number[];
  components: {
    momentum: number;
    intradayStrength: number;
    range52w: number;
  };
}

export interface VolatilityFearGreedInfo {
  score: number;
  zone: FearGreedZone;
  shortLabel: string;
  volRegime: 'Compressed' | 'Normal' | 'Elevated' | 'Panic';
  avg5mRangePct: number;
  dispersionSigma: number;
  intradayRangePct: number;
  downsideSkewPct: number;
  safeHavenBidScore: number;
  driver: string;
  history7d: number[];
}

export interface PriceAlertItem {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  direction: 'surge' | 'drop';
  movePercent: number;
  windowMinutes: number;
  fromPrice: number;
  toPrice: number;
  decimals: number;
  currencyPrefix?: string;
  unitSuffix?: string;
  triggeredAt: number;
  read: boolean;
  alertKind?: 'volatility' | 'ict' | 'bandarmology';
  ictStrategy?: 'ict' | 'sdcv';
  ictAction?: 'BUY' | 'SELL' | 'WAIT';
  ictSetup?: string;
  entryZone?: string;
  stopLoss?: string;
  targetPrice?: string;
  ictTimeframe?: Timeframe;
  confidence?: number;
  outcomeStatus?: 'pending' | 'win' | 'be' | 'loss';
  autoGraded?: boolean;
  outcomeGradedAt?: number;
  entryLowNum?: number;
  entryHighNum?: number;
  stopLossNum?: number;
  tp1Num?: number;
  tp2Num?: number;
  ictStage?: 'armed' | 'triggered' | 'pullback_limit';
  fillStatus?: 'filled' | 'awaiting_fill' | 'expired_unfilled';
  filledAt?: number;
  recommendedOrderType?: IctRecommendedOrderType;
  limitEntryPriceNum?: number;
  bandarFromPhase?: BandarmologyPhase;
  bandarToPhase?: BandarmologyPhase;
  bandarScore?: number;
  bandarVolumeRatio?: number;
  bandarAccPressure?: number;
  bandarForeignBias?: 'Net Buy' | 'Net Sell' | 'Balanced';
}

export interface Asset5mVolatility {
  assetId: string;
  pct5m: number;
  range5mPct: number;
  marketMean5m: number;
  medianBaseline5m: number;
  relDevPct: number;
  zScore: number;
  isSessionOpen: boolean;
  sampleSource: 'live-5m' | 'server-5m' | 'intraday-1m' | 'closed';
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

export interface UnifiedCatalystDriver {
  id: string;
  kind: 'FLOW' | 'WIRE' | 'MACRO';
  tag: string;
  title: string;
  implication: string;
  tone: 'bull' | 'bear' | 'neutral';
  routeTarget: AppRoute;
}

export interface UnifiedMarketSynthesis {
  regimeTag:
    | 'Risk-On Expansion'
    | 'Selective Rotation'
    | 'Macro Event Caution'
    | 'Defensive De-Risking';
  convictionPct: number;
  executiveThesis: string;
  catalysts: UnifiedCatalystDriver[];
  scenarios: {
    horizonLabel: string;
    bullTrigger: string;
    bullTarget: string;
    baseCase: string;
    bearTrigger: string;
    bearTarget: string;
  };
  macroPillars?: Array<{
    id: string;
    label: string;
    symbol: string;
    valueText: string;
    changePct: number;
    role: string;
    bias: 'bull' | 'bear' | 'neutral';
  }>;
  divergences?: string[];
  invalidationLevel?: string;
  tacticalPosture?: {
    riskBudget: string;
    favoredLongs: string;
    favoredHedges: string;
    eventRiskNote: string;
  };
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
  sessionConditionAndTrigger?: string;
  oneSentenceSummary?: string;
  unifiedSynthesis?: UnifiedMarketSynthesis;
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

export type PriorityStreamStatus = 'ws-live' | 'reconnecting' | 'http-fallback';

export type ProviderHealthStatus = 'live' | 'failover' | 'cached' | 'offline';

export interface ProviderFeedDiagnostic {
  id: 'coinbase' | 'yahoo_macro' | 'idx_proxy' | 'fx_rates' | 'news_cal';
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

export interface ClientFeedTransportDiagnostics {
  quotesRttMs: number | null;
  wsConnected: boolean;
  wsTimedOut?: boolean;
  cachedFallbackActive?: boolean;
  lastWsTickAt: number | null;
  wsFresh: boolean;
  usingBootstrapCache: boolean;
  bootstrapSavedAt: number | null;
  activeBackoffs: Array<{ endpoint: string; failures: number; retryInSec: number }>;
  lastQuotesAt: number | null;
}

export interface DailyDigestMoverImpact {
  symbol: string;
  yahooSymbol?: string;
  name: string;
  market: string;
  movePercent: string;
  direction: 'up' | 'down' | 'flat';
  associatedHeadline: string;
  impactAnalysis: string;
}

export interface DailyDigestResponse {
  sessionHeadline: string;
  marketMood: string;
  executiveBrief: string;
  topicLabel: string;
  moverImpacts: DailyDigestMoverImpact[];
  sessionWatchpoints: string[];
  model: string;
  generatedAt: string;
}

export type RiskRegimeStatus =
  | 'Strong Risk-On'
  | 'Risk-On'
  | 'Neutral'
  | 'Risk-Off'
  | 'Strong Risk-Off';

export interface RiskRegimeSectorBreakdown {
  id: string;
  label: string;
  weightPct: number;
  avgMovePct: number;
  weightedContributionPct: number;
  stance: 'Risk-On' | 'Neutral' | 'Risk-Off';
}

export interface RiskRegimeInfo {
  status: RiskRegimeStatus;
  polarity: 'risk-on' | 'neutral' | 'risk-off';
  score: number; // 0 (Strong Risk-Off) to 100 (Strong Risk-On)
  weightedMovePct: number;
  advancingSectors: number;
  totalSectors: number;
  driver: string;
  sectors: RiskRegimeSectorBreakdown[];
}

export interface OverallMarketFearGreed {
  score: number;
  zone: FearGreedZone;
  shortLabel: string;
  history7d: number[];
  delta1d: number;
  greedCount: number;
  neutralCount: number;
  fearCount: number;
  totalAssets: number;
  driver: string;
  sectors: Array<{
    id: string;
    label: string;
    score: number;
    zone: FearGreedZone;
  }>;
}

export interface UnifiedMarketPulse {
  compositeScore: number; // 0..100 composite sentiment
  stanceLabel: RiskRegimeStatus;
  polarity: 'risk-on' | 'neutral' | 'risk-off';
  fearGreedScore: number; // 0..100 blended volatility + cross-asset Fear & Greed
  fearGreedZone: FearGreedZone;
  driver: string;
  riskRegime: RiskRegimeInfo;
  volatilityFearGreed: VolatilityFearGreedInfo;
  overallFearGreed: OverallMarketFearGreed;
  activeSignal: MarketSignalInfo;
  activeFearGreed: FearGreedInfo;
}

export type SignalHistoryStatus =
  | 'PENDING_LIMIT'
  | 'RUNNING'
  | 'TP1_HIT'
  | 'TP2_HIT'
  | 'SL_HIT'
  | 'BE_CLOSED'
  | 'EXPIRED';

export type SignalSourceEngine =
  | 'idx_scanner'
  | 'us_scanner'
  | 'ict_radar'
  | 'sdcv_radar';

export type SignalAssetClass = 'stock_id' | 'stock_us' | 'crypto' | 'commodity';

export type SignalUserOutcome = 'WIN' | 'LOSS' | 'BE' | 'SKIPPED';

export type SignalStrategyKey = 'ict_2022' | 'sdcv_canonical' | 'idx_bandar' | 'us_swing';

export type SignalIndexedOutcome = 'PENDING' | 'RUNNING' | 'WIN' | 'LOSS' | 'BE' | 'EXPIRED';

export type SignalExecutionPostureTag = 'enter_now' | 'armed_limit' | 'limit_pullback_only';

export type SignalVerificationStatus = 'Pending' | 'Verified' | 'Expired';

export type SignalBarrierOutcome =
  | 'UPPER_TP'
  | 'LOWER_SL'
  | 'TIME_BARRIER'
  | 'BREAK_EVEN'
  | 'OPEN';

export interface SignalHistoryRecord {
  id: string;
  ownerId: string;
  lockKey: string;
  assetClass: SignalAssetClass;
  sourceEngine: SignalSourceEngine;
  symbol: string;
  assetId: string;
  name: string;
  currency: 'USD' | 'IDR';
  decimals: number;
  timeframe: string;
  direction: 'BUY' | 'SELL';
  strategyTag: string;
  strategy?: SignalStrategyKey;
  outcome?: SignalIndexedOutcome;
  timestamp?: number;
  confidence: number;
  firstShownPrice: number;
  entryPrice: number;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  riskReward: string;
  status: SignalHistoryStatus;
  filledOnFirstSight: boolean;
  executionPosture?: SignalExecutionPostureTag;
  zoneFillVerified?: boolean;
  verificationStatus?: SignalVerificationStatus;
  verifiedAtMs?: number;
  userOutcome?: SignalUserOutcome;
  journalNote?: string;
  journaledAtMs?: number;
  createdAtMs: number;
  filledAtMs?: number;
  tp1HitAtMs?: number;
  closedAtMs?: number;
  closedPrice?: number;
  lastPrice: number;
  maxFavorablePrice: number;
  maxAdversePrice: number;
  pnlPct: number;
  rMultiple: number;
  lastCheckedAtMs: number;
  // Phase 2 Triple-Barrier & Meta-Labeling Feature Tags
  mfeR?: number;
  maeR?: number;
  barrierOutcome?: SignalBarrierOutcome;
  timeBarrierAtMs?: number;
  inKillzone?: boolean;
  po3Aligned?: boolean;
  smtConfirmed?: boolean;
  volatilityRegime?: 'R1_COMPRESSION' | 'NORMAL' | 'R2_EXPANSION';
  htfAligned?: boolean;
  netRr?: number;
  // Stocks Phase 3 Institutional Meta-Labeling Feature Tags
  stage2Aligned?: boolean;
  rsRank?: number;
  vcpDetected?: boolean;
  sectorLeader?: boolean;
}
