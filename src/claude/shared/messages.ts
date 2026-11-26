/**
 * Shared message type definitions
 *
 * Two-way protocol: Extension ↔ WebView
 */

// SDK type imports
import type {
    SDKMessage,
    SDKUserMessage,
    PermissionResult,
    PermissionUpdate,
    PermissionMode
} from '@anthropic-ai/claude-agent-sdk';

// ============================================================================
// Base message types
// ============================================================================

/**
 * Message base type
 */
export interface BaseMessage {
    type: string;
    // Optional WebView instance id, used to route responses to the right target
    webviewId?: string;
}

// ============================================================================
// WebView → Extension messages
// ============================================================================

/**
 * Launch a Claude session
 */
export interface LaunchClaudeMessage extends BaseMessage {
    type: "launch_claude";
    channelId: string;
    resume?: string | null;        // session ID to resume
    cwd?: string;                  // working directory
    model?: string | null;         // model name
    permissionMode?: PermissionMode; // permission mode
    thinkingLevel?: string | null; // Thinking level (off | default_on)
    effortLevel?: string | null;   // Effort level reported by the CLI for the model; null/"auto" = CLI default
    additionalDirectories?: string[]; // `/add-dir` for this session only (absolute paths)
    /** Rewind: resume only up to this transcript entry (with `resume`) */
    resumeSessionAt?: string;
    /** Resume into a new session (a copy), leaving `resume` to the tab already on it */
    forkSession?: boolean;
}

/**
 * Input/output message (bidirectional)
 */
export interface IOMessage extends BaseMessage {
    type: "io_message";
    channelId: string;
    message: SDKMessage | SDKUserMessage;  // SDK message type
    done: boolean;                         // whether this is the last item of the stream
}

/**
 * Interrupt Claude
 */
export interface InterruptClaudeMessage extends BaseMessage {
    type: "interrupt_claude";
    channelId: string;
}

/**
 * Close a session (bidirectional)
 */
export interface CloseChannelMessage extends BaseMessage {
    type: "close_channel";
    channelId: string;
    error?: string;
}

/**
 * SDK error notification (Extension → WebView)
 *
 * When SDK stderr shows a fatal error (e.g. the streaming request fallback failed),
 * it is pushed to the frontend in real time so it shows immediately, without waiting for the iterator to time out.
 */
export interface LLMRequestErrorMessage extends BaseMessage {
    type: "sdk_error";
    channelId: string;
    /** Human-readable error description (from upstream) */
    error: string;
    /** HTTP status code (e.g. "401", "503") */
    statusCode: string;
    /** Upstream error type (e.g. "authentication_error", "new_api_error") */
    errorType: string;
}

// ============================================================================
// Request-response messages (bidirectional)
// ============================================================================

/**
 * Request message
 */
export interface RequestMessage<T = any> extends BaseMessage {
    type: "request";
    channelId?: string;
    requestId: string;
    request: T;
}

/**
 * Response message
 */
export interface ResponseMessage<T = any> extends BaseMessage {
    type: "response";
    requestId: string;
    response: T | ErrorResponse;
}

/**
 * Error response
 */
export interface ErrorResponse {
    type: "error";
    error: string;
}

/**
 * Cancel request
 */
export interface CancelRequestMessage extends BaseMessage {
    type: "cancel_request";
    targetRequestId: string;
}

// ============================================================================
// WebView → Extension request types
// ============================================================================

/**
 * Init request
 */
export interface InitRequest {
    type: "init";
}

export interface InitResponse {
    type: "init_response";
    state: {
        defaultCwd: string;
        // authStatus: null | { authenticated: boolean };
        modelSetting: string;
        platform: string;
        thinkingLevel?: string;        // Thinking level (off | default_on)
        allowBypassPermissions?: boolean; // ai-cli-diff-view.claudeAllowBypassPermissions
    };
}

/**
 * Open file request
 */
export interface OpenFileRequest {
    type: "open_file";
    filePath: string;
    location?: {
        startLine?: number;
        endLine?: number;
        startColumn?: number;
        endColumn?: number;
    };
}

export interface OpenFileResponse {
    type: "open_file_response";
}

/**
 * Open diff request
 */
export interface OpenDiffRequest {
    type: "open_diff";
    originalFilePath: string;
    newFilePath: string;
    edits: Array<{
        oldString: string;
        newString: string;
        replaceAll?: boolean;
    }>;
    supportMultiEdits: boolean;
}

export interface OpenDiffResponse {
    type: "open_diff_response";
    newEdits: Array<{
        oldString: string;
        newString: string;
        replaceAll?: boolean;
    }>;
}

/**
 * Set the permission mode
 */
export interface SetPermissionModeRequest {
    type: "set_permission_mode";
    mode: PermissionMode;
}

export interface SetPermissionModeResponse {
    type: "set_permission_mode_response";
    success: boolean;
}

/**
 * Model option
 */
