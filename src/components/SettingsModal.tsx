import React, { useEffect } from 'react';
import {
  Activity,
  BellRing,
  Check,
  Cloud,
  CloudOff,
  Contrast,
  Gem,
  LogIn,
  LogOut,
  Minus,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { THEME_OPTIONS, THEME_STORAGE_KEY } from '../hooks/useTheme';
import { ThemeMode } from '../types/market';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onSelectTheme: (mode: ThemeMode) => void;
  isPulseActive: boolean;
  onTogglePulse: () => void;
  alertThresholdPct?: number;
  onChangeAlertThresholdPct?: (val: number) => void;
  onRefreshAll?: () => void | Promise<void>;
}

const ALERT_SLIDER_TICKS = [0.5, 1.0, 2.0, 3.5, 5.0] as const;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  themeMode,
  onSelectTheme,
  isPulseActive,
  onTogglePulse,
  alertThresholdPct = 2.0,
  onChangeAlertThresholdPct,
  onRefreshAll,
}) => {
  const { user, profileReady, authLoading, signInWithGoogle, logout } = useAuth();
  const sliderPct = Math.max(0, Math.min(100, ((alertThresholdPct - 0.5) / 4.5) * 100));
  const sensitivityLabel =
    alertThresholdPct <= 1.2
      ? 'High Sensitivity · Scalp'
      : alertThresholdPct <= 2.9
        ? 'Balanced · Intraday'
        : 'Macro Spikes Only';

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      data-testid="settings-modal"
    >
      {/* Backdrop scrim */}
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />

      {/* Modal surface */}
      <div
        className="relative z-10 w-full sm:max-w-[540px] max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl liquid-glass-strong shadow-2xl border border-[var(--border-subtle)] animate-route-enter"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        {/* Mobile grab indicator */}
        <div className="sm:hidden w-10 h-1 rounded-full bg-black/20 dark:bg-white/25 mx-auto mt-2.5" />

        {/* Header */}
        <div className="px-5 pt-4 pb-3.5 border-b border-[var(--border-divider)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
              <Settings className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="settings-modal-title"
                className="text-base font-extrabold tracking-tight text-[var(--text-primary)] truncate"
              >
                Settings
              </h2>
              <p className="text-xs text-[var(--text-muted)] truncate">
                Appearance, display grading &amp; terminal preferences
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="w-9 h-9 rounded-full liquid-glass-pill flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Dedicated Theme Switcher Section */}
          <section aria-labelledby="settings-theme-heading">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <h3
                  id="settings-theme-heading"
                  className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  Display Theme
                </h3>
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">
                Saved to local storage
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="Choose display theme"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
            >
              {THEME_OPTIONS.map((opt) => {
                const selected = opt.id === themeMode;
                const Icon =
                  opt.id === 'obsidian'
                    ? Moon
                    : opt.id === 'monochrome'
                      ? Contrast
                      : opt.id === 'parchment'
                        ? Gem
                        : Sun;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-testid={`settings-theme-${opt.id}`}
                    onClick={() => onSelectTheme(opt.id)}
                    className={`group relative flex flex-col text-left rounded-xl p-3 border transition-all min-h-[112px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                      selected
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] shadow-sm'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-inset)] hover:border-[var(--accent-primary)]/50'
                    }`}
                  >
                    {/* Miniature terminal swatch preview */}
                    <div
                      aria-hidden="true"
                      className="w-full h-11 rounded-lg border border-black/15 dark:border-white/15 overflow-hidden mb-2.5 flex flex-col justify-between p-1.5"
                      style={{
                        background:
                          opt.id === 'monochrome'
                            ? 'linear-gradient(180deg, #141416 0%, #000000 100%)'
                            : opt.swatchTop,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="h-1.5 w-8 rounded-full"
                          style={{ backgroundColor: opt.accent }}
                        />
                        <div className="flex items-center gap-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                opt.id === 'monochrome'
                                  ? '#FFFFFF'
                                  : opt.isDarkSurface
                                    ? '#34D399'
                                    : '#047857',
                            }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                opt.id === 'monochrome'
                                  ? '#71717A'
                                  : opt.isDarkSurface
                                    ? '#F87171'
                                    : '#B91C1C',
                            }}
                          />
                        </div>
                      </div>
                      <div
                        className="h-4 w-full rounded border border-black/10 dark:border-white/15"
                        style={{ backgroundColor: opt.swatchSurface }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--text-primary)]">
                        <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--accent-primary)]" />
                        {opt.label}
                      </span>
                      {selected && (
                        <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white monochrome:text-black flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[2.6]" />
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] font-semibold text-[var(--text-secondary)] mt-0.5">
                      {opt.subtitle}
                    </span>
                    <p className="text-[11px] leading-snug text-[var(--text-muted)] mt-1 line-clamp-2">
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-muted)] font-mono">
              Key: {THEME_STORAGE_KEY} · Active: {themeMode}
            </p>
          </section>

          {/* Graphical Price Alert Threshold Slider */}
          {onChangeAlertThresholdPct && (
            <section
              aria-labelledby="settings-alert-threshold-heading"
              className="pt-4 border-t border-[var(--border-divider)] space-y-3"
              data-testid="settings-alert-threshold-section"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BellRing className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                  <h3
                    id="settings-alert-threshold-heading"
                    className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]"
                  >
                    Price Alert Threshold (5m Move)
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                  {sensitivityLabel}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Trigger volatility alert when any open asset moves by
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-1.5">
                      <span
                        data-testid="alert-threshold-value"
                        className="text-xl font-black font-mono tabular-nums text-[var(--text-primary)]"
                      >
                        ±{alertThresholdPct.toFixed(1)}%
                      </span>
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">
                        within 5 min
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-label="Decrease alert threshold"
                      onClick={() =>
                        onChangeAlertThresholdPct(Math.max(0.5, Number((alertThresholdPct - 0.1).toFixed(1))))
                      }
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-center text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Increase alert threshold"
                      onClick={() =>
                        onChangeAlertThresholdPct(Math.min(5.0, Number((alertThresholdPct + 0.1).toFixed(1))))
                      }
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center justify-center text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Custom Graphical Track + Accessible Native Range Input */}
                <div className="relative h-7 flex items-center">
                  <div className="w-full h-2 rounded-full bg-black/15 dark:bg-white/15 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-75"
                      style={{ width: `${sliderPct}%` }}
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[var(--accent-primary)] border-2 border-[var(--bg-surface)] shadow-md"
                    style={{ left: `${sliderPct}%` }}
                  />
                  <input
                    type="range"
                    min={0.5}
                    max={5.0}
                    step={0.1}
                    value={alertThresholdPct}
                    onChange={(e) => onChangeAlertThresholdPct(parseFloat(e.target.value))}
                    aria-label="Price alert percentage threshold"
                    data-testid="alert-threshold-slider"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>

                {/* Interactive Quick Preset Ticks */}
                <div className="flex items-center justify-between gap-1">
                  {ALERT_SLIDER_TICKS.map((tick) => {
                    const active = Math.abs(alertThresholdPct - tick) < 0.05;
                    return (
                      <button
                        key={tick}
                        type="button"
                        onClick={() => onChangeAlertThresholdPct(tick)}
                        className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold tabular-nums transition-colors ${
                          active
                            ? 'bg-[var(--accent-primary)] text-white monochrome:text-black'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10'
                        }`}
                      >
                        {tick.toFixed(1)}%
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Feed & Session Controls */}
          <section
            aria-labelledby="settings-feed-heading"
            className="pt-4 border-t border-[var(--border-divider)] space-y-2.5"
          >
            <h3
              id="settings-feed-heading"
              className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              Live Data &amp; Sync
            </h3>

            {/* Live Stream Pulse Switch */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <Activity className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)]">
                    Real-Time Feed Pulse
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {isPulseActive
                      ? 'Streaming live market ticks for XAU/USD, BTC/USD & global quotes'
                      : 'Paused — quotes hold until manually refreshed'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPulseActive}
                onClick={onTogglePulse}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                  isPulseActive
                    ? 'bg-[var(--accent-primary)]'
                    : 'bg-black/20 dark:bg-white/20'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full shadow transition-transform ${
                    isPulseActive
                      ? 'translate-x-6 bg-white monochrome:bg-black'
                      : 'translate-x-1 bg-white'
                  }`}
                />
              </button>
            </div>

            {/* Cloud Account Sync */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5 min-w-0">
                {user && profileReady ? (
                  <Cloud className="w-4 h-4 text-[var(--gain-text)] shrink-0" />
                ) : (
                  <CloudOff className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {user ? user.displayName || user.email || 'Signed In' : 'Cloud Journal Sync'}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">
                    {user
                      ? `${user.email ?? 'Authenticated'} · Signal log & portfolio synced`
                      : 'Sign in with Google to sync signal logs & portfolios across devices'}
                  </div>
                </div>
              </div>

              {user ? (
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--loss-text)] hover:border-[var(--loss-text)]/40 transition-colors shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white monochrome:text-black text-xs font-bold transition-colors shrink-0 disabled:opacity-60"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{authLoading ? 'Signing in...' : 'Sign In'}</span>
                </button>
              )}
            </div>

            {onRefreshAll && (
              <button
                type="button"
                onClick={() => {
                  void onRefreshAll();
                  onClose();
                }}
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]/60 flex items-center justify-center gap-2 text-xs font-bold text-[var(--text-primary)] transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Force Refresh All Market Feeds</span>
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
