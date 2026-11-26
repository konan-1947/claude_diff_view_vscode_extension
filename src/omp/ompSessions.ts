/**
 * omp conversation history for OMP UI tabs: the session JSONL files omp
 * writes under `<agentDir>/sessions/<cwd-name>/`, converted into the SDK
 * message shapes the chat UI (uic) already renders, plus the prompt history
 * the UI's ↑/↓ and Ctrl+R read.
 *
 * A session file is JSONL: line 1 `{type:"title"}`, line 2 `{type:"session"}`
 * (id, cwd), then a tree of entries linked by `parentId`. Only
 * `type:"message"` entries matter (user / assistant / toolResult); the active
 * branch is the one ending at the last entry in the file.
 */

import * as fs from 'fs/promises';
import { readFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PromptHistoryEntry } from '../claude/shared/messages';
import { toSdkToolUse } from './ompTools';
import { OmpTaskCalls } from './ompTasks';

/** omp's data folder (`PI_CODING_AGENT_DIR` overrides it) */
export function ompAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.omp', 'agent');
}

/** `/home/u/repo` → `-repo`, `/tmp` → `-tmp` (home prefix stripped, separators → `-`) */
export function ompSessionDirName(cwd: string): string {
  const resolved = path.resolve(cwd);
  const home = os.homedir();
  const lower = process.platform === 'win32' ? (p: string) => p.toLowerCase() : (p: string) => p;
  let rest = resolved;
  if (lower(resolved) === lower(home)) {
    rest = '';
  } else if (lower(resolved).startsWith(lower(home)) && /[\\/]/.test(resolved[home.length] ?? '')) {
    rest = resolved.slice(home.length);
  }
  return rest.replace(/[\\/:]/g, '-');
}

/** Parse JSONL text; bad lines skipped. */
export function parseOmpSession(text: string): any[] {
  const entries: any[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      if (entry && typeof entry === 'object') entries.push(entry);
    } catch {
      // partial last line, or not JSON
    }
  }
  return entries;
}

export interface OmpSessionInfo {
  id: string;
  filePath: string;
  lastModified: number;
  messageCount: number;
  summary: string;
  cwd: string;
}

const SUMMARY_MAX = 45;

/** Pure: summary of parsed entries; undefined when there is no "session" line or no user message. */
export function summarizeOmpSession(entries: any[], filePath: string, mtimeMs: number): OmpSessionInfo | undefined {
  const session = entries.find((entry) => entry?.type === 'session');
  if (!session) return undefined;

  let messageCount = 0;
  let userMessage = false;
  let firstUserText: string | undefined;
  let titleChange = '';
  for (const entry of entries) {
    if (entry?.type === 'title_change' && typeof entry.title === 'string' && entry.title.trim()) {
      titleChange = entry.title;
    }
    if (entry?.type !== 'message') continue;
    const role = entry.message?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    messageCount++;
    if (role !== 'user') continue;
    userMessage = true;
    if (firstUserText === undefined) firstUserText = textOf(entry.message);
  }
  if (!userMessage) return undefined;

  const headerTitle = entries[0]?.type === 'title' && typeof entries[0].title === 'string' ? entries[0].title : '';
  const summary = (titleChange || headerTitle || firstUserText || '').replace(/\s+/g, ' ').trim();
  return {
    id: typeof session.id === 'string' ? session.id : '',
    filePath,
    lastModified: mtimeMs,
    messageCount,
    summary: summary.length > SUMMARY_MAX ? summary.slice(0, SUMMARY_MAX) + '…' : summary,
    cwd: typeof session.cwd === 'string' ? session.cwd : '',
  };
}

