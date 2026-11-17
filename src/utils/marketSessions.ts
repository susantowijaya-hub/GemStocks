import { WatchlistCategory } from '../types/market';

export type SessionStateTone = 'open' | 'extended' | 'break' | 'closed';

export interface MarketSessionStatus {
  id: 'us' | 'idx' | 'asia' | 'crypto';
  label: string;
  shortLabel: string;
  stateLabel: string;
  detail: string;
  tone: SessionStateTone;
  isLiveRunning: boolean;
}

function getTzClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const totalMin = hour * 60 + minute;
  return { weekday, hour, minute, isWeekend, totalMin };
}

export function getAllMarketSessions(now: Date): Record<'us' | 'idx' | 'asia' | 'crypto', MarketSessionStatus> {
  // 1. US Equities (NYSE / NASDAQ) - America/New_York
  const ny = getTzClock(now, 'America/New_York');
  let us: MarketSessionStatus;
  if (ny.isWeekend) {
    us = {
      id: 'us',
      label: 'US Market (NYSE/NASDAQ)',
      shortLabel: 'US',
      stateLabel: 'Closed',
      detail: 'Weekend · Opens Mon 21:30 WIB',
      tone: 'closed',
      isLiveRunning: false,
    };
  } else if (ny.totalMin >= 9 * 60 + 30 && ny.totalMin < 16 * 60) {
    us = {
      id: 'us',
      label: 'US Market (NYSE/NASDAQ)',
      shortLabel: 'US',
      stateLabel: 'Open',
      detail: 'Regular Session · Closes 04:00 WIB',
      tone: 'open',
      isLiveRunning: true,
    };
  } else if (ny.totalMin >= 4 * 60 && ny.totalMin < 9 * 60 + 30) {
    us = {
      id: 'us',
      label: 'US Market (NYSE/NASDAQ)',
      shortLabel: 'US',
      stateLabel: 'Pre-Market',
      detail: 'Extended Hours · Regular 21:30 WIB',
      tone: 'extended',
      isLiveRunning: true,
    };
  } else if (ny.totalMin >= 16 * 60 && ny.totalMin < 20 * 60) {
    us = {
      id: 'us',
      label: 'US Market (NYSE/NASDAQ)',
      shortLabel: 'US',
      stateLabel: 'After-Hours',
      detail: 'Extended Trading · Ends 08:00 WIB',
      tone: 'extended',
      isLiveRunning: true,
    };
  } else {
    us = {
      id: 'us',
      label: 'US Market (NYSE/NASDAQ)',
      shortLabel: 'US',
      stateLabel: 'Closed',
      detail: 'Last Session Close · Next 21:30 WIB',
      tone: 'closed',
      isLiveRunning: false,
    };
  }

  // 2. Indonesia Stock Exchange (IDX / BEI) - Asia/Jakarta (WIB)
  const jkt = getTzClock(now, 'Asia/Jakarta');
  const isFri = jkt.weekday === 'Fri';
  const lunchStart = isFri ? 11 * 60 + 30 : 12 * 60;
  const lunchEnd = isFri ? 14 * 60 : 13 * 60 + 30;
  let idx: MarketSessionStatus;
  if (jkt.isWeekend) {
    idx = {
      id: 'idx',
      label: 'Indonesia (IDX)',
      shortLabel: 'IDX',
      stateLabel: 'Closed',
      detail: 'Weekend · Opens Mon 09:00 WIB',
      tone: 'closed',
      isLiveRunning: false,
    };
  } else if (jkt.totalMin >= 9 * 60 && jkt.totalMin < lunchStart) {
    idx = {
      id: 'idx',
      label: 'Indonesia (IDX)',
      shortLabel: 'IDX',
      stateLabel: 'Open (Ses I)',
      detail: 'Running Session · Break at 12:00 WIB',
      tone: 'open',
      isLiveRunning: true,
    };
  } else if (jkt.totalMin >= lunchStart && jkt.totalMin < lunchEnd) {
    idx = {
      id: 'idx',
      label: 'Indonesia (IDX)',
      shortLabel: 'IDX',
      stateLabel: 'Lunch Break',
      detail: `Resumes ${isFri ? '14:00' : '13:30'} WIB`,
      tone: 'break',
      isLiveRunning: false,
    };
  } else if (jkt.totalMin >= lunchEnd && jkt.totalMin < 16 * 60) {
    idx = {
      id: 'idx',
      label: 'Indonesia (IDX)',
      shortLabel: 'IDX',
      stateLabel: 'Open (Ses II)',
      detail: 'Running Session · Closes 16:00 WIB',
      tone: 'open',
      isLiveRunning: true,
    };
  } else {
    idx = {
      id: 'idx',
      label: 'Indonesia (IDX)',
      shortLabel: 'IDX',
      stateLabel: 'Closed',
      detail: 'Last Session Close · Opens 09:00 WIB',
      tone: 'closed',
      isLiveRunning: false,
    };
  }

  // 3. Asia-Pacific (HKEX / TWSE / KRX / SSE / NSE)
  const hkg = getTzClock(now, 'Asia/Hong_Kong');
  const ist = getTzClock(now, 'Asia/Kolkata');
  const asiaOpen =
    (!hkg.isWeekend && hkg.totalMin >= 9 * 60 && hkg.totalMin < 16 * 60 + 15) ||
    (!ist.isWeekend && ist.totalMin >= 9 * 60 + 15 && ist.totalMin < 15 * 60 + 30);

  const asia: MarketSessionStatus = asiaOpen
    ? {
        id: 'asia',
        label: 'Asia-Pacific',
        shortLabel: 'Asia',
        stateLabel: 'Open',
        detail: 'Regional Exchanges Active',
        tone: 'open',
        isLiveRunning: true,
      }
    : {
        id: 'asia',
        label: 'Asia-Pacific',
        shortLabel: 'Asia',
        stateLabel: 'Closed',
        detail: 'Regional Session Closed',
        tone: 'closed',
        isLiveRunning: false,
      };

  // 4. Crypto & Global 24/7 Spot
  const crypto: MarketSessionStatus = {
    id: 'crypto',
    label: 'Crypto & Spot FX',
    shortLabel: '24/7',
    stateLabel: 'Live 24/7',
    detail: 'Continuous Global Trading',
    tone: 'open',
    isLiveRunning: true,
  };

  return { us, idx, asia, crypto };
}

