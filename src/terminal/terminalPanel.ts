import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PtySession } from './ptySession';
import { findInstallableForPrimary, installFont } from './fontInstaller';
import { DiffManager } from '../diff/diffManager';
import {
  buildPendingFilesInnerHtml,
  PENDING_FILES_CSS,
  SessionState,
} from './pendingFilesPage';

type ThemePreset = 'vscode' | 'default-dark' | 'solarized-dark' | 'dracula' | 'custom';
type CursorStyle = 'block' | 'underline' | 'bar';

interface TerminalColors {
  background: string;
  foreground: string;
  cursor: string;
}

interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  themePreset: ThemePreset;
  customColors: TerminalColors;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
}

const SETTINGS_KEY = 'ai-cli-diff-view.terminal.settings';
const INTRODUCE_SEEN_KEY = 'ai-cli-diff-view.introduce.seen';

const DEFAULT_SETTINGS: TerminalSettings = {
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 13,
  themePreset: 'vscode',
  customColors: { background: '#1e1e1e', foreground: '#cccccc', cursor: '#ffffff' },
  cursorStyle: 'block',
  cursorBlink: true,
};

interface FontOption {
  label: string;
  value: string;
  primary: string; // primary CSS family name (without quotes) — used for detection + install lookup
}

const FONT_OPTIONS: ReadonlyArray<FontOption> = [
  { label: 'Consolas',          value: 'Consolas, "Courier New", monospace',                     primary: 'Consolas' },
  { label: 'Cascadia Code',     value: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',  primary: 'Cascadia Code' },
  { label: 'Cascadia Mono',     value: '"Cascadia Mono", Consolas, monospace',                   primary: 'Cascadia Mono' },
  { label: 'Fira Code',         value: '"Fira Code", Consolas, monospace',                       primary: 'Fira Code' },
  { label: 'JetBrains Mono',    value: '"JetBrains Mono", Consolas, monospace',                  primary: 'JetBrains Mono' },
  { label: 'Source Code Pro',   value: '"Source Code Pro", Consolas, monospace',                 primary: 'Source Code Pro' },
  { label: 'Hack',              value: 'Hack, Consolas, monospace',                              primary: 'Hack' },
  { label: 'Menlo / Monaco',    value: 'Menlo, Monaco, "Courier New", monospace',                primary: 'Menlo' },
  { label: 'Ubuntu Mono',       value: '"Ubuntu Mono", Consolas, monospace',                     primary: 'Ubuntu Mono' },
  { label: 'IBM Plex Mono',     value: '"IBM Plex Mono", Consolas, monospace',                   primary: 'IBM Plex Mono' },
  { label: 'Roboto Mono',       value: '"Roboto Mono", Consolas, monospace',                     primary: 'Roboto Mono' },
  { label: 'SF Mono',           value: '"SF Mono", Menlo, Consolas, monospace',                  primary: 'SF Mono' },
  { label: 'Courier New',       value: '"Courier New", Courier, monospace',                      primary: 'Courier New' },
];

type IncomingMessage =
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

  private postFilesUpdate(): void {
    if (!this.view) {
      return;
    }
    const html = buildPendingFilesInnerHtml({
      diffManager: this.diffManager,
      extensionUri: this.context.extensionUri,
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
          this.view?.webview.postMessage({ type: 'settings', settings: this.loadSettings() });
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
          void this.saveSettings(sanitized).then(() => {
            this.view?.webview.postMessage({ type: 'settings', settings: sanitized });
          });
          return;
        }
        case 'openFile':
          if (msg.path && typeof msg.path === 'string') {
            void vscode.commands.executeCommand('ai-cli-diff-view.openPendingFile', msg.path);
          }
          return;
        case 'installHooks':
          void vscode.commands.executeCommand('ai-cli-diff-view.installHooks');
          return;
        case 'introduceSeen':
          void this.context.globalState.update(INTRODUCE_SEEN_KEY, true);
          return;
      }
    });

    this.render();
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    const webview = this.view.webview;
    const xtermBase = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'xterm')
    );
    const xtermJs = `${xtermBase}/xterm.js`;
    const xtermCss = `${xtermBase}/xterm.css`;
    const addonFitJs = `${xtermBase}/addon-fit.js`;

    const introBase = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'introduce')
    );
    const introSlides = [
      {
        src: `${introBase}/welcome.png`,
        caption: 'Welcome to AI CLI Diff — review every AI edit before it lands.',
      },
      {
        src: `${introBase}/image1.png`,
        caption: 'Accept or reject each AI change with one click in the side panel.',
      },
      {
        src: `${introBase}/image2.png`,
        caption: 'Run an AI CLI agent right inside the embedded terminal.',
      },
      {
        src: `${introBase}/image3.png`,
        caption: 'See changed files in their real folder structure.',
      },
      {
        src: `${introBase}/image4.png`,
        caption: 'Review changes hunk by hunk directly in the editor.',
      },
      {
        src: `${introBase}/image5.png`,
        caption: 'Customize terminal font, theme, and cursor from the Settings popover.',
      },
    ];

    const filesInner = buildPendingFilesInnerHtml({
      diffManager: this.diffManager,
      extensionUri: this.context.extensionUri,
      iconBase: this.fileIconsBase(),
      sessionState: this.sessionState,
      lastPrompt: this.lastPrompt,
      errorMessage: this.errorMessage,
    });

    const nonce = randomNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');

    webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${xtermCss}">
