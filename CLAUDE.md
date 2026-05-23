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
- `node-pty` (used by the embedded terminal) is a native module. `@electron/rebuild` is a devDependency; if the terminal fails to load, rebuild `node-pty` against the VS Code Electron ABI.

## Architecture

### Runtime shape

`src/extension.ts` is the entry point. On `onStartupFinished`, it creates the central `DiffManager`, all three watchers (`WorkspaceWatcher`, `HookWatcher`, `GitBranchWatcher`), the embedded terminal and navigation webviews, and the command registrations. It also force-enables `diffEditor.codeLens` globally so hunk CodeLens actions appear in VS Code's diff editor. On first run it auto-moves the terminal view into the auxiliary (right) bar.

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

There is no longer a side-by-side diff editor and no `ai-cli-diff:` URI scheme. Diffs are rendered **inline on the real file editor** using a "spacer line" trick.

`src/diff/diffManager.ts` is the snapshot/coordination layer. It owns:

- the original-content snapshot map (pre-edit baselines)
- persistence in workspace state via `src/diff/snapshotStore.ts`
- the public accept/revert operations used by commands and CodeLens
- `openDiff(filePath)` — the single idempotent entry point that re-renders an inline diff (used both when a new edit arrives and when a pending file's tab is reopened)

`src/diff/inlineDiffRenderer.ts` is where the rendering happens. For each pending file it holds an `InlineDiffSession` with two strings — `originalContent` (baseline) and `currentContent` (target). To display deleted lines, it inserts real blank lines ("spacers") into the buffer of the live file and paints the deleted text over them with `TextEditorDecorationType`. `calculateHunks(originalContent, currentContent)` is recomputed from those two strings; accept/revert only patches one of the two strings and the renderer rebuilds the display from scratch — hunk offsets are never hand-maintained.

The renderer exposes `isApplyingEdit` so `extension.ts` can ignore the `onDidChangeTextDocument` events caused by spacer insert/strip and avoid feedback loops.

`src/diff/decorationManager.ts` owns the `TextEditorDecorationType` instances. `src/diff/hunkCodeLensProvider.ts` reads `HunkView` data from the renderer to draw the accept/revert CodeLens above each hunk (CodeLens is the only supported way to surface those buttons — see constraints below).

### Save guard

`src/diff/saveGuard.ts` exists because inline rendering temporarily makes the live buffer "dirty" with spacer lines that must never reach disk:

- `onWillSaveTextDocument` returns a `TextEdit` that replaces the buffer with `currentContent` (spacers stripped, EOL preserved), so the file on disk is always clean.
- `onDidSaveTextDocument` calls `openDiff` again to re-insert spacers and restore the inline view.
- While any session is active, `SaveGuard` forces `files.autoSave` to `off` (at every level that has it enabled) and restores the previous values once all sessions end. Without this, autosave races with the strip/re-render cycle.

### Review and resolution flow

Accept and revert both work by patching the in-memory `originalContent`/`currentContent` of the session and re-rendering — they do not edit disk directly except via the normal save flow:

- Accepting a hunk advances `originalContent` to include that hunk's added lines so it disappears from the diff but stays on disk.
- Reverting a hunk rolls `currentContent` back to the original text for that hunk; the buffer is updated through the renderer (guarded by `isApplyingEdit`), and the user's next save commits it to disk via `SaveGuard`.
- Accepting/reverting a whole file resolves all hunks the same way; if other files are still pending, navigation moves to the next one.

When the last hunk for a file is resolved, the session is torn down: snapshot removed from `DiffManager`, decorations cleared, spacers stripped from the buffer, cursor/scroll preserved.

### Watchers and baseline tracking

`src/watcher/workspaceWatcher.ts` is the fallback path for external writes that do not come through Claude hooks. It combines VS Code save events with a `FileSystemWatcher` so external processes can still trigger review diffs.

`src/watcher/fileSnapshotStore.ts` builds the initial text-file baseline for each workspace folder and later updates that baseline after observed writes. This is why the fallback watcher can compare a newly written file against the prior workspace content instead of treating every file as brand new.

`src/watcher/gitBranchWatcher.ts` watches each workspace root's `.git/HEAD` (resolving `gitdir:` for worktrees/submodules). When HEAD changes (branch switch or detached checkout) it clears all pending diffs so stale snapshots are not compared against a different branch's working tree. It intentionally does NOT watch branch refs, so `git commit`/`pull`/`rebase` on the same branch leave pending state untouched.

### Embedded terminal subsystem

`src/terminal/` is a self-contained xterm/`node-pty` terminal hosted in a webview, used to run AI CLIs directly inside VS Code.

- `src/terminal/terminalPanel.ts` is the `WebviewViewProvider` (view id `ai-cli-diff-view.terminal`). It owns multiple PTY sessions, terminal settings persisted under `ai-cli-diff-view.terminal.settings`, the introduce/onboarding flow, and the pending-files page. It also exposes `setRunning`/`setIdle`/`setError`, the API the built-in runner uses for status (this replaced the old `SessionPanelProvider`).
- `src/terminal/ptySession.ts` wraps a single `node-pty` process; `node-pty` is `require`-d lazily so a load failure degrades gracefully.
- `terminalHtml.ts`, `terminalTypes.ts`, `pendingFilesPage.ts`, and `fontInstaller.ts` build the webview HTML, shared types, the changed-files page, and optional terminal-font installation.

### UI composition

There are two persistent webview surfaces:

- `src/terminal/terminalPanel.ts` (activity-bar/auxiliary view "AI CLI") shows the embedded terminal, built-in runner status, and the pending-files page.
- `src/views/navBarPanel.ts` (explorer view) shows accept/reject controls plus previous/next pending-file navigation.

`src/views/diffActionPanel.ts` provides the in-diff accept/revert action UI.

Pending-file navigation itself lives in `src/diff/navigationManager.ts`, but the navigation UI is updated indirectly through callbacks fired by `InlineDiffRenderer` and `DiffManager` state changes.

### Important implementation constraints

- Path normalization is load-bearing across the codebase: paths are resolved through `vscode.Uri.file(...).fsPath` and lowercased on Windows before comparisons.
- Snapshot persistence is designed to survive VS Code restarts, so changes to snapshot shape or cleanup behavior affect restore logic as well as live diffing.
- Built-in session launch is Claude-only even though the extension can still review Codex/Qwen edits through hooks or workspace watching.
- Inline diff buttons must be rendered via `HunkCodeLensProvider` only — never inject button text into the file buffer itself. The buffer already contains spacer lines that must round-trip cleanly to disk through `SaveGuard`.
- Self-driven edits to the buffer must happen while `InlineDiffRenderer.isApplyingEdit` is `true` so the `onDidChangeTextDocument` listener in `extension.ts` does not re-trigger decoration recomputation on the extension's own writes.
- All internal text processing normalizes to LF; CRLF is only re-applied at the boundary when writing back to the document.

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
