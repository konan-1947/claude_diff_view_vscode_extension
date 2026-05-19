export type ThemePreset = 'vscode' | 'default-dark' | 'solarized-dark' | 'dracula' | 'custom';
export type CursorStyle = 'block' | 'underline' | 'bar';

export interface TerminalColors {
  background: string;
  foreground: string;
  cursor: string;
}

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  themePreset: ThemePreset;
  customColors: TerminalColors;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
}

export type IncomingMessage =
  | { type: 'ready' }
  | { type: 'createSession'; cols: number; rows: number }
  | { type: 'closeSession'; id: string }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'restart'; id: string }
  | { type: 'getSettings' }
  | { type: 'updateSettings'; settings: TerminalSettings }
  | { type: 'installFont'; primary: string }
  | { type: 'reloadWindow' }
  | { type: 'openFile'; path: string }
  | { type: 'installHooks' }
  | { type: 'introduceSeen' };

export const DEFAULT_SETTINGS: TerminalSettings = {
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 13,
  themePreset: 'vscode',
  customColors: { background: '#1e1e1e', foreground: '#cccccc', cursor: '#ffffff' },
  cursorStyle: 'block',
  cursorBlink: true,
};
