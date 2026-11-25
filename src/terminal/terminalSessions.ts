import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Terminal as HeadlessTerminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import { PtySession } from './ptySession';
import { LayoutNode, SessionKind, SessionSnapshot } from './terminalTypes';

const SCROLLBACK_LINES = 3000;
const CLAUDE_TITLE_FALLBACK = 'Claude Code';

interface BaseRecord {
  id: string;
  kind: SessionKind;
  title: string;
  rawTitle: string;
  exited: boolean;
  exitCode: number;
  cols: number;
  rows: number;
}

interface TerminalRecord extends BaseRecord {
  kind: 'terminal';
  pty: PtySession;
  subs: vscode.Disposable[];
  /** Mirror of the screen, so a webview created later can be redrawn exactly. */
  mirror: HeadlessTerminal;
  serializer: SerializeAddon;
  titleSub: vscode.Disposable;
}

/**
 * A Claude UI tab. The conversation itself runs in the uic backend
 * (src/claude/services) and is drawn by the tab's iframe; the store only keeps
 * what a rebuilt tab needs: its title and the Claude session to resume.
 */
interface ClaudeRecord extends BaseRecord {
  kind: 'claude';
  sessionId?: string;
}

type SessionRecord = TerminalRecord | ClaudeRecord;

/**
 * Sessions shared by every terminal webview (Secondary Side Bar view and the
 * Agent mode panel). Webviews come and go — a view hidden by a `when` clause is
 * disposed — while the shells and Claude processes keep running here.
 *
 * Two kinds of session live side by side:
 * - `terminal`: a PTY mirrored into a headless xterm, as before.
 * - `claude`: a Claude UI tab (uic chat app in an iframe, Agent SDK backend).
 */
export class TerminalSessionStore implements vscode.Disposable {
  private readonly sessions = new Map<string, SessionRecord>();
  private nextSessionNum = 0;
  activeId: string | undefined;
  /** Split layout of the tab groups, as last reported by a terminal webview. */
  layout: LayoutNode | undefined;

  private readonly _onCreated = new vscode.EventEmitter<{ id: string; title: string; kind: SessionKind }>();
  readonly onCreated = this._onCreated.event;
  private readonly _onClosed = new vscode.EventEmitter<string>();
  readonly onClosed = this._onClosed.event;
  private readonly _onData = new vscode.EventEmitter<{ id: string; data: string }>();
  readonly onData = this._onData.event;
  private readonly _onExit = new vscode.EventEmitter<{ id: string; code: number }>();
  readonly onExit = this._onExit.event;
  private readonly _onError = new vscode.EventEmitter<{ id: string; message: string }>();
  readonly onError = this._onError.event;
  private readonly _onTitle = new vscode.EventEmitter<{ id: string; title: string }>();
  readonly onTitle = this._onTitle.event;
  /** A tab should come to the front (a Claude UI tab asked for another one) */
  private readonly _onActivate = new vscode.EventEmitter<string>();
  readonly onActivate = this._onActivate.event;

  get size(): number {
    return this.sessions.size;
  }

