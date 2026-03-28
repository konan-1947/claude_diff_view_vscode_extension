import * as vscode from 'vscode';
import * as path from 'path';
import { DiffManager } from '../diff/diffManager';

type SessionState = 'idle' | 'running' | 'error';

const PENDING_FILES_GROUP_CONTEXT = 'pendingFilesGroup';

export class SessionTreeProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private _onDidChangeTreeData =
    new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private state: SessionState = 'idle';
  private lastPrompt = '';
  private errorMessage = '';

  constructor(private readonly diffManager: DiffManager) {}

  private readonly _diffListener = this.diffManager.onDidChangeDiffs(() => {
    this.refresh();
  });

  setRunning(prompt: string): void {
    this.state = 'running';
    this.lastPrompt = prompt;
    this.errorMessage = '';
    this.refresh();
  }

  setIdle(): void {
    this.state = 'idle';
    this.refresh();
  }

  setError(message: string): void {
    this.state = 'error';
    this.errorMessage = message;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element?.contextValue === PENDING_FILES_GROUP_CONTEXT) {
      return this.pendingFileNodes(this.diffManager.getPendingFiles());
    }

    const nodes: TreeNode[] = [];

    if (this.state === 'running') {
      nodes.push(
        new TreeNode('Running…', vscode.TreeItemCollapsibleState.None, {
          tooltip: this.lastPrompt
            ? `Prompt:\n${this.lastPrompt}`
            : 'Session running',
          iconPath: new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow')),
        })
      );
    } else if (this.state === 'error') {
      nodes.push(
        new TreeNode('Session failed', vscode.TreeItemCollapsibleState.None, {
          tooltip: this.errorMessage || 'Unknown error',
          iconPath: new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground')),
        })
      );
    }

    const pendingFiles = this.diffManager.getPendingFiles();
    if (pendingFiles.length > 0) {
      nodes.push(
        new TreeNode('Pending changes', vscode.TreeItemCollapsibleState.Expanded, {
          description: String(pendingFiles.length),
          iconPath: new vscode.ThemeIcon('diff', new vscode.ThemeColor('charts.blue')),
          contextValue: PENDING_FILES_GROUP_CONTEXT,
        })
      );
    }

    nodes.push(
      new TreeNode('Install CLI Hooks', vscode.TreeItemCollapsibleState.None, {
        tooltip:
          'Also in the Session title bar (plug icon). Writes hooks to Claude settings for terminal runs.',
        description: 'Click or use toolbar',
        iconPath: new vscode.ThemeIcon('plug'),
        command: { command: 'claude-diff-view.installHooks', title: 'Install Hooks' },
      })
    );

    return nodes;
  }

  private pendingFileNodes(absPaths: string[]): TreeNode[] {
    return absPaths.map((absPath) => {
      const base = path.basename(absPath);
      const rel = workspaceRelativePath(absPath);
      const desc = rel === base ? undefined : rel;
      return new TreeNode(base, vscode.TreeItemCollapsibleState.None, {
        tooltip: absPath,
        description: desc,
        resourceUri: vscode.Uri.file(absPath),
        contextValue: 'pendingDiffFile',
        command: {
          command: 'claude-diff-view.openPendingFile',
          title: 'Open',
          arguments: [absPath],
        },
      });
    });
  }
}

function workspaceRelativePath(absPath: string): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return path.dirname(absPath);
  }
  for (const folder of folders) {
    const root = folder.uri.fsPath;
    const rel = path.relative(root, absPath);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel;
    }
  }
  return absPath;
}

class TreeNode extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    opts?: {
      tooltip?: string;
      iconPath?: vscode.ThemeIcon;
      command?: vscode.Command;
      description?: string;
      resourceUri?: vscode.Uri;
      contextValue?: string;
    }
  ) {
    super(label, collapsibleState);
    const o = opts ?? {};
    if (o.tooltip !== undefined) {
      this.tooltip = o.tooltip;
    }
    if (o.iconPath) {
      this.iconPath = o.iconPath;
    }
    if (o.command) {
      this.command = o.command;
    }
    if (o.description !== undefined) {
      this.description = o.description;
    }
    if (o.resourceUri) {
      this.resourceUri = o.resourceUri;
    }
    if (o.contextValue) {
      this.contextValue = o.contextValue;
    }
  }
}
