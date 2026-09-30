"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeRunner = void 0;
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// File-editing tool names to intercept
const FILE_EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
class ClaudeRunner {
    constructor(diffManager) {
        this.diffManager = diffManager;
        this.toolName = 'claude';
    }
    cancel() {
        try {
            this.currentProc?.kill();
        }
        catch {
            // process may have already exited
        }
        this.currentProc = undefined;
    }
    /**
     * Claude CLI có thể trả về path tương đối so với workingDir.
     * Nếu extension host resolve sai base dir thì sẽ snapshot/openDiff nhầm file.
     */
    resolveToolFilePath(filePath, workingDir) {
        // path.isAbsolute trên win32 xử lý tốt cả "C:\\..." và "D:/..."
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.resolve(workingDir, filePath);
    }
    /**
     * Finds the claude CLI executable on Windows.
     * Tries PATH lookup first, then falls back to the known install location.
     */
    findClaudeCli() {
        const candidates = ['claude', 'claude.cmd', 'claude.exe'];
        // Try each candidate via `where` (Windows) / `which` (unix)
        const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
        for (const candidate of candidates) {
            try {
                const result = cp.spawnSync(lookupCmd, [candidate.replace(/\.(cmd|exe)$/, '')], { encoding: 'utf8', timeout: 3000 });
                if (result.status === 0 && result.stdout.trim()) {
                    return candidate;
                }
            }
            catch {
                // ignore — try next candidate
            }
        }
        // Fallback: check known Windows install path
        const homeDir = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
        if (homeDir) {
            const absolutePath = path.join(homeDir, '.local', 'bin', 'claude.exe');
            if (fs.existsSync(absolutePath)) {
                return absolutePath;
            }
            const absolutePathNoExt = path.join(homeDir, '.local', 'bin', 'claude');
            if (fs.existsSync(absolutePathNoExt)) {
                return absolutePathNoExt;
            }
        }
        throw new Error('claude CLI not found.\n' +
            'Install Claude Code and ensure "claude" is on your PATH.\n' +
            'Tip: add %USERPROFILE%\\.local\\bin to your PATH environment variable.');
    }
    /**
     * Runs a claude session with the given prompt.
     * Fires onStatus callbacks to report state changes.
     */
    async run(prompt, workingDir, onStatus, onProgress) {
        const claudePath = this.findClaudeCli();
        return new Promise((resolve, reject) => {
            const args = [
                '--output-format', 'stream-json',
                '--verbose',
                '-p', prompt,
            ];
            const proc = cp.spawn(claudePath, args, {
                cwd: workingDir,
                env: { ...process.env },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            this.currentProc = proc;
            // NDJSON line buffer — chunks may split across lines
            let lineBuffer = '';
            // Maps tool_use_id -> file_path for pending tool calls
            const pendingToolUses = new Map();
            onProgress?.('Claude is thinking\u2026');
            proc.stdout.on('data', (chunk) => {
                lineBuffer += chunk.toString('utf8');
                const lines = lineBuffer.split('\n');
                for (let i = 0; i < lines.length - 1; i++) {
                    const line = (lines[i] ?? '').trim();
                    if (line.length > 0) {
                        this.handleLine(line, pendingToolUses, workingDir, onProgress);
                    }
                }
                lineBuffer = lines[lines.length - 1] ?? '';
            });
            proc.stdout.on('end', () => {
                const remaining = lineBuffer.trim();
                if (remaining.length > 0) {
                    this.handleLine(remaining, pendingToolUses, workingDir, onProgress);
                }
                lineBuffer = '';
            });
            proc.stderr.on('data', (chunk) => {
                console.error('[claude stderr]', chunk.toString('utf8').trimEnd());
            });
            onStatus('running');
            proc.on('close', (code) => {
                if (this.currentProc === proc) {
                    this.currentProc = undefined;
                }
                onStatus('idle');
                if (code === 0 || code === null) {
                    resolve();
                }
                else {
                    reject(new Error(`claude exited with code ${code}`));
                }
            });
            proc.on('error', (err) => {
                if (this.currentProc === proc) {
                    this.currentProc = undefined;
                }
                onStatus('error', err.message);
                reject(err);
            });
        });
    }
    /**
     * Parses one complete NDJSON line and dispatches to diffManager.
     */
    handleLine(line, pendingToolUses, workingDir, onProgress) {
        let event;
        try {
            event = JSON.parse(line);
        }
        catch {
            console.warn('[ai-cli-diff-view] Skipping non-JSON line:', line.slice(0, 120));
            return;
        }
        if (event.type === 'assistant') {
            const assistantEvent = event;
            for (const item of assistantEvent.message.content) {
                if (item.type !== 'tool_use') {
                    continue;
                }
                const toolUse = item;
                if (!FILE_EDIT_TOOLS.has(toolUse.name)) {
                    continue;
                }
                const filePathRaw = toolUse.input.file_path;
                if (!filePathRaw) {
                    continue;
                }
                const filePath = this.resolveToolFilePath(filePathRaw, workingDir);
                // Register mapping before snapshotting
                pendingToolUses.set(toolUse.id, filePath);
                const basename = filePath.split(/[\\/]/).pop() ?? filePath;
                onProgress?.(`${toolUse.name}: ${basename}`);
                this.diffManager.snapshotBefore(filePath).catch((err) => {
                    console.error('[ai-cli-diff-view] snapshotBefore failed:', err);
                });
            }
            return;
        }
        if (event.type === 'tool') {
            const toolEvent = event;
            const filePath = pendingToolUses.get(toolEvent.tool_use_id);
            if (filePath) {
                pendingToolUses.delete(toolEvent.tool_use_id);
                const basename = filePath.split(/[\\/]/).pop() ?? filePath;
                onProgress?.(`Opening diff: ${basename}`);
                this.diffManager.openDiff(filePath).catch((err) => {
                    console.error('[ai-cli-diff-view] openDiff failed:', err);
                });
            }
            return;
        }
        if (event.type === 'result' && event.is_error) {
            console.error('[ai-cli-diff-view] Session error:', event.result ?? '(no details)');
        }
    }
}
exports.ClaudeRunner = ClaudeRunner;
//# sourceMappingURL=claudeRunner.js.map