import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DiffManager } from '../diff/diffManager';
import { IAiRunner, StatusCallback, ProgressCallback } from './aiRunner';

// ---- Types matching claude CLI stream-json output ----

interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: {
    file_path?: string;
    [key: string]: unknown;
  };
}

interface AssistantMessage {
  role: 'assistant';
  content: Array<ToolUseContent | { type: string }>;
}

interface AssistantEvent {
  type: 'assistant';
  message: AssistantMessage;
}

interface ToolResultEvent {
  type: 'tool';
  tool_use_id: string;
  content: string;
}

interface ResultEvent {
  type: 'result';
  subtype: 'success' | 'error_during_execution' | 'error_max_turns';
  is_error: boolean;
  result?: string;
}

type ClaudeEvent =
  | AssistantEvent
  | ToolResultEvent
  | ResultEvent
  | { type: string };

// File-editing tool names to intercept
const FILE_EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

export type { StatusCallback, ProgressCallback };

export class ClaudeRunner implements IAiRunner {
  readonly toolName = 'claude';
  private currentProc: cp.ChildProcess | undefined;

  constructor(private readonly diffManager: DiffManager) {}

  cancel(): void {
    try {
      this.currentProc?.kill();
    } catch {
      // process may have already exited
    }
    this.currentProc = undefined;
  }

  /**
   * Claude CLI có thể trả về path tương đối so với workingDir.
   * Nếu extension host resolve sai base dir thì sẽ snapshot/openDiff nhầm file.
   */
  private resolveToolFilePath(filePath: string, workingDir: string): string {
    // path.isAbsolute trên win32 xử lý tốt cả "C:\\..." và "D:/..."
    if (path.isAbsolute(filePath)) { return filePath; }
    return path.resolve(workingDir, filePath);
  }

  getSettingsFilePath(): string {
    const homeDir = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
    return path.join(homeDir, '.claude', 'settings.json');
  }

  getFileEditToolNames(): string[] {
    return ['Write', 'Edit', 'MultiEdit'];
  }

  /**
   * Finds the claude CLI executable on Windows.
   * Tries PATH lookup first, then falls back to the known install location.
   */
  private findClaudeCli(): string {
    const candidates = ['claude', 'claude.cmd', 'claude.exe'];

    // Try each candidate via `where` (Windows) / `which` (unix)
    const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
    for (const candidate of candidates) {
      try {
        const result = cp.spawnSync(
          lookupCmd,
          [candidate.replace(/\.(cmd|exe)$/, '')],
          { encoding: 'utf8', timeout: 3000 }
        );
        if (result.status === 0 && result.stdout.trim()) {
          return candidate;
        }
      } catch {
        // ignore — try next candidate
      }
    }

    // Fallback: check known Windows install path
    const homeDir =
      process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
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

    throw new Error(
      'claude CLI not found.\n' +
        'Install Claude Code and ensure "claude" is on your PATH.\n' +
        'Tip: add %USERPROFILE%\\.local\\bin to your PATH environment variable.'
    );
  }

  /**
   * Runs a claude session with the given prompt.
   * Fires onStatus callbacks to report state changes.
   */
  async run(
    prompt: string,
    workingDir: string,
    onStatus: StatusCallback,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const claudePath = this.findClaudeCli();

    return new Promise<void>((resolve, reject) => {
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
      const pendingToolUses = new Map<string, string>();

      onProgress?.('Claude is thinking\u2026');

      proc.stdout.on('data', (chunk: Buffer) => {
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

      proc.stderr.on('data', (chunk: Buffer) => {
        console.error('[claude stderr]', chunk.toString('utf8').trimEnd());
      });

      onStatus('running');

      proc.on('close', (code) => {
        if (this.currentProc === proc) { this.currentProc = undefined; }
        onStatus('idle');
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`claude exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        if (this.currentProc === proc) { this.currentProc = undefined; }
        onStatus('error', err.message);
        reject(err);
      });
    });
  }

  /**
   * Parses one complete NDJSON line and dispatches to diffManager.
   */
  private handleLine(
    line: string,
    pendingToolUses: Map<string, string>,
    workingDir: string,
    onProgress?: ProgressCallback
  ): void {
    let event: ClaudeEvent;
    try {
      event = JSON.parse(line) as ClaudeEvent;
    } catch {
      console.warn(
        '[ai-cli-diff-view] Skipping non-JSON line:',
        line.slice(0, 120)
      );
      return;
    }

    if (event.type === 'assistant') {
      const assistantEvent = event as AssistantEvent;
      for (const item of assistantEvent.message.content) {
        if (item.type !== 'tool_use') {
          continue;
        }
        const toolUse = item as ToolUseContent;
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
        this.diffManager.snapshotBefore(filePath).catch((err: unknown) => {
          console.error('[ai-cli-diff-view] snapshotBefore failed:', err);
        });
      }
      return;
    }

    if (event.type === 'tool') {
      const toolEvent = event as ToolResultEvent;
      const filePath = pendingToolUses.get(toolEvent.tool_use_id);
      if (filePath) {
        pendingToolUses.delete(toolEvent.tool_use_id);
        const basename = filePath.split(/[\\/]/).pop() ?? filePath;
        onProgress?.(`Opening diff: ${basename}`);
        this.diffManager.openDiff(filePath).catch((err: unknown) => {
          console.error('[ai-cli-diff-view] openDiff failed:', err);
        });
      }
      return;
    }

    if (event.type === 'result' && (event as ResultEvent).is_error) {
      console.error(
        '[ai-cli-diff-view] Session error:',
        (event as ResultEvent).result ?? '(no details)'
      );
    }
  }
}
