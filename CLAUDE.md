# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Extension Does

A VSCode extension that integrates with Claude CLI to display diffs of AI-made file changes using VSCode's built-in diff editor, with per-hunk Accept/Revert actions via CodeLens buttons.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run compile      # Compile TypeScript once (outputs to ./out/)
npm run watch        # Watch mode for development
```

**Dev workflow:** Run `npm run watch`, then press F5 in VSCode to launch Extension Development Host. TypeScript changes auto-recompile; reload the extension host to pick them up.

No lint or test scripts are configured.

## Architecture

### Entry Point & Wiring

`src/extension.ts` activates on `onStartupFinished` and wires up all components:
- Creates `DiffManager`, `SessionPanelProvider`, `WorkspaceWatcher`, `HookWatcher`, `NavigationManager`, `NavBarPanel`
- Registers `HunkCodeLensProvider` for `{ scheme: 'file' }` documents
- Registers an `onDidChangeActiveTextEditor` listener that re-opens the diff view when the user navigates to a file that still has pending hunks
- Runner is initialized **lazily** on first "Start Session" invocation via `RunnerFactory`

### Diff Flow

```
1. AI runner detects file-edit tool call → diffManager.snapshotBefore(filePath)
2. CLI tool runs, modifying the file on disk
3. Tool result event received → diffManager.openDiff(filePath)
4. openDiff calls vscode.diff (originalUri scheme='claude-diff', modifiedUri scheme='file')
   → opens VSCode built-in diff editor tab titled "Claude Diff: <filename>"
5. renderer.show() computes hunks via LCS (hunkCalculator.ts) and stores them in fileStates
6. HunkCodeLensProvider renders Accept/Revert buttons (only visible when diffEditor.codeLens=true
   or when the file is opened in a normal editor)
7. User accepts/reverts hunks; when all done → cleanup() closes the diff tab, reopens normal editor
```

### Critical Design Detail: Diff Editor vs Normal Editor

`openDiff` uses `vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title)` which opens VSCode's built-in two-column diff editor. The original (left) pane uses `scheme: 'claude-diff'` served by a `TextDocumentContentProvider` that reads from the in-memory snapshots map. The modified (right) pane is the real file on disk.

**CodeLens limitation**: `HunkCodeLensProvider` is registered for `{ scheme: 'file' }`. VSCode suppresses CodeLens in diff editors by default — `diffEditor.codeLens` must be `true` in user settings for buttons to appear. `inlineDiffRenderer.isEditorInDiffView()` detects diff-view editors and suppresses decorations there (decorations only show in normal editors).

### Accept Hunk Flow (per-hunk, not whole-file)

`diffManager.acceptHunk()` patches the **in-memory snapshot** (not the file) with the accepted hunk content, then fires `contentProviderEventEmitter` to refresh the left (original) pane of the diff editor. This makes the diff shrink as hunks are accepted. When the last hunk is accepted, `cleanup()` is called automatically.

### AI Runner Plugin Pattern

```
IAiRunner (interface)
  └── ClaudeRunner  — parses NDJSON from `claude --output-format stream-json`
```

Parses `assistant` events (file-edit tool calls) and `tool` events (completion signal). `RunnerFactory` auto-detects the CLI.

### Two-Channel File Monitoring

**HookWatcher** (`src/watcher/hookWatcher.ts`) — Primary path for CLI-invoked edits:
- Pre-hook (`hooks/pre-tool-hook.js`): saves snapshot to `%TEMP%/claude-diff-snapshots/<hash>`
- Post-hook (`hooks/post-tool-hook.js`): writes signal JSON to `%TEMP%/claude-diff-signals/`
- Extension watches the signals directory (150ms delay for write completion)

**WorkspaceWatcher** (`src/watcher/workspaceWatcher.ts`) — Fallback for terminal/editor saves:
- VSCode `onDidSaveTextDocument` → re-applies decorations
- Debounced `fs.watch` on workspace folders (500ms) for external writes

### Key Modules

| Module | Role |
|--------|------|
| `src/diff/diffManager.ts` | Central state: snapshots map, pending hunks, accept/revert API, VS Code workspace state persistence. Owns the `claude-diff` TextDocumentContentProvider. |
| `src/diff/inlineDiffRenderer.ts` | Per-file diff state (`fileStates` map). Delegates decoration painting to `DecorationManager`. Detects diff-view editors to suppress decorations. |
| `src/diff/decorationManager.ts` | Owns all `TextEditorDecorationType` objects; applies green/red backgrounds and ghost strikethrough text |
| `src/diff/hunkCalculator.ts` | LCS-based line diff, groups consecutive changes into `Hunk` objects |
| `src/diff/hunkCodeLensProvider.ts` | CodeLens provider placing Accept/Revert buttons at hunk start lines (scheme: 'file' only) |
| `src/diff/navigationManager.ts` | Navigates between files with pending diffs; computes `NavInfo` for the nav bar |
| `src/commands/commandsRegistry.ts` | Registers all extension commands |
| `src/views/sessionPanel.ts` | Sidebar WebviewView: hook status, pending file tree, Install Hooks button |
| `src/views/navBarPanel.ts` | Sidebar WebviewView: Accept File / Reject File / Accept All Changes / prev-next navigation buttons |
| `src/views/diffActionPanel.ts` | Legacy WebviewView panel (file-level Accept/Reject) |
| `src/watcher/fileSnapshotStore.ts` | Reads/writes snapshot files under `%TEMP%/claude-diff-snapshots/` used by hook-based flow |

### State Persistence

Snapshot content (original file text before Claude's edit) is stored in:
1. `diffManager.snapshots` map (in memory)
2. VS Code workspace state under key `claude-diff.snapshots` (survives editor restart)
3. Snapshot files on disk under `%TEMP%/claude-diff-snapshots/` (hook-based flow only, cleaned up after acceptance)

Path normalization: all paths are lowercased on Windows via `vscode.Uri.file(path.resolve(p)).fsPath` to ensure consistent map keys.

## Registered Commands

| Command | Keybinding | Purpose |
|---------|-----------|---------|
| `claude-diff-view.startSession` | Ctrl+Shift+A | Start AI session with prompt |
| `claude-diff-view.acceptAllHunks` | Ctrl+Shift+Y | Accept all hunks in active file (keeps snapshot, patches per-hunk) |
| `claude-diff-view.acceptAllChanges` | — | Accept all changes across all pending files |
| `claude-diff-view.revertAllHunks` | Ctrl+Shift+Z | Revert all changes in active file to original snapshot |
| `claude-diff-view.acceptHunk` | CodeLens | Accept single hunk |
| `claude-diff-view.revertHunk` | CodeLens | Revert single hunk |
| `claude-diff-view.nextFile` | Alt+L | Navigate to next file with pending diff |
| `claude-diff-view.prevFile` | Alt+H | Navigate to previous file with pending diff |
| `claude-diff-view.installHooks` | Menu | Write hook config to `~/.claude/settings.json` |

Context key `claude-diff-view.hasPendingDiff` controls editor title menu visibility.
