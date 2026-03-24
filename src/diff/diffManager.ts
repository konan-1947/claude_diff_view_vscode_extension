import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export class DiffManager {
  // Maps absolute filePath -> original content before Claude edited it
  private snapshots = new Map<string, string>();
  // Maps absolute filePath -> temp file path in os.tmpdir()
  private tempFiles = new Map<string, string>();

  /**
   * Called BEFORE Claude modifies a file.
   * Reads the current content and stores it as the "before" snapshot.
   * If the file does not exist yet (new file creation), stores empty string.
   */
  async snapshotBefore(filePath: string): Promise<void> {
    const absPath = path.resolve(filePath);
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      this.snapshots.set(absPath, content);
    } catch {
      // File does not exist yet (Write to new file)
      this.snapshots.set(absPath, '');
    }
  }

  /**
   * Called AFTER Claude has modified the file.
   * Writes the snapshot to a temp file and opens the VSCode diff editor.
   */
  async openDiff(filePath: string): Promise<void> {
    const absPath = path.resolve(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (snapshot === undefined) {
      // No snapshot found — snapshotBefore was not called for this file.
      return;
    }

    const basename = path.basename(absPath);
    // Encode last 40 chars of sanitized absPath to avoid collisions
    // when two files share the same basename.
    const safePrefix = absPath.replace(/[^a-zA-Z0-9]/g, '_').slice(-40);
    const tempFileName = `claude-diff-${safePrefix}-${basename}`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    fs.writeFileSync(tempFilePath, snapshot, 'utf8');
    this.tempFiles.set(absPath, tempFilePath);

    // Left (originalUri) = temp file (before state)
    // Right (modifiedUri) = actual file on disk (after Claude edited it)
    const originalUri = vscode.Uri.file(tempFilePath);
    const modifiedUri = vscode.Uri.file(absPath);
    const title = `Claude \u2726 ${basename}`;

    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      modifiedUri,
      title
    );
  }

  /**
   * Reverts the file to its pre-Claude state and cleans up.
   */
  async revert(filePath: string): Promise<void> {
    const absPath = path.resolve(filePath);
    const snapshot = this.snapshots.get(absPath);
    if (snapshot === undefined) {
      vscode.window.showWarningMessage(
        `No snapshot found for ${path.basename(absPath)}`
      );
      return;
    }

    if (snapshot === '') {
      // File was newly created by Claude — revert means delete it
      try {
        fs.unlinkSync(absPath);
      } catch {
        // Already gone, that's fine
      }
    } else {
      fs.writeFileSync(absPath, snapshot, 'utf8');
    }

    this.cleanup(absPath);
    vscode.window.showInformationMessage(
      `Reverted: ${path.basename(absPath)}`
    );
  }

  /**
   * Accepts the Claude edit: cleans up temp files and snapshot state.
   * The file content (as modified by Claude) is kept as-is.
   */
  async accept(filePath: string): Promise<void> {
    const absPath = path.resolve(filePath);
    this.cleanup(absPath);
    vscode.window.showInformationMessage(
      `Accepted: ${path.basename(absPath)}`
    );
  }

  /**
   * Injects a snapshot directly (used by HookWatcher when hooks provide the snapshot).
   */
  loadSnapshot(filePath: string, content: string): void {
    this.snapshots.set(path.resolve(filePath), content);
  }

  /**
   * Returns whether there is a pending diff for the given file path.
   */
  hasPendingDiff(filePath: string): boolean {
    return this.snapshots.has(path.resolve(filePath));
  }

  /**
   * Given a temp file path, find the original (modified) file path.
   * Used when the user has focused the LEFT (snapshot) pane of the diff.
   */
  findByTempFile(tempFilePath: string): string | undefined {
    for (const [absPath, tmpPath] of this.tempFiles.entries()) {
      if (tmpPath === tempFilePath) {
        return absPath;
      }
    }
    return undefined;
  }

  /**
   * Clean up ALL pending diffs (called on extension deactivate or session end).
   */
  disposeAll(): void {
    for (const absPath of Array.from(this.snapshots.keys())) {
      this.cleanup(absPath);
    }
  }

  private cleanup(absPath: string): void {
    const tempFilePath = this.tempFiles.get(absPath);
    if (tempFilePath) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // Temp file already deleted, fine
      }
      this.tempFiles.delete(absPath);
    }
    this.snapshots.delete(absPath);
  }
}
