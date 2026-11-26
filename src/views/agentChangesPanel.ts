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

// Custom AI CLI Diff View icon set: 24 grid, 20 live area, round caps/joins.
// 18px with stroke-width 2.4 renders a ~1.8px stroke at this size.
const ICON_ATTRS = 'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
// Terminal screen with a prompt chevron and a solid block cursor.
const ICON_TERMINAL = `<svg class="btn-icon" ${ICON_ATTRS}><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M7 9l3 3-3 3"/><rect x="12.5" y="12.5" width="4" height="3.5" rx="1" fill="currentColor" stroke="none"/></svg>`;
const ICON_INFO = `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="8.75"/><path d="M12 11v5.5"/><path d="M12 7.5h.01"/></svg>`;
// Two sliders instead of a generic gear.
const ICON_SETTINGS = `<svg ${ICON_ATTRS}><path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2.5"/><circle cx="15" cy="16" r="2.5"/></svg>`;

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
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media', 'file-icons'),
        vscode.Uri.joinPath(this.extensionUri, 'media', 'icons'),
        // Roots must be folders: VS Code only serves files strictly inside a root.
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    };
    this.viewMessageDisposable?.dispose();
    this.viewMessageDisposable = webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== 'object') { return; }
      const msg = message as { type?: string; path?: unknown };
      if (msg.type === 'open' && typeof msg.path === 'string') {
        this.openPendingFile(msg.path);
      } else if (msg.type === 'acceptAllChanges') {
        void vscode.commands.executeCommand('ai-cli-diff-view.acceptAllChanges');
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
    const toggleLabel = this.previewOpen ? 'Back to terminal' : 'View diff';
    const appIconBase = this.view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'icons'),
    ).toString();
    const toggleIcon = this.previewOpen
      ? ICON_TERMINAL
      : `<img class="btn-icon" src="${appIconBase}/view-diff.png" alt="" aria-hidden="true">`;
    const hasPending = this.metadata.length > 0;
    const catImg = this.view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', hasPending ? 'meo_diff_wide.png' : 'meo_ngu_wide.png'),
    ).toString();
    const agentIcon = `<img class="btn-icon" src="${appIconBase}/agent-mode.svg" alt="" aria-hidden="true">`;
    const header = this.showAgentActions ? `<header class="panel-header">
  <button class="view-diff" data-action="toggleDiff" title="${toggleLabel}" aria-label="${toggleLabel}">${toggleIcon}<span class="btn-label">${toggleLabel}</span></button>
  <button data-action="showIntroduce" title="Introduce" aria-label="Introduce">${ICON_INFO}</button>
  <button data-action="showSettings" title="Settings" aria-label="Settings">${ICON_SETTINGS}</button>
  <button class="agent-mode" data-action="toggleAgentMode" title="Turn off Agent mode" aria-label="Turn off Agent mode">${agentIcon}<span class="btn-label">Exit Agent mode</span></button>
</header>` : '';
    this.view.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.view.webview.cspSource}; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>

  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; padding: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font: 12px var(--vscode-font-family); }
  .panel-header { flex: 0 0 auto; background: var(--vscode-sideBar-background); min-height: 38px; display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .panel-header button { min-width: 26px; height: 26px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; color: var(--vscode-icon-foreground); background: transparent; border: 1px solid transparent; border-radius: 7px; cursor: pointer; font: inherit; font-size: 12px; line-height: 1; opacity: .75; white-space: nowrap; transition: background .12s, border-color .12s, opacity .12s; }
  .panel-header button:hover { background: var(--vscode-toolbar-hoverBackground); opacity: 1; }
  .panel-header button:active { transform: translateY(1px); }
  .panel-header button:focus-visible { outline: 1px solid var(--vscode-focusBorder, #007fd4); outline-offset: 1px; }
  .panel-header .view-diff { padding: 0 12px; color: var(--vscode-foreground); border-color: var(--vscode-panel-border, rgba(128,128,128,.4)); opacity: 1; }
  .panel-header .agent-mode { margin-left: auto; padding: 0 12px; color: var(--vscode-foreground); background: color-mix(in srgb, var(--vscode-button-background, #0e639c) 16%, transparent); border-color: color-mix(in srgb, var(--vscode-button-background, #0e639c) 50%, transparent); opacity: 1; }
  .panel-header .agent-mode:hover { background: color-mix(in srgb, var(--vscode-button-background, #0e639c) 30%, transparent); border-color: var(--vscode-button-background, #0e639c); }
  .panel-header .view-diff, .panel-header .agent-mode { gap: 6px; }
  .panel-header .btn-icon { display: block; flex: 0 0 auto; height: 16px; width: auto; }
  /* Narrow sidebar: labels no longer fit, so fall back to icon-only buttons. */
  @media (max-width: 380px) {
    .panel-header .view-diff,
    .panel-header .agent-mode { width: 26px; min-width: 26px; padding: 0; }
    .panel-header .btn-label { display: none; }
  }
  body > .pending-tree { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; padding-bottom: 5px; }
  /* Thin rounded scrollbar instead of VS Code's 10px square default; the thumb brightens while the list is hovered. */
  body > .pending-tree::-webkit-scrollbar { width: 6px; height: 6px; }
  body > .pending-tree::-webkit-scrollbar-track { background: transparent; }
  body > .pending-tree::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
  body > .pending-tree:hover::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, rgba(121,121,121,0.4)); }
  body > .pending-tree::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground, rgba(100,100,100,0.7)); }
  body > .pending-tree::-webkit-scrollbar-thumb:active { background: var(--vscode-scrollbarSlider-activeBackground, rgba(191,191,191,0.4)); }
  body > .pending-tree::-webkit-scrollbar-corner { background: transparent; }
  /* Fixed-height footer: the cat and Accept All stay put whether or not files are pending. */
  .pending-foot { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; padding: 8px 12px 10px; border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25)); }
  .pending-cat { height: 84px; background: url('${catImg}') center / contain no-repeat; opacity: ${hasPending ? '0.65' : '1'}; pointer-events: none; }
  .pending-accept-all { height: 30px; padding: 0 12px; border-radius: 7px; cursor: pointer; font: inherit; font-size: 12px; color: var(--vscode-foreground); background: color-mix(in srgb, var(--vscode-button-background, #0e639c) 8%, transparent); border: 1px solid color-mix(in srgb, var(--vscode-foreground) 22%, transparent); transition: background .12s, border-color .12s; }
  .pending-accept-all:hover:not(:disabled) { background: color-mix(in srgb, var(--vscode-button-background, #0e639c) 18%, transparent); border-color: color-mix(in srgb, var(--vscode-button-background, #0e639c) 55%, transparent); }
  .pending-accept-all:active:not(:disabled) { opacity: .7; }
  .pending-accept-all:disabled { opacity: .45; cursor: default; }
  .pending-accept-all:focus-visible { outline: 1px solid var(--vscode-focusBorder, #007fd4); outline-offset: 1px; }
${PENDING_TREE_CSS}
</style>
</head>
<body>
${header}
<div class="pending-tree">${rows}</div>
<div class="pending-foot">
  <div class="pending-cat" aria-hidden="true"></div>
  <button id="accept-all" class="pending-accept-all" type="button"${hasPending ? '' : ' disabled'}>Accept All Changes</button>
</div>
<script>
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', () => vscode.postMessage({ type: 'action', action: el.dataset.action }));
  });
  document.getElementById('accept-all').addEventListener('click', () => vscode.postMessage({ type: 'acceptAllChanges' }));
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
