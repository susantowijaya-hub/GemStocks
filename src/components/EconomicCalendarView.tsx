import React, { useMemo, useState } from 'react';
import { Bell, BellRing, Download, Timer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ECONOMIC_EVENTS } from '../data/marketData';

interface EconomicCalendarViewProps {
  searchQuery: string;
  countdownSeconds: number;
}

type DayFilter = 'all' | 'today' | 'tomorrow' | 'week';
type CurrencyFilter = 'ALL' | 'USD' | 'IDR' | 'CNY' | 'EUR' | 'JPY';
type ImpactFilter = 'ALL' | 'HIGH' | 'MED';

function formatCountdown(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

export const EconomicCalendarView: React.FC<EconomicCalendarViewProps> = ({
  searchQuery,
  countdownSeconds,
}) => {
  const { preferences, updatePreferences } = useAuth();
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>('ALL');
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>('ALL');
  const [exportNotice, setExportNotice] = useState(false);
  const alertSet = preferences.nfpAlertEnabled;

  const filteredEvents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return ECONOMIC_EVENTS.filter((ev) => {
      const matchDay = dayFilter === 'all' || dayFilter === 'week' ? true : ev.day === dayFilter;
      const matchCur = currencyFilter === 'ALL' || ev.currency === currencyFilter;
      const matchImp = impactFilter === 'ALL' ? true : impactFilter === 'HIGH' ? ev.impact === 'HIGH' : true;
      const matchSearch =
        !q ||
        ev.title.toLowerCase().includes(q) ||
        ev.description.toLowerCase().includes(q) ||
        ev.currency.toLowerCase().includes(q);
      return matchDay && matchCur && matchImp && matchSearch;
    });
  }, [dayFilter, currencyFilter, impactFilter, searchQuery]);

  const handleExportCsv = () => {
    const header = 'TimeWIB,Currency,Impact,Event,Actual,Forecast,Previous,Deviation\n';
    const rows = filteredEvents
      .map(
        (e) =>
          `"${e.timeWib}",${e.currency},${e.impact},"${e.title}","${e.actual}","${e.forecast}","${e.previous}","${e.deviationLabel}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'economic-calendar-wib.csv';
    a.click();
    URL.revokeObjectURL(url);
    setExportNotice(true);
    window.setTimeout(() => setExportNotice(false), 2500);
  };

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-28 flex flex-col gap-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white">
            Economic Calendar
          </h1>
          <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93] mt-0.5">
            Macro releases timed in WIB (Asia/Jakarta UTC+7)
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="min-h-[40px] px-4 py-2 rounded-full bg-white dark:bg-[#1C1C1E] hover:bg-[#E5E5EA] dark:hover:bg-[#2C2C2E] border border-[#D1D1D6] dark:border-[#2C2C2E] text-xs font-semibold text-[#1C1C1E] dark:text-white transition-colors flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{exportNotice ? 'CSV Exported' : 'Export CSV'}</span>
        </button>
      </div>

      {/* High Impact Countdown Banner */}
      <section className="rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#FF453A]/15 border border-[#FF453A]/30 flex items-center justify-center text-[#D7261C] dark:text-[#FF453A] shrink-0">
            <Timer className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-[#D7261C] dark:text-[#FF453A] uppercase tracking-wider">
                High Impact Countdown
              </span>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">·</span>
              <span className="font-semibold text-[#0071E3] dark:text-[#0A84FF]">
                USD Macro Catalyst
              </span>
            </div>
            <h2 className="text-lg sm:text-2xl font-extrabold text-[#1C1C1E] dark:text-white mt-0.5">
              US Non-Farm Payrolls &amp; Unemployment Rate
            </h2>
            <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93] mt-0.5">
              Bureau of Labor Statistics · Washington DC Release (20:30 WIB)
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-4 pt-3 md:pt-0 border-t md:border-t-0 border-[#E5E5EA] dark:border-[#2C2C2E]">
          <div className="text-left md:text-right">
            <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] font-medium block">
              Starts in (WIB UTC+7)
            </span>
            <div className="font-mono text-xl sm:text-2xl font-extrabold text-[#16803C] dark:text-[#30D158] tabular-nums">
              {formatCountdown(countdownSeconds)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void updatePreferences({ nfpAlertEnabled: !alertSet })}
            className={`min-h-[40px] px-4 py-2 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shrink-0 ${
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

      {/* Filters & Time Window Bar */}
      <section className="rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-[#F2F2F7] dark:bg-black/50 p-1 border border-[#E5E5EA] dark:border-[#2C2C2E] overflow-x-auto no-scrollbar max-w-full">
          {(
            [
              { id: 'all', label: 'All Days' },
              { id: 'today', label: 'Today (Nov 17)' },
              { id: 'tomorrow', label: 'Tomorrow (Nov 18)' },
              { id: 'week', label: 'This Week' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDayFilter(t.id)}
              className={`min-h-[34px] px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                dayFilter === t.id
                  ? 'bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white shadow-sm'
                  : 'text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[#6C6C70] dark:text-[#8E8E93]">Currency:</span>
            <select
              aria-label="Filter by currency"
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value as CurrencyFilter)}
              className="bg-[#F2F2F7] dark:bg-black/50 border border-[#D1D1D6] dark:border-[#2C2C2E] rounded-lg px-2.5 py-1.5 text-xs text-[#1C1C1E] dark:text-white focus:outline-none focus:border-[#0071E3] dark:focus:border-[#0A84FF]"
            >
              <option value="ALL">All Currencies</option>
              <option value="USD">USD (United States)</option>
              <option value="IDR">IDR (Indonesia)</option>
              <option value="CNY">CNY (China)</option>
              <option value="EUR">EUR (Eurozone)</option>
              <option value="JPY">JPY (Japan)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[#6C6C70] dark:text-[#8E8E93]">Impact:</span>
            <select
              aria-label="Filter by impact"
              value={impactFilter}
              onChange={(e) => setImpactFilter(e.target.value as ImpactFilter)}
              className="bg-[#F2F2F7] dark:bg-black/50 border border-[#D1D1D6] dark:border-[#2C2C2E] rounded-lg px-2.5 py-1.5 text-xs text-[#1C1C1E] dark:text-white focus:outline-none focus:border-[#0071E3] dark:focus:border-[#0A84FF]"
            >
              <option value="ALL">All Significance</option>
              <option value="HIGH">High Impact Only</option>
              <option value="MED">Medium &amp; High</option>
            </select>
          </div>
        </div>
      </section>

      {/* Mobile Card List (< md) */}
      <section className="md:hidden flex flex-col gap-3">
        {filteredEvents.map((ev) => (
          <article
            key={ev.id}
            className="rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] p-4 flex flex-col gap-2.5"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-[#6C6C70] dark:text-[#8E8E93]">
                <span className="font-bold text-[#1C1C1E] dark:text-white">{ev.currency}</span>
                <span>·</span>
                <span className="font-mono tabular-nums font-semibold text-[#1C1C1E] dark:text-white">
                  {ev.timeWib}
                </span>
                <span>·</span>
                <span
                  className={`font-semibold ${
                    ev.impact === 'HIGH'
                      ? 'text-[#D7261C] dark:text-[#FF453A]'
                      : 'text-[#B25E09] dark:text-[#FF9F0A]'
                  }`}
                >
                  {ev.impact}
                </span>
              </div>
              <span
                className={`text-[11px] font-bold ${
                  ev.deviationType === 'beat'
                    ? 'text-[#16803C] dark:text-[#30D158]'
                    : ev.deviationType === 'miss'
                      ? 'text-[#D7261C] dark:text-[#FF453A]'
                      : 'text-[#6C6C70] dark:text-[#8E8E93]'
                }`}
              >
                {ev.deviationLabel}
              </span>
            </div>

            <div>
              <h3 className="text-sm font-bold text-[#1C1C1E] dark:text-white">{ev.title}</h3>
              <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93] mt-0.5">
                {ev.description}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E5E5EA] dark:border-[#2C2C2E] text-xs font-mono tabular-nums">
              <div>
                <span className="text-[10px] font-sans text-[#6C6C70] dark:text-[#8E8E93] block">
                  Actual
                </span>
                <span className="font-bold text-[#1C1C1E] dark:text-white">{ev.actual}</span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-[#6C6C70] dark:text-[#8E8E93] block">
                  Forecast
                </span>
                <span className="font-medium text-[#1C1C1E] dark:text-[#E5E5EA]">
                  {ev.forecast}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-sans text-[#6C6C70] dark:text-[#8E8E93] block">
                  Previous
                </span>
                <span className="text-[#6C6C70] dark:text-[#8E8E93]">{ev.previous}</span>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* Desktop/Tablet Economic Calendar Data Table (md+) */}
      <section className="hidden md:flex rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] overflow-hidden flex-col">
        <div className="p-4 border-b border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
              Forex &amp; Macroeconomic Release Calendar
            </h2>
            <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
              Release times shown in WIB (UTC+7) with consensus deviations
            </p>
          </div>
          <span className="text-xs text-[#6C6C70] dark:text-[#8E8E93] font-medium">
            {filteredEvents.length} Macro Releases
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E5E5EA] dark:border-[#2C2C2E] bg-[#F2F2F7] dark:bg-black/40 text-[#6C6C70] dark:text-[#8E8E93] font-semibold">
                <th className="py-3 px-4 w-28">Time (WIB)</th>
                <th className="py-3 px-3 w-20">Cur</th>
                <th className="py-3 px-3 w-24">Impact</th>
                <th className="py-3 px-4">Event &amp; Description</th>
                <th className="py-3 px-4 w-24 text-right">Actual</th>
                <th className="py-3 px-4 w-24 text-right">Forecast</th>
                <th className="py-3 px-4 w-24 text-right">Previous</th>
                <th className="py-3 px-4 w-28 text-center">Deviation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E]/40">
              {filteredEvents.map((ev) => (
                <tr
                  key={ev.id}
                  className="hover:bg-[#F2F2F7] dark:hover:bg-[#2C2C2E]/40 transition-colors"
                >
                  <td className="py-3.5 px-4 font-semibold text-[#1C1C1E] dark:text-white tabular-nums font-mono">
                    {ev.timeWib}
                  </td>
                  <td className="py-3.5 px-3 font-bold text-[#1C1C1E] dark:text-white">
                    {ev.currency}
                  </td>
                  <td className="py-3.5 px-3">
                    <span
                      className={`font-bold ${
                        ev.impact === 'HIGH'
                          ? 'text-[#D7261C] dark:text-[#FF453A]'
                          : 'text-[#B25E09] dark:text-[#FF9F0A]'
                      }`}
                    >
                      {ev.impact === 'HIGH' ? 'High' : 'Medium'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="font-bold text-[#1C1C1E] dark:text-white text-sm">
                      {ev.title}
                    </p>
                    <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
                      {ev.description}
                    </p>
                  </td>
                  <td
                    className={`py-3.5 px-4 text-right font-bold tabular-nums font-mono text-sm ${
                      ev.deviationType === 'beat'
                        ? 'text-[#16803C] dark:text-[#30D158]'
                        : ev.deviationType === 'miss'
                          ? 'text-[#D7261C] dark:text-[#FF453A]'
                          : 'text-[#1C1C1E] dark:text-white'
                    }`}
                  >
                    {ev.actual}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-[#1C1C1E] dark:text-[#E5E5EA] tabular-nums font-mono">
                    {ev.forecast}
                  </td>
                  <td className="py-3.5 px-4 text-right text-[#6C6C70] dark:text-[#8E8E93] tabular-nums font-mono">
                    {ev.previous}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        ev.deviationType === 'beat'
                          ? 'bg-[#30D158]/15 text-[#16803C] dark:text-[#30D158]'
                          : ev.deviationType === 'miss'
                            ? 'bg-[#FF453A]/15 text-[#D7261C] dark:text-[#FF453A]'
                            : 'bg-[#E5E5EA] dark:bg-[#2C2C2E] text-[#6C6C70] dark:text-[#8E8E93]'
                      }`}
                    >
                      {ev.deviationLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredEvents.length === 0 && (
          <div className="p-8 text-center text-xs text-[#6C6C70] dark:text-[#8E8E93]">
            No macroeconomic releases match the selected filters.
          </div>
        )}
      </section>
    </div>
  );
};
