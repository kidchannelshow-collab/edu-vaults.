import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'eduvault_theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * The whole palette is driven by CSS variables on <html>, so switching themes
 * is a single attribute write — no component re-render, no class fan-out.
 *
 * The initial value is also applied by an inline script in index.html so a
 * light-theme user never sees a dark flash before React mounts.
 */
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'dark';
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // Storage can be unavailable (private mode / blocked site data).
    }
    return 'dark';
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Non-fatal: the theme still applies for this session.
    }
  }, [theme]);

  const value: ThemeContextValue = {
    theme,
    setTheme: setThemeState,
    toggleTheme: () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return ctx;
}
