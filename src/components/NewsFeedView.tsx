import React, { useMemo, useState } from 'react';
import { ArrowRight, Globe, Sparkles, Tag } from 'lucide-react';
import { EDITORIAL_INSIGHTS, NEWS_STORIES } from '../data/marketData';
import { NewsStory } from '../types/market';

interface NewsFeedViewProps {
  searchQuery: string;
  onOpenStory: (story: NewsStory) => void;
  onFetchLiveNewsPulse?: () => void;
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
  searchQuery,
  onOpenStory,
  onFetchLiveNewsPulse,
}) => {
  const [activeTopic, setActiveTopic] = useState<TopicFilter>('all');

  const filteredStories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return NEWS_STORIES.filter((s) => {
      const matchTopic = activeTopic === 'all' || s.topic === activeTopic;
      const matchSearch =
        !q ||
        s.headline.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.publisher.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q));
      return matchTopic && matchSearch;
    });
  }, [activeTopic, searchQuery]);

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-28 flex flex-col gap-7">
      {/* Header & Topic Filters */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
        <div>
          <span className="text-xs font-bold text-[#D7261C] dark:text-[#FF453A] uppercase tracking-wider">
            Live Wire · Global Institutional Desks
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white mt-1">
            Market Breaking News
          </h1>
          <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93] mt-0.5">
            Real-time dispatches from Reuters, Bloomberg, CNBC, and Financial Times.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onFetchLiveNewsPulse && (
            <button
              type="button"
              onClick={onFetchLiveNewsPulse}
              className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-[#0071E3]/10 dark:bg-[#0A84FF]/15 text-[#0071E3] dark:text-[#0A84FF] text-xs font-bold flex items-center gap-1.5 hover:opacity-85 transition-opacity shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <Globe className="w-3.5 h-3.5" />
              <span>Live Web Pulse</span>
            </button>
          )}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {TOPICS.map((t) => {
              const active = activeTopic === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTopic(t.id)}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm'
                      : 'bg-white dark:bg-[#1C1C1E] text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white border border-[#E5E5EA] dark:border-[#2C2C2E]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stories Grid */}
      {filteredStories.length > 0 ? (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStories.map((story, idx) => {
            const isFeatured = idx === 0 && activeTopic === 'all' && !searchQuery.trim();
            return (
              <article
                key={story.id}
                onClick={() => onOpenStory(story)}
                className={`${
                  isFeatured ? 'md:col-span-2 p-6' : 'p-5'
                } rounded-2xl bg-white dark:bg-[#1C1C1E] hover:bg-[#F2F2F7] dark:hover:bg-[#2C2C2E]/70 border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col justify-between gap-4 cursor-pointer transition-colors`}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {story.isBreaking && (
                        <span className="px-2 py-0.5 rounded font-black tracking-wider uppercase bg-[#FF453A] text-white text-[10px]">
                          BREAKING
                        </span>
                      )}
                      <span className="font-bold text-[#1C1C1E] dark:text-white text-sm">
                        {story.publisher}
                      </span>
                      <span className="text-[#6C6C70] dark:text-[#8E8E93]">·</span>
                      <span className="text-[#6C6C70] dark:text-[#8E8E93]">{story.timeAgo}</span>
                    </div>
                    {story.impact && (
                      <span className="text-xs font-semibold text-[#0071E3] dark:text-[#0A84FF]">
                        {story.impact}
                      </span>
                    )}
                  </div>

                  <h2
                    className={`font-bold text-[#1C1C1E] dark:text-white leading-snug ${
                      isFeatured ? 'text-xl sm:text-2xl' : 'text-base'
                    }`}
                  >
                    {story.headline}
                  </h2>

                  <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93] leading-relaxed line-clamp-3">
                    {story.summary}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#E5E5EA] dark:border-[#2C2C2E]/60 text-xs">
                  <div className="flex items-center gap-1.5 text-[#6C6C70] dark:text-[#8E8E93] truncate">
                    <Tag className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{story.tags.join(' · ')}</span>
                  </div>
                  {isFeatured ? (
                    <span className="font-semibold text-[#0071E3] dark:text-[#0A84FF] flex items-center gap-1 shrink-0">
                      <span>Read Full Dispatch</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    story.badgeMetric && (
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
                    )
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] text-center text-sm text-[#6C6C70] dark:text-[#8E8E93]">
          No news dispatches match your current filters.
        </div>
      )}

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
