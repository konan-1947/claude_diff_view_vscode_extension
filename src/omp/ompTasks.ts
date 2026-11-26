import { randomUUID } from 'crypto';
import { OmpSdkTranslator } from './ompToSdk';
import { toSdkToolUse } from './ompTools';

/**
 * omp background work → the Claude SDK task messages the chat UI (uic) renders.
 *
 * | omp frame / tool call                                  | SDK message                          |
 * |--------------------------------------------------------|--------------------------------------|
 * | task tool call with N items                            | N assistant tool_use 'Task' blocks   |
 * | task tool result                                       | one tool_result per Task id          |
 * | subagent_lifecycle started                             | system/task_started                  |
 * | subagent_progress                                      | system/task_progress                 |
 * | subagent_event (assistant/user parts)                  | assistant/user with parent_tool_use_id |
 * | subagent_lifecycle completed/failed/aborted            | system/task_notification             |
 * | bash tool call with async:true, details.async running  | system/task_started (local_bash)     |
 * | tool_execution_update with details.async finished      | system/task_notification             |
 * | any change of the running set                          | system/background_tasks_changed      |
 *
 * One omp `task` call may hold several subagents, so the card is split: item i
 * of a call with N items becomes tool_use `${callId}#${i}` (N === 1 keeps the
 * plain call id), and every subagent frame is attached to it through
 * `parent_tool_use_id` on the forwarded messages.
 */

interface TaskItem {
  description: string;
  prompt: string;
  subagentType: string;
}

interface TaskCall {
  count: number;
  items: TaskItem[];
}

const MAX_TASK_CALLS = 500;
/** Finished subagent ids kept so a late progress frame does not bring one back */
const MAX_FINISHED = 1000;

function text(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

/**
 * First non-empty line under a "Change" heading, cut to 80 chars. Without such
 * a heading: the first non-empty line that is not a markdown heading.
 */
function firstLine(task: string): string {
  const lines = task.split('\n');
  const heading = lines.findIndex((line) => /^#+\s*change$/i.test(line.trim()));
  for (let i = heading >= 0 ? heading + 1 : 0; i < lines.length; i++) {
    const value = lines[i].trim();
    if (value.startsWith('#')) {
      if (heading >= 0) break;
      continue;
    }
    if (!value) continue;
    return value.length > 80 ? value.slice(0, 80) + '…' : value;
  }
  return '';
}

function callIdFor(callId: string, index: number, count: number): string {
  return count > 1 ? `${callId}#${index}` : callId;
}

type TaskToolUse = { type: 'tool_use'; id: string; name: 'Task'; input: { description: string; prompt: string; subagent_type: string } };

/**
 * The task calls of one conversation (one per channel, one per history load):
 * how many cards each was split into, so its result and subagent frames go to
 * the right ids. Bounded, oldest dropped first.
 */
export class OmpTaskCalls {
  private readonly calls = new Map<string, TaskCall>();

  /** One 'Task' tool_use block per task item of an omp `task` call. */
  toolUses(callId: string, args: any, intent?: string): TaskToolUse[] {
    const items: TaskItem[] = (Array.isArray(args?.tasks) ? args.tasks : [])
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any) => {
        const task = text(item.task);
        const context = text(args?.context);
        return {
          description: text(item.name).trim() || firstLine(task) || text(intent) || 'Task',
          prompt: context ? `${context}\n\n${task}` : task,
          subagentType: text(item.agent) || 'task',
        };
      });
    this.calls.delete(callId);
    if (!items.length) {
      this.remember(callId, { count: 0, items: [] });
      return [{ type: 'tool_use', id: callId, name: 'Task', input: { description: text(intent) || 'Task', prompt: '', subagent_type: 'task' } }];
    }
    this.remember(callId, { count: items.length, items });
    return items.map((item, index) => ({
      type: 'tool_use' as const,
      id: callIdFor(callId, index, items.length),
      name: 'Task' as const,
      input: { description: item.description, prompt: item.prompt, subagent_type: item.subagentType },
    }));
  }

  /** tool_use ids the single omp task tool_result must be copied to. */
  resultIds(callId: string, details: any): string[] {
    const progress = Array.isArray(details?.progress) ? details.progress.length : 0;
    const results = Array.isArray(details?.results) ? details.results.length : 0;
    const count = this.calls.get(callId)?.count || progress || results || 1;
    return Array.from({ length: count }, (_, i) => callIdFor(callId, i, count));
  }

  /** tool_use id of task item `index` of `callId`. */
  toolUseId(callId: string, index: number): string {
    const count = this.calls.get(callId)?.count ?? 0;
    if (!count) return index === 0 ? callId : `${callId}#${index}`;
    return callIdFor(callId, index, count);
  }

  item(callId: string, index: number): TaskItem | undefined {
    return this.calls.get(callId)?.items[index];
  }

  private remember(callId: string, call: TaskCall): void {
    this.calls.set(callId, call);
    while (this.calls.size > MAX_TASK_CALLS) {
      const oldest = this.calls.keys().next().value;
      if (oldest === undefined) break;
      this.calls.delete(oldest);
    }
  }
}

