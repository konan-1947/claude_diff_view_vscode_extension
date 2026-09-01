/**
 * baselineStore.ts
 *
 * Quản lý baseline nội dung các file để WorkspaceWatcher có thể
 * phát hiện external writes so với trạng thái trước đó.
 */

import * as path from 'path';
import * as vscode from 'vscode';

export class BaselineStore {
  /** filePath -> nội dung baseline trước khi external process ghi đè */
  private snapshots = new Map<string, string>();
  /** Các file bị bỏ qua vì vượt giới hạn kích thước hoặc số dòng. */
  private sizeSkipped = new Set<string>();

  private normalizePath(p: string): string {
    const fsPath = vscode.Uri.file(path.resolve(p)).fsPath;
    return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
  }

  get(filePath: string): string | undefined {
    return this.snapshots.get(this.normalizePath(filePath));
  }

  set(filePath: string, content: string): void {
    this.snapshots.set(this.normalizePath(filePath), content);
  }

  has(filePath: string): boolean {
    return this.snapshots.has(this.normalizePath(filePath));
  }

  /** Trả về true nếu file đã có baseline hoặc đã được đánh dấu bỏ qua. */
  hasState(filePath: string): boolean {
    const key = this.normalizePath(filePath);
    return this.snapshots.has(key) || this.sizeSkipped.has(key);
  }

  /** Bỏ theo dõi 1 file vì nó vượt giới hạn kích thước. */
  markSizeSkipped(filePath: string): void {
    const key = this.normalizePath(filePath);
    this.snapshots.delete(key);
    this.sizeSkipped.add(key);
  }

  /**
   * File này từng bị bỏ qua vì kích thước? Dùng để phân biệt "file mới" với
   * "file cũ vừa lọt xuống dưới ngưỡng". Trả về true thì đồng thời xoá cờ.
   */
  consumeSizeSkipped(filePath: string): boolean {
    const key = this.normalizePath(filePath);
    return this.sizeSkipped.delete(key);
  }

  /** Xoá toàn bộ baseline trong RAM. Dùng khi branch switch để rebuild lại từ disk. */
  clear(): void {
    this.snapshots.clear();
    this.sizeSkipped.clear();
  }
}
