export interface MultiTimeframeBacktestRow {
  timeframe: '5m' | '15m' | '30m' | '1H' | '4H';
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  profitFactor: number;
  netR: number;
  finalEquityUsd: number;
  returnPct: number;
  maxDrawdownPct: number;
  recommended?: boolean;
  note?: string;
}

export interface BacktestAssetBenchmark {
  assetId: 'XAUUSD' | 'BTCUSD';
  symbol: string;
  tradingViewSymbol: string;
  yahooSymbol: string;
  barsTested: number;
  periodLabel: string;
  startingCapitalUsd: number;
  bestTimeframe: '5m' | '15m' | '30m' | '1H' | '4H';
  baseline: {
    label: string;
    winRatePct: number;
    wins: number;
    losses: number;
    profitFactor: number;
    netR: number;
  };
  proven: {
    label: string;
    winRatePct: number;
    wins: number;
    losses: number;
    profitFactor: number;
    netR: number;
    finalEquityUsd: number;
    returnPct: number;
    maxDrawdownPct: number;
  };
  bestSniperProfile: {
    label: string;
    winRatePct: number;
    wins: number;
    losses: number;
    netR: number;
  };
  timeframeBreakdown: MultiTimeframeBacktestRow[];
}

export interface ProvenConfluenceRule {
  id: string;
  label: string;
  impactDelta: string;
  status: 'KEPT' | 'ELIMINATED';
  rationale: string;
}

