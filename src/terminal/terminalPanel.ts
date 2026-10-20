import * as path from 'path';
import * as vscode from 'vscode';
import { TerminalSessionStore } from './terminalSessions';
import { renderPendingTree } from '../views/pendingTree';
import { findInstallableForPrimary, installFont } from './fontInstaller';
import { DiffManager } from '../diff/diffManager';
import { sortLikePendingTree } from '../diff/treeOrder';
import { buildTerminalHtml } from './terminalHtml';
import { coalesce } from '../util/coalesce';
import { openBeside } from '../preview/openBeside';
import { getPreviewKind, isBinaryImage } from '../preview/previewKind';
import { applySoundNotifications } from '../commands/soundNotifications';
import {
  BurstDetectionSettings,
  CursorStyle,
  DEFAULT_BURST_DETECTION_SETTINGS,
  DEFAULT_EXCLUSION_SETTINGS,
  DEFAULT_FILE_LIMIT_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_SOUND_NOTIFICATION_SETTINGS,
  ExclusionSettings,
  FileLimitSettings,
  MAX_FILE_LINES_CEILING,
  MAX_AUTO_OPEN_DIFFS_CEILING,
  IncomingMessage,
  SoundNotificationSettings,
  TerminalSettings,
  TerminalSettingsPayload,
  ThemePreset,
} from './terminalTypes';

const SETTINGS_KEY = 'ai-cli-diff-view.terminal.settings';
const INTRODUCE_SEEN_KEY = 'ai-cli-diff-view.introduce.seen';
const MAX_IMAGE_PREVIEW_BYTES = 10 * 1024 * 1024;

