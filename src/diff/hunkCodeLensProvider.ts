import * as vscode from 'vscode';
import { DiffManager } from './diffManager';

/**
 * Cung cấp CodeLens (nút bấm "Accept Hunk | Revert Hunk") hiển thị ngay trên mỗi block thay đổi.
 * Khắc phục giới hạn của chuẩn VS Code (không cho phép click trực tiếp vào gutter icon).
 */
export class HunkCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private readonly diffManager: DiffManager) {}

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const filePath = document.uri.fsPath;

    // Chỉ hiện CodeLens nếu file đang có pending diff
    if (!this.diffManager.hasPendingDiff(filePath)) {
      return [];
    }

    const hunks = this.diffManager.renderer.getHunks(filePath);
    const lenses: vscode.CodeLens[] = [];

    for (const hunk of hunks) {
      // Đặt CodeLens ở dòng bắt đầu của hunk
      const lineIdx = Math.max(0, hunk.modifiedStart);
      const range = new vscode.Range(lineIdx, 0, lineIdx, 0);

      // Nút Accept
      const acceptCmd: vscode.Command = {
        title: '$(check) Accept Hunk',
        tooltip: 'Chấp nhận các thay đổi này',
        command: 'claude-diff-view.acceptHunk',
        arguments: [filePath, hunk.id],
      };
      lenses.push(new vscode.CodeLens(range, acceptCmd));

      // Nút Revert
      const revertCmd: vscode.Command = {
        title: '$(close) Revert Hunk',
        tooltip: 'Hủy bỏ thay đổi, quay về gốc',
        command: 'claude-diff-view.revertHunk',
        arguments: [filePath, hunk.id],
      };
      lenses.push(new vscode.CodeLens(range, revertCmd));
    }

    return lenses;
  }
}
