// --- UI Theme ---

export interface UITheme {
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceActive: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentText: string;
  online: string;
  error: string;
  warning: string;
  overlay: string;
}

export const lightTheme: UITheme = {
  bg: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EDE5',
  surfaceActive: '#EDE5DA',
  border: '#E8E0D8',
  textPrimary: '#2D2B28',
  textSecondary: '#8C8580',
  textMuted: '#B5AFA8',
  accent: '#C4704B',
  accentHover: '#B5613E',
  accentText: '#FFFFFF',
  online: '#5BA37C',
  error: '#D64545',
  warning: '#D4930D',
  overlay: 'rgba(45,43,40,0.4)',
};

export const darkTheme: UITheme = {
  bg: '#1A1A1A',
  surface: '#2A2A2A',
  surfaceAlt: '#333333',
  surfaceActive: '#3D3D3D',
  border: '#404040',
  textPrimary: '#E5E5E5',
  textSecondary: '#999999',
  textMuted: '#666666',
  accent: '#D4845A',
  accentHover: '#E0956B',
  accentText: '#FFFFFF',
  online: '#6BC992',
  error: '#EF6B6B',
  warning: '#E8B04A',
  overlay: 'rgba(0,0,0,0.5)',
};

export type UIThemeMode = 'light' | 'dark' | 'system';

export const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const MONO_FONT = 'Menlo, Monaco, "Courier New", monospace';

export const FONT_FAMILIES = [
  { label: 'System Mono', value: MONO_FONT },
  { label: 'JetBrains Mono', value: '"JetBrains Mono Variable", monospace' },
  { label: 'Cascadia Mono', value: '"Cascadia Mono Variable", monospace' },
  { label: 'Cascadia Mono NF', value: 'CascadiaMonoNF, monospace' },
  { label: 'Noto Sans Mono', value: '"Noto Sans Mono Variable", monospace' },
];

// --- Terminal Themes ---

