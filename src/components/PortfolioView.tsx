import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Cloud,
  Download,
  Landmark,
  PiggyBank,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_PORTFOLIO } from '../data/marketData';
import { db } from '../lib/firebase';
import { OperationType, handleFirestoreError } from '../lib/firestoreErrors';
import { MarketAsset, PortfolioPosition } from '../types/market';

const SYMBOL_REGEX = /^[A-Z0-9._\-/]+$/;
const LINKED_ID_REGEX = /^[a-zA-Z0-9_-]*$/;

interface PortfolioViewProps {
  assets: MarketAsset[];
  searchQuery: string;
}

const STORAGE_KEY = 'apple-stocks-portfolio';
const CASH_BALANCE = 18420.0;

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  assets,
  searchQuery,
}) => {
  const { user, authReady, profileReady, signInWithGoogle } = useAuth();
  const [localPositions, setLocalPositions] = useState<PortfolioPosition[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_PORTFOLIO;
  });
  const [cloudPositions, setCloudPositions] = useState<PortfolioPosition[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PortfolioPosition['category']>('Equities');
  const [units, setUnits] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [exportNotice, setExportNotice] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localPositions));
    } catch {
      // ignore
    }
  }, [localPositions]);

  // Attach Firestore real-time listener only when auth + profile are ready
  useEffect(() => {
    if (!authReady || !profileReady || !user) {
      setCloudPositions(null);
      return;
    }

    const colPath = `users/${user.uid}/positions`;
    const q = query(collection(db, colPath), where('ownerId', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs: PortfolioPosition[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            symbol: String(data.symbol || ''),
            name: String(data.name || ''),
            category: (data.category as PortfolioPosition['category']) || 'Equities',
            units: Number(data.units) || 0,
            avgCost: Number(data.avgCost) || 0,
            currentPrice: Number(data.currentPrice) || 0,
            linkedAssetId: data.linkedAssetId ? String(data.linkedAssetId) : undefined,
          };
        });
        setCloudPositions(docs);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, colPath);
      }
    );

    return () => unsubscribe();
  }, [authReady, profileReady, user]);

  const positions = user && cloudPositions !== null ? cloudPositions : localPositions;

  // Sync linked positions (and matching symbols like SPX, BTC, ETH, XAU, IHSG) with live prices
  const syncedPositions = useMemo(() => {
    return positions.map((pos) => {
      const sym = pos.symbol.toUpperCase();
      const liveAsset =
        (pos.linkedAssetId ? assets.find((a) => a.id === pos.linkedAssetId) : undefined) ||
        assets.find(
          (a) =>
            a.symbol.toUpperCase() === sym ||
            a.id.toUpperCase() === sym ||
            (sym === 'BTC' && a.id === 'BTCUSD') ||
            (sym === 'ETH' && a.id === 'ETHUSD') ||
            (sym === 'XAU' && a.id === 'XAUUSD')
        );
      if (!liveAsset) return pos;
      return { ...pos, currentPrice: liveAsset.price };
    });
  }, [positions, assets]);

  const filteredPositions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return syncedPositions;
    return syncedPositions.filter(
      (p) =>
        p.symbol.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [syncedPositions, searchQuery]);

  const totals = useMemo(() => {
    let holdingsVal = 0;
    let holdingsCost = 0;
    let todayPl = 0;
    const byCat: Record<PortfolioPosition['category'], number> = {
      Equities: 0,
      Crypto: 0,
      Commodities: 0,
      'Cash & FX': CASH_BALANCE,
    };

    syncedPositions.forEach((p) => {
      const val = p.units * p.currentPrice;
      const cost = p.units * p.avgCost;
      holdingsVal += val;
      holdingsCost += cost;
      byCat[p.category] = (byCat[p.category] ?? 0) + val;

      const sym = p.symbol.toUpperCase();
      const liveAsset =
        (p.linkedAssetId ? assets.find((a) => a.id === p.linkedAssetId) : undefined) ||
        assets.find(
          (a) =>
            a.symbol.toUpperCase() === sym ||
            a.id.toUpperCase() === sym ||
            (sym === 'BTC' && a.id === 'BTCUSD') ||
            (sym === 'ETH' && a.id === 'ETHUSD') ||
            (sym === 'XAU' && a.id === 'XAUUSD')
        );
      if (liveAsset) {
        todayPl += p.units * (liveAsset.price - liveAsset.prevClose);
      }
    });

    const netWorth = holdingsVal + CASH_BALANCE;
    const totalCost = holdingsCost + CASH_BALANCE;
    const unrealizedPl = holdingsVal - holdingsCost;
    const returnPct = holdingsCost > 0 ? (unrealizedPl / holdingsCost) * 100 : 0;
    const prevNetWorth = netWorth - todayPl;
    const todayPct = prevNetWorth > 0 ? (todayPl / prevNetWorth) * 100 : 0;

    return { netWorth, totalCost, unrealizedPl, returnPct, todayPl, todayPct, byCat };
  }, [syncedPositions, assets]);

  // SVG Ring segments
  const ringSegments = useMemo(() => {
    const circumference = 2 * Math.PI * 40;
    const total = totals.netWorth || 1;
    const entries: { label: string; value: number; color: string }[] = [
      { label: 'Equities', value: totals.byCat.Equities, color: '#0071E3' },
      { label: 'Crypto', value: totals.byCat.Crypto, color: '#30D158' },
      { label: 'Commodities', value: totals.byCat.Commodities, color: '#FF9F0A' },
      { label: 'Cash & FX', value: totals.byCat['Cash & FX'], color: '#BF5AF2' },
    ];

    let offsetAcc = 0;
    return entries.map((entry) => {
      const pct = Math.max(0, entry.value / total);
      const segLen = pct * circumference;
      const rotationDeg = (offsetAcc / total) * 360;
      offsetAcc += entry.value;
      return {
        ...entry,
        pct: Math.round(pct * 100),
        dasharray: `${segLen.toFixed(2)} ${circumference.toFixed(2)}`,
        rotationDeg,
      };
    });
  }, [totals]);

  const openAddModal = () => {
    setEditingId(null);
    setFormError(null);
    setSymbol('');
    setName('');
    setCategory('Equities');
    setUnits('');
    setAvgCost('');
    setCurrentPrice('');
    setModalOpen(true);
  };

  const openEditModal = (pos: PortfolioPosition) => {
    setEditingId(pos.id);
    setFormError(null);
    setSymbol(pos.symbol);
    setName(pos.name);
    setCategory(pos.category);
    setUnits(String(pos.units));
    setAvgCost(String(pos.avgCost));
    setCurrentPrice(String(pos.currentPrice));
    setModalOpen(true);
  };

  const handleSeedCloud = async () => {
    if (!user || !profileReady) return;
    setSaving(true);
    const colPath = `users/${user.uid}/positions`;
    try {
      const batch = writeBatch(db);
      const sourceList = localPositions.length > 0 ? localPositions : DEFAULT_PORTFOLIO;
      sourceList.forEach((item, idx) => {
        const docId = `pos_${Date.now()}_${idx}`;
        const cleanSym = item.symbol.toUpperCase().replace(/[^A-Z0-9._\-/]/g, '').slice(0, 20) || 'ASSET';
        const payload: Record<string, unknown> = {
          ownerId: user.uid,
          symbol: cleanSym,
          name: item.name.trim().slice(0, 120),
          category: item.category,
          units: Math.max(0, Number(item.units) || 0),
          avgCost: Math.max(0, Number(item.avgCost) || 0),
          currentPrice: Math.max(0, Number(item.currentPrice) || 0),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (item.linkedAssetId && LINKED_ID_REGEX.test(item.linkedAssetId)) {
          payload.linkedAssetId = item.linkedAssetId.slice(0, 32);
        }
        batch.set(doc(db, 'users', user.uid, 'positions', docId), payload);
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, colPath);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleanSymbol = symbol.trim().toUpperCase().slice(0, 20);
    const cleanName = name.trim().slice(0, 120);
    const parsedUnits = Math.max(0, parseFloat(units) || 0);
    const parsedCost = Math.max(0, parseFloat(avgCost) || 0);
    const parsedPrice = Math.max(0, parseFloat(currentPrice) || 0);

    if (!cleanSymbol || !SYMBOL_REGEX.test(cleanSymbol)) {
      setFormError('Symbol must use uppercase letters, numbers, or . _ - / (max 20 chars).');
      return;
    }
    if (!cleanName) {
      setFormError('Asset name is required.');
      return;
    }

    if (user && profileReady) {
      setSaving(true);
      const posId = editingId || `pos_${Date.now()}`;
      const docPath = `users/${user.uid}/positions/${posId}`;
      try {
        if (editingId) {
          await updateDoc(doc(db, 'users', user.uid, 'positions', posId), {
            symbol: cleanSymbol,
            name: cleanName,
            category,
            units: parsedUnits,
            avgCost: parsedCost,
            currentPrice: parsedPrice,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, 'users', user.uid, 'positions', posId), {
            ownerId: user.uid,
            symbol: cleanSymbol,
            name: cleanName,
            category,
            units: parsedUnits,
            avgCost: parsedCost,
            currentPrice: parsedPrice,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        setModalOpen(false);
      } catch (error) {
        handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, docPath);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (editingId) {
      setLocalPositions((prev) =>
        prev.map((p) =>
          p.id === editingId
            ? {
                ...p,
                symbol: cleanSymbol,
                name: cleanName,
                category,
                units: parsedUnits,
                avgCost: parsedCost,
                currentPrice: parsedPrice,
                linkedAssetId: undefined,
              }
            : p
        )
      );
    } else {
      const newPos: PortfolioPosition = {
        id: `pos-${Date.now()}`,
        symbol: cleanSymbol,
        name: cleanName,
        category,
        units: parsedUnits,
        avgCost: parsedCost,
        currentPrice: parsedPrice,
      };
      setLocalPositions((prev) => [newPos, ...prev]);
    }
    setModalOpen(false);
  };

  const handleDelete = async () => {
    if (!editingId) return;
    if (user && profileReady) {
      setSaving(true);
      const docPath = `users/${user.uid}/positions/${editingId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'positions', editingId));
        setModalOpen(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, docPath);
      } finally {
        setSaving(false);
      }
      return;
    }
    setLocalPositions((prev) => prev.filter((p) => p.id !== editingId));
    setModalOpen(false);
  };

  const handleExportCsv = () => {
    const header = 'Symbol,Name,Category,Units,AvgCost,CurrentPrice,MarketValue,PnL\n';
    const rows = syncedPositions
      .map((p) => {
        const val = p.units * p.currentPrice;
        const pl = val - p.units * p.avgCost;
        return `${p.symbol},"${p.name}",${p.category},${p.units},${p.avgCost},${p.currentPrice},${val.toFixed(2)},${pl.toFixed(2)}`;
      })
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stocks-portfolio-holdings.csv';
    a.click();
    URL.revokeObjectURL(url);
    setExportNotice(true);
    window.setTimeout(() => setExportNotice(false), 2500);
  };

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-28 flex flex-col gap-6">
      {/* Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C1C1E] dark:text-white">
            Portfolio &amp; Holdings
          </h1>
          <p className="text-xs sm:text-sm text-[#6C6C70] dark:text-[#8E8E93] mt-0.5">
            Real-time valuation synced with live market feed
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user && cloudPositions !== null && cloudPositions.length === 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSeedCloud()}
              className="min-h-[40px] px-4 py-2 rounded-full bg-white dark:bg-[#1C1C1E] border border-[#D1D1D6] dark:border-[#2C2C2E] text-xs font-semibold text-[#1C1C1E] dark:text-white flex items-center gap-1.5 hover:border-[#0071E3] transition-colors"
            >
              <Cloud className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
              <span>{saving ? 'Syncing...' : 'Import Local Holdings'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={openAddModal}
            className="min-h-[40px] px-4 py-2 rounded-full bg-[#0071E3] dark:bg-[#0A84FF] text-white text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Position</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs text-[#6C6C70] dark:text-[#8E8E93]">
            <span className="font-semibold">Total Net Worth</span>
            <Landmark className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#1C1C1E] dark:text-white tabular-nums font-mono">
              ${totals.netWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <span
                className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold tabular-nums font-mono ${
                  totals.todayPl >= 0
                    ? 'bg-[#30D158]/15 text-[#16803C] dark:text-[#30D158]'
                    : 'bg-[#FF453A]/15 text-[#D7261C] dark:text-[#FF453A]'
                }`}
              >
                {totals.todayPl >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {totals.todayPl >= 0 ? '+$' : '-$'}
                {Math.abs(totals.todayPl).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                ({totals.todayPct >= 0 ? '+' : ''}
                {totals.todayPct.toFixed(2)}%)
              </span>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">Today</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs text-[#6C6C70] dark:text-[#8E8E93]">
            <span className="font-semibold">Unrealized Total P&amp;L</span>
            <TrendingUp className="w-4 h-4 text-[#16803C] dark:text-[#30D158]" />
          </div>
          <div>
            <p
              className={`text-2xl sm:text-3xl font-extrabold tabular-nums font-mono ${
                totals.unrealizedPl >= 0
                  ? 'text-[#16803C] dark:text-[#30D158]'
                  : 'text-[#D7261C] dark:text-[#FF453A]'
              }`}
            >
              {totals.unrealizedPl >= 0 ? '+$' : '-$'}
              {Math.abs(totals.unrealizedPl).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <span
                className={`font-bold tabular-nums font-mono ${
                  totals.returnPct >= 0
                    ? 'text-[#16803C] dark:text-[#30D158]'
                    : 'text-[#D7261C] dark:text-[#FF453A]'
                }`}
              >
                {totals.returnPct >= 0 ? '+' : ''}
                {totals.returnPct.toFixed(2)}%
              </span>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">All-time return</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs text-[#6C6C70] dark:text-[#8E8E93]">
            <span className="font-semibold">Total Cost Basis</span>
            <Wallet className="w-4 h-4 text-[#6C6C70] dark:text-[#8E8E93]" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#1C1C1E] dark:text-white tabular-nums font-mono">
              ${totals.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93] mt-1.5">
              Invested across {syncedPositions.length} positions
            </p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs text-[#6C6C70] dark:text-[#8E8E93]">
            <span className="font-semibold">Available Cash (USD)</span>
            <PiggyBank className="w-4 h-4 text-[#0071E3] dark:text-[#0A84FF]" />
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-[#1C1C1E] dark:text-white tabular-nums font-mono">
              ${CASH_BALANCE.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <span className="text-[#16803C] dark:text-[#30D158] font-semibold">4.85% APY</span>
              <span className="text-[#6C6C70] dark:text-[#8E8E93]">Sweep interest</span>
            </div>
          </div>
        </div>
      </section>

      {/* Two-Column Allocation Ring & Positions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Allocation Ring */}
        <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
            <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
              Asset Class Allocation
            </h2>
            <span className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">Ring Breakdown</span>
          </div>

          <div className="flex items-center justify-center my-6 relative">
            <svg className="w-44 h-44 sm:w-48 sm:h-48 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="currentColor"
                className="text-[#E5E5EA] dark:text-white/10"
                strokeWidth="12"
              />
              {ringSegments.map((seg) => (
                <circle
                  key={seg.label}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth="12"
                  strokeDasharray={seg.dasharray}
                  strokeLinecap="butt"
                  style={{
                    transform: `rotate(${seg.rotationDeg}deg)`,
                    transformOrigin: 'center',
                  }}
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              <span className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] font-semibold">
                Total
              </span>
              <span className="text-lg font-extrabold text-[#1C1C1E] dark:text-white tabular-nums font-mono">
                ${(totals.netWorth / 1000).toFixed(1)}K
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs pt-4 border-t border-[#E5E5EA] dark:border-[#2C2C2E]">
            {ringSegments.map((seg) => (
              <div
                key={seg.label}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#E5E5EA] dark:border-[#2C2C2E]/60"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="text-[#1C1C1E] dark:text-white font-medium truncate">
                    {seg.label} ({seg.pct}%)
                  </span>
                </span>
                <span className="font-bold text-[#1C1C1E] dark:text-white tabular-nums font-mono ml-1">
                  ${Math.round(seg.value).toLocaleString('en-US')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Holdings Table (Desktop/Tablet) & Touch Cards (Mobile) */}
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5EA] dark:border-[#2C2C2E] mb-4">
              <div>
                <h2 className="text-base font-bold text-[#1C1C1E] dark:text-white">
                  Active Positions &amp; Allocations
                </h2>
                <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
                  Tap any position to edit units or cost basis
                </p>
              </div>
              <span className="text-xs font-semibold text-[#6C6C70] dark:text-[#8E8E93]">
                {filteredPositions.length} Assets
              </span>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden flex flex-col gap-2.5">
              {filteredPositions.map((pos) => {
                const val = pos.units * pos.currentPrice;
                const cost = pos.units * pos.avgCost;
                const pl = val - cost;
                const pct = cost > 0 ? (pl / cost) * 100 : 0;
                const isGain = pl >= 0;

                return (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => openEditModal(pos)}
                    className="w-full text-left p-3.5 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#E5E5EA] dark:border-[#2C2C2E] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-lg bg-white dark:bg-[#2C2C2E] border border-[#E5E5EA] dark:border-[#38383A] flex items-center justify-center font-bold text-xs text-[#1C1C1E] dark:text-white shrink-0">
                        {pos.symbol}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-[#1C1C1E] dark:text-white truncate">
                          {pos.name}
                        </p>
                        <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] mt-0.5 tabular-nums">
                          {pos.units} units · Cost ${pos.avgCost.toLocaleString('en-US')}
                        </p>
                      </div>
                    </div>

                    <div className="text-right tabular-nums font-mono shrink-0">
                      <p className="text-xs font-bold text-[#1C1C1E] dark:text-white">
                        ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <span
                        className={`text-[11px] font-bold ${
                          isGain
                            ? 'text-[#16803C] dark:text-[#30D158]'
                            : 'text-[#D7261C] dark:text-[#FF453A]'
                        }`}
                      >
                        {isGain ? '+' : '-'}$
                        {Math.abs(pl).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        ({isGain ? '+' : ''}
                        {pct.toFixed(1)}%)
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop/Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[11px] font-semibold text-[#6C6C70] dark:text-[#8E8E93] uppercase tracking-wider border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
                    <th className="py-2.5 font-semibold">Asset</th>
                    <th className="py-2.5 font-semibold text-right">Holdings</th>
                    <th className="py-2.5 font-semibold text-right">Avg Cost</th>
                    <th className="py-2.5 font-semibold text-right">Current</th>
                    <th className="py-2.5 font-semibold text-right">Value</th>
                    <th className="py-2.5 font-semibold text-right">Total P&amp;L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5EA] dark:divide-[#2C2C2E]/40 tabular-nums font-mono">
                  {filteredPositions.map((pos) => {
                    const val = pos.units * pos.currentPrice;
                    const cost = pos.units * pos.avgCost;
                    const pl = val - cost;
                    const pct = cost > 0 ? (pl / cost) * 100 : 0;
                    const isGain = pl >= 0;

                    return (
                      <tr
                        key={pos.id}
                        onClick={() => openEditModal(pos)}
                        className="hover:bg-[#F2F2F7] dark:hover:bg-[#2C2C2E]/40 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 font-sans">
                          <div className="flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-lg bg-[#F2F2F7] dark:bg-[#2C2C2E] flex items-center justify-center font-bold text-[#1C1C1E] dark:text-white text-xs shrink-0">
                              {pos.symbol}
                            </span>
                            <div>
                              <p className="font-bold text-[#1C1C1E] dark:text-white group-hover:text-[#0071E3] dark:group-hover:text-[#0A84FF] transition-colors">
                                {pos.name}
                              </p>
                              <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93]">
                                {pos.category}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-right text-[#1C1C1E] dark:text-white font-medium">
                          {pos.units.toLocaleString('en-US')}
                        </td>
                        <td className="py-3 text-right text-[#6C6C70] dark:text-[#8E8E93]">
                          ${pos.avgCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-right text-[#1C1C1E] dark:text-white font-bold">
                          ${pos.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-right text-[#1C1C1E] dark:text-white font-bold">
                          ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-right">
                          <span
                            className={`font-bold ${
                              isGain
                                ? 'text-[#16803C] dark:text-[#30D158]'
                                : 'text-[#D7261C] dark:text-[#FF453A]'
                            }`}
                          >
                            {isGain ? '+' : '-'}$
                            {Math.abs(pl).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            ({isGain ? '+' : ''}
                            {pct.toFixed(1)}%)
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredPositions.length === 0 && (
              <div className="py-10 text-center text-xs text-[#6C6C70] dark:text-[#8E8E93]">
                No positions match your search filter.
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-[#E5E5EA] dark:border-[#2C2C2E] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6C6C70] dark:text-[#8E8E93]">
            {user ? (
              <span className="inline-flex items-center gap-1.5 text-[#16803C] dark:text-[#30D158] font-medium">
                <Cloud className="w-3.5 h-3.5" />
                Synced to your Google account across devices
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-1.5 text-[#0071E3] dark:text-[#0A84FF] font-medium hover:underline"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Sign in with Google to sync holdings across devices</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              className="text-[#0071E3] dark:text-[#0A84FF] hover:underline font-semibold inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportNotice ? 'Downloaded CSV' : 'Export P&L CSV'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Add / Edit Modal (Bottom Sheet on mobile, centered dialog on sm+) */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-white dark:bg-[#1C1C1E] border border-[#E5E5EA] dark:border-[#2C2C2E] rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl flex flex-col gap-4 pb-safe">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5EA] dark:border-[#2C2C2E]">
              <div>
                <h3 className="text-lg font-bold text-[#1C1C1E] dark:text-white">
                  {editingId ? 'Edit Position' : 'Add New Position'}
                </h3>
                <p className="text-xs text-[#6C6C70] dark:text-[#8E8E93]">
                  Track asset holdings and cost basis
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="w-8 h-8 rounded-full bg-[#E5E5EA] dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-3.5 text-xs">
              {formError && (
                <div className="p-2.5 rounded-xl bg-[#FF453A]/10 border border-[#FF453A]/30 text-[#D7261C] dark:text-[#FF453A] text-[11px] font-medium">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-[11px] font-bold text-[#6C6C70] dark:text-[#8E8E93] mb-1">
                  Asset Symbol
                </label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="e.g. NVDA, AAPL, BTC, IHSG"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#D1D1D6] dark:border-[#2C2C2E] text-[#1C1C1E] dark:text-white font-semibold uppercase focus:outline-none focus:border-[#0071E3] dark:focus:border-[#0A84FF]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#6C6C70] dark:text-[#8E8E93] mb-1">
                  Asset Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Nvidia Corporation"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#D1D1D6] dark:border-[#2C2C2E] text-[#1C1C1E] dark:text-white focus:outline-none focus:border-[#0071E3] dark:focus:border-[#0A84FF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#6C6C70] dark:text-[#8E8E93] mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as PortfolioPosition['category'])
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#D1D1D6] dark:border-[#2C2C2E] text-[#1C1C1E] dark:text-white focus:outline-none focus:border-[#0071E3] dark:focus:border-[#0A84FF]"
                  >
                    <option value="Equities">Equities</option>
                    <option value="Crypto">Crypto</option>
                    <option value="Commodities">Commodities</option>
                    <option value="Cash & FX">Cash &amp; FX</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#6C6C70] dark:text-[#8E8E93] mb-1">
                    Units / Holdings
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    placeholder="e.g. 25.0"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#D1D1D6] dark:border-[#2C2C2E] text-[#1C1C1E] dark:text-white font-mono tabular-nums focus:outline-none focus:border-[#0071E3] dark:focus:border-[#0A84FF]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#6C6C70] dark:text-[#8E8E93] mb-1">
                    Average Cost ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={avgCost}
                    onChange={(e) => setAvgCost(e.target.value)}
                    placeholder="e.g. 115.50"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#D1D1D6] dark:border-[#2C2C2E] text-[#1C1C1E] dark:text-white font-mono tabular-nums focus:outline-none focus:border-[#0071E3] dark:focus:border-[#0A84FF]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#6C6C70] dark:text-[#8E8E93] mb-1">
                    Current Price ($)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    placeholder="e.g. 142.30"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F2F2F7] dark:bg-black/40 border border-[#D1D1D6] dark:border-[#2C2C2E] text-[#1C1C1E] dark:text-white font-mono tabular-nums focus:outline-none focus:border-[#0071E3] dark:focus:border-[#0A84FF]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#E5E5EA] dark:border-[#2C2C2E] mt-1">
                {editingId ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-[#D7261C] dark:text-[#FF453A] hover:bg-[#FF453A]/10 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6C6C70] dark:text-[#8E8E93]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0071E3] dark:bg-[#0A84FF] text-white shadow-sm"
                  >
                    Save Position
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
