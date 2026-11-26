import { randomUUID } from 'crypto';
import { toSdkToolUse } from './ompTools';
import type { OmpTaskCalls } from './ompTasks';

/**
 * omp RPC session events → the Claude Agent SDK messages the chat UI (uic)
 * already renders. One translator per channel (one omp process).
 *
 * | omp frame                                   | SDK message sent to the UI                     |
 * |---------------------------------------------|------------------------------------------------|
 * | agent_start                                 | system/init (marks the turn busy)              |
 * | message_update text/thinking/toolcall delta | stream_event content_block_delta (turn size)   |
 * | message_update text_end/thinking_end/toolcall_end | assistant message with that one block    |
 * | message_end (assistant)                     | stream_event message_delta (real output size)  |
 * | tool_execution_end                          | user message with the tool_result              |
 * | auto_retry_start                            | system/api_retry                               |
 * | auto/manual_compaction_end with a result    | system/compact_boundary                        |
 * | session_info_update with a title            | system/session_title_changed                   |
 * | config_update with a model                  | session_model (picker follows the CLI)         |
 * | command_output                              | synthetic assistant text (slash command output)|
 * | prompt_result                               | result (ends the turn); aborted adds the       |
 * |                                             | "[Request interrupted by user]" line first     |
 *
 * Like the Claude SDK, each finished content block is its own assistant
 * message (same `message.id`); the UI groups them into the turn.
 */
export interface TranslatorContext {
  sessionId(): string;
  cwd: string;
  model(): string;
  version(): string | undefined;
  slashCommands(): string[];
  /** A request failed (assistant stopReason "error", prompt_result error) */
  onError(message: string): void;
  /** Task calls of this conversation (shared with the channel's OmpTaskTracker) */
  taskCalls: OmpTaskCalls;
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost?: { total?: number };
}

export class OmpSdkTranslator {
  private turnStartedAt = 0;
  private turnCost = 0;
  private lastText = '';
  private numTurns = 0;
  /** omp messageId → SDK message id, shared by the blocks of one assistant message */
  private readonly messageIds = new Map<string, string>();

  constructor(
    private readonly ctx: TranslatorContext,
    private readonly emit: (message: any) => void,
  ) {}

  handle(frame: any): void {
    switch (frame?.type) {
      case 'agent_start':
        this.turnStartedAt = Date.now();
        this.turnCost = 0;
        this.lastText = '';
        this.numTurns = 0;
        this.emit(this.init());
        return;
      case 'turn_start':
        this.numTurns++;
        return;
      case 'message_start':
        if (frame.message?.role === 'assistant') {
          this.emit(this.stream({ type: 'message_start' }));
        }
        return;
      case 'message_update':
        this.onMessageUpdate(frame);
        return;
      case 'message_end':
        this.onMessageEnd(frame);
        return;
      case 'tool_execution_end':
        this.emit(this.toolResult(frame));
        return;
      case 'auto_retry_start':
        this.emit(this.system('api_retry', {
          attempt: frame.attempt,
          max_retries: frame.maxAttempts,
          retry_delay_ms: frame.delayMs,
          error: frame.errorMessage,
          error_status: null,
        }));
        return;
      case 'auto_compaction_end':
      case 'manual_compaction_end':
        if (frame.result && !frame.aborted) {
          this.emit(this.system('compact_boundary', {
            compact_metadata: {
              trigger: frame.type === 'auto_compaction_end' ? 'auto' : 'manual',
              pre_tokens: frame.result.tokensBefore,
            },
          }));
        }
        return;
      case 'session_info_update':
        if (typeof frame.title === 'string' && frame.title.trim()) {
          this.emit(this.system('session_title_changed', { title: frame.title }));
        }
        return;
      case 'config_update':
        // A builtin slash command (`/model`) switched the model inside omp
        if (frame.model) {
          const model = modelKey(frame.model);
          if (model) this.emit(this.sessionModel(model));
        }
        return;
      case 'command_output':
        if (typeof frame.text === 'string' && frame.text) {
          this.emit(this.assistant(randomUUID(), { type: 'text', text: frame.text }, undefined, '<synthetic>'));
        }
        return;
      case 'prompt_result':
        this.onPromptResult(frame);
        return;
      default:
        return;
    }
  }