interface SubagentState {
  toolUseId?: string;
  description: string;
  subagentType: string;
  prompt: string;
  backgrounded: boolean;
  running: boolean;
  tokens: number;
  toolUses: number;
  durationMs: number;
  lastText: string;
}

interface BashJob {
  taskId: string;
  toolUseId: string;
  description: string;
  running: boolean;
}

export interface OmpTaskTrackerOptions {
  sessionId(): string;
  cwd: string;
  model(): string;
  /** Posts an SDK message to the webview */
  emit(message: any): void;
  /** Sends an omp RPC command */
  request(command: Record<string, unknown>): Promise<any>;
  /** The channel's task calls (shared with its main translator) */
  taskCalls: OmpTaskCalls;
}

/** Tracks omp subagents and background bash jobs for one channel. */
export class OmpTaskTracker {
  private readonly subagents = new Map<string, SubagentState>();
  private readonly jobs = new Map<string, BashJob>();
  private readonly children = new Map<string, OmpSdkTranslator>();
  /** bash command line per toolCallId (background job description) */
  private readonly commands = new Map<string, string>();
  /** Subagents that ended (their state is dropped; late frames are ignored) */
  private readonly finished = new Set<string>();

  constructor(private readonly opts: OmpTaskTrackerOptions) {}

  /** true = frame consumed (do not hand it to the main translator). */
  handle(frame: any): boolean {
    switch (frame?.type) {
      case 'subagent_lifecycle':
        this.onLifecycle(frame.payload ?? {});
        return true;
      case 'subagent_progress':
        this.onProgress(frame.payload ?? {});
        return true;
      case 'subagent_event':
        this.onChildEvent(frame.payload ?? {});
        return true;
      case 'tool_execution_start':
        if (frame.toolName === 'bash' && frame.args?.async === true && typeof frame.args.command === 'string') {
          this.commands.set(frame.toolCallId, frame.args.command);
        }
        return false;
      case 'tool_execution_end':
        this.onToolEnd(frame);
        return false;
      case 'tool_execution_update':
        this.onToolUpdate(frame);
        return false;
      default:
        return false;
    }
  }

  /** A subagent is still running (its file writes may still end) */
  get hasRunningSubagents(): boolean {
    for (const state of this.subagents.values()) if (state.running) return true;
    return false;
  }

