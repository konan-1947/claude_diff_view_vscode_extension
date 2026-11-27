import type {
  ContentBlockType,
  TextBlock,
  ThinkingBlock,
  ImageBlock,
  DocumentBlock,
  InterruptBlock,
  LLMErrorBlock,
  SelectionBlock,
  OpenedFileBlock,
  DiagnosticsBlock,
  DiagnosticsEntry,
  SlashCommandResultBlock,
  BashBlock,
  ToolResultBlock,
  ToolUseContentBlock,
  ToolUseBlock,
} from './ContentBlock';
import { isNarrationBlock } from '../utils/narration';

const INTERRUPT_MESSAGES: Record<string, string> = {
  '[Request interrupted by user]': 'Interrupted',
  '[Request interrupted by user for tool use]': 'Tool interrupted',
};

const TOOL_REJECTION_MARKER =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.";

const TOOL_REJECTION_PREFIX =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user provided the following reason for the rejection: ";

/**
 * @param narrationIndexes the frame's `narration_block_indexes` (indexes into
 *   `rawContent`): thinking blocks that are the server's summary of words to
 *   the user, shown as answer text (see utils/narration)
 */
export function parseMessageContent(rawContent: any[], narrationIndexes?: readonly number[]): ContentBlockType[] {
  const blocks: ContentBlockType[] = [];
  const listed = new Set(Array.isArray(narrationIndexes) ? narrationIndexes : []);

  (rawContent ?? []).forEach((raw, i) => {
    if (isNarrationBlock(raw, listed.has(i))) {
      blocks.push({ type: 'text', text: String(raw.thinking), narration: true } satisfies TextBlock);
      return;
    }
    blocks.push(...parseBlock(raw));
  });

  return blocks;
}

function parseBlock(raw: any): ContentBlockType[] {
  if (!raw || typeof raw !== 'object') {
    return [createTextBlock(String(raw ?? ''))];
  }

  switch (raw.type) {
    case 'text':
      return parseTextBlock(String(raw.text ?? raw.value ?? ''));
    case 'thinking':
      return [createThinkingBlock(String(raw.thinking ?? ''))];
    case 'redacted_thinking':
      // Official approach: with thinking on, history assistant messages may contain redacted_thinking to pass validation;
      // the frontend does not show that block and simply ignores it
      return [];
    case 'image':
      return [createImageBlock(raw)];
    case 'document':
      return [createDocumentBlock(raw)];
    case 'llm_error':
      return [{ type: 'llm_error', message: String(raw.message ?? '') } satisfies LLMErrorBlock];
    case 'tool_use':
      return [createToolUseBlock(raw)];
    case 'tool_result':
      return [createToolResultBlock(raw)];
    default:
      return [createTextBlock(JSON.stringify(raw))];
  }
}

function parseTextBlock(text: string): ContentBlockType[] {
  if (INTERRUPT_MESSAGES[text]) {
    return [
      {
        type: 'interrupt',
        message: text,
        friendlyMessage: INTERRUPT_MESSAGES[text],
      } satisfies InterruptBlock,
    ];
  }

  if (text.includes('<ide_selection>')) {
    const selection = parseSelection(text);
    if (selection) {
      return [selection];
    }
  }

  if (text.includes('<ide_opened_file>')) {
    const opened = parseOpenedFile(text);
    if (opened) {
      return [opened];
    }
  }

  if (text.includes('<local-command-stderr>') || text.includes('<local-command-stdout>')) {
    const result = parseSlashCommandResult(text);
    if (result) {
      return [result];
    }
  }

  const bash = parseBash(text);
  if (bash) {
    return [bash];
  }

  if (text.includes('<post-tool-use-hook>')) {
    const diagnostics = parseDiagnostics(text);
    if (diagnostics) {
      return [diagnostics];
    }
  }

  const slashCommandText = parseSlashCommandText(text);
  if (slashCommandText) {
    return [
      {
        type: 'text',
        text: slashCommandText,
        isSlashCommand: true,
      } satisfies TextBlock,
    ];
  }

  if (text === TOOL_REJECTION_MARKER || text.startsWith(TOOL_REJECTION_PREFIX)) {
    return [];
  }

  return [createTextBlock(text)];
}

function createTextBlock(text: string): TextBlock {
  return {
    type: 'text',
    text,
  };
}

function createThinkingBlock(thinking: string): ThinkingBlock {
  return {
    type: 'thinking',
    thinking,
  };
}

