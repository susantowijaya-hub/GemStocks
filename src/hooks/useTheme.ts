import { useCallback, useEffect, useState } from 'react';
import { ThemeMode } from '../types/market';

export interface ThemeOptionMeta {
  id: ThemeMode;
  label: string;
  shortLabel: string;
  description: string;
  swatchTop: string;
  swatchBottom: string;
  accent: string;
  recommended?: boolean;
  isDarkSurface: boolean;
}

/**
 * Curated Terminal Themes:
 * - obsidian  : Desk Slate Pro — deep obsidian charcoal surfaces with 1px structural hairlines & #2962FF cobalt controls
 * - arctic    : Institutional Daylight — crisp #F4F6F9 canvas, pure white elevated cards & #0A2540 midnight ink legibility
 * - parchment : Warm Editorial — ivory matte surfaces with disciplined burnt-copper accents
 */
export const THEME_OPTIONS: ThemeOptionMeta[] = [
  {
    id: 'obsidian',
    label: 'Desk Slate Pro',
    shortLabel: 'Desk Slate',
    description: 'Deep obsidian terminal surfaces with 1px hairlines & cobalt controls',
    swatchTop: '#0B0E14',
    swatchBottom: '#2962FF',
    accent: '#2962FF',
    recommended: true,
    isDarkSurface: true,
  },
  {
    id: 'arctic',
    label: 'Institutional Daylight',
    shortLabel: 'Daylight',
    description: 'Crisp studio white cards on cool gray canvas with midnight ink',
    swatchTop: '#F4F6F9',
    swatchBottom: '#1D4ED8',
    accent: '#1D4ED8',
    recommended: true,
    isDarkSurface: false,
  },
  {
    id: 'parchment',
    label: 'Warm Editorial',
    shortLabel: 'Editorial',
    description: 'Matte ivory parchment hairlines with terracotta & sage telemetry',
    swatchTop: '#F4F0E6',
    swatchBottom: '#B4410E',
    accent: '#B4410E',
    isDarkSurface: false,
  },
];

const THEME_ORDER: ThemeMode[] = ['obsidian', 'arctic', 'parchment'];

function normalizeThemeMode(value: string | null): ThemeMode {
  if (value === 'obsidian' || value === 'aurora' || value === 'dark') {
    return 'obsidian';
  }
  if (value === 'arctic' || value === 'light') {
    return 'arctic';
  }
  if (value === 'parchment' || value === 'champagne' || value === 'monochrome') {
    return 'parchment';
  }
  return 'obsidian';
}

export function getThemeMeta(mode: ThemeMode): ThemeOptionMeta {
  return THEME_OPTIONS.find((t) => t.id === mode) ?? THEME_OPTIONS[0];
}

export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('stocks-theme');
      return normalizeThemeMode(saved);
    } catch {
      return 'obsidian';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    root.classList.remove(
      'obsidian',
      'arctic',
      'parchment',
      'dark',
      'light',
      'monochrome',
      'aurora',
      'champagne'
    );
    root.classList.add(themeMode);
    root.dataset.theme = themeMode;
    // Flush style recalculation synchronously before re-enabling hover/UI transitions
    void root.offsetHeight;
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        root.classList.remove('theme-switching');
      });
    });

    try {
      localStorage.setItem('stocks-theme', themeMode);
    } catch {
      // ignore storage failure
    }

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const metaColor =
        themeMode === 'obsidian'
          ? '#0B0E14'
          : themeMode === 'parchment'
            ? '#F4F0E6'
            : '#F4F6F9';
      themeMeta.setAttribute('content', metaColor);
    }

    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      root.classList.remove('theme-switching');
    };
  }, [themeMode]);

  const toggleTheme = useCallback(() => {
    setThemeMode((prev) => {
      const idx = THEME_ORDER.indexOf(prev);
      return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    });
  }, []);

  return {
    themeMode,
    setThemeMode,
    isDark: themeMode === 'obsidian',
    toggleTheme,
  };
}
