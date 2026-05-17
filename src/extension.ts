import * as vscode from 'vscode';
import { DiffManager } from './diff/diffManager';
import { IAiRunner } from './runner/aiRunner';
import { HookWatcher } from './watcher/hookWatcher';
import { WorkspaceWatcher } from './watcher/workspaceWatcher';
import { GitBranchWatcher } from './watcher/gitBranchWatcher';
import { SessionPanelProvider } from './views/sessionPanel';
import { HunkCodeLensProvider } from './diff/hunkCodeLensProvider';
import { registerAllCommands } from './commands/commandsRegistry';
import { NavigationManager } from './diff/navigationManager';
import { NavBarPanel } from './views/navBarPanel';
import { TerminalPanelProvider } from './terminal/terminalPanel';

export function activate(context: vscode.ExtensionContext): void {
  // CodeLens buttons (Accept/Revert hunk) are suppressed in diff editors by default.
  // Enable at workspace scope so they appear in the right (modified) pane.
  const editorConfig = vscode.workspace.getConfiguration();
  if (editorConfig.get<boolean>('diffEditor.codeLens') !== true) {
    void editorConfig.update('diffEditor.codeLens', true, vscode.ConfigurationTarget.Global);
  }

  const diffManager       = new DiffManager(context);
  const sessionPanel      = new SessionPanelProvider(diffManager, context);
  const workspaceWatcher  = new WorkspaceWatcher(diffManager);
  const fsHookWatcher     = new HookWatcher(diffManager);
  const gitBranchWatcher  = new GitBranchWatcher(diffManager);
  const navigationManager = new NavigationManager(diffManager);

  diffManager.renderer.setNavigationManager(navigationManager);

  const navBarPanel = new NavBarPanel(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(NavBarPanel.viewType, navBarPanel)
  );
  diffManager.renderer.setNavUpdateCallback(() => {
    updateNavBarState();
  });

  let activeRunner: IAiRunner | undefined;

  context.subscriptions.push(
    { dispose: () => diffManager.disposeAll() },
    { dispose: () => fsHookWatcher.dispose() },
    { dispose: () => workspaceWatcher.dispose() },
    { dispose: () => gitBranchWatcher.dispose() },
    { dispose: () => sessionPanel.dispose() },
    { dispose: () => activeRunner?.cancel?.() }
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SessionPanelProvider.viewType, sessionPanel)
  );

  const terminalPanel = new TerminalPanelProvider(context);
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

  const codeLensProvider = new HunkCodeLensProvider(diffManager);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
    diffManager.onDidChangeDiffs(() => codeLensProvider.refresh())
  );

  fsHookWatcher.start();
  workspaceWatcher.start();
  gitBranchWatcher.start();

  registerAllCommands({
    diffManager,
    sessionPanel,
    context,
    getRunner: () => activeRunner,
    setRunner: (r) => { activeRunner = r; },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-cli-diff-view.nextFile', () => navigationManager.nextFile()),
    vscode.commands.registerCommand('ai-cli-diff-view.prevFile', () => navigationManager.prevFile())
  );

  function updateNavBarState(): void {
    const editor = vscode.window.activeTextEditor;
    const filePath = editor?.document.uri.fsPath;
    const pendingFiles = diffManager.getPendingFiles();

    if (pendingFiles.length === 0) {
      navBarPanel.setActiveFile(undefined);
      navBarPanel.update(undefined);
      return;
    }

    if (filePath && diffManager.renderer.hasPending(filePath)) {
      navBarPanel.setActiveFile(filePath);
    } else {
      navBarPanel.setActiveFile(undefined);
    }

    const navAnchor = filePath ?? pendingFiles[0];
    navBarPanel.update(navigationManager.getNavigationInfo(navAnchor));
  }

  let isOpeningDiff = false;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      updateNavBarState();
      if (!editor || editor.document.uri.scheme !== 'file') { return; }
      const filePath = editor.document.uri.fsPath;
      if (diffManager.renderer.hasPending(filePath)) {
        if (!diffManager.renderer.isEditorInDiffView(editor) && !isOpeningDiff) {
          isOpeningDiff = true;
          try {
            await diffManager.openDiff(filePath);
          } finally {
            setTimeout(() => { isOpeningDiff = false; }, 500);
          }
          return;
        }
        diffManager.renderer.applyDecorations(filePath);
      }
    })
  );

  context.subscriptions.push(
    diffManager.onDidChangeDiffs(() => {
      updateNavBarState();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const filePath = e.document.uri.fsPath;
      if (diffManager.renderer.hasPending(filePath)) {
        diffManager.renderer.applyDecorations(filePath);
      }
    })
  );
}

export function deactivate(): void {}
