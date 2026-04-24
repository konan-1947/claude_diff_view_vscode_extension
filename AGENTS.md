# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the VS Code extension source. Keep code grouped by feature: `commands/` for command registration, `diff/` for inline diff rendering and navigation, `watcher/` for file and hook monitoring, `claude/` for CLI runner integration, and `views/` for webview panels. The extension entry point is `src/extension.ts`. Hook scripts live in `hooks/`, UI assets in `media/`, and local smoke-test files in `code_to_test/`. Generated output goes to `out/` and should not be edited by hand.

## Build, Test, and Development Commands
Run `npm install` once to install dependencies. Use `npm run compile` to build TypeScript into `out/`. Use `npm run watch` during development for incremental rebuilds. Press `F5` in VS Code to open an Extension Development Host and exercise the extension manually. Use `npx @vscode/vsce package` to create a `.vsix` package for install or release checks.

## Coding Style & Naming Conventions
This project uses strict TypeScript. Follow the existing style: 2-space indentation, semicolons, single quotes, and small feature-oriented modules. Use `PascalCase` for classes and providers, `camelCase` for functions and variables, and `kebab-case` for asset filenames. No formatter or linter is configured here, so keep changes consistent with surrounding code and use `npm run compile` as the minimum correctness check.

## Testing Guidelines
There is no automated test suite in the repository yet. Validate changes by running `npm run compile`, then launch the extension with `F5` and test against files in `code_to_test/`. For behavior changes, verify inline diff rendering, accept/revert actions, navigation commands, and Claude hook installation or detection flows. Include manual reproduction and validation steps in your pull request notes.

## Commit & Pull Request Guidelines
Recent history uses short subjects such as `Update README.md` and `readme`. Keep commit messages concise, imperative, and specific, for example `fix diff tab reopening` or `add hook install detection`. Pull requests should include a short summary, linked issue when applicable, manual test notes, and screenshots or GIFs for editor or webview UI changes.

## Security & Configuration Tips
Do not commit secrets, local `.env*` files, generated `out/`, packaged `.vsix` artifacts, or personal state under `.claude/`. If you change hook behavior, keep paths workspace-safe and avoid hardcoded user-specific directories.
