import React from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  BarChart3,
  Coins,
  DollarSign,
  Flame,
  Gem,
  Globe2,
  Landmark,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { MarketSignalInfo, WatchlistCategory } from '../types/market';

export const SignalBadge: React.FC<{
  signal: MarketSignalInfo;
  compact?: boolean;
  showScore?: boolean;
  className?: string;
}> = React.memo(({ signal, compact = false, showScore = false, className = '' }) => {
  const isBull = signal.direction === 'bull';
  const isBear = signal.direction === 'bear';
  const isStrong = signal.tier === 'Strong Bull' || signal.tier === 'Strong Bear';

  const toneClasses = isBull
    ? 'bg-[#22C55E]/16 dark:bg-[#4ADE80]/18 text-[#0F7033] dark:text-[#4ADE80] border-[#22C55E]/40 dark:border-[#4ADE80]/40'
    : isBear
      ? 'bg-[#EF4444]/16 dark:bg-[#FF5A52]/18 text-[#C41C16] dark:text-[#FF6B63] border-[#EF4444]/40 dark:border-[#FF5A52]/40'
      : 'bg-[#E5E5EA]/90 dark:bg-[#2C2C2E] text-[#45474F] dark:text-[#C5C8D2] border-[#C7C7CC] dark:border-[#48484E]';

  return (
    <motion.span
      key={signal.tier}
      initial={{ opacity: 0.78, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      title={signal.reason}
      className={`inline-flex items-center gap-1 rounded-full border font-bold whitespace-nowrap shrink-0 backdrop-blur-sm ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      } ${toneClasses} ${className}`}
    >
      {isBull ? (
        <TrendingUp className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} shrink-0`} />
      ) : isBear ? (
        <TrendingDown className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} shrink-0`} />
      ) : (
        <Activity className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} shrink-0`} />
      )}
      <span>{compact ? signal.shortLabel : signal.tier}</span>
      {isStrong && !compact && (
        <span
          className={`w-1.5 h-1.5 rounded-full animate-pulse ${
            isBull ? 'bg-[#0F7033] dark:bg-[#4ADE80]' : 'bg-[#C41C16] dark:bg-[#FF6B63]'
          }`}
        />
      )}
      {showScore && (
        <span className="font-mono tabular-nums opacity-85 ml-0.5">
          ({signal.score > 0 ? `+${signal.score}` : signal.score})
        </span>
      )}
    </motion.span>
  );
});

export const AssetCategoryMiniIcon: React.FC<{
  category: WatchlistCategory | 'Equities' | 'Crypto' | 'Commodities' | 'Cash & FX';
  idOrSymbol?: string;
  size?: 'sm' | 'md';
}> = React.memo(({ category, idOrSymbol = '', size = 'sm' }) => {
  const upper = idOrSymbol.toUpperCase();
  const dim = size === 'sm' ? 'w-6 h-6 rounded-lg' : 'w-7 h-7 rounded-xl';
  const iconDim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  if (upper.includes('BTC') || upper.includes('ETH') || category === 'Crypto') {
    return (
      <span
        className={`${dim} bg-[#FF9F0A]/18 border border-[#FF9F0A]/30 text-[#9A4E00] dark:text-[#FFB340] flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Coins className={iconDim} />
      </span>
    );
  }

  if (upper.includes('XAU') || upper.includes('GC=F')) {
    return (
      <span
        className={`${dim} bg-[#EAB308]/18 border border-[#EAB308]/35 text-[#854D0E] dark:text-[#FACC15] flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Gem className={iconDim} />
      </span>
    );
  }

  if (
    upper.includes('WTI') ||
    upper.includes('BRENT') ||
    upper.includes('CL=F') ||
    category === 'Commodities'
  ) {
    return (
      <span
        className={`${dim} bg-[#F97316]/18 border border-[#F97316]/30 text-[#9A3412] dark:text-[#FB923C] flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Flame className={iconDim} />
      </span>
    );
  }

  if (
    upper.includes('10Y') ||
    upper.includes('30Y') ||
    upper.includes('TNX') ||
    upper.includes('TYX')
  ) {
    return (
      <span
        className={`${dim} bg-[#0071E3]/15 border border-[#0071E3]/28 text-[#0058B8] dark:text-[#60A5FA] flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Landmark className={iconDim} />
      </span>
    );
  }

  if (
    upper.includes('USD') ||
    upper.includes('EUR') ||
    upper.includes('IDR') ||
    upper.includes('DXY') ||
    category === 'forex-yields' ||
    category === 'Cash & FX'
  ) {
    return (
      <span
        className={`${dim} bg-[#22C55E]/16 border border-[#22C55E]/30 text-[#0F7033] dark:text-[#4ADE80] flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <DollarSign className={iconDim} />
      </span>
    );
  }

  if (category === 'asia-indices' || upper.includes('IHSG') || upper.includes('EIDO')) {
    return (
      <span
        className={`${dim} bg-[#0071E3]/15 border border-[#0071E3]/28 text-[#0058B8] dark:text-[#60A5FA] flex items-center justify-center shrink-0`}
        aria-hidden="true"
      >
        <Globe2 className={iconDim} />
      </span>
    );
  }

  return (
    <span
      className={`${dim} bg-[#0071E3]/15 border border-[#0071E3]/28 text-[#0058B8] dark:text-[#60A5FA] flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      <BarChart3 className={iconDim} />
    </span>
  );
});
