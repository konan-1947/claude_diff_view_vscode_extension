/**
 * Claude Agent Handlers - single handlers file
 *
 * Responsibility: handle every request coming from the WebView
 * Dependencies: all services injected through HandlerContext
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { allowBypassPermissions } from '../ClaudeSdkService';
import type {
    InitRequest,
    InitResponse,
    GetClaudeStateRequest,
    GetClaudeStateResponse,
    GetAssetUrisRequest,
    GetAssetUrisResponse,
    OpenFileRequest,
    OpenFileResponse,
    GetCurrentSelectionResponse,
    ShowNotificationRequest,
    ShowNotificationResponse,
    NewConversationTabRequest,
    GetSessionOwnerRequest,
    GetSessionOwnerResponse,
    FocusTabRequest,
    FocusTabResponse,
    ReportSessionSettingsRequest,
    ReportSessionSettingsResponse,
    NewConversationTabResponse,
    RenameTabRequest,
    RenameTabResponse,
    OpenDiffRequest,
    OpenDiffResponse,
    ListSessionsRequest,
    ListSessionsResponse,
    GetSessionRequest,
    GetSessionResponse,
    ExecRequest,
    ExecResponse,
    ListFilesRequest,
    ListFilesResponse,
    StatPathRequest,
    StatPathResponse,
    OpenContentRequest,
    OpenContentResponse,
    OpenURLRequest,
    OpenURLResponse,
    OpenConfigFileRequest,
    OpenConfigFileResponse,
    GetPermissionsRequest,
    GetPermissionsResponse,
    UpdatePermissionRequest,
    UpdatePermissionResponse,
    ResolveDirectoryRequest,
    ResolveDirectoryResponse,
    GetPluginsRequest,
    GetPluginsResponse,
    PluginActionRequest,
    PluginActionResponse,
    AvailablePluginEntry,
    GetAvailablePluginsRequest,
    GetAvailablePluginsResponse,
    GetMarketplacesRequest,
    GetMarketplacesResponse,
    MarketplaceActionRequest,
    MarketplaceActionResponse,
    OpenReleaseNotesRequest,
    OpenReleaseNotesResponse,
    GetAuthStatusRequest,
    GetAuthStatusResponse,
    AuthLoginRequest,
    AuthLoginResponse,
    AuthLoginActionRequest,
    AuthLoginActionResponse,
    AuthLogoutRequest,
    AuthLogoutResponse,
    OpenClaudeInTerminalRequest,
    OpenClaudeInTerminalResponse,
    GetSettingsRequest,
    GetSettingsResponse,
    UpdateSettingRequest,
    UpdateSettingResponse,
    ResetSettingRequest,
    ResetSettingResponse,
    SwitchProfileRequest,
    SwitchProfileResponse,
    CreateProfileRequest,
    CreateProfileResponse,
    DeleteProfileRequest,
    DeleteProfileResponse,
    GetExtensionConfigRequest,
    GetExtensionConfigResponse,
    UpdateExtensionConfigRequest,
    UpdateExtensionConfigResponse,
    SdkProbeRequest,
    SdkProbeResponse,
    GetMemoryFilesRequest,
    GetMemoryFilesResponse,
    OpenClaudeFileRequest,
    OpenClaudeFileResponse,
    GetHooksRequest,
    GetHooksResponse,
    ExportConversationRequest,
    ExportConversationResponse,
    GetPromptHistoryRequest,
    GetPromptHistoryResponse,
    AddPromptHistoryRequest,
    AddPromptHistoryResponse,
    RunShellCommandRequest,
    RunShellCommandResponse,
    GetRewindPointRequest,
    GetRewindPointResponse
} from '../../../shared/messages';
import { appendPromptHistory, readPromptHistory, runShellCommand } from '../promptTools';
import {
    changelogFile,
    ensureClaudeFile,
    memoryFiles,
    readHooks,
    readPermissions,
    resolveClaudeFile,
    updatePermissionList
} from '../claudeFiles';
import {
    cliError,
    listAvailablePlugins,
    listMarketplaces,
    listPlugins,
    LoginProcess,
    readAuthStatus,
    runClaudeCli,
    runPluginCommand
} from '../claudeCli';
import type { HandlerContext } from './types';
import type { PermissionMode, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { AsyncStream } from '../transport/AsyncStream';
/**
 * Init request
 */
export async function handleInit(
    _request: InitRequest,
    context: HandlerContext
): Promise<InitResponse> {
    const { configService, workspaceService, logService, agentService } = context;

    logService.info('[handleInit] Handling init request');

    // TODO: get the auth status from AuthManager
    // const authStatus = null;

    // Get the model setting (reads the 'model' field of the CLI settings.json, same as Model Manage in the Settings page)
    const modelSetting = (await configService.getSetting<string>('model')) || 'default';

    // Get the default working directory
    const defaultCwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    // Get the thinking level (default value)
    const thinkingLevel = 'default_on';

    return {
        type: "init_response",
        state: {
            defaultCwd,
            // authStatus,
            modelSetting,
            platform: process.platform,
            thinkingLevel,
            allowBypassPermissions: allowBypassPermissions()
        }
    };
}

/**
 * Get the Claude state
 */
export async function handleGetClaudeState(
    _request: GetClaudeStateRequest,
    context: HandlerContext
): Promise<GetClaudeStateResponse> {
    const { logService } = context;

    logService.info('[handleGetClaudeState] Getting Claude state');

    const config = await loadConfig(context);

    return {
        type: "get_claude_state_response",
        config
    };
}