<style>
  html, body { height: 100%; margin: 0; padding: 0; }
  body {
    background: var(--vscode-sideBar-background, #1e1e1e);
    color: var(--vscode-foreground, #cccccc);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #header {
    flex: 0 0 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
    background: var(--vscode-sideBar-background);
    font-family: var(--vscode-font-family);
    font-size: 11px;
    user-select: none;
  }
  #header-title {
    opacity: 0.75;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  #header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .header-btn {
    background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    border: none;
    cursor: pointer;
    padding: 3px;
    border-radius: 4px;
    line-height: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
  }
  .header-btn svg { display: block; }
  .header-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18)); color: var(--vscode-foreground); }
  .header-btn:active { background: var(--vscode-toolbar-activeBackground, rgba(128,128,128,0.28)); }

  /* Page switching */
  body.page-files #term-wrap { display: none; }
  body.page-files #tab-strip { display: none; }
  body.page-terminal #files-wrap { display: none; }
  body.page-files #btn-settings { display: none; }
  body.page-terminal .title-files { display: none; }
  body.page-files .title-terminal { display: none; }
  body.page-terminal .toggle-to-files { display: inline-flex; }
  body.page-terminal .toggle-to-terminal { display: none; }
  body.page-files .toggle-to-files { display: none; }
  body.page-files .toggle-to-terminal { display: inline-flex; }

  /* Tab strip */
  #tab-strip {
    flex: 0 0 28px;
    height: 28px;
    display: flex;
    align-items: stretch;
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
    font-family: var(--vscode-font-family);
    font-size: 11px;
    user-select: none;
    min-width: 0;
  }
  .tabs {
    flex: 1 1 auto;
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    min-width: 0;
    scrollbar-width: thin;
  }
  .tabs::-webkit-scrollbar { height: 4px; }
  .tabs::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, rgba(128,128,128,0.4)); border-radius: 2px; }
  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px 0 10px;
    min-width: 90px;
    max-width: 160px;
    height: 100%;
    border-right: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.18));
    cursor: pointer;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    color: var(--vscode-foreground);
    opacity: 0.78;
  }
  .tab:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.12)); opacity: 1; }
  .tab.active {
    background: var(--vscode-editor-background);
    opacity: 1;
  }
  .tab.active::after {
    content: '';
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 1px;
    background: var(--vscode-focusBorder, #007fd4);
  }
  .tab-title {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab-close {
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    opacity: 0;
    font-size: 14px;
    line-height: 1;
  }
  .tab:hover .tab-close, .tab.active .tab-close { opacity: 0.7; }
  .tab-close:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18)); opacity: 1; }
  .tab-add {
    flex: 0 0 28px;
    background: transparent;
    border: none;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .tab-add:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18)); }

  #content {
    flex: 1 1 auto;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }
  #term-wrap {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--vscode-editor-background);
  }
  #term-host { width: 100%; height: 100%; position: relative; }
  .term-pane {
    position: absolute;
    inset: 0;
    display: none;
  }
  .term-pane.active { display: block; }
  .xterm { padding: 4px 0 0 6px; height: 100%; }

  #files-wrap {
    position: absolute;
    inset: 0;
  }
  ${PENDING_FILES_CSS}

  #err {
    position: absolute;
    top: 8px; left: 10px; right: 10px;
    color: #f48771;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    white-space: pre-wrap;
    background: rgba(0,0,0,0.6);
    padding: 6px 8px;
    border-radius: 4px;
    display: none;
    z-index: 5;
  }

  #settings-overlay {
    position: absolute;
    inset: 0;
    background: var(--vscode-sideBar-background, #1e1e1e);
    color: var(--vscode-foreground);
    padding: 12px 14px 14px;
    overflow: auto;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    z-index: 10;
  }
  #settings-overlay[hidden] { display: none; }
  .settings-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .settings-head h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.85;
  }
  #btn-close {
    background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    border: none;
    cursor: pointer;
    line-height: 0;
    padding: 3px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
  }
  #btn-close svg { display: block; }
  #btn-close:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18)); color: var(--vscode-foreground); }

  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .field label {
    flex: 0 0 96px;
    opacity: 0.85;
  }
  .field input[type="text"],
  .field input[type="number"],
  .field select {
    flex: 1 1 auto;
    min-width: 0;
    padding: 4px 6px;
    background: var(--vscode-input-background, #2a2a2a);
    color: var(--vscode-input-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    font-family: inherit;
    font-size: 12px;
    box-sizing: border-box;
  }
  .field input[type="number"] { flex: 0 0 80px; }
  .field input[type="color"] {
    width: 38px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
    background: transparent;
    cursor: pointer;
  }
  .field input[type="checkbox"] { margin: 0; }
  .field.indent { padding-left: 16px; }
  .color-row { display: flex; align-items: center; gap: 8px; }
  .color-row span { font-family: var(--vscode-editor-font-family, monospace); opacity: 0.7; font-size: 11px; }

  .install-controls { display: flex; align-items: center; gap: 10px; flex: 1 1 auto; min-width: 0; }
  .install-status { font-size: 11px; opacity: 0.8; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .install-status.ok { color: var(--vscode-charts-green, #4caf50); }
  .install-status.err { color: var(--vscode-errorForeground, #f48771); }
  #btn-install-font[disabled] { opacity: 0.55; cursor: default; }
  #btn-reload-window { display: none; }

  /* Introduce overlay */
  #introduce-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 20;
    font-family: var(--vscode-font-family);
    font-size: 12px;
  }
  #introduce-overlay[hidden] { display: none; }
  .intro-card {
    background: var(--vscode-sideBar-background, #1e1e1e);
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    border-radius: 6px;
    width: 100%;
    max-width: 520px;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 6px 24px rgba(0,0,0,0.35);
  }
  .intro-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
  }
  .intro-head h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.85;
  }
  #btn-intro-close {
    background: transparent;
    color: var(--vscode-icon-foreground, var(--vscode-foreground));
    border: none;
    cursor: pointer;
    line-height: 0;
    padding: 3px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
  }
  #btn-intro-close:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.18)); }
  .intro-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    overflow: auto;
    flex: 1 1 auto;
    min-height: 0;
  }
  #intro-img {
    width: 100%;
    aspect-ratio: 1919 / 1023;
    height: auto;
    object-fit: contain;
    border-radius: 4px;
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  }
  #intro-caption {
    margin: 0;
    text-align: center;
    line-height: 1.4;
    opacity: 0.92;
  }
  .intro-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
  }
  #intro-counter { opacity: 0.7; font-size: 11px; }
  .intro-nav { display: flex; gap: 8px; }
  #btn-intro-prev[disabled] { opacity: 0.5; cursor: default; }

  .actions {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 16px;
    padding-top: 10px;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  }
  .btn {
    padding: 6px 14px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    transition: filter 0.12s;
  }
  .btn-primary {
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
  }
  .btn-secondary {
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    background: var(--vscode-button-secondaryBackground, transparent);
    border: 1px solid var(--vscode-button-secondaryBorder, rgba(128,128,128,0.35));
  }
  .btn:hover { filter: brightness(1.1); }
  .btn:active { filter: brightness(0.95); }
