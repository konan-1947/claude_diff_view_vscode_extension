"use strict";
/**
 * diffManager.ts
 *
 * Snapshot + accept/revert state cho các file đang được AI sửa.
 * Render delegate hoàn toàn sang DiffEditorProvider (CustomTextEditorProvider).
 * Mỗi pending file = 1 tab webview riêng.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const hunkCalculator_1 = require("./hunkCalculator");
const eol_1 = require("./eol");
const language_1 = require("./language");
const fileSizeLimit_1 = require("../watcher/fileSizeLimit");
const diffWebviewPanel_1 = require("./diffWebviewPanel");
const snapshotStore_1 = require("./snapshotStore");
function normalizePath(filePath) {
    const fsPath = vscode.Uri.file(path.resolve(filePath)).fsPath;
    return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
}
/**
 * Trả về path với case canonical từ OS (Windows preserve case từ disk).
 * Dùng khi gọi VS Code APIs để tab/tên file hiển thị đúng case như user.
 * Fallback về input nếu file không tồn tại.
 */
function canonicalCasePath(filePath) {
    try {
        return fs.realpathSync.native(filePath);
    }
    catch {
        return filePath;
    }
}
function isFileNotFound(error) {
    return error instanceof vscode.FileSystemError && error.code === 'FileNotFound';
}
class DiffManager {
    constructor(context) {
        this.context = context;
        this._onDidChangeDiffs = new vscode.EventEmitter();
        this.onDidChangeDiffs = this._onDidChangeDiffs.event;
        this.snapshots = new Map();
        /** filePath (normalized) -> active webview panel. */
        this.panels = new Map();
        /** filePath (normalized) -> last cursor + top visible line seen in Monaco modified editor. */
        this.lastCursors = new Map();
        this.pendingActiveTabCaptured = false;
        this.pendingActiveTabCapturedAt = 0;
        this.store = new snapshotStore_1.SnapshotStore(context.workspaceState);
        this.snapshots = this.store.load();
    }
    async snapshotBefore(filePath) {
        const absPath = normalizePath(filePath);
        if (this.snapshots.has(absPath)) {
            return;
        }
        const uri = vscode.Uri.file(absPath);
        try {
            await vscode.workspace.fs.stat(uri);
        }
        catch (err) {
            if (isFileNotFound(err)) {
                this.snapshots.set(absPath, { content: '', fileExistedBefore: false });
                void this.store.save(this.snapshots);
            }
            return;
        }
        try {
            const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            // Đường built-in runner cũng phải tôn trọng maxFileLines, nếu không setting
            // chỉ đúng với đường workspace watcher. Không snapshot -> openDiff() thoát
            // sớm vì không có snapshot -> file lớn không mở diff, đúng như mong đợi.
            if ((0, fileSizeLimit_1.exceedsLineLimit)(content)) {
                return;
            }
            this.snapshots.set(absPath, { content, fileExistedBefore: true });
        }
        catch {
            // File có thể bị xóa hoặc không đọc được sau khi stat — không tạo snapshot rỗng.
            return;
        }
        void this.store.save(this.snapshots);
    }
    async openDiff(filePath, options) {
        const absPath = normalizePath(filePath);
        const snapshot = this.snapshots.get(absPath);
        if (snapshot === undefined) {
            return;
        }
        let modifiedContent;
        try {
            modifiedContent = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(absPath))).toString('utf8');
        }
        catch {
            return;
        }
        // So trên LF thuần: thay đổi thuần EOL (git checkout, đổi setting files.eol,
        // formatter...) cho ra 0 hunk và rơi vào nhánh dọn dẹp bên dưới, thay vì mở
        // một diff phủ cả file.
        const hunks = (0, hunkCalculator_1.calculateHunks)((0, eol_1.toLf)(snapshot.content), (0, eol_1.toLf)(modifiedContent));
        if (hunks.length === 0) {
            // A newly-created empty file is still pending: Revert must delete it and
            // Accept must keep it. There is simply no text hunk to render.
            if (!snapshot.fileExistedBefore) {
                return;
            }
            this.snapshots.delete(absPath);
            void this.store.save(this.snapshots);
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
        await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(canonicalCasePath(absPath)), diffWebviewPanel_1.DIFF_EDITOR_VIEW_TYPE, { preview: false, preserveFocus });
        this._onDidChangeDiffs.fire();
    }
    /**
     * Đóng mọi tab text editor đang trỏ tới file này, để diff editor mới mở
     * không tạo tab thứ hai cùng file.
     */
    async closeTextTabsFor(absPath) {
        const targets = [];
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (!(tab.input instanceof vscode.TabInputText)) {
                    continue;
                }
                if (normalizePath(tab.input.uri.fsPath) === absPath) {
                    // Preserve unsaved user edits. Closing a dirty text tab here would
                    // trigger VS Code's save/discard dialog while an external change is
                    // being routed to the custom diff editor.
                    if (tab.isDirty) {
                        continue;
                    }
                    targets.push(tab);
                }
            }
        }
        if (targets.length === 0) {
            return;
        }
        try {
            await vscode.window.tabGroups.close(targets);
        }
        catch (err) {
            console.error('[ai-cli-diff] closeTextTabsFor failed:', err);
        }
    }
    loadSnapshot(filePath, content, fileExistedBefore = true) {
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
    async accept(filePath) {
        const absPath = normalizePath(filePath);
        if (!this.snapshots.has(absPath)) {
            return;
        }
        const pendingBefore = this.getPendingFiles();
        const currentIdx = pendingBefore.findIndex(p => normalizePath(p) === absPath);
        const nextTarget = pendingBefore.length > 1 && currentIdx !== -1
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
    async revert(filePath) {
        const absPath = normalizePath(filePath);
        const snapshot = this.snapshots.get(absPath);
        if (!snapshot) {
            return;
        }
        const pendingBefore = this.getPendingFiles();
        const currentIdx = pendingBefore.findIndex(p => normalizePath(p) === absPath);
        const nextTarget = pendingBefore.length > 1 && currentIdx !== -1
            ? pendingBefore[(currentIdx + 1) % pendingBefore.length]
            : undefined;
        if (snapshot.fileExistedBefore) {
            await this.writeFile(absPath, snapshot.content);
        }
        else {
            await this.deleteFile(absPath);
        }
        this.snapshots.delete(absPath);
        void this.store.save(this.snapshots);
        this.closePanel(absPath);
        if (snapshot.fileExistedBefore) {
            await this.reopenAsTextEditor(absPath);
        }
        else {
            this.lastCursors.delete(absPath);
        }
        if (nextTarget) {
            await this.openDiff(nextTarget);
        }
        this._onDidChangeDiffs.fire();
    }
    async acceptAllPending() {
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
    hasPendingDiff(filePath) {
        return this.snapshots.has(normalizePath(filePath));
    }
    getPendingFiles() {
        return Array.from(this.snapshots.keys());
    }
    getSnapshot(filePath) {
        return this.snapshots.get(normalizePath(filePath))?.content;
    }
    /** Alias dùng bởi DiffEditorProvider; trả về content của snapshot (left side). */
    getSnapshotContent(filePath) {
        return this.getSnapshot(filePath);
    }
    /**
     * Build the real diff payload used by the aggregate Agent preview.
     * The snapshot is the left/original side; the current file on disk is the
     * right/modified side. Both are normalized to LF before calculating hunks.
     */
    async getDiffPreviewFile(filePath) {
        const absPath = normalizePath(filePath);
        const snapshot = this.snapshots.get(absPath);
        if (!snapshot) {
            return undefined;
        }
        let currentContent = '';
        const openDocument = vscode.workspace.textDocuments.find((document) => normalizePath(document.uri.fsPath) === absPath);
        if (openDocument) {
            currentContent = openDocument.getText();
        }
        else {
            try {
                currentContent = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(absPath))).toString('utf8');
            }
            catch (err) {
                if (!isFileNotFound(err)) {
                    return undefined;
                }
            }
        }
        const originalLf = (0, eol_1.toLf)(snapshot.content);
        const currentLf = (0, eol_1.toLf)(currentContent);
        const hunks = (0, hunkCalculator_1.calculateHunks)(originalLf, currentLf);
        if (hunks.length === 0 && snapshot.fileExistedBefore) {
            return undefined;
        }
        return {
            filePath: absPath,
            originalContent: originalLf,
            currentContent: currentLf,
            language: (0, language_1.detectLanguageId)(absPath),
            hunks,
        };
    }
    /**
     * Return pending-diff counters without exposing either side of a file to a
     * webview. This is intentionally computed in the extension host so the
     * Agent secondary bar remains a navigator, not a second diff renderer.
     */
    async getDiffPreviewMetadata() {
        const files = await Promise.all(this.getPendingFiles().map(async (filePath) => {
            const preview = await this.getDiffPreviewFile(filePath);
            if (!preview) {
                return undefined;
            }
            return {
                filePath: preview.filePath,
                additions: preview.hunks.reduce((total, hunk) => total + hunk.addedLines.length, 0),
                deletions: preview.hunks.reduce((total, hunk) => total + hunk.removedLines.length, 0),
                hunks: preview.hunks.length,
            };
        }));
        return files.filter((file) => file !== undefined);
    }
    /** Apply a manual edit made in the aggregate preview to the workspace document. */
    async applyPreviewEdit(filePath, newCurrent) {
        const absPath = normalizePath(filePath);
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
        const expanded = (0, eol_1.fromLf)(newCurrent, document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n');
        if (document.getText() === expanded) {
            return;
        }
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
        edit.replace(document.uri, fullRange, expanded);
        await vscode.workspace.applyEdit(edit);
    }
    async savePreviewFile(filePath) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(normalizePath(filePath)));
        await document.save();
    }
    /** Accept a complete file without opening a native editor tab. */
    async acceptFromPreview(filePath) {
        const absPath = normalizePath(filePath);
        if (!this.snapshots.has(absPath)) {
            return;
        }
        this.snapshots.delete(absPath);
        void this.store.save(this.snapshots);
        this.closePanel(absPath);
        this._onDidChangeDiffs.fire();
    }
    /** Revert a complete file without opening a native editor tab. */
    async revertFromPreview(filePath) {
        const absPath = normalizePath(filePath);
        const snapshot = this.snapshots.get(absPath);
        if (!snapshot) {
            return;
        }
        if (!snapshot.fileExistedBefore && snapshot.content.length === 0) {
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(absPath), { useTrash: false });
            }
            catch (err) {
                if (!isFileNotFound(err)) {
                    throw err;
                }
            }
        }
        else {
            await this.writeFile(absPath, snapshot.content);
        }
        this.snapshots.delete(absPath);
        void this.store.save(this.snapshots);
        this.closePanel(absPath);
        this._onDidChangeDiffs.fire();
    }
    async acceptHunkFromPreview(filePath, newOriginal, newCurrent) {
        const absPath = normalizePath(filePath);
        const snapshot = this.snapshots.get(absPath);
        if (!snapshot) {
            return;
        }
        this.snapshots.set(absPath, {
            ...snapshot,
            content: (0, eol_1.fromLf)(newOriginal, (0, eol_1.detectEol)(snapshot.content)),
        });
        if (newOriginal === newCurrent) {
            this.snapshots.delete(absPath);
            this.closePanel(absPath);
        }
        void this.store.save(this.snapshots);
        this._onDidChangeDiffs.fire();
    }
    async rejectHunkFromPreview(filePath, newOriginal, newCurrent) {
        const absPath = normalizePath(filePath);
        const snapshot = this.snapshots.get(absPath);
        if (!snapshot) {
            return;
        }
        await this.writeFile(absPath, newCurrent, { fromLf: true });
        if (newOriginal === newCurrent) {
            if (!snapshot.fileExistedBefore && newCurrent.length === 0) {
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.file(absPath), { useTrash: false });
                }
                catch (err) {
                    if (!isFileNotFound(err)) {
                        throw err;
                    }
                }
            }
            this.snapshots.delete(absPath);
            this.closePanel(absPath);
        }
        void this.store.save(this.snapshots);
        this._onDidChangeDiffs.fire();
    }
    setLastCursor(filePath, line, column, topLine) {
        this.lastCursors.set(normalizePath(filePath), { line, column, topLine });
    }
    getActiveFilePath() {
        const active = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (active?.input instanceof vscode.TabInputCustom) {
            if (active.input.viewType === diffWebviewPanel_1.DIFF_EDITOR_VIEW_TYPE) {
                return normalizePath(active.input.uri.fsPath);
            }
        }
        // Fallback: first panel in map.
        const first = this.panels.keys().next();
        return first.done ? undefined : first.value;
    }
    disposeAll() {
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
    async clearAll() {
        const hint = this.consumePendingActiveTabHint();
        const activeDiffPath = hint.captured
            ? (hint.path !== undefined && this.snapshots.has(hint.path) ? hint.path : undefined)
            : this.getLiveActiveDiffPath();
        this.disposeAll();
        await this.store.clear();
        if (activeDiffPath) {
            await this.reopenAsTextEditor(activeDiffPath);
        }
    }
    getLiveActiveDiffPath() {
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        return activeTab?.input instanceof vscode.TabInputCustom &&
            activeTab.input.viewType === diffWebviewPanel_1.DIFF_EDITOR_VIEW_TYPE &&
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
    markActiveTabBeforeAutoOpen() {
        this.pendingActiveTabPath = this.getCurrentTabFsPath();
        this.pendingActiveTabCaptured = true;
        this.pendingActiveTabCapturedAt = Date.now();
    }
    getCurrentTabFsPath() {
        const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        const uri = tab?.input instanceof vscode.TabInputText ? tab.input.uri :
            tab?.input instanceof vscode.TabInputCustom ? tab.input.uri :
                tab?.input instanceof vscode.TabInputNotebook ? tab.input.uri :
                    undefined;
        return uri ? normalizePath(uri.fsPath) : undefined;
    }
    /** Dùng 1 lần: đọc xong luôn reset state, để lần clearAll() sau (không có
     *  cụm auto-open nào xảy ra trước đó) không vô tình dùng lại hint cũ. */
    consumePendingActiveTabHint() {
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
    registerPanel(filePath, panel) {
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
    unregisterPanel(filePath, panel) {
        const absPath = normalizePath(filePath);
        const existing = this.panels.get(absPath);
        if (existing === panel) {
            this.panels.delete(absPath);
            this._onDidChangeDiffs.fire();
        }
    }
    closePanel(absPath) {
        const panel = this.panels.get(absPath);
        if (panel) {
            this.panels.delete(absPath);
            panel.dispose();
        }
    }
    async reopenAsTextEditor(absPath) {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(absPath));
        }
        catch (err) {
            if (!isFileNotFound(err)) {
                console.error('[ai-cli-diff] cannot stat file before reopening:', err);
            }
            this.lastCursors.delete(absPath);
            return;
        }
        const cursor = this.lastCursors.get(absPath);
        this.lastCursors.delete(absPath);
        const uri = vscode.Uri.file(canonicalCasePath(absPath));
        const showOptions = { preview: false };
        if (cursor) {
            const pos = new vscode.Position(Math.max(0, cursor.line - 1), Math.max(0, cursor.column - 1));
            showOptions.selection = new vscode.Range(pos, pos);
        }
        try {
            const editor = await vscode.window.showTextDocument(uri, showOptions);
            if (cursor?.topLine !== undefined) {
                const lastLine = Math.max(0, editor.document.lineCount - 1);
                const top = Math.min(lastLine, Math.max(0, cursor.topLine - 1));
                editor.revealRange(new vscode.Range(top, 0, top, 0), vscode.TextEditorRevealType.AtTop);
            }
        }
        catch (err) {
            console.error('[ai-cli-diff] reopenAsTextEditor failed:', err);
        }
    }
    // ---- Hunk-level operations (gọi bởi webview qua provider) ----
    /**
     * Accept 1 hunk: webview đã tính newOriginal (snapshot trồi lên include hunk),
     * newCurrent giữ nguyên. Chỉ update snapshot + có thể đóng nếu hết hunk.
     */
    async applyHunkAcceptFromWebview(filePath, newOriginal, newCurrent) {
        const absPath = normalizePath(filePath);
        const snapshot = this.snapshots.get(absPath);
        if (!snapshot) {
            return;
        }
        // newOriginal từ webview ở LF -> trả về đúng EOL của snapshot cũ, để snapshot
        // luôn giữ nguyên dạng byte gốc của file và revert() khôi phục chuẩn xác.
        this.snapshots.set(absPath, {
            ...snapshot,
            content: (0, eol_1.fromLf)(newOriginal, (0, eol_1.detectEol)(snapshot.content)),
        });
        void this.store.save(this.snapshots);
        if (newOriginal === newCurrent) {
            await this.accept(absPath);
        }
        else {
            this._onDidChangeDiffs.fire();
        }
    }
    /**
     * Reject 1 hunk: webview đã tính newCurrent (rollback hunk về original),
     * newOriginal giữ nguyên. Ghi newCurrent ra đĩa.
     */
    async applyHunkRejectFromWebview(filePath, newOriginal, newCurrent) {
        const absPath = normalizePath(filePath);
        const snapshot = this.snapshots.get(absPath);
        if (!snapshot) {
            return;
        }
        // newCurrent từ webview ở LF -> writeFile khôi phục EOL thật của file.
        await this.writeFile(absPath, newCurrent, { fromLf: true });
        if (newOriginal === newCurrent) {
            if (!snapshot.fileExistedBefore && newCurrent.length === 0) {
                await this.deleteFile(absPath);
            }
            const pendingBefore = this.getPendingFiles();
            const currentIdx = pendingBefore.findIndex(p => normalizePath(p) === absPath);
            const nextTarget = pendingBefore.length > 1 && currentIdx !== -1
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
    /**
     * @param opts.fromLf `content` đang ở LF thuần (đến từ webview) và cần khôi phục
     *   EOL thật của file trước khi ghi. Bỏ trống khi content đã đúng dạng byte gốc
     *   (vd: revert() ghi thẳng snapshot).
     */
    async writeFile(absPath, content, opts) {
        const uri = vscode.Uri.file(absPath);
        const doc = vscode.workspace.textDocuments.find(d => normalizePath(d.uri.fsPath) === absPath);
        let payload = content;
        if (opts?.fromLf) {
            // Document đang mở là nguồn đáng tin nhất — đó chính là EOL VS Code sẽ ghi.
            // Không mở thì suy từ nội dung hiện có trên đĩa.
            let eol;
            if (doc) {
                eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
            }
            else {
                try {
                    const bytes = await vscode.workspace.fs.readFile(uri);
                    eol = (0, eol_1.detectEol)(Buffer.from(bytes).toString('utf8'));
                }
                catch {
                    eol = '\n';
                }
            }
            payload = (0, eol_1.fromLf)(content, eol);
        }
        if (doc) {
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(new vscode.Position(0, 0), doc.lineAt(doc.lineCount - 1).range.end);
            edit.replace(uri, fullRange, payload);
            await vscode.workspace.applyEdit(edit);
            await doc.save();
        }
        else {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(payload, 'utf8'));
        }
    }
    async deleteFile(absPath) {
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(absPath));
        }
        catch (err) {
            if (!isFileNotFound(err)) {
                throw err;
            }
        }
    }
}
exports.DiffManager = DiffManager;
/**
 * Hint quá cũ (vd: cụm write đó rốt cuộc không phải git checkout nên
 * clearAll() không bao giờ chạy theo sau nó) thì bỏ qua, để lần clearAll()
 * không liên quan sau đó không lỡ dùng lại path cũ. Rộng hơn nhiều so với
 * holdMs tối đa (10s) + debounce xác nhận HEAD (1s).
 */
DiffManager.PENDING_ACTIVE_TAB_TTL_MS = 15000;
//# sourceMappingURL=diffManager.js.map