  /**
   * The model omp resolved for this channel (launch, or a switch a builtin
   * slash command made). State only: the chat transcript never renders it.
   */
  sessionModel(model: string): Record<string, unknown> {
    return { type: 'session_model', model };
  }

  /** Session id + model for a system/init sent before any turn (resume, model switch). */
  init(): any {
    return {
      type: 'system',
      subtype: 'init',
      uuid: randomUUID(),
      session_id: this.ctx.sessionId(),
      cwd: this.ctx.cwd,
      model: this.ctx.model(),
      tools: [],
      mcp_servers: [],
      permissionMode: 'default',
      slash_commands: this.ctx.slashCommands(),
      apiKeySource: 'none',
      claude_code_version: this.ctx.version() ?? '',
      output_style: 'default',
    };
  }

  private onMessageUpdate(frame: any): void {
    const event = frame.assistantMessageEvent;
    if (!event || frame.message?.role !== 'assistant') return;
    switch (event.type) {
      case 'text_delta':
        this.emit(this.stream({ type: 'content_block_delta', index: event.contentIndex, delta: { type: 'text_delta', text: event.delta ?? '' } }));
        return;
      case 'thinking_delta':
        this.emit(this.stream({ type: 'content_block_delta', index: event.contentIndex, delta: { type: 'thinking_delta', thinking: event.delta ?? '' } }));
        return;
      case 'toolcall_delta':
        this.emit(this.stream({ type: 'content_block_delta', index: event.contentIndex, delta: { type: 'input_json_delta', partial_json: event.delta ?? '' } }));
        return;
      case 'text_end': {
        const text = typeof event.content === 'string' ? event.content : '';
        if (!text) return;
        this.lastText = text;
        this.emit(this.assistant(this.sdkMessageId(frame), { type: 'text', text }, event.partial));
        return;
      }
      case 'thinking_end': {
        const text = typeof event.content === 'string' ? event.content : '';
        if (!text) return;
        // `narration`: prose the provider returned as thinking; omp shows it as answer text
        const block = event.partial?.content?.[event.contentIndex];
        this.emit(this.assistant(
          this.sdkMessageId(frame),
          block?.narration ? { type: 'text', text } : { type: 'thinking', thinking: text },
          event.partial,
        ));
        return;
      }
      case 'toolcall_end': {
        const call = event.toolCall;
        if (!call?.id) return;
        if (call.name === 'task') {
          // One 'Task' card per task item; subagent frames attach to these ids
          for (const block of this.ctx.taskCalls.toolUses(call.id, call.arguments, call.intent ?? call.arguments?.i)) {
            this.emit(this.assistant(this.sdkMessageId(frame), block, event.partial));
          }
          return;
        }
        const mapped = toSdkToolUse(call.name, call.arguments, call.intent ?? call.arguments?.i);
        this.emit(this.assistant(
          this.sdkMessageId(frame),
          { type: 'tool_use', id: call.id, name: mapped.name, input: mapped.input },
          event.partial,
        ));
        return;
      }
      default:
        return;
    }
  }

  private onMessageEnd(frame: any): void {
    const message = frame.message;
    if (message?.role !== 'assistant') return;
    const usage: Usage | undefined = message.usage;
    if (usage) {
      this.turnCost += usage.cost?.total ?? 0;
      this.emit(this.stream({ type: 'message_delta', usage: { output_tokens: usage.output ?? 0 } }));
    }
    if (message.stopReason === 'error' && message.errorMessage) {
      this.ctx.onError(String(message.errorMessage));
    }
  }

