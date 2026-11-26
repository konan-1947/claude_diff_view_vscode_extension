import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { createDecorator } from '../claude/di/instantiation';
import { ILogService } from '../claude/services/logService';
import { IWorkspaceService } from '../claude/services/workspaceService';
import { IFileSystemService } from '../claude/services/fileSystemService';
import { INotificationService } from '../claude/services/notificationService';
import { ITerminalService } from '../claude/services/terminalService';
import { ITabsAndEditorsService } from '../claude/services/tabsAndEditorsService';
import { IWebViewService } from '../claude/services/webViewService';
import type { HandlerContext } from '../claude/services/claude/handlers/types';
import {
  handleGetAssetUris,
  handleOpenFile,
  handleGetCurrentSelection,
  handleShowNotification,
  handleNewConversationTab,
  handleGetSessionOwner,
  handleFocusTab,
  handleReportSessionSettings,
  handleRenameTab,
  handleOpenDiff,
  handleOpenContent,
  handleOpenURL,
  handleListFiles,
  handleStatPath,
  handleExec,
  handleRunShellCommand,
  handleReadTaskOutput,
  handleExportConversation,
} from '../claude/services/claude/handlers/handlers';
import { OmpRpcProcess, commandLine } from './ompRpcProcess';
import { notify } from '../util/notify';
import { OmpSdkTranslator, modelKey } from './ompToSdk';
import { OmpTaskCalls, OmpTaskTracker } from './ompTasks';
import { writtenPaths } from './ompTools';
import { OmpPromptTracker, rewindPointFromFile } from './ompQueue';
import { addOmpPromptHistory, findOmpSessionFile, getOmpSessionMessages, listOmpSessions, readOmpPromptHistory } from './ompSessions';

/**
 * OMP UI backend: speaks the same webview protocol as ClaudeAgentService
 * (`launch_claude`, `io_message`, `interrupt_claude`, `close_channel`,
 * `request`/`response`, see src/claude/shared/messages.ts), so the uic chat app
 * runs unchanged on top of `omp --mode rpc`.
 *
 * - one omp process per channel (a channel = one conversation in one tab);
 * - omp's session events are turned into SDK-shaped messages by OmpSdkTranslator;
 * - editor/UI requests that do not depend on Claude reuse the uic handlers;
 * - Claude-only requests are answered here from omp (`get_state`,
 *   `get_available_models`, `available_commands_update`) or with empty data.
 *
 * Protocol reference: docs/references/omp-rpc-wire.txt.
 */
export const IOmpAgentService = createDecorator<IOmpAgentService>('ompAgentService');

export interface IOmpAgentService {
  readonly _serviceBrand: undefined;
  fromClient(message: any): void;
  closeChannel(channelId: string, notify: boolean, error?: string): void;
  setFileWriteHooks(before?: (filePath: string) => Promise<void> | void, after?: (filePath: string) => void): void;
  shutdown(): void;
}

interface Channel {
  proc: OmpRpcProcess;
  translator: OmpSdkTranslator;
  cwd: string;
  sessionId: string;
  model: string;
  /** A prompt is running (prompt sent, its prompt_result not yet received) */
  busy: boolean;
  /** Paths written by a tool call, keyed by toolCallId (for the after-write hook) */
  pendingWrites: Map<string, string[]>;
  /** Webview protocol state that spans frames (see ompQueue.ts) */
  tracker: OmpPromptTracker;
  /** Subagents and background shell jobs (see ompTasks.ts) */
  tasks: OmpTaskTracker;
  /** omp extension_ui_request id → webview requestId, for omp's `cancel` */
  uiRequests: Map<string, string>;
  /** omp's thinking level before the UI turned thinking off (restored on "on") */
  thinkingBeforeOff?: string;
}

interface ProbeResult {
  commands: any[];
  models: any[];
}

const PROBE_CACHE_MS = 5 * 60 * 1000;

export class OmpAgentService implements IOmpAgentService {
  readonly _serviceBrand: undefined;

  private readonly channels = new Map<string, Channel>();
  private readonly outstanding = new Map<string, { channelId: string; resolve: (v: any) => void; reject: (e: Error) => void }>();
  private readonly handlerContext: HandlerContext;
  private probeCache?: { at: number; result: Promise<ProbeResult> };
  private versionCache?: Promise<string | undefined>;
  /** `omp --version`, once known (system/init's claude_code_version) */
  private cliVersion?: string;
  private lastCommands: any[] = [];
  private requestSeq = 0;
  private beforeFileWrite?: (filePath: string) => Promise<void> | void;
  private afterFileWrite?: (filePath: string) => void;