/**
 * One-off SDK probe
 */
export async function handleSdkProbe(
    request: SdkProbeRequest,
    context: HandlerContext
): Promise<SdkProbeResponse> {
    const { sdkService, workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const result = await sdkService.probe({
        capabilities: request.capabilities ?? [],
        cwd,
        timeoutMs: request.timeoutMs
    });

    return {
        type: "sdk_probe_response",
        data: result.data,
        errors: result.errors
    };
}

/**
 * Get asset URIs
 */
export async function handleGetAssetUris(
    _request: GetAssetUrisRequest,
    context: HandlerContext
): Promise<GetAssetUrisResponse> {
    return {
        type: "asset_uris_response",
        assetUris: getAssetUris(context)
    };
}

/**
 * Handle get_settings request
 */
export async function handleGetSettings(
    _request: GetSettingsRequest,
    context: HandlerContext
): Promise<GetSettingsResponse> {
    // Use getAllSettings() for effective values — it deep-merges object-type settings
    // (env, permissions, etc.) across profile/default layers correctly.
    // inspectAll() provides per-key scope/layer metadata for UI rendering.
    const settings = await context.configService.getAllSettings();
    const detailedSettings = await context.configService.inspectAll();
    const metadata: any = {};

    for (const [key, inspection] of Object.entries(detailedSettings)) {
      metadata[key] = {
        effectiveScope: inspection.effectiveScope,
        values: inspection.values
      };
    }

    const activeProfile = context.configService.activeProfile;
    const profiles = await context.configService.getProfiles();

    return {
      type: 'get_settings_response',
      settings,
      metadata,
      activeProfile,
      profiles,
      hasWorkspace: context.configService.hasWorkspace
    };
  }

/**
 * Handle switch_profile request
 */
export async function handleSwitchProfile(
  request: SwitchProfileRequest,
  context: HandlerContext
): Promise<SwitchProfileResponse> {
  await context.configService.switchProfile(request.profile);
  return {
    type: 'switch_profile_response',
    success: true
  };
}

/**
 * Handle create_profile request
 */
export async function handleCreateProfile(
  request: CreateProfileRequest,
  context: HandlerContext
): Promise<CreateProfileResponse> {
  try {
    await context.configService.createProfile(request.name);
    return {
      type: 'create_profile_response',
      success: true
    };
  } catch (e: any) {
    return {
      type: 'create_profile_response',
      success: false,
      error: e.message
    };
  }
}

/**
 * Handle delete_profile request
 */
export async function handleDeleteProfile(
  request: DeleteProfileRequest,
  context: HandlerContext
): Promise<DeleteProfileResponse> {
  try {
    await context.configService.deleteProfile(request.name);
    return {
      type: 'delete_profile_response',
      success: true
    };
  } catch (e: any) {
    return {
      type: 'delete_profile_response',
      success: false,
      error: e.message
    };
  }
}

/**
 * Handle update_setting request
 */
export async function handleUpdateSetting(
    request: UpdateSettingRequest,
    context: HandlerContext
): Promise<UpdateSettingResponse> {
    // Default to 'global' if target not specified
    const target = request.target || 'global';
    await context.configService.updateSetting(request.key, request.value, target);
    return {
        type: "update_setting_response",
        success: true
    };
}

/**
 * Handle reset_setting request (delete value at a specific scope)
 */
export async function handleResetSetting(
    request: ResetSettingRequest,
    context: HandlerContext
): Promise<ResetSettingResponse> {
    await context.configService.resetSetting(request.key, request.target);
    return {
        type: "reset_setting_response",
        success: true
    };
}

/**
 * Handle get_extension_config request
 */
export async function handleGetExtensionConfig(
    _request: GetExtensionConfigRequest,
    context: HandlerContext
): Promise<GetExtensionConfigResponse> {
    const config = await context.configService.getExtensionConfig();
    return {
        type: 'get_extension_config_response',
        config
    };
}

/**
 * Handle update_extension_config request
 */
export async function handleUpdateExtensionConfig(
    request: UpdateExtensionConfigRequest,
    context: HandlerContext
): Promise<UpdateExtensionConfigResponse> {
    await context.configService.updateExtensionConfig(request.key as any, request.value);

    // Broadcast config change to all webviews (so chat page ModelSelect can refresh)
    context.webViewService.postMessage({
        type: 'request',
        requestId: `config-changed-${Date.now()}`,
        request: {
            type: 'extension_config_changed',
            key: request.key,
            value: request.value,
        }
    });

    return {
        type: 'update_extension_config_response',
        success: true
    };
}

/**
 * Open a file
 */
export async function handleOpenFile(
    request: OpenFileRequest,
    context: HandlerContext
): Promise<OpenFileResponse> {
    const { logService, workspaceService, fileSystemService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const { filePath, location } = request;

    try {
        const searchResults = await fileSystemService.findFiles(filePath, cwd);
        const resolvedPath = await fileSystemService.resolveExistingPath(filePath, cwd, searchResults);
        const stat = await fs.promises.stat(resolvedPath);
        const uri = vscode.Uri.file(resolvedPath);

        if (stat.isDirectory()) {
            await vscode.commands.executeCommand("revealInExplorer", uri);
            return { type: "open_file_response" };
        }

        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });

        if (location) {
            const startLine = Math.max((location.startLine ?? 1) - 1, 0);
            const endLine = Math.max((location.endLine ?? location.startLine ?? 1) - 1, startLine);
            const startColumn = Math.max(location.startColumn ?? 0, 0);
            const endColumn = Math.max(location.endColumn ?? startColumn, startColumn);

            const range = new vscode.Range(
                new vscode.Position(startLine, startColumn),
                new vscode.Position(endLine, endColumn)
            );

            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(range.start, range.end);
        }

        return { type: "open_file_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logService.error(`[handleOpenFile] Failed to open file: ${errorMsg}`);
        throw new Error(`Failed to open file: ${errorMsg}`);
    }
}

/**
 * Get the current editor selection
 */
export async function handleGetCurrentSelection(
    context: HandlerContext
): Promise<GetCurrentSelectionResponse> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty || editor.document.uri.scheme !== "file") {
        return {
            type: "get_current_selection_response",
            selection: null
        };
    }

    const document = editor.document;
    const selection = editor.selection;

    return {
        type: "get_current_selection_response",
        selection: {
            filePath: document.uri.fsPath,
            startLine: selection.start.line + 1,
            endLine: selection.end.line + 1,
            startColumn: selection.start.character,
            endColumn: selection.end.character,
            selectedText: document.getText(selection)
        }
    };
}

