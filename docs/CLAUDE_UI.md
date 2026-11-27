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

  Each candidate goes through `resolveCliTarget()`: the SDK spawns without a
  shell, and Node on Windows refuses `.cmd`/`.bat` that way (`spawn EINVAL`), so
  package-manager shims (npm/pnpm/yarn/bun/volta/scoop `claude.cmd`) are replaced
  by the `claude.exe` or `cli.js` they launch; symlinks (npm global, Homebrew)
  are resolved with `realpath`. A shim whose target cannot be found is skipped.
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
- **Tab title / new tab**: the app always sends
  `rename_tab` and `new_conversation_tab` (no `openNewInTab` flag); `extension.ts` turns them into
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

uic is our own code now (no upstream sync); the differences from the original Claudix:

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
| Look & feel | restyled to match Cursor's sidebar chat (measured numbers in `docs/references/chat-ui-refs/CURSOR_LIVE_SPEC.md`). Tokens: `--cs-*` in `styles/claude-theme.css` (colours are always the editor foreground at a fixed opacity). Header = 35px tab strip (`ChatPage.vue`, `SessionsPage.vue`); empty chat puts the input at the top and nothing below it |
| Turns | `ChatPage` renders `buildChatItems()` (`utils/turns.ts`) through `Messages/TurnView.vue` instead of one `MessageRenderer` per message: user bubble, then the assistant's steps. Thinking → `rows/ThoughtRow.vue`, except server-tagged *narration* thinking blocks (the frame's `narration_block_indexes`, or for history the signature's `block_kind`, decoded by `utils/narration.ts`), which are words to the user and render as answer text like the CLI does; consecutive Read/Glob/Grep → `rows/ExploredRow.vue`, other tools keep their cards. "Worked for Ns" folds every step of a turn; turns loaded from history start folded, the turn run while the page is open stays unfolded. `AssistantMessage.vue` is no longer used for turns |
| Tool cards | `ToolMessageWrapper` is a 12px-radius card (header 30px, chevron only on hover, no success dot). Edit/MultiEdit/Write (file icon + name + `+N`, diff from `utils/linePatch.ts` with one line of context) start closed like every card; clicking the file name in an edit card (Edit/MultiEdit/Write/NotebookEdit/OMP edit, `ToolFilePath :opens-file="false"`) folds the in-chat diff instead of opening the file, since the full diff is opened from Pending Files; Bash shows its first output line while collapsed (`#preview` slot) and opens on click; Bash/BashOutput/MCP no longer open themselves when they have output |
| Background tasks | under the input, as the CLI's panel: status line (`▸▸ auto mode on · N background tasks · esc to interrupt · ↓ to manage`) then a tree — bold `● main`, one `○` row per background task with its subagent type, description and `2m 27s · ↓ 64.0k tokens`. Rows come from `background_tasks_changed` **and** the `backgrounded` tasks of `task_*` events (`BackgroundTasksList.vue`), so a subagent shows before the CLI lists it; `↓` from the input's last line or a click opens the management dialog on that task |
| Ctrl+B | while a turn runs, Ctrl+B in the input moves its foreground Bash commands and subagents to the background, as in the CLI (`background_tasks` request → `Query.backgroundTasks()`); the tool call returns "manually backgrounded" and the turn goes on. While the turn runs, a foreground Bash card without its result shows its first output line (or `Running…`) and then, spaced off (no `·` separator), the CLI's `(ctrl+b to run in background)` in its preview line (`tools/Bash.vue`, `useLiveActivity().busy`); a foreground Agent card shows the same hint under its status line (`tools/Task.vue`: no result, not `run_in_background`, its task not `backgrounded`). Nothing to move (`backgroundTasks()` false) or an error is said in a toast. Not done: the CLI's second press within 800ms that moves the whole session to the background (no SDK API, and a tab keeps running when another is shown) and its always-on hint under the prompt (the CLI shows it for remote sessions only). Idle, and in OMP tabs (omp has no RPC for it), Ctrl+B still reaches VS Code (toggle sidebar) and no hint shows |
| /btw, /branch, /fork | UI commands (`UI_SLASH_COMMANDS`, Claude tabs only). `/btw <question>` → `side_question` request → `Query.askSideQuestion()` (in the SDK runtime, not its typings): the CLI answers from the live context, also mid-turn, and keeps question and answer out of the transcript; `BtwPanel.vue` shows the answer in the input's place (Enter / Space / Esc dismiss). `/branch [name]` continues this tab in a copy of the conversation (`SessionStore.forkConversation`, resumed with `forkSession`; refused while a turn runs); the original stays in `/resume`. `/fork [prompt]` opens the copy in a new tab (`new_conversation_tab` with `forkSessionId` → `ChatTabStart.forkOf` in `TerminalSessionStore` → bootstrap `fork` / `prompt`); with a prompt the new tab sends it once its history is in (`Session.whenLoaded`) and the forking tab keeps the focus. Until the copy reports its own id, a rebuilt fork tab forks again instead of resuming the original |
| OMP UI logo | an empty OMP chat shows omp's own mark above the input instead of Clawd (`components/OmpLogo.vue`): the CLI's block-character logo redrawn as SVG cells (transparent, gradient kept), a pixel "omp" wordmark in the theme's foreground and the `omp --version` line below, laid out like `ClaudeCodeLogo` |
| OMP UI spinner and agent icon | OMP tabs use omp's own look instead of Claude's: the waiting line shows omp's braille "activity" spinner (`components/OmpSpinner.vue`, one shared 80ms clock, colour cycling violet → blue from the mark) and a fixed `Working…` (no random verbs, no text animation); the same spinner replaces `codicon-loading` on a running Agent card, a subagent's running calls and BashOutput; the Agent card and background task list show omp's mark (`components/OmpMark.vue`) instead of the agent icon |
| History | the sessions page is a Cursor-style list (search row, Today / Yesterday / Last 7 days / Older groups) instead of cards |
| Context meter | upstream summed the last `assistant` usage of any chain against a hard-coded 200K. Now `Session.updateUsage` only takes main-chain messages (`parent_tool_use_id` empty) as a live estimate, and the CLI's own numbers (`Query.getContextUsage({detail:'summary'})`, i.e. `/context`: exact total + real window, 200K/1M) replace it on `system/init`, `compact_boundary`, `result` and after a model switch (`get_context_usage` request). Cost comes from `result.total_cost_usd` |
| CLI state sync | slash commands the CLI handles itself are followed from its events, never from parsing its text (`Session.processIncomingMessage`): `conversation_reset` (`/clear`, `/reset`, `/new`, plan-mode exit with clear context) empties the chat; `system/session_title_changed` (`/rename`) sets the tab title; a `result` with `local_command: 'effort'` reads `getSettings().applied.effort` back (`get_applied_effort` request) into the effort picker — `auto` reads back as the model's default level, so it is taken from the typed command. See `docs/CLAUDE_UI_CLI_PARITY.md` §1 |
| Code Mode | `claude -p` / SDK sessions enable Code Mode (`CLAUDE_CODE_EXPERIMENTAL_CODE_MODE`) only from the env block of `--settings`, never from `~/.claude/settings.json` or the shell as the interactive CLI does. `ConfigurationService.syncFlagSettings()` runs before every SDK query (`ClaudeSdkService`) and copies the user's value (settings.json + active profile, else the extension host's environment) into `~/.claude/ai-cli-diff-view-settings.json` (`withCodeModePassthrough`); the file is rewritten only when its content changed. The CLI tells SDK clients nothing about Code Mode (`system/init` is identical either way), so `ClaudeAgentService` adds `uic_code_mode: true` to `system/init` when that file holds "1", and `Session.showCodeModeNotice()` inserts the CLI's start-of-session line ("Code Mode (experimental) is on", a `NoticeBlock`) once per conversation, before the prompt that started it. The `REPL` / `Poll` tools render in `tools/REPL.vue` / `tools/Poll.vue` (parsing in `tools/common/codeModeResult.ts`; only `<event>` tags with a nonce from the result's `<system>` line count as events, everything is shown as text) |
| Compaction | `compact_boundary` renders a "Conversation compacted  pre → post tokens" marker (`NoticeBlock`); the summary the CLI injects after it (`isSynthetic` live, `isCompactSummary` in history) is hidden. History follows `logicalParentUuid` across the boundary, so a resumed conversation still shows what came before `/compact` and is listed once |

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
12. Start two background subagents (`Agent` with `run_in_background`): the tree
    under the input lists both before the CLI's `background_tasks_changed`
    (`▸▸ auto mode on · 2 background tasks · esc to interrupt · ↓ to manage`,
    `● main`, then `○ general-purpose  <description>  2m 27s · ↓ 64.0k tokens`);
    `esc to interrupt` goes when the turn ends, `auto mode on` only shows in Auto;
    `↓` opens the dialog on the row, a background `Bash` shows type `shell`, and
    the panel disappears when every task ends.
