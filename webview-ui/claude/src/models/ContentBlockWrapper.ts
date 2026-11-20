/**
 * ContentBlockWrapper - Content Block wrapper
 *
 * Uses alien-signals to manage the reactive tool_result link
 *
 * Core features:
 * 1. Wrap each content block
 * 2. Manage toolResult with a Signal (reactive)
 * 3. Provide setToolResult for async linking
 *
 * Why is this wrapper needed?
 * - tool_use and tool_result are not in the same message
 * - They must be linked asynchronously (when a tool_result arrives, look up its tool_use)
 * - A signal lets the UI update reactively
 */

import { signal } from 'alien-signals';
import type { ContentBlockType, ToolResultBlock } from './ContentBlock';

export class ContentBlockWrapper {
  /**
   * Raw content block
   */
  public readonly content: ContentBlockType;

  /**
   * Signal of the Tool Result (reactive)
   * Used for tool_result in live conversations
   */
  private readonly toolResultSignal = signal<ToolResultBlock | undefined>(undefined);

  /**
   * Tool Use Result (plain property)
   * Used for toolUseResult on session load (no reactivity needed)
   */
  public toolUseResult?: any;

  constructor(content: ContentBlockType) {
    this.content = content;
  }

  /**
   * Get the toolResult signal
   *
   * @returns Alien signal function
   */
  get toolResult() {
    return this.toolResultSignal;
  }

  /**
   * Set the tool result
   *
   * 🔥 Uses the alien-signals function-call API
   *
   * @param result tool execution result
   */
  setToolResult(result: ToolResultBlock): void {
    this.toolResultSignal(result);
  }

  /**
   * Check whether there is a tool_result
   */
  hasToolResult(): boolean {
    return this.toolResultSignal() !== undefined;
  }

  /**
   * Get the tool_result value (non-reactive)
   */
  getToolResultValue(): ToolResultBlock | undefined {
    return this.toolResultSignal();
  }
}
