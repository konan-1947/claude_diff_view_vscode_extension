# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Extension Does

AI CLI diff view is a VS Code extension for reviewing AI CLI file edits inside VS Code.
Best supported workflows: Claude, Codex, and Qwen.
Built-in session launch and hook installation currently target Claude Code.

## Commands

```bash
npm install
npm run compile
npm run watch
npx vsce package
```

- `npm install` installs dependencies.
- `npm run compile` is the main build command and writes compiled output to `out/`.
- `npm run watch` is the normal development loop; keep it running while using the Extension Development Host.
- Press `F5` in VS Code to launch the Extension Development Host using `.vscode/launch.json`.
- Reload the extension host after TypeScript recompiles.
- There is currently no dedicated lint script and no test script in `package.json`.
- There is currently no single-test command because the repository does not include a test runner setup yet.

## Architecture

### Runtime shape

`src/extension.ts` is the entry point. On `onStartupFinished`, it creates the central `DiffManager`, both watcher paths, the session and navigation webviews, and the command registrations. It also force-enables `diffEditor.codeLens` globally so hunk CodeLens actions appear in VS Code's diff editor.

The extension has one core responsibility: capture a before-image of a file, detect the after-image once an AI tool writes it, then open a reviewable VS Code diff while keeping enough per-file state to accept or reject hunks.

### Two edit-detection pipelines

**Hook pipeline for external AI CLIs**

This is the primary path for edits made outside the built-in runner.

1. `hooks/pre-tool-hook.js` stores the pre-edit snapshot in the temp snapshot directory.
2. `hooks/post-tool-hook.js` writes a JSON signal into the temp signal directory.
3. `src/watcher/hookWatcher.ts` consumes the signal, ignores files outside the current workspace, loads the stored snapshot into `DiffManager`, and opens the diff.

Hook installation is managed by the `ai-cli-diff-view.installHooks` command in `src/commands/commandsRegistry.ts`. It rewrites `~/.claude/settings.json` with `PreToolUse` and `PostToolUse` hook entries pointing at this extension's bundled hook scripts. `src/commands/hookInstallDetect.ts` reads the same settings file to drive the sidebar hook status.

**Built-in Claude runner pipeline**

The built-in session path is Claude-only right now.

1. `src/runner/runnerFactory.ts` detects whether `claude` is available on PATH.
2. `src/runner/claudeRunner.ts` spawns `claude --output-format stream-json --verbose -p <prompt>`.
3. While parsing the NDJSON stream, it snapshots files before `Write`/`Edit`/`MultiEdit` tool calls and opens diffs when tool results arrive.

### Diff state model

`src/diff/diffManager.ts` is the center of the extension. It owns:

- the original-content snapshot map
- the stable per-file query IDs used to reuse diff tabs
- persistence in workspace state under `ai-cli-diff.snapshots`
- the public accept/revert operations used by commands and CodeLens

The left side of the diff is not a temp file. It is served through a `TextDocumentContentProvider` on the custom `ai-cli-diff` URI scheme, backed by the stored snapshot. The right side is the live workspace file.

`src/diff/inlineDiffRenderer.ts` holds the per-file hunk state computed by `src/diff/hunkCalculator.ts`. It applies decorations, exposes hunk data to `src/diff/hunkCodeLensProvider.ts`, and updates navigation UI state.

### Review and resolution flow

Accept and revert are intentionally asymmetric:

- Accepting a hunk edits the in-memory snapshot so the accepted change becomes part of the new baseline on the left side of the diff.
- Reverting a hunk edits the real file on disk with `WorkspaceEdit`.
- Accepting a whole file clears pending state and closes the diff; if other files are still pending, navigation moves directly to the next one.
- Reverting a whole file replaces the entire document with the original snapshot.

When the last hunk for a file is resolved, `DiffManager.cleanup()` removes the snapshot, clears decorations, closes the diff tab, and optionally reopens the file as a normal editor while preserving cursor and scroll position.

### Watchers and baseline tracking

`src/watcher/workspaceWatcher.ts` is the fallback path for external writes that do not come through Claude hooks. It combines VS Code save events with a `FileSystemWatcher` so external processes can still trigger review diffs.

`src/watcher/fileSnapshotStore.ts` builds the initial text-file baseline for each workspace folder and later updates that baseline after observed writes. This is why the fallback watcher can compare a newly written file against the prior workspace content instead of treating every file as brand new.

### UI composition

There are two persistent webview surfaces:

- `src/views/sessionPanel.ts` shows built-in runner status, pending files, and hook installation status.
- `src/views/navBarPanel.ts` shows accept/reject controls plus previous/next pending-file navigation.

Pending-file navigation itself lives in `src/diff/navigationManager.ts`, but the navigation UI is updated indirectly through callbacks fired by `InlineDiffRenderer` and `DiffManager` state changes.

### Important implementation constraints

- Path normalization is load-bearing across the codebase: paths are resolved through `vscode.Uri.file(...).fsPath` and lowercased on Windows before comparisons.
- Snapshot persistence is designed to survive VS Code restarts, so changes to snapshot shape or cleanup behavior affect restore logic as well as live diffing.
- Built-in session launch is Claude-only even though the extension can still review Codex/Qwen edits through hooks or workspace watching.

## Registered Commands and Keybindings

| Command | Keybinding | Purpose |
| --- | --- | --- |
| `ai-cli-diff-view.startSession` | `Ctrl+Shift+A` | Start an AI session |
| `ai-cli-diff-view.acceptAllHunks` | `Ctrl+Shift+Y` | Accept all changes in the active file |
| `ai-cli-diff-view.revertAllHunks` | `Ctrl+Shift+Z` | Revert all changes in the active file |
| `ai-cli-diff-view.acceptAllChanges` | — | Accept all pending changes across files |
| `ai-cli-diff-view.acceptHunk` | — | Accept one hunk |
| `ai-cli-diff-view.revertHunk` | — | Revert one hunk |
| `ai-cli-diff-view.prevFile` | `Alt+H` | Go to previous pending file |
| `ai-cli-diff-view.nextFile` | `Alt+L` | Go to next pending file |
| `ai-cli-diff-view.installHooks` | — | Install Claude CLI hooks |

The when-clause context key `ai-cli-diff-view.hasPendingDiff` controls editor-title actions and pending-file navigation keybinding visibility.
