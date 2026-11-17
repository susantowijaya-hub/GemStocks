import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Calculator, Grid } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FX_CURRENCY_META } from '../data/marketData';
import { CurrencyCode, FxPairTile } from '../types/market';

interface FxMatrixViewProps {
  fxRates: Record<CurrencyCode, number>;
  pairTiles: FxPairTile[];
  searchQuery: string;
}

const MATRIX_CURRENCIES: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'JPY', 'IDR', 'SGD'];
const CONVERTER_CURRENCIES: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'JPY', 'IDR', 'SGD', 'AUD'];

export const FxMatrixView: React.FC<FxMatrixViewProps> = ({
  fxRates,
  pairTiles,
  searchQuery,
}) => {
  const { user, preferences, updatePreferences } = useAuth();
  const [amount, setAmount] = useState<string>('1000');
  const [fromCurr, setFromCurr] = useState<CurrencyCode>(preferences.preferredCurrency || 'USD');
  const [toCurr, setToCurr] = useState<CurrencyCode>('IDR');

  useEffect(() => {
    if (user && preferences.preferredCurrency) {
      setFromCurr(preferences.preferredCurrency);
    }
  }, [user, preferences.preferredCurrency]);

  const parsedAmount = parseFloat(amount) || 0;
  const rateFromUsd = fxRates[fromCurr] || 1;
  const rateToUsd = fxRates[toCurr] || 1;
  const unitRate = (1 / rateFromUsd) * rateToUsd;
  const convertedValue = parsedAmount * unitRate;
  const toDecimals = toCurr === 'IDR' || toCurr === 'JPY' ? 0 : 2;
  const toMeta = FX_CURRENCY_META[toCurr];

  const handleSwap = () => {
    const nextFrom = toCurr;
    const nextTo = fromCurr;
    setFromCurr(nextFrom);
    setToCurr(nextTo);
    if (user) {
      void updatePreferences({ preferredCurrency: nextFrom });
    }
  };

  const filteredPairTiles = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return pairTiles;
    return pairTiles.filter(
      (t) =>
        t.pair.toLowerCase().includes(q) ||
        t.base.toLowerCase().includes(q) ||
        t.quote.toLowerCase().includes(q)
    );
  }, [pairTiles, searchQuery]);

  const formatCross = (rowCurr: CurrencyCode, colCurr: CurrencyCode): string => {
    if (rowCurr === colCurr) return '1.0000';
    const val = (1 / (fxRates[rowCurr] || 1)) * (fxRates[colCurr] || 1);
    if (colCurr === 'IDR' && val > 10) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (val >= 100) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (val < 0.01) {
      return val.toFixed(6);
    }
    return val.toFixed(4);
  };

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-28 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white">
            Global Currency &amp; FX Matrix
          </h1>
          <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93] mt-0.5">
            ECB &amp; Jakarta Interbank mid-market cross rates
          </p>
        </div>

        <div className="px-3.5 py-1.5 rounded-full bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] text-xs flex items-center gap-2">
          <span className="font-semibold text-[#1C1C1E] dark:text-white">USD/IDR Ref:</span>
          <span className="text-[#16803C] dark:text-[#30D158] font-bold font-mono tabular-nums">
            {(fxRates.IDR || 0).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {/* Top Row: Interactive Converter & Major FX Pair Cards */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Interactive Converter */}
        <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5EA] dark:border-[#2C2C2E] mb-4">
              <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
                Interactive FX Converter
              </h2>
              <span className="text-xs font-semibold text-[#16803C] dark:text-[#30D158]">
                Mid-Market
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {/* From */}
              <div className="p-3.5 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="fx-send-amount"
                    className="text-[10px] text-[#6C6C70] dark:text-[#8E8E93] font-bold uppercase tracking-wider block"
                  >
                    You Send
                  </label>
                  <input
                    id="fx-send-amount"
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-transparent text-xl font-extrabold text-[#1C1C1E] dark:text-white focus:outline-none w-full font-mono tabular-nums mt-0.5"
                  />
                </div>
                <select
                  aria-label="Send currency"
                  value={fromCurr}
                  onChange={(e) => setFromCurr(e.target.value as CurrencyCode)}
                  className="bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white font-bold text-xs rounded-lg px-2.5 py-2 border border-[#D1D1D6] dark:border-[#38383A] focus:outline-none shrink-0"
                >
                  {CONVERTER_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {FX_CURRENCY_META[c].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center -my-2 z-10">
                <button
                  type="button"
                  onClick={handleSwap}
                  aria-label="Swap currencies"
                  className="w-9 h-9 rounded-full bg-white dark:bg-[#2C2C2E] hover:bg-[#E5E5EA] dark:hover:bg-[#38383A] border border-[#D1D1D6] dark:border-[#38383A] text-[#1C1C1E] dark:text-white flex items-center justify-center shadow-sm transition-colors"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>

              {/* To */}
              <div className="p-3.5 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-[#6C6C70] dark:text-[#8E8E93] font-bold uppercase tracking-wider block">
                    Recipient Gets
                  </span>
                  <div className="text-xl font-extrabold text-[#16803C] dark:text-[#30D158] font-mono tabular-nums mt-0.5 truncate">
                    {toMeta.symbol}{' '}
                    {convertedValue.toLocaleString('en-US', {
                      minimumFractionDigits: toDecimals,
                      maximumFractionDigits: toDecimals,
                    })}
                  </div>
                </div>
                <select
                  aria-label="Receive currency"
                  value={toCurr}
                  onChange={(e) => setToCurr(e.target.value as CurrencyCode)}
                  className="bg-white dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white font-bold text-xs rounded-lg px-2.5 py-2 border border-[#D1D1D6] dark:border-[#38383A] focus:outline-none shrink-0"
                >
                  {CONVERTER_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {FX_CURRENCY_META[c].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E5E5EA] dark:border-[#2C2C2E] text-xs flex items-center justify-between text-[#6C6C70] dark:text-[#8E8E93]">
            <span className="font-mono tabular-nums">
              1 {fromCurr} ={' '}
              {unitRate.toLocaleString('en-US', {
                maximumFractionDigits: unitRate > 10 ? 2 : 4,
              })}{' '}
              {toCurr}
            </span>
            <span className="text-[#16803C] dark:text-[#30D158] font-semibold">
              Zero Spread
            </span>
          </div>
        </div>

        {/* Major FX Pair Tiles */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredPairTiles.map((tile) => {
            const isGain = tile.changePercent >= 0;
            return (
              <button
                key={tile.pair}
                type="button"
                onClick={() => {
                  setFromCurr(tile.base);
                  setToCurr(tile.quote);
                }}
                className="text-left p-4 rounded-2xl bg-white dark:bg-[#1C1C1E] hover:bg-[#F2F2F7] dark:hover:bg-[#2C2C2E]/70 border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col justify-between transition-colors"
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold text-[#1C1C1E] dark:text-white">{tile.pair}</span>
                  <span
                    className={`font-semibold font-mono tabular-nums ${
                      isGain
                        ? 'text-[#16803C] dark:text-[#30D158]'
                        : 'text-[#D7261C] dark:text-[#FF453A]'
                    }`}
                  >
                    {isGain ? '+' : ''}
                    {tile.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div>
                  <span className="text-xl font-extrabold text-[#1C1C1E] dark:text-white font-mono tabular-nums">
                    {tile.rate}
                  </span>
                  <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] mt-1 font-mono tabular-nums">
                    H: {tile.high} · L: {tile.low}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Global FX Cross-Rate Correlation Matrix */}
      <section className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E5EA] dark:border-[#2C2C2E] pb-3">
          <div>
            <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white flex items-center gap-2">
              <Grid className="w-4 h-4 text-[#16803C] dark:text-[#30D158]" />
              Global FX Cross-Rate Correlation Matrix
            </h2>
            <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
              Bidirectional conversion rates across major global currencies
            </p>
          </div>
          <span className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
            Base in Rows · Target in Columns
          </span>
        </div>

        {/* Mobile Cross-Rate Summary List */}
        <div className="md:hidden divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E] text-xs font-mono tabular-nums">
          <div className="py-2.5 flex items-center justify-between">
            <span className="font-sans font-bold text-[#1C1C1E] dark:text-white">1 EUR in USD</span>
            <span className="font-bold text-[#1C1C1E] dark:text-white">${formatCross('EUR', 'USD')}</span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="font-sans font-bold text-[#1C1C1E] dark:text-white">1 GBP in USD</span>
            <span className="font-bold text-[#1C1C1E] dark:text-white">${formatCross('GBP', 'USD')}</span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="font-sans font-bold text-[#1C1C1E] dark:text-white">1 USD in JPY</span>
            <span className="font-bold text-[#1C1C1E] dark:text-white">¥{formatCross('USD', 'JPY')}</span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="font-sans font-bold text-[#1C1C1E] dark:text-white">1 USD in IDR</span>
            <span className="font-bold text-[#16803C] dark:text-[#30D158]">Rp {formatCross('USD', 'IDR')}</span>
          </div>
          <div className="py-2.5 flex items-center justify-between">
            <span className="font-sans font-bold text-[#1C1C1E] dark:text-white">1 USD in SGD</span>
            <span className="font-bold text-[#1C1C1E] dark:text-white">S$ {formatCross('USD', 'SGD')}</span>
          </div>
        </div>

        {/* Desktop/Tablet Full 6x6 Matrix */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-center text-xs">
            <thead>
              <tr className="text-[11px] font-bold text-[#6C6C70] dark:text-[#8E8E93] uppercase tracking-wider border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
                <th className="py-3 px-4 text-left">Currency</th>
                {MATRIX_CURRENCIES.map((col) => (
                  <th key={col} className="py-3 px-4">
                    {FX_CURRENCY_META[col].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E]/40 font-mono tabular-nums">
              {MATRIX_CURRENCIES.map((row) => (
                <tr
                  key={row}
                  className="hover:bg-[#F2F2F7] dark:hover:bg-[#2C2C2E]/40 transition-colors"
                >
                  <td className="py-3 px-4 text-left font-sans font-bold text-[#1C1C1E] dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#E5E5EA] dark:bg-[#2C2C2E] flex items-center justify-center font-bold text-[10px]">
                      {FX_CURRENCY_META[row].flagCode}
                    </span>
                    <span>{FX_CURRENCY_META[row].label}</span>
                  </td>
                  {MATRIX_CURRENCIES.map((col) => {
                    const isDiag = row === col;
                    const isIdrCol = col === 'IDR' && !isDiag;
                    return (
                      <td
                        key={col}
                        className={`py-3 px-4 ${
                          isDiag
                            ? 'text-[#6C6C70] dark:text-[#8E8E93] font-semibold'
                            : isIdrCol
                              ? 'text-[#16803C] dark:text-[#30D158] font-bold'
                              : 'text-[#1C1C1E] dark:text-white font-medium'
                        }`}
                      >
                        {formatCross(row, col)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