export interface ModelOption {
    value: string;
    label?: string;
    description?: string;
    provider?: string;
}

/**
 * Set the model
 */
export interface SetModelRequest {
    type: "set_model";
    model: ModelOption;
}

export interface SetModelResponse {
    type: "set_model_response";
    success: boolean;
}

/**
 * Set the Thinking Level
 */
export interface SetThinkingLevelRequest {
    type: "set_thinking_level";
    channelId: string;
    thinkingLevel: string;  // "off" | "default_on"
}

export interface SetThinkingLevelResponse {
    type: "set_thinking_level_response";
}

/**
 * Set the effort level (any level the CLI lists in ModelInfo.supportedEffortLevels;
 * null or "auto" goes back to the model's default)
 */
export interface SetEffortLevelRequest {
    type: "set_effort_level";
    channelId: string;
    effortLevel: string | null;
    /**
     * Also save it as the default for the session's current model in
     * ~/.claude/settings.json, as the CLI's /effort menu does on Enter.
     * Ignored for "auto"/null (the CLI cannot delete the key) and "max"
     * (session-only by design).
     */
    persist?: boolean;
}

export interface SetEffortLevelResponse {
    type: "set_effort_level_response";
}

/**
 * Get the Claude state
 */
export interface GetClaudeStateRequest {
    type: "get_claude_state";
}

export interface GetClaudeStateResponse {
    type: "get_claude_state_response";
    config: any;
}

/**
 * One-off SDK probe
 */
export type SdkProbeCapability =
    | "supportedCommands"
    | "supportedModels"
    | "mcpServerStatus"
    | "accountInfo"
    | (string & {});

export interface SdkProbeRequest {
    type: "sdk_probe";
    capabilities: SdkProbeCapability[];
    timeoutMs?: number;
}

export interface SdkProbeResponse {
    type: "sdk_probe_response";
    data: Record<string, any>;
    errors?: Record<string, string>;
}

/**
 * Get MCP servers
 */
export interface GetMcpServersRequest {
    type: "get_mcp_servers";
}

export interface McpServerInfo {
    name: string;
    /** connected | failed | needs-auth | pending | disabled */
    status: string;
    error?: string;
    /** Config scope (user, project, local, claudeai, …) */
    scope?: string;
    toolCount?: number;
}

export interface GetMcpServersResponse {
    type: "get_mcp_servers_response";
    mcpServers: McpServerInfo[];
}

/**
 * `/mcp reconnect|enable|disable <server>` done through the SDK's control
 * requests, so the chat does not get a command message per click.
 */
export interface McpServerActionRequest {
    type: "mcp_server_action";
    action: "reconnect" | "enable" | "disable";
    serverName: string;
}

export interface McpServerActionResponse {
    type: "mcp_server_action_response";
    ok: boolean;
    error?: string;
}

/**
 * Settings the CLI's `/config key=value` accepts, parsed from the usage text a
 * bare `/config` prints (so new keys need no change here), for the `/config`
 * panel. `values` null = free text (`language=<value>`).
 * `current` holds what could be read back: only keys that keep the same name
 * in the effective settings (`theme`, `model`, …); the CLI has no way to print
 * the others.
 */
export interface ConfigOption {
    key: string;
    values: string[] | null;
}

export interface GetConfigOptionsRequest {
    type: "get_config_options";
}

export interface GetConfigOptionsResponse {
    type: "get_config_options_response";
    options: ConfigOption[];
    current: Record<string, string>;
    /** Set when the list could not be read */
    error?: string;
}

/**
 * Output styles the CLI offers (`initializationResult()`), for the
 * `/output-style` picker. `current` is the style of the running session.
 */
export interface GetOutputStylesRequest {
    type: "get_output_styles";
}

export interface GetOutputStylesResponse {
    type: "get_output_styles_response";
    current?: string;
    available: string[];
}

/**
 * Files the UI-side commands (`/memory`, `/hooks`) show and open. The webview
 * names a file by kind; the host resolves the path, so a webview message can
 * never open or create an arbitrary file.
 */
export type ClaudeFileKind =
    | "user-memory"
    | "project-memory"
    | "local-memory"
    | "user-settings"
    | "project-settings"
    | "local-settings";

export interface ClaudeFileInfo {
    kind: ClaudeFileKind;
    path: string;
    exists: boolean;
}

/**
 * `/status`: what the CLI reports about the running session. Fields from the
 * last system/init are missing until the CLI has started a turn.
 */
export interface GetStatusRequest {
    type: "get_status";
}

export interface StatusInfo {
    version?: string;
    cwd: string;
    model?: string;
    permissionMode?: string;
    outputStyle?: string;
    apiKeySource?: string;
    account?: {
        email?: string;
        organization?: string;
        subscriptionType?: string;
        tokenSource?: string;
        apiKeySource?: string;
        apiProvider?: string;
    };
    mcpServers: McpServerInfo[];
    plugins: { name: string; version?: string }[];
    /** Settings files the CLI reads, in order of precedence (lowest first) */
    settingsFiles: ClaudeFileInfo[];
    /** CLAUDE.md files that exist */
    memoryFiles: ClaudeFileInfo[];
}

