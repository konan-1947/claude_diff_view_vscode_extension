import * as os from 'os';
import * as vscode from 'vscode';
import { PtySession } from './ptySession';

type IncomingMessage =
  | { type: 'ready'; cols: number; rows: number }
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'restart' };

export class TerminalPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ai-cli-diff-view.terminal';

  private view?: vscode.WebviewView;
  private pty = new PtySession();
  private subs: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.wirePtyEvents();
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

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    const xtermDir = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'xterm');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [xtermDir],
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
  body { background: #1e1e1e; color: #cccccc; }
  #term { width: 100%; height: 100%; }
  .xterm { padding: 4px 0 0 6px; height: 100%; }
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
  }
</style>
</head>
<body>
  <div id="err"></div>
  <div id="term"></div>
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

      const term = new Terminal({
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 13,
        cursorBlink: true,
        allowProposedApi: true,
        theme: { background: '#1e1e1e', foreground: '#cccccc', cursor: '#ffffff' },
      });
      const fit = new FitAddon.FitAddon();
      term.loadAddon(fit);
      term.open(document.getElementById('term'));

      function safeFit() { try { fit.fit(); } catch (_) { /* ignore */ } }

      requestAnimationFrame(() => {
        safeFit();
        vscode.postMessage({ type: 'ready', cols: term.cols, rows: term.rows });
      });

      term.onData((data) => { vscode.postMessage({ type: 'input', data }); });

      const ro = new ResizeObserver(() => {
        safeFit();
        vscode.postMessage({ type: 'resize', cols: term.cols, rows: term.rows });
      });
      ro.observe(document.getElementById('term'));

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
