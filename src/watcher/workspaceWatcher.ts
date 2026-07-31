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
import { BurstMeterConfig, WriteBurstMeter } from './writeBurstMeter';

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
  private readonly burstMeter = new WriteBurstMeter();
  /** Thời gian giữ file vượt ngưỡng burst chờ xác nhận git trước khi mở diff bình thường. */
  private holdMs = 2000;
  /** File vượt ngưỡng burst, đang chờ xác nhận git (xem resolveOrHold/scheduleHoldResolve). */
  private readonly heldWrites = new Map<string, { originalContent: string; newContent: string; fileExistedBefore: boolean }>();
  private holdResolveTimer: NodeJS.Timeout | undefined;

  constructor(private readonly diffManager: DiffManager) {
    this.snapshots = new FileSnapshotStore();
  }

  start(): void {
    this.watchVscodeEvents();
    this.watchWorkspaceFolders();
    this.applyBurstConfig();
    const d = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ai-cli-diff-view.burstDetectionEnabled') ||
          e.affectsConfiguration('ai-cli-diff-view.burstDetectionWindowMs') ||
          e.affectsConfiguration('ai-cli-diff-view.burstDetectionThreshold') ||
          e.affectsConfiguration('ai-cli-diff-view.burstDetectionHoldMs')) {
        this.applyBurstConfig();
      }
    });
    this.disposables.push(d);
  }

  private applyBurstConfig(): void {
    this.burstMeter.updateConfig(this.loadBurstMeterConfig());
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    const holdMs = config.get<number>('burstDetectionHoldMs', 2000);
    this.holdMs = Number.isFinite(holdMs) ? Math.min(10000, Math.max(500, holdMs)) : 2000;
  }

  private loadBurstMeterConfig(): BurstMeterConfig {
    const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
    const windowMs = config.get<number>('burstDetectionWindowMs', 300);
    const threshold = config.get<number>('burstDetectionThreshold', 8);
    return {
      enabled: config.get<boolean>('burstDetectionEnabled', true),
      windowMs: Number.isFinite(windowMs) ? Math.min(5000, Math.max(50, windowMs)) : 300,
      threshold: Number.isFinite(threshold) ? Math.min(500, Math.max(2, threshold)) : 8,
    };
  }

  /**
   * Báo cho watcher biết vừa có external batch operation (vd: git checkout).
   * - Wipe baseline trong RAM để rebuild từ disk hiện tại.
   * - Set suppress window để các fs event đến sau (kể cả từ setTimeout 200ms
   *   đã pending) không tạo diff nữa, chỉ ghi đè baseline.
   * - Xác nhận git thật đã xảy ra: bỏ toàn bộ file đang bị giữ (heldWrites) —
   *   không mở diff cho chúng nữa, đúng như baseline vừa rebuild.
   */
  notifyExternalBatch(windowMs = 5000): void {
    this.suppressUntil = Date.now() + windowMs;
    this.snapshots.clear();
    if (this.holdResolveTimer) {
      clearTimeout(this.holdResolveTimer);
      this.holdResolveTimer = undefined;
    }
    this.heldWrites.clear();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      try {
        this.snapshots.buildInitialSnapshots(folder.uri.fsPath);
      } catch {
        // ignore — sẽ tự rebuild dần qua các event sau
      }
    }
  }

  private isSuppressed(): boolean {
    return Date.now() < this.suppressUntil;
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

    // Đo tốc độ ghi TRƯỚC mọi filter bên dưới — xem writeBurstMeter.ts. Capture
    // quyết định NGAY tại thời điểm raw event tới (chính xác nhất so với cửa
    // sổ trượt), mang theo qua debounce/setTimeout bên dưới tới lúc quyết định
    // triggerDiff — không gọi record() lần 2 để tránh đếm trùng.
    const burstHold = this.burstMeter.record(absPath);

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
            this.resolveOrHold(absPath, '', newContentRaw, false, burstHold);
          }
          return;
        }

        if (oldContent === newContent) { return; }

        // Trước khi trigger diff mới, cập nhật baseline vào snapshot store của watcher
        // để lần save kế tiếp không bị trigger lại.
        this.snapshots.set(absPath, newContentRaw);

        if (!this.diffManager.hasPendingDiff(absPath)) {
          this.resolveOrHold(absPath, oldContentRaw!, newContentRaw, true, burstHold);
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

  /**
   * File dưới ngưỡng burst: mở diff ngay như trước. File vượt ngưỡng: giữ lại
   * chờ `holdMs` — nếu trong lúc chờ git branch được xác nhận đổi thật
   * (`notifyExternalBatch()` chạy), file bị bỏ âm thầm; nếu không, mở diff
   * bình thường sau khi hết giờ chờ, như chưa từng bị giữ.
   */
  private resolveOrHold(
    filePath: string,
    originalContent: string,
    newContent: string,
    fileExistedBefore: boolean,
    hold: boolean
  ): void {
    if (!hold) {
      this.triggerDiff(filePath, originalContent, newContent, fileExistedBefore);
      return;
    }
    this.heldWrites.set(filePath, { originalContent, newContent, fileExistedBefore });
    this.scheduleHoldResolve();
  }

  /** Debounce dùng chung cho cả cụm burst: mỗi file mới vào hàng chờ sẽ reset lại. */
  private scheduleHoldResolve(): void {
    if (this.holdResolveTimer) {
      clearTimeout(this.holdResolveTimer);
    }
    this.holdResolveTimer = setTimeout(() => {
      this.holdResolveTimer = undefined;
      const entries = Array.from(this.heldWrites.entries());
      this.heldWrites.clear();
      for (const [filePath, w] of entries) {
        this.triggerDiff(filePath, w.originalContent, w.newContent, w.fileExistedBefore);
      }
    }, this.holdMs);
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
    if (this.holdResolveTimer) {
      clearTimeout(this.holdResolveTimer);
      this.holdResolveTimer = undefined;
    }
    this.heldWrites.clear();
  }
}