/** Sessions of this workspace folder, newest (lastModified) first. Errors → []. */
export async function listOmpSessions(cwd: string): Promise<OmpSessionInfo[]> {
  const files = (await ownSessionDir(cwd)) ?? await everySessionFile();
  const sessions = await Promise.all(files.map(async (filePath) => {
    try {
      const [text, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
      return summarizeOmpSession(parseOmpSession(text), filePath, stat.mtimeMs);
    } catch {
      return undefined;
    }
  }));
  return sessions
    .filter((session): session is OmpSessionInfo => !!session && sameDir(session.cwd, cwd))
    .sort((a, b) => b.lastModified - a.lastModified);
}

/** Session file path for an id (exact id, or id prefix), searched like listOmpSessions; undefined if none. */
export async function findOmpSessionFile(cwd: string, sessionId: string): Promise<string | undefined> {
  const wanted = sessionId.trim();
  if (!wanted) return undefined;
  const files = (await ownSessionDir(cwd)) ?? await everySessionFile();
  const found = await Promise.all(files.map(async (filePath) => {
    const head = await sessionHead(filePath);
    return head && sameDir(head.cwd, cwd) ? { filePath, id: head.id } : undefined;
  }));
  const candidates = found.filter((candidate): candidate is { filePath: string; id: string } => !!candidate);
  return (candidates.find((c) => c.id === wanted) ?? candidates.find((c) => c.id.startsWith(wanted)))?.filePath;
}

/** Pure: entries → SDK-shaped messages for the webview. */
export function ompSessionToSdkMessages(entries: any[], resolveImage?: (data: string) => string | undefined): any[] {
  const session = entries.find((entry) => entry?.type === 'session');
  const sessionId = typeof session?.id === 'string' ? session.id : '';
  const messages: any[] = [];
  // Its own registry: loading a history must not touch a live channel's task calls
  const taskCalls = new OmpTaskCalls();
  for (const entry of activeBranch(entries)) {
    if (entry?.type !== 'message') continue;
    const m = entry.message;
    if (!m) continue;
    const parsed = Date.parse(entry.timestamp);
    const ts = Number.isNaN(parsed) ? undefined : parsed;

    if (m.role === 'user') {
      const blocks = toBlocks(m.content, resolveImage);
      if (!blocks.length) continue;
      messages.push({
        type: 'user',
        uuid: entry.id,
        session_id: sessionId,
        parent_tool_use_id: null,
        message: { role: 'user', content: blocks },
        timestamp: ts,
      });
      continue;
    }

    if (m.role === 'assistant') {
      const id = 'msg_' + entry.id;
      const usage = m.usage ?? {};
      const blocks = Array.isArray(m.content) ? m.content : typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : [];
      blocks.forEach((block: any, index: number) => {
        // An omp task call became one 'Task' card per item (see ompTasks.ts)
        const sdkBlocks = block?.type === 'toolCall' && block.name === 'task'
          ? taskCalls.toolUses(block.id, block.arguments, block.intent ?? block.arguments?.i)
          : [assistantBlock(block)];
        sdkBlocks.filter(Boolean).forEach((sdkBlock: any, part: number) => {
          messages.push({
            type: 'assistant',
            uuid: entry.id + ':' + index + (sdkBlocks.length > 1 ? ':' + part : ''),
            session_id: sessionId,
            parent_tool_use_id: null,
            message: {
              id,
              type: 'message',
              role: 'assistant',
              model: m.model ?? '',
              content: [sdkBlock],
              stop_reason: null,
              stop_sequence: null,
              usage: {
                input_tokens: usage.input ?? 0,
                output_tokens: usage.output ?? 0,
                cache_read_input_tokens: usage.cacheRead ?? 0,
                cache_creation_input_tokens: usage.cacheWrite ?? 0,
              },
            },
            timestamp: ts,
          });
        });
      });
      if (m.stopReason === 'aborted') {
        messages.push({
          type: 'user',
          uuid: entry.id + ':aborted',
          session_id: sessionId,
          parent_tool_use_id: null,
          message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] },
          timestamp: ts,
        });
      }
      continue;
    }

    if (m.role === 'toolResult') {
      const toolUseIds = m.toolName === 'task' ? taskCalls.resultIds(m.toolCallId, m.details) : [m.toolCallId];
      messages.push({
        type: 'user',
        uuid: entry.id,
        session_id: sessionId,
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: toolUseIds.map((id) => ({
            type: 'tool_result',
            tool_use_id: id,
            content: toBlocks(m.content, resolveImage),
            is_error: m.isError === true,
          })),
        },
        // Structured output (omp `details`), read by cards that want more than the text
        toolUseResult: m.details,
        timestamp: ts,
      });
    }
  }
  return messages;
}

