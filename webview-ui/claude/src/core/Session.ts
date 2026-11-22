import { signal, computed, effect } from 'alien-signals';
import type { BaseTransport } from '../transport/BaseTransport';
import type { PermissionRequest } from './PermissionRequest';
import type { GetConfigOptionsResponse, McpServerInfo, ModelOption, StatusInfo } from '@shared/messages';
import type { SessionSummary } from './types';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { processAndAttachMessage /*, mergeConsecutiveReadMessages */ } from '../utils/messageUtils';
import { Message as MessageModel } from '../models/Message';
import type { Message } from '../models/Message';

export interface SelectionRange {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  selectedText?: string;
}

export interface UsageData {
  totalTokens: number;
  totalCost: number;
  contextWindow: number;
}

export interface AttachmentPayload {
  fileName: string;
  mediaType: string;
  data: string;
  fileSize?: number;
}

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export interface SessionOptions {
  isExplicit?: boolean;
  existingWorktree?: { name: string; path: string };
  resumeId?: string;
}

export interface SessionContext {
  currentSelection: ReturnType<typeof signal<SelectionRange | undefined>>;
  commandRegistry: { registerAction: (...args: any[]) => void };
  fileOpener: {
    open: (filePath: string, location?: any) => Promise<void> | void;
    openContent: (
      content: string,
      fileName: string,
      editable: boolean
    ) => Promise<string | undefined>;
  };
  showNotification?: (
    message: string,
    severity: 'info' | 'warning' | 'error',
    buttons?: string[],
    onlyIfNotVisible?: boolean
  ) => Promise<string | undefined>;
  startNewConversationTab?: (initialPrompt?: string) => void;
  renameTab?: (title: string) => void;
  openURL?: (url: string) => void;
}

export class Session {
  private readonly claudeChannelId = signal<string | undefined>(undefined);
  private currentConnectionPromise?: Promise<BaseTransport>;
  private lastSentSelection?: SelectionRange;
  private effectCleanup?: () => void;
  /** Set once the user picks a mode; until then the CLI's own default applies. */
  private permissionModeExplicit = false;
  private contextUsageSeq = 0;
  /**
   * Argument of an `/effort` sent and not answered yet ('' = no argument). The
   * CLI reads `auto` back as the model's default level, so the typed word is
   * the only way to tell "auto" from that level picked explicitly.
   */
  private pendingEffortArg?: string;

  readonly connection = signal<BaseTransport | undefined>(undefined);

  readonly busy = signal(false);
  readonly isLoading = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly sessionId = signal<string | undefined>(undefined);
  readonly isExplicit = signal(false);
  readonly lastModifiedTime = signal<number>(Date.now());
  readonly messages = signal<Message[]>([]);
  readonly messageCount = signal<number>(0);
  readonly cwd = signal<string | undefined>(undefined);
  /** `/add-dir` for this session only: passed to every launch of its query */
  readonly additionalDirectories = signal<string[]>([]);
  readonly permissionMode = signal<PermissionMode>('default');
  readonly summary = signal<string | undefined>(undefined);
  readonly modelSelection = signal<string | undefined>(undefined);
  /**
   * Model ID the CLI is actually running (e.g. `claude-haiku-5-5`), read back
   * after every turn. It changes when the CLI switches on its own, e.g. after
   * `/model <name>` typed in the chat.
   */
  readonly cliModel = signal<string | undefined>(undefined);
  readonly thinkingLevel = signal<string>('default_on');
  /** "auto" = the model's default effort (as the CLI decides) */
  readonly effortLevel = signal<string>('auto');
  /**
   * Level the CLI really applies to the next message (`applied.effort`): what
   * "auto" resolves to for the current model. null = no effort sent,
   * undefined = not known yet.
   */
  readonly appliedEffort = signal<string | null | undefined>(undefined);
  /** Output style the CLI reported in the last system/init (`output_style`) */
  readonly outputStyle = signal<string | undefined>(undefined);
  readonly todos = signal<any[]>([]);
  readonly worktree = signal<{ name: string; path: string } | undefined>(undefined);
  readonly selection = signal<SelectionRange | undefined>(undefined);
  readonly usageData = signal<UsageData>({
    totalTokens: 0,
    totalCost: 0,
    contextWindow: 200000
  });

  readonly claudeConfig = computed(() => {
    const conn = this.connection();
    return conn?.claudeConfig?.();
  });

