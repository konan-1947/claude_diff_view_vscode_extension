# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

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

## Architecture

### Entry Point

`src/extension.ts` activates on `onStartupFinished` and wires together:
- `DiffManager`
- `SessionPanelProvider`
- `WorkspaceWatcher`
- `HookWatcher`
- `NavigationManager`
- `NavBarPanel`
- `HunkCodeLensProvider`

The AI runner is initialized lazily on first `Start Session`.

### Diff Flow

1. The runner detects a file edit tool call and calls `diffManager.snapshotBefore(filePath)`.
2. The CLI modifies the file on disk.
3. The runner calls `diffManager.openDiff(filePath)`.
4. `openDiff()` opens a VS Code diff editor using:
   - original: scheme `ai-cli-diff`
   - modified: scheme `file`
5. `renderer.show()` computes hunks and stores per-file diff state.
6. `HunkCodeLensProvider` renders accept and revert actions.
7. When all hunks are resolved, cleanup closes the diff tab and restores a normal editor.

### Diff Editor Detail

`DiffManager` owns the `TextDocumentContentProvider` for `ai-cli-diff`.
The left pane is the stored snapshot.
The right pane is the real file on disk.

`HunkCodeLensProvider` is registered for `{ scheme: 'file' }`.
VS Code can suppress CodeLens in diff editors unless `diffEditor.codeLens` is enabled.

### AI Runner Pattern

`IAiRunner` is the common interface.
`ClaudeRunner` is the current built-in implementation.

### File Monitoring

Primary path: `src/watcher/hookWatcher.ts`
- Reads signal files produced by the CLI hooks
- Uses `%TEMP%/ai-cli-diff-snapshots/`
- Uses `%TEMP%/ai-cli-diff-signals/`

Fallback path: `src/watcher/workspaceWatcher.ts`
- Watches external file writes in the workspace
- Re-applies diff state after saves

## Key Modules

| Module | Role |
| --- | --- |
| `src/diff/diffManager.ts` | Central diff state, snapshots, accept/revert API, content provider |
| `src/diff/inlineDiffRenderer.ts` | Per-file diff rendering state |
| `src/diff/hunkCalculator.ts` | Hunk calculation |
| `src/diff/hunkCodeLensProvider.ts` | CodeLens actions for hunks |
| `src/diff/navigationManager.ts` | Pending file navigation |
| `src/commands/commandsRegistry.ts` | Command registration |
| `src/views/sessionPanel.ts` | Sidebar session and pending files UI |
| `src/views/navBarPanel.ts` | Sidebar action and navigation UI |
| `src/watcher/hookWatcher.ts` | Hook signal watcher |
| `src/watcher/workspaceWatcher.ts` | Workspace file watcher |

## State Persistence

Snapshots are stored in:
1. Memory via `diffManager.snapshots`
2. Workspace state under `ai-cli-diff.snapshots`
3. Disk snapshots under `%TEMP%/ai-cli-diff-snapshots/`

## Registered Commands

| Command | Purpose |
| --- | --- |
| `ai-cli-diff-view.startSession` | Start an AI session |
| `ai-cli-diff-view.acceptAllHunks` | Accept all changes in the active file |
| `ai-cli-diff-view.acceptAllChanges` | Accept all pending changes |
| `ai-cli-diff-view.revertAllHunks` | Revert all changes in the active file |
| `ai-cli-diff-view.acceptHunk` | Accept one hunk |
| `ai-cli-diff-view.revertHunk` | Revert one hunk |
| `ai-cli-diff-view.nextFile` | Go to next pending file |
| `ai-cli-diff-view.prevFile` | Go to previous pending file |
| `ai-cli-diff-view.installHooks` | Install Claude CLI hooks |

The editor title visibility key is `ai-cli-diff-view.hasPendingDiff`.
