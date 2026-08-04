/**
 * gitBranchWatcher.ts
 *
 * Watches `.git/HEAD` của mỗi workspace root (resolve qua `gitdir:` nếu là
 * worktree/submodule). Khi HEAD ref đổi (branch switch, hoặc checkout sang
 * ref khác / commit detached), clear toàn bộ pending diffs để snapshot cũ
 * không bị so sánh với working tree của branch khác.
 *
 * KHÔNG dùng đường so-nội-dung-HEAD này cho pull/rebase/reset trên cùng
 * branch — những thao tác đó đổi `refs/heads/<branch>` chứ không đổi nội
 * dung HEAD (vẫn là `ref: refs/heads/<branch>`). Rebase là ngoại lệ tạm thời:
 * HEAD có detach giữa chừng nhưng tự trả về đúng nội dung cũ trước khi debounce
 * ở dưới kịp đọc, nên tự nhiên không bị coi nhầm là branch switch — nhưng
 * cũng vì vậy không được xác nhận qua đường này.
 *
 * Để bắt được pull/merge/rebase/reset cùng branch, watcher này theo dõi thêm
 * `.git/logs/HEAD` (reflog) — mỗi ref update git append 1 dòng gắn nhãn hành
 * động (`pull: ...`, `merge ...`, `rebase (finish): ...`, `reset: ...`,
 * `commit: ...`, `checkout: ...`). Khi dòng cuối khớp pull/merge/rebase/reset,
 * coi là batch operation của git đã xác nhận — chỉ gọi
 * `workspaceWatcher.notifyExternalBatch()` (bỏ âm thầm các write đang bị giữ
 * vì burst detection, rebuild baseline) mà KHÔNG `clearPendingDiffs()`, vì
 * pull/rebase/reset cùng branch không làm baseline của các diff đang mở khác
 * (không liên quan) trở nên sai. `commit`/`checkout` bị loại khỏi regex này
 * có chủ đích: `commit` không nên trigger gì (git add/commit không đổi
 * working tree), `checkout` sang ref khác vẫn do đường so-nội-dung-HEAD ở
 * trên xử lý (kèm `clearPendingDiffs()`), tránh 2 đường xử lý trùng nhau.
 *
 * Lưu ý: format message reflog là convention lâu năm của git, không phải API
 * cam kết ổn định tuyệt đối. Vì vậy đây chỉ là lưới xác nhận PHỤ — lưới
 * chính vẫn là burst detection (`WriteBurstMeter`); nếu message không khớp vì
 * lý do gì đó, hành vi rơi về đúng như trước khi có tính năng này (mở diff
 * sau khi hết `burstDetectionHoldMs`), không có gì vỡ.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DiffManager } from '../diff/diffManager';
import { WorkspaceWatcher } from './workspaceWatcher';

const STORED_HEAD_KEY = 'ai-cli-diff.lastHeadByFolder';

/** Nhãn hành động reflog coi là git batch-op cùng branch cần xác nhận (xem comment đầu file). */
const REFLOG_CONFIRM_ACTION = /^(pull|merge|rebase|reset)\b/i;

