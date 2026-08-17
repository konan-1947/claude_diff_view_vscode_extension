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

export interface BurstDetectionSettings {
  burstDetectionEnabled: boolean;
  burstDetectionWindowMs: number;
  burstDetectionThreshold: number;
  burstDetectionHoldMs: number;
}

export interface SoundNotificationSettings {
  soundNotificationsEnabled: boolean;
}

/** Giới hạn kích thước file được theo dõi. Xem `src/watcher/fileSizeLimit.ts`. */
export interface FileLimitSettings {
  maxFileLines: number;
}

export interface TerminalSettingsPayload
  extends TerminalSettings, BurstDetectionSettings, SoundNotificationSettings, FileLimitSettings {
  supportedFileExtensions: string[];
}

export const DEFAULT_BURST_DETECTION_SETTINGS: BurstDetectionSettings = {
  burstDetectionEnabled: true,
  burstDetectionWindowMs: 300,
  burstDetectionThreshold: 8,
  burstDetectionHoldMs: 2000,
};

export const DEFAULT_SOUND_NOTIFICATION_SETTINGS: SoundNotificationSettings = {
  soundNotificationsEnabled: false,
};

export const DEFAULT_FILE_LIMIT_SETTINGS: FileLimitSettings = {
  maxFileLines: 5000,
};

/** 0 = tắt giới hạn. Trần trên chỉ để chặn nhập nhầm, không phải khuyến nghị. */
export const MAX_FILE_LINES_CEILING = 200000;

export type IncomingMessage =
  | { type: 'ready' }
  | { type: 'createSession'; cols: number; rows: number }
  | { type: 'closeSession'; id: string }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'restart'; id: string }
  | { type: 'getSettings' }
  | { type: 'updateSettings'; settings: TerminalSettingsPayload }
  | { type: 'promptFileExtensions'; action: 'new' | 'edit'; value?: string }
  | { type: 'installFont'; primary: string }
  | { type: 'reloadWindow' }
  | { type: 'openFile'; path: string }
  | { type: 'introduceSeen' }
  | { type: 'terminalFocusState'; focused: boolean }
  | { type: 'viewTooNarrow' };

export const DEFAULT_SETTINGS: TerminalSettings = {
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 13,
  themePreset: 'vscode',
  customColors: { background: '#1e1e1e', foreground: '#cccccc', cursor: '#ffffff' },
  cursorStyle: 'block',
  cursorBlink: true,
};
