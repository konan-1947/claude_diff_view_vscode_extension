# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Extension Does

AI CLI diff view is a VS Code extension for reviewing AI CLI file edits inside VS Code.
Best supported review workflows: Claude, Codex, and Qwen — all detected uniformly via the workspace watcher (no CLI-specific hooks). Built-in session launch (`startSession`) is Claude-only.

## Commands

```bash
npm install
npm run compile      # tsc -p ./  → out/  (main build / correctness check)
npm run watch        # tsc -watch -p ./  (normal dev loop)
npx @vscode/vsce package
```

- Press `F5` to launch the Extension Development Host (`.vscode/launch.json`), and reload the host after each recompile.
- There is no lint, formatter, or test runner configured. `npm run compile` is the minimum correctness gate. Manually validate diff rendering, accept/revert, and navigation against the sample files in `code_to_test/`.
- `node-pty` is a **native module**. If the integrated terminal fails to load (ABI mismatch against VS Code's Electron), rebuild it with the `@electron/rebuild` devDependency. There is no postinstall script wiring this up.
- Monaco and xterm assets are consumed directly from `node_modules/` at runtime (loaded into webviews via `localResourceRoots`); there is no separate asset bundling step.
- Strict TypeScript (`tsconfig.json`: `strict: true`, CommonJS, ES2020 target). 2-space indentation, semicolons, single quotes; `PascalCase` for classes/providers, `camelCase` for functions/variables, `kebab-case` for asset filenames.

## Architecture

### Runtime shape

`src/extension.ts` is the entry point, activated `onStartupFinished`. It wires together the `DiffManager`, the workspace and git-branch watchers, the Monaco diff custom-editor provider, the navigation manager, and both webview surfaces (terminal + nav bar), then registers commands.

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

### Two edit-detection pipelines

There used to be a third, hook-based pipeline (`PreToolUse`/`PostToolUse` hooks written into `~/.claude/settings.json`); it was removed in favor of detecting every CLI — including Claude — uniformly through the workspace watcher. Only the unrelated `Notification`/`Stop` sound hooks remain (see Sound notifications below), and they carry no diff-detection role.

**Workspace watcher (primary path for all external AI CLIs)**

`src/watcher/workspaceWatcher.ts` combines save events with a `FileSystemWatcher` for any external write, regardless of which tool made it. `src/watcher/fileSnapshotStore.ts` builds and updates the per-folder text-file baseline so a newly written file is compared against prior content rather than treated as brand new. `src/watcher/pathExclusions.ts` filters out paths that should not be tracked. `src/watcher/writeBurstMeter.ts` decides whether a write is part of a burst (git checkout vs AI edits); writes past the burst threshold are held in `WorkspaceWatcher`'s `heldWrites` queue for `burstDetectionHoldMs` instead of opening a diff immediately — if `GitBranchWatcher` confirms a branch change in that window (`notifyExternalBatch()`), held writes are silently dropped; otherwise they open normally once the hold expires. See `docs/GIT_VS_AI_EDIT_DETECTION.md`.

**Built-in runner (Claude-only)**

`src/runner/runnerFactory.ts` detects whether `claude` is on PATH and returns a `ClaudeRunner` (`src/runner/claudeRunner.ts`), which spawns `claude` with stream-json output, snapshots files before `Write`/`Edit`/`MultiEdit`, and opens diffs when results arrive. `src/runner/aiRunner.ts` is the runner interface. Note this is the programmatic runner used by `startSession`; it is distinct from the interactive integrated terminal below.

### Sound notifications (unrelated to diff detection)

`src/commands/soundNotifications.ts` (`applySoundNotifications`) writes or removes `Notification`/`Stop` hook entries in `~/.claude/settings.json` (Windows only, via PowerShell `SoundPlayer`) based on the `ai-cli-diff-view.soundNotificationsEnabled` setting — toggled from the terminal panel's Settings popover. It only ever touches those two keys, preserving any other hooks already present in the file.

### Git branch watcher

`src/watcher/gitBranchWatcher.ts` watches each workspace root's `.git/HEAD` (resolving `gitdir:` for worktrees/submodules). On a HEAD ref change (branch switch / checkout / detached) it clears all pending diffs so stale snapshots aren't compared against a different branch's working tree. That content-compare path deliberately does **not** react to pull/rebase/reset on the same branch (those change `refs/heads/<branch>`, not HEAD's content) to avoid wiping pending state on every commit. Instead, `pull`/`merge`/`rebase`/`reset` on the same branch are confirmed via a second, narrower source: the same watcher also tails `.git/logs/HEAD` (reflog) and matches the action label git appends to the last line (`pull:`, `merge …`, `rebase (finish): …`, `reset: …`); on a match it calls `workspaceWatcher.notifyExternalBatch()` — silently dropping burst-held writes and rebuilding the baseline — **without** clearing already-open pending diffs, since those are unaffected by a same-branch pull/rebase/reset. `commit`/`checkout` are excluded from that regex on purpose (commit shouldn't suppress anything; checkout-to-another-ref is already handled by the HEAD-content path above).

### Integrated terminal

`src/terminal/` is an embedded PTY terminal (xterm.js webview + `node-pty`), shown by default in the Secondary Side Bar (extension.ts moves it there once via a one-time globalState flag). `src/terminal/terminalPanel.ts` (`TerminalPanelProvider`, view id `ai-cli-diff-view.terminal`) manages PTY sessions and also serves the pending-files / session-status page (`pendingFilesPage.ts`) — it plays the role the old session panel did. `ptySession.ts` wraps node-pty; `fontInstaller.ts` handles terminal fonts; `terminalHtml.ts` / `terminalTypes.ts` hold the webview shell and settings types.

### UI composition

- `src/terminal/terminalPanel.ts` — terminal + built-in runner status + pending files (Secondary Side Bar).
- `src/views/diffActionPanel.ts` — diff action controls.

Pending-file navigation logic lives in `src/diff/navigationManager.ts`, reachable via the `prevFile`/`nextFile` commands and their `Alt+H`/`Alt+L` keybindings (there is no dedicated nav-bar view). The `ai-cli-diff-view.hasPendingDiff` context key that gates those keybindings is kept in sync by `updatePendingContext` in `extension.ts` via `DiffManager.onDidChangeDiffs` and tab-change events.

### Configurable text-file detection

`refreshTextFileRules()` / `isTextFile()` in `src/watcher/fileSnapshotStore.ts` decide which files are reviewable. They read four settings (see below) and are refreshed on the corresponding `onDidChangeConfiguration` events. `supportedFileDetectionMode` chooses between built-in rules + custom, or custom-only.

### Important implementation constraints

- Path normalization is load-bearing: paths go through `vscode.Uri.file(...).fsPath` and are lowercased on Windows before comparison. `canonicalCasePath` (via `fs.realpathSync.native`) is used when calling VS Code APIs so tab titles show the on-disk case.
- Snapshot persistence is designed to survive restarts; changes to snapshot shape or cleanup affect restore logic as well as live diffing.
- Built-in session launch is Claude-only; Codex/Qwen (and Claude, when not run via `startSession`) edits are reviewed through the workspace watcher.

## Settings (contributed configuration)

| Setting | Purpose |
| --- | --- |
| `ai-cli-diff-view.supportedFileDetectionMode` | `defaultAndCustom` (default) or `customOnly` |
| `ai-cli-diff-view.supportedFileExtensions` | Extra extensions to treat as text (dot optional) |
| `ai-cli-diff-view.supportedFilenames` | Extra exact filenames to treat as text |
| `ai-cli-diff-view.supportedFilenamePatterns` | Extra basename globs (`*`, `?`) to treat as text |
| `ai-cli-diff-view.maxFileLines` | Advanced: ignore files above this many lines — no baseline, no diff (default 5000; `0` disables). Enforced in `src/watcher/fileSizeLimit.ts`, applied by `fileSnapshotStore.snapshotDir()` and both write paths in `workspaceWatcher`. Skipped files are recorded in `FileSnapshotStore.sizeSkipped` so that one later dropping below the limit is not mistaken for a brand-new file (which would make Revert all delete it) |
| `ai-cli-diff-view.burstDetectionEnabled` | Advanced: hold files beyond the burst threshold to confirm a git branch change before opening their diff, instead of opening immediately (see `docs/GIT_VS_AI_EDIT_DETECTION.md`) |
| `ai-cli-diff-view.burstDetectionWindowMs` | Advanced: sliding window (ms) used to count file changes for burst detection (default 300) |
| `ai-cli-diff-view.burstDetectionThreshold` | Advanced: number of distinct files changed within the window that counts as a burst (default 8) |
| `ai-cli-diff-view.burstDetectionHoldMs` | Advanced: how long (ms) to hold burst-threshold-exceeding files before opening their diff if no git branch change is confirmed (default 2000) |
| `ai-cli-diff-view.soundNotificationsEnabled` | Play a sound when Claude finishes a turn or needs input (Windows only, default off) — unrelated to diff detection |

The four burst-detection settings, `maxFileLines`, and the sound-notification toggle are all also editable via the terminal panel's Settings popover (`src/terminal/terminalHtml.ts`) — burst detection and `maxFileLines` under "Advanced", sound notifications in the general section — backed by the same `ai-cli-diff-view.*` configuration, not a separate storage. `.git/index`-based early confirmation is a known gap — the hold mechanism currently relies solely on `GitBranchWatcher`'s existing `HEAD`-change confirmation (see `docs/GIT_VS_AI_EDIT_DETECTION.md`).

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

Hunk-level accept/reject is handled inside the Monaco webview via postMessage, not as registered commands. The when-clause key `ai-cli-diff-view.hasPendingDiff` gates the navigation keybindings and pending-file UI.