  constructor(
    @ILogService private readonly logService: ILogService,
    @IWorkspaceService private readonly workspaceService: IWorkspaceService,
    @IFileSystemService fileSystemService: IFileSystemService,
    @INotificationService notificationService: INotificationService,
    @ITerminalService terminalService: ITerminalService,
    @ITabsAndEditorsService tabsAndEditorsService: ITabsAndEditorsService,
    @IWebViewService private readonly webViewService: IWebViewService,
  ) {
    // The reused handlers only touch these services; the Claude ones stay unset
    // so nothing under ~/.claude is created for an OMP-only user.
    this.handlerContext = {
      logService,
      workspaceService,
      fileSystemService,
      notificationService,
      terminalService,
      tabsAndEditorsService,
      webViewService,
      configService: undefined as any,
      sessionService: undefined as any,
      sdkService: undefined as any,
      agentService: undefined as any,
    };
  }

  setFileWriteHooks(before?: (filePath: string) => Promise<void> | void, after?: (filePath: string) => void): void {
    this.beforeFileWrite = before;
    this.afterFileWrite = after;
  }

  fromClient(message: any): void {
    void this.dispatch(message).catch((error) => {
      this.logService.error(`[OmpAgentService] ${message?.type} failed: ${errorText(error)}`);
    });
  }

  shutdown(): void {
    for (const channelId of [...this.channels.keys()]) {
      this.closeChannel(channelId, false);
    }
  }

  closeChannel(channelId: string, notify: boolean, error?: string): void {
    const channel = this.channels.get(channelId);
    this.channels.delete(channelId);
    channel?.proc.kill();
    // Prompts omp was waiting on: nobody can answer them any more
    for (const [requestId, pending] of [...this.outstanding]) {
      if (pending.channelId !== channelId) continue;
      this.dismissWebviewRequest(channelId, requestId);
    }
    channel?.uiRequests.clear();
    if (notify) {
      this.post({ type: 'close_channel', channelId, error });
    }
  }

  // ---- webview → host ---------------------------------------------------

  private async dispatch(message: any): Promise<void> {
    switch (message?.type) {
      case 'launch_claude':
        await this.launch(message);
        return;
      case 'close_channel':
        this.closeChannel(message.channelId, false);
        return;
      case 'interrupt_claude':
        this.channels.get(message.channelId)?.proc.send({ type: 'abort' });
        return;
      case 'io_message':
        await this.sendUserMessage(message.channelId, message.message);
        return;
      case 'request':
        await this.handleRequest(message);
        return;
      case 'response': {
        const pending = this.outstanding.get(message.requestId);
        if (pending) {
          this.outstanding.delete(message.requestId);
          if (message.response?.type === 'error') pending.reject(new Error(message.response.error));
          else pending.resolve(message.response);
        }
        return;
      }
      case 'cancel_request':
        return;
      default:
        this.logService.warn(`[OmpAgentService] unknown message ${message?.type}`);
    }
  }

