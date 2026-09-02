# Repository Guidelines

## Purpose

AI CLI Diff View is a VS Code extension that detects file edits made by AI CLI
tools and presents them as reviewable inline Monaco diffs. Claude, Codex, Qwen,
and other tools are detected through workspace file events; the built-in
session launcher is Claude-specific.

## Project Structure

- `src/extension.ts` — extension activation and service wiring.
- `src/commands/` — command registration and sound-notification settings.
- `src/diff/` — diff state, snapshots, hunk calculation, navigation, and the
  Monaco custom-editor webview.
- `src/runner/` — AI runner interface and the built-in Claude runner.
- `src/terminal/` — embedded xterm/node-pty terminal and pending-file UI.
- `src/views/` — auxiliary webview panels such as the pending-diff nav bar.
- `src/watcher/` — workspace writes, baseline scanning, file rules, size
  limits, burst detection, and Git branch-operation detection.
- `res/webview/` — Monaco diff JavaScript and CSS loaded by the custom editor.
- `media/` — icons, screenshots, and webview assets.
- `code_to_test/` — manual smoke-test fixtures.
- `docs/` — architecture notes and regression-test reports.
- `out/` — generated TypeScript output; never edit by hand.

## Build and Test

```bash
npm install
npm run compile
npm run watch
npx @vscode/vsce package
```

There is no configured linter, formatter, or automated test runner. Run
`npm run compile` after code changes, then press `F5` to launch the Extension
Development Host for manual checks. Use files in `code_to_test/` to verify
external edits, inline diff rendering, hunk accept/revert, pending-file
navigation, branch changes, and terminal behavior.

`node-pty` is a native dependency. If the terminal fails because of an Electron
ABI mismatch, rebuild it with the installed `@electron/rebuild` dependency.

## Runtime Architecture

The extension activates on `onStartupFinished`. `extension.ts` creates and
connects `DiffManager`, `WorkspaceWatcher`, `GitBranchWatcher`,
`NavigationManager`, `DiffEditorProvider`, `TerminalPanelProvider`, and
`NavBarPanel`, then registers commands and keybindings.

### Diff editor

Diffs use the custom editor `ai-cli-diff-view.diffEditor`, not VS Code's native
diff editor. Each pending file gets a Monaco `DiffEditor` in its own webview
tab. The left side is the before-image stored by `DiffManager`; the right side
is the current file content.

`DiffManager` owns pending snapshots, open panels, cursor state, persistence,
and file-level accept/revert operations. Snapshots are persisted in VS Code
workspace state under `ai-cli-diff.snapshots`, so changes to snapshot shape or
cleanup must preserve restore compatibility.

Hunk-level actions are sent between the webview and extension with
`postMessage`. Accepting a hunk advances the in-memory baseline; reverting a
hunk writes the original content back to disk. Keep this intentional asymmetry
when changing diff behavior. `hunkCalculator.ts` and
`res/webview/diff.monaco.js` also distinguish render sub-hunks from grouped
action blocks, so changes to hunk grouping require checking both rendering and
accept/revert behavior.

### Workspace and baseline detection

`WorkspaceWatcher` combines `onDidSaveTextDocument` with a VS Code
`FileSystemWatcher('**/*')` so edits from any external AI CLI can be detected.
The initial `BaselineScanner` recursively reads eligible files in each
workspace folder and stores them in `BaselineStore`. This deep scan is required
for files nested beyond shallow snapshot limits and prevents issue #20's
whole-file false additions.

The watcher must also handle:

- text-file rules from `fileTypeRules.ts`;
- excluded path segments from `pathExclusions.ts`;
- line and byte limits from `fileSizeLimit.ts`;
- edits arriving while the initial baseline scan is still running;
- VS Code's own save event without creating a duplicate diff;
- burst writes from Git operations without losing genuine AI edits.

`WriteBurstMeter` holds files that exceed the burst threshold briefly. If
`GitBranchWatcher` confirms a Git batch operation during that window, held
writes are discarded and the baseline is rebuilt; otherwise the files open as
normal diffs after the hold expires.

### Git operations

`GitBranchWatcher` watches `.git/HEAD`, including worktree `gitdir:` indirection.
A real HEAD change clears stale pending diffs and rebuilds the baseline so files
from different branches are not compared. Same-branch `pull`, `merge`,
`rebase`, and `reset` are detected through `.git/logs/HEAD` reflog entries and
only resolve burst-held writes; they must not clear unrelated pending diffs.

The current early-confirmation gap is `.git/index`/`index.lock` monitoring.
Do not claim it is implemented unless the watcher is actually extended.

### Webviews and terminal

- `ai-cli-diff-view.terminal` provides the embedded terminal, session status,
  settings, and pending-file list. It is moved to the Secondary Side Bar once
  per user installation.
- `ai-cli-diff-view.navBar` provides the auxiliary pending-diff navigation
  panel.
- `res/webview/diff.monaco.js` and `diff.monaco.css` render the custom diff.

Navigation commands are `Alt+H` and `Alt+L`, gated by the
`ai-cli-diff-view.hasPendingDiff` context key. A pending plain-text tab is
automatically routed back to the custom diff editor.

Claude sound notifications are unrelated to diff detection. When enabled on
Windows, `soundNotifications.ts` updates only the `Notification` and `Stop`
entries in `~/.claude/settings.json` and preserves other settings.

## Configuration

Contributed settings are defined in `package.json`:

- `supportedFileDetectionMode`, `supportedFileExtensions`,
  `supportedFilenames`, and `supportedFilenamePatterns` control reviewable
  text files.
- `maxFileLines` skips files that are too large for safe diffing; `0` disables
  the limit.
- `baselineScanConcurrency` controls initial scan concurrency.
- `burstDetectionEnabled`, `burstDetectionWindowMs`,
  `burstDetectionThreshold`, and `burstDetectionHoldMs` control Git/batch-write
  protection.
- `soundNotificationsEnabled` controls the optional Windows Claude sounds.

When changing a setting, update its configuration listener and any terminal
settings UI that exposes it. Keep defaults and descriptions synchronized with
the implementation.

## Coding Conventions

Use strict TypeScript with CommonJS modules and an ES2020 target. Follow the
existing style: two-space indentation, semicolons, single quotes,
`PascalCase` for classes/providers, `camelCase` for functions and variables,
and `kebab-case` for asset filenames. Prefer small, explicit changes and keep
path normalization consistent across watcher, snapshot, and VS Code APIs.

## Repository Safety

- Do not edit generated `out/` files manually.
- Do not commit secrets, `.env*` files, `.claude/` state, or generated `.vsix`
  artifacts.
- Keep filesystem paths workspace-safe; never hardcode a developer's home
  directory.
- Preserve unrelated working-tree changes.
- For UI changes, include manual test notes and a screenshot or GIF in the PR.
- Use short imperative commit subjects. When work addresses an issue, include
  its GitHub reference in the commit subject or body, for example `#20`, so
  GitHub links the commit to that issue.
