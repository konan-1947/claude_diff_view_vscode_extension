/**
 * fileSnapshotStore.ts
 *
 * Quản lý snapshot nội dung các file trong workspace để
 * WorkspaceWatcher có thể phát hiện external writes so với baseline.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { isExcludedPathSegment } from './pathExclusions';

export class FileSnapshotStore {
  /** filePath -> nội dung baseline trước khi external process ghi đè */
  private snapshots = new Map<string, string>();

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

  /**
   * Đệ quy snapshot nội dung tất cả file text trong một thư mục.
   * Chỉ chạy lần đầu khi extension khởi động để tạo baseline.
   */
  buildInitialSnapshots(folderPath: string): void {
    try {
      this.snapshotDir(folderPath, 0);
    } catch {
      // ignore lỗi permission hoặc thư mục không có quyền đọc
    }
  }

  private snapshotDir(dirPath: string, depth: number): void {
    if (depth > 5) { return; } // giới hạn độ sâu để tránh tràn stack
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const fullPath = path.resolve(dirPath, entry.name);
      if (isExcludedPathSegment(fullPath)) {
        continue;
      }
      if (entry.isDirectory()) {
        this.snapshotDir(fullPath, depth + 1);
      } else if (entry.isFile() && isTextFile(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          this.snapshots.set(this.normalizePath(fullPath), content);
        } catch {
          // binary hoặc file đang bị lock — bỏ qua
        }
      }
    }
  }
}


/**
 * Kiểm tra xem file có phải là text file không dựa trên extension.
 */
export function isTextFile(filename: string): boolean {
  const textExts = new Set([
    '.ts', '.js', '.tsx', '.jsx', '.json', '.html', '.css', '.scss',
    '.md', '.txt', '.yaml', '.yml', '.toml', '.xml', '.py', '.go',
    '.rs', '.java', '.c', '.cpp', '.h', '.cs', '.rb', '.php', '.sh',
    '.bat', '.ps1', '.vue', '.svelte', '.astro',
  ]);
  const ext = path.extname(filename).toLowerCase();
  return textExts.has(ext);
}
