import * as vscode from 'vscode';
import { DiffManager } from './diff/diffManager';
import { DiffEditorProvider, DIFF_EDITOR_VIEW_TYPE } from './diff/diffWebviewPanel';
import { IAiRunner } from './runner/aiRunner';
import { HookWatcher } from './watcher/hookWatcher';
import { WorkspaceWatcher } from './watcher/workspaceWatcher';
import { GitBranchWatcher } from './watcher/gitBranchWatcher';
import { registerAllCommands } from './commands/commandsRegistry';
import { NavigationManager } from './diff/navigationManager';
import { NavBarPanel } from './views/navBarPanel';
import { TerminalPanelProvider } from './terminal/terminalPanel';

export function activate(context: vscode.ExtensionContext): void {
  const diffManager       = new DiffManager(context);
  const workspaceWatcher  = new WorkspaceWatcher(diffManager);
  const fsHookWatcher     = new HookWatcher(diffManager);
  const gitBranchWatcher  = new GitBranchWatcher(diffManager, context.workspaceState, workspaceWatcher);
  const navigationManager = new NavigationManager(diffManager);

  const diffEditorProvider = new DiffEditorProvider(context.extensionUri, diffManager);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      DIFF_EDITOR_VIEW_TYPE,
      diffEditorProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  const navBarPanel = new NavBarPanel(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(NavBarPanel.viewType, navBarPanel)
  );

  let activeRunner: IAiRunner | undefined;

  context.subscriptions.push(
    { dispose: () => diffManager.disposeAll() },
    { dispose: () => fsHookWatcher.dispose() },
    { dispose: () => workspaceWatcher.dispose() },
    { dispose: () => gitBranchWatcher.dispose() },
    { dispose: () => activeRunner?.cancel?.() }
  );

  const terminalPanel = new TerminalPanelProvider(context, diffManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TerminalPanelProvider.viewType,
      terminalPanel,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    { dispose: () => terminalPanel.dispose() }
  );

  const MOVED_RIGHT_KEY = 'ai-cli-diff-view.terminal.movedToRight';
  if (!context.globalState.get<boolean>(MOVED_RIGHT_KEY)) {
    void context.globalState.update(MOVED_RIGHT_KEY, true);
    setTimeout(() => {
      void (async () => {
        try {
          await vscode.commands.executeCommand('ai-cli-diff-view.terminal.focus');
          await vscode.commands.executeCommand('workbench.action.moveView', {
            viewId: TerminalPanelProvider.viewType,
            destinationId: 'workbench.view.auxiliarybar',
          });
        } catch {
          // Best-effort; if API changes, user can drag panel manually.
        }
      })();
    }, 1500);
  }

  fsHookWatcher.start();
  workspaceWatcher.start();
  gitBranchWatcher.start();

  registerAllCommands({
    diffManager,
    panel: terminalPanel,
    context,
    getRunner: () => activeRunner,
    setRunner: (r) => { activeRunner = r; },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-cli-diff-view.nextFile', () => navigationManager.nextFile()),
    vscode.commands.registerCommand('ai-cli-diff-view.prevFile', () => navigationManager.prevFile())
  );

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused && terminalPanel.wasTerminalFocused()) {
        terminalPanel.focusTerminal();
      }
    })
  );

  function updateNavBarState(): void {
    const pendingFiles = diffManager.getPendingFiles();
    if (pendingFiles.length === 0) {
      navBarPanel.setActiveFile(undefined);
      navBarPanel.update(undefined);
      void vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.hasPendingDiff', false);
      return;
    }

    const activePath = diffManager.getActiveFilePath();
    navBarPanel.setActiveFile(activePath);
    const navAnchor = activePath ?? pendingFiles[0];
    navBarPanel.update(navigationManager.getNavigationInfo(navAnchor));
    void vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.hasPendingDiff', true);
  }

  context.subscriptions.push(
    diffManager.onDidChangeDiffs(() => {
      updateNavBarState();
    })
  );
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(() => updateNavBarState())
  );
  updateNavBarState();
}

export function deactivate(): void {}
