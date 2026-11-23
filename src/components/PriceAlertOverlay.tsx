import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, BellRing, CheckCheck, Trash2, TrendingDown, TrendingUp, X, Zap } from 'lucide-react';
import { PriceAlertItem } from '../types/market';

function formatAlertValue(
  value: number,
  decimals: number,
  currencyPrefix?: string,
  unitSuffix?: string
): string {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${currencyPrefix ?? ''}${formatted}${unitSuffix ?? ''}`;
}

function formatWibClock(ts: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

export const PriceAlertToastStack: React.FC<{
  toasts: PriceAlertItem[];
  onDismiss: (id: string) => void;
  onSelectAlert: (alert: PriceAlertItem) => void;
}> = ({ toasts, onDismiss, onSelectAlert }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-24 right-4 z-50 flex flex-col gap-2.5 w-[min(350px,calc(100vw-2rem))] pointer-events-none"
      aria-live="polite"
      aria-label="Live price volatility notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const isSurge = toast.direction === 'surge';
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto rounded-2xl liquid-glass-strong p-3.5 shadow-xl border border-black/10 dark:border-white/20 flex items-start gap-3 cursor-pointer hover:brightness-[0.98] dark:hover:brightness-110 transition-all"
              onClick={() => onSelectAlert(toast)}
            >
              <span
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                  isSurge
                    ? 'bg-[#22C55E]/16 border-[#22C55E]/35 text-[#0F7033] dark:text-[#4ADE80]'
                    : 'bg-[#EF4444]/16 border-[#EF4444]/35 text-[#C41C16] dark:text-[#FF6B63]'
                }`}
              >
                {isSurge ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-extrabold text-[#1C1C1E] dark:text-white truncate">
                      {toast.symbol}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6C6C70] dark:text-[#B4B8C4]">
                      5m Alert
                    </span>
                  </div>
                  <span
                    className={`font-mono font-extrabold text-xs tabular-nums ${
                      isSurge
                        ? 'text-[#0F7033] dark:text-[#4ADE80]'
                        : 'text-[#C41C16] dark:text-[#FF6B63]'
                    }`}
                  >
                    {toast.movePercent > 0 ? `+${toast.movePercent.toFixed(2)}%` : `${toast.movePercent.toFixed(2)}%`}
                  </span>
                </div>

                <p className="text-[11px] text-[#4A4D57] dark:text-[#C7CBD6] mt-0.5 leading-snug">
                  {isSurge ? 'Surged' : 'Dropped'}{' '}
                  <span className="font-mono font-bold tabular-nums">
                    {Math.abs(toast.movePercent).toFixed(2)}%
                  </span>{' '}
                  in {toast.windowMinutes}m:{' '}
                  <span className="font-mono tabular-nums font-semibold">
                    {formatAlertValue(
                      toast.fromPrice,
                      toast.decimals,
                      toast.currencyPrefix,
                      toast.unitSuffix
                    )}
                  </span>{' '}
                  →{' '}
                  <span className="font-mono tabular-nums font-bold text-[#1C1C1E] dark:text-white">
                    {formatAlertValue(
                      toast.toPrice,
                      toast.decimals,
                      toast.currencyPrefix,
                      toast.unitSuffix
                    )}
                  </span>
                </p>

                <div className="text-[10px] font-mono text-[#6C6C70] dark:text-[#8E8E93] mt-1">
                  {formatWibClock(toast.triggeredAt)} WIB · Tap to inspect chart
                </div>
              </div>

              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(toast.id);
                }}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export const PriceAlertDrawer: React.FC<{
  open: boolean;
  alerts: PriceAlertItem[];
  unreadCount: number;
  activeAssetId?: string;
  onClose: () => void;
  onSelectAlert: (alert: PriceAlertItem) => void;
  onMarkAllRead: () => void;
  onClearAlerts: () => void;
  onTriggerTestAlert: (assetId?: string) => void;
}> = ({
  open,
  alerts,
  unreadCount,
  activeAssetId,
  onClose,
  onSelectAlert,
  onMarkAllRead,
  onClearAlerts,
  onTriggerTestAlert,
}) => {
  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl liquid-glass-strong p-4 flex flex-col gap-3 border border-[#E5E5EA] dark:border-[#1E3142] shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-black/8 dark:border-white/10">
        <div className="flex items-center gap-2">
          {unreadCount > 0 ? (
            <BellRing className="w-4 h-4 text-[#D97706] dark:text-[#FBBF24]" />
          ) : (
            <Bell className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8]" />
          )}
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-[#1C1C1E] dark:text-white">
              Real-Time 5-Minute Move Alerts (&ge; 2.0% Confirmed)
            </h3>
            <p className="text-[11px] text-[#6C6C70] dark:text-[#94B0C4]">
              Triggers on active sessions only after two confirming samples verify a &ge; 2.0% 5-minute move
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onTriggerTestAlert(activeAssetId)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg liquid-glass-pill text-[11px] font-semibold text-[#0071E3] dark:text-[#3898FF] hover:brightness-95 dark:hover:brightness-110 transition-all"
            title="Trigger a sample >2% 5-minute alert preview"
          >
            <Zap className="w-3 h-3" />
            Test Alert
          </button>
          {alerts.length > 0 && (
            <>
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg liquid-glass-pill text-[11px] font-semibold text-[#4A4D57] dark:text-[#C7CBD6] hover:text-[#1C1C1E] dark:hover:text-white"
              >
                <CheckCheck className="w-3 h-3" />
                Mark read
              </button>
              <button
                type="button"
                onClick={onClearAlerts}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg liquid-glass-pill text-[11px] font-semibold text-[#C41C16] dark:text-[#FF6B63]"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close alerts panel"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6C6C70] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="py-5 px-3 text-center flex flex-col items-center gap-1.5">
          <p className="text-xs font-semibold text-[#1C1C1E] dark:text-white">
            No &gt; 2.0% moves triggered in the active 5-minute window
          </p>
          <p className="text-[11px] text-[#6C6C70] dark:text-[#8E8E93] max-w-md">
            Alerts fire automatically whenever any index, commodity, FX pair, or crypto benchmark surges or drops at least 2.0% within 5 minutes.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-black/6 dark:divide-white/10 max-h-[260px] overflow-y-auto">
          {alerts.map((alert) => {
            const isSurge = alert.direction === 'surge';
            return (
              <button
                key={alert.id}
                type="button"
                onClick={() => onSelectAlert(alert)}
                className={`w-full text-left py-2.5 px-2 rounded-lg flex items-center justify-between gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                  alert.read ? 'opacity-75' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isSurge
                        ? 'bg-[#22C55E]/16 text-[#0F7033] dark:text-[#4ADE80]'
                        : 'bg-[#EF4444]/16 text-[#C41C16] dark:text-[#FF6B63]'
                    }`}
                  >
                    {isSurge ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-[#1C1C1E] dark:text-white">
                        {alert.symbol}
                      </span>
                      <span className="text-[11px] text-[#6C6C70] dark:text-[#B4B8C4] truncate">
                        {alert.name}
                      </span>
                      {!alert.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] dark:bg-[#3898FF]" />
                      )}
                    </div>
                    <p className="text-[11px] font-mono tabular-nums text-[#4A4D57] dark:text-[#C7CBD6]">
                      {formatAlertValue(
                        alert.fromPrice,
                        alert.decimals,
                        alert.currencyPrefix,
                        alert.unitSuffix
                      )}{' '}
                      →{' '}
                      {formatAlertValue(
                        alert.toPrice,
                        alert.decimals,
                        alert.currencyPrefix,
                        alert.unitSuffix
                      )}{' '}
                      ({alert.windowMinutes}m window)
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className={`text-xs font-extrabold font-mono tabular-nums ${
                      isSurge
                        ? 'text-[#0F7033] dark:text-[#4ADE80]'
                        : 'text-[#C41C16] dark:text-[#FF6B63]'
                    }`}
                  >
                    {alert.movePercent > 0
                      ? `+${alert.movePercent.toFixed(2)}%`
                      : `${alert.movePercent.toFixed(2)}%`}
                  </div>
                  <div className="text-[10px] font-mono text-[#6C6C70] dark:text-[#8E8E93]">
                    {formatWibClock(alert.triggeredAt)} WIB
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};
