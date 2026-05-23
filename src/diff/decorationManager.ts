/**
 * decorationManager.ts
 *
 * Render decoration cho inline diff vẽ thẳng trên file thật:
 *  - dòng được THÊM   -> nền xanh
 *  - dòng SPACER (chỗ code bị xóa) -> nền đỏ + ghost text gạch ngang
 *  - SỐ DÒNG tự vẽ     -> số dòng gốc của VS Code bị tắt; ta tự render số dòng
 *    "thật" để dòng spacer không làm lệch đánh số (xem inlineDiffRenderer).
 *
 * Nút Accept/Revert do `HunkCodeLensProvider` lo (CodeLens — hiện sẵn, bấm 1
 * phát). KHÔNG chèn text nút vào buffer để tránh làm bẩn file thật.
 */

import * as vscode from 'vscode';

/** Một dòng spacer cần phủ nội dung dòng code đã bị xóa lên trên. */
export interface SpacerDecoration {
  /** Dòng spacer trong buffer hiển thị (0-indexed) */
  line: number;
  /** Nội dung dòng code đã bị xóa */
  text: string;
}

export class DecorationManager {
  /** Số dòng tự vẽ (render qua `before` vì số dòng gốc đã bị tắt). */
  private readonly lineNumberDecor: vscode.TextEditorDecorationType;
  private readonly addedLineDecor: vscode.TextEditorDecorationType;
  private readonly spacerLineDecor: vscode.TextEditorDecorationType;

  constructor() {
    this.lineNumberDecor = vscode.window.createTextEditorDecorationType({});

    this.addedLineDecor = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(46, 160, 67, 0.15)',
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.spacerLineDecor = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(248, 81, 73, 0.12)',
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }

  /**
   * Áp dụng decoration lên một editor.
   * @param spacers     - các dòng trống cần hiển thị nội dung code đã xóa
   * @param addedLines  - chỉ số các dòng được thêm (tô nền xanh)
   * @param lineLabels  - nhãn số dòng cho TỪNG dòng buffer (đã pad sẵn, dòng
   *                      spacer là chuỗi trắng)
   */
  applyToEditor(
    editor: vscode.TextEditor,
    spacers: SpacerDecoration[],
    addedLines: number[],
    lineLabels: string[]
  ): void {
    // --- Số dòng tự vẽ (mọi dòng) ---
    const lineNumberOptions: vscode.DecorationOptions[] = lineLabels.map(
      (label, i) => ({
        range: new vscode.Range(i, 0, i, 0),
        renderOptions: {
          before: {
            contentText: label,
            color: new vscode.ThemeColor('editorLineNumber.foreground'),
            margin: '0 14px 0 0',
            textDecoration: 'none; white-space: pre;',
          },
        },
      })
    );

    const addedRanges = addedLines.map(
      (line) => new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER)
    );

    // Nội dung dòng đã xóa render bằng `after` để canh thẳng cột với code.
    const spacerOptions: vscode.DecorationOptions[] = spacers.map((s) => ({
      range: new vscode.Range(s.line, 0, s.line, 0),
      renderOptions: {
        after: {
          contentText: s.text.length > 0 ? s.text : ' ',
          color: 'rgba(248, 81, 73, 0.9)',
          textDecoration: 'line-through; white-space: pre;',
        },
      },
    }));

    editor.setDecorations(this.lineNumberDecor, lineNumberOptions);
    editor.setDecorations(this.addedLineDecor, addedRanges);
    editor.setDecorations(this.spacerLineDecor, spacerOptions);
  }

  /** Xóa toàn bộ decoration khỏi một editor. */
  clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.lineNumberDecor, []);
    editor.setDecorations(this.addedLineDecor, []);
    editor.setDecorations(this.spacerLineDecor, []);
  }

  /** Dispose decoration types khi deactivate. */
  disposeAll(): void {
    this.lineNumberDecor.dispose();
    this.addedLineDecor.dispose();
    this.spacerLineDecor.dispose();
  }
}