export interface GetStatusResponse {
    type: "get_status_response";
    status: StatusInfo;
}

/** `/memory`: the CLAUDE.md files of the CLI's memory, existing or not */
export interface GetMemoryFilesRequest {
    type: "get_memory_files";
}

export interface GetMemoryFilesResponse {
    type: "get_memory_files_response";
    files: ClaudeFileInfo[];
}

/** Open a memory or settings file in the editor; `create` makes a missing one */
export interface OpenClaudeFileRequest {
    type: "open_claude_file";
    kind: ClaudeFileKind;
    create?: boolean;
}

export interface OpenClaudeFileResponse {
    type: "open_claude_file_response";
    error?: string;
}

/** `/hooks`: one command (or prompt) hook from a settings file */
export interface HookEntry {
    event: string;
    matcher?: string;
    /** `command` text, or the prompt of a `prompt` hook */
    command: string;
    hookType: string;
    source: ClaudeFileKind;
}

export interface GetHooksRequest {
    type: "get_hooks";
}

export interface GetHooksResponse {
    type: "get_hooks_response";
    hooks: HookEntry[];
    /** Settings files that could not be parsed */
    errors: { source: ClaudeFileKind; error: string }[];
}

/** `/export`: the transcript as markdown, to a file (save dialog) or the clipboard */
export interface ExportConversationRequest {
    type: "export_conversation";
    markdown: string;
    target: "file" | "clipboard";
    fileName: string;
}

export interface ExportConversationResponse {
    type: "export_conversation_response";
    /** Where the file was written; absent for the clipboard or a cancelled dialog */
    path?: string;
    cancelled?: boolean;
}

/** The settings files a UI command can change */
export type SettingsFileKind = "user-settings" | "project-settings" | "local-settings";

/** `permissions.<list>` in a settings file */
export type PermissionListName = "allow" | "ask" | "deny" | "additionalDirectories";

/** `/permissions`: one rule (or directory) of one settings file */
export interface PermissionEntry {
    list: PermissionListName;
    value: string;
    source: SettingsFileKind;
}

export interface GetPermissionsRequest {
    type: "get_permissions";
}

export interface GetPermissionsResponse {
    type: "get_permissions_response";
    entries: PermissionEntry[];
    /** The session's working folder (the CLI's first working directory) */
    cwd: string;
    errors: { source: ClaudeFileKind; error: string }[];
}

/** Add a rule / directory to a settings file, or remove it */
export interface UpdatePermissionRequest {
    type: "update_permission";
    list: PermissionListName;
    action: "add" | "remove";
    value: string;
    source: SettingsFileKind;
}

export interface UpdatePermissionResponse {
    type: "update_permission_response";
    error?: string;
}

/**
 * `/add-dir`: turn the typed path into an absolute folder (relative to the
 * workspace, `~` expanded); no path → a folder picker.
 */
export interface ResolveDirectoryRequest {
    type: "resolve_directory";
    path?: string;
}

export interface ResolveDirectoryResponse {
    type: "resolve_directory_response";
    path?: string;
    error?: string;
    cancelled?: boolean;
}

/** `/plugin`: one installed plugin (`claude plugin list --json`) */
export interface PluginEntry {
    /** `name@marketplace` */
    id: string;
    name: string;
    marketplace?: string;
    version?: string;
    scope?: string;
    description?: string;
    enabled: boolean;
}

export interface GetPluginsRequest {
    type: "get_plugins";
}

export interface GetPluginsResponse {
    type: "get_plugins_response";
    plugins: PluginEntry[];
    error?: string;
}

/** `/plugin` Discover: one plugin of a configured marketplace (`claude plugin list --available`) */
export interface AvailablePluginEntry {
    /** `name@marketplace` */
    id: string;
    name: string;
    marketplace?: string;
    description?: string;
    installCount?: number;
}

export interface GetAvailablePluginsRequest {
    type: "get_available_plugins";
    /** Read again instead of the copy kept since the last read */
    refresh?: boolean;
}

export interface GetAvailablePluginsResponse {
    type: "get_available_plugins_response";
    plugins: AvailablePluginEntry[];
    error?: string;
}

/**
 * `claude plugin enable|disable|install|uninstall <id>`, then every open
 * session reloads its plugins.
 */
export interface PluginActionRequest {
    type: "plugin_action";
    action: "enable" | "disable" | "install" | "uninstall";
    pluginId: string;
    scope?: string;
    /** `install`: sha256 of the marketplace-declared command the user approved */
    acceptCommand?: string;
}

/** A command the marketplace wants run to install the plugin, to be shown to the user first */
export interface PluginCommandConfirmation {
    command: string;
    sha256: string;
    archiveUrl?: string;
}

