/**
 * workspaceWatcher.ts
 *
 * Theo dõi file thay đổi trong workspace qua VS Code API và fs.watch.
 * Khi bất kỳ file nào được ghi (bởi Qwen, Claude, hay bất kỳ tool nào),
 * extension sẽ tự động snapshot và hiện inline diff.
 *
 * Flow:
 *   1. onDidSaveTextDocument → sync snapshot để fs.watch không trigger diff sai
 *   2. fs.watch workspace folders → bắt được cả file ghi từ external process
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DiffManager } from '../diff/diffManager';
import { FileSnapshotStore, isTextFile } from './fileSnapshotStore';

export class WorkspaceWatcher {
  private fsWatchers: fs.FSWatcher[] = [];
  private disposables: vscode.Disposable[] = [];
  /** Debounce: thời điểm lần cuối xử lý mỗi file */
  private lastProcessed = new Map<string, number>();
  private readonly snapshots: FileSnapshotStore;

  constructor(private readonly diffManager: DiffManager) {
    this.snapshots = new FileSnapshotStore();
  }

  start(): void {
    this.watchVscodeEvents();
    this.watchWorkspaceFolders();
  }

  /**
   * Sync snapshot khi VS Code save — đảm bảo fs.watch không trigger diff sai.
   * (onDidSaveTextDocument luôn fire trước fs.watch)
   */
  private watchVscodeEvents(): void {
    const d = vscode.workspace.onDidSaveTextDocument((doc) => {
      const filePath = doc.uri.fsPath;
      this.snapshots.set(filePath, doc.getText());
      if (this.diffManager.hasPendingDiff(filePath)) {
        this.diffManager.renderer.applyDecorations(filePath);
      }
    });
    this.disposables.push(d);
  }

  /**
   * Theo dõi file hệ thống của tất cả workspace folders.
   * Bắt được EXTERNAL writes (Qwen terminal, Claude terminal, bất kỳ process nào).
   */
  private watchWorkspaceFolders(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) { return; }

    for (const folder of folders) {
      this.watchFolder(folder.uri.fsPath);
    }

    const d = vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      for (const added of e.added) {
        this.watchFolder(added.uri.fsPath);
      }
    });
    this.disposables.push(d);
  }

  private watchFolder(folderPath: string): void {
    try {
      this.snapshots.buildInitialSnapshots(folderPath);

      const watcher = fs.watch(
        folderPath,
        { recursive: true },
        (_event, filename) => {
          if (!filename) { return; }
          const filePath = path.join(folderPath, filename);
          this.handleExternalWrite(filePath);
        }
      );

      watcher.on('error', (err) => {
        console.error('[claude-diff-view] workspaceWatcher fs.watch error:', err);
      });

      this.fsWatchers.push(watcher);
    } catch (err) {
      console.error('[claude-diff-view] workspaceWatcher watchFolder error:', err);
    }
  }

  private handleExternalWrite(filePath: string): void {
    // Debounce: bỏ qua nếu vừa xử lý file này trong 500ms
    const now = Date.now();
    const lastTime = this.lastProcessed.get(filePath) ?? 0;
    if (now - lastTime < 500) { return; }
    this.lastProcessed.set(filePath, now);

    if (!isTextFile(path.basename(filePath))) { return; }
    if (!this.isInWorkspace(filePath)) { return; }

    // Đọc nội dung mới từ disk sau một chút để đảm bảo write xong
    setTimeout(() => {
      try {
        if (!fs.existsSync(filePath)) { return; }

        const newContent = fs.readFileSync(filePath, 'utf8');
        const oldContent = this.snapshots.get(filePath);

        if (oldContent === undefined) {
          this.snapshots.set(filePath, '');
          if (newContent.trim()) {
            this.triggerDiff(filePath, '', newContent);
          }
          return;
        }

        if (oldContent === newContent) { return; }

        this.snapshots.set(filePath, newContent);

        if (!this.diffManager.hasPendingDiff(filePath)) {
          this.triggerDiff(filePath, oldContent, newContent);
        }
      } catch {
        // file đang bị lock hoặc xóa — bỏ qua
      }
    }, 200);
  }

  private triggerDiff(filePath: string, originalContent: string, newContent: string): void {
    this.diffManager.loadSnapshot(filePath, originalContent);
    this.diffManager.openDiff(filePath).catch((err: unknown) => {
      console.error('[claude-diff-view] workspaceWatcher openDiff failed:', err);
    });
  }

  private isInWorkspace(filePath: string): boolean {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) { return false; }
    return folders.some(f => filePath.startsWith(f.uri.fsPath));
  }

  /** Cập nhật snapshot khi người dùng tự sửa file (để baseline luôn đúng) */
  updateSnapshot(filePath: string, content: string): void {
    this.snapshots.set(filePath, content);
  }

  dispose(): void {
    for (const w of this.fsWatchers) { w.close(); }
    this.fsWatchers = [];
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}
