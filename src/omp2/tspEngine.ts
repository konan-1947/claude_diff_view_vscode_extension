import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { commandLine } from '../omp/ompRpcProcess';
import { findOmpCli } from '../omp/ompCli';
import { getFreshEnv } from '../terminal/freshEnv';
import { PtySession } from '../terminal/ptySession';

/**
 * OMP2 (experimental): the real omp TUI, run in a PTY that pretends to be the
 * Tern terminal. omp then describes its whole screen over the Tern Surface
 * Protocol (TSP, docs.stencil.so/tern/protocol) instead of painting cells, and
 * res/webview/omp2/tspView.js draws that document as HTML.
 *
 * Wire (in-band on the PTY): program → terminal `ESC _ tsp;<verb>;<json> ESC \\`
 * (q query, o open surface, f frame of ops, b blob, s stylesheet, x close);
 * terminal → program the same with r (reply) and e (event). ConPTY drops APC
 * on its input side, so on Windows replies and events go as OSC 877.
 *
 * The engine keeps the document so a rebuilt webview gets it back (snapshot()).
 */

const ESC = '\x1b';
const ST = ESC + '\\';
/** Tern version announced in the env and the hello reply (omp only checks the protocol version). */
const TERN_VERSION = '0.9.36';
/** Every node kind of TSP v1: omp falls back to rows for a kind the hello reply lacks. */
const KINDS = ['col', 'row', 'card', 'section', 'rule', 'spacer', 'text', 'md', 'code', 'diff', 'ansi', 'math',
  'image', 'media', 'kv', 'stats', 'table', 'tree', 'json', 'badge', 'kbd', 'icon', 'spinner', 'shimmer', 'elapsed', 'progress',
  'rate', 'list', 'item', 'tabs', 'editor', 'input', 'button', 'status', 'seg', 'overlay', 'toast', 'rows', 'picker', 'prefs',
  'tool', 'checklist', 'agent', 'chart', 'meter', 'block', 'effort', 'select', 'switch', 'slider', 'field', 'otp',
  'buttons', 'avatar', 'avatars', 'breadcrumb', 'pager', 'empty', 'skeleton', 'calendar', 'date', 'menu', 'menubar',
  'nav', 'split', 'scroll', 'carousel', 'message', 'attachment', 'trace', 'stacktrace', 'suggestions', 'questions', 'el'];
const FEATURES = ['blobs', 'settle', 'adopt', 'dock', 'reduce-motion', 'aside', 'scroll', 'styles', 'flow', 'font'];
const CELL = { w: 8, h: 17 };
/** Longest APC string kept while waiting for its terminator (Tern's own limit). */
const MAX_APC = 262144;

export interface TspNode { k: string; p: Record<string, unknown>; c: string[]; parent: string | null }

/** Whole document, sent to a newly attached webview. */
export interface TspSnapshot {
  sf: string | null;
  nodes: Record<string, TspNode>;
  focus: string | null;
  blobs: Record<string, { mime: string; data: string }>;
}

/** What the webview of this tab hears. */
export type TspMessage =
  | { t: 'reset'; snap: TspSnapshot }
  | { t: 'ops'; ops: unknown[][] }
  | { t: 'blob'; id: string; mime: string; data: string };

type RawNode = { id: string; k: string; p?: Record<string, unknown>; c?: RawNode[] };

export class TspEngine implements vscode.Disposable {
  private pty: PtySession | undefined;
  private subs: vscode.Disposable[] = [];
  private buf = '';
  private chunk: { c: string; verb: string; params: Record<string, string>; body: string } | undefined;
  private sf: string | null = null;
  private nodes = new Map<string, TspNode>();
  private focus: string | null = null;
  private blobs = new Map<string, { mime: string; data: string }>();
  private cols: number;
  private rows: number;

