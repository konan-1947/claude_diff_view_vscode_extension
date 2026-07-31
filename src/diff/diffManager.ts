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
import { calculateHunks } from './hunkCalculator';
import { DIFF_EDITOR_VIEW_TYPE } from './diffWebviewPanel';
import { SnapshotStore, SnapshotState } from './snapshotStore';

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

export class DiffManager {
  private _onDidChangeDiffs = new vscode.EventEmitter<void>();
  public readonly onDidChangeDiffs = this._onDidChangeDiffs.event;

  private snapshots: Map<string, SnapshotState> = new Map();
  private readonly store: SnapshotStore;
  /** filePath (normalized) -> active webview panel. */
  private panels: Map<string, vscode.WebviewPanel> = new Map();
  /** filePath (normalized) -> last cursor + top visible line seen in Monaco modified editor. */
  private lastCursors: Map<string, { line: number; column: number; topLine?: number }> = new Map();

  constructor(private readonly context: vscode.ExtensionContext) {
    this.store = new SnapshotStore(context.workspaceState);
    this.snapshots = this.store.load();
  }

  async snapshotBefore(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    if (this.snapshots.has(absPath)) {
      return;
    }
    const fileExistedBefore = fs.existsSync(absPath);
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      this.snapshots.set(absPath, { content, fileExistedBefore });
    } catch {
      this.snapshots.set(absPath, { content: '', fileExistedBefore: false });
    }
    void this.store.save(this.snapshots);
  }

  async openDiff(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (snapshot === undefined) { return; }

    let modifiedContent: string;
    try {
      modifiedContent = fs.readFileSync(absPath, 'utf8');
    } catch {
      return;
    }

    const hunks = calculateHunks(snapshot.content, modifiedContent);
    if (hunks.length === 0) {
      this.snapshots.delete(absPath);
      void this.store.save(this.snapshots);
      this._onDidChangeDiffs.fire();
      return;
    }

    const existing = this.panels.get(absPath);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Active, false);
      this._onDidChangeDiffs.fire();
      return;
    }

    await this.closeTextTabsFor(absPath);

    await vscode.commands.executeCommand(
      'vscode.openWith',
      vscode.Uri.file(canonicalCasePath(absPath)),
      DIFF_EDITOR_VIEW_TYPE,
      { preview: false } satisfies vscode.TextDocumentShowOptions
    );
    this._onDidChangeDiffs.fire();
  }

  /**
   * Đóng mọi tab text editor đang trỏ tới file này, để diff editor mới mở
   * không tạo tab thứ hai cùng file.
   */
  private async closeTextTabsFor(absPath: string): Promise<void> {
    const targets: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (!(tab.input instanceof vscode.TabInputText)) { continue; }
        if (normalizePath(tab.input.uri.fsPath) === absPath) {
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
      this.snapshots.set(absPath, { content, fileExistedBefore });
      void this.store.save(this.snapshots);
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

    const pendingBefore = this.getPendingFiles();
    const currentIdx = pendingBefore.findIndex(p => normalizePath(p) === absPath);
    const nextTarget =
      pendingBefore.length > 1 && currentIdx !== -1
        ? pendingBefore[(currentIdx + 1) % pendingBefore.length]
        : undefined;

    this.snapshots.delete(absPath);
    void this.store.save(this.snapshots);
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

    const pendingBefore = this.getPendingFiles();
    const currentIdx = pendingBefore.findIndex(p => normalizePath(p) === absPath);
    const nextTarget =
      pendingBefore.length > 1 && currentIdx !== -1
        ? pendingBefore[(currentIdx + 1) % pendingBefore.length]
        : undefined;

    if (snapshot.fileExistedBefore) {
      await this.writeFile(absPath, snapshot.content);
    } else {
      await this.deleteFile(absPath);
    }

    this.snapshots.delete(absPath);
    void this.store.save(this.snapshots);
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

  async acceptAllPending(): Promise<number> {
    const pendingFiles = this.getPendingFiles();
    const count = pendingFiles.length;
    this.snapshots.clear();
    void this.store.save(this.snapshots);
    for (const p of pendingFiles) {
      this.closePanel(normalizePath(p));
    }
    this._onDidChangeDiffs.fire();
    return count;
  }

  hasPendingDiff(filePath: string): boolean {
    return this.snapshots.has(normalizePath(filePath));
  }

  getPendingFiles(): string[] {
    return Array.from(this.snapshots.keys());
  }

  getSnapshot(filePath: string): string | undefined {
    return this.snapshots.get(normalizePath(filePath))?.content;
  }

  /** Alias dùng bởi DiffEditorProvider; trả về content của snapshot (left side). */
  getSnapshotContent(filePath: string): string | undefined {
    return this.getSnapshot(filePath);
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
    this.snapshots.clear();
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
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const activeDiffPath =
      activeTab?.input instanceof vscode.TabInputCustom &&
      activeTab.input.viewType === DIFF_EDITOR_VIEW_TYPE &&
      this.panels.has(normalizePath(activeTab.input.uri.fsPath))
        ? normalizePath(activeTab.input.uri.fsPath)
        : undefined;

    this.disposeAll();
    await this.store.clear();

    if (activeDiffPath) {
      await this.reopenAsTextEditor(activeDiffPath);
    }
  }

  // ---- Panel registry (gọi bởi DiffEditorProvider) ----

  registerPanel(filePath: string, panel: vscode.WebviewPanel): void {
    const absPath = normalizePath(filePath);
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
    if (!fs.existsSync(absPath)) {
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

    this.snapshots.set(absPath, { ...snapshot, content: newOriginal });
    void this.store.save(this.snapshots);

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

    await this.writeFile(absPath, newCurrent);

    if (newOriginal === newCurrent) {
      if (!snapshot.fileExistedBefore && newCurrent.length === 0) {
        await this.deleteFile(absPath);
      }
      const pendingBefore = this.getPendingFiles();
      const currentIdx = pendingBefore.findIndex(p => normalizePath(p) === absPath);
      const nextTarget =
        pendingBefore.length > 1 && currentIdx !== -1
          ? pendingBefore[(currentIdx + 1) % pendingBefore.length]
          : undefined;

      this.snapshots.delete(absPath);
      void this.store.save(this.snapshots);
      this.closePanel(absPath);

      if (nextTarget) {
        await this.openDiff(nextTarget);
      }
    }
    this._onDidChangeDiffs.fire();
  }

  private async writeFile(absPath: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(absPath);
    const doc = vscode.workspace.textDocuments.find(d => normalizePath(d.uri.fsPath) === absPath);
    if (doc) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        doc.lineAt(doc.lineCount - 1).range.end
      );
      edit.replace(uri, fullRange, content);
      await vscode.workspace.applyEdit(edit);
      await doc.save();
    } else {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    }
  }

  private async deleteFile(absPath: string): Promise<void> {
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(absPath));
    } catch {
      if (fs.existsSync(absPath)) {
        throw new Error(`Cannot delete ${absPath}`);
      }
    }
  }
}