export function getAssetSessionStatus(
  assetId: string,
  category: WatchlistCategory,
  now: Date
): MarketSessionStatus {
  const sessions = getAllMarketSessions(now);
  if (assetId === 'BTCUSD' || assetId === 'ETHUSD') {
    return sessions.crypto;
  }
  if (assetId === 'IHSG' || assetId === 'ID10Y') {
    if (assetId === 'ID10Y') {
      const jkt = getTzClock(now, 'Asia/Jakarta');
      const open = !jkt.isWeekend && jkt.totalMin >= 9 * 60 && jkt.totalMin < 16 * 60 + 30;
      return {
        id: 'idx',
        label: 'Indo SBN Bond Market',
        shortLabel: 'ID Bond',
        stateLabel: open ? 'Open' : 'Closed',
        detail: open ? 'Jakarta Fixed Income Active' : 'Last PHEI/Interdealer Close',
        tone: open ? 'open' : 'closed',
        isLiveRunning: open,
      };
    }
    return sessions.idx;
  }
  if (category === 'us-indices') {
    return sessions.us;
  }
  if (category === 'asia-indices') {
    return sessions.asia;
  }
  // Commodities Futures, FX, US Treasury Bonds (trade ~23h Sun-Fri NY)
  const ny = getTzClock(now, 'America/New_York');
  const isWeekendClosed =
    (ny.weekday === 'Fri' && ny.totalMin >= 17 * 60) ||
    ny.weekday === 'Sat' ||
    (ny.weekday === 'Sun' && ny.totalMin < 18 * 60);
  return {
    id: 'us',
    label: 'Global 24/5 Market',
    shortLabel: 'Global',
    stateLabel: isWeekendClosed ? 'Closed' : 'Open (24/5)',
    detail: isWeekendClosed ? 'Weekend Pause · Opens Mon 05:00 WIB' : 'Continuous Electronic Session',
    tone: isWeekendClosed ? 'closed' : 'open',
    isLiveRunning: !isWeekendClosed,
  };
}
