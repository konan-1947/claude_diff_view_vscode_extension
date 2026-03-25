import * as vscode from 'vscode';
import * as path from 'path';
import { IAiRunner } from '../claude/aiRunner';

export class StatusBarManager {
  private readonly sessionBar: vscode.StatusBarItem;
  private readonly acceptAllBar: vscode.StatusBarItem;
  private readonly revertAllBar: vscode.StatusBarItem;
  private readonly prevFileBar: vscode.StatusBarItem;
  private readonly navInfoBar: vscode.StatusBarItem;
  private readonly nextFileBar: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.sessionBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.sessionBar.text = 'Claude: Idle';
    this.sessionBar.tooltip = 'Claude Diff View — click để bắt đầu session';
    this.sessionBar.command = 'claude-diff-view.startSession';
    this.sessionBar.show();

    this.acceptAllBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.acceptAllBar.text = 'Accept All';
    this.acceptAllBar.tooltip = 'Chấp nhận tất cả thay đổi của Claude trong file này';
    this.acceptAllBar.command = 'claude-diff-view.acceptAllHunks';
    this.acceptAllBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

    this.revertAllBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    this.revertAllBar.text = 'Revert All';
    this.revertAllBar.tooltip = 'Hoàn tác tất cả thay đổi của Claude trong file này';
    this.revertAllBar.command = 'claude-diff-view.revertAllHunks';

    this.prevFileBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
    this.prevFileBar.text = '< Alt+H';
    this.prevFileBar.tooltip = 'File trước có diff (Alt+H)';
    this.prevFileBar.command = 'claude-diff-view.prevFile';

    this.navInfoBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);

    this.nextFileBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
    this.nextFileBar.text = 'Alt+L >';
    this.nextFileBar.tooltip = 'File tiếp theo có diff (Alt+L)';
    this.nextFileBar.command = 'claude-diff-view.nextFile';

    context.subscriptions.push(
      this.sessionBar, this.acceptAllBar, this.revertAllBar,
      this.prevFileBar, this.navInfoBar, this.nextFileBar
    );
  }

  setStatus(state: 'idle' | 'running' | 'error', runner?: IAiRunner, message?: string): void {
    const toolLabel = runner
      ? runner.toolName.charAt(0).toUpperCase() + runner.toolName.slice(1)
      : 'AI';
    switch (state) {
      case 'running':
        this.sessionBar.text = `${toolLabel}: Running\u2026`;
        break;
      case 'error':
        this.sessionBar.text = `${toolLabel}: Error${message ? ' \u2014 ' + message.slice(0, 30) : ''}`;
        break;
      default:
        this.sessionBar.text = `${toolLabel}: Idle`;
    }
  }

  updateButtons(filePath: string | undefined, hasPending: boolean): void {
    if (filePath && hasPending) {
      const basename = path.basename(filePath);
      this.acceptAllBar.text = `Accept All: ${basename}`;
      this.revertAllBar.text = `Revert All: ${basename}`;
      this.acceptAllBar.show();
      this.revertAllBar.show();
    } else {
      this.acceptAllBar.hide();
      this.revertAllBar.hide();
    }
  }

  updateNavigation(navInfo?: { currentIdx: number; total: number; prevName: string; nextName: string }): void {
    if (navInfo && navInfo.total > 1) {
      this.prevFileBar.tooltip = `${navInfo.prevName} (Alt+H)`;
      this.navInfoBar.text = `${navInfo.currentIdx}/${navInfo.total} files`;
      this.navInfoBar.tooltip = `View ${navInfo.total} files with pending diffs`;
      this.nextFileBar.tooltip = `${navInfo.nextName} (Alt+L)`;
      this.prevFileBar.show();
      this.navInfoBar.show();
      this.nextFileBar.show();
    } else {
      this.prevFileBar.hide();
      this.navInfoBar.hide();
      this.nextFileBar.hide();
    }
  }
}
