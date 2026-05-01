import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DiffManager } from '../diff/diffManager';

interface SignalFile {
  filePath: string;
  snapshotPath: string;
  snapshotMetaPath?: string;
  toolName: string;
  timestamp: number;
}

export class HookWatcher {
  private watcher: fs.FSWatcher | undefined;
  private readonly signalDir: string;

  constructor(private readonly diffManager: DiffManager) {
    this.signalDir = path.join(os.tmpdir(), 'ai-cli-diff-signals');
  }

  /**
   * Kiểm tra xem filePath có thuộc workspace đang mở hay không.
   */
  private belongsToCurrentWorkspace(filePath: string): boolean {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return false;
    }
    const resolved = path.resolve(filePath);
    return folders.some(folder => resolved.startsWith(folder.uri.fsPath));
  }

  start(): void {
    if (!fs.existsSync(this.signalDir)) {
      fs.mkdirSync(this.signalDir, { recursive: true });
    }

    // Process any leftover signals from a previous session
    this.drainExisting();

    this.watcher = fs.watch(this.signalDir, (_event, filename) => {
      if (filename && filename.endsWith('.json')) {
        const signalPath = path.join(this.signalDir, filename);
        // Small delay to ensure the hook script has finished writing
        setTimeout(() => this.processSignal(signalPath), 150);
      }
    });

    this.watcher.on('error', (err) => {
      console.error('[ai-cli-diff-view] hookWatcher error:', err);
    });
  }

  private drainExisting(): void {
    try {
      const files = fs.readdirSync(this.signalDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        this.processSignal(path.join(this.signalDir, file));
      }
    } catch {
      // Directory may not exist yet or be empty — ignore
    }
  }

  private processSignal(signalPath: string): void {
    try {
      if (!fs.existsSync(signalPath)) {
        return;
      }

      const raw = fs.readFileSync(signalPath, 'utf8');
      const signal: SignalFile = JSON.parse(raw);
      const { filePath, snapshotPath, snapshotMetaPath } = signal;

      if (!filePath || !snapshotPath) {
        fs.unlinkSync(signalPath);
        return;
      }

      // Bỏ qua signal nếu file không thuộc workspace hiện tại.
      // Không xóa signal file — để VS Code window đúng xử lý.
      if (!this.belongsToCurrentWorkspace(filePath)) {
        return;
      }

      fs.unlinkSync(signalPath); // consume sau khi xác nhận thuộc workspace này

      // Load the snapshot (written by pre-tool-hook.js) into DiffManager
      let snapshotContent = '';
      let fileExistedBefore = true;
      try {
        snapshotContent = fs.readFileSync(snapshotPath, 'utf8');
      } catch {
        // Snapshot missing means pre-hook didn't run — open diff with empty "before"
      }

      if (snapshotMetaPath) {
        try {
          const meta = JSON.parse(fs.readFileSync(snapshotMetaPath, 'utf8')) as {
            fileExistedBefore?: unknown;
            timestamp?: unknown;
          };
          const isCurrentMeta = typeof meta.timestamp === 'number' && meta.timestamp <= signal.timestamp;
          if (isCurrentMeta && typeof meta.fileExistedBefore === 'boolean') {
            fileExistedBefore = meta.fileExistedBefore;
          }
        } catch {
          // Older hooks did not write metadata; default to existing file for safety.
        }
      }

      this.diffManager.loadSnapshot(filePath, snapshotContent, fileExistedBefore);

      this.diffManager.openDiff(filePath).catch((err: unknown) => {
        console.error('[ai-cli-diff-view] hookWatcher openDiff failed:', err);
      });
    } catch (err: unknown) {
      console.error('[ai-cli-diff-view] processSignal failed:', err);
    }
  }

  dispose(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }
}
