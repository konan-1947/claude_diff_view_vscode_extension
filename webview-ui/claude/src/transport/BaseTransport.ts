import { signal } from "alien-signals";
import { AsyncQueue } from "./AsyncQueue";
import { EventEmitter } from "../utils/events";
import { PermissionRequest } from "../core/PermissionRequest";
import type { PermissionResult, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import type {
  ExtensionRequestResponse,
  ExtensionToWebViewMessage,
  GetClaudeStateResponse,
  GetConfigOptionsResponse,
  InitResponse,
  McpServerActionRequest,
  McpServerInfo,
  RequestMessage,
  SdkProbeResponse,
  ToolPermissionRequest,
  WebViewToExtensionMessage,
  WebViewRequest,
  ShowNotificationRequest,
  ClaudeFileInfo,
  ClaudeFileKind,
  GetHooksResponse,
  StatusInfo,
  AuthLoginActionRequest,
  AuthLoginMethod,
  AuthLoginResponse,
  AuthStatusInfo,
  GetPermissionsResponse,
  PermissionListName,
  PluginEntry,
  SettingsFileKind,
  AvailablePluginEntry,
  MarketplaceEntry,
  PluginActionRequest,
  PluginActionResponse,
  PromptHistoryEntry,
  RunShellCommandResponse,
  RewindFilesResponse,
  StopTaskResponse,
  BackgroundTasksResponse,
  SideQuestionResponse,
  CancelQueuedPromptResponse,
  ColdResumeQuota,
} from "@shared/messages";

type ConnectionState = "connecting" | "connected" | "disconnected";

interface RequestHandler {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

/**
 * Abstract base class for WebView ↔ Extension transport
 * - State managed with alien-signals (unified architecture)
 */
export abstract class BaseTransport {
  readonly state = signal<ConnectionState>("connecting");
  readonly isVisible = signal(true);
  readonly permissionRequests = signal<PermissionRequest[]>([]);
  readonly config = signal<InitResponse["state"] | undefined>(undefined);
  readonly claudeConfig = signal<GetClaudeStateResponse["config"] | undefined>(undefined);
  private initPromise?: Promise<void>;
  private initialized = false;

  get opened(): Promise<void> {
    return this.ensureInitialized();
  }
  get closed(): Promise<void> {
    return Promise.resolve();
  }

  readonly permissionRequested: EventEmitter<PermissionRequest> =
    new EventEmitter<PermissionRequest>();

  readonly extensionConfigChanged: EventEmitter<{ key: string; value: any }> =
    new EventEmitter<{ key: string; value: any }>();

  protected readonly fromHost = new AsyncQueue<ExtensionToWebViewMessage>();
  protected readonly streams = new Map<string, AsyncQueue<any>>();
  protected readonly outstandingRequests = new Map<string, RequestHandler>();
  /** Open tool_permission_request prompts by the host's requestId (cancel_permission_request) */
  private readonly openPermissionRequests = new Map<string, PermissionRequest>();

  constructor(
    protected readonly atMentionEvents: EventEmitter<string>,
    protected readonly selectionChangedEvents: EventEmitter<any>
  ) {
    void this.readMessages();
  }

  protected abstract send(message: WebViewToExtensionMessage): void;

  async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.initialize()
        .then(() => {
          this.initialized = true;
        })
        .catch((error) => {
          this.initPromise = undefined;
          throw error;
        });
    }

    return this.initPromise;
  }

  async initialize(): Promise<void> {
    const initResponse = await this.sendRequest<InitResponse>({ type: "init" });
    this.config({
      defaultCwd: initResponse.state.defaultCwd,
      modelSetting: initResponse.state.modelSetting,
      platform: initResponse.state.platform,
      thinkingLevel: initResponse.state.thinkingLevel,
      allowBypassPermissions: initResponse.state.allowBypassPermissions ?? false,
    } as InitResponse["state"]);

    const claudeState = await this.sendRequest<GetClaudeStateResponse>({
      type: "get_claude_state",
    });
    this.claudeConfig(claudeState.config);
    this.state("connected");
  }

  launchClaude(
    channelId: string,
    resume?: string,
    cwd?: string,
    model?: string,
    permissionMode?: PermissionMode,
    thinkingLevel?: string,
    effortLevel?: string,
    additionalDirectories?: string[],
    resumeSessionAt?: string,
    forkSession?: boolean
  ): AsyncQueue<any> {
    const queue = new AsyncQueue<any>();
    this.streams.set(channelId, queue);
    this.send({
      type: "launch_claude",
      channelId,
      resume,
      cwd,
      model,
      permissionMode,
      thinkingLevel,
      effortLevel,
      additionalDirectories: additionalDirectories?.length ? additionalDirectories : undefined,
      resumeSessionAt,
      forkSession: forkSession || undefined,
    });
    return queue;
  }

  /** Close a channel from this side: the host drops its query, the local stream ends */
  closeChannel(channelId: string): void {
    this.send({ type: "close_channel", channelId });
    const stream = this.streams.get(channelId);
    this.streams.delete(channelId);
    stream?.done();
  }

  sendInput(channelId: string, message: any, done: boolean): void {
    this.send({ type: "io_message", channelId, message, done });
  }

  interruptClaude(channelId: string): void {
    this.send({ type: "interrupt_claude", channelId });
  }

  openFile(filePath: string, location?: any): Promise<any> {
    return this.sendRequest({ type: "open_file", filePath, location });
  }
  openConfigFile(configType: string): Promise<any> {
    return this.sendRequest({ type: "open_config_file", configType });
  }
  async getMcpServers(channelId?: string): Promise<McpServerInfo[]> {
    const response = await this.sendRequest({ type: "get_mcp_servers" }, channelId);
    return (response as any)?.mcpServers ?? [];
  }
  /** Resolves to the CLI's error text, or undefined when it worked. */
  async mcpServerAction(
    channelId: string,
    action: McpServerActionRequest["action"],
    serverName: string
  ): Promise<string | undefined> {
    const response = await this.sendRequest({ type: "mcp_server_action", action, serverName }, channelId);
    return (response as any)?.ok ? undefined : ((response as any)?.error ?? "Failed");
  }
  async getConfigOptions(channelId: string): Promise<Omit<GetConfigOptionsResponse, "type">> {
    const response = (await this.sendRequest({ type: "get_config_options" }, channelId)) as GetConfigOptionsResponse;
    return { options: response?.options ?? [], current: response?.current ?? {}, error: response?.error };
  }
  async getStatus(channelId?: string): Promise<StatusInfo> {
    const response = await this.sendRequest({ type: "get_status" }, channelId);
    return (response as any).status;
  }
  async getMemoryFiles(): Promise<ClaudeFileInfo[]> {
    const response = await this.sendRequest({ type: "get_memory_files" });
    return (response as any)?.files ?? [];
  }
  /** Resolves to the error text, or undefined when the file opened */
  async openClaudeFile(kind: ClaudeFileKind, create = false): Promise<string | undefined> {
    const response = await this.sendRequest({ type: "open_claude_file", kind, create });
    return (response as any)?.error;
  }
  async getHooks(): Promise<Omit<GetHooksResponse, "type">> {
    const response = (await this.sendRequest({ type: "get_hooks" })) as GetHooksResponse;
    return { hooks: response?.hooks ?? [], errors: response?.errors ?? [] };
  }
  async getPermissions(): Promise<Omit<GetPermissionsResponse, "type">> {
    const response = (await this.sendRequest({ type: "get_permissions" })) as GetPermissionsResponse;
    return { entries: response?.entries ?? [], cwd: response?.cwd ?? "", errors: response?.errors ?? [] };
  }
  /** Resolves to the error text, or undefined when the settings file was written */
  async updatePermission(
    list: PermissionListName,
    action: "add" | "remove",
    value: string,
    source: SettingsFileKind
  ): Promise<string | undefined> {
    const response = await this.sendRequest({ type: "update_permission", list, action, value, source });
    return (response as any)?.error;
  }
  /** `/add-dir`: absolute folder for a typed path; no path opens a folder picker */
  async resolveDirectory(path?: string): Promise<{ path?: string; error?: string; cancelled?: boolean }> {
    const response = await this.sendRequest({ type: "resolve_directory", path });
    return { path: (response as any)?.path, error: (response as any)?.error, cancelled: (response as any)?.cancelled };
  }
  async getPlugins(): Promise<{ plugins: PluginEntry[]; error?: string }> {
    const response = await this.sendRequest({ type: "get_plugins" });
    return { plugins: (response as any)?.plugins ?? [], error: (response as any)?.error };
  }
  async pluginAction(
    action: PluginActionRequest["action"],
    pluginId: string,
    scope?: string,
    acceptCommand?: string
  ): Promise<Omit<PluginActionResponse, "type">> {
    const response = (await this.sendRequest({ type: "plugin_action", action, pluginId, scope, acceptCommand })) as PluginActionResponse;
    return { error: response?.error, message: response?.message, confirm: response?.confirm };
  }
  async getAvailablePlugins(refresh = false): Promise<{ plugins: AvailablePluginEntry[]; error?: string }> {
    const response = await this.sendRequest({ type: "get_available_plugins", refresh });
    return { plugins: (response as any)?.plugins ?? [], error: (response as any)?.error };
  }
  async getMarketplaces(): Promise<{ marketplaces: MarketplaceEntry[]; error?: string }> {
    const response = await this.sendRequest({ type: "get_marketplaces" });
    return { marketplaces: (response as any)?.marketplaces ?? [], error: (response as any)?.error };
  }
  async marketplaceAction(
    action: "add" | "remove" | "update",
    target: string
  ): Promise<{ error?: string; message?: string }> {
    const response = await this.sendRequest({ type: "marketplace_action", action, target });
    return { error: (response as any)?.error, message: (response as any)?.message };
  }
  async openReleaseNotes(): Promise<string | undefined> {
    const response = await this.sendRequest({ type: "open_release_notes" });
    return (response as any)?.error;
  }
  async getCliVersion(): Promise<string | undefined> {
    const response = await this.sendRequest({ type: "get_cli_version" });
    return (response as any)?.version;
  }
  async getAuthStatus(): Promise<{ status?: AuthStatusInfo; error?: string }> {
    const response = await this.sendRequest({ type: "get_auth_status" });
    return { status: (response as any)?.status, error: (response as any)?.error };
  }
  async authLogin(method: AuthLoginMethod, email?: string): Promise<Omit<AuthLoginResponse, "type">> {
    const response = (await this.sendRequest({ type: "auth_login", method, email })) as AuthLoginResponse;
    return { loginId: response?.loginId, url: response?.url, result: response?.result, error: response?.error };
  }
  async authLoginAction(
    loginId: string,
    action: AuthLoginActionRequest["action"],
    code?: string
  ): Promise<{ result?: { ok: boolean; error?: string }; error?: string }> {
    const response = await this.sendRequest({ type: "auth_login_action", loginId, action, code });
    return { result: (response as any)?.result, error: (response as any)?.error };
  }
  async authLogout(): Promise<string | undefined> {
    const response = await this.sendRequest({ type: "auth_logout" });
    return (response as any)?.error;
  }
  /** Resolves to the written path (file), undefined for the clipboard or a cancelled dialog */
  async exportConversation(
    markdown: string,
    target: "file" | "clipboard",
    fileName: string
  ): Promise<string | undefined> {
    const response = await this.sendRequest({ type: "export_conversation", markdown, target, fileName });
    return (response as any)?.path;
  }
  async getOutputStyles(channelId: string): Promise<{ current?: string; available: string[] }> {
    const response = await this.sendRequest({ type: "get_output_styles" }, channelId);
    return { current: (response as any)?.current, available: (response as any)?.available ?? [] };
  }
  async getContextUsage(channelId: string): Promise<{
    totalTokens: number;
    maxTokens: number;
    rawMaxTokens: number;
    percentage: number;
    model: string;
    coldResumeQuota?: ColdResumeQuota;
    cacheKeepaliveWindowMs?: number;
  } | null> {
    const response = await this.sendRequest({ type: "get_context_usage" }, channelId);
    return (response as any)?.usage ?? null;
  }
  /** Effort the CLI applies next (null = none sent, undefined = unknown). */
  async getAppliedEffort(channelId: string): Promise<string | null | undefined> {
    const response = await this.sendRequest({ type: "get_applied_effort" }, channelId);
    return (response as any)?.effort;
  }
  sdkProbe(capabilities: string[], timeoutMs?: number): Promise<SdkProbeResponse> {
    return this.sendRequest({ type: "sdk_probe", capabilities, timeoutMs });
  }

  async openContent(
    content: string,
    fileName: string,
    editable: boolean,
    signal?: AbortSignal
  ): Promise<string | undefined> {
    const response = await this.sendRequest(
      { type: "open_content", content, fileName, editable },
      undefined,
      signal
    );
    return (response as any).updatedContent;
  }

  async openDiff(
    originalFilePath: string,
    newFilePath: string,
    edits: any[],
    supportMultiEdits: boolean,
    signal?: AbortSignal
  ): Promise<any[]> {
    const response = await this.sendRequest(
      {
        type: "open_diff",
        originalFilePath,
        newFilePath,
        edits,
        supportMultiEdits,
      },
      undefined,
      signal
    );
    return (response as any).newEdits;
  }

  async setPermissionMode(channelId: string, mode: PermissionMode): Promise<boolean> {
    const response = await this.sendRequest(
      { type: "set_permission_mode", mode },
      channelId
    );
    return !!(response as any).success;
  }

  async setModel(channelId: string, model: any): Promise<any> {
    return this.sendRequest({ type: "set_model", model }, channelId);
  }

  async setThinkingLevel(channelId: string, thinkingLevel: string): Promise<void> {
    await this.sendRequest({ type: "set_thinking_level", channelId, thinkingLevel }, channelId);
  }

  async setEffortLevel(channelId: string, effortLevel: string | null, persist = false): Promise<void> {
    await this.sendRequest({ type: "set_effort_level", channelId, effortLevel, persist }, channelId);
  }

  listSessions(): Promise<any> {
    return this.sendRequest({ type: "list_sessions_request" });
  }
  getSession(sessionId: string): Promise<any> {
    return this.sendRequest({ type: "get_session_request", sessionId });
  }
  /** Another Claude UI tab already on this conversation, if any */
  async getSessionOwner(sessionId: string): Promise<{ tabId: string; title: string } | undefined> {
    const response: any = await this.sendRequest({ type: "get_session_owner", sessionId } as any);
    return response?.owner;
  }
  reportSessionSettings(sessionId: string, settings: Record<string, string | undefined>): Promise<any> {
    return this.sendRequest({ type: "report_session_settings", sessionId, settings } as any);
  }
  focusTab(tabId: string): Promise<any> {
    return this.sendRequest({ type: "focus_tab", tabId } as any);
  }
  listFiles(pattern?: string, signal?: AbortSignal): Promise<any> {
    return this.sendRequest({ type: "list_files_request", pattern }, undefined, signal);
  }
  statPaths(paths: string[]): Promise<any> {
    return this.sendRequest({ type: "stat_path_request", paths });
  }
  /** `forkSessionId` (`/fork`): the new tab opens a copy of that conversation */
  startNewConversationTab(initialPrompt?: string, forkSessionId?: string): Promise<any> {
    return this.sendRequest({
      type: "new_conversation_tab",
      initialPrompt,
      forkSessionId,
    } as any);
  }
  renameTab(title: string): Promise<any> {
    return this.sendRequest({ type: "rename_tab", title } as any);
  }
  openClaudeInTerminal(): Promise<any> {
    return this.sendRequest({ type: "open_claude_in_terminal" });
  }
  openURL(url: string): void {
    void this.sendRequest({ type: "open_url", url });
  }
  /** Prompts typed in this project (CLI and UI), newest first */
  async getPromptHistory(cwd?: string): Promise<PromptHistoryEntry[]> {
    const response = await this.sendRequest({ type: "get_prompt_history", cwd });
    return (response as any)?.entries ?? [];
  }
  addPromptHistory(display: string, cwd?: string, sessionId?: string): Promise<any> {
    return this.sendRequest({ type: "add_prompt_history", display, cwd, sessionId });
  }
  /** `!command`; aborting the signal stops the command */
  async runShellCommand(command: string, cwd?: string, signal?: AbortSignal): Promise<Omit<RunShellCommandResponse, "type">> {
    const response = (await this.sendRequest({ type: "run_shell_command", command, cwd }, undefined, signal)) as RunShellCommandResponse;
    return {
      stdout: response?.stdout ?? "",
      stderr: response?.stderr ?? "",
      exitCode: response?.exitCode ?? null,
      interrupted: response?.interrupted,
    };
  }
  async rewindFiles(channelId: string, userMessageId: string, dryRun = false): Promise<Omit<RewindFilesResponse, "type">> {
    const response = (await this.sendRequest({ type: "rewind_files", userMessageId, dryRun }, channelId)) as RewindFilesResponse;
    return {
      canRewind: !!response?.canRewind,
      error: response?.error,
      filesChanged: response?.filesChanged,
      insertions: response?.insertions,
      deletions: response?.deletions,
    };
  }
  async stopTask(channelId: string, taskId: string): Promise<{ error?: string }> {
    const response = (await this.sendRequest({ type: "stop_task", taskId }, channelId)) as StopTaskResponse;
    return { error: response?.error };
  }
  async backgroundTasks(channelId: string): Promise<{ backgrounded: boolean; error?: string }> {
    const response = (await this.sendRequest({ type: "background_tasks" }, channelId)) as BackgroundTasksResponse;
    return { backgrounded: response?.backgrounded === true, error: response?.error };
  }
  /** `/btw`; throws with the CLI's reason when there is no answer */
  async sideQuestion(channelId: string, question: string): Promise<string> {
    const response = (await this.sendRequest({ type: "side_question", question }, channelId)) as SideQuestionResponse;
    if (!response?.response) {
      throw new Error(response?.error || 'No response received');
    }
    return response.response;
  }
  async cancelQueuedPrompt(channelId: string, uuid: string): Promise<boolean> {
    const response = (await this.sendRequest({ type: "cancel_queued_prompt", uuid }, channelId)) as CancelQueuedPromptResponse;
    return response?.cancelled === true;
  }
  async getRewindPoint(sessionId: string, userMessageId: string, cwd?: string): Promise<{ found: boolean; parentUuid: string | null }> {
    const response = await this.sendRequest({ type: "get_rewind_point", sessionId, userMessageId, cwd });
    return { found: !!(response as any)?.found, parentUuid: (response as any)?.parentUuid ?? null };
  }
  async readTaskOutput(path: string, maxBytes?: number): Promise<{ output?: string; truncated?: boolean; error?: string }> {
    const response = (await this.sendRequest({ type: "read_task_output", path, maxBytes })) as any;
    return { output: response?.output, truncated: response?.truncated, error: response?.error };
  }
  exec(command: string, params: string[]): Promise<any> {
    return this.sendRequest({ type: "exec", command, params });
  }
  getCurrentSelection(): Promise<any> {
    return this.sendRequest({ type: "get_current_selection" });
  }
  getAssetUris(): Promise<any> {
    return this.sendRequest({ type: "get_asset_uris" });
  }

  getSettings(): Promise<any> {
    return this.sendRequest({ type: "get_settings" });
  }

  updateSetting(key: string, value: any, target?: 'local' | 'shared' | 'global'): Promise<any> {
    return this.sendRequest({ type: 'update_setting', key, value, target });
  }

  resetSetting(key: string, target: 'local' | 'shared' | 'global'): Promise<any> {
    return this.sendRequest({ type: 'reset_setting', key, target });
  }

  switchProfile(profile: string | null): Promise<any> {
    return this.sendRequest({ type: 'switch_profile', profile });
  }

  createProfile(name: string): Promise<any> {
    return this.sendRequest({ type: 'create_profile', name });
  }

  deleteProfile(name: string): Promise<any> {
    return this.sendRequest({ type: 'delete_profile', name });
  }

  getExtensionConfig(): Promise<any> {
    return this.sendRequest({ type: 'get_extension_config' });
  }

  updateExtensionConfig(key: string, value: any): Promise<any> {
    return this.sendRequest({ type: 'update_extension_config', key, value });
  }

  showNotification(
    message: string,
    severity: ShowNotificationRequest["severity"],
    buttons?: string[],
    onlyIfNotVisible?: boolean
  ): Promise<string | undefined> {
    return this.sendRequest({
      type: "show_notification",
      message,
      severity,
      buttons,
      onlyIfNotVisible,
    }).then((r: any) => r.buttonValue);
  }

  onPermissionRequested(callback: (request: PermissionRequest) => void): void {
    this.permissionRequested.add(callback);
  }

  close(): void {
    /* no-op */
  }

  protected async sendRequest<TResponse = any>(
    request: WebViewRequest,
    channelId?: string,
    abortSignal?: AbortSignal
  ): Promise<TResponse> {
    const requestId = Math.random().toString(36).slice(2);
    const abortHandler = () => {
      this.cancelRequest(requestId);
    };
    if (abortSignal)
      abortSignal.addEventListener("abort", abortHandler, { once: true });

    return new Promise<TResponse>((resolve, reject) => {
      this.outstandingRequests.set(requestId, { resolve, reject });
      this.send({ type: "request", channelId, requestId, request });
    }).finally(() => {
      if (abortSignal) abortSignal.removeEventListener("abort", abortHandler);
    });
  }

  protected cancelRequest(requestId: string): void {
    this.send({ type: "cancel_request", targetRequestId: requestId });
  }

  private async readMessages(): Promise<void> {
    try {
      for await (const message of this.fromHost) {
        switch (message.type) {
          case "io_message": {
            const stream = this.streams.get(message.channelId);
            if (stream) stream.enqueue(message.message);
            else
              console.warn(
                `[BaseTransport] Missing stream for ${message.channelId}`
              );
            break;
          }
          case "close_channel": {
            const stream = this.streams.get(message.channelId);
            if (stream) {
              if (message.error) stream.error(new Error(message.error));
              stream.done();
              // Delete later, giving trailing io_message/result a time slice
              setTimeout(() => {
                this.streams.delete(message.channelId);
              }, 50);
            } else {
              this.streams.delete(message.channelId);
            }
            break;
          }
          case "sdk_error": {
            // Inject LLM request errors into the message stream as special events
            const errorStream = this.streams.get(message.channelId);
            if (errorStream) {
              errorStream.enqueue({
                type: '__llm_request_error__',
                error: message.error,
                statusCode: message.statusCode,
                errorType: message.errorType,
              });
            }
            break;
          }
          case "request":
            await this.processRequest(message as RequestMessage);
            break;
          case "response": {
            const handler = this.outstandingRequests.get(message.requestId);
            if (!handler) {
              // With multiple WebView hosts, other instances also receive the response but have no matching pending request
              // This is expected and silently ignored here
              // console.warn(
              //   `[BaseTransport] No handler for response ${message.requestId}`
              // );
              break;
            }
            const response = (message as any).response;
            if (response && (response as any).type === "error")
              handler.reject(new Error((response as any).error));
            else handler.resolve(response);
            this.outstandingRequests.delete(message.requestId);
            break;
          }
          default:
            console.warn(
              `[BaseTransport] Unknown message type ${(message as any).type}`
            );
        }
      }
    } catch (error) {
      for (const stream of this.streams.values()) stream.error(error);
    } finally {
      for (const stream of this.streams.values()) stream.done();
      this.streams.clear();
    }
  }

  private async processRequest(message: RequestMessage): Promise<void> {
    const req: any = (message as any).request;
    switch (req.type) {
      case "tool_permission_request": {
        // Not awaited: the message loop must keep running while the prompt is
        // open (responses to other requests, a cancel_permission_request for it)
        void this.handleToolPermissionRequest(
          (message.channelId ?? "") as string,
          req as ToolPermissionRequest,
          message.requestId
        ).then((response) => {
          this.send({ type: "response", requestId: message.requestId, response });
        });
        break;
      }
      case "cancel_permission_request": {
        // The host gave up on that prompt: close it (the answer is ignored there)
        this.openPermissionRequests.get(req.targetRequestId)?.reject("Cancelled", false);
        break;
      }
      case "insert_at_mention": {
        if (this.isVisible()) this.atMentionEvents.emit(req.text);
        break;
      }
      case "selection_changed": {
        this.selectionChangedEvents.emit(req.selection);
        break;
      }
      case "visibility_changed": {
        this.isVisible(req.isVisible);
        break;
      }

      case "update_state": {
        this.config({
          defaultCwd: req.state.defaultCwd,
          modelSetting: req.state.modelSetting,
          platform: req.state.platform,
          thinkingLevel: req.state.thinkingLevel,
        } as InitResponse["state"]);
        this.claudeConfig(req.config);
        break;
      }
      case "extension_config_changed": {
        this.extensionConfigChanged.emit({ key: req.key, value: req.value });
        break;
      }
      default:
        console.warn("[BaseTransport] Unhandled request", req);
    }
  }

  private async handleToolPermissionRequest(
    channelId: string,
    request: ToolPermissionRequest,
    requestId: string
  ): Promise<ExtensionRequestResponse> {
    let trackedRequest: PermissionRequest | undefined;
    return new Promise<ExtensionRequestResponse>((resolve) => {
      const permissionRequest = new PermissionRequest(
        channelId,
        request.toolName,
        request.inputs,
        request.suggestions ?? [],
        request.context ?? {}
      );
      trackedRequest = permissionRequest;
      this.openPermissionRequests.set(requestId, permissionRequest);

      permissionRequest.onResolved((resolution: PermissionResult) => {
        resolve({ type: "tool_permission_response", result: resolution });
        this.permissionRequests(
          this.permissionRequests().filter((i) => i !== permissionRequest)
        );
      });

      this.permissionRequests([
        ...this.permissionRequests(),
        permissionRequest,
      ]);
      this.permissionRequested.emit(permissionRequest);
    }).finally(() => {
      this.openPermissionRequests.delete(requestId);
      if (trackedRequest) {
        this.permissionRequests(
          this.permissionRequests().filter((i) => i !== trackedRequest)
        );
      }
    });
  }
}