/**
 * Show a notification
 */
export async function handleShowNotification(
    request: ShowNotificationRequest,
    context: HandlerContext
): Promise<ShowNotificationResponse> {
    const { message, severity, buttons = [] } = request;

    let result: string | undefined;
    switch (severity) {
        case "error":
            result = await vscode.window.showErrorMessage(message, ...buttons);
            break;
        case "warning":
            result = await vscode.window.showWarningMessage(message, ...buttons);
            break;
        case "info":
        default:
            result = await vscode.window.showInformationMessage(message, ...buttons);
            break;
    }

    return {
        type: "show_notification_response",
        buttonValue: result
    };
}

/**
 * The other Claude UI tab (if any) holding this conversation
 */
export async function handleGetSessionOwner(
    request: GetSessionOwnerRequest,
    context: HandlerContext,
    webviewId?: string
): Promise<GetSessionOwnerResponse> {
    return {
        type: "get_session_owner_response",
        owner: context.webViewService.sessionOwner(request.sessionId, webviewId),
    };
}

/**
 * Model / effort / mode a running conversation uses now
 */
export async function handleReportSessionSettings(
    request: ReportSessionSettingsRequest,
    context: HandlerContext
): Promise<ReportSessionSettingsResponse> {
    if (typeof request.sessionId === 'string' && request.sessionId) {
        const s = request.settings ?? {};
        const clean = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
        const settings = Object.fromEntries(
            Object.entries({ model: clean(s.model), effort: clean(s.effort), permissionMode: clean(s.permissionMode) })
                .filter(([, v]) => v !== undefined)
        );
        context.webViewService.noteSessionSettings(request.sessionId, settings);
    }
    return { type: "report_session_settings_response" };
}

/**
 * Bring another Claude UI tab to the front of the terminal tab strip
 */
export async function handleFocusTab(
    request: FocusTabRequest,
    context: HandlerContext
): Promise<FocusTabResponse> {
    context.webViewService.requestTab({ kind: 'focus', tabId: request.tabId });
    return { type: "focus_tab_response" };
}

/**
 * New session tab (focus the side bar)
 */
export async function handleNewConversationTab(
    request: NewConversationTabRequest,
    context: HandlerContext,
    webviewId?: string
): Promise<NewConversationTabResponse> {
    // Opens another Claude UI tab next to the requesting one in the terminal panel tab strip.
    context.webViewService.requestTab({
        kind: 'new',
        tabId: webviewId ?? '',
        initialPrompt: request.initialPrompt,
    });
    return {
        type: "new_conversation_tab_response"
    };
}

/**
 * Rename the Claude UI tab that sent the request.
 */
export async function handleRenameTab(
    request: RenameTabRequest,
    context: HandlerContext,
    webviewId?: string
): Promise<RenameTabResponse> {
    if (webviewId) {
        context.webViewService.requestTab({ kind: 'rename', tabId: webviewId, title: request.title });
    }
    return {
        type: "rename_tab_response"
    };
}

/**
 * Open the diff editor
 */
