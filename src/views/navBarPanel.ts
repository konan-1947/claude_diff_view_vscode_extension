import * as vscode from 'vscode';
import * as path from 'path';

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
  private activeFilePath?: string;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage((msg: { command: string }) => {
      switch (msg.command) {
        case 'prev':   vscode.commands.executeCommand('claude-diff-view.prevFile'); break;
        case 'next':   vscode.commands.executeCommand('claude-diff-view.nextFile'); break;
        case 'accept': vscode.commands.executeCommand('claude-diff-view.acceptAllHunks'); break;
        case 'revert': vscode.commands.executeCommand('claude-diff-view.revertAllHunks'); break;
      }
    });
    this.render();
  }

  update(navInfo: NavInfo | undefined): void {
    this.navInfo = navInfo;
    this.render();
  }

  setActiveFile(filePath: string | undefined): void {
    this.activeFilePath = filePath;
    this.render();
  }

  private render(): void {
    if (!this.view) { return; }
    this.view.webview.html = this.buildHtml();
  }

  private buildHtml(): string {
    const info = this.navInfo;
    const fileName = this.activeFilePath ? path.basename(this.activeFilePath) : undefined;

    const actionSection = fileName ? `
      <div class="card">
        <div class="file-label">${escapeHtml(fileName)}</div>
        <div class="action-row">
          <button class="btn btn-accept" onclick="send('accept')">Accept All</button>
          <button class="btn btn-revert" onclick="send('revert')">Revert All</button>
        </div>
      </div>` : '';

    const divider = fileName && info ? `<div class="divider"></div>` : '';

    const navSection = info ? `
      <div class="card">
        <div class="nav-row">
          <button class="btn btn-nav btn-prev" onclick="send('prev')">&#8249; ${escapeHtml(info.prevName)}</button>
          <button class="btn btn-nav btn-next" onclick="send('next')">${escapeHtml(info.nextName)} &#8250;</button>
        </div>
        <div class="counter-row">
          <span class="counter">${info.currentIdx} / ${info.total} files</span>
        </div>
      </div>` : '';

    const empty = !fileName && !info
      ? `<div class="empty">No pending diffs</div>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    font-family: var(--vscode-font-family);
    font-size: 12px;
    color: var(--vscode-foreground);
    background: transparent;
    user-select: none;
    padding: 10px 12px;
    gap: 0;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px 0;
  }

  .divider {
    height: 1px;
    background: var(--vscode-widget-border, rgba(128,128,128,0.18));
  }

  .file-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    opacity: 0.45;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-bottom: 2px;
  }

  .btn {
    background: transparent;
    border: 1px solid var(--vscode-button-secondaryBorder, rgba(128,128,128,0.35));
    color: var(--vscode-foreground);
    border-radius: 4px;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    text-align: left;
    transition: background 0.1s;
  }
  .btn:hover {
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.1));
  }
  .btn:active {
    opacity: 0.7;
  }

  .action-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }
  .action-row .btn { flex: 1 1 120px; }

  .btn-accept {
    color: var(--vscode-gitDecoration-addedResourceForeground, #4caf6e);
    border-color: var(--vscode-gitDecoration-addedResourceForeground, rgba(76,175,80,0.4));
  }
  .btn-accept:hover {
    background: rgba(76, 175, 80, 0.08);
  }

  .btn-revert {
    color: var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c);
    border-color: var(--vscode-gitDecoration-deletedResourceForeground, rgba(241,76,76,0.4));
  }
  .btn-revert:hover {
    background: rgba(241, 76, 76, 0.08);
  }

  .nav-row {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  .btn-nav {
    flex: 1 1 140px;
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.25;
    font-size: 11px;
    padding: 4px 8px;
    color: var(--vscode-foreground);
    opacity: 0.8;
  }
  .btn-next { text-align: right; }

  .counter-row {
    display: flex;
    justify-content: center;
    padding-top: 2px;
  }
  .counter {
    flex-shrink: 0;
    font-size: 10px;
    opacity: 0.4;
    white-space: nowrap;
    padding: 0 2px;
  }

  .empty {
    text-align: center;
    opacity: 0.35;
    font-style: italic;
    font-size: 11px;
  }
</style>
</head>
<body>
  ${actionSection}
  ${divider}
  ${navSection}
  ${empty}
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
