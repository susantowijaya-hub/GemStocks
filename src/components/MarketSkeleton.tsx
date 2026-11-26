import React from 'react';

export type MarketSkeletonVariant = 'dashboard' | 'route' | 'chart' | 'panel' | 'cards';

interface MarketSkeletonProps {
  variant?: MarketSkeletonVariant;
  className?: string;
  label?: string;
  minHeightClass?: string;
}

/**
 * Unified MarketSkeleton mirroring the #boot-shell card strip and workspace
 * layout defined in index.html, providing an instant shimmer placeholder during
 * code-split Suspense transitions and background data hydration.
 */
export const MarketSkeleton: React.FC<MarketSkeletonProps> = ({
  variant = 'route',
  className = '',
  label = 'Loading terminal view...',
  minHeightClass = 'min-h-[260px]',
}) => {
  if (variant === 'cards') {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={label}
        data-testid="market-skeleton-cards"
        className={`grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 lg:gap-3 ${className}`}
      >
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-[82px] rounded-2xl liquid-glass-card skeleton-shimmer border border-black/8 dark:border-white/10"
          />
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={label}
        data-testid="market-skeleton-chart"
        className={`rounded-2xl liquid-glass-card skeleton-shimmer p-4 sm:p-5 flex flex-col justify-between gap-4 border border-black/8 dark:border-white/10 min-h-[340px] ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-20 rounded-lg bg-black/8 dark:bg-white/10" />
            <div className="h-6 w-28 rounded-lg bg-black/6 dark:bg-white/8" />
          </div>
          <div className="h-7 w-28 rounded-xl bg-black/8 dark:bg-white/10" />
        </div>
        <div className="flex-1 min-h-[220px] rounded-xl bg-black/5 dark:bg-white/5" />
        <div className="flex items-center gap-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-6 w-10 rounded-lg bg-black/6 dark:bg-white/8" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'panel') {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={label}
        data-testid="market-skeleton-panel"
        className={`rounded-2xl liquid-glass-card skeleton-shimmer p-4 sm:p-5 flex flex-col gap-3 border border-black/8 dark:border-white/10 ${minHeightClass} ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-36 rounded-md bg-black/8 dark:bg-white/10" />
          <div className="h-4 w-16 rounded-md bg-black/6 dark:bg-white/8" />
        </div>
        <div className="h-10 rounded-xl bg-black/5 dark:bg-white/6" />
        <div className="flex-1 min-h-[110px] rounded-xl bg-black/5 dark:bg-white/5" />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-testid="market-skeleton"
      className={`max-w-[1440px] w-full mx-auto px-4 lg:px-6 py-4 flex flex-col gap-4 flex-1 ${className}`}
    >
      {/* Top 6-Card Strip matching #boot-shell .boot-strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-[82px] rounded-2xl liquid-glass-card skeleton-shimmer p-3 flex flex-col justify-between border border-black/8 dark:border-white/10"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 rounded bg-black/8 dark:bg-white/10" />
              <div className="h-2.5 w-8 rounded bg-black/6 dark:bg-white/8" />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="h-4 w-20 rounded bg-black/10 dark:bg-white/12" />
              <div className="h-4 w-12 rounded-md bg-black/6 dark:bg-white/8" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Focal Container matching #boot-shell .boot-main */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <div className="h-[360px] rounded-[20px] liquid-glass-card skeleton-shimmer p-5 flex flex-col justify-between border border-black/8 dark:border-white/10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="h-6 w-32 rounded-lg bg-black/10 dark:bg-white/12" />
              <div className="h-3.5 w-48 rounded bg-black/6 dark:bg-white/8" />
            </div>
            <div className="h-8 w-28 rounded-xl bg-black/8 dark:bg-white/10" />
          </div>
          <div className="flex-1 my-4 rounded-xl bg-black/5 dark:bg-white/5" />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-8 rounded-lg bg-black/6 dark:bg-white/8" />
            ))}
          </div>
        </div>

        <div className="hidden xl:flex flex-col gap-4">
          <div className="h-[172px] rounded-[20px] liquid-glass-card skeleton-shimmer border border-black/8 dark:border-white/10" />
          <div className="h-[172px] rounded-[20px] liquid-glass-card skeleton-shimmer border border-black/8 dark:border-white/10" />
        </div>
      </div>
    </div>
  );
};
