# AI CLI Diff View

A VS Code extension for reviewing file changes made by AI CLI agents using inline diffs right inside the editor.

Ideal for workflows using Claude, Codex, or Qwen, where an AI agent edits files in your workspace and you want to review, accept, or revert changes without leaving VS Code.

## Features

![Accept or revert in side panel](media/introduce/image1.png)

*Accept or revert AI changes with a single click in the side panel.*

---

![Integrated terminal](media/introduce/image2.png)

*Run AI CLI agents directly in the extension's integrated terminal.*

---

![Real folder structure](media/introduce/image3.png)

*View changed files organized by your workspace's actual folder structure.*

---

![Review hunks in editor](media/introduce/image4.png)

*Review changes hunk-by-hunk directly in the editor.*

---

![Terminal settings](media/introduce/image5.png)

*Customize terminal font, theme, and cursor from the settings popover.*

## Usage

1. Open the `AI CLI` sidebar in VS Code.
2. Click `Install Claude CLI Hooks` to connect Claude Code with the extension. Hooks only apply to Claude — other CLIs (Codex, Qwen, …) are reviewed automatically via the workspace watcher, no hook needed.
3. Run an AI CLI agent in the integrated terminal or an external terminal.
4. View pending diffs in VS Code.
5. Accept or revert changes per hunk, per file, or all pending changes at once.

## Commands

- `AI CLI Diff: Start Claude Session`
- `AI CLI Diff: Install Claude CLI Hooks`
- `AI CLI Diff: Accept All Changes`
- `AI CLI Diff: Accept All Changes (All Files)`
- `AI CLI Diff: Revert All Changes`
- `AI CLI Diff: Open Pending File`
- `AI CLI Diff: Previous Edited File`
- `AI CLI Diff: Next Edited File`

## Keybindings

- `Ctrl+Shift+A` / `Cmd+Shift+A` on macOS: Start a Claude session.
- `Ctrl+Shift+Y` / `Cmd+Shift+Y` on macOS: Accept all changes in the current diff.
- `Ctrl+Shift+Z` / `Cmd+Shift+Z` on macOS: Revert all changes in the current diff.
- `Alt+H`: Navigate to the previous edited file while pending diffs exist.
- `Alt+L`: Navigate to the next edited file while pending diffs exist.

## Development

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

Package the extension:

```bash
npx @vscode/vsce package
```

## License

MIT
