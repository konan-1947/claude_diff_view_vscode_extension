/**
 * Keeps Claude UI conversations in the terminal's `claude --resume` list.
 *
 * Claude UI runs the CLI through the Agent SDK, so its transcripts are recorded
 * with entrypoint "sdk-ts" (Code Mode is refused under any other entrypoint a
 * headless CLI can have), and `/resume` in an interactive CLI hides every
 * sdk-* session. That list takes the first "entrypoint" near the start of the
 * file, so rewriting it there to "cli" makes the session show up, while the
 * CLI keeps appending to the same file.
 *
 * The rewrite is in place and the same length (`"sdk-ts"` → `"cli"   `, the
 * padding being JSON whitespace): nothing moves, so an append the CLI makes at
 * the same moment is untouched. Only complete lines are rewritten.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const HEAD_BYTES = 256 * 1024;
const NEEDLE = Buffer.from('"entrypoint":"sdk-ts"');
const REPLACEMENT = Buffer.from('"entrypoint":"cli"   ');

/** ~/.claude/projects/<cwd as the CLI names it> (same rule as ClaudeSessionService) */
export function projectHistoryDir(cwd: string): string {
    const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
    return path.join(configDir, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
}

/** True when the transcript now (or already) shows in `claude --resume` */
export async function showInCliResume(file: string): Promise<boolean> {
    let handle: fs.FileHandle | undefined;
    try {
        handle = await fs.open(file, 'r+');
        const head = Buffer.alloc(HEAD_BYTES);
        const { bytesRead } = await handle.read(head, 0, HEAD_BYTES, 0);
        const view = head.subarray(0, bytesRead);
        let at = view.indexOf(NEEDLE);
        while (at >= 0 && view.indexOf(0x0a, at) >= 0) {
            await handle.write(REPLACEMENT, 0, REPLACEMENT.length, at);
            at = view.indexOf(NEEDLE, at + NEEDLE.length);
        }
        return view.indexOf(Buffer.from('"entrypoint":')) >= 0;
    } catch {
        return false;
    } finally {
        await handle?.close().catch(() => undefined);
    }
}

const shown = new Set<string>();

/** After a turn of a Claude UI conversation: once its transcript exists, once per session */
export async function showSessionInCliResume(cwd: string, sessionId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || shown.has(sessionId)) return;
    if (await showInCliResume(path.join(projectHistoryDir(cwd), `${sessionId}.jsonl`))) {
        shown.add(sessionId);
    }
}

const swept = new Set<string>();

/** Once per folder and run: the conversations Claude UI made before this existed */
export async function sweepProject(cwd: string): Promise<void> {
    const dir = projectHistoryDir(cwd);
    if (swept.has(dir)) return;
    swept.add(dir);
    let names: string[];
    try {
        names = (await fs.readdir(dir)).filter((n) => n.endsWith('.jsonl'));
    } catch {
        return;
    }
    for (const name of names) {
        await showInCliResume(path.join(dir, name));
    }
}
