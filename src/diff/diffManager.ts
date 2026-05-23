/**
 * diffManager.ts
 *
 * Quản lý snapshot nội dung file TRƯỚC khi AI sửa, và điều phối việc
 * vẽ inline diff lên file thật qua `InlineDiffRenderer`.
 *
 * Không còn dùng Diff Editor side-by-side (`vscode.diff`) hay scheme
 * `ai-cli-diff` — toàn bộ diff được vẽ thẳng trên editor của file thật.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { InlineDiffRenderer } from './inlineDiffRenderer';
import { calculateHunks } from './hunkCalculator';
import { SnapshotStore, SnapshotState } from './snapshotStore';

/** Normalize về cùng định dạng mà vscode.Uri.fsPath sử dụng. */
function normalizePath(filePath: string): string {
  const fsPath = vscode.Uri.file(path.resolve(filePath)).fsPath;
  return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
}

export class DiffManager {
  private _onDidChangeDiffs = new vscode.EventEmitter<void>();
  public readonly onDidChangeDiffs = this._onDidChangeDiffs.event;

  /** Lưu nội dung gốc TRƯỚC khi sửa (để tính diff) */
  private snapshots: Map<string, SnapshotState> = new Map();
  private readonly store: SnapshotStore;

  public readonly renderer: InlineDiffRenderer;

  constructor(context: vscode.ExtensionContext) {
    this.renderer = new InlineDiffRenderer(context.extensionUri);
    this.store = new SnapshotStore(context.workspaceState);
    this.snapshots = this.store.load();
  }

  // ---- Public API ----

