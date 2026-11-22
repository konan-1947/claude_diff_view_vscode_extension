/**
 * Files behind the UI-side commands `/memory`, `/hooks` and `/status`: the
 * CLAUDE.md memory files and the settings files the CLI reads, at the same
 * places the CLI looks (`CLAUDE_CONFIG_DIR` replaces `~/.claude`).
 * The webview only ever names a file by kind; paths are resolved here.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ClaudeFileInfo, ClaudeFileKind, HookEntry } from '../../shared/messages';

function claudeConfigDir(): string {
    const fromEnv = process.env.CLAUDE_CONFIG_DIR;
    return fromEnv && fromEnv.trim() ? fromEnv : path.join(os.homedir(), '.claude');
}

function exists(file: string): boolean {
    try {
        return fs.statSync(file).isFile();
    } catch {
        return false;
    }
}

/**
 * Path of a memory or settings file. Project memory is `./CLAUDE.md`, or
 * `./.claude/CLAUDE.md` when only that one exists (the CLI reads both).
 */
export function resolveClaudeFile(kind: ClaudeFileKind, cwd: string): string {
    switch (kind) {
        case 'user-memory':
            return path.join(claudeConfigDir(), 'CLAUDE.md');
        case 'project-memory': {
            const root = path.join(cwd, 'CLAUDE.md');
            const nested = path.join(cwd, '.claude', 'CLAUDE.md');
            return !exists(root) && exists(nested) ? nested : root;
        }
        case 'local-memory':
            return path.join(cwd, 'CLAUDE.local.md');
        case 'user-settings':
            return path.join(claudeConfigDir(), 'settings.json');
        case 'project-settings':
            return path.join(cwd, '.claude', 'settings.json');
        case 'local-settings':
            return path.join(cwd, '.claude', 'settings.local.json');
    }
}

function info(kind: ClaudeFileKind, cwd: string): ClaudeFileInfo {
    const file = resolveClaudeFile(kind, cwd);
    return { kind, path: file, exists: exists(file) };
}

export function memoryFiles(cwd: string): ClaudeFileInfo[] {
    return (['project-memory', 'local-memory', 'user-memory'] as const).map((kind) => info(kind, cwd));
}

/** Lowest precedence first, as the CLI merges them */
export function settingsFiles(cwd: string): ClaudeFileInfo[] {
    return (['user-settings', 'project-settings', 'local-settings'] as const).map((kind) => info(kind, cwd));
}

/** Make a missing memory file (and its folder) so it can be opened for editing */
export function ensureClaudeFile(file: string): void {
    if (exists(file)) {
        return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '', { flag: 'wx' });
}

/**
 * Hooks of every settings file, in the shape the CLI stores them:
 * `hooks: { <Event>: [{ matcher?, hooks: [{ type, command | prompt }] }] }`.
 */
export function readHooks(cwd: string): {
    hooks: HookEntry[];
    errors: { source: ClaudeFileKind; error: string }[];
} {
    const hooks: HookEntry[] = [];
    const errors: { source: ClaudeFileKind; error: string }[] = [];

    for (const file of settingsFiles(cwd)) {
        if (!file.exists) {
            continue;
        }
        let settings: any;
        try {
            settings = JSON.parse(fs.readFileSync(file.path, 'utf8'));
        } catch (error) {
            errors.push({ source: file.kind, error: error instanceof Error ? error.message : String(error) });
            continue;
        }
        const byEvent = settings?.hooks;
        if (!byEvent || typeof byEvent !== 'object') {
            continue;
        }
        for (const [event, matchers] of Object.entries(byEvent)) {
            if (!Array.isArray(matchers)) {
                continue;
            }
            for (const group of matchers as any[]) {
                const list = Array.isArray(group?.hooks) ? group.hooks : [];
                for (const hook of list) {
                    const command = typeof hook?.command === 'string'
                        ? hook.command
                        : typeof hook?.prompt === 'string' ? hook.prompt : '';
                    hooks.push({
                        event,
                        matcher: typeof group?.matcher === 'string' && group.matcher ? group.matcher : undefined,
                        command,
                        hookType: typeof hook?.type === 'string' ? hook.type : 'command',
                        source: file.kind
                    });
                }
            }
        }
    }

    return { hooks, errors };
}
