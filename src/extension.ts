import * as vscode from 'vscode';
import { DiffManager } from './diff/diffManager';
import { DiffEditorProvider, DIFF_EDITOR_VIEW_TYPE } from './diff/diffWebviewPanel';
import { IAiRunner } from './runner/aiRunner';
import { WorkspaceWatcher } from './watcher/workspaceWatcher';
import { refreshTextFileRules } from './watcher/fileTypeRules';
import { refreshFileSizeLimit } from './watcher/fileSizeLimit';
import { GitBranchWatcher } from './watcher/gitBranchWatcher';
import { registerAllCommands } from './commands/commandsRegistry';
import { NavigationManager } from './diff/navigationManager';
import { NavBarPanel } from './views/navBarPanel';
import { TerminalPanelProvider } from './terminal/terminalPanel';

const LOG_PREFIX = '[ai-cli-diff-view]';
let diagnosticChannel: vscode.OutputChannel | undefined;
let restoreAgentModeTabsOnDeactivate: (() => Promise<void>) | undefined;

function debugLog(message: string): void {
  const line = `${LOG_PREFIX} ${new Date().toISOString()} ${message}`;
  console.log(line);
  diagnosticChannel?.appendLine(line);
}

function debugError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error ?? '');
  const line = `${LOG_PREFIX} ${new Date().toISOString()} ${message} ${detail}`;
  console.error(line, error ?? '');
  diagnosticChannel?.appendLine(line);
}