  create(cols: number, rows: number): string {
    const id = this.nextId();
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
    const rec: TerminalRecord = {
      id,
      kind: 'terminal',
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
    this.startPty(rec);
    this.activeId = id;
    this._onCreated.fire({ id, title, kind: rec.kind });
    return id;
  }

  /** Opens a Claude UI tab; `sessionId` reopens that conversation. */
  createClaude(cols: number, rows: number, sessionId?: string): string {
    const id = this.nextId();
    const rec: ClaudeRecord = {
      id,
      kind: 'claude',
      title: CLAUDE_TITLE_FALLBACK,
      rawTitle: '',
      exited: false,
      exitCode: 0,
      cols: Math.max(1, cols | 0),
      rows: Math.max(1, rows | 0),
      sessionId,
    };
    this.sessions.set(id, rec);
    this.activeId = id;
    this._onCreated.fire({ id, title: rec.title, kind: rec.kind });
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
    const rec = this.sessions.get(id);
    if (rec?.kind === 'terminal') {
      rec.pty.write(data);
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const rec = this.sessions.get(id);
    if (!rec) {
      return;
    }
    rec.cols = Math.max(1, cols | 0);
    rec.rows = Math.max(1, rows | 0);
    if (rec.kind !== 'terminal') {
      return;
    }
    rec.pty.resize(rec.cols, rec.rows);
    try { rec.mirror.resize(rec.cols, rec.rows); } catch { /* ignore */ }
  }

  /** Starts a fresh shell under the same id after the previous one exited. */
  restart(id: string): void {
    const rec = this.sessions.get(id);
    if (rec?.kind !== 'terminal') {
      return;
    }
    for (const d of rec.subs.splice(0)) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    try { rec.pty.dispose(); } catch { /* ignore */ }
    rec.pty = new PtySession();
    rec.exited = false;
    rec.mirror.reset();
    this.startPty(rec);
  }

  // ---- Claude UI tabs --------------------------------------------------

  claudeIds(): string[] {
    return [...this.sessions.values()].filter((rec) => rec.kind === 'claude').map((rec) => rec.id);
  }

  isClaude(id: string): boolean {
    return this.sessions.get(id)?.kind === 'claude';
  }

  setClaudeTitle(id: string, title: string): void {
    const rec = this.claudeRecord(id);
    const next = title.trim() || CLAUDE_TITLE_FALLBACK;
    if (!rec || rec.title === next) {
      return;
    }
    rec.title = next;
    this._onTitle.fire({ id, title: next });
  }

  /** Another Claude UI tab (not `exceptId`) on this conversation, with its title */
  claudeTabForSession(sessionId: string, exceptId?: string): { tabId: string; title: string } | undefined {
    for (const rec of this.sessions.values()) {
      if (rec.kind === 'claude' && rec.id !== exceptId && rec.sessionId === sessionId) {
        return { tabId: rec.id, title: rec.title };
      }
    }
    return undefined;
  }

  activate(id: string): void {
    if (!this.sessions.has(id)) {
      return;
    }
    this.activeId = id;
    this._onActivate.fire(id);
  }

  setClaudeSession(id: string, sessionId: string): void {
    const rec = this.claudeRecord(id);
    if (rec) {
      rec.sessionId = sessionId;
    }
  }

  /**
   * Serialized screen of every session. Waits for the mirrors to finish parsing
   * what was already written; output arriving later is delivered as live `data`.
   */
  async snapshot(): Promise<SessionSnapshot[]> {
    const records = Array.from(this.sessions.entries());
    await Promise.all(records.map(([, rec]) => (
      rec.kind === 'terminal'
        ? new Promise<void>((resolve) => rec.mirror.write('', resolve))
        : Promise.resolve()
    )));
    return records
      .filter(([id]) => this.sessions.has(id))
      .map(([id, rec]) => ({
        id,
        title: rec.title,
        rawTitle: rec.rawTitle,
        kind: rec.kind,
        serialized: rec.kind === 'terminal' ? rec.serializer.serialize() : '',
        cols: rec.cols,
        rows: rec.rows,
        exited: rec.exited,
        exitCode: rec.exitCode,
        resume: rec.kind === 'claude' ? rec.sessionId : undefined,
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
    this._onTitle.dispose();
    this._onActivate.dispose();
  }

  // ---- internals -------------------------------------------------------

  private nextId(): string {
    this.nextSessionNum += 1;
    return `s${this.nextSessionNum}`;
  }

  private claudeRecord(id: string): ClaudeRecord | undefined {
    const rec = this.sessions.get(id);
    return rec?.kind === 'claude' ? rec : undefined;
  }

  private startPty(rec: TerminalRecord): void {
    const pty = rec.pty;
    rec.subs.push(
      pty.onData((data) => {
        rec.mirror.write(data);
        this._onData.fire({ id: rec.id, data });
      }),
      pty.onExit((code) => {
        rec.exited = true;
        rec.exitCode = code;
        this._onExit.fire({ id: rec.id, code });
      }),
      pty.onError((message) => {
        this._onError.fire({ id: rec.id, message });
      }),
    );
    pty.start(sessionCwd(), rec.cols, rec.rows);
  }

  private disposeRecord(rec: SessionRecord): void {
    if (rec.kind === 'claude') {
      return;
    }
    for (const d of rec.subs) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    try { rec.pty.dispose(); } catch { /* ignore */ }
    try { rec.titleSub.dispose(); } catch { /* ignore */ }
    try { rec.mirror.dispose(); } catch { /* ignore */ }
  }
}

export function sessionCwd(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
}

function resolveShellName(): string {
  const shell =
    vscode.env.shell ||
    process.env['ComSpec'] ||
    (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');
  const base = path.basename(shell);
  return base.replace(/\.exe$/i, '');
}