function createImageBlock(raw: any): ImageBlock {
  return {
    type: 'image',
    source: raw.source,
  };
}

function createDocumentBlock(raw: any): DocumentBlock {
  return {
    type: 'document',
    title: raw.title,
    source: raw.source,
  };
}

function createToolUseBlock(raw: ToolUseBlock): ToolUseContentBlock {
  return {
    ...raw,
    toolResult: undefined,
  };
}

function createToolResultBlock(raw: any): ToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: raw.tool_use_id,
    content: raw.content,
    is_error: raw.is_error,
  };
}

function parseSelection(text: string): SelectionBlock | undefined {
  const fileMatch = text.match(/from ([^:]+):/);
  if (!fileMatch) {
    return undefined;
  }

  const filePath = fileMatch[1];
  const fileName = filePath.split('/').pop() || filePath;

  let startLine: number | undefined;
  let endLine: number | undefined;
  const linesMatch = text.match(/lines (\d+) to (\d+)/);
  if (linesMatch) {
    startLine = parseInt(linesMatch[1], 10);
    endLine = parseInt(linesMatch[2], 10);
  } else {
    const singleLineMatch = text.match(/line (\d+)/);
    if (singleLineMatch) {
      startLine = parseInt(singleLineMatch[1], 10);
    }
  }

  const label =
    startLine && endLine
      ? `${fileName}#${startLine}-${endLine}`
      : startLine
        ? `${fileName}#${startLine}`
        : fileName;

  return {
    type: 'selection',
    filePath,
    label,
    startLine,
    endLine,
  };
}

function parseOpenedFile(text: string): OpenedFileBlock | undefined {
  const match = text.match(/(?:opened the file|opened file) (.+?) in (?:the )?(?:IDE|editor)/);
  if (!match) {
    return undefined;
  }

  const filePath = match[1];
  const label = filePath.split('/').pop() || filePath;

  return {
    type: 'opened_file',
    filePath,
    label,
  };
}

function parseSlashCommandResult(text: string): SlashCommandResultBlock | undefined {
  const stderrMatch = text.match(/<local-command-stderr>([\s\S]*?)<\/local-command-stderr>/);
  if (stderrMatch) {
    return {
      type: 'slash_command_result',
      result: stderrMatch[1].trim(),
      isError: true,
    };
  }

  const stdoutMatch = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
  if (stdoutMatch) {
    return {
      type: 'slash_command_result',
      result: stdoutMatch[1].trim(),
      isError: false,
    };
  }

  return undefined;
}

function tagContent(text: string, tag: string): string | undefined {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1] : undefined;
}

/** `<bash-input>` (the command) or `<bash-stdout>`/`<bash-stderr>` (its output) */
function parseBash(text: string): BashBlock | undefined {
  if (!text.includes('<bash-')) return undefined;
  const command = tagContent(text, 'bash-input');
  const stdout = tagContent(text, 'bash-stdout');
  const stderr = tagContent(text, 'bash-stderr');
  if (command === undefined && stdout === undefined && stderr === undefined) return undefined;
  return {
    type: 'bash',
    command: command?.trim(),
    stdout: stdout?.replace(/\s+$/, ''),
    stderr: stderr?.replace(/\s+$/, ''),
  };
}

function parseDiagnostics(text: string): DiagnosticsBlock | undefined {
  const hookMatch = text.match(/<post-tool-use-hook>([\s\S]*?)<\/post-tool-use-hook>/);
  if (!hookMatch) {
    return undefined;
  }

  const diagnosticsMatch = hookMatch[1].match(/<ide_diagnostics>([\s\S]*?)<\/ide_diagnostics>/);
  if (!diagnosticsMatch) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(diagnosticsMatch[1]);
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    const diagnostics: DiagnosticsEntry[] = parsed.map((entry: any) => ({
      filePath: entry.filePath || '',
      line: entry.line || 0,
      column: entry.column || 0,
      message: entry.message || '',
      code: entry.code || '',
      severity: entry.severity || '',
    }));

    return {
      type: 'diagnostics',
      diagnostics,
    };
  } catch {
    return undefined;
  }
}

function parseSlashCommandText(text: string): string | undefined {
  const commandNameMatch = text.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (!commandNameMatch) {
    return undefined;
  }

  const commandArgsMatch = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
  const command = commandNameMatch[1].trim();
  const args = commandArgsMatch ? commandArgsMatch[1].trim() : '';

  return `${command} ${args}`.trim();
}
