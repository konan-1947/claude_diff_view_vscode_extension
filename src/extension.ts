import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DiffManager } from './diff/diffManager';
import { ClaudeRunner } from './claude/claudeRunner';
import { HookWatcher } from './watcher/hookWatcher';
import { SessionTreeProvider } from './views/sessionTreeProvider';

export function activate(context: vscode.ExtensionContext): void {
  const diffManager = new DiffManager(context);
  const claudeRunner = new ClaudeRunner(diffManager);
  const hookWatcher = new HookWatcher(diffManager);
  const treeProvider = new SessionTreeProvider(diffManager);

  context.subscriptions.push({ dispose: () => diffManager.disposeAll() });
  context.subscriptions.push({ dispose: () => hookWatcher.dispose() });

  // Register sidebar tree view
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claude-diff-view.session', treeProvider)
  );

  // Start watching for signals from Claude CLI hooks immediately
  hookWatcher.start();

  // ---- Status bar: session state (always visible) ----
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.text = '$(robot) Claude: Idle';
  statusBar.tooltip = 'Claude Diff View — click to start session';
  statusBar.command = 'claude-diff-view.startSession';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // ---- Status bar: Accept button (only shown in diff tab) ----
  const acceptBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    99
  );
  acceptBar.text = '$(check) Accept file';
  acceptBar.tooltip = 'Accept Claude\'s changes to this file';
  acceptBar.command = 'claude-diff-view.acceptFile';
  acceptBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  context.subscriptions.push(acceptBar);

  // ---- Status bar: Reject button (only shown in diff tab) ----
  const rejectBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    98
  );
  rejectBar.text = '$(discard) Reject file';
  rejectBar.tooltip = 'Revert Claude\'s changes to this file';
  rejectBar.command = 'claude-diff-view.revertFile';
  context.subscriptions.push(rejectBar);

  function updateDiffButtons(): void {
    const filePath = resolveActiveDiffFilePath();
    if (filePath) {
      const basename = path.basename(filePath);
      acceptBar.text = `$(check) Accept: ${basename}`;
      rejectBar.text = `$(discard) Reject: ${basename}`;
      acceptBar.show();
      rejectBar.show();
    } else {
      acceptBar.hide();
      rejectBar.hide();
    }
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateDiffButtons();
    })
  );

  // Run once on activation in case a diff tab is already focused
  updateDiffButtons();

  function setStatus(
    state: 'idle' | 'running' | 'error',
    message?: string
  ): void {
    switch (state) {
      case 'running':
        statusBar.text = '$(sync~spin) Claude: Running\u2026';
        break;
      case 'error':
        statusBar.text = `$(error) Claude: Error${
          message ? ' \u2014 ' + message.slice(0, 30) : ''
        }`;
        treeProvider.setError(message ?? '');
        break;
      default:
        statusBar.text = '$(robot) Claude: Idle';
        treeProvider.setIdle();
    }
  }

  // ---- Helper: resolve the actual file path from the active diff tab ----
  function resolveActiveDiffFilePath(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    const uri = editor.document.uri;
    if (uri.scheme !== 'file') {
      return undefined;
    }
    const fsPath = uri.fsPath;

    if (diffManager.hasPendingDiff(fsPath)) {
      return fsPath;
    }

    const tmpDir = os.tmpdir();
    const basename = path.basename(fsPath);
    if (fsPath.startsWith(tmpDir) && basename.startsWith('claude-diff-')) {
      return diffManager.findByTempFile(fsPath);
    }

    return undefined;
  }

  // ---- Command: startSession ----
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.startSession',
      async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workingDir =
          workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

        const prompt = await vscode.window.showInputBox({
          title: 'Claude: Start Session',
          prompt: 'Enter your prompt for Claude',
          placeHolder: 'e.g. "Add JSDoc comments to all functions"',
          ignoreFocusOut: true,
        });

        if (!prompt) {
          return;
        }

        setStatus('running');
        treeProvider.setRunning(prompt);

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Claude \u2726',
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: 'Starting session\u2026' });

            const onProgress = (step: string): void => {
              progress.report({ message: step });
              // Extract filename from steps like "Write: foo.ts" or "Opening diff: foo.ts"
              const match = step.match(/:\s+(.+)$/);
              if (match?.[1]) {
                treeProvider.addPendingFile(match[1]);
              }
            };

            try {
              await claudeRunner.run(
                prompt,
                workingDir,
                (status, msg) => {
                  if (status === 'error') {
                    setStatus('error', msg);
                  } else if (status === 'idle') {
                    setStatus('idle');
                  }
                },
                onProgress
              );
              setStatus('idle');
              vscode.window.showInformationMessage(
                '$(check) Claude session complete.'
              );
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : String(err);
              setStatus('error', message);
              vscode.window.showErrorMessage(
                `Claude session failed: ${message}`
              );
            }
          }
        );
      }
    )
  );

  // ---- Command: acceptFile ----
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.acceptFile',
      async () => {
        const filePath = resolveActiveDiffFilePath();
        if (!filePath) {
          vscode.window.showWarningMessage(
            'No active Claude diff. Click on the right pane of a Claude diff tab first.'
          );
          return;
        }
        await diffManager.accept(filePath);
        await vscode.commands.executeCommand(
          'workbench.action.closeActiveEditor'
        );
      }
    )
  );

  // ---- Command: revertFile ----
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.revertFile',
      async () => {
        const filePath = resolveActiveDiffFilePath();
        if (!filePath) {
          vscode.window.showWarningMessage(
            'No active Claude diff. Click on the right pane of a Claude diff tab first.'
          );
          return;
        }
        await diffManager.revert(filePath);
        await vscode.commands.executeCommand(
          'workbench.action.closeActiveEditor'
        );
      }
    )
  );
  // ---- Command: installHooks ----
  // Writes PreToolUse / PostToolUse hooks into ~/.claude/settings.json
  // so the extension works with ANY `claude` CLI invocation.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claude-diff-view.installHooks',
      async () => {
        const extensionPath = context.extensionUri.fsPath;
        const preHook  = path.join(extensionPath, 'hooks', 'pre-tool-hook.js');
        const postHook = path.join(extensionPath, 'hooks', 'post-tool-hook.js');

        const claudeDir   = path.join(os.homedir(), '.claude');
        const settingsPath = path.join(claudeDir, 'settings.json');

        // Read existing settings (don't overwrite unrelated keys)
        let settings: Record<string, unknown> = {};
        try {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch {
          // File doesn't exist yet — start fresh
        }

        const matcher = 'Write|Edit|MultiEdit';
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

        if (!fs.existsSync(claudeDir)) {
          fs.mkdirSync(claudeDir, { recursive: true });
        }
        fs.writeFileSync(
          settingsPath,
          JSON.stringify(settings, null, 2),
          'utf8'
        );

        vscode.window.showInformationMessage(
          '$(check) Claude hooks installed! Diff view now works with `claude` CLI in any terminal.'
        );
      }
    )
  );
}

export function deactivate(): void {
  // Cleanup handled via context.subscriptions
}
