/**
 * ClaudeSdkService - thin wrapper around the Claude Agent SDK
 *
 * Responsibilities:
 * 1. Wrap the query() call of @anthropic-ai/claude-agent-sdk
 * 2. Build the SDK Options object
 * 3. Handle parameter conversion and environment setup
 * 4. Provide interrupt() to abort a query
 *
 * Dependencies:
 * - ILogService: logging service
 * - IConfigurationService: configuration service
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IFileSystemService } from '../fileSystemService';
import { AsyncStream } from './transport';
import { loadClaudeSdk } from '../../sdkLoader';
import { describeMissingCli, locateClaudeCli } from '../../cliLocator';

// SDK type imports
import type {
    Options,
    Query,
    CanUseTool,
    PermissionMode,
    SDKUserMessage,
    HookCallbackMatcher,
    ThinkingConfig,
    EffortLevel,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * `ai-cli-diff-view.claudeAllowBypassPermissions`: offer "Bypass permissions"
 * in Claude UI tabs (passed to the CLI as allowDangerouslySkipPermissions).
 */
export function allowBypassPermissions(): boolean {
    return vscode.workspace
        .getConfiguration('ai-cli-diff-view')
        .get<boolean>('claudeAllowBypassPermissions', false);
}

export const IClaudeSdkService = createDecorator<IClaudeSdkService>('claudeSdkService');

/**
 * SDK query parameters
 */
/**
 * Fatal error parsed from stderr
 */
export interface LLMRequestError {
    statusCode: string;    // HTTP status code (e.g. "401", "503")
    message: string;       // human-readable error description
    type: string;          // upstream error type (e.g. "authentication_error", "new_api_error")
    raw: string;           // raw stderr line
}

export interface SdkQueryParams {
    inputStream: AsyncStream<SDKUserMessage>;
    resume: string | null;
    canUseTool: CanUseTool;
    model: string | null;  // ← accepts null, converted internally
    cwd: string;
    /** undefined = let the CLI pick (settings `permissions.defaultMode`) */
    permissionMode?: PermissionMode | string;
    /** undefined = the CLI's default (adaptive where the model supports it) */
    thinking?: ThinkingConfig;
    /** undefined = the model's default effort */
    effort?: EffortLevel;
    /** Callback invoked when stderr shows a fatal error (streaming request fallback failed) */
    onStderrError?: (error: LLMRequestError) => void;
}

export interface SdkProbeParams {
    capabilities: string[];
    cwd: string;
    timeoutMs?: number;
}

export interface SdkProbeResult {
    data: Record<string, any>;
    errors?: Record<string, string>;
}

/**
 * SDK service interface
 */
export interface IClaudeSdkService {
    readonly _serviceBrand: undefined;

    /**
     * Query Claude through the SDK
     */
    query(params: SdkQueryParams): Promise<Query>;

    /**
     * Probe SDK capabilities once and release immediately
     */
    probe(params: SdkProbeParams): Promise<SdkProbeResult>;

    /**
     * Run one local slash command (e.g. bare `/config`) in a throwaway CLI
     * process and return its text output. No session is saved and no model is
     * called; meant for reading what the CLI prints, not for changing state.
     */
    runLocalCommand(cwd: string, command: string, timeoutMs?: number): Promise<string>;

    /**
     * Interrupt the running query
     */
    interrupt(query: Query): Promise<void>;

    /**
     * Called before Claude writes a file (PreToolUse), so the diff view has the
     * file's content from before the edit.
     */
    setBeforeFileWrite(callback: ((filePath: string) => Promise<void> | void) | undefined): void;
}

/** CLI flag-settings overlay, passed with --settings (profile switching writes here). */
const FLAG_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'ai-cli-diff-view-settings.json');

