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
- Many code comments and most `docs/` files are written in Vietnamese; match the language of the surrounding comments when editing. `AGENTS.md` and `QWEN.md` are sibling context files for other CLIs; `QWEN.md` is stale (it still describes the removed Claude hook installation), so when they disagree this file is authoritative. Never edit `out/` by hand.
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
- The webview runs on **two different granularities**, and conflating them is the easy mistake: decorations/view zones iterate `state.hunks` (split per line pair so a removed line renders directly above its replacement), while buttons, hit-testing, F7 navigation and the "n / N" pill iterate `state.groups` — change blocks assembled by `buildGroups()`. A block ends on either boundary: (1) `Hunk.groupId` changes, i.e. an unchanged context line intervened, or (2) a sub-hunk contributes removed lines while the block already holds added lines, i.e. every added→removed transition. Rule (2) is a **deliberate divergence from git**, which refuses to split a hunk without a context line (`add -p`): here each replaced line gets its own button, while a purely-added line with no removed counterpart attaches to the pair above it. Accepting a block is a single `slice().concat()`; blocks stay contiguous in both index spaces, which is what makes that one splice correct.
- `extension.ts` auto-routes tabs: if a pending file is opened as a plain text editor, that tab is closed and reopened through the custom diff editor (`autoRouteTab`).

### Diff state model

`src/diff/diffManager.ts` is the center of the extension. It owns:

- the original-content snapshot map (left side of each diff)
- the live webview panel per file and last-seen Monaco cursor per file
- persistence via `src/diff/snapshotStore.ts` in workspace state under `ai-cli-diff.snapshots` (survives VS Code restarts)
- the public accept/revert/`acceptAllPending` operations used by commands and webview messages

`src/diff/hunkCalculator.ts` computes hunks (via the `diff` library / Myers) from `snapshot` vs `current` content. Pass 3 (`splitAlignedLines`) then splits each contiguous block into per-line-pair sub-hunks **for rendering only** — every sub-hunk keeps its parent's `groupId` so the UI can re-form the block. That function documents three invariants (order-preserving partition, first sub-hunk anchors match the parent, lengths sum) that group-level accept depends on; reordering or deduplicating sub-hunks would silently corrupt accept/reject. Accept and revert are intentionally asymmetric: accepting folds the change into the in-memory snapshot (new baseline on the left); reverting writes the original back to the real file on disk. When the last hunk for a file is resolved, `DiffManager.cleanup()` removes the snapshot, closes the diff tab, and may reopen the file as a normal editor preserving cursor/scroll.

### Two edit-detection pipelines

There used to be a third, hook-based pipeline (`PreToolUse`/`PostToolUse` hooks written into `~/.claude/settings.json`); it was removed in favor of detecting every CLI — including Claude — uniformly through the workspace watcher. Only the unrelated `Notification`/`Stop` sound hooks remain (see Sound notifications below), and they carry no diff-detection role.

**Workspace watcher (primary path for all external AI CLIs)**

`src/watcher/workspaceWatcher.ts` combines save events with a `FileSystemWatcher` for any external write, regardless of which tool made it. `src/watcher/baselineScanner.ts` builds the per-folder text-file baseline and `src/watcher/baselineStore.ts` stores it, so a newly written file is compared against prior content rather than treated as brand new. `src/watcher/pathExclusions.ts` filters out paths that should not be tracked. `src/watcher/writeBurstMeter.ts` decides whether a write is part of a burst (git checkout vs AI edits); writes past the burst threshold are held in `WorkspaceWatcher`'s `heldWrites` queue for `burstDetectionHoldMs` instead of opening a diff immediately — if `GitBranchWatcher` confirms a branch change in that window (`notifyExternalBatch()`), held writes are silently dropped; otherwise they open normally once the hold expires. Every auto-open goes through `src/watcher/autoOpenQueue.ts` (`AutoOpenQueue`): at most `maxAutoOpenDiffs` diff tabs open in total (files beyond it stay pending — Pending Files, Alt+H/L — and are never opened later to fill freed slots), picked in Pending Files tree order, opened in awaited batches of 10 with an event-loop yield between batches, with one notification each time the cap is hit. See `docs/GIT_VS_AI_EDIT_DETECTION.md`.

**Built-in runner (Claude-only)**

