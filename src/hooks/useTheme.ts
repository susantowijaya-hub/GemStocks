import { useCallback, useEffect, useState } from 'react';
import { ThemeMode } from '../types/market';

const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'monochrome'];

export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('stocks-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'monochrome') {
        return saved;
      }
      return 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light', 'monochrome');
    root.classList.add(themeMode);
    root.dataset.theme = themeMode;

    try {
      localStorage.setItem('stocks-theme', themeMode);
    } catch {
      // ignore storage failure
    }

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const metaColor =
        themeMode === 'dark'
          ? '#000000'
          : themeMode === 'monochrome'
            ? '#EFECE4'
            : '#F2F2F7';
      themeMeta.setAttribute('content', metaColor);
    }
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
    isDark: themeMode === 'dark',
    isMonochrome: themeMode === 'monochrome',
    toggleTheme,
  };
}

