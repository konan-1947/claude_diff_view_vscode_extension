/**
 * diffManager.ts
 *
 * Snapshot + accept/revert state cho các file đang được AI sửa.
 * Render delegate hoàn toàn sang DiffEditorProvider (CustomTextEditorProvider).
 * Mỗi pending file = 1 tab webview riêng.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { calculateHunks, Hunk } from './hunkCalculator';
import { detectEol, fromLf, toLf } from './eol';
import { detectLanguageId } from './language';
import { exceedsLineLimit } from '../watcher/fileSizeLimit';
import { looksBinary } from '../watcher/fileTypeRules';
import { DIFF_EDITOR_VIEW_TYPE } from './diffWebviewPanel';
import { SnapshotStore, SnapshotState } from './snapshotStore';
import { sortLikePendingTree } from './treeOrder';
import { coalesce } from '../util/coalesce';

function normalizePath(filePath: string): string {
  const fsPath = vscode.Uri.file(path.resolve(filePath)).fsPath;
  return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
}

/**
 * Trả về path với case canonical từ OS (Windows preserve case từ disk).
 * Dùng khi gọi VS Code APIs để tab/tên file hiển thị đúng case như user.
 * Fallback về input nếu file không tồn tại.
 */
function canonicalCasePath(filePath: string): string {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return filePath;
  }
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof vscode.FileSystemError && error.code === 'FileNotFound';
}

export interface DiffPreviewFile {
  filePath: string;
  originalContent: string;
  currentContent: string;
  language: string;
  hunks: Hunk[];
}

/** Lightweight data for navigators that must not receive file contents. */
export interface DiffPreviewMetadata {
  filePath: string;
  additions: number;
  deletions: number;
  hunks: number;
}

/** What the right-hand side of a diff was read from, cheap to compare. */
type ContentStamp =
  | { document: vscode.TextDocument; version: number }
  | { mtime: number; size: number }
  | { missing: true };

function sameStamp(a: ContentStamp, b: ContentStamp): boolean {
  if ('document' in a) { return 'document' in b && a.document === b.document && a.version === b.version; }
  if ('mtime' in a) { return 'mtime' in b && a.mtime === b.mtime && a.size === b.size; }
  return 'missing' in b;
}

export class DiffManager {
  private _onDidChangeDiffs = new vscode.EventEmitter<void>();
  public readonly onDidChangeDiffs = this._onDidChangeDiffs.event;

  private snapshots: Map<string, SnapshotState> = new Map();
  /**
   * Pending files in Pending Files tree order + key -> position. Every tab diff asks
   * for its "n / N" on each onDidChangeDiffs, so this is rebuilt lazily once per
   * add/remove instead of scanning all pending files per tab (issue #37, HOT-3b).
   */
  private pendingOrder: { display: string[]; index: Map<string, number> } | undefined;
  /**
   * Diff stats per pending file for the PENDING FILES view, reused while neither
   * the snapshot nor the current content changed, so a refresh no longer reads
   * and diffs every pending file (issue #37, HOT-3e). Holds no file contents of
   * its own: `snapshot` is the same string the snapshot map already keeps.
   */
  private metadataCache = new Map<string, {
    snapshot: string;
    stamp: ContentStamp;
    metadata: DiffPreviewMetadata | undefined;
  }>();
  /** normalized key -> path with the real on-disk case, for display only. */
  private displayPaths: Map<string, string> = new Map();
  private readonly store: SnapshotStore;
  /**
   * Every save rewrites the whole snapshot map into workspaceState, so saving once
   * per file of an agent burst costs O(N²·S) (issue #37, HOT-2). Burst paths go
   * through scheduleSave(): the first save after a quiet spell still runs at once,
   * later ones in the same burst are merged. User actions keep saveNow().
   */
  private readonly saveSoon = coalesce(() => this.saveNow());
  private savePending = false;
  private lastSaveAt = 0;
  /** filePath (normalized) -> active webview panel. */
  private panels: Map<string, vscode.WebviewPanel> = new Map();
  /** filePath (normalized) -> last cursor + top visible line seen in Monaco modified editor. */
  private lastCursors: Map<string, { line: number; column: number; topLine?: number }> = new Map();

