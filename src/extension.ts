import * as vscode from 'vscode';
import { DiffManager } from './diff/diffManager';
import { IAiRunner } from './claude/aiRunner';
import { HookWatcher } from './watcher/hookWatcher';
import { WorkspaceWatcher } from './watcher/workspaceWatcher';
import { SessionTreeProvider } from './views/sessionTreeProvider';
import { HunkCodeLensProvider } from './diff/hunkCodeLensProvider';
import { registerAllCommands } from './commands/commandsRegistry';
import { NavigationManager } from './diff/navigationManager';
import { NavBarPanel } from './views/navBarPanel';

export function activate(context: vscode.ExtensionContext): void {
  const diffManager       = new DiffManager(context);
  const treeProvider      = new SessionTreeProvider(diffManager);
  const workspaceWatcher  = new WorkspaceWatcher(diffManager);
  const fsHookWatcher     = new HookWatcher(diffManager);
  const navigationManager = new NavigationManager(diffManager);

  diffManager.renderer.setNavigationManager(navigationManager);

  const navBarPanel = new NavBarPanel();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(NavBarPanel.viewType, navBarPanel)
  );
  diffManager.renderer.setNavUpdateCallback(navInfo => {
    navBarPanel.update(navInfo);
    updateNavBarActiveFile();
  });

  let activeRunner: IAiRunner | undefined;

  context.subscriptions.push(
    { dispose: () => diffManager.disposeAll() },
    { dispose: () => fsHookWatcher.dispose() },
    { dispose: () => workspaceWatcher.dispose() }
  );

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claude-diff-view.session', treeProvider)
  );

  const codeLensProvider = new HunkCodeLensProvider(diffManager);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
    diffManager.onDidChangeDiffs(() => codeLensProvider.refresh())
  );

  fsHookWatcher.start();
  workspaceWatcher.start();

  registerAllCommands({
    diffManager,
    treeProvider,
    context,
    getRunner: () => activeRunner,
    setRunner: (r) => { activeRunner = r; },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-diff-view.nextFile', () => navigationManager.nextFile()),
    vscode.commands.registerCommand('claude-diff-view.prevFile', () => navigationManager.prevFile())
  );

  function updateNavBarActiveFile(): void {
    const editor = vscode.window.activeTextEditor;
    const filePath = editor?.document.uri.fsPath;
    navBarPanel.setActiveFile(filePath && diffManager.renderer.hasPending(filePath) ? filePath : undefined);
  }

  let isOpeningDiff = false;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      updateNavBarActiveFile();
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
    vscode.workspace.onDidChangeTextDocument((e) => {
      const filePath = e.document.uri.fsPath;
      if (diffManager.renderer.hasPending(filePath)) {
        diffManager.renderer.applyDecorations(filePath);
      }
    })
  );
}

export function deactivate(): void {}