export interface TerminalTheme {
  id: string;
  name: string;
  colors: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selectionBackground: string;
    selectionForeground?: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const terminalThemes: TerminalTheme[] = [
  {
    id: 'warm-night',
    name: 'Warm Night',
    colors: {
      background: '#1C1917', foreground: '#E7E5E4', cursor: '#C4704B', cursorAccent: '#1C1917',
      selectionBackground: '#44403C',
      black: '#1C1917', red: '#DC6B6B', green: '#7BB88E', yellow: '#D4A843',
      blue: '#6B9FDC', magenta: '#B57BBC', cyan: '#5BBEB5', white: '#E7E5E4',
      brightBlack: '#57534E', brightRed: '#EF8A8A', brightGreen: '#96CFAA', brightYellow: '#E3C06A',
      brightBlue: '#8AB8EF', brightMagenta: '#CF9AD6', brightCyan: '#7DD3CB', brightWhite: '#FAFAF9',
    },
  },
  {
    id: 'classic-dark',
    name: 'Classic Dark',
    colors: {
      background: '#000000', foreground: '#C0C0C0', cursor: '#FFFFFF', cursorAccent: '#000000',
      selectionBackground: '#444444',
      black: '#000000', red: '#CC0000', green: '#00CC00', yellow: '#CCCC00',
      blue: '#0077CC', magenta: '#CC00CC', cyan: '#00CCCC', white: '#C0C0C0',
      brightBlack: '#555555', brightRed: '#FF5555', brightGreen: '#55FF55', brightYellow: '#FFFF55',
      brightBlue: '#5599FF', brightMagenta: '#FF55FF', brightCyan: '#55FFFF', brightWhite: '#FFFFFF',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    colors: {
      background: '#282A36', foreground: '#F8F8F2', cursor: '#F8F8F2', cursorAccent: '#282A36',
      selectionBackground: '#44475A',
      black: '#21222C', red: '#FF5555', green: '#50FA7B', yellow: '#F1FA8C',
      blue: '#BD93F9', magenta: '#FF79C6', cyan: '#8BE9FD', white: '#F8F8F2',
      brightBlack: '#6272A4', brightRed: '#FF6E6E', brightGreen: '#69FF94', brightYellow: '#FFFFA5',
      brightBlue: '#D6ACFF', brightMagenta: '#FF92DF', brightCyan: '#A4FFFF', brightWhite: '#FFFFFF',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    colors: {
      background: '#2E3440', foreground: '#D8DEE9', cursor: '#D8DEE9', cursorAccent: '#2E3440',
      selectionBackground: '#434C5E',
      black: '#3B4252', red: '#BF616A', green: '#A3BE8C', yellow: '#EBCB8B',
      blue: '#81A1C1', magenta: '#B48EAD', cyan: '#88C0D0', white: '#E5E9F0',
      brightBlack: '#4C566A', brightRed: '#BF616A', brightGreen: '#A3BE8C', brightYellow: '#EBCB8B',
      brightBlue: '#81A1C1', brightMagenta: '#B48EAD', brightCyan: '#8FBCBB', brightWhite: '#ECEFF4',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    colors: {
      background: '#002B36', foreground: '#839496', cursor: '#839496', cursorAccent: '#002B36',
      selectionBackground: '#073642',
      black: '#073642', red: '#DC322F', green: '#859900', yellow: '#B58900',
      blue: '#268BD2', magenta: '#D33682', cyan: '#2AA198', white: '#EEE8D5',
      brightBlack: '#586E75', brightRed: '#CB4B16', brightGreen: '#586E75', brightYellow: '#657B83',
      brightBlue: '#839496', brightMagenta: '#6C71C4', brightCyan: '#93A1A1', brightWhite: '#FDF6E3',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    colors: {
      background: '#FDF6E3', foreground: '#657B83', cursor: '#657B83', cursorAccent: '#FDF6E3',
      selectionBackground: '#EEE8D5',
      black: '#073642', red: '#DC322F', green: '#859900', yellow: '#B58900',
      blue: '#268BD2', magenta: '#D33682', cyan: '#2AA198', white: '#EEE8D5',
      brightBlack: '#586E75', brightRed: '#CB4B16', brightGreen: '#586E75', brightYellow: '#657B83',
      brightBlue: '#839496', brightMagenta: '#6C71C4', brightCyan: '#93A1A1', brightWhite: '#FDF6E3',
    },
  },
  {
    id: 'macos-basic',
    name: 'macOS Basic',
    colors: {
      background: '#FFFFFF', foreground: '#000000', cursor: '#000000', cursorAccent: '#FFFFFF',
      selectionBackground: '#B5D5FF',
      black: '#000000', red: '#990000', green: '#00A600', yellow: '#999900',
      blue: '#0000B2', magenta: '#B200B2', cyan: '#00A6B2', white: '#BFBFBF',
      brightBlack: '#666666', brightRed: '#E50000', brightGreen: '#00D900', brightYellow: '#E5E500',
      brightBlue: '#0000FF', brightMagenta: '#E500E5', brightCyan: '#00E5E5', brightWhite: '#E5E5E5',
    },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    colors: {
      background: '#000000', foreground: '#FFFFFF', cursor: '#FFFFFF', cursorAccent: '#000000',
      selectionBackground: '#3A5FCD',
      black: '#000000', red: '#FF5555', green: '#55FF55', yellow: '#FFFF55',
      blue: '#6699FF', magenta: '#FF55FF', cyan: '#55FFFF', white: '#FFFFFF',
      brightBlack: '#808080', brightRed: '#FF8888', brightGreen: '#88FF88', brightYellow: '#FFFF88',
      brightBlue: '#99BBFF', brightMagenta: '#FF88FF', brightCyan: '#88FFFF', brightWhite: '#FFFFFF',
    },
  },
];

export const DEFAULT_TERMINAL_THEME = 'warm-night';

export function getTerminalTheme(id: string): TerminalTheme {
  return terminalThemes.find(t => t.id === id) ?? terminalThemes[0];
}
