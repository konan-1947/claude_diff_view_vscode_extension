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
  private readonly pendingTimers = new Set<NodeJS.Timeout>();
  /** Debounce window is 500ms — keep entries an order of magnitude longer for safety, then drop. */
  private static readonly LAST_PROCESSED_TTL_MS = 60_000;
  /** VS Code save guard window is 2s — same safety multiplier. */
  private static readonly SAVED_BY_VSCODE_TTL_MS = 10_000;
  /**
   * Cờ "đang trong external batch operation" (vd: git checkout đổi branch).
   * Trong window này, mọi external write chỉ cập nhật baseline mà KHÔNG tạo diff.
   * Được set bởi GitBranchWatcher khi phát hiện .git/HEAD đổi.
   */
  private suppressUntil = 0;
  /**
   * Burst-detection: timestamp của các external write gần đây. Khi số write
   * trong BURST_WINDOW_MS vượt BURST_THRESHOLD (vd: git clone, unzip, copy lớn)
   * thì vào "bulk mode" — suppress + short-circuit để không storm diff tab.
   */
  private burstTimestamps: number[] = [];
  private bulkRebuildTimer?: NodeJS.Timeout;
  private static readonly BURST_THRESHOLD = 12;
  private static readonly BURST_WINDOW_MS = 1500;
  private static readonly BULK_SUPPRESS_MS = 4000;
  /** Rebuild baseline sau khi burst lắng (kể từ write cuối). */
  private static readonly BULK_SETTLE_MS = 1500;

  constructor(private readonly diffManager: DiffManager) {
    this.snapshots = new FileSnapshotStore();
  }

  start(): void {
    this.watchVscodeEvents();
    this.watchWorkspaceFolders();
  }

  /**
   * Báo cho watcher biết vừa có external batch operation (vd: git checkout).
   * - Wipe baseline trong RAM để rebuild từ disk hiện tại.
   * - Set suppress window để các fs event đến sau (kể cả từ setTimeout 200ms
   *   đã pending) không tạo diff nữa, chỉ ghi đè baseline.
   */
  notifyExternalBatch(windowMs = 5000): void {
    this.suppressUntil = Date.now() + windowMs;
    this.rebuildBaseline();
    // Bắt thêm các write đến SAU lần rebuild đầu (vd git checkout còn ghi tiếp).
    this.armBaselineRebuild();
  }

  private isSuppressed(): boolean {
    return Date.now() < this.suppressUntil;
  }

  /** Clear + đọc lại toàn bộ baseline từ disk hiện tại. */
  private rebuildBaseline(): void {
    this.snapshots.clear();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      try {
        this.snapshots.buildInitialSnapshots(folder.uri.fsPath);
      } catch {
        // ignore — sẽ tự rebuild dần qua các event sau
      }
    }
  }

  /**
   * Ghi nhận một external write vào cửa sổ burst. Khi vượt ngưỡng → bulk mode.
   */
  private registerWriteForBurst(): void {
    const now = Date.now();
    this.burstTimestamps.push(now);
    const cutoff = now - WorkspaceWatcher.BURST_WINDOW_MS;
    while (this.burstTimestamps.length && this.burstTimestamps[0] < cutoff) {
      this.burstTimestamps.shift();
    }
    if (this.burstTimestamps.length >= WorkspaceWatcher.BURST_THRESHOLD) {
      this.enterBulkMode();
    }
  }

  /** Vào bulk mode: kéo dài suppress + hẹn rebuild baseline sau khi lắng. */
  private enterBulkMode(): void {
    this.suppressUntil = Date.now() + WorkspaceWatcher.BULK_SUPPRESS_MS;
    this.armBaselineRebuild();
  }

  /** (Re)arm timer rebuild baseline; fire sau BULK_SETTLE_MS kể từ lần gọi cuối. */
  private armBaselineRebuild(): void {
    if (this.bulkRebuildTimer) { clearTimeout(this.bulkRebuildTimer); }
    this.bulkRebuildTimer = setTimeout(() => {
      this.bulkRebuildTimer = undefined;
      this.rebuildBaseline();
    }, WorkspaceWatcher.BULK_SETTLE_MS);
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
      this.pruneStaleMapEntries();
    });
    this.disposables.push(d);
  }

  private pruneStaleMapEntries(): void {
    const now = Date.now();
    for (const [key, ts] of this.lastProcessed) {
      if (now - ts > WorkspaceWatcher.LAST_PROCESSED_TTL_MS) {
        this.lastProcessed.delete(key);
      }
    }
    for (const [key, ts] of this.savedFilesByVsCode) {
      if (now - ts > WorkspaceWatcher.SAVED_BY_VSCODE_TTL_MS) {
        this.savedFilesByVsCode.delete(key);
      }
    }
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

    // Burst-detection: nhiều write dồn dập (vd git clone) → bulk mode + bỏ qua
    // per-file work. Baseline sẽ được rebuild khi burst lắng (xem enterBulkMode).
    this.registerWriteForBurst();
    if (this.isSuppressed()) {
      return;
    }

    // 2. Debounce: bỏ qua nếu vừa xử lý file này trong 500ms
    const lastTime = this.lastProcessed.get(absPath) ?? 0;
    if (now - lastTime < 500) { return; }
    this.lastProcessed.set(absPath, now);
    this.pruneStaleMapEntries();

    if (!isTextFile(path.basename(absPath))) { return; }
    if (!this.isInWorkspace(absPath)) { return; }

    // Đọc nội dung mới từ disk sau một chút để đảm bảo write xong
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      // Re-check after timeout in case VS Code onDidSaveTextDocument fired during the 200ms delay
      const lastVsCodeSaveAfterTimeout = this.savedFilesByVsCode.get(absPath) ?? 0;
      if (Date.now() - lastVsCodeSaveAfterTimeout < 2000) {
        return;
      }

      try {
        if (!fs.existsSync(absPath)) { return; }

        const newContentRaw = fs.readFileSync(absPath, 'utf8');

        // Trong window external batch (vd: git checkout): chỉ refresh baseline,
        // không tạo diff. Tránh việc so working tree mới với baseline branch cũ.
        if (this.isSuppressed()) {
          this.snapshots.set(absPath, newContentRaw);
          return;
        }

        const oldContentRaw = this.snapshots.get(absPath);

        const newContent = this.normalizeContent(newContentRaw);
        const oldContent = oldContentRaw !== undefined ? this.normalizeContent(oldContentRaw) : undefined;

        if (oldContent === undefined) {
          this.snapshots.set(absPath, newContentRaw);
          if (newContent.trim()) {
            this.triggerDiff(absPath, '', newContentRaw, false);
          }
          return;
        }

        if (oldContent === newContent) { return; }

        // Trước khi trigger diff mới, cập nhật baseline vào snapshot store của watcher
        // để lần save kế tiếp không bị trigger lại.
        this.snapshots.set(absPath, newContentRaw);

        if (!this.diffManager.hasPendingDiff(absPath)) {
          this.triggerDiff(absPath, oldContentRaw!, newContentRaw, true);
        }
      } catch {
        // file đang bị lock hoặc xóa — bỏ qua
      }
    }, 200);
    this.pendingTimers.add(timer);
  }

  private triggerDiff(filePath: string, originalContent: string, newContent: string, fileExistedBefore: boolean): void {
    this.diffManager.loadSnapshot(filePath, originalContent, fileExistedBefore);
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
    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
    if (this.bulkRebuildTimer) {
      clearTimeout(this.bulkRebuildTimer);
      this.bulkRebuildTimer = undefined;
    }
  }
}

