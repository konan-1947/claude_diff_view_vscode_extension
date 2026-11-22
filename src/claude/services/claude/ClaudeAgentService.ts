/**
 * ClaudeAgentService - core orchestration service for the Claude Agent
 *
 * Responsibilities:
 * 1. Manage multiple Claude sessions (channels)
 * 2. Receive and dispatch messages from the Transport
 * 3. Launch and control Claude sessions (launchClaude, interruptClaude)
 * 4. Route requests to the matching handlers
 * 5. RPC request-response management
 *
 * Dependencies:
 * - IClaudeSdkService: SDK calls
 * - IClaudeSessionService: session history
 * - ILogService: logging
 * - other base services
 */

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IWorkspaceService } from '../workspaceService';
import { IFileSystemService } from '../fileSystemService';
import { INotificationService } from '../notificationService';
import { ITerminalService } from '../terminalService';
import { ITabsAndEditorsService } from '../tabsAndEditorsService';
import { IClaudeSdkService, type SdkQueryParams } from './ClaudeSdkService';
import { IClaudeSessionService } from './ClaudeSessionService';
import { AsyncStream, ITransport } from './transport';
import { HandlerContext } from './handlers/types';
import { IWebViewService } from '../webViewService';
import { readConfigValues } from './configValues';
import { memoryFiles, settingsFiles } from './claudeFiles';

// Message type imports
import type {
    WebViewToExtensionMessage,
    ExtensionToWebViewMessage,
    RequestMessage,
    ResponseMessage,
    ExtensionRequest,
    ToolPermissionRequest,
    ToolPermissionResponse,
    GetContextUsageResponse,
    GetAppliedEffortResponse,
    GetMcpServersResponse,
    McpServerActionRequest,
    McpServerActionResponse,
    GetOutputStylesResponse,
    GetConfigOptionsResponse,
    ConfigOption,
    GetStatusResponse,
} from '../../shared/messages';

