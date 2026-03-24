import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DiffManager } from '../diff/diffManager';

interface SignalFile {
  filePath: string;
  snapshotPath: string;
  toolName: string;
  timestamp: number;
}

export class HookWatcher {
  private watcher: fs.FSWatcher | undefined;
  private readonly signalDir: string;

  constructor(private readonly diffManager: DiffManager) {
    this.signalDir = path.join(os.tmpdir(), 'claude-diff-signals');
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
      console.error('[claude-diff-view] hookWatcher error:', err);
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
      fs.unlinkSync(signalPath); // consume immediately to avoid double-processing

      const signal: SignalFile = JSON.parse(raw);
      const { filePath, snapshotPath } = signal;

      if (!filePath || !snapshotPath) {
        return;
      }

      // Load the snapshot (written by pre-tool-hook.js) into DiffManager
      let snapshotContent = '';
      try {
        snapshotContent = fs.readFileSync(snapshotPath, 'utf8');
      } catch {
        // Snapshot missing means pre-hook didn't run — open diff with empty "before"
      }

      this.diffManager.loadSnapshot(filePath, snapshotContent);

      this.diffManager.openDiff(filePath).catch((err: unknown) => {
        console.error('[claude-diff-view] hookWatcher openDiff failed:', err);
      });
    } catch (err: unknown) {
      console.error('[claude-diff-view] processSignal failed:', err);
    }
  }

  dispose(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }
}