export interface PluginActionResponse {
    type: "plugin_action_response";
    error?: string;
    /** What the CLI said on success */
    message?: string;
    /** `install` stopped at a command that needs the user's approval */
    confirm?: PluginCommandConfirmation;
}

/** `/plugin` Marketplaces: `claude plugin marketplace list --json` */
export interface MarketplaceEntry {
    name: string;
    /** "github", "git", "url", "directory"... */
    source?: string;
    /** owner/repo, URL or path */
    location?: string;
}

export interface GetMarketplacesRequest {
    type: "get_marketplaces";
}

export interface GetMarketplacesResponse {
    type: "get_marketplaces_response";
    marketplaces: MarketplaceEntry[];
    error?: string;
}

/** `claude plugin marketplace add <source> | remove <name> | update <name>` */
export interface MarketplaceActionRequest {
    type: "marketplace_action";
    action: "add" | "remove" | "update";
    /** source for `add`, name otherwise */
    target: string;
}

export interface MarketplaceActionResponse {
    type: "marketplace_action_response";
    error?: string;
    message?: string;
}

/** `/release-notes`: the CLI's changelog in the markdown preview */
export interface OpenReleaseNotesRequest {
    type: "open_release_notes";
}

export interface OpenReleaseNotesResponse {
    type: "open_release_notes_response";
    error?: string;
}

/** `/login`, `/logout`: `claude auth status --json` */
export interface AuthStatusInfo {
    loggedIn: boolean;
    /** "claude.ai", "console", "api_key"... */
    authMethod?: string;
    apiProvider?: string;
    email?: string;
    orgName?: string;
    subscriptionType?: string;
    loginExpiresAt?: string;
    apiKeySource?: string;
}

export interface GetAuthStatusRequest {
    type: "get_auth_status";
}

export interface GetAuthStatusResponse {
    type: "get_auth_status_response";
    status?: AuthStatusInfo;
    error?: string;
}

/** `claude --version`, for the logo of an empty chat */
export interface GetCliVersionRequest {
    type: "get_cli_version";
}

export interface GetCliVersionResponse {
    type: "get_cli_version_response";
    version?: string;
}

export type AuthLoginMethod = "claudeai" | "console" | "sso";

/**
 * Start `claude auth login`. Answers once the CLI printed the sign-in URL (or
 * ended before that, with `result`).
 */
export interface AuthLoginRequest {
    type: "auth_login";
    method: AuthLoginMethod;
    email?: string;
}

export interface AuthLoginResponse {
    type: "auth_login_response";
    loginId?: string;
    url?: string;
    /** Set when the login already ended */
    result?: { ok: boolean; error?: string };
    error?: string;
}

/**
 * Follow-ups of a running login: `wait` answers when it ends, `code` passes
 * the code from the browser page, `cancel` stops it, `open_url` opens the
 * sign-in page in the browser.
 */
export interface AuthLoginActionRequest {
    type: "auth_login_action";
    loginId: string;
    action: "wait" | "code" | "cancel" | "open_url";
    code?: string;
}

export interface AuthLoginActionResponse {
    type: "auth_login_action_response";
    result?: { ok: boolean; error?: string };
    error?: string;
}

export interface AuthLogoutRequest {
    type: "auth_logout";
}

export interface AuthLogoutResponse {
    type: "auth_logout_response";
    error?: string;
}

/**
 * Context window usage as the CLI itself reports it (`/context`).
 * `usage` is null when the channel has no live query yet.
 */
export interface GetContextUsageRequest {
    type: "get_context_usage";
}

export interface GetContextUsageResponse {
    type: "get_context_usage_response";
    usage: {
        totalTokens: number;
        /** Effective window (what percentage is measured against) */
        maxTokens: number;
        /** Raw model window before the CLI's reserved buffers */
        rawMaxTokens: number;
        percentage: number;
        model: string;
        /**
         * How fast re-sending the context after its prompt cache expired uses
         * the 5-hour usage limit (the CLI's "Resume this conversation?" price).
         * Absent when the CLI would not ask: no subscription price, caching
         * off, or idle compaction already holds a summary.
         */
        coldResumeQuota?: ColdResumeQuota;
        /**
         * How long the CLI's cache keepalive renews a 5-minute cache after the
         * last activity: 0 = keepalive off, absent = unknown.
         */
        cacheKeepaliveWindowMs?: number;
    } | null;
}

export interface ColdResumeQuota {
    /** Percent of the 5-hour usage limit one million re-sent tokens use */
    percentPerMillionTokens: number;
    /** Smallest percent worth telling the user about */
    minPercent: number;
}

/**
 * Effort level the CLI will send with the next message (`getSettings().applied.effort`),
 * after `/effort`, org caps and model downgrades. `auto` reads back as the
 * model's default level, never as "auto".
 */
