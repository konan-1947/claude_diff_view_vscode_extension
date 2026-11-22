/**
 * Group a flat message list into conversation turns the way Cursor's sidebar
 * chat shows them: one user message followed by everything the assistant did
 * until the next user message.
 */
import type { Message } from '../models/Message';

export interface Turn {
  kind: 'turn';
  /** Stable key: index of the first message of the turn */
  key: number;
  user?: Message;
  assistant: Message[];
  startedAt: number;
  endedAt: number;
}

export interface LooseMessage {
  kind: 'message';
  key: number;
  message: Message;
}

export type ChatItem = Turn | LooseMessage;

const STANDALONE = new Set(['tip', 'system', 'slash_command_result', 'bash']);

export function buildChatItems(messages: Message[]): ChatItem[] {
  const items: ChatItem[] = [];
  let current: Turn | null = null;

  messages.forEach((m, i) => {
    if (!m || m.isEmpty) return;

    if (m.type === 'user') {
      current = { kind: 'turn', key: i, user: m, assistant: [], startedAt: m.timestamp, endedAt: m.timestamp };
      items.push(current);
      return;
    }

    if (m.type === 'assistant') {
      if (!current) {
        current = { kind: 'turn', key: i, assistant: [], startedAt: m.timestamp, endedAt: m.timestamp };
        items.push(current);
      }
      current.assistant.push(m);
      current.endedAt = Math.max(current.endedAt, m.timestamp);
      return;
    }

    // A hook line belongs to the turn it ran in (a blocked tool, a failed
    // UserPromptSubmit hook); splitting the turn there would orphan the rest.
    if (m.subtype === 'hook_response' && current) {
      current.assistant.push(m);
      return;
    }

    if (STANDALONE.has(m.type)) {
      current = null;
      items.push({ kind: 'message', key: i, message: m });
    }
    // 'result' and unknown types render nothing; they must not split a turn.
  });

  return items;
}

/** "9s", "1m 5s" */
export function formatDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** "Just now", "1m ago", "2h ago", "3d ago" */
export function formatAgo(ts: number, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 45) return 'Just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
