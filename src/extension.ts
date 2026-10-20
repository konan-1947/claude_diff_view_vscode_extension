import * as vscode from 'vscode';
import { DiffManager } from './diff/diffManager';
import { DiffEditorProvider, DIFF_EDITOR_VIEW_TYPE } from './diff/diffWebviewPanel';
import { IAiRunner } from './runner/aiRunner';
import { WorkspaceWatcher } from './watcher/workspaceWatcher';
import { migrateLegacyTextFileSettings, refreshTextFileRules } from './watcher/fileTypeRules';
import { refreshFileSizeLimit } from './watcher/fileSizeLimit';
import { clearGitignoreCache, isExcludedPathSegment, refreshPathExclusions } from './watcher/pathExclusions';
import { GitBranchWatcher } from './watcher/gitBranchWatcher';
import { registerAllCommands } from './commands/commandsRegistry';
import { NavigationManager } from './diff/navigationManager';
import { NavBarPanel } from './views/navBarPanel';
import { AgentChangesPanel } from './views/agentChangesPanel';
import { TerminalPanelProvider } from './terminal/terminalPanel';
import { TerminalSessionStore } from './terminal/terminalSessions';
import { forgetOpenedBeside, hasOpenedBeside, isOpenedBeside, onDidChangeOpenedBeside } from './preview/openBeside';
import { coalesce } from './util/coalesce';

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

  // Before the first read, so the rules and the Included files table see the result.
  await migrateLegacyTextFileSettings();
  refreshTextFileRules();
  refreshFileSizeLimit();
  refreshPathExclusions();
  debugLog('activate:configuration initialized');

  const diffManager       = new DiffManager(context);
  let agentModeActive = false;
  const workspaceWatcher  = new WorkspaceWatcher(diffManager, () => !agentModeActive);
  const gitBranchWatcher  = new GitBranchWatcher(diffManager, context.workspaceState, workspaceWatcher);
  const navigationManager = new NavigationManager(diffManager);
  // Write out a burst save still waiting in DiffManager when the window closes or reloads.
  context.subscriptions.push({ dispose: () => diffManager.flushPendingSave() });
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
  // Explorer only follows the active text editor, and agent mode hides those,
  // so select the file there explicitly and then hand focus back to the agent.
  const revealInExplorerKeepingFocus = async (filePath: string): Promise<void> => {
    try {
      await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(filePath));
      agentModePanel?.reveal(undefined, false);
    } catch {
      // Explorer unavailable (e.g. file outside workspace); highlight sync is best-effort.
    }
  };
  const agentChangesPanel = new AgentChangesPanel(
    context.extensionUri,
    diffManager,
    (filePath) => {
      if (agentModeActive) {
        const opened = !!agentModeTerminal?.openPendingFileInAgent(filePath);
        if (opened) { void revealInExplorerKeepingFocus(filePath); }
        return opened;
      }
      void diffManager.openDiff(filePath);
      return true;
    },
    {
      toggleDiff: () => agentModeTerminal?.toggleDiffPreview(),
      showIntroduce: () => agentModeTerminal?.showIntroduce(),
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
          e.affectsConfiguration('ai-cli-diff-view.includedPaths') ||
          e.affectsConfiguration('ai-cli-diff-view.supportedFileExtensions') ||
          e.affectsConfiguration('ai-cli-diff-view.supportedFilenames') ||
          e.affectsConfiguration('ai-cli-diff-view.supportedFilenamePatterns')) {
        refreshTextFileRules();
        // A newly included file has no baseline yet: its next write would look
        // brand new and Revert all would delete it (same as excludedPaths below).
        workspaceWatcher.rebuildBaselineAfterRuleChange();
      }
      if (e.affectsConfiguration('ai-cli-diff-view.maxFileLines')) {
        refreshFileSizeLimit();
      }
      if (e.affectsConfiguration('ai-cli-diff-view.excludedPaths') ||
          e.affectsConfiguration('ai-cli-diff-view.respectGitignore')) {
        refreshPathExclusions();
        // Files that were excluded during the initial scan have no baseline, so
        // dropping an exclusion would make them look brand new — and Revert all
        // would delete them. Rebuild the baseline against the new rules.
        workspaceWatcher.rebuildBaselineAfterRuleChange();
      }
    })
  );

  // A .gitignore edited while running changes what is tracked: re-read the rules
  // and give newly un-ignored files a baseline (same reason as excludedPaths above).
  // Ones inside built-in excluded folders (node_modules during npm install) are skipped.
  const gitignoreChangedSoon = coalesce(() => {
    clearGitignoreCache();
    workspaceWatcher.rebuildBaselineAfterRuleChange();
  });
  const gitignoreWatcher = vscode.workspace.createFileSystemWatcher('**/.gitignore');
  const onGitignoreChange = (uri: vscode.Uri): void => {
    if (!isExcludedPathSegment(uri.fsPath)) { gitignoreChangedSoon.schedule(); }
  };
  context.subscriptions.push(
    gitignoreWatcher,
    gitignoreWatcher.onDidCreate(onGitignoreChange),
    gitignoreWatcher.onDidChange(onGitignoreChange),
    gitignoreWatcher.onDidDelete(onGitignoreChange),
    { dispose: () => gitignoreChangedSoon.dispose() },
  );

  // Shells outlive the webviews showing them: the side bar view is disposed when
  // hidden by its `when` clause, and Agent mode swaps in a panel of its own.
  const terminalSessions = new TerminalSessionStore();
  const terminalPanel = new TerminalPanelProvider(context, diffManager, terminalSessions);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      TerminalPanelProvider.viewType,
      terminalPanel,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    { dispose: () => terminalPanel.dispose() },
    terminalSessions
  );
  debugLog('activate:terminal webview provider registered');
  void vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalVisible', true);
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

    const terminal = new TerminalPanelProvider(context, diffManager, terminalSessions);
    const panel = terminal.openWebviewPanel();
    agentModeTerminal = terminal;
    agentModePanel = panel;
    terminal.setAgentMode(true);
    terminal.focusTerminal();
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
      await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.agentModeActive', true);
      agentChangesPanel.setAgentMode(true);
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
    vscode.commands.registerCommand('ai-cli-diff-view.focusAgentTerminal', () => {
      if (!agentModeActive || !agentModeTerminal) {
        return;
      }
      agentModeTerminal.focusTerminal();
      void hideEditorTabs();
    }),
    vscode.commands.registerCommand('ai-cli-diff-view.toggleAgentMode', () => (
      agentModeActive ? exitAgentMode() : enterAgentMode()
    ))
  );
  debugLog('activate:agent-mode command registered');

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      terminalPanel.noteWindowFocus(state.focused);
      agentModeTerminal?.noteWindowFocus(state.focused);
      if (!state.focused) {
        return;
      }
      if (agentModeActive) {
        if (agentModeTerminal?.wasTerminalFocused()) {
          agentModeTerminal.restoreTerminalFocus();
        }
      } else if (terminalPanel.wasTerminalFocused()) {
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

  // Both events come in bursts (an agent writing many files opens many tabs):
  // update the nav bar once per burst instead of once per event.
  const navBarSoon = coalesce(updateNavBarState);
  context.subscriptions.push(
    { dispose: () => navBarSoon.dispose() },
    diffManager.onDidChangeDiffs(() => navBarSoon.schedule()),
    vscode.window.tabGroups.onDidChangeTabs(() => navBarSoon.schedule())
  );

  // Agent mode hides the tab bar, so a file opened beside has no close button of its own.
  const besideStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  besideStatus.text = '$(close) Close side editor';
  besideStatus.tooltip = 'Close the file opened beside the agent terminal';
  besideStatus.command = 'ai-cli-diff-view.closeBesideEditors';
  const updateBesideStatus = (): void => {
    if (agentModeActive && hasOpenedBeside()) { besideStatus.show(); } else { besideStatus.hide(); }
  };
  context.subscriptions.push(
    besideStatus,
    onDidChangeOpenedBeside(updateBesideStatus),
    vscode.commands.registerCommand('ai-cli-diff-view.closeBesideEditors', async () => {
      const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => (
        (tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputCustom)
        && isOpenedBeside(tab.input.uri.fsPath)
      ));
      if (tabs.length > 0) { await vscode.window.tabGroups.close(tabs); }
      agentModeTerminal?.focusTerminal();
    }),
  );

  const autoRouteTab = (tab: vscode.Tab): void => {
    const input = tab.input;
    if (
      agentModeActive
      && (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom)
      && isOpenedBeside(input.uri.fsPath)
    ) {
      // The user sent this file to a side editor from the preview on purpose.
      return;
    }
    // Custom editors (markdown/image viewers from other extensions) are not TabInputText;
    // in agent mode they would cover the terminal, so route them to the in-panel preview too.
    if (
      agentModeActive && agentModeTerminal
      && tab.input instanceof vscode.TabInputCustom
      && tab.input.viewType !== 'ai-cli-diff-view.diffEditor'
      && tab.input.uri.scheme === 'file'
    ) {
      const fsPath = tab.input.uri.fsPath;
      void vscode.window.tabGroups.close(tab).then(() => {
        agentModeTerminal?.openFileInAgent(fsPath);
      });
      return;
    }
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
      for (const tab of e.closed) {
        if (tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputCustom) {
          forgetOpenedBeside(tab.input.uri.fsPath);
        }
      }
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
