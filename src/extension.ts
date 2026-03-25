import * as vscode from 'vscode';
import * as path from 'path';
import { DiffManager } from './diff/diffManager';
import { IAiRunner } from './claude/aiRunner';
import { HookWatcher } from './watcher/hookWatcher';
import { WorkspaceWatcher } from './watcher/workspaceWatcher';
import { SessionTreeProvider } from './views/sessionTreeProvider';
import { HunkCodeLensProvider } from './diff/hunkCodeLensProvider';
import { StatusBarManager } from './ui/statusBarManager';
import { registerAllCommands } from './commands/commandsRegistry';
import { NavigationManager } from './diff/navigationManager';

export function activate(context: vscode.ExtensionContext): void {
  // ---- Khởi tạo các thành phần chính ----
  const diffManager      = new DiffManager(context);
  const statusBarManager = new StatusBarManager(context);
  const treeProvider     = new SessionTreeProvider(diffManager);
  const workspaceWatcher = new WorkspaceWatcher(diffManager);
  const fsHookWatcher    = new HookWatcher(diffManager);
  const navigationManager = new NavigationManager(diffManager);

  // Kết nối Navigation tới Renderer để có thể hiện UI
  diffManager.renderer.setNavigationManager(navigationManager);

  // Runner được khởi tạo lazy khi người dùng bấm Start Session
  let activeRunner: IAiRunner | undefined;

  // ---- Cleanup khi deactivate ----
  context.subscriptions.push(
    { dispose: () => diffManager.disposeAll() },
    { dispose: () => fsHookWatcher.dispose() },
    { dispose: () => workspaceWatcher.dispose() }
  );

  // ---- Sidebar tree view ----
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('claude-diff-view.session', treeProvider)
  );

  // ---- CodeLens provider (nút Accept/Revert Hunk) ----
  const codeLensProvider = new HunkCodeLensProvider(diffManager);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
    diffManager.onDidChangeDiffs(() => codeLensProvider.refresh())
  );

  // ---- Bắt đầu theo dõi ----
  fsHookWatcher.start();
  workspaceWatcher.start();

  // ---- Đăng ký tất cả commands ----
  registerAllCommands({
    diffManager,
    statusBarManager,
    treeProvider,
    context,
    getRunner: () => activeRunner,
    setRunner: (r) => {
      activeRunner = r;
      statusBarManager.setStatus('idle', activeRunner);
    },
  });

  // ---- Đăng ký thêm Navigation Commands ----
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-diff-view.nextFile', () => navigationManager.nextFile()),
    vscode.commands.registerCommand('claude-diff-view.prevFile', () => navigationManager.prevFile())
  );

  // ---- Event: chuyển tab editor ----
  let isOpeningDiff = false;
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      const filePath = editor?.document.uri.fsPath;
      statusBarManager.updateButtons(
        filePath,
        filePath ? diffManager.renderer.hasPending(filePath) : false
      );

      if (!editor || editor.document.uri.scheme !== 'file') { return; }

      if (diffManager.renderer.hasPending(filePath!)) {
        if (!diffManager.renderer.isEditorInDiffView(editor) && !isOpeningDiff) {
          isOpeningDiff = true;
          try {
            await diffManager.openDiff(filePath!);
          } finally {
            setTimeout(() => { isOpeningDiff = false; }, 500);
          }
          return;
        }
        diffManager.renderer.applyDecorations(filePath!);
      }
    })
  );

  // ---- Event: document thay đổi (undo/redo) ----
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const filePath = e.document.uri.fsPath;
      if (diffManager.renderer.hasPending(filePath)) {
        diffManager.renderer.applyDecorations(filePath);
      }
    })
  );

  // Khởi tạo trạng thái ban đầu cho status bar
  const activeEditor = vscode.window.activeTextEditor;
  statusBarManager.updateButtons(
    activeEditor?.document.uri.fsPath,
    activeEditor ? diffManager.renderer.hasPending(activeEditor.document.uri.fsPath) : false
  );
}

export function deactivate(): void {
  // Cleanup được xử lý qua context.subscriptions
}
