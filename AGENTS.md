# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the extension source. Keep code grouped by feature: `commands/` for command registration, `diff/` for inline diff logic, `watcher/` for filesystem and hook monitoring, `claude/` for runner integration, and `views/` for webview UI. `hooks/` holds the CLI hook scripts installed into Claude settings. `media/` contains icons used by the activity bar and actions. Use `code_to_test/` for local smoke-test files. Build output goes to `out/` and should not be edited by hand.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run compile`: compile TypeScript from `src/` into `out/`.
- `npm run watch`: recompile on change during development.
- `F5` in VS Code: launch the extension in an Extension Development Host using `.vscode/launch.json`.
- `npx @vscode/vsce package`: create a `.vsix` package for manual install or release validation.

## Coding Style & Naming Conventions
This project uses strict TypeScript (`"strict": true`). Follow the existing style: 2-space indentation, semicolons, single quotes, and explicit return types on exported functions where useful. Use `PascalCase` for classes/providers (`DiffManager`), `camelCase` for functions and variables, and `kebab-case` for asset filenames. Keep modules small and feature-oriented; prefer adding to an existing feature folder instead of creating generic utility files.

## Testing Guidelines
There is no automated test suite checked in yet. Treat `npm run compile` as the minimum validation gate. For behavior changes, run the extension with `F5`, exercise commands against files in `code_to_test/`, and verify inline diff rendering, accept/revert actions, and hook installation flows. When fixing regressions, document the manual reproduction steps in the PR.

## Commit & Pull Request Guidelines
Recent history uses short, change-focused subjects such as `Update README.md` and `readme`; keep that scope but make it clearer. Prefer imperative commit messages like `fix diff tab reopening` or `add hook settings detection`. PRs should include: a concise summary, linked issue if applicable, manual test notes, and screenshots or GIFs for UI changes in the editor or webviews.

## Security & Configuration Tips
Do not commit local secrets, `.env*`, generated `out/`, or personal `.claude/` state. If you change hook behavior, verify paths remain workspace-safe and avoid hardcoded user-specific directories.
