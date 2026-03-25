# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Extension Does

A VSCode extension that integrates with Claude CLI and Qwen CLI to display **inline diffs** of AI-made file changes, with per-hunk Accept/Revert actions via CodeLens buttons — no diff editor tab, all rendered directly in the editor.

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
- Creates `DiffManager`, `HunkCodeLensProvider`, `HookWatcher`, `WorkspaceWatcher`, `SessionTreeProvider`
- `IAiRunner` is **lazy-initialized** on first "Start Session" via `RunnerFactory`; auto-detects Claude or Qwen CLI
- Registers all commands and status bar items (Idle/Running/Accept All/Revert All/Install Hooks)

### Diff Flow

```
1. AI runner detects file-edit tool call → diffManager.snapshotBefore(filePath)
2. CLI tool runs, modifying the file on disk
3. Tool result event received → diffManager.openDiff(filePath)
4. InlineDiffRenderer.show() computes hunks via LCS (hunkCalculator.ts)
5. Decorations applied to editor: green bg for added lines, red/strikethrough for removed
6. HunkCodeLensProvider renders Accept/Revert buttons above each hunk
7. User accepts/reverts hunks; all accepted → snapshot cleared
```

### AI Runner Plugin Pattern

```
IAiRunner (interface)
  ├── ClaudeRunner  — parses NDJSON from `claude --output-format stream-json`
  └── QwenRunner    — parses NDJSON from `qwen --output-format stream-json`
```

Both parse `assistant` events (file-edit tool calls) and `tool` events (completion signal). `RunnerFactory` auto-detects which CLIs are installed.

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
| `src/diff/diffManager.ts` | Central state: snapshots map, pending hunks, accept/revert API, VS Code workspace state persistence; owns `InlineDiffRenderer` as `.renderer` |
| `src/diff/inlineDiffRenderer.ts` | Renders decorations (green/red backgrounds, ghost strikethrough text) using `TextEditorDecorationType`; opened via VSCode diff editor |
| `src/diff/hunkCalculator.ts` | LCS-based line diff, groups consecutive changes into `Hunk` objects |
| `src/diff/hunkCodeLensProvider.ts` | CodeLens provider placing Accept/Revert buttons at hunk start lines |
| `src/views/sessionTreeProvider.ts` | Sidebar tree: running status, current prompt, modified files list |
| `src/views/diffActionPanel.ts` | Webview panel showing Accept/Reject file buttons with file counter; sends messages back to extension |
| `src/claude/claudeRunner.ts` | Parses NDJSON from `claude --output-format stream-json` |
| `src/claude/qwenRunner.ts` | Parses NDJSON from `qwen --output-format stream-json` |
| `src/claude/runnerFactory.ts` | Auto-detects installed CLIs; prompts user if both are present |

### State Persistence

Snapshot content is persisted in VS Code workspace state so diffs survive editor restart. Snapshot files on disk (under `%TEMP%`) are used during hook-based flow and cleaned up after acceptance.

## Registered Commands

| Command | Keybinding | Purpose |
|---------|-----------|---------|
| `claude-diff-view.startSession` | Ctrl+Shift+A | Start AI session with prompt |
| `claude-diff-view.acceptAllHunks` | Ctrl+Shift+Y | Accept all changes in active file |
| `claude-diff-view.revertAllHunks` | Ctrl+Shift+Z | Revert all changes in active file |
| `claude-diff-view.acceptHunk` | CodeLens | Accept single hunk |
| `claude-diff-view.revertHunk` | CodeLens | Revert single hunk |
| `claude-diff-view.installHooks` | Menu | Write hook config to `~/.claude/settings.json` or `~/.qwen/settings.json` |

Context key `claude-diff-view.hasPendingDiff` controls editor title menu visibility (Accept All / Revert All buttons).
