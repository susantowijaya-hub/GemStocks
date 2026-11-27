import React, { useEffect } from 'react';
import {
  Activity,
  Check,
  Cloud,
  CloudOff,
  Gem,
  Layers,
  LogIn,
  LogOut,
  Moon,
  Palette,
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
  onRefreshAll?: () => void | Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  themeMode,
  onSelectTheme,
  isPulseActive,
  onTogglePulse,
  onRefreshAll,
}) => {
  const { user, profileReady, authLoading, signInWithGoogle, logout } = useAuth();

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
                    : opt.id === 'velvet'
                      ? Layers
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
                          opt.id === 'velvet'
                            ? 'radial-gradient(ellipse 90% 60% at 50% -15%, rgba(249, 87, 75, 0.34), transparent 72%), #0D0B14'
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
                            style={{ backgroundColor: opt.isDarkSurface ? '#34D399' : '#047857' }}
                          />
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                opt.id === 'velvet'
                                  ? '#FB6B62'
                                  : opt.isDarkSurface
                                    ? '#F87171'
                                    : '#B91C1C',
                            }}
                          />
                        </div>
                      </div>
                      <div
                        className="h-4 w-full rounded border border-black/10 dark:border-white/10"
                        style={{ backgroundColor: opt.swatchSurface }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--text-primary)]">
                        <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--accent-primary)]" />
                        {opt.label}
                      </span>
                      {selected && (
                        <span className="w-5 h-5 rounded-full bg-[var(--accent-primary)] text-white flex items-center justify-center shrink-0">
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
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    isPulseActive ? 'translate-x-6' : 'translate-x-1'
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
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition-colors shrink-0 disabled:opacity-60"
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
