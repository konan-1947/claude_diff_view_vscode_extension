import type { PermissionUpdate, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from '../utils/events';
import type { ToolPermissionContext } from '@shared/messages';

export class PermissionRequest {
  readonly channelId: string;
  readonly toolName: string;
  readonly inputs: Record<string, unknown>;
  readonly suggestions: PermissionUpdate[];
  /** What the CLI says about the ask (title, reason, defaultToNo…) */
  readonly context: ToolPermissionContext;

  private readonly resolved: EventEmitter<PermissionResult> = new EventEmitter();

  constructor(
    channelId: string,
    toolName: string,
    inputs: Record<string, unknown>,
    suggestions: PermissionUpdate[] = [],
    context: ToolPermissionContext = {}
  ) {
    this.channelId = channelId;
    this.toolName = toolName;
    this.inputs = inputs;
    this.suggestions = suggestions;
    this.context = context;
  }

  /** Allow this call; `updatedPermissions` only for "don't ask again" (the suggestions) */
  accept(
    updatedInput: Record<string, unknown> = this.inputs,
    updatedPermissions: PermissionUpdate[] = []
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