export class GitBranchWatcher {
  private disposables: vscode.Disposable[] = [];
  private fsWatchers: Map<string, fs.FSWatcher> = new Map();
  private headContents: Map<string, string> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private reflogWatchers: Map<string, fs.FSWatcher> = new Map();
  private reflogDebounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly diffManager: DiffManager,
    private readonly workspaceState: vscode.Memento,
    private readonly workspaceWatcher: WorkspaceWatcher,
    private readonly debounceMs: number = 1000,
  ) {}

  private getStoredHead(folderPath: string): string | undefined {
    const map = this.workspaceState.get<Record<string, string>>(STORED_HEAD_KEY, {});
    return map[folderPath];
  }

  private async setStoredHead(folderPath: string, head: string): Promise<void> {
    const map = this.workspaceState.get<Record<string, string>>(STORED_HEAD_KEY, {});
    map[folderPath] = head;
    await this.workspaceState.update(STORED_HEAD_KEY, map);
  }

  start(): void {
    this.watchAllRoots();

    const d = vscode.workspace.onDidChangeWorkspaceFolders(e => {
      for (const removed of e.removed) {
        this.unwatchRoot(removed.uri.fsPath);
      }
      this.watchAllRoots();
    });
    this.disposables.push(d);
  }

  private watchAllRoots(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) { return; }

    for (const folder of folders) {
      this.watchRoot(folder.uri.fsPath);
    }
  }

  private watchRoot(folderPath: string): void {
    // Skip if already watching this root
    if (this.fsWatchers.has(folderPath)) { return; }

    const gitHead = resolveGitHeadPath(folderPath);
    if (!gitHead) { return; }

    // Capture initial content
    let initialHead: string;
    try {
      initialHead = fs.readFileSync(gitHead, 'utf8').trim();
    } catch {
      return;
    }
    this.headContents.set(folderPath, initialHead);

    // Nếu HEAD đã lưu khác với HEAD hiện tại nghĩa là user đã đổi branch
    // khi extension không chạy. Coi trạng thái sau khi đổi branch là baseline
    // mới và clear pending diffs cũ để không bị so sánh linh tinh.
    const storedHead = this.getStoredHead(folderPath);
    if (storedHead !== undefined && storedHead !== initialHead) {
      this.workspaceWatcher.notifyExternalBatch();
      void this.clearPendingDiffs();
    }
    void this.setStoredHead(folderPath, initialHead);

    // Lưu ý: trên Windows, `filename` thường null cho atomic-rename của git
    // (HEAD.lock → HEAD). Không lọc theo filename; mọi event đều trigger
    // re-read HEAD. Debounce + content compare bên dưới sẽ chặn no-op.
    const watcher = fs.watch(path.dirname(gitHead), () => {
      this.onHeadChange(folderPath, gitHead);
    });

    watcher.on('error', () => {
      // Ignore — folder may have been removed
    });

    this.fsWatchers.set(folderPath, watcher);

    // Reflog (xem comment đầu file): repo mới chưa commit lần nào sẽ chưa có
    // file này — bỏ qua, không coi là lỗi.
    const reflogPath = path.join(path.dirname(gitHead), 'logs', 'HEAD');
    if (fs.existsSync(reflogPath)) {
      const reflogWatcher = fs.watch(path.dirname(reflogPath), () => {
        this.onReflogChange(folderPath, reflogPath);
      });
      reflogWatcher.on('error', () => {
        // Ignore — folder may have been removed
      });
      this.reflogWatchers.set(folderPath, reflogWatcher);
    }
  }

  private unwatchRoot(folderPath: string): void {
    const watcher = this.fsWatchers.get(folderPath);
    if (watcher) {
      try { watcher.close(); } catch { /* ignore */ }
      this.fsWatchers.delete(folderPath);
    }

    const timer = this.debounceTimers.get(folderPath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(folderPath);
    }

    this.headContents.delete(folderPath);

    const reflogWatcher = this.reflogWatchers.get(folderPath);
    if (reflogWatcher) {
      try { reflogWatcher.close(); } catch { /* ignore */ }
      this.reflogWatchers.delete(folderPath);
    }

    const reflogTimer = this.reflogDebounceTimers.get(folderPath);
    if (reflogTimer) {
      clearTimeout(reflogTimer);
      this.reflogDebounceTimers.delete(folderPath);
    }
  }

  private onHeadChange(folderPath: string, gitHead: string): void {
    // Debounce to avoid firing multiple times during fast git operations
    const existing = this.debounceTimers.get(folderPath);
    if (existing) { clearTimeout(existing); }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(folderPath);

      let newContent: string;
      try {
        newContent = fs.readFileSync(gitHead, 'utf8').trim();
      } catch {
        return;
      }

      const oldContent = this.headContents.get(folderPath);
      if (oldContent !== undefined && oldContent !== newContent) {
        this.headContents.set(folderPath, newContent);
        void this.setStoredHead(folderPath, newContent);
        this.workspaceWatcher.notifyExternalBatch();
        this.clearPendingDiffs();
      }
    }, this.debounceMs);

    this.debounceTimers.set(folderPath, timer);
  }

  /**
   * Đọc dòng cuối của reflog, xác nhận pull/merge/rebase/reset cùng branch
   * (xem comment đầu file). Debounce riêng khỏi `onHeadChange` vì theo dõi
   * file khác (`logs/HEAD` thay vì `HEAD`).
   */
  private onReflogChange(folderPath: string, reflogPath: string): void {
    const existing = this.reflogDebounceTimers.get(folderPath);
    if (existing) { clearTimeout(existing); }

    const timer = setTimeout(() => {
      this.reflogDebounceTimers.delete(folderPath);

      let content: string;
      try {
        content = fs.readFileSync(reflogPath, 'utf8');
      } catch {
        return;
      }

      const lines = content.split('\n').filter(line => line.trim().length > 0);
      const lastLine = lines[lines.length - 1];
      if (!lastLine) { return; }

      const tabIndex = lastLine.indexOf('\t');
      const message = tabIndex >= 0 ? lastLine.slice(tabIndex + 1).trim() : '';
      if (!REFLOG_CONFIRM_ACTION.test(message)) { return; }

      // Chỉ xác nhận batch-op, KHÔNG clearPendingDiffs() — xem comment đầu file.
      this.workspaceWatcher.notifyExternalBatch();
    }, this.debounceMs);

    this.reflogDebounceTimers.set(folderPath, timer);
  }

  private async clearPendingDiffs(): Promise<void> {
    const count = this.diffManager.getPendingFiles().length;
    if (count === 0) { return; }

    await this.diffManager.clearAll();
    vscode.window.showInformationMessage(
      `Git branch changed — cleared ${count} pending diff${count > 1 ? 's' : ''}.`,
    );
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) { clearTimeout(timer); }
    this.debounceTimers.clear();

    for (const watcher of this.fsWatchers.values()) { watcher.close(); }
    this.fsWatchers.clear();

    for (const timer of this.reflogDebounceTimers.values()) { clearTimeout(timer); }
    this.reflogDebounceTimers.clear();

    for (const watcher of this.reflogWatchers.values()) { watcher.close(); }
    this.reflogWatchers.clear();

    for (const d of this.disposables) { d.dispose(); }
    this.disposables = [];
  }
}

