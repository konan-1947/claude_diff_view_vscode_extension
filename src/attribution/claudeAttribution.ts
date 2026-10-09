/**
 * claudeAttribution.ts
 *
 * Pure logic (no `vscode` import) that decides whether a filesystem write seen
 * by WorkspaceWatcher was made by Claude Code, based on PreToolUse/PostToolUse/
 * Stop hook events.
 *
 * Two kinds of evidence:
 *  - File claims: Write/Edit/MultiEdit/NotebookEdit name their target path. A
 *    write to that exact path between PreToolUse and PostToolUse (+ grace) is
 *    Claude's.
 *  - Bash windows: a Bash command carries no reliable target path, so while a
 *    Bash call is running (PreToolUse → PostToolUse + grace) any write in the
 *    workspace is attributed to Claude. No command parsing needed because the
 *    watcher already has the before-content baseline.
 *
 * Anything not covered is NOT Claude's: the watcher just refreshes its baseline
 * and opens no diff (copying a file into the folder, git, formatters, …).
 */

import * as path from 'path';

export type HookEventName = 'PreToolUse' | 'PostToolUse' | 'Stop';

export interface HookEvent {
  event: HookEventName;
  tool?: string;
  toolUseId?: string;
  sessionId?: string;
  /** Normalized absolute paths named by the tool input (file tools only). */
  paths: string[];
  /** When the hook ran (event file mtime), ms since epoch. */
  at: number;
}

export interface AttributionTimings {
  /** Writes arriving this long after PostToolUse still count (watcher latency). */
  postGraceMs: number;
  /** Claim lifetime when no PostToolUse arrives (denied/failed tool). */
  fileClaimMaxMs: number;
  /** Bash window lifetime when no PostToolUse/Stop arrives. */
  bashWindowMaxMs: number;
}

export const DEFAULT_TIMINGS: AttributionTimings = {
  postGraceMs: 3_000,
  fileClaimMaxMs: 10 * 60_000,
  bashWindowMaxMs: 10 * 60_000,
};

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const BASH_TOOL = 'Bash';

export function normalizeFsPath(p: string, platform: string = process.platform): string {
  const resolved = path.resolve(p);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Parse one raw hook payload (Claude Code hook stdin JSON). Returns undefined if unusable. */
export function parseHookEvent(raw: string, at: number): HookEvent | undefined {
  let obj: Record<string, unknown>;
  try {
    // PowerShell writers may prepend a BOM.
    obj = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return undefined;
  }
  if (!obj || typeof obj !== 'object') { return undefined; }

  const event = obj['hook_event_name'];
  if (event !== 'PreToolUse' && event !== 'PostToolUse' && event !== 'Stop') {
    return undefined;
  }
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const tool = str(obj['tool_name']);
  const cwd = str(obj['cwd']);
  const input = (obj['tool_input'] && typeof obj['tool_input'] === 'object')
    ? obj['tool_input'] as Record<string, unknown>
    : {};

  const paths: string[] = [];
  if (tool && FILE_TOOLS.has(tool)) {
    const target = str(input['file_path']) ?? str(input['notebook_path']);
    if (target) {
      const abs = path.isAbsolute(target) || !cwd ? target : path.join(cwd, target);
      paths.push(normalizeFsPath(abs));
    }
  }

  return {
    event,
    tool,
    toolUseId: str(obj['tool_use_id']),
    sessionId: str(obj['session_id']),
    paths,
    at,
  };
}

interface Span {
  kind: 'file' | 'bash';
  sessionId?: string;
  paths: Set<string>;
  start: number;
  end?: number;
}

export class ClaudeAttribution {
  private readonly spans = new Map<string, Span>();
  private anonymousCounter = 0;
  private everSawEvent = false;

  constructor(
    private readonly timings: AttributionTimings = DEFAULT_TIMINGS,
    private readonly attributeBash: () => boolean = () => true
  ) {}

  hasSeenAnyEvent(): boolean {
    return this.everSawEvent;
  }

  ingest(evt: HookEvent): void {
    this.everSawEvent = true;

    if (evt.event === 'Stop') {
      // Turn ended: close every still-open span of that session.
      for (const span of this.spans.values()) {
        if (span.end === undefined && (!evt.sessionId || span.sessionId === evt.sessionId)) {
          span.end = evt.at;
        }
      }
      return;
    }

    const kind = evt.tool === BASH_TOOL ? 'bash'
      : (evt.tool && FILE_TOOLS.has(evt.tool) ? 'file' : undefined);
    if (!kind) { return; }

    const key = evt.toolUseId ?? `anon-${++this.anonymousCounter}`;
    const existing = this.spans.get(key);

    if (evt.event === 'PreToolUse') {
      if (!existing) {
        this.spans.set(key, {
          kind,
          sessionId: evt.sessionId,
          paths: new Set(evt.paths),
          start: evt.at,
        });
      }
      return;
    }

    // PostToolUse
    if (existing) {
      existing.end = evt.at;
      for (const p of evt.paths) { existing.paths.add(p); }
    } else {
      // Missed the Pre (e.g. extension started mid-tool): a short span ending now.
      this.spans.set(key, {
        kind,
        sessionId: evt.sessionId,
        paths: new Set(evt.paths),
        start: evt.at - this.timings.postGraceMs,
        end: evt.at,
      });
    }
  }

  /**
   * @param absPath normalized absolute path of the written file
   * @param writeAt when the watcher received the write event (ms)
   */
  isClaudeWrite(absPath: string, writeAt: number): boolean {
    for (const span of this.spans.values()) {
      if (writeAt < span.start) { continue; }
      const maxLife = span.kind === 'bash' ? this.timings.bashWindowMaxMs : this.timings.fileClaimMaxMs;
      const closesAt = span.end !== undefined
        ? span.end + this.timings.postGraceMs
        : span.start + maxLife;
      if (writeAt > closesAt) { continue; }

      if (span.kind === 'file' && span.paths.has(absPath)) { return true; }
      if (span.kind === 'bash' && this.attributeBash()) { return true; }
    }
    return false;
  }

  /** Drop spans that can no longer match any future write. */
  prune(now: number): void {
    for (const [key, span] of this.spans) {
      const maxLife = span.kind === 'bash' ? this.timings.bashWindowMaxMs : this.timings.fileClaimMaxMs;
      const closesAt = span.end !== undefined
        ? span.end + this.timings.postGraceMs
        : span.start + maxLife;
      // Keep a margin: the watcher may still be processing a delayed write.
      if (now - closesAt > 60_000) {
        this.spans.delete(key);
      }
    }
  }
}
