import * as vscode from 'vscode';
import * as path from 'path';

export class DiffActionPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ai-cli-diff-view.actions';

  private view?: vscode.WebviewView;
  private currentFilePath: string | undefined;
  private fileIndex = 0;
  private fileTotal = 0;

  constructor(
    private readonly onAccept: (filePath: string) => Promise<void>,
    private readonly onReject: (filePath: string) => Promise<void>
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(async (msg: { command: string }) => {
      if (!this.currentFilePath) {
        return;
      }
      if (msg.command === 'accept') {
        await this.onAccept(this.currentFilePath);
      } else if (msg.command === 'reject') {
        await this.onReject(this.currentFilePath);
      }
    });

    this.render();
  }

  setActiveFile(filePath: string | undefined, index = 0, total = 0): void {
    this.currentFilePath = filePath;
    this.fileIndex = index;
    this.fileTotal = total;
    this.render();
  }

  private render(): void {
    if (!this.view) {
      return;
    }
    this.view.webview.html = this.buildHtml();
  }

  private buildHtml(): string {
    const basename = this.currentFilePath ? path.basename(this.currentFilePath) : null;

    const counter =
      this.fileTotal > 0
        ? `<span class="counter">${this.fileIndex} / ${this.fileTotal}</span>`
        : '';

    const content = basename
      ? `
        <span class="filename">AI CLI Diff | ${escapeHtml(basename)}</span>
        <div class="actions">
          <button class="btn accept" onclick="send('accept')">
            Accept file <kbd>Ctrl/Cmd+Enter</kbd>
          </button>
          <button class="btn reject" onclick="send('reject')">
            Reject file <kbd>Ctrl/Cmd+Backspace</kbd>
          </button>
          ${counter}
        </div>`
      : `<span class="idle">No active AI CLI diff - open a diff tab to review</span>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    height: 36px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 12px;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    color: var(--vscode-foreground);
    border-top: 1px solid var(--vscode-widget-border, #444);
    overflow: hidden;
    user-select: none;
  }

  .filename {
    opacity: 0.75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
    flex-shrink: 1;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 3px;
    border: 1px solid transparent;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.1s;
  }
  .btn:hover { opacity: 0.85; }
  .btn:active { opacity: 0.7; }

  .accept {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .reject {
    background: transparent;
    color: var(--vscode-foreground);
    border-color: var(--vscode-button-secondaryBorder, #666);
  }
  .reject:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.07));
  }

  kbd {
    font-size: 10px;
    opacity: 0.65;
    font-family: inherit;
  }

  .counter {
    font-size: 11px;
    opacity: 0.55;
    padding-left: 4px;
  }

  .idle {
    opacity: 0.45;
    font-style: italic;
  }
</style>
</head>
<body>
  ${content}
  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send('accept'); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') { e.preventDefault(); send('reject'); }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
