/**
 * claudeHookSource.ts
 *
 * Reads the event files the Claude Code hook drops into
 * ~/.ai-cli-diff-view/claude-events/ and feeds them to ClaudeAttribution.
 *
 * Pull-based on purpose: WorkspaceWatcher asks right before deciding about a
 * write (which is already ≥200ms after the FS event). The PreToolUse hook ran
 * synchronously BEFORE Claude's write, so its event file is always on disk by
 * then — no race between two independent watchers.
 *
 * The directory is shared by every VS Code window, so files are never consumed;
 * each window remembers what it has read and old files are deleted by age.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ClaudeAttribution, normalizeFsPath, parseHookEvent } from './claudeAttribution';
import { getClaudeEventsDir } from './claudeHookInstaller';

const FILE_MAX_AGE_MS = 30 * 60_000;
const CLEANUP_INTERVAL_MS = 60_000;

export class ClaudeHookSource {
  private readonly seen = new Set<string>();
  private lastCleanup = 0;
  /** Ignore events written before this window started (stale leftovers). */
  private readonly startedAt = Date.now() - 60_000;

  constructor(
    private readonly attribution: ClaudeAttribution,
    private readonly eventsDir: string = getClaudeEventsDir()
  ) {}

  async isClaudeWrite(absPath: string, writeAt: number): Promise<boolean> {
    await this.refresh();
    return this.attribution.isClaudeWrite(normalizeFsPath(absPath), writeAt);
  }

  hasSeenAnyEvent(): boolean {
    return this.attribution.hasSeenAnyEvent();
  }

  private async refresh(): Promise<void> {
    let names: string[];
    try {
      names = await fs.promises.readdir(this.eventsDir);
    } catch {
      return; // directory not created yet → hook never ran
    }

    const now = Date.now();
    const doCleanup = now - this.lastCleanup > CLEANUP_INTERVAL_MS;
    if (doCleanup) { this.lastCleanup = now; }

    const fresh: { name: string; at: number; raw: string }[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) { continue; } // skip in-flight .tmp files
      const full = path.join(this.eventsDir, name);
      if (this.seen.has(name)) {
        if (doCleanup) { await this.deleteIfOld(full, name, now); }
        continue;
      }
      try {
        const stat = await fs.promises.stat(full);
        if (stat.mtimeMs < this.startedAt) {
          this.seen.add(name);
          if (doCleanup) { await this.deleteIfOld(full, name, now); }
          continue;
        }
        const raw = await fs.promises.readFile(full, 'utf8');
        fresh.push({ name, at: stat.mtimeMs, raw });
      } catch {
        // Deleted by another window or unreadable — retry next time.
      }
    }

    // Pre must be ingested before its Post.
    fresh.sort((a, b) => a.at - b.at);
    for (const f of fresh) {
      this.seen.add(f.name);
      const evt = parseHookEvent(f.raw, f.at);
      if (evt) { this.attribution.ingest(evt); }
    }
    this.attribution.prune(now);
  }

  private async deleteIfOld(full: string, name: string, now: number): Promise<void> {
    try {
      const stat = await fs.promises.stat(full);
      if (now - stat.mtimeMs > FILE_MAX_AGE_MS) {
        await fs.promises.unlink(full);
        this.seen.delete(name);
      }
    } catch {
      this.seen.delete(name);
    }
  }
}
