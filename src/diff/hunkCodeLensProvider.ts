import * as vscode from 'vscode';
import { DiffManager } from './diffManager';

/**
 * Hiển thị nút Accept/Revert cho từng hunk dưới dạng CodeLens — luôn hiện sẵn
 * ngay trên hunk, bấm 1 phát (không cần hover), không đụng vào nội dung file.
 *
 * Nhãn kèm số thứ tự hunk (vd "Accept Hunk 1/3").
 */
export class HunkCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private readonly diffManager: DiffManager) {}

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const filePath = document.uri.fsPath;
    if (!this.diffManager.renderer.isRendered(filePath)) {
      return [];
    }

    const views = this.diffManager.renderer.getHunkViews(filePath);
    const lenses: vscode.CodeLens[] = [];

    views.forEach((view, index) => {
      const hunkLabel = `Hunk ${index + 1}/${views.length}`;
      // Đặt CodeLens ngay trên dòng đầu vùng hiển thị của hunk.
      const line = Math.max(0, view.spacerStart);
      const range = new vscode.Range(line, 0, line, 0);

      lenses.push(
        new vscode.CodeLens(range, {
          title: `Accept ${hunkLabel}`,
          tooltip: 'Chấp nhận các thay đổi của hunk này',
          command: 'ai-cli-diff-view.acceptHunk',
          arguments: [filePath, view.hunk.id],
        })
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: `Revert ${hunkLabel}`,
          tooltip: 'Hủy bỏ thay đổi, quay về gốc',
          command: 'ai-cli-diff-view.revertHunk',
          arguments: [filePath, view.hunk.id],
        })
      );
    });

    return lenses;
  }
}
