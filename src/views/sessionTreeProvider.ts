import * as vscode from 'vscode';
import * as path from 'path';
import { DiffManager } from '../diff/diffManager';

type SessionState = 'idle' | 'running' | 'error';

export class SessionTreeProvider
  implements vscode.TreeDataProvider<TreeNode>
{
  private _onDidChangeTreeData =
    new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private state: SessionState = 'idle';
  private pendingFiles: string[] = [];
  private lastPrompt = '';
  private errorMessage = '';

  constructor(private readonly diffManager: DiffManager) {}

  // Called by extension.ts when session state changes
  setRunning(prompt: string): void {
    this.state = 'running';
    this.lastPrompt = prompt;
    this.pendingFiles = [];
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

  addPendingFile(filePath: string): void {
    const basename = path.basename(filePath);
    if (!this.pendingFiles.includes(basename)) {
      this.pendingFiles.push(basename);
    }
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element) {
      return [];
    }

    const nodes: TreeNode[] = [];

    // Status node
    if (this.state === 'running') {
      nodes.push(
        new TreeNode(
          `Running…`,
          `Prompt: ${this.lastPrompt.slice(0, 50)}`,
          vscode.TreeItemCollapsibleState.None,
          new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow'))
        )
      );
    } else if (this.state === 'error') {
      nodes.push(
        new TreeNode(
          'Session failed',
          this.errorMessage.slice(0, 80),
          vscode.TreeItemCollapsibleState.None,
          new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'))
        )
      );
    } else {
      nodes.push(
        new TreeNode(
          'Idle — press Ctrl+Shift+A to start',
          '',
          vscode.TreeItemCollapsibleState.None,
          new vscode.ThemeIcon('robot')
        )
      );
    }

    // Pending diff files
    if (this.pendingFiles.length > 0) {
      const header = new TreeNode(
        `Pending diffs (${this.pendingFiles.length})`,
        '',
        vscode.TreeItemCollapsibleState.None,
        new vscode.ThemeIcon('diff', new vscode.ThemeColor('charts.blue'))
      );
      nodes.push(header);

      for (const file of this.pendingFiles) {
        const fileNode = new TreeNode(
          file,
          'Click Accept ✓ or Reject ✗ in the diff tab',
          vscode.TreeItemCollapsibleState.None,
          new vscode.ThemeIcon('file-code')
        );
        nodes.push(fileNode);
      }
    }

    // Shortcut hints
    nodes.push(
      new TreeNode(
        'Install CLI Hooks',
        'Enable diff view for `claude` in any terminal',
        vscode.TreeItemCollapsibleState.None,
        new vscode.ThemeIcon('plug'),
        { command: 'claude-diff-view.installHooks', title: 'Install Hooks' }
      )
    );

    return nodes;
  }
}

class TreeNode extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    iconPath?: vscode.ThemeIcon,
    command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip;
    this.iconPath = iconPath;
    this.command = command;
  }
}
