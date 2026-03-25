/**
 * decorationManager.ts
 *
 * Quản lý TextEditorDecorationType và việc render decoration
 * (added lines highlight, removed lines ghost text, gutter icons) lên editor.
 */

import * as vscode from 'vscode';
import { Hunk } from './hunkCalculator';

export class DecorationManager {
  private readonly addedLineDecor: vscode.TextEditorDecorationType;
  private readonly removedLineDecor: vscode.TextEditorDecorationType;
  /** Giữ lại để tương thích — không dùng icon thật vì đã có CodeLens */
  private readonly acceptGutterDecor: vscode.TextEditorDecorationType;
  private readonly revertGutterDecor: vscode.TextEditorDecorationType;

  constructor() {
    this.addedLineDecor = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(30, 100, 255, 0.25)',
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.removedLineDecor = vscode.window.createTextEditorDecorationType({
      // Không dùng isWholeLine / backgroundColor ở đây vì sẽ tô đỏ cả dòng text mới.
      // Màu nền chỉ được áp dụng lên ghost text block phía sau.
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });

    // Gutter decorations — giữ trống vì CodeLens đã cover
    this.acceptGutterDecor = vscode.window.createTextEditorDecorationType({});
    this.revertGutterDecor = vscode.window.createTextEditorDecorationType({});
  }

  /**
   * Áp dụng decorations lên một editor cụ thể dựa trên danh sách hunks.
   */
  applyToEditor(editor: vscode.TextEditor, hunks: Hunk[]): void {
    const addedRanges: vscode.Range[] = [];
    const removedRanges: vscode.DecorationOptions[] = [];
    const acceptGutterRanges: vscode.DecorationOptions[] = [];
    const revertGutterRanges: vscode.DecorationOptions[] = [];

    for (const hunk of hunks) {
      // Dòng được thêm — tô nền xanh
      for (const addedLine of hunk.addedLines) {
        const lineIdx = addedLine.modifiedLineIndex;
        addedRanges.push(
          new vscode.Range(
            new vscode.Position(lineIdx, 0),
            new vscode.Position(lineIdx, Number.MAX_SAFE_INTEGER)
          )
        );
      }

      // Dòng bị xóa — hiển thị ghost text ở cuối dòng anchor
      if (hunk.removedLines.length > 0) {
        const anchorLine = Math.max(0, hunk.modifiedStart);
        const removedText =
          '   \u25c0 x\u00f3a: ' +
          hunk.removedLines.map(r => r.text.trim()).join(' \u21b5 ');
        removedRanges.push({
          range: new vscode.Range(
            new vscode.Position(anchorLine, Number.MAX_SAFE_INTEGER),
            new vscode.Position(anchorLine, Number.MAX_SAFE_INTEGER)
          ),
          renderOptions: {
            after: {
              contentText: removedText,
              color: new vscode.ThemeColor('editorError.foreground'),
              textDecoration: 'line-through; opacity: 0.7;',
              fontStyle: 'italic',
              margin: '0 0 0 20px',
            },
          },
        });
      }

      // Gutter hover — gắn vào dòng đầu tiên của hunk
      const gutterLine = hunk.modifiedStart;
      const gutterRange = new vscode.Range(
        new vscode.Position(gutterLine, 0),
        new vscode.Position(gutterLine, 0)
      );
      acceptGutterRanges.push({
        range: gutterRange,
        hoverMessage: new vscode.MarkdownString(
          `**Accept hunk** (ID: \`${hunk.id}\`)\n\nCh\u1ea1y l\u1ec7nh \`Claude: Accept Hunk\``
        ),
      });
      revertGutterRanges.push({
        range: gutterRange,
        hoverMessage: new vscode.MarkdownString(
          `**Revert hunk** (ID: \`${hunk.id}\`)\n\nCh\u1ea1y l\u1ec7nh \`Claude: Revert Hunk\``
        ),
      });
    }

    editor.setDecorations(this.addedLineDecor, addedRanges);
    editor.setDecorations(this.removedLineDecor, removedRanges);
    editor.setDecorations(this.acceptGutterDecor, acceptGutterRanges);
    editor.setDecorations(this.revertGutterDecor, revertGutterRanges);
  }

  /**
   * Xóa tất cả decorations khỏi một editor.
   */
  clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.addedLineDecor, []);
    editor.setDecorations(this.removedLineDecor, []);
    editor.setDecorations(this.acceptGutterDecor, []);
    editor.setDecorations(this.revertGutterDecor, []);
  }

  /** Dispose tất cả decoration types khi deactivate. */
  disposeAll(): void {
    this.addedLineDecor.dispose();
    this.removedLineDecor.dispose();
    this.acceptGutterDecor.dispose();
    this.revertGutterDecor.dispose();
  }
}
