# AI CLI diff view

VS Code extension for reviewing AI-generated file edits as inline diffs inside the editor.

Best supported workflows: **Claude**, **Codex**, and **Qwen**.

Current integration details:
- Built-in session launch and hook install currently target **Claude Code**.
- Workspace file watching still lets you review external edits coming from other AI CLIs.

## Usage
1. If you use Claude Code, click `Install Claude CLI Hooks` in the sidebar.
2. Run your AI CLI workflow in the terminal.
3. Review pending diffs directly inside VS Code.

## Positioning
- `Claude`: strongest built-in integration today.
- `Codex`: works well through external file-change monitoring.
- `Qwen`: works well through external file-change monitoring.

---

<img width="1917" height="965" alt="Screenshot 2026-03-29 160654" src="https://github.com/user-attachments/assets/d8c894fe-d4b6-4f17-bbdc-7274f849830a" />

---

<img width="1919" height="987" alt="Screenshot 2026-03-29 160727" src="https://github.com/user-attachments/assets/a0305d90-2f11-4ecf-8f90-ac88c7c0916d" />