export interface GetAppliedEffortRequest {
    type: "get_applied_effort";
}

export interface GetAppliedEffortResponse {
    type: "get_applied_effort_response";
    /** null = no effort parameter sent; undefined = unknown (no channel / older CLI) */
    effort: string | null | undefined;
}

/**
 * Get asset URIs
 */
export interface GetAssetUrisRequest {
    type: "get_asset_uris";
}

export interface GetAssetUrisResponse {
    type: "asset_uris_response";
    assetUris: any;
}

/**
 * List sessions
 */
export interface ListSessionsRequest {
    type: "list_sessions_request";
}

export interface ListSessionsResponse {
    type: "list_sessions_response";
    sessions: Array<{
        id: string;
        lastModified: number;
        messageCount: number;
        summary: string;
        worktree?: string;
        isCurrentWorkspace: boolean;
    }>;
}

/**
 * Get session details
 */
export interface GetSessionRequest {
    type: "get_session_request";
    sessionId: string;
}

export interface GetSessionResponse {
    type: "get_session_response";
    messages: any[];
    /** What the conversation last ran with, so a resume continues the same way */
    settings?: SessionSettings;
}

/**
 * Model / effort / permission mode a conversation last used, read from its
 * transcript (the CLI records `requestedModel` and `effort` on each assistant
 * entry, `permissionMode` on each user entry). Any field may be missing.
 */
export interface SessionSettings {
    /** Model ID as requested (`claude-opus-5-5`), not the picker alias */
    model?: string;
    effort?: string;
    permissionMode?: string;
}

/**
 * Another Claude UI tab already showing this conversation (two CLI processes
 * must not write one session)
 */
export interface GetSessionOwnerRequest {
    type: "get_session_owner";
    sessionId: string;
}

export interface GetSessionOwnerResponse {
    type: "get_session_owner_response";
    /** Undefined when no other tab has it */
    owner?: { tabId: string; title: string };
}

/**
 * What a running conversation uses now (model / effort / mode). A mode switch
 * reaches the transcript only with the next prompt, so a tab rebuilt before
 * that (Agent mode toggle) would resume with stale values without this.
 */
export interface ReportSessionSettingsRequest {
    type: "report_session_settings";
    sessionId: string;
    settings: SessionSettings;
}

export interface ReportSessionSettingsResponse {
    type: "report_session_settings_response";
}

/** Bring another Claude UI tab to the front */
export interface FocusTabRequest {
    type: "focus_tab";
    tabId: string;
}

export interface FocusTabResponse {
    type: "focus_tab_response";
}

/**
 * Execute a command
 */
export interface ExecRequest {
    type: "exec";
    command: string;
    params: string[];
}

export interface ExecResponse {
    type: "exec_response";
    stdout: string;
    stderr: string;
    exitCode: number;
}

/**
 * Prompt history shared with the CLI (`~/.claude/history.jsonl`): the
 * prompts typed in this project, newest first, for ↑/↓ and Ctrl+R.
 */
export interface GetPromptHistoryRequest {
    type: "get_prompt_history";
    cwd?: string;
}

export interface PromptHistoryEntry {
    display: string;
    timestamp: number;
}

export interface GetPromptHistoryResponse {
    type: "get_prompt_history_response";
    entries: PromptHistoryEntry[];
}

/** Append a typed prompt to the CLI's history (as the CLI does on Enter) */
export interface AddPromptHistoryRequest {
    type: "add_prompt_history";
    display: string;
    cwd?: string;
    sessionId?: string;
}

export interface AddPromptHistoryResponse {
    type: "add_prompt_history_response";
}

/** `!command` (bash mode): run in the session's folder, output shown and kept for Claude */
export interface RunShellCommandRequest {
    type: "run_shell_command";
    command: string;
    cwd?: string;
}

export interface RunShellCommandResponse {
    type: "run_shell_command_response";
    stdout: string;
    stderr: string;
    exitCode: number | null;
    /** Stopped by Esc or the time limit */
    interrupted?: boolean;
}

/** Rewind code: restore the files Claude changed since a user message (`Query.rewindFiles`) */
export interface RewindFilesRequest {
    type: "rewind_files";
    userMessageId: string;
    dryRun?: boolean;
}

export interface RewindFilesResponse {
    type: "rewind_files_response";
    canRewind: boolean;
    error?: string;
    filesChanged?: string[];
    insertions?: number;
    deletions?: number;
}

/** Stop a background task (bash run in the background, background subagent): `Query.stopTask` */
export interface StopTaskRequest {
    type: "stop_task";
    taskId: string;
}

export interface StopTaskResponse {
    type: "stop_task_response";
    error?: string;
}

/** Take back a prompt sent mid-turn that the CLI has not folded in yet (Esc): `Query.cancelAsyncMessage` */
export interface CancelQueuedPromptRequest {
    type: "cancel_queued_prompt";
    uuid: string;
}