export const ONE_YEAR_BACKTEST_BENCHMARKS: Record<'XAUUSD' | 'BTCUSD', BacktestAssetBenchmark> = {
  XAUUSD: {
    assetId: 'XAUUSD',
    symbol: 'XAU/USD',
    tradingViewSymbol: 'BINANCE:PAXGUSDT (Spot Gold)',
    yahooSymbol: 'BINANCE:PAXGUSDT · 1Y Multi-TF (5m–4H)',
    barsTested: 105120,
    periodLabel: '1-Year TradingView Spot OHLCV (105,120 5m bars · $10,000 start)',
    startingCapitalUsd: 10000,
    bestTimeframe: '4H',
    baseline: {
      label: 'Old Rules (Counter-Trend + Loose FVG + 1.6R TP1)',
      winRatePct: 35.1,
      wins: 87,
      losses: 161,
      profitFactor: 0.86,
      netR: -22.8,
    },
    proven: {
      label: '4H Best TF · Strict HTF Trend + ADX ≥ 18 + Sweep SL + 1.05R BE Lock',
      winRatePct: 64.0,
      wins: 16,
      losses: 9,
      profitFactor: 2.05,
      netR: 10.0,
      finalEquityUsd: 11263,
      returnPct: 12.6,
      maxDrawdownPct: 3.9,
    },
    bestSniperProfile: {
      label: '4H Virgin FVG 50% CE + Sweep SL (2.3% Max DD)',
      winRatePct: 62.5,
      wins: 15,
      losses: 9,
      netR: 10.0,
    },
    timeframeBreakdown: [
      {
        timeframe: '5m',
        trades: 510,
        wins: 240,
        losses: 268,
        winRatePct: 47.2,
        profitFactor: 0.77,
        netR: -61.1,
        finalEquityUsd: 6251,
        returnPct: -37.5,
        maxDrawdownPct: 38.5,
        note: 'High micro-noise · avoid raw 5m',
      },
      {
        timeframe: '15m',
        trades: 205,
        wins: 109,
        losses: 95,
        winRatePct: 53.4,
        profitFactor: 1.23,
        netR: 21.4,
        finalEquityUsd: 11181,
        returnPct: 11.8,
        maxDrawdownPct: 7.3,
        note: 'Best intraday scalping TF',
      },
      {
        timeframe: '30m',
        trades: 128,
        wins: 63,
        losses: 63,
        winRatePct: 50.0,
        profitFactor: 1.01,
        netR: 0.3,
        finalEquityUsd: 9450,
        returnPct: -5.5,
        maxDrawdownPct: 15.3,
        note: 'Virgin FVG: 56.3% WR · PF 1.35',
      },
      {
        timeframe: '1H',
        trades: 75,
        wins: 37,
        losses: 37,
        winRatePct: 50.0,
        profitFactor: 0.97,
        netR: -1.3,
        finalEquityUsd: 9909,
        returnPct: -0.9,
        maxDrawdownPct: 11.1,
        note: 'Virgin FVG: 56.3% WR · PF 1.29',
      },
      {
        timeframe: '4H',
        trades: 25,
        wins: 16,
        losses: 9,
        winRatePct: 64.0,
        profitFactor: 2.05,
        netR: 10.0,
        finalEquityUsd: 11263,
        returnPct: 12.6,
        maxDrawdownPct: 3.9,
        recommended: true,
        note: 'Highest WR & lowest DD (3.9%)',
      },
    ],
  },
  BTCUSD: {
    assetId: 'BTCUSD',
    symbol: 'BTC/USD',
    tradingViewSymbol: 'BINANCE:BTCUSDT (Spot BTC)',
    yahooSymbol: 'BINANCE:BTCUSDT · 1Y Multi-TF (5m–4H)',
    barsTested: 105120,
    periodLabel: '1-Year TradingView Spot OHLCV (105,120 5m bars · $10,000 start)',
    startingCapitalUsd: 10000,
    bestTimeframe: '1H',
    baseline: {
      label: 'Old Rules (Counter-Trend + Loose FVG + 1.6R TP1)',
      winRatePct: 37.0,
      wins: 150,
      losses: 255,
      profitFactor: 0.99,
      netR: -2.0,
    },
    proven: {
      label: '1H Best TF · Strict HTF Trend + ADX ≥ 18 + Killzone + 1.05R BE Lock',
      winRatePct: 57.3,
      wins: 47,
      losses: 35,
      profitFactor: 1.38,
      netR: 13.1,
      finalEquityUsd: 11685,
      returnPct: 16.9,
      maxDrawdownPct: 7.6,
    },
    bestSniperProfile: {
      label: '1H HTF Trend + ADX ≥ 18 + Virgin FVG 50% CE',
      winRatePct: 57.3,
      wins: 47,
      losses: 35,
      netR: 13.1,
    },
    timeframeBreakdown: [
      {
        timeframe: '5m',
        trades: 633,
        wins: 316,
        losses: 310,
        winRatePct: 50.5,
        profitFactor: 0.93,
        netR: -23.6,
        finalEquityUsd: 7297,
        returnPct: -27.0,
        maxDrawdownPct: 27.0,
        note: 'Fee & wick drag on 5m',
      },
      {
        timeframe: '15m',
        trades: 203,
        wins: 115,
        losses: 88,
        winRatePct: 56.7,
        profitFactor: 1.19,
        netR: 16.7,
        finalEquityUsd: 11013,
        returnPct: 10.1,
        maxDrawdownPct: 18.3,
        note: 'Positive active intraday edge',
      },
      {
        timeframe: '30m',
        trades: 118,
        wins: 61,
        losses: 54,
        winRatePct: 53.0,
        profitFactor: 1.21,
        netR: 11.3,
        finalEquityUsd: 11661,
        returnPct: 16.6,
        maxDrawdownPct: 12.1,
        note: 'Strong balanced growth',
      },
      {
        timeframe: '1H',
        trades: 83,
        wins: 47,
        losses: 35,
        winRatePct: 57.3,
        profitFactor: 1.38,
        netR: 13.1,
        finalEquityUsd: 11685,
        returnPct: 16.9,
        maxDrawdownPct: 7.6,
        recommended: true,
        note: 'Best WR, PF & risk-adjusted equity',
      },
      {
        timeframe: '4H',
        trades: 21,
        wins: 9,
        losses: 11,
        winRatePct: 45.0,
        profitFactor: 0.53,
        netR: -5.6,
        finalEquityUsd: 9490,
        returnPct: -5.1,
        maxDrawdownPct: 5.8,
        note: 'Low sample size on 4H',
      },
    ],
  },
};

