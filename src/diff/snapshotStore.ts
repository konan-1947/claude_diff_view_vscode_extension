/**
 * snapshotStore.ts
 *
 * Persistence layer cho diff snapshots: đọc/ghi `context.workspaceState`
 * dưới key `ai-cli-diff.snapshots`, kèm xử lý backward-compat với shape
 * cũ (entry là string thay vì object).
 */

import * as fs from 'fs';
import * as vscode from 'vscode';

const STATE_KEY = 'ai-cli-diff.snapshots';

export interface SnapshotState {
  content: string;
  fileExistedBefore: boolean;
}

export class SnapshotStore {
  constructor(private readonly workspaceState: vscode.Memento) {}

  /**
   * Đọc snapshot đã persist trước đó. Bỏ qua entry mà file không còn tồn tại.
   */
  load(): Map<string, SnapshotState> {
    const saved = this.workspaceState.get<Record<string, string | SnapshotState>>(STATE_KEY, {});
    const result = new Map<string, SnapshotState>();
    for (const [absPath, savedSnapshot] of Object.entries(saved)) {
      if (!fs.existsSync(absPath)) { continue; }
      result.set(absPath, normalizeSavedSnapshot(savedSnapshot));
    }
    return result;
  }

  save(snapshots: Map<string, SnapshotState>): Thenable<void> {
    const obj: Record<string, SnapshotState> = {};
    for (const [absPath, snapshot] of snapshots.entries()) {
      obj[absPath] = snapshot;
    }
    return this.workspaceState.update(STATE_KEY, obj);
  }

  clear(): Thenable<void> {
    return this.workspaceState.update(STATE_KEY, undefined);
  }
}

function normalizeSavedSnapshot(savedSnapshot: string | SnapshotState): SnapshotState {
  if (typeof savedSnapshot === 'string') {
    return { content: savedSnapshot, fileExistedBefore: true };
  }
  return {
    content: savedSnapshot.content,
    fileExistedBefore: savedSnapshot.fileExistedBefore === false ? false : true,
  };
}
