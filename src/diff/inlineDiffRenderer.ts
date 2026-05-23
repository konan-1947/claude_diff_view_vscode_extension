/**
 * inlineDiffRenderer.ts
 *
 * Vẽ diff TRỰC TIẾP lên editor của file thật (mánh "spacer lines").
 *
 * File trên đĩa đã chứa nội dung MỚI. Để hiển thị các dòng đã XÓA, ta chèn
 * những dòng trống thật ("spacer") vào buffer rồi phủ nội dung dòng cũ lên
 * bằng `TextEditorDecorationType`. Không còn dùng Diff Editor side-by-side.
 *
 * Mỗi file đang review = 1 `InlineDiffSession` giữ 2 chuỗi:
 *  - originalContent: nội dung cũ (baseline)
 *  - currentContent : nội dung mới (CHƯA kèm spacer)
 * Diff = calculateHunks(originalContent, currentContent). Accept/Revert chỉ
 * patch 1 trong 2 chuỗi rồi render lại toàn bộ — không phải tự tính offset.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { calculateHunks, Hunk } from './hunkCalculator';
import { DecorationManager, SpacerDecoration } from './decorationManager';
import { NavigationManager } from './navigationManager';

/** Một hunk kèm vị trí hiển thị của nó trong buffer (đã chèn spacer). */
export interface HunkView {
  hunk: Hunk;
  /** Dòng bắt đầu vùng spacer trong buffer hiển thị (0-indexed) */
  spacerStart: number;
  /** Dòng bắt đầu vùng added trong buffer hiển thị (0-indexed) */
  addedStart: number;
}

interface InlineDiffSession {
  /** Đường dẫn đã normalize */
  filePath: string;
  originalContent: string;
  currentContent: string;
  hunks: HunkView[];
  /** Nội dung buffer hiển thị = currentContent + các dòng spacer */
  displayContent: string;
}

type NavInfo = ReturnType<NavigationManager['getNavigationInfo']>;

