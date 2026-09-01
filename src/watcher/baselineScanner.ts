/**
 * baselineScanner.ts
 *
 * Quét nội dung ban đầu của workspace và ghi baseline vào BaselineStore.
 * Dùng VS Code workspace API để không chặn extension host và giới hạn số file
 * được đọc đồng thời để tránh tăng tải/RAM đột biến.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { isExcludedPathSegment } from './pathExclusions';
import { exceedsLineLimit, exceedsSizeLimitByBytes } from './fileSizeLimit';
import { BaselineStore } from './baselineStore';
import { isTextFile } from './fileTypeRules';

export class BaselineScanner {
  private static readonly DEFAULT_CONCURRENCY = 4;
  private static readonly MAX_CONCURRENCY = 16;

  constructor(private readonly store: BaselineStore) {}

  /**
   * Đệ quy snapshot nội dung tất cả file text trong một thư mục.
   * Chỉ chạy lần đầu khi extension khởi động để tạo baseline.
   */
  async buildInitialSnapshots(folderPath: string): Promise<void> {
    try {
      const folderUri = vscode.Uri.file(folderPath);
      const uris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folderUri, '**/*')
      );
      let nextIndex = 0;
      const workerCount = Math.min(this.readConcurrency(), uris.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < uris.length) {
          const uri = uris[nextIndex++];
          await this.snapshotFile(uri, folderPath);
        }
      });
      await Promise.all(workers);
    } catch {
      // ignore lỗi permission hoặc thư mục không có quyền đọc
    }
  }

  private readConcurrency(): number {
    const configured = vscode.workspace
      .getConfiguration('ai-cli-diff-view')
      .get<number>('baselineScanConcurrency', BaselineScanner.DEFAULT_CONCURRENCY);
    if (!Number.isFinite(configured)) {
      return BaselineScanner.DEFAULT_CONCURRENCY;
    }
    return Math.min(
      BaselineScanner.MAX_CONCURRENCY,
      Math.max(1, Math.floor(configured!))
    );
  }

  private async snapshotFile(uri: vscode.Uri, folderPath: string): Promise<void> {
    const fullPath = path.resolve(uri.fsPath);
    const relativePath = path.relative(path.resolve(folderPath), fullPath);
    const relativeSegments = relativePath.split(path.sep);
    if (relativeSegments.slice(0, -1).some(segment => segment.startsWith('.'))) {
      return;
    }
    if (isExcludedPathSegment(fullPath) || !isTextFile(path.basename(fullPath))) {
      return;
    }
    if (this.store.hasState(fullPath)) {
      return;
    }

    try {
      // Lọc thô theo byte trước, để file vài MB không bị đọc lên chỉ để loại.
      const stat = await vscode.workspace.fs.stat(uri);
      if (exceedsSizeLimitByBytes(stat.size)) {
        if (!this.store.hasState(fullPath)) {
          this.store.markSizeSkipped(fullPath);
        }
        return;
      }
      const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      if (exceedsLineLimit(content)) {
        if (!this.store.hasState(fullPath)) {
          this.store.markSizeSkipped(fullPath);
        }
        return;
      }
      if (!this.store.hasState(fullPath)) {
        this.store.set(fullPath, content);
      }
    } catch {
      // binary, permission error hoặc file đang bị lock — bỏ qua
    }
  }
}
