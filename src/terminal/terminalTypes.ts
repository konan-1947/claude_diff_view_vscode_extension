import type { TERMINAL_THEMES } from './terminalThemes';

/** `vscode` / `custom` are resolved in the webview; every other id comes from `TERMINAL_THEMES`. */
export type ThemePreset = 'vscode' | 'custom' | (typeof TERMINAL_THEMES)[number]['id'];
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

/** See `src/commands/altMenuFocus.ts`. */
export interface FocusSettings {
  preventAltMenuFocus: boolean;
}

/** Giới hạn kích thước file được theo dõi. Xem `src/watcher/fileSizeLimit.ts`. */
export interface FileLimitSettings {
  maxFileLines: number;
  /** Most diff tabs opened automatically; 0 = no limit. See `src/watcher/autoOpenQueue.ts`. */
  maxAutoOpenDiffs: number;
}

/** User-configured path exclusions. See `src/watcher/pathExclusions.ts`. */
export interface ExclusionSettings {
  excludedPaths: string[];
  respectGitignore: boolean;
}

/** Claude UI accent/background/foreground for the `custom` preset. */
export interface ClaudeUiColors {
  background: string;
  foreground: string;
  accent: string;
}

/**
 * Look of the Claude UI tabs (applied by `res/webview/claudeFrame.js`).
 * `fontSize` scales the whole iframe (CSS zoom, 14 = 100%), since the app sizes
 * most of its text and spacing in px; the layout values are px at 100%.
 */
export interface ClaudeUiAppearance {
  fontSize: number;
  /** '' = follow VS Code (`editor.fontFamily`) */
  fontFamily: string;
  themePreset: ThemePreset;
  customColors: ClaudeUiColors;
  lineHeight: number;
  rowGap: number;
  /** Widest the chat column gets; 0 = full width */
  columnMaxWidth: number;
}

export const CLAUDE_UI_LIMITS = {
  fontSize: { min: 10, max: 24 },
  lineHeight: { min: 14, max: 40 },
  rowGap: { min: 0, max: 40 },
  columnMaxWidth: { min: 480, max: 4000 },
} as const;

export const DEFAULT_CLAUDE_UI_APPEARANCE: ClaudeUiAppearance = {
  fontSize: 14,
  fontFamily: '',
  themePreset: 'vscode',
  customColors: { background: '#1e1e1e', foreground: '#cccccc', accent: '#3b8eea' },
  lineHeight: 22,
  rowGap: 14,
  columnMaxWidth: 840,
};

export interface TerminalSettingsPayload
  extends TerminalSettings, BurstDetectionSettings, SoundNotificationSettings, FocusSettings, FileLimitSettings, ExclusionSettings {
  /** `.gitignore`-style patterns of extra files to track. See `src/watcher/fileTypeRules.ts`. */
  includedPaths: string[];
  claudeUi: ClaudeUiAppearance;
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

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  preventAltMenuFocus: true,
};

export const DEFAULT_FILE_LIMIT_SETTINGS: FileLimitSettings = {
  maxFileLines: 5000,
  maxAutoOpenDiffs: 50,
};

export const DEFAULT_EXCLUSION_SETTINGS: ExclusionSettings = {
  excludedPaths: [],
  respectGitignore: true,
};

/** 0 = tắt giới hạn. Trần trên chỉ để chặn nhập nhầm, không phải khuyến nghị. */
export const MAX_FILE_LINES_CEILING = 200000;
export const MAX_AUTO_OPEN_DIFFS_CEILING = 1000;

export type SessionKind = 'terminal' | 'claude';

/**
 * Pane layout of the terminal webview (res/webview/paneLayout.js): a split tree whose
 * leaves are tab groups. Kept by the host only so a rebuilt webview (Agent mode toggle)
 * gets its splits back; the webview validates it against the live session ids.
 */
export type LayoutNode =
  | { type: 'split'; dir: 'row' | 'col'; sizes: number[]; children: LayoutNode[] }
  | { type: 'group'; tabs: string[]; active: string | null; focused?: boolean };

export type IncomingMessage =
  | { type: 'ready' }
  | { type: 'toggleAgentMode' }
  | { type: 'pendingOverlay'; open: boolean }
  | { type: 'openPendingFile'; path: string }
  | { type: 'createSession'; cols: number; rows: number; agent?: string; kind?: SessionKind }
  | { type: 'turnDone'; id: string; kind: SessionKind }
  | { type: 'requestAgents' }
  | { type: 'closeSession'; id: string }
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'restart'; id: string }
  /** A uic protocol message from the Claude UI iframe of tab `id`. */
  | { type: 'claudeUi'; id: string; message: unknown }
  | { type: 'getSettings' }
  | { type: 'updateSettings'; settings: TerminalSettingsPayload }
  | { type: 'installFont'; primary: string }
  | { type: 'reloadWindow' }
  | { type: 'requestDiffPreview' }
  | { type: 'closeDiffPreview' }
  | { type: 'previewActiveFile'; path?: string }
  | { type: 'requestDiffPreviewFile'; path: string }
  | { type: 'previewEditModified'; path: string; newCurrent: string }
  | { type: 'previewSaveFile'; path: string }
  | { type: 'previewAcceptHunk'; path: string; newOriginal: string; newCurrent: string }
  | { type: 'previewRejectHunk'; path: string; newOriginal: string; newCurrent: string }
  | { type: 'previewAcceptFile'; path: string }
  | { type: 'previewRejectFile'; path: string }
  | { type: 'requestFilePreview'; path: string }
  | { type: 'closeFilePreview' }
  | { type: 'filePreviewEdit'; path: string; content: string }
  | { type: 'filePreviewSave'; path: string }
  | { type: 'filePreviewOpenBeside'; path: string }
  | { type: 'introduceSeen' }
  | { type: 'terminalFocusState'; focused: boolean }
  | { type: 'sessionTitle'; title: string }
  | { type: 'activeSession'; id: string }
  | { type: 'layout'; layout: LayoutNode }
  | { type: 'viewTooNarrow' };

/** One running session, as sent to a newly attached webview so it can redraw the tab. */
export interface SessionSnapshot {
  id: string;
  title: string;
  rawTitle: string;
  kind: SessionKind;
  serialized: string;
  cols: number;
  rows: number;
  exited: boolean;
  exitCode: number;
  /** Claude UI tab: Claude session id to reopen in the rebuilt iframe. */
  resume?: string;
}

export const DEFAULT_SETTINGS: TerminalSettings = {
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 13,
  themePreset: 'vscode',
  customColors: { background: '#1e1e1e', foreground: '#cccccc', cursor: '#ffffff' },
  cursorStyle: 'block',
  cursorBlink: true,
};
