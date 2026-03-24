/**
 * diffManager.ts (đã refactor)
 *
 * Quản lý snapshot nội dung file trước khi Claude sửa.
 * Delegate việc render sang InlineDiffRenderer.
 * Không còn dùng temp file hay vscode.diff.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { InlineDiffRenderer } from './inlineDiffRenderer';

const STATE_KEY = 'claude-diff.snapshots';

/** Normalize về cùng định dạng mà vscode.Uri.fsPath sử dụng. */
function normalizePath(filePath: string): string {
  return vscode.Uri.file(path.resolve(filePath)).fsPath;
}

export class DiffManager {
  private _onDidChangeDiffs = new vscode.EventEmitter<void>();
  public readonly onDidChangeDiffs = this._onDidChangeDiffs.event;

  /** Lưu nội dung gốc TRƯỚC khi sửa (để tính diff) */
  private snapshots: Map<string, string> = new Map();

  public readonly renderer: InlineDiffRenderer;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.renderer = new InlineDiffRenderer(context.extensionUri);
    this.restoreState();
  }

  // ---- State persistence (chỉ lưu đường dẫn để mở lại sau khi restart VS Code) ----

  private restoreState(): void {
    const saved = this.context.workspaceState.get<Record<string, string>>(STATE_KEY, {});
    for (const [absPath, originalContent] of Object.entries(saved)) {
      if (!fs.existsSync(absPath)) { continue; }
      this.snapshots.set(absPath, originalContent);
    }
  }

  private persistState(): void {
    const obj: Record<string, string> = {};
    for (const [absPath, content] of this.snapshots.entries()) {
      obj[absPath] = content;
    }
    this.context.workspaceState.update(STATE_KEY, obj);
  }

  // ---- Public API ----

  /**
   * Gọi TRƯỚC khi Claude sửa file.
   * Đọc nội dung hiện tại và lưu làm snapshot "before".
   */
  async snapshotBefore(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    if (this.snapshots.has(absPath)) {
      // Đã có snapshot — giữ bản gốc nhất, không ghi đè
      return;
    }
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      this.snapshots.set(absPath, content);
    } catch {
      // File chưa tồn tại (Claude tạo file mới)
      this.snapshots.set(absPath, '');
    }
    this.persistState();
  }

  /**
   * Gọi SAU khi Claude đã sửa xong file.
   * Mở editor và render inline diff.
   */
  async openDiff(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (snapshot === undefined) { return; }

    // Đọc nội dung mới từ disk
    let modifiedContent: string;
    try {
      modifiedContent = fs.readFileSync(absPath, 'utf8');
    } catch {
      return;
    }

    // Mở file trong editor thường
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
    await vscode.window.showTextDocument(doc, { preview: false });

    // Render inline diff
    this.renderer.show(absPath, snapshot, modifiedContent);
    this._onDidChangeDiffs.fire();
  }

  /**
   * Inject snapshot từ bên ngoài (dùng bởi HookWatcher hoặc WorkspaceWatcher).
   */
  loadSnapshot(filePath: string, content: string): void {
    const absPath = normalizePath(filePath);
    if (!this.snapshots.has(absPath)) {
      this.snapshots.set(absPath, content);
      this.persistState();
      this._onDidChangeDiffs.fire();
    }
  }

  async acceptHunk(filePath: string, hunkId: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const isDone = this.renderer.acceptHunk(absPath, hunkId);
    if (isDone) {
      this.snapshots.delete(absPath);
      this.persistState();
    }
    this._onDidChangeDiffs.fire();
  }

  async revertHunk(filePath: string, hunkId: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const isDone = await this.renderer.revertHunk(absPath, hunkId);
    if (isDone) {
      this.snapshots.delete(absPath);
      this.persistState();
    }
    this._onDidChangeDiffs.fire();
  }

  /**
   * Chấp nhận toàn bộ thay đổi trong file — xóa snapshot.
   */
  async accept(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    this.renderer.acceptAll(absPath);
    this.snapshots.delete(absPath);
    this.persistState();
    vscode.window.showInformationMessage(`Accepted: ${path.basename(absPath)}`);
    this._onDidChangeDiffs.fire();
  }

  /**
   * Hoàn tác toàn bộ thay đổi trong file về nội dung gốc.
   */
  async revert(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (snapshot === undefined) {
      vscode.window.showWarningMessage(`No snapshot found for ${path.basename(absPath)}`);
      return;
    }

    await this.renderer.revertAll(absPath);
    this.snapshots.delete(absPath);
    this.persistState();
    vscode.window.showInformationMessage(`Reverted: ${path.basename(absPath)}`);
    this._onDidChangeDiffs.fire();
  }

  /**
   * Xóa snapshot của một file (sau khi accept/revert từng hunk xong hết).
   * Dùng khi tất cả hunks đã được xử lý thủ công.
   */
  forgetFile(filePath: string): void {
    this.cleanup(normalizePath(filePath));
  }

  /**
   * Kiểm tra xem file có đang có pending diff không.
   */
  hasPendingDiff(filePath: string): boolean {
    return this.snapshots.has(normalizePath(filePath));
  }

  /**
   * Lấy snapshot gốc (dùng để so sánh sau khi edit).
   */
  getSnapshot(filePath: string): string | undefined {
    return this.snapshots.get(normalizePath(filePath));
  }

  /**
   * Dọn dẹp tất cả pending diffs khi deactivate.
   */
  disposeAll(): void {
    this.renderer.disposeAll();
    this.snapshots.clear();
  }

  private cleanup(absPath: string): void {
    this.snapshots.delete(absPath);
    this.persistState();
  }
}
