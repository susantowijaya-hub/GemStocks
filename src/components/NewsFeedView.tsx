import React, { useMemo, useState } from 'react';
import { ArrowRight, Newspaper, Tag } from 'lucide-react';
import { EDITORIAL_INSIGHTS } from '../data/marketData';
import {
  AppRoute,
  DailyMarketSummaryResponse,
  EconomicEvent,
  MarketAsset,
  NewsStory,
  StocksMoversBucket,
} from '../types/market';
import { DailyMarketSummary } from './DailyMarketSummary';

interface NewsFeedViewProps {
  stories: NewsStory[];
  searchQuery: string;
  onOpenStory: (story: NewsStory) => void;
  dailySummary?: DailyMarketSummaryResponse | null;
  dailySummaryLoading?: boolean;
  onRefreshDailySummary?: () => void;
  assets: MarketAsset[];
  economicEvents: EconomicEvent[];
  usBucket?: StocksMoversBucket;
  idxBucket?: StocksMoversBucket;
  onSelectAsset: (id: string) => void;
  onInspectSymbol?: (yahooSymbol: string, builtInAssetId?: string) => void;
  onNavigate: (route: AppRoute) => void;
}

type TopicFilter = 'all' | 'rates' | 'idx' | 'commodities' | 'crypto';

const TOPICS: { id: TopicFilter; label: string }[] = [
  { id: 'all', label: 'All Topics' },
  { id: 'rates', label: 'US Rates & Fed' },
  { id: 'idx', label: 'IDX & Rupiah' },
  { id: 'commodities', label: 'Commodities' },
  { id: 'crypto', label: 'Crypto' },
];

