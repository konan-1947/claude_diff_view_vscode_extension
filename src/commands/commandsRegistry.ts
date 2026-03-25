/**
 * commandsRegistry.ts
 *
 * Đăng ký tất cả VS Code commands của extension vào context.subscriptions.
 * Tách ra khỏi extension.ts để giữ activate() gọn gàng.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DiffManager } from '../diff/diffManager';
import { StatusBarManager } from '../ui/statusBarManager';
import { SessionTreeProvider } from '../views/sessionTreeProvider';
import { IAiRunner } from '../claude/aiRunner';
import { createRunner } from '../claude/runnerFactory';

export interface CommandDeps {
  diffManager: DiffManager;
  statusBarManager: StatusBarManager;
  treeProvider: SessionTreeProvider;
  context: vscode.ExtensionContext;
  getRunner(): IAiRunner | undefined;
  setRunner(runner: IAiRunner): void;
}

export function registerAllCommands(deps: CommandDeps): void {
  const { diffManager, statusBarManager, treeProvider, context } = deps;

  // ---- Helper: lấy file path từ active editor nếu đang có pending diff ----
  function getActiveDiffFilePath(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return undefined; }
    const filePath = editor.document.uri.fsPath;
    return diffManager.renderer.hasPending(filePath) ? filePath : undefined;
  }

  // ---- Helper: ensure runner tồn tại (auto-detect nếu chưa có) ----
  async function ensureRunner(): Promise<IAiRunner | undefined> {
    if (deps.getRunner()) { return deps.getRunner(); }
    try {
      const result = await createRunner(diffManager);
      deps.setRunner(result.runner);
      statusBarManager.setStatus('idle', result.runner);
      return result.runner;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(message);
      return undefined;
    }
  }

  // ---- Helper: QuickPick chọn hunk khi không biết hunkId cụ thể ----
  async function pickHunk(filePath: string, action: string): Promise<string | undefined> {
    const hunks = diffManager.renderer.getHunks(filePath);
    if (hunks.length === 0) { return undefined; }
    if (hunks.length === 1) { return hunks[0]!.id; }

    const items = hunks.map((h, i) => ({
      label: `Hunk ${i + 1}`,
      description: `${h.removedLines.length} removed, ${h.addedLines.length} added`,
      id: h.id,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      title: `${action} which hunk?`,
      placeHolder: 'Chọn một hunk để thực hiện',
    });

    return picked?.id;
  }

  // ------------------------------------------------------------------ //
  // startSession
  // ------------------------------------------------------------------ //
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.startSession',
      async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workingDir = workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

        const runner = await ensureRunner();
        if (!runner) { return; }

        const toolLabel =
          runner.toolName.charAt(0).toUpperCase() + runner.toolName.slice(1);

        const prompt = await vscode.window.showInputBox({
          title: `${toolLabel}: Start Session`,
          prompt: `Nhập yêu cầu cho ${toolLabel}`,
          placeHolder: 'e.g. "Add JSDoc comments to all functions"',
          ignoreFocusOut: true,
        });

        if (!prompt) { return; }

        statusBarManager.setStatus('running', runner);
        treeProvider.setRunning(prompt);

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `${toolLabel} \u2726`,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: 'Starting session\u2026' });

            const onProgress = (step: string): void => {
              progress.report({ message: step });
              const match = step.match(/:\s+(.+)$/);
              if (match?.[1]) {
                treeProvider.addPendingFile(match[1]);
              }
            };

            try {
              await runner.run(
                prompt,
                workingDir,
                (status, msg) => {
                  if (status === 'error') { statusBarManager.setStatus('error', runner, msg); }
                  else if (status === 'idle') { statusBarManager.setStatus('idle', runner); }
                },
                onProgress
              );
              statusBarManager.setStatus('idle', runner);
              const editor = vscode.window.activeTextEditor;
              statusBarManager.updateButtons(
                editor?.document.uri.fsPath,
                editor ? diffManager.renderer.hasPending(editor.document.uri.fsPath) : false
              );
              vscode.window.showInformationMessage(`${toolLabel} session complete.`);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              statusBarManager.setStatus('error', runner, message);
              treeProvider.setError(message);
              vscode.window.showErrorMessage(`${toolLabel} session failed: ${message}`);
            }
          }
        );
      }
    )
  );

  // ------------------------------------------------------------------ //
  // acceptAllHunks
  // ------------------------------------------------------------------ //
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.acceptAllHunks',
      async () => {
        const filePath = getActiveDiffFilePath();
        if (!filePath) {
          vscode.window.showWarningMessage('Không có inline diff nào đang hoạt động.');
          return;
        }
        await diffManager.accept(filePath);
        statusBarManager.updateButtons(filePath, false);
        vscode.window.showInformationMessage(
          `Accepted all changes: ${path.basename(filePath)}`
        );
      }
    )
  );

  // ------------------------------------------------------------------ //
  // revertAllHunks
  // ------------------------------------------------------------------ //
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.revertAllHunks',
      async () => {
        const filePath = getActiveDiffFilePath();
        if (!filePath) {
          vscode.window.showWarningMessage('Không có inline diff nào đang hoạt động.');
          return;
        }
        await diffManager.revert(filePath);
        statusBarManager.updateButtons(filePath, false);
        vscode.window.showInformationMessage(
          `Reverted all changes: ${path.basename(filePath)}`
        );
      }
    )
  );

  // ------------------------------------------------------------------ //
  // acceptHunk
  // ------------------------------------------------------------------ //
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.acceptHunk',
      async (filePath?: string, hunkId?: string) => {
        const targetPath = filePath ?? getActiveDiffFilePath();
        if (!targetPath) {
          vscode.window.showWarningMessage(
            'Không có inline diff nào. Đặt con trỏ trong file đang có diff.'
          );
          return;
        }

        const resolvedHunkId = hunkId ?? (await pickHunk(targetPath, 'Accept'));
        if (!resolvedHunkId) { return; }

        await diffManager.acceptHunk(targetPath, resolvedHunkId);
        const editor = vscode.window.activeTextEditor;
        statusBarManager.updateButtons(
          editor?.document.uri.fsPath,
          editor ? diffManager.renderer.hasPending(editor.document.uri.fsPath) : false
        );
      }
    )
  );

  // ------------------------------------------------------------------ //
  // revertHunk
  // ------------------------------------------------------------------ //
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.revertHunk',
      async (filePath?: string, hunkId?: string) => {
        const targetPath = filePath ?? getActiveDiffFilePath();
        if (!targetPath) {
          vscode.window.showWarningMessage(
            'Không có inline diff nào. Đặt con trỏ trong file đang có diff.'
          );
          return;
        }

        const resolvedHunkId = hunkId ?? (await pickHunk(targetPath, 'Revert'));
        if (!resolvedHunkId) { return; }

        await diffManager.revertHunk(targetPath, resolvedHunkId);
        const editor = vscode.window.activeTextEditor;
        statusBarManager.updateButtons(
          editor?.document.uri.fsPath,
          editor ? diffManager.renderer.hasPending(editor.document.uri.fsPath) : false
        );
      }
    )
  );

  // ------------------------------------------------------------------ //
  // installHooks
  // ------------------------------------------------------------------ //
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.installHooks',
      async () => {
        const extensionPath = context.extensionUri.fsPath;
        const preHook  = path.join(extensionPath, 'hooks', 'pre-tool-hook.js');
        const postHook = path.join(extensionPath, 'hooks', 'post-tool-hook.js');

        const runner = await ensureRunner();
        if (!runner) { return; }

        const settingsPath = runner.getSettingsFilePath();
        const settingsDir  = path.dirname(settingsPath);
        const toolNames    = runner.getFileEditToolNames();
        const matcher      = toolNames.join('|');
        const toolLabel    =
          runner.toolName.charAt(0).toUpperCase() + runner.toolName.slice(1);

        let settings: Record<string, unknown> = {};
        try {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch {
          // File chưa tồn tại — bắt đầu mới
        }

        settings['hooks'] = {
          PreToolUse: [
            {
              matcher,
              hooks: [{ type: 'command', command: `node "${preHook}"` }],
            },
          ],
          PostToolUse: [
            {
              matcher,
              hooks: [{ type: 'command', command: `node "${postHook}"` }],
            },
          ],
        };

        if (!fs.existsSync(settingsDir)) {
          fs.mkdirSync(settingsDir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

        vscode.window.showInformationMessage(
          `${toolLabel} hooks installed! Inline diff now works with \`${runner.toolName}\` CLI in any terminal.`
        );
      }
    )
  );
}
