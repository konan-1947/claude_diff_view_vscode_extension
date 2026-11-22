/**
 * Input features of the CLI's prompt that the SDK does not provide:
 *   - prompt history, shared with the CLI through `~/.claude/history.jsonl`
 *     (the CLI run through the SDK does not write it, so the UI does)
 *   - bash mode (`!command`): run a shell command outside the model
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import type { PromptHistoryEntry, RunShellCommandResponse } from '../../shared/messages';

function configDir(): string {
    return process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
}

function historyFile(): string {
    return path.join(configDir(), 'history.jsonl');
}

/** Paths in history.jsonl are as the CLI wrote them; Windows compares case-insensitively */
function sameProject(a: string, b: string): boolean {
    const norm = (p: string) => {
        const unified = path.resolve(p).replace(/[\\/]+$/, '');
        return process.platform === 'win32' ? unified.toLowerCase() : unified;
    };
    return norm(a) === norm(b);
}

const MAX_HISTORY = 500;

/** Prompts typed in this project (CLI and UI), newest first, without repeats */
export async function readPromptHistory(cwd: string): Promise<PromptHistoryEntry[]> {
    let text: string;
    try {
        text = await fs.readFile(historyFile(), 'utf8');
    } catch {
        return [];
    }
    const seen = new Set<string>();
    const entries: PromptHistoryEntry[] = [];
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0 && entries.length < MAX_HISTORY; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        let entry: any;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        const display = typeof entry?.display === 'string' ? entry.display : '';
        if (!display.trim() || typeof entry.project !== 'string' || !sameProject(entry.project, cwd)) continue;
        if (seen.has(display)) continue;
        seen.add(display);
        entries.push({ display, timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : 0 });
    }
    return entries;
}

/** One line in the CLI's own format, so the CLI's ↑ and Ctrl+R find it too */
export async function appendPromptHistory(display: string, cwd: string, sessionId?: string): Promise<void> {
    if (!display.trim()) return;
    const line = JSON.stringify({
        display,
        pastedContents: {},
        timestamp: Date.now(),
        project: cwd,
        ...(sessionId ? { sessionId } : {})
    });
    await fs.mkdir(configDir(), { recursive: true });
    await fs.appendFile(historyFile(), line + '\n', { encoding: 'utf8', mode: 0o600 });
}

/** Same cap as the CLI's Bash tool output; the end is kept (errors are usually there) */
const MAX_OUTPUT_CHARS = 30_000;

function capOutput(text: string): string {
    if (text.length <= MAX_OUTPUT_CHARS) return text;
    const dropped = text.length - MAX_OUTPUT_CHARS;
    return `[${dropped} characters truncated]\n` + text.slice(-MAX_OUTPUT_CHARS);
}

/** The CLI's Bash default timeout, overridable the same way */
function timeoutMs(): number {
    const fromEnv = Number(process.env.BASH_DEFAULT_TIMEOUT_MS);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 120_000;
}

/**
 * Shell for bash mode. The CLI uses bash (Git Bash on Windows); without one on
 * Windows, PowerShell is the closest thing that is always there.
 */
function shellFor(command: string): { file: string; args: string[] } {
    if (process.platform === 'win32') {
        const gitBash = process.env.CLAUDE_CODE_GIT_BASH_PATH;
        if (gitBash) return { file: gitBash, args: ['-c', command] };
        return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command] };
    }
    const userShell = process.env.SHELL;
    const file = userShell && /\/(bash|zsh)$/.test(userShell) ? userShell : '/bin/bash';
    return { file, args: ['-c', command] };
}

function killTree(pid: number): void {
    try {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
        } else {
            process.kill(-pid, 'SIGTERM');
        }
    } catch {
        // already gone
    }
}

export function runShellCommand(command: string, cwd: string, signal?: AbortSignal): Promise<RunShellCommandResponse> {
    return new Promise((resolve) => {
        const { file, args } = shellFor(command);
        let stdout = '';
        let stderr = '';
        let interrupted = false;
        let settled = false;

        const proc = spawn(file, args, {
            cwd,
            env: process.env,
            // Own process group, so Esc stops what the command started too
            detached: process.platform !== 'win32',
            windowsHide: true
        });

        const stop = () => {
            interrupted = true;
            if (proc.pid) killTree(proc.pid);
        };
        const timer = setTimeout(stop, timeoutMs());
        signal?.addEventListener('abort', stop, { once: true });

        const finish = (response: RunShellCommandResponse) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', stop);
            resolve(response);
        };

        proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
        proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
        proc.on('close', (code) => {
            finish({
                type: 'run_shell_command_response',
                stdout: capOutput(stdout),
                stderr: capOutput(stderr),
                exitCode: code,
                interrupted
            });
        });
        proc.on('error', (error) => {
            finish({
                type: 'run_shell_command_response',
                stdout: '',
                stderr: error.message,
                exitCode: null
            });
        });
    });
}
