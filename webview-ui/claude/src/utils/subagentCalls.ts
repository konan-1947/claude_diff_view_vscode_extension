import type { TaskInfo } from '../core/LiveActivity';
import { formatDuration, formatTokenCount } from '../core/LiveActivity';

/** One tool call a subagent made, for a compact row like the CLI's `Bash(echo hi)` */
export interface SubagentCall {
  id: string;
  name: string;
  /** The argument that says what the call does (command, file, pattern...) */
  detail: string;
  /** detail is a command to run: shown in the command font (paths, patterns... use the chat font) */
  isCode: boolean;
  /** codicon class: running / failed / done */
  icon: string;
}

/**
 * The tool a subagent ends with to hand its report to the main agent. Not a
 * step worth listing: its text is the subagent's result (the task's own
 * summary then only says "delivered as a message").
 */
const HANDBACK_TOOL = 'SubagentHandback';

export function subagentCalls(messages: any[]): SubagentCall[] {
  const calls: SubagentCall[] = [];
  for (const message of messages) {
    if (message?.type !== 'assistant' || !Array.isArray(message.message?.content)) continue;
    for (const wrapper of message.message.content) {
      const block = wrapper?.content;
      if (block?.type !== 'tool_use' || block.name === HANDBACK_TOOL) continue;
      const result = wrapper.getToolResultValue?.();
      const { text, key } = mainArgument(block.input);
      calls.push({
        id: block.id,
        name: block.name,
        detail: shorten(block.name, text),
        isCode: !!text && key === 'command',
        icon: !result
          ? 'codicon-loading codicon-modifier-spin'
          : result.is_error ? 'codicon-error' : 'codicon-check',
      });
    }
  }
  return calls;
}

function mainArgument(input: any): { text: string; key: string } {
  if (!input || typeof input !== 'object') return { text: '', key: '' };
  for (const key of ['command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'description', 'prompt']) {
    if (typeof input[key] === 'string') return { text: input[key], key };
  }
  const entry = Object.entries(input).find(([, v]) => typeof v === 'string');
  return entry ? { text: entry[1] as string, key: entry[0] } : { text: '', key: '' };
}

function shorten(name: string, text: string): string {
  const firstLine = text.split('\n')[0];
  if ((name === 'Read' || name === 'Write' || name === 'Edit') && /[\\/]/.test(firstLine)) {
    return firstLine.split(/[\\/]/).pop() ?? firstLine;
  }
  return firstLine.length > 120 ? firstLine.slice(0, 119) + '…' : firstLine;
}

/** The report the subagent handed back (its SubagentHandback text), if any */
export function subagentReport(messages: any[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]?.message?.content;
    if (messages[i]?.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const wrapper of content) {
      const block = wrapper?.content;
      if (block?.type === 'tool_use' && block.name === HANDBACK_TOOL) {
        const text = mainArgument(block.input).text;
        if (text.trim()) return text;
      }
    }
  }
  return undefined;
}

/** The CLI-like one-liner of a subagent: what it does now (or how it ended) and how much it did */
export interface SubagentStatus {
  what: string;
  /** Argument of the running call, e.g. the command of `Bash(...)` */
  detail: string;
  isCode: boolean;
  stats: string;
}

export function subagentStatus(
  task: TaskInfo | undefined,
  calls: SubagentCall[],
  running: boolean,
  now: number
): SubagentStatus | null {
  if (!task && calls.length === 0) return null;
  const toolUses = task?.toolUses ?? calls.length;
  const durationMs = running
    ? now - (task?.startedAt ?? now)
    : task?.durationMs ?? (task?.endedAt && task.startedAt ? task.endedAt - task.startedAt : undefined);
  const stats = [
    toolUses ? `${toolUses} tool use${toolUses === 1 ? '' : 's'}` : '',
    task?.totalTokens ? `${formatTokenCount(task.totalTokens)} tokens` : '',
    durationMs !== undefined && durationMs >= 1000 ? formatDuration(durationMs) : '',
  ].filter(Boolean).join('   ');
  if (running) {
    const last = calls[calls.length - 1];
    return {
      what: last ? last.name : (task?.lastToolName ?? 'Working…'),
      detail: last?.detail ?? '',
      isCode: last?.isCode ?? false,
      stats,
    };
  }
  let what = 'Done';
  if (task?.status === 'failed') what = task.error ? `Failed: ${task.error}` : 'Failed';
  else if (task?.status === 'killed' || task?.status === 'stopped') what = 'Stopped';
  return { what, detail: '', isCode: false, stats };
}
