/**
 * workspaceWatcher.ts
 *
 * Theo dõi file thay đổi trong workspace qua VS Code API thay vì hooks.
 * Khi bất kỳ file nào được ghi (bởi Qwen, Claude, hay bất kỳ tool nào),
 * extension sẽ tự động snapshot và hiện inline diff.
 *
 * Flow:
 *   1. onWillSaveTextDocument → snapshot nội dung TRƯỚC khi lưu
 *      (chỉ bắt được khi lưu qua VS Code)
 *   2. onDidSaveTextDocument → so sánh với snapshot → hiện diff
 *   3. fs.watch workspace folders → bắt được cả file ghi từ external process (qwen terminal)
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DiffManager } from '../diff/diffManager';

export class WorkspaceWatcher {
  private fsWatchers: fs.FSWatcher[] = [];
  private disposables: vscode.Disposable[] = [];
  /** filePath -> snapshot content trước khi file bị external process ghi đè */
  private externalSnapshots = new Map<string, string>();
  /** filePath -> thời điểm lần cuối event xử lý, tránh debounce double-trigger */
  private lastProcessed = new Map<string, number>();

  constructor(private readonly diffManager: DiffManager) {}

  start(): void {
    this.watchVscodeEvents();
    this.watchWorkspaceFolders();
  }

  /**
   * Bắt file thay đổi khi lưu qua VS Code (Ctrl+S hoặc auto-save).
   * Dùng khi extension chạy session qua Ctrl+Shift+A — ClaudeRunner/QwenRunner
   * đã có logic snapshot riêng nên watcher này là safety net.
   */
  private watchVscodeEvents(): void {
    // Không cần xử lý thêm ở đây — claudeRunner/qwenRunner đã handle
    // event onDidSaveTextDocument chỉ để re-apply decorations nếu cần
    const d = vscode.workspace.onDidSaveTextDocument((doc) => {
      const filePath = doc.uri.fsPath;
      // Sync snapshot ngay khi VS Code save — đảm bảo fs.watch không trigger diff sai
      // (onDidSaveTextDocument luôn fire trước fs.watch, nên snapshot sẽ đúng khi fs.watch chạy)
      this.externalSnapshots.set(filePath, doc.getText());
      if (this.diffManager.hasPendingDiff(filePath)) {
        this.diffManager.renderer.applyDecorations(filePath);
      }
    });
    this.disposables.push(d);
  }

  /**
   * Theo dõi file hệ thống của tất cả workspace folders.
   * Bắt được EXTERNAL writes (Qwen terminal, Claude terminal, bất kỳ process nào).
   *
   * Strategy:
   *   - Khi phát hiện file bị modify từ external process:
   *     1. Lấy snapshot đã lưu trước đó (hoặc nội dung hiện tại nếu chưa có)
   *     2. Đọc nội dung mới từ disk
   *     3. Nếu có sự khác biệt → hiện inline diff
   */
  private watchWorkspaceFolders(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) { return; }

    for (const folder of folders) {
      this.watchFolder(folder.uri.fsPath);
    }

    // Theo dõi nếu workspace folders thay đổi
    const d = vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      for (const added of e.added) {
        this.watchFolder(added.uri.fsPath);
      }
    });
    this.disposables.push(d);
  }

  private watchFolder(folderPath: string): void {
    try {
      // Pre-snapshot tất cả file text hiện có trong workspace
      this.buildInitialSnapshots(folderPath);

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

  /**
   * Lưu snapshot nội dung hiện tại của các file text trong workspace.
   * Chỉ snapshot lần đầu (khi extension khởi động) để làm baseline.
   */
  private buildInitialSnapshots(folderPath: string): void {
    try {
      this.snapshotDir(folderPath, 0);
    } catch {
      // ignore
    }
  }

  private snapshotDir(dirPath: string, depth: number): void {
    if (depth > 5) { return; } // giới hạn độ sâu
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'out') {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        this.snapshotDir(fullPath, depth + 1);
      } else if (entry.isFile() && this.isTextFile(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          this.externalSnapshots.set(fullPath, content);
        } catch {
          // binary hoặc file đang bị lock — bỏ qua
        }
      }
    }
  }

  private handleExternalWrite(filePath: string): void {
    // Debounce: bỏ qua nếu vừa xử lý file này trong 500ms
    const now = Date.now();
    const lastTime = this.lastProcessed.get(filePath) ?? 0;
    if (now - lastTime < 500) { return; }
    this.lastProcessed.set(filePath, now);

    // Bỏ qua nếu đây là file do extension tạo ra (signal/snapshot trong tmpdir)
    if (!this.isTextFile(path.basename(filePath))) { return; }
    if (!this.isInWorkspace(filePath)) { return; }

    // Đọc nội dung mới từ disk sau 1 chút để đảm bảo write xong
    setTimeout(() => {
      try {
        if (!fs.existsSync(filePath)) { return; }

        const newContent = fs.readFileSync(filePath, 'utf8');
        const oldContent = this.externalSnapshots.get(filePath);

        if (oldContent === undefined) {
          // File mới được tạo — snapshot empty string
          this.externalSnapshots.set(filePath, '');
          // Nếu file không rỗng → đây là external write tạo file mới
          if (newContent.trim()) {
            this.triggerDiff(filePath, '', newContent);
          }
          return;
        }

        if (oldContent === newContent) {
          return; // không có thay đổi
        }

        // Cập nhật snapshot để lần sau so sánh đúng
        this.externalSnapshots.set(filePath, newContent);

        // Chỉ hiện diff nếu extension CHƯA có pending diff cho file này
        // (tránh conflict với claudeRunner/qwenRunner qua Ctrl+Shift+A)
        if (!this.diffManager.hasPendingDiff(filePath)) {
          this.triggerDiff(filePath, oldContent, newContent);
        }
      } catch {
        // file đang bị lock hoặc xóa — bỏ qua
      }
    }, 200);
  }

  private triggerDiff(filePath: string, originalContent: string, newContent: string): void {
    // Load snapshot vào diffManager rồi mở diff
    this.diffManager.loadSnapshot(filePath, originalContent);
    this.diffManager.openDiff(filePath).catch((err: unknown) => {
      console.error('[claude-diff-view] workspaceWatcher openDiff failed:', err);
    });
  }

  private isTextFile(filename: string): boolean {
    const textExts = new Set([
      '.ts', '.js', '.tsx', '.jsx', '.json', '.html', '.css', '.scss',
      '.md', '.txt', '.yaml', '.yml', '.toml', '.xml', '.py', '.go',
      '.rs', '.java', '.c', '.cpp', '.h', '.cs', '.rb', '.php', '.sh',
      '.bat', '.ps1', '.vue', '.svelte', '.astro',
    ]);
    const ext = path.extname(filename).toLowerCase();
    return textExts.has(ext);
  }

  private isInWorkspace(filePath: string): boolean {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) { return false; }
    return folders.some(f => filePath.startsWith(f.uri.fsPath));
  }

  /** Cập nhật snapshot khi người dùng tự sửa file (để baseline luôn đúng) */
  updateSnapshot(filePath: string, content: string): void {
    this.externalSnapshots.set(filePath, content);
  }

  dispose(): void {
    for (const w of this.fsWatchers) { w.close(); }
    this.fsWatchers = [];
    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}