export function activate(context: vscode.ExtensionContext): void {
  diagnosticChannel = vscode.window.createOutputChannel('AI CLI Diff View');
  context.subscriptions.push(diagnosticChannel);

  try {
    activateExtension(context);
  } catch (error: unknown) {
    debugError('activate:failed', error);
    void vscode.window.showErrorMessage(
      `AI CLI Diff View failed to activate: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

function activateExtension(context: vscode.ExtensionContext): void {
  debugLog(`activate:start mode=${context.extensionMode} workspace=${vscode.workspace.workspaceFile?.fsPath ?? 'none'}`);

  refreshTextFileRules();
  refreshFileSizeLimit();
  debugLog('activate:configuration initialized');

  const diffManager       = new DiffManager(context);
  const workspaceWatcher  = new WorkspaceWatcher(diffManager);
  const gitBranchWatcher  = new GitBranchWatcher(diffManager, context.workspaceState, workspaceWatcher);
  const navigationManager = new NavigationManager(diffManager);
  debugLog('activate:core services constructed');

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
  debugLog('activate:custom editor provider registered');

  const navBarPanel = new NavBarPanel(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(NavBarPanel.viewType, navBarPanel)
  );
  debugLog('activate:navigation webview provider registered');

  let activeRunner: IAiRunner | undefined;
  let webviewPanelTest: vscode.WebviewPanel | undefined;
  type ShowTabsSetting = 'multiple' | 'single' | 'none';
  let agentModeActive = false;
  let agentModeTabsState: {
    target: vscode.ConfigurationTarget;
    value: ShowTabsSetting | undefined;
  } | undefined;

  context.subscriptions.push(
    { dispose: () => diffManager.disposeAll() },
    { dispose: () => workspaceWatcher.dispose() },
    { dispose: () => gitBranchWatcher.dispose() },
    { dispose: () => activeRunner?.cancel?.() }
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ai-cli-diff-view.supportedFileDetectionMode') ||
          e.affectsConfiguration('ai-cli-diff-view.supportedFileExtensions') ||
          e.affectsConfiguration('ai-cli-diff-view.supportedFilenames') ||
          e.affectsConfiguration('ai-cli-diff-view.supportedFilenamePatterns')) {
        refreshTextFileRules();
      }
      if (e.affectsConfiguration('ai-cli-diff-view.maxFileLines')) {
        refreshFileSizeLimit();
      }
    })
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
  debugLog('activate:terminal webview provider registered');

  const captureEditorTabsState = (): {
    target: vscode.ConfigurationTarget;
    value: ShowTabsSetting | undefined;
  } => {
    const config = vscode.workspace.getConfiguration('workbench.editor');
    const inspection = config.inspect<ShowTabsSetting>('showTabs');
    const hasWorkspace = Boolean(
      vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length
    );

    return {
      // A workspace override is temporary when a workspace is open. Removing
      // it on exit restores the user's global or folder-specific setting.
      target: hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global,
      value: hasWorkspace ? inspection?.workspaceValue : inspection?.globalValue,
    };
  };

  const hideEditorTabs = async (): Promise<void> => {
    if (agentModeTabsState) {
      return;
    }
    agentModeTabsState = captureEditorTabsState();
    await vscode.workspace.getConfiguration('workbench.editor').update(
      'showTabs',
      'none',
      agentModeTabsState.target
    );
    debugLog('agent-mode:editor tabs hidden');
  };

  const restoreEditorTabs = async (): Promise<void> => {
    if (!agentModeTabsState) {
      return;
    }
    const previous = agentModeTabsState;
    await vscode.workspace.getConfiguration('workbench.editor').update(
      'showTabs',
      previous.value,
      previous.target
    );
    agentModeTabsState = undefined;
    debugLog('agent-mode:editor tabs restored');
  };
  restoreAgentModeTabsOnDeactivate = restoreEditorTabs;

  const openWebviewPanelTest = (): void => {
    debugLog('webview-panel-test:command invoked');
    if (webviewPanelTest) {
      debugLog('webview-panel-test:revealing existing panel');
      webviewPanelTest.reveal(vscode.ViewColumn.Active);
      return;
    }

    webviewPanelTest = vscode.window.createWebviewPanel(
      'ai-cli-diff-view.webviewPanelTest',
      'WebviewPanel test',
      vscode.ViewColumn.Active,
      { enableScripts: false }
    );
    debugLog('webview-panel-test:panel created');

    webviewPanelTest.webview.html = `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WebviewPanel test</title>
        <style>
          html, body {
            height: 100%;
            margin: 0;
          }
          body {
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--vscode-editor-foreground);
            background: var(--vscode-editor-background);
            font-family: var(--vscode-font-family);
            font-size: 24px;
          }
        </style>
      </head>
      <body>WebviewPanel test</body>
      </html>`;

    webviewPanelTest.onDidDispose(() => {
      debugLog('webview-panel-test:panel disposed');
      webviewPanelTest = undefined;
      if (agentModeActive) {
        void exitAgentMode();
      }
    }, null, context.subscriptions);
  };

  async function enterAgentMode(): Promise<void> {
    if (agentModeActive) {
      return;
    }
    try {
      openWebviewPanelTest();
      await hideEditorTabs();
      agentModeActive = true;
      terminalPanel.setAgentMode(true);
      debugLog('agent-mode:enabled');
    } catch (error: unknown) {
      debugError('agent-mode:enable failed', error);
      try {
        await restoreEditorTabs();
      } catch (restoreError: unknown) {
        debugError('agent-mode:rollback failed', restoreError);
      }
      void vscode.window.showErrorMessage(
        `Could not enable Agent mode: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function exitAgentMode(): Promise<void> {
    if (!agentModeActive && !agentModeTabsState) {
      return;
    }
    agentModeActive = false;
    terminalPanel.setAgentMode(false);
    try {
      await restoreEditorTabs();
      debugLog('agent-mode:disabled');
    } catch (error: unknown) {
      debugError('agent-mode:disable failed', error);
      void vscode.window.showErrorMessage(
        `Could not restore editor tabs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

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

  workspaceWatcher.start();
  debugLog('activate:workspace watcher started');
  gitBranchWatcher.start();
  debugLog('activate:git branch watcher started');

  registerAllCommands({
    diffManager,
    panel: terminalPanel,
    context,
    getRunner: () => activeRunner,
    setRunner: (r) => { activeRunner = r; },
  });
  debugLog('activate:standard commands registered');

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-cli-diff-view.nextFile', () => navigationManager.nextFile()),
    vscode.commands.registerCommand('ai-cli-diff-view.prevFile', () => navigationManager.prevFile()),
    vscode.commands.registerCommand('ai-cli-diff-view.openWebviewPanelTest', openWebviewPanelTest),
    vscode.commands.registerCommand('ai-cli-diff-view.toggleAgentMode', () => (
      agentModeActive ? exitAgentMode() : enterAgentMode()
    ))
  );
  debugLog('activate:test and agent-mode commands registered');

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

  const autoRouteTab = (tab: vscode.Tab): void => {
    if (!(tab.input instanceof vscode.TabInputText)) { return; }
    const fsPath = tab.input.uri.fsPath;
    if (!diffManager.hasPendingDiff(fsPath)) { return; }
    void (async () => {
      try {
        await vscode.window.tabGroups.close(tab);
        await diffManager.openDiff(fsPath);
      } catch (err) {
        console.error('[ai-cli-diff] auto-route failed:', err);
      }
    })();
  };

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((e) => {
      for (const tab of e.opened) { autoRouteTab(tab); }
      for (const tab of e.changed) { autoRouteTab(tab); }
    })
  );

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) { autoRouteTab(tab); }
  }

  updateNavBarState();
  debugLog('activate:complete');
}

export function deactivate(): void {
  void restoreAgentModeTabsOnDeactivate?.();
  restoreAgentModeTabsOnDeactivate = undefined;
}
