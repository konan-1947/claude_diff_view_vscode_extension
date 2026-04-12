# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Extension Does

AI CLI diff view is a VS Code extension for reviewing AI CLI file edits inside VS Code.
Best supported workflows: Claude, Codex, and Qwen.
Built-in session launch and hook installation currently target Claude Code.

## Build And Development Commands

```bash
npm install
npm run compile
npm run watch
```

Package for distribution:
```bash
npx vsce package
```

Development workflow:
- Run `npm run watch`
- Press `F5` in VS Code to launch an Extension Development Host
- Reload the extension host after changes are compiled

There is no test suite.

## Two Integration Modes

### Mode 1: Hook-based (preferred, works with any AI CLI)

Claude Code hooks (`hooks/pre-tool-hook.js` and `hooks/post-tool-hook.js`) run as Claude CLI pre/post tool-use hooks. They write snapshot and signal files to `os.tmpdir()/ai-cli-diff-snapshots/` and `os.tmpdir()/ai-cli-diff-signals/`. `HookWatcher` picks these up via `fs.watch`. This mode requires `installHooks` to register the hooks in `~/.claude/settings.json`.

### Mode 2: Built-in runner (Claude Code only)

`Start Session` spawns the `claude` CLI with `--output-format stream-json`. `ClaudeRunner` parses the NDJSON stream: on `assistant` events with `Write`/`Edit`/`MultiEdit` tool calls it calls `snapshotBefore`; on the corresponding `tool` result events it calls `openDiff`. `runnerFactory.ts` detects available CLIs on PATH and instantiates the right runner.

## Architecture

### Entry Point

`src/extension.ts` activates on `onStartupFinished` and wires together all core components. The AI runner is initialized lazily on first `Start Session`.

### Diff Flow

1. Runner or hook detects a file edit and calls `diffManager.snapshotBefore(filePath)`.
2. The CLI modifies the file on disk.
3. `diffManager.openDiff(filePath)` is called.
4. `openDiff()` computes hunks via `calculateHunks`; if hunks exist, opens a VS Code diff editor (`ai-cli-diff` scheme on the left, real `file` scheme on the right).
5. `renderer.show()` stores per-file hunk state.
6. `HunkCodeLensProvider` renders Accept/Revert actions above each hunk.
7. When all hunks are resolved, cleanup closes the diff tab and restores a normal editor with cursor position preserved.

### Diff Editor Detail

`DiffManager` owns the `TextDocumentContentProvider` for the `ai-cli-diff` scheme (left pane = stored snapshot, right pane = real file on disk). A stable `queryId` per file prevents duplicate diff tabs.

`HunkCodeLensProvider` is registered for `{ scheme: 'file' }`. VS Code suppresses CodeLens in diff editors by default — the extension auto-enables `diffEditor.codeLens` globally on activation.

### AI Runner Pattern

`IAiRunner` (`src/claude/aiRunner.ts`) is the common interface. `ClaudeRunner` is the current built-in implementation. `runnerFactory.ts` detects available tools and returns the matching runner.

### File Monitoring

Primary: `HookWatcher` — watches `os.tmpdir()/ai-cli-diff-signals/` for JSON signal files from CLI hooks, calls `diffManager.loadSnapshot()` then `openDiff()`.

Fallback: `WorkspaceWatcher` — watches all workspace file writes; uses `FileSnapshotStore` as a baseline to detect external changes and re-apply diff state. Snaps all workspace text files at startup (depth ≤ 5).

## Key Modules

| Module | Role |
| --- | --- |
| `src/diff/diffManager.ts` | Central diff state, snapshots, accept/revert API, content provider |
| `src/diff/inlineDiffRenderer.ts` | Per-file hunk state, decorations, revert writes |
| `src/diff/hunkCalculator.ts` | LCS-based line diff → `Hunk[]` |
| `src/diff/hunkCodeLensProvider.ts` | CodeLens accept/revert actions per hunk |
| `src/diff/navigationManager.ts` | Prev/next pending file navigation |
| `src/diff/decorationManager.ts` | Gutter and highlight decorations |
| `src/commands/commandsRegistry.ts` | All command registrations |
| `src/views/sessionPanel.ts` | Sidebar session panel (webview) |
| `src/views/navBarPanel.ts` | Explorer sidebar nav panel (webview) |
| `src/views/diffActionPanel.ts` | Webview panel with Accept/Reject file buttons |
| `src/watcher/hookWatcher.ts` | Hook signal file watcher |
| `src/watcher/workspaceWatcher.ts` | Workspace file change watcher |
| `src/watcher/fileSnapshotStore.ts` | Baseline snapshot store for WorkspaceWatcher |
| `src/claude/claudeRunner.ts` | Claude CLI stream-json runner |
| `src/claude/runnerFactory.ts` | CLI detection and runner instantiation |
| `src/claude/hookInstallDetect.ts` | Checks if hooks are registered in `~/.claude/settings.json` |

## State Persistence

Snapshots are stored in:
1. Memory via `diffManager.snapshots` (Map)
2. Workspace state under key `ai-cli-diff.snapshots` (survives VS Code restarts)

## Registered Commands and Keybindings

| Command | Keybinding | Purpose |
| --- | --- | --- |
| `ai-cli-diff-view.startSession` | `Ctrl/Cmd+Shift+A` | Start a Claude session |
| `ai-cli-diff-view.acceptAllHunks` | `Ctrl/Cmd+Shift+Y` | Accept all changes in the active file |
| `ai-cli-diff-view.revertAllHunks` | `Ctrl/Cmd+Shift+Z` | Revert all changes in the active file |
| `ai-cli-diff-view.acceptAllChanges` | — | Accept all pending changes (all files) |
| `ai-cli-diff-view.acceptHunk` | — | Accept one hunk (CodeLens) |
| `ai-cli-diff-view.revertHunk` | — | Revert one hunk (CodeLens) |
| `ai-cli-diff-view.nextFile` | `Alt+L` (when pending) | Go to next pending file |
| `ai-cli-diff-view.prevFile` | `Alt+H` (when pending) | Go to previous pending file |
| `ai-cli-diff-view.installHooks` | — | Install Claude CLI hooks |

The context key `ai-cli-diff-view.hasPendingDiff` gates editor title buttons and `Alt+H`/`Alt+L` keybindings.
