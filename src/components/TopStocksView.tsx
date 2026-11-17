import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, BarChart3, Clock, RefreshCw } from 'lucide-react';
import { StockMover } from '../types/market';
import { getAllMarketSessions, MarketSessionStatus } from '../utils/marketSessions';

interface TopStocksViewProps {
  usMovers: StockMover[];
  idxMovers: StockMover[];
  stocksUpdatedAt: string | null;
  searchQuery: string;
  onRefresh: () => void;
}

type MarketFilter = 'all' | 'us' | 'id';
type DirectionFilter = 'impact' | 'gainers' | 'losers';

function formatStockPrice(stock: StockMover): string {
  if (stock.currency === 'IDR') {
    return `Rp ${Math.round(stock.price).toLocaleString('en-US')}`;
  }
  return `$${stock.price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatStockDelta(stock: StockMover): string {
  const sign = stock.changeValue >= 0 ? '+' : '-';
  const absVal = Math.abs(stock.changeValue);
  if (stock.currency === 'IDR') {
    return `${sign}Rp ${Math.round(absVal).toLocaleString('en-US')}`;
  }
  return `${sign}$${absVal.toFixed(2)}`;
}

function formatStockRange(stock: StockMover): string {
  if (stock.currency === 'IDR') {
    return `${Math.round(stock.dayLow).toLocaleString('en-US')} – ${Math.round(
      stock.dayHigh
    ).toLocaleString('en-US')}`;
  }
  return `$${stock.dayLow.toFixed(2)} – $${stock.dayHigh.toFixed(2)}`;
}

function SparklineMini({ points, isGain }: { points: number[]; isGain: boolean }) {
  const path = useMemo(() => {
    const safePts = points.length >= 2 ? points : [1, 1];
    const w = 68;
    const h = 22;
    const min = Math.min(...safePts);
    const max = Math.max(...safePts);
    const span = max - min || 1;
    return safePts
      .map((val, idx) => {
        const x = (idx / Math.max(safePts.length - 1, 1)) * w;
        const y = h - 2 - ((val - min) / span) * (h - 4);
        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points]);

  return (
    <svg className="w-16 h-6 shrink-0" viewBox="0 0 68 22" preserveAspectRatio="none">
      <path
        d={path}
        fill="none"
        stroke={isGain ? '#30D158' : '#FF453A'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SessionStatusCard({
  session,
  count,
}: {
  session: MarketSessionStatus;
  count: number;
}) {
  const toneStyles =
    session.tone === 'open'
      ? 'bg-[#30D158]/15 text-[#16803C] dark:text-[#30D158] border-[#30D158]/30'
      : session.tone === 'extended' || session.tone === 'break'
        ? 'bg-[#FF9F0A]/15 text-[#B25E09] dark:text-[#FF9F0A] border-[#FF9F0A]/30'
        : 'bg-[#E5E5EA] dark:bg-[#2C2C2E] text-[#6C6C70] dark:text-[#8E8E93] border-[#D1D1D6] dark:border-[#38383A]';

  const dotColor =
    session.tone === 'open'
      ? 'bg-[#30D158] animate-pulse'
      : session.tone === 'extended' || session.tone === 'break'
        ? 'bg-[#FF9F0A]'
        : 'bg-[#8E8E93]';

  return (
    <div className="rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#1C1C1E] dark:text-white truncate">
            {session.label}
          </span>
          <span className="text-[11px] font-mono font-semibold text-[#6C6C70] dark:text-[#8E8E93]">
            Top {count}
          </span>
        </div>
        <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] mt-0.5 truncate">
          {session.isLiveRunning ? 'Running Session Movers · ' : 'Last Session Movers · '}
          {session.detail}
        </p>
      </div>
      <span
        className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${toneStyles}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        {session.stateLabel}
      </span>
    </div>
  );
}

function MarketMoversSection({
  title,
  subtitle,
  session,
  stocks,
}: {
  title: string;
  subtitle: string;
  session: MarketSessionStatus;
  stocks: StockMover[];
}) {
  return (
    <section className="rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 border-b border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#1C1C1E] dark:text-white">{title}</h2>
          <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">{subtitle}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6C6C70] dark:text-[#8E8E93]">
          <Clock className="w-3.5 h-3.5" />
          {session.isLiveRunning ? `Running Session (${session.stateLabel})` : `Last Completed Session (${session.stateLabel})`}
        </span>
      </div>

      {stocks.length === 0 ? (
        <div className="p-8 text-center text-xs text-[#6C6C70] dark:text-[#8E8E93]">
          No stocks match the active filter.
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E5EA] dark:border-[#2C2C2E] text-[11px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#8E8E93]">
                  <th className="py-3 pl-5 pr-2 w-12">Rank</th>
                  <th className="py-3 px-3">Stock</th>
                  <th className="py-3 px-3">Trend</th>
                  <th className="py-3 px-3 text-right">Last Price</th>
                  <th className="py-3 px-3 text-right">Session Chg</th>
                  <th className="py-3 px-3 text-right">Impact %</th>
                  <th className="py-3 px-3 text-right">Day Range</th>
                  <th className="py-3 pl-3 pr-5 text-right">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5EA]/70 dark:divide-[#2C2C2E]/60 text-xs">
                {stocks.map((stock, idx) => {
                  const isGain = stock.changePercent >= 0;
                  return (
                    <tr
                      key={`${stock.market}-${stock.symbol}`}
                      className="hover:bg-[#E5E5EA]/35 dark:hover:bg-[#2C2C2E]/40 transition-colors"
                    >
                      <td className="py-3 pl-5 pr-2 font-mono font-bold text-[#6C6C70] dark:text-[#8E8E93]">
                        #{idx + 1}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-sm text-[#1C1C1E] dark:text-white">
                          {stock.symbol}
                        </div>
                        <div className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] truncate max-w-[220px]">
                          {stock.name} · {stock.exchange}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <SparklineMini points={stock.sparklinePoints} isGain={isGain} />
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-sm text-[#1C1C1E] dark:text-white tabular-nums">
                        {formatStockPrice(stock)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-semibold tabular-nums ${
                          isGain
                            ? 'text-[#16803C] dark:text-[#30D158]'
                            : 'text-[#D7261C] dark:text-[#FF453A]'
                        }`}
                      >
                        {formatStockDelta(stock)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold tabular-nums ${
                            isGain
                              ? 'bg-[#30D158]/20 text-[#16803C] dark:text-[#30D158]'
                              : 'bg-[#FF453A]/20 text-[#D7261C] dark:text-[#FF453A]'
                          }`}
                        >
                          {isGain ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {isGain ? '+' : ''}
                          {stock.changePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[11px] text-[#6C6C70] dark:text-[#8E8E93] tabular-nums">
                        {formatStockRange(stock)}
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right font-mono font-semibold text-[#1C1C1E] dark:text-[#E5E5EA] tabular-nums">
                        {stock.volume}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="md:hidden divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E]/70">
            {stocks.map((stock, idx) => {
              const isGain = stock.changePercent >= 0;
              return (
                <div
                  key={`${stock.market}-${stock.symbol}-m`}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-[#6C6C70] dark:text-[#8E8E93]">
                        #{idx + 1}
                      </span>
                      <span className="text-sm font-extrabold text-[#1C1C1E] dark:text-white">
                        {stock.symbol}
                      </span>
                      <span className="text-[10px] font-mono text-[#6C6C70] dark:text-[#8E8E93]">
                        Vol {stock.volume}
                      </span>
                    </div>
                    <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93] truncate mt-0.5">
                      {stock.name}
                    </p>
                    <p className="text-[10px] font-mono text-[#6C6C70] dark:text-[#8E8E93] mt-0.5 tabular-nums">
                      Range: {formatStockRange(stock)}
                    </p>
                  </div>

                  <SparklineMini points={stock.sparklinePoints} isGain={isGain} />

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono text-[#1C1C1E] dark:text-white tabular-nums">
                      {formatStockPrice(stock)}
                    </div>
                    <span
                      className={`mt-1 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold font-mono tabular-nums ${
                        isGain ? 'bg-[#30D158] text-black' : 'bg-[#FF453A] text-white'
                      }`}
                    >
                      {isGain ? '+' : ''}
                      {stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export const TopStocksView: React.FC<TopStocksViewProps> = ({
  usMovers,
  idxMovers,
  stocksUpdatedAt,
  searchQuery,
  onRefresh,
}) => {
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('impact');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const sessions = getAllMarketSessions(now);

  const filterList = (list: StockMover[]) => {
    const q = searchQuery.toLowerCase().trim();
    return list.filter((s) => {
      const matchQuery =
        !q ||
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.exchange.toLowerCase().includes(q);
      const matchDir =
        directionFilter === 'impact'
          ? true
          : directionFilter === 'gainers'
            ? s.changePercent >= 0
            : s.changePercent < 0;
      return matchQuery && matchDir;
    });
  };

  const filteredUs = useMemo(() => filterList(usMovers), [usMovers, searchQuery, directionFilter]);
  const filteredIdx = useMemo(() => filterList(idxMovers), [idxMovers, searchQuery, directionFilter]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    window.setTimeout(() => setIsRefreshing(false), 750);
  };

  const updatedWib = stocksUpdatedAt
    ? `${new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(stocksUpdatedAt))} WIB`
    : 'Syncing...';

  return (
    <div className="max-w-7xl mx-auto w-full px-4 lg:px-6 py-5 sm:py-7 pb-28 flex flex-col gap-5">
      {/* Page Title & Live Sync Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#0071E3] dark:text-[#0A84FF]" />
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white">
              Top 10 High-Impact Stock Movers
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93] mt-1">
            Highest-impact US (NYSE/NASDAQ) &amp; Indonesia (IDX) equities ranked by session price movement and traded liquidity.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <span className="text-[11px] font-mono text-[#6C6C70] dark:text-[#8E8E93]">
            Updated {updatedWib}
          </span>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-[#1C1C1E] border border-[#D1D1D6] dark:border-[#2C2C2E] hover:border-[#0071E3] text-xs font-semibold text-[#1C1C1E] dark:text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Live Market Session Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SessionStatusCard session={sessions.us} count={usMovers.length || 10} />
        <SessionStatusCard session={sessions.idx} count={idxMovers.length || 10} />
      </div>

      {/* Market & Impact Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] p-1 border border-[#D1D1D6] dark:border-[#2C2C2E]">
          {(
            [
              { id: 'all', label: `All Markets (${filteredUs.length + filteredIdx.length})` },
              { id: 'us', label: `United States (${filteredUs.length})` },
              { id: 'id', label: `Indonesia IDX (${filteredIdx.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMarketFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                marketFilter === tab.id
                  ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-xl bg-[#E5E5EA]/80 dark:bg-[#1C1C1E] p-1 border border-[#D1D1D6] dark:border-[#2C2C2E]">
          {(
            [
              { id: 'impact', label: 'Highest Impact' },
              { id: 'gainers', label: 'Gainers' },
              { id: 'losers', label: 'Losers' },
            ] as const
          ).map((dir) => (
            <button
              key={dir.id}
              type="button"
              onClick={() => setDirectionFilter(dir.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                directionFilter === dir.id
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              {dir.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tables */}
      {(marketFilter === 'all' || marketFilter === 'us') && (
        <MarketMoversSection
          title="United States · Top 10 High-Impact Stocks"
          subtitle="Ranked from live NYSE & NASDAQ most-active, top gainer, and top loser equities"
          session={sessions.us}
          stocks={filteredUs}
        />
      )}

      {(marketFilter === 'all' || marketFilter === 'id') && (
        <MarketMoversSection
          title="Indonesia (IDX / BEI) · Top 10 High-Impact Stocks"
          subtitle="Ranked across liquid Jakarta blue-chip and high-turnover LQ45/IDX equities"
          session={sessions.idx}
          stocks={filteredIdx}
        />
      )}
    </div>
  );
};
