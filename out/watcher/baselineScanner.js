"use strict";
/**
 * baselineScanner.ts
 *
 * Quét nội dung ban đầu của workspace và ghi baseline vào BaselineStore.
 * Dùng VS Code workspace API để không chặn extension host và giới hạn số file
 * được đọc đồng thời để tránh tăng tải/RAM đột biến.
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
exports.BaselineScanner = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const pathExclusions_1 = require("./pathExclusions");
const fileSizeLimit_1 = require("./fileSizeLimit");
const fileTypeRules_1 = require("./fileTypeRules");
class BaselineScanner {
    constructor(store) {
        this.store = store;
    }
    /**
     * Đệ quy snapshot nội dung tất cả file text trong một thư mục.
     * Chỉ chạy lần đầu khi extension khởi động để tạo baseline.
     */
    async buildInitialSnapshots(folderPath) {
        try {
            const folderUri = vscode.Uri.file(folderPath);
            const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folderUri, '**/*'));
            let nextIndex = 0;
            const workerCount = Math.min(this.readConcurrency(), uris.length);
            const workers = Array.from({ length: workerCount }, async () => {
                while (nextIndex < uris.length) {
                    const uri = uris[nextIndex++];
                    await this.snapshotFile(uri, folderPath);
                }
            });
            await Promise.all(workers);
        }
        catch {
            // ignore lỗi permission hoặc thư mục không có quyền đọc
        }
    }
    readConcurrency() {
        const configured = vscode.workspace
            .getConfiguration('ai-cli-diff-view')
            .get('baselineScanConcurrency', BaselineScanner.DEFAULT_CONCURRENCY);
        if (!Number.isFinite(configured)) {
            return BaselineScanner.DEFAULT_CONCURRENCY;
        }
        return Math.min(BaselineScanner.MAX_CONCURRENCY, Math.max(1, Math.floor(configured)));
    }
    async snapshotFile(uri, folderPath) {
        const fullPath = path.resolve(uri.fsPath);
        const relativePath = path.relative(path.resolve(folderPath), fullPath);
        const relativeSegments = relativePath.split(path.sep);
        if (relativeSegments.slice(0, -1).some(segment => segment.startsWith('.'))) {
            return;
        }
        if ((0, pathExclusions_1.isExcludedPathSegment)(fullPath) || !(0, fileTypeRules_1.isTextFile)(path.basename(fullPath))) {
            return;
        }
        if (this.store.hasState(fullPath)) {
            return;
        }
        try {
            // Lọc thô theo byte trước, để file vài MB không bị đọc lên chỉ để loại.
            const stat = await vscode.workspace.fs.stat(uri);
            if ((0, fileSizeLimit_1.exceedsSizeLimitByBytes)(stat.size)) {
                if (!this.store.hasState(fullPath)) {
                    this.store.markSizeSkipped(fullPath);
                }
                return;
            }
            const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            if ((0, fileSizeLimit_1.exceedsLineLimit)(content)) {
                if (!this.store.hasState(fullPath)) {
                    this.store.markSizeSkipped(fullPath);
                }
                return;
            }
            if (!this.store.hasState(fullPath)) {
                this.store.set(fullPath, content);
            }
        }
        catch {
            // binary, permission error hoặc file đang bị lock — bỏ qua
        }
    }
}
exports.BaselineScanner = BaselineScanner;
BaselineScanner.DEFAULT_CONCURRENCY = 4;
BaselineScanner.MAX_CONCURRENCY = 16;
//# sourceMappingURL=baselineScanner.js.map