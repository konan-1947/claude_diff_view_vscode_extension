import * as path from 'path';
import * as vscode from 'vscode';
import { DiffManager, DiffPreviewMetadata } from '../diff/diffManager';

type AgentChangesElement = AgentFolder | AgentFile;

interface AgentFolder {
  type: 'folder';
  id: string;
  label: string;
  resourceUri?: vscode.Uri;
  children: AgentChangesElement[];
}

interface AgentFile {
  type: 'file';
  metadata: DiffPreviewMetadata;
}

/** Native tree so VS Code renders the active file-icon theme and Explorer UI. */
export class AgentChangesPanel implements vscode.TreeDataProvider<AgentChangesElement>, vscode.Disposable {
  public static readonly viewType = 'ai-cli-diff-view.agentChanges';
  private static readonly openFileCommand = 'ai-cli-diff-view.openAgentPendingFile';

  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<AgentChangesElement | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly treeView: vscode.TreeView<AgentChangesElement>;
  private readonly diffDisposable: vscode.Disposable;
  private readonly commandDisposable: vscode.Disposable;
  private active = false;
  private activeFilePath?: string;
  private root: AgentFolder = { type: 'folder', id: 'root', label: '', children: [] };
  private generation = 0;

  constructor(
    private readonly diffManager: DiffManager,
    private readonly openPendingFile: (filePath: string) => boolean
  ) {
    this.treeView = vscode.window.createTreeView(AgentChangesPanel.viewType, {
      treeDataProvider: this,
      showCollapseAll: true,
    });
    this.commandDisposable = vscode.commands.registerCommand(
      AgentChangesPanel.openFileCommand,
      (filePath: string) => this.openPendingFile(filePath)
    );
    this.diffDisposable = this.diffManager.onDidChangeDiffs(() => {
      if (this.active) { void this.refresh(); }
    });
  }

  getTreeItem(element: AgentChangesElement): vscode.TreeItem {
    if (element.type === 'folder') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = element.id;
      item.resourceUri = element.resourceUri;
      item.contextValue = 'aiCliDiffFolder';
      return item;
    }

    const { metadata } = element;
    const item = new vscode.TreeItem(path.basename(metadata.filePath), vscode.TreeItemCollapsibleState.None);
    item.id = metadata.filePath;
    // This makes VS Code use the user's active file-icon theme.
    item.resourceUri = vscode.Uri.file(metadata.filePath);
    item.description = metadata.hunks === 0
      ? 'New empty file'
      : `+${metadata.additions} -${metadata.deletions} · ${metadata.hunks} ${metadata.hunks === 1 ? 'hunk' : 'hunks'}`;
    item.tooltip = metadata.hunks === 0
      ? `${metadata.filePath}\nNew empty file`
      : `${metadata.filePath}\n+${metadata.additions} -${metadata.deletions} · ${metadata.hunks} ${metadata.hunks === 1 ? 'hunk' : 'hunks'}`;
    item.command = {
      command: AgentChangesPanel.openFileCommand,
      title: 'Open Pending Diff',
      arguments: [metadata.filePath],
    };
    return item;
  }

  getChildren(element?: AgentChangesElement): AgentChangesElement[] {
    if (!this.active) { return []; }
    return element?.type === 'folder' ? element.children : this.root.children;
  }

  setAgentMode(active: boolean): void {
    this.active = active;
    if (!active) {
      this.activeFilePath = undefined;
      this.root = { type: 'folder', id: 'root', label: '', children: [] };
      this.onDidChangeTreeDataEmitter.fire(undefined);
      return;
    }
    void this.refresh();
  }

  setCodeModeFilesVisible(visible: boolean): void {
    if (this.active === visible) { return; }
    this.active = visible;
    if (!visible) {
      this.root = { type: 'folder', id: 'root', label: '', children: [] };
      this.onDidChangeTreeDataEmitter.fire(undefined);
      return;
    }
    void this.refresh();
  }

  setActiveFile(filePath: string | undefined): void {
    this.activeFilePath = filePath;
    this.revealActiveFile();
  }

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    const metadata = this.active ? await this.diffManager.getDiffPreviewMetadata() : [];
    if (generation !== this.generation) { return; }
    this.root = this.createTree(metadata);
    if (this.activeFilePath && !metadata.some((file) => file.filePath === this.activeFilePath)) {
      this.activeFilePath = undefined;
    }
    this.onDidChangeTreeDataEmitter.fire(undefined);
    this.revealActiveFile();
  }

  private createTree(metadata: DiffPreviewMetadata[]): AgentFolder {
    const root: AgentFolder = { type: 'folder', id: 'root', label: '', children: [] };
    const folders = new Map<string, AgentFolder>([['', root]]);
    for (const file of metadata) {
      const segments = this.pathSegments(file.filePath);
      let parent = root;
      let folderPath = '';
      for (const [index, segment] of segments.slice(0, -1).entries()) {
        folderPath = folderPath ? `${folderPath}/${segment}` : segment;
        let folder = folders.get(folderPath);
        if (!folder) {
          folder = {
            type: 'folder',
            id: `folder:${folderPath}`,
            label: segment,
            resourceUri: this.folderUri(file.filePath, segments, index),
            children: [],
          };
          parent.children.push(folder);
          folders.set(folderPath, folder);
        }
        parent = folder;
      }
      parent.children.push({ type: 'file', metadata: file });
    }
    this.sortTree(root);
    return root;
  }

  private sortTree(folder: AgentFolder): void {
    folder.children.sort((left, right) => {
      if (left.type !== right.type) { return left.type === 'folder' ? -1 : 1; }
      const leftName = left.type === 'folder' ? left.label : path.basename(left.metadata.filePath);
      const rightName = right.type === 'folder' ? right.label : path.basename(right.metadata.filePath);
      return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
    });
    for (const child of folder.children) {
      if (child.type === 'folder') { this.sortTree(child); }
    }
  }

  private pathSegments(filePath: string): string[] {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!folder) { return [path.basename(filePath)]; }
    const relative = path.relative(folder.uri.fsPath, filePath) || path.basename(filePath);
    return [folder.name, ...relative.split(path.sep).filter(Boolean)];
  }

  private folderUri(filePath: string, segments: string[], index: number): vscode.Uri | undefined {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!workspaceFolder) { return undefined; }
    return index === 0
      ? workspaceFolder.uri
      : vscode.Uri.joinPath(workspaceFolder.uri, ...segments.slice(1, index + 1));
  }

  private revealActiveFile(): void {
    if (!this.activeFilePath) { return; }
    const file = this.findFile(this.root, this.activeFilePath);
    if (!file) { return; }
    void this.treeView.reveal(file, { select: true, focus: false, expand: true }).then(
      undefined,
      () => { /* The tree may still be refreshing; a later event retries. */ }
    );
  }

  private findFile(folder: AgentFolder, filePath: string): AgentFile | undefined {
    for (const child of folder.children) {
      if (child.type === 'file' && child.metadata.filePath === filePath) { return child; }
      if (child.type === 'folder') {
        const result = this.findFile(child, filePath);
        if (result) { return result; }
      }
    }
    return undefined;
  }

  dispose(): void {
    this.generation += 1;
    this.commandDisposable.dispose();
    this.diffDisposable.dispose();
    this.treeView.dispose();
    this.onDidChangeTreeDataEmitter.dispose();
  }
}