13. OMP UI tab: the omp pixel mark sits at the head of the chat in both themes
    (no white box around it, gradient intact), no second logo in the empty chat,
    and the input stays centred under it.
14. Claude UI tab: ask for a foreground `python3 -c "import time; time.sleep(60)"`:
    its Bash card shows `Running…` and, spaced off after it (no `·` separator), `(ctrl+b to run in background)`
    (a foreground Agent card shows the same hint). Ctrl+B in a turn with nothing in the
    foreground shows "Nothing is running in the foreground…". Press Ctrl+B in
    the input: the Bash card finishes with
    "manually backgrounded", the task appears in the list under the input and the
    turn continues. Ctrl+B with no turn running toggles the VS Code sidebar.
15. Claude UI tab, while a long turn runs: `/btw what are you doing?` shows
    "Answering…" then the answer in the input's place, the turn keeps going, and
    nothing about it appears in the chat (also not after reopening it from history).
    `/btw` with no question warns with its usage.
16. `/branch try-b` after a few messages: the chat stays the same, the tab is titled
    `try-b`, the next message goes to a new session id, and `/resume` still lists the
    original, unchanged. While a turn runs, `/branch` only warns.
17. `/fork` opens a new Claude UI tab with the same history; `/fork write a haiku`
    opens it without taking the focus, and that tab answers the prompt on its own.
    Reload the window before the fork tab sent anything: it opens a copy again, not
    the original.
