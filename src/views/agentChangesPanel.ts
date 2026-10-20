import * as vscode from 'vscode';
import { DiffManager, DiffPreviewMetadata } from '../diff/diffManager';
import { coalesce } from '../util/coalesce';
import { isSameFile, PENDING_TREE_CSS, renderPendingTree } from './pendingTree';

export interface AgentChangesActions {
  toggleDiff: () => void;
  showIntroduce: () => void;
  showSettings: () => void;
  toggleAgentMode: () => void;
}

/** Agent mode's pending-files webview, with diff stats aligned independently of Git decorations. */
export class AgentChangesPanel implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'ai-cli-diff-view.agentChanges';

  private readonly diffDisposable: vscode.Disposable;
  private view?: vscode.WebviewView;
  private viewMessageDisposable?: vscode.Disposable;
  private viewDisposeDisposable?: vscode.Disposable;
  private active = false;
  private showAgentActions = false;
  private previewOpen = false;
  private activeFilePath?: string;
  private metadata: DiffPreviewMetadata[] = [];
  private generation = 0;
  private readonly refreshSoon = coalesce(() => {
    if (this.active) { void this.refresh(); }
  });

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly diffManager: DiffManager,
    private readonly openPendingFile: (filePath: string) => boolean,
    private readonly actions: AgentChangesActions,
  ) {
    // A burst of agent writes fires this once or twice per file; refresh once per burst instead.
    this.diffDisposable = this.diffManager.onDidChangeDiffs(() => {
      if (this.active) { this.refreshSoon.schedule(); }
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media', 'file-icons')],
    };
    this.viewMessageDisposable?.dispose();
    this.viewMessageDisposable = webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== 'object') { return; }
      const msg = message as { type?: string; path?: unknown };
      if (msg.type === 'open' && typeof msg.path === 'string') {
        this.openPendingFile(msg.path);
      } else if (msg.type === 'action') {
        const action = (message as { action?: string }).action;
        if (action === 'toggleDiff') { this.actions.toggleDiff(); }
        if (action === 'showIntroduce') { this.actions.showIntroduce(); }
        if (action === 'showSettings') { this.actions.showSettings(); }
        if (action === 'toggleAgentMode') { this.actions.toggleAgentMode(); }
      }
    });
    // Leaving Agent mode hides this view through its `when` clause, which disposes it.
    this.viewDisposeDisposable?.dispose();
    this.viewDisposeDisposable = webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = undefined;
        this.viewMessageDisposable?.dispose();
        this.viewMessageDisposable = undefined;
      }
    });
    void this.refresh();
  }

  setAgentMode(active: boolean): void {
    this.active = active;
    this.showAgentActions = active;
    if (!active) {
      this.previewOpen = false;
      this.activeFilePath = undefined;
      this.metadata = [];
      this.render();
      return;
    }
    void this.refresh();
  }

  setActiveFile(filePath: string | undefined): void {
    this.activeFilePath = filePath;
    this.render();
  }

  setPreviewOpen(open: boolean): void {
    this.previewOpen = open;
    this.render();
  }

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    const metadata = this.active ? await this.diffManager.getDiffPreviewMetadata() : [];
    if (generation !== this.generation) { return; }
    this.metadata = metadata;
    if (this.activeFilePath && !metadata.some((file) => isSameFile(file.filePath, this.activeFilePath))) {
      this.activeFilePath = undefined;
    }
    this.render();
  }

  private render(): void {
    if (!this.view) { return; }
    const iconBase = this.view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'file-icons'),
    ).toString() + '/';
    const rows = renderPendingTree(this.metadata, this.activeFilePath, iconBase);
    const header = this.showAgentActions ? `<header class="panel-header">
  <button class="view-diff" data-action="toggleDiff" title="${this.previewOpen ? 'Back to terminal' : 'View diff'}">${this.previewOpen ? 'Back to terminal' : 'View diff'}</button>
  <button data-action="showIntroduce" title="Introduce" aria-label="Introduce"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>
  <button data-action="showSettings" title="Settings" aria-label="Settings"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1.51-1V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
  <button class="agent-mode" data-action="toggleAgentMode" title="Turn off Agent mode">Tắt Agent mode</button>
</header>` : '';
    this.view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.view.webview.cspSource}; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; padding: 0 0 5px; overflow-x: hidden; overflow-y: auto; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font: 12px var(--vscode-font-family); }
  .panel-header { position: sticky; top: 0; z-index: 2; background: var(--vscode-sideBar-background); min-height: 40px; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .panel-header button { min-width: 30px; height: 30px; padding: 0 8px; display: inline-flex; align-items: center; justify-content: center; color: var(--vscode-icon-foreground); background: transparent; border: 0; border-radius: 4px; cursor: pointer; font: inherit; font-size: 13px; line-height: 1; }
  .panel-header button:hover { background: var(--vscode-toolbar-hoverBackground); }
  .panel-header .view-diff { padding: 0 12px; color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, rgba(128,128,128,.45)); }
  .panel-header .agent-mode { margin-left: auto; padding: 0 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
${PENDING_TREE_CSS}
</style>
</head>
<body>
${header}
<div class="pending-tree">${rows}</div>
<script>
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', () => vscode.postMessage({ type: 'action', action: el.dataset.action }));
  });
  document.querySelectorAll('[data-folder-toggle]').forEach((el) => {
    el.addEventListener('click', () => el.parentElement.classList.toggle('collapsed'));
  });
  document.querySelectorAll('[data-path]').forEach((el) => {
    el.addEventListener('click', () => vscode.postMessage({ type: 'open', path: el.dataset.path }));
  });
</script>
</body>
</html>`;
  }

  dispose(): void {
    this.generation += 1;
    this.refreshSoon.dispose();
    this.diffDisposable.dispose();
    this.viewMessageDisposable?.dispose();
    this.viewDisposeDisposable?.dispose();
  }
}
