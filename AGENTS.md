# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the VS Code extension code. Key areas are `commands/` for command registration, `diff/` for inline diff rendering and hunk logic, `watcher/` for file and hook monitoring, `runner/` for AI CLI integration, `terminal/` for the embedded xterm/PTY UI, and `views/` for webview panels. The extension entry point is `src/extension.ts`. Static assets live in `media/`, hook scripts in `hooks/`, and manual smoke-test files in `code_to_test/`. Build output is written to `out/`; do not edit it by hand.

## Build, Test, and Development Commands
- `npm install` installs dependencies.
- `npm run compile` runs the TypeScript build and writes JavaScript to `out/`.
- `npm run watch` keeps TypeScript rebuilding during development.
- `F5` in VS Code launches the Extension Development Host.
- `npx @vscode/vsce package` creates a `.vsix` package for local install or release.

There is no dedicated automated test runner in `package.json`. Use `npm run compile` as the minimum correctness check, then validate the extension manually in the Extension Development Host.

## Coding Style & Naming Conventions
Use strict TypeScript, CommonJS modules, ES2020 target, 2-space indentation, semicolons, and single quotes. Keep names descriptive: `PascalCase` for classes and providers, `camelCase` for functions and variables, and `kebab-case` for asset filenames. Match the existing style in surrounding files rather than introducing new patterns.

## Testing Guidelines
No formal unit test framework is configured. When changing behavior, validate against files in `code_to_test/` and verify inline diff rendering, accept/revert actions, navigation commands, and hook detection flows. If a change affects terminal or hook behavior, test both the built-in runner path and external edit detection.

## Commit & Pull Request Guidelines
Recent commits use short imperative subjects such as `fix bug`, `focus`, and `bump version to 2.0.4`. Keep commit messages brief and action-oriented. Pull requests should explain what changed, how it was verified, and include screenshots or GIFs for UI changes when relevant.

## Security & Configuration Tips
Do not commit secrets, `.env*` files, `out/`, or `.vsix` artifacts. Keep hook paths workspace-safe and avoid hardcoded user-specific directories. The hook scripts in `hooks/` should continue to exit successfully so they never block AI CLI execution.