  /**
   * Gọi TRƯỚC khi AI sửa file. Đọc nội dung hiện tại làm snapshot "before".
   */
  async snapshotBefore(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    if (this.snapshots.has(absPath)) {
      return;
    }
    const fileExistedBefore = fs.existsSync(absPath);
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      this.snapshots.set(absPath, { content, fileExistedBefore });
    } catch {
      // File chưa tồn tại (AI tạo file mới)
      this.snapshots.set(absPath, { content: '', fileExistedBefore: false });
    }
    void this.store.save(this.snapshots);
  }

  /**
   * Gọi SAU khi AI đã sửa xong file. Mở file và vẽ inline diff.
   */
  async openDiff(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (snapshot === undefined) {
      return;
    }

    // Đã có session đang review — chỉ cần render lại (idempotent, tự lành
    // khi tab bị đóng rồi mở lại).
    if (this.renderer.isRendered(absPath)) {
      await this.renderer.render(absPath);
      this._onDidChangeDiffs.fire();
      return;
    }

    let modifiedContent: string;
    try {
      modifiedContent = fs.readFileSync(absPath, 'utf8');
    } catch {
      return;
    }

    // Không có khác biệt thực sự — bỏ snapshot, không tạo trạng thái pending sai.
    // Chuẩn hoá LF để không bị lệch khi snapshot/đĩa khác line-ending.
    const hunks = calculateHunks(
      snapshot.content.replace(/\r\n/g, '\n'),
      modifiedContent.replace(/\r\n/g, '\n')
    );
    if (hunks.length === 0) {
      this.snapshots.delete(absPath);
      void this.store.save(this.snapshots);
      await this.renderer.clear(absPath);
      this._onDidChangeDiffs.fire();
      return;
    }

    await this.renderer.render(absPath, snapshot.content, modifiedContent);
    this._onDidChangeDiffs.fire();
  }

  /**
   * Inject snapshot từ bên ngoài (dùng bởi HookWatcher / WorkspaceWatcher).
   */
  loadSnapshot(filePath: string, content: string, fileExistedBefore = true): void {
    const absPath = normalizePath(filePath);
    if (!this.snapshots.has(absPath)) {
      this.snapshots.set(absPath, { content, fileExistedBefore });
      void this.store.save(this.snapshots);
      this._onDidChangeDiffs.fire();
    }
  }

  async acceptHunk(filePath: string, hunkId: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const done = await this.renderer.acceptHunk(absPath, hunkId);

    // Đồng bộ snapshot đã persist với baseline mới (để restart không hiện
    // lại hunk đã accept).
    const patchedOriginal = this.renderer.getOriginalContent(absPath);
    const snap = this.snapshots.get(absPath);
    if (patchedOriginal !== undefined && snap) {
      this.snapshots.set(absPath, { ...snap, content: patchedOriginal });
      void this.store.save(this.snapshots);
    }

    if (done) {
      await this.cleanup(absPath);
    } else {
      // Lưu ngay sau mỗi hunk để đĩa luôn đồng bộ với buffer — tránh tích tụ
      // trạng thái dirty gây xung đột "file is newer" ở lần save sau.
      await this.saveReviewedFile(absPath);
    }
    this._onDidChangeDiffs.fire();
  }

  async revertHunk(filePath: string, hunkId: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const done = await this.renderer.revertHunk(absPath, hunkId);

    const shouldDelete = await this.shouldDeleteRejectedNewFile(absPath);
    if (shouldDelete) {
      await this.deleteRejectedNewFile(absPath);
      await this.cleanup(absPath);
    } else if (done) {
      await this.cleanup(absPath);
    } else {
      // Lưu ngay sau mỗi hunk để đĩa luôn đồng bộ với buffer — tránh tích tụ
      // trạng thái dirty gây xung đột "file is newer" ở lần save sau.
      await this.saveReviewedFile(absPath);
    }
    this._onDidChangeDiffs.fire();
  }

  /**
   * Chấp nhận toàn bộ thay đổi trong file.
   */
  async accept(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);

    // Lưu thứ tự pending trước cleanup để biết "file tiếp theo" là gì.
    const pendingBefore = this.getPendingFiles();
    const currentIdx = pendingBefore.findIndex((p) => normalizePath(p) === absPath);
    const hasNext = pendingBefore.length > 1 && currentIdx !== -1;
    const nextTarget = hasNext
      ? pendingBefore[(currentIdx + 1) % pendingBefore.length]!
      : undefined;

    await this.renderer.acceptAll(absPath);
    await this.cleanup(absPath);

    if (nextTarget) {
      await this.openDiff(nextTarget);
    }
    this._onDidChangeDiffs.fire();
  }

  /**
   * Hoàn tác toàn bộ thay đổi trong file về nội dung gốc.
   */
  async revert(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (snapshot === undefined) {
      return;
    }

    const shouldDelete = !snapshot.fileExistedBefore;
    await this.renderer.revertAll(absPath);
    if (shouldDelete) {
      await this.deleteRejectedNewFile(absPath);
    }
    await this.cleanup(absPath);
    this._onDidChangeDiffs.fire();
  }

  /**
   * Chấp nhận toàn bộ thay đổi của tất cả file đang pending.
   */
  async acceptAllPending(): Promise<number> {
    const pendingFiles = this.getPendingFiles();
    for (const filePath of pendingFiles) {
      const absPath = normalizePath(filePath);
      await this.renderer.acceptAll(absPath);
      await this.cleanup(absPath);
    }
    this._onDidChangeDiffs.fire();
    return pendingFiles.length;
  }

  /**
   * Xóa snapshot của một file (sau khi đã xử lý xong hết hunks).
   */
  forgetFile(filePath: string): void {
    this.cleanup(normalizePath(filePath)).catch((err) => console.error(err));
  }

  /** File có đang có pending diff không. */
  hasPendingDiff(filePath: string): boolean {
    return this.snapshots.has(normalizePath(filePath));
  }

  /** Danh sách tất cả file đang có pending diff. */
  getPendingFiles(): string[] {
    return Array.from(this.snapshots.keys());
  }

  /** Lấy snapshot gốc của một file. */
  getSnapshot(filePath: string): string | undefined {
    return this.snapshots.get(normalizePath(filePath))?.content;
  }

  /** Dọn dẹp tất cả khi deactivate. */
  disposeAll(): void {
    this.renderer.disposeAll();
    this.snapshots.clear();
  }

  /**
   * Xoá toàn bộ pending diffs khi không còn hợp lệ (vd: đổi git branch).
   * Gỡ inline diff khỏi mọi file và xoá snapshot đã persist.
   */
  async clearAll(): Promise<void> {
    await this.renderer.clearAll();
    this.snapshots.clear();
    await this.store.clear();
  }

  // ---- Private ----

  private async cleanup(absPath: string): Promise<void> {
    this.snapshots.delete(absPath);
    void this.store.save(this.snapshots);
    await this.renderer.clear(absPath);
    await this.saveReviewedFile(absPath);
  }

  /**
   * Sau khi review xong một file (accept/revert), lưu file để thay đổi được
   * ghi xuống đĩa và xoá trạng thái "dirty". Bỏ qua nếu file đã bị xóa
   * (trường hợp reject file mới).
   */
  private async saveReviewedFile(absPath: string): Promise<void> {
    if (!fs.existsSync(absPath)) {
      return;
    }
    const doc = vscode.workspace.textDocuments.find(
      (d) => normalizePath(d.uri.fsPath) === absPath
    );
    if (doc && doc.isDirty) {
      try {
        await doc.save();
      } catch {
        // ignore
      }
    }
  }

  private async shouldDeleteRejectedNewFile(absPath: string): Promise<boolean> {
    const snapshot = this.snapshots.get(absPath);
    if (!snapshot || snapshot.fileExistedBefore) {
      return false;
    }

    const doc = vscode.workspace.textDocuments.find(
      (d) => normalizePath(d.uri.fsPath) === absPath
    );
    if (doc) {
      return doc.getText().length === 0;
    }

    try {
      return fs.readFileSync(absPath, 'utf8').length === 0;
    } catch {
      return false;
    }
  }

  private async deleteRejectedNewFile(absPath: string): Promise<void> {
    const doc = vscode.workspace.textDocuments.find(
      (d) => normalizePath(d.uri.fsPath) === absPath
    );
    if (doc?.isDirty) {
      await doc.save();
    }

    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(absPath));
    } catch (err) {
      if (fs.existsSync(absPath)) {
        throw err;
      }
    }
  }
}
