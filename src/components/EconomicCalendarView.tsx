import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, CalendarClock, Download, Loader2, RefreshCw } from 'lucide-react';
import {
  CalendarCatalyst,
  CalendarRangePreset,
  EconomicCalendarCurrency,
  EconomicCalendarImpact,
  EconomicEvent,
} from '../types/market';

interface EconomicCalendarViewProps {
  events: EconomicEvent[];
  nextCatalyst: CalendarCatalyst | null;
  searchQuery: string;
  countdownSeconds: number;
  onRefreshCalendar?: () => void;
}

type DaySubFilter = 'all' | 'today' | 'tomorrow';

const FF_CURRENCIES: EconomicCalendarCurrency[] = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
  'NZD',
  'CNY',
];

const RANGE_OPTIONS: Array<{ id: CalendarRangePreset; label: string }> = [
  { id: 'this_week', label: 'This Week' },
  { id: 'next_week', label: 'Next Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'next_month', label: 'Next Month' },
  { id: 'custom', label: 'Custom Dates' },
];

const IMPACT_META: Record<
  EconomicCalendarImpact,
  { label: string; colorClass: string; fillHex: string; dotClass: string }
> = {
  HIGH: {
    label: 'High',
    colorClass: 'text-[#D7261C] dark:text-[#FF453A]',
    fillHex: '#D7261C',
    dotClass: 'bg-[#D7261C] dark:bg-[#FF453A]',
  },
  MED: {
    label: 'Medium',
    colorClass: 'text-[#C25E00] dark:text-[#FF9F0A]',
    fillHex: '#EA7A00',
    dotClass: 'bg-[#EA7A00] dark:bg-[#FF9F0A]',
  },
  LOW: {
    label: 'Low',
    colorClass: 'text-[#A16207] dark:text-[#FACC15]',
    fillHex: '#EAB308',
    dotClass: 'bg-[#EAB308] dark:bg-[#FACC15]',
  },
  HOLIDAY: {
    label: 'Holiday',
    colorClass: 'text-[#6C6C70] dark:text-[#9EB5C8]',
    fillHex: '#8E8E93',
    dotClass: 'bg-[#8E8E93]',
  },
};

function getWibYmd(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86400_000));
}

function formatCountdown(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

/** Authentic ForexFactory-style folder impact glyph */
const ImpactFolderIcon: React.FC<{ impact: EconomicCalendarImpact }> = ({ impact }) => {
  const meta = IMPACT_META[impact];
  return (
    <span
      className="inline-flex items-center justify-center"
      title={`${meta.label} Impact Expected`}
      aria-label={`${meta.label} Impact`}
    >
      <svg
        viewBox="0 0 18 14"
        className="w-4 h-3.5 shrink-0"
        aria-hidden="true"
      >
        <path
          d="M1.5 2.5C1.5 1.67 2.17 1 3 1h4l1.5 1.6H15c.83 0 1.5.67 1.5 1.5v7.4c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5V2.5Z"
          fill={meta.fillHex}
          fillOpacity={impact === 'HOLIDAY' ? 0.55 : 0.92}
        />
      </svg>
    </span>
  );
};

function resolveCalendarActual(raw?: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || /^(pending|—|-|n\/a)$/i.test(trimmed)) return '-';
  return trimmed;
}

function getActualToneClass(ev: EconomicEvent): string {
  if (ev.actual === '-') return 'text-[#6C6C70] dark:text-[#9EB5C8]';
  if (ev.deviationType === 'beat') return 'text-[#0F7033] dark:text-[#4ADE80]';
  if (ev.deviationType === 'miss') return 'text-[#C41C16] dark:text-[#FF6B63]';
  return 'text-[#1C1C1E] dark:text-white';
}

