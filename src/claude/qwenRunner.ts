/**
 * qwenRunner.ts
 *
 * AI Runner cho Qwen CLI (qwen-code).
 * Dựa trên claudeRunner.ts, điều chỉnh theo output format thực tế của Qwen CLI.
 *
 * Các điểm khác biệt với Claude CLI (đã verify bằng test thực tế):
 *   - Lệnh: `qwen` thay vì `claude`
 *   - Tool names file-editing: `write_file`, `edit` (không có MultiEdit)
 *   - Event tool done: type "user" + content[].type "tool_result" (thay vì type "tool")
 *   - Settings path: ~/.qwen/settings.json
 */

import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DiffManager } from '../diff/diffManager';
import { IAiRunner, StatusCallback, ProgressCallback } from './aiRunner';

// ---- Types matching qwen CLI stream-json output ----

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

/** Qwen dùng type "user" cho tool result, không phải type "tool" như Claude */
interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  is_error: boolean;
  content: string;
}

interface UserEvent {
  type: 'user';
  message: {
    role: 'user';
    content: Array<ToolResultContent | { type: string }>;
  };
}

interface ResultEvent {
  type: 'result';
  subtype: 'success' | 'error_during_execution' | 'error_max_turns';
  is_error: boolean;
  result?: string;
}

type QwenEvent =
  | AssistantEvent
  | UserEvent
  | ResultEvent
  | { type: string };

// Tên tool file-editing của Qwen CLI (đã xác nhận qua test thực tế)
const FILE_EDIT_TOOLS = new Set(['write_file', 'edit']);

export class QwenRunner implements IAiRunner {
  readonly toolName = 'qwen';

  constructor(private readonly diffManager: DiffManager) {}

  getSettingsFilePath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.qwen', 'settings.json');
  }

  getFileEditToolNames(): string[] {
    return ['write_file', 'edit'];
  }

  /**
   * Tìm qwen CLI executable trên PATH.
   */
  private findQwenCli(): string {
    const candidates = ['qwen', 'qwen.cmd', 'qwen.exe'];
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
        // thử candidate tiếp theo
      }
    }

    throw new Error(
      'qwen CLI not found.\n' +
      'Install Qwen Code: npm install -g @qwen-code/cli\n' +
      'Ensure "qwen" is on your PATH.'
    );
  }

  /**
   * Chạy một session Qwen với prompt cho trước.
   */
  async run(
    prompt: string,
    workingDir: string,
    onStatus: StatusCallback,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const qwenPath = this.findQwenCli();

    return new Promise<void>((resolve, reject) => {
      const args = [
        '--output-format', 'stream-json',
        '--approval-mode', 'auto-edit',
        '-p', prompt,
      ];

      const proc = cp.spawn(qwenPath, args, {
        cwd: workingDir,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let lineBuffer = '';
      // Maps tool_use_id -> file_path cho các tool call đang pending
      const pendingToolUses = new Map<string, string>();

      onProgress?.('Qwen is thinking\u2026');

      proc.stdout.on('data', (chunk: Buffer) => {
        lineBuffer += chunk.toString('utf8');
        const lines = lineBuffer.split('\n');
        for (let i = 0; i < lines.length - 1; i++) {
          const line = (lines[i] ?? '').trim();
          if (line.length > 0) {
            this.handleLine(line, pendingToolUses, onProgress);
          }
        }
        lineBuffer = lines[lines.length - 1] ?? '';
      });

      proc.stdout.on('end', () => {
        const remaining = lineBuffer.trim();
        if (remaining.length > 0) {
          this.handleLine(remaining, pendingToolUses, onProgress);
        }
        lineBuffer = '';
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        console.error('[claude-diff-view] qwen stderr:', chunk.toString('utf8').trimEnd());
      });

      onStatus('running');

      proc.on('close', (code) => {
        onStatus('idle');
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`qwen exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        onStatus('error', err.message);
        reject(err);
      });
    });
  }

  /**
   * Parse một dòng NDJSON và dispatch sang diffManager.
   */
  private handleLine(
    line: string,
    pendingToolUses: Map<string, string>,
    onProgress?: ProgressCallback
  ): void {
    let event: QwenEvent;
    try {
      event = JSON.parse(line) as QwenEvent;
    } catch {
      console.warn('[claude-diff-view] qwenRunner: skipping non-JSON line:', line.slice(0, 120));
      return;
    }

    // Qwen: assistant event chứa tool_use — snapshot file trước khi sửa
    if (event.type === 'assistant') {
      const assistantEvent = event as AssistantEvent;
      for (const item of assistantEvent.message.content) {
        if (item.type !== 'tool_use') { continue; }
        const toolUse = item as ToolUseContent;
        if (!FILE_EDIT_TOOLS.has(toolUse.name)) { continue; }

        const filePath = toolUse.input.file_path;
        if (!filePath) { continue; }

        pendingToolUses.set(toolUse.id, filePath);
        const basename = filePath.split(/[\\\/]/).pop() ?? filePath;
        onProgress?.(`${toolUse.name}: ${basename}`);

        this.diffManager.snapshotBefore(filePath).catch((err: unknown) => {
          console.error('[claude-diff-view] qwenRunner: snapshotBefore failed:', err);
        });
      }
      return;
    }

    // Qwen: user event chứa tool_result — mở diff sau khi file đã được sửa
    if (event.type === 'user') {
      const userEvent = event as UserEvent;
      for (const item of userEvent.message.content) {
        if (item.type !== 'tool_result') { continue; }
        const toolResult = item as ToolResultContent;
        const filePath = pendingToolUses.get(toolResult.tool_use_id);
        if (!filePath) { continue; }

        pendingToolUses.delete(toolResult.tool_use_id);
        const basename = filePath.split(/[\\\/]/).pop() ?? filePath;
        onProgress?.(`Opening diff: ${basename}`);

        this.diffManager.openDiff(filePath).catch((err: unknown) => {
          console.error('[claude-diff-view] qwenRunner: openDiff failed:', err);
        });
      }
      return;
    }

    if (event.type === 'result' && (event as ResultEvent).is_error) {
      console.error(
        '[claude-diff-view] qwenRunner: session error:',
        (event as ResultEvent).result ?? '(no details)'
      );
    }
  }
}
