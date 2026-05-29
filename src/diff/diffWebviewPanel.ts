/**
 * diffWebviewPanel.ts
 *
 * Cursor-style diff editor.
 * Implemented as a CustomTextEditorProvider — mỗi pending file mở trong 1 tab riêng,
 * render Monaco DiffEditor (inline) trong webview. Snapshot lưu trong DiffManager
 * (left side), TextDocument cung cấp modified content (right side).
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { DiffManager } from './diffManager';
import { calculateHunks } from './hunkCalculator';

export const DIFF_EDITOR_VIEW_TYPE = 'ai-cli-diff-view.diffEditor';

type IncomingMsg =
  | { type: 'ready' }
  | { type: 'acceptHunk'; newOriginal: string; newCurrent: string }
  | { type: 'rejectHunk'; newOriginal: string; newCurrent: string }
  | { type: 'editModified'; newCurrent: string }
  | { type: 'acceptAll' }
  | { type: 'rejectAll' }
  | { type: 'nextFile' }
  | { type: 'prevFile' }
  | { type: 'save' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'cursor'; line: number; column: number };

export class DiffEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly diffManager: DiffManager
  ) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const filePath = document.uri.fsPath;
    const t0 = Date.now();
    const tlog = (label: string): void => {
      console.log('[ai-cli-diff TIMING ext] +' + (Date.now() - t0) + 'ms ' + label);
    };
    tlog('resolveCustomTextEditor entry');
    const monacoRoot = vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'monaco-editor', 'min');
    const resRoot = vscode.Uri.joinPath(this.extensionUri, 'res', 'webview');

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [monacoRoot, resRoot],
    };
    webviewPanel.webview.html = this.buildHtml(webviewPanel.webview);
    tlog('webview.html assigned');

    this.diffManager.registerPanel(filePath, webviewPanel);

    const disposables: vscode.Disposable[] = [];

    const postSet = (): void => {
      const snapshot = this.diffManager.getSnapshotContent(filePath);
      if (snapshot === undefined) {
        // Snapshot bị xóa (vd: accept-all). Đóng tab.
        webviewPanel.dispose();
        return;
      }
      const currentContent = document.getText();
      const hunks = calculateHunks(snapshot, currentContent);
      const nav = this.computeNav(filePath);
      void webviewPanel.webview.postMessage({
        type: 'set',
        filePath,
        language: detectLanguageId(filePath),
        originalContent: snapshot,
        currentContent,
        hunks,
        theme: currentMonacoTheme(),
        editorConfig: readEditorConfig(),
        nav,
      });
    };

    let webviewReady = false;
    let pendingSet = false;

    disposables.push(
      webviewPanel.webview.onDidReceiveMessage(async (msg: IncomingMsg) => {
        if (msg.type === 'ready') {
          webviewReady = true;
          tlog('received ready from webview');
          postSet();
          tlog('postSet (set message sent) done');
          return;
        }
        switch (msg.type) {
          case 'acceptHunk':
            await this.diffManager.applyHunkAcceptFromWebview(filePath, msg.newOriginal, msg.newCurrent);
            return;
          case 'rejectHunk':
            await this.diffManager.applyHunkRejectFromWebview(filePath, msg.newOriginal, msg.newCurrent);
            return;
          case 'editModified':
            await this.applyModifiedEdit(document, msg.newCurrent);
            return;
          case 'acceptAll':
            await this.diffManager.accept(filePath);
            return;
          case 'rejectAll':
            await this.diffManager.revert(filePath);
            return;
          case 'nextFile':
            await this.gotoSibling(filePath, +1);
            return;
          case 'prevFile':
            await this.gotoSibling(filePath, -1);
            return;
          case 'save':
            await document.save();
            return;
          case 'undo':
            await vscode.commands.executeCommand('undo');
            return;
          case 'redo':
            await vscode.commands.executeCommand('redo');
            return;
          case 'cursor':
            this.diffManager.setLastCursor(filePath, msg.line, msg.column);
            return;
        }
      })
    );

    // Khi file đổi (AI ghi, user edit, accept hunk update snapshot...), repost.
    disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== document.uri.toString()) {
          return;
        }
        if (webviewReady) {
          postSet();
        } else {
          pendingSet = true;
        }
      })
    );

    // Snapshot đổi (accept hunk) hoặc pending list đổi -> refresh nav counter.
    disposables.push(
      this.diffManager.onDidChangeDiffs(() => {
        if (webviewReady) {
          postSet();
        } else {
          pendingSet = true;
        }
      })
    );

    // Theme sync
    disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        void webviewPanel.webview.postMessage({
          type: 'theme-change',
          theme: currentMonacoTheme(),
        });
      })
    );

    // Editor config sync
    disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('editor')) { return; }
        void webviewPanel.webview.postMessage({
          type: 'config-change',
          editorConfig: readEditorConfig(),
        });
      })
    );

    webviewPanel.onDidDispose(() => {
      this.diffManager.unregisterPanel(filePath, webviewPanel);
      while (disposables.length) {
        disposables.pop()?.dispose();
      }
    });

    // Nếu webview ready trước khi disposables setup xong (race), đảm bảo post lại.
    if (pendingSet && webviewReady) {
      postSet();
    }
  }

  private async applyModifiedEdit(document: vscode.TextDocument, newCurrent: string): Promise<void> {
    if (document.getText() === newCurrent) { return; }
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      document.lineAt(document.lineCount - 1).range.end
    );
    edit.replace(document.uri, fullRange, newCurrent);
    await vscode.workspace.applyEdit(edit);
  }

  private async gotoSibling(currentPath: string, direction: 1 | -1): Promise<void> {
    const pending = this.diffManager.getPendingFiles();
    if (pending.length <= 1) { return; }
    const normalized = normalizePath(currentPath);
    const idx = pending.findIndex(p => normalizePath(p) === normalized);
    if (idx === -1) { return; }
    const nextIdx = (idx + direction + pending.length) % pending.length;
    const nextPath = pending[nextIdx];
    if (!nextPath) { return; }
    await this.diffManager.openDiff(nextPath);
  }

  private computeNav(filePath: string): { currentIdx: number; total: number } {
    const pending = this.diffManager.getPendingFiles();
    const normalized = normalizePath(filePath);
    const idx = pending.findIndex(p => normalizePath(p) === normalized);
    return {
      currentIdx: idx === -1 ? 0 : idx + 1,
      total: pending.length,
    };
  }

  private buildHtml(webview: vscode.Webview): string {
    const monacoBase = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'monaco-editor', 'min', 'vs')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'res', 'webview', 'diff.monaco.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'res', 'webview', 'diff.monaco.css')
    );
    const cspSource = webview.cspSource;
    const nonce = makeNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${cspSource} data:;
    style-src ${cspSource} 'unsafe-inline';
    font-src ${cspSource} data:;
    script-src ${cspSource} 'nonce-${nonce}' 'unsafe-eval';
    connect-src ${cspSource};
    worker-src blob:;
    child-src blob:;
  " />
  <link rel="stylesheet" href="${styleUri}" />
  <title>AI CLI Diff</title>
</head>
<body>
  <div id="toolbar">
    <div class="pill pill-hunks">
      <button id="btn-prev-hunk" class="nav-btn" title="Previous hunk (Shift+F7)" aria-label="Previous hunk">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4"/></svg>
      </button>
      <span id="hunk-counter">0 / 0</span>
      <button id="btn-next-hunk" class="nav-btn" title="Next hunk (F7)" aria-label="Next hunk">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>
      </button>
      <button id="btn-reject-file" class="toolbar-btn reject" title="Reject all changes in this file">Reject</button>
      <button id="btn-accept-file" class="toolbar-btn accept" title="Accept all changes in this file (Ctrl+Shift+Y)">Accept</button>
    </div>
    <div class="pill pill-files">
      <button id="btn-prev-file" class="nav-btn" title="Previous file (Alt+H)" aria-label="Previous file">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4l-4 4 4 4"/></svg>
      </button>
      <span id="file-counter">0 / 0</span>
      <button id="btn-next-file" class="nav-btn" title="Next file (Alt+L)" aria-label="Next file">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>
      </button>
    </div>
    <span id="toolbar-file"></span>
  </div>
  <div id="container"></div>

  <script nonce="${nonce}">
    window.__MONACO_BASE__ = "${monacoBase}";
  </script>
  <script nonce="${nonce}" src="${monacoBase}/loader.js"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function currentMonacoTheme(): string {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Light: return 'vs';
    case vscode.ColorThemeKind.Dark: return 'vs-dark';
    case vscode.ColorThemeKind.HighContrast: return 'hc-black';
    case vscode.ColorThemeKind.HighContrastLight: return 'hc-light';
    default: return 'vs-dark';
  }
}

interface EditorConfigPayload {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: string;
  renderWhitespace: string;
  minimapEnabled: boolean;
}

function readEditorConfig(): EditorConfigPayload {
  const cfg = vscode.workspace.getConfiguration('editor');
  return {
    fontFamily: cfg.get<string>('fontFamily', 'Consolas, "Courier New", monospace'),
    fontSize: cfg.get<number>('fontSize', 14),
    lineHeight: cfg.get<number>('lineHeight', 0),
    tabSize: cfg.get<number>('tabSize', 4),
    insertSpaces: cfg.get<boolean>('insertSpaces', true),
    wordWrap: cfg.get<string>('wordWrap', 'off'),
    renderWhitespace: cfg.get<string>('renderWhitespace', 'selection'),
    minimapEnabled: cfg.get<boolean>('minimap.enabled', true),
  };
}

function normalizePath(filePath: string): string {
  const fsPath = vscode.Uri.file(path.resolve(filePath)).fsPath;
  return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
}

function makeNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

function detectLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts': case '.tsx': return 'typescript';
    case '.js': case '.jsx': case '.mjs': case '.cjs': return 'javascript';
    case '.json': return 'json';
    case '.html': case '.htm': return 'html';
    case '.css': return 'css';
    case '.scss': return 'scss';
    case '.less': return 'less';
    case '.md': case '.markdown': return 'markdown';
    case '.py': return 'python';
    case '.go': return 'go';
    case '.rs': return 'rust';
    case '.java': return 'java';
    case '.kt': case '.kts': return 'kotlin';
    case '.c': case '.h': return 'c';
    case '.cpp': case '.cc': case '.cxx': case '.hpp': return 'cpp';
    case '.cs': return 'csharp';
    case '.php': return 'php';
    case '.rb': return 'ruby';
    case '.sh': case '.bash': case '.zsh': return 'shell';
    case '.yaml': case '.yml': return 'yaml';
    case '.xml': return 'xml';
    case '.sql': return 'sql';
    case '.swift': return 'swift';
    case '.lua': return 'lua';
    case '.dart': return 'dart';
    case '.vue': return 'html';
    default: return 'plaintext';
  }
}
