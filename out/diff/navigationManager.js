"use strict";
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
exports.NavigationManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
/** Normalize path helper */
function normalizePath(filePath) {
    const fsPath = vscode.Uri.file(path.resolve(filePath)).fsPath;
    return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
}
class NavigationManager {
    constructor(diffManager) {
        this.diffManager = diffManager;
    }
    /**
     * Chuyển sang file tiếp theo trong danh sách pending diffs.
     */
    async nextFile() {
        await this.navigate(1);
    }
    /**
     * Quay lại file trước đó trong danh sách pending diffs.
     */
    async prevFile() {
        await this.navigate(-1);
    }
    async navigate(direction) {
        const pendingFiles = this.diffManager.getPendingFiles();
        if (pendingFiles.length === 0) {
            vscode.window.showInformationMessage('No files with pending diffs.');
            return;
        }
        const currentEditor = vscode.window.activeTextEditor;
        const currentPath = currentEditor ? normalizePath(currentEditor.document.uri.fsPath) : '';
        // Nếu chỉ còn 1 file pending: nếu user đang đứng ở file khác thì mở diff đó ngay.
        if (pendingFiles.length === 1) {
            if (normalizePath(pendingFiles[0]) !== currentPath) {
                await this.diffManager.openDiff(pendingFiles[0]);
            }
            return;
        }
        let currentIndex = pendingFiles.indexOf(currentPath);
        // Nếu không tìm thấy file hiện tại (đang ở file khác không có diff),
        // chọn biên phù hợp theo hướng để điều hướng không bị wrap.
        if (currentIndex === -1) {
            currentIndex = direction > 0 ? 0 : pendingFiles.length - 1;
        }
        else {
            const targetIndex = currentIndex + direction;
            if (targetIndex < 0 || targetIndex >= pendingFiles.length) {
                return;
            }
            currentIndex = targetIndex;
        }
        const targetPath = pendingFiles[currentIndex];
        await this.diffManager.openDiff(targetPath);
    }
    /**
     * Lấy danh sách thông tin để hiển thị trên thanh điều hướng.
     */
    getNavigationInfo(currentFilePath) {
        const pendingFiles = this.diffManager.getPendingFiles();
        if (pendingFiles.length === 0) {
            return undefined;
        }
        if (pendingFiles.length === 1) {
            const onlyFile = pendingFiles[0];
            const onlyName = path.basename(onlyFile);
            return {
                currentIdx: 1,
                total: 1,
                prevName: onlyName,
                nextName: onlyName,
                canPrev: true,
                canNext: true,
            };
        }
        const currentPath = normalizePath(currentFilePath);
        const rawIndex = pendingFiles.indexOf(currentPath);
        // Nếu user đang đứng ở file không pending, nút Next/Prev sẽ "mở" một file biên:
        // - Next: mở pending đầu tiên
        // - Prev: mở pending cuối cùng
        if (rawIndex === -1) {
            const first = pendingFiles[0];
            const last = pendingFiles[pendingFiles.length - 1];
            return {
                currentIdx: 1,
                total: pendingFiles.length,
                prevName: path.basename(last),
                nextName: path.basename(first),
                canPrev: true,
                canNext: true,
            };
        }
        const currentIndex = rawIndex;
        const canPrev = currentIndex > 0;
        const canNext = currentIndex < pendingFiles.length - 1;
        const prevName = canPrev ? path.basename(pendingFiles[currentIndex - 1]) : '';
        const nextName = canNext ? path.basename(pendingFiles[currentIndex + 1]) : '';
        return {
            currentIdx: currentIndex + 1,
            total: pendingFiles.length,
            prevName,
            nextName,
            canPrev,
            canNext,
        };
    }
}
exports.NavigationManager = NavigationManager;
//# sourceMappingURL=navigationManager.js.map