export const NewsFeedView: React.FC<NewsFeedViewProps> = ({
  stories,
  searchQuery,
  onOpenStory,
  dailySummary = null,
  dailySummaryLoading = false,
  onRefreshDailySummary,
  assets,
  economicEvents,
  usBucket,
  idxBucket,
  onSelectAsset,
  onInspectSymbol,
  onNavigate,
}) => {
  const [activeTopic, setActiveTopic] = useState<TopicFilter>('all');

  const filteredStories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return stories.filter((s) => {
      const matchTopic = activeTopic === 'all' || s.topic === activeTopic;
      const matchSearch =
        !q ||
        s.headline.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.publisher.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q));
      return matchTopic && matchSearch;
    });
  }, [stories, activeTopic, searchQuery]);

  const topBreaking = useMemo(
    () =>
      filteredStories
        .filter((s) => s.isBreaking)
        .concat(filteredStories.filter((s) => !s.isBreaking))
        .slice(0, 3),
    [filteredStories]
  );

  const remainingStories = useMemo(() => {
    const topIds = new Set(topBreaking.map((s) => s.id));
    return filteredStories.filter((s) => !topIds.has(s.id));
  }, [filteredStories, topBreaking]);

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 pb-28 flex flex-col gap-6">
      {/* Header matching Market section Breaking News style */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-3 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
        <div>
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-[#D7261C] dark:text-[#FF453A]" />
            <span className="text-xs font-bold text-[#D7261C] dark:text-[#FF453A] uppercase tracking-wider">
              Live Wire · Market Breaking News
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white mt-1">
            Breaking News
          </h1>
          <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93] mt-0.5">
            Real-time dispatches from Financial Times, MarketWatch, CNBC, BBC Business, CoinDesk, CNBC Indonesia, and Yahoo Finance.
          </p>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {TOPICS.map((t) => {
            const active = activeTopic === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTopic(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
                  active
                    ? 'bg-[#1C1C1E] dark:bg-[#2C2C2E] text-white border-[#1C1C1E] dark:border-[#3A3A3C]'
                    : 'bg-white/80 dark:bg-[#1C1C1E]/60 text-[#6C6C70] dark:text-[#AEAEB2] border-[#E5E5EA] dark:border-[#2C2C2E] hover:text-[#1C1C1E] dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Top Breaking Wire (Market Section card style) */}
      {topBreaking.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-[#D7261C] dark:text-[#FF453A]" />
              <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
                Top Breaking Wire
              </h2>
            </div>
            <span className="text-xs font-medium text-[#6C6C70] dark:text-[#8E8E93]">
              Latest {topBreaking.length} Headlines
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topBreaking.map((story) => (
              <article
                key={story.id}
                onClick={() => onOpenStory(story)}
                className="p-4 rounded-2xl bg-white dark:bg-[#1C1C1E] hover:bg-[#E5E5EA]/50 dark:hover:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#2C2C2E] cursor-pointer transition-colors flex flex-col justify-between gap-2.5"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      {story.isBreaking && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-[#FF453A] text-white">
                          BREAKING
                        </span>
                      )}
                      <span className="font-bold text-[#1C1C1E] dark:text-white">
                        {story.publisher}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
                      {story.timeAgo}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#1C1C1E] dark:text-white leading-snug">
                    {story.headline}
                  </h3>
                  <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93] mt-1.5 line-clamp-2 leading-relaxed">
                    {story.summary}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#E5E5EA] dark:border-[#2C2C2E]/60 text-[11px]">
                  <span className="text-[#6C6C70] dark:text-[#8E8E93] truncate">
                    {story.tags.slice(0, 2).join(' · ')}
                  </span>
                  <span className="font-semibold text-[#0071E3] dark:text-[#0A84FF] inline-flex items-center gap-1 shrink-0">
                    <span>Read</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 24-Hour Daily Market Summary inside News Tab */}
      <DailyMarketSummary
        summaryData={dailySummary}
        summaryLoading={dailySummaryLoading}
        onRefreshSummary={onRefreshDailySummary}
        assets={assets}
        economicEvents={economicEvents}
        newsStories={stories}
        usBucket={usBucket}
        idxBucket={idxBucket}
        onSelectAsset={(id) => {
          onSelectAsset(id);
          onNavigate('dashboard');
        }}
        onInspectSymbol={onInspectSymbol}
        onNavigate={onNavigate}
      />

      {/* Full News Dispatches Grid (maintaining Market section card styling) */}
      {remainingStories.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
            <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
              All Market Dispatches
            </h2>
            <span className="text-xs text-[#6C6C70] dark:text-[#8E8E93] font-medium">
              {filteredStories.length} Stories
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {remainingStories.map((story) => (
              <article
                key={story.id}
                onClick={() => onOpenStory(story)}
                className="p-4 rounded-2xl bg-white dark:bg-[#1C1C1E] hover:bg-[#E5E5EA]/50 dark:hover:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col justify-between gap-3 cursor-pointer transition-colors"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      {story.isBreaking && (
                        <span className="px-1.5 py-0.5 rounded font-black tracking-wider uppercase bg-[#FF453A] text-white text-[10px] shrink-0">
                          BREAKING
                        </span>
                      )}
                      <span className="font-bold text-[#1C1C1E] dark:text-white truncate">
                        {story.publisher}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] shrink-0">
                      {story.timeAgo}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-[#1C1C1E] dark:text-white leading-snug">
                    {story.headline}
                  </h3>

                  <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93] leading-relaxed line-clamp-3">
                    {story.summary}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-[#E5E5EA] dark:border-[#2C2C2E]/60 text-[11px]">
                  <div className="flex items-center gap-1.5 text-[#6C6C70] dark:text-[#8E8E93] truncate">
                    <Tag className="w-3 h-3 shrink-0" />
                    <span className="truncate">{story.tags.join(' · ')}</span>
                  </div>
                  {story.badgeMetric && (
                    <span
                      className={`font-semibold shrink-0 font-mono tabular-nums ${
                        story.badgePositive === true
                          ? 'text-[#16803C] dark:text-[#30D158]'
                          : story.badgePositive === false
                            ? 'text-[#D7261C] dark:text-[#FF453A]'
                            : 'text-[#0071E3] dark:text-[#0A84FF]'
                      }`}
                    >
                      {story.badgeMetric}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : filteredStories.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] text-center text-sm text-[#6C6C70] dark:text-[#8E8E93]">
          No news dispatches match your current filters.
        </div>
      ) : null}

      {/* Editorial Analysis & Macro Insights */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
          <div>
            <h2 className="text-xl font-bold text-[#1C1C1E] dark:text-white">
              Editorial Analysis &amp; Macro Insights
            </h2>
            <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
              Research notes from senior macro &amp; fixed income strategists
            </p>
          </div>
          <span className="text-xs font-semibold text-[#6C6C70] dark:text-[#8E8E93]">
            {EDITORIAL_INSIGHTS.length} Active Briefings
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {EDITORIAL_INSIGHTS.map((note) => (
            <div
              key={note.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col gap-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span
                  className={`font-bold ${
                    note.isPositive
                      ? 'text-[#16803C] dark:text-[#30D158]'
                      : 'text-[#6C6C70] dark:text-[#8E8E93]'
                  }`}
                >
                  {note.sentiment}
                </span>
                <span className="text-[#6C6C70] dark:text-[#8E8E93]">{note.desk}</span>
              </div>
              <h3 className="text-sm font-bold text-[#1C1C1E] dark:text-white">{note.title}</h3>
              <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93] leading-relaxed">
                {note.summary}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