function deriveDateGroup(ev: EconomicEvent): string {
  if (ev.dateGroupLabel) return ev.dateGroupLabel;
  if (ev.isoDate) {
    const d = new Date(ev.isoDate);
    if (Number.isFinite(d.getTime())) {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(d);
    }
  }
  if (ev.day === 'today') return 'Today · WIB';
  if (ev.day === 'tomorrow') return 'Tomorrow · WIB';
  return 'This Week · WIB';
}

export const EconomicCalendarView: React.FC<EconomicCalendarViewProps> = ({
  events,
  nextCatalyst,
  searchQuery,
  countdownSeconds,
  onRefreshCalendar,
}) => {
  const [rangePreset, setRangePreset] = useState<CalendarRangePreset>('this_week');
  const [daySubFilter, setDaySubFilter] = useState<DaySubFilter>('all');
  const [customFrom, setCustomFrom] = useState<string>(() => getWibYmd(0));
  const [customTo, setCustomTo] = useState<string>(() => getWibYmd(7));
  const [rangedEvents, setRangedEvents] = useState<EconomicEvent[] | null>(null);
  const [rangedLoading, setRangedLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const [selectedImpacts, setSelectedImpacts] = useState<Set<EconomicCalendarImpact>>(
    () => new Set(['HIGH', 'MED', 'LOW', 'HOLIDAY'])
  );
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | EconomicCalendarCurrency>('ALL');
  const [exportNotice, setExportNotice] = useState(false);
  const [alertSet, setAlertSet] = useState<boolean>(() => {
    try {
      return localStorage.getItem('stocks-catalyst-alert') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    onRefreshCalendar?.();
  }, [onRefreshCalendar]);

  const handleManualRefresh = () => {
    setIsManualRefreshing(true);
    if (rangePreset === 'this_week') {
      onRefreshCalendar?.();
    } else {
      setRefreshNonce((n) => n + 1);
    }
    window.setTimeout(() => setIsManualRefreshing(false), 750);
  };

  useEffect(() => {
    if (rangePreset === 'this_week') {
      setRangedEvents(null);
      setRangedLoading(false);
      return;
    }

    const controller = new AbortController();
    setRangedLoading(true);
    const params = new URLSearchParams({ range: rangePreset });
    if (refreshNonce > 0) params.set('refresh', '1');
    if (rangePreset === 'custom') {
      if (customFrom) params.set('from', customFrom);
      if (customTo) params.set('to', customTo);
    }

    fetch(`/api/calendar/events?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { events?: EconomicEvent[] };
        if (!controller.signal.aborted) {
          setRangedEvents(Array.isArray(json.events) ? json.events : []);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          // Filter client events by date bounds if network request fails
          setRangedEvents([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRangedLoading(false);
        }
      });

    return () => controller.abort();
  }, [rangePreset, customFrom, customTo, refreshNonce]);

  const handleToggleAlert = () => {
    setAlertSet((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('stocks-catalyst-alert', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const toggleImpact = (imp: EconomicCalendarImpact) => {
    setSelectedImpacts((prev) => {
      const next = new Set(prev);
      if (next.has(imp)) {
        if (next.size === 1) return prev; // keep at least 1 active
        next.delete(imp);
      } else {
        next.add(imp);
      }
      return next;
    });
  };

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        month: 'short',
        day: 'numeric',
      }).format(new Date()),
    []
  );
  const tomorrowLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jakarta',
        month: 'short',
        day: 'numeric',
      }).format(new Date(Date.now() + 86400_000)),
    []
  );

  // Active dataset: live weekly feed when 'this_week', or range-fetched schedule otherwise
  const activeEvents = useMemo(() => {
    const base = rangePreset === 'this_week' ? events : rangedEvents ?? [];
    const allowedSet = new Set<string>(FF_CURRENCIES);
    return base
      .filter((ev) => allowedSet.has(ev.currency))
      .map((ev) => {
        const normalizedActual = resolveCalendarActual(ev.actual);
        const isReleased = normalizedActual !== '-';
        return {
          ...ev,
          // Display '-' instead of 'pending' before release; display actual release print once published
          actual: normalizedActual,
          deviationLabel: isReleased ? ev.deviationLabel : '-',
          deviationType: isReleased ? ev.deviationType : ('neutral' as const),
        };
      });
  }, [events, rangePreset, rangedEvents]);

  const impactCounts = useMemo(() => {
    const counts: Record<EconomicCalendarImpact, number> = {
      HIGH: 0,
      MED: 0,
      LOW: 0,
      HOLIDAY: 0,
    };
    for (const ev of activeEvents) {
      counts[ev.impact] = (counts[ev.impact] || 0) + 1;
    }
    return counts;
  }, [activeEvents]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const fromKey = customFrom <= customTo ? customFrom : customTo;
    const toKey = customFrom <= customTo ? customTo : customFrom;

    return activeEvents.filter((ev) => {
      const matchDay =
        rangePreset === 'this_week' && daySubFilter !== 'all'
          ? ev.day === daySubFilter
          : true;

      let matchCustom = true;
      if (rangePreset === 'custom' && ev.isoDate && fromKey && toKey) {
        const d = new Date(ev.isoDate);
        if (Number.isFinite(d.getTime())) {
          const evKey = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(d);
          matchCustom = evKey >= fromKey && evKey <= toKey;
        }
      }

      const matchImpact = selectedImpacts.has(ev.impact);
      const matchCur = currencyFilter === 'ALL' || ev.currency === currencyFilter;
      const matchSearch =
        !q ||
        ev.title.toLowerCase().includes(q) ||
        ev.currency.toLowerCase().includes(q);
      return matchDay && matchCustom && matchImpact && matchCur && matchSearch;
    });
  }, [
    activeEvents,
    rangePreset,
    daySubFilter,
    customFrom,
    customTo,
    selectedImpacts,
    currencyFilter,
    searchQuery,
  ]);

  // Group events chronologically by Day header (ForexFactory layout)
  const groupedDays = useMemo(() => {
    const groups: Array<{ dateLabel: string; items: EconomicEvent[] }> = [];
    const indexByDate = new Map<string, number>();

    for (const ev of filteredEvents) {
      const label = deriveDateGroup(ev);
      const idx = indexByDate.get(label);
      if (idx === undefined) {
        indexByDate.set(label, groups.length);
        groups.push({ dateLabel: label, items: [ev] });
      } else {
        groups[idx].items.push(ev);
      }
    }
    return groups;
  }, [filteredEvents]);

  const handleExportCsv = () => {
    const header = 'Date,TimeWIB,Currency,Impact,Event,Actual,Forecast,Previous\n';
    const rows = filteredEvents
      .map(
        (e) =>
          `"${deriveDateGroup(e)}","${e.timeWib}",${e.currency},${e.impact},"${e.title}","${resolveCalendarActual(e.actual)}","${e.forecast}","${e.previous}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forexfactory-calendar-${rangePreset}-wib.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportNotice(true);
    window.setTimeout(() => setExportNotice(false), 2500);
  };

  return (
    <div
      data-testid="forex-calendar-view"
      className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 pb-24 flex flex-col gap-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3 border-b border-black/8 dark:border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-[#16803C] dark:text-[#30D158]" />
            <span className="text-xs font-bold text-[#16803C] dark:text-[#30D158] uppercase tracking-wider">
              ForexFactory Weekly Schedule
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white mt-1">
            Forex &amp; Macro Calendar
          </h1>
          <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#9EB5C8] mt-0.5">
            G10 &amp; CNY schedule mirrored from ForexFactory · Timed in WIB (UTC+7) · Actual prints shown on release (&quot;-&quot; before release)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="calendar-refresh-btn"
            onClick={handleManualRefresh}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl liquid-glass-pill hover:brightness-95 dark:hover:brightness-110 text-xs font-semibold text-[#1C1C1E] dark:text-white transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isManualRefreshing || rangedLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Releases</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[38px] px-4 py-1.5 rounded-xl liquid-glass-pill hover:brightness-95 dark:hover:brightness-110 text-xs font-semibold text-[#1C1C1E] dark:text-white transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exportNotice ? 'CSV Exported' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* Next Catalyst Countdown Banner */}
      <section className="p-4 sm:px-5 rounded-2xl liquid-glass-card !border-[#0071E3]/30 dark:!border-[#3898FF]/35 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[#005BB8] dark:text-[#38BDF8] block">
            Up Next on ForexFactory
          </span>
          <h2 className="text-base sm:text-lg font-extrabold text-[#1C1C1E] dark:text-white mt-0.5">
            {nextCatalyst
              ? `${nextCatalyst.currency} · ${nextCatalyst.title}`
              : 'Upcoming Tier-1 Release'}
          </h2>
          <p className="text-xs text-[#6C6C70] dark:text-[#9EB5C8] mt-0.5 tabular-nums">
            {nextCatalyst
              ? `${nextCatalyst.timeWib} · ${nextCatalyst.description}`
              : 'Live ForexFactory Weekly Schedule · WIB UTC+7'}
          </p>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-black/8 dark:border-white/10 shrink-0">
          <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-black/60 font-mono text-sm sm:text-base font-extrabold text-[#16803C] dark:text-[#4ADE80] tabular-nums border border-black/8 dark:border-white/10">
            {formatCountdown(countdownSeconds)}
          </div>

          <button
            type="button"
            onClick={handleToggleAlert}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              alertSet
                ? 'bg-[#30D158] text-black'
                : 'bg-[#0071E3] dark:bg-[#0A84FF] text-white hover:opacity-90'
            }`}
          >
            {alertSet ? (
              <>
                <BellRing className="w-3.5 h-3.5" />
                <span>Alert Active</span>
              </>
            ) : (
              <>
                <Bell className="w-3.5 h-3.5" />
                <span>Set Alert</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* Date Window + ForexFactory Impact & Currency Filter Bar */}
      <div className="flex flex-col gap-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Date Window Tabbed Interface: This Week, Next Week, This Month (+ Next Month & Custom) */}
          <div
            data-testid="calendar-range-filter"
            className="inline-flex flex-wrap items-center gap-1 rounded-xl liquid-glass-pill p-1 max-w-full"
            role="tablist"
            aria-label="Calendar date range tabs"
          >
            {RANGE_OPTIONS.map((opt) => {
              const active = rangePreset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  data-testid={`calendar-range-${opt.id}`}
                  aria-selected={active}
                  onClick={() => setRangePreset(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-[#0066CC] dark:bg-[#B45309] text-white shadow-sm'
                      : 'text-[#4A4D57] dark:text-[#B4B8C4] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Sub-filter for Today/Tomorrow inside This Week OR Custom From-To Date Picker */}
          {rangePreset === 'this_week' && (
            <div className="inline-flex rounded-xl liquid-glass-pill p-1 overflow-x-auto no-scrollbar max-w-full">
              {(
                [
                  { id: 'all', label: 'All Days' },
                  { id: 'today', label: `Today (${todayLabel})` },
                  { id: 'tomorrow', label: `Tomorrow (${tomorrowLabel})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDaySubFilter(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    daySubFilter === t.id
                      ? 'bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm'
                      : 'text-[#4A4D57] dark:text-[#B4B8C4] hover:text-[#1C1C1E] dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {rangePreset === 'custom' && (
            <div
              data-testid="calendar-custom-dates"
              className="flex flex-wrap items-center gap-2 rounded-xl liquid-glass-pill px-3 py-1.5"
            >
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4A4D57] dark:text-[#B4B8C4]">
                <span>From</span>
                <input
                  type="date"
                  aria-label="Calendar start date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-white dark:bg-[#1C1C1E] border border-[#D1D1D6] dark:border-[#38383A] rounded-lg px-2 py-1 text-xs font-mono text-[#1C1C1E] dark:text-white focus:outline-none focus:border-[#0071E3]"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4A4D57] dark:text-[#B4B8C4]">
                <span>To</span>
                <input
                  type="date"
                  aria-label="Calendar end date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-white dark:bg-[#1C1C1E] border border-[#D1D1D6] dark:border-[#38383A] rounded-lg px-2 py-1 text-xs font-mono text-[#1C1C1E] dark:text-white focus:outline-none focus:border-[#0071E3]"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* ForexFactory 4-Tier Impact Filter */}
          <div
            className="inline-flex flex-wrap items-center gap-1 rounded-xl liquid-glass-pill p-1"
            role="group"
            aria-label="Filter by ForexFactory impact"
          >
            {(['HIGH', 'MED', 'LOW', 'HOLIDAY'] as const).map((imp) => {
              const meta = IMPACT_META[imp];
              const active = selectedImpacts.has(imp);
              return (
                <button
                  key={imp}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleImpact(imp)}
                  data-testid={`ff-impact-filter-${imp.toLowerCase()}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm'
                      : 'opacity-45 text-[#6C6C70] dark:text-[#8E8E93] hover:opacity-80'
                  }`}
                >
                  <ImpactFolderIcon impact={imp} />
                  <span>{meta.label}</span>
                  <span className="font-mono text-[10px] text-[#6C6C70] dark:text-[#9EB5C8] tabular-nums">
                    {impactCounts[imp]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {rangedLoading && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0071E3] dark:text-[#38BDF8]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading dates...
              </span>
            )}
            <span className="text-[#6C6C70] dark:text-[#9EB5C8] font-medium">Currency:</span>
            <select
              aria-label="Filter by currency"
              value={currencyFilter}
              onChange={(e) =>
                setCurrencyFilter(e.target.value as 'ALL' | EconomicCalendarCurrency)
              }
              className="bg-white dark:bg-[#1C1C1E] border border-[#D1D1D6] dark:border-[#2C2C2E] rounded-xl px-3 py-1.5 text-xs font-semibold text-[#1C1C1E] dark:text-white focus:outline-none focus:border-[#0071E3] dark:focus:border-[#0A84FF]"
            >
              <option value="ALL">All Currencies (G10 + CNY)</option>
              {FF_CURRENCIES.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ForexFactory Desktop Table (md+) */}
      <section className="hidden md:flex rounded-2xl liquid-glass-card overflow-hidden flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10 bg-[#F2F2F7] dark:bg-black/40 text-[#4A4D57] dark:text-[#9EB5C8] font-bold">
                <th className="py-2.5 px-4 w-28">Date / Time</th>
                <th className="py-2.5 px-3 w-16 text-center">Cur</th>
                <th className="py-2.5 px-3 w-16 text-center">Imp</th>
                <th className="py-2.5 px-4">Event</th>
                <th className="py-2.5 px-4 w-24 text-right">Actual</th>
                <th className="py-2.5 px-4 w-24 text-right">Forecast</th>
                <th className="py-2.5 px-4 w-24 text-right">Previous</th>
              </tr>
            </thead>
            <tbody>
              {groupedDays.map((group) => (
                <React.Fragment key={group.dateLabel}>
                  <tr className="bg-black/[0.035] dark:bg-white/[0.04] border-y border-black/8 dark:border-white/10">
                    <td
                      colSpan={7}
                      className="py-2 px-4 text-[11px] font-extrabold uppercase tracking-wider text-[#1C1C1E] dark:text-white"
                    >
                      {group.dateLabel}
                    </td>
                  </tr>
                  {group.items.map((ev, idx) => {
                    const prevTime = idx > 0 ? group.items[idx - 1].timeWib : null;
                    const showTime = ev.timeWib !== prevTime;
                    return (
                      <tr
                        key={ev.id}
                        className="border-b border-black/6 dark:border-white/6 hover:bg-black/[0.025] dark:hover:bg-white/[0.03] transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono tabular-nums text-[#4A4D57] dark:text-[#B4C8D8] whitespace-nowrap">
                          {showTime ? ev.timeWib : ''}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-[#1C1C1E] dark:text-white">
                          {ev.currency}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <ImpactFolderIcon impact={ev.impact} />
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-[#1C1C1E] dark:text-[#F1F5F9]">
                          {ev.title}
                        </td>
                        <td
                          data-testid="calendar-actual-cell"
                          title={ev.actual !== '-' && ev.deviationLabel !== '-' ? ev.deviationLabel : undefined}
                          className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${getActualToneClass(ev)}`}
                        >
                          <span>{ev.actual}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#3A3A3C] dark:text-[#D1D1D6]">
                          {ev.forecast}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8]">
                          {ev.previous}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {!rangedLoading && filteredEvents.length === 0 && (
          <div className="p-8 text-center text-xs text-[#6C6C70] dark:text-[#9EB5C8] flex flex-col items-center gap-2">
            <span>No ForexFactory events match the selected date range, currency, or impact filters.</span>
            <button
              type="button"
              onClick={() => {
                setRangePreset('this_week');
                setDaySubFilter('all');
                setSelectedImpacts(new Set(['HIGH', 'MED', 'LOW', 'HOLIDAY']));
                setCurrencyFilter('ALL');
              }}
              className="text-[#005BB8] dark:text-[#38BDF8] font-semibold hover:underline"
            >
              Reset Calendar Filters
            </button>
          </div>
        )}
      </section>

      {/* Mobile Compact ForexFactory Schedule List (<md) */}
      <section className="md:hidden rounded-2xl liquid-glass-card overflow-hidden flex flex-col">
        {groupedDays.map((group) => (
          <div key={group.dateLabel}>
            <div className="px-4 py-2 bg-black/[0.035] dark:bg-white/[0.04] border-y border-black/8 dark:border-white/10 text-[11px] font-extrabold uppercase tracking-wider text-[#1C1C1E] dark:text-white">
              {group.dateLabel}
            </div>
            <div className="divide-y divide-black/6 dark:divide-white/8">
              {group.items.map((ev) => (
                <div key={ev.id} className="px-4 py-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums text-[#6C6C70] dark:text-[#9EB5C8]">
                        {ev.timeWib}
                      </span>
                      <span className="font-bold text-[#1C1C1E] dark:text-white">
                        {ev.currency}
                      </span>
                      <ImpactFolderIcon impact={ev.impact} />
                    </div>
                  </div>
                  <p className="text-xs font-bold text-[#1C1C1E] dark:text-white leading-snug">
                    {ev.title}
                  </p>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono tabular-nums">
                    <div>
                      <span className="text-[9px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8] mr-1">
                        Act
                      </span>
                      <span className={`font-bold ${getActualToneClass(ev)}`}>{ev.actual}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8] mr-1">
                        Fcst
                      </span>
                      <span className="text-[#3A3A3C] dark:text-[#D1D1D6]">{ev.forecast}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-sans uppercase text-[#6C6C70] dark:text-[#9EB5C8] mr-1">
                        Prev
                      </span>
                      <span className="text-[#6C6C70] dark:text-[#9EB5C8]">{ev.previous}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {!rangedLoading && filteredEvents.length === 0 && (
          <div className="p-6 text-center text-xs text-[#6C6C70] dark:text-[#9EB5C8] flex flex-col items-center gap-2">
            <span>No ForexFactory events match the selected filters.</span>
            <button
              type="button"
              onClick={() => {
                setRangePreset('this_week');
                setDaySubFilter('all');
                setSelectedImpacts(new Set(['HIGH', 'MED', 'LOW', 'HOLIDAY']));
                setCurrencyFilter('ALL');
              }}
              className="text-[#005BB8] dark:text-[#38BDF8] font-semibold hover:underline"
            >
              Reset Calendar Filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
