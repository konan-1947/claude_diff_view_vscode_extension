# Claude UI

Claude UI is a chat tab in the `AI CLI` panel, opened from the `+` button next to
the session tabs (**Claude UI**). The UI is the Vue app of **uic**, a copy of the
Claudix extension (AGPL-3.0, see `THIRD_PARTY_NOTICES.md`), taken over
unchanged except for the transport. It runs the Claude Agent SDK
headlessly: there is no PTY, no xterm and no TUI scraping.

## Requirements

- The `claude` CLI installed and signed in once. Resolution order
  (`src/claude/cliLocator.ts`):
  1. `ai-cli-diff-view.claudeCliPath`
  2. `claude` on `PATH`
  3. well-known install locations
  4. the SDK's bundled binary (development checkouts only; never shipped)
- Upstream's 69 MB `resources/claude-code` (CLI bundle + ripgrep) is **not** used.

## Layout

```
webview-ui/claude/          Vue app (uic src/webview), built by Vite
  src/transport/VSCodeTransport.ts   only file rewritten: talks to the parent frame
  vite.config.mts           single chunk, every asset inlined -> dist/claude-ui/{main.js,style.css}
src/claude/
  shared/messages.ts        protocol types, shared by host and webview (`@shared/messages`)
  di/, services/            uic host services (ClaudeAgentService, ClaudeSdkService, handlers, ...)
  services/webViewService.ts  rewritten: routes messages between agent and tabs
  claudeUi.ts               creates the backend (lazily starts the agent)
  cliLocator.ts, sdkLoader.ts
res/webview/claudeFrame.js  iframe host inside the terminal webview
res/claude/claude-code-settings.schema.json   defaults for the Settings page
```

## How a tab works

```
terminalHtml.ts (terminal webview)                         extension host
  tab kind 'claude'                                          terminalPanel.ts
    ClaudeFrame.create()  ── iframe srcdoc (uic app)          'claudeUi' msg ─▶ webViews.receive(tabId, msg)
      parent.postMessage({__claudeUi, message}) ─▶ vscode.postMessage({type:'claudeUi', id, message})
                                                             ClaudeAgentService (uic) ── SDK query() ──▶ claude CLI
      iframe.postMessage({type:'from-extension'}) ◀─ webview.postMessage({type:'claudeUi', id, payload})
```

- **Why an iframe**: the app's CSS is global (Tailwind preflight, `html`, `body`,
  `:root`). Inside an iframe it cannot restyle the terminal.
- **Loading**: `claudeFrame.js` fetches `dist/claude-ui/main.js` and
  `style.css` once and inlines them into `srcdoc` (scripts carry the webview
  nonce, which the srcdoc document inherits with the CSP). If the app does not
  report in within 5 s, the same document is retried as a `blob:` URL.
- **Theme**: VS Code only themes the top-level webview document, so
  `claudeFrame.js` copies the `--vscode-*` variables (inline style on `<html>`),
  the `vscode-*` body classes/attributes and `#_defaultStyles` into each iframe,
  and keeps them in sync with a `MutationObserver`.
- **Shortcuts**: VS Code listens for keydown on the webview window only.
  Modifier/F-key combos typed in the iframe that the app did not handle
  (`defaultPrevented`) are re-dispatched on the parent window; editing keys
  (Ctrl+C/V/X/Z/Y/A, arrows, Enter, …) stay in the chat.
- **Routing** (`webViewService.ts`): inbound messages are tagged
  `webviewId = tabId`. Outbound messages go to `webviewId`, else to the tab
  that sent `launch_claude` for that `channelId`, else to every tab (config
  broadcasts). Permission requests therefore reach only the tab that owns the
  channel.
- **Tab title / new tab**: `init` reports `openNewInTab: true`, so the app sends
  `rename_tab` and `new_conversation_tab`; `extension.ts` turns them into
  `TerminalSessionStore.setClaudeTitle()` / `createClaude()`.