const VS_CODE_APPEND_PROMPT = `
  # VSCode Extension Context

  You are running inside a VSCode native extension environment.

  ## Code References in Text
  IMPORTANT: When referencing files or code locations, use markdown link syntax to make them clickable:
  - For files: [filename.ts](src/filename.ts)
  - For specific lines: [filename.ts:42](src/filename.ts#L42)
  - For a range of lines: [filename.ts:42-51](src/filename.ts#L42-L51)
  - For folders: [src/utils/](src/utils/)
  Unless explicitly asked for by the user, DO NOT USE backtickets \` or HTML tags like code for file references - always use markdown [text](link) format.
  The URL links should be relative paths from the root of  the user's workspace.

  ## User Selection Context
  The user's IDE selection (if any) is included in the conversation context and marked with ide_selection tags. This represents code or text the user has highlighted in their editor and may or may not be relevant to their request.`;

const SDK_PROBE_CAPABILITIES: Record<string, (query: Query) => Promise<any>> = {
    supportedCommands: (query) => query.supportedCommands?.(),
    supportedModels: (query) => query.supportedModels?.(),
    mcpServerStatus: (query) => query.mcpServerStatus?.(),
    accountInfo: (query) => query.accountInfo?.()
};

/**
 * ClaudeSdkService implementation
 */
export class ClaudeSdkService implements IClaudeSdkService {
    readonly _serviceBrand: undefined;

    private beforeFileWrite?: (filePath: string) => Promise<void> | void;

    constructor(
        private readonly context: vscode.ExtensionContext,
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService,
        @IFileSystemService private readonly fileSystemService: IFileSystemService
    ) {
        this.logService.info('[ClaudeSdkService] Initialized');
    }

