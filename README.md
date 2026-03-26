# Claude Diff View (VS Code Extension)

Run Claude CLI/Claude Code sessions and review AI-made file edits as **inline diffs** directly inside your editor.

## Features

- Inline diff rendering (no diff editor tab)
- Per-hunk **Accept / Revert** via CodeLens
- File-level **Accept All / Revert All**
- Navigation between modified files
- Optional hook-based workflow to capture CLI edits reliably

## Quick start

1. Install the extension.
2. Run **Claude: Start Session** (default: `Ctrl+Shift+A`).
3. When files change, review hunks in-place and accept/revert.

## Commands

- **Claude: Start Session** (`claude-diff-view.startSession`)
- **Claude: Accept All Changes** (`claude-diff-view.acceptAllHunks`)
- **Claude: Revert All Changes** (`claude-diff-view.revertAllHunks`)
- **Claude: Next Edited File** (`claude-diff-view.nextFile`)
- **Claude: Previous Edited File** (`claude-diff-view.prevFile`)
- **Claude: Install CLI Hooks (enable diff for terminal claude)** (`claude-diff-view.installHooks`)

## Development

```bash
npm install
npm run watch
```

Press `F5` in VS Code to launch the Extension Development Host.

