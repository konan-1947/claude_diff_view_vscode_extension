import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Terminal as HeadlessTerminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import { PtySession } from './ptySession';
import { SessionSnapshot } from './terminalTypes';

const SCROLLBACK_LINES = 3000;

interface SessionRecord {
  pty: PtySession;
  subs: vscode.Disposable[];
  title: string;
  cols: number;
  rows: number;
  /** Mirror of the screen, so a webview created later can be redrawn exactly. */
  mirror: HeadlessTerminal;
  serializer: SerializeAddon;
  titleSub: vscode.Disposable;
  rawTitle: string;
  exited: boolean;
  exitCode: number;
}

/**
 * PTY sessions shared by every terminal webview (Secondary Side Bar view and the
 * Agent mode panel). Webviews come and go — a view hidden by a `when` clause is
 * disposed — while the shells keep running here.
 */
export class TerminalSessionStore implements vscode.Disposable {
  private readonly sessions = new Map<string, SessionRecord>();
  private nextSessionNum = 0;
  activeId: string | undefined;

  private readonly _onCreated = new vscode.EventEmitter<{ id: string; title: string }>();
  readonly onCreated = this._onCreated.event;
  private readonly _onClosed = new vscode.EventEmitter<string>();
  readonly onClosed = this._onClosed.event;
  private readonly _onData = new vscode.EventEmitter<{ id: string; data: string }>();
  readonly onData = this._onData.event;
  private readonly _onExit = new vscode.EventEmitter<{ id: string; code: number }>();
  readonly onExit = this._onExit.event;
  private readonly _onError = new vscode.EventEmitter<{ id: string; message: string }>();
  readonly onError = this._onError.event;

  get size(): number {
    return this.sessions.size;
  }

  create(cols: number, rows: number): string {
    this.nextSessionNum += 1;
    const id = `s${this.nextSessionNum}`;
    const title = resolveShellName();
    const safeCols = Math.max(1, cols | 0);
    const safeRows = Math.max(1, rows | 0);
    const mirror = new HeadlessTerminal({
      cols: safeCols,
      rows: safeRows,
      scrollback: SCROLLBACK_LINES,
      allowProposedApi: true,
    });
    const serializer = new SerializeAddon();
    // The addon is typed against @xterm/xterm; the headless Terminal exposes the same buffer API.
    mirror.loadAddon(serializer as unknown as Parameters<HeadlessTerminal['loadAddon']>[0]);
    const rec: SessionRecord = {
      pty: new PtySession(),
      subs: [],
      title,
      cols: safeCols,
      rows: safeRows,
      mirror,
      serializer,
      titleSub: { dispose: () => undefined },
      rawTitle: '',
      exited: false,
      exitCode: 0,
    };
    rec.titleSub = mirror.onTitleChange((next) => { rec.rawTitle = next; });
    this.sessions.set(id, rec);
    this.startPty(id, rec);
    this.activeId = id;
    this._onCreated.fire({ id, title });
    return id;
  }

  /** Closes a session; the last one closed is replaced so a terminal always exists. */
  close(id: string): void {
    const rec = this.sessions.get(id);
    if (!rec) {
      return;
    }
    this.disposeRecord(rec);
    this.sessions.delete(id);
    if (this.activeId === id) {
      this.activeId = undefined;
    }
    this._onClosed.fire(id);
    if (this.sessions.size === 0) {
      this.create(80, 24);
    }
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const rec = this.sessions.get(id);
    if (!rec) {
      return;
    }
    rec.cols = Math.max(1, cols | 0);
    rec.rows = Math.max(1, rows | 0);
    rec.pty.resize(rec.cols, rec.rows);
    try { rec.mirror.resize(rec.cols, rec.rows); } catch { /* ignore */ }
  }

  /** Starts a fresh shell under the same id after the previous one exited. */
  restart(id: string): void {
    const rec = this.sessions.get(id);
    if (!rec) {
      return;
    }
    for (const d of rec.subs.splice(0)) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    try { rec.pty.dispose(); } catch { /* ignore */ }
    rec.pty = new PtySession();
    rec.exited = false;
    rec.mirror.reset();
    this.startPty(id, rec);
  }

  /**
   * Serialized screen of every session. Waits for the mirrors to finish parsing
   * what was already written; output arriving later is delivered as live `data`.
   */
  async snapshot(): Promise<SessionSnapshot[]> {
    const records = Array.from(this.sessions.entries());
    await Promise.all(records.map(([, rec]) => new Promise<void>((resolve) => rec.mirror.write('', resolve))));
    return records
      .filter(([id]) => this.sessions.has(id))
      .map(([id, rec]) => ({
        id,
        title: rec.title,
        rawTitle: rec.rawTitle,
        serialized: rec.serializer.serialize(),
        cols: rec.mirror.cols,
        rows: rec.mirror.rows,
        exited: rec.exited,
        exitCode: rec.exitCode,
      }));
  }

  dispose(): void {
    for (const rec of this.sessions.values()) {
      this.disposeRecord(rec);
    }
    this.sessions.clear();
    this._onCreated.dispose();
    this._onClosed.dispose();
    this._onData.dispose();
    this._onExit.dispose();
    this._onError.dispose();
  }

  private startPty(id: string, rec: SessionRecord): void {
    const pty = rec.pty;
    rec.subs.push(
      pty.onData((data) => {
        rec.mirror.write(data);
        this._onData.fire({ id, data });
      }),
      pty.onExit((code) => {
        rec.exited = true;
        rec.exitCode = code;
        this._onExit.fire({ id, code });
      }),
      pty.onError((message) => {
        this._onError.fire({ id, message });
      }),
    );
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
    pty.start(cwd, rec.cols, rec.rows);
  }

  private disposeRecord(rec: SessionRecord): void {
    for (const d of rec.subs) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    try { rec.pty.dispose(); } catch { /* ignore */ }
    try { rec.titleSub.dispose(); } catch { /* ignore */ }
    try { rec.mirror.dispose(); } catch { /* ignore */ }
  }
}

function resolveShellName(): string {
  const shell =
    vscode.env.shell ||
    process.env['ComSpec'] ||
    (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
  const base = path.basename(shell);
  return base.replace(/\.exe$/i, '');
}