    /**
     * Query Claude through the SDK
     */
    async query(params: SdkQueryParams): Promise<Query> {
        const { inputStream, resume, canUseTool, model, cwd, permissionMode, thinking, effort, onStderrError } = params;

        this.logService.info('========================================');
        this.logService.info('ClaudeSdkService.query() called');
        this.logService.info('========================================');
        this.logService.info(`📋 Input parameters:`);
        this.logService.info(`  - model: ${model}`);
        this.logService.info(`  - cwd: ${cwd}`);
        this.logService.info(`  - permissionMode: ${permissionMode}`);
        this.logService.info(`  - resume: ${resume}`);
        this.logService.info(`  - thinking: ${thinking ? JSON.stringify(thinking) : 'CLI default'}`);
        this.logService.info(`  - effort: ${effort ?? 'model default'}`);

        // Parameter conversion
        const modelParam = model === null ? "default" : model;
        const permissionModeParam = permissionMode as PermissionMode | undefined;
        const cwdParam = cwd;

        this.logService.info(`🔄 Converted parameters:`);
        this.logService.info(`  - modelParam: ${modelParam}`);
        this.logService.info(`  - permissionModeParam: ${permissionModeParam}`);
        this.logService.info(`  - cwdParam: ${cwdParam}`);

        // Get the CLI path (avoids a TypeScript type inference issue)
        const cliPath = await this.getClaudeExecutablePath();

        // Get environment variables
        const env = await this.getMergedEnvironmentVariables();

        // Values are never logged: the environment carries API keys and tokens.
        this.logService.info(`🌍 Environment variables: ${Object.keys(env).length} entries`);

        // Log the CLI path
        this.logService.info(`📂 CLI executable and config:`);
        this.logService.info(`  - CLI Path: ${cliPath}`);
        this.logService.info(`  - Settings Path: ${FLAG_SETTINGS_PATH}`);

        // Check that the CLI exists
        if (!(await this.fileSystemService.pathExists(cliPath))) {
          this.logService.error(`❌ Claude CLI not found at: ${cliPath}`);
          throw new Error(`Claude CLI not found at: ${cliPath}`);
        }
        this.logService.info(`  ✓ CLI file exists`);

        // Check file permissions
        try {
          const stats = await this.fileSystemService.stat(vscode.Uri.file(cliPath));
          const isExec = await this.fileSystemService.isExecutable(cliPath);
          this.logService.info(`  - File size: ${stats.size} bytes`);
          this.logService.info(`  - Is executable: ${isExec}`);
        } catch (e) {
          this.logService.warn(`  ⚠ Could not check file stats: ${e}`);
        }

        // Build SDK Options
        const options: Options = {
            // Basic parameters
            cwd: cwdParam,
            resume: resume || undefined,
            model: modelParam,
            permissionMode: permissionModeParam,
            // Without this the CLI refuses a later switch to bypassPermissions.
            allowDangerouslySkipPermissions: allowBypassPermissions(),
            thinking,
            effort,

            // CanUseTool callback
            canUseTool,

            // Log callback - captures all stderr output of the SDK process
            stderr: (data: string) => {
                const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
                const lines = data.trim().split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // Detect the error level
                    const lowerLine = line.toLowerCase();
                    let level = 'INFO';

                    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception')) {
                        level = 'ERROR';
                    } else if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
                        level = 'WARN';
                    } else if (lowerLine.includes('exit') || lowerLine.includes('terminated')) {
                        level = 'EXIT';
                    }

                    this.logService.info(`[${timestamp}] [SDK ${level}] ${line}`);

                    // Detect streaming request fallback errors:
                    // "Error streaming, falling back to non-streaming mode: {statusCode} {json}"
                    if (onStderrError) {
                        const streamingErrorMatch = line.match(
                            /Error streaming, falling back to non-streaming mode:\s*(\d+)\s*(.*)/
                        );
                        if (streamingErrorMatch) {
                            const statusCode = streamingErrorMatch[1];
                            const rest = streamingErrorMatch[2];

                            let message = `HTTP ${statusCode}`;
                            let errorType = 'unknown';
                            try {
                                const jsonMatch = rest.match(/(\{[\s\S]*\})/);
                                if (jsonMatch) {
                                    const parsed = JSON.parse(jsonMatch[1]);
                                    const err = parsed.error || parsed;
                                    message = err.message || err.msg || message;
                                    errorType = err.type || err.code || errorType;
                                }
                            } catch { /* non-JSON tail, use statusCode as message */ }

                            onStderrError({ statusCode, message, type: errorType, raw: line });
                        }
                    }
                }
            },

            // Environment variables
            env,

            // Appended system prompt
            systemPrompt: {
                type: 'preset',
                preset: 'claude_code',
                append: VS_CODE_APPEND_PROMPT
            },

            // Hooks
            hooks: {
                // PreToolUse: before a tool runs
                PreToolUse: [{
                    matcher: "Edit|Write|MultiEdit|NotebookEdit",
                    hooks: [async (input, toolUseID, options) => {
                        if ('tool_name' in input) {
                            this.logService.info(`[Hook] PreToolUse: ${input.tool_name}`);
                        }
                        await this.snapshotBeforeWrite(input);
                        return { continue: true };
                    }]
                }] as HookCallbackMatcher[],
                // PostToolUse: after a tool runs
                PostToolUse: [{
                    matcher: "Edit|Write|MultiEdit",
                    hooks: [async (input, toolUseID, options) => {
                        if ('tool_name' in input) {
                            this.logService.info(`[Hook] PostToolUse: ${input.tool_name}`);
                        }
                        return { continue: true };
                    }]
                }] as HookCallbackMatcher[]
            },

            // CLI executable path
            pathToClaudeCodeExecutable: cliPath,

            // Extra arguments
            // --settings points to ai-cli-diff-view-settings.json; Profile switches sync content into this file via ConfigurationService
            // The CLI watches this file for changes, giving hot reload
            extraArgs: {
              'debug': null,
              'debug-to-stderr': null,
              // 'enable-auth-status': null,
              'settings': FLAG_SETTINGS_PATH,
            } as Record<string, string | null>,

            // Setting sources (control loading of CLAUDE.md and settings.json)
            // 'user': ~/.claude/settings.json, ~/.claude/CLAUDE.md
            // 'project': .claude/settings.json, .claude/CLAUDE.md
            // 'local': .claude/settings.local.json, CLAUDE.local.md
            // Note: ai-cli-diff-view-settings.json is passed via extraArgs.settings and, as flagSettings, has the highest priority
            settingSources: ['user', 'project', 'local'],

            includePartialMessages: true
        };

        // Call the SDK
        this.logService.info('');
        this.logService.info('🚀 Preparing to call the Claude Agent SDK');
        this.logService.info('----------------------------------------');

        // Set the entrypoint environment variable
        process.env.CLAUDE_CODE_ENTRYPOINT = 'claude-vscode';
        this.logService.info(`🔧 Environment variables:`);
        this.logService.info(`  - CLAUDE_CODE_ENTRYPOINT: ${process.env.CLAUDE_CODE_ENTRYPOINT}`);

        this.logService.info('');
        this.logService.info('📦 Importing SDK...');

        try {
            // Call the SDK query() function
            const { query } = await loadClaudeSdk();

            this.logService.info(`  - Options: [configured: ${Object.keys(options).join(', ')}]`);

            const result = query({ prompt: inputStream, options });
            return result;
        } catch (error) {
            this.logService.error('');
            this.logService.error('❌❌❌ SDK call failed ❌❌❌');
            this.logService.error(`Error: ${error}`);
            if (error instanceof Error) {
                this.logService.error(`Message: ${error.message}`);
                this.logService.error(`Stack: ${error.stack}`);
            }
            this.logService.error('========================================');
            throw error;
        }
    }

    /**
     * Probe SDK capabilities once and release immediately (lightweight version)
     */
    async probe(params: SdkProbeParams): Promise<SdkProbeResult> {
        const capabilities = Array.from(new Set(params.capabilities ?? [])).filter(Boolean);
        if (capabilities.length === 0) {
            return { data: {} };
        }

        const timeoutMs = Math.max(1000, params.timeoutMs ?? 10000);
        const data: Record<string, any> = {};
        const errors: Record<string, string> = {};

        let query: Query | undefined;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        try {
            await Promise.race([
                (async () => {
                    // Use a lightweight query
                    query = await this.queryLite(params.cwd);

                    for (const capability of capabilities) {
                        const handler = SDK_PROBE_CAPABILITIES[capability];
                        if (!handler) {
                            errors[capability] = 'Unsupported capability';
                            continue;
                        }

                        try {
                            data[capability] = await handler(query);
                        } catch (error) {
                            errors[capability] = error instanceof Error ? error.message : String(error);
                        }
                    }
                })(),
                new Promise<void>((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error('SDK probe timed out'));
                    }, timeoutMs);
                })
            ]);
        } catch (error) {
            if (query) {
                try {
                    await this.interrupt(query);
                } catch {
                    // Silently ignore interrupt errors
                }
            }
            throw error;
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (query?.return) {
                try {
                    await query.return();
                } catch {
                    // Silently ignore close errors
                }
            }
        }

        // Print the probe result
        // this.logService.info(`[Probe] Result: ${JSON.stringify(data, null, 2)}`);

        return {
            data,
            errors: Object.keys(errors).length ? errors : undefined
        };
    }

    /**
     * Lightweight SDK query (probe only)
     * No logging, no hooks, minimal config
     */
    async runLocalCommand(cwd: string, command: string, timeoutMs = 15000): Promise<string> {
        const inputStream = new AsyncStream<SDKUserMessage>();
        inputStream.enqueue({
            type: 'user',
            session_id: '',
            parent_tool_use_id: null,
            message: { role: 'user', content: [{ type: 'text', text: command }] }
        });
        inputStream.done();

        const query = await this.queryLite(cwd, inputStream, { persistSession: false });
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                (async () => {
                    for await (const message of query) {
                        if (message.type === 'result') {
                            return message.subtype === 'success' ? message.result : '';
                        }
                    }
                    return '';
                })(),
                new Promise<string>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`${command} timed out`)), timeoutMs);
                })
            ]);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            try {
                await query.return?.();
            } catch {
                // Silently ignore close errors
            }
        }
    }

    /** `inputStream` omitted: no messages (the probe), the stream is closed at once. */
    private async queryLite(
        cwd: string,
        inputStream?: AsyncStream<SDKUserMessage>,
        extra: Partial<Options> = {}
    ): Promise<Query> {
        if (!inputStream) {
            inputStream = new AsyncStream<SDKUserMessage>();
            inputStream.done();
        }

        const cliPath = await this.getClaudeExecutablePath();

        // Same environment and setting sources as a real session: the model
        // list (and each model's effort/thinking/auto-mode capabilities) depends
        // on the provider, ANTHROPIC_* variables and settings such as
        // `availableModels`, so a bare probe could describe different models.
        const env = await this.getMergedEnvironmentVariables();

        const options: Options = {
            // Minimal config
            cwd,
            env,

            // Permission callback (always deny)
            canUseTool: async () => ({
                behavior: 'deny' as const,
                message: 'SDK probe only'
            }),

            settingSources: ['user', 'project', 'local'],

            // No stderr output
            stderr: () => {},

            // CLI path
            pathToClaudeCodeExecutable: cliPath,

            // Profile overlay, as for a real session (no debug flags)
            extraArgs: { 'settings': FLAG_SETTINGS_PATH } as Record<string, string | null>,

            // No partial messages
            includePartialMessages: false,

            // No hooks
            hooks: {},

            ...extra
        };

        const { query } = await loadClaudeSdk();
        return query({ prompt: inputStream, options });
    }

    /**
     * Interrupt the running query
     */
    async interrupt(query: Query): Promise<void> {
        try {
            this.logService.info('🛑 Interrupting Claude SDK query');
            await query.interrupt();
            this.logService.info('✓ Query interrupted');
        } catch (error) {
            this.logService.error(`❌ Failed to interrupt query: ${error}`);
            throw error;
        }
    }

    /**
     * Get the merged environment variables (process.env + custom)
     */
    private async getMergedEnvironmentVariables(): Promise<Record<string, string>> {
        const customVars = await this.configService.getEnvironmentVariables();

        // Safely merge process.env (filtering out undefined)
        const env: Record<string, string> = {
          // CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL: '1'
          // ANTHROPIC_BASE_URL: 'https://anyrouter.top',
          // ANTHROPIC_AUTH_TOKEN: 'sk-PNPwKAii2iEHlPxERYW8zt4xMH60O9iHVFJRbg7z9rnur8HG',
        };
        Object.entries(process.env).forEach(([key, value]) => {
            if (value !== undefined) {
                env[key] = value;
            }
        });

      return { ...env, ...customVars };
    }

    setBeforeFileWrite(callback: ((filePath: string) => Promise<void> | void) | undefined): void {
        this.beforeFileWrite = callback;
    }

    private async snapshotBeforeWrite(input: unknown): Promise<void> {
        if (!this.beforeFileWrite) {
            return;
        }
        const toolInput = (input as { tool_input?: Record<string, unknown> } | undefined)?.tool_input;
        const filePath = toolInput?.file_path ?? toolInput?.notebook_path;
        if (typeof filePath !== 'string' || !filePath) {
            return;
        }
        try {
            await this.beforeFileWrite(filePath);
        } catch {
            // A missing baseline only degrades the diff, never the edit itself.
        }
    }

    /**
     * Claude CLI used by the SDK: the `claudeCliPath` setting, then `claude` on
     * PATH, then well-known install locations (see cliLocator.ts). The 69 MB
     * CLI bundle upstream shipped under resources/ is not included.
     */
    private async getClaudeExecutablePath(): Promise<string> {
        const location = await locateClaudeCli(this.context.extensionPath);
        if (!location) {
            const configured = vscode.workspace
                .getConfiguration('ai-cli-diff-view')
                .get<string>('claudeCliPath', '')
                .trim();
            throw new Error(describeMissingCli(configured || undefined));
        }
        return location.path;
    }
}
