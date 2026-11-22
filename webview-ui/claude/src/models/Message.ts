/**
 * Message - message class
 *
 * Core features:
 * 1. Wrap message data
 * 2. Provide an isEmpty getter (computed dynamically)
 * 3. Support reactive tool_result linking via ContentBlockWrapper
 */

import type { ContentBlockType } from '../models/ContentBlock';
import { parseMessageContent } from '../models/contentParsers';
import { ContentBlockWrapper } from '../models/ContentBlockWrapper';

/**
 * Message type
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'result' | 'tip' | 'slash_command_result';

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

      return new Message(
        messageType,
        {
          role: raw.message?.role ?? raw.type,
          content: wrappedContent,
        },
        toEpochMs(raw.timestamp)
      );
    }

    // Do not render system messages (state updates only)
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