  private async launch(message: any): Promise<void> {
    const channelId: string = message.channelId;
    if (this.channels.has(channelId)) {
      throw new Error(`Channel already exists: ${channelId}`);
    }
    const cwd: string = message.cwd || this.defaultCwd();
    const args: string[] = [];
    if (typeof message.resume === 'string' && message.resume) {
      // A path cannot be scoped wrongly, unlike an id with a different cwd guess
      const file = await findOmpSessionFile(cwd, message.resume);
      args.push('--resume', file ?? message.resume);
    }
    if (typeof message.model === 'string' && message.model && message.model !== 'default') {
      args.push('--model', message.model);
    }

    void this.version();
    let channel: Channel | undefined;
    const proc = new OmpRpcProcess({
      cliPath: findOmpCli(),
      cwd,
      args,
      onFrame: (frame) => channel && this.onFrame(channelId, channel, frame),
      onExit: (code, stderr) => {
        if (this.channels.get(channelId) === channel) {
          this.channels.delete(channelId);
          this.post({ type: 'close_channel', channelId, error: code ? stderr || `omp exited with code ${code}` : undefined });
        }
      },
    });
    channel = {
      proc,
      cwd,
      sessionId: typeof message.resume === 'string' ? message.resume : '',
      model: '',
      busy: false,
      pendingWrites: new Map(),
      uiRequests: new Map(),
      translator: undefined as unknown as OmpSdkTranslator,
      tracker: undefined as unknown as OmpPromptTracker,
      tasks: undefined as unknown as OmpTaskTracker,
    };
    const ch = channel;
    const taskCalls = new OmpTaskCalls();
    channel.translator = new OmpSdkTranslator(
      {
        sessionId: () => ch.sessionId,
        cwd,
        model: () => ch.model,
        version: () => this.cliVersion,
        slashCommands: () => this.lastCommands.map((c) => c.name),
        onError: (error) => this.post({ type: 'sdk_error', channelId, error }),
        taskCalls,
      },
      (sdkMessage) => this.post({ type: 'io_message', channelId, message: sdkMessage, done: false }),
    );
    // Subagent cards and background shell jobs (see ompTasks.ts)
    channel.tasks = new OmpTaskTracker({
      sessionId: () => ch.sessionId,
      cwd,
      model: () => ch.model,
      emit: (sdkMessage) => this.post({ type: 'io_message', channelId, message: sdkMessage, done: false }),
      request: (command) => proc.request(command),
      taskCalls,
    });
    // Queue chips / Esc / rewind / usage banner: the protocol state spanning frames
    channel.tracker = new OmpPromptTracker({
      emit: (sdkMessage) => this.post({ type: 'io_message', channelId, message: sdkMessage, done: false }),
      request: (command, timeoutMs) => proc.request(command, timeoutMs),
      sessionId: () => ch.sessionId,
      // An idle steer starts a run of its own: omp ends it without a prompt_result
      onOrphanRunEnd: () => ch.translator.handle({ type: 'prompt_result', status: 'completed' }),
    });
    this.channels.set(channelId, channel);
    this.logService.info(`[OmpAgentService] launching omp for ${channelId} in ${cwd} ${args.join(' ')}`);

    try {
      proc.start();
      await proc.ready;
      const state = await proc.request<any>({ type: 'get_state' });
      channel.sessionId = state?.sessionId ?? channel.sessionId;
      channel.model = modelKey(state?.model);
      // The picker showed the UI's sentinel until now; omp just told us what it
      // really runs (its config default, or a resumed session's model).
      if (channel.model) {
        this.post({ type: 'io_message', channelId, message: channel.translator.sessionModel(channel.model), done: false });
      }
      // Subagent lifecycle/progress/child events (see ompTasks.ts)
      await proc.request({ type: 'set_subagent_subscription', level: 'events' }).catch(() => undefined);
      const level = toOmpThinking(message.effortLevel, message.thinkingLevel);
      if (level) {
        await proc.request({ type: 'set_thinking_level', level }).catch(() => undefined);
      }
      // Rewind: continue the conversation from the entry before the target
      if (typeof message.resumeSessionAt === 'string' && message.resumeSessionAt) {
        await proc.request({ type: 'navigate_tree', entryId: message.resumeSessionAt }).catch((error) => {
          this.logService.warn(`[OmpAgentService] navigate_tree ${message.resumeSessionAt} failed: ${errorText(error)}`);
        });
      }
    } catch (error) {
      this.closeChannel(channelId, true, errorText(error));
    }
  }

