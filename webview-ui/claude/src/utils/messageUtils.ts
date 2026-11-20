/**
 * MessageUtils - message processing helpers
 *
 * Correspond to the rZe and LSe functions of the original code
 */

import { Message } from '../models/Message';
import { ContentBlockWrapper } from '../models/ContentBlockWrapper';
import type { ToolResultBlock, ToolUseContentBlock, ContentBlockType } from '../models/ContentBlock';

/**
 * Search backwards for a tool_use block
 *
 * Original code:
 * function rZe(n, e) {
 *   for (let t = n.length - 1; t >= 0; t--) {
 *     let i = n[t];
 *     if (i.type === "assistant") {
 *       for (let o of i.content) {
 *         if (o.content.type === "tool_use" && o.content.id === e) {
 *           return o;
 *         }
 *       }
 *     }
 *   }
 * }
 *
 * @param messages message array
 * @param toolUseId id of the tool_use
 * @returns the ContentBlockWrapper found (containing the tool_use)
 */
export function findToolUseBlock(
    messages: Message[],
    toolUseId: string
): ContentBlockWrapper | undefined {
    // Walk the message array from the end
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];

        // Only search assistant messages
        if (message.type === 'assistant') {
            const content = message.message.content;

            // content should be ContentBlockWrapper[]
            if (Array.isArray(content)) {
                for (const wrapper of content) {
                    // Check for a tool_use with a matching id
                    if (
                        wrapper.content.type === 'tool_use' &&
                        (wrapper.content as ToolUseContentBlock).id === toolUseId
                    ) {
                        return wrapper;
                    }
                }
            }
        }
    }

    return undefined;
}

/**
 * Attach a tool_result to its tool_use
 *
 * Original code:
 * function LSe(n, e) {
 *   if (e.type === "user" && Array.isArray(e.message.content)) {
 *     for (let i of e.message.content) {
 *       if (i.type === "tool_result") {
 *         let o = rZe(n, i.tool_use_id);
 *         if (o) {
 *           o.setToolResult(i);
 *         }
 *       }
 *     }
 *   }
 *   let t = LJ(e);
 *   if (t) {
 *     n.push(t);
 *   }
 * }
 *
 * Notes:
 * - Called every time a new message arrives
 * - Checks the tool_result blocks in the new message
 * - Finds the matching tool_use in history and links it through a Signal
 *
 * @param messages current message array (mutated)
 * @param newMessage newly received message
 */
export function attachToolResults(messages: Message[], newMessage: Message): void {
    // Only handle tool_result in user messages
    if (newMessage.type === 'user') {
        const content = newMessage.message.content;

        if (Array.isArray(content)) {
            for (const wrapper of content) {
                // Check for tool_result
                if (wrapper.content.type === 'tool_result') {
                    const toolResult = wrapper.content as ToolResultBlock;
                    const toolUseId = toolResult.tool_use_id;

                    // Search the history backwards for the matching tool_use
                    const toolUseWrapper = findToolUseBlock(messages, toolUseId);

                    if (toolUseWrapper) {
                        // Link the tool_result through a Signal (triggers a reactive update!)
                        toolUseWrapper.setToolResult(toolResult);
                    }
                }
            }
        }
    }
}

/**
 * Process an incoming message and add it to the message array
 *
 * The full LSe logic of the original code
 *
 * @param messages current message array
 * @param rawEvent raw message event
 */
export function processAndAttachMessage(messages: Message[], rawEvent: any): void {
    // 1. First link tool_result and toolUseResult (if any)
    // Note: this must happen before adding the new message, since the tool_use should already be in the array
    if (rawEvent.type === 'user' && Array.isArray(rawEvent.message?.content)) {
        for (const block of rawEvent.message.content) {
            if (block.type === 'tool_result') {
                const toolUseWrapper = findToolUseBlock(messages, block.tool_use_id);
                if (toolUseWrapper) {
                    // Link tool_result (live conversation)
                    toolUseWrapper.setToolResult(block);

                    // Link toolUseResult (extra data on session load)
                    if (rawEvent.toolUseResult) {
                        toolUseWrapper.toolUseResult = rawEvent.toolUseResult;
                    }
                }
            }
        }
    }

    // 2. Convert the raw event to a Message and add it to the array
    const message = Message.fromRaw(rawEvent);
    if (message) {
        messages.push(message);
    }
}

/**
 * Merge consecutive Read tool messages into ReadCoalesced (matches the original IJ/ySe/CSe/iZe behavior)
 *
 * Rules:
 * - consecutive assistant messages, each containing a tool_use with name === 'Read'
 * - and the first tool_use of each already has a non-error tool_result (success)
 * - are merged into one new assistant message:
 *   - whose content is a single tool_use (name: 'ReadCoalesced', input: { fileReads: [...] })
 *   - with a successful tool_result injected for it ("Successfully read N files")
 */
export function mergeConsecutiveReadMessages(messages: Message[]): Message[] {
    const result: Message[] = [];
    let i = 0;

    while (i < messages.length) {
        const current = messages[i];
        if (isAssistantRead(current) && hasNonErrorToolResult(current)) {
            const group: Message[] = [current];
            let j = i + 1;
            while (j < messages.length) {
                const next = messages[j];
                if (isAssistantRead(next) && hasNonErrorToolResult(next)) {
                    group.push(next);
                    j++;
                } else {
                    break;
                }
            }

            if (group.length > 1) {
                result.push(buildReadCoalescedMessage(group));
                i = j;
                continue;
            }
        }

        result.push(current);
        i++;
    }

    return result;
}