/** Chuẩn hoá về LF để mọi xử lý nội bộ nhất quán (file repo có thể là CRLF). */
function lf(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Dựng nội dung buffer hiển thị bằng cách chèn dòng trống tại mỗi chỗ code
 * bị xóa, và ghi nhận toạ độ hiển thị của từng hunk.
 */
function buildDisplay(
  originalContent: string,
  currentContent: string
): { displayContent: string; hunks: HunkView[] } {
  const rawHunks = calculateHunks(originalContent, currentContent)
    .slice()
    .sort((a, b) => a.modifiedStart - b.modifiedStart || a.originalStart - b.originalStart);
  const newLines = currentContent.split('\n');

  const displayLines: string[] = [];
  const hunks: HunkView[] = [];
  let cursor = 0;

  for (const h of rawHunks) {
    // Copy các dòng không đổi tới điểm bắt đầu hunk.
    while (cursor < h.modifiedStart && cursor < newLines.length) {
      displayLines.push(newLines[cursor++]!);
    }
    // Chèn dòng trống cho mỗi dòng đã xóa.
    const spacerStart = displayLines.length;
    for (let i = 0; i < h.removedLines.length; i++) {
      displayLines.push('');
    }
    // Copy các dòng được thêm (chính là newLines kế tiếp).
    const addedStart = displayLines.length;
    for (let i = 0; i < h.addedLines.length; i++) {
      displayLines.push(newLines[cursor++] ?? '');
    }
    hunks.push({ hunk: h, spacerStart, addedStart });
  }
  while (cursor < newLines.length) {
    displayLines.push(newLines[cursor++]!);
  }

  return { displayContent: displayLines.join('\n'), hunks };
}

export class InlineDiffRenderer {
  private sessions = new Map<string, InlineDiffSession>();
  private readonly decorations: DecorationManager;
  private navigationManager?: NavigationManager;
  private onNavUpdate?: (navInfo?: NavInfo) => void;

  /** True khi extension đang tự sửa buffer (để bỏ qua onDidChangeTextDocument). */
  private _isApplyingEdit = false;

  constructor(_extensionUri: vscode.Uri) {
    this.decorations = new DecorationManager();
  }

  get isApplyingEdit(): boolean {
    return this._isApplyingEdit;
  }

  setNavigationManager(nav: NavigationManager): void {
    this.navigationManager = nav;
  }

  setNavUpdateCallback(cb: (navInfo?: NavInfo) => void): void {
    this.onNavUpdate = cb;
  }

  // ---- Truy vấn ----

  /** Có ít nhất một file đang review không? */
  hasActiveSessions(): boolean {
    return this.sessions.size > 0;
  }

  /** File này đã có session inline diff chưa? */
  isRendered(filePath: string): boolean {
    return this.sessions.has(this.normalizePath(filePath));
  }

  /** File này còn hunk chưa giải quyết không? */
  hasPending(filePath: string): boolean {
    const s = this.sessions.get(this.normalizePath(filePath));
    return (s?.hunks.length ?? 0) > 0;
  }

  getHunks(filePath: string): Hunk[] {
    const s = this.sessions.get(this.normalizePath(filePath));
    return s ? s.hunks.map((v) => v.hunk) : [];
  }

  getHunkViews(filePath: string): HunkView[] {
    return this.sessions.get(this.normalizePath(filePath))?.hunks ?? [];
  }

  getOriginalContent(filePath: string): string | undefined {
    return this.sessions.get(this.normalizePath(filePath))?.originalContent;
  }

  getCurrentContent(filePath: string): string | undefined {
    return this.sessions.get(this.normalizePath(filePath))?.currentContent;
  }

  // ---- Render ----

  /**
   * Mở file thật và vẽ inline diff lên đó.
   * - Lần đầu (chưa có session): cần truyền `originalContent` + `currentContent`.
   * - Lần sau (đã có session): bỏ qua tham số, chỉ render lại từ session.
   */
  async render(
    filePath: string,
    originalContent?: string,
    currentContent?: string
  ): Promise<void> {
    const norm = this.normalizePath(filePath);
    if (!this.sessions.has(norm)) {
      if (originalContent === undefined || currentContent === undefined) {
        return;
      }
      const original = lf(originalContent);
      const current = lf(currentContent);
      const { displayContent, hunks } = buildDisplay(original, current);
      this.sessions.set(norm, {
        filePath: norm,
        originalContent: original,
        currentContent: current,
        hunks,
        displayContent,
      });
    }

    const session = this.sessions.get(norm)!;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(doc, { preview: false });
    await this.writeBuffer(doc, session.displayContent);
    this.applyDecorations(norm);
  }

  /**
   * Accept một hunk: thay đổi này thành baseline mới (patch originalContent).
   * @returns true nếu file không còn hunk nào.
   */
  async acceptHunk(filePath: string, hunkId: string): Promise<boolean> {
    const norm = this.normalizePath(filePath);
    const session = this.sessions.get(norm);
    if (!session) {
      return true;
    }
    const view = session.hunks.find((v) => v.hunk.id === hunkId);
    if (!view) {
      return session.hunks.length === 0;
    }

    const lines = session.originalContent.split('\n');
    lines.splice(
      view.hunk.originalStart,
      view.hunk.removedLines.length,
      ...view.hunk.addedLines.map((a) => a.text)
    );
    session.originalContent = lines.join('\n');

    return this.rerender(norm);
  }

  /**
   * Revert một hunk: quay nội dung mới về dòng cũ (patch currentContent).
   * @returns true nếu file không còn hunk nào.
   */
  async revertHunk(filePath: string, hunkId: string): Promise<boolean> {
    const norm = this.normalizePath(filePath);
    const session = this.sessions.get(norm);
    if (!session) {
      return true;
    }
    const view = session.hunks.find((v) => v.hunk.id === hunkId);
    if (!view) {
      return session.hunks.length === 0;
    }

    const lines = session.currentContent.split('\n');
    lines.splice(
      view.hunk.modifiedStart,
      view.hunk.addedLines.length,
      ...view.hunk.removedLines.map((r) => r.text)
    );
    session.currentContent = lines.join('\n');

    return this.rerender(norm);
  }

  /** Accept toàn bộ thay đổi trong file. */
  async acceptAll(filePath: string): Promise<void> {
    const norm = this.normalizePath(filePath);
    const session = this.sessions.get(norm);
    if (!session) {
      return;
    }
    session.originalContent = session.currentContent;
    await this.rerender(norm);
  }

  /** Revert toàn bộ file về nội dung gốc. */
  async revertAll(filePath: string): Promise<void> {
    const norm = this.normalizePath(filePath);
    const session = this.sessions.get(norm);
    if (!session) {
      return;
    }
    session.currentContent = session.originalContent;
    await this.rerender(norm);
  }

  /**
   * Kết thúc review một file: gỡ spacer (trả buffer về currentContent),
   * xóa decoration và session.
   */
  async clear(filePath: string): Promise<void> {
    const norm = this.normalizePath(filePath);
    const session = this.sessions.get(norm);

    if (session) {
      try {
        const doc = await vscode.workspace.openTextDocument(
          vscode.Uri.file(session.filePath)
        );
        await this.writeBuffer(doc, session.currentContent);
      } catch {
        // file đã bị xóa hoặc không mở được — bỏ qua
      }
      this.sessions.delete(norm);
    }

    for (const editor of vscode.window.visibleTextEditors) {
      if (this.normalizePath(editor.document.uri.fsPath) === norm) {
        this.decorations.clearEditor(editor);
        // Trả lại số dòng gốc của VS Code.
        editor.options = { lineNumbers: vscode.TextEditorLineNumbersStyle.On };
      }
    }
    this.fireNavUpdate(norm);
  }

  /**
   * Dựng nhãn số dòng cho từng dòng buffer hiển thị: dòng spacer là chuỗi
   * trắng (không có số), các dòng còn lại đánh số tuần tự 1..N theo file thật.
   * Số được pad trái cho canh phải.
   */
  private buildLineLabels(displayContent: string, spacerSet: Set<number>): string[] {
    const total = displayContent.split('\n').length;
    const width = String(Math.max(1, total - spacerSet.size)).length;
    const labels: string[] = [];
    let n = 0;
    for (let i = 0; i < total; i++) {
      if (spacerSet.has(i)) {
        labels.push(' '.repeat(width));
      } else {
        n++;
        labels.push(String(n).padStart(width));
      }
    }
    return labels;
  }

  /** Gỡ inline diff của tất cả file (vd: đổi git branch). */
  async clearAll(): Promise<void> {
    for (const norm of Array.from(this.sessions.keys())) {
      await this.clear(norm);
    }
  }

  /** Dọn dẹp khi deactivate. */
  disposeAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.sessions.has(this.normalizePath(editor.document.uri.fsPath))) {
        editor.options = { lineNumbers: vscode.TextEditorLineNumbersStyle.On };
      }
      this.decorations.clearEditor(editor);
    }
    this.sessions.clear();
    this.decorations.disposeAll();
  }

  /** Áp dụng lại decoration cho file (từ state session hiện tại). */
  applyDecorations(filePath: string): void {
    const norm = this.normalizePath(filePath);
    const session = this.sessions.get(norm);
    if (!session) {
      return;
    }

    const spacers: SpacerDecoration[] = [];
    const addedLines: number[] = [];
    // Dòng spacer không phải dòng thật -> không đánh số.
    const spacerSet = new Set<number>();
    for (const view of session.hunks) {
      view.hunk.removedLines.forEach((r, i) => {
        spacers.push({ line: view.spacerStart + i, text: r.text });
        spacerSet.add(view.spacerStart + i);
      });
      for (let i = 0; i < view.hunk.addedLines.length; i++) {
        addedLines.push(view.addedStart + i);
      }
    }

    // Số dòng tự vẽ: dòng spacer không tính số, các dòng còn lại đánh số
    // tuần tự theo file thật → số dòng không bị lệch.
    const lineLabels = this.buildLineLabels(session.displayContent, spacerSet);

    for (const editor of vscode.window.visibleTextEditors) {
      if (this.normalizePath(editor.document.uri.fsPath) === norm) {
        editor.options = { lineNumbers: vscode.TextEditorLineNumbersStyle.Off };
        this.decorations.applyToEditor(editor, spacers, addedLines, lineLabels);
      }
    }
    this.fireNavUpdate(norm);
  }

  // ---- Private ----

  /** Tính lại hunks từ 2 chuỗi nội dung và vẽ lại buffer. */
  private async rerender(norm: string): Promise<boolean> {
    const session = this.sessions.get(norm);
    if (!session) {
      return true;
    }

    const { displayContent, hunks } = buildDisplay(
      session.originalContent,
      session.currentContent
    );
    session.hunks = hunks;
    session.displayContent = displayContent;

    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(session.filePath)
    );
    const topLine = this.captureTopLine(norm);
    await this.writeBuffer(doc, displayContent);
    this.restoreTopLine(norm, topLine);

    if (hunks.length === 0) {
      // Hết hunk: buffer == currentContent (không spacer). Caller sẽ cleanup.
      return true;
    }
    this.applyDecorations(norm);
    return false;
  }

  /**
   * Thay toàn bộ nội dung document. `content` luôn ở dạng LF; hàm này tự
   * chuyển sang EOL gốc của document để không làm đổi line-ending của file.
   * Có cờ bảo vệ chống vòng lặp sự kiện onDidChangeTextDocument.
   */
  private async writeBuffer(doc: vscode.TextDocument, content: string): Promise<void> {
    const target =
      doc.eol === vscode.EndOfLine.CRLF ? content.replace(/\n/g, '\r\n') : content;
    if (doc.getText() === target) {
      return;
    }
    this._isApplyingEdit = true;
    try {
      const lastLine = Math.max(0, doc.lineCount - 1);
      const fullRange = new vscode.Range(
        0,
        0,
        lastLine,
        doc.lineAt(lastLine).text.length
      );
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, fullRange, target);
      await vscode.workspace.applyEdit(edit);
    } finally {
      this._isApplyingEdit = false;
    }
  }

  private captureTopLine(norm: string): number | undefined {
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.normalizePath(editor.document.uri.fsPath) === norm) {
        return editor.visibleRanges[0]?.start.line;
      }
    }
    return undefined;
  }

  private restoreTopLine(norm: string, topLine: number | undefined): void {
    if (topLine === undefined) {
      return;
    }
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.normalizePath(editor.document.uri.fsPath) === norm) {
        const line = Math.min(topLine, Math.max(0, editor.document.lineCount - 1));
        editor.revealRange(
          new vscode.Range(line, 0, line, 0),
          vscode.TextEditorRevealType.AtTop
        );
      }
    }
  }

  private fireNavUpdate(norm: string): void {
    if (!this.onNavUpdate) {
      return;
    }
    const activeFsPath = vscode.window.activeTextEditor?.document.uri.fsPath;
    const isActive = activeFsPath
      ? this.normalizePath(activeFsPath) === norm
      : false;
    if (isActive) {
      this.onNavUpdate(this.navigationManager?.getNavigationInfo(norm));
    } else if (this.sessions.size === 0) {
      this.onNavUpdate(undefined);
    }
  }

  private normalizePath(p: string): string {
    const fsPath = vscode.Uri.file(path.resolve(p)).fsPath;
    return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
  }
}
