import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeMode } from '../types/market';

export interface ThemeOptionMeta {
  id: ThemeMode;
  label: string;
  shortLabel: string;
  subtitle: string;
  description: string;
  swatchTop: string;
  swatchSurface: string;
  swatchBottom: string;
  accent: string;
  recommended?: boolean;
  isDarkSurface: boolean;
}

export const THEME_STORAGE_KEY = 'stocks-theme';

/**
 * Curated Terminal Themes:
 * - obsidian  : Deep charcoal surfaces with 1px structural hairlines & cobalt controls
 * - arctic    : Crisp studio daylight canvas, pure white elevated cards & midnight ink
 * - parchment : Matte warm ivory editorial surfaces with burnt-copper accents
 * - velvet    : Nodeka-inspired midnight-plum surfaces with smoked cards & vermilion coral accents
 */
export const THEME_OPTIONS: ThemeOptionMeta[] = [
  {
    id: 'obsidian',
    label: 'Obsidian',
    shortLabel: 'Obsidian',
    subtitle: 'Night Desk',
    description: 'Deep charcoal surfaces, low-glare off-white ink & cobalt controls',
    swatchTop: '#0B0E14',
    swatchSurface: '#131722',
    swatchBottom: '#2962FF',
    accent: '#2962FF',
    recommended: true,
    isDarkSurface: true,
  },
  {
    id: 'velvet',
    label: 'Velvet',
    shortLabel: 'Velvet',
    subtitle: 'Calm Coral',
    description: 'Midnight-plum smoked surfaces with warm alabaster ink & vermilion coral focus',
    swatchTop: '#0D0B14',
    swatchSurface: '#161320',
    swatchBottom: '#F9574B',
    accent: '#F9574B',
    recommended: true,
    isDarkSurface: true,
  },
  {
    id: 'arctic',
    label: 'Arctic',
    shortLabel: 'Arctic',
    subtitle: 'Daylight Studio',
    description: 'Crisp studio white cards on cool slate canvas with midnight ink',
    swatchTop: '#F4F6F9',
    swatchSurface: '#FFFFFF',
    swatchBottom: '#1D4ED8',
    accent: '#1D4ED8',
    recommended: true,
    isDarkSurface: false,
  },
  {
    id: 'parchment',
    label: 'Parchment',
    shortLabel: 'Parchment',
    subtitle: 'Warm Editorial',
    description: 'Anti-glare matte ivory canvas with sepia charcoal & copper accents',
    swatchTop: '#F4F0E6',
    swatchSurface: '#FDFBF7',
    swatchBottom: '#B4410E',
    accent: '#B4410E',
    isDarkSurface: false,
  },
];

const THEME_ORDER: ThemeMode[] = ['obsidian', 'velvet', 'arctic', 'parchment'];

function normalizeThemeMode(value: string | null): ThemeMode {
  if (value === 'obsidian' || value === 'aurora' || value === 'dark') {
    return 'obsidian';
  }
  if (value === 'velvet' || value === 'nodeka') {
    return 'velvet';
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
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return normalizeThemeMode(saved);
    } catch {
      return 'obsidian';
    }
  });

  const isFirstMountRef = useRef(true);

  useEffect(() => {
    const root = document.documentElement;
    let transitionTimer: number | null = null;

    if (!isFirstMountRef.current) {
      root.classList.add('theme-transition');
      transitionTimer = window.setTimeout(() => {
        root.classList.remove('theme-transition');
      }, 240);
    } else {
      isFirstMountRef.current = false;
    }

    root.classList.remove(
      'obsidian',
      'velvet',
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

    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // ignore storage failure
    }

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const metaColor =
        themeMode === 'obsidian'
          ? '#0B0E14'
          : themeMode === 'velvet'
            ? '#0D0B14'
            : themeMode === 'parchment'
              ? '#F4F0E6'
              : '#F4F6F9';
      themeMeta.setAttribute('content', metaColor);
    }

    return () => {
      if (transitionTimer !== null) {
        window.clearTimeout(transitionTimer);
      }
      root.classList.remove('theme-transition');
    };
  }, [themeMode]);

  // Synchronize theme preference across open browser tabs
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = normalizeThemeMode(event.newValue);
      setThemeModeState((prev) => (prev === next ? prev : next));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(normalizeThemeMode(mode));
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeModeState((prev) => {
      const idx = THEME_ORDER.indexOf(prev);
      return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    });
  }, []);

  return {
    themeMode,
    setThemeMode,
    isDark: themeMode === 'obsidian' || themeMode === 'velvet',
    toggleTheme,
  };
}
