import * as vscode from 'vscode';

export interface NavInfo {
  currentIdx: number;
  total: number;
  prevName: string;
  nextName: string;
}

export class NavBarPanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claude-diff-view.navBar';

  private view?: vscode.WebviewView;
  private navInfo?: NavInfo;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage((msg: { command: string }) => {
      if (msg.command === 'prev') {
        vscode.commands.executeCommand('claude-diff-view.prevFile');
      } else if (msg.command === 'next') {
        vscode.commands.executeCommand('claude-diff-view.nextFile');
      }
    });

    this.render();
  }

  update(navInfo: NavInfo | undefined): void {
    this.navInfo = navInfo;
    this.render();
  }

  private render(): void {
    if (!this.view) { return; }
    this.view.webview.html = this.buildHtml();
  }

  private buildHtml(): string {
    const info = this.navInfo;

    const prevArrow = '\u2039'; // single left angle quotation mark
    const nextArrow = '\u203a'; // single right angle quotation mark

    const content = info
      ? [
          `<button class="nav-btn" onclick="send('prev')">${prevArrow} Alt+H</button>`,
          `<span class="filename">${escapeHtml(info.prevName)}</span>`,
          `<span class="sep">|</span>`,
          `<span class="center">View ${info.total} edited files (${info.currentIdx}/${info.total})</span>`,
          `<span class="sep">|</span>`,
          `<span class="filename">${escapeHtml(info.nextName)}</span>`,
          `<button class="nav-btn" onclick="send('next')">Alt+L ${nextArrow}</button>`,
        ].join('\n')
      : `<span class="idle">No pending diffs</span>`;

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
    justify-content: center;
    gap: 10px;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    color: var(--vscode-foreground);
    background: var(--vscode-panel-background, var(--vscode-editor-background));
    user-select: none;
    overflow: hidden;
  }
  .nav-btn {
    background: transparent;
    border: 1px solid var(--vscode-button-secondaryBorder, rgba(128,128,128,0.5));
    color: var(--vscode-foreground);
    border-radius: 4px;
    padding: 2px 10px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    white-space: nowrap;
  }
  .nav-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.07));
  }
  .filename { opacity: 0.65; white-space: nowrap; }
  .sep { opacity: 0.35; }
  .center { font-weight: 500; white-space: nowrap; }
  .idle { opacity: 0.4; font-style: italic; }
</style>
</head>
<body>
  ${content}
  <script>
    const vscode = acquireVsCodeApi();
    function send(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
