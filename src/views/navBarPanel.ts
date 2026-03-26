import * as vscode from 'vscode';
import * as path from 'path';

export interface NavInfo {
  currentIdx: number;
  total: number;
  prevName: string;
  nextName: string;
  canPrev: boolean;
  canNext: boolean;
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
        case 'acceptAllChanges': vscode.commands.executeCommand('claude-diff-view.acceptAllChanges'); break;
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

    const controls = fileName ? `
      <div class="controls">
        <div class="line line-actions">
          <button class="btn btn-accept" onclick="send('accept')">Accept File</button>
          <button class="btn btn-revert" onclick="send('revert')">Reject File</button>
        </div>
        <div class="line line-all-changes">
          <button class="btn btn-accept-all" onclick="send('acceptAllChanges')">Accept All Changes</button>
        </div>
        <div class="line line-file">
          <div class="file-label">${escapeHtml(fileName)}</div>
          <span class="counter">${info ? `${info.currentIdx} / ${info.total} files` : '1 / 1 files'}</span>
        </div>
        <div class="line line-nav line-prev">
          <button class="btn btn-nav btn-prev" onclick="send('prev')" ${info?.canPrev ? '' : 'disabled'}>${info?.canPrev ? `&#8249; ${escapeHtml(info.prevName)}` : '&#8249; Start'}</button>
        </div>
        <div class="line line-nav line-next">
          <button class="btn btn-nav btn-next" onclick="send('next')" ${info?.canNext ? '' : 'disabled'}>${info?.canNext ? `${escapeHtml(info.nextName)} &#8250;` : 'End &#8250;'}</button>
        </div>
      </div>` : `<div class="empty">No pending diffs</div>`;

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
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
  }

  .file-label {
    flex: 1;
    min-width: 0;
    text-align: left;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
    text-transform: none;
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn {
    background: transparent;
    border: 1px solid var(--vscode-button-secondaryBorder, rgba(128,128,128,0.35));
    color: var(--vscode-foreground);
    border-radius: 6px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    text-align: center;
    transition: background 0.1s;
  }
  .btn:hover {
    background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.1));
  }
  .btn:active {
    opacity: 0.7;
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .btn:disabled:hover {
    background: transparent;
  }

  .line-actions .btn { flex: 1 1 0; }
  .line-all-changes .btn { flex: 1 1 100%; }

  .btn-accept {
    color: var(--vscode-gitDecoration-addedResourceForeground, #4caf6e);
    border-color: var(--vscode-gitDecoration-addedResourceForeground, rgba(76,175,80,0.4));
  }
  .btn-accept:hover {
    background: rgba(76, 175, 80, 0.08);
  }

  .btn-accept-all {
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border-color: transparent;
  }
  .btn-accept-all:hover {
    background: var(--vscode-button-hoverBackground, rgba(76,175,80,0.2));
  }

  .btn-revert {
    color: var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c);
    border-color: var(--vscode-gitDecoration-deletedResourceForeground, rgba(241,76,76,0.4));
  }
  .btn-revert:hover {
    background: rgba(241, 76, 76, 0.08);
  }

  .btn-nav {
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
    font-size: 12px;
    padding: 7px 10px;
    color: var(--vscode-foreground);
    opacity: 0.8;
  }
  .counter {
    flex-shrink: 0;
    font-size: 13px;
    opacity: 0.7;
    font-weight: 500;
    white-space: nowrap;
    padding: 0 4px;
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
  ${controls}
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
