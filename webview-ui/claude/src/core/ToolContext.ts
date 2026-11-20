/**
 * ToolContext - tool execution context
 *
 * Manages a tool's execution state and result
 */

import { signal } from 'alien-signals';

type Signal<T> = ReturnType<typeof signal<T>>;

/**
 * Tool result type
 */
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  is_error?: boolean;
  [key: string]: any;
}

export class ToolContext {
  public readonly channelId: string;
  public readonly toolName: string;
  public readonly inputs: any;

  private toolResultSignal: Signal<ToolResult | undefined>;

  constructor(channelId: string, toolName: string, inputs: any) {
    this.channelId = channelId;
    this.toolName = toolName;
    this.inputs = inputs;
    this.toolResultSignal = signal<ToolResult | undefined>(undefined);
  }

  /**
   * Get the Signal of the tool result
   */
  get toolResult(): Signal<ToolResult | undefined> {
    return this.toolResultSignal;
  }

  /**
   * Set the tool result
   * @param result tool execution result
   */
  setToolResult(result: ToolResult): void {
    this.toolResultSignal(result);
  }

  /**
   * Check whether the tool succeeded
   */
  isSuccess(): boolean {
    const result = this.toolResultSignal();
    return result ? result.success && !result.is_error : false;
  }

  /**
   * Check whether the tool failed
   */
  isError(): boolean {
    const result = this.toolResultSignal();
    return result ? !result.success || result.is_error === true : false;
  }

  /**
   * Get the error message
   */
  getErrorMessage(): string | undefined {
    const result = this.toolResultSignal();
    return result?.error;
  }

  /**
   * Get the output content
   */
  getOutput(): string | undefined {
    const result = this.toolResultSignal();
    return result?.output;
  }
}
