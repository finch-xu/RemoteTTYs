import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { lightTheme, darkTheme, getTerminalTheme, DEFAULT_TERMINAL_THEME } from '../lib/theme';
import type { UITheme, UIThemeMode, TerminalTheme } from '../lib/theme';
import { apiFetch } from '../lib/api';

interface ThemeContextValue {
  ui: UITheme;
  uiMode: UIThemeMode;
  setUIMode: (mode: UIThemeMode) => void;
  terminalTheme: TerminalTheme;
  terminalThemeName: string;
  setTerminalThemeName: (name: string) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  ui: lightTheme,
  uiMode: 'system',
  setUIMode: () => {},
  terminalTheme: getTerminalTheme(DEFAULT_TERMINAL_THEME),
  terminalThemeName: DEFAULT_TERMINAL_THEME,
  setTerminalThemeName: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

interface Preferences {
  uiTheme?: string;
  terminalTheme?: string;
}

export function useThemeProvider(initialPreferences?: Preferences) {
  const [uiMode, setUIModeState] = useState<UIThemeMode>(
    (initialPreferences?.uiTheme as UIThemeMode) || 'system'
  );
  const [terminalThemeName, setTerminalThemeNameState] = useState(
    initialPreferences?.terminalTheme || DEFAULT_TERMINAL_THEME
  );
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(resolveSystemTheme);

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = uiMode === 'system' ? systemTheme : uiMode;
  const ui = resolvedTheme === 'dark' ? darkTheme : lightTheme;

  // Update body background
  useEffect(() => {
    document.body.style.background = ui.bg;
  }, [ui.bg]);

  const savePreferences = useCallback((prefs: Preferences) => {
    apiFetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    }).catch(() => {});
  }, []);

  const setUIMode = useCallback((mode: UIThemeMode) => {
    setUIModeState(mode);
    savePreferences({ uiTheme: mode, terminalTheme: terminalThemeName });
  }, [savePreferences, terminalThemeName]);

  const setTerminalThemeName = useCallback((name: string) => {
    setTerminalThemeNameState(name);
    savePreferences({ uiTheme: uiMode, terminalTheme: name });
  }, [savePreferences, uiMode]);

  const terminalTheme = useMemo(() => getTerminalTheme(terminalThemeName), [terminalThemeName]);

  return useMemo(() => ({
    ui,
    uiMode,
    setUIMode,
    terminalTheme,
    terminalThemeName,
    setTerminalThemeName,
  }), [ui, uiMode, setUIMode, terminalTheme, terminalThemeName, setTerminalThemeName]);
}