export interface CancelQueuedPromptResponse {
    type: "cancel_queued_prompt_response";
    /** False when the CLI already took it in (it then shows in the turn) */
    cancelled: boolean;
}

/**
 * Output so far of a background Bash task: the tail of the file the CLI
 * writes it to (`.../tasks/<id>.output`, named in the Bash tool result).
 */
export interface ReadTaskOutputRequest {
    type: "read_task_output";
    path: string;
    /** Most bytes returned, from the end of the file */
    maxBytes?: number;
}

export interface ReadTaskOutputResponse {
    type: "read_task_output_response";
    output?: string;
    /** The file is longer than what was returned */
    truncated?: boolean;
    error?: string;
}

/**
 * Rewind conversation: the transcript entry just before a user message, to
 * resume at (`resumeSessionAt`). null = it was the first message.
 */
export interface GetRewindPointRequest {
    type: "get_rewind_point";
    sessionId: string;
    userMessageId: string;
    cwd?: string;
}

export interface GetRewindPointResponse {
    type: "get_rewind_point_response";
    found: boolean;
    parentUuid: string | null;
}

/**
 * List files
 */
export interface ListFilesRequest {
    type: "list_files_request";
    pattern?: string;
}

export interface ListFilesResponse {
    type: "list_files_response";
    files: Array<{
        path: string;
        name: string;
        type: "file" | "directory";
    }>;
}

/**
 * Stat path types (file / directory)
 */
export interface StatPathRequest {
    type: "stat_path_request";
    /**
     * Array of paths, either workspace-relative or absolute
     */
    paths: string[];
}

export interface StatPathResponse {
    type: "stat_path_response";
    entries: Array<{
        path: string;
        /**
         * File type: file / directory / other / not_found
         */
        type: "file" | "directory" | "other" | "not_found";
    }>;
}

/**
 * Open content (temporary file)
 */
export interface OpenContentRequest {
    type: "open_content";
    content: string;
    fileName: string;
    editable: boolean;
}

export interface OpenContentResponse {
    type: "open_content_response";
    updatedContent?: string;
}

/**
 * Current selection
 */
export interface SelectionRange {
    filePath: string;
    startLine: number;
    endLine: number;
    startColumn?: number;
    endColumn?: number;
    selectedText: string;
}

export interface GetCurrentSelectionRequest {
    type: "get_current_selection";
}

export interface GetCurrentSelectionResponse {
    type: "get_current_selection_response";
    selection: SelectionRange | null;
}

/**
 * Open a URL
 */
export interface OpenURLRequest {
    type: "open_url";
    url: string;
}

export interface OpenURLResponse {
    type: "open_url_response";
}

/**
 * Show a notification
 */
export interface ShowNotificationRequest {
    type: "show_notification";
    message: string;
    severity: "info" | "warning" | "error";
    buttons?: string[];
    onlyIfNotVisible?: boolean;
}

export interface ShowNotificationResponse {
    type: "show_notification_response";
    buttonValue?: string;
}

/**
 * New session tab
 */
export interface NewConversationTabRequest {
    type: "new_conversation_tab";
    initialPrompt?: string;
}

export interface NewConversationTabResponse {
    type: "new_conversation_tab_response";
}

/**
 * Rename a tab
 */
export interface RenameTabRequest {
    type: "rename_tab";
    title: string;
}

export interface RenameTabResponse {
    type: "rename_tab_response";
}

/**
 * Open a config file
 */
export interface OpenConfigFileRequest {
    type: "open_config_file";
    configType: string;
}

export interface OpenConfigFileResponse {
    type: "open_config_file_response";
}

/**
 * Open Claude in a terminal
 */
export interface OpenClaudeInTerminalRequest {
    type: "open_claude_in_terminal";
}

export interface OpenClaudeInTerminalResponse {
    type: "open_claude_in_terminal_response";
}

/**
 * Get settings request
 */
export interface GetSettingsRequest {
    type: "get_settings";
}

export interface GetSettingsResponse {
    type: "get_settings_response";
    settings: any;
  // New fields for Profile Management
  activeProfile: string | null;
  profiles: string[];
  hasWorkspace: boolean;
  metadata?: Record<
    string,
    {
      effectiveScope: 'managed' | 'cli' | 'profile' | 'local' | 'shared' | 'global' | 'default';
      values: {
        managed?: any;
        cli?: any;
        profile?: any;
        local?: any;
        shared?: any;
        global?: any;
        default?: any;
      };
    }
  >;
}

/**
 * Switch Profile request
 */
export interface SwitchProfileRequest {
  type: 'switch_profile';
  profile: string | null; // null for default
}

export interface SwitchProfileResponse {
  type: 'switch_profile_response';
  success: boolean;
}

/**
 * Create Profile request
 */
export interface CreateProfileRequest {
  type: 'create_profile';
  name: string;
}

export interface CreateProfileResponse {
  type: 'create_profile_response';
  success: boolean;
  error?: string;
}