`src/runner/runnerFactory.ts` detects whether `claude` is on PATH and returns a `ClaudeRunner` (`src/runner/claudeRunner.ts`), which spawns `claude` with stream-json output, snapshots files before `Write`/`Edit`/`MultiEdit`, and opens diffs when results arrive. `src/runner/aiRunner.ts` is the runner interface. Note this is the programmatic runner used by `startSession`; it is distinct from the interactive integrated terminal below.

### Sound notifications (unrelated to diff detection)

`src/commands/soundNotifications.ts` (`applySoundNotifications`) writes or removes `Notification`/`Stop` hook entries in `~/.claude/settings.json` (Windows only, via PowerShell `SoundPlayer`) based on the `ai-cli-diff-view.soundNotificationsEnabled` setting — toggled from the terminal panel's Settings popover. It only ever touches those two keys, preserving any other hooks already present in the file.

### Git branch watcher

`src/watcher/gitBranchWatcher.ts` watches each workspace root's `.git/HEAD` (resolving `gitdir:` for worktrees/submodules). On a HEAD ref change (branch switch / checkout / detached) it clears all pending diffs so stale snapshots aren't compared against a different branch's working tree. That content-compare path deliberately does **not** react to pull/rebase/reset on the same branch (those change `refs/heads/<branch>`, not HEAD's content) to avoid wiping pending state on every commit. Instead, `pull`/`merge`/`rebase`/`reset` on the same branch are confirmed via a second, narrower source: the same watcher also tails `.git/logs/HEAD` (reflog) and matches the action label git appends to the last line (`pull:`, `merge …`, `rebase (finish): …`, `reset: …`); on a match it calls `workspaceWatcher.notifyExternalBatch()` — silently dropping burst-held writes and rebuilding the baseline — **without** clearing already-open pending diffs, since those are unaffected by a same-branch pull/rebase/reset. `commit`/`checkout` are excluded from that regex on purpose (commit shouldn't suppress anything; checkout-to-another-ref is already handled by the HEAD-content path above).

### Integrated terminal

`src/terminal/` is an embedded PTY terminal (xterm.js webview + `node-pty`), shown by default in the Secondary Side Bar (extension.ts moves it there once via a one-time globalState flag). `src/terminal/terminalPanel.ts` (`TerminalPanelProvider`, view id `ai-cli-diff-view.terminal`) manages PTY sessions; its ☰ header button opens a Pending Files overlay drawn over the terminal inside the same webview (tree HTML from `src/views/pendingTree.ts`, shared with `agentChangesPanel`) — never hide the terminal view with a `when` clause for this, since that disposes the webview. PTY sessions live in one `TerminalSessionStore` (`terminalSessions.ts`, created in extension.ts) shared by the side bar provider and the Agent mode panel provider, so shells survive Agent mode toggles (the side bar view is removed by its `when` clause in Agent mode, which disposes its webview); each session mirrors its screen in an `@xterm/headless` terminal, and a newly attached webview's `ready` is answered with `restoreSessions` (serialized via `@xterm/addon-serialize`) instead of spawning a new shell. `ptySession.ts` wraps node-pty, and on Windows each spawned shell gets its environment rebuilt from the registry by `freshEnv.ts` (since `process.env` is a startup snapshot); `fontInstaller.ts` handles terminal fonts; `terminalHtml.ts` / `terminalTypes.ts` hold the webview shell and settings types.

### UI composition

- `src/terminal/terminalPanel.ts` — terminal + built-in runner status + pending files (Secondary Side Bar).
- `src/views/agentChangesPanel.ts` — "Changes" webview (`ai-cli-diff-view.agentChanges`): pending files as a folder tree with diff stats; shown only in agent mode.
- `src/views/navBarPanel.ts` — pending-diff nav bar webview (`ai-cli-diff-view.navBar`), declared in `package.json`.
- `src/views/diffActionPanel.ts` — diff action controls.

Pending-file navigation logic lives in `src/diff/navigationManager.ts`, reachable via the `prevFile`/`nextFile` commands and their `Alt+H`/`Alt+L` keybindings. The `ai-cli-diff-view.hasPendingDiff` context key that gates those keybindings is kept in sync by `updatePendingContext` in `extension.ts` via `DiffManager.onDidChangeDiffs` and tab-change events.

### Agent mode (`toggleAgentMode`)

`enterAgentMode()` / `exitAgentMode()` in `extension.ts` (flag `agentModeActive`, context key `ai-cli-diff-view.agentModeActive`) turn the terminal into a central editor-area panel (`agentModeTerminal`) and hide the other editor tabs. Consequences that span files:

- `WorkspaceWatcher` is constructed with a `() => !agentModeActive` callback, so its behavior depends on this flag.
- `autoRouteTab` re-routes tabs into the **in-panel preview** (diff / aggregate diff / file preview) instead of opening editor tabs, so the terminal keeps focus. Files the user explicitly sent to a side editor are exempted via `src/preview/openBeside.ts`.
- Preview renderers live in `res/webview/preview/` (code, markdown, image/svg, csv/tsv, mermaid; heavy libs lazy-loaded via `libs.js`), kind detection in `src/preview/previewKind.ts`, aggregate diff in `res/webview/aggregateDiff.js`. Webview↔extension messages are typed in `src/terminal/terminalTypes.ts`. Design notes: `docs/DESIGN_AGENT_MODE_LAYOUT.md`, `docs/PREVIEW_MODULE.md` (Vietnamese; its "Hiện trạng" section describes a removed `filePreview.js`).

### Configurable text-file detection

`refreshTextFileRules()` / `isTextFile(absPath)` in `src/watcher/fileTypeRules.ts` decide which files are reviewable. `isTextFile` takes the **absolute path**: `includedPaths` (`.gitignore` syntax, compiled with the `ignore` package) is matched on the path relative to its workspace folder via `splitByWorkspaceFolder` from `pathExclusions.ts`. Order: a `!pattern` match → not tracked (even built-in types); an include match → tracked; otherwise the built-in extension/filename lists, which `supportedFileDetectionMode: customOnly` empties. Exclusions (`isExcludedPathSegment`) are checked separately and always win. The three deprecated settings (`supportedFileExtensions`, `supportedFilenames`, `supportedFilenamePatterns`) are still read and converted to patterns (`.prisma` → `*.prisma`); `migrateLegacyTextFileSettings()` moves their Global values into `includedPaths` once on activation. Changing any of them calls `refreshTextFileRules()` and `WorkspaceWatcher.rebuildBaselineAfterRuleChange()` (a newly included file must get a baseline, else Revert all would delete it). Content with a NUL byte in the first 8 KB (`looksBinary`) is never baselined or diffed, since a broad include pattern can match binaries.

### Important implementation constraints

- Line endings: **LF in the middle, EOL at the boundary** (`src/diff/eol.ts`). Everything fed to `calculateHunks()` and posted to the webview has been through `toLf()`; only the points that write back to the document/disk call `fromLf()` with the file's detected EOL. Skipping this makes every line differ by a trailing `\r` and the diff shows the whole file replaced (bug #15, `docs/BUG_ISSUE_15_FULL_FILE_DIFF.md`).
- Agent bursts can touch hundreds or thousands of files (perf issue #37, `docs/PERF_ISSUE_37_CHECKLIST.md`, `docs/PERF_HOTSPOTS_SWIMLANE.md`). Per-event work must be batched: UI refreshes (Pending Files, nav bar, Changes panel, aggregate preview, `.gitignore` changes) go through `coalesce()` in `src/util/coalesce.ts` (trailing debounce with a max wait), and snapshot persistence on burst paths uses `DiffManager`'s coalesced `scheduleSave()` — user actions keep `saveNow()`, and `flushPendingSave()` runs on deactivate. Don't add an unbatched per-file save or postMessage in a watcher path.
- Deleting a tracked file or folder untracks it entirely (baseline, held write, pending diff and its tab), but only after `DELETE_SETTLE_MS` and a re-check in `WorkspaceWatcher.handleExternalDelete()` — many tools write via unlink + recreate, and untracking immediately would make the rewrite look brand new (Revert all would then delete it).
- Info/warning toasts use `notify()` (`src/util/notify.ts`), which auto-closes after 2 s and has no buttons; errors stay on `showErrorMessage`.
- Path normalization is load-bearing: paths go through `vscode.Uri.file(...).fsPath` and are lowercased on Windows before comparison. `canonicalCasePath` (via `fs.realpathSync.native`) is used when calling VS Code APIs so tab titles show the on-disk case.
- Snapshot persistence is designed to survive restarts; changes to snapshot shape or cleanup affect restore logic as well as live diffing.
- Built-in session launch is Claude-only; Codex/Qwen (and Claude, when not run via `startSession`) edits are reviewed through the workspace watcher.

## Settings (contributed configuration)

| Setting | Purpose |
| --- | --- |
| `ai-cli-diff-view.supportedFileDetectionMode` | `defaultAndCustom` (default: built-in list + `includedPaths`) or `customOnly` (`includedPaths` only) |
| `ai-cli-diff-view.includedPaths` | Extra files to track, in `.gitignore` syntax relative to the workspace folder: `*.prisma`, `Jenkinsfile`, `templates/**/*.tpl`, `!*.lock` (stops tracking a built-in type). Excluded paths / `.gitignore` still win |
| `ai-cli-diff-view.supportedFileExtensions` / `supportedFilenames` / `supportedFilenamePatterns` | Deprecated — still read and converted to `includedPaths` patterns; Global values are migrated into `includedPaths` on activation |
| `ai-cli-diff-view.maxFileLines` | Advanced: ignore files above this many lines — no baseline, no diff (default 5000; `0` disables). Enforced in `src/watcher/fileSizeLimit.ts`, applied by `baselineScanner` and both write paths in `workspaceWatcher`. Skipped files are recorded in `BaselineStore.sizeSkipped` so that one later dropping below the limit is not mistaken for a brand-new file (which would make Revert all delete it) |
| `ai-cli-diff-view.maxAutoOpenDiffs` | Advanced: most diff tabs opened automatically for AI edits (default 50; `0` disables). Enforced by `AutoOpenQueue`; only watcher auto-opens are capped — user-initiated opens (Pending Files click, Alt+H/L, next file after accept, `autoRouteTab`) and the built-in runner are not |
| `ai-cli-diff-view.excludedPaths` | Extra paths to ignore, in `.gitignore` syntax (parsed by the `ignore` package): `generated` at any depth, `/generated` root only, `generated/` folders only, `*.log`, `src/gen/**`, `!keep.log`. Only adds to the built-in list in `pathExclusions.ts`. Both are matched on the path **relative to its workspace folder**, so a repo cloned under e.g. `D:\build\` or `~/src/` is not excluded wholesale. Changing it calls `refreshPathExclusions()` and `WorkspaceWatcher.rebuildBaselineAfterRuleChange()`, which rescans only files without a baseline (a newly un-excluded file would otherwise look brand new and Revert all would delete it) — deliberately not `notifyExternalBatch()`, which would drop burst-held AI writes |
| `ai-cli-diff-view.respectGitignore` | Skip files ignored by git (default on): `isGitIgnored` in `pathExclusions.ts` applies every `.gitignore` from the innermost repo root containing the workspace folder down to the file's folder, plus `.git/info/exclude`; a nested repo starts over with its own rules. Rules are cached per folder — a `**/.gitignore` watcher in `extension.ts` clears the cache and calls `rebuildBaselineAfterRuleChange()`, as does toggling the setting. Global `core.excludesFile` is not read |
| `ai-cli-diff-view.baselineScanConcurrency` | Advanced: maximum number of files read concurrently during the initial baseline scan (default 4, range 1–16). Lower it for large or remote workspaces to reduce I/O and memory pressure. |
| `ai-cli-diff-view.burstDetectionEnabled` | Advanced: hold files beyond the burst threshold to confirm a git branch change before opening their diff, instead of opening immediately (see `docs/GIT_VS_AI_EDIT_DETECTION.md`) |
| `ai-cli-diff-view.burstDetectionWindowMs` | Advanced: sliding window (ms) used to count file changes for burst detection (default 300) |
| `ai-cli-diff-view.burstDetectionThreshold` | Advanced: number of distinct files changed within the window that counts as a burst (default 8) |
| `ai-cli-diff-view.burstDetectionHoldMs` | Advanced: how long (ms) to hold burst-threshold-exceeding files before opening their diff if no git branch change is confirmed (default 2000) |
| `ai-cli-diff-view.soundNotificationsEnabled` | Play a sound when Claude finishes a turn or needs input (Windows only, default off) — unrelated to diff detection |

The four burst-detection settings, `maxFileLines`, `maxAutoOpenDiffs`, `includedPaths`, `excludedPaths`, `respectGitignore`, and the sound-notification toggle are all also editable via the terminal panel's Settings popover (`src/terminal/terminalHtml.ts`) — burst detection, `maxAutoOpenDiffs` and `maxFileLines` under "Advanced"; sound notifications and the two New/Edit/Delete tables ("Included files", "Excluded paths", both built by the webview's `createListEditor` and parsed by `parsePatterns`) in the general section — backed by the same `ai-cli-diff-view.*` configuration, not a separate storage. `.git/index`-based early confirmation is a known gap — the hold mechanism currently relies solely on `GitBranchWatcher`'s existing `HEAD`-change confirmation (see `docs/GIT_VS_AI_EDIT_DETECTION.md`).

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
