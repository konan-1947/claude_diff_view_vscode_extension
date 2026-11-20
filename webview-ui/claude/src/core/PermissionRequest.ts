import type { PermissionUpdate, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from '../utils/events';

export class PermissionRequest {
  readonly channelId: string;
  readonly toolName: string;
  readonly inputs: Record<string, unknown>;
  readonly suggestions: PermissionUpdate[];

  private readonly resolved: EventEmitter<PermissionResult> = new EventEmitter();

  constructor(
    channelId: string,
    toolName: string,
    inputs: Record<string, unknown>,
    suggestions: PermissionUpdate[] = []
  ) {
    this.channelId = channelId;
    this.toolName = toolName;
    this.inputs = inputs;
    this.suggestions = suggestions;
  }

  accept(
    updatedInput: Record<string, unknown> = this.inputs,
    updatedPermissions: PermissionUpdate[] = this.suggestions
  ): void {
    this.resolved.emit({ behavior: 'allow', updatedInput, updatedPermissions });
  }

  reject(message: string = 'Denied by user', interrupt: boolean = true): void {
    this.resolved.emit({ behavior: 'deny', message, interrupt });
  }

  onResolved(callback: (resolution: PermissionResult) => void): () => void {
    return this.resolved.add(callback);
  }
}

