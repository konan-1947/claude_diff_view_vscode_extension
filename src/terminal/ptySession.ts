import * as os from 'os';
import * as vscode from 'vscode';

type IPtyModule = typeof import('node-pty');
type IPty = ReturnType<IPtyModule['spawn']>;

export class PtySession {
  private proc: IPty | undefined;

  private readonly _onData = new vscode.EventEmitter<string>();
  readonly onData = this._onData.event;

  private readonly _onExit = new vscode.EventEmitter<number>();
  readonly onExit = this._onExit.event;

  private readonly _onError = new vscode.EventEmitter<string>();
  readonly onError = this._onError.event;

  isRunning(): boolean {
    return this.proc !== undefined;
  }

  start(cwd: string, cols: number, rows: number): void {
    if (this.proc) {
      return;
    }
    let ptyMod: IPtyModule;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ptyMod = require('node-pty') as IPtyModule;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this._onError.fire(`node-pty failed to load: ${msg}`);
      return;
    }

    const shell =
      vscode.env.shell ||
      process.env['ComSpec'] ||
      (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');

    try {
      this.proc = ptyMod.spawn(shell, [], {
        name: 'xterm-256color',
        cols: Math.max(1, cols),
        rows: Math.max(1, rows),
        cwd: cwd || os.homedir(),
        env: { ...process.env } as Record<string, string>,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this._onError.fire(`failed to spawn ${shell}: ${msg}`);
      return;
    }

    this.proc.onData((d) => this._onData.fire(d));
    this.proc.onExit(({ exitCode }) => {
      this._onExit.fire(exitCode);
      this.proc = undefined;
    });
  }

  write(data: string): void {
    this.proc?.write(data);
  }

  resize(cols: number, rows: number): void {
    if (!this.proc) {
      return;
    }
    try {
      this.proc.resize(Math.max(1, cols), Math.max(1, rows));
    } catch {
      // PTY can be in transient state during shutdown — ignore.
    }
  }

  dispose(): void {
    try {
      this.proc?.kill();
    } catch {
      // ignore
    }
    this.proc = undefined;
    this._onData.dispose();
    this._onExit.dispose();
    this._onError.dispose();
  }
}
