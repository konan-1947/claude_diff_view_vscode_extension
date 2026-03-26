/**
 * diffManager.ts (đã refactor)
 *
 * Quản lý snapshot nội dung file trước khi Claude sửa.
 * Delegate việc render sang InlineDiffRenderer.
 * Không còn dùng temp file hay vscode.diff.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { InlineDiffRenderer } from './inlineDiffRenderer';
import { calculateHunks } from './hunkCalculator';

const STATE_KEY = 'claude-diff.snapshots';

/** Normalize về cùng định dạng mà vscode.Uri.fsPath sử dụng. */
function normalizePath(filePath: string): string {
  const fsPath = vscode.Uri.file(path.resolve(filePath)).fsPath;
  return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
}

export class DiffManager {
  private _onDidChangeDiffs = new vscode.EventEmitter<void>();
  public readonly onDidChangeDiffs = this._onDidChangeDiffs.event;

  public readonly contentProviderEventEmitter = new vscode.EventEmitter<vscode.Uri>();

  /** Lưu nội dung gốc TRƯỚC khi sửa (để tính diff) */
  private snapshots: Map<string, string> = new Map();
  private snapshotQueries: Map<string, string> = new Map();

  public readonly renderer: InlineDiffRenderer;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.renderer = new InlineDiffRenderer(context.extensionUri);
    this.restoreState();

    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider('claude-diff', {
        onDidChange: this.contentProviderEventEmitter.event,
        provideTextDocumentContent: (uri: vscode.Uri) => {
          // Xóa query (timestamp) đi để trả về đường dẫn file thật chính xác
          const realFileUri = uri.with({ scheme: 'file', query: '' });
          const originalPath = normalizePath(realFileUri.fsPath);
          return this.getSnapshot(originalPath) || '';
        }
      })
    );
  }

  // ---- State persistence (chỉ lưu đường dẫn để mở lại sau khi restart VS Code) ----

  private restoreState(): void {
    const saved = this.context.workspaceState.get<Record<string, string>>(STATE_KEY, {});
    for (const [absPath, originalContent] of Object.entries(saved)) {
      if (!fs.existsSync(absPath)) { continue; }
      this.snapshots.set(absPath, originalContent);
      this.snapshotQueries.set(absPath, Date.now().toString());
    }
  }

  private persistState(): void {
    const obj: Record<string, string> = {};
    for (const [absPath, content] of this.snapshots.entries()) {
      obj[absPath] = content;
    }
    this.context.workspaceState.update(STATE_KEY, obj);
  }

  // ---- Public API ----

  /**
   * Gọi TRƯỚC khi Claude sửa file.
   * Đọc nội dung hiện tại và lưu làm snapshot "before".
   */
  async snapshotBefore(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    if (this.snapshots.has(absPath)) {
      // Đã có snapshot — giữ bản gốc nhất, không ghi đè
      return;
    }
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      this.snapshots.set(absPath, content);
      this.snapshotQueries.set(absPath, Date.now().toString());
    } catch {
      // File chưa tồn tại (Claude tạo file mới)
      this.snapshots.set(absPath, '');
      this.snapshotQueries.set(absPath, Date.now().toString());
    }
    this.persistState();
  }

  /**
   * Gọi SAU khi Claude đã sửa xong file.
   * Mở editor và render inline diff.
   */
  async openDiff(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (snapshot === undefined) { return; }

    // Đọc nội dung mới từ disk
    let modifiedContent: string;
    try {
      modifiedContent = fs.readFileSync(absPath, 'utf8');
    } catch {
      return;
    }

    // Nếu không có khác biệt thực sự (hunks = 0), tránh tạo/giữ trạng thái pending sai.
    // Trường hợp này thường xảy ra khi Claude "sửa" nhưng kết quả cuối cùng y hệt bản gốc,
    // hoặc do lỗi resolve path khiến snapshot không khớp.
    const hunks = calculateHunks(snapshot, modifiedContent);
    if (hunks.length === 0) {
      this.snapshots.delete(absPath);
      this.snapshotQueries.delete(absPath);
      this.persistState();

      // Vẫn gọi renderer để nó dọn decorations/nav cho editor hiện tại.
      this.renderer.show(absPath, snapshot, modifiedContent);
      // Không còn pending diff nên cũng xóa state inline diff để tránh giữ dư trạng thái.
      this.renderer.clear(absPath);
      this._onDidChangeDiffs.fire();
      return;
    }

    // Chuyển sang dùng UI chuẩn của VS Code: Diff Editor. 
    // Dùng chung 1 query ID cho suốt quá trình Diff để khỏi bị mở đúp thành 2 tab
    const queryId = this.snapshotQueries.get(absPath) || Date.now().toString();
    const originalUri = vscode.Uri.file(absPath).with({ scheme: 'claude-diff', query: queryId });
    const modifiedUri = vscode.Uri.file(absPath);
    const title = `Claude Diff: ${path.basename(absPath)}`;
    
    await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title, { preview: false });

    // Vẫn cần gọi renderer để tính toán danh sách hunks (giúp render CodeLens)
    this.renderer.show(absPath, snapshot, modifiedContent);
    this._onDidChangeDiffs.fire();
  }

  /**
   * Inject snapshot từ bên ngoài (dùng bởi HookWatcher hoặc WorkspaceWatcher).
   */
  loadSnapshot(filePath: string, content: string): void {
    const absPath = normalizePath(filePath);
    if (!this.snapshots.has(absPath)) {
      this.snapshots.set(absPath, content);
      this.snapshotQueries.set(absPath, Date.now().toString());
      this.persistState();
      this._onDidChangeDiffs.fire();
    }
  }

  async acceptHunk(filePath: string, hunkId: string): Promise<void> {
    const absPath = normalizePath(filePath);
    
    const hunks = this.renderer.getHunks(absPath);
    const hunk = hunks.find(h => h.id === hunkId);
    let oldSnapshot = this.snapshots.get(absPath);

    if (hunk && oldSnapshot !== undefined) {
      // Patch bản snapshot nguyên thủy với nội dung của Hunk đã Accept
      const lines = oldSnapshot.split('\n');
      const deleteCount = hunk.removedLines.length;
      const addedTexts = hunk.addedLines.map(l => l.text);
      lines.splice(hunk.originalStart, deleteCount, ...addedTexts);
      
      const newSnapshot = lines.join('\n');
      this.snapshots.set(absPath, newSnapshot);
      this.persistState();

      // Thông báo cho VS Code nạp lại nội dung bên trái (Original) của màn hình Diff
      const queryId = this.snapshotQueries.get(absPath) || '';
      const originalUri = vscode.Uri.file(absPath).with({ scheme: 'claude-diff', query: queryId });
      this.contentProviderEventEmitter.fire(originalUri);

      // Cập nhật lại Inline Renderer và tính lại CodeLens
      let modifiedContent: string;
      try {
        modifiedContent = fs.readFileSync(absPath, 'utf8');
      } catch {
        modifiedContent = newSnapshot;
      }
      this.renderer.show(absPath, newSnapshot, modifiedContent);
    }
    
    // Nếu không còn hunk nào khác, tự động cleanup và đóng Diff Editor
    const remainingHunks = this.renderer.getHunks(absPath);
    if (remainingHunks.length === 0) {
      await this.cleanup(absPath);
    }

    this._onDidChangeDiffs.fire();
  }

  async revertHunk(filePath: string, hunkId: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const isDone = await this.renderer.revertHunk(absPath, hunkId);
    if (isDone) {
      await this.cleanup(absPath);
    }
    this._onDidChangeDiffs.fire();
  }

  /**
   * Chấp nhận toàn bộ thay đổi trong file — xóa snapshot.
   */
  async accept(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);

    // Lưu lại thứ tự pending trước khi cleanup để biết "file tiếp theo" là gì.
    const pendingBefore = this.getPendingFiles();
    const currentIdx = pendingBefore.findIndex(p => normalizePath(p) === absPath);
    const hasNext = pendingBefore.length > 1 && currentIdx !== -1;
    const nextTarget = hasNext
      ? pendingBefore[(currentIdx + 1) % pendingBefore.length]!
      : undefined;

    this.renderer.acceptAll(absPath);

    // Nếu còn file pending khác, tránh "nhảy về file thường" sau khi đóng diff;
    // thay vào đó chuyển sang diff của file tiếp theo để user tiếp tục review.
    await this.cleanup(absPath, { openNormalTextDocument: !nextTarget });

    if (nextTarget) {
      await this.openDiff(nextTarget);
    }

    vscode.window.showInformationMessage(`Accepted: ${path.basename(absPath)}`);
    this._onDidChangeDiffs.fire();
  }

  /**
   * Hoàn tác toàn bộ thay đổi trong file về nội dung gốc.
   */
  async revert(filePath: string): Promise<void> {
    const absPath = normalizePath(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (snapshot === undefined) {
      vscode.window.showWarningMessage(`No snapshot found for ${path.basename(absPath)}`);
      return;
    }

    await this.renderer.revertAll(absPath);
    await this.cleanup(absPath);
    vscode.window.showInformationMessage(`Reverted: ${path.basename(absPath)}`);
    this._onDidChangeDiffs.fire();
  }

  /**
   * Xóa snapshot của một file (sau khi accept/revert từng hunk xong hết).
   * Dùng khi tất cả hunks đã được xử lý thủ công.
   */
  forgetFile(filePath: string): void {
    this.cleanup(normalizePath(filePath)).catch((err) => console.error(err));
  }

  /**
   * Kiểm tra xem file có đang có pending diff không.
   */
  hasPendingDiff(filePath: string): boolean {
    return this.snapshots.has(normalizePath(filePath));
  }

  /**
   * Lấy danh sách tất cả các file đang có pending diff.
   */
  getPendingFiles(): string[] {
    return Array.from(this.snapshots.keys());
  }

  /**
   * Lấy snapshot gốc (dùng để so sánh sau khi edit).
   */
  getSnapshot(filePath: string): string | undefined {
    return this.snapshots.get(normalizePath(filePath));
  }

  /**
   * Dọn dẹp tất cả pending diffs khi deactivate.
   */
  disposeAll(): void {
    this.renderer.disposeAll();
    this.snapshots.clear();
    this.snapshotQueries.clear();
  }

  private async cleanup(
    absPath: string,
    opts?: { openNormalTextDocument?: boolean }
  ): Promise<void> {
    const openNormalTextDocument = opts?.openNormalTextDocument ?? true;

    this.snapshots.delete(absPath);
    this.snapshotQueries.delete(absPath);
    this.persistState();

    // Xóa inline diff state/decorations và cập nhật nav UI ngay.
    this.renderer.clear(absPath);
    
    // Lưu lại vị trí con trỏ và scroll hiện tại trước khi đóng tab
    let targetSelection: vscode.Selection | undefined;
    let targetVisibleRange: vscode.Range | undefined;
    
    for (const editor of vscode.window.visibleTextEditors) {
      if (normalizePath(editor.document.uri.fsPath) === absPath) {
        targetSelection = editor.selection;
        if (editor.visibleRanges.length > 0) {
          targetVisibleRange = editor.visibleRanges[0];
        }
        if (editor === vscode.window.activeTextEditor) {
          break; // Ưu tiên editor đang có focus nhất
        }
      }
    }

    // Tự động đóng tab Diff View sau khi xong hết hunks
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputTextDiff) {
          const { modified } = tab.input;
          if (normalizePath(modified.fsPath) === absPath) {
            await vscode.window.tabGroups.close(tab);
          }
        }
      }
    }

    // Mở lại file ở tab thường và đặt con trỏ/scroll về đúng chỗ cũ
    // (chỉ làm khi không chuyển sang diff file pending khác)
    if (openNormalTextDocument) {
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
        const editor = await vscode.window.showTextDocument(doc, { preview: false });

        if (targetSelection) {
          editor.selection = targetSelection;
        }
        if (targetVisibleRange) {
          editor.revealRange(targetVisibleRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }
      } catch {}
    }
  }
}
