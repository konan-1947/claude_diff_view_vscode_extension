/**
 * inlineDiffRenderer.ts
 *
 * Render inline diff trực tiếp lên editor thường (không dùng vscode.diff).
 * - Dòng thêm mới: nền xanh
 * - Dòng bị xóa: hiển thị như ghost text với nền đỏ + strikethrough
 * - Gutter icon: check (accept) và X (revert) trên mỗi hunk
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { calculateHunks, Hunk } from './hunkCalculator';

/** State của một file đang có inline diff */
interface FileDiffState {
  originalContent: string;
  hunks: Hunk[];
  /** Decoration ranges hiện đang gắn trên editor */
  decorations: vscode.TextEditorDecorationType[];
}

export class InlineDiffRenderer {
  /** Map filePath -> trạng thái diff hiện tại */
  private fileStates = new Map<string, FileDiffState>();

  /** Decoration types dùng chung cho toàn bộ instance */
  private readonly addedLineDecor: vscode.TextEditorDecorationType;
  private readonly removedLineDecor: vscode.TextEditorDecorationType;
  private readonly acceptGutterDecor: vscode.TextEditorDecorationType;
  private readonly revertGutterDecor: vscode.TextEditorDecorationType;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.addedLineDecor = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.removedLineDecor = vscode.window.createTextEditorDecorationType({
      // Do not use isWholeLine or backgroundColor here, because it would colour the actual (new) line text red!
      // The background colour will be applied to the ghost text blocks only.
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });

