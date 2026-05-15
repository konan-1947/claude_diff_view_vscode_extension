/**
 * gitBranchWatcher.ts
 *
 * Watches `.git/HEAD` của mỗi workspace root (resolve qua `gitdir:` nếu là
 * worktree/submodule). Khi HEAD ref đổi (branch switch, hoặc checkout sang
 * ref khác / commit detached), clear toàn bộ pending diffs để snapshot cũ
 * không bị so sánh với working tree của branch khác.
 *
 * KHÔNG detect pull/rebase/reset trên cùng branch — những thao tác đó đổi
 * `refs/heads/<branch>` chứ không đổi HEAD. Giữ scope hẹp vì watch branch
 * ref cũng sẽ kích hoạt khi user `git commit`, làm mất pending state ngoài
 * ý muốn.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DiffManager } from '../diff/diffManager';

export class GitBranchWatcher {
  private disposables: vscode.Disposable[] = [];
  private fsWatchers: Map<string, fs.FSWatcher> = new Map();
  private headContents: Map<string, string> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly diffManager: DiffManager,
    private readonly debounceMs: number = 1000,
  ) {}

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
    try {
      this.headContents.set(folderPath, fs.readFileSync(gitHead, 'utf8').trim());
    } catch {
      return;
    }

    const watcher = fs.watch(path.dirname(gitHead), (_event, filename) => {
      if (filename && filename.toLowerCase() === 'head') {
        this.onHeadChange(folderPath, gitHead);
      }
    });

    watcher.on('error', () => {
      // Ignore — folder may have been removed
    });

    this.fsWatchers.set(folderPath, watcher);
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
        this.clearPendingDiffs();
      }
    }, this.debounceMs);

    this.debounceTimers.set(folderPath, timer);
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
