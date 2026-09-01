/**
 * baselineScanner.ts
 *
 * Quét nội dung ban đầu của workspace và ghi baseline vào BaselineStore.
 * Đây vẫn là implementation đồng bộ hiện tại; bước async/worker-pool sẽ
 * được triển khai riêng sau khi trách nhiệm đã được tách rõ.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { isExcludedPathSegment } from './pathExclusions';
import { exceedsLineLimit, exceedsSizeLimitByBytes } from './fileSizeLimit';
import { BaselineStore } from './baselineStore';
import { isTextFile } from './fileTypeRules';

export class BaselineScanner {
  constructor(private readonly store: BaselineStore) {}

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
      if (entry.isDirectory() && entry.name.startsWith('.')) {
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
          // Lọc thô theo byte trước, để file vài MB không bị đọc lên chỉ để loại.
          if (exceedsSizeLimitByBytes(fs.statSync(fullPath).size)) {
            this.store.markSizeSkipped(fullPath);
            continue;
          }
          const content = fs.readFileSync(fullPath, 'utf8');
          if (exceedsLineLimit(content)) {
            this.store.markSizeSkipped(fullPath);
            continue;
          }
          this.store.set(fullPath, content);
        } catch {
          // binary hoặc file đang bị lock — bỏ qua
        }
      }
    }
  }
}
