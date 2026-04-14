import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { lightTheme, darkTheme, getTerminalTheme, DEFAULT_TERMINAL_THEME, MONO_FONT } from '../lib/theme';
import type { UITheme, UIThemeMode, TerminalTheme } from '../lib/theme';
import { apiFetch } from '../lib/api';

export const DEFAULT_FONT_SIZE = 14;

interface ThemeContextValue {
  ui: UITheme;
  uiMode: UIThemeMode;
  setUIMode: (mode: UIThemeMode) => void;
  terminalTheme: TerminalTheme;
  terminalThemeName: string;
  setTerminalThemeName: (name: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  fontFamily: string;
  setFontFamily: (family: string) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  ui: lightTheme,
  uiMode: 'system',
  setUIMode: () => {},
  terminalTheme: getTerminalTheme(DEFAULT_TERMINAL_THEME),
  terminalThemeName: DEFAULT_TERMINAL_THEME,
  setTerminalThemeName: () => {},
  fontSize: DEFAULT_FONT_SIZE,
  setFontSize: () => {},
  fontFamily: MONO_FONT,
  setFontFamily: () => {},
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
  fontSize?: number;
  fontFamily?: string;
}

export function useThemeProvider(initialPreferences?: Preferences) {
  const [uiMode, setUIModeState] = useState<UIThemeMode>(
    (initialPreferences?.uiTheme as UIThemeMode) || 'system'
  );
  const [terminalThemeName, setTerminalThemeNameState] = useState(
    initialPreferences?.terminalTheme || DEFAULT_TERMINAL_THEME
  );
  const [fontSize, setFontSizeState] = useState(
    initialPreferences?.fontSize || DEFAULT_FONT_SIZE
  );
  const [fontFamily, setFontFamilyState] = useState(
    initialPreferences?.fontFamily || MONO_FONT
  );
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(resolveSystemTheme);

  // Sync state when preferences arrive after initial render (async fetch)
  useEffect(() => {
    if (!initialPreferences) return;
    if (initialPreferences.uiTheme) setUIModeState(initialPreferences.uiTheme as UIThemeMode);
    if (initialPreferences.terminalTheme) setTerminalThemeNameState(initialPreferences.terminalTheme);
    if (initialPreferences.fontSize) setFontSizeState(initialPreferences.fontSize);
    if (initialPreferences.fontFamily) setFontFamilyState(initialPreferences.fontFamily);
  }, [initialPreferences]);

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = uiMode === 'system' ? systemTheme : uiMode;
  const ui = resolvedTheme === 'dark' ? darkTheme : lightTheme;

  // Update body background + sync CSS custom properties for global rules
  useEffect(() => {
    document.body.style.background = ui.bg;
    const root = document.documentElement;
    root.style.setProperty('--rttys-accent', ui.accent);
    root.style.setProperty('--rttys-bg', ui.bg);
    root.style.setProperty('--rttys-surface', ui.surface);
    root.style.setProperty('--rttys-border', ui.border);
    root.style.setProperty('--rttys-surface-alt', ui.surfaceAlt);
    root.style.setProperty('--rttys-text-secondary', ui.textSecondary);
  }, [ui]);

  const savePreferences = useCallback((prefs: Preferences) => {
    apiFetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    }).catch(() => {});
  }, []);

  const allPrefs = useCallback(() => ({
    uiTheme: uiMode, terminalTheme: terminalThemeName, fontSize, fontFamily,
  }), [uiMode, terminalThemeName, fontSize, fontFamily]);

  const setUIMode = useCallback((mode: UIThemeMode) => {
    setUIModeState(mode);
    savePreferences({ ...allPrefs(), uiTheme: mode });
  }, [savePreferences, allPrefs]);

  const setTerminalThemeName = useCallback((name: string) => {
    setTerminalThemeNameState(name);
    savePreferences({ ...allPrefs(), terminalTheme: name });
  }, [savePreferences, allPrefs]);

  const setFontSize = useCallback((size: number) => {
    setFontSizeState(size);
    savePreferences({ ...allPrefs(), fontSize: size });
  }, [savePreferences, allPrefs]);

  const setFontFamily = useCallback((family: string) => {
    setFontFamilyState(family);
    savePreferences({ ...allPrefs(), fontFamily: family });
  }, [savePreferences, allPrefs]);

  const terminalTheme = useMemo(() => getTerminalTheme(terminalThemeName), [terminalThemeName]);

  return useMemo(() => ({
    ui,
    uiMode,
    setUIMode,
    terminalTheme,
    terminalThemeName,
    setTerminalThemeName,
    fontSize,
    setFontSize,
    fontFamily,
    setFontFamily,
  }), [ui, uiMode, setUIMode, terminalTheme, terminalThemeName, setTerminalThemeName, fontSize, setFontSize, fontFamily, setFontFamily]);
}