export class TerminalPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ai-cli-diff-view.terminal';
  public static readonly panelViewType = 'ai-cli-diff-view.terminalPanel';

  private view?: vscode.WebviewView;
  private panel?: vscode.WebviewPanel;
  private webview?: vscode.Webview;
  private webviewMessageDisposable?: vscode.Disposable;
  private webviewDisposeDisposable?: vscode.Disposable;
  private sessionSubs: vscode.Disposable[] = [];
  /** Session output held back while a newly attached webview waits for its snapshot. */
  private restoreQueue: unknown[] | undefined;

  private diffDisposable?: vscode.Disposable;
  private workspaceDiffDisposable?: vscode.Disposable;
  private themeDisposable?: vscode.Disposable;
  private lastTerminalFocused = false;
  private windowBlurredAt = 0;
  private blurTimer: NodeJS.Timeout | undefined;
  private agentModeActive = false;
  private focusWhenReady = false;
  private diffPreviewOpen = false;
  /** Pending list changes come in bursts; resend the preview's file list once per burst. */
  private readonly previewFilesSoon = coalesce(() => this.postDiffPreviewFiles());
  /** Pending Files overlay drawn over the terminal (side bar); the terminal stays alive underneath. */
  private pendingOverlayOpen = false;
  private pendingGeneration = 0;
  private readonly pendingFilesSoon = coalesce(() => { void this.postPendingFiles(); });
  private filePreviewOpen = false;
  private filePreviewPath?: string;
  private pendingAgentFilePath?: string;
  private pendingAgentFilePreviewPath?: string;
  private readonly _onDidChangePreviewActiveFile = new vscode.EventEmitter<string | undefined>();
  public readonly onDidChangePreviewActiveFile = this._onDidChangePreviewActiveFile.event;
  private readonly _onDidChangePreviewVisibility = new vscode.EventEmitter<boolean>();
  public readonly onDidChangePreviewVisibility = this._onDidChangePreviewVisibility.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diffManager: DiffManager,
    private readonly sessions: TerminalSessionStore
  ) {
    this.sessionSubs = [
      sessions.onCreated(({ id, title }) => this.postSession({ type: 'sessionCreated', id, title })),
      sessions.onClosed((id) => this.postSession({ type: 'sessionClosed', id })),
      sessions.onData(({ id, data }) => this.postSession({ type: 'data', id, data })),
      sessions.onExit(({ id, code }) => this.postSession({ type: 'exit', id, code })),
      sessions.onError(({ id, message }) => this.postSession({ type: 'error', id, message })),
    ];
    this.diffDisposable = this.diffManager.onDidChangeDiffs(() => {
      if (this.diffPreviewOpen) {
        this.previewFilesSoon.schedule();
      }
      if (this.pendingOverlayOpen) {
        this.pendingFilesSoon.schedule();
      }
    });
    this.workspaceDiffDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
      if (this.diffPreviewOpen && this.diffManager.hasPendingDiff(event.document.uri.fsPath)) {
        void this.postDiffPreviewFile(event.document.uri.fsPath);
      }
    });
    this.themeDisposable = vscode.window.onDidChangeActiveColorTheme(() => {
      if (this.diffPreviewOpen) {
        void this.webview?.postMessage({ type: 'diffPreviewTheme', theme: currentMonacoTheme() });
      }
    });
  }

  setAgentMode(active: boolean): void {
    this.agentModeActive = active;
    void this.webview?.postMessage({ type: 'agentModeState', active });
  }

  toggleDiffPreview(): void {
    void this.webview?.postMessage({ type: 'toggleDiffPreview' });
  }

  showIntroduce(): void {
    void this.webview?.postMessage({ type: 'openIntroduce' });
  }

  showSettings(): void {
    void this.webview?.postMessage({ type: 'openSettings' });
  }

  openPendingFileInAgent(filePath: string): boolean {
    if (!this.agentModeActive || !this.diffManager.hasPendingDiff(filePath)) {
      return false;
    }
    // Explorer may spell the path with another case; use the one the pending list shows.
    const displayPath = this.diffManager.getDisplayPath(filePath);
    this.filePreviewOpen = false;
    this.filePreviewPath = undefined;
    this.diffPreviewOpen = true;
    this._onDidChangePreviewVisibility.fire(true);
    this._onDidChangePreviewActiveFile.fire(displayPath);
    if (this.webview) {
      void this.webview.postMessage({ type: 'showDiffPreview', path: displayPath });
    } else {
      this.pendingAgentFilePath = displayPath;
    }
    return true;
  }

  openFileInAgent(filePath: string): boolean {
    if (!this.agentModeActive) {
      return false;
    }
    if (this.diffManager.hasPendingDiff(filePath)) {
      return this.openPendingFileInAgent(filePath);
    }
    this.diffPreviewOpen = false;
    this._onDidChangePreviewVisibility.fire(false);
    // Not a pending file: clear the pending-files highlight left by the previous file.
    this._onDidChangePreviewActiveFile.fire(undefined);
    this.filePreviewOpen = true;
    this.filePreviewPath = filePath;
    if (this.webview) {
      void this.webview.postMessage({ type: 'showFilePreview', path: filePath });
    } else {
      this.pendingAgentFilePreviewPath = filePath;
    }
    return true;
  }

  focusTerminal(): void {
    if (!this.webview) {
      // The view is being re-created (e.g. back from Pending Files); focus once it loads.
      this.focusWhenReady = true;
      return;
    }
    try {
      if (this.view) {
        this.view.show(false);
      } else {
        this.panel?.reveal(undefined, false);
      }
      // Revealing the webview is not enough when the editor group was focused
      // by the pending-files view; put the cursor back in xterm as well.
      void this.webview.postMessage({ type: 'focusTerminal' });
    } catch {
      // view may not be resolvable yet; ignore.
    }
    this.focusWhenReady = true;
    void this.webview.postMessage({ type: 'focusTerminal' });
  }

  wasTerminalFocused(): boolean {
    return this.lastTerminalFocused;
  }

  /** Called by the host on every window focus change so a terminal blur can be classed as alt-tab or click-away. */
  noteWindowFocus(focused: boolean): void {
    if (!focused) {
      this.windowBlurredAt = Date.now();
    }
  }

  /**
   * Put the cursor back in xterm without revealing the panel, so a panel the
   * user switched away from is not pulled to the front. Returns whether the
   * message was sent; the webview may still decline (open overlay, input).
   */
  restoreTerminalFocus(): boolean {
    const visible = this.panel ? this.panel.visible && this.panel.active : true;
    if (!this.webview || !visible) {
      return false;
    }
    void this.webview.postMessage({ type: 'focusTerminal', onlyIfIdle: true });
    return true;
  }

  private onTerminalFocusState(focused: boolean): void {
    clearTimeout(this.blurTimer);
    if (focused) {
      this.lastTerminalFocused = true;
      return;
    }
    // A blur caused by alt-tab is followed by (or follows) the window losing
    // focus; a blur caused by clicking another view is not. Wait for the
    // window event before deciding.
    const blurredAt = Date.now();
    this.blurTimer = setTimeout(() => {
      const windowLost = Math.abs(this.windowBlurredAt - blurredAt) < 300;
      this.lastTerminalFocused = windowLost;
    }, 300);
  }

  /** Session messages keep their order behind a pending `restoreSessions` snapshot. */
  private postSession(msg: unknown): void {
    if (this.restoreQueue) {
      this.restoreQueue.push(msg);
      return;
    }
    this.post(msg);
  }

  private post(msg: unknown): void {
    try {
      void this.webview?.postMessage(msg);
    } catch {
      // Webview disposed between the check and the call; nothing to deliver to.
    }
  }

  private async restoreSessions(): Promise<void> {
    if (this.sessions.size === 0) {
      this.sessions.create(80, 24);
      return;
    }
    this.restoreQueue = [];
    try {
      const sessions = await this.sessions.snapshot();
      this.post({ type: 'restoreSessions', sessions, activeId: this.sessions.activeId });
    } finally {
      const queued = this.restoreQueue ?? [];
      this.restoreQueue = undefined;
      for (const msg of queued) {
        this.post(msg);
      }
    }
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
      includedPaths: this.loadIncludedPaths(),
      ...this.loadBurstDetectionSettings(),
      ...this.loadSoundNotificationSettings(),
      ...this.loadFileLimitSettings(),
      ...this.loadExclusionSettings(),
    };
  }

  private loadExclusionSettings(): ExclusionSettings {
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    return {
      excludedPaths: this.normalizeExclusionList(
        config.get<string[]>('excludedPaths', DEFAULT_EXCLUSION_SETTINGS.excludedPaths)
      ),
      respectGitignore: config.get<boolean>('respectGitignore', DEFAULT_EXCLUSION_SETTINGS.respectGitignore),
    };
  }

  private async saveExclusionSettings(incoming: Partial<ExclusionSettings>): Promise<void> {
    const current = this.loadExclusionSettings();
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    // Every write fires onDidChangeConfiguration → baseline rescan, so skip each
    // update when Apply was pressed for some unrelated setting.
    const next = this.normalizeExclusionList(incoming.excludedPaths);
    if (!(next.length === current.excludedPaths.length && next.every((entry, i) => entry === current.excludedPaths[i]))) {
      await config.update('excludedPaths', next, vscode.ConfigurationTarget.Global);
    }
    if (typeof incoming.respectGitignore === 'boolean' && incoming.respectGitignore !== current.respectGitignore) {
      await config.update('respectGitignore', incoming.respectGitignore, vscode.ConfigurationTarget.Global);
    }
  }

  /** Trim, drop empty entries and duplicates. Pattern parsing is left to `pathExclusions.ts` / `fileTypeRules.ts`. */
  private normalizeExclusionList(values: unknown): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const value of values) {
      if (typeof value !== 'string') { continue; }
      const entry = value.trim();
      if (!entry || seen.has(entry)) { continue; }
      seen.add(entry);
      normalized.push(entry);
    }
    return normalized;
  }

  private loadFileLimitSettings(): FileLimitSettings {
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    const value = config.get<number>('maxFileLines', DEFAULT_FILE_LIMIT_SETTINGS.maxFileLines);
    const maxAutoOpen = config.get<number>('maxAutoOpenDiffs', DEFAULT_FILE_LIMIT_SETTINGS.maxAutoOpenDiffs);
    return {
      maxFileLines: Number.isFinite(value)
        ? Math.min(MAX_FILE_LINES_CEILING, Math.max(0, Math.floor(value)))
        : DEFAULT_FILE_LIMIT_SETTINGS.maxFileLines,
      maxAutoOpenDiffs: Number.isFinite(maxAutoOpen)
        ? Math.min(MAX_AUTO_OPEN_DIFFS_CEILING, Math.max(0, Math.floor(maxAutoOpen)))
        : DEFAULT_FILE_LIMIT_SETTINGS.maxAutoOpenDiffs,
    };
  }

  private async saveFileLimitSettings(incoming: Partial<FileLimitSettings>): Promise<void> {
    const next = this.loadFileLimitSettings();
    const value = incoming.maxFileLines;
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    await config.update(
      'maxFileLines',
      typeof value === 'number' && Number.isFinite(value)
        ? Math.min(MAX_FILE_LINES_CEILING, Math.max(0, Math.floor(value)))
        : next.maxFileLines,
      vscode.ConfigurationTarget.Global
    );
    const maxAutoOpen = incoming.maxAutoOpenDiffs;
    await config.update(
      'maxAutoOpenDiffs',
      typeof maxAutoOpen === 'number' && Number.isFinite(maxAutoOpen)
        ? Math.min(MAX_AUTO_OPEN_DIFFS_CEILING, Math.max(0, Math.floor(maxAutoOpen)))
        : next.maxAutoOpenDiffs,
      vscode.ConfigurationTarget.Global
    );
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

  private loadIncludedPaths(): string[] {
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    return this.normalizeExclusionList(config.get<string[]>('includedPaths', []));
  }

  private async saveIncludedPaths(values: unknown): Promise<void> {
    // Same skip as excludedPaths: every write triggers a baseline rescan.
    const current = this.loadIncludedPaths();
    const next = this.normalizeExclusionList(values);
    if (next.length === current.length && next.every((entry, i) => entry === current[i])) { return; }
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    await config.update('includedPaths', next, vscode.ConfigurationTarget.Global);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    console.log('[ai-cli-diff-view] terminal:resolveWebviewView:start');
    this.view = webviewView;
    this.panel = undefined;
    this.attachWebview(webviewView.webview);
    // A `when` clause turning false (Pending Files page, Agent mode) disposes the
    // view; the shells live on in the session store until it is shown again.
    this.webviewDisposeDisposable?.dispose();
    this.webviewDisposeDisposable = webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.detachWebview();
      }
    });
    console.log('[ai-cli-diff-view] terminal:resolveWebviewView:complete');
  }

  openWebviewPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      TerminalPanelProvider.panelViewType,
      'Agent Terminal',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    this.panel = panel;
    this.view = undefined;
    this.attachWebview(panel.webview);
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.dispose();
    }, null, this.context.subscriptions);
    return panel;
  }

  private detachWebview(): void {
    this.webviewMessageDisposable?.dispose();
    this.webviewMessageDisposable = undefined;
    this.webviewDisposeDisposable?.dispose();
    this.webviewDisposeDisposable = undefined;
    this.webview = undefined;
    this.view = undefined;
    this.restoreQueue = undefined;
    this.diffPreviewOpen = false;
    this.filePreviewOpen = false;
    this.pendingOverlayOpen = false;
  }

  private attachWebview(webview: vscode.Webview): void {
    this.webview = webview;
    const xtermDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'xterm');
    const iconsDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'file-icons');
    const introDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'introduce');
    const monacoDir = vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'monaco-editor', 'min');
    const webviewDir = vscode.Uri.joinPath(this.context.extensionUri, 'res', 'webview');
    const previewLibDirs = ['marked', 'dompurify', 'mermaid'].map((name) => (
      vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', name)
    ));
    // Workspace folders let the preview load relative images of a markdown file and image files.
    const workspaceDirs = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri);

    webview.options = {
      enableScripts: true,
      localResourceRoots: [xtermDir, iconsDir, introDir, monacoDir, webviewDir, ...previewLibDirs, ...workspaceDirs],
    };

    this.webviewMessageDisposable?.dispose();
    this.webviewMessageDisposable = webview.onDidReceiveMessage((msg: IncomingMessage) => {
      if (!msg || typeof msg !== 'object') {
        return;
      }
      switch (msg.type) {
        case 'toggleAgentMode':
          console.log('[ai-cli-diff-view] terminal:toggleAgentMode');
          void vscode.commands.executeCommand('ai-cli-diff-view.toggleAgentMode');
          return;
        case 'pendingOverlay':
          this.pendingOverlayOpen = !!msg.open;
          if (this.pendingOverlayOpen) {
            void this.postPendingFiles();
          }
          return;
        case 'openPendingFile':
          void this.diffManager.openDiff(msg.path);
          return;
        case 'ready':
          void this.restoreSessions();
          this.setAgentMode(this.agentModeActive);
          if (this.focusWhenReady) {
            this.focusWhenReady = false;
            void this.webview?.postMessage({ type: 'focusTerminal' });
          }
          if (this.pendingAgentFilePath) {
            const filePath = this.pendingAgentFilePath;
            this.pendingAgentFilePath = undefined;
            void this.webview?.postMessage({ type: 'showDiffPreview', path: filePath });
          }
          if (this.pendingAgentFilePreviewPath) {
            const filePath = this.pendingAgentFilePreviewPath;
            this.pendingAgentFilePreviewPath = undefined;
            void this.webview?.postMessage({ type: 'showFilePreview', path: filePath });
          }
          if (!this.context.globalState.get<boolean>(INTRODUCE_SEEN_KEY)) {
            void this.webview?.postMessage({ type: 'showIntroduce' });
          }
          return;
        case 'createSession':
          this.sessions.create(msg.cols, msg.rows);
          return;
        case 'closeSession':
          this.sessions.close(msg.id);
          return;
        case 'input':
          this.sessions.write(msg.id, msg.data);
          return;
        case 'resize':
          this.sessions.resize(msg.id, msg.cols, msg.rows);
          return;
        case 'activeSession':
          this.sessions.activeId = msg.id;
          return;
        case 'restart':
          this.sessions.restart(msg.id);
          return;
        case 'getSettings':
          this.webview?.postMessage({ type: 'settings', settings: this.loadSettingsPayload() });
          return;
        case 'installFont': {
          const font = findInstallableForPrimary(msg.primary || '');
          if (!font) {
            this.webview?.postMessage({
              type: 'installError',
              primary: msg.primary,
              error: 'No installer registered for this font.',
            });
            return;
          }
          const primary = font.primary;
          this.webview?.postMessage({
            type: 'installProgress',
            primary,
            message: 'Starting…',
          });
          void installFont(font, (m) => {
            this.webview?.postMessage({ type: 'installProgress', primary, message: m });
          }).then((result) => {
            this.webview?.postMessage({
              type: 'installDone',
              primary,
              targetDir: result.targetDir,
              restartRecommended: result.restartRecommended,
            });
          }).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            this.webview?.postMessage({ type: 'installError', primary, error: message });
          });
          return;
        }
        case 'reloadWindow':
          void vscode.commands.executeCommand('workbench.action.reloadWindow');
          return;
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
            this.saveIncludedPaths(incoming.includedPaths),
            this.saveBurstDetectionSettings(incoming),
            this.saveSoundNotificationSettings(incoming),
            this.saveFileLimitSettings(incoming),
            this.saveExclusionSettings(incoming),
          ]).then(() => {
            this.webview?.postMessage({ type: 'settings', settings: this.loadSettingsPayload() });
          });
          return;
        }
        case 'requestDiffPreview':
          this.diffPreviewOpen = true;
          this._onDidChangePreviewVisibility.fire(true);
          this.postDiffPreviewFiles();
          return;
        case 'closeDiffPreview':
          this.diffPreviewOpen = false;
          this._onDidChangePreviewVisibility.fire(false);
          this._onDidChangePreviewActiveFile.fire(undefined);
          return;
        case 'previewActiveFile':
          this._onDidChangePreviewActiveFile.fire(msg.path);
          return;
        case 'requestFilePreview':
          this.filePreviewOpen = true;
          this._onDidChangePreviewVisibility.fire(true);
          this.filePreviewPath = msg.path;
          void this.postFilePreview(msg.path).catch((err: unknown) => {
            this.postFilePreviewError(msg.path, err);
          });
          return;
        case 'closeFilePreview':
          this.filePreviewOpen = false;
          this._onDidChangePreviewVisibility.fire(false);
          this.filePreviewPath = undefined;
          return;
        case 'filePreviewEdit':
          void this.applyFilePreviewEdit(msg.path, msg.content).catch((err: unknown) => {
            this.postFilePreviewError(msg.path, err);
          });
          return;
        case 'filePreviewSave':
          void this.saveFilePreview(msg.path).catch((err: unknown) => {
            this.postFilePreviewError(msg.path, err);
          });
          return;
        case 'sessionTitle':
          // Only the agent-mode panel has a title of its own; the sidebar view keeps its fixed name.
          if (this.panel) {
            this.panel.title = typeof msg.title === 'string' && msg.title.trim() ? msg.title : 'Agent Terminal';
          }
          return;
        case 'filePreviewOpenBeside':
          void openBeside(msg.path).catch((err: unknown) => {
            void vscode.window.showErrorMessage(`Could not open file beside: ${err instanceof Error ? err.message : String(err)}`);
          });
          return;
        case 'requestDiffPreviewFile':
          void this.postDiffPreviewFile(msg.path);
          return;
        case 'previewEditModified':
          void this.diffManager.applyPreviewEdit(msg.path, msg.newCurrent).catch((err: unknown) => {
            this.postDiffPreviewError(msg.path, err);
          });
          return;
        case 'previewSaveFile':
          void this.diffManager.savePreviewFile(msg.path).catch((err: unknown) => {
            this.postDiffPreviewError(msg.path, err);
          });
          return;
        case 'previewAcceptHunk':
          void this.diffManager.acceptHunkFromPreview(msg.path, msg.newOriginal, msg.newCurrent)
            .catch((err: unknown) => this.postDiffPreviewError(msg.path, err));
          return;
        case 'previewRejectHunk':
          void this.diffManager.rejectHunkFromPreview(msg.path, msg.newOriginal, msg.newCurrent)
            .catch((err: unknown) => this.postDiffPreviewError(msg.path, err));
          return;
        case 'previewAcceptFile':
          void this.diffManager.acceptFromPreview(msg.path)
            .catch((err: unknown) => this.postDiffPreviewError(msg.path, err));
          return;
        case 'previewRejectFile':
          void this.diffManager.revertFromPreview(msg.path)
            .catch((err: unknown) => this.postDiffPreviewError(msg.path, err));
          return;
        case 'introduceSeen':
          void this.context.globalState.update(INTRODUCE_SEEN_KEY, true);
          return;
        case 'terminalFocusState':
          this.onTerminalFocusState(!!msg.focused);
          return;
        case 'viewTooNarrow':
          // Webview reports its width dropped below ~1/4 of screen width.
          // Close the auxiliary bar (where extension.ts moves the panel on first run).
          // Best-effort: if user moved the panel elsewhere, this still tries the aux bar.
          if (this.view) {
            void vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
          }
          return;
      }
    });

    this.render();
  }

  private render(): void {
    if (!this.webview) {
      return;
    }
    this.webview.html = buildTerminalHtml({
      webview: this.webview,
      extensionUri: this.context.extensionUri,
    });
  }

  private async postPendingFiles(): Promise<void> {
    const generation = ++this.pendingGeneration;
    const metadata = await this.diffManager.getDiffPreviewMetadata();
    if (generation !== this.pendingGeneration || !this.webview || !this.pendingOverlayOpen) {
      return;
    }
    const iconBase = this.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'file-icons'),
    ).toString() + '/';
    this.post({ type: 'pendingFiles', html: renderPendingTree(metadata, undefined, iconBase) });
  }

  private postDiffPreviewFiles(): void {
    if (!this.webview || !this.diffPreviewOpen) {
      return;
    }
    const files = sortLikePendingTree(this.diffManager.getPendingFiles()).map((filePath) => ({
      path: filePath,
      label: this.displayPath(filePath),
    }));
    void this.webview.postMessage({ type: 'diffPreviewFiles', files });
  }

  private async postDiffPreviewFile(filePath: string): Promise<void> {
    if (!this.webview || !this.diffPreviewOpen) {
      return;
    }
    const file = await this.diffManager.getDiffPreviewFile(filePath);
    if (!this.webview || !this.diffPreviewOpen) {
      return;
    }
    void this.webview.postMessage({
      type: 'diffPreviewFile',
      path: filePath,
      file,
      theme: currentMonacoTheme(),
    });
  }

  private postDiffPreviewError(filePath: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    void this.webview?.postMessage({ type: 'diffPreviewError', path: filePath, message });
  }

  private async postFilePreview(filePath: string): Promise<void> {
    if (!this.webview || !this.filePreviewOpen) { return; }
    const uri = vscode.Uri.file(filePath);
    const kind = getPreviewKind(filePath);
    const label = this.displayPath(filePath);
    const theme = currentMonacoTheme();

    if (isBinaryImage(filePath)) {
      const stat = await vscode.workspace.fs.stat(uri);
      if (!this.webview || !this.filePreviewOpen) { return; }
      if (stat.size > MAX_IMAGE_PREVIEW_BYTES) {
        throw new Error(`Image is too large to preview (${(stat.size / 1048576).toFixed(1)} MB)`);
      }
      this.assertInWorkspace(uri);
      void this.webview.postMessage({
        type: 'filePreviewData', kind, path: filePath, label, theme,
        src: this.webview.asWebviewUri(uri).toString(),
        size: stat.size,
      });
      return;
    }

    const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === filePath);
    const document = openDocument ?? await vscode.workspace.openTextDocument(uri);
    if (!this.webview || !this.filePreviewOpen) { return; }
    const payload: Record<string, unknown> = {
      type: 'filePreviewData',
      kind,
      path: filePath,
      label,
      content: document.getText(),
      language: document.languageId,
      theme,
    };
    if (kind === 'image' || kind === 'markdown') {
      // Webview URIs only resolve inside localResourceRoots; outside the workspace they would 404.
      const inWorkspace = !!vscode.workspace.getWorkspaceFolder(uri);
      if (kind === 'image') {
        this.assertInWorkspace(uri);
        payload.src = this.webview.asWebviewUri(uri).toString();
      } else if (inWorkspace) {
        const dir = vscode.Uri.file(path.dirname(filePath));
        payload.baseUri = `${this.webview.asWebviewUri(dir).toString()}/`;
      }
    }
    void this.webview.postMessage(payload);
  }

  private assertInWorkspace(uri: vscode.Uri): void {
    if (!vscode.workspace.getWorkspaceFolder(uri)) {
      throw new Error('File is outside the workspace, open it from the Explorer instead');
    }
  }

  private async applyFilePreviewEdit(filePath: string, content: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), content);
    await vscode.workspace.applyEdit(edit);
  }

  private async saveFilePreview(filePath: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await document.save();
  }

  private postFilePreviewError(filePath: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    void this.webview?.postMessage({ type: 'filePreviewError', path: filePath, message });
  }

  private displayPath(filePath: string): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!workspaceFolder) {
      return path.basename(filePath);
    }
    const relative = path.relative(workspaceFolder.uri.fsPath, filePath);
    return relative || path.basename(filePath);
  }

  dispose(): void {
    // Sessions belong to the shared store and outlive this webview.
    for (const d of this.sessionSubs) {
      d.dispose();
    }
    this.sessionSubs = [];
    this.restoreQueue = undefined;
    this.webviewMessageDisposable?.dispose();
    this.webviewMessageDisposable = undefined;
    this.webviewDisposeDisposable?.dispose();
    this.webviewDisposeDisposable = undefined;
    this.webview = undefined;
    this.view = undefined;
    this.panel = undefined;
    this.focusWhenReady = false;
    this.diffDisposable?.dispose();
    this.diffDisposable = undefined;
    this.previewFilesSoon.dispose();
    this.pendingFilesSoon.dispose();
    this.pendingOverlayOpen = false;
    this.workspaceDiffDisposable?.dispose();
    this.workspaceDiffDisposable = undefined;
    this.themeDisposable?.dispose();
    this.themeDisposable = undefined;
    this.diffPreviewOpen = false;
    this.filePreviewOpen = false;
    this.filePreviewPath = undefined;
    this.pendingAgentFilePath = undefined;
    this.pendingAgentFilePreviewPath = undefined;
    this._onDidChangePreviewActiveFile.dispose();
    this._onDidChangePreviewVisibility.dispose();
  }
}

function currentMonacoTheme(): string {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Light: return 'vs';
    case vscode.ColorThemeKind.HighContrast: return 'hc-black';
    case vscode.ColorThemeKind.HighContrastLight: return 'hc-light';
    default: return 'vs-dark';
  }
}
