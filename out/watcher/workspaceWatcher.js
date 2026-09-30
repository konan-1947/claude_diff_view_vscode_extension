"use strict";
/**
 * workspaceWatcher.ts
 *
 * Theo dõi file thay đổi trong workspace qua VS Code API.
 * Khi bất kỳ file nào được ghi (bởi Claude, hay bất kỳ tool nào),
 * extension sẽ tự động snapshot và hiện inline diff.
 *
 * Flow:
 *   1. onDidSaveTextDocument → sync snapshot để FileSystemWatcher không trigger diff sai
 *   2. FileSystemWatcher → bắt được cả file ghi từ external process
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
exports.WorkspaceWatcher = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const baselineScanner_1 = require("./baselineScanner");
const baselineStore_1 = require("./baselineStore");
const fileTypeRules_1 = require("./fileTypeRules");
const pathExclusions_1 = require("./pathExclusions");
const fileSizeLimit_1 = require("./fileSizeLimit");
const writeBurstMeter_1 = require("./writeBurstMeter");
class WorkspaceWatcher {
    constructor(diffManager, shouldAutoOpenDiff = () => true) {
        this.diffManager = diffManager;
        this.shouldAutoOpenDiff = shouldAutoOpenDiff;
        this.disposables = [];
        /** Debounce: thời điểm lần cuối xử lý mỗi file */
        this.lastProcessed = new Map();
        /** Lưu thời điểm VS Code vừa Save file (để bỏ qua watcher trigger từ chính VS Code) */
        this.savedFilesByVsCode = new Map();
        this.pendingTimers = new Set();
        /** Directory-create events waiting for one settled subtree reconciliation. */
        this.pendingDirectoryScans = new Map();
        /**
         * Cờ "đang trong external batch operation" (vd: git checkout đổi branch).
         * Trong window này, mọi external write chỉ cập nhật baseline mà KHÔNG tạo diff.
         * Được set bởi GitBranchWatcher khi phát hiện .git/HEAD đổi.
         */
        this.suppressUntil = 0;
        this.burstMeter = new writeBurstMeter_1.WriteBurstMeter();
        /** Giữ external write đến khi initial baseline scan hoàn tất. */
        this.baselineScansInProgress = 0;
        this.queuedExternalWrites = new Map();
        /** Thời gian giữ file vượt ngưỡng burst chờ xác nhận git trước khi mở diff bình thường. */
        this.holdMs = 2000;
        /** File vượt ngưỡng burst, đang chờ xác nhận git (xem resolveOrHold/scheduleHoldResolve). */
        this.heldWrites = new Map();
        /** Mốc thời gian write-triggered diff-open gần nhất — dùng để nhận biết "write đầu cụm" trong resolveOrHold(). */
        this.lastAutoOpenActivityAt = 0;
        this.snapshots = new baselineStore_1.BaselineStore();
        this.baselineScanner = new baselineScanner_1.BaselineScanner(this.snapshots);
    }
    start() {
        this.watchVscodeEvents();
        this.watchWorkspaceFolders();
        this.applyBurstConfig();
        const d = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ai-cli-diff-view.burstDetectionEnabled') ||
                e.affectsConfiguration('ai-cli-diff-view.burstDetectionWindowMs') ||
                e.affectsConfiguration('ai-cli-diff-view.burstDetectionThreshold') ||
                e.affectsConfiguration('ai-cli-diff-view.burstDetectionHoldMs')) {
                this.applyBurstConfig();
            }
        });
        this.disposables.push(d);
    }
    applyBurstConfig() {
        this.burstMeter.updateConfig(this.loadBurstMeterConfig());
        const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
        const holdMs = config.get('burstDetectionHoldMs', 2000);
        this.holdMs = Number.isFinite(holdMs) ? Math.min(10000, Math.max(500, holdMs)) : 2000;
    }
    loadBurstMeterConfig() {
        const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
        const windowMs = config.get('burstDetectionWindowMs', 300);
        const threshold = config.get('burstDetectionThreshold', 8);
        return {
            enabled: config.get('burstDetectionEnabled', true),
            windowMs: Number.isFinite(windowMs) ? Math.min(5000, Math.max(50, windowMs)) : 300,
            threshold: Number.isFinite(threshold) ? Math.min(500, Math.max(2, threshold)) : 8,
        };
    }
    /**
     * Báo cho watcher biết vừa có external batch operation (vd: git checkout).
     * - Wipe baseline trong RAM để rebuild từ disk hiện tại.
     * - Set suppress window để các fs event đến sau (kể cả từ setTimeout 200ms
     *   đã pending) không tạo diff nữa, chỉ ghi đè baseline.
     * - Xác nhận git thật đã xảy ra: bỏ toàn bộ file đang bị giữ (heldWrites) —
     *   không mở diff cho chúng nữa, đúng như baseline vừa rebuild.
     */
    notifyExternalBatch(windowMs = 5000) {
        this.suppressUntil = Date.now() + windowMs;
        this.snapshots.clear();
        if (this.holdResolveTimer) {
            clearTimeout(this.holdResolveTimer);
            this.holdResolveTimer = undefined;
        }
        this.heldWrites.clear();
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            void this.watchFolder(folder.uri.fsPath).catch(() => {
                // ignore — sẽ tự rebuild dần qua các event sau
            });
        }
    }
    isSuppressed() {
        return Date.now() < this.suppressUntil;
    }
    normalizePath(p) {
        const fsPath = vscode.Uri.file(path.resolve(p)).fsPath;
        return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
    }
    normalizeContent(content) {
        return content.trim().replace(/\r\n/g, '\n');
    }
    /**
     * Sync snapshot khi VS Code save — đảm bảo FileSystemWatcher không trigger diff sai.
     * (onDidSaveTextDocument luôn fire trước watcher event)
     */
    watchVscodeEvents() {
        const d = vscode.workspace.onDidSaveTextDocument((doc) => {
            const filePath = this.normalizePath(doc.uri.fsPath);
            // File quá lớn thì không giữ baseline — nhưng phải ĐÁNH DẤU, không chỉ bỏ
            // qua: nếu sau này nó tụt xuống dưới ngưỡng, "không có baseline" sẽ bị hiểu
            // là file mới và Revert all sẽ xoá mất file. Vẫn ghi nhận VS Code vừa lưu
            // để FileSystemWatcher không hiểu nhầm đây là external write.
            const text = doc.getText();
            if ((0, fileSizeLimit_1.exceedsLineLimit)(text)) {
                this.snapshots.markSizeSkipped(filePath);
            }
            else {
                this.snapshots.set(filePath, text);
            }
            this.savedFilesByVsCode.set(filePath, Date.now());
            this.pruneStaleMapEntries();
        });
        this.disposables.push(d);
    }
    pruneStaleMapEntries() {
        const now = Date.now();
        for (const [key, ts] of this.lastProcessed) {
            if (now - ts > WorkspaceWatcher.LAST_PROCESSED_TTL_MS) {
                this.lastProcessed.delete(key);
            }
        }
        for (const [key, ts] of this.savedFilesByVsCode) {
            if (now - ts > WorkspaceWatcher.SAVED_BY_VSCODE_TTL_MS) {
                this.savedFilesByVsCode.delete(key);
            }
        }
    }
    watchWorkspaceFolders() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return;
        }
        // Sử dụng FileSystemWatcher native của VS Code để tránh kẹt event loop
        // khi tạo mới project có hàng ngàn file (VD: node_modules trong Next.js)
        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        const handleUri = (uri) => {
            this.handleExternalWrite(uri);
        };
        fileWatcher.onDidChange(handleUri);
        fileWatcher.onDidCreate((uri) => {
            void this.handleExternalCreate(uri);
        });
        this.disposables.push(fileWatcher);
        for (const folder of folders) {
            void this.watchFolder(folder.uri.fsPath);
        }
        const d = vscode.workspace.onDidChangeWorkspaceFolders((e) => {
            for (const added of e.added) {
                void this.watchFolder(added.uri.fsPath);
            }
        });
        this.disposables.push(d);
    }
    async watchFolder(folderPath) {
        this.baselineScansInProgress++;
        try {
            await this.baselineScanner.buildInitialSnapshots(folderPath);
        }
        catch (err) {
            console.error('[ai-cli-diff-view] workspaceWatcher buildInitialSnapshots error:', err);
        }
        finally {
            this.baselineScansInProgress--;
            if (this.baselineScansInProgress === 0) {
                const queued = Array.from(this.queuedExternalWrites.entries());
                this.queuedExternalWrites.clear();
                for (const [filePath, queuedWrite] of queued) {
                    this.lastProcessed.delete(filePath);
                    this.handleExternalWrite(vscode.Uri.file(filePath), {
                        burstHoldOverride: queuedWrite.burstHold,
                        readDelayMs: queuedWrite.readDelayMs,
                    });
                }
            }
        }
    }
    /**
     * File-create events follow the normal write path. Directory-create events
     * need one delayed subtree scan because a recursive watcher can observe the
     * new directory but miss children created in the same filesystem batch.
     */
    async handleExternalCreate(uri) {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;
            const isSymlink = (stat.type & vscode.FileType.SymbolicLink) !== 0;
            if (!isDirectory) {
                this.handleExternalWrite(uri);
                return;
            }
            const absPath = this.normalizePath(uri.fsPath);
            if (isSymlink || (0, pathExclusions_1.isExcludedPathSegment)(absPath) || !this.isInWorkspace(absPath)) {
                return;
            }
            this.scheduleDirectoryScan(uri, absPath);
        }
        catch {
            // The created path may already have been moved or deleted.
        }
    }
    scheduleDirectoryScan(uri, absPath) {
        // A pending ancestor scan already covers this directory.
        for (const pendingPath of this.pendingDirectoryScans.keys()) {
            if (this.isSameOrDescendant(absPath, pendingPath)) {
                return;
            }
        }
        // Prefer the broader scan if a parent event arrives after child events.
        for (const [pendingPath, timer] of this.pendingDirectoryScans) {
            if (this.isSameOrDescendant(pendingPath, absPath)) {
                clearTimeout(timer);
                this.pendingDirectoryScans.delete(pendingPath);
            }
        }
        const timer = setTimeout(() => {
            this.pendingDirectoryScans.delete(absPath);
            void this.scanCreatedDirectory(uri);
        }, WorkspaceWatcher.DIRECTORY_SETTLE_MS);
        this.pendingDirectoryScans.set(absPath, timer);
    }
    isSameOrDescendant(candidatePath, parentPath) {
        const relative = path.relative(parentPath, candidatePath);
        return relative === '' ||
            (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
    }
    async scanCreatedDirectory(rootUri) {
        const pending = [rootUri];
        while (pending.length > 0) {
            const directory = pending.pop();
            let entries;
            try {
                entries = await vscode.workspace.fs.readDirectory(directory);
            }
            catch {
                continue;
            }
            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(directory, name);
                const childPath = this.normalizePath(childUri.fsPath);
                if ((0, pathExclusions_1.isExcludedPathSegment)(childPath) || (type & vscode.FileType.SymbolicLink) !== 0) {
                    continue;
                }
                if ((type & vscode.FileType.Directory) !== 0) {
                    pending.push(childUri);
                }
                else if ((type & vscode.FileType.File) !== 0 && (0, fileTypeRules_1.isTextFile)(name)) {
                    // The directory already had a settle delay, so do not add the normal
                    // 200ms file-write delay again. Existing file debounce handles overlap
                    // with a child onDidCreate event that VS Code did deliver.
                    this.handleExternalWrite(childUri, { readDelayMs: 0 });
                }
            }
        }
    }
    handleExternalWrite(uri, options = {}) {
        const absPath = this.normalizePath(uri.fsPath);
        const readDelayMs = options.readDelayMs ?? 200;
        // Đo tốc độ ghi TRƯỚC mọi filter bên dưới — xem writeBurstMeter.ts. Capture
        // quyết định NGAY tại thời điểm raw event tới (chính xác nhất so với cửa
        // sổ trượt), mang theo qua debounce/setTimeout bên dưới tới lúc quyết định
        // triggerDiff — không gọi record() lần 2 để tránh đếm trùng.
        const burstHold = options.burstHoldOverride ?? this.burstMeter.record(absPath);
        // Bỏ qua dependency / build output / tooling (dotnet bin/obj, node_modules, …)
        if ((0, pathExclusions_1.isExcludedPathSegment)(absPath)) {
            return;
        }
        // 1. Kiểm tra xem file này vừa được VS Code Save hay không
        const lastVsCodeSave = this.savedFilesByVsCode.get(absPath) ?? 0;
        const now = Date.now();
        if (now - lastVsCodeSave < 2000) {
            // Bỏ qua vì đây là viết từ chính VS Code editor
            return;
        }
        // 2. Debounce: bỏ qua nếu vừa xử lý file này trong 500ms
        const lastTime = this.lastProcessed.get(absPath) ?? 0;
        if (now - lastTime < 500) {
            return;
        }
        this.lastProcessed.set(absPath, now);
        this.pruneStaleMapEntries();
        if (!(0, fileTypeRules_1.isTextFile)(path.basename(absPath))) {
            return;
        }
        if (!this.isInWorkspace(absPath)) {
            return;
        }
        if (this.baselineScansInProgress > 0) {
            this.queuedExternalWrites.set(absPath, { burstHold, readDelayMs });
            return;
        }
        if (readDelayMs <= 0) {
            void this.processExternalWrite(uri, absPath, burstHold);
            return;
        }
        // Đọc nội dung mới sau một chút để đảm bảo write xong.
        const timer = setTimeout(() => {
            this.pendingTimers.delete(timer);
            void this.processExternalWrite(uri, absPath, burstHold);
        }, readDelayMs);
        this.pendingTimers.add(timer);
    }
    async processExternalWrite(uri, absPath, burstHold) {
        // Re-check immediately before reading in case VS Code saved the document
        // while this write was waiting for its settle delay.
        const lastVsCodeSaveAfterTimeout = this.savedFilesByVsCode.get(absPath) ?? 0;
        if (Date.now() - lastVsCodeSaveAfterTimeout < 2000) {
            return;
        }
        try {
            // Lọc thô theo byte TRƯỚC khi đọc, để file vài MB không bị đọc lên chỉ để loại.
            // stat() cũng là phép kiểm tra file tồn tại; nếu file đã bị xóa, nó sẽ throw.
            const stat = await vscode.workspace.fs.stat(uri);
            if ((0, fileSizeLimit_1.exceedsSizeLimitByBytes)(stat.size)) {
                this.snapshots.markSizeSkipped(absPath);
                return;
            }
            const newContentRaw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            // File vượt giới hạn số dòng -> coi như không tồn tại với extension:
            // không giữ baseline, không mở diff. Xoá cả baseline cũ phòng khi file
            // vừa vượt ngưỡng (hoặc user vừa hạ setting xuống).
            if ((0, fileSizeLimit_1.exceedsLineLimit)(newContentRaw)) {
                this.snapshots.markSizeSkipped(absPath);
                return;
            }
            // Trong window external batch (vd: git checkout): chỉ refresh baseline,
            // không tạo diff. Tránh việc so working tree mới với baseline branch cũ.
            if (this.isSuppressed()) {
                this.snapshots.set(absPath, newContentRaw);
                return;
            }
            const oldContentRaw = this.snapshots.get(absPath);
            const newContent = this.normalizeContent(newContentRaw);
            const oldContent = oldContentRaw !== undefined ? this.normalizeContent(oldContentRaw) : undefined;
            if (oldContent === undefined) {
                this.snapshots.set(absPath, newContentRaw);
                // File từng bị bỏ qua vì quá lớn và giờ vừa lọt xuống dưới ngưỡng:
                // nó KHÔNG phải file mới. Không có baseline cũ để so, nên chỉ nhận nội
                // dung hiện tại làm baseline rồi thôi. Mở diff ở đây sẽ hiện cả file là
                // "thêm mới", và Revert all trên diff đó sẽ xoá mất file.
                if (this.snapshots.consumeSizeSkipped(absPath)) {
                    return;
                }
                // A new empty file still needs a pending snapshot: accepting keeps it,
                // while reverting removes it. It has no content hunk to render.
                this.resolveOrHold(absPath, '', newContentRaw, false, burstHold);
                return;
            }
            if (oldContent === newContent) {
                // normalizeContent() bỏ qua EOL, nên nhánh này còn nuốt cả trường hợp
                // file chỉ đổi CRLF <-> LF. Phải refresh baseline raw trước khi thoát,
                // nếu không snapshot giữ EOL cũ vĩnh viễn và lần sửa 1 dòng kế tiếp sẽ
                // bị so lệch EOL -> diff phủ cả file (bug #15).
                this.snapshots.set(absPath, newContentRaw);
                return;
            }
            // Trước khi trigger diff mới, cập nhật baseline vào snapshot store của watcher
            // để lần save kế tiếp không bị trigger lại.
            this.snapshots.set(absPath, newContentRaw);
            if (!this.diffManager.hasPendingDiff(absPath)) {
                this.resolveOrHold(absPath, oldContentRaw, newContentRaw, true, burstHold);
            }
        }
        catch {
            // file đang bị lock, không có quyền đọc hoặc đã bị xóa — bỏ qua
        }
    }
    triggerDiff(filePath, originalContent, newContent, fileExistedBefore, fromBurstDump = false) {
        this.diffManager.loadSnapshot(filePath, originalContent, fileExistedBefore);
        // Agent Mode owns review in its central preview. Keep the pending snapshot
        // so its changes sidebar refreshes, but never steal the main editor focus.
        if (!this.shouldAutoOpenDiff()) {
            return;
        }
        this.diffManager.openDiff(filePath, fromBurstDump ? { preserveFocus: true } : undefined).catch((err) => {
            console.error('[ai-cli-diff-view] workspaceWatcher openDiff failed:', err);
        });
    }
    /**
     * File dưới ngưỡng burst: mở diff ngay như trước. File vượt ngưỡng: giữ lại
     * chờ `holdMs` — nếu trong lúc chờ git branch được xác nhận đổi thật
     * (`notifyExternalBatch()` chạy), file bị bỏ âm thầm; nếu không, mở diff
     * bình thường sau khi hết giờ chờ, như chưa từng bị giữ.
     */
    resolveOrHold(filePath, originalContent, newContent, fileExistedBefore, hold) {
        // Ghi lại tab đang active THẬT SỰ trước khi mở diff — chỉ ở write ĐẦU
        // TIÊN của 1 cụm (cách write gần nhất > ACTIVE_TAB_CAPTURE_GAP_MS), để
        // không ghi đè bằng activeTab đã bị các openDiff() không đồng bộ trước đó
        // trong cùng cụm làm ngẫu nhiên. Áp dụng cho cả nhánh mở ngay (checkout
        // đổi ít file, dưới ngưỡng burst nhưng vẫn ghi gần như đồng thời) lẫn
        // nhánh hold-rồi-dump — không chỉ riêng burst. DiffManager.clearAll() sẽ
        // dùng hint này thay vì activeTab tại thời điểm clear (đã có thể bị hỏng
        // bởi race) nếu git branch đổi ngay sau đó.
        const now = Date.now();
        if (now - this.lastAutoOpenActivityAt > WorkspaceWatcher.ACTIVE_TAB_CAPTURE_GAP_MS) {
            this.diffManager.markActiveTabBeforeAutoOpen();
        }
        this.lastAutoOpenActivityAt = now;
        if (!hold) {
            this.triggerDiff(filePath, originalContent, newContent, fileExistedBefore);
            return;
        }
        this.heldWrites.set(filePath, { originalContent, newContent, fileExistedBefore });
        this.scheduleHoldResolve();
    }
    /** Debounce dùng chung cho cả cụm burst: mỗi file mới vào hàng chờ sẽ reset lại. */
    scheduleHoldResolve() {
        if (this.holdResolveTimer) {
            clearTimeout(this.holdResolveTimer);
        }
        this.holdResolveTimer = setTimeout(() => {
            this.holdResolveTimer = undefined;
            const entries = Array.from(this.heldWrites.entries());
            this.heldWrites.clear();
            for (const [filePath, w] of entries) {
                this.triggerDiff(filePath, w.originalContent, w.newContent, w.fileExistedBefore, true);
            }
        }, this.holdMs);
    }
    isInWorkspace(filePath) {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return false;
        }
        const normalizedPath = this.normalizePath(filePath);
        return folders.some(f => normalizedPath.startsWith(this.normalizePath(f.uri.fsPath)));
    }
    /** Cập nhật snapshot khi người dùng tự sửa file (để baseline luôn đúng) */
    updateSnapshot(filePath, content) {
        this.snapshots.set(this.normalizePath(filePath), content);
    }
    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
        for (const timer of this.pendingTimers) {
            clearTimeout(timer);
        }
        this.pendingTimers.clear();
        for (const timer of this.pendingDirectoryScans.values()) {
            clearTimeout(timer);
        }
        this.pendingDirectoryScans.clear();
        if (this.holdResolveTimer) {
            clearTimeout(this.holdResolveTimer);
            this.holdResolveTimer = undefined;
        }
        this.heldWrites.clear();
        this.queuedExternalWrites.clear();
    }
}
exports.WorkspaceWatcher = WorkspaceWatcher;
WorkspaceWatcher.DIRECTORY_SETTLE_MS = 300;
/** Debounce window is 500ms — keep entries an order of magnitude longer for safety, then drop. */
WorkspaceWatcher.LAST_PROCESSED_TTL_MS = 60000;
/** VS Code save guard window is 2s — same safety multiplier. */
WorkspaceWatcher.SAVED_BY_VSCODE_TTL_MS = 10000;
/** Khoảng cách tối thiểu giữa 2 write để coi là 2 cụm khác nhau (và ghi lại hint activeTab mới). */
WorkspaceWatcher.ACTIVE_TAB_CAPTURE_GAP_MS = 500;
//# sourceMappingURL=workspaceWatcher.js.map