  readonly config = computed(() => {
    const conn = this.connection();
    return conn?.config?.();
  });

  readonly permissionRequests = computed<PermissionRequest[]>(() => {
    const conn = this.connection();
    const channelId = this.claudeChannelId();
    if (!conn || !channelId) {
      return [];
    }

    return conn
      .permissionRequests()
      .filter((request) => request.channelId === channelId);
  });

  isOffline(): boolean {
    return (
      !this.connection() &&
      !!this.sessionId() &&
      this.messages().length === 0 &&
      !this.currentConnectionPromise
    );
  }

  constructor(
    private readonly connectionProvider: () => Promise<BaseTransport>,
    private readonly context: SessionContext,
    options: SessionOptions = {}
  ) {
    this.isExplicit(options.isExplicit ?? true);

    effect(() => {
      this.selection(this.context.currentSelection());
    });
  }

  static fromServer(
    summary: SessionSummary,
    connectionProvider: () => Promise<BaseTransport>,
    context: SessionContext
  ): Session {
    const session = new Session(connectionProvider, context, { isExplicit: true });
    session.sessionId(summary.id);
    session.lastModifiedTime(summary.lastModified);
    session.summary(summary.summary);
    session.worktree(summary.worktree);
    session.messageCount(summary.messageCount ?? 0);  // keep the message count returned by the server
    return session;
  }

  async getConnection(): Promise<BaseTransport> {
    const current = this.connection();
    if (current) {
      return current;
    }
    if (this.currentConnectionPromise) {
      return this.currentConnectionPromise;
    }

    this.currentConnectionPromise = this.connectionProvider().then((conn) => {
      this.connection(conn);
      return conn;
    });

    return this.currentConnectionPromise;
  }

  async preloadConnection(): Promise<void> {
    await this.getConnection();
    await this.launchClaude();
  }

  async loadFromServer(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) return;

