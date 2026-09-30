"use strict";
/**
 * baselineStore.ts
 *
 * Quản lý baseline nội dung các file để WorkspaceWatcher có thể
 * phát hiện external writes so với trạng thái trước đó.
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
exports.BaselineStore = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
class BaselineStore {
    constructor() {
        /** filePath -> nội dung baseline trước khi external process ghi đè */
        this.snapshots = new Map();
        /** Các file bị bỏ qua vì vượt giới hạn kích thước hoặc số dòng. */
        this.sizeSkipped = new Set();
    }
    normalizePath(p) {
        const fsPath = vscode.Uri.file(path.resolve(p)).fsPath;
        return process.platform === 'win32' ? fsPath.toLowerCase() : fsPath;
    }
    get(filePath) {
        return this.snapshots.get(this.normalizePath(filePath));
    }
    set(filePath, content) {
        this.snapshots.set(this.normalizePath(filePath), content);
    }
    has(filePath) {
        return this.snapshots.has(this.normalizePath(filePath));
    }
    /** Trả về true nếu file đã có baseline hoặc đã được đánh dấu bỏ qua. */
    hasState(filePath) {
        const key = this.normalizePath(filePath);
        return this.snapshots.has(key) || this.sizeSkipped.has(key);
    }
    /** Bỏ theo dõi 1 file vì nó vượt giới hạn kích thước. */
    markSizeSkipped(filePath) {
        const key = this.normalizePath(filePath);
        this.snapshots.delete(key);
        this.sizeSkipped.add(key);
    }
    /**
     * File này từng bị bỏ qua vì kích thước? Dùng để phân biệt "file mới" với
     * "file cũ vừa lọt xuống dưới ngưỡng". Trả về true thì đồng thời xoá cờ.
     */
    consumeSizeSkipped(filePath) {
        const key = this.normalizePath(filePath);
        return this.sizeSkipped.delete(key);
    }
    /** Xoá toàn bộ baseline trong RAM. Dùng khi branch switch để rebuild lại từ disk. */
    clear() {
        this.snapshots.clear();
        this.sizeSkipped.clear();
    }
}
exports.BaselineStore = BaselineStore;
//# sourceMappingURL=baselineStore.js.map