  private async sendUserMessage(channelId: string, message: any): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }
    if (message?.type !== 'user') return;
    // Bash-mode output kept for the next turn (`! cmd`): not supported by omp yet
    if (message.shouldQuery === false) return;

    const { text, images } = splitUserContent(message.message?.content);
    if (!text && images.length === 0) return;
    const uuid = typeof message.uuid === 'string' ? message.uuid : undefined;
    await channel.proc.ready;
    if (channel.busy || channel.tracker.running) {
      // Sent while a run is going: omp delivers it after the current step
      channel.tracker.onSent(uuid, text, true);
      channel.proc.send({ type: 'steer', message: text, ...(images.length ? { images } : {}) });
      return;
    }
    channel.busy = true;
    try {
      channel.tracker.onSent(uuid, text, false);
      const ack = await channel.proc.request<any>({ type: 'prompt', message: text, ...(images.length ? { images } : {}) }, 60000);
      if (ack?.agentInvoked === false) {
        // A local slash command (e.g. /session): omp never starts a run for it
        channel.busy = false;
        channel.tracker.onPromptCompletedLocally();
        channel.translator.handle({ type: 'prompt_result', status: 'completed' });
        return;
      }
    } catch (error) {
      if (/did not answer/i.test(errorText(error)) && await isStreaming(channel)) {
        // The ack was late, not lost: omp is running the prompt, and its
        // prompt_result / agent_end will end the turn as usual
        return;
      }
      if (/already processing/i.test(errorText(error))) {
        // A run is already going (idle steer or a background job): deliver as a steer
        channel.busy = false;
        channel.tracker.requeueAsSteer();
        channel.proc.send({ type: 'steer', message: text, ...(images.length ? { images } : {}) });
        return;
      }
      channel.busy = false;
      channel.tracker.onPromptFailed();
      this.post({ type: 'sdk_error', channelId, error: errorText(error) });
      channel.translator.handle({ type: 'prompt_result', status: 'error' });
    }
  }

  // ---- omp → webview ------------------------------------------------------

  private onFrame(channelId: string, channel: Channel, frame: any): void {
    // Before the switch: the tracker pairs user messages with what the UI sent
    channel.tracker.onFrame(frame);
    switch (frame?.type) {
      case 'available_commands_update':
        if (Array.isArray(frame.commands)) this.lastCommands = frame.commands;
        return;
      case 'extension_ui_request':
        void this.onUiRequest(channelId, channel, frame);
        return;
      case 'message_update': {
        // Snapshot files before a write/edit runs, so the diff has the old content
        const event = frame.assistantMessageEvent;
        if (event?.type === 'toolcall_end' && event.toolCall) {
          const paths = writtenPaths(event.toolCall.name, event.toolCall.arguments, channel.cwd);
          if (paths.length) {
            channel.pendingWrites.set(event.toolCall.id, paths);
            for (const p of paths) void this.beforeFileWrite?.(p);
          }
        }
        break;
      }
      case 'tool_execution_end': {
        const paths = channel.pendingWrites.get(frame.toolCallId);
        if (paths) {
          channel.pendingWrites.delete(frame.toolCallId);
          for (const p of paths) this.afterFileWrite?.(p);
        }
        break;
      }
      case 'prompt_result':
        channel.busy = false;
        // A call that never ran (aborted, refused) gets no tool_execution_end;
        // once nothing can still finish, drop what is left
        if (!channel.tasks.hasRunningSubagents) channel.pendingWrites.clear();
        break;
      case 'session_info_update':
        if (typeof frame.sessionId === 'string' && frame.sessionId) channel.sessionId = frame.sessionId;
        break;
      case 'config_update':
        if (frame.model) channel.model = modelKey(frame.model);
        break;
      case 'subagent_event':
        // A subagent edits files too: give its writes a before-image
        this.trackSubagentWrites(channel, frame.payload?.event);
        break;
    }
    if (channel.tasks.handle(frame)) return;
    channel.translator.handle(frame);
    if (frame?.type === 'prompt_result' || frame?.type === 'auto_retry_start') void channel.tracker.refreshUsageLimit();
  }

  /** Before/after file-write hooks for a subagent's own tool call. */
  private trackSubagentWrites(channel: Channel, event: any): void {
    if (event?.type === 'message_update' && event.assistantMessageEvent?.type === 'toolcall_end' && event.assistantMessageEvent.toolCall) {
      const call = event.assistantMessageEvent.toolCall;
      const paths = writtenPaths(call.name, call.arguments, channel.cwd);
      if (paths.length) {
        channel.pendingWrites.set(call.id, paths);
        for (const p of paths) void this.beforeFileWrite?.(p);
      }
    } else if (event?.type === 'tool_execution_end') {
      const paths = channel.pendingWrites.get(event.toolCallId);
      if (paths) {
        channel.pendingWrites.delete(event.toolCallId);
        for (const p of paths) this.afterFileWrite?.(p);
      }
    }
  }

  /**
   * omp asks the host (extension UI requests). `confirm` becomes the chat's
   * permission prompt; `select` its question prompt; `cancel` (omp's own
   * timeout, or the call went away) closes the prompt it names.
   */
  private async onUiRequest(channelId: string, channel: Channel, frame: any): Promise<void> {
    const reply = (fields: Record<string, unknown>) => {
      // Cancelled by omp meanwhile: "a later answer to it is ignored", so send none
      if (!channel.uiRequests.has(frame.id)) return;
      channel.uiRequests.delete(frame.id);
      channel.proc.send({ type: 'extension_ui_response', id: frame.id, ...fields });
    };
    try {
      switch (frame.method) {
        case 'confirm': {
          const result = await this.askWebview(channelId, channel, frame.id, {
            type: 'tool_permission_request',
            toolName: String(frame.title || 'omp'),
            inputs: { message: frame.message },
            suggestions: [],
            context: { title: frame.title, description: frame.message },
          });
          reply({ confirmed: result?.result?.behavior === 'allow' });
          return;
        }
        case 'select': {
          const options: string[] = Array.isArray(frame.options) ? frame.options.map(String) : [];
          const question = String(frame.title || 'Choose');
          const result = await this.askWebview(channelId, channel, frame.id, {
            type: 'tool_permission_request',
            toolName: 'AskUserQuestion',
            inputs: {
              questions: [{
                question,
                header: '',
                multiSelect: false,
                // omp's select takes one of its options, never free text
                allowOther: false,
                options: options.map((label, i) => ({ label, description: frame.optionDetails?.[i]?.description ?? '' })),
              }],
            },
            suggestions: [],
          });
          const answer = result?.result?.updatedInput?.answers?.[question];
          if (result?.result?.behavior === 'allow' && typeof answer === 'string' && options.includes(answer)) reply({ value: answer });
          else reply({ cancelled: true });
          return;
        }
        case 'cancel': {
          const target = String(frame.targetId ?? '');
          const requestId = channel.uiRequests.get(target);
          channel.uiRequests.delete(target);
          if (requestId) this.dismissWebviewRequest(channelId, requestId);
          return;
        }
        case 'notify': {
          const message = String(frame.message ?? '');
          if (frame.notifyType === 'error') void vscode.window.showErrorMessage(message);
          else notify(message);
          return;
        }
        case 'open_url':
          if (typeof frame.url === 'string') void vscode.env.openExternal(vscode.Uri.parse(frame.url));
          return;
        case 'input':
        case 'editor':
        case 'ask':
          channel.proc.send({ type: 'extension_ui_response', id: frame.id, cancelled: true });
          return;
        default:
          // setStatus / setWidget / setTitle / set_editor_text: nothing to show yet
          return;
      }
    } catch (error) {
      this.logService.warn(`[OmpAgentService] UI request ${frame.method} failed: ${errorText(error)}`);
      reply({ cancelled: true });
    }
  }

  /** Shows a prompt in the channel's webview; `ompId` is the omp request it answers. */
  private askWebview(channelId: string, channel: Channel, ompId: string, request: any): Promise<any> {
    const requestId = `omp-${++this.requestSeq}`;
    channel.uiRequests.set(ompId, requestId);
    return new Promise((resolve, reject) => {
      this.outstanding.set(requestId, { channelId, resolve, reject });
      this.post({ type: 'request', channelId, requestId, request });
    });
  }

  /** Closes a prompt that can no longer be answered; its pending promise resolves empty. */
  private dismissWebviewRequest(channelId: string, requestId: string): void {
    const pending = this.outstanding.get(requestId);
    this.outstanding.delete(requestId);
    this.post({
      type: 'request',
      channelId,
      requestId: `omp-${++this.requestSeq}`,
      request: { type: 'cancel_permission_request', targetRequestId: requestId },
    });
    pending?.resolve(undefined);
  }

  // ---- requests -------------------------------------------------------------

  private async handleRequest(message: any): Promise<void> {
    let response: unknown;
    try {
      response = await this.processRequest(message);
    } catch (error) {
      response = { type: 'error', error: errorText(error) };
    }
    this.post({ type: 'response', requestId: message.requestId, response, webviewId: message.webviewId });
  }

  private async processRequest(message: any): Promise<unknown> {
    const request = message.request;
    const channel = message.channelId ? this.channels.get(message.channelId) : undefined;
    const ctx = this.handlerContext;
    const signal = new AbortController().signal;

    switch (request?.type) {
      case 'init':
        return {
          type: 'init_response',
          state: {
            defaultCwd: this.defaultCwd(),
            modelSetting: 'default',
            platform: process.platform,
            thinkingLevel: 'default_on',
            allowBypassPermissions: false,
          },
        };
      case 'get_claude_state': {
        const probe = await this.probe().catch(() => ({ commands: [], models: [] }));
        return {
          type: 'get_claude_state_response',
          config: { slashCommands: probe.commands.map(toSlashCommand), models: [], accountInfo: null },
        };
      }
      case 'sdk_probe': {
        const data: Record<string, unknown> = {};
        const caps: string[] = request.capabilities ?? [];
        if (caps.includes('supportedModels') || caps.includes('supportedCommands')) {
          const probe = await this.probe().catch(() => ({ commands: [], models: [] }));
          if (caps.includes('supportedModels')) data.supportedModels = probe.models.map(toCliModel);
          if (caps.includes('supportedCommands')) data.supportedCommands = probe.commands.map(toSlashCommand);
        }
        return { type: 'sdk_probe_response', data };
      }
      case 'get_extension_config':
        return {
          type: 'get_extension_config_response',
          config: {
            defaultPermissionMode: 'default',
            defaultModel: '',
            defaultThinkingLevel: 'default_on',
            systemNotifications: false,
            completionSound: false,
            customModels: [],
            disabledModels: [],
          },
        };
      case 'get_cli_version':
        return { type: 'get_cli_version_response', version: await this.version() };
      case 'get_context_usage': {
        if (!channel) throw new Error('No running session');
        const state = await channel.proc.request<any>({ type: 'get_state' });
        const usage = state?.contextUsage;
        return {
          type: 'get_context_usage_response',
          usage: usage
            ? {
                totalTokens: usage.tokens ?? 0,
                maxTokens: usage.contextWindow ?? 0,
                rawMaxTokens: usage.contextWindow ?? 0,
                percentage: usage.percent ?? 0,
                model: modelKey(state?.model),
              }
            : undefined,
        };
      }
      case 'get_applied_effort': {
        if (!channel) return { type: 'get_applied_effort_response', effort: undefined };
        const state = await channel.proc.request<any>({ type: 'get_state' });
        return { type: 'get_applied_effort_response', effort: state?.thinkingLevel ?? undefined };
      }
      case 'set_model': {
        if (!channel) throw new Error('No running session');
        const value: string = request.model?.value ?? '';
        const slash = value.indexOf('/');
        if (slash <= 0) throw new Error(`Not an omp model id: ${value}`);
        const model = await channel.proc.request<any>({ type: 'set_model', provider: value.slice(0, slash), modelId: value.slice(slash + 1) });
        channel.model = modelKey(model) || value;
        return { type: 'set_model_response', success: true };
      }
      case 'set_effort_level': {
        if (!channel) return { type: 'set_effort_level_response' };
        // null / 'auto': back to omp's own selector
        const level = toOmpThinking(request.effortLevel, undefined) ?? 'inherit';
        await channel.proc.request({ type: 'set_thinking_level', level });
        channel.thinkingBeforeOff = level;
        return { type: 'set_effort_level_response' };
      }
      case 'set_thinking_level': {
        if (!channel) return { type: 'set_thinking_level_response' };
        if (request.thinkingLevel === 'off') {
          const state = await channel.proc.request<any>({ type: 'get_state' }).catch(() => undefined);
          if (typeof state?.thinkingLevel === 'string' && state.thinkingLevel !== 'off') {
            channel.thinkingBeforeOff = state.thinkingLevel;
          }
          await channel.proc.request({ type: 'set_thinking_level', level: 'off' });
        } else {
          // Thinking back on: the level it had, else omp's own selector
          await channel.proc.request({ type: 'set_thinking_level', level: channel.thinkingBeforeOff ?? 'inherit' });
        }
        return { type: 'set_thinking_level_response' };
      }
      case 'set_permission_mode':
        // omp has no Claude-style permission modes over RPC (TODO: plan mode)
        return { type: 'set_permission_mode_response', success: false };
      case 'list_sessions_request': {
        const sessions = await listOmpSessions(request.cwd || channel?.cwd || this.defaultCwd());
        return {
          type: 'list_sessions_response',
          sessions: sessions.map((s) => ({ id: s.id, lastModified: s.lastModified, messageCount: s.messageCount, summary: s.summary, worktree: undefined, isCurrentWorkspace: true })),
        };
      }
      case 'get_session_request':
        return { type: 'get_session_response', messages: await getOmpSessionMessages(request.cwd || channel?.cwd || this.defaultCwd(), String(request.sessionId ?? '')) };
      case 'get_prompt_history':
        return { type: 'get_prompt_history_response', entries: await readOmpPromptHistory(request.cwd || this.defaultCwd()) };
      case 'add_prompt_history':
        await addOmpPromptHistory(String(request.display ?? ''), request.cwd || this.defaultCwd())
          .catch((e) => this.logService.warn(`[OmpAgentService] prompt history write failed: ${errorText(e)}`));
        return { type: 'add_prompt_history_response' };
      case 'cancel_queued_prompt':
        // Esc on a queued steer: take it back out of omp's queue
        return {
          type: 'cancel_queued_prompt_response',
          cancelled: channel ? await channel.tracker.cancelQueued(String(request.uuid ?? '')) : false,
        };
      case 'stop_task':
        // Stop a running subagent (omp has no RPC for background shell jobs)
        return channel
          ? channel.tasks.stopTask(String(request.taskId ?? ''))
          : { type: 'stop_task_response', error: 'No running session' };
      case 'get_rewind_point': {
        const sessionId = String(request.sessionId ?? '');
        const target = [...this.channels.values()].find((c) => c.sessionId === sessionId);
        const point = target
          ? await target.tracker.rewindPoint(String(request.userMessageId ?? ''))
          : await rewindPointFromFile(request.cwd || this.defaultCwd(), sessionId, String(request.userMessageId ?? ''));
        return { type: 'get_rewind_point_response', ...point };
      }
      case 'rewind_files':
        // omp cannot put files back over RPC; conversation rewind still works
        return { type: 'rewind_files_response', canRewind: false, error: 'omp cannot restore files' };

      // Editor / UI requests shared with Claude UI
      case 'get_asset_uris':
        return handleGetAssetUris(request, ctx);
      case 'open_file':
        return handleOpenFile(request, ctx);
      case 'get_current_selection':
        return handleGetCurrentSelection(ctx);
      case 'open_diff':
        return handleOpenDiff(request, ctx, signal);
      case 'open_content':
        return handleOpenContent(request, ctx, signal);
      case 'show_notification':
        return handleShowNotification(request, ctx);
      case 'new_conversation_tab':
        return handleNewConversationTab(request, ctx, message.webviewId);
      case 'get_session_owner':
        return handleGetSessionOwner(request, ctx, message.webviewId);
      case 'focus_tab':
        return handleFocusTab(request, ctx);
      case 'report_session_settings':
        return handleReportSessionSettings(request, ctx);
      case 'rename_tab':
        return handleRenameTab(request, ctx, message.webviewId);
      case 'open_url':
        return handleOpenURL(request, ctx);
      case 'list_files_request':
        return handleListFiles(request, ctx);
      case 'stat_path_request':
        return handleStatPath(request, ctx);
      case 'exec':
        return handleExec(request, ctx);
      case 'run_shell_command':
        return handleRunShellCommand(request, ctx, signal);
      case 'read_task_output':
        return handleReadTaskOutput(request);
      case 'export_conversation':
        return handleExportConversation(request, ctx);
      default:
        throw new Error(`Not supported in OMP UI yet: ${request?.type}`);
    }
  }

  // ---- helpers ---------------------------------------------------------------

  /** Commands and models, from a short-lived omp that never starts a session. */
  private probe(): Promise<ProbeResult> {
    if (this.probeCache && Date.now() - this.probeCache.at < PROBE_CACHE_MS) {
      return this.probeCache.result;
    }
    const result = (async () => {
      let commands: any[] = [];
      let gotCommands: () => void = () => undefined;
      const commandsArrived = new Promise<void>((resolve) => { gotCommands = resolve; });
      const proc = new OmpRpcProcess({
        cliPath: findOmpCli(),
        cwd: this.defaultCwd(),
        args: ['--no-session'],
        onFrame: (frame) => {
          if (frame?.type === 'available_commands_update' && Array.isArray(frame.commands)) {
            commands = frame.commands;
            gotCommands();
          } else if (frame?.type === 'extension_ui_request' && frame.method !== 'setWidget' && frame.method !== 'setStatus') {
            proc.send({ type: 'extension_ui_response', id: frame.id, cancelled: true });
          }
        },
        onExit: () => gotCommands(),
      });
      try {
        proc.start();
        await proc.ready;
        const models = await proc.request<any>({ type: 'get_available_models' });
        await Promise.race([commandsArrived, new Promise((r) => setTimeout(r, 3000))]);
        if (commands.length) this.lastCommands = commands;
        return { commands, models: Array.isArray(models?.models) ? models.models : [] };
      } finally {
        proc.kill();
      }
    })();
    this.probeCache = { at: Date.now(), result };
    result.catch(() => { this.probeCache = undefined; });
    return result;
  }

  private version(): Promise<string | undefined> {
    if (!this.versionCache) {
      this.versionCache = new Promise((resolve) => {
        const command = commandLine(findOmpCli(), ['--version']);
        execFile(command.file, command.args, { timeout: 10000, windowsHide: true, windowsVerbatimArguments: command.verbatim }, (error, stdout) => {
          const version = error ? undefined : /\d+\.\d+\.\d+[\w.+-]*/.exec(stdout)?.[0];
          this.cliVersion = version;
          resolve(version);
        });
      });
    }
    return this.versionCache;
  }

  private defaultCwd(): string {
    return this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || os.homedir();
  }

  private post(message: any): void {
    this.webViewService.postMessage(message);
  }
}