export async function handleOpenDiff(
    request: OpenDiffRequest,
    context: HandlerContext,
    signal: AbortSignal
): Promise<OpenDiffResponse> {
    const { logService, workspaceService, fileSystemService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    logService.info(`Opening diff for: ${request.originalFilePath}`);

    const originalPath = fileSystemService.resolveFilePath(request.originalFilePath, cwd);
    const fallbackNewPath = request.newFilePath ? fileSystemService.resolveFilePath(request.newFilePath, cwd) : undefined;

    if (signal.aborted) {
        return {
            type: "open_diff_response",
            newEdits: request.edits
        };
    }

    const rightPath = await prepareDiffRightFile(originalPath, fallbackNewPath, request.edits, context);

    const leftExists = await fileSystemService.pathExists(originalPath);
    const leftPath = leftExists
        ? originalPath
        : await fileSystemService.createTempFile(path.basename(request.originalFilePath || request.newFilePath || "untitled"), "");

    const leftUri = vscode.Uri.file(leftPath);
    const rightUri = vscode.Uri.file(rightPath);

    const diffTitle = `${path.basename(request.originalFilePath || request.newFilePath || rightPath)} (Claude)`;

    await vscode.commands.executeCommand(
        "vscode.diff",
        leftUri,
        rightUri,
        diffTitle,
        { preview: true }
    );

    return {
        type: "open_diff_response",
        newEdits: request.edits
    };
}

/**
 * List session history
 */
export async function handleListSessions(
    _request: ListSessionsRequest,
    context: HandlerContext
): Promise<ListSessionsResponse> {
    const { logService, sessionService, workspaceService } = context;

    try {
        const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
        const sessions = await sessionService.listSessions(cwd);

        // Add the worktree and isCurrentWorkspace fields
        const sessionsWithMeta = sessions.map(session => ({
            ...session,
            worktree: undefined,
            isCurrentWorkspace: true
        }));

        return {
            type: "list_sessions_response",
            sessions: sessionsWithMeta
        };
    } catch (error) {
        logService.error(`Failed to list sessions: ${error}`);
        return {
            type: "list_sessions_response",
            sessions: []
        };
    }
}

/**
 * Get session details
 */
export async function handleGetSession(
    request: GetSessionRequest,
    context: HandlerContext
): Promise<GetSessionResponse> {
    const { logService, sessionService, workspaceService } = context;

    try {
        const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
        const [messages, settings] = await Promise.all([
            sessionService.getSession(request.sessionId, cwd),
            sessionService.getSessionSettings(request.sessionId, cwd),
        ]);

        // What a tab reported while running beats the transcript, which only
        // records a mode or model change with the next prompt
        const live = context.webViewService.liveSessionSettings(request.sessionId);
        return {
            type: "get_session_response",
            messages,
            settings: live ? { ...settings, ...live } : settings
        };
    } catch (error) {
        logService.error(`Failed to get session: ${error}`);
        return {
            type: "get_session_response",
            messages: []
        };
    }
}

/**
 * Execute a command
 */
export async function handleExec(
    request: ExecRequest,
    context: HandlerContext
): Promise<ExecResponse> {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const { command, params } = request;

    return new Promise<ExecResponse>((resolve) => {
        const { spawn } = require('child_process');
        let stdout = "";
        let stderr = "";

        const proc = spawn(command, params, {
            cwd,
            shell: false
        });

        proc.stdout?.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        proc.stderr?.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

        proc.on("close", (code: number) => {
            resolve({
                type: "exec_response",
                stdout,
                stderr,
                exitCode: code || 0
            });
        });

        proc.on("error", (error: Error) => {
            resolve({
                type: "exec_response",
                stdout: "",
                stderr: error.message,
                exitCode: 1
            });
        });
    });
}

function requestCwd(cwd: string | undefined, context: HandlerContext): string {
    return cwd || context.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
}

/** ↑/↓ and Ctrl+R: the prompts typed in this project, shared with the CLI */
export async function handleGetPromptHistory(
    request: GetPromptHistoryRequest,
    context: HandlerContext
): Promise<GetPromptHistoryResponse> {
    return {
        type: "get_prompt_history_response",
        entries: await readPromptHistory(requestCwd(request.cwd, context))
    };
}

export async function handleAddPromptHistory(
    request: AddPromptHistoryRequest,
    context: HandlerContext
): Promise<AddPromptHistoryResponse> {
    try {
        await appendPromptHistory(request.display, requestCwd(request.cwd, context), request.sessionId);
    } catch (error) {
        context.logService.warn(`[handleAddPromptHistory] ${error instanceof Error ? error.message : String(error)}`);
    }
    return { type: "add_prompt_history_response" };
}

/** `!command` (bash mode); Esc cancels the request, which stops the command */
export async function handleRunShellCommand(
    request: RunShellCommandRequest,
    context: HandlerContext,
    signal?: AbortSignal
): Promise<RunShellCommandResponse> {
    return runShellCommand(request.command, requestCwd(request.cwd, context), signal);
}

export async function handleGetRewindPoint(
    request: GetRewindPointRequest,
    context: HandlerContext
): Promise<GetRewindPointResponse> {
    const point = await context.sessionService.getRewindPoint(
        request.sessionId,
        request.userMessageId,
        requestCwd(request.cwd, context)
    );
    return { type: "get_rewind_point_response", ...point };
}

/**
 * List files
 */
export async function handleListFiles(
    request: ListFilesRequest,
    context: HandlerContext
): Promise<ListFilesResponse> {
    const { workspaceService, fileSystemService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    return {
        type: "list_files_response",
        files: await fileSystemService.findFiles(request.pattern, cwd)
    };
}

/**
 * Stat path types (file / directory / other)
 */
export async function handleStatPath(
    request: StatPathRequest,
    context: HandlerContext
): Promise<StatPathResponse> {
    const { workspaceService, fileSystemService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const paths = Array.isArray(request.paths) ? request.paths : [];

    const entries: StatPathResponse["entries"] = [];

    for (const raw of paths) {
        if (!raw || typeof raw !== "string") {
            continue;
        }

        const absolute = fileSystemService.normalizeAbsolutePath(raw, cwd);

        try {
            const stat = await fs.promises.stat(absolute);
            let type: StatPathResponse["entries"][number]["type"] = "other";

            if (stat.isFile()) type = "file";
            else if (stat.isDirectory()) type = "directory";

            entries.push({ path: raw, type });
        } catch {
            entries.push({ path: raw, type: "not_found" });
        }
    }

    return {
        type: "stat_path_response",
        entries
    };
}

/**
 * Open content (edit via a temporary file)
 */
export async function handleOpenContent(
    request: OpenContentRequest,
    context: HandlerContext,
    signal: AbortSignal
): Promise<OpenContentResponse> {
    const { logService, fileSystemService } = context;
    const { content, fileName, editable } = request;

    logService.info(`Opening content as: ${fileName} (editable: ${editable})`);

    if (!editable) {
        const document = await vscode.workspace.openTextDocument({
            content,
            language: detectLanguage(fileName)
        });
        await vscode.window.showTextDocument(document, { preview: true });

        return {
            type: "open_content_response"
        };
    }

    const tempPath = await fileSystemService.createTempFile(fileName || "claude.txt", content);
    const tempUri = vscode.Uri.file(tempPath);
    const document = await vscode.workspace.openTextDocument(tempUri);
    await vscode.window.showTextDocument(document, { preview: false });

    const updatedContent = await waitForDocumentEdits(document, signal);

    return {
        type: "open_content_response",
        updatedContent
    };
}

/**
 * Open a URL
 */
export async function handleOpenURL(
    request: OpenURLRequest,
    context: HandlerContext
): Promise<OpenURLResponse> {
    const { url } = request;

    try {
        await vscode.env.openExternal(vscode.Uri.parse(url));
        return { type: "open_url_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to open URL: ${errorMsg}`);
    }
}

// ============================================================================
// `/permissions`, `/add-dir`, `/plugin`, `/release-notes`, `/login`, `/logout`
// ============================================================================

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** `/permissions`: allow / ask / deny rules and extra directories of every settings file */
export async function handleGetPermissions(
    _request: GetPermissionsRequest,
    context: HandlerContext
): Promise<GetPermissionsResponse> {
    const cwd = workspaceCwd(context);
    const { entries, errors } = readPermissions(cwd);
    return { type: "get_permissions_response", entries, cwd, errors };
}

/** Add or remove one rule / directory; the CLI picks the settings change up itself */
export async function handleUpdatePermission(
    request: UpdatePermissionRequest,
    context: HandlerContext
): Promise<UpdatePermissionResponse> {
    const value = request.value.trim();
    if (!value) {
        return { type: "update_permission_response", error: 'Empty value' };
    }
    try {
        updatePermissionList(workspaceCwd(context), request.source, request.list, request.action, value);
        return { type: "update_permission_response" };
    } catch (error) {
        context.logService.warn(`[updatePermission] ${request.action} ${request.list} ${value}: ${errorText(error)}`);
        return { type: "update_permission_response", error: errorText(error) };
    }
}

/** `/add-dir [path]`: absolute folder for a typed path, or one picked in a dialog */
export async function handleResolveDirectory(
    request: ResolveDirectoryRequest,
    context: HandlerContext
): Promise<ResolveDirectoryResponse> {
    const cwd = workspaceCwd(context);
    let target = request.path?.trim();
    if (!target) {
        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(path.dirname(cwd)),
            openLabel: 'Add directory'
        });
        if (!picked?.length) {
            return { type: "resolve_directory_response", cancelled: true };
        }
        target = picked[0].fsPath;
    }
    if (target === '~' || target.startsWith('~/') || target.startsWith('~\\')) {
        target = path.join(os.homedir(), target.slice(1));
    }
    // The CLI wants normalized absolute paths without a trailing separator
    const resolved = path.resolve(cwd, target);
    try {
        if (!fs.statSync(resolved).isDirectory()) {
            return { type: "resolve_directory_response", error: `${resolved} is not a directory` };
        }
    } catch {
        return { type: "resolve_directory_response", error: `${resolved} does not exist` };
    }
    return { type: "resolve_directory_response", path: resolved };
}

/** `/plugin`: installed plugins (`claude plugin list --json`) */
export async function handleGetPlugins(
    _request: GetPluginsRequest,
    context: HandlerContext
): Promise<GetPluginsResponse> {
    try {
        const cli = await context.sdkService.getCliInvocation();
        return { type: "get_plugins_response", plugins: await listPlugins(cli, workspaceCwd(context)) };
    } catch (error) {
        context.logService.warn(`[getPlugins] ${errorText(error)}`);
        return { type: "get_plugins_response", plugins: [], error: errorText(error) };
    }
}

/**
 * `claude plugin enable|disable|install|uninstall`, then every open session
 * reloads its plugins. An install that would run a command of the marketplace
 * comes back with `confirm`; it is run again with `--accept-command <sha256>`
 * only once the user approved that exact command (never `-y`).
 */
export async function handlePluginAction(
    request: PluginActionRequest,
    context: HandlerContext
): Promise<PluginActionResponse> {
    try {
        const cli = await context.sdkService.getCliInvocation();
        const args = ['plugin', request.action, request.pluginId];
        if (request.scope) {
            args.push('--scope', request.scope);
        }
        if (request.action === 'install' && request.acceptCommand) {
            args.push('--accept-command', request.acceptCommand);
        }
        // Installing clones or downloads the plugin
        const timeout = request.action === 'install' ? 5 * 60_000 : 60_000;
        const result = await runPluginCommand(cli, args, workspaceCwd(context), timeout);
        if (!result.ok) {
            return { type: "plugin_action_response", error: result.error, confirm: result.confirm };
        }
        await context.agentService.reloadPlugins();
        return { type: "plugin_action_response", message: result.message };
    } catch (error) {
        context.logService.warn(`[pluginAction] ${request.action} ${request.pluginId}: ${errorText(error)}`);
        return { type: "plugin_action_response", error: errorText(error) };
    }
}

/** Plugins of the marketplaces, kept between reads: listing them takes seconds */
let availablePluginsCache: AvailablePluginEntry[] | undefined;

export async function handleGetAvailablePlugins(
    request: GetAvailablePluginsRequest,
    context: HandlerContext
): Promise<GetAvailablePluginsResponse> {
    try {
        if (!availablePluginsCache || request.refresh) {
            const cli = await context.sdkService.getCliInvocation();
            availablePluginsCache = await listAvailablePlugins(cli, workspaceCwd(context));
        }
        return { type: "get_available_plugins_response", plugins: availablePluginsCache };
    } catch (error) {
        context.logService.warn(`[getAvailablePlugins] ${errorText(error)}`);
        return { type: "get_available_plugins_response", plugins: [], error: errorText(error) };
    }
}

export async function handleGetMarketplaces(
    _request: GetMarketplacesRequest,
    context: HandlerContext
): Promise<GetMarketplacesResponse> {
    try {
        const cli = await context.sdkService.getCliInvocation();
        return { type: "get_marketplaces_response", marketplaces: await listMarketplaces(cli, workspaceCwd(context)) };
    } catch (error) {
        context.logService.warn(`[getMarketplaces] ${errorText(error)}`);
        return { type: "get_marketplaces_response", marketplaces: [], error: errorText(error) };
    }
}

/** `claude plugin marketplace add|remove|update`; the plugin list is read again afterwards */
export async function handleMarketplaceAction(
    request: MarketplaceActionRequest,
    context: HandlerContext
): Promise<MarketplaceActionResponse> {
    const target = request.target.trim();
    if (!target) {
        return { type: "marketplace_action_response", error: 'Empty marketplace' };
    }
    try {
        const cli = await context.sdkService.getCliInvocation();
        // `add` and `update` fetch the marketplace (git clone / download)
        const result = await runPluginCommand(cli, ['plugin', 'marketplace', request.action, target], workspaceCwd(context), 5 * 60_000);
        availablePluginsCache = undefined;
        if (!result.ok) {
            return { type: "marketplace_action_response", error: result.error };
        }
        return { type: "marketplace_action_response", message: result.message };
    } catch (error) {
        context.logService.warn(`[marketplaceAction] ${request.action} ${target}: ${errorText(error)}`);
        return { type: "marketplace_action_response", error: errorText(error) };
    }
}

const CHANGELOG_URL = 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md';

/** `/release-notes`: the changelog the CLI caches, else the one on GitHub */
export async function handleOpenReleaseNotes(
    _request: OpenReleaseNotesRequest,
    context: HandlerContext
): Promise<OpenReleaseNotesResponse> {
    try {
        const file = changelogFile();
        if (fs.existsSync(file)) {
            await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(file));
        } else {
            await vscode.env.openExternal(vscode.Uri.parse(CHANGELOG_URL));
        }
        return { type: "open_release_notes_response" };
    } catch (error) {
        context.logService.warn(`[openReleaseNotes] ${errorText(error)}`);
        return { type: "open_release_notes_response", error: errorText(error) };
    }
}

/** `claude auth status --json` */
export async function handleGetAuthStatus(
    _request: GetAuthStatusRequest,
    context: HandlerContext
): Promise<GetAuthStatusResponse> {
    try {
        const cli = await context.sdkService.getCliInvocation();
        return { type: "get_auth_status_response", status: await readAuthStatus(cli, workspaceCwd(context)) };
    } catch (error) {
        context.logService.warn(`[getAuthStatus] ${errorText(error)}`);
        return { type: "get_auth_status_response", error: errorText(error) };
    }
}

/** Running `claude auth login` processes, by id (one per `/login` panel) */
const loginProcesses = new Map<string, { process: LoginProcess; url?: string }>();

/** Once the credentials changed, every session restarts on its next message */
async function afterCredentialChange(context: HandlerContext): Promise<void> {
    await context.agentService.closeAllChannelsWithCredentialChange();
}

export async function handleAuthLogin(
    request: AuthLoginRequest,
    context: HandlerContext
): Promise<AuthLoginResponse> {
    try {
        const cli = await context.sdkService.getCliInvocation();
        const email = request.email?.trim() || undefined;
        const login = new LoginProcess(cli, request.method, email, workspaceCwd(context));
        const loginId = Math.random().toString(36).slice(2);
        loginProcesses.set(loginId, { process: login });
        void login.wait().then(async (result) => {
            // Kept a while so the panel's `wait` still finds the result
            setTimeout(() => loginProcesses.delete(loginId), 60_000);
            context.logService.info(`[authLogin] ended: ${result.ok ? 'ok' : result.error}`);
            if (result.ok) {
                await afterCredentialChange(context);
            }
        });
        const url = await login.waitForUrl(30_000);
        loginProcesses.get(loginId)!.url = url;
        return { type: "auth_login_response", loginId, url, result: login.result };
    } catch (error) {
        context.logService.warn(`[authLogin] ${errorText(error)}`);
        return { type: "auth_login_response", error: errorText(error) };
    }
}

export async function handleAuthLoginAction(
    request: AuthLoginActionRequest,
    context: HandlerContext
): Promise<AuthLoginActionResponse> {
    const entry = loginProcesses.get(request.loginId);
    if (!entry) {
        return { type: "auth_login_action_response", error: 'The sign-in has ended' };
    }
    const login = entry.process;
    switch (request.action) {
        case 'wait':
            return { type: "auth_login_action_response", result: await login.wait() };
        case 'code':
            login.submitCode(request.code ?? '');
            return { type: "auth_login_action_response" };
        case 'cancel':
            login.cancel();
            loginProcesses.delete(request.loginId);
            return { type: "auth_login_action_response" };
        case 'open_url':
            if (entry.url) {
                await vscode.env.openExternal(vscode.Uri.parse(entry.url, true));
            }
            return { type: "auth_login_action_response" };
    }
    context.logService.warn(`[authLoginAction] unknown action ${(request as any).action}`);
    return { type: "auth_login_action_response", error: 'Unknown action' };
}

export async function handleAuthLogout(
    _request: AuthLogoutRequest,
    context: HandlerContext
): Promise<AuthLogoutResponse> {
    try {
        const cli = await context.sdkService.getCliInvocation();
        const result = await runClaudeCli(cli, ['auth', 'logout'], workspaceCwd(context));
        if (result.code !== 0) {
            return { type: "auth_logout_response", error: cliError(result) };
        }
        await afterCredentialChange(context);
        return { type: "auth_logout_response" };
    } catch (error) {
        context.logService.warn(`[authLogout] ${errorText(error)}`);
        return { type: "auth_logout_response", error: errorText(error) };
    }
}

/**
 * Open a config file
 */
export async function handleOpenConfigFile(
    request: OpenConfigFileRequest,
    context: HandlerContext
): Promise<OpenConfigFileResponse> {
    const { configType } = request;

    try {
        // VS Code settings
        if (configType === "vscode") {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'uic');
        }
        // User config file
        else {
            const configPath = getConfigFilePath(configType);
            const uri = vscode.Uri.file(configPath);
            await vscode.window.showTextDocument(uri);
        }

        return { type: "open_config_file_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to open config file: ${errorMsg}`);
    }
}

function workspaceCwd(context: HandlerContext): string {
    return context.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
}

/** `/memory`: project, local and user CLAUDE.md */
export async function handleGetMemoryFiles(
    _request: GetMemoryFilesRequest,
    context: HandlerContext
): Promise<GetMemoryFilesResponse> {
    return { type: "get_memory_files_response", files: memoryFiles(workspaceCwd(context)) };
}

/** Open a memory/settings file by kind; `create` makes a missing (memory) file first */
export async function handleOpenClaudeFile(
    request: OpenClaudeFileRequest,
    context: HandlerContext
): Promise<OpenClaudeFileResponse> {
    try {
        const file = resolveClaudeFile(request.kind, workspaceCwd(context));
        if (request.create) {
            ensureClaudeFile(file);
        } else if (!fs.existsSync(file)) {
            return { type: "open_claude_file_response", error: `${file} does not exist` };
        }
        await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false });
        return { type: "open_claude_file_response" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logService.warn(`[openClaudeFile] ${request.kind}: ${message}`);
        return { type: "open_claude_file_response", error: message };
    }
}