    // Removed the accept/revert gutter decorations as they are redundant with CodeLens
    this.acceptGutterDecor = vscode.window.createTextEditorDecorationType({});
    this.revertGutterDecor = vscode.window.createTextEditorDecorationType({});
  }

  /**
   * Hiển thị inline diff cho một file đang mở trong editor.
   */
  show(
    filePath: string,
    originalContent: string,
    modifiedContent: string
  ): void {
    const hunks = calculateHunks(originalContent, modifiedContent);
    this.fileStates.set(filePath, {
      originalContent,
      hunks,
      decorations: [],
    });
    this.applyDecorations(filePath);
  }

  /**
   * Chấp nhận một hunk cụ thể (giữ nội dung mới, xóa decoration của hunk đó).
   * Trả về true nếu đây là hunk cuối cùng (không còn pending diff).
   */
  acceptHunk(filePath: string, hunkId: string): boolean {
    const state = this.fileStates.get(filePath);
    if (!state) { return true; }

    state.hunks = state.hunks.filter(h => h.id !== hunkId);
    if (state.hunks.length === 0) {
      this.clear(filePath);
      return true;
    }
    this.applyDecorations(filePath);
    return false;
  }

  /**
   * Revert một hunk cụ thể (khôi phục về nội dung gốc của hunk đó).
   * Trả về true nếu không còn pending diff.
   */
  async revertHunk(filePath: string, hunkId: string): Promise<boolean> {
    const state = this.fileStates.get(filePath);
    if (!state) { return true; }

    const hunk = state.hunks.find(h => h.id === hunkId);
    if (!hunk) { return state.hunks.length === 0; }

    // Đọc nội dung file hiện tại
    const document = this.findDocument(filePath);
    if (!document) { return false; }

    const editor = await this.openEditor(document);
    if (!editor) { return false; }

    await editor.edit(editBuilder => {
      // Xóa các dòng được thêm mới (addedLines), thay bằng dòng bị xóa (removedLines)
      if (hunk.addedLines.length > 0) {
        const firstAdded = hunk.addedLines[0]!;
        const lastAdded = hunk.addedLines[hunk.addedLines.length - 1]!;

        const startPos = new vscode.Position(firstAdded.modifiedLineIndex, 0);
        const endLine = lastAdded.modifiedLineIndex;
        const endPos = new vscode.Position(
          endLine,
          document.lineAt(Math.min(endLine, document.lineCount - 1)).text.length
        );

        const replacementText = hunk.removedLines.map(r => r.text).join('\n');

        if (hunk.removedLines.length === 0) {
          // Thuần insert: xóa các dòng được thêm
          const deleteRange = new vscode.Range(
            new vscode.Position(firstAdded.modifiedLineIndex, 0),
            new vscode.Position(lastAdded.modifiedLineIndex + 1, 0)
          );
          editBuilder.delete(deleteRange);
        } else {
          editBuilder.replace(new vscode.Range(startPos, endPos), replacementText);
        }
      } else if (hunk.removedLines.length > 0) {
        // Thuần delete: chèn lại các dòng bị xóa
        const insertPos = new vscode.Position(hunk.modifiedStart, 0);
        const insertText = hunk.removedLines.map(r => r.text).join('\n') + '\n';
        editBuilder.insert(insertPos, insertText);
      }
    });

    // Cập nhật hunks: xóa hunk vừa revert và tính lại modifiedStart các hunk sau
    const delta = hunk.removedLines.length - hunk.addedLines.length;
    state.hunks = state.hunks.filter(h => h.id !== hunkId);

    // Điều chỉnh modifiedStart của các hunk phía sau
    for (const laterHunk of state.hunks) {
      if (laterHunk.modifiedStart > hunk.modifiedStart) {
        laterHunk.modifiedStart += delta;
        for (const line of laterHunk.addedLines) {
          line.modifiedLineIndex += delta;
        }
      }
    }

    if (state.hunks.length === 0) {
      this.clear(filePath);
      return true;
    }
    this.applyDecorations(filePath);
    return false;
  }

  /**
   * Chấp nhận toàn bộ thay đổi trong file.
   */
  acceptAll(filePath: string): void {
    this.clear(filePath);
  }

  /**
   * Revert toàn bộ về nội dung gốc.
   */
  async revertAll(filePath: string): Promise<void> {
    const state = this.fileStates.get(filePath);
    if (!state) { return; }

    const document = this.findDocument(filePath);
    if (!document) { return; }

    const editor = await this.openEditor(document);
    if (!editor) { return; }

    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      document.lineAt(document.lineCount - 1).range.end
    );
    await editor.edit(editBuilder => {
      editBuilder.replace(fullRange, state.originalContent);
    });

    this.clear(filePath);
  }

  /**
   * Lấy danh sách hunk IDs cho một file.
   */
  getHunks(filePath: string): Hunk[] {
    return this.fileStates.get(filePath)?.hunks ?? [];
  }

  /**
   * Kiểm tra xem file có đang có pending diff không.
   */
  hasPending(filePath: string): boolean {
    const state = this.fileStates.get(filePath);
    return (state?.hunks.length ?? 0) > 0;
  }

  /**
   * Xóa tất cả decoration của file và xóa khỏi state.
   */
  clear(filePath: string): void {
    const state = this.fileStates.get(filePath);
    if (!state) { return; }

    // Xóa tất cả decoration đang gắn trên các editor hiển thị file này
    for (const editor of vscode.window.visibleTextEditors) {
      const editorPath = editor.document.uri.fsPath;
      if (this.normalizePath(editorPath) === this.normalizePath(filePath) && !this.isEditorInDiffView(editor)) {
        editor.setDecorations(this.addedLineDecor, []);
        editor.setDecorations(this.removedLineDecor, []);
        editor.setDecorations(this.acceptGutterDecor, []);
        editor.setDecorations(this.revertGutterDecor, []);
      }
    }

    this.fileStates.delete(filePath);
  }

  /** Xóa tất cả (khi deactivate). */
  disposeAll(): void {
    for (const filePath of Array.from(this.fileStates.keys())) {
      this.clear(filePath);
    }
    this.addedLineDecor.dispose();
    this.removedLineDecor.dispose();
    this.acceptGutterDecor.dispose();
    this.revertGutterDecor.dispose();
  }

  /**
   * Áp dụng lại decoration lên tất cả editor đang hiển thị file.
   */
  applyDecorations(filePath: string): void {
    const state = this.fileStates.get(filePath);
    if (!state) { return; }

    const addedRanges: vscode.Range[] = [];
    const removedRanges: vscode.DecorationOptions[] = [];
    const acceptGutterRanges: vscode.DecorationOptions[] = [];
    const revertGutterRanges: vscode.DecorationOptions[] = [];

    for (const hunk of state.hunks) {
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

      // Dòng bị xóa — hiển thị như một ghost text mờ ở CUỐI dòng (after) để không phá vỡ indentation
      if (hunk.removedLines.length > 0) {
        const anchorLine = Math.max(0, hunk.modifiedStart);
        // Nối các dòng xóa thành một chuỗi duy nhất với ký hiệu ngắt dòng
        const removedText = '   ◀ xóa: ' + hunk.removedLines.map(r => r.text.trim()).join(' ↵ ');
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

      // Gutter icons — gắn vào dòng đầu tiên của hunk
      const gutterLine = hunk.modifiedStart;
      const gutterRange = new vscode.Range(
        new vscode.Position(gutterLine, 0),
        new vscode.Position(gutterLine, 0)
      );
      acceptGutterRanges.push({
        range: gutterRange,
        hoverMessage: new vscode.MarkdownString(`**Accept hunk** (ID: \`${hunk.id}\`)\n\nChạy lệnh \`Claude: Accept Hunk\``),
      });
      revertGutterRanges.push({
        range: gutterRange,
        hoverMessage: new vscode.MarkdownString(`**Revert hunk** (ID: \`${hunk.id}\`)\n\nChạy lệnh \`Claude: Revert Hunk\``),
      });
    }

    // Gắn decoration lên tất cả editor đang mở file này (bỏ qua diff editor)
    for (const editor of vscode.window.visibleTextEditors) {
      const editorPath = editor.document.uri.fsPath;
      if (this.normalizePath(editorPath) === this.normalizePath(filePath) && !this.isEditorInDiffView(editor)) {
        editor.setDecorations(this.addedLineDecor, addedRanges);
        editor.setDecorations(this.removedLineDecor, removedRanges);
        editor.setDecorations(this.acceptGutterDecor, acceptGutterRanges);
        editor.setDecorations(this.revertGutterDecor, revertGutterRanges);
      }
    }
  }

  // ---- Helper methods ----

  /**
   * Trả về true nếu editor đang là một phần của diff view (không phải regular editor).
   * Dùng Tab API (VSCode 1.71+).
   */
  private isEditorInDiffView(editor: vscode.TextEditor): boolean {
    for (const group of vscode.window.tabGroups.all) {
      if (group.viewColumn !== editor.viewColumn) { continue; }
      const activeTab = group.activeTab;
      if (activeTab?.input instanceof vscode.TabInputTextDiff) {
        return true;
      }
    }
    return false;
  }

  private normalizePath(p: string): string {
    const fsPath = vscode.Uri.file(path.resolve(p)).fsPath;
    return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
  }

  private findDocument(filePath: string): vscode.TextDocument | undefined {
    const normalized = this.normalizePath(filePath);
    return vscode.workspace.textDocuments.find(
      d => this.normalizePath(d.uri.fsPath) === normalized
    );
  }

  private async openEditor(
    document: vscode.TextDocument
  ): Promise<vscode.TextEditor | undefined> {
    try {
      return await vscode.window.showTextDocument(document, { preview: false });
    } catch {
      return undefined;
    }
  }
}
