import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

/**
 * One `omp --mode rpc` process: JSON lines on stdin (commands) and stdout
 * (responses and frames). Protocol reference: docs/references/omp-rpc-wire.txt.
 *
 * - `request()` sends a command with an `id` and resolves with the matching
 *   `response` frame's `data` (rejects when `success` is false).
 * - every other frame (session events, `prompt_result`, `extension_ui_request`,
 *   `available_commands_update`, ...) goes to `onFrame`.
 */
export interface OmpRpcOptions {
  cliPath: string;
  cwd: string;
  /** Extra CLI arguments after `--mode rpc` (`--model`, `--resume`, `--no-session`...) */
  args?: string[];
  env?: NodeJS.ProcessEnv;
  onFrame: (frame: any) => void;
  onExit: (code: number | null, stderrTail: string) => void;
}

interface Pending {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const READY_TIMEOUT_MS = 30000;
const STDERR_TAIL_LINES = 20;

export class OmpRpcProcess {
  private proc?: ChildProcessWithoutNullStreams;
  private buffer = '';
  private seq = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly stderrTail: string[] = [];
  private exited = false;
  private readyResolve?: () => void;
  private readyReject?: (error: Error) => void;
  readonly ready: Promise<void>;

  constructor(private readonly options: OmpRpcOptions) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    // Nobody may await `ready` (a probe that fails early): keep the rejection handled
    this.ready.catch(() => undefined);
  }

  get isRunning(): boolean {
    return !!this.proc && !this.exited;
  }

  start(): void {
    const { cliPath, cwd, args = [], env } = this.options;
    const command = commandLine(cliPath, ['--mode', 'rpc', ...args]);
    const proc = spawn(command.file, command.args, {
      cwd,
      env: env ?? process.env,
      stdio: 'pipe',
      windowsHide: true,
      windowsVerbatimArguments: command.verbatim,
    });
    this.proc = proc;
    const readyTimer = setTimeout(() => {
      this.readyReject?.(new Error(`omp did not start within ${READY_TIMEOUT_MS / 1000}s`));
      this.kill();
    }, READY_TIMEOUT_MS);
    // omp died before 'exit' reached us: a write then fails with EPIPE, which
    // would be an uncaught exception without a listener
    proc.stdin.on('error', (error) => this.stderrTail.push(`stdin: ${error.message}`));

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => this.onStdout(chunk, readyTimer));
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.stderrTail.push(line);
        if (this.stderrTail.length > STDERR_TAIL_LINES) this.stderrTail.shift();
      }
    });
    proc.on('error', (error) => { clearTimeout(readyTimer); this.finish(null, error.message); });
    proc.on('exit', (code) => { clearTimeout(readyTimer); this.finish(code); });
  }

  /** Fire-and-forget command (no `id`, so its `response` frame is ignored). */
  send(command: Record<string, unknown>): void {
    if (!this.proc || this.exited) return;
    this.proc.stdin.write(JSON.stringify(command) + '\n');
  }

  /** Command with an `id`; resolves with the response's `data`. */
  request<T = any>(command: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
    if (!this.proc || this.exited) {
      return Promise.reject(new Error('omp is not running'));
    }
    const id = `h${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`omp did not answer ${String(command.type)} within ${timeoutMs / 1000}s`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc!.stdin.write(JSON.stringify({ ...command, id }) + '\n');
    });
  }

  kill(): void {
    if (!this.proc || this.exited) return;
    try { this.proc.stdin.end(); } catch { /* closed */ }
    try { this.proc.kill(); } catch { /* gone */ }
  }

  private onStdout(chunk: string, readyTimer: ReturnType<typeof setTimeout>): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf('\n');
      if (!line) continue;
      let frame: any;
      try {
        frame = JSON.parse(line);
      } catch {
        // omp prints nothing but JSON on stdout in RPC mode; keep stray text for errors
        this.stderrTail.push(line);
        continue;
      }
      if (frame?.type === 'ready') {
        clearTimeout(readyTimer);
        this.readyResolve?.();
        continue;
      }
      if (frame?.type === 'response' && typeof frame.id === 'string' && this.pending.has(frame.id)) {
        const pending = this.pending.get(frame.id)!;
        this.pending.delete(frame.id);
        clearTimeout(pending.timer);
        if (frame.success) pending.resolve(frame.data);
        else pending.reject(new Error(frame.error || `omp ${frame.command} failed`));
        continue;
      }
      try {
        this.options.onFrame(frame);
      } catch (error) {
        this.stderrTail.push(`frame handler failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private finish(code: number | null, error?: string): void {
    if (this.exited) return;
    this.exited = true;
    if (error) this.stderrTail.push(error);
    const tail = this.stderrTail.join('\n');
    const reason = new Error(tail || `omp exited with code ${code}`);
    this.readyReject?.(reason);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.pending.clear();
    this.options.onExit(code, tail);
  }
}

/**
 * How to start `cliPath` with `args`. Since Node 18.20 / 20.12 (CVE-2024-27980)
 * a `.cmd` / `.bat` cannot be spawned without a shell (EINVAL), so on Windows
 * those go through cmd.exe, each argument quoted (`/s` strips the outer quotes).
 */
export function commandLine(cliPath: string, args: string[]): { file: string; args: string[]; verbatim: boolean } {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(cliPath)) {
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    return {
      file: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `"${[cliPath, ...args].map(quote).join(' ')}"`],
      verbatim: true,
    };
  }
  return { file: cliPath, args, verbatim: false };
}
