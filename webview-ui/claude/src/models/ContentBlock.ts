/**
 * ContentBlock type definitions
 *
 * Defines every possible content block type in a message
 */

export interface TextBlock {
  type: 'text';
  text: string;
  isSlashCommand?: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ImageBlock {
  type: 'image';
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface DocumentBlock {
  type: 'document';
  title?: string;
  source?: {
    type: 'base64' | 'text';
    media_type: string;
    data: string;
  };
}

export interface InterruptBlock {
  type: 'interrupt';
  message: string;
  friendlyMessage: string;
}

/** One-line marker between messages (e.g. "Conversation compacted") */
export interface NoticeBlock {
  type: 'notice';
  message: string;
  /** Secondary text after the message, e.g. token counts */
  detail?: string;
  /** codicon name without the `codicon-` prefix */
  icon?: string;
}

export interface SelectionBlock {
  type: 'selection';
  filePath: string;
  label: string;
  startLine?: number;
  endLine?: number;
}

export interface OpenedFileBlock {
  type: 'opened_file';
  filePath: string;
  label: string;
}

export interface DiagnosticsEntry {
  filePath: string;
  line: number;
  column: number;
  message: string;
  code?: string;
  severity?: string;
}

export interface DiagnosticsBlock {
  type: 'diagnostics';
  diagnostics: DiagnosticsEntry[];
}

export interface LLMErrorBlock {
  type: 'llm_error';
  message: string;
}

export interface SlashCommandResultBlock {
  type: 'slash_command_result';
  result: string;
  isError: boolean;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: any;
  is_error?: boolean;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

export type ToolUseContentBlock = ToolUseBlock & {
  toolResult?: ToolResultBlock;
};

export type ContentBlockType =
  | TextBlock
  | ThinkingBlock
  | ImageBlock
  | DocumentBlock
  | InterruptBlock
  | NoticeBlock
  | LLMErrorBlock
  | SelectionBlock
  | OpenedFileBlock
  | DiagnosticsBlock
  | SlashCommandResultBlock
  | ToolUseContentBlock
  | ToolResultBlock;