- **Restore**: the store keeps only `{ title, sessionId }` per Claude tab
  (`sessionId` comes from the `session_id` of the SDK messages). When a webview
  is rebuilt (reload, Agent mode toggle) the iframe is recreated with
  `UIC_BOOTSTRAP.resume`, and the app reopens that conversation from
  `~/.claude/projects`. The running channel of a disposed webview is closed
  (`releaseTab`), so a turn in progress at that moment stops.
- **Diffs**: the SDK `PreToolUse` hook (`Edit|Write|MultiEdit|NotebookEdit`)
  calls `DiffManager.snapshotBefore()`, so the pending diff has the content
  from before the edit. Bash writes go through the normal `WorkspaceWatcher`.

## Changes to upstream uic

Kept as close to upstream as possible; the deliberate differences:

| Area | Change |
| --- | --- |
| Transport | `VSCodeTransport` posts to the parent frame instead of `acquireVsCodeApi()` |
| Bootstrap | `UIC_BOOTSTRAP` gains `id` (tab id) and `resume`; `useRuntime` reopens `resume` |
| `SessionStore` | `history.replaceState` is guarded (throws in an `about:srcdoc` iframe) |
| CLI | `cliLocator.ts` instead of the bundled `cli.js`; SDK via `sdkLoader.ts` |
| Logging | the SDK environment is no longer dumped to the output channel (it holds API keys) |
| Config files | `~/.uic.json` → `~/.claude/ai-cli-diff-view-ui.json`; `~/.claude/uic.json` → `~/.claude/ai-cli-diff-view-settings.json` |
| `~/.claude/settings.json` | **not** seeded with upstream's template on startup (attribution off, env flags): that file also drives the CLI used in terminals. It is written only from the Settings page |
| Start-up | the agent/config services start on the first message from a Claude UI tab, not at activation |
| Assets | `get_asset_uris` returns `{}` (upstream pointed at artwork that is not shipped) |
| Handlers | `new_conversation_tab` / `rename_tab` drive the terminal tab strip |
| File icons | upstream's ~1,160 per-file-type SVGs (`assets/icons`, `config/fileIconMap.ts` / `folderIconMap.ts`, `vite-plugin-svg-icons`) were dropped; `FileIcon.vue` shows the generic `file` / `folder` codicon |
| Language | all Chinese text (UI strings, log/error messages, comments, `Dropdown/README.md`) translated to English; when pulling upstream changes, translate any new Chinese text the same way |

## Build

- `npm run compile` / `npm run build`: esbuild host bundle, then
  `vite build --config webview-ui/claude/vite.config.mts`.
- `npm run watch`: esbuild watch plus a `vite build --watch` child; the
  `[watch] build started/finished` markers are counted across both so F5 waits
  for both.
- `npm run typecheck`: `tsc` for the host and `vue-tsc` for the webview.
- Webview libraries are devDependencies: Vite bundles them, so nothing from
  them ships in `node_modules`. `.vscodeignore` keeps `dist/claude-ui/**` and
  drops `webview-ui/**` and `uic/**`.

## Manual test checklist

1. `+` → **Claude UI** opens a tab next to the terminals, styled like uic, in
   the current color theme (switch theme while open: it follows).
2. Send a prompt: streaming answer, thinking, tool cards (Read/Edit/Bash/TodoWrite).
3. Permission modal appears in that tab only; mode (Shift+Tab) and model switch work.
4. `@` file mention, `/` slash commands, image paste/attach.
5. Claude edits a file → it appears in Pending Files with the right before-image.
6. Two Claude UI tabs at once: messages and permission prompts do not cross.
7. The `+` button inside the chat opens another Claude UI tab; the tab title
   follows the conversation summary.
8. Sessions page (☰) lists and reopens earlier conversations; Settings page
   reads and writes Claude settings.
9. Toggle Agent mode / reload the window: the tab is rebuilt and the
   conversation reloads.
10. VS Code shortcuts (Ctrl+P, Alt+H/L, Ctrl+Shift+Y) still work while the chat has focus.
11. Terminal tabs look unchanged.