  async stopTask(taskId: string): Promise<{ type: 'stop_task_response'; error?: string }> {
    const subagent = this.subagents.get(taskId);
    if (subagent) {
      if (!subagent.running) return { type: 'stop_task_response', error: 'Subagent is not running' };
      try {
        const result = await this.opts.request({ type: 'cancel_subagent', subagentId: taskId });
        if (result?.cancelled === false) return { type: 'stop_task_response', error: 'Subagent is not running' };
        return { type: 'stop_task_response' };
      } catch (error) {
        return { type: 'stop_task_response', error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (this.jobs.has(taskId)) {
      return { type: 'stop_task_response', error: 'omp cannot stop a background job over RPC' };
    }
    return { type: 'stop_task_response', error: 'Unknown task' };
  }

  private onLifecycle(payload: any): void {
    const id = text(payload.id);
    if (!id || this.finished.has(id)) return;
    const index = typeof payload.index === 'number' ? payload.index : 0;
    const callId = text(payload.parentToolCallId);
    const previous = this.subagents.get(id);
    const item = callId ? this.opts.taskCalls.item(callId, index) : undefined;
    const state: SubagentState = previous ?? {
      toolUseId: undefined,
      description: '',
      subagentType: text(payload.agent),
      prompt: '',
      backgrounded: payload.detached === true,
      running: false,
      tokens: 0,
      toolUses: 0,
      durationMs: 0,
      lastText: '',
    };
    if (callId) state.toolUseId = this.opts.taskCalls.toolUseId(callId, index);
    if (item) {
      state.description = item.description;
      state.prompt = item.prompt;
      state.subagentType = item.subagentType;
    } else if (!state.description) {
      state.description = text(payload.description) || id;
    }
    if (!state.subagentType) state.subagentType = text(payload.agent) || 'task';
    state.backgrounded = payload.detached === true;
    this.subagents.set(id, state);

    switch (payload.status) {
      case 'started':
        state.running = true;
        this.opts.emit(this.system('task_started', {
          task_id: id,
          tool_use_id: state.toolUseId,
          description: state.description,
          task_type: 'local_agent',
          subagent_type: state.subagentType,
          prompt: state.prompt,
          is_backgrounded: payload.detached === true,
        }));
        this.emitBackgroundList();
        return;
      case 'completed':
      case 'failed':
      case 'aborted': {
        state.running = false;
        this.children.delete(id);
        this.subagents.delete(id);
        this.finished.add(id);
        if (this.finished.size > MAX_FINISHED) this.finished.delete(this.finished.values().next().value as string);
        const usage: Record<string, number> = {};
        if (state.tokens > 0) usage.total_tokens = state.tokens;
        if (state.toolUses > 0) usage.tool_uses = state.toolUses;
        if (state.durationMs > 0) usage.duration_ms = state.durationMs;
        this.opts.emit(this.system('task_notification', {
          task_id: id,
          tool_use_id: state.toolUseId,
          status: payload.status === 'completed' ? 'completed' : payload.status === 'failed' ? 'failed' : 'stopped',
          summary: state.lastText || undefined,
          ...(Object.keys(usage).length ? { usage } : {}),
        }));
        this.emitBackgroundList();
        return;
      }
      default:
        return;
    }
  }

  private onProgress(payload: any): void {
    const progress = payload.progress;
    const id = text(progress?.id);
    if (!id || this.finished.has(id)) return;
    let state = this.subagents.get(id);
    if (!state) {
      state = {
        toolUseId: undefined,
        description: id,
        subagentType: text(payload.agent) || 'task',
        prompt: '',
        backgrounded: payload.detached === true,
        running: true,
        tokens: 0,
        toolUses: 0,
        durationMs: 0,
        lastText: '',
      };
      this.subagents.set(id, state);
    }
    if (typeof progress.tokens === 'number') state.tokens = progress.tokens;
    if (typeof progress.toolCount === 'number') state.toolUses = progress.toolCount;
    if (typeof progress.durationMs === 'number') state.durationMs = progress.durationMs;
    const recentTools = Array.isArray(progress.recentTools) ? progress.recentTools : [];
    const newestTool = recentTools[0]?.tool;
    const lastToolName = typeof newestTool === 'string' && newestTool ? toSdkToolUse(newestTool, {}).name : undefined;
    this.opts.emit(this.system('task_progress', {
      task_id: id,
      tool_use_id: state.toolUseId,
      usage: { total_tokens: state.tokens, tool_uses: state.toolUses, duration_ms: state.durationMs },
      ...(lastToolName ? { last_tool_name: lastToolName } : {}),
      summary: progress.lastIntent,
    }));
  }

  private onChildEvent(payload: any): void {
    const id = text(payload.id);
    const event = payload.event;
    if (!id || !event || this.finished.has(id)) return;
    const state = this.subagents.get(id);
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_end') {
      const content = event.assistantMessageEvent.content;
      if (typeof content === 'string' && content) {
        if (state) state.lastText = content;
      }
    }
    let translator = this.children.get(id);
    if (!translator) {
      translator = new OmpSdkTranslator(
        {
          sessionId: () => this.opts.sessionId(),
          cwd: this.opts.cwd,
          model: () => this.opts.model(),
          version: () => undefined,
          slashCommands: () => [],
          onError: () => undefined,
          taskCalls: this.opts.taskCalls,
        },
        (message) => {
          if (message?.type !== 'assistant' && message?.type !== 'user') return;
          const toolUseId = this.subagents.get(id)?.toolUseId;
          if (!toolUseId) return;
          this.opts.emit({ ...message, parent_tool_use_id: toolUseId });
        },
      );
      this.children.set(id, translator);
    }
    translator.handle(event);
  }

  private onToolEnd(frame: any): void {
    const command = this.commands.get(frame.toolCallId);
    this.commands.delete(frame.toolCallId);
    const async = frame.result?.details?.async;
    if (async?.state !== 'running' || async.type !== 'bash') return;
    const taskId = text(async.jobId);
    if (!taskId) return;
    const description = command || 'Background shell';
    this.jobs.set(taskId, { taskId, toolUseId: frame.toolCallId, description, running: true });
    this.opts.emit(this.system('task_started', {
      task_id: taskId,
      tool_use_id: frame.toolCallId,
      description,
      task_type: 'local_bash',
      is_backgrounded: true,
    }));
    this.emitBackgroundList();
  }

  private onToolUpdate(frame: any): void {
    const async = frame.partialResult?.details?.async;
    if (async?.type !== 'bash' || async.state === 'running') return;
    const job = this.jobs.get(text(async.jobId));
    if (!job || !job.running) return;
    job.running = false;
    this.jobs.delete(job.taskId);
    const content = Array.isArray(frame.partialResult?.content) ? frame.partialResult.content : [];
    const lines = content
      .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
      .flatMap((part: any) => String(part.text).split('\n'));
    let summary = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      const value = lines[i].trim();
      if (!value || /^Wall time:/.test(value)) continue;
      summary = value;
      break;
    }
    this.opts.emit(this.system('task_notification', {
      task_id: job.taskId,
      tool_use_id: job.toolUseId,
      status: async.state === 'completed' ? 'completed' : 'failed',
      summary: summary || undefined,
    }));
    this.emitBackgroundList();
  }

  /** FULL list of tasks still running in the background (replaces the UI list). */
  private emitBackgroundList(): void {
    const tasks: Record<string, string>[] = [];
    for (const [id, state] of this.subagents) {
      if (!state.running || !state.backgrounded) continue;
      tasks.push({
        task_id: id,
        task_type: 'local_agent',
        description: state.description,
        subagent_type: state.subagentType,
      });
    }
    for (const job of this.jobs.values()) {
      if (!job.running) continue;
      tasks.push({ task_id: job.taskId, task_type: 'local_bash', description: job.description });
    }
    this.opts.emit(this.system('background_tasks_changed', { tasks }));
  }

  private system(subtype: string, fields: Record<string, unknown>): any {
    return { type: 'system', subtype, uuid: randomUUID(), session_id: this.opts.sessionId(), ...fields };
  }
}
