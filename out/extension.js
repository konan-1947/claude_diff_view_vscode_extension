"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const diffManager_1 = require("./diff/diffManager");
const diffWebviewPanel_1 = require("./diff/diffWebviewPanel");
const workspaceWatcher_1 = require("./watcher/workspaceWatcher");
const fileTypeRules_1 = require("./watcher/fileTypeRules");
const fileSizeLimit_1 = require("./watcher/fileSizeLimit");
const gitBranchWatcher_1 = require("./watcher/gitBranchWatcher");
const commandsRegistry_1 = require("./commands/commandsRegistry");
const navigationManager_1 = require("./diff/navigationManager");
const navBarPanel_1 = require("./views/navBarPanel");
const agentChangesPanel_1 = require("./views/agentChangesPanel");
const terminalPanel_1 = require("./terminal/terminalPanel");
const LOG_PREFIX = '[ai-cli-diff-view]';
const AGENT_MODE_TABS_STATE_KEY = 'ai-cli-diff-view.agentMode.editorTabsState';
let diagnosticChannel;
let restoreAgentModeTabsOnDeactivate;
function debugLog(message) {
    const line = `${LOG_PREFIX} ${new Date().toISOString()} ${message}`;
    console.log(line);
    diagnosticChannel?.appendLine(line);
}
function debugError(message, error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error ?? '');
    const line = `${LOG_PREFIX} ${new Date().toISOString()} ${message} ${detail}`;
    console.error(line, error ?? '');
    diagnosticChannel?.appendLine(line);
}
async function activate(context) {
    diagnosticChannel = vscode.window.createOutputChannel('AI CLI Diff View');
    context.subscriptions.push(diagnosticChannel);
    try {
        await activateExtension(context);
    }
    catch (error) {
        debugError('activate:failed', error);
        void vscode.window.showErrorMessage(`AI CLI Diff View failed to activate: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
async function activateExtension(context) {
    debugLog(`activate:start mode=${context.extensionMode} workspace=${vscode.workspace.workspaceFile?.fsPath ?? 'none'}`);
    (0, fileTypeRules_1.refreshTextFileRules)();
    (0, fileSizeLimit_1.refreshFileSizeLimit)();
    debugLog('activate:configuration initialized');
    const diffManager = new diffManager_1.DiffManager(context);
    let agentModeActive = false;
    const workspaceWatcher = new workspaceWatcher_1.WorkspaceWatcher(diffManager, () => !agentModeActive);
    context.subscriptions.push(diffManager.onWillWriteFile(({ filePath, content }) => {
        workspaceWatcher.markInternalWrite(filePath, content);
    }));
    const gitBranchWatcher = new gitBranchWatcher_1.GitBranchWatcher(diffManager, context.workspaceState, workspaceWatcher);
    const navigationManager = new navigationManager_1.NavigationManager(diffManager);
    debugLog('activate:core services constructed');
    const diffEditorProvider = new diffWebviewPanel_1.DiffEditorProvider(context.extensionUri, diffManager);
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(diffWebviewPanel_1.DIFF_EDITOR_VIEW_TYPE, diffEditorProvider, {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
    }));
    debugLog('activate:custom editor provider registered');
    const navBarPanel = new navBarPanel_1.NavBarPanel(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(navBarPanel_1.NavBarPanel.viewType, navBarPanel));
    debugLog('activate:navigation webview provider registered');
    let activeRunner;
    let agentModePanel;
    let agentModeTerminal;
    let agentModeTabsState;
    const agentChangesPanel = new agentChangesPanel_1.AgentChangesPanel(context.extensionUri, diffManager, (filePath) => {
        if (agentModeActive) {
            return !!agentModeTerminal?.openPendingFileInAgent(filePath);
        }
        void diffManager.openDiff(filePath);
        return true;
    }, {
        toggleDiff: () => agentModeTerminal?.toggleDiffPreview(),
        showIntroduce: () => agentModeTerminal?.showIntroduce(),
        showExtensionInfo: () => {
            void vscode.env.openExternal(vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=konan1947.ai-cli-diff-view'));
        },
        showSettings: () => agentModeTerminal?.showSettings(),
        toggleAgentMode: () => { void vscode.commands.executeCommand('ai-cli-diff-view.toggleAgentMode'); },
    });
    context.subscriptions.push(agentChangesPanel, vscode.window.registerWebviewViewProvider(agentChangesPanel_1.AgentChangesPanel.viewType, agentChangesPanel));
    context.subscriptions.push({ dispose: () => diffManager.disposeAll() }, { dispose: () => workspaceWatcher.dispose() }, { dispose: () => gitBranchWatcher.dispose() }, { dispose: () => activeRunner?.cancel?.() });
    const restoreStaleAgentModeTabs = async () => {
        const staleState = context.workspaceState.get(AGENT_MODE_TABS_STATE_KEY);
        if (staleState) {
            await vscode.workspace.getConfiguration('workbench.editor').update('showTabs', staleState.value, staleState.target);
            await context.workspaceState.update(AGENT_MODE_TABS_STATE_KEY, undefined);
            debugLog('agent-mode:stale editor tabs restored after reload');
            return;
        }
        // Older Agent Mode builds could leave showTabs set to none without a
        // recoverable snapshot. Extension startup is always outside Agent Mode,
        // so self-heal that stranded state rather than leaving every editor tab
        // and its close button hidden.
        const editorConfig = vscode.workspace.getConfiguration('workbench.editor');
        if (editorConfig.get('showTabs') === 'none') {
            const hasWorkspace = Boolean(vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length);
            const target = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
            await editorConfig.update('showTabs', 'multiple', target);
            debugLog('agent-mode:recovered hidden editor tabs outside Agent Mode');
        }
    };
    await restoreStaleAgentModeTabs();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('ai-cli-diff-view.supportedFileDetectionMode') ||
            e.affectsConfiguration('ai-cli-diff-view.supportedFileExtensions') ||
            e.affectsConfiguration('ai-cli-diff-view.supportedFilenames') ||
            e.affectsConfiguration('ai-cli-diff-view.supportedFilenamePatterns')) {
            (0, fileTypeRules_1.refreshTextFileRules)();
        }
        if (e.affectsConfiguration('ai-cli-diff-view.maxFileLines')) {
            (0, fileSizeLimit_1.refreshFileSizeLimit)();
        }
    }));
    const terminalPanel = new terminalPanel_1.TerminalPanelProvider(context, diffManager);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(terminalPanel_1.TerminalPanelProvider.viewType, terminalPanel, { webviewOptions: { retainContextWhenHidden: true } }), { dispose: () => terminalPanel.dispose() });
    debugLog('activate:terminal webview provider registered');
    void vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalVisible', true);
    void vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalFilesPage', false);
    void vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.agentModeActive', false);
    const captureEditorTabsState = () => {
        const config = vscode.workspace.getConfiguration('workbench.editor');
        const inspection = config.inspect('showTabs');
        const hasWorkspace = Boolean(vscode.workspace.workspaceFile || vscode.workspace.workspaceFolders?.length);
        return {
            // A workspace override is temporary when a workspace is open. Removing
            // it on exit restores the user's global or folder-specific setting.
            target: hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global,
            value: hasWorkspace ? inspection?.workspaceValue : inspection?.globalValue,
        };
    };
    const setAgentEditorTabs = async (showTabs) => {
        if (!agentModeTabsState) {
            agentModeTabsState = captureEditorTabsState();
            await context.workspaceState.update(AGENT_MODE_TABS_STATE_KEY, agentModeTabsState);
        }
        try {
            await vscode.workspace.getConfiguration('workbench.editor').update('showTabs', showTabs, agentModeTabsState.target);
        }
        catch (error) {
            agentModeTabsState = undefined;
            await context.workspaceState.update(AGENT_MODE_TABS_STATE_KEY, undefined);
            throw error;
        }
    };
    const hideEditorTabs = async () => {
        await setAgentEditorTabs('none');
        debugLog('agent-mode:editor tabs hidden');
    };
    const restoreEditorTabs = async () => {
        if (!agentModeTabsState) {
            return;
        }
        const previous = agentModeTabsState;
        await vscode.workspace.getConfiguration('workbench.editor').update('showTabs', previous.value, previous.target);
        agentModeTabsState = undefined;
        await context.workspaceState.update(AGENT_MODE_TABS_STATE_KEY, undefined);
        debugLog('agent-mode:editor tabs restored');
    };
    restoreAgentModeTabsOnDeactivate = restoreEditorTabs;
    const openAgentTerminal = () => {
        if (agentModePanel) {
            agentModePanel.reveal(vscode.ViewColumn.Active);
            void hideEditorTabs();
            return;
        }
        const terminal = new terminalPanel_1.TerminalPanelProvider(context, diffManager);
        const panel = terminal.openWebviewPanel();
        agentModeTerminal = terminal;
        agentModePanel = panel;
        terminal.setAgentMode(true);
        context.subscriptions.push(terminal.onDidChangePreviewActiveFile((filePath) => {
            if (agentModeActive && agentModeTerminal === terminal) {
                agentChangesPanel.setActiveFile(filePath);
            }
        }), terminal.onDidChangePreviewVisibility((open) => {
            if (agentModeActive && agentModeTerminal === terminal) {
                agentChangesPanel.setPreviewOpen(open);
            }
        }));
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
        context.subscriptions.push(panel.onDidChangeViewState((event) => {
            if (agentModeActive && event.webviewPanel.active) {
                void hideEditorTabs();
            }
        }));
    };
    async function enterAgentMode() {
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
        }
        catch (error) {
            debugError('agent-mode:enable failed', error);
            await exitAgentMode();
            void vscode.window.showErrorMessage(`Could not enable Agent mode: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async function exitAgentMode() {
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
        }
        else {
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
        }
        catch (error) {
            debugError('agent-mode:disable failed', error);
            void vscode.window.showErrorMessage(`Could not restore editor tabs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    const MOVED_RIGHT_KEY = 'ai-cli-diff-view.terminal.movedToRight';
    if (!context.globalState.get(MOVED_RIGHT_KEY)) {
        void context.globalState.update(MOVED_RIGHT_KEY, true);
        setTimeout(() => {
            void (async () => {
                try {
                    await vscode.commands.executeCommand('ai-cli-diff-view.terminal.focus');
                    await vscode.commands.executeCommand('workbench.action.moveView', {
                        viewId: terminalPanel_1.TerminalPanelProvider.viewType,
                        destinationId: 'workbench.view.auxiliarybar',
                    });
                }
                catch {
                    // Best-effort; if API changes, user can drag panel manually.
                }
            })();
        }, 1500);
    }
    workspaceWatcher.start();
    debugLog('activate:workspace watcher started');
    gitBranchWatcher.start();
    debugLog('activate:git branch watcher started');
    (0, commandsRegistry_1.registerAllCommands)({
        diffManager,
        panel: terminalPanel,
        context,
        getRunner: () => activeRunner,
        setRunner: (r) => { activeRunner = r; },
        openPendingFileInAgent: (filePath) => (agentModeActive && !!agentModeTerminal?.openPendingFileInAgent(filePath)),
    });
    debugLog('activate:standard commands registered');
    context.subscriptions.push(vscode.commands.registerCommand('ai-cli-diff-view.nextFile', () => navigationManager.nextFile()), vscode.commands.registerCommand('ai-cli-diff-view.prevFile', () => navigationManager.prevFile()), vscode.commands.registerCommand('ai-cli-diff-view.showPendingFiles', async () => {
        agentChangesPanel.setCodeModeFilesVisible(true);
        await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalFilesPage', true);
    }), vscode.commands.registerCommand('ai-cli-diff-view.showTerminal', async () => {
        await vscode.commands.executeCommand('setContext', 'ai-cli-diff-view.terminalFilesPage', false);
        agentChangesPanel.setCodeModeFilesVisible(false);
        terminalPanel.focusTerminal();
    }), vscode.commands.registerCommand('ai-cli-diff-view.focusAgentTerminal', () => {
        if (!agentModeActive || !agentModeTerminal) {
            return;
        }
        agentModeTerminal.focusTerminal();
        void hideEditorTabs();
    }), vscode.commands.registerCommand('ai-cli-diff-view.toggleAgentMode', () => (agentModeActive ? exitAgentMode() : enterAgentMode())), vscode.commands.registerCommand('ai-cli-diff-view.showExtensionInfo', () => {
        void vscode.env.openExternal(vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=konan1947.ai-cli-diff-view'));
    }));
    debugLog('activate:agent-mode command registered');
    context.subscriptions.push(vscode.window.onDidChangeWindowState((state) => {
        if (!agentModeActive && state.focused && terminalPanel.wasTerminalFocused()) {
            terminalPanel.focusTerminal();
        }
    }));
    function updateNavBarState() {
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
    context.subscriptions.push(diffManager.onDidChangeDiffs(() => {
        updateNavBarState();
    }));
    context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(() => updateNavBarState()));
    const autoRouteTab = (tab) => {
        if (!(tab.input instanceof vscode.TabInputText)) {
            return;
        }
        // A tab becomes `changed` when the user edits it. Never close a dirty
        // document from the auto-router: doing so makes VS Code show its
        // save/discard confirmation and can discard edits before auto-save runs.
        if (tab.isDirty) {
            return;
        }
        const fsPath = tab.input.uri.fsPath;
        if (agentModeActive && agentModeTerminal) {
            void vscode.window.tabGroups.close(tab).then(() => {
                agentModeTerminal?.openFileInAgent(fsPath);
            });
            return;
        }
        if (!diffManager.hasPendingDiff(fsPath)) {
            return;
        }
        void (async () => {
            try {
                await vscode.window.tabGroups.close(tab);
                await diffManager.openDiff(fsPath);
            }
            catch (err) {
                console.error('[ai-cli-diff] auto-route failed:', err);
            }
        })();
    };
    context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs((e) => {
        for (const tab of e.opened) {
            autoRouteTab(tab);
        }
        for (const tab of e.changed) {
            autoRouteTab(tab);
        }
    }));
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            autoRouteTab(tab);
        }
    }
    updateNavBarState();
    debugLog('activate:complete');
}
async function deactivate() {
    await restoreAgentModeTabsOnDeactivate?.();
    restoreAgentModeTabsOnDeactivate = undefined;
}
//# sourceMappingURL=extension.js.map