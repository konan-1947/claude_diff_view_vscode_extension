import { signal } from 'alien-signals';
import type { Message } from '../models/Message';
import { processAndAttachMessage } from '../utils/messageUtils';

/**
 * What the CLI reports while it works, besides the transcript: subagents and
 * background tasks (`system/task_*`, `background_tasks_changed`), the size of
 * the current turn (`stream_event`, `thinking_tokens`), rate limits
 * (`rate_limit_event`) and API retries (`system/api_retry`).
 *
 * Shapes checked against a real CLI run (SDK 0.3.x): the `Agent` tool starts a
 * background subagent by default (`is_backgrounded: true`), its messages come
 * with `parent_tool_use_id` = that tool_use's id, and its task keeps running
 * (and reporting) after the main turn's `result`.
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed' | 'stopped' | 'paused';

export interface TaskInfo {
  taskId: string;
  /** The tool_use that started it (Agent / Bash), when known */
  toolUseId?: string;
  description: string;
  /** `local_bash`, `local_agent`, ... */
  taskType?: string;
  subagentType?: string;
  /** What the subagent was asked to do */
  prompt?: string;
  status: TaskStatus;
  backgrounded: boolean;
  startedAt: number;
  endedAt?: number;
  totalTokens?: number;
  toolUses?: number;
  durationMs?: number;
  lastToolName?: string;
  summary?: string;
  error?: string;
}

/** A task the CLI already reported as finished is gone, even before its next task list */
const FINISHED_STATUSES = new Set(['completed', 'failed', 'killed', 'stopped']);
export function isTaskFinished(info: TaskInfo | undefined): boolean {
  return FINISHED_STATUSES.has(info?.status ?? '');
}

export interface BackgroundTask {
  taskId: string;
  taskType: string;
  description: string;
  subagentType?: string;
}

export interface RateLimitInfo {
  status: 'allowed' | 'allowed_warning' | 'rejected';
  /** Epoch seconds */
  resetsAt?: number;
  rateLimitType?: string;
  /** 0..1 */
  utilization?: number;
}

export interface ApiRetryInfo {
  attempt: number;
  maxRetries: number;
  /** When the next attempt starts (epoch ms) */
  retryAt: number;
  errorStatus: number | null;
  error?: string;
}

/** Roughly what the CLI counts while a response streams in: 4 characters ≈ 1 token */
const CHARS_PER_TOKEN = 4;

export class LiveActivity {
  /** Subagent messages, by the tool_use id of the Agent call that started them */
  readonly subagentMessages = signal<Record<string, Message[]>>({});
  readonly tasks = signal<Record<string, TaskInfo>>({});
  /** The CLI's list of tasks still running in the background */
  readonly backgroundTasks = signal<BackgroundTask[]>([]);
  readonly rateLimit = signal<RateLimitInfo | undefined>(undefined);
  readonly apiRetry = signal<ApiRetryInfo | undefined>(undefined);
  /** Output tokens of the current turn (main conversation only), live estimate */
  readonly turnTokens = signal(0);

  private committedTokens = 0;
  private textChars = 0;
  private thinkingChars = 0;
  private thinkingEstimate = 0;

  /** A new turn starts: its token counter starts at 0 */
  beginTurn(): void {
    this.committedTokens = 0;
    this.resetLiveMessage();
    this.turnTokens(0);
    this.apiRetry(undefined);
  }

  /** /clear: the transcript (and so the Agent cards) is gone */
  resetConversation(): void {
    this.subagentMessages({});
  }

  /**
   * Handle an event. Returns true when it belongs here only and must not go
   * into the main transcript (subagent messages, stream events).
   */
  handle(event: any): boolean {
    if (!event || typeof event !== 'object') return false;

    if (event.type === 'stream_event') {
      if (!event.parent_tool_use_id) this.onStreamEvent(event.event);
      return true;
    }

    if (event.type === 'rate_limit_event') {
      this.onRateLimit(event.rate_limit_info);
      return true;
    }

    if ((event.type === 'assistant' || event.type === 'user') && event.parent_tool_use_id) {
      this.addSubagentMessage(event.parent_tool_use_id, event);
      return true;
    }

    if (event.type === 'assistant' && !event.parent_tool_use_id) {
      this.apiRetry(undefined);
    }

    if (event.type === 'result') {
      this.apiRetry(undefined);
    }

    if (event.type === 'system') {
      this.onSystem(event);
    }
    return false;
  }