  private onPromptResult(frame: any): void {
    if (frame.status === 'aborted') {
      this.emit({
        type: 'user',
        uuid: randomUUID(),
        session_id: this.ctx.sessionId(),
        parent_tool_use_id: null,
        message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] },
      });
    }
    const isError = frame.status === 'error';
    if (isError && frame.error?.message) {
      this.ctx.onError(String(frame.error.message));
    }
    this.emit({
      type: 'result',
      subtype: isError ? 'error_during_execution' : 'success',
      is_error: isError,
      uuid: randomUUID(),
      session_id: this.ctx.sessionId(),
      duration_ms: this.turnStartedAt ? Date.now() - this.turnStartedAt : 0,
      duration_api_ms: 0,
      num_turns: this.numTurns,
      result: this.lastText,
      total_cost_usd: this.turnCost,
      usage: {},
    });
    this.messageIds.clear();
  }

  private toolResult(frame: any): any {
    const result = frame.result ?? {};
    const content = Array.isArray(result.content)
      ? result.content.map(toSdkContent).filter(Boolean)
      : typeof result === 'string' ? [{ type: 'text', text: result }] : [];
    // A task call became one card per item: copy the single omp result to each
    const toolUseIds = frame.toolName === 'task' ? this.ctx.taskCalls.resultIds(frame.toolCallId, result.details) : [frame.toolCallId];
    return {
      type: 'user',
      uuid: randomUUID(),
      session_id: this.ctx.sessionId(),
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: toolUseIds.map((id) => ({
          type: 'tool_result',
          tool_use_id: id,
          content,
          is_error: frame.isError === true,
        })),
      },
      // Structured output (omp `details`), read by cards that want more than the text
      tool_use_result: result.details,
    };
  }

  private assistant(id: string, block: any, partial?: any, model?: string): any {
    const usage: Usage | undefined = partial?.usage;
    return {
      type: 'assistant',
      uuid: randomUUID(),
      session_id: this.ctx.sessionId(),
      parent_tool_use_id: null,
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model: model ?? partial?.model ?? this.ctx.model(),
        content: [block],
        stop_reason: null,
        stop_sequence: null,
        usage: usage
          ? {
              input_tokens: usage.input ?? 0,
              output_tokens: usage.output ?? 0,
              cache_read_input_tokens: usage.cacheRead ?? 0,
              cache_creation_input_tokens: usage.cacheWrite ?? 0,
            }
          : { input_tokens: 0, output_tokens: 0 },
      },
    };
  }

  private stream(event: any): any {
    return {
      type: 'stream_event',
      uuid: randomUUID(),
      session_id: this.ctx.sessionId(),
      parent_tool_use_id: null,
      event,
    };
  }

  private system(subtype: string, fields: Record<string, unknown>): any {
    return { type: 'system', subtype, uuid: randomUUID(), session_id: this.ctx.sessionId(), ...fields };
  }

  private sdkMessageId(frame: any): string {
    const key = typeof frame.messageId === 'string' ? frame.messageId : '';
    if (!key) return `msg_${randomUUID()}`;
    let id = this.messageIds.get(key);
    if (!id) {
      id = `msg_${randomUUID()}`;
      this.messageIds.set(key, id);
    }
    return id;
  }
}

/** omp ModelInfo → the `provider/id` key the model picker uses (see toCliModel). */
export function modelKey(model: unknown): string {
  if (!model || typeof model !== 'object') return '';
  const { provider, id } = model as { provider?: unknown; id?: unknown };
  const modelId = id == null ? '' : String(id);
  if (!modelId) return '';
  return typeof provider === 'string' && provider ? `${provider}/${modelId}` : modelId;
}

/** omp UserContent (text / image) → Anthropic content block */
function toSdkContent(part: any): any {
  if (part?.type === 'text') return { type: 'text', text: String(part.text ?? '') };
  if (part?.type === 'image' && typeof part.data === 'string') {
    return { type: 'image', source: { type: 'base64', media_type: part.mimeType || 'image/png', data: part.data } };
  }
  return undefined;
}
