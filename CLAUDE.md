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

Development workflow:
- Run `npm run watch`
- Press `F5` in VS Code to launch an Extension Development Host
- Reload the extension host after changes are compiled

To package/publish: `npx vsce package` (requires `@vscode/vsce`)

## Architecture

### Entry Point

`src/extension.ts` activates on `onStartupFinished` and wires together all major modules. `diffEditor.codeLens` is force-enabled globally at activation so CodeLens appears in the diff editor's right (modified) pane.

### Two Diff Trigger Paths

**Path 1 — Hook-based (primary, external CLIs like Qwen/Codex)**

1. `hooks/pre-tool-hook.js` is called by the Claude CLI `PreToolUse` hook before a file-edit tool runs. It reads the current file and writes a snapshot to `%TEMP%/ai-cli-diff-snapshots/<safe-filename>`.
2. `hooks/post-tool-hook.js` is called `PostToolUse`. It writes a JSON signal file to `%TEMP%/ai-cli-diff-signals/<timestamp-name>.json`.
3. `HookWatcher` (`src/watcher/hookWatcher.ts`) uses `fs.watch` on the signal dir, reads + immediately deletes each signal, then calls `diffManager.loadSnapshot()` + `diffManager.openDiff()`.

**Path 2 — Inline runner (Claude Code via built-in session)**

1. `ClaudeRunner` (`src/claude/claudeRunner.ts`) spawns `claude --output-format stream-json --verbose -p <prompt>`.
2. It parses the NDJSON stream: on `assistant` events with `tool_use` items whose name is `Write`, `Edit`, or `MultiEdit`, it calls `diffManager.snapshotBefore()`.
3. On `tool` result events, it calls `diffManager.openDiff()`.

`runnerFactory.ts` detects available CLIs via `where`/`which` and returns the appropriate `IAiRunner`. Only `claude` is currently supported as a built-in runner.

### Diff Display

`diffManager.openDiff()` calls `vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title)`. The original URI uses scheme `ai-cli-diff` — served by the `TextDocumentContentProvider` registered in `DiffManager`. A stable `queryId` (timestamp string) is stored per file so the same diff tab is reused, not duplicated.

`InlineDiffRenderer` (`src/diff/inlineDiffRenderer.ts`) calls `calculateHunks()` and tracks per-file `FileDiffState` (original content + hunks). It also drives `DecorationManager` for colored inline decorations on the modified pane, and notifies `NavBarPanel` via callback.

`HunkCodeLensProvider` is registered for `{ scheme: 'file' }` and reads hunk data from `diffManager.renderer`.

### Accept / Revert Mechanics

- **Accept hunk**: patches the in-memory snapshot by splicing the accepted lines in, fires `contentProviderEventEmitter` to refresh the left pane, recalculates hunks.
- **Revert hunk**: uses `WorkspaceEdit` to replace lines in the real file on disk.
- **Accept all**: clears renderer state (snapshot stays), closes diff tab, reopens as normal editor, restores cursor/scroll position.
- **Revert all**: replaces the entire document content with the original snapshot via `WorkspaceEdit`.
- When all hunks are resolved, `cleanup()` closes the diff tab and reopens as a normal editor. If more pending files remain, it navigates directly to the next diff instead of opening a plain editor.

### Fallback Watcher

`WorkspaceWatcher` (`src/watcher/workspaceWatcher.ts`) watches external file writes in the workspace via `vscode.workspace.onDidSaveTextDocument`. `FileSnapshotStore` holds a baseline snapshot of workspace text files (built recursively at startup, depth ≤ 5). When a save is detected for a file without a diff already open, it compares against the baseline and calls `diffManager.loadSnapshot()` + `diffManager.openDiff()`.

### Path Normalization

All file paths are normalized via `vscode.Uri.file(path.resolve(p)).fsPath` and lowercased on Windows, so comparisons are case-insensitive across all modules consistently.

### Hook Installation

`installHooks` command writes entries into `~/.claude/settings.json` under `hooks.PreToolUse` and `hooks.PostToolUse` pointing to `hooks/pre-tool-hook.js` and `hooks/post-tool-hook.js` inside the extension install directory.

`hookInstallDetect.ts` reads the settings file and checks whether those exact paths are already registered, used to show a status indicator in the sidebar.

## Key Modules

| Module | Role |
| --- | --- |
| `src/diff/diffManager.ts` | Central diff state, snapshots, accept/revert API, content provider |
| `src/diff/inlineDiffRenderer.ts` | Per-file diff rendering state and decoration dispatch |
| `src/diff/hunkCalculator.ts` | Hunk calculation |
| `src/diff/hunkCodeLensProvider.ts` | CodeLens actions for hunks |
| `src/diff/decorationManager.ts` | VS Code decoration type management |
| `src/diff/navigationManager.ts` | Pending file navigation |
| `src/commands/commandsRegistry.ts` | Command registration |
| `src/views/sessionPanel.ts` | Sidebar session and pending files UI |
| `src/views/navBarPanel.ts` | Sidebar action and navigation UI |
| `src/views/diffActionPanel.ts` | Diff action webview panel |
| `src/watcher/hookWatcher.ts` | Hook signal watcher (primary path) |
| `src/watcher/workspaceWatcher.ts` | Workspace file watcher (fallback path) |
| `src/watcher/fileSnapshotStore.ts` | Baseline snapshots for WorkspaceWatcher |
| `src/watcher/pathExclusions.ts` | Path segments to exclude from watching |
| `src/claude/claudeRunner.ts` | Built-in Claude CLI runner (stream-json parser) |
| `src/claude/runnerFactory.ts` | CLI detection and runner construction |
| `src/claude/hookInstallDetect.ts` | Detect whether Claude hooks are installed |

## State Persistence

Snapshots survive VS Code restarts via workspace state key `ai-cli-diff.snapshots` (full file content stored). On restore, only files that still exist on disk are reloaded.

## Registered Commands and Keybindings

| Command | Keybinding | Purpose |
| --- | --- | --- |
| `ai-cli-diff-view.startSession` | `Ctrl+Shift+A` | Start an AI session |
| `ai-cli-diff-view.acceptAllHunks` | `Ctrl+Shift+Y` | Accept all changes in the active file |
| `ai-cli-diff-view.revertAllHunks` | `Ctrl+Shift+Z` | Revert all changes in the active file |
| `ai-cli-diff-view.acceptAllChanges` | — | Accept all pending changes (all files) |
| `ai-cli-diff-view.acceptHunk` | — | Accept one hunk |
| `ai-cli-diff-view.revertHunk` | — | Revert one hunk |
| `ai-cli-diff-view.prevFile` | `Alt+H` | Go to previous pending file |
| `ai-cli-diff-view.nextFile` | `Alt+L` | Go to next pending file |
| `ai-cli-diff-view.installHooks` | — | Install Claude CLI hooks |

The when-clause context key `ai-cli-diff-view.hasPendingDiff` controls editor title button and navigation keybinding visibility.