  private onSystem(event: any): void {
    switch (event.subtype) {
      case 'task_started':
        this.updateTask(event.task_id, {
          taskId: event.task_id,
          toolUseId: event.tool_use_id,
          description: event.description ?? '',
          taskType: event.task_type,
          subagentType: event.subagent_type,
          prompt: typeof event.prompt === 'string' ? event.prompt : undefined,
          status: 'running',
          backgrounded: event.is_backgrounded === true,
          startedAt: Date.now(),
        });
        break;
      case 'task_progress':
        this.updateTask(event.task_id, {
          toolUseId: event.tool_use_id,
          totalTokens: event.usage?.total_tokens,
          toolUses: event.usage?.tool_uses,
          durationMs: event.usage?.duration_ms,
          lastToolName: event.last_tool_name,
          summary: event.summary,
        });
        break;
      case 'task_updated': {
        const patch = event.patch ?? {};
        this.updateTask(event.task_id, {
          status: patch.status,
          description: patch.description,
          endedAt: typeof patch.end_time === 'number' ? patch.end_time : undefined,
          error: patch.error,
          backgrounded: typeof patch.is_backgrounded === 'boolean' ? patch.is_backgrounded : undefined,
        });
        break;
      }
      case 'task_notification':
        this.updateTask(event.task_id, {
          toolUseId: event.tool_use_id,
          status: event.status,
          summary: event.summary,
          endedAt: Date.now(),
          totalTokens: event.usage?.total_tokens,
          toolUses: event.usage?.tool_uses,
          durationMs: event.usage?.duration_ms,
        });
        break;
      case 'background_tasks_changed':
        this.backgroundTasks(
          (Array.isArray(event.tasks) ? event.tasks : [])
            .filter((t: any) => t && typeof t.task_id === 'string' && t.ambient !== true)
            .map((t: any) => ({
              taskId: t.task_id,
              taskType: t.task_type ?? '',
              description: t.description ?? '',
              subagentType: t.subagent_type,
            }))
        );
        break;
      case 'api_retry':
        this.apiRetry({
          attempt: event.attempt,
          maxRetries: event.max_retries,
          retryAt: Date.now() + (event.retry_delay_ms ?? 0),
          errorStatus: event.error_status ?? null,
          error: event.error,
        });
        break;
      case 'thinking_tokens':
        if (typeof event.estimated_tokens === 'number') {
          this.thinkingEstimate = event.estimated_tokens;
          this.publishTokens();
        }
        break;
    }
  }

  private onStreamEvent(e: any): void {
    if (!e) return;
    if (e.type === 'message_start') {
      this.apiRetry(undefined);
      this.resetLiveMessage();
    } else if (e.type === 'content_block_delta') {
      const d = e.delta ?? {};
      if (typeof d.text === 'string') this.textChars += d.text.length;
      else if (typeof d.partial_json === 'string') this.textChars += d.partial_json.length;
      else if (typeof d.thinking === 'string') this.thinkingChars += d.thinking.length;
    } else if (e.type === 'message_delta') {
      // The response's real size replaces the estimate
      if (typeof e.usage?.output_tokens === 'number') {
        this.committedTokens += e.usage.output_tokens;
        this.resetLiveMessage();
      }
    }
    this.publishTokens();
  }

  private onRateLimit(info: any): void {
    if (!info || typeof info.status !== 'string') return;
    const type = info.rateLimitType;
    const windowInfo = type ? info.unifiedWindows?.[type] : undefined;
    this.rateLimit({
      status: info.status,
      resetsAt: info.resetsAt ?? windowInfo?.resetsAt,
      rateLimitType: type,
      utilization: info.utilization ?? windowInfo?.utilization,
    });
  }

  private addSubagentMessage(parentId: string, event: any): void {
    const all = this.subagentMessages();
    const list = [...(all[parentId] ?? [])];
    processAndAttachMessage(list, event);
    this.subagentMessages({ ...all, [parentId]: list });
  }

  private updateTask(taskId: unknown, patch: Partial<TaskInfo>): void {
    if (typeof taskId !== 'string' || !taskId) return;
    const all = this.tasks();
    const current: TaskInfo = all[taskId] ?? {
      taskId,
      description: '',
      status: 'running',
      backgrounded: false,
      startedAt: Date.now(),
    };
    const next: TaskInfo = { ...current };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined && value !== null) (next as any)[key] = value;
    }
    this.tasks({ ...all, [taskId]: next });
  }

  private resetLiveMessage(): void {
    this.textChars = 0;
    this.thinkingChars = 0;
    this.thinkingEstimate = 0;
  }

  private publishTokens(): void {
    const live =
      this.textChars / CHARS_PER_TOKEN +
      Math.max(this.thinkingChars / CHARS_PER_TOKEN, this.thinkingEstimate);
    this.turnTokens(Math.round(this.committedTokens + live));
  }
}

/** The task an Agent / Bash tool_use started, if the CLI reported one */
export function taskForToolUse(tasks: Record<string, TaskInfo>, toolUseId: string | undefined): TaskInfo | undefined {
  if (!toolUseId) return undefined;
  for (const task of Object.values(tasks)) {
    if (task.toolUseId === toolUseId) return task;
  }
  return undefined;
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