function isAssistantRead(msg: Message): boolean {
    if (msg.type !== 'assistant') return false;
    const content = msg.message.content;
    if (typeof content === 'string' || !Array.isArray(content)) return false;
    return content.some(w => w.content.type === 'tool_use' && (w.content as ToolUseContentBlock).name === 'Read');
}

function firstReadToolUseWrapper(msg: Message): ContentBlockWrapper | undefined {
    const content = msg.message.content;
    if (typeof content === 'string' || !Array.isArray(content)) return undefined;
    return content.find(w => w.content.type === 'tool_use' && (w.content as ToolUseContentBlock).name === 'Read');
}

function hasNonErrorToolResult(msg: Message): boolean {
    const wrapper = firstReadToolUseWrapper(msg);
    if (!wrapper) return false;

    // 🔥 alien-signals API: toolResult is a signal and must be called
    const tr = wrapper.getToolResultValue();
    if (!tr) return false;
    return !tr.is_error;
}

function buildReadCoalescedMessage(group: Message[]): Message {
    // Collect each message's Read input
    const fileReads = group.map(g => {
        const w = firstReadToolUseWrapper(g);
        const block = w?.content as ToolUseContentBlock | undefined;
        // Same as the original, tolerant: use an empty object if unavailable
        return block?.input ?? {};
    });

    const id = 'coalesced_' + Math.random().toString(36).slice(2);
    const toolUse: ToolUseContentBlock = {
        type: 'tool_use',
        id,
        name: 'ReadCoalesced',
        input: { fileReads }
    } as any; // keeps the change minimally invasive

    const wrapper = new ContentBlockWrapper(toolUse as unknown as ContentBlockType);
    const toolResult: ToolResultBlock = {
        type: 'tool_result',
        tool_use_id: id,
        content: `Successfully read ${group.length} files`,
        is_error: false
    } as any;
    wrapper.setToolResult(toolResult);

    return new Message(
        'assistant',
        {
            role: 'assistant',
            content: [wrapper]
        }
    );
}

/**
 * Detect whether a message is a Read tool call
 * @param message SDK message
 * @returns boolean
 */
export function isReadToolMessage(message: any): boolean {
    if (message.type !== 'assistant') {
        return false;
    }

    return message.message.content.some(
        (block: any) =>
            block.type === 'tool_use' &&
            block.name === 'Read'
    );
}

/**
 * Detect whether a message is visible (not blank)
 * @param message SDK message
 * @returns boolean
 */
export function isVisibleMessage(message: any): boolean {
    if (message.type !== 'assistant') {
        return true; // non-assistant messages are visible by default
    }

    return message.message.content.some((block: any) => {
        if (block.type === 'text') {
            return block.text.trim() !== '';
        }
        return true; // tool_use is visible by default
    });
}

/**
 * Merge consecutive Read tool calls
 * Optimizes the UI by reducing redundant Read tool messages
 *
 * @param messages SDK message array
 * @returns optimized message array
 */
export function mergeConsecutiveReads(messages: any[]): any[] {
    const result: any[] = [];
    let i = 0;

    while (i < messages.length) {
        const current = messages[i];

        // Detect consecutive Read tool calls
        if (isReadToolMessage(current) && isVisibleMessage(current)) {
            const readMessages: any[] = [current];

            // Collect consecutive Read messages
            let j = i + 1;
            while (j < messages.length) {
                const next = messages[j];
                if (isReadToolMessage(next) && isVisibleMessage(next)) {
                    readMessages.push(next);
                    j++;
                } else {
                    break;
                }
            }

            // Merge when there are several consecutive Reads
            if (readMessages.length > 1) {
                const merged = mergeReadToolMessages(readMessages);
                result.push(merged);
                i = j;
            } else {
                result.push(current);
                i++;
            }
        } else {
            result.push(current);
            i++;
        }
    }

    return result;
}

/**
 * Merge several Read tool messages
 * @param messages Read tool message array
 * @returns the merged single message
 */
function mergeReadToolMessages(messages: any[]): any {
    if (messages.length === 0) {
        throw new Error('Cannot merge empty messages array');
    }

    if (messages.length === 1) {
        return messages[0];
    }

    // Collect all tool_use blocks
    const toolUseBlocks = messages.flatMap((msg) =>
        msg.message.content.filter((block: any) => block.type === 'tool_use')
    );

    // Use the first message as the base
    const base = messages[0];

    return {
        ...base,
        message: {
            ...base.message,
            content: [
                {
                    type: 'text',
                    text: `[Merged ${toolUseBlocks.length} Read operations]`,
                    citations: null
                },
                ...toolUseBlocks
            ]
        }
    };
}

/**
 * Extract the text content of a message
 * @param message SDK message
 * @returns text content
 */
export function extractMessageText(message: any): string {
    if (message.type === 'user') {
        const content = message.message.content;
        if (Array.isArray(content)) {
            return content
                .map((block: any) => {
                    if (typeof block === 'string') {
                        return block;
                    } else if (block.type === 'text') {
                        return block.text;
                    }
                    return '';
                })
                .join('\n');
        }
        return '';
    }

    if (message.type === 'assistant') {
        return message.message.content
            .map((block: any) => {
                if (block.type === 'text') {
                    return block.text;
                }
                return '';
            })
            .filter((text: string) => text.trim() !== '')
            .join('\n');
    }

    return '';
}

/**
 * Detect whether a message contains an error
 * @param message SDK message
 * @returns boolean
 */
export function hasError(message: any): boolean {
    if (message.type === 'result') {
        return message.is_error === true;
    }
    return false;
}

/**
 * Estimate the token count of a message
 * @param message SDK message
 * @returns token count
 */
export function estimateTokenCount(message: any): number {
    const text = extractMessageText(message);
    // Simple estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
}
