/**
 * Parsing helpers for the omp tool cards (`edit`, `todo`, `task`, `eval`).
 * omp sends its raw tool data; any field may be missing while a call is still
 * running, so nothing here assumes a shape.
 */

export type DiffRowKind = 'add' | 'delete' | 'context';

export interface DiffRow {
  kind: DiffRowKind;
  /** Number taken from the patch line, or '' for elisions / unrecognised rows */
  number: string;
  /** Line text without the number/prefix, or the raw line when unrecognised */
  text: string;
}

/** Splits multi-line text, dropping trailing empty lines */
export function splitLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * omp's `details.diff` lines look like ` 12|text`, `-12|text`, `+12|text`.
 * A line that does not match is an elision and is shown as context.
 */
export function parseDiffRows(diff: string): DiffRow[] {
  return splitLines(diff).map((raw: string): DiffRow => {
    const match = /^([ +-])(\d+)\|(.*)$/.exec(raw);
    if (!match) return { kind: 'context', number: '', text: raw };
    const marker = match[1];
    return {
      kind: marker === '+' ? 'add' : marker === '-' ? 'delete' : 'context',
      number: match[2],
      text: match[3],
    };
  });
}

export function diffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const row of parseDiffRows(diff)) {
    if (row.kind === 'add') added++;
    else if (row.kind === 'delete') removed++;
  }
  return { added, removed };
}

/**
 * A hashline patch starts each file with `[PATH#TAG]`. The tag format is not
 * in omp's RPC reference, so any short word is accepted; the path is greedy (it
 * may hold a `#`). Same pattern as writtenPaths() in src/omp/ompTools.ts.
 */
export function isHashlineHeader(line: string): boolean {
  return /^\[(.+)#[0-9A-Za-z_-]{1,32}\]\s*$/.test(line.trim());
}

/** Patch op lines: `PUT 2.=2:`, `CUT 4* @name`, `REM`, `MV dest` */
export function isHashlineOp(line: string): boolean {
  return /^(PUT|CUT|REM|MV)\b/.test(line.trim());
}

/** File paths of a hashline patch, one per `[PATH#TAG]` header */
export function hashlinePaths(patch: string): string[] {
  const paths: string[] = [];
  for (const line of splitLines(patch)) {
    const match = /^\[(.+)#[0-9A-Za-z_-]{1,32}\]\s*$/.exec(line.trim());
    if (match) paths.push(match[1]);
  }
  return paths;
}

/** Body rows added by the patch: they start with '+' */
export function hashlineAddedCount(patch: string): number {
  return splitLines(patch).filter((line: string) => line.startsWith('+')).length;
}

/** Replace-mode patch body: `- old` lines then `+ new` lines */
export function replacePatchLines(oldText: string, newText: string): string[] {
  const removed = splitLines(oldText).map((line: string) => `-${line}`);
  const added = splitLines(newText).map((line: string) => `+${line}`);
  return [...removed, ...added];
}

/** Last path segment, for both `/` and `\` separators */
export function pathBasename(filePath: string): string {
  if (!filePath) return '';
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

/** Defensive string conversion: only scalars are meaningful here */
export function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Compact duration for card metadata */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