/** Reads the file and converts it; blobs resolved with fs.readFileSync → base64. [] when not found. */
export async function getOmpSessionMessages(cwd: string, sessionId: string): Promise<any[]> {
  const filePath = await findOmpSessionFile(cwd, sessionId);
  if (!filePath) return [];
  let text: string;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch {
    return [];
  }
  return ompSessionToSdkMessages(parseOmpSession(text), resolveBlob);
}

// ---- prompt history -----------------------------------------------------------

interface StoredPrompt {
  display: string;
  timestamp: number;
  cwd: string;
}

const MAX_PROMPT_HISTORY = 500;

let historyCache: Promise<StoredPrompt[]> | undefined;
let historyWrite: Promise<void> = Promise.resolve();

export async function readOmpPromptHistory(cwd: string): Promise<PromptHistoryEntry[]> {
  const entries = await loadHistory();
  const seen = new Set<string>();
  const result: PromptHistoryEntry[] = [];
  for (const entry of entries) {
    if (!sameDir(entry.cwd, cwd) || seen.has(entry.display)) continue;
    seen.add(entry.display);
    result.push({ display: entry.display, timestamp: entry.timestamp });
  }
  return result;
}

export async function addOmpPromptHistory(display: string, cwd: string): Promise<void> {
  if (!display.trim()) return;
  const project = path.resolve(cwd);
  const run = historyWrite.then(async () => {
    const entries = await loadHistory();
    const kept = entries.filter((entry) => entry.display !== display || !sameDir(entry.cwd, project));
    entries.length = 0;
    entries.push({ display, timestamp: Date.now(), cwd: project }, ...kept);
    if (entries.length > MAX_PROMPT_HISTORY) entries.length = MAX_PROMPT_HISTORY;
    await writeHistory(entries);
  });
  // A failed write must not poison the queue for later prompts
  historyWrite = run.catch(() => undefined);
  return run;
}

function historyFile(): string {
  return path.join(ompAgentDir(), 'ai-cli-diff-view-history.json');
}

function loadHistory(): Promise<StoredPrompt[]> {
  if (!historyCache) historyCache = readHistory();
  return historyCache;
}

async function readHistory(): Promise<StoredPrompt[]> {
  let text: string;
  try {
    text = await fs.readFile(historyFile(), 'utf8');
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed?.entries)) return [];
    const entries: StoredPrompt[] = [];
    for (const entry of parsed.entries) {
      if (typeof entry?.display !== 'string' || !entry.display) continue;
      if (typeof entry.cwd !== 'string') continue;
      entries.push({
        display: entry.display,
        timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : 0,
        cwd: entry.cwd,
      });
    }
    return entries.slice(0, MAX_PROMPT_HISTORY);
  } catch {
    return [];
  }
}

async function writeHistory(entries: StoredPrompt[]): Promise<void> {
  const file = historyFile();
  const temp = file + '.tmp';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temp, JSON.stringify({ entries }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temp, file);
}

// ---- helpers ------------------------------------------------------------------

/** Windows compares paths case-insensitively; trailing separators are not part of it */
function sameDir(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const norm = (p: string) => {
    const resolved = path.resolve(p).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return norm(a) === norm(b);
}

/** .jsonl files of the folder omp names after `cwd`; undefined when that folder does not exist */
async function ownSessionDir(cwd: string): Promise<string[] | undefined> {
  const dir = path.join(ompAgentDir(), 'sessions', ompSessionDirName(cwd));
  try {
    const names = await fs.readdir(dir);
    return names.filter((name) => name.endsWith('.jsonl')).map((name) => path.join(dir, name));
  } catch {
    return undefined;
  }
}

/** Every .jsonl under sessions/ (the folder name is a guess on other OSes) */
async function everySessionFile(): Promise<string[]> {
  const root = path.join(ompAgentDir(), 'sessions');
  let dirs: string[];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name));
  } catch {
    return [];
  }
  const lists = await Promise.all(dirs.map(async (dir) => {
    try {
      const names = await fs.readdir(dir);
      return names.filter((name) => name.endsWith('.jsonl')).map((name) => path.join(dir, name));
    } catch {
      return [];
    }
  }));
  return lists.flat();
}

