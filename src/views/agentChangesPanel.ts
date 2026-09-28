import * as path from 'path';
import * as vscode from 'vscode';
import { DiffManager, DiffPreviewMetadata } from '../diff/diffManager';

/**
 * Contextual Agent Mode navigator hosted in the Secondary Side Bar. It never
 * renders source text or applies changes: selecting a row delegates to the
 * central Agent preview.
 */
export class AgentChangesPanel implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'ai-cli-diff-view.agentChanges';

  private view?: vscode.WebviewView;
  private active = false;
  private activeFilePath?: string;
  private metadata: DiffPreviewMetadata[] = [];
  private generation = 0;
  private readonly diffDisposable: vscode.Disposable;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly diffManager: DiffManager,
    private readonly openPendingFile: (filePath: string) => boolean
  ) {
    this.diffDisposable = this.diffManager.onDidChangeDiffs(() => {
      if (this.active) {
        void this.refresh();
      }
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.onDidReceiveMessage((message: { type?: string; path?: string }) => {
      if (message.type === 'openPendingFile' && typeof message.path === 'string') {
        this.openPendingFile(message.path);
      }
    });
    void this.refresh();
  }

  setAgentMode(active: boolean): void {
    this.active = active;
    if (!active) {
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

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    const metadata = this.active ? await this.diffManager.getDiffPreviewMetadata() : [];
    if (generation !== this.generation) { return; }
    this.metadata = metadata;
    if (this.activeFilePath && !metadata.some((file) => file.filePath === this.activeFilePath)) {
      this.activeFilePath = undefined;
    }
    this.render();
  }

  private render(): void {
    if (!this.view) { return; }
    this.view.webview.html = this.buildHtml();
  }

  private buildHtml(): string {
    const rows = this.metadata.map((file) => {
      const active = file.filePath === this.activeFilePath ? ' active' : '';
      return `<button class="file${active}" data-path="${escapeAttr(file.filePath)}" type="button">
        <span class="path">${escapeHtml(this.displayPath(file.filePath))}</span>
        <span class="stats"><span class="add">+${file.additions}</span> <span class="delete">-${file.deletions}</span> · ${file.hunks} ${file.hunks === 1 ? 'hunk' : 'hunks'}</span>
      </button>`;
    }).join('');
    const body = this.metadata.length > 0
      ? `<div class="section-title"><span>Changes</span><span class="badge">${this.metadata.length}</span></div><div class="files">${rows}</div>`
      : '<div class="empty">No pending changes</div>';

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { padding: 12px 10px; overflow-y: auto; font-family: var(--vscode-font-family); font-size: 12px; color: var(--vscode-sideBar-foreground, var(--vscode-foreground)); background: var(--vscode-sideBar-background); }
  .section-title { display: flex; align-items: center; justify-content: space-between; margin: 0 4px 8px; font-size: 11px; font-weight: 600; letter-spacing: .05em; opacity: .75; text-transform: uppercase; }
  .badge { padding: 2px 7px; border-radius: 10px; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); }
  .files { display: flex; flex-direction: column; gap: 2px; }
  .file { width: 100%; padding: 7px 8px; border: 0; border-radius: 3px; color: inherit; background: transparent; font: inherit; text-align: left; cursor: pointer; }
  .file:hover { background: var(--vscode-list-hoverBackground); }
  .file.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .file:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .path { display: block; overflow: hidden; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .stats { display: block; margin-top: 3px; font-size: 11px; opacity: .8; }
  .add { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); }
  .delete { color: var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c); }
  .file.active .add, .file.active .delete { color: inherit; }
  .empty { padding: 18px 8px; color: var(--vscode-descriptionForeground); font-style: italic; text-align: center; }
</style></head><body>${body}<script>
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('.file').forEach((row) => row.addEventListener('click', () => {
    vscode.postMessage({ type: 'openPendingFile', path: row.dataset.path });
  }));
</script></body></html>`;
  }

  private displayPath(filePath: string): string {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!folder) { return path.basename(filePath); }
    const relative = path.relative(folder.uri.fsPath, filePath) || path.basename(filePath);
    return (vscode.workspace.workspaceFolders?.length ?? 0) > 1
      ? `${folder.name}/${relative}`
      : relative;
  }

  dispose(): void {
    this.generation += 1;
    this.diffDisposable.dispose();
    this.view = undefined;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