    this.isLoading(true);
    try {
      const connection = await this.getConnection();
      const response = await connection.getSession(sessionId);
      const accumulator: Message[] = [];
      for (const raw of response?.messages ?? []) {
        this.processMessage(raw);
        // Use processAndAttachMessage to attach tool_result
        // so tool_result in history messages is also attached to its tool_use
        processAndAttachMessage(accumulator, raw);
      }
      // ReadCoalesced merging removed
      // this.messages(mergeConsecutiveReadMessages(accumulator));
      this.messages(accumulator);
      await this.launchClaude();
    } finally {
      this.isLoading(false);
    }
  }

  async send(
    input: string,
    attachments: AttachmentPayload[] = [],
    includeSelection = false
  ): Promise<void> {
    const connection = await this.getConnection();

    // Official approach: do not switch thinkingLevel temporarily for slash commands, keeping the session consistent;
    // the SDK/server provides thinking/redacted_thinking blocks in assistant messages to satisfy the constraints
    const isSlash = this.isSlashCommand(input);

    // Launch the channel (making sure the current thinkingLevel is included)
    await this.launchClaude();

    const effortCommand = /^\/effort(?:\s+(\S+))?\s*$/i.exec(input.trim());
    if (effortCommand) {
      this.pendingEffortArg = (effortCommand[1] ?? '').toLowerCase();
    }

    const shouldIncludeSelection = includeSelection && !isSlash;
    let selectionPayload: SelectionRange | undefined;

    if (shouldIncludeSelection && !this.isSameSelection(this.lastSentSelection, this.selection())) {
      selectionPayload = this.selection();
      this.lastSentSelection = selectionPayload;
    }

    const userMessage = this.buildUserMessage(input, attachments, selectionPayload);
    const messageModel = MessageModel.fromRaw(userMessage);

    if (messageModel) {
      this.messages([...this.messages(), messageModel]);
    }

    if (!this.summary()) {
      this.summary(input);
    }
    this.isExplicit(false);
    this.lastModifiedTime(Date.now());
    this.busy(true);

    try {
      const channelId = this.claudeChannelId();
      if (!channelId) throw new Error('No active channel');
      connection.sendInput(channelId, userMessage, false);
    } catch (error) {
      this.busy(false);
      throw error;
    }
  }

  async launchClaude(): Promise<string> {
    const existingChannel = this.claudeChannelId();
    if (existingChannel) {
      return existingChannel;
    }

    this.error(undefined);
    const channelId = Math.random().toString(36).slice(2);
    this.claudeChannelId(channelId);

    const connection = await this.getConnection();

    if (!this.cwd()) {
      this.cwd(connection.config()?.defaultCwd);
    }

    if (!this.modelSelection()) {
      this.modelSelection(connection.config()?.modelSetting);
    }

    if (!this.thinkingLevel()) {
      this.thinkingLevel(connection.config()?.thinkingLevel || 'default_on');
    }

    const stream = connection.launchClaude(
      channelId,
      this.sessionId() ?? undefined,
      this.cwd() ?? undefined,
      this.modelSelection() ?? undefined,
      // Until the user picks a mode, let the CLI apply `permissions.defaultMode`;
      // the mode it settles on comes back in system/init (processIncomingMessage).
      this.permissionModeExplicit ? this.permissionMode() : undefined,
      this.thinkingLevel(),
      this.effortLevel(),
      this.additionalDirectories()
    );

    void this.readMessages(stream, channelId);
    return channelId;
  }

  async interrupt(): Promise<void> {
    const channelId = this.claudeChannelId();
    if (!channelId) {
      return;
    }
    const connection = await this.getConnection();
    connection.interruptClaude(channelId);
  }

  async restartClaude(): Promise<void> {
    await this.interrupt();
    this.claudeChannelId(undefined);
    this.busy(false);
    await this.launchClaude();
  }

  /**
   * `/add-dir` for this session only. The SDK takes extra directories only at
   * launch, so a running query is closed and relaunched on the same
   * conversation (resume). Refused while a turn runs.
   */
  async addDirectoryForSession(directory: string): Promise<void> {
    if (this.busy()) {
      throw new Error('Wait for the current turn to finish');
    }
    if (!this.additionalDirectories().includes(directory)) {
      this.additionalDirectories([...this.additionalDirectories(), directory]);
    }
    await this.relaunch();
  }

  /** Close the running query (if any) and start it again, resuming the conversation */
  async relaunch(): Promise<void> {
    const old = this.claudeChannelId();
    if (!old) {
      return;
    }
    const connection = await this.getConnection();
    this.claudeChannelId(undefined);
    connection.closeChannel(old);
    await this.launchClaude();
  }

  async listFiles(pattern?: string, signal?: AbortSignal): Promise<any> {
    const connection = await this.getConnection();
    return connection.listFiles(pattern, signal);
  }

  /** True once a mode was picked (by the user or the UI's Auto default). */
  get hasExplicitPermissionMode(): boolean {
    return this.permissionModeExplicit;
  }

  async setPermissionMode(mode: PermissionMode, applyToConnection = true): Promise<boolean> {
    const previous = this.permissionMode();
    this.permissionMode(mode);
    this.permissionModeExplicit = true;

    const channelId = this.claudeChannelId();
    if (!channelId || !applyToConnection) {
      return true;
    }
    const connection = await this.getConnection();
    const success = await connection.setPermissionMode(channelId, mode);
    if (!success) {
      this.permissionMode(previous);
    }
    return success;
  }

  async setModel(model: ModelOption): Promise<boolean> {
    // A context-usage read still in flight predates this switch and would
    // report the old model; drop it.
    this.contextUsageSeq++;
    const previous = this.modelSelection();
    this.modelSelection(model.value);

    const channelId = this.claudeChannelId();
    if (!channelId) {
      return true;
    }

    const connection = await this.getConnection();
    const response = await connection.setModel(channelId, model);

    if (!response?.success) {
      this.modelSelection(previous);
      return false;
    }

    // The window can change with the model (200K <-> 1M)
    const window = this.windowFromModel(model.value);
    this.usageData({ ...this.usageData(), contextWindow: window ?? 200000 });
    void this.refreshContextUsage();
    return true;
  }

  /**
   * Takes over a model the CLI already switched to: updates the selection
   * (picker, and the model sent on the next launch) without telling the CLI.
   */
  adoptModel(model: string): void {
    this.modelSelection(model);
  }

  async setThinkingLevel(level: string): Promise<void> {
    this.thinkingLevel(level);

    const channelId = this.claudeChannelId();
    if (!channelId) {
      return;
    }

    const connection = await this.getConnection();
    await connection.setThinkingLevel(channelId, level);
  }

  /** `persist`: also save it as the model's default, like Enter in the CLI's /effort menu */
  async setEffortLevel(level: string, persist = false): Promise<void> {
    this.effortLevel(level);

    const channelId = persist ? await this.launchClaude() : this.claudeChannelId();
    if (!channelId) {
      return;
    }

    const connection = await this.getConnection();
    await connection.setEffortLevel(channelId, level === 'auto' ? null : level, persist);
    void this.refreshAppliedEffort();
  }

  async getMcpServers(): Promise<McpServerInfo[]> {
    const connection = await this.getConnection();
    const channelId = await this.launchClaude();
    return connection.getMcpServers(channelId);
  }

  /** `/mcp reconnect|enable|disable <server>`; resolves to the CLI's error, if any. */
  async mcpServerAction(
    action: 'reconnect' | 'enable' | 'disable',
    serverName: string
  ): Promise<string | undefined> {
    const connection = await this.getConnection();
    const channelId = await this.launchClaude();
    return connection.mcpServerAction(channelId, action, serverName);
  }

  /** Keys, values and readable current values for the `/config` panel */
  async getConfigOptions(): Promise<Omit<GetConfigOptionsResponse, 'type'>> {
    const connection = await this.getConnection();
    const channelId = await this.launchClaude();
    return connection.getConfigOptions(channelId);
  }

  /**
   * Styles for the `/output-style` picker. The current one comes from the last
   * system/init (it follows `/output-style <name>`); the init answer is only
   * the fallback, as it is cached from the channel's start.
   */
  async getOutputStyles(): Promise<{ current?: string; available: string[] }> {
    const connection = await this.getConnection();
    const channelId = await this.launchClaude();
    const styles = await connection.getOutputStyles(channelId);
    return { current: this.outputStyle() ?? styles.current, available: styles.available };
  }

  /** `/status`: the CLI's report on this session (launches it if needed) */
  async getStatus(): Promise<StatusInfo> {
    const connection = await this.getConnection();
    const channelId = await this.launchClaude();
    return connection.getStatus(channelId);
  }

  async openConfigFile(configType: string): Promise<void> {
    const connection = await this.getConnection();
    await connection.openConfigFile(configType);
  }

  onPermissionRequested(callback: (request: PermissionRequest) => void): () => void {
    const connection = this.connection();
    if (!connection) {
      return () => {};
    }

    return connection.permissionRequested.add((request) => {
      // Read the current channelId dynamically, so the closure does not capture a stale value
      if (request.channelId === this.claudeChannelId()) {
        callback(request);
      }
    });
  }

  dispose(): void {
    if (this.effectCleanup) {
      this.effectCleanup();
    }
  }

  private async readMessages(stream: AsyncIterable<any>, channelId: string): Promise<void> {
    try {
      for await (const event of stream) {
        this.processIncomingMessage(event);
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
      this.busy(false);
    } finally {
      // A channel replaced by a relaunch (`/add-dir`) ends after the new one started
      if (this.claudeChannelId() === channelId) {
        this.claudeChannelId(undefined);
      }
    }
  }

  private processIncomingMessage(event: any): void {
    // Handle LLM request errors (fatal errors from SDK stderr)
    // Two dispatch paths:
    //   - user-triggered request (busy=true) → appended to the message stream as a tip message, rendered by LLMErrorBlock
    //   - not user-triggered (busy=false, e.g. Profile switch warm-up) → VS Code Notification
    if (event?.type === '__llm_request_error__') {
      if (this.busy()) {
        // LLM error during a user request: build a standard raw event and go through the shared fromRaw → contentParsers path
        // Same branching as Interrupt messages: user message → llm_error content block → tip type
        const syntheticEvent = {
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'llm_error', message: event.error }],
          },
        };
        const currentMessages = [...this.messages()] as Message[];
        processAndAttachMessage(currentMessages, syntheticEvent);
        this.messages(currentMessages);
        this.busy(false);
      } else {
        // Not user-triggered (Profile switch warm-up, channel startup probe, ...): VS Code Notification
        this.context.showNotification?.(event.error, 'error');
      }
      return;
    }

    // /clear (also /reset, /new, and leaving plan mode with "clear context"):
    // the CLI dropped the conversation and continues under a new session id
    // (it arrives on the next events). Show an empty chat, like the CLI does,
    // instead of a transcript Claude no longer remembers.
    if (event?.type === 'conversation_reset') {
      this.resetConversation();
      return;
    }

    // 🔥 Use the full message processing pipeline

    // 1. Get the current message array (as a mutable array)
    const currentMessages = [...this.messages()] as Message[];

    // 2. Handle special messages (TodoWrite, usage, ...)
    this.processMessage(event);

    // 3. Process messages with the helper functions:
    //    - attach tool_result to tool_use (reactive update)
    //    - convert raw events to Message and append to the array
    processAndAttachMessage(currentMessages, event);

    // 4. Merge consecutive Read messages into ReadCoalesced (disabled, kept for reference)
    // const merged = mergeConsecutiveReadMessages(currentMessages);

    // 5. Update the messages signal
    // this.messages(merged);
    this.messages(currentMessages);

    // 6. Update other state
    if (event?.type === 'system') {
      this.sessionId(event.session_id);
      // system/init and system/status carry the mode the CLI is actually in
      // (its settings default, or a switch it made itself, e.g. leaving plan mode).
      if (typeof event.permissionMode === 'string' && event.permissionMode) {
        this.permissionMode(event.permissionMode as PermissionMode);
      }
      if (event.subtype === 'init') {
        this.busy(true);
        if (typeof event.output_style === 'string' && event.output_style) {
          this.outputStyle(event.output_style);
        }
        const window = this.windowFromModel(event.model ?? this.modelSelection());
        if (window) {
          this.usageData({ ...this.usageData(), contextWindow: window });
        }
        void this.refreshContextUsage();
        void this.refreshAppliedEffort();
      } else if (event.subtype === 'compact_boundary') {
        // Compaction shrinks the context; the CLI knows the new size.
        void this.refreshContextUsage();
      } else if (event.subtype === 'session_title_changed' && typeof event.title === 'string') {
        // /rename <name> (or a title the CLI generated): becomes the tab title
        // through SessionStore's summary effect.
        if (event.title.trim()) {
          this.summary(event.title.trim());
        }
      }
    } else if (event?.type === 'result') {
      this.busy(false);
      this.updateCost(event);
      void this.refreshContextUsage();
      void this.refreshAppliedEffort();
      if (event.local_command === 'effort') {
        const arg = this.pendingEffortArg;
        this.pendingEffortArg = undefined;
        if (arg) {
          void this.syncEffortFromCli(arg);
        }
      }
    }
  }

  /** Read `applied.effort` (see appliedEffort); answers from another channel are dropped. */
  async refreshAppliedEffort(): Promise<string | null | undefined> {
    const channelId = this.claudeChannelId();
    if (!channelId) {
      return this.appliedEffort();
    }
    try {
      const connection = await this.getConnection();
      const applied = await connection.getAppliedEffort(channelId);
      if (applied !== undefined && channelId === this.claudeChannelId()) {
        this.appliedEffort(applied);
      }
    } catch {
      // keep the last known value
    }
    return this.appliedEffort();
  }

  /** Forget the shown conversation after the CLI reset it (see conversation_reset). */
  private resetConversation(): void {
    this.messages([]);
    this.todos([]);
    this.summary(undefined);
    this.lastSentSelection = undefined;
    this.pendingEffortArg = undefined;
    this.usageData({ ...this.usageData(), totalTokens: 0 });
    void this.refreshContextUsage();
  }

  /**
   * `/effort <level>` changed the CLI's effort without telling the UI: read the
   * level the CLI now applies and move the picker there. Only a level the CLI
   * confirms is taken (a typo leaves it at its usage text); `auto` reads back
   * as the model's default level, so it is taken from the command itself.
   */
  private async syncEffortFromCli(arg: string): Promise<void> {
    const channelId = this.claudeChannelId();
    if (!channelId) {
      return;
    }
    try {
      const connection = await this.getConnection();
      const applied = await connection.getAppliedEffort(channelId);
      if (applied === undefined || channelId !== this.claudeChannelId()) {
        return;
      }
      if (arg === 'auto') {
        this.effortLevel('auto');
      } else if (applied === arg) {
        this.effortLevel(applied);
      }
    } catch {
      // keep the picker as it was
    }
  }

  /**
   * Handle special messages (TodoWrite, usage stats)
   */
  private processMessage(event: any): void {
    if (
      event.type === 'assistant' &&
      event.message?.content &&
      Array.isArray(event.message.content)
    ) {
      // Handle TodoWrite
      for (const block of event.message.content) {
        if (
          block.type === 'tool_use' &&
          block.name === 'TodoWrite' &&
          block.input &&
          typeof block.input === 'object' &&
          'todos' in block.input
        ) {
          this.todos(block.input.todos);
        }
      }

      // Handle usage stats
      this.updateUsage(event);
    }
  }

  /**
   * Live estimate while a turn streams. The CLI computes context as the last
   * main-chain response's prompt (input + cache creation + cache read) plus
   * its output; subagent (sidechain) messages carry their own, unrelated
   * context and must not overwrite it. The authoritative figure replaces this
   * via refreshContextUsage() as soon as the turn ends.
   */
  private updateUsage(event: any): void {
    if (event.parent_tool_use_id) {
      return;
    }
    const usage = event.message?.usage;
    if (!usage || typeof usage.input_tokens !== 'number') {
      return;
    }
    const totalTokens =
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.output_tokens ?? 0);

    const current = this.usageData();
    this.usageData({ ...current, totalTokens });
  }

  /** `result` carries the cumulative session cost (latest value, not a delta). */
  private updateCost(event: any): void {
    if (typeof event.total_cost_usd === 'number') {
      this.usageData({ ...this.usageData(), totalCost: event.total_cost_usd });
    }
  }

  /**
   * Window size before the CLI has answered: `[1m]` model aliases are 1M,
   * everything else keeps the last known window.
   */
  private windowFromModel(model: string | undefined): number | undefined {
    return model && /\[1m\]/i.test(model) ? 1_000_000 : undefined;
  }

  /**
   * Ask the CLI for its own context numbers (same source as `/context`):
   * exact total and the model's real window. Out-of-order answers are dropped.
   */
  private async refreshContextUsage(): Promise<void> {
    const channelId = this.claudeChannelId();
    if (!channelId) {
      return;
    }
    const seq = ++this.contextUsageSeq;
    try {
      const connection = await this.getConnection();
      const usage = await connection.getContextUsage(channelId);
      if (!usage || seq !== this.contextUsageSeq || channelId !== this.claudeChannelId()) {
        return;
      }
      if (usage.model) {
        this.cliModel(usage.model);
      }
      this.usageData({
        ...this.usageData(),
        totalTokens: usage.totalTokens,
        contextWindow: usage.maxTokens > 0 ? usage.maxTokens : this.usageData().contextWindow
      });
    } catch {
      // keep the live estimate
    }
  }

  private buildUserMessage(
    input: string,
    attachments: AttachmentPayload[],
    selection?: SelectionRange
  ): any {
    const content: any[] = [];

    if (selection?.selectedText) {
      content.push({
        type: 'text',
        text: `<ide_selection>The user selected the lines ${selection.startLine} to ${selection.endLine} from ${selection.filePath}:
${selection.selectedText}

This may or may not be related to the current task.</ide_selection>`
      });
    }

    for (const attachment of attachments) {
      const { fileName, mediaType, data } = attachment;
      if (!data) {
        console.error(`Attachment missing data: ${fileName}`);
        continue;
      }

      const normalizedType = (mediaType || 'application/octet-stream').toLowerCase();

      if (IMAGE_MEDIA_TYPES.includes(normalizedType as (typeof IMAGE_MEDIA_TYPES)[number])) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: normalizedType,
            data
          }
        });
        continue;
      }

      if (normalizedType === 'text/plain') {
        try {
          const decoded = typeof globalThis.atob === 'function' ? globalThis.atob(data) : '';
          content.push({
            type: 'document',
            source: {
              type: 'text',
              media_type: 'text/plain',
              data: decoded
            },
            title: fileName
          });
          continue;
        } catch (error) {
          console.error('Failed to decode text attachment', error);
        }
      }

      if (normalizedType === 'application/pdf') {
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data
          },
          title: fileName
        });
        continue;
      }

      console.error(`Unsupported attachment type: ${fileName} (${normalizedType})`);
    }

    content.push({ type: 'text', text: input });

    return {
      type: 'user',
      session_id: '',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content
      }
    };
  }

  private isSlashCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  private isSameSelection(a?: SelectionRange, b?: SelectionRange): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      a.filePath === b.filePath &&
      a.startLine === b.startLine &&
      a.endLine === b.endLine &&
      a.startColumn === b.startColumn &&
      a.endColumn === b.endColumn &&
      a.selectedText === b.selectedText
    );
  }
}
