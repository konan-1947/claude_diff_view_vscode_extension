/**
 * workspaceWatcher.ts
 *
 * Theo dõi file thay đổi trong workspace qua VS Code API và fs.watch.
 * Khi bất kỳ file nào được ghi (bởi Claude, hay bất kỳ tool nào),
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
import { isExcludedPathSegment } from './pathExclusions';

export class WorkspaceWatcher {
  private disposables: vscode.Disposable[] = [];
  /** Debounce: thời điểm lần cuối xử lý mỗi file */
  private lastProcessed = new Map<string, number>();
  /** Lưu thời điểm VS Code vừa Save file (để bỏ qua fs.watch trigger từ chính VS Code) */
  private savedFilesByVsCode = new Map<string, number>();
  private readonly snapshots: FileSnapshotStore;

  constructor(private readonly diffManager: DiffManager) {
    this.snapshots = new FileSnapshotStore();
  }

  start(): void {
    this.watchVscodeEvents();
    this.watchWorkspaceFolders();
  }

  private normalizePath(p: string): string {
    const fsPath = vscode.Uri.file(path.resolve(p)).fsPath;
    return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
  }

  private normalizeContent(content: string): string {
    return content.trim().replace(/\r\n/g, '\n');
  }

  /**
   * Sync snapshot khi VS Code save — đảm bảo fs.watch không trigger diff sai.
   * (onDidSaveTextDocument luôn fire trước fs.watch)
   */
  private watchVscodeEvents(): void {
    const d = vscode.workspace.onDidSaveTextDocument((doc) => {
      const filePath = this.normalizePath(doc.uri.fsPath);
      this.snapshots.set(filePath, doc.getText());
      this.savedFilesByVsCode.set(filePath, Date.now());

      if (this.diffManager.hasPendingDiff(filePath)) {
        this.diffManager.renderer.applyDecorations(filePath);
      }
    });
    this.disposables.push(d);
  }

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

    // Sử dụng FileSystemWatcher native của VS Code thay vì fs.watch để tránh kẹt event loop
    // khi tạo mới project có hàng ngàn file (VD: node_modules trong Next.js)
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    const handleUri = (uri: vscode.Uri) => {
      this.handleExternalWrite(uri.fsPath);
    };
    
    fileWatcher.onDidChange(handleUri);
    fileWatcher.onDidCreate(handleUri);
    
    this.disposables.push(fileWatcher);
  }

  private watchFolder(folderPath: string): void {
    try {
      this.snapshots.buildInitialSnapshots(folderPath);
    } catch (err) {
      console.error('[ai-cli-diff-view] workspaceWatcher buildInitialSnapshots error:', err);
    }
  }

  private handleExternalWrite(filePath: string): void {
    const absPath = this.normalizePath(filePath);

    // Bỏ qua dependency / build output / tooling (dotnet bin/obj, node_modules, …)
    if (isExcludedPathSegment(absPath)) {
      return;
    }

    // 1. Kiểm tra xem file này vừa được VS Code Save hay không
    const lastVsCodeSave = this.savedFilesByVsCode.get(absPath) ?? 0;
    const now = Date.now();
    if (now - lastVsCodeSave < 2000) {
      // Bỏ qua vì đây là viết từ chính VS Code editor
      return;
    }

    // 2. Debounce: bỏ qua nếu vừa xử lý file này trong 500ms
    const lastTime = this.lastProcessed.get(absPath) ?? 0;
    if (now - lastTime < 500) { return; }
    this.lastProcessed.set(absPath, now);

    if (!isTextFile(path.basename(absPath))) { return; }
    if (!this.isInWorkspace(absPath)) { return; }

    // Đọc nội dung mới từ disk sau một chút để đảm bảo write xong
    setTimeout(() => {
      // Re-check after timeout in case VS Code onDidSaveTextDocument fired during the 200ms delay
      const lastVsCodeSaveAfterTimeout = this.savedFilesByVsCode.get(absPath) ?? 0;
      if (Date.now() - lastVsCodeSaveAfterTimeout < 2000) {
        return;
      }

      try {
        if (!fs.existsSync(absPath)) { return; }

        const newContentRaw = fs.readFileSync(absPath, 'utf8');
        const oldContentRaw = this.snapshots.get(absPath);

        const newContent = this.normalizeContent(newContentRaw);
        const oldContent = oldContentRaw !== undefined ? this.normalizeContent(oldContentRaw) : undefined;

        if (oldContent === undefined) {
          this.snapshots.set(absPath, newContentRaw);
          if (newContent.trim()) {
            this.triggerDiff(absPath, '', newContentRaw);
          }
          return;
        }

        if (oldContent === newContent) { return; }

        // Trước khi trigger diff mới, cập nhật baseline vào snapshot store của watcher
        // để lần save kế tiếp không bị trigger lại.
        this.snapshots.set(absPath, newContentRaw);

        if (!this.diffManager.hasPendingDiff(absPath)) {
          this.triggerDiff(absPath, oldContentRaw!, newContentRaw);
        }
      } catch {
        // file đang bị lock hoặc xóa — bỏ qua
      }
    }, 200);
  }

  private triggerDiff(filePath: string, originalContent: string, newContent: string): void {
    this.diffManager.loadSnapshot(filePath, originalContent);
    this.diffManager.openDiff(filePath).catch((err: unknown) => {
      console.error('[ai-cli-diff-view] workspaceWatcher openDiff failed:', err);
    });
  }

  private isInWorkspace(filePath: string): boolean {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) { return false; }
    const normalizedPath = this.normalizePath(filePath);
    return folders.some(f => normalizedPath.startsWith(this.normalizePath(f.uri.fsPath)));
  }

  /** Cập nhật snapshot khi người dùng tự sửa file (để baseline luôn đúng) */
  updateSnapshot(filePath: string, content: string): void {
    this.snapshots.set(this.normalizePath(filePath), content);
  }

  dispose(): void {
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}

