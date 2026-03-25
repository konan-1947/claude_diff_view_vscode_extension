/**
 * statusBarManager.ts
 *
 * Quản lý 3 status bar items của extension:
 *   1. Session status (Idle / Running / Error)
 *   2. Accept All button (hiện khi có pending diff)
 *   3. Revert All button (hiện khi có pending diff)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { IAiRunner } from '../claude/aiRunner';

export class StatusBarManager {
  private readonly sessionBar: vscode.StatusBarItem;
  private readonly acceptAllBar: vscode.StatusBarItem;
  private readonly revertAllBar: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.sessionBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.sessionBar.text = '$(robot) Claude: Idle';
    this.sessionBar.tooltip = 'Claude Diff View — click để bắt đầu session';
    this.sessionBar.command = 'claude-diff-view.startSession';
    this.sessionBar.show();

    this.acceptAllBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.acceptAllBar.text = '$(check-all) Accept All';
    this.acceptAllBar.tooltip = 'Chấp nhận tất cả thay đổi của Claude trong file này';
    this.acceptAllBar.command = 'claude-diff-view.acceptAllHunks';
    this.acceptAllBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

    this.revertAllBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      98
    );
    this.revertAllBar.text = '$(discard) Revert All';
    this.revertAllBar.tooltip = 'Hoàn tác tất cả thay đổi của Claude trong file này';
    this.revertAllBar.command = 'claude-diff-view.revertAllHunks';

    context.subscriptions.push(this.sessionBar, this.acceptAllBar, this.revertAllBar);
  }

  /**
   * Cập nhật trạng thái session bar.
   */
  setStatus(
    state: 'idle' | 'running' | 'error',
    runner?: IAiRunner,
    message?: string
  ): void {
    const toolLabel = runner
      ? runner.toolName.charAt(0).toUpperCase() + runner.toolName.slice(1)
      : 'AI';
    switch (state) {
      case 'running':
        this.sessionBar.text = `$(sync~spin) ${toolLabel}: Running\u2026`;
        break;
      case 'error':
        this.sessionBar.text = `$(error) ${toolLabel}: Error${
          message ? ' \u2014 ' + message.slice(0, 30) : ''
        }`;
        break;
      default:
        this.sessionBar.text = `$(robot) ${toolLabel}: Idle`;
    }
  }

  /**
   * Cập nhật hiển thị nút Accept/Revert All.
   * Gọi khi chuyển tab hoặc khi diff thay đổi.
   */
  updateButtons(filePath: string | undefined, hasPending: boolean): void {
    if (filePath && hasPending) {
      const basename = path.basename(filePath);
      this.acceptAllBar.text = `$(check-all) Accept All: ${basename}`;
      this.revertAllBar.text  = `$(discard) Revert All: ${basename}`;
      this.acceptAllBar.show();
      this.revertAllBar.show();
    } else {
      this.acceptAllBar.hide();
      this.revertAllBar.hide();
    }
  }
}