const HEAD_BYTES = 4096;

/** Session line (id, cwd) from the first 4 KB; undefined when it is missing */
async function sessionHead(filePath: string): Promise<{ id: string; cwd: string } | undefined> {
  let head: string;
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
      head = buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
  const session = parseOmpSession(head).find((entry) => entry?.type === 'session');
  if (!session) return undefined;
  return {
    id: typeof session.id === 'string' ? session.id : '',
    cwd: typeof session.cwd === 'string' ? session.cwd : '',
  };
}

/** `blob:sha256:<hash>` → base64 of `<agentDir>/blobs/<hash>` */
function resolveBlob(data: string): string | undefined {
  if (!data.startsWith('blob:sha256:')) return data;
  const hash = data.slice('blob:sha256:'.length);
  if (!/^[A-Za-z0-9._-]+$/.test(hash)) return undefined;
  try {
    return readFileSync(path.join(ompAgentDir(), 'blobs', hash)).toString('base64');
  } catch {
    return undefined;
  }
}

/**
 * Entries of the active branch: the last entry in file order, walked up by
 * `parentId`. Falls back to the file order when that chain has no message.
 */
function activeBranch(entries: any[]): any[] {
  const byId = new Map<string, any>();
  for (const entry of entries) {
    if (typeof entry?.id === 'string' && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  let last: any;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (typeof entries[i]?.id === 'string') {
      last = entries[i];
      break;
    }
  }
  if (!last) return entries;

  const chain: any[] = [];
  const visited = new Set<string>();
  let current: any = last;
  while (current && typeof current.id === 'string' && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = typeof current.parentId === 'string' ? byId.get(current.parentId) : undefined;
  }
  chain.reverse();
  return chain.some((entry) => entry?.type === 'message') ? chain : entries;
}

/** omp content (string or blocks) → Anthropic content blocks; images resolved through `resolveImage` */
function toBlocks(content: any, resolveImage?: (data: string) => string | undefined): any[] {
  const parts = Array.isArray(content) ? content : typeof content === 'string' ? [{ type: 'text', text: content }] : [];
  const blocks: any[] = [];
  for (const part of parts) {
    if (part?.type === 'text') {
      blocks.push({ type: 'text', text: String(part.text ?? '') });
      continue;
    }
    if (part?.type !== 'image' || typeof part.data !== 'string') continue;
    const data = part.data.startsWith('blob:sha256:') ? resolveImage?.(part.data) : part.data;
    if (!data) continue;
    blocks.push({ type: 'image', source: { type: 'base64', media_type: part.mimeType || 'image/png', data } });
  }
  return blocks;
}

function assistantBlock(block: any): any {
  if (block?.type === 'text') {
    const text = typeof block.text === 'string' ? block.text : '';
    return text ? { type: 'text', text } : undefined;
  }
  if (block?.type === 'thinking') {
    const text = typeof block.thinking === 'string' ? block.thinking : '';
    if (!text) return undefined;
    // `narration`: prose the provider returned as thinking; omp shows it as answer text
    return block.narration === true ? { type: 'text', text } : { type: 'thinking', thinking: text };
  }
  if (block?.type === 'toolCall') {
    const mapped = toSdkToolUse(block.name, block.arguments, block.intent ?? block.arguments?.i);
    return { type: 'tool_use', id: block.id, name: mapped.name, input: mapped.input };
  }
  return undefined;
}

/** Text of a message's text blocks, joined (summary fallback) */
function textOf(message: any): string {
  const content = message?.content;
  const parts = Array.isArray(content) ? content : typeof content === 'string' ? [{ type: 'text', text: content }] : [];
  return parts.filter((part: any) => part?.type === 'text').map((part: any) => String(part.text ?? '')).join(' ');
}
