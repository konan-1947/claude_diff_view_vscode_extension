/**
 * Message - message class
 *
 * Core features:
 * 1. Wrap message data
 * 2. Provide an isEmpty getter (computed dynamically)
 * 3. Support reactive tool_result linking via ContentBlockWrapper
 */

import type { ContentBlockType, HookBlock, NoticeBlock } from '../models/ContentBlock';
import { parseMessageContent } from '../models/contentParsers';
import { ContentBlockWrapper } from '../models/ContentBlockWrapper';
import { parseUsageReport } from '../models/usageReport';

/**
 * Message type
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'result' | 'tip' | 'slash_command_result' | 'bash';

/**
 * Message content data
 */
export interface MessageData {
  role: MessageRole;
  content: string | ContentBlockWrapper[];
}

/**
 * Message class
 *
 * Matches the original logic:
 * - user/assistant messages: content is ContentBlockWrapper[]
 * - system/result messages: content is a string
 */
export class Message {
  type: MessageRole;
  message: MessageData;
  timestamp: number;

  // Extra fields (for system and result messages)
  subtype?: string;
  session_id?: string;
  is_error?: boolean;
  /** Transcript id of a user message (set by the UI on send, read back from history): rewind points at it */
  uuid?: string;
  /** A prompt the CLI took in during a running turn: shown inside that turn, not as a new one */
  midTurn?: boolean;

  constructor(
    type: MessageRole,
    message: MessageData,
    timestamp: number = Date.now(),
    extra?: {
      subtype?: string;
      session_id?: string;
      is_error?: boolean;
    }
  ) {
    this.type = type;
    this.message = message;
    this.timestamp = timestamp;

    if (extra) {
      this.subtype = extra.subtype;
      this.session_id = extra.session_id;
      this.is_error = extra.is_error;
    }
  }

  /**
   * isEmpty getter - whether the message is "empty"
   *
   * Logic:
   * 1. system messages are never empty
   * 2. user/assistant messages:
   *    - empty content array → empty
   *    - all content blocks are tool_result → empty
   */
  get isEmpty(): boolean {
    // system messages are never empty
    if (this.type === 'system') {
      return false;
    }

    const content = this.message.content;

    // String content is never empty
    if (typeof content === 'string') {
      return content.length === 0;
    }

    // ContentBlockWrapper array
    if (Array.isArray(content)) {
      // Empty array → empty
      if (content.length === 0) {
        return true;
      }

      // All content blocks are tool_result → empty
      return content.every((wrapper) => wrapper.content.type === 'tool_result');
    }

    return false;
  }

  /**
   * Static factory - create a Message instance from a raw message
   *
   * @param raw raw message object
   * @returns a Message instance or null
   */
  static fromRaw(raw: any): Message | null {
    if (raw.type === 'user' && isHiddenUserMessage(raw)) {
      return null;
    }

    // `/usage` output: the CLI answers local commands with a `<synthetic>`
    // assistant text; this one is drawn as a card instead of plain lines.
    const usage = raw.type === 'assistant' ? usageReportOf(raw) : undefined;
    if (usage) {
      return new Message(
        'tip',
        { role: 'system', content: [new ContentBlockWrapper(usage)] },
        toEpochMs(raw.timestamp),
        { subtype: 'usage_report' }
      );
    }

    if (raw.type === 'user' || raw.type === 'assistant') {
      const rawContent = Array.isArray(raw.message?.content)
        ? raw.message.content
        : raw.message?.content !== undefined
          ? [{ type: 'text', text: String(raw.message.content) }]
          : [];

      // Parse the raw content
      const contentBlocks = parseMessageContent(rawContent);

      // Wrap as ContentBlockWrapper
      const wrappedContent = contentBlocks.map((block) => new ContentBlockWrapper(block));

      // Determine the message type from the contentParsers result
      let messageType: MessageRole = raw.type;

      // Check for special message types
      if (raw.type === 'user') {
        const specialType = getSpecialMessageType(contentBlocks);
        if (specialType) {
          messageType = specialType;
        }
      }

      const message = new Message(
        messageType,
        {
          role: raw.message?.role ?? raw.type,
          content: wrappedContent,
        },
        toEpochMs(raw.timestamp)
      );
      if (raw.type === 'user' && typeof raw.uuid === 'string') {
        message.uuid = raw.uuid;
      }
      if (raw.type === 'user' && raw.midTurn === true) {
        message.midTurn = true;
      }
      return message;
    }

    // Compaction marker, as the CLI prints "Conversation compacted" in the transcript
    if (raw.type === 'system' && raw.subtype === 'compact_boundary') {
      const block: NoticeBlock = {
        type: 'notice',
        icon: 'fold',
        message: raw.compact_metadata?.trigger === 'auto'
          ? 'Conversation compacted automatically'
          : 'Conversation compacted',
        detail: formatCompactTokens(raw.compact_metadata),
      };
      return new Message(
        'tip',
        { role: 'system', content: [new ContentBlockWrapper(block)] },
        toEpochMs(raw.timestamp),
        { subtype: 'compact_boundary' }
      );
    }

    // A hook worth showing (see hookBlock): live event or a transcript attachment
    if (raw.type === 'system' && raw.subtype === 'hook_response') {
      const block = hookBlock(raw);
      if (!block) return null;
      return new Message(
        'tip',
        { role: 'system', content: [new ContentBlockWrapper(block)] },
        toEpochMs(raw.timestamp),
        { subtype: 'hook_response' }
      );
    }

    // Do not render other system messages (state updates only)
    if (raw.type === 'system') {
      return null;
    }

    // Do not render result messages (only end markers / usage stats and similar state updates)
    if (raw.type === 'result') {
      return null;
    }

    // stream_event and similar do not create messages
    return null;
  }
}

