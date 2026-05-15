# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the VS Code extension source. Feature directories: `commands/` (command registration), `diff/` (inline diff rendering and navigation), `watcher/` (file and hook monitoring), `claude/` (CLI runner integration), `views/` (webview panels). Entry point is `src/extension.ts`. Hook scripts live in `hooks/`, UI assets in `media/`, smoke-test files in `code_to_test/`. Generated output goes to `out/` — do not edit by hand.

## Build, Test, and Development Commands
- `npm install` — install dependencies (once)
- `npm run compile` — build TypeScript into `out/`
- `npm run watch` — incremental rebuild during development
- `F5` in VS Code — launch Extension Development Host
- `npx @vscode/vsce package` — create `.vsix` for install/release

No linter or formatter is configured. Use `npm run compile` as the minimum correctness check.

## Architecture Notes
- Activation event: `onStartupFinished` — extension activates on every VS Code start.
- On activate, the extension auto-enables `diffEditor.codeLens` globally so Accept/Revert buttons appear in diff editor panes.
- Hook mechanism: `hooks/pre-tool-hook.js` snapshots files before edits; `hooks/post-tool-hook.js` writes signal files to `os.tmpdir()/ai-cli-diff-signals/`. The extension's `HookWatcher` polls for these signals. Hooks always exit 0 to never block Claude.
- Navigation keybindings: `alt+h` / `alt+l` (prev/next file) only when `ai-cli-diff-view.hasPendingDiff` context is true.
- Two webview views: `ai-cli-diff-view.session` (sidebar session panel) and `ai-cli-diff-view.navBar` (explorer nav bar).

## Coding Style
Strict TypeScript, CommonJS modules, target ES2020. 2-space indentation, semicolons, single quotes. `PascalCase` for classes/providers, `camelCase` for functions/variables, `kebab-case` for asset filenames. Match surrounding code.

## Testing
No automated test suite. Validate with `npm run compile` then `F5`. Test against files in `code_to_test/`. Verify: inline diff rendering, accept/revert actions, navigation commands, hook install/detection flows.

## Commits & PRs
Short imperative subjects (e.g. `fix diff tab reopening`). PRs should include summary, manual test notes, and screenshots/GIFs for UI changes.

## Security
Do not commit secrets, `.env*` files, `out/`, `.vsix` artifacts, or `.claude/` state. Keep hook paths workspace-safe — no hardcoded user-specific directories.
