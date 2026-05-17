import * as os from 'os';
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
  | { type: 'ready'; cols: number; rows: number }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'restart' }
  | { type: 'getSettings' }
  | { type: 'updateSettings'; settings: TerminalSettings }
  | { type: 'installFont'; primary: string }
  | { type: 'reloadWindow' }
  | { type: 'openFile'; path: string }
  | { type: 'installHooks' }
  | { type: 'introduceSeen' };

export class TerminalPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ai-cli-diff-view.terminal';

  private view?: vscode.WebviewView;
  private pty = new PtySession();
  private subs: vscode.Disposable[] = [];

  private sessionState: SessionState = 'idle';
  private lastPrompt = '';
  private errorMessage = '';
  private diffDisposable?: vscode.Disposable;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diffManager: DiffManager
  ) {
    this.wirePtyEvents();
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

  private wirePtyEvents(): void {
    this.subs.push(
      this.pty.onData((data) => {
        this.view?.webview.postMessage({ type: 'data', data });
      }),
      this.pty.onExit((code) => {
        this.view?.webview.postMessage({ type: 'exit', code });
      }),
      this.pty.onError((message) => {
        this.view?.webview.postMessage({ type: 'error', message });
      })
    );
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
          if (!this.pty.isRunning()) {
            const cwd =
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
            this.pty.start(cwd, msg.cols, msg.rows);
          } else {
            this.pty.resize(msg.cols, msg.rows);
          }
          // Push initial files page state once the webview is ready.
          this.postFilesUpdate();
          if (!this.context.globalState.get<boolean>(INTRODUCE_SEEN_KEY)) {
            void this.view?.webview.postMessage({ type: 'showIntroduce' });
          }
          return;
        case 'input':
          this.pty.write(msg.data);
          return;
        case 'resize':
          this.pty.resize(msg.cols, msg.rows);
          return;
        case 'restart':
          this.pty.dispose();
          this.pty = new PtySession();
          this.subs.forEach((d) => { try { d.dispose(); } catch { /* ignore */ } });
          this.subs = [];
          this.wirePtyEvents();
          this.render();
          return;
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
  body.page-terminal #files-wrap { display: none; }
  body.page-files #btn-settings { display: none; }
  body.page-terminal .title-files { display: none; }
  body.page-files .title-terminal { display: none; }
  body.page-terminal .toggle-to-files { display: inline-flex; }
  body.page-terminal .toggle-to-terminal { display: none; }
  body.page-files .toggle-to-files { display: none; }
  body.page-files .toggle-to-terminal { display: inline-flex; }

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
  #term { width: 100%; height: 100%; }
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
  <div id="content">
    <div id="term-wrap">
      <div id="err"></div>
      <div id="term"></div>
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

      const term = new Terminal({
        fontFamily: DEFAULTS.fontFamily,
        fontSize: DEFAULTS.fontSize,
        cursorStyle: DEFAULTS.cursorStyle,
        cursorBlink: DEFAULTS.cursorBlink,
        allowProposedApi: true,
        theme: resolveTheme(DEFAULTS),
      });
      const fit = new FitAddon.FitAddon();
      term.loadAddon(fit);
      term.open(document.getElementById('term'));

      function safeFit() { try { fit.fit(); } catch (_) { /* ignore */ } }

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
        term.options.fontFamily = s.fontFamily;
        term.options.fontSize = s.fontSize;
        term.options.cursorStyle = s.cursorStyle;
        term.options.cursorBlink = s.cursorBlink;
        const theme = resolveTheme(s);
        term.options.theme = theme;
        const wrap = document.getElementById('term-wrap');
        if (wrap) wrap.style.background = theme.background;
        try { term.clearTextureAtlas && term.clearTextureAtlas(); } catch (_) {}
        safeFit();
        try { term.refresh(0, term.rows - 1); } catch (_) {}
        vscode.postMessage({ type: 'resize', cols: term.cols, rows: term.rows });
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
        safeFit();
        vscode.postMessage({ type: 'ready', cols: term.cols, rows: term.rows });
        vscode.postMessage({ type: 'getSettings' });
      });

      term.onData((data) => { vscode.postMessage({ type: 'input', data }); });

      const ro = new ResizeObserver(() => {
        safeFit();
        vscode.postMessage({ type: 'resize', cols: term.cols, rows: term.rows });
      });
      ro.observe(document.getElementById('term-wrap'));

      const themeObserver = new MutationObserver(() => {
        if (currentSettings.themePreset === 'vscode') {
          applySettings(currentSettings);
        }
      });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

      window.addEventListener('message', (e) => {
        const msg = e.data;
        if (!msg) return;
        if (msg.type === 'data') {
          term.write(msg.data);
        } else if (msg.type === 'exit') {
          term.writeln('\\r\\n\\x1b[2m[shell exited: ' + msg.code + '] press any key to restart\\x1b[0m');
          const once = term.onData(() => {
            once.dispose();
            vscode.postMessage({ type: 'restart' });
          });
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
          // Switched back to terminal — refit since size may have changed.
          requestAnimationFrame(() => {
            safeFit();
            vscode.postMessage({ type: 'resize', cols: term.cols, rows: term.rows });
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
    this.pty.dispose();
    for (const d of this.subs) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    this.subs.length = 0;
    this.diffDisposable?.dispose();
    this.diffDisposable = undefined;
  }
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
