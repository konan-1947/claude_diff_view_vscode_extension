# AI CLI diff view - Project Context

## Overview

AI CLI diff view is a VS Code extension for reviewing AI-generated file edits as diffs inside the editor.

Best supported workflows:
- Claude
- Codex
- Qwen

Current integration status:
- Built-in session launch targets Claude Code.
- Claude hook installation is built in.
- External file watching still makes Codex and Qwen workflows reviewable inside VS Code.

## Project Structure

```text
src/
  claude/      runner integration
  commands/    command registration
  diff/        diff state, hunks, navigation, rendering
  views/       sidebar and webview UI
  watcher/     hook and workspace file monitoring
hooks/         CLI hook scripts
media/         icons
code_to_test/  local smoke-test files
out/           compiled output
```

## Main Flow

1. Capture the original file contents before an AI edit.
2. Detect the resulting file change.
3. Open a diff editor with:
   - original snapshot via `ai-cli-diff`
   - modified file via `file`
4. Show hunk actions so the user can accept or revert changes.

## Important Paths And Keys

- Snapshot directory: `%TEMP%/ai-cli-diff-snapshots/`
- Signal directory: `%TEMP%/ai-cli-diff-signals/`
- Debug log: `%TEMP%/ai-cli-diff-hook-debug.log`
- Workspace state key: `ai-cli-diff.snapshots`

## Commands

| Command | Description |
| --- | --- |
| `ai-cli-diff-view.startSession` | Start a Claude session from VS Code |
| `ai-cli-diff-view.acceptAllHunks` | Accept all changes in the current file |
| `ai-cli-diff-view.acceptAllChanges` | Accept all pending file changes |
| `ai-cli-diff-view.revertAllHunks` | Revert all changes in the current file |
| `ai-cli-diff-view.acceptHunk` | Accept a single hunk |
| `ai-cli-diff-view.revertHunk` | Revert a single hunk |
| `ai-cli-diff-view.nextFile` | Open the next pending file |
| `ai-cli-diff-view.prevFile` | Open the previous pending file |
| `ai-cli-diff-view.installHooks` | Install Claude CLI hooks |

## Development Notes

- TypeScript strict mode is enabled.
- Use `npm run compile` as the minimum validation step.
- Use `F5` in VS Code for manual testing.
- Do not edit `out/` by hand.
