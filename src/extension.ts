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
import { AgentChangesPanel } from './views/agentChangesPanel';
import { TerminalPanelProvider } from './terminal/terminalPanel';

const LOG_PREFIX = '[ai-cli-diff-view]';
const AGENT_MODE_TABS_STATE_KEY = 'ai-cli-diff-view.agentMode.editorTabsState';
type ShowTabsSetting = 'multiple' | 'single' | 'none';

interface AgentModeTabsState {
  target: vscode.ConfigurationTarget;
  value: ShowTabsSetting | undefined;
}

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

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  diagnosticChannel = vscode.window.createOutputChannel('AI CLI Diff View');
  context.subscriptions.push(diagnosticChannel);

  try {
    await activateExtension(context);
  } catch (error: unknown) {
    debugError('activate:failed', error);
    void vscode.window.showErrorMessage(
      `AI CLI Diff View failed to activate: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

async function activateExtension(context: vscode.ExtensionContext): Promise<void> {
  debugLog(`activate:start mode=${context.extensionMode} workspace=${vscode.workspace.workspaceFile?.fsPath ?? 'none'}`);

  refreshTextFileRules();
  refreshFileSizeLimit();
  debugLog('activate:configuration initialized');

  const diffManager       = new DiffManager(context);
  let agentModeActive = false;
  const workspaceWatcher  = new WorkspaceWatcher(diffManager, () => !agentModeActive);
  context.subscriptions.push(
    diffManager.onWillWriteFile(({ filePath, content }) => {
      workspaceWatcher.markInternalWrite(filePath, content);
    })
  );
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
  let agentModePanel: vscode.WebviewPanel | undefined;
  let agentModeTerminal: TerminalPanelProvider | undefined;
  let agentModeTabsState: AgentModeTabsState | undefined;
  const agentChangesPanel = new AgentChangesPanel(
    context.extensionUri,
    diffManager,
    (filePath) => {
      if (agentModeActive) {
        return !!agentModeTerminal?.openPendingFileInAgent(filePath);
      }
      void diffManager.openDiff(filePath);
      return true;
    },
    {
      toggleDiff: () => agentModeTerminal?.toggleDiffPreview(),
      showIntroduce: () => agentModeTerminal?.showIntroduce(),
      showExtensionInfo: () => {
        void vscode.env.openExternal(vscode.Uri.parse(
          'https://marketplace.visualstudio.com/items?itemName=konan1947.ai-cli-diff-view'
        ));
      },
      showSettings: () => agentModeTerminal?.showSettings(),
      toggleAgentMode: () => { void vscode.commands.executeCommand('ai-cli-diff-view.toggleAgentMode'); },
    },
  );
  context.subscriptions.push(
    agentChangesPanel,
    vscode.window.registerWebviewViewProvider(AgentChangesPanel.viewType, agentChangesPanel),
  );

  context.subscriptions.push(
    { dispose: () => diffManager.disposeAll() },
    { dispose: () => workspaceWatcher.dispose() },
    { dispose: () => gitBranchWatcher.dispose() },
    { dispose: () => activeRunner?.cancel?.() }
  );

  const restoreStaleAgentModeTabs = async (): Promise<void> => {
    const staleState = context.workspaceState.get<AgentModeTabsState>(AGENT_MODE_TABS_STATE_KEY);
    if (staleState) {
      await vscode.workspace.getConfiguration('workbench.editor').update(
        'showTabs',
        staleState.value,
        staleState.target
      );
      await context.workspaceState.update(AGENT_MODE_TABS_STATE_KEY, undefined);
      debugLog('agent-mode:stale editor tabs restored after reload');
      return;
    }

    // Older Agent Mode builds could leave showTabs set to none without a
    // recoverable snapshot. Extension startup is always outside Agent Mode,
    // so self-heal that stranded state rather than leaving every editor tab
    // and its close button hidden.
    const editorConfig = vscode.workspace.getConfiguration('workbench.editor');
    if (editorConfig.get<ShowTabsSetting>('showTabs') === 'none') {
      const hasWorkspace = Boolean(
        vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length
      );
      const target = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
      await editorConfig.update('showTabs', 'multiple', target);
      debugLog('agent-mode:recovered hidden editor tabs outside Agent Mode');
    }
  };

  await restoreStaleAgentModeTabs();

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
  void vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalVisible', true);
  void vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalFilesPage', false);
  void vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.agentModeActive', false);

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

  const setAgentEditorTabs = async (showTabs: ShowTabsSetting): Promise<void> => {
    if (!agentModeTabsState) {
      agentModeTabsState = captureEditorTabsState();
      await context.workspaceState.update(AGENT_MODE_TABS_STATE_KEY, agentModeTabsState);
    }
    try {
      await vscode.workspace.getConfiguration('workbench.editor').update(
        'showTabs',
        showTabs,
        agentModeTabsState.target
      );
    } catch (error: unknown) {
      agentModeTabsState = undefined;
      await context.workspaceState.update(AGENT_MODE_TABS_STATE_KEY, undefined);
      throw error;
    }
  };

  const hideEditorTabs = async (): Promise<void> => {
    await setAgentEditorTabs('none');
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
    await context.workspaceState.update(AGENT_MODE_TABS_STATE_KEY, undefined);
    debugLog('agent-mode:editor tabs restored');
  };
  restoreAgentModeTabsOnDeactivate = restoreEditorTabs;

  const openAgentTerminal = (): void => {
    if (agentModePanel) {
      agentModePanel.reveal(vscode.ViewColumn.Active);
      void hideEditorTabs();
      return;
    }

    const terminal = new TerminalPanelProvider(context, diffManager);
    const panel = terminal.openWebviewPanel();
    agentModeTerminal = terminal;
    agentModePanel = panel;
    terminal.setAgentMode(true);
    context.subscriptions.push(
      terminal.onDidChangePreviewActiveFile((filePath) => {
        if (agentModeActive && agentModeTerminal === terminal) {
          agentChangesPanel.setActiveFile(filePath);
        }
      }),
      terminal.onDidChangePreviewVisibility((open) => {
        if (agentModeActive && agentModeTerminal === terminal) {
          agentChangesPanel.setPreviewOpen(open);
        }
      }),
    );
    debugLog('agent-mode:central terminal panel created');

    panel.onDidDispose(() => {
      if (agentModePanel !== panel) {
        return;
      }
      agentModePanel = undefined;
      agentModeTerminal = undefined;
      debugLog('agent-mode:central terminal panel disposed');
      if (agentModeActive) {
        void exitAgentMode();
      }
    }, null, context.subscriptions);

    context.subscriptions.push(
      panel.onDidChangeViewState((event) => {
        if (agentModeActive && event.webviewPanel.active) {
          void hideEditorTabs();
        }
      })
    );
  };

  async function enterAgentMode(): Promise<void> {
    if (agentModeActive) {
      return;
    }
    try {
      agentModeActive = true;
      await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalFilesPage', false);
      await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.agentModeActive', true);
      agentChangesPanel.setAgentMode(true);
      terminalPanel.resetSessions();
      await hideEditorTabs();
      await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalVisible', false);
      openAgentTerminal();
      debugLog('agent-mode:enabled');
    } catch (error: unknown) {
      debugError('agent-mode:enable failed', error);
      await exitAgentMode();
      void vscode.window.showErrorMessage(
        `Could not enable Agent mode: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function exitAgentMode(): Promise<void> {
    if (!agentModeActive && !agentModeTabsState) {
      void vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.agentModeActive', false);
      return;
    }
    agentModeActive = false;
    agentChangesPanel.setAgentMode(false);
    const panel = agentModePanel;
    const centralTerminal = agentModeTerminal;
    agentModePanel = undefined;
    agentModeTerminal = undefined;
    if (panel) {
      panel.dispose();
    } else {
      centralTerminal?.dispose();
    }
    try {
      await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.agentModeActive', false);
      // Restore this user setting before any terminal cleanup. A failing
      // terminal/webview operation must never leave editor tabs hidden.
      await restoreEditorTabs();
      await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalVisible', true);
      await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalFilesPage', false);
      terminalPanel.startFresh();
      terminalPanel.setAgentMode(false);
      terminalPanel.focusTerminal();
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
    openPendingFileInAgent: (filePath) => (
      agentModeActive && !!agentModeTerminal?.openPendingFileInAgent(filePath)
    ),
  });
  debugLog('activate:standard commands registered');

  context.subscriptions.push(
    vscode.commands.registerCommand('ai-cli-diff-view.nextFile', () => navigationManager.nextFile()),
    vscode.commands.registerCommand('ai-cli-diff-view.prevFile', () => navigationManager.prevFile()),
    vscode.commands.registerCommand('ai-cli-diff-view.showPendingFiles', async () => {
      agentChangesPanel.setCodeModeFilesVisible(true);
      await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalFilesPage', true);
    }),
    vscode.commands.registerCommand('ai-cli-diff-view.showTerminal', async () => {
      await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalFilesPage', false);
      agentChangesPanel.setCodeModeFilesVisible(false);
      terminalPanel.focusTerminal();
    }),
    vscode.commands.registerCommand('ai-cli-diff-view.focusAgentTerminal', () => {
      if (!agentModeActive || !agentModeTerminal) {
        return;
      }
      agentModeTerminal.focusTerminal();
      void hideEditorTabs();
    }),
    vscode.commands.registerCommand('ai-cli-diff-view.toggleAgentMode', () => (
      agentModeActive ? exitAgentMode() : enterAgentMode()
    )),
    vscode.commands.registerCommand('ai-cli-diff-view.showExtensionInfo', () => {
      void vscode.env.openExternal(vscode.Uri.parse(
        'https://marketplace.visualstudio.com/items?itemName=konan1947.ai-cli-diff-view'
      ));
    })
  );
  debugLog('activate:agent-mode command registered');

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (!agentModeActive && state.focused && terminalPanel.wasTerminalFocused()) {
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
    // A tab becomes `changed` when the user edits it. Never close a dirty
    // document from the auto-router: doing so makes VS Code show its
    // save/discard confirmation and can discard edits before auto-save runs.
    if (tab.isDirty) { return; }
    const fsPath = tab.input.uri.fsPath;
    if (agentModeActive && agentModeTerminal) {
      void vscode.window.tabGroups.close(tab).then(() => {
        agentModeTerminal?.openFileInAgent(fsPath);
      });
      return;
    }
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

export async function deactivate(): Promise<void> {
  await restoreAgentModeTabsOnDeactivate?.();
  restoreAgentModeTabsOnDeactivate = undefined;
}