  private readonly _onMessage = new vscode.EventEmitter<TspMessage>();
  readonly onMessage = this._onMessage.event;
  private readonly _onTitle = new vscode.EventEmitter<string>();
  readonly onTitle = this._onTitle.event;
  /** omp reports idle / working / done with OSC 7501 (Tern's tab state). */
  private readonly _onState = new vscode.EventEmitter<string>();
  readonly onState = this._onState.event;
  private readonly _onExit = new vscode.EventEmitter<number>();
  readonly onExit = this._onExit.event;
  private readonly _onError = new vscode.EventEmitter<string>();
  readonly onError = this._onError.event;

  constructor(private readonly cwd: string, cols: number, rows: number) {
    this.cols = Math.max(20, cols | 0);
    this.rows = Math.max(5, rows | 0);
  }

  start(): void {
    this.stopPty();
    this.buf = '';
    this.chunk = undefined;
    this.sf = null;
    this.nodes.clear();
    this.focus = null;
    this._onMessage.fire({ t: 'reset', snap: this.snapshot() });
    const env = { ...getFreshEnv() };
    for (const key of ['TMUX', 'TMUX_PANE', 'STY', 'ZELLIJ', 'TERN_TSP']) delete env[key];
    Object.assign(env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'tern',
      TERM_PROGRAM_VERSION: TERN_VERSION,
      // Speak TSP even where omp's own checks would keep the classic renderer.
      PI_TUI_NATIVE: '1',
    });
    const cmd = commandLine(findOmpCli(), []);
    const pty = new PtySession();
    this.pty = pty;
    this.subs.push(
      pty.onData((data) => this.onOutput(data)),
      pty.onExit((code) => this._onExit.fire(code)),
      pty.onError((message) => this._onError.fire(message)),
    );
    pty.start(this.cwd, this.cols, this.rows, {
      file: cmd.file,
      args: cmd.verbatim ? cmd.args.join(' ') : cmd.args,
      env,
    });
  }

  /** Key bytes typed in the tab. */
  write(data: string): void {
    this.pty?.write(data);
  }

  /** A pointer action from the webview (TSP event body); `sf` is filled in. */
  sendEvent(ev: Record<string, unknown>): void {
    if (!this.sf || typeof ev.ev !== 'string') return;
    this.send('e', { ...ev, sf: this.sf });
  }

  resize(cols: number, rows: number): void {
    this.cols = Math.max(20, cols | 0);
    this.rows = Math.max(5, rows | 0);
    this.pty?.resize(this.cols, this.rows);
    if (this.sf) this.send('e', { ev: 'resize', sf: this.sf, cols: this.cols, cell: CELL, visible: true });
  }

  snapshot(): TspSnapshot {
    return {
      sf: this.sf,
      nodes: Object.fromEntries(this.nodes),
      focus: this.focus,
      blobs: Object.fromEntries(this.blobs),
    };
  }

  dispose(): void {
    this.stopPty();
    this._onMessage.dispose();
    this._onTitle.dispose();
    this._onState.dispose();
    this._onExit.dispose();
    this._onError.dispose();
  }

  // ---- output --------------------------------------------------------------

  private onOutput(data: string): void {
    this.buf += data;
    for (;;) {
      const start = this.buf.indexOf(ESC + '_');
      if (start < 0) {
        // Keep a trailing ESC: it may start the next APC.
        const keep = this.buf.endsWith(ESC) ? 1 : 0;
        this.onPlain(this.buf.slice(0, this.buf.length - keep));
        this.buf = keep ? ESC : '';
        return;
      }
      if (start > 0) {
        this.onPlain(this.buf.slice(0, start));
        this.buf = this.buf.slice(start);
      }
      const end = this.buf.indexOf(ST);
      if (end < 0) {
        if (this.buf.length > MAX_APC) this.buf = '';
        return;
      }
      const apc = this.buf.slice(2, end);
      this.buf = this.buf.slice(end + 2);
      if (apc.startsWith('tsp;')) {
        try { this.onTsp(apc.slice(4)); } catch (err) { console.warn('[omp2] TSP message failed', err); }
      }
    }
  }

  /** Bytes outside TSP: terminal queries to answer, the title, omp's state. */
  private onPlain(text: string): void {
    if (!text) return;
    if (/\x1b\[0?c/.test(text)) this.pty?.write(ESC + '[?62;52;c');
    if (text.includes(ESC + '[6n')) this.pty?.write(ESC + '[1;1R');
    if (text.includes(ESC + ']11;?')) this.pty?.write(ESC + ']11;' + (isDarkTheme() ? 'rgb:1e1e/1e1e/1e1e' : 'rgb:ffff/ffff/ffff') + ST);
    if (text.includes(ESC + ']10;?')) this.pty?.write(ESC + ']10;' + (isDarkTheme() ? 'rgb:d4d4/d4d4/d4d4' : 'rgb:3333/3333/3333') + ST);
    const title = /\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)/.exec(text);
    if (title) this._onTitle.fire(title[1]);
    const state = /\x1b\]7501;state=([a-z]+)/.exec(text);
    if (state) this._onState.fire(state[1]);
  }

  private onTsp(message: string): void {
    const m = /^([a-z]);/.exec(message);
    if (!m) return;
    const verb = m[1];
    let rest = message.slice(2);
    const params: Record<string, string> = {};
    for (;;) {
      const pm = /^([A-Za-z0-9_-]+)=([!-:<-~]*);/.exec(rest);
      if (!pm) break;
      params[pm[1]] = pm[2];
      rest = rest.slice(pm[0].length);
    }
    if (params.c) {
      if (!this.chunk || this.chunk.c !== params.c || this.chunk.verb !== verb) {
        this.chunk = { c: params.c, verb, params, body: '' };
      }
      this.chunk.body += rest;
      if (params.m === '1') return;
      rest = this.chunk.body;
      Object.assign(params, this.chunk.params);
      this.chunk = undefined;
    }
    if (verb === 'b') {
      this.onBlob(rest, params.mime);
      return;
    }
    let body: any;
    try { body = JSON.parse(rest); } catch { return; }
    switch (verb) {
      case 'q':
        if (body.q === 'hello') this.send('r', this.hello());
        else if (body.q === 'blobs') {
          const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
          this.send('r', { r: 'blobs', have: ids.filter((id) => this.blobs.has(id)) });
        }
        return;
      case 'o':
        if (this.sf !== body.id) {
          this.sf = typeof body.id === 'string' ? body.id : null;
          this.nodes.clear();
          this.focus = null;
          this._onMessage.fire({ t: 'reset', snap: this.snapshot() });
        }
        return;
      case 'f': {
        const ops: unknown[][] = Array.isArray(body.ops) ? body.ops : [];
        for (const op of ops) {
          try { this.apply(op); } catch { /* one bad op never drops the frame */ }
        }
        if (body.sf !== undefined) this.send('e', { ev: 'ack', sf: body.sf, s: body.s });
        this._onMessage.fire({ t: 'ops', ops });
        return;
      }
      case 'x':
        if (body.id === this.sf && body.keep === false) {
          this.nodes.clear();
          this._onMessage.fire({ t: 'reset', snap: this.snapshot() });
        }
        return;
      default:
        return; // s (stylesheets) and t (obsolete) are not drawn
    }
  }

  private onBlob(base64: string, mime = ''): void {
    const id = crypto.createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');
    if (this.blobs.has(id)) return;
    this.blobs.set(id, { mime, data: base64 });
    this._onMessage.fire({ t: 'blob', id, mime, data: base64 });
  }

  private hello(): Record<string, unknown> {
    return {
      r: 'hello', v: 1, term: 'tern', ver: TERN_VERSION,
      kinds: KINDS, features: FEATURES, apc: 65536, credits: 2,
      cols: this.cols, cell: CELL, dark: isDarkTheme(), reduceMotion: false, hour12: false,
    };
  }

  private send(verb: 'r' | 'e', body: Record<string, unknown>): void {
    const json = JSON.stringify(body);
    // ConPTY's input parser discards APC strings but passes OSC through.
    const framed = process.platform === 'win32'
      ? ESC + ']877;tsp;' + verb + ';' + json + ST
      : ESC + '_tsp;' + verb + ';' + json + ST;
    this.pty?.write(framed);
  }

  // ---- document ------------------------------------------------------------

  private apply(op: unknown[]): void {
    const [verb, id] = op as [string, string];
    switch (verb) {
      case 'add': {
        const parent = op[2] as string;
        const before = op[3] as string | null;
        const node = op[4] as RawNode;
        if (!this.nodes.has(parent)) this.nodes.set(parent, { k: 'surface', p: {}, c: [], parent: null });
        if (this.nodes.has(node.id)) this.remove(node.id);
        this.addTree(node, parent);
        insertChild(this.nodes.get(parent)!.c, node.id, before);
        return;
      }
      case 'set': {
        const n = this.nodes.get(id);
        if (!n) return;
        for (const [key, value] of Object.entries((op[2] ?? {}) as Record<string, unknown>)) {
          if (value === null) delete n.p[key];
          else n.p[key] = value;
        }
        return;
      }
      case 'del':
        this.remove(id);
        return;
      case 'text': {
        const n = this.nodes.get(id);
        if (!n) return;
        const text = String(op[3] ?? '');
        n.p.text = op[2] === 'append' ? String(n.p.text ?? '') + text : text;
        return;
      }
      case 'splice': {
        const n = this.nodes.get(id);
        if (!n) return;
        const s = String(n.p.text ?? '');
        const at = Number(op[2]) || 0;
        const del = Number(op[3]) || 0;
        n.p.text = s.slice(0, at) + String(op[4] ?? '') + s.slice(at + del);
        return;
      }
      case 'move': {
        const n = this.nodes.get(id);
        const parent = this.nodes.get(op[2] as string);
        if (!n || !parent) return;
        const old = n.parent ? this.nodes.get(n.parent) : undefined;
        if (old) old.c = old.c.filter((c) => c !== id);
        n.parent = op[2] as string;
        insertChild(parent.c, id, op[3] as string | null);
        return;
      }
      case 'focus':
        this.focus = (id as string | null) ?? null;
        return;
      default:
        return; // settle, reveal, scroll: view-only, handled by the webview
    }
  }

  private addTree(node: RawNode, parent: string): void {
    this.nodes.set(node.id, { k: node.k, p: { ...(node.p ?? {}) }, c: (node.c ?? []).map((c) => c.id), parent });
    for (const child of node.c ?? []) this.addTree(child, node.id);
  }

  private remove(id: string): void {
    const n = this.nodes.get(id);
    if (!n) return;
    for (const c of n.c) this.removeSubtree(c);
    this.nodes.delete(id);
    const parent = n.parent ? this.nodes.get(n.parent) : undefined;
    if (parent) parent.c = parent.c.filter((c) => c !== id);
  }

  private removeSubtree(id: string): void {
    const n = this.nodes.get(id);
    if (!n) return;
    for (const c of n.c) this.removeSubtree(c);
    this.nodes.delete(id);
  }

  private stopPty(): void {
    for (const d of this.subs.splice(0)) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    try { this.pty?.dispose(); } catch { /* ignore */ }
    this.pty = undefined;
  }
}

function insertChild(list: string[], id: string, before: string | null): void {
  const at = before == null ? -1 : list.indexOf(before);
  if (at < 0) list.push(id);
  else list.splice(at, 0, id);
}

function isDarkTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return kind !== vscode.ColorThemeKind.Light && kind !== vscode.ColorThemeKind.HighContrastLight;
}
