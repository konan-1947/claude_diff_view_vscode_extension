"use strict";
/**
 * snapshotStore.ts
 *
 * Persistence layer cho diff snapshots: đọc/ghi `context.workspaceState`
 * dưới key `ai-cli-diff.snapshots`, kèm xử lý backward-compat với shape
 * cũ (entry là string thay vì object).
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
exports.SnapshotStore = void 0;
const fs = __importStar(require("fs"));
const STATE_KEY = 'ai-cli-diff.snapshots';
class SnapshotStore {
    constructor(workspaceState) {
        this.workspaceState = workspaceState;
    }
    /**
     * Đọc snapshot đã persist trước đó. Bỏ qua entry mà file không còn tồn tại.
     */
    load() {
        const saved = this.workspaceState.get(STATE_KEY, {});
        const result = new Map();
        for (const [absPath, savedSnapshot] of Object.entries(saved)) {
            if (!fs.existsSync(absPath)) {
                continue;
            }
            result.set(absPath, normalizeSavedSnapshot(savedSnapshot));
        }
        return result;
    }
    save(snapshots) {
        const obj = {};
        for (const [absPath, snapshot] of snapshots.entries()) {
            obj[absPath] = snapshot;
        }
        return this.workspaceState.update(STATE_KEY, obj);
    }
    clear() {
        return this.workspaceState.update(STATE_KEY, undefined);
    }
}
exports.SnapshotStore = SnapshotStore;
function normalizeSavedSnapshot(savedSnapshot) {
    if (typeof savedSnapshot === 'string') {
        return { content: savedSnapshot, fileExistedBefore: true };
    }
    return {
        content: savedSnapshot.content,
        fileExistedBefore: savedSnapshot.fileExistedBefore === false ? false : true,
    };
}
//# sourceMappingURL=snapshotStore.js.map