</style>
</head>
<body class="page-terminal">
  <div id="header">
    <span id="header-title">
      <span class="title-terminal">Terminal</span>
      <span class="title-files">Pending Files</span>
    </span>
    <div id="header-actions">
      <button id="btn-toggle-page" class="header-btn" title="Switch view" aria-label="Switch view">
        <svg class="toggle-to-files" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18"/>
          <path d="M3 12h18"/>
          <path d="M3 18h12"/>
        </svg>
        <svg class="toggle-to-terminal" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="4 8 8 12 4 16"/>
          <line x1="12" y1="18" x2="20" y2="18"/>
        </svg>
      </button>
      <button id="btn-introduce" class="header-btn" title="Introduce" aria-label="Introduce">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      </button>
      <button id="btn-settings" class="header-btn" title="Settings" aria-label="Settings">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  </div>
  <div id="tab-strip">
    <div id="tabs" class="tabs"></div>
    <button id="tab-add" class="tab-add" type="button" title="New terminal" aria-label="New terminal">+</button>
  </div>
  <div id="content">
    <div id="term-wrap">
      <div id="err"></div>
      <div id="term-host"></div>
      <div id="settings-overlay" hidden>
        <div class="settings-head">
          <h2>Settings</h2>
          <button id="btn-close" title="Close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="field">
          <label for="f-font-family">Font family</label>
          <select id="f-font-family">