/**
 * User-role messages the CLI adds itself and does not show: the summary that
 * replaces the conversation after a compaction (`isSynthetic` live,
 * `isCompactSummary` in history). One carrying tool results still goes
 * through, so nothing that renders a tool call is lost.
 */
function isHiddenUserMessage(raw: any): boolean {
  if (raw.isCompactSummary === true) return true;
  if (raw.isSynthetic !== true) return false;
  const content = raw.message?.content;
  return !Array.isArray(content) || !content.some((b: any) => b?.type === 'tool_result');
}

function usageReportOf(raw: any) {
  if (raw.message?.model !== '<synthetic>') return undefined;
  const content = raw.message?.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content) && content.length === 1 && content[0]?.type === 'text'
      ? content[0].text
      : undefined;
  return typeof text === 'string' ? parseUsageReport(text) : undefined;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

/** "15.9K → 6.6K tokens", or undefined when the CLI gave no counts */
/**
 * What the CLI prints for a hook run: exit code 2 blocks, any other failure
 * is a non-blocking error, a JSON answer may stop the turn (`continue: false`)
 * or carry a `systemMessage`. A plain success, a cancelled run (the turn was
 * stopped) and injected context print nothing. History entries arrive with
 * `hook_kind` already set by the host.
 */
function hookBlock(raw: any): HookBlock | null {
  const hookName = String(raw.hook_name || raw.hook_event || 'hook');
  const base = {
    type: 'hook' as const,
    hookName,
    exitCode: typeof raw.exit_code === 'number' ? raw.exit_code : undefined,
    command: typeof raw.command === 'string' ? raw.command : undefined,
  };
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (typeof raw.hook_kind === 'string') {
    return { ...base, kind: raw.hook_kind, output: text(raw.output) };
  }
  if (raw.outcome === 'cancelled') return null;
  const errText = text(raw.stderr) || text(raw.output) || text(raw.stdout);
  if (raw.exit_code === 2) return { ...base, kind: 'blocked', output: errText };
  if (raw.outcome === 'error' || (typeof raw.exit_code === 'number' && raw.exit_code !== 0)) {
    return { ...base, kind: 'error', output: errText };
  }
  let json: any;
  try {
    json = JSON.parse(text(raw.stdout));
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object') return null;
  if (json.continue === false) {
    return { ...base, kind: 'stopped', output: text(json.stopReason) };
  }
  if (json.decision === 'block') {
    return { ...base, kind: 'blocked', output: text(json.reason) };
  }
  if (text(json.systemMessage)) {
    return { ...base, kind: 'message', output: text(json.systemMessage) };
  }
  return null;
}

function formatCompactTokens(meta: any): string | undefined {
  const pre = meta?.pre_tokens;
  const post = meta?.post_tokens;
  if (typeof pre !== 'number' || pre <= 0) return undefined;
  return typeof post === 'number'
    ? `${formatTokens(pre)} → ${formatTokens(post)} tokens`
    : `${formatTokens(pre)} tokens before`;
}

/**
 * Epoch ms from a raw timestamp: a number, an ISO string (the CLI/SDK sends
 * these), or nothing. Anything unparsable falls back to now, so turn
 * durations and "ago" labels never become NaN.
 */
function toEpochMs(ts: unknown): number {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

/**
 * Type guard
 */
export function isUserMessage(msg: Message): boolean {
  return msg.type === 'user';
}

export function isAssistantMessage(msg: Message): boolean {
  return msg.type === 'assistant';
}

export function isSystemMessage(msg: Message): boolean {
  return msg.type === 'system';
}

/**
 * Get the special message type
 *
 * Determined from the contentParsers.ts result
 * Returns a specific message type used to pick the renderer
 */
function getSpecialMessageType(contentBlocks: ContentBlockType[]): MessageRole | null {
  if (contentBlocks.length > 0 && contentBlocks.every((block) => block.type === 'bash')) {
    return 'bash';
  }

  if (contentBlocks.length === 1) {
    const blockType = contentBlocks[0].type;

    if (blockType === 'interrupt' || blockType === 'llm_error') {
      return 'tip';
    }

    if (blockType === 'slash_command_result') {
      return 'slash_command_result';
    }
  }

  return null;
}
