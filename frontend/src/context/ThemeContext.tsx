import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Theme, WindowMode, WindowState } from '../types';

interface ThemeCtx {
  theme: Theme;
  toggleTheme: () => void;
  windowMode: WindowMode;
  windowState: WindowState;
  setWindowState: (s: WindowState) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = localStorage.getItem('vantageo-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [windowMode] = useState<WindowMode>('fullpage');
  const [windowState, setWindowState] = useState<WindowState>('open');

  // Persist theme changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('vantageo-theme', theme);
    } catch {}
  }, [theme]);

  // Apply theme to document root (for global dark class support)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, windowMode, windowState, setWindowState }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