/**
 * Delete Profile request
 */
export interface DeleteProfileRequest {
  type: 'delete_profile';
  name: string;
}

export interface DeleteProfileResponse {
  type: 'delete_profile_response';
  success: boolean;
  error?: string;
}

/**
 * Update settings request
 */
export interface UpdateSettingRequest {
    type: "update_setting";
    key: string;
    value: any;
    target?: 'local' | 'shared' | 'global';
}

export interface UpdateSettingResponse {
    type: "update_setting_response";
    success: boolean;
}

/**
 * Reset settings request (removes a layer's value, falling back to inheritance)
 */
export interface ResetSettingRequest {
    type: "reset_setting";
    key: string;
    target: 'local' | 'shared' | 'global';
}

export interface ResetSettingResponse {
    type: "reset_setting_response";
    success: boolean;
}

/**
 * Get extension config request (~/.uic.json)
 */
export interface GetExtensionConfigRequest {
    type: "get_extension_config";
}

export interface GetExtensionConfigResponse {
    type: "get_extension_config_response";
    config: {
        defaultPermissionMode: string;
        defaultModel: string;
        defaultThinkingLevel: string;
        systemNotifications: boolean;
        completionSound: boolean;
        customModels: Array<{ id: string; name?: string }>;
        disabledModels: string[];
    };
}

/**
 * Update extension config request
 */
export interface UpdateExtensionConfigRequest {
    type: "update_extension_config";
    key: string;
    value: any;
}

export interface UpdateExtensionConfigResponse {
    type: "update_extension_config_response";
    success: boolean;
}

// ============================================================================
// Extension → WebView request types
// ============================================================================

/**
 * Tool permission request
 */
export interface ToolPermissionRequest {
    type: "tool_permission_request";
    toolName: string;
    inputs: Record<string, unknown>;
    suggestions: PermissionUpdate[];
    /** What the CLI says about this ask (the `canUseTool` options), for the prompt text */
    context?: ToolPermissionContext;
}

/**
 * Close the prompt of an earlier tool_permission_request that can no longer be
 * answered (OMP UI: omp's own timeout, or the channel went away). The prompt
 * resolves as denied; the host ignores that answer.
 */
export interface CancelPermissionRequest {
    type: "cancel_permission_request";
    /** requestId of the tool_permission_request to close */
    targetRequestId: string;
}

/** The display part of the SDK's `canUseTool` options (all optional: older CLIs send less) */
export interface ToolPermissionContext {
    /** Full prompt sentence ("Claude wants to read foo.txt") */
    title?: string;
    /** Short action name ("Read file") */
    displayName?: string;
    /** Subtitle (a Bash command's description, a file name) */
    description?: string;
    /** Why the CLI asks ("This command requires approval") */
    decisionReason?: string;
    /** Path outside the allowed directories that triggered the ask */
    blockedPath?: string;
    /** Start on "No" and offer no one-key approve */
    defaultToNo?: boolean;
    /** Offer no "don't ask again" choice */
    suppressAlwaysAllowRule?: boolean;
    toolUseID?: string;
    /** Set when the ask comes from a subagent */
    agentID?: string;
}

export interface ToolPermissionResponse {
    type: "tool_permission_response";
    result: PermissionResult;
}

/**
 * @ mention insertion
 */
export interface InsertAtMentionRequest {
    type: "insert_at_mention";
    text: string;
}

/**
 * Selection change notification
 */