${FONT_OPTIONS.map((f) => {
  const installable = !!findInstallableForPrimary(f.primary);
  return `            <option value="${escapeAttr(f.value)}" data-primary="${escapeAttr(f.primary)}"${installable ? ' data-installable="1"' : ''}>${escapeHtml(f.label)}</option>`;
}).join('\n')}
          </select>
        </div>
        <div class="field field-install" id="install-row" hidden>
          <label></label>
          <div class="install-controls">
            <button id="btn-install-font" class="btn btn-secondary" type="button">Install font</button>
            <button id="btn-reload-window" class="btn btn-secondary" type="button">Reload window</button>
            <span class="install-status" id="install-status"></span>
          </div>
        </div>
        <div class="field">
          <label for="f-font-size">Font size</label>
          <input id="f-font-size" type="number" min="6" max="32" step="1">
        </div>
        <div class="field">
          <label for="f-preset">Theme</label>
          <select id="f-preset">
            <option value="vscode">Follow VS Code</option>
            <option value="default-dark">Default Dark</option>
            <option value="solarized-dark">Solarized Dark</option>
            <option value="dracula">Dracula</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="field indent custom-only">
          <label for="f-bg">Background</label>
          <div class="color-row">
            <input id="f-bg" type="color">
            <span id="f-bg-hex"></span>
          </div>
        </div>
        <div class="field indent custom-only">
          <label for="f-fg">Foreground</label>
          <div class="color-row">
            <input id="f-fg" type="color">
            <span id="f-fg-hex"></span>
          </div>
        </div>
        <div class="field indent custom-only">
          <label for="f-cursor-color">Cursor color</label>
          <div class="color-row">
            <input id="f-cursor-color" type="color">
            <span id="f-cursor-hex"></span>
          </div>
        </div>
        <div class="field">
          <label for="f-cursor-style">Cursor style</label>
          <select id="f-cursor-style">
            <option value="block">Block</option>
            <option value="underline">Underline</option>
            <option value="bar">Bar</option>
          </select>
        </div>
        <div class="field">
          <label for="f-cursor-blink">Cursor blink</label>
          <input id="f-cursor-blink" type="checkbox">
        </div>

        <div class="actions">
          <button id="btn-reset" class="btn btn-secondary" type="button">Reset</button>
          <button id="btn-apply" class="btn btn-primary" type="button">Apply</button>
        </div>
      </div>
    </div>
    <div id="files-wrap">${filesInner}</div>
    <div id="introduce-overlay" hidden>
      <div class="intro-card">
        <div class="intro-head">
          <h2>Introduction</h2>
          <button id="btn-intro-close" type="button" aria-label="Close">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="intro-body">
          <img id="intro-img" src="" alt="">
          <p id="intro-caption"></p>
        </div>
        <div class="intro-footer">
          <span id="intro-counter">1 / 4</span>
          <div class="intro-nav">
            <button id="btn-intro-prev" class="btn btn-secondary" type="button">Prev</button>
            <button id="btn-intro-next" class="btn btn-primary" type="button">Next</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" src="${xtermJs}"></script>
  <script nonce="${nonce}" src="${addonFitJs}"></script>
  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const errEl = document.getElementById('err');
      function showError(msg) {
        errEl.style.display = 'block';
        errEl.textContent = msg;
      }

      if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined' || !FitAddon.FitAddon) {
        showError('xterm.js failed to load');
        return;
      }

      const DEFAULTS = ${JSON.stringify(DEFAULT_SETTINGS)};
      let currentSettings = JSON.parse(JSON.stringify(DEFAULTS));

      const termHost = document.getElementById('term-host');
      const tabsEl = document.getElementById('tabs');
      const btnAddTab = document.getElementById('tab-add');

      // id -> { id, term, fit, host, tab, dataDisp, exited }
      const sessions = new Map();
      let activeId = null;

      function safeFitSession(sess) { try { sess.fit.fit(); } catch (_) { /* ignore */ } }

      function pickVar(name, fallback) {
        const v = getComputedStyle(document.body).getPropertyValue(name).trim();
        return v || fallback;
      }

      function resolveTheme(s) {
        switch (s.themePreset) {
          case 'default-dark':
            return { background: '#1e1e1e', foreground: '#cccccc', cursor: '#ffffff' };
          case 'solarized-dark':
            return { background: '#002b36', foreground: '#93a1a1', cursor: '#93a1a1' };
          case 'dracula':
            return { background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2' };
          case 'custom':
            return {
              background: s.customColors.background,
              foreground: s.customColors.foreground,
              cursor: s.customColors.cursor,
            };
          case 'vscode':
          default: {
            const bg = pickVar('--vscode-terminal-background', '') ||
                       pickVar('--vscode-editor-background', '#1e1e1e');
            const fg = pickVar('--vscode-terminal-foreground', '') ||
                       pickVar('--vscode-editor-foreground', '#cccccc');
            const cur = pickVar('--vscode-terminalCursor-foreground', '') ||
                        pickVar('--vscode-editorCursor-foreground', fg);
            return { background: bg, foreground: fg, cursor: cur };
          }
        }
      }

      function applySettings(s) {
        currentSettings = s;
        const theme = resolveTheme(s);
        const wrap = document.getElementById('term-wrap');
        if (wrap) wrap.style.background = theme.background;
        for (const sess of sessions.values()) {
          sess.term.options.fontFamily = s.fontFamily;
          sess.term.options.fontSize = s.fontSize;
          sess.term.options.cursorStyle = s.cursorStyle;
          sess.term.options.cursorBlink = s.cursorBlink;
          sess.term.options.theme = theme;
          try { sess.term.clearTextureAtlas && sess.term.clearTextureAtlas(); } catch (_) {}
          safeFitSession(sess);
          try { sess.term.refresh(0, sess.term.rows - 1); } catch (_) {}
          vscode.postMessage({ type: 'resize', id: sess.id, cols: sess.term.cols, rows: sess.term.rows });
        }
      }

      function makeXterm() {
        return new Terminal({
          fontFamily: currentSettings.fontFamily,
          fontSize: currentSettings.fontSize,
          cursorStyle: currentSettings.cursorStyle,
          cursorBlink: currentSettings.cursorBlink,
          allowProposedApi: true,
          theme: resolveTheme(currentSettings),
        });
      }

      function buildTabDom(id, title) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.id = id;
        const titleEl = document.createElement('span');
        titleEl.className = 'tab-title';
        titleEl.textContent = title;
        const closeEl = document.createElement('span');
        closeEl.className = 'tab-close';
        closeEl.title = 'Close terminal';
        closeEl.textContent = '×';
        tab.appendChild(titleEl);
        tab.appendChild(closeEl);
        tab.addEventListener('click', (e) => {
          if (e.target === closeEl) return;
          activateTab(id);
        });
        closeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: 'closeSession', id });
        });
        return tab;
      }

      function activateTab(id) {
        if (!sessions.has(id)) return;
        if (activeId === id) return;
        const old = sessions.get(activeId);
        if (old) {
          old.host.classList.remove('active');
          old.tab.classList.remove('active');
        }
        const next = sessions.get(id);
        next.host.classList.add('active');
        next.tab.classList.add('active');
        activeId = id;
        // scroll the tab into view
        try { next.tab.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {}
        requestAnimationFrame(() => {
          safeFitSession(next);
          vscode.postMessage({ type: 'resize', id, cols: next.term.cols, rows: next.term.rows });
          try { next.term.focus(); } catch (_) {}
        });
      }

      function onSessionCreated(id, title) {
        const host = document.createElement('div');
        host.className = 'term-pane';
        host.dataset.id = id;
        termHost.appendChild(host);

        const t = makeXterm();
        const f = new FitAddon.FitAddon();
        t.loadAddon(f);
        t.open(host);

        const tab = buildTabDom(id, title);
        tabsEl.appendChild(tab);

        const sess = { id, term: t, fit: f, host, tab, dataDisp: null, exited: false };
        sess.dataDisp = t.onData((data) => {
          if (sess.exited) return;
          vscode.postMessage({ type: 'input', id, data });
        });
        sessions.set(id, sess);
        activateTab(id);
        // also fit + report dims (activateTab already does this on the rAF tick)
      }

      function onSessionClosed(id) {
        const sess = sessions.get(id);
        if (!sess) return;
        try { sess.dataDisp && sess.dataDisp.dispose(); } catch (_) {}
        try { sess.term.dispose(); } catch (_) {}
        sess.host.remove();
        sess.tab.remove();
        sessions.delete(id);
        if (activeId === id) {
          activeId = null;
          const remaining = Array.from(sessions.keys());
          if (remaining.length > 0) {
            activateTab(remaining[remaining.length - 1]);
          }
          // if zero remain, extension auto-spawns a replacement and we receive sessionCreated.
        }
      }

      function isFontInstalled(family) {
        const test = 'mmmmmmmmmmlliIWW';
        const size = '72px';
        function measure(stack) {
          const el = document.createElement('span');
          el.textContent = test;
          el.style.fontFamily = stack;
          el.style.fontSize = size;
          el.style.position = 'absolute';
          el.style.left = '-9999px';
          el.style.top = '-9999px';
          el.style.visibility = 'hidden';
          el.style.whiteSpace = 'nowrap';
          document.body.appendChild(el);
          const w = el.offsetWidth;
          document.body.removeChild(el);
          return w;
        }
        const baseline = measure('monospace');
        const primary = (family.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
        if (!primary) return true;
        const target = measure('"' + primary + '", monospace');
        return target !== baseline;
      }

      requestAnimationFrame(() => {
        vscode.postMessage({ type: 'ready' });
        vscode.postMessage({ type: 'getSettings' });
        // Bootstrap the first session. Extension will reply with sessionCreated.
        vscode.postMessage({ type: 'createSession', cols: 80, rows: 24 });
      });

      const ro = new ResizeObserver(() => {
        const sess = sessions.get(activeId);
        if (!sess) return;
        safeFitSession(sess);
        vscode.postMessage({ type: 'resize', id: activeId, cols: sess.term.cols, rows: sess.term.rows });
      });
      ro.observe(termHost);

      btnAddTab.addEventListener('click', () => {
        const sess = sessions.get(activeId);
        const cols = sess ? sess.term.cols : 80;
        const rows = sess ? sess.term.rows : 24;
        vscode.postMessage({ type: 'createSession', cols, rows });
      });

      const themeObserver = new MutationObserver(() => {
        if (currentSettings.themePreset === 'vscode') {
          applySettings(currentSettings);
        }
      });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

      window.addEventListener('message', (e) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.type === 'sessionCreated') {
          onSessionCreated(msg.id, msg.title);
        } else if (msg.type === 'sessionClosed') {
          onSessionClosed(msg.id);
        } else if (msg.type === 'data') {
          const s = sessions.get(msg.id);
          if (s) s.term.write(msg.data);
        } else if (msg.type === 'exit') {
          const s = sessions.get(msg.id);
          if (s) {
            s.exited = true;
            s.term.writeln('\\r\\n\\x1b[2m[shell exited: ' + msg.code + '] press any key to restart\\x1b[0m');
            const once = s.term.onData(() => {
              once.dispose();
              s.exited = false;
              try { s.term.reset(); } catch (_) {}
              vscode.postMessage({ type: 'restart', id: msg.id });
            });
          }
        } else if (msg.type === 'error') {
          showError('PTY error: ' + msg.message);
        } else if (msg.type === 'settings') {
          applySettings(msg.settings);
        } else if (msg.type === 'installProgress') {
          setInstallStatus(msg.message || 'Installing…', '');
        } else if (msg.type === 'installDone') {
          refreshFontAnnotations();
          btnInstallFont.disabled = true;
          btnInstallFont.textContent = 'Installed';
          if (msg.restartRecommended) {
            btnReload.style.display = '';
            setInstallStatus('Installed. Reload window to start using it.', 'ok');
          } else {
            setInstallStatus('Installed.', 'ok');
          }
        } else if (msg.type === 'installError') {
          btnInstallFont.disabled = false;
          btnInstallFont.textContent = 'Retry install';
          setInstallStatus(msg.error || 'Install failed', 'err');
        } else if (msg.type === 'filesUpdate') {
          const wrap = document.getElementById('files-wrap');
          if (wrap) {
            wrap.innerHTML = msg.html;
            bindFilesPage();
          }
        } else if (msg.type === 'showIntroduce') {
          openIntro();
        }
      });

      // ---- Page toggle ----
      const btnTogglePage = document.getElementById('btn-toggle-page');
      btnTogglePage.addEventListener('click', () => {
        const isTerminal = document.body.classList.contains('page-terminal');
        document.body.classList.toggle('page-terminal', !isTerminal);
        document.body.classList.toggle('page-files', isTerminal);
        if (!isTerminal) {
          // Switched back to terminal — refit active session since size may have changed.
          requestAnimationFrame(() => {
            const sess = sessions.get(activeId);
            if (sess) {
              safeFitSession(sess);
              vscode.postMessage({ type: 'resize', id: activeId, cols: sess.term.cols, rows: sess.term.rows });
            }
          });
        }
      });

      // ---- Files page bindings (rebound after every filesUpdate) ----
      function bindFilesPage() {
        const tree = document.getElementById('file-tree');
        if (tree) {
          tree.querySelectorAll('.tree-row-file').forEach((btn) => {
            btn.addEventListener('click', () => {
              const p = btn.getAttribute('data-path');
              if (p) vscode.postMessage({ type: 'openFile', path: p });
            });
          });
        }
        const btnInstallHooks = document.getElementById('btn-install');
        if (btnInstallHooks) {
          btnInstallHooks.addEventListener('click', () => {
            vscode.postMessage({ type: 'installHooks' });
          });
        }
      }
      bindFilesPage();

      // ---- Settings overlay ----
      const overlay = document.getElementById('settings-overlay');
      const btnOpen = document.getElementById('btn-settings');
      const btnClose = document.getElementById('btn-close');
      const btnReset = document.getElementById('btn-reset');
      const btnApply = document.getElementById('btn-apply');
      const fFontFamily = document.getElementById('f-font-family');
      const fFontSize = document.getElementById('f-font-size');
      const fPreset = document.getElementById('f-preset');
      const fBg = document.getElementById('f-bg');
      const fFg = document.getElementById('f-fg');
      const fCursorColor = document.getElementById('f-cursor-color');
      const fBgHex = document.getElementById('f-bg-hex');
      const fFgHex = document.getElementById('f-fg-hex');
      const fCursorHex = document.getElementById('f-cursor-hex');
      const fCursorStyle = document.getElementById('f-cursor-style');
      const fCursorBlink = document.getElementById('f-cursor-blink');
      const customRows = document.querySelectorAll('.custom-only');

      function populateForm(s) {
        fFontFamily.value = s.fontFamily;
        if (fFontFamily.value !== s.fontFamily) {
          let extra = fFontFamily.querySelector('option[data-extra="1"]');
          if (!extra) {
            extra = document.createElement('option');
            extra.dataset.extra = '1';
            fFontFamily.appendChild(extra);
          }
          extra.value = s.fontFamily;
          extra.textContent = 'Custom: ' + (s.fontFamily.split(',')[0] || s.fontFamily).replace(/"/g, '').trim();
          fFontFamily.value = s.fontFamily;
        }
        fFontSize.value = String(s.fontSize);
        fPreset.value = s.themePreset;
        fBg.value = s.customColors.background;
        fFg.value = s.customColors.foreground;
        fCursorColor.value = s.customColors.cursor;
        fBgHex.textContent = s.customColors.background;
        fFgHex.textContent = s.customColors.foreground;
        fCursorHex.textContent = s.customColors.cursor;
        fCursorStyle.value = s.cursorStyle;
        fCursorBlink.checked = s.cursorBlink;
        toggleCustomRows();
      }

      function toggleCustomRows() {
        const show = fPreset.value === 'custom';
        customRows.forEach((el) => { el.style.display = show ? '' : 'none'; });
      }

      function readForm() {
        const size = parseInt(fFontSize.value, 10);
        return {
          fontFamily: fFontFamily.value.trim() || DEFAULTS.fontFamily,
          fontSize: isFinite(size) ? Math.min(32, Math.max(6, size)) : DEFAULTS.fontSize,
          themePreset: fPreset.value,
          customColors: {
            background: fBg.value,
            foreground: fFg.value,
            cursor: fCursorColor.value,
          },
          cursorStyle: fCursorStyle.value,
          cursorBlink: !!fCursorBlink.checked,
        };
      }

      // ---- Font install row ----
      const installRow = document.getElementById('install-row');
      const btnInstallFont = document.getElementById('btn-install-font');
      const btnReload = document.getElementById('btn-reload-window');
      const installStatus = document.getElementById('install-status');

      function refreshFontAnnotations() {
        Array.from(fFontFamily.options).forEach((opt) => {
          if (!opt.value || opt.dataset.extra === '1') return;
          const installed = isFontInstalled(opt.value);
          opt.dataset.installed = installed ? '1' : '0';
          const baseLabel = opt.dataset.baseLabel || opt.textContent;
          opt.dataset.baseLabel = baseLabel;
          opt.textContent = installed ? baseLabel : (baseLabel + ' — not installed');
          opt.style.opacity = installed ? '' : '0.55';
        });
      }
      refreshFontAnnotations();

      function setInstallStatus(text, kind) {
        installStatus.textContent = text || '';
        installStatus.className = 'install-status' + (kind ? ' ' + kind : '');
      }

      function updateInstallRow() {
        const opt = fFontFamily.options[fFontFamily.selectedIndex];
        if (!opt) { installRow.hidden = true; return; }
        const installable = opt.dataset.installable === '1';
        const installed = opt.dataset.installed === '1';
        if (installable && !installed) {
          installRow.hidden = false;
          btnInstallFont.disabled = false;
          btnInstallFont.textContent = 'Install font';
          btnReload.style.display = 'none';
          setInstallStatus('', '');
        } else {
          installRow.hidden = true;
        }
      }

      btnInstallFont.addEventListener('click', () => {
        const opt = fFontFamily.options[fFontFamily.selectedIndex];
        if (!opt || opt.dataset.installable !== '1') return;
        btnInstallFont.disabled = true;
        btnInstallFont.textContent = 'Installing…';
        setInstallStatus('Preparing…', '');
        vscode.postMessage({ type: 'installFont', primary: opt.dataset.primary });
      });
      btnReload.addEventListener('click', () => {
        vscode.postMessage({ type: 'reloadWindow' });
      });

      btnOpen.addEventListener('click', () => {
        populateForm(currentSettings);
        overlay.hidden = false;
        updateInstallRow();
      });
      btnClose.addEventListener('click', () => { overlay.hidden = true; });
      btnReset.addEventListener('click', () => { populateForm(DEFAULTS); updateInstallRow(); });
      btnApply.addEventListener('click', () => {
        const next = readForm();
        vscode.postMessage({ type: 'updateSettings', settings: next });
        overlay.hidden = true;
      });
      fFontFamily.addEventListener('change', updateInstallRow);
      fPreset.addEventListener('change', toggleCustomRows);
      fBg.addEventListener('input', () => { fBgHex.textContent = fBg.value; });
      fFg.addEventListener('input', () => { fFgHex.textContent = fFg.value; });
      fCursorColor.addEventListener('input', () => { fCursorHex.textContent = fCursorColor.value; });

      // ---- Introduce overlay ----
      const INTRO_SLIDES = ${JSON.stringify(introSlides)};
      const introOverlay = document.getElementById('introduce-overlay');
      const introImg = document.getElementById('intro-img');
      const introCaption = document.getElementById('intro-caption');
      const introCounter = document.getElementById('intro-counter');
      const btnIntroOpen = document.getElementById('btn-introduce');
      const btnIntroClose = document.getElementById('btn-intro-close');
      const btnIntroPrev = document.getElementById('btn-intro-prev');
      const btnIntroNext = document.getElementById('btn-intro-next');
      let introIdx = 0;
      let introSeenSent = false;

      function renderIntro() {
        const slide = INTRO_SLIDES[introIdx];
        introImg.src = slide.src;
        introImg.alt = slide.caption;
        introCaption.textContent = slide.caption;
        introCounter.textContent = (introIdx + 1) + ' / ' + INTRO_SLIDES.length;
        btnIntroPrev.disabled = introIdx === 0;
        btnIntroNext.textContent = introIdx === INTRO_SLIDES.length - 1 ? 'Done' : 'Next';
      }

      function openIntro() {
        introIdx = 0;
        renderIntro();
        introOverlay.hidden = false;
      }

      function closeIntro() {
        introOverlay.hidden = true;
        if (!introSeenSent) {
          introSeenSent = true;
          vscode.postMessage({ type: 'introduceSeen' });
        }
      }

      btnIntroOpen.addEventListener('click', openIntro);
      btnIntroClose.addEventListener('click', closeIntro);
      btnIntroPrev.addEventListener('click', () => {
        if (introIdx > 0) { introIdx--; renderIntro(); }
      });
      btnIntroNext.addEventListener('click', () => {
        if (introIdx < INTRO_SLIDES.length - 1) {
          introIdx++;
          renderIntro();
        } else {
          closeIntro();
        }
      });
    })();
  </script>
</body>
</html>`;
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

function randomNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