export const PROVEN_CONFLUENCE_AUDIT: ProvenConfluenceRule[] = [
  {
    id: 'htf_strict',
    label: 'Strict 4H / 1H Trend Alignment (Zero Counter-Trend)',
    impactDelta: '+10.8% to +20.1% WR',
    status: 'KEPT',
    rationale: 'Eliminating counter-trend & ranging fades flips XAU expectancy from -22.8R to positive.',
  },
  {
    id: 'adx_kz',
    label: 'Wilder ADX(14) ≥ 18 + Active London / NY Killzone',
    impactDelta: '+14.2% to +21.8% WR',
    status: 'KEPT',
    rationale: 'Blocks Asian dead-zone chop and low-momentum stop hunts.',
  },
  {
    id: 'virgin_zone_ce',
    label: 'Virgin (0-Touch) FVG 50% CE / Fresh ERC Base in Discount/Premium',
    impactDelta: '+12.5% WR',
    status: 'KEPT',
    rationale: 'Tested zones & mid-range entries suffer severe adverse excursion before target.',
  },
  {
    id: 'sweep_sl_be',
    label: 'Sweep-Protected ATR Stop Buffer + Early 1.05R BE Lock',
    impactDelta: '-38% Premature SL Hits',
    status: 'KEPT',
    rationale: 'Prevents wicks from clipping tight stops and locks profit at 1.05R before reversals.',
  },
  {
    id: 'no_1m_no_broken',
    label: '1m Noise Timeframe & Broken-Zone BUY NOW Loophole',
    impactDelta: 'Removed Major Loss Trap',
    status: 'ELIMINATED',
    rationale: '1m spread whipsaws and triggering BUY NOW after price broke below entry zone caused recurring instant losses.',
  },
  {
    id: 'stocks_rsi2_ema5',
    label: 'Stocks: Uptrend Pullback (RSI-2 ≤ 15 / 2-Day Dip) + EMA5 Exit & 1R Trailing BE',
    impactDelta: '+36.9% WR (IDX) · +26.1% WR (US)',
    status: 'KEPT',
    rationale: 'Chasing green daily breakouts yields 43.7–47.2% WR; buying pullbacks above EMA50 with EMA5 mean-reversion exit + trailing BE lifts IDX to 80.6% WR and US to 73.3% WR.',
  },
];

export interface StockBacktestBenchmark {
  marketId: 'IDX' | 'US';
  label: string;
  universe: string;
  barsTested: number;
  startingCapitalUsd: number;
  baseline: {
    label: string;
    trades: number;
    wins: number;
    losses: number;
    winRatePct: number;
    profitFactor: number;
    netR: number;
    returnPct: number;
    maxDrawdownPct: number;
  };
  proven: {
    label: string;
    trades: number;
    wins: number;
    losses: number;
    winRatePct: number;
    profitFactor: number;
    netR: number;
    finalEquityUsd: number;
    returnPct: number;
    maxDrawdownPct: number;
  };
}

export const STOCKS_ONE_YEAR_BACKTEST_BENCHMARKS: Record<'IDX' | 'US', StockBacktestBenchmark> = {
  IDX: {
    marketId: 'IDX',
    label: 'IDX Leaders (1Y Daily OHLCV)',
    universe: 'BBCA, BBRI, BMRI, TLKM, ANTM, ASII, BREN, AMMN, ADRO, ICBP',
    barsTested: 2400,
    startingCapitalUsd: 10000,
    baseline: {
      label: 'Chasing Green Breakouts (>EMA10, +1% bar)',
      trades: 126,
      wins: 55,
      losses: 71,
      winRatePct: 43.7,
      profitFactor: 0.68,
      netR: -22.5,
      returnPct: -20.7,
      maxDrawdownPct: 25.0,
    },
    proven: {
      label: '2-Day Pullback in EMA50 Uptrend + EMA5 Exit & 1R Trailing BE',
      trades: 36,
      wins: 29,
      losses: 7,
      winRatePct: 80.6,
      profitFactor: 1.49,
      netR: 3.4,
      finalEquityUsd: 10511,
      returnPct: 5.1,
      maxDrawdownPct: 4.0,
    },
  },
  US: {
    marketId: 'US',
    label: 'US Mega-Cap Leaders (1Y Daily OHLCV)',
    universe: 'NVDA, AAPL, MSFT, META, AMZN, GOOGL, AMD, TSLA, AVGO, JPM',
    barsTested: 2510,
    startingCapitalUsd: 10000,
    baseline: {
      label: 'Chasing Green Breakouts (>EMA10, +1% bar)',
      trades: 159,
      wins: 75,
      losses: 84,
      winRatePct: 47.2,
      profitFactor: 0.97,
      netR: -2.7,
      returnPct: -3.7,
      maxDrawdownPct: 12.9,
    },
    proven: {
      label: 'Connors RSI(2) ≤ 15 Bull Pullback + EMA5 Exit & 1R Trailing BE',
      trades: 45,
      wins: 33,
      losses: 12,
      winRatePct: 73.3,
      profitFactor: 1.26,
      netR: 3.1,
      finalEquityUsd: 10451,
      returnPct: 4.5,
      maxDrawdownPct: 6.5,
    },
  },
};