  /**
   * filePath (normalized) của tab đang active NGAY TRƯỚC khi WorkspaceWatcher
   * bắt đầu tự động mở diff cho 1 cụm external write (checkout đổi vài file
   * hay hàng loạt file đều tính, xem markActiveTabBeforeAutoOpen()). undefined
   * nghĩa là không có tab file nào active lúc đó (vd: đang ở terminal/sidebar)
   * — vẫn khác với "chưa ghi hint nào", phân biệt bằng pendingActiveTabCaptured.
   */
  private pendingActiveTabPath: string | undefined;
  private pendingActiveTabCaptured = false;
  private pendingActiveTabCapturedAt = 0;
  /**
   * Hint quá cũ (vd: cụm write đó rốt cuộc không phải git checkout nên
   * clearAll() không bao giờ chạy theo sau nó) thì bỏ qua, để lần clearAll()
   * không liên quan sau đó không lỡ dùng lại path cũ. Rộng hơn nhiều so với
   * holdMs tối đa (10s) + debounce xác nhận HEAD (1s).
   */
  private static readonly PENDING_ACTIVE_TAB_TTL_MS = 15000;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.store = new SnapshotStore(context.workspaceState);
    this.snapshots = this.store.load();
  }

  async snapshotBefore(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    if (this.snapshots.has(absPath)) {
      return;
    }
    const uri = vscode.Uri.file(absPath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch (err) {
      if (isFileNotFound(err)) {
        this.setSnapshot(absPath,{ content: '', fileExistedBefore: false });
        this.rememberDisplayPath(filePath);
        this.scheduleSave();
      }
      return;
    }

    try {
      const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      // Đường built-in runner cũng phải tôn trọng maxFileLines, nếu không setting
      // chỉ đúng với đường workspace watcher. Không snapshot -> openDiff() thoát
      // sớm vì không có snapshot -> file lớn không mở diff, đúng như mong đợi.
      if (looksBinary(content) || exceedsLineLimit(content)) { return; }
      this.setSnapshot(absPath,{ content, fileExistedBefore: true });
      this.rememberDisplayPath(filePath);
    } catch {
      // File có thể bị xóa hoặc không đọc được sau khi stat — không tạo snapshot rỗng.
      return;
    }
    this.scheduleSave();
  }

  async openDiff(filePath: string, options?: { preserveFocus?: boolean }): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (snapshot === undefined) { return; }

    let modifiedContent: string;
    try {
      modifiedContent = Buffer.from(
        await vscode.workspace.fs.readFile(vscode.Uri.file(absPath))
      ).toString('utf8');
    } catch {
      return;
    }

    // So trên LF thuần: thay đổi thuần EOL (git checkout, đổi setting files.eol,
    // formatter...) cho ra 0 hunk và rơi vào nhánh dọn dẹp bên dưới, thay vì mở
    // một diff phủ cả file.
    const hunks = calculateHunks(toLf(snapshot.content), toLf(modifiedContent));
    if (hunks.length === 0) {
      // A newly-created empty file is still pending: Revert must delete it and
      // Accept must keep it. There is simply no text hunk to render.
      if (!snapshot.fileExistedBefore) { return; }
      this.deleteSnapshot(absPath);
      this.scheduleSave();
      this._onDidChangeDiffs.fire();
      return;
    }

    const preserveFocus = options?.preserveFocus === true;

    const existing = this.panels.get(absPath);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Active, preserveFocus);
      this._onDidChangeDiffs.fire();
      return;
    }

    await this.closeTextTabsFor(absPath);

    await vscode.commands.executeCommand(
      'vscode.openWith',
      vscode.Uri.file(canonicalCasePath(absPath)),
      DIFF_EDITOR_VIEW_TYPE,
      { preview: false, preserveFocus } satisfies vscode.TextDocumentShowOptions
    );
    this._onDidChangeDiffs.fire();
  }

  /**
   * Đóng mọi tab text editor đang trỏ tới file này, để diff editor mới mở
   * không tạo tab thứ hai cùng file.
   */
  private async closeTextTabsFor(absPath: string): Promise<void> {
    await this.closeTextTabsForAll(new Set([absPath]));
  }

  private async closeTextTabsForAll(absPaths: ReadonlySet<string>): Promise<void> {
    const targets: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (!(tab.input instanceof vscode.TabInputText)) { continue; }
        if (absPaths.has(normalizePath(tab.input.uri.fsPath))) {
          // Preserve unsaved user edits. Closing a dirty text tab here would
          // trigger VS Code's save/discard dialog while an external change is
          // being routed to the custom diff editor.
          if (tab.isDirty) { continue; }
          targets.push(tab);
        }
      }
    }
    if (targets.length === 0) { return; }
    try {
      await vscode.window.tabGroups.close(targets);
    } catch (err) {
      console.error('[ai-cli-diff] closeTextTabsFor failed:', err);
    }
  }

  loadSnapshot(filePath: string, content: string, fileExistedBefore = true): void {
    const absPath = normalizePath(filePath);
    if (!this.snapshots.has(absPath)) {
      this.setSnapshot(absPath,{ content, fileExistedBefore });
      this.rememberDisplayPath(filePath);
      this.scheduleSave();
      this._onDidChangeDiffs.fire();
    }
  }

  /**
   * Accept toàn bộ thay đổi của 1 file: file đã sẵn trên đĩa với currentContent,
   * chỉ cần xoá snapshot.
   */
  async accept(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    if (!this.snapshots.has(absPath)) { return; }

    const nextTarget = this.nextPendingAfter(absPath);

    this.deleteSnapshot(absPath);
    this.saveNow();
    this.closePanel(absPath);
    await this.reopenAsTextEditor(absPath);

    if (nextTarget) {
      await this.openDiff(nextTarget);
    }
    this._onDidChangeDiffs.fire();
  }

  /**
   * Revert toàn bộ: ghi originalContent ra đĩa.
   * Nếu file vốn không tồn tại trước đó -> xoá file.
   */
  async revert(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (!snapshot) { return; }

    const nextTarget = this.nextPendingAfter(absPath);

    if (snapshot.fileExistedBefore) {
      await this.writeFile(absPath, snapshot.content);
    } else {
      await this.deleteFile(absPath);
    }

    this.deleteSnapshot(absPath);
    this.saveNow();
    this.closePanel(absPath);
    if (snapshot.fileExistedBefore) {
      await this.reopenAsTextEditor(absPath);
    } else {
      this.lastCursors.delete(absPath);
    }

    if (nextTarget) {
      await this.openDiff(nextTarget);
    }
    this._onDidChangeDiffs.fire();
  }

  /**
   * File (hoặc thư mục) đã bị xoá khỏi đĩa: bỏ track mọi file pending nằm ở đó,
   * kể cả file có từ trước — đóng tab diff + tab text, không mở lại gì.
   * Bỏ qua file vẫn còn trên đĩa (unlink rồi ghi lại) và file có edit chưa lưu.
   */
  async forgetDeleted(paths: string[]): Promise<number> {
    const roots = paths.map(normalizePath);
    const isUnder = (key: string): boolean => roots.some((root) =>
      key === root || key.startsWith(root.endsWith(path.sep) ? root : root + path.sep));
    const dirty = new Set(vscode.workspace.textDocuments
      .filter((doc) => doc.isDirty)
      .map((doc) => normalizePath(doc.uri.fsPath)));

    const forgotten = new Set<string>();
    for (const key of this.snapshots.keys()) {
      if (!isUnder(key) || dirty.has(key) || fs.existsSync(key)) { continue; }
      forgotten.add(key);
    }
    if (forgotten.size === 0) { return 0; }

    for (const key of forgotten) {
      this.deleteSnapshot(key);
      this.closePanel(key);
      this.lastCursors.delete(key);
      this.displayPaths.delete(key);
    }
    this.saveNow();
    await this.closeTextTabsForAll(forgotten);
    this._onDidChangeDiffs.fire();
    return forgotten.size;
  }

  async acceptAllPending(): Promise<number> {
    const pendingFiles = this.getPendingFiles();
    const count = pendingFiles.length;
    this.clearSnapshots();
    this.displayPaths.clear();
    this.saveNow();
    for (const p of pendingFiles) {
      this.closePanel(normalizePath(p));
    }
    this._onDidChangeDiffs.fire();
    return count;
  }

  hasPendingDiff(filePath: string): boolean {
    return this.snapshots.has(normalizePath(filePath));
  }

  /**
   * Pending files with their real on-disk case, in Pending Files tree order;
   * compare with normalizePath, never with ===.
   */
  getPendingFiles(): string[] {
    return this.getPendingOrder().display.slice();
  }

  /** Position of a file in getPendingFiles(), or -1 if it is not pending. */
  getPendingIndex(filePath: string): number {
    return this.getPendingOrder().index.get(normalizePath(filePath)) ?? -1;
  }

  /** Diff tabs currently open, for the auto-open cap (AutoOpenQueue). */
  getOpenPanelCount(): number {
    return this.panels.size;
  }

  getPendingCount(): number {
    return this.snapshots.size;
  }

  getPendingFileAt(index: number): string | undefined {
    return this.getPendingOrder().display[index];
  }

  /** The pending file after this one (wrapping), used to move on after accept/revert. */
  private nextPendingAfter(absPath: string): string | undefined {
    const count = this.getPendingCount();
    const idx = this.getPendingIndex(absPath);
    if (count <= 1 || idx === -1) { return undefined; }
    return this.getPendingFileAt((idx + 1) % count);
  }

  private getPendingOrder(): { display: string[]; index: Map<string, number> } {
    if (!this.pendingOrder) {
      const keyByDisplay = new Map<string, string>();
      for (const key of this.snapshots.keys()) {
        keyByDisplay.set(this.getDisplayPath(key), key);
      }
      const display = sortLikePendingTree(Array.from(keyByDisplay.keys()));
      const index = new Map(display.map((p, i): [string, number] => [keyByDisplay.get(p)!, i]));
      this.pendingOrder = { display, index };
    }
    return this.pendingOrder;
  }

  // ---- Snapshot mutations: always go through these so pendingOrder stays valid ----

  /** Save now if a burst save is still waiting, e.g. on deactivate. */
  flushPendingSave(): void {
    if (this.savePending) { this.saveNow(); }
  }

  private scheduleSave(): void {
    if (!this.savePending && Date.now() - this.lastSaveAt >= 500) {
      this.saveNow();
      return;
    }
    this.savePending = true;
    this.saveSoon.schedule();
  }

  private saveNow(): void {
    this.saveSoon.dispose();
    this.savePending = false;
    this.lastSaveAt = Date.now();
    void this.store.save(this.snapshots);
  }

  private setSnapshot(absPath: string, snapshot: SnapshotState): void {
    // Overwriting an existing key keeps its position, so the order only changes on add.
    if (!this.snapshots.has(absPath)) { this.pendingOrder = undefined; }
    this.snapshots.set(absPath, snapshot);
  }

  private deleteSnapshot(absPath: string): void {
    this.snapshots.delete(absPath);
    this.metadataCache.delete(absPath);
    this.pendingOrder = undefined;
  }

  private clearSnapshots(): void {
    this.snapshots.clear();
    this.metadataCache.clear();
    this.pendingOrder = undefined;
  }

  /**
   * Snapshot keys are lower-cased on Windows so lookups ignore case; anything shown
   * to the user (or sent to a webview) should use this path instead.
   */
  getDisplayPath(filePath: string): string {
    const key = normalizePath(filePath);
    const known = this.displayPaths.get(key);
    if (known) { return known; }
    const onDisk = canonicalCasePath(key);
    // Accept only a case difference: realpath also resolves symlinks/junctions,
    // which would show a path that differs from the one in the workspace.
    const display = normalizePath(onDisk) === key ? onDisk : key;
    // Not cached when it equals the key: that file may be missing now and reappear with another case.
    if (display !== key) { this.displayPaths.set(key, display); }
    return display;
  }

  private rememberDisplayPath(filePath: string): void {
    const key = normalizePath(filePath);
    const resolved = path.resolve(filePath);
    // The caller's spelling is the fallback for files that no longer exist on disk.
    if (resolved !== key && normalizePath(resolved) === key) { this.displayPaths.set(key, resolved); }
  }

  getSnapshot(filePath: string): string | undefined {
    return this.snapshots.get(normalizePath(filePath))?.content;
  }

  /** Alias dùng bởi DiffEditorProvider; trả về content của snapshot (left side). */
  getSnapshotContent(filePath: string): string | undefined {
    return this.getSnapshot(filePath);
  }

  /**
   * Build the real diff payload used by the aggregate Agent preview.
   * The snapshot is the left/original side; the current file on disk is the
   * right/modified side. Both are normalized to LF before calculating hunks.
   */
  async getDiffPreviewFile(filePath: string): Promise<DiffPreviewFile | undefined> {
    const absPath = normalizePath(filePath);
    return this.buildDiffPreviewFile(absPath, vscode.workspace.textDocuments.find(
      (document) => normalizePath(document.uri.fsPath) === absPath
    ));
  }

  private async buildDiffPreviewFile(
    absPath: string,
    openDocument: vscode.TextDocument | undefined
  ): Promise<DiffPreviewFile | undefined> {
    const snapshot = this.snapshots.get(absPath);
    if (!snapshot) { return undefined; }

    let currentContent = '';
    if (openDocument) {
      currentContent = openDocument.getText();
    } else {
      try {
        currentContent = Buffer.from(
          await vscode.workspace.fs.readFile(vscode.Uri.file(absPath))
        ).toString('utf8');
      } catch (err) {
        if (!isFileNotFound(err)) {
          return undefined;
        }
      }
    }

    const originalLf = toLf(snapshot.content);
    const currentLf = toLf(currentContent);
    const hunks = calculateHunks(originalLf, currentLf);
    if (hunks.length === 0 && snapshot.fileExistedBefore) {
      return undefined;
    }

    return {
      filePath: this.getDisplayPath(absPath),
      originalContent: originalLf,
      currentContent: currentLf,
      language: detectLanguageId(absPath),
      hunks,
    };
  }

  /**
   * Return pending-diff counters without exposing either side of a file to a
   * webview. This is intentionally computed in the extension host so the
   * Agent secondary bar remains a navigator, not a second diff renderer.
   */
  async getDiffPreviewMetadata(): Promise<DiffPreviewMetadata[]> {
    const openDocuments = new Map<string, vscode.TextDocument>();
    for (const document of vscode.workspace.textDocuments) {
      openDocuments.set(normalizePath(document.uri.fsPath), document);
    }
    const files = await Promise.all(this.getPendingFiles().map(async (filePath) => {
      const absPath = normalizePath(filePath);
      const snapshot = this.snapshots.get(absPath)?.content;
      if (snapshot === undefined) { return undefined; }
      // Stamps are taken before reading: a change racing with the read only
      // makes the next refresh recompute, never keeps stale numbers.
      const openDocument = openDocuments.get(absPath);
      const stamp = await this.currentContentStamp(absPath, openDocument);
      const cached = this.metadataCache.get(absPath);
      if (cached && cached.snapshot === snapshot && sameStamp(cached.stamp, stamp)) {
        return cached.metadata;
      }
      const preview = await this.buildDiffPreviewFile(absPath, openDocument);
      const metadata = preview && {
        filePath: preview.filePath,
        additions: preview.hunks.reduce((total, hunk) => total + hunk.addedLines.length, 0),
        deletions: preview.hunks.reduce((total, hunk) => total + hunk.removedLines.length, 0),
        hunks: preview.hunks.length,
      };
      if (this.snapshots.has(absPath)) {
        this.metadataCache.set(absPath, { snapshot, stamp, metadata });
      }
      return metadata;
    }));
    return files.filter((file): file is DiffPreviewMetadata => file !== undefined);
  }

  /** Identifies the right-hand content without reading it: the open document, else the file on disk. */
  private async currentContentStamp(
    absPath: string,
    document: vscode.TextDocument | undefined
  ): Promise<ContentStamp> {
    if (document) { return { document, version: document.version }; }
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(absPath));
      return { mtime: stat.mtime, size: stat.size };
    } catch {
      return { missing: true };
    }
  }

  /** Apply a manual edit made in the aggregate preview to the workspace document. */
  async applyPreviewEdit(filePath: string, newCurrent: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
    const expanded = fromLf(
      newCurrent,
      document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n'
    );
    if (document.getText() === expanded) { return; }
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      document.lineAt(document.lineCount - 1).range.end
    );
    edit.replace(document.uri, fullRange, expanded);
    await vscode.workspace.applyEdit(edit);
  }

  async savePreviewFile(filePath: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(normalizePath(filePath)));
    await document.save();
  }

  /** Accept a complete file without opening a native editor tab. */
  async acceptFromPreview(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    if (!this.snapshots.has(absPath)) { return; }
    this.deleteSnapshot(absPath);
    this.saveNow();
    this.closePanel(absPath);
    this._onDidChangeDiffs.fire();
  }

  /** Revert a complete file without opening a native editor tab. */
  async revertFromPreview(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (!snapshot) { return; }
    if (!snapshot.fileExistedBefore && snapshot.content.length === 0) {
      try {
        await vscode.workspace.fs.delete(vscode.Uri.file(absPath), { useTrash: false });
      } catch (err) {
        if (!isFileNotFound(err)) { throw err; }
      }
    } else {
      await this.writeFile(absPath, snapshot.content);
    }
    this.deleteSnapshot(absPath);
    this.saveNow();
    this.closePanel(absPath);
    this._onDidChangeDiffs.fire();
  }

  async acceptHunkFromPreview(
    filePath: string,
    newOriginal: string,
    newCurrent: string
  ): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (!snapshot) { return; }
    this.setSnapshot(absPath,{
      ...snapshot,
      content: fromLf(newOriginal, detectEol(snapshot.content)),
    });
    if (newOriginal === newCurrent) {
      this.deleteSnapshot(absPath);
      this.closePanel(absPath);
    }
    this.saveNow();
    this._onDidChangeDiffs.fire();
  }

  async rejectHunkFromPreview(
    filePath: string,
    newOriginal: string,
    newCurrent: string
  ): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (!snapshot) { return; }
    await this.writeFile(absPath, newCurrent, { fromLf: true });
    if (newOriginal === newCurrent) {
      if (!snapshot.fileExistedBefore && newCurrent.length === 0) {
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(absPath), { useTrash: false });
        } catch (err) {
          if (!isFileNotFound(err)) { throw err; }
        }
      }
      this.deleteSnapshot(absPath);
      this.closePanel(absPath);
    }
    this.saveNow();
    this._onDidChangeDiffs.fire();
  }

  setLastCursor(filePath: string, line: number, column: number, topLine?: number): void {
    this.lastCursors.set(normalizePath(filePath), { line, column, topLine });
  }

  getActiveFilePath(): string | undefined {
    const active = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (active?.input instanceof vscode.TabInputCustom) {
      if (active.input.viewType === DIFF_EDITOR_VIEW_TYPE) {
        return normalizePath(active.input.uri.fsPath);
      }
    }
    // Fallback: first panel in map.
    const first = this.panels.keys().next();
    return first.done ? undefined : first.value;
  }

  disposeAll(): void {
    this.clearSnapshots();
    this.displayPaths.clear();
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
  }

  /**
   * Xoá toàn bộ pending (vd: git branch switch). Cần persist clean state để
   * sau reload window không bị `SnapshotStore.load()` kéo lại.
   *
   * Nếu tab đang active đúng là 1 diff tab bị xoá, mở lại nó dưới dạng text
   * editor thường (giữ cursor/scroll) thay vì để nó biến mất đột ngột — chỉ
   * áp dụng cho tab đang active, KHÔNG áp dụng cho mọi panel bị đóng (nếu
   * không sẽ mở lại hàng loạt tab cho các file nền user không đang xem).
   */
  async clearAll(): Promise<void> {
    const hint = this.consumePendingActiveTabHint();
    const activeDiffPath = hint.captured
      ? (hint.path !== undefined && this.snapshots.has(hint.path) ? hint.path : undefined)
      : this.getLiveActiveDiffPath();

    this.disposeAll();
    this.saveSoon.dispose();
    this.savePending = false;
    await this.store.clear();

    if (activeDiffPath) {
      await this.reopenAsTextEditor(activeDiffPath);
    }
  }

  private getLiveActiveDiffPath(): string | undefined {
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    return activeTab?.input instanceof vscode.TabInputCustom &&
      activeTab.input.viewType === DIFF_EDITOR_VIEW_TYPE &&
      this.panels.has(normalizePath(activeTab.input.uri.fsPath))
        ? normalizePath(activeTab.input.uri.fsPath)
        : undefined;
  }

  /**
   * Gọi bởi WorkspaceWatcher ở write ĐẦU TIÊN của 1 cụm external write sắp tự
   * động mở diff (xem WorkspaceWatcher.resolveOrHold — áp dụng cho cả mở ngay
   * lẫn hold-rồi-dump, không riêng burst). Ghi lại tab đang active THẬT SỰ tại
   * thời điểm đó — trước khi các openDiff() không đồng bộ trong cụm chạy đua
   * khiến activeTab trở nên ngẫu nhiên. clearAll() (khi git xác nhận branch
   * đổi đến sau đó) sẽ ưu tiên dùng giá trị này thay vì tab thắng cuộc đua.
   */
  markActiveTabBeforeAutoOpen(): void {
    this.pendingActiveTabPath = this.getCurrentTabFsPath();
    this.pendingActiveTabCaptured = true;
    this.pendingActiveTabCapturedAt = Date.now();
  }

  private getCurrentTabFsPath(): string | undefined {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const uri =
      tab?.input instanceof vscode.TabInputText ? tab.input.uri :
      tab?.input instanceof vscode.TabInputCustom ? tab.input.uri :
      tab?.input instanceof vscode.TabInputNotebook ? tab.input.uri :
      undefined;
    return uri ? normalizePath(uri.fsPath) : undefined;
  }

  /** Dùng 1 lần: đọc xong luôn reset state, để lần clearAll() sau (không có
   *  cụm auto-open nào xảy ra trước đó) không vô tình dùng lại hint cũ. */
  private consumePendingActiveTabHint(): { captured: boolean; path: string | undefined } {
    const captured = this.pendingActiveTabCaptured;
    const path = this.pendingActiveTabPath;
    const capturedAt = this.pendingActiveTabCapturedAt;
    this.pendingActiveTabCaptured = false;
    this.pendingActiveTabPath = undefined;
    this.pendingActiveTabCapturedAt = 0;
    if (!captured || Date.now() - capturedAt > DiffManager.PENDING_ACTIVE_TAB_TTL_MS) {
      return { captured: false, path: undefined };
    }
    return { captured, path };
  }

  // ---- Panel registry (gọi bởi DiffEditorProvider) ----

  registerPanel(filePath: string, panel: vscode.WebviewPanel): void {
    const absPath = normalizePath(filePath);

    // openDiff() là async (await vscode.openWith) — nếu clearAll()/disposeAll()
    // chạy xong TRƯỚC khi tab này kịp mở (vd: git branch confirm ngay giữa lúc
    // đang mở), snapshot đã bị xoá nhưng panel này chưa kịp đăng ký nên không
    // bị đóng theo. Không có gì để diff nữa — đóng luôn ở đây (đồng bộ, sớm
    // hơn nhiều so với việc chờ webview Monaco load xong rồi tự đóng qua
    // postSet()).
    if (!this.snapshots.has(absPath)) {
      panel.dispose();
      return;
    }

    const existing = this.panels.get(absPath);
    if (existing && existing !== panel) {
      existing.dispose();
    }
    this.panels.set(absPath, panel);
  }

  unregisterPanel(filePath: string, panel: vscode.WebviewPanel): void {
    const absPath = normalizePath(filePath);
    const existing = this.panels.get(absPath);
    if (existing === panel) {
      this.panels.delete(absPath);
      this._onDidChangeDiffs.fire();
    }
  }

  private closePanel(absPath: string): void {
    const panel = this.panels.get(absPath);
    if (panel) {
      this.panels.delete(absPath);
      panel.dispose();
    }
  }

  private async reopenAsTextEditor(absPath: string): Promise<void> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(absPath));
    } catch (err) {
      if (!isFileNotFound(err)) {
        console.error('[ai-cli-diff] cannot stat file before reopening:', err);
      }
      this.lastCursors.delete(absPath);
      return;
    }
    const cursor = this.lastCursors.get(absPath);
    this.lastCursors.delete(absPath);
    const uri = vscode.Uri.file(canonicalCasePath(absPath));
    const showOptions: vscode.TextDocumentShowOptions = { preview: false };
    if (cursor) {
      const pos = new vscode.Position(
        Math.max(0, cursor.line - 1),
        Math.max(0, cursor.column - 1)
      );
      showOptions.selection = new vscode.Range(pos, pos);
    }
    try {
      const editor = await vscode.window.showTextDocument(uri, showOptions);
      if (cursor?.topLine !== undefined) {
        const lastLine = Math.max(0, editor.document.lineCount - 1);
        const top = Math.min(lastLine, Math.max(0, cursor.topLine - 1));
        editor.revealRange(
          new vscode.Range(top, 0, top, 0),
          vscode.TextEditorRevealType.AtTop
        );
      }
    } catch (err) {
      console.error('[ai-cli-diff] reopenAsTextEditor failed:', err);
    }
  }

  // ---- Hunk-level operations (gọi bởi webview qua provider) ----

  /**
   * Accept 1 hunk: webview đã tính newOriginal (snapshot trồi lên include hunk),
   * newCurrent giữ nguyên. Chỉ update snapshot + có thể đóng nếu hết hunk.
   */
  async applyHunkAcceptFromWebview(
    filePath: string,
    newOriginal: string,
    newCurrent: string
  ): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (!snapshot) { return; }

    // newOriginal từ webview ở LF -> trả về đúng EOL của snapshot cũ, để snapshot
    // luôn giữ nguyên dạng byte gốc của file và revert() khôi phục chuẩn xác.
    this.setSnapshot(absPath,{
      ...snapshot,
      content: fromLf(newOriginal, detectEol(snapshot.content)),
    });
    this.saveNow();

    if (newOriginal === newCurrent) {
      await this.accept(absPath);
    } else {
      this._onDidChangeDiffs.fire();
    }
  }

  /**
   * Reject 1 hunk: webview đã tính newCurrent (rollback hunk về original),
   * newOriginal giữ nguyên. Ghi newCurrent ra đĩa.
   */
  async applyHunkRejectFromWebview(
    filePath: string,
    newOriginal: string,
    newCurrent: string
  ): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (!snapshot) { return; }

    // newCurrent từ webview ở LF -> writeFile khôi phục EOL thật của file.
    await this.writeFile(absPath, newCurrent, { fromLf: true });

    if (newOriginal === newCurrent) {
      if (!snapshot.fileExistedBefore && newCurrent.length === 0) {
        await this.deleteFile(absPath);
      }
      const nextTarget = this.nextPendingAfter(absPath);

      this.deleteSnapshot(absPath);
      this.saveNow();
      this.closePanel(absPath);

      if (nextTarget) {
        await this.openDiff(nextTarget);
      }
    }
    this._onDidChangeDiffs.fire();
  }

  /**
   * @param opts.fromLf `content` đang ở LF thuần (đến từ webview) và cần khôi phục
   *   EOL thật của file trước khi ghi. Bỏ trống khi content đã đúng dạng byte gốc
   *   (vd: revert() ghi thẳng snapshot).
   */
  private async writeFile(
    absPath: string,
    content: string,
    opts?: { fromLf?: boolean }
  ): Promise<void> {
    const uri = vscode.Uri.file(absPath);
    const doc = vscode.workspace.textDocuments.find(d => normalizePath(d.uri.fsPath) === absPath);

    let payload = content;
    if (opts?.fromLf) {
      // Document đang mở là nguồn đáng tin nhất — đó chính là EOL VS Code sẽ ghi.
      // Không mở thì suy từ nội dung hiện có trên đĩa.
      let eol: '\r\n' | '\n';
      if (doc) {
        eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
      } else {
        try {
          const bytes = await vscode.workspace.fs.readFile(uri);
          eol = detectEol(Buffer.from(bytes).toString('utf8'));
        } catch {
          eol = '\n';
        }
      }
      payload = fromLf(content, eol);
    }

    if (doc) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        doc.lineAt(doc.lineCount - 1).range.end
      );
      edit.replace(uri, fullRange, payload);
      await vscode.workspace.applyEdit(edit);
      await doc.save();
    } else {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(payload, 'utf8'));
    }
  }

  private async deleteFile(absPath: string): Promise<void> {
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(absPath));
    } catch (err) {
      if (!isFileNotFound(err)) {
        throw err;
      }
    }
  }
}
