import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PtySession } from './ptySession';
import { findInstallableForPrimary, installFont } from './fontInstaller';
import { DiffManager } from '../diff/diffManager';
import {
  buildPendingFilesInnerHtml,
  SessionState,
} from './pendingFilesPage';
import { buildTerminalHtml } from './terminalHtml';
import { applySoundNotifications } from '../commands/soundNotifications';
import {
  BurstDetectionSettings,
  CursorStyle,
  DEFAULT_BURST_DETECTION_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_SOUND_NOTIFICATION_SETTINGS,
  IncomingMessage,
  SoundNotificationSettings,
  TerminalSettings,
  TerminalSettingsPayload,
  ThemePreset,
} from './terminalTypes';

const SETTINGS_KEY = 'ai-cli-diff-view.terminal.settings';
const INTRODUCE_SEEN_KEY = 'ai-cli-diff-view.introduce.seen';

interface SessionRecord {
  pty: PtySession;
  subs: vscode.Disposable[];
  title: string;
  cols: number;
  rows: number;
}

export class TerminalPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ai-cli-diff-view.terminal';

  private view?: vscode.WebviewView;
  private sessions = new Map<string, SessionRecord>();
  private nextSessionNum = 0;

  private sessionState: SessionState = 'idle';
  private lastPrompt = '';
  private errorMessage = '';
  private diffDisposable?: vscode.Disposable;
  private lastTerminalFocused = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diffManager: DiffManager
  ) {
    this.diffDisposable = this.diffManager.onDidChangeDiffs(() => {
      this.postFilesUpdate();
    });
  }

  // Public API used by commandsRegistry (mirrors the old SessionPanelProvider).
  setRunning(prompt: string): void {
    this.sessionState = 'running';
    this.lastPrompt = prompt;
    this.errorMessage = '';
    this.postFilesUpdate();
  }

  setIdle(): void {
    this.sessionState = 'idle';
    this.postFilesUpdate();
  }

  setError(message: string): void {
    this.sessionState = 'error';
    this.errorMessage = message;
    this.postFilesUpdate();
  }

  refresh(): void {
    this.postFilesUpdate();
  }

  focusTerminal(): void {
    if (!this.view) {
      return;
    }
    try {
      this.view.show(false);
    } catch {
      // view may not be resolvable yet; ignore.
    }
    void this.view.webview.postMessage({ type: 'focusTerminal' });
  }

  wasTerminalFocused(): boolean {
    return this.lastTerminalFocused;
  }

  private postFilesUpdate(): void {
    if (!this.view) {
      return;
    }
    const html = buildPendingFilesInnerHtml({
      diffManager: this.diffManager,
      iconBase: this.fileIconsBase(),
      sessionState: this.sessionState,
      lastPrompt: this.lastPrompt,
      errorMessage: this.errorMessage,
    });
    void this.view.webview.postMessage({ type: 'filesUpdate', html });
  }

  private fileIconsBase(): string {
    if (!this.view) {
      return '';
    }
    return this.view.webview
      .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'file-icons'))
      .toString() + '/';
  }

  private spawnSession(cols: number, rows: number): { id: string; title: string } {
    this.nextSessionNum += 1;
    const id = `s${this.nextSessionNum}`;
    const title = resolveShellName();
    const pty = new PtySession();
    const subs: vscode.Disposable[] = [
      pty.onData((data) => {
        this.view?.webview.postMessage({ type: 'data', id, data });
      }),
      pty.onExit((code) => {
        this.view?.webview.postMessage({ type: 'exit', id, code });
      }),
      pty.onError((message) => {
        this.view?.webview.postMessage({ type: 'error', id, message });
      }),
    ];
    const safeCols = Math.max(1, cols | 0);
    const safeRows = Math.max(1, rows | 0);
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
    pty.start(cwd, safeCols, safeRows);
    this.sessions.set(id, { pty, subs, title, cols: safeCols, rows: safeRows });
    this.view?.webview.postMessage({ type: 'sessionCreated', id, title });
    return { id, title };
  }

  private closeSessionInternal(id: string): void {
    const rec = this.sessions.get(id);
    if (!rec) {
      return;
    }
    for (const d of rec.subs) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    try { rec.pty.dispose(); } catch { /* ignore */ }
    this.sessions.delete(id);
    this.view?.webview.postMessage({ type: 'sessionClosed', id });
  }

  private loadSettings(): TerminalSettings {
    const stored = this.context.globalState.get<Partial<TerminalSettings>>(SETTINGS_KEY);
    if (!stored || typeof stored !== 'object') {
      return { ...DEFAULT_SETTINGS, customColors: { ...DEFAULT_SETTINGS.customColors } };
    }
    return {
      fontFamily: typeof stored.fontFamily === 'string' && stored.fontFamily.trim()
        ? stored.fontFamily
        : DEFAULT_SETTINGS.fontFamily,
      fontSize: typeof stored.fontSize === 'number' && stored.fontSize >= 6 && stored.fontSize <= 32
        ? stored.fontSize
        : DEFAULT_SETTINGS.fontSize,
      themePreset: this.normalizePreset(stored.themePreset),
      customColors: {
        background: this.normalizeColor(stored.customColors?.background, DEFAULT_SETTINGS.customColors.background),
        foreground: this.normalizeColor(stored.customColors?.foreground, DEFAULT_SETTINGS.customColors.foreground),
        cursor: this.normalizeColor(stored.customColors?.cursor, DEFAULT_SETTINGS.customColors.cursor),
      },
      cursorStyle: this.normalizeCursorStyle(stored.cursorStyle),
      cursorBlink: typeof stored.cursorBlink === 'boolean' ? stored.cursorBlink : DEFAULT_SETTINGS.cursorBlink,
    };
  }

  private normalizePreset(v: unknown): ThemePreset {
    const presets: ThemePreset[] = ['vscode', 'default-dark', 'solarized-dark', 'dracula', 'custom'];
    return presets.includes(v as ThemePreset) ? (v as ThemePreset) : DEFAULT_SETTINGS.themePreset;
  }

  private normalizeCursorStyle(v: unknown): CursorStyle {
    const styles: CursorStyle[] = ['block', 'underline', 'bar'];
    return styles.includes(v as CursorStyle) ? (v as CursorStyle) : DEFAULT_SETTINGS.cursorStyle;
  }

  private normalizeColor(v: unknown, fallback: string): string {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  }

  private async saveSettings(s: TerminalSettings): Promise<void> {
    await this.context.globalState.update(SETTINGS_KEY, s);
  }

  private loadSettingsPayload(): TerminalSettingsPayload {
    return {
      ...this.loadSettings(),
      supportedFileExtensions: this.loadSupportedFileExtensions(),
      ...this.loadBurstDetectionSettings(),
      ...this.loadSoundNotificationSettings(),
    };
  }

  private loadSoundNotificationSettings(): SoundNotificationSettings {
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    return {
      soundNotificationsEnabled: config.get<boolean>(
        'soundNotificationsEnabled',
        DEFAULT_SOUND_NOTIFICATION_SETTINGS.soundNotificationsEnabled
      ),
    };
  }

  private async saveSoundNotificationSettings(incoming: Partial<SoundNotificationSettings>): Promise<void> {
    const next = this.loadSoundNotificationSettings();
    const enabled = typeof incoming.soundNotificationsEnabled === 'boolean'
      ? incoming.soundNotificationsEnabled
      : next.soundNotificationsEnabled;
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    await config.update('soundNotificationsEnabled', enabled, vscode.ConfigurationTarget.Global);
    applySoundNotifications(enabled);
  }

  private loadBurstDetectionSettings(): BurstDetectionSettings {
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    const windowMs = config.get<number>('burstDetectionWindowMs', DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionWindowMs);
    const threshold = config.get<number>('burstDetectionThreshold', DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionThreshold);
    const holdMs = config.get<number>('burstDetectionHoldMs', DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionHoldMs);
    return {
      burstDetectionEnabled: config.get<boolean>('burstDetectionEnabled', DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionEnabled),
      burstDetectionWindowMs: Number.isFinite(windowMs)
        ? Math.min(5000, Math.max(50, windowMs))
        : DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionWindowMs,
      burstDetectionThreshold: Number.isFinite(threshold)
        ? Math.min(500, Math.max(2, threshold))
        : DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionThreshold,
      burstDetectionHoldMs: Number.isFinite(holdMs)
        ? Math.min(10000, Math.max(500, holdMs))
        : DEFAULT_BURST_DETECTION_SETTINGS.burstDetectionHoldMs,
    };
  }

  private async saveBurstDetectionSettings(incoming: Partial<BurstDetectionSettings>): Promise<void> {
    const next = this.loadBurstDetectionSettings();
    const windowMs = incoming.burstDetectionWindowMs;
    const threshold = incoming.burstDetectionThreshold;
    const holdMs = incoming.burstDetectionHoldMs;
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    await Promise.all([
      config.update(
        'burstDetectionEnabled',
        typeof incoming.burstDetectionEnabled === 'boolean' ? incoming.burstDetectionEnabled : next.burstDetectionEnabled,
        vscode.ConfigurationTarget.Global
      ),
      config.update(
        'burstDetectionWindowMs',
        typeof windowMs === 'number' && Number.isFinite(windowMs) ? Math.min(5000, Math.max(50, windowMs)) : next.burstDetectionWindowMs,
        vscode.ConfigurationTarget.Global
      ),
      config.update(
        'burstDetectionThreshold',
        typeof threshold === 'number' && Number.isFinite(threshold) ? Math.min(500, Math.max(2, threshold)) : next.burstDetectionThreshold,
        vscode.ConfigurationTarget.Global
      ),
      config.update(
        'burstDetectionHoldMs',
        typeof holdMs === 'number' && Number.isFinite(holdMs) ? Math.min(10000, Math.max(500, holdMs)) : next.burstDetectionHoldMs,
        vscode.ConfigurationTarget.Global
      ),
    ]);
  }

  private loadSupportedFileExtensions(): string[] {
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    return this.normalizeSupportedFileExtensions(config.get<string[]>('supportedFileExtensions', []));
  }

  private normalizeSupportedFileExtensions(values: unknown): string[] {
    if (!Array.isArray(values)) {
      return [];
    }

    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }
      const ext = value.trim().toLowerCase();
      if (!ext) {
        continue;
      }
      const withDot = ext.startsWith('.') ? ext : `.${ext}`;
      if (!seen.has(withDot)) {
        seen.add(withDot);
        normalized.push(withDot);
      }
    }
    return normalized;
  }

  private async saveSupportedFileExtensions(values: unknown): Promise<void> {
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    await config.update(
      'supportedFileExtensions',
      this.normalizeSupportedFileExtensions(values),
      vscode.ConfigurationTarget.Global
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const xtermDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'xterm');
    const iconsDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'file-icons');
    const introDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'introduce');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [xtermDir, iconsDir, introDir],
    };

    webviewView.webview.onDidReceiveMessage((msg: IncomingMessage) => {
      if (!msg || typeof msg !== 'object') {
        return;
      }
      switch (msg.type) {
        case 'ready':
          // Push initial files page state once the webview is ready.
          this.postFilesUpdate();
          if (!this.context.globalState.get<boolean>(INTRODUCE_SEEN_KEY)) {
            void this.view?.webview.postMessage({ type: 'showIntroduce' });
          }
          return;
        case 'createSession':
          this.spawnSession(msg.cols, msg.rows);
          return;
        case 'closeSession':
          this.closeSessionInternal(msg.id);
          if (this.sessions.size === 0) {
            this.spawnSession(80, 24);
          }
          return;
        case 'input':
          this.sessions.get(msg.id)?.pty.write(msg.data);
          return;
        case 'resize': {
          const rec = this.sessions.get(msg.id);
          if (rec) {
            rec.cols = Math.max(1, msg.cols | 0);
            rec.rows = Math.max(1, msg.rows | 0);
            rec.pty.resize(rec.cols, rec.rows);
          }
          return;
        }
        case 'restart': {
          const old = this.sessions.get(msg.id);
          if (!old) {
            return;
          }
          const { cols, rows, title } = old;
          // Dispose old pty + subs but keep the id; emit data/exit/error under the same id.
          for (const d of old.subs) {
            try { d.dispose(); } catch { /* ignore */ }
          }
          try { old.pty.dispose(); } catch { /* ignore */ }
          this.sessions.delete(msg.id);

          const pty = new PtySession();
          const id = msg.id;
          const subs: vscode.Disposable[] = [
            pty.onData((data) => {
              this.view?.webview.postMessage({ type: 'data', id, data });
            }),
            pty.onExit((code) => {
              this.view?.webview.postMessage({ type: 'exit', id, code });
            }),
            pty.onError((message) => {
              this.view?.webview.postMessage({ type: 'error', id, message });
            }),
          ];
          const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
          pty.start(cwd, cols, rows);
          this.sessions.set(id, { pty, subs, title, cols, rows });
          return;
        }
        case 'getSettings':
          this.view?.webview.postMessage({ type: 'settings', settings: this.loadSettingsPayload() });
          return;
        case 'installFont': {
          const font = findInstallableForPrimary(msg.primary || '');
          if (!font) {
            this.view?.webview.postMessage({
              type: 'installError',
              primary: msg.primary,
              error: 'No installer registered for this font.',
            });
            return;
          }
          const primary = font.primary;
          this.view?.webview.postMessage({
            type: 'installProgress',
            primary,
            message: 'Starting…',
          });
          void installFont(font, (m) => {
            this.view?.webview.postMessage({ type: 'installProgress', primary, message: m });
          }).then((result) => {
            this.view?.webview.postMessage({
              type: 'installDone',
              primary,
              targetDir: result.targetDir,
              restartRecommended: result.restartRecommended,
            });
          }).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            this.view?.webview.postMessage({ type: 'installError', primary, error: message });
          });
          return;
        }
        case 'reloadWindow':
          void vscode.commands.executeCommand('workbench.action.reloadWindow');
          return;
        case 'promptFileExtensions': {
          const isEdit = msg.action === 'edit';
          void vscode.window.showInputBox({
            title: isEdit ? 'Edit file extension' : 'New file extension',
            prompt: isEdit
              ? 'Enter one file extension.'
              : 'Enter one extension or multiple extensions separated by commas.',
            value: isEdit && typeof msg.value === 'string' ? msg.value : '',
            placeHolder: isEdit ? '.env' : '.env, .blade.php, .proto',
          }).then((value) => {
            if (typeof value !== 'string') {
              return;
            }
            this.view?.webview.postMessage({
              type: 'fileExtensionsPromptResult',
              action: msg.action,
              previousValue: msg.value,
              value,
            });
          });
          return;
        }
        case 'updateSettings': {
          const next = this.loadSettings();
          const incoming = msg.settings ?? next;
          const sanitized: TerminalSettings = {
            fontFamily: typeof incoming.fontFamily === 'string' && incoming.fontFamily.trim()
              ? incoming.fontFamily
              : next.fontFamily,
            fontSize: typeof incoming.fontSize === 'number' && incoming.fontSize >= 6 && incoming.fontSize <= 32
              ? incoming.fontSize
              : next.fontSize,
            themePreset: this.normalizePreset(incoming.themePreset),
            customColors: {
              background: this.normalizeColor(incoming.customColors?.background, next.customColors.background),
              foreground: this.normalizeColor(incoming.customColors?.foreground, next.customColors.foreground),
              cursor: this.normalizeColor(incoming.customColors?.cursor, next.customColors.cursor),
            },
            cursorStyle: this.normalizeCursorStyle(incoming.cursorStyle),
            cursorBlink: typeof incoming.cursorBlink === 'boolean' ? incoming.cursorBlink : next.cursorBlink,
          };
          void Promise.all([
            this.saveSettings(sanitized),
            this.saveSupportedFileExtensions(incoming.supportedFileExtensions),
            this.saveBurstDetectionSettings(incoming),
            this.saveSoundNotificationSettings(incoming),
          ]).then(() => {
            this.view?.webview.postMessage({ type: 'settings', settings: this.loadSettingsPayload() });
          });
          return;
        }
        case 'openFile':
          if (msg.path && typeof msg.path === 'string') {
            void vscode.commands.executeCommand('ai-cli-diff-view.openPendingFile', msg.path);
          }
          return;
        case 'introduceSeen':
          void this.context.globalState.update(INTRODUCE_SEEN_KEY, true);
          return;
        case 'terminalFocusState':
          this.lastTerminalFocused = !!msg.focused;
          return;
        case 'viewTooNarrow':
          // Webview reports its width dropped below ~1/4 of screen width.
          // Close the auxiliary bar (where extension.ts moves the panel on first run).
          // Best-effort: if user moved the panel elsewhere, this still tries the aux bar.
          void vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
          return;
      }
    });

    this.render();
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    const filesInner = buildPendingFilesInnerHtml({
      diffManager: this.diffManager,
      iconBase: this.fileIconsBase(),
      sessionState: this.sessionState,
      lastPrompt: this.lastPrompt,
      errorMessage: this.errorMessage,
    });

    this.view.webview.html = buildTerminalHtml({
      webview: this.view.webview,
      extensionUri: this.context.extensionUri,
      filesInnerHtml: filesInner,
    });
  }

  dispose(): void {
    for (const rec of this.sessions.values()) {
      for (const d of rec.subs) {
        try { d.dispose(); } catch { /* ignore */ }
      }
      try { rec.pty.dispose(); } catch { /* ignore */ }
    }
    this.sessions.clear();
    this.diffDisposable?.dispose();
    this.diffDisposable = undefined;
  }
}

function resolveShellName(): string {
  const shell =
    vscode.env.shell ||
    process.env['ComSpec'] ||
    (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
  const base = path.basename(shell);
  return base.replace(/\.exe$/i, '');
}