// ---- free functions -----------------------------------------------------------

/** `ai-cli-diff-view.ompCliPath`, else `omp` on PATH, else well-known install dirs. */
export function findOmpCli(): string {
  const configured = vscode.workspace.getConfiguration('ai-cli-diff-view').get<string>('ompCliPath')?.trim();
  if (configured) return configured;
  const exe = process.platform === 'win32' ? ['omp.exe', 'omp.cmd', 'omp'] : ['omp'];
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  dirs.push(path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.bun', 'bin'), '/usr/local/bin', '/opt/homebrew/bin');
  for (const dir of dirs) {
    for (const name of exe) {
      const candidate = path.join(dir, name);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch { /* not here */ }
    }
  }
  return 'omp';
}

/** UI effort / thinking selection → omp ThinkingLevel (undefined = leave as is) */
function toOmpThinking(effort: unknown, thinking: unknown): string | undefined {
  if (typeof effort === 'string' && effort && effort !== 'auto') return effort;
  if (thinking === 'off') return 'off';
  return undefined;
}

/** omp ModelInfo → the CliModel shape the model picker reads (useModelCatalog.ts) */
function toCliModel(model: any): any {
  const efforts: string[] = Array.isArray(model?.thinking?.efforts) ? model.thinking.efforts : [];
  return {
    value: modelKey(model),
    resolvedModel: model?.id,
    displayName: model?.name || model?.id,
    description: modelKey(model),
    supportsEffort: efforts.length > 0,
    supportedEffortLevels: efforts,
    supportsThinkingOff: true,
  };
}

/** omp AvailableSlashCommand → the slash command shape the `/` menu reads (useRuntime.ts) */
function toSlashCommand(command: any): any {
  return {
    name: command?.name,
    description: command?.description,
    argumentHint: command?.input?.hint,
    aliases: command?.aliases,
    source: command?.source && command.source !== 'builtin' ? command.source : undefined,
  };
}

/** SDK user content → omp prompt text + images */
function splitUserContent(content: unknown): { text: string; images: any[] } {
  if (typeof content === 'string') return { text: content, images: [] };
  const texts: string[] = [];
  const images: any[] = [];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        texts.push(block.text);
      } else if (block?.type === 'image' && block.source?.type === 'base64') {
        images.push({ type: 'image', data: block.source.data, mimeType: block.source.media_type });
      } else if (block?.type === 'document' && block.source?.type === 'text') {
        texts.push(String(block.source.data ?? ''));
      }
    }
  }
  return { text: texts.join('\n\n'), images };
}

/** omp is running a turn right now (get_state.isStreaming); false when it cannot say */
async function isStreaming(channel: Channel): Promise<boolean> {
  try {
    const state = await channel.proc.request<any>({ type: 'get_state' }, 5000);
    return state?.isStreaming === true;
  } catch {
    return false;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
