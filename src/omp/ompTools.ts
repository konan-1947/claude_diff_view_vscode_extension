import * as path from 'path';

/**
 * omp tool calls → the tool_use blocks the chat UI (uic) draws.
 *
 * uic's tool cards are keyed by Claude Code tool names and input shapes
 * (`Read {file_path, offset, limit}`, `Bash {command, description}`...). A tool
 * whose input maps cleanly is renamed so it gets that card (and Read/Glob/Grep
 * fold into the "Explored" row); anything else keeps its omp name and is drawn
 * by the generic card until it gets one of its own.
 *
 * omp tool parameters (`get_state` → `dumpTools`, omp 18.16):
 *   read {path}            path may end in `:A-B` / `:A` (line range)
 *   bash {command, timeout, cwd, pty, async, name, ready}
 *   edit {input}           hashline patch; one `[PATH#TAG]` header per file
 *                          | {path, old_string, new_string} (replace mode,
 *                            model-dependent)
 *   write {path, content}
 *   glob {path, hidden, gitignore, limit}
 *   grep {pattern, path, case, gitignore, skip}
 *   eval {language, code, title, timeout, reset}
 *   task {context, tasks}
 *   todo {op, list, task, phase, items, reason}
 *   wait {}
 *
 * edit/todo/eval keep their omp name and have dedicated cards under
 * webview-ui/claude/src/components/Messages/blocks/tools/omp/.
 *
 * `task` is not mapped here: each task item is drawn by the Claude 'Task' card,
 * with one tool_use per item (see ompTasks.ts).
 */
export interface SdkToolUse {
  name: string;
  input: Record<string, unknown>;
}

export function toSdkToolUse(name: string, args: Record<string, unknown> | undefined, intent?: string): SdkToolUse {
  const a = args ?? {};
  switch (name) {
    case 'read': {
      const { file, start, end } = splitRange(str(a.path));
      const input: Record<string, unknown> = { file_path: file };
      if (start !== undefined) {
        input.offset = start - 1;
        if (end !== undefined) input.limit = end - start + 1;
      }
      return { name: 'Read', input };
    }
    case 'bash':
      return {
        name: 'Bash',
        input: {
          command: str(a.command),
          ...(intent ? { description: intent } : {}),
          ...(a.async === true ? { run_in_background: true } : {}),
        },
      };
    case 'write':
      return { name: 'Write', input: { file_path: str(a.path), content: str(a.content) } };
    case 'glob':
      return { name: 'Glob', input: { pattern: str(a.path) } };
    case 'grep':
      return {
        name: 'Grep',
        input: {
          pattern: str(a.pattern),
          ...(a.path ? { path: str(a.path) } : {}),
          ...(a.case === false ? { '-i': true } : {}),
        },
      };
    case 'web_search':
      return { name: 'WebSearch', input: { query: str(a.query) } };
    default:
      return { name, input: a };
  }
}

/** Absolute paths a tool call is about to write, for the diff's before-image. */
export function writtenPaths(name: string, args: Record<string, unknown> | undefined, cwd: string): string[] {
  const a = args ?? {};
  let paths: string[] = [];
  if (name === 'write' && typeof a.path === 'string') {
    paths = [a.path];
  } else if (name === 'edit') {
    if (typeof a.input === 'string') {
      // Tag format is not documented: any short word (same pattern as ompDiff.ts)
      for (const line of a.input.split(/\r?\n/)) {
        const match = /^\[(.+)#[0-9A-Za-z_-]{1,32}\]\s*$/.exec(line.trim());
        if (match) paths.push(match[1]);
      }
    } else if (typeof a.path === 'string') {
      paths = [a.path];
    }
  }
  return [...new Set(paths.filter(Boolean).map((p) => path.resolve(cwd, p)))];
}

function splitRange(value: string): { file: string; start?: number; end?: number } {
  const match = /^(.*?):(\d+)(?:-(\d+))?$/.exec(value);
  if (!match) return { file: value };
  return {
    file: match[1],
    start: Number(match[2]),
    end: match[3] !== undefined ? Number(match[3]) : undefined,
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}