/**
 * Trả về path tới HEAD file thực tế cho một workspace root.
 *
 * - Repo bình thường: `<folder>/.git` là directory → HEAD là `<folder>/.git/HEAD`.
 * - Worktree / submodule: `<folder>/.git` là file chứa `gitdir: <path>` →
 *   HEAD nằm tại `<gitdir>/HEAD`. `<gitdir>` có thể là tương đối so với folder.
 * - Không phải repo: return undefined.
 */
function resolveGitHeadPath(folderPath: string): string | undefined {
  const dotGit = path.join(folderPath, '.git');

  let stat: fs.Stats;
  try {
    stat = fs.statSync(dotGit);
  } catch {
    return undefined;
  }

  if (stat.isDirectory()) {
    const head = path.join(dotGit, 'HEAD');
    return fs.existsSync(head) ? head : undefined;
  }

  if (stat.isFile()) {
    let content: string;
    try {
      content = fs.readFileSync(dotGit, 'utf8');
    } catch {
      return undefined;
    }

    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match) { return undefined; }

    const gitdirRaw = match[1].trim();
    const gitdir = path.isAbsolute(gitdirRaw)
      ? gitdirRaw
      : path.resolve(folderPath, gitdirRaw);

    const head = path.join(gitdir, 'HEAD');
    return fs.existsSync(head) ? head : undefined;
  }

  return undefined;
}
