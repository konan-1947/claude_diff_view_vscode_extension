"use strict";
/**
 * diffWebviewPanel.ts
 *
 * Cursor-style diff editor.
 * Implemented as a CustomTextEditorProvider — mỗi pending file mở trong 1 tab riêng,
 * render Monaco DiffEditor (inline) trong webview. Snapshot lưu trong DiffManager
 * (left side), TextDocument cung cấp modified content (right side).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffEditorProvider = exports.DIFF_EDITOR_VIEW_TYPE = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const hunkCalculator_1 = require("./hunkCalculator");
const eol_1 = require("./eol");
const language_1 = require("./language");
exports.DIFF_EDITOR_VIEW_TYPE = 'ai-cli-diff-view.diffEditor';
class DiffEditorProvider {
    constructor(extensionUri, diffManager) {
        this.extensionUri = extensionUri;
        this.diffManager = diffManager;
    }
    async resolveCustomTextEditor(document, webviewPanel, _token) {
        const filePath = document.uri.fsPath;
        const t0 = Date.now();
        const tlog = (label) => {
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
        const disposables = [];
        const postSet = () => {
            const snapshot = this.diffManager.getSnapshotContent(filePath);
            if (snapshot === undefined) {
                // Snapshot bị xóa (vd: accept-all). Đóng tab.
                webviewPanel.dispose();
                return;
            }
            // Webview sống hoàn toàn trong LF: nó splice/join lại nội dung bằng '\n'
            // (diff.monaco.js) rồi gửi ngược về, nên hai vế phải cùng ở LF thuần.
            // EOL thật được khôi phục ở applyModifiedEdit() / DiffManager.writeFile().
            const originalContent = (0, eol_1.toLf)(snapshot);
            const currentContent = (0, eol_1.toLf)(document.getText());
            const hunks = (0, hunkCalculator_1.calculateHunks)(originalContent, currentContent);
            const nav = this.computeNav(filePath);
            void webviewPanel.webview.postMessage({
                type: 'set',
                filePath,
                language: (0, language_1.detectLanguageId)(filePath),
                originalContent,
                currentContent,
                hunks,
                theme: currentMonacoTheme(),
                editorConfig: readEditorConfig(),
                nav,
            });
        };
        let webviewReady = false;
        let pendingSet = false;
        disposables.push(webviewPanel.webview.onDidReceiveMessage(async (msg) => {
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
                    this.diffManager.setLastCursor(filePath, msg.line, msg.column, msg.topLine);
                    return;
            }
        }));
        // Khi file đổi (AI ghi, user edit, accept hunk update snapshot...), repost.
        disposables.push(vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() !== document.uri.toString()) {
                return;
            }
            if (webviewReady) {
                postSet();
            }
            else {
                pendingSet = true;
            }
        }));
        // Snapshot đổi (accept hunk) hoặc pending list đổi -> refresh nav counter.
        disposables.push(this.diffManager.onDidChangeDiffs(() => {
            if (webviewReady) {
                postSet();
            }
            else {
                pendingSet = true;
            }
        }));
        // Theme sync
        disposables.push(vscode.window.onDidChangeActiveColorTheme(() => {
            void webviewPanel.webview.postMessage({
                type: 'theme-change',
                theme: currentMonacoTheme(),
            });
        }));
        // Editor config sync
        disposables.push(vscode.workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration('editor')) {
                return;
            }
            void webviewPanel.webview.postMessage({
                type: 'config-change',
                editorConfig: readEditorConfig(),
            });
        }));
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
    async applyModifiedEdit(document, newCurrent) {
        // newCurrent từ webview luôn ở LF -> khôi phục EOL của document trước khi so
        // sánh lẫn khi ghi, nếu không file CRLF sẽ bị viết lại thành LF.
        const expanded = (0, eol_1.fromLf)(newCurrent, document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n');
        if (document.getText() === expanded) {
            return;
        }
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
        edit.replace(document.uri, fullRange, expanded);
        await vscode.workspace.applyEdit(edit);
    }
    async gotoSibling(currentPath, direction) {
        const pending = this.diffManager.getPendingFiles();
        if (pending.length <= 1) {
            return;
        }
        const normalized = normalizePath(currentPath);
        const idx = pending.findIndex(p => normalizePath(p) === normalized);
        if (idx === -1) {
            return;
        }
        const nextIdx = (idx + direction + pending.length) % pending.length;
        const nextPath = pending[nextIdx];
        if (!nextPath) {
            return;
        }
        await this.diffManager.openDiff(nextPath);
    }
    computeNav(filePath) {
        const pending = this.diffManager.getPendingFiles();
        const normalized = normalizePath(filePath);
        const idx = pending.findIndex(p => normalizePath(p) === normalized);
        return {
            currentIdx: idx === -1 ? 0 : idx + 1,
            total: pending.length,
        };
    }
    buildHtml(webview) {
        const monacoBase = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'monaco-editor', 'min', 'vs'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'res', 'webview', 'diff.monaco.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'res', 'webview', 'diff.monaco.css'));
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
exports.DiffEditorProvider = DiffEditorProvider;
function currentMonacoTheme() {
    switch (vscode.window.activeColorTheme.kind) {
        case vscode.ColorThemeKind.Light: return 'vs';
        case vscode.ColorThemeKind.Dark: return 'vs-dark';
        case vscode.ColorThemeKind.HighContrast: return 'hc-black';
        case vscode.ColorThemeKind.HighContrastLight: return 'hc-light';
        default: return 'vs-dark';
    }
}
function readEditorConfig() {
    const cfg = vscode.workspace.getConfiguration('editor');
    return {
        fontFamily: cfg.get('fontFamily', 'Consolas, "Courier New", monospace'),
        fontSize: cfg.get('fontSize', 14),
        lineHeight: cfg.get('lineHeight', 0),
        tabSize: cfg.get('tabSize', 4),
        insertSpaces: cfg.get('insertSpaces', true),
        wordWrap: cfg.get('wordWrap', 'off'),
        renderWhitespace: cfg.get('renderWhitespace', 'selection'),
        minimapEnabled: cfg.get('minimap.enabled', true),
    };
}
function normalizePath(filePath) {
    const fsPath = vscode.Uri.file(path.resolve(filePath)).fsPath;
    return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
}
function makeNonce() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 32; i++) {
        out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return out;
}
//# sourceMappingURL=diffWebviewPanel.js.map