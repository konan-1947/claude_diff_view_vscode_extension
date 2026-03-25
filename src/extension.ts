import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DiffManager } from './diff/diffManager';
import { IAiRunner } from './claude/aiRunner';
import { createRunner } from './claude/runnerFactory';
import { HookWatcher } from './watcher/hookWatcher';
import { WorkspaceWatcher } from './watcher/workspaceWatcher';
import { SessionTreeProvider } from './views/sessionTreeProvider';
import { HunkCodeLensProvider } from './diff/hunkCodeLensProvider';

export function activate(context: vscode.ExtensionContext): void {
  const diffManager = new DiffManager(context);
  // Runner được khởi tạo lazy khi người dùng bấm Start Session (cần async)
  let activeRunner: IAiRunner | undefined;
  const hookWatcher = new HookWatcher(diffManager);
  const workspaceWatcher = new WorkspaceWatcher(diffManager);
  const treeProvider = new SessionTreeProvider(diffManager);

  context.subscriptions.push({ dispose: () => diffManager.disposeAll() });
  context.subscriptions.push({ dispose: () => hookWatcher.dispose() });
  context.subscriptions.push({ dispose: () => workspaceWatcher.dispose() });

  // Register sidebar tree view
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claude-diff-view.session', treeProvider)
  );

  // Register CodeLens provider cho nút Accept/Revert Hunk
  const codeLensProvider = new HunkCodeLensProvider(diffManager);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider)
  );
  context.subscriptions.push(
    diffManager.onDidChangeDiffs(() => codeLensProvider.refresh())
  );

  // Bắt đầu theo dõi hook signals từ Claude CLI
  hookWatcher.start();
  // Bắt đầu theo dõi file thay đổi trong workspace (bắt external writes từ terminal)
  workspaceWatcher.start();

  // ---- Status bar: trạng thái session ----
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.text = '$(robot) Claude: Idle';
  statusBar.tooltip = 'Claude Diff View — click để bắt đầu session';
  statusBar.command = 'claude-diff-view.startSession';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // ---- Status bar: Accept All (hiện khi file đang có pending diff) ----
  const acceptAllBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    99
  );
  acceptAllBar.text = '$(check-all) Accept All';
  acceptAllBar.tooltip = 'Chấp nhận tất cả thay đổi của Claude trong file này';
  acceptAllBar.command = 'claude-diff-view.acceptAllHunks';
  acceptAllBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  context.subscriptions.push(acceptAllBar);

  // ---- Status bar: Revert All (hiện khi file đang có pending diff) ----
  const revertAllBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    98
  );
  revertAllBar.text = '$(discard) Revert All';
  revertAllBar.tooltip = 'Hoàn tác tất cả thay đổi của Claude trong file này';
  revertAllBar.command = 'claude-diff-view.revertAllHunks';
  context.subscriptions.push(revertAllBar);

  /** Cập nhật hiển thị nút Accept/Revert All trên status bar */
  function updateStatusButtons(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor && diffManager.renderer.hasPending(editor.document.uri.fsPath)) {
      const basename = path.basename(editor.document.uri.fsPath);
      acceptAllBar.text = `$(check-all) Accept All: ${basename}`;
      revertAllBar.text  = `$(discard) Revert All: ${basename}`;
      acceptAllBar.show();
      revertAllBar.show();
    } else {
      acceptAllBar.hide();
      revertAllBar.hide();
    }
  }

  // Khi chuyển tab editor — cập nhật status bar và tái áp dụng decoration
  let isOpeningDiff = false;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      updateStatusButtons();
      if (!editor) { return; }
      
      const document = editor.document;
      // Bỏ qua các editor ảo
      if (document.uri.scheme !== 'file') { return; }

      const filePath = document.uri.fsPath;
      if (diffManager.renderer.hasPending(filePath)) {
        // Tự động bẻ lái mở màn hình Diff nếu người dùng bấm vào File Explorer tab thường
        if (!diffManager.renderer.isEditorInDiffView(editor) && !isOpeningDiff) {
          isOpeningDiff = true;
          try {
            await diffManager.openDiff(filePath);
          } finally {
            // Khóa chốt khoảng nửa giây để tránh loop liên tọi khi click lung tung
            setTimeout(() => isOpeningDiff = false, 500);
          }
          return;
        }

        diffManager.renderer.applyDecorations(filePath);
      }
    })
  );

  // Khi document thay đổi — tái áp dụng decoration (vd sau khi undo/redo)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const filePath = e.document.uri.fsPath;
      if (diffManager.renderer.hasPending(filePath)) {
        diffManager.renderer.applyDecorations(filePath);
      }
    })
  );

  updateStatusButtons();

  function setStatus(
    state: 'idle' | 'running' | 'error',
    message?: string
  ): void {
    const toolLabel = activeRunner ? activeRunner.toolName.charAt(0).toUpperCase() + activeRunner.toolName.slice(1) : 'AI';
    switch (state) {
      case 'running':
        statusBar.text = `$(sync~spin) ${toolLabel}: Running\u2026`;
        break;
      case 'error':
        statusBar.text = `$(error) ${toolLabel}: Error${
          message ? ' \u2014 ' + message.slice(0, 30) : ''
        }`;
        treeProvider.setError(message ?? '');
        break;
      default:
        statusBar.text = `$(robot) ${toolLabel}: Idle`;
        treeProvider.setIdle();
    }
  }

  // ---- Helper: lấy file path từ active editor (nếu đang có pending diff) ----
  function getActiveDiffFilePath(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return undefined; }
    const filePath = editor.document.uri.fsPath;
    return diffManager.renderer.hasPending(filePath) ? filePath : undefined;
  }

  // ---- Command: startSession ----
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.startSession',
      async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workingDir = workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

        // Auto-detect / chọn tool khi chưa có runner
        if (!activeRunner) {
          try {
            const result = await createRunner(diffManager);
            activeRunner = result.runner;
            // Cập nhật status bar sau khi biết tool
            setStatus('idle');
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(message);
            return;
          }
        }

        const toolLabel = activeRunner.toolName.charAt(0).toUpperCase() + activeRunner.toolName.slice(1);

        const prompt = await vscode.window.showInputBox({
          title: `${toolLabel}: Start Session`,
          prompt: `Nhập yêu cầu cho ${toolLabel}`,
          placeHolder: 'e.g. "Add JSDoc comments to all functions"',
          ignoreFocusOut: true,
        });

        if (!prompt) { return; }

        setStatus('running');
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
              await activeRunner!.run(
                prompt,
                workingDir,
                (status, msg) => {
                  if (status === 'error') { setStatus('error', msg); }
                  else if (status === 'idle') { setStatus('idle'); }
                },
                onProgress
              );
              setStatus('idle');
              updateStatusButtons();
              vscode.window.showInformationMessage(`$(check) ${toolLabel} session complete.`);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              setStatus('error', message);
              vscode.window.showErrorMessage(`${toolLabel} session failed: ${message}`);
            }
          }
        );
      }
    )
  );

  // ---- Command: acceptAllHunks ----
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
        updateStatusButtons();
        vscode.window.showInformationMessage(`$(check) Accepted all changes: ${path.basename(filePath)}`);
      }
    )
  );

  // ---- Command: revertAllHunks ----
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
        updateStatusButtons();
        vscode.window.showInformationMessage(`$(discard) Reverted all changes: ${path.basename(filePath)}`);
      }
    )
  );

  // ---- Command: acceptHunk (theo hunk ID cụ thể) ----
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.acceptHunk',
      async (filePath?: string, hunkId?: string) => {
        // Nếu không có args, thử lấy từ active editor và hỏi người dùng chọn hunk
        const targetPath = filePath ?? getActiveDiffFilePath();
        if (!targetPath) {
          vscode.window.showWarningMessage('Không có inline diff nào. Đặt con trỏ trong file đang có diff.');
          return;
        }

        const resolvedHunkId = hunkId ?? (await pickHunk(targetPath, 'Accept'));
        if (!resolvedHunkId) { return; }

        await diffManager.acceptHunk(targetPath, resolvedHunkId);
        updateStatusButtons();
      }
    )
  );

  // ---- Command: revertHunk (theo hunk ID cụ thể) ----
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.revertHunk',
      async (filePath?: string, hunkId?: string) => {
        const targetPath = filePath ?? getActiveDiffFilePath();
        if (!targetPath) {
          vscode.window.showWarningMessage('Không có inline diff nào. Đặt con trỏ trong file đang có diff.');
          return;
        }

        const resolvedHunkId = hunkId ?? (await pickHunk(targetPath, 'Revert'));
        if (!resolvedHunkId) { return; }

        await diffManager.revertHunk(targetPath, resolvedHunkId);
        updateStatusButtons();
      }
    )
  );

  // ---- Command: installHooks ----
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.installHooks',
      async () => {
        const extensionPath = context.extensionUri.fsPath;
        const preHook  = path.join(extensionPath, 'hooks', 'pre-tool-hook.js');
        const postHook = path.join(extensionPath, 'hooks', 'post-tool-hook.js');

        // Nếu chưa có activeRunner, detect tool trước
        if (!activeRunner) {
          try {
            const result = await createRunner(diffManager);
            activeRunner = result.runner;
            setStatus('idle');
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(message);
            return;
          }
        }

        const settingsPath = activeRunner.getSettingsFilePath();
        const settingsDir  = path.dirname(settingsPath);
        const toolNames    = activeRunner.getFileEditToolNames();
        const matcher      = toolNames.join('|');
        const toolLabel    = activeRunner.toolName.charAt(0).toUpperCase() + activeRunner.toolName.slice(1);

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
          `$(check) ${toolLabel} hooks installed! Inline diff now works with \`${activeRunner.toolName}\` CLI in any terminal.`
        );
      }
    )
  );

  // ---- Helper: QuickPick để chọn hunk khi không có hunkId ----
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
}

export function deactivate(): void {
  // Cleanup được xử lý qua context.subscriptions
}
