# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Extension Does

AI CLI diff view is a VS Code extension for reviewing AI CLI file edits inside VS Code.
Best supported review workflows: Claude, Codex, and Qwen (any tool whose edits are detected via hooks or workspace writes can be reviewed).
Built-in session launch and hook installation currently target Claude Code only.

## Commands

```bash
npm install
npm run compile      # tsc -p ./  → out/  (main build / correctness check)
npm run watch        # tsc -watch -p ./  (normal dev loop)
npx @vscode/vsce package
```

- Press `F5` to launch the Extension Development Host (`.vscode/launch.json`), and reload the host after each recompile.
- There is no lint, formatter, or test runner configured. `npm run compile` is the minimum correctness gate.
- `node-pty` is a **native module**. If the integrated terminal fails to load (ABI mismatch against VS Code's Electron), rebuild it with the `@electron/rebuild` devDependency. There is no postinstall script wiring this up.
- Monaco and xterm assets are consumed directly from `node_modules/` at runtime (loaded into webviews via `localResourceRoots`); there is no separate asset bundling step.

## Architecture

### Runtime shape

`src/extension.ts` is the entry point, activated `onStartupFinished`. It wires together the `DiffManager`, all three watchers, the Monaco diff custom-editor provider, the navigation manager, and both webview surfaces (terminal + nav bar), then registers commands.

The core responsibility: capture a before-image of a file, detect the after-image once an AI tool writes it, then present a reviewable Monaco diff while keeping enough per-file state to accept or reject individual hunks.

### Diff rendering — Monaco custom editor (not native diff)

This is the most important thing to understand and the biggest divergence from older docs.

- The diff is **not** VS Code's built-in diff editor and **not** CodeLens-driven. It is a `CustomTextEditorProvider` (`src/diff/diffWebviewPanel.ts`, `DiffEditorProvider`, view type `ai-cli-diff-view.diffEditor`) that renders a **Monaco `DiffEditor` inside a webview**.
- Each pending file opens as its own webview tab. Webview-side code lives in `res/webview/diff.monaco.js` / `diff.monaco.css`; Monaco itself is served from `node_modules/monaco-editor/min`.
- The **left/original side** is the snapshot held in `DiffManager`; the **right/modified side** is the live `TextDocument` content.
- Hunk-level accept/reject is driven by **postMessage** between the webview and the extension (`acceptHunk`, `rejectHunk`, `acceptAll`, `rejectAll`, `editModified`, `save`, `cursor`, `nextFile`/`prevFile` messages in `diffWebviewPanel.ts`) — **not** by registered VS Code commands.
- `extension.ts` auto-routes tabs: if a pending file is opened as a plain text editor, that tab is closed and reopened through the custom diff editor (`autoRouteTab`).

### Diff state model

`src/diff/diffManager.ts` is the center of the extension. It owns:

- the original-content snapshot map (left side of each diff)
- the live webview panel per file and last-seen Monaco cursor per file
- persistence via `src/diff/snapshotStore.ts` in workspace state under `ai-cli-diff.snapshots` (survives VS Code restarts)
- the public accept/revert/`acceptAllPending` operations used by commands and webview messages

`src/diff/hunkCalculator.ts` computes hunks (via the `diff` library / Myers) from `snapshot` vs `current` content. Accept and revert are intentionally asymmetric: accepting folds the change into the in-memory snapshot (new baseline on the left); reverting writes the original back to the real file on disk. When the last hunk for a file is resolved, `DiffManager.cleanup()` removes the snapshot, closes the diff tab, and may reopen the file as a normal editor preserving cursor/scroll.

### Three edit-detection pipelines

**Hook pipeline (primary path for external AI CLIs)**

1. `hooks/pre-tool-hook.js` stores the pre-edit snapshot in the temp snapshot directory.
2. `hooks/post-tool-hook.js` writes a JSON signal into the temp signal directory (`os.tmpdir()/ai-cli-diff-signals/`). Hooks always exit 0 so they never block the CLI.
3. `src/watcher/hookWatcher.ts` consumes the signal, ignores files outside the workspace, loads the stored snapshot into `DiffManager`, and opens the diff.

Hook installation: `ai-cli-diff-view.installHooks` in `src/commands/commandsRegistry.ts` rewrites the runner's settings file (`~/.claude/settings.json` for Claude) with `PreToolUse`/`PostToolUse` entries pointing at the bundled hook scripts (plus Windows `Notification`/`Stop` sound hooks). `src/commands/hookInstallDetect.ts` reads the same file to drive sidebar hook status.

**Workspace watcher (fallback for external writes)**

`src/watcher/workspaceWatcher.ts` combines save events with a `FileSystemWatcher` for writes that don't come through hooks. `src/watcher/fileSnapshotStore.ts` builds and updates the per-folder text-file baseline so a newly written file is compared against prior content rather than treated as brand new. `src/watcher/pathExclusions.ts` filters out paths that should not be tracked.

**Built-in runner (Claude-only)**

`src/runner/runnerFactory.ts` detects whether `claude` is on PATH and returns a `ClaudeRunner` (`src/runner/claudeRunner.ts`), which spawns `claude` with stream-json output, snapshots files before `Write`/`Edit`/`MultiEdit`, and opens diffs when results arrive. `src/runner/aiRunner.ts` is the runner interface. Note this is the programmatic runner used by `startSession`; it is distinct from the interactive integrated terminal below.

### Git branch watcher

`src/watcher/gitBranchWatcher.ts` watches each workspace root's `.git/HEAD` (resolving `gitdir:` for worktrees/submodules). On a HEAD ref change (branch switch / checkout / detached) it clears all pending diffs so stale snapshots aren't compared against a different branch's working tree. It deliberately does **not** react to pull/rebase/reset on the same branch (those change `refs/heads/<branch>`, not HEAD) to avoid wiping pending state on every commit.

### Integrated terminal

`src/terminal/` is an embedded PTY terminal (xterm.js webview + `node-pty`), shown by default in the Secondary Side Bar (extension.ts moves it there once via a one-time globalState flag). `src/terminal/terminalPanel.ts` (`TerminalPanelProvider`, view id `ai-cli-diff-view.terminal`) manages PTY sessions and also serves the pending-files / session-status page (`pendingFilesPage.ts`) — it plays the role the old session panel did. `ptySession.ts` wraps node-pty; `fontInstaller.ts` handles terminal fonts; `terminalHtml.ts` / `terminalTypes.ts` hold the webview shell and settings types.

### UI composition

- `src/terminal/terminalPanel.ts` — terminal + built-in runner status + pending files + hook status (Secondary Side Bar).
- `src/views/navBarPanel.ts` — accept/reject + prev/next pending-file navigation (Explorer view, id `ai-cli-diff-view.navBar`).
- `src/views/diffActionPanel.ts` — diff action controls.

Pending-file navigation logic lives in `src/diff/navigationManager.ts`; the nav UI is updated indirectly via `DiffManager.onDidChangeDiffs` and tab-change events (`updateNavBarState` in `extension.ts`).

### Configurable text-file detection

`refreshTextFileRules()` / `isTextFile()` in `src/watcher/fileSnapshotStore.ts` decide which files are reviewable. They read four settings (see below) and are refreshed on the corresponding `onDidChangeConfiguration` events. `supportedFileDetectionMode` chooses between built-in rules + custom, or custom-only.

### Important implementation constraints

- Path normalization is load-bearing: paths go through `vscode.Uri.file(...).fsPath` and are lowercased on Windows before comparison. `canonicalCasePath` (via `fs.realpathSync.native`) is used when calling VS Code APIs so tab titles show the on-disk case.
- Snapshot persistence is designed to survive restarts; changes to snapshot shape or cleanup affect restore logic as well as live diffing.
- Built-in session launch is Claude-only; Codex/Qwen edits are reviewed only through hooks or the workspace watcher.

## Settings (contributed configuration)

| Setting | Purpose |
| --- | --- |
| `ai-cli-diff-view.supportedFileDetectionMode` | `defaultAndCustom` (default) or `customOnly` |
| `ai-cli-diff-view.supportedFileExtensions` | Extra extensions to treat as text (dot optional) |
| `ai-cli-diff-view.supportedFilenames` | Extra exact filenames to treat as text |
| `ai-cli-diff-view.supportedFilenamePatterns` | Extra basename globs (`*`, `?`) to treat as text |

## Registered Commands and Keybindings

| Command | Keybinding | Purpose |
| --- | --- | --- |
| `ai-cli-diff-view.startSession` | `Ctrl+Shift+A` | Start a built-in (Claude) session |
| `ai-cli-diff-view.acceptAllHunks` | `Ctrl+Shift+Y` | Accept all changes in the active file |
| `ai-cli-diff-view.revertAllHunks` | `Ctrl+Shift+Z` | Revert all changes in the active file |
| `ai-cli-diff-view.acceptAllChanges` | — | Accept all pending changes across files |
| `ai-cli-diff-view.openPendingFile` | — | Open a pending file's diff (takes a path arg) |
| `ai-cli-diff-view.prevFile` | `Alt+H` | Go to previous pending file |
| `ai-cli-diff-view.nextFile` | `Alt+L` | Go to next pending file |
| `ai-cli-diff-view.installHooks` | — | Install Claude CLI hooks |

Hunk-level accept/reject is handled inside the Monaco webview via postMessage, not as registered commands. The when-clause key `ai-cli-diff-view.hasPendingDiff` gates the navigation keybindings and pending-file UI.