export interface SelectionChangedRequest {
    type: "selection_changed";
    selection: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

/**
 * Extension config change notification (Extension → WebView broadcast)
 */
export interface ExtensionConfigChangedRequest {
    type: "extension_config_changed";
    key: string;
    value: any;
}

/**
 * State update
 */
export interface UpdateStateRequest {
    type: "update_state";
    // Aligned with init_response.state so both sides agree
    state: InitResponse['state'];
    // Claude config object sent by the backend
    config: GetClaudeStateResponse['config'];
}

// ============================================================================
// Union types
// ============================================================================

/**
 * All WebView → Extension messages
 */
export type WebViewToExtensionMessage =
    | LaunchClaudeMessage
    | IOMessage
    | InterruptClaudeMessage
    | CloseChannelMessage
    | RequestMessage
    | ResponseMessage
    | CancelRequestMessage;

/**
 * All Extension → WebView messages
 */
export type ExtensionToWebViewMessage =
    | IOMessage
    | CloseChannelMessage
    | LLMRequestErrorMessage
    | RequestMessage
    | ResponseMessage;

/**
 * Envelope format used when the Extension sends
 */
export interface FromExtensionWrapper {
    type: "from-extension";
    message: ExtensionToWebViewMessage;
}

// ============================================================================
// Request and response union types
// ============================================================================

/**
 * All WebView → Extension request types
 */
export type WebViewRequest =
    | InitRequest
    | OpenFileRequest
    | OpenDiffRequest
    | OpenContentRequest
    | SetPermissionModeRequest
    | SetModelRequest
    | SetThinkingLevelRequest
    | SetEffortLevelRequest
    | GetCurrentSelectionRequest
    | ShowNotificationRequest
    | NewConversationTabRequest
    | GetSessionOwnerRequest
    | ReportSessionSettingsRequest
    | FocusTabRequest
    | RenameTabRequest
    | GetClaudeStateRequest
    | SdkProbeRequest
    | GetMcpServersRequest
    | McpServerActionRequest
    | GetOutputStylesRequest
    | GetStatusRequest
    | GetMemoryFilesRequest
    | OpenClaudeFileRequest
    | GetHooksRequest
    | ExportConversationRequest
    | GetPermissionsRequest
    | UpdatePermissionRequest
    | ResolveDirectoryRequest
    | GetPluginsRequest
    | PluginActionRequest
    | GetAvailablePluginsRequest
    | GetMarketplacesRequest
    | MarketplaceActionRequest
    | OpenReleaseNotesRequest
    | GetAuthStatusRequest
    | GetCliVersionRequest
    | AuthLoginRequest
    | AuthLoginActionRequest
    | AuthLogoutRequest
    | GetConfigOptionsRequest
    | GetContextUsageRequest
    | GetAppliedEffortRequest
    | GetAssetUrisRequest
    | ListSessionsRequest
    | GetSessionRequest
    | ExecRequest
    | GetPromptHistoryRequest
    | AddPromptHistoryRequest
    | RunShellCommandRequest
    | RewindFilesRequest
    | StopTaskRequest
    | CancelQueuedPromptRequest
    | GetRewindPointRequest
    | ReadTaskOutputRequest
    | ListFilesRequest
    | OpenURLRequest
    | StatPathRequest
    | OpenConfigFileRequest
    | OpenConfigFileRequest
    | OpenClaudeInTerminalRequest
    | GetSettingsRequest
    | UpdateSettingRequest
    | ResetSettingRequest
    | SwitchProfileRequest
    | CreateProfileRequest
    | DeleteProfileRequest
    | GetExtensionConfigRequest
    | UpdateExtensionConfigRequest;

/**
 * All Extension → WebView response types
 */
export type WebViewRequestResponse =
    | InitResponse
    | OpenFileResponse
    | OpenDiffResponse
    | OpenContentResponse
    | SetPermissionModeResponse
    | SetModelResponse
    | SetThinkingLevelResponse
    | SetEffortLevelResponse
    | GetCurrentSelectionResponse
    | ShowNotificationResponse
    | NewConversationTabResponse
    | GetSessionOwnerResponse
    | ReportSessionSettingsResponse
    | FocusTabResponse
    | RenameTabResponse
    | GetClaudeStateResponse
    | SdkProbeResponse
    | GetMcpServersResponse
    | GetPermissionsResponse
    | UpdatePermissionResponse
    | ResolveDirectoryResponse
    | GetPluginsResponse
    | PluginActionResponse
    | GetAvailablePluginsResponse
    | GetMarketplacesResponse
    | MarketplaceActionResponse
    | OpenReleaseNotesResponse
    | GetAuthStatusResponse
    | GetCliVersionResponse
    | AuthLoginResponse
    | AuthLoginActionResponse
    | AuthLogoutResponse
    | GetContextUsageResponse
    | GetAppliedEffortResponse
    | GetAssetUrisResponse
    | ListSessionsResponse
    | GetSessionResponse
    | ExecResponse
    | GetPromptHistoryResponse
    | AddPromptHistoryResponse
    | RunShellCommandResponse
    | RewindFilesResponse
    | StopTaskResponse
    | CancelQueuedPromptResponse
    | GetRewindPointResponse
    | ReadTaskOutputResponse
    | ListFilesResponse
    | OpenURLResponse
    | StatPathResponse
    | OpenConfigFileResponse
    | OpenConfigFileResponse
    | OpenClaudeInTerminalResponse
    | GetSettingsResponse
    | UpdateSettingResponse
    | ResetSettingResponse
    | SwitchProfileResponse
    | CreateProfileResponse
    | DeleteProfileResponse
    | GetExtensionConfigResponse
    | UpdateExtensionConfigResponse;

/**
 * All Extension → WebView request types
 */
export type ExtensionRequest =
    | ToolPermissionRequest
    | CancelPermissionRequest
    | InsertAtMentionRequest
    | SelectionChangedRequest
    | UpdateStateRequest
    | VisibilityChangedRequest;

/**
 * Visibility change (Extension → WebView)
 *
 * Original code: Analyze/extension.unpack.js:2648-2656
 */
export interface VisibilityChangedRequest {
    type: "visibility_changed";
    isVisible: boolean;
}

/**
 * All WebView → Extension response types
 */
export type ExtensionRequestResponse =
    | ToolPermissionResponse;