/** `/hooks`: hooks of the user, project and local settings files (read-only) */
export async function handleGetHooks(
    _request: GetHooksRequest,
    context: HandlerContext
): Promise<GetHooksResponse> {
    const { hooks, errors } = readHooks(workspaceCwd(context));
    return { type: "get_hooks_response", hooks, errors };
}

/** `/export`: save the transcript through a save dialog, or copy it */
export async function handleExportConversation(
    request: ExportConversationRequest,
    context: HandlerContext
): Promise<ExportConversationResponse> {
    if (request.target === 'clipboard') {
        await vscode.env.clipboard.writeText(request.markdown);
        return { type: "export_conversation_response" };
    }
    const safeName = (request.fileName || 'conversation.md').replace(/[\\/:*?"<>|]+/g, '-');
    const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(workspaceCwd(context), safeName)),
        filters: { Markdown: ['md'], Text: ['txt'] },
        saveLabel: 'Export'
    });
    if (!target) {
        return { type: "export_conversation_response", cancelled: true };
    }
    await vscode.workspace.fs.writeFile(target, Buffer.from(request.markdown, 'utf8'));
    return { type: "export_conversation_response", path: target.fsPath };
}

/**
 * Open Claude in a terminal
 */
export async function handleOpenClaudeInTerminal(
    _request: OpenClaudeInTerminalRequest,
    context: HandlerContext
): Promise<OpenClaudeInTerminalResponse> {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    try {
        const terminal = vscode.window.createTerminal({
            name: "Claude Code",
            cwd
        });

        terminal.show();
        terminal.sendText("claude --help");

        return { type: "open_claude_in_terminal_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to open terminal: ${errorMsg}`);
    }
}

// ============================================================================
// Configuration and state management
// ============================================================================

/**
 * Where a `/` command comes from, shown next to it in the suggestions like the
 * CLI does. The SDK only marks Claude Code's own commands (`builtin`); a
 * plugin's command carries a `plugin:name` alias; the rest are found on disk
 * (`.claude/skills/<name>/` or `.claude/commands/<a>/<b>.md` for `a:b`).
 */
function withCommandSource(commands: any[], cwd: string): any[] {
    const userDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const projectDir = path.join(cwd, '.claude');
    const definedIn = (dir: string, name: string) =>
        fs.existsSync(path.join(dir, 'skills', name, 'SKILL.md'))
        || fs.existsSync(path.join(dir, 'commands', ...name.split(':')) + '.md');

    return commands.map((cmd) => {
        if (!cmd || typeof cmd.name !== 'string' || cmd.builtin) return cmd;
        let source: string | undefined;
        const pluginAlias = (Array.isArray(cmd.aliases) ? cmd.aliases : [])
            .find((alias: unknown) => typeof alias === 'string' && alias.endsWith(`:${cmd.name}`));
        if (pluginAlias) {
            source = pluginAlias.slice(0, -(cmd.name.length + 1));
        } else if (projectDir !== userDir && definedIn(projectDir, cmd.name)) {
            source = 'project';
        } else if (definedIn(userDir, cmd.name)) {
            source = 'user';
        } else if (cmd.name.includes(':')) {
            source = cmd.name.split(':')[0];
        }
        return source ? { ...cmd, source } : cmd;
    });
}

/**
 * Load the config cache
 */
async function loadConfig(context: HandlerContext): Promise<any> {
    const { logService, sdkService, workspaceService } = context;

    logService.info("Loading config cache by launching Claude...");

    const inputStream = new AsyncStream<SDKUserMessage>();
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    const query = await sdkService.query({
        inputStream,
        resume: null,
        canUseTool: async () => ({
            behavior: "deny" as const,
            message: "Config loading only"
        }),
        model: "default",
        cwd,
        permissionMode: "default"
    });

    inputStream.done();

    const commands = await (query as any).supportedCommands?.() || [];
    const config = {
        slashCommands: withCommandSource(commands, cwd),
        models: await (query as any).supportedModels?.() || [],
        accountInfo: await (query as any).accountInfo?.() || null
    };

    logService.info(`  - Config: [${JSON.stringify(config)}]`);
    await query.return?.();

    return config;
}

/**
 * Get asset URIs
 */
function getAssetUris(_context: HandlerContext): Record<string, { light: string; dark: string }> {
    // Upstream pointed at resources/clawd.svg and welcome-art-*.svg (Anthropic artwork),
    // which are not shipped; the webview falls back to no artwork.
    return {};
}

// ============================================================================
// Helper methods
// ============================================================================

async function prepareDiffRightFile(
    originalPath: string,
    fallbackPath: string | undefined,
    edits: OpenDiffRequest["edits"],
    context: HandlerContext
): Promise<string> {
    let baseContent = "";

    if (await context.fileSystemService.pathExists(originalPath)) {
        baseContent = await fs.promises.readFile(originalPath, "utf8");
    } else if (fallbackPath && await context.fileSystemService.pathExists(fallbackPath)) {
        baseContent = await fs.promises.readFile(fallbackPath, "utf8");
    }

    let modified = baseContent;

    for (const edit of edits) {
        const oldString = edit.oldString ?? "";
        const newString = edit.newString ?? "";

        if (!oldString) {
            modified += newString;
            continue;
        }

        if (edit.replaceAll) {
            modified = modified.split(oldString).join(newString);
        } else {
            const index = modified.indexOf(oldString);
            if (index >= 0) {
                modified = `${modified.slice(0, index)}${newString}${modified.slice(index + oldString.length)}`;
            } else {
                modified += newString;
            }
        }
    }

    const baseName = path.basename(fallbackPath || originalPath || "claude.diff");
    const outputName = baseName.endsWith(".claude") ? baseName : `${baseName}.claude`;

    return context.fileSystemService.createTempFile(outputName, modified);
}

async function waitForDocumentEdits(
    document: vscode.TextDocument,
    signal: AbortSignal
): Promise<string> {
    let currentText = document.getText();
    let resolved = false;

    return new Promise<string>((resolve) => {
        const disposables: vscode.Disposable[] = [];

        const cleanup = () => {
            if (!resolved) {
                resolved = true;
                disposables.forEach(d => d.dispose());
            }
        };

        disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.uri.toString() === document.uri.toString()) {
                    currentText = event.document.getText();
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidSaveTextDocument(event => {
                if (event.uri.toString() === document.uri.toString()) {
                    currentText = event.getText();
                    cleanup();
                    resolve(currentText);
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidCloseTextDocument(event => {
                if (event.uri.toString() === document.uri.toString()) {
                    cleanup();
                    resolve(currentText);
                }
            })
        );

        if (signal.aborted) {
            cleanup();
            resolve(currentText);
            return;
        }

        signal.addEventListener("abort", () => {
            cleanup();
            resolve(currentText);
        }, { once: true });
    });
}

function detectLanguage(fileName?: string): string {
    if (!fileName) {
        return "plaintext";
    }

    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
        case ".ts":
        case ".tsx":
            return "typescript";
        case ".js":
        case ".jsx":
            return "javascript";
        case ".json":
            return "json";
        case ".py":
            return "python";
        case ".java":
            return "java";
        case ".go":
            return "go";
        case ".rs":
            return "rust";
        case ".md":
            return "markdown";
        case ".sh":
            return "shellscript";
        case ".css":
            return "css";
        case ".html":
        case ".htm":
            return "html";
        default:
            return "plaintext";
    }
}

function getConfigFilePath(configType: string): string {
    const homeDir = os.homedir();

    switch (configType) {
        case "settings":
            return path.join(homeDir, ".claude", "settings.json");
        case "config":
            return path.join(homeDir, ".claude", "config.json");
        case "mcp-global":
            // Global MCP servers: ~/.claude.json (home directory root, NOT inside .claude/)
            return path.join(homeDir, ".claude.json");
        case "mcp-project": {
            // Project MCP servers: .mcp.json in workspace root
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                throw new Error("No workspace folder open");
            }
            return path.join(workspaceRoot, ".mcp.json");
        }
        default:
            return path.join(homeDir, ".claude", `${configType}.json`);
    }
}