// SDK type imports
import type {
    SDKMessage,
    SDKSystemMessage,
    SDKUserMessage,
    Query,
    PermissionResult,
    PermissionUpdate,
    CanUseTool,
    PermissionMode,
    ThinkingConfig,
    EffortLevel,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * Effort level from the UI. Any level is passed through unchecked (the UI only
 * offers what the CLI lists in ModelInfo.supportedEffortLevels, so a level added
 * by a newer CLI works without a change here); empty or "auto" = model default.
 */
function toEffort(level: string | null | undefined): EffortLevel | undefined {
    return level && level !== 'auto' ? (level as EffortLevel) : undefined;
}

/**
 * `/config` usage text → options. Lines look like `  theme=auto|dark|light`
 * or `  language=<value>` (free text); anything else is skipped.
 */
function parseConfigUsage(text: string): ConfigOption[] {
    const options: ConfigOption[] = [];
    for (const line of text.split(/\r?\n/)) {
        const match = /^\s+([A-Za-z][\w.-]*)=(.+?)\s*$/.exec(line);
        if (!match) {
            continue;
        }
        const raw = match[2];
        options.push({
            key: match[1],
            values: /^<[^>]*>$/.test(raw) ? null : raw.split('|').map((v) => v.trim()).filter(Boolean)
        });
    }
    return options;
}

// Handler imports
import {
    handleInit,
    handleGetClaudeState,
    handleGetAssetUris,
    handleOpenFile,
    handleGetCurrentSelection,
    handleShowNotification,
    handleNewConversationTab,
    handleRenameTab,
    handleOpenDiff,
    handleListSessions,
    handleGetSession,
    handleExec,
    handleListFiles,
    handleStatPath,
    handleOpenContent,
    handleOpenURL,
    handleOpenConfigFile,
    // handleOpenClaudeInTerminal,
    // handleGetAuthStatus,
    // handleLogin,
    // handleSubmitOAuthCode,
    handleGetSettings,
    handleUpdateSetting,
    handleResetSetting,
    handleSwitchProfile,
    handleCreateProfile,
    handleDeleteProfile,
    handleGetExtensionConfig,
    handleUpdateExtensionConfig,
    handleSdkProbe,
    handleGetMemoryFiles,
    handleOpenClaudeFile,
    handleGetHooks,
    handleExportConversation,
} from './handlers/handlers';

export const IClaudeAgentService = createDecorator<IClaudeAgentService>('claudeAgentService');

// ============================================================================
// Type definitions
// ============================================================================

/**
 * Channel object: manages a single Claude session
 */
export interface Channel {
    in: AsyncStream<SDKUserMessage>;  // Input stream: sends user messages to the SDK
    query: Query;                      // Query object: receives responses from the SDK
    cwd: string;
    /** Last system/init of the channel (version, model, cwd... for `/status`) */
    init?: SDKSystemMessage;
}

/**
 * Request handler
 */
interface RequestHandler {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
}

/**
 * Claude Agent service interface
 */
export interface IClaudeAgentService {
    readonly _serviceBrand: undefined;

    /**
     * Set the Transport
     */
    setTransport(transport: ITransport): void;

    /**
     * Start the message loop
     */
    start(): void;

    /**
     * Receive a message from the client
     */
    fromClient(message: WebViewToExtensionMessage): Promise<void>;

    /**
     * Launch a Claude session
     */
    launchClaude(
        channelId: string,
        resume: string | null,
        cwd: string,
        model: string | null,
        permissionMode: string | undefined,
        thinkingLevel: string | null,
        effortLevel?: string | null
    ): Promise<void>;

    /**
     * Interrupt a Claude session
     */
    interruptClaude(channelId: string): Promise<void>;

    /**
     * Close a session
     */
    closeChannel(channelId: string, sendNotification: boolean, error?: string): void;

    /**
     * Close all sessions
     */
    closeAllChannels(): Promise<void>;

    /**
     * Close all channels when credentials change
     */
    closeAllChannelsWithCredentialChange(): Promise<void>;

    /**
     * Handle a request
     */
    processRequest(request: RequestMessage, signal: AbortSignal): Promise<unknown>;

    /**
     * Set the permission mode
     */
    setPermissionMode(channelId: string, mode: PermissionMode): Promise<void>;

    /**
     * Set the Thinking Level
     */
    setThinkingLevel(channelId: string, level: string): Promise<void>;

    /**
     * Set the effort level (null/"auto" = the model's default)
     */
    setEffortLevel(channelId: string, level: string | null): Promise<void>;

    /**
     * Set the model
     */
    setModel(channelId: string, model: string): Promise<void>;

    /**
     * Shut down
     */
    shutdown(): Promise<void>;
}

// ============================================================================
// ClaudeAgentService implementation
// ============================================================================

/**
 * Claude Agent service implementation
 */
export class ClaudeAgentService implements IClaudeAgentService {
    readonly _serviceBrand: undefined;

    // Transport adapter
    private transport?: ITransport;

    // Session management
    private channels = new Map<string, Channel>();

    // Stream of messages received from the client
    private fromClientStream = new AsyncStream<WebViewToExtensionMessage>();

    // Requests awaiting a response
    private outstandingRequests = new Map<string, RequestHandler>();

    // Cancellation controllers
    private abortControllers = new Map<string, AbortController>();

    // Handler context (cached)
    private handlerContext: HandlerContext;

    // Thinking Level configuration
    private thinkingLevel: string = 'default_on';

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService,
        @IWorkspaceService private readonly workspaceService: IWorkspaceService,
        @IFileSystemService private readonly fileSystemService: IFileSystemService,
        @INotificationService private readonly notificationService: INotificationService,
        @ITerminalService private readonly terminalService: ITerminalService,
        @ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
        @IClaudeSdkService private readonly sdkService: IClaudeSdkService,
        @IClaudeSessionService private readonly sessionService: IClaudeSessionService,
        @IWebViewService private readonly webViewService: IWebViewService
    ) {
        // Build the handler context
        this.handlerContext = {
            logService: this.logService,
            configService: this.configService,
            workspaceService: this.workspaceService,
            fileSystemService: this.fileSystemService,
            notificationService: this.notificationService,
            terminalService: this.terminalService,
            tabsAndEditorsService: this.tabsAndEditorsService,
            sessionService: this.sessionService,
            sdkService: this.sdkService,
            agentService: this,  // self reference
            webViewService: this.webViewService,
        };
    }

    /**
     * Set the Transport
     */
    setTransport(transport: ITransport): void {
        this.transport = transport;

        // Listen for client messages and push them onto the queue
        transport.onMessage(async (message) => {
            await this.fromClient(message);
        });

        this.logService.info('[ClaudeAgentService] Transport connected');
    }

    /**
     * Start the message loop
     */
    start(): void {
        // Start the message loop
        this.readFromClient();

        this.logService.info('[ClaudeAgentService] Message loop started');
    }

    /**
     * Receive a message from the client
     */
    async fromClient(message: WebViewToExtensionMessage): Promise<void> {
        this.fromClientStream.enqueue(message);
    }

    /**
     * Read messages from the client and dispatch them
     */
    private async readFromClient(): Promise<void> {
        try {
            for await (const message of this.fromClientStream) {
                switch (message.type) {
                    case "launch_claude":
                        // A failed launch has already closed its channel with the error
                        // (the tab shows it). It must not escape: this loop serves every
                        // Claude UI tab, and leaving it would leave all later requests unanswered.
                        try {
                            await this.launchClaude(
                                message.channelId,
                                message.resume || null,
                                message.cwd || this.getCwd(),
                                message.model || null,
                                // No mode chosen in the UI yet: the CLI applies the user's
                                // `permissions.defaultMode` and reports it in system/init.
                                message.permissionMode || undefined,
                                message.thinkingLevel || null,
                                message.effortLevel ?? null
                            );
                        } catch (error) {
                            this.logService.error(`[ClaudeAgentService] launch_claude failed for ${message.channelId}: ${error}`);
                        }
                        break;

                    case "close_channel":
                        this.closeChannel(message.channelId, false);
                        break;

                    case "interrupt_claude":
                        try {
                            await this.interruptClaude(message.channelId);
                        } catch (error) {
                            this.logService.error(`[ClaudeAgentService] interrupt_claude failed for ${message.channelId}: ${error}`);
                        }
                        break;

                    case "io_message":
                        this.transportMessage(
                            message.channelId,
                            message.message,
                            message.done
                        );
                        break;

                    case "request":
                        this.handleRequest(message);
                        break;

                    case "response":
                        this.handleResponse(message);
                        break;

                    case "cancel_request":
                        this.handleCancellation(message.targetRequestId);
                        break;

                    default:
                        this.logService.error(`Unknown message type: ${(message as { type: string }).type}`);
                }
            }
        } catch (error) {
            this.logService.error(`[ClaudeAgentService] Error in readFromClient: ${error}`);
        }
    }

    /**
     * Launch a Claude session
     */
    async launchClaude(
        channelId: string,
        resume: string | null,
        cwd: string,
        model: string | null,
        permissionMode: string | undefined,
        thinkingLevel: string | null,
        effortLevel: string | null = null
    ): Promise<void> {
        // Save thinkingLevel
        if (thinkingLevel) {
            this.thinkingLevel = thinkingLevel;
        }

        const thinking = this.getThinkingConfig(this.thinkingLevel);
        const effort = toEffort(effortLevel);

        this.logService.info('');
        this.logService.info('╔════════════════════════════════════════╗');
        this.logService.info('║  Launching Claude session              ║');
        this.logService.info('╚════════════════════════════════════════╝');
        this.logService.info(`  Channel ID: ${channelId}`);
        this.logService.info(`  Resume: ${resume || 'null'}`);
        this.logService.info(`  CWD: ${cwd}`);
        this.logService.info(`  Model: ${model || 'null'}`);
        this.logService.info(`  Permission: ${permissionMode ?? 'CLI default'}`);
        this.logService.info(`  Thinking Level: ${this.thinkingLevel}`);
        this.logService.info(`  Effort: ${effort ?? 'model default'}`);
        this.logService.info('');

        // Check whether it already exists
        if (this.channels.has(channelId)) {
            this.logService.error(`❌ Channel already exists: ${channelId}`);
            throw new Error(`Channel already exists: ${channelId}`);
        }

        try {
            // 1. Create the input stream
            this.logService.info('📝 Step 1: create input stream');
            const inputStream = new AsyncStream<SDKUserMessage>();
            this.logService.info('  ✓ Input stream created');

            // 2. Call spawnClaude
            this.logService.info('');
            this.logService.info('📝 Step 2: call spawnClaude()');

            // Deduplicate fatal stderr errors (no repeat push for the same channel within 3s)
            let lastStderrErrorTime = 0;
            const STDERR_ERROR_DEBOUNCE_MS = 3000;

            const query = await this.spawnClaude(
                inputStream,
                resume,
                async (toolName, input, options) => {
                    // Tool permission callback: ask the WebView to confirm via RPC
                    this.logService.info(`🔧 Tool permission request: ${toolName}`);
                    return this.requestToolPermission(
                        channelId,
                        toolName,
                        input,
                        options.suggestions || []
                    );
                },
                model,
                cwd,
                permissionMode,
                thinking,
                effort,
                // onStderrError: push fatal SDK stderr errors to the frontend in real time
                (error) => {
                    const now = Date.now();
                    if (now - lastStderrErrorTime < STDERR_ERROR_DEBOUNCE_MS) return;
                    lastStderrErrorTime = now;

                    this.logService.warn(`[ClaudeAgentService] Forwarding LLM request error to frontend: ${error.type} - ${error.message}`);
                    this.transport?.send({
                        type: "sdk_error",
                        channelId,
                        error: error.message,
                        statusCode: error.statusCode,
                        errorType: error.type,
                    });
                }
            );
            this.logService.info('  ✓ spawnClaude() done, Query object created');

            // 3. Store in the channels Map
            this.logService.info('');
            this.logService.info('📝 Step 3: register Channel');
            const channel: Channel = {
                in: inputStream,
                query: query,
                cwd
            };
            this.channels.set(channelId, channel);
            this.logService.info(`  ✓ Channel registered, ${this.channels.size} active session(s)`);

            // 4. Start the listener task: forward SDK output to the client
            this.logService.info('');
            this.logService.info('📝 Step 4: start message forwarding loop');
            (async () => {
                try {
                    this.logService.info(`  → Listening for Query output...`);
                    let messageCount = 0;

                    for await (const message of query) {
                        messageCount++;
                        this.logService.info(`  ← Received message #${messageCount}: ${message.type}`);
                        if (message.type === 'system' && message.subtype === 'init') {
                            channel.init = message;
                        }

                        this.transport!.send({
                            type: "io_message",
                            channelId,
                            message,
                            done: false
                        });
                    }

                    // Finished normally
                    this.logService.info(`  ✓ Query output complete, ${messageCount} message(s) total`);
                    this.closeChannel(channelId, true);
                } catch (error) {
                    // Error
                    this.logService.error(`  ❌ Query output error: ${error}`);
                    if (error instanceof Error) {
                        this.logService.error(`     Stack: ${error.stack}`);
                    }
                    this.closeChannel(channelId, true, String(error));
                }
            })();

            this.logService.info('');
            this.logService.info('✓ Claude session launched successfully');
            this.logService.info('════════════════════════════════════════');
            this.logService.info('');
        } catch (error) {
            this.logService.error('');
            this.logService.error('❌❌❌ Claude session launch failed ❌❌❌');
            this.logService.error(`Channel: ${channelId}`);
            this.logService.error(`Error: ${error}`);
            if (error instanceof Error) {
                this.logService.error(`Stack: ${error.stack}`);
            }
            this.logService.error('════════════════════════════════════════');
            this.logService.error('');

            this.closeChannel(channelId, true, String(error));
            throw error;
        }
    }

    /**
     * Interrupt a Claude session
     */
    async interruptClaude(channelId: string): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[ClaudeAgentService] Channel does not exist: ${channelId}`);
            return;
        }

        try {
            await this.sdkService.interrupt(channel.query);
            this.logService.info(`[ClaudeAgentService] Interrupted Channel: ${channelId}`);
        } catch (error) {
            this.logService.error(`[ClaudeAgentService] Interrupt failed:`, error);
        }
    }

    /**
     * Close a session
     */
    closeChannel(channelId: string, sendNotification: boolean, error?: string): void {
        this.logService.info(`[ClaudeAgentService] Closing Channel: ${channelId}`);

        // 1. Send the close notification
        if (sendNotification && this.transport) {
            this.transport.send({
                type: "close_channel",
                channelId,
                error
            });
        }

        // 2. Clean up the channel
        const channel = this.channels.get(channelId);
        if (channel) {
            channel.in.done();
            try {
                channel.query.return?.();
            } catch (e) {
                this.logService.warn(`Error cleaning up channel: ${e}`);
            }
            this.channels.delete(channelId);
        }

        this.logService.info(`  ✓ Channel closed, ${this.channels.size} active session(s) remaining`);
    }

    /**
     * Launch the Claude SDK
     *
     * @param inputStream input stream used to send user messages
     * @param resume session ID to resume
     * @param canUseTool tool permission callback
     * @param model model name
     * @param cwd working directory
     * @param permissionMode permission mode
     * @param thinking thinking config (undefined = CLI default)
     * @param effort effort level (undefined = model default)
     * @returns SDK Query object
     */
    protected async spawnClaude(
        inputStream: AsyncStream<SDKUserMessage>,
        resume: string | null,
        canUseTool: CanUseTool,
        model: string | null,
        cwd: string,
        permissionMode: string | undefined,
        thinking: ThinkingConfig | undefined,
        effort: EffortLevel | undefined,
        onStderrError?: SdkQueryParams['onStderrError']
    ): Promise<Query> {
        return this.sdkService.query({
            inputStream,
            resume,
            canUseTool,
            model,
            cwd,
            permissionMode,
            thinking,
            effort,
            onStderrError
        });
    }

    /**
     * Close all sessions
     */
    async closeAllChannels(): Promise<void> {
        const promises = Array.from(this.channels.keys()).map(channelId =>
            this.closeChannel(channelId, false)
        );
        await Promise.all(promises);
        this.channels.clear();
    }

    /**
     * Close all channels when credentials change
     */
    async closeAllChannelsWithCredentialChange(): Promise<void> {
        const promises = Array.from(this.channels.keys()).map(channelId =>
            this.closeChannel(channelId, true)
        );
        await Promise.all(promises);
        this.channels.clear();
    }

    /**
     * Deliver a message to a Channel
     */
    private transportMessage(
        channelId: string,
        message: SDKMessage | SDKUserMessage,
        done: boolean
    ): void {
        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error(`Channel not found: ${channelId}`);
        }

        // Push the user message onto the input stream
        if (message.type === "user") {
            channel.in.enqueue(message as SDKUserMessage);
        }

        // If marked as done, close the input stream
        if (done) {
            channel.in.done();
        }
    }

    /**
     * Handle a request from the client
     */
    private async handleRequest(message: RequestMessage): Promise<void> {
        const abortController = new AbortController();
        this.abortControllers.set(message.requestId, abortController);

        try {
            const response = await this.processRequest(message, abortController.signal);
            this.transport!.send({
                type: "response",
                requestId: message.requestId,
                response,
                webviewId: message.webviewId
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.transport!.send({
                type: "response",
                requestId: message.requestId,
                response: {
                    type: "error",
                    error: errorMsg
                },
                webviewId: message.webviewId
            });
        } finally {
            this.abortControllers.delete(message.requestId);
        }
    }

    /**
     * Handle a request
     */
    async processRequest(message: RequestMessage, signal: AbortSignal): Promise<unknown> {
        const request = message.request;
        const channelId = message.channelId;

        if (!request || typeof request !== 'object' || !('type' in request)) {
            throw new Error('Invalid request format');
        }

        this.logService.info(`[ClaudeAgentService] Handling request: ${request.type}`);

        // Routing table: maps request types to handlers
        switch (request.type) {
            // Initialization and state
            case "init":
                return handleInit(request, this.handlerContext);

            case "get_claude_state":
                return handleGetClaudeState(request, this.handlerContext);

            case "sdk_probe":
                return handleSdkProbe(request as any, this.handlerContext);

            case "get_mcp_servers":
                return this.getMcpServers(channelId);

            case "mcp_server_action":
                return this.mcpServerAction(channelId, request as McpServerActionRequest);

            case "get_output_styles":
                return this.getOutputStyles(channelId);

            case "get_status":
                return this.getStatus(channelId);

            case "get_memory_files":
                return handleGetMemoryFiles(request, this.handlerContext);

            case "open_claude_file":
                return handleOpenClaudeFile(request, this.handlerContext);

            case "get_hooks":
                return handleGetHooks(request, this.handlerContext);

            case "export_conversation":
                return handleExportConversation(request, this.handlerContext);

            case "get_config_options":
                return this.getConfigOptions(channelId);

            case "get_context_usage":
                return this.getContextUsage(channelId);

            case "get_applied_effort":
                return this.getAppliedEffort(channelId);

            case "get_asset_uris":
                return handleGetAssetUris(request, this.handlerContext);

            // Editor operations
            case "open_file":
                return handleOpenFile(request, this.handlerContext);

            case "get_current_selection":
                return handleGetCurrentSelection(this.handlerContext);

            case "open_diff":
                return handleOpenDiff(request, this.handlerContext, signal);

            case "open_content":
                return handleOpenContent(request, this.handlerContext, signal);

            // UI operations
            case "show_notification":
                return handleShowNotification(request, this.handlerContext);

            case "new_conversation_tab":
                return handleNewConversationTab(request, this.handlerContext, message.webviewId);

            case "rename_tab":
                return handleRenameTab(request, this.handlerContext, message.webviewId);

            case "open_url":
                return handleOpenURL(request, this.handlerContext);

            // Settings
            case "set_permission_mode": {
                if (!channelId) {
                    throw new Error('channelId is required for set_permission_mode');
                }
                const permReq = request as any;
                await this.setPermissionMode(channelId, permReq.mode);
                return {
                    type: "set_permission_mode_response",
                    success: true
                };
            }

            case "set_model": {
                if (!channelId) {
                    throw new Error('channelId is required for set_model');
                }
                const modelReq = request as any;
                const targetModel = modelReq.model?.value ?? "";
                if (!targetModel) {
                    throw new Error("Invalid model selection");
                }
                await this.setModel(channelId, targetModel);
                return {
                    type: "set_model_response",
                    success: true
                };
            }

            case "set_thinking_level": {
                if (!channelId) {
                    throw new Error('channelId is required for set_thinking_level');
                }
                const thinkReq = request as any;
                await this.setThinkingLevel(channelId, thinkReq.thinkingLevel);
                return {
                    type: "set_thinking_level_response"
                };
            }

            case "set_effort_level": {
                if (!channelId) {
                    throw new Error('channelId is required for set_effort_level');
                }
                await this.setEffortLevel(
                    channelId,
                    (request as any).effortLevel ?? null,
                    (request as any).persist === true
                );
                return {
                    type: "set_effort_level_response"
                };
            }

            case "open_config_file":
                return handleOpenConfigFile(request, this.handlerContext);

            // Settings persistence
            case "get_settings":
                return handleGetSettings(request, this.handlerContext);

            case "update_setting":
                return handleUpdateSetting(request, this.handlerContext);

            case "reset_setting":
                return handleResetSetting(request, this.handlerContext);

            // Profile management
            case "switch_profile":
                return handleSwitchProfile(request, this.handlerContext);

            case "create_profile":
                return handleCreateProfile(request, this.handlerContext);

            case "delete_profile":
                return handleDeleteProfile(request, this.handlerContext);

            // Extension config (~/.claude/ai-cli-diff-view-ui.json)
            case "get_extension_config":
                return handleGetExtensionConfig(request, this.handlerContext);

            case "update_extension_config":
                return handleUpdateExtensionConfig(request, this.handlerContext);

            // Session management
            case "list_sessions_request":
                return handleListSessions(request, this.handlerContext);

            case "get_session_request":
                return handleGetSession(request, this.handlerContext);

        // File operations
        case "list_files_request":
            return handleListFiles(request, this.handlerContext);

        case "stat_path_request":
            return handleStatPath(request as any, this.handlerContext);

            // Process operations
            case "exec":
                return handleExec(request, this.handlerContext);

            // case "open_claude_in_terminal":
            //     return handleOpenClaudeInTerminal(request, this.handlerContext);

            // Authentication
            // case "get_auth_status":
            //     return handleGetAuthStatus(request, this.handlerContext);

            // case "login":
            //     return handleLogin(request, this.handlerContext);

            // case "submit_oauth_code":
            //     return handleSubmitOAuthCode(request, this.handlerContext);

            default:
                throw new Error(`Unknown request type: ${request.type}`);
        }
    }

    /**
     * Handle a response
     */
    private handleResponse(message: ResponseMessage): void {
        const handler = this.outstandingRequests.get(message.requestId);
        if (handler) {
            const response = message.response;
            if (typeof response === 'object' && response !== null && 'type' in response && response.type === "error") {
                handler.reject(new Error((response as { error: string }).error));
            } else {
                handler.resolve(response);
            }
            this.outstandingRequests.delete(message.requestId);
        } else {
            this.logService.warn(`[ClaudeAgentService] No request handler found: ${message.requestId}`);
        }
    }

    /**
     * Handle a cancellation
     */
    private handleCancellation(requestId: string): void {
        const abortController = this.abortControllers.get(requestId);
        if (abortController) {
            abortController.abort();
            this.abortControllers.delete(requestId);
        }
    }

    /**
     * Send a request to the client
     */
    protected sendRequest<TRequest extends ExtensionRequest, TResponse>(
        channelId: string,
        request: TRequest
    ): Promise<TResponse> {
        const requestId = this.generateId();

        return new Promise<TResponse>((resolve, reject) => {
            // Register the Promise handlers
            this.outstandingRequests.set(requestId, { resolve, reject });

            // Send the request
            this.transport!.send({
                type: "request",
                channelId,
                requestId,
                request
            } as RequestMessage);
        }).finally(() => {
            // Clean up
            this.outstandingRequests.delete(requestId);
        });
    }

    /**
     * Request tool permission
     */
    protected async requestToolPermission(
        channelId: string,
        toolName: string,
        inputs: Record<string, unknown>,
        suggestions: PermissionUpdate[]
    ): Promise<PermissionResult> {
        const request: ToolPermissionRequest = {
            type: "tool_permission_request",
            toolName,
            inputs,
            suggestions
        };

        const response = await this.sendRequest<ToolPermissionRequest, ToolPermissionResponse>(
            channelId,
            request
        );

        return response.result;
    }

    /**
     * Shut down the service
     */
    async shutdown(): Promise<void> {
        await this.closeAllChannels();
        this.fromClientStream.done();
    }

    // ========================================================================
    // Utility methods
    // ========================================================================

    /**
     * Generate a unique ID
     */
    private generateId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    /**
     * Get the current working directory
     */
    private getCwd(): string {
        return this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    }

    /**
     * Thinking config for a level. "On" leaves the choice to the CLI (adaptive
     * thinking on models that support it, otherwise the user's settings) rather
     * than forcing a fixed budget; models that cannot turn thinking off
     * (ModelInfo.supportsThinkingOff === false) ignore "off" and the UI hides the toggle.
     */
    private getThinkingConfig(level: string): ThinkingConfig | undefined {
        return level === 'off' ? { type: 'disabled' } : undefined;
    }

    /**
     * Set the thinking level
     */
    async setThinkingLevel(channelId: string, level: string): Promise<void> {
        this.thinkingLevel = level;

        // Update running channels. setMaxThinkingTokens is the only live control:
        // 0 disables thinking, null clears the limit (back to the CLI default).
        const channel = this.channels.get(channelId);
        if (channel?.query) {
            const maxTokens = level === 'off' ? 0 : null;
            await channel.query.setMaxThinkingTokens(maxTokens);
            this.logService.info(`[setThinkingLevel] Updated channel ${channelId} to ${level}`);
        }
    }

    /**
     * Set the effort level on a running channel (applies from the next turn).
     * The value is passed through as the CLI lists it; null goes back to the
     * model's default.
     */
    async setEffortLevel(channelId: string, level: string | null, persist = false): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel?.query) {
            return;
        }
        const effort = toEffort(level) ?? null;
        await channel.query.applyFlagSettings({ effortLevel: effort });
        this.logService.info(`[setEffortLevel] Set channel ${channelId} to effort: ${effort ?? 'model default'}`);

        // updateSettings saves the model's default only; the running level was set above.
        if (persist && effort && effort !== 'max') {
            try {
                await channel.query.updateSettings('userSettings', { effortLevel: effort });
                this.logService.info(`[setEffortLevel] Saved ${effort} as the current model's default`);
            } catch (error) {
                this.logService.warn(`[setEffortLevel] Could not save default: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * Set the permission mode
     */
    async setPermissionMode(channelId: string, mode: PermissionMode): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[setPermissionMode] Channel ${channelId} not found`);
            throw new Error(`Channel ${channelId} not found`);
        }

        await channel.query.setPermissionMode(mode);
        this.logService.info(`[setPermissionMode] Set channel ${channelId} to mode: ${mode}`);
    }

    /**
     * Effort the CLI applies to the next message (what `/effort <level>` set,
     * after org caps / model downgrades). Read back after a local `/effort`
     * so the effort picker follows the CLI instead of keeping its own copy.
     */
    async getAppliedEffort(channelId?: string): Promise<GetAppliedEffortResponse> {
        const channel = channelId ? this.channels.get(channelId) : undefined;
        if (!channel?.query) {
            return { type: "get_applied_effort_response", effort: undefined };
        }
        try {
            // Implemented by the SDK's Query but missing from its type declarations
            const query = channel.query as { getSettings?: () => Promise<any> };
            if (typeof query.getSettings !== 'function') {
                return { type: "get_applied_effort_response", effort: undefined };
            }
            const settings = await query.getSettings();
            const effort = settings?.applied?.effort;
            return {
                type: "get_applied_effort_response",
                effort: typeof effort === 'string' || effort === null ? effort : undefined
            };
        } catch (error) {
            this.logService.warn(`[getAppliedEffort] ${error instanceof Error ? error.message : String(error)}`);
            return { type: "get_applied_effort_response", effort: undefined };
        }
    }

    /**
     * Context usage straight from the CLI (same numbers as `/context`): the
     * window is the model's real one (200K / 1M ...) and the total covers the
     * main conversation only. 'summary' answers from the last response's usage
     * without extra token-count API calls, so it is cheap enough per turn.
     */
    async getContextUsage(channelId?: string): Promise<GetContextUsageResponse> {
        const channel = channelId ? this.channels.get(channelId) : undefined;
        if (!channel?.query) {
            return { type: "get_context_usage_response", usage: null };
        }
        try {
            const r = await channel.query.getContextUsage({ detail: 'summary' });
            return {
                type: "get_context_usage_response",
                usage: {
                    totalTokens: r.totalTokens,
                    maxTokens: r.maxTokens,
                    rawMaxTokens: r.rawMaxTokens,
                    percentage: r.percentage,
                    model: r.model
                }
            };
        } catch (error) {
            this.logService.warn(`[getContextUsage] ${error instanceof Error ? error.message : String(error)}`);
            return { type: "get_context_usage_response", usage: null };
        }
    }

    /**
     * MCP servers of the running session (`/mcp`), as the CLI reports them.
     * Empty when the channel has no live query.
     */
    async getMcpServers(channelId?: string): Promise<GetMcpServersResponse> {
        const channel = channelId ? this.channels.get(channelId) : undefined;
        if (!channel?.query) {
            return { type: "get_mcp_servers_response", mcpServers: [] };
        }
        try {
            const servers = await channel.query.mcpServerStatus();
            return {
                type: "get_mcp_servers_response",
                mcpServers: servers.map((s) => ({
                    name: s.name,
                    status: s.status,
                    error: s.error,
                    scope: s.scope,
                    toolCount: s.tools?.length
                }))
            };
        } catch (error) {
            this.logService.warn(`[getMcpServers] ${error instanceof Error ? error.message : String(error)}`);
            return { type: "get_mcp_servers_response", mcpServers: [] };
        }
    }

    /** `/mcp reconnect|enable|disable <server>`; the error text is the CLI's own. */
    async mcpServerAction(channelId: string | undefined, request: McpServerActionRequest): Promise<McpServerActionResponse> {
        const channel = channelId ? this.channels.get(channelId) : undefined;
        if (!channel?.query) {
            return { type: "mcp_server_action_response", ok: false, error: 'No running session' };
        }
        try {
            if (request.action === 'reconnect') {
                await channel.query.reconnectMcpServer(request.serverName);
            } else {
                await channel.query.toggleMcpServer(request.serverName, request.action === 'enable');
            }
            return { type: "mcp_server_action_response", ok: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logService.warn(`[mcpServerAction] ${request.action} ${request.serverName}: ${message}`);
            return { type: "mcp_server_action_response", ok: false, error: message };
        }
    }

    /** Keys and values of `/config`, read once per CLI (they only change with it) */
    private configOptions?: Promise<ConfigOption[]>;

    /**
     * `/config` panel data. The list comes from the usage text of a bare
     * `/config`, run in a throwaway CLI (sending it on the session would put a
     * message in the chat); current values from the session's effective settings.
     */
    async getConfigOptions(channelId?: string): Promise<GetConfigOptionsResponse> {
        if (!this.configOptions) {
            this.configOptions = this.sdkService
                .runLocalCommand(this.getCwd(), '/config')
                .then(parseConfigUsage);
            // A failed read is retried on the next open
            this.configOptions.catch(() => { this.configOptions = undefined; });
        }

        let options: ConfigOption[];
        try {
            options = await this.configOptions;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logService.warn(`[getConfigOptions] ${message}`);
            return { type: "get_config_options_response", options: [], current: {}, error: message };
        }
        if (options.length === 0) {
            this.configOptions = undefined;
        }

        let effective: Record<string, any> | undefined;
        const channel = channelId ? this.channels.get(channelId) : undefined;
        try {
            const query = channel?.query as { getSettings?: () => Promise<any> } | undefined;
            effective = query?.getSettings ? (await query.getSettings())?.effective : undefined;
        } catch (error) {
            this.logService.warn(`[getConfigOptions] settings: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Only values the key accepts, in the CLI's spelling
        const current: Record<string, string> = {};
        const read = readConfigValues(options.map((o) => o.key), effective);
        for (const option of options) {
            const value = read[option.key];
            if (value === undefined) {
                continue;
            }
            const match = option.values === null
                ? value
                : option.values.find((v) => v.toLowerCase() === value.toLowerCase());
            if (match !== undefined) {
                current[option.key] = match;
            }
        }

        return { type: "get_config_options_response", options, current };
    }

    /**
     * `/status`. Version, model and cwd come from the channel's last
     * system/init (sent once the CLI starts a turn); account and MCP are asked
     * live. Each part that fails is just left out.
     */
    async getStatus(channelId?: string): Promise<GetStatusResponse> {
        const channel = channelId ? this.channels.get(channelId) : undefined;
        const init = channel?.init;
        const cwd = init?.cwd || channel?.cwd || this.getCwd();
        const warn = (what: string, error: unknown) =>
            this.logService.warn(`[getStatus] ${what}: ${error instanceof Error ? error.message : String(error)}`);

        let account: GetStatusResponse['status']['account'];
        let outputStyle = init?.output_style;
        let mcpServers: GetStatusResponse['status']['mcpServers'] = [];
        if (channel?.query) {
            const [accountResult, initResult, mcpResult] = await Promise.allSettled([
                channel.query.accountInfo(),
                channel.query.initializationResult(),
                this.getMcpServers(channelId)
            ]);
            if (accountResult.status === 'fulfilled') account = accountResult.value;
            else warn('account', accountResult.reason);
            if (initResult.status === 'fulfilled') outputStyle ??= initResult.value.output_style;
            else warn('init', initResult.reason);
            if (mcpResult.status === 'fulfilled') mcpServers = mcpResult.value.mcpServers;
        }

        return {
            type: "get_status_response",
            status: {
                version: init?.claude_code_version,
                cwd,
                model: init?.model,
                permissionMode: init?.permissionMode,
                outputStyle,
                apiKeySource: init?.apiKeySource,
                account,
                mcpServers,
                plugins: (init?.plugins ?? []).map((p) => ({ name: p.name, version: p.version })),
                settingsFiles: settingsFiles(cwd),
                memoryFiles: memoryFiles(cwd).filter((f) => f.exists)
            }
        };
    }

    /** Output styles for the `/output-style` picker (`initializationResult()`). */
    async getOutputStyles(channelId?: string): Promise<GetOutputStylesResponse> {
        const channel = channelId ? this.channels.get(channelId) : undefined;
        if (!channel?.query) {
            return { type: "get_output_styles_response", available: [] };
        }
        try {
            const init = await channel.query.initializationResult();
            return {
                type: "get_output_styles_response",
                current: init.output_style,
                available: Array.isArray(init.available_output_styles) ? init.available_output_styles : []
            };
        } catch (error) {
            this.logService.warn(`[getOutputStyles] ${error instanceof Error ? error.message : String(error)}`);
            return { type: "get_output_styles_response", available: [] };
        }
    }

    /**
     * Set the model
     */
    async setModel(channelId: string, model: string): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[setModel] Channel ${channelId} not found`);
            throw new Error(`Channel ${channelId} not found`);
        }

        // Apply the model to the channel
        await channel.query.setModel(model);

        this.logService.info(`[setModel] Set channel ${channelId} to model: ${model}`);
    }
}
