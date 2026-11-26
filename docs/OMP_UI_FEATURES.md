# Tính năng Claude UI — danh sách để bám theo khi làm OMP UI

Tổng hợp toàn bộ tính năng của Claude UI hiện tại, đọc trực tiếp từ code (`webview-ui/claude/src`, `src/claude`, `res/webview/claudeFrame.js`).

- **Phần A** là checklist tổng quan: đánh `[x]` vào mục muốn có trong OMP UI. Mục gắn **[Claude]** gắn chặt với Claude CLI / Agent SDK — sang omp cần tìm cái tương đương hoặc bỏ.
- **Phần B** là mô tả chi tiết từng hành vi (trạng thái, phím tắt, text hiển thị, edge case, message host↔webview), giữ tiếng Anh cho khớp tên trong code. Đường dẫn `W/` = `webview-ui/claude/src/`, `H/` = `src/claude/` hoặc gốc repo tuỳ mục (có ghi ở đầu mục).
- Các ghi chú "dead code / unused / bug" trong Phần B là những thứ có trong code nhưng người dùng không thấy hoặc chạy sai — không cần bám theo.

---

# Phần A — Checklist tổng quan


### 1. Tab và vòng đời phiên

- [ ] Mở từ `+` → **Claude UI** trên tab strip của terminal; mỗi tab là một iframe riêng
- [ ] Nút `+` trong chat mở thêm tab chat mới
- [ ] Tên tab tự đổi theo tóm tắt cuộc trò chuyện / `/rename`
- [ ] Khôi phục cuộc trò chuyện khi webview bị dựng lại (reload, bật/tắt Agent mode) — lưu `sessionId`
- [ ] Nhiều tab cùng lúc, tin nhắn và hộp xin quyền không lẫn giữa các tab
- [ ] Theo theme VS Code, tự đổi khi đổi theme
- [ ] Phím tắt VS Code (Ctrl+P, Alt+H/L, Ctrl+Shift+Y…) vẫn chạy khi focus ở chat
- [ ] Tuỳ chỉnh giao diện (Settings → "Claude UI appearance"): cỡ chữ, font, theme/màu, line height, row spacing, max width
- [ ] Responsive cho side bar và panel chính
- [ ] Chat trống: logo Claude Code + phiên bản CLI, ô nhập ở trên **[Claude]**

### 2. Ô nhập (ChatInputBox)

- [ ] Nhập nhiều dòng, full-width
- [ ] `@` nhắc file (dropdown gợi ý)
- [ ] `/` slash command (dropdown, tìm theo alias; Enter/click chạy luôn lệnh không tham số, Tab chỉ điền)
- [ ] Dán / đính kèm ảnh
- [ ] Lịch sử prompt: ↑/↓; **Ctrl+R** tìm trong lịch sử
- [ ] **Bash mode**: gõ `!` đầu dòng để chạy lệnh shell trực tiếp
- [ ] **Ctrl+C** xoá ô nhập
- [ ] **Esc** dừng lượt đang chạy (hoặc lệnh bash-mode)
- [ ] **Esc Esc** mở rewind
- [ ] **Shift+Tab** đổi permission mode
- [ ] Chọn model (ModelSelect, picker kiểu CLI)
- [ ] Chọn effort (EffortSelect)
- [ ] Chọn mode (default / acceptEdits / plan / auto…) **[Claude]**
- [ ] Context ring (TokenIndicator) — mức dùng context theo số của CLI **[Claude]**
- [ ] InputExtraBox / FileEditedList — danh sách file đã sửa

### 3. Hàng đợi (queue)

- [ ] Gửi prompt khi đang chạy → vào queue của CLI
- [ ] Danh sách queue (MessageQueueList): sửa / lấy lại bằng Esc, "Send immediately"
- [ ] **Ctrl+U** gửi ngay toàn bộ queue

### 4. Hiển thị hội thoại

- [ ] Hiển thị theo **lượt (turn)**: bong bóng user căn phải, rồi các bước của assistant
- [ ] "Worked for Ns" gập/mở các bước của một lượt; **Ctrl+O** gập/mở tất cả
- [ ] Thinking → `ThoughtRow` (mặc định đóng)
- [ ] Read/Glob/Grep liên tiếp gộp thành dòng "Explored" (`ExploredRow`)
- [ ] Stream text theo thời gian thực, WaitingIndicator (spinner)
- [ ] Markdown: code block wrap, nút copy
- [ ] Fence mermaid vẽ thành sơ đồ (toggle code/diagram; giữ code khi đang stream hoặc lỗi)
- [ ] Sticky prompt khi cuộn lên
- [ ] Cuộn thông minh: bám đáy khi stream; cuộn lên thì đứng yên + nút "New messages"
- [ ] Preview ảnh + lightbox
- [ ] Block đặc biệt: Diagnostics, Document, Hook, Image, Interrupt, LLM error, Notice, Opened file, Selection, Slash command result, Usage report (`/usage` dạng thẻ có progress bar), Unknown
- [ ] Mốc "Conversation compacted pre → post tokens", ẩn summary tự chèn **[Claude]**
- [ ] System message, tip ngẫu nhiên (RandomTip / TipMessage)
- [ ] Banner rate limit **[Claude]**
- [ ] Link bấm được (mở file trong editor / link ngoài)

### 5. Thẻ tool (tool cards)

- [ ] Khung chung: card bo góc, header, chevron, status indicator, hiển thị lỗi, đường dẫn file bấm được
- [ ] **Edit / MultiEdit / Write**: luôn mở, icon + tên file + `+N`, diff kèm 1 dòng context
- [ ] **Bash**: khi đóng hiện dòng output đầu, click để mở
- [ ] **BashOutput**, **KillShell**
- [ ] **Read**, **Glob**, **Grep**
- [ ] **WebFetch**, **WebSearch**
- [ ] **NotebookEdit**
- [ ] **TodoWrite** + **TodoList** riêng
- [ ] **Task** (subagent): SubagentCalls, SubagentDetail, SubagentStatusLine
- [ ] **MCP tool**
- [ ] **SlashCommand**
- [ ] **AskUserQuestion** (hiện câu trả lời đã chọn)
- [ ] **ExitPlanMode** (plan bằng font UI, ẩn lần ghi plan file)
- [ ] **REPL / Poll** (Code Mode) **[Claude]**
- [ ] **Default** cho tool chưa có thẻ riêng

### 6. Prompt tương tác (thay chỗ ô nhập)

- [ ] Xin quyền chạy tool kiểu CLI, kèm gợi ý rule (permissionSuggestions)
- [ ] Duyệt plan (PlanApprovalPrompt)
- [ ] AskUserQuestion: lựa chọn một dòng / dạng lưới, điều khiển bằng bàn phím
- [ ] Session conflict (cuộc trò chuyện đang mở ở nơi khác)
- [ ] "Resume this conversation?" khi prompt cache hết hạn và gửi lại tốn nhiều quota **[Claude]**
- [ ] Esc huỷ prompt kể cả khi focus ở chỗ khác

### 7. Background tasks

- [ ] Danh sách task nền (BackgroundTasksList), mở thành hộp thoại thay chỗ ô nhập, điều hướng bằng bàn phím
- [ ] Xem output shell nền (BackgroundShellDetail)
- [ ] Chi tiết subagent đang chạy

### 8. Slash commands

Lệnh CLI tự xử lý, UI theo dõi qua event (không parse text) **[Claude]**:

- [ ] `/clear`, `/reset`, `/new` — xoá chat
- [ ] `/rename` — đổi tên tab
- [ ] `/compact`
- [ ] `/effort`

Lệnh UI tự làm thành panel (CommandPanel):

- [ ] `/resume` — chọn cuộc trò chuyện cũ
- [ ] `/help` — phím tắt + danh sách lệnh
- [ ] `/memory` — mở CLAUDE.md
- [ ] `/status` — phiên bản, model, tài khoản, MCP, file settings
- [ ] `/export` — xuất markdown / clipboard
- [ ] `/hooks`
- [ ] `/permissions` — thêm/xoá rule allow/ask/deny
- [ ] `/add-dir`
- [ ] `/plugin` — cài/gỡ/bật/tắt, quản lý marketplace
- [ ] `/release-notes`
- [ ] `/rewind` — khôi phục code và/hoặc hội thoại về mốc trước
- [ ] `/login`, `/logout` (AuthPanel)
- [ ] `/config`
- [ ] `/mcp` — reconnect, bật/tắt server
- [ ] `/model`
- [ ] `/effort` (panel)
- [ ] `/output-style` và các menu dạng danh sách (ListPanel)
- [ ] Thiết lập auto mode (AutoModeSetupPanel)
- [ ] Nguyên tắc: lệnh kiểu menu luôn mở picker/panel, không in hướng dẫn cách dùng

### 9. Trang Sessions (☰)

- [ ] Danh sách kiểu Cursor: ô tìm kiếm, nhóm Today / Yesterday / Last 7 days / Older
- [ ] Recent conversations, bấm để mở lại
- [ ] Hội thoại tạo từ UI cũng hiện trong `claude --resume` **[Claude]**

### 10. Trang Settings **[Claude]**

- [ ] Các tab: General, Agent, Models, Permissions, Hooks, MCP Servers, Plugins, Skills, Slash Commands, Memory & Rules, Environments, Network (proxy, mTLS), Sandbox, Profiles
- [ ] Chọn phạm vi cho từng mục (user / project / local)

### 11. Tích hợp với extension

- [ ] Snapshot trước Edit/Write (hook `PreToolUse` → `DiffManager.snapshotBefore()`) để diff có before-image đúng, file hiện trong Pending Files
- [ ] Tìm CLI (`cliLocator.ts`, setting `claudeCliPath`)
- [ ] Agent chỉ khởi động khi có tin nhắn đầu tiên
- [ ] Toast thông báo


---

# Phần B — Chi tiết

## B1. Ô nhập, picker, phím tắt, queue, context, rate limit, cold resume

- **Scope notes**
  - `InputExtraBox.vue` and `FileEditedList.vue` are dead code. No file imports `InputExtraBox`, and `FileEditedList`/`TodoList` are only used inside it. Users never see them. Their behavior is listed below for completeness (webview-ui/claude/src/components/InputExtraBox.vue, FileEditedList.vue).
  - The session cost is tracked but never shown. `Session.updateCost` stores `result.total_cost_usd` in `usageData.totalCost` (webview-ui/claude/src/core/Session.ts), and no component reads it. Cost is visible only through the CLI's own `/usage` command, which `/cost` aliases (docs/CLAUDE_UI_CLI_PARITY.md).

- **Chat input box: layout and appearance** (webview-ui/claude/src/components/ChatInputBox.vue)
  - The frame `.full-input-box` stacks, top to bottom: the attachment strip, then the contenteditable editor, then `ButtonArea`. A command panel (`/effort`, `/resume`, `/help`, …) takes the input's place inside the same frame. While a panel is open, the attachments, editor and ButtonArea are hidden with `v-show`.
  - Placeholder text (default prop): "Plan, @ for context, / for commands, ! for bash". It is drawn with `:empty::before` in `--vscode-input-placeholderForeground`.
  - Height: an empty input is 110px (`INPUT_MIN_HEIGHT`, three 22px lines). It grows with the content up to 360px (`INPUT_MAX_HEIGHT`), then scrolls (`overflow-y: auto`), otherwise the overflow is hidden. Height is recomputed after each input, submit, clear, history step and drop (`autoResizeTextarea`).
  - Text is read through `textContent` and kept as plain text. When the editor becomes fully empty, its `innerHTML` is cleared, also after Backspace/Delete, so the placeholder shows again.
  - The focus border stays `--cs-fg-20` (Cursor-like). There is no outline.
  - Bash mode: when the text, after leading whitespace, starts with `!`, the frame border turns `--vscode-terminal-ansiMagenta` (fallback `#d670d6`). This does not apply while a panel is open (`bash-mode` class).
  - Caret retention:
    - When the window regains focus and nothing else is focused, the input is focused with the caret at the end.
    - If a permission, question or plan prompt is open (`[data-permission-panel]`), its `[tabindex="0"]` element gets the focus instead.
    - A left mouse-up on a non-interactive area (not an input, button, link, `[tabindex]`, role element, label or summary) also focuses the input. This is skipped when text is selected or a prompt is open.
  - Exposed to ChatPage (`defineExpose`):
    - `openRewind(msg?)`
    - `getContent()`
    - `setContent(text)`: the caret goes to the end if the input is focused, and the height is resized.
    - `focus()`: caret at the end. It does nothing while a panel is open.

- **ButtonArea: the bottom row of the input** (webview-ui/claude/src/components/ButtonArea.vue)
  - Grid `minmax(0,1fr) auto`, 28px high.
    - Left side: ModeSelect, ModelSelect, and EffortSelect (only when `effortLevels.length > 0`).
    - Right side: TokenIndicator, the thinking toggle, Attach, and Submit.
  - Only the model name shrinks (ellipsis). The mode pill and the effort control keep their size.
  - Narrow-pane rules:
    - ≤420px: the mode/effort chevrons, the effort icon and the context % text are hidden, and the gap shrinks to 4px.
    - ≤340px: the mode label is hidden (icon only).
    - ≤280px: the effort picker is hidden entirely (`/effort` still works), along with all chevrons.
  - Thinking toggle (`codicon-brain`):
    - Shown unless the CLI reports `supportsThinkingOff === false` for the model. It stays visible for unknown or custom models (ChatPage `showThinkingToggle`).
    - Tooltip reads "Thinking on" or "Thinking off".
    - Active state: full opacity, `--vscode-button-secondaryForeground`. Off state: 0.5 opacity, which does not change on hover.
    - A click emits `thinkingToggle`. ChatPage switches between `off` and `default_on` → `Session.setThinkingLevel` → host `set_thinking_level`, sent only if a channel exists.
  - Attach (`codicon-attach`, tooltip "Attach File"):
    - Opens a hidden `<input type=file multiple>` that accepts any type.
    - The input's value is reset after a pick, so the same file can be picked again.
    - Emits `addAttachment(FileList)`.
  - Submit button (round, 20px) has three variants:
    - `stop` whenever the conversation is busy, even when there is text. It shows `codicon-debug-stop`, the tooltip says "Stop", and a click emits `stop`. Enter still queues while busy.
    - `disabled` when idle with no text: opacity 0.4, `not-allowed` cursor.
    - `enabled`: `codicon-arrow-up-two`, tooltip "Send".
  - Exposes `openModelSelect()`, which `/model` uses.

- **ModeSelect: permission modes** (webview-ui/claude/src/components/ModeSelect.vue, utils/permissionModes.ts, pages/ChatPage.vue, core/Session.ts)
  - Trigger: a pill with a `--cs-fg-14` background and 0.8 opacity (1 on hover), showing the mode icon and label. Its tooltip reads `"<label>: <description>"`.
  - The menu (`DropdownTrigger`, stacked items) shows icon, label, description, and a check on the current mode.
  - Known modes, with labels from the official extension:

    | Mode | Label | Icon | Description |
    |---|---|---|---|
    | `default` | Manual | `codicon-chat` | "Ask before edits and shell commands" |
    | `acceptEdits` | Edit automatically | `codicon-edit` | (none recorded) |
    | `plan` | Plan | `codicon-todos` | (none recorded) |
    | `bypassPermissions` | Bypass permissions | `codicon-warning` | (none recorded) |
    | `auto` | Auto | `codicon-sparkle` | "A classifier reviews actions instead of asking" |
    | `dontAsk` | Don't ask | `codicon-circle-slash` | (none recorded) |

    - An unknown mode shows its raw id with `codicon-shield`.
  - Which modes are listed (`availableModes`):
    - Always `default`, `acceptEdits`, `plan`.
    - `bypassPermissions` only when the setting `ai-cli-diff-view.claudeAllowBypassPermissions` is on (`config.allowBypassPermissions`).
    - `auto` only when the model reports `supportsAutoMode`.
    - The current mode is always appended if it is not in the list.
  - Shift+Tab cycles through the listed modes in the CLI's order: default → acceptEdits → plan → bypass → auto (`nextMode`). A mode outside the cycle restarts it. The binding is registered at priority 100 and also works inside the editor and while menus are open. It is also registered as the command `permissionMode.toggle` ("App Shortcuts").
  - Auto as the default mode: if a session has no explicit mode and `auto` is available, ChatPage calls `setPermissionMode('auto', true, isDefault=true)`. Modes picked by the user are never overridden.
  - `setPermissionMode` sets the mode locally, then sends host `set_permission_mode`, which calls `query.setPermissionMode` (src/claude/services/claude/ClaudeAgentService.ts). If the host does not report success, the UI goes back to the previous mode. Without a channel the change is local only.
  - On launch, the mode is sent only if one was set explicitly. Otherwise the CLI's `permissions.defaultMode` applies, and `system/init` reports the resulting mode back.
  - A resumed conversation gets back its last mode from the transcript (`applyResumedSettings`). `bypassPermissions` is restored only if bypass is allowed.

- **ModelSelect** (webview-ui/claude/src/components/ModelSelect.vue, composables/useModelCatalog.ts, pages/ChatPage.vue)
  - Trigger: transparent, with a hover background. The label is capped at 120px with an ellipsis, followed by a chevron. It reads "Select model" if no label resolves.
  - Where the list comes from:
    - One `sdk_probe(['supportedModels'], 15000)` per webview.
    - The CLI's "Custom model" pseudo-entry is dropped, and " (recommended)" is stripped from labels.
    - If the probe fails, the fallback list is Default, Opus, Sonnet, Haiku. The next component mount may retry.
    - `customModels` from the extension config (`get_extension_config`) are appended.
    - `disabledModels` are hidden.
    - Both lists update live on `extensionConfigChanged`.
  - Items show the label, the description, and a check on the current model.
  - Picking a model → `Session.setModel` → host `set_model`. On failure the selection reverts. On success, context usage is re-read, because the window can change between 200K and 1M.
  - `/model` typed with no argument opens this picker (deferred by `setTimeout(0)`). `/model <name>` goes to the CLI.
  - Following the CLI:
    - If `cliModel`, from `get_context_usage`, changes between two reads of the same session, the picker adopts the matching entry (a named entry beats "Default") without telling the CLI (`adoptModel`).
    - A resumed model id such as `claude-opus-5-5` is mapped to the entry whose `resolvedModel` matches. A `[1m]` variant is chosen only for a `[1m]` id.
    - omp reports the model it actually runs with as a `session_model` message (`{ type: 'session_model', model: 'provider/id' }`): on launch, from `get_state` (its `modelRoles.default` or a resumed session's model), and on `config_update` when a builtin command such as `/model` switches it. `Session` adopts it like `adoptModel`, so the trigger shows the real model — and the next launch sends it — instead of the UI's `default` sentinel, which only means "no `--model` argument". The message carries no `session_id`, so an empty tab still has no open conversation.

- **EffortSelect** (webview-ui/claude/src/components/EffortSelect.vue, ChatInputBox.vue, core/Session.ts, ClaudeAgentService.ts)
  - Shown only when the model has `supportsEffort !== false` and a non-empty `supportedEffortLevels`.
  - Trigger: a `codicon-dashboard` icon, the label (max 80px) and a chevron. Tooltip reads "Effort: <label>".
  - Options: "Auto" (detail "The model's default"), followed by the CLI's levels. Labels: low → Low, medium → Medium, high → High, xhigh → Extra high, max → Max. Unknown levels show their raw name.
  - Picking a level → `setEffortLevel(level)` → host `set_effort_level` with `null` for auto → `applyFlagSettings({effortLevel})`. Afterwards `get_applied_effort` is read back.
  - `/effort` typed with no argument (and only if levels exist) opens `EffortPanel` in place of the input and emits `commandPanelOpen('effort')`, so ChatPage refreshes the applied effort. Enter in the panel uses `persist=true`, which also writes `userSettings.effortLevel` unless the level is `max`.
  - Typing `/effort <x>` records `pendingEffortArg`.
  - A resumed session gets back its effort if the current one is `auto`.

- **TokenIndicator: context usage** (webview-ui/claude/src/components/TokenIndicator.vue, pages/ChatPage.vue, core/Session.ts, ClaudeAgentService.ts)
  - A 20px SVG ring (radius 7, stroke 2, round cap, starting at 12 o'clock) with the percentage text (11px, tabular numbers) to its left. The text is hidden at ≤420px.
  - Value format: clamped to 0–100, whole numbers. Values above 0 and below 1 read "<1%". With no usage yet it reads "0%".
  - Colors: neutral (foreground at 70%) below 75%; warning color (`#cca700` fallback) from 75%; error color (`#f14c4c`) from 90%. The text takes the ring color at warning and error levels.
  - Tooltip: `"N% · <total> / <window> context used"`, with K and M at one decimal (ChatPage `contextTooltip`).
  - Data sources:
    - A live estimate from main-chain assistant usage (input + cache creation + cache read + output tokens).
    - Replaced by the CLI's own figures once host `get_context_usage` has answered (`query.getContextUsage({detail:'summary'})`).
    - Re-read after each usage update and after a model switch. Overlapping reads are folded into one, and stale answers are dropped by sequence number.
    - The window defaults to 200000 when unknown.
    - `/clear` (`conversation_reset`) sets the total back to 0.

- **Rate limit banner** (webview-ui/claude/src/components/RateLimitBanner.vue, core/LiveActivity.ts)
  - Placed above the queue list and the input. The data comes from the CLI's `rate_limit_event`; `resetsAt` and `utilization` fall back to the matching `unifiedWindows[type]` entry.
  - Hidden when the status is `allowed`, when `resetsAt` has passed (re-checked every 30s), or when a warning was dismissed.
  - Warning (`allowed_warning`): warning icon and tint. Text: "You've used N% of your <limit>, resets <time>", or "most of" when utilization is unknown. It has a dismiss ×. A dismissed warning comes back when the status, type or reset time changes.
  - Rejected: error icon and tint. Text: "You've hit your <limit>, resets <time>". It cannot be dismissed.
  - Limit names:
    - five_hour → "5-hour limit"
    - seven_day / seven_day_overage_included → "weekly limit"
    - seven_day_opus → "weekly Opus limit"
    - seven_day_sonnet → "weekly Sonnet limit"
    - overage → "extra usage limit"
    - anything else → "usage limit"
  - Reset time: only the time if the reset is less than 20h away and on the same day. Otherwise "Mon, Jan 5 3:00 PM".

- **Cold resume prompt: "Resume this conversation?"** (webview-ui/claude/src/components/ColdResumePrompt.vue, pages/ChatPage.vue, core/Session.ts, src/claude/coldResumePricing.ts)
  - Checked on submit, only for messages that do not start with `/`, and not while busy.
  - When the check runs (`checkColdResume`):
    - The prompt cache is likely cold: 5m TTL plus the keepalive window (keepalive is assumed on when unknown), or 1h TTL, or a different model than the one that cached.
    - A `coldResumeQuota` is known.
    - It was not already asked for this idle period.
    - The check then launches the channel and re-reads context usage.
  - The prompt shows only if `percent = tokens/1e6 × percentPerMillionTokens` is at least `minPercent` (default 5).
  - The quota comes from the CLI when available. Otherwise the host computes it from `~/.claude.json` `cachedGrowthBookFeatures.tengu_amber_tally` and the OAuth `rateLimitTier`; those files are re-read at most once a minute.
  - Text: "This conversation has been inactive for {Xm | Xh Ym} and is {N.Nk} tokens long. Resuming it will use about **P%** (or **all**) of your 5-hour usage limit." It is followed by "Your unsent message will still be there after you answer."
  - Options: "Resume" and "Start a new conversation". Hints: "↑/↓ or number to select", "Enter to confirm", "Esc to dismiss" (PromptOptions).
  - The message stays in the input while the prompt is open. Pressing Enter again only puts the text back.
  - Answers:
    - Resume: sends the message without asking again.
    - New conversation: sends `/clear` in this tab, keeps the text, and focuses the input.
    - Esc: dismisses the prompt and marks this period as asked.
  - Hidden while a session-conflict prompt or a permission prompt is shown. Cleared on a session switch.

- **Prompt history** (webview-ui/claude/src/utils/promptHistory.ts, ChatInputBox.vue, src/claude/services/claude/promptTools.ts)
  - Shared with the CLI through `~/.claude/history.jsonl` (respects `$CLAUDE_CONFIG_DIR`).
  - Reading (`get_prompt_history {cwd}`): filtered to the current project (case-insensitive on Windows), newest first, duplicates removed, at most 500 entries.
  - Loading: forced on mount and when Ctrl+R opens. On input focus it reloads only if the last load was more than 2s ago.
  - The in-memory list is module-level and shared across inputs.
  - Recording happens on every submit, including `!bash` lines and `/commands`. The entry is moved to the top of the list at once, then appended with `add_prompt_history {display,cwd,sessionId}` in the CLI's format (`pastedContents:{}`, file mode 0600).
  - ↑/↓ navigation:
    - ↑ works only when the caret is on the first visual line, or the input is empty. ↓ works only on the last line.
    - The first ↑ saves the current draft. ↓ past the newest entry restores it.
    - At the oldest entry ↑ is swallowed, so the caret does not jump.
    - Typing resets the browse position.
  - Ctrl+R opens the "Search prompts" panel:
    - Filterable, with the current input text as the initial query.
    - Each item shows a one-line label (max 120 chars) and a relative time ("just now", "5m ago", "3h ago", "2d ago", or a date).
    - Empty state: "No prompts typed in this project yet".
    - Hints: "↑/↓ to select", "type to search", "Enter to use", "Esc to cancel".
    - Picking an entry replaces the input text.

- **Bash mode (`!command`)** (ChatInputBox.vue, pages/ChatPage.vue, core/Session.ts, promptTools.ts, components/Messages/BashMessage.vue)
  - Enter with `!cmd` emits `bash(cmd)` and clears the input. A bare `!` does nothing and the input is kept.
  - It runs even while a turn is busy (no queue) and skips the cold-resume check. Attachments stay in the input.
  - The session immediately adds a `<bash-input>` user row. Host `run_shell_command {command,cwd}`:
    - Shell: `$SHELL` if it is bash or zsh, else `/bin/bash`. On Windows: `CLAUDE_CODE_GIT_BASH_PATH`, else PowerShell.
    - The command runs in its own process group.
    - Timeout is 120s, overridable with `BASH_DEFAULT_TIMEOUT_MS`.
    - stdout and stderr are each capped at 30,000 characters, keeping the end and adding a "[N characters truncated]" prefix.
  - The row is then replaced with command plus output. The non-empty stderr cases:
    - An interrupted command adds "Command interrupted".
    - A non-zero exit with empty stderr shows "Exit code N".
  - The result is sent to the CLI with `shouldQuery:false`, so no turn starts and Claude sees it with the next message.
  - Esc while the command runs aborts it: the whole process tree is killed and the output so far is kept.
  - Rendering: a `!` prompt, the command, stdout and stderr as `<pre>` blocks, or "(no output)".

- **Completion dropdowns (`/` and `@`)**
  - Shared engine (composables/useCompletionDropdown.ts, useTriggerDetection.ts, useKeyboardNavigation.ts, components/Dropdown/*)
    - Trigger rule: `/` or `@` at the start of the text or after whitespace, followed by non-space, non-trigger characters. The caret must be inside that token. So `a/b` and `x@y` do not trigger, and a trigger mid-sentence ("fix /comp") does.
    - Both triggers are checked on every input. The list is fetched after a 200ms debounce; older requests are aborted, and only the latest result is used.
    - There is no loading indicator. The list reads "No matches" until results arrive.
    - Keys while open: ↑/↓ wrap; PageUp/PageDown move 5; Enter or Tab (without Shift) selects; Esc closes. All other keys type normally.
    - Mouse: hovering switches to mouse navigation and highlights the hovered row. Leaving the list clears the highlight (index -1), after which Enter selects nothing.
    - The list closes when there is no match at the caret.
    - Placement: above the input (`prefer-placement: above`), anchored at the left edge of the trigger character and the top edge of the whole input frame. Offsets: y 6, x -8. It is repositioned on caret `selectionchange`. Click-outside does not close it.
    - Replacing the token adds a trailing space if none follows.
    - Edge case: with an open list and zero items, the keys are not handled but still do not reach the input's own handler. Enter falls through to the contenteditable default (a newline) and does not submit. Esc does not close the list.
  - `/` slash commands (providers/slashCommandProvider.ts, composables/useRuntime.ts, ChatInputBox.vue)
    - Where commands come from:
      - The CLI's `claudeConfig.slashCommands`.
      - `color`, `agents`, `focus` and `fast` are hidden.
      - Plugin `plugin:name` aliases are dropped.
      - The UI's own commands are added: resume, help, memory, status, export, hooks, permissions (alias allowed-tools), add-dir, plugin (alias plugins), release-notes, rewind (aliases undo, checkpoint), login, logout.
      - When the CLI and the UI define the same command, the UI version wins.
    - Ranking: name or alias contains the query. A name starting with the query ranks first, then an alias starting with it, then other contains-matches. Descriptions are searched only when no name matches. A leading `/` in the query is ignored, so `/cost` finds `/usage`.
    - Row layout (stacked, description clamped, min width 320, fit-content):
      - icon: `codicon-window` for UI commands, `codicon-symbol-method` for CLI ones
      - the `/name` label
      - a dim hint: "(aliases) <argument hint>"
      - a "(source)" badge
    - What a pick does:
      - If the command has a panel or picker, it opens. Note: this clears the whole input, even when the command was typed mid-text, and it also happens on Tab.
      - Picked with Enter or a click, when the command takes no argument and is alone in the input: it runs at once.
      - Otherwise, including any Tab pick, it inserts `"/cmd "` for you to finish.
    - Bare-typed commands that open a picker or panel: `/model`, `/effort`, `/output-style`, `/autocompact`, `/rename` and `/name`, `/goal`, `/config` and `/settings`, `/mcp`, `/auto-mode-setup`. With arguments they go to the CLI.
    - Commands always handled by the UI, with or without arguments:
      - Panels: `/resume`, `/memory`, `/status`, `/export`, `/hooks`, `/help`, `/permissions`, `/add-dir`, `/plugin`, `/login`, `/logout`.
      - Instant actions: `/release-notes`, `/rewind`, `/undo`, `/checkpoint`.
      - `/resume <id|name>` switches directly on a unique match.
      - `/export <file>` saves directly, adding `.md` when the name has no extension.
  - `@` file references (providers/fileReferenceProvider.ts, src/claude/services/claude/handlers/handlers.ts, src/claude/services/fileSystemService.ts)
    - Host `list_files_request {pattern}`, with abort support.
    - An empty query lists top-level directories and files (max 200).
    - A query runs ripgrep `--files --follow --hidden`, adds all parent directories, then a Fuse fuzzy search: threshold 0.5, filename weighted 2× over path, test/spec files ranked lower on near-ties, at most 100 results.
    - A path separator in the query filters by directory prefix.
    - Excluded: node_modules, .git, dist, build, .next, .nuxt, logs, `.env*`, plus `search.exclude` and `files.exclude`.
    - If ripgrep fails, VS Code `findFiles` is used (max 100, files only).
    - The search root is the first workspace folder.
    - Rows: a FileIcon (folder icon for directories), the name, and the path as detail. Fixed width 320.
    - A pick inserts `@<path> ` (directories without a trailing slash).

- **Attachments and images** (ChatInputBox.vue, pages/ChatPage.vue, types/attachment.ts, core/Session.ts, components/Common/ImageLightbox.vue)
  - Ways to add one:
    - The Attach button.
    - Pasting clipboard file items, such as screenshots. Text pastes are unaffected.
    - Every file is read as base64 with its MIME type.
  - Shift+drag-drop of files or URIs from the Explorer inserts `@path` mentions instead of attaching:
    - Paths are made workspace-relative; Windows `/C:/` paths are handled.
    - Host `stat_path_request` marks directories, which get a trailing `/`.
    - The mentions are appended to the text and the input is focused.
    - Without Shift, the drop is not intercepted.
  - Display:
    - Images (jpeg, png, gif, webp) appear as 48×48 thumbnails with a zoom-in cursor and an always-visible dark × in the corner. A click opens a lightbox teleported to body: an × button, the file name as caption, closed by a backdrop click or Esc. Its Esc is caught first, so it does not stop the turn or start a rewind.
    - Other files appear as 20px pills with a FileIcon and the name (max 140px, ellipsis). On hover the icon turns into an × button.
  - What gets sent (`buildUserMessage`):
    - Images become `image` base64 blocks.
    - `text/plain` becomes a `document` text block.
    - `application/pdf` becomes a `document` base64 block.
    - Any other type is dropped silently, logged only to the console, although its pill was shown.
  - Lifecycle: attachments clear after a successful send and stay after a failure. They are restored to the input when a queue is pulled back or the last prompt is withdrawn.
  - Edge case: attachments cannot be sent alone. Enter and Send both need text, although ChatPage would send `' '`.

- **Message queue** (webview-ui/claude/src/components/MessageQueueList.vue, pages/ChatPage.vue, core/Session.ts)
  - Enter while busy → `queueMessage` → ChatPage sends straight to the CLI's queue (`io_message`).
    - If the CLI supports command lifecycle events, the prompt is shown as a "sent" item (`inFlightPrompts`) until `command_lifecycle` reports `started`. It then joins the turn, as a mid-turn message or as a new turn after the result. `cancelled` or `failed` removes it.
    - Without lifecycle support, the prompt is added to the transcript directly.
  - Local hold: only when the send fails. The prompt and its attachments are kept in `queuedMessages` and flushed when the turn ends.
    - Consecutive non-command prompts are joined with `\n` into one message; a `/command` goes alone.
    - If the flush fails, the batch goes back to the head of the queue.
  - Display:
    - Header: a chevron, then "N Queued" (sent plus held). Expanded by default; a click toggles it.
    - Hint on the right: "Ctrl+U send now  ↑ to edit". The Ctrl+U part shows only when there are held items.
    - Sent items have a filled dot, no actions, and the tooltip "Sent: Claude reads it after the current step".
    - Held items have a hollow dot, the full text as tooltip, a trash button ("Remove from queue") and a send button ("Send immediately (Ctrl+U sends all)").
    - Item text is capped at 56px high.
  - Ctrl+U sends all held items in order. It is active only when held items exist and no permission prompt is open; otherwise the key goes on to VS Code.
  - ↑ on the first line, while not browsing history and with anything queued, pulls the queue back into the input:
    - Sent items are withdrawn with host `cancel_queued_prompt`; any the CLI already took in stay.
    - Then the held items.
    - Pulled text goes ahead of the typed text, and attachments are restored.
  - Esc or Stop does the same pull before interrupting.
  - A session switch clears the held queue.

- **Keybindings: infrastructure** (utils/KeybindingManager.ts, utils/useKeybinding.ts, utils/keyNormalize.ts, composables/usePickerKeyboard.ts, res/webview/claudeFrame.js)
  - One `document` keydown listener in the capture phase.
    - Keys are normalized to `ctrl+cmd+alt+shift+<key>`.
    - Bindings are sorted by priority, high to low.
    - Editable targets are skipped unless `allowInEditable`, and a `when()` guard can veto a binding.
    - The first match calls preventDefault and stopPropagation; handler errors are swallowed.
    - `useKeybinding` registers on mount and unregisters on unmount.
  - The model, mode and effort pickers catch ↑/↓ (wrapping), Enter and Esc on `window` in the capture phase while open, so those keys never reach the input or ChatPage's Esc. The menu opens highlighting the current value.
  - The iframe forwards modifier shortcuts and F-keys to the parent so VS Code sees them (claudeFrame.js `forwardKeys`), unless the event was already handled (`defaultPrevented`). Editing keys stay in the chat: Ctrl/Cmd with a, c, v, x, z, y, Backspace, Delete, arrows, Home, End, Enter, and Ctrl+Shift with z, ←, →, Home, End.

- **Keybindings: full list**

  | Key | What it does | Where |
  |---|---|---|
  | Enter | Send. While busy, queue. With `!`, bash. Ignored during IME composition. | ChatInputBox.vue |
  | Shift+Enter | New line | ChatInputBox.vue |
  | ↑ / ↓ | Queue edit (↑), task list (↓), history | ChatInputBox.vue; ↓ goes into the background task list below when tasks are running |
  | Esc (busy or shell running) | Stops the turn or the bash command | ChatPage.vue, priority 50 |
  | Esc (prompt open, focus outside it) | Cancels the prompt | ChatPage.vue, priority 60 |
  | Esc Esc (idle) | Clears the input; on an empty input opens Rewind | ChatInputBox.vue |
  | Ctrl+C | Clears the input | ChatInputBox.vue |
  | Ctrl+R | Opens the prompt search panel; never reaches VS Code's Open Recent | ChatInputBox.vue |
  | Shift+Tab | Next permission mode | ChatPage.vue, priority 100 |
  | Ctrl+O | Folds or unfolds every turn's steps; shows the "Steps folded  Ctrl+O to show" badge; always taken | ChatPage.vue |
  | Ctrl+U | Sends the held queue | ChatPage.vue |
  | Completion list open | ↑/↓, PageUp/PageDown, Enter, Tab, Esc | useKeyboardNavigation.ts |
  | Picker open | ↑/↓, Enter, Esc | usePickerKeyboard.ts |
  | Lightbox open | Esc closes it | ImageLightbox.vue |

  - Esc details:
    - Busy or shell running: Stop with queue pull, and with prompt withdrawal if no tool has run yet. Not active while a permission prompt, `.dropdown-popover`, `.command-panel` or the task list has focus.
    - Prompt open but focus outside it: focuses its options and replays Esc there, which cancels the prompt.
    - Esc Esc: two presses within 600ms while idle. Held-key repeats don't count, and a busy or shell state resets the count.
  - Ctrl+C clears only when nothing is selected and the input has text. With a selection it copies.

- **Stop and interrupt** (pages/ChatPage.vue, core/Session.ts)
  - First the queue is pulled back into the input.
  - If the last prompt has not started any tool: interrupt (`interrupt_claude`), wait up to 5s, rewind the conversation to just before the prompt, and put its text and attachments back in the input.
  - Otherwise: a plain interrupt.

- **Host↔webview messages for this area** (webview-ui/claude/src/transport/BaseTransport.ts, src/claude/shared/messages.ts, ClaudeAgentService.ts, handlers.ts)

  | Area | Messages |
  |---|---|
  | Sending input | `io_message` (prompts, bash results with `shouldQuery:false`), `interrupt_claude`, `cancel_queued_prompt`, `launch_claude` (model, permissionMode, thinkingLevel, effortLevel, …) |
  | Settings | `set_permission_mode`, `set_model`, `set_thinking_level`, `set_effort_level{persist}`, `get_applied_effort`, `report_session_settings` (debounced 300ms) |
  | Usage | `get_context_usage` (totals, window, model, coldResumeQuota, cacheKeepaliveWindowMs) |
  | Files | `list_files_request`, `stat_path_request` |
  | History | `get_prompt_history`, `add_prompt_history` |
  | Bash | `run_shell_command` (abortable) |
  | Models and config | `sdk_probe` (supportedModels), `get_extension_config` plus the `extensionConfigChanged` push |
  | Incoming from the CLI stream | `rate_limit_event`, `result.total_cost_usd`, `command_lifecycle`, `system/init` |

## B2. Hiển thị hội thoại (turn, markdown, mermaid, cuộn, sticky prompt, spinner, export)

- **Path legend.** `W/` stands for `webview-ui/claude/src/` and `H/` stands for ``. Every file below is under one of these two roots.

- **How the transcript is built: grouping messages into turns** (`W/utils/turns.ts`, `W/pages/ChatPage.vue`)
  - `buildChatItems(messages)` turns the flat message list into `ChatItem[]`. Each item is either a `Turn` (`{kind:'turn', key, user?, assistant[], startedAt, endedAt}`) or a `LooseMessage` (`{kind:'message', key, message}`).
  - The key of a turn is the index of its first message, and it stays the same over time. ChatPage writes it onto the turn's root element as `data-turn-key`.
  - Messages that are null or `isEmpty` are skipped. A message is empty when its content array is empty, when every block in it is a `tool_result`, or when it is an empty string. System messages are never empty (`W/models/Message.ts`).
  - A `user` message starts a new turn.
    - Exception: if it has `midTurn === true` and a turn is open, it is pushed into that turn's `assistant[]` and moves `endedAt` forward. This is a prompt the CLI took in during a running turn.
  - An `assistant` message is added to the open turn. If no turn is open, it opens a turn with no user bubble. This happens after an interrupt, an error, or at the start of a conversation.
  - A message with subtype `hook_response` joins the open turn, so a hook line never splits a turn. It does not move `endedAt`.
  - The types `tip`, `system`, `slash_command_result` and `bash` become standalone items and close the open turn (`current = null`). An assistant message after one of them therefore starts a new turn with no user bubble.
  - `result` messages and unknown types render nothing and do not split a turn.
  - `formatDuration(ms)` gives "9s", "1m 5s" or "2m". It rounds to whole seconds with a minimum of 1s.
  - `formatAgo(ts)` gives "Just now" under 45s, then "Nm ago", "Nh ago", "Nd ago". It is used under turns and in the recent-conversations list.
  - In ChatPage, a turn item is rendered by `TurnView` and a loose item by `MessageRenderer`.
  - **The running turn**
    - `running = isBusy && item.key >= runningFromKey`.
    - `liveTurnKey` is set to the last turn's key when `busy` becomes true.
    - Because of `runningFromKey`, a prompt sent mid-turn (Ctrl+U or "Send immediately") starts a new turn in the transcript while the earlier turn keeps running and stays unfolded.
    - If the page was opened during a turn, or the key is left over from another conversation, only the last turn counts as running.
    - `liveTurnKey` goes back to -1 when the active session changes.

- **Which messages become which types** (`W/models/Message.ts`, `W/models/contentParsers.ts`, `W/core/Session.ts`)
  - **Hidden user messages:** `isCompactSummary`, and `isSynthetic` messages with no `tool_result` in them. This hides the summary the CLI writes after a compaction.
  - **`/usage` output:** an assistant message whose `model === '<synthetic>'` and whose text parses as a usage report becomes a `tip` with subtype `usage_report`, drawn by `UsageReportBlock`.
  - **Special user message types** come from `getSpecialMessageType`:
    - Every block is `bash` → type `bash`.
    - A single `interrupt` or `llm_error` block → type `tip`.
    - A single `slash_command_result` block → type `slash_command_result`.
  - **Text parsing** (`parseTextBlock`):
    - `[Request interrupted by user]` becomes an `interrupt` block reading "Interrupted".
    - `[Request interrupted by user for tool use]` becomes "Tool interrupted".
    - `<ide_selection>` becomes a `selection` block. The label is `file#start-end`, `file#line` or the file name.
    - `<ide_opened_file>` becomes `opened_file`.
    - `<local-command-stderr>` / `<local-command-stdout>` become `slash_command_result` (error or success).
    - `<bash-input>`, `<bash-stdout>`, `<bash-stderr>` become a `bash` block.
    - `<post-tool-use-hook><ide_diagnostics>` holding JSON becomes `diagnostics`.
    - `<command-name>` plus `<command-args>` become a text block with `isSlashCommand`.
    - The CLI's tool-rejection boilerplate is dropped.
    - `redacted_thinking` is dropped.
    - An unknown raw block type becomes a text block containing its JSON.
  - **Compaction marker:** `system/compact_boundary` becomes a `tip` with subtype `compact_boundary` holding a `notice` block.
    - Icon: `fold`.
    - Message: "Conversation compacted automatically" when the trigger was `auto`, otherwise "Conversation compacted".
    - Detail: "15.9K → 6.6K tokens", or "X tokens before" when only the pre-compaction count is known.
    - When the event arrives live, `Session` also calls `refreshContextUsage()`.
  - **Hook lines:** `system/hook_response` becomes a `tip` with subtype `hook_response` holding a `hook` block. The kinds are:
    - `blocked`: exit code 2, or JSON `decision: block`.
    - `error`: any other non-zero exit, or `outcome: error`.
    - `stopped`: JSON `continue: false`.
    - `message`: JSON `systemMessage`.
    - Cancelled runs and plain successes print nothing.
    - History entries arrive with `hook_kind` already set by the host.
  - **All other `system` events and all `result` events produce no message.**
  - **LLM request error** (`W/core/Session.ts`): the host sends `__llm_request_error__`.
    - If the session is busy, a synthetic user message with an `llm_error` block is appended (type `tip`, shown as a standalone item) and `busy` is set to false.
    - If the session is not busy (for example a profile warm-up), the error goes to a VS Code notification instead.
  - **Code Mode notice** (`W/core/Session.ts` `showCodeModeNotice`, `H/src/claude/services/claude/ClaudeAgentService.ts`):
    - The host sets `uic_code_mode: true` on the forwarded `system/init` `io_message` when `configService.isCodeModeOn()` returns true.
    - The webview then inserts a `tip` with subtype `code_mode` and a `notice` block: icon `code`, message "Code Mode (experimental) is on", detail "this session can be resumed only with Code Mode on".
    - It is inserted just before the last user message, so it appears as a standalone line above that prompt's turn.
    - It is shown once per conversation. Repeated `init` events (every turn, or a relaunch after `/add-dir`) are de-duplicated by checking for the subtype.
  - **`conversation_reset`** (sent for `/clear`, `/reset`, `/new`, and leaving plan mode with "clear context") calls `resetConversation()`. This clears messages, in-flight prompts, subagent messages, todos, the summary and the token count, so the chat becomes empty.
  - **Tool result linking** (`W/utils/messageUtils.ts` `processAndAttachMessage`): a `tool_result` is attached through a signal to its `tool_use` (`setToolResult`). The structured `toolUseResult` / `tool_use_result` is set before it. The user message that carries only results is then empty and is skipped.

- **TurnView: one turn** (`W/components/Messages/TurnView.vue`)
  - **Layout:** the user bubble (`UserMessage`, only if `turn.user` exists), then `.turn-body`, inset by `--cs-edge + --cs-row-inset`.
  - **Building rows from the assistant messages:**
    - A `user` message inside the turn (a mid-turn prompt) becomes a `prompt` row, rendered by `UserMessage`.
    - A string content becomes one text block.
    - A `thinking` block becomes a `thought` row (`ThoughtRow`).
    - Consecutive `Read`, `Glob` and `Grep` tool calls merge into one `explore` row (`ExploredRow`). Any non-explore row in between starts a new group.
    - Any other `tool_use` becomes a `tool` row (`ContentBlock` → `ToolBlock` card).
    - A `text` block becomes a `text` row.
    - `tool_result` blocks are skipped.
    - Everything else (image, hook, notice, llm_error, document, usage report, …) becomes an `other` row.
  - **Plan file writes are hidden.** A Write, Edit or MultiEdit whose `file_path` matches an `ExitPlanMode.input.planFilePath` in the same turn, or contains `/.claude/plans/`, is dropped. Paths are compared with backslashes turned into slashes and lower-cased. The reason is that the plan card already shows the plan.
  - **The "Working" / "Worked for" header**
    - It appears only when the turn has work, meaning at least one thought, explore or tool row.
    - It is a `button.cs-step` with `aria-expanded`.
    - Its text is "Working" while the turn runs and "Worked for {duration}" when it is done. The duration is the last assistant message's timestamp minus the prompt's timestamp, not the turn's `result` time.
    - A chevron is always shown.
    - "Ctrl+O to expand" is shown only while the turn is folded.
  - **Expanded vs folded**
    - A turn with no work is always expanded.
    - Otherwise `expanded = override ?? transcriptDetail`. `transcriptDetail` defaults to true, so every turn, including turns loaded from history, starts expanded.
    - Clicking the header flips the override for this turn only.
    - The override is cleared when the turn starts or stops running, and whenever Ctrl+O changes `transcriptDetail`. So a turn opened by hand while it ran folds again when it ends, if folding is on globally.
  - **What a folded turn still shows:** `other` rows, `prompt` rows, `ExitPlanMode` and `AskUserQuestion` cards, and only the last text row (the final answer).
  - **Footer** (shown only when the turn is finished and has final text)
    - A copy button (24px). Its tooltip is "Copy message", and it switches to a check icon with "Copied" for 1.2s.
    - It copies the raw markdown of the last text block. It falls back to a hidden textarea plus `execCommand('copy')` when the clipboard API fails.
    - The "ago" label is computed and not refreshed on a timer, so it only updates when the turn re-renders.
  - **Mismatch with the docs:** `H/docs/CLAUDE_UI.md` says "turns loaded from history start folded". The code (`W/composables/useTranscriptDetail.ts`) defaults to expanded for every turn.

- **ThoughtRow** (`W/components/Messages/rows/ThoughtRow.vue`)
  - A one-line step reading "Thought", plus a muted "briefly" when the trimmed text is under 160 characters. The SDK does not report thinking time.
  - It starts closed, even when Ctrl+O has steps shown. A click toggles it.
  - When open, the text is pre-wrapped, selectable, color `--cs-fg-52`, max 320px tall with its own scroll.

- **ExploredRow** (`W/components/Messages/rows/ExploredRow.vue`)
  - The header reads "Explored" plus a summary such as "N file(s), M search(es)". Files are counted as unique paths; each Glob or Grep counts as one search.
  - It starts closed. A click lists one line per call:
    - "Read" + file base name, plus a range "L{offset+1}-{offset+limit}". With only an offset the range is open-ended, e.g. "L5".
    - "Searched files" + pattern (Glob).
    - "Grepped" + pattern (Grep).
  - A Read file name is a link button. It calls `fileOpener.open(path, {startLine, endLine})`, which sends `open_file`. On hover it gets an underline.
  - Lines do not wrap and are cut with an ellipsis.

- **UserMessage: the prompt bubble** (`W/components/Messages/UserMessage.vue`, `W/utils/userText.ts`)
  - A right-aligned bubble: max 85% width, 12px radius, 1px `--cs-fg-20` border that darkens on hover, editor background.
  - The text is the user's text blocks joined with a space and shown pre-wrapped. Selection, opened-file and diagnostics blocks are not shown in the bubble.
  - The text is clamped to 120px with overflow hidden. There is no expand control. Thumbnails do not count against the 120px.
  - Attached base64 images appear as 64×64 thumbnails above the text, labelled "View image N" for screen readers. Clicking one opens `ImageLightbox`.
  - **Actions row under the bubble** (it always keeps its height so hover never shifts rows; the buttons appear on hover, on focus, or while showing "Copied"):
    - Copy prompt: Tooltip "Copy message", then "Copied" with a check icon for 1.2s.
    - "Restore checkpoint" (restore icon): shown only if ChatPage provided `RestoreCheckpointKey` and the message has a `uuid`. It calls `chatInputRef.openRewind(message)`, which is the same as Esc Esc on that message: Rewind opens on its "what to restore" step.
    - Mid-turn prompts have no uuid, so they have no restore button.
  - The bubble cannot be edited in place, matching the CLI. Earlier prompts are changed through Rewind.

- **AssistantMessage / MessageRenderer / ContentBlock** (`W/components/Messages/AssistantMessage.vue`, `W/components/Messages/MessageRenderer.vue`, `W/components/Messages/ContentBlock.vue`)
  - `MessageRenderer` picks a component by message type: user → UserMessage, assistant → AssistantMessage, tip → TipMessage, slash_command_result → SlashCommandResultMessage, bash → BashMessage, system → SystemMessage. Any other type renders nothing. It skips empty messages and adds a 4px bottom margin.
  - In practice `MessageRenderer` only gets loose items. Assistant messages always go into turns, so `AssistantMessage` is effectively unused (the docs say the same).
  - `ContentBlock` maps block types to components:

    | Block type | Component |
    |---|---|
    | text | TextBlock |
    | thinking | ThinkingBlock |
    | image | ImageBlock |
    | document | DocumentBlock |
    | interrupt | InterruptBlock |
    | notice | NoticeBlock |
    | hook | HookBlock |
    | llm_error | LLMErrorBlock |
    | selection | SelectionBlock |
    | opened_file | OpenedFileBlock |
    | diagnostics | DiagnosticsBlock |
    | tool_use | ToolBlock |
    | tool_result | ToolResultBlock |
    | usage_report | UsageReportBlock |
    | anything else | UnknownBlock |

  - Only `tool_use` gets the `wrapper` prop, because it needs the tool-result signal.

- **TextBlock: markdown rendering** (`W/components/Messages/blocks/TextBlock.vue`)
  - **Engine and options**
    - Its own `Marked` instance, so these overrides do not leak to other uses of the global `marked`.
    - `gfm: true`, `breaks: true`.
    - A line break is rendered as `<span class="md-br">`, a 6px block spacer, so sentences on separate lines get a small gap.
  - **No sanitizing:** the HTML is not sanitized. DOMPurify is a TODO. Raw HTML in a reply is put in through `v-html`.
  - **Styles**
    - Body: 14px/22px, editor foreground, selectable.
    - 16px gap between top-level blocks, none above the first.
    - h1 18px, h2 16px, h3 14px; all weight 600, line-height 1.4.
    - Lists: `ul` disc, nested `ul` circle, `ol` decimal with a 20px indent; markers muted.
    - Blockquote: 2px left rule, muted text.
    - Links: link color, underline on hover.
    - Tables: `display: block`, `max-width: 100%`, their own horizontal scroll. Header cells are bold with a tinted background.
  - **Inline code:** editor monospace font, 12.6px, tinted background, 5px radius, `word-break: break-all`.
  - **Code blocks**
    - Every `<pre>` is wrapped in `.code-block` with a copy button (top-right, 24px, codicon copy). The button is hidden until the block is hovered or the button is focused.
    - Pre: 12px/20px, rounded border, tinted background. Text wraps (`pre-wrap`, `overflow-wrap: anywhere`) instead of scrolling sideways. 34px right padding keeps text out from under the button.
    - Inside a list item or blockquote, a code block gets 8px vertical margin.
    - Copy removes the final newline, so a command pasted into a shell does not run. The icon switches to a check with title "Copied" for 1.2s. Same textarea fallback as elsewhere.
    - Clicks are handled by delegation, because the buttons live in `v-html` and are rebuilt while text streams.
  - `isSlashCommand` text gets link color and bold weight (`.slash-command-text`).

- **Mermaid diagrams** (`W/components/Messages/blocks/TextBlock.vue`, `W/utils/mermaid.ts`, `H/res/webview/preview/mermaid.js`, `H/res/webview/preview/libs.js`, `H/src/terminal/terminalPanel.ts`)
  - **What counts as a diagram:** a fenced code block (not an indented one) whose language's first word is `mermaid` (any case), whose fence is closed, and whose body is not empty.
  - While the fence is still streaming it stays a plain code block, because half a diagram is a syntax error.
  - **Where it is drawn:** the library is not bundled into the chat app. The webview calls `window.parent.aiCliPreviewMermaid.renderSvg(source, theme)` in the host terminal webview, which is same-origin.
    - The host loads mermaid on first use through `aiCliPreviewLibs.mermaid()`.
    - `node_modules/mermaid` is a `localResourceRoot` in `terminalPanel.ts`.
    - Settings: `securityLevel: 'strict'`. Drawing happens in an off-screen scratch element, and leftover temp nodes are removed.
    - Mermaid is re-initialized when the theme changes.
  - **Theme:** chosen by the luminance of `--vscode-editor-background`. Above 140 → `default`, otherwise `dark`. If the color cannot be read, it falls back to the `vscode-light` body classes.
  - **Cache:** keyed by theme plus source. Each diagram renders once and the result is shared by every message and re-render. Requests already in flight are de-duplicated. A finished render is read synchronously, so the SVG appears with no flash.
  - **Pending:** the source is shown as a code block until the SVG arrives. Then `mermaidVersion` increases and the markdown renders again. Nothing happens if the component was unmounted.
  - **Success:** `.mermaid-diagram`, centered, bordered, scrolls sideways if needed, SVG `max-width: 100%`. Tools in the top-right appear on hover:
    - A toggle: "Show code" (codicon-code) or "Show diagram" (codicon-type-hierarchy).
    - Copy, which always copies the mermaid source.
    - Whether a diagram shows its code is stored per TextBlock instance in a reactive set, keyed by diagram.
  - **Failure:** the code block stays, with a red line under it, "Mermaid: {first line of the error}". There is no toggle in this case.
    - Outside the host (a plain Vite dev page, or a cross-origin parent) the error reads "Mermaid is not available here".

- **Links** (`W/utils/linkHandler.ts`, installed in `W/App.vue`; host side in `H/src/claude/services/claude/handlers/handlers.ts`)
  - A global capture-phase listener for `click` and `auxclick` (left and middle buttons) on `a[href]`.
  - An empty href or one starting with `#` is left alone.
  - `http(s):` and `mailto:` send `open_url`. The host's `handleOpenURL` checks the scheme again (only web and mail links) and calls `vscode.env.openExternal`.
  - `file://` URLs are decoded, and `file:///C:/x` becomes `C:/x`.
  - Any other scheme (`vscode:`, `command:`, `javascript:`, …) is ignored. A Windows drive path such as `C:\` is not treated as a scheme.
  - Other hrefs are URI-decoded, then parsed for a location: `path:12`, `path:12:3` (the column is ignored), `path:12-20`, `path#L12`, `path#L12-L20`. A single line opens as start = end. Any other hash is stripped.
  - Opening sends `open_file`. The host's `handleOpenFile`:
    - resolves the path with `findFiles` / `resolveExistingPath` against the workspace;
    - reveals a folder in the Explorer;
    - otherwise opens the file (not as a preview tab), reveals the range centered, and selects it.

- **Images and the lightbox** (`W/components/Messages/blocks/ImageBlock.vue`, `W/components/Common/ImageLightbox.vue`)
  - **ImageBlock:** only base64 sources are shown, as a data URL. Max width 100%, bordered, zoom-in cursor. A click opens the lightbox. If the image fails to load, or the source is not base64, a dashed placeholder reads "Image failed to load".
  - **ImageLightbox**
    - Teleported to `body`. A fixed backdrop at z-index 10000, `role="dialog"`, `aria-modal`.
    - The image is fitted with `object-fit: contain`.
    - An optional caption.
    - A close button (top-right, 28px).
    - Clicking the backdrop closes it.
    - Esc closes it. The Esc listener is in the capture phase and stops propagation, so the chat's own Esc (interrupt, rewind) does not also fire.

- **Other non-tool blocks** (`W/components/Messages/blocks/*.vue`)
  - **InterruptBlock:** yellow info icon plus italic "Interrupted" or "Tool interrupted". It is left-aligned and appears as a standalone tip item that ends the turn.
  - **LLMErrorBlock:** red error icon (`testing-iconFailed`) plus the error message in italic error color, centered.
  - **NoticeBlock:** a centered marker line with hairlines up to 80px on each side, 12px text at 65% foreground. It has an optional codicon (`fold` for compaction, `code` for Code Mode), the message, and a detail at 0.8 opacity.
  - **HookBlock**
    - Head: an icon, the hook name, and a label. The labels and icons by kind:

      | Kind | Label | Icon |
      |---|---|---|
      | error | "hook error" | warning |
      | blocked | "hook blocked" | circle-slash |
      | stopped | "hook stopped the turn" | debug-stop |
      | message | "says" | info |

    - "exit N" is shown only for `error` with a non-zero exit code. Exit 2 is implied by "blocked".
    - Hovering the head shows the hook's command as a tooltip.
    - The hook's output appears in a `<pre>` below. In a turn it is an `other` row, so it stays visible when the turn is folded.
  - **ThinkingBlock:** a collapsible "Thinking..." with a chevron up or down, closed by default (reka-ui `Collapsible`). It is only reachable outside TurnView; inside turns, thinking becomes ThoughtRow.
  - **SelectionBlock:** "📝 label". A click opens the file at the selected lines. **OpenedFileBlock:** "📂 Opened: name". A click opens the file. **DiagnosticsBlock:** "🔍 Diagnostics (N)", with a list of `file:line:col`, message and code, colored by severity. A click opens the file at that line.
    - All three need `context`. Since UserMessage drops non-text blocks, they rarely render.
  - **DocumentBlock:** "📄 {title or 'Document'}". It is a label only.
  - **ToolResultBlock:** "Tool Result (orphaned)" plus the content (JSON if it is not a string). It only appears outside TurnView, because TurnView skips `tool_result`.
  - **UnknownBlock:** "Unknown content type" plus the block as pretty-printed JSON.
  - **UsageReportBlock** (the `/usage` card)
    - Header: pulse icon, "Usage", and the plan name.
    - Meters show a percent and a bar clamped to 0–100: warn at 70% or more, danger at 90% or more. "Resets …" appears under a meter when known.
    - An optional "contributing" section with a caption and periods. Each period has a label, stats, items (thin muted bar, percent, text, and a hint in which `/commands` are shown as `<code>`), facets and notes.
    - Notes for the whole card.
  - **SlashCommandResultBlock:** ✓ / ❌ plus "Command Output" / "Command Error" and a `<pre>`. It is used only through ContentBlock; standalone results use the message component below.

- **Standalone message components** (`W/components/Messages/*.vue`)
  - **SlashCommandResultMessage:** only for a message with exactly one `slash_command_result` block. Header icon `codicon-pass` or `codicon-error`, label "Command Output" or "Command Error", then the result in a scrollable `<pre>`. The class `command-success` or `command-error` sets the colors.
  - **BashMessage:** for `!command` bash mode. Each block shows a "!" prompt plus the command, the stdout in a `<pre>`, and the stderr in a `<pre>` styled as stderr. A block with no command and no output shows "(no output)". An interrupted shell adds "Command interrupted" to stderr (`W/core/Session.ts`).
  - **TipMessage:** renders each content block through ContentBlock without context. It is used for interrupts, LLM errors, notices (compaction, Code Mode), standalone hooks, and usage cards.
  - **SystemMessage:** a "System" label plus the string content, or "Session initialized" / "System message". `Message.fromRaw` never creates `system` messages, so it is effectively unreachable.
  - **RandomTip** (`W/components/RandomTip.vue`): Clawd plus a random tip chosen from 12 on mount. The keyboard hint says "Alt" on Windows and "Option" elsewhere. Nothing imports it, so it is unused.

- **Empty state** (`W/pages/ChatPage.vue`, `W/components/ClaudeCodeLogo.vue`)
  - When there are no messages, `.main.is-empty` hides the messages container. An `.empty-top` spacer holds the logo at its bottom: `ClaudeCodeLogo`, or `OmpLogo` (`W/components/OmpLogo.vue`) in an OMP tab.
  - The logo is the Clawd mascot, a pixel-art "Claude Code" wordmark SVG (248×28), and the CLI version line.
  - The version line reads "vX.Y.Z". Until the version is known it holds a non-breaking space, so nothing moves when the version arrives.
    - The version comes from the `get_cli_version` request. The host runs `claude --version` with a 10s timeout, cached per CLI path for the extension's lifetime, and extracts the semver. On failure the line stays blank.
  - The input sits centered. Its idle height is measured once each time the chat becomes empty (`--empty-input-height`, default 160px), so its top edge stays fixed while a panel or a longer prompt grows it downward.
  - If there is less than 90px above the input, the logo is hidden through a container query rather than shown half-clipped.
  - **Recent conversations under the input**
    - Shown only while the chat is empty, the session has no id, and there is no open conflict.
    - Up to 5 rows. Conversations already open in another tab are skipped: the webview checks up to 10 candidates with `getSessionOwner`, and if that check fails it shows all candidates.
    - Each row shows the summary (or "Untitled conversation") and `formatAgo`. A click calls `openExisting`.
    - A "View all" button goes to the sessions page.
  - **Header buttons:** "New conversation" (`startNewConversationTab`; tabs are managed by the host's tab strip) and "Show chat history" (switches to the sessions page).

- **Scrolling: following new output and the "New messages" button** (`W/pages/ChatPage.vue`)
  - **Following**
    - `following` starts as true. "At the bottom" means within 10px (`FOLLOW_SLACK`).
    - On each scroll event: at the bottom sets `following = true`. Only a move up of more than 1px (wheel, keys, scrollbar, jumping to a prompt) sets `following = false`. Content growing never lowers `scrollTop`, so a row that grew between frames does not end following.
    - A `ResizeObserver` watches the container and every direct child, and a `MutationObserver` adds and removes children from it. While following, `scrollTop` is set to `scrollHeight` synchronously, before paint. This keeps streaming text, tool results, opening blocks and a growing input pinned to the bottom.
  - **New rows:** when the message count goes up, the view scrolls to the bottom if following. Otherwise `newBelow = true`. Text growing inside an existing message does not set it.
  - **`followLatest()`** (back to the bottom and following again) runs on: mount, a session switch, sending a prompt (`handleSubmit`), "Send immediately", a bash command, and any change in the number of permission requests. The last one forces the tool call the prompt is about into view.
    - Typing a prompt while Claude works (`handleQueueMessage`) does not scroll.
  - **"New messages" pill:** an arrow-down icon plus "New messages", tooltip "Scroll to the latest message".
    - It floats centered 6px above the input area and over the transcript, so nothing moves when it appears.
    - Rounded, with a shadow; its border darkens on hover.
    - It is hidden while the transcript is dimmed.
    - It clears itself once the view is back at the bottom.
  - `scrollToBottom` uses `requestAnimationFrame` and `endEl.scrollIntoView({block: 'end'})`.
  - **Visual details**
    - A 28px fade mask at the bottom of the transcript, so rows fade out under the input.
    - Top padding 10px, bottom padding equal to the fade.
    - On a wide pane (Agent-mode main panel) the transcript is one centered column (`--cs-column-max`), while the scrollbar stays at the pane edge.
    - No horizontal scrolling.
  - **Dimmed transcript:** while a permission request is pending, except `ExitPlanMode` and `AskUserQuestion`, the transcript is blurred by 1px, set to 50% opacity, and stops taking pointer events. The plan and question cases stay readable because the user decides them by reading the transcript.

- **StickyPrompt: the current turn's prompt pinned at the top** (`W/components/Messages/StickyPrompt.vue`, `W/pages/ChatPage.vue`)
  - When the transcript is scrolled, the prompt of the turn at the top of the view is shown as a one-line copy, pinned at `top: 2px`, drawn over the transcript (z-index 5), with an ellipsis.
  - The copy has the same left edge and width as the real bubble, measured from it.
  - **Which prompt:** the last turn whose `.user-message .message-text` top has gone above the container's top.
  - **Hidden when:**
    - the view is at the bottom (within 2px);
    - the transcript is dimmed;
    - the turn has no user prompt;
    - no prompt has gone above the top yet.
  - **Showing and hiding:** it is shown only while scrolling (it hides 800ms after the last scroll event, like an overlay scrollbar) or while the pointer is on it.
    - Leaving it with the pointer restarts the 800ms countdown.
    - If the copy disappears without a mouseleave (after a jump, or after scrolling back down), the hover state is reset.
  - **Push-up:** as the next turn's bubble approaches, the copy is pushed up: `translateY(min(0, nextTop − pin − 40 − 6))`.
  - It fades in and out over 0.18s. Because it is keyed by turn, the next prompt cross-fades in.
  - Click (tooltip "Scroll to this message") scrolls that turn's `.user-message` into view at the top.
  - Updates are throttled to one per animation frame. They are triggered by scroll, by a `ResizeObserver` on the container, and after `chatItems` changes.
  - The text is the prompt's plain text with whitespace collapsed.

- **WaitingIndicator: the spinner row** (`W/components/Messages/WaitingIndicator.vue`, `W/pages/ChatPage.vue`)
  - Shown after the last item while `isBusy || shellRunning`, and hidden while a permission prompt waits for the user. It is inset to the text column.
  - **Icon:** the frames `· ✢ * ✶ ✻ ✽`, played forward then backward (12 frames), one frame every 120ms, in monospace.
    - Icon color follows the permission mode (`data-permission-mode`): `acceptEdits` uses the primary foreground; `plan` uses the focus-border color.
  - **Verb:** chosen at random from about 84 whimsical verbs ("Clauding", "Flibbertigibbeting", …) and followed by "...". A new verb is picked at 2s, then 3s, then 5s, then every 5s.
    - Each new verb types in with a scramble effect: a `▌` cursor and `.` / `_` noise, one step every 40ms.
    - The text is padded to the longest verb plus 3, so its width never jitters.
  - **Stats** (12px, muted, 3 spaces between parts): elapsed time, "↓ N.Nk tokens", and "esc to interrupt".
    - "esc to interrupt" is added only when at least one other part is shown.
    - For a bash-only run, there is no start time and no tokens, so only the verb shows.
    - The clock ticks every second.
  - **Retry line** (replaces the stats, in warning color): "API error (503), retrying in Ns   attempt a/m", or "retrying" once the wait reaches 0.
  - `startedAt` is set to `Date.now()` when `busy` becomes true, and `activity.beginTurn()` resets the token count and any retry.

- **useLiveActivity / LiveActivity: live turn data** (`W/composables/useLiveActivity.ts`, `W/core/LiveActivity.ts`)
  - `useLiveActivity` wraps the active session's `LiveActivity` signals as Vue shallow refs and follows the active session when it changes. The refs are `subagentMessages`, `tasks`, `backgroundTasks`, `rateLimit`, `apiRetry` and `turnTokens`. It also provides `stopTask(id)`, which returns an error string, and `beginTurn()`.
  - **Events kept out of the transcript** (`handle()` returns true for them): every `stream_event`, every `rate_limit_event`, and assistant or user events that have a `parent_tool_use_id`. The last group are subagent messages, shown inside their Agent card.
  - **Token estimate** (main chain only):
    - Text and tool-input deltas count about 4 characters per token.
    - Thinking counts as the larger of its characters / 4 and the `system/thinking_tokens` estimate.
    - When `message_delta.usage.output_tokens` arrives, that real number replaces the estimate for the message and is added to the committed total.
  - **Retry:** `system/api_retry` sets `apiRetry` (attempt, max, `retryAt = now + delay`, status). It is cleared on `message_start`, on any main-chain assistant message, on `result`, and on `beginTurn`.
  - **Tasks:** `system/task_started`, `task_progress`, `task_updated` and `task_notification` patch `TaskInfo` (only fields that are not null). `background_tasks_changed` replaces the background list, dropping `ambient` tasks.
  - Rate-limit info is fed to `RateLimitBanner`, which sits above the input.
  - Number formats: `formatTokenCount` uses a lowercase "k" and "M". `formatDuration` here floors the seconds and goes up to "1h 2m". This is not the same function as `turns.ts` `formatDuration`.

- **Ctrl+O: transcript detail** (`W/composables/useTranscriptDetail.ts`, `W/pages/ChatPage.vue`, `W/utils/KeybindingManager.ts`)
  - `transcriptDetail` is a module-level ref, default `true` (all steps shown). Ctrl+O toggles it for every turn.
  - The binding works even while typing in the input (`allowInEditable`), priority 50. When it matches, the key's default action is prevented and propagation stops.
  - When it is false, a badge "Steps folded  Ctrl+O to show" floats at the top-right of the transcript (11px pill, ignores the pointer, so nothing moves).
  - Thoughts, explored lists and tool cards always start closed regardless of this setting. Only the turn-level fold follows it.
  - **Related shortcuts registered in ChatPage**
    - Shift+Tab: cycle the permission mode (priority 100).
    - Ctrl+U: send every held prompt now. Active only when there is a held prompt and no permission prompt.
    - Esc (priority 50): stop the running turn, or cancel the bash command if one is running.
      - Active only while busy or a shell is running, with no permission prompt, focus not in the background-task list, and no `.dropdown-popover` or `.command-panel` open.
    - Esc (priority 60): with a permission prompt open but focus outside it, focus the prompt's options and send them a synthetic Escape, which cancels the prompt.

- **Interrupt: what Esc or Stop does** (`W/pages/ChatPage.vue` `handleStop`, `W/core/Session.ts`)
  - **Step 1:** take every queued prompt back into the input, ahead of what is typed there. First those already in the CLI's queue (`withdrawInFlight`, so they do not run), then those held in the UI. Their attachments come back too.
  - **Step 2:** if no tool has run yet in the current turn, the prompt is withdrawn (`withdrawLastPrompt`):
    - interrupt, wait up to 5s for idle;
    - rewind the conversation to before that prompt, or drop it locally if the CLI never recorded it;
    - put the prompt text and its attachments back into the input, ahead of anything already typed. This matches the CLI.
  - **Otherwise:** `session.interrupt()`, which sends `interrupt_claude {channelId}`. The host's `ClaudeAgentService.interruptClaude` calls `query.interrupt()`.
  - The CLI's "[Request interrupted by user]" text then appears as the "Interrupted" line.

- **Export: `/export`** (`W/utils/exportTranscript.ts`, `W/components/ChatInputBox.vue`, `H/src/claude/services/claude/handlers/handlers.ts` `handleExportConversation`)
  - `/export` opens a list panel with "Save to file" (detail: "markdown, through a save dialog") and "Copy to clipboard".
  - `/export <name>` goes straight to the save flow with that name. ".md" is added unless the name already ends in `.md` or `.txt`.
  - With no messages, a warning toast says "Nothing to export yet".
  - **Markdown produced by `transcriptToMarkdown(messages, title)`**
    - Title: `# {session summary or "Claude conversation"}`.
    - Only `user`, `assistant`, `slash_command_result` and `bash` messages are included.
    - Role headings: `## User` for user and bash messages, `## Claude` for assistant and slash-command results. Consecutive messages with the same role share one heading.
    - Text is copied as is. Thinking goes in `<details><summary>Thinking</summary>`.
    - A tool call becomes `**Name(main argument)**`. The main argument is the first of command, file_path, notebook_path, pattern, url, query, description or prompt, collapsed to one line and cut at 160 characters with "…".
      - It is followed by the result in a fence, cut to 12 lines with "… +N lines". Error results get an "Error:" label first. Image parts in a result appear as `[image]`.
    - Other blocks:
      - Images → `[image]`; documents → `[document]`.
      - Selections → `[selection: label]`; opened-file blocks are dropped.
      - Interrupts and notices are written in italics.
      - Slash-command output is fenced.
      - LLM errors → `**Error:** …`.
      - Bash → a fenced `! cmd` and a fenced, shortened output.
    - `tool_result` blocks are skipped.
    - Every fence is longer than any run of backticks inside it, so content cannot close it.
  - **File name** (`exportFileName`): `claude-<slug>-YYYY-MM-DD.md`. The slug is ASCII, built from the title (NFKD-normalized, symbols removed), at most 50 characters, with no trailing dash.
  - **Host side** (`export_conversation {markdown, target, fileName}`):
    - Clipboard: `vscode.env.clipboard.writeText`. The toast says "Conversation copied to clipboard".
    - File: characters illegal in file names become "-". A save dialog opens in the workspace folder with Markdown and Text filters and an "Export" button. Cancelling returns `cancelled` and shows no toast. Otherwise the file is written and the toast says "Conversation exported to {path}".
    - Any failure shows an error toast "Export failed: …".

- **Host and webview messages used by this area** (`W/transport/BaseTransport.ts`, `H/src/claude/shared/messages.ts`, `H/src/claude/services/claude/handlers/handlers.ts`, `H/src/claude/services/claude/ClaudeAgentService.ts`)
  - **Host → webview**
    - `io_message {channelId, message}` carries every SDK event:
      - user and assistant messages;
      - `system/init`, with `uic_code_mode` added when Code Mode is on;
      - `system/compact_boundary`, `system/hook_response`, `system/api_retry`, `system/thinking_tokens`, `system/task_*`, `system/background_tasks_changed`, `system/session_title_changed`;
      - `stream_event`, `rate_limit_event`, `result`.
    - Synthetic events: `__llm_request_error__`, `conversation_reset`, `command_lifecycle` (a mid-turn prompt that was taken in becomes a `midTurn` message).
  - **Webview → host requests**

    | Request | Used for |
    |---|---|
    | `open_file {filePath, location}` | links, ExploredRow, selection, diagnostics |
    | `open_content` | tool context, `openContent` |
    | `open_url {url}` | web and mail links |
    | `get_cli_version` | empty-state version line |
    | `export_conversation` | `/export` |
    | `interrupt_claude {channelId}` | stopping a turn |
    | `getSessionOwner` / `focusTab` | recent conversations, open-elsewhere conflict |

  - **Not a message:** mermaid rendering goes through the same-origin call `window.parent.aiCliPreviewMermaid.renderSvg`, not through postMessage.

## B3. Thẻ tool, subagent, background tasks, prompt xin quyền / hỏi đáp / plan

Path legend: `W/` = `webview-ui/claude/src/`, `H/` = `src/claude/`

### 1. How a tool call gets to a card

- **Which component draws a block** (`W/components/Messages/ContentBlock.vue`)
  - A `tool_use` block goes to `ToolBlock`, along with its `ContentBlockWrapper`, which holds the reactive tool_result signal.
  - A `tool_result` block on its own goes to `ToolResultBlock`.
  - Unknown block types go to `UnknownBlock`.
- **ToolBlock dispatcher** (`W/components/Messages/blocks/ToolBlock.vue`)
  - Any name starting with `mcp__` goes to `McpTool`. This check runs before the switch.
  - The switch maps `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `BashOutput`, `ExitPlanMode`, `AskUserQuestion`, `KillShell`, `MultiEdit`, `NotebookEdit`, `SlashCommand`, `Task` **and `Agent`** (the CLI's current name for Task, same card), `TodoWrite`, `WebFetch`, `WebSearch`, `REPL` (Code Mode) and `Poll` to their cards. Anything else goes to `Default`.
  - `toolResult` comes from `useSignal(wrapper.toolResult)`, so it updates live. Without a wrapper it is `ref(undefined)`.
  - `toolUseResult` is the structured CLI output, a plain property on the wrapper. It is a computed value that depends on `toolResult`, so it is re-read when the result lands.
  - Every card receives the same props: `toolUse {name, input, id}`, `toolResult`, `toolUseResult`, `context`.
- **Orphaned result** (`W/components/Messages/blocks/ToolResultBlock.vue`)
  - A `tool_result` with no matching tool_use shows the label "Tool Result (orphaned)".
  - Under it is a `<pre>` holding the content: the string as is, else `JSON.stringify(…, null, 2)`, else `String()`.
- **Grouping inside turns** (`W/components/Messages/TurnView.vue`, `W/components/Messages/rows/ExploredRow.vue`)
  - Inside a turn, consecutive `Read`/`Glob`/`Grep` calls are **not** drawn as cards. They merge into one **"Explored"** row.
    - The summary reads "N file(s), M search(es)". Files are counted by unique path.
    - The row starts closed, also when Ctrl+O detail is on. A click lists one line per call.
    - Read lines show "Read <basename>" with a range `L<start>-<end>`. Clicking opens the file and selects the range.
    - Glob lines show "Searched files <pattern>". Grep lines show "Grepped <pattern>".
    - So the standalone Read/Glob/Grep cards appear only where a block is drawn outside this grouping (for example through `MessageRenderer`).
  - Write/Edit/MultiEdit calls whose `file_path` is this turn's ExitPlanMode `planFilePath`, or contains `/.claude/plans/`, are hidden. The plan card already shows that text.
  - `ExitPlanMode` and `AskUserQuestion` cards are in `ALWAYS_SHOWN_TOOLS`. They stay visible when the turn's steps are folded.
  - Turn folding:
    - The header shows "Working", or "Worked for <duration>" once the turn ends.
    - While folded it adds the hint "Ctrl+O to expand".
    - Ctrl+O (`transcriptDetail`, on by default) folds or unfolds every turn. A click toggles one turn.
    - The user's toggle is reset when the turn starts or stops running, and when `transcriptDetail` changes.
- **ToolContext / opening files** (`W/types/tool.ts`, `W/pages/ChatPage.vue`, `W/core/AppContext.ts`, `W/transport/BaseTransport.ts`, `H/services/claude/handlers/handlers.ts` `handleOpenFile`)
  - `fileOpener.open(path, {startLine, endLine})` sends the webview→host request `open_file`. On the host:
    - The path is resolved through `findFiles` / `resolveExistingPath` against the workspace cwd.
    - A directory gets `revealInExplorer`.
    - A file opens with `showTextDocument(preview:false)`. The given range is selected and revealed centered. Lines are 1-based, converted to 0-based.
    - On failure the host logs and throws "Failed to open file: …".
  - `fileOpener.openContent(content, fileName, editable)` sends `open_content`.
  - `W/core/ToolContext.ts` is a separate signal-based class (`isSuccess` / `isError` / `getOutput`). None of the cards use it.

### 2. Shared card parts (`W/components/Messages/blocks/tools/common/`)

- **ToolMessageWrapper.vue**, the frame of every standard card
  - **Two layouts:**
    - Standard (class `is-card`): a main line, then either the expanded body or a collapsed preview.
    - `isCustomLayout`: renders only the `#custom` slot. Used by ExitPlanMode and AskUserQuestion.
  - **Main line**, left to right:
    - A tool icon (codicon, `codicon-tools` by default) or the `#icon` slot.
    - A Tooltip around the icon showing `toolName`, default **"Tool"**. Cards that don't pass `tool-name` (Bash, Glob, NotebookEdit, KillShell, McpTool, SlashCommand, WebFetch, WebSearch, Default) all show "Tool" on hover.
    - The `#main` slot. Long text is cut with an ellipsis (nowrap).
    - A status dot.
    - A `chevron-right` that rotates when expanded. It appears only if the card is expandable.
  - **Expandable** when an `#expandable` slot exists **or** `toolResult.is_error` is true. A click anywhere on the main line toggles it; non-expandable cards ignore clicks.
  - **Default state is always collapsed.**
    - The `defaultExpanded` prop is accepted but **ignored**: the getter returns `false` until the user toggles.
    - So every `shouldExpand` computed in the cards (Edit, Write, Bash on error, WebFetch with result, and others) has no effect. Diffs, errors and permission-phase previews all start closed.
    - The code comment says an error is signalled only by its red dot.
    - The open state sits in the component (`userToggled`). It is lost if the card remounts.
  - **Preview:** the `#preview` slot shows under the main line only while collapsed (the `v-else-if` branch). Clicking the preview also toggles.
  - **Expanded body** class `expandable-content`, `max-height: 480px`.
  - **Status dot** (`indicatorState`):
    - `error` when `toolResult.is_error`.
    - `pending` when `permissionState === 'pending'`.
    - Otherwise none: a finished tool gets no marker, as in Cursor.
  - **Accept/Reject buttons:** "Reject" / "Accept" (emit `deny` / `allow`) render only when `permissionState === 'pending'`. **No card passes `permissionState`**, so this path is dormant. Permissions are handled by the prompt above the input (section 6).
  - The `is-open` class is set when expanded and expandable.
- **ToolStatusIndicator.vue**: a 10px dot, class `status-success` / `status-error` / `status-pending`. Only error and pending are ever used.
- **ToolError.vue**: shows only if `toolResult.is_error`.
  - String content: the text inside `<tool_use_error>…</tool_use_error>` (trimmed) if present, else the raw string.
  - Array content: items joined with `\n` (strings as is, `text` blocks as their text, anything else JSON).
  - Object content: pretty JSON.
  - Otherwise: "Unknown error".
  - Displayed with `codicon-error` and the error text.
- **ToolFilePath.vue**
  - A button showing only the **basename**: split on `/`, falling back to `\`.
  - The Tooltip (side bottom) shows the full path.
  - Click: `stopPropagation` (doesn't toggle the card), `preventDefault`, then `context.fileOpener.open(path, {startLine, endLine})`.
  - With no fileOpener it only warns in the console.
- **codeModeResult.ts**, parsers for REPL and Poll. Output is always shown as text, never as HTML.
  - `toolResultText`: a string, or the `text` blocks of an array joined with `\n`.
  - `stripNoise` removes `<system>…</system>`, `<tools-used-before-summary>…`, and `<repl-output>` tags.
  - `parseSections` splits the text into ordered `result` / `error` / `log` sections plus loose `text` sections. Leading newlines and trailing whitespace are trimmed.
  - `dispatchedId` matches a result that is exactly `(dispatched #N)`.
  - `parsePollEvents`:
    - Reads the nonce list from "authentic event nonces for this delivery: …".
    - Accepts only `<event>` tags whose `nonce` is in that list. Event-shaped text without a valid nonce stays part of the enclosing body.
    - For old transcripts with no nonce line, it accepts only nonce-less events.
    - Pulls `kind`, `eval`, `status` and `ms` from each event, and splits each body into sections.
  - `firstLine`: the first non-empty line, trimmed.

### 3. Tool cards (`W/components/Messages/blocks/tools/`)

- **Read.vue**
  - Icon `codicon-eye-two`, tooltip "Read".
  - Label:
    - "Read lines S-E" when both `offset` and `limit` are set (S = offset+1, E = offset+limit).
    - "Read from line S" with only an offset.
    - "Read lines 1-L" with only a limit.
    - Otherwise "Read".
  - Then a ToolFilePath for `file_path` or `notebook_path`, carrying `startLine` (offset+1, else 1) and `endLine`. A click opens the file with that range selected.
  - Expandable only on error (ToolError). There is no content preview.
- **Write.vue**
  - The icon is a `FileIcon` (16px) chosen by file type. The `codicon-new-file` fallback is overridden whenever a path exists.
  - Main line: ToolFilePath plus stats "N Lines M Chars", computed from `input.content` (lines = split on `\n`).
  - Expanded, when there is content and no error:
    - A header with the file icon and basename.
    - A two-column view: line numbers 1..N, and the content in a `<pre>`.
    - The content column scrolls (`max-height: 400px`) and the number column follows it.
  - On error, ToolError only (the content view is hidden).
  - The data comes from the tool input only (`vcc-re` comment). The real file is not read.
- **Edit.vue**
  - FileIcon icon. Main line: ToolFilePath plus diff stats `+A` (green) and `-R` (red). Each is shown only if greater than 0.
  - The patch comes from a deep, immediate `watch`:
    - On error: no diff.
    - Otherwise `toolUseResult.structuredPatch` (the real hunks after the edit).
    - Otherwise, if both `old_string` and `new_string` are non-empty, a preview from `generateLinePatch`. This covers the permission phase and live runs that have finished.
  - Expanded:
    - A "Replace all" row (`codicon-replace-all`) when `replace_all` is set.
    - A file header (icon + basename).
    - A two-column diff: a line-number column, and a content column with a `+` / `-` / space prefix. Classes are `diff-line-add`, `diff-line-delete` and `diff-line-context`.
    - Line numbers: removed lines show the old number, counted from `oldStart`. Added and context lines show the new number, counted from `newStart`.
    - Scrolling is synced, `max-height: 400px`.
    - ToolError below.
  - Edge cases:
    - If `new_string` is empty (pure deletion) and there is no structuredPatch, no preview is built: the check is truthy on both strings.
    - All hunks are drawn back to back with no `@@` separators.
- **MultiEdit.vue**
  - Same template and logic as Edit; the path falls back to `notebook_path`.
  - **The preview fallback reads top-level `old_string` / `new_string`, which MultiEdit input does not have (it uses `edits[]`).** So a diff appears only once `toolUseResult.structuredPatch` exists. Before that the card shows just the file path, with no stats or diff.
- **utils/linePatch.ts `generateLinePatch`** (`W/utils/linePatch.ts`)
  - Splits both strings on `\n` and strips the common head and tail lines.
  - Keeps `CONTEXT = 1` line of context on each side.
  - Emits all removed lines, then all added lines (not interleaved).
  - Returns a single hunk. Line numbers are relative to the snippet, starting at 1 (plus head offset), not to the real file.
- **Bash.vue**
  - Icon `codicon-terminal`, tooltip "Tool".
  - Main line:
    - The label is `input.description` if present, else the full command.
    - If there is a description, a muted command name (the first word of the command) follows.
    - A "background" badge when `run_in_background` is set.
  - Collapsed preview: the first non-empty line of the output, shown when the result is a string and not an error. It updates live as the result arrives.
  - Expanded:
    - The command in a `<pre>`.
    - An "Output" header and the output `<pre>` (`max-height: 400px`). Only string `toolResult.content` is shown; array content is not.
    - ToolError.
  - Before a result arrives, the expanded view shows only the command, with no spinner.
- **BashOutput.vue**
  - Icon `codicon-terminal-two`.
  - Main line:
    - "BashOutput", then "Shell <id>" (from `input.bash_id` or `toolUseResult.shellId`).
    - A "running" badge with a spinning `codicon-loading` when `toolUseResult.status === 'running'`.
    - Otherwise "exit N", green when 0 and red otherwise, when an exitCode exists.
    - A "filtered" badge with `codicon-filter` when `input.filter` is set.
  - Output:
    - Prefers `toolUseResult.stdout` / `stderr`. When both exist they are joined as `stdout\n\n[stderr]\nstderr`; stderr alone gets the `[stderr]` prefix.
    - Otherwise it parses `<stdout>` / `<stderr>` tags from the live string result.
    - If neither matches, the raw content is shown.
  - Empty state: "No new output" with `codicon-info`. Then ToolError. `max-height: 400px`.
- **KillShell.vue**
  - Icon `codicon-stop-circle`.
  - Main line: "KillShell", "Shell <id>" (`input.shell_id` or `toolUseResult.shell_id`), and a green "✓ killed" badge when a message exists and there is no error.
  - The message is `toolUseResult.message`, else `JSON.parse(content).message`, else the raw content.
  - Expanded: an info row with the message, then ToolError.
- **Glob.vue**
  - Icon `codicon-search`. Main line: "Glob" plus the pattern in `<code>`.
  - It is always expandable, because the slot always exists.
  - Expanded:
    - "Search path: <path>". The path defaults to "." when none is given.
    - "Found N file(s):" with clickable ToolFilePaths.
    - The list comes from the result: an array as is, or a string split by lines with blanks dropped.
    - ToolError.
  - If there are no results there is no empty-state text, only the search path.
- **Grep.vue**
  - Icon `codicon-grep`. Main line: "Grep" plus the pattern.
  - Expanded:
    - An options grid: Path (folder icon), Filter (glob), Type, Mode (`output_mode`).
    - A "Flags:" list: "Ignore case" (`-i`), "Multiline", "Line numbers" (`-n`), "Context: N line(s)" (the first of `-A` / `-B` / `-C`), "Limit: N" (`head_limit`).
    - "Found N file(s):" with clickable paths. String results only; lines matching `Found N files` are filtered out.
    - In content mode, result lines (e.g. `file:line:text`) are still drawn as file buttons. The basename comes from splitting on `/`, so the opener gets the whole line.
    - ToolError.
- **NotebookEdit.vue**
  - Icon `codicon-notebook`.
  - Main line: "NotebookEdit", ToolFilePath(`notebook_path`), and an `edit_mode` badge with class `mode-<mode>`.
  - Expanded: "cell_id: …", then a `new_source` label and a `<pre>` (`max-height: 400px`), then ToolError.
  - Every field falls back from input to `toolUseResult`.
- **ExitPlanMode.vue** (custom layout)
  - A card with a "Plan" header (`codicon-tasklist`).
  - The body is `input.plan` (or `toolUseResult.plan`), rendered as Markdown with `marked` via `v-html`.
  - When collapsed the body is clipped to `max-height: 200px` (0.3s transition). Expanded removes the limit.
  - Footer button "Expand" / "Collapse" with a chevron down or up. It is hidden on error.
  - **Default:** expanded while there is no result (waiting for approval), collapsed once answered or reloaded from history. Set once at mount (`ref(!toolResult)`).
  - Error: ToolError in place of the footer.
- **AskUserQuestion.vue** (custom layout, the transcript view of a question set)
  - One row per question: `codicon-question`, an optional `header` chip, the question text, `→`, then the answer.
  - Answer states:
    - "Waiting for answer…" while there is no result (pending).
    - "Declined" when the result is an error.
    - Otherwise the answer text, or "No answer".
  - Where the answers come from:
    - `toolUseResult.answers` or `input.answers` (structured).
    - Otherwise parsed from the result text `"question"="answer", …`. The parser finds each known question's marker and takes everything up to the next one, so quotes inside answers survive. The last answer ends at the last `"`.
  - Rows with options get a chevron. A click toggles an options strip listing every option label.
    - Picked labels are highlighted. Multi answers are split on `", "`.
    - Hovering an option shows its `description` as a title.
    - Clicks inside the strip don't collapse the row.
  - Malformed questions or options are dropped: a question needs a string `question`, an option needs a string `label`.
- **McpTool.vue**
  - Icon `codicon-mcp`. Main line: "MCP", a server badge, and the tool name, parsed from `mcp__<server>__<tool…>`. A malformed name shows server "unknown" and the full name.
  - Expanded:
    - "Input": pretty JSON of input, shown only if it is non-empty.
    - "Output": `toolUseResult.output` (string or JSON), or the live content. An array's text blocks are joined; strings that parse as JSON are pretty-printed. `max-height: 400px`.
    - "Error": raw error text in a `max-height: 200px` box. This card does not use ToolError, so `<tool_use_error>` tags are kept.
- **SlashCommand.vue**
  - Icon `codicon-symbol-event`. Main line: the command text (`input.command`, else `toolUseResult.command` if it is an object).
  - The expandable slot always exists, so it always shows a chevron. It has content only on error.
- **Task.vue** (`Task` / `Agent`)
  - The icon is the `media/icons/view-diff.png` image, the same as the terminal's view-diff button. Tooltip "Agent".
  - Main line: "Agent", a `subagent_type` badge, the description, and a spinning loader while running.
  - Live data comes from `useLiveActivity()`:
    - `task = taskForToolUse(activity.tasks, toolUse.id)`, the task from `system/task_*`. Missing for history.
    - The child messages are `activity.subagentMessages[toolUse.id]`.
  - **running:** if a task exists, `status` is `running` or `pending`; otherwise running means no toolResult and no toolUseResult. A background agent's immediate "launched" tool_result therefore doesn't end "running".
  - **failed:** the task status is `failed`, or the result is an error.
  - A 1-second timer ticks `now` while running, for elapsed time. It is cleared when running stops and on unmount.
  - Collapsed preview: `SubagentStatusLine`.
  - Expanded: `SubagentDetail` (prompt, tool calls, result), then ToolError.
- **TodoWrite.vue** (its own layout, not the wrapper)
  - Header: `codicon-checklist`, "To-dos", and a count badge. The chevron button on the right toggles.
  - **Expanded by default** (`ref(true)`).
  - Item list:
    - `in_progress` items get a circle with an arrow icon.
    - `completed` items get an indicator with a small check (`codicon-check-two`).
    - `pending` items get an empty indicator.
    - The text class is `todo-<status>`, used for styling such as strike-through or dim.
    - `max-height: 400px`.
  - The list comes from `input.todos`. `activeForm` is ignored.
- **WebFetch.vue**
  - Icon `codicon-globe`.
  - Main line:
    - "Fetch", then a link `<a target=_blank>` whose click doesn't toggle the card.
    - The link text is hostname plus path. A path over 30 characters is cut to 27 plus "…". An unparseable URL over 50 characters is cut to 47 plus "…".
    - A status badge "<code> <codeText>" coloured by class (2xx success, 3xx redirect, 4xx client error, 5xx server error).
    - A "<N>ms" duration badge.
    - Code, text and duration come only from `toolUseResult`.
  - Expanded: a "Prompt" section, a "Response" `<pre>` (`toolUseResult.result` or the live text, `max-height: 400px`), then ToolError.
- **WebSearch.vue**
  - Icon `codicon-globe`. Main line: "Search" plus the query.
  - It is expandable **only** if `allowed_domains` / `blocked_domains` are non-empty, or on error.
  - Expanded:
    - "Allowed domains:" tags (verified icon).
    - "Blocked domains:" tags (error icon).
    - ToolError.
  - Search results are never shown.
- **REPL.vue** (Code Mode)
  - Icon `codicon-code`. Main line:
    - `input.description`, else "Run script" followed by the first line of the code (muted).
    - A badge "dispatched #N" when the result is exactly `(dispatched #N)`.
  - Collapsed preview: the first line of the first result / error / text section. There is none when dispatched or on error.
  - Expanded:
    - The code in a `<pre>`.
    - Each section under a header "Output", "Log" or "Error". Error and log blocks are styled differently. `max-height: 400px`.
    - When dispatched: "Running; its output arrives in a later Poll."
    - ToolError.
- **Poll.vue**
  - Icon `codicon-bell`.
  - Main line: "Poll" plus a summary: "1 event" / "N events", or "no pending events" when the text contains `(no pending events)` and has no real events.
  - Preview: the first line of the **last** section of the first event that has sections.
  - Expanded:
    - Per event, a header `<kind> #<evalId>` with a status badge, then each section `<pre>` (error and log styled).
    - Otherwise "No pending events" (muted).
    - Otherwise the raw result text.
    - ToolError.
- **Default.vue** (any other tool)
  - Icon `codicon-tools`. Main line: the tool name, or "Unknown Tool".
  - Expanded:
    - One row per top-level input key, `key: value`.
    - Values are formatted as null / undefined / true / false, strings raw, objects as pretty JSON.
    - The value class colours by type: boolean, number, object, path (starts with `/` or contains `\`), url (contains "http"), string.
    - Input is taken from `toolUseResult.input` first, then `toolUse.input`.
    - With no keys: "No parameters" (info icon).
    - ToolError.

### 4. Subagents

- **utils/subagentCalls.ts** (`W/utils/subagentCalls.ts`)
  - `subagentCalls(messages)`:
    - Walks the assistant messages' content wrappers and takes each `tool_use`, **skipping `SubagentHandback`** (that one is the subagent's report, not a step).
    - Per call it returns `{id, name, detail, isCode, icon}`.
    - The icon comes from `wrapper.getToolResultValue()`: a spinning loader with no result, `codicon-error` on error, else `codicon-check`.
  - **Main argument:** the first string among `command`, `file_path`, `notebook_path`, `pattern`, `url`, `query`, `description`, `prompt`, else the first string value. `isCode` is false for the prose keys (`description` / `prompt` / `query`).
  - **Shortening:** first line only. For Read/Write/Edit, a value that looks like a path is cut to its basename. Otherwise it is capped at 120 characters (119 plus "…").
  - `subagentReport(messages)`: the last non-empty `SubagentHandback` main-argument text, searching from the end.
  - `subagentStatus(task, calls, running, now)`:
    - Returns null when there is no task and no calls.
    - Stats, separated by three spaces:
      - "N tool use(s)", from `task.toolUses` or the number of calls.
      - "<X.Yk/M> tokens", from `task.totalTokens`.
      - Duration, only when ≥ 1s: live `now - startedAt` while running, else `durationMs` or `endedAt - startedAt`.
    - What it says:
      - Running: the last call's name and detail, else `task.lastToolName`, else "Working…".
      - Ended: "Done", "Failed" / "Failed: <error>", or "Stopped" (for killed or stopped).
- **SubagentStatusLine.vue** (`W/components/Messages/SubagentStatusLine.vue`)
  - A CLI-style line: `Bash(sleep 3)   2 tool uses   17.3k tokens   8s`.
  - The detail sits in parentheses and uses the code font when `isCode`. The stats are muted.
  - Class `failed` (error styling) applies when failed. The line is cut with an ellipsis.
- **SubagentCalls.vue** (`W/components/Messages/SubagentCalls.vue`)
  - One row per call: a state icon, the name, and the detail (code font when `isCode`). The title tooltip shows the full detail. Ellipsis on overflow.
  - With no calls it shows `emptyText` if one was given.
- **SubagentDetail.vue** (`W/components/Messages/SubagentDetail.vue`), the shared body for the Agent card and the background dialog
  - An optional in-body status line (`showStatus`, default true).
  - "Prompt" (`codicon-comment-discussion`) in a `<pre>`.
  - "Tool calls" (`codicon-list-tree`) with SubagentCalls. The empty text is "No tool calls yet" while running, "No tool calls" otherwise.
  - "Result" (`codicon-note`), shown only when not running: the handback report, else `task.summary`. `max-height: 400px`.
- **Where the data comes from** (`W/core/LiveActivity.ts`)
  - Events with `parent_tool_use_id` (assistant or user) are kept **out of the main transcript** and stored in `subagentMessages[parentId]`.
  - System events update `tasks`:
    - `task_started`: id, toolUseId, description, taskType, subagentType, prompt, status running, backgrounded, startedAt.
    - `task_progress`: tokens, tool uses, duration, last tool name, summary.
    - `task_updated`: status, description, end time, error, backgrounded.
    - `task_notification`: final status, summary, usage.
  - `background_tasks_changed` replaces `backgroundTasks`, dropping `ambient` tasks.
  - `resetConversation()` (on /clear) empties `subagentMessages`.
  - `formatTokenCount` gives 1.2k / 3.4M. `formatDuration` gives `Ns`, `Nm Ns` or `Nh Nm`.
  - A task counts as finished when its status is completed, failed, killed or stopped.

### 5. TodoList and the background tasks dialog

- **TodoList.vue** (`W/components/TodoList.vue`)
  - A collapsible section, open by default (`initialExpanded` true). Its header has a chevron and "N To-dos".
  - The list is 190px tall and scrolls (custom scrollbar), with fade-in animations. The item icons match TodoWrite.
  - Clicking an item emits `todoToggle(index)`.
  - It renders only when `visible` is true (default false).
  - **It is mounted only by `W/components/InputExtraBox.vue`, which nothing else imports.** No live UI shows this component; todos appear only through the TodoWrite card.
- **BackgroundTasksList.vue** (`W/components/BackgroundTasksList.vue`, mounted below `ChatInputBox` in `W/pages/ChatPage.vue`)
  - **Rows:** `activity.backgroundTasks` minus tasks already finished in `taskInfo`. It renders nothing when there are no rows.
    - `isAgent` is true when `taskType !== 'local_bash'`.
    - The runtime ticks every second.
    - Stats: tokens and runtime.
    - Agent rows get their messages through `info.toolUseId`.
  - **Closed state:** one line with a spinner, "N background task(s)" and "↓ to view". A click opens the dialog.
    - Keyboard entry: in `ChatInputBox.vue`, ArrowDown on the input's last line (when tasks exist and you are not browsing history) emits `focusTasks`, which calls `tasksListRef.focusList()`.
  - **Opening:**
    - With exactly one task the dialog goes straight to its detail view, as the CLI does. With several it shows the list.
    - The dialog takes focus.
    - It emits `openChange(true)`, and ChatPage hides `ChatInputBox` (`v-show="!tasksDialogOpen"`).
    - The dialog has a fixed 300px height, so moving between list and detail never shifts the layout.
  - **List view:**
    - Title "Background tasks" with a close × (title "Close (Esc)"), then "N active".
    - Each row: a `›` pointer on the selected row, an agent icon or `codicon-terminal`, the description (or the task id), stats, and an inline error.
    - A click selects the row and opens it. `mousedown.prevent` keeps focus in the dialog.
    - Footer: "↑/↓ to select   Enter to view   x to stop   Esc to close".
    - Keys:
      - ↑ / ↓ move the selection (clamped, no wrap).
      - Enter, Space or → open the selected task.
      - x or X stops it.
      - Esc or ← closes.
  - **Task view:**
    - Title: the description, with a close ×.
    - Kind line: the subagent type, else "agent", else "shell".
    - Fields:
      - Status: the error text, "stopping…", `info.status`, or "running".
      - Runtime, or "—".
      - Tokens (agents only).
      - Command (shells only, cut with an ellipsis, full text on hover).
    - A section header "Progress" (agent) or "Output" (shell).
    - Agent body: `SubagentDetail` with `running=true` and a live status computed only for the open task.
    - Shell body: `BackgroundShellDetail`.
    - Footer: "← to go back   x to stop   Enter/Space to close   Esc to close".
    - Keys: ← goes back to the list (the selection moves to this task). x stops it. Enter, Space or Esc closes.
  - **Key rules:** any key with Ctrl, Meta or Alt is ignored. Handled keys are `preventDefault`ed and `stopPropagation`ed.
    - ChatPage's global Esc stop-turn binding and its permission-Esc forwarder are disabled while focus is inside `.bg-tasks` (`inTaskList`).
  - **Closing:**
    - From the keyboard, or when the last task ends: emits `exit`, and ChatPage focuses the input again.
    - Focus moving elsewhere in the page (for example a click in the transcript) closes the dialog without refocusing the input. Switching windows keeps it open (`document.hasFocus()` check).
    - Unmounting while open emits `openChange(false)`.
  - **Rows changing:** the selection is clamped. If the open task ends, the dialog returns to the list. If no tasks remain, it closes.
  - **Stopping a task (x):**
    - It ignores repeat presses while a stop is in flight (`stopping`) and clears the old error.
    - Message path: `activity.stopTask`, then `Session.stopTask`, then `BaseTransport.stopTask` sends `stop_task {taskId}` on the channel.
    - On the host, `ClaudeAgentService.stopTask` calls `channel.query.stopTask` and returns `stop_task_response {error?}`. With no channel the error is "No running session".
    - A returned error shows in the row and in the Status field.
- **BackgroundShellDetail.vue** (`W/components/BackgroundShellDetail.vue`)
  - Every second it calls `resolve()` to find the shell. This is `ChatPage.findBackgroundShell`:
    - It searches the transcript from newest to oldest for a `Bash` call with `run_in_background`.
    - A call matches by tool_use id, by `toolUseResult.backgroundTaskId`, or by the task id appearing in the result text.
    - The output file is parsed from `written to: <path>.output`.
  - Then it reads that file through `readTaskOutput(path)`:
    - The webview sends `read_task_output {path, maxBytes: 65536}`.
    - The host (`handleReadTaskOutput`) only accepts paths ending in `.output` whose parent directory is named `tasks`; anything else gets "Not a task output file".
    - It clamps `maxBytes` to 1 KB–1 MB and reads the tail of the file.
    - If it started mid-file, it drops the partial first line.
    - It returns `{output, truncated}`, or `{error}`.
  - States:
    - A "Showing the last 64 KB" note when truncated.
    - The output `<pre>`.
    - The error text.
    - "Output file not known yet" when there is no file.
    - "No output yet".
  - It sticks to the bottom unless the user has scrolled up (8px threshold) and doesn't start a new read while one is running.
  - It is keyed by task id, so it remounts per task.

### 6. Permission and interactive prompts

- **Message flow** (`H/services/claude/ClaudeAgentService.ts`, `H/shared/messages.ts`, `W/transport/BaseTransport.ts`, `W/core/PermissionRequest.ts`)
  - The SDK `canUseTool(toolName, input, options)` calls `requestToolPermission`, which sends the host→webview **request** `tool_permission_request {toolName, inputs, suggestions, context}` on the channel.
  - `context` is `permissionContext(options)`, picked field by field: `title`, `displayName`, `description`, `decisionReason`, `blockedPath`, `defaultToNo`, `suppressAlwaysAllowRule`, `toolUseID`, `agentID`. The AbortSignal is not passed.
  - In the webview, `handleToolPermissionRequest` creates a `PermissionRequest`, appends it to the `permissionRequests` signal and emits `permissionRequested`.
  - When the user resolves it, the webview answers `{type:"response", requestId, response: tool_permission_response {result}}` and removes the request from the list.
  - `PermissionRequest.accept(updatedInput = inputs, updatedPermissions = [])` produces `{behavior:'allow', updatedInput, updatedPermissions}`.
  - `reject(message = 'Denied by user', interrupt = true)` produces `{behavior:'deny', message, interrupt}`.
  - There is no timeout and no cancel path. A prompt waits until the user picks.
- **Routing per session** (`W/core/Session.ts`, `W/core/SessionStore.ts`)
  - `Session.permissionRequests` keeps only the requests whose `channelId` matches the session. Prompts never cross tabs (see also `docs/CLAUDE_UI.md`).
  - `SessionStore.attachPermissionListener` **switches the active session** to the one asking.
- **ChatPage integration** (`W/pages/ChatPage.vue`)
  - `pendingPermission` is the first queued request. Only one prompt shows at a time; the others queue behind it.
  - It renders `PermissionRequestModal` above the input. `SessionConflictPrompt` and `ColdResumePrompt` are hidden while a permission prompt shows.
  - The running spinner is hidden while a prompt waits.
  - **The transcript is dimmed** (`dimmed` class) for ordinary tool prompts but **not** for `ExitPlanMode` or `AskUserQuestion`, which are decided by reading the transcript. The sticky-prompt header is suppressed while dimmed, and so is the "New messages" button.
  - When the number of requests changes, the view scrolls to the latest message so the tool call in question is visible.
  - Ctrl+U (send queued prompts) and Esc (stop the turn) are disabled while a prompt is pending.
  - **Esc forwarding** (priority 60):
    - Applies when a prompt is open but focus is outside `[data-permission-panel]`, for example in the chat input. It does not apply when a dropdown or the command panel is open, or when focus is in the task list.
    - It focuses `.prompt-options` and dispatches a synthetic Escape there, so the prompt cancels as if Esc had been pressed inside it. A flag prevents the event from being forwarded twice.
  - `modes` (the session's available permission mode ids) are passed down for plan approval.
- **PermissionRequestModal.vue** (`W/components/PermissionRequestModal.vue`)
  - Chooses `AskUserQuestionPrompt` for `AskUserQuestion`, `PlanApprovalPrompt` for `ExitPlanMode`, and `ToolPermissionPrompt` for everything else.
  - Each request gets a unique key through a WeakMap sequence. A new request, even for the same tool, mounts a fresh prompt, so the cursor and typed text never carry over.
- **PromptFrame.vue** (`W/components/Permission/PromptFrame.vue`)
  - A box above the input with `data-permission-panel="1"`.
  - Header: the title (or `#title` slot) and an optional `#aside` slot on the right.
  - Then the body, then a hint row with one span per hint.
  - It never closes by itself; only a choice resolves it.
- **PromptOptions.vue** (`W/components/Permission/PromptOptions.vue`), the numbered choice list
  - `role=listbox`, focusable. It takes focus on mount (`autofocus`, default true). If the start row is a text row, the input gets focus instead.
  - Each row:
    - A `›` pointer on the active row.
    - A number "1."–"9." when digits are enabled.
    - An optional checkbox (`codicon-pass-filled` or `circle-large`).
    - The label and a muted detail. Layout `inline` puts the detail beside the label instead of below it.
    - A right-side hint (e.g. "esc").
    - Classes `active`, `checked`, `muted`.
  - **Keys on the list:**
    - ↓ or Tab: next row, wrapping. ↑: previous row, wrapping.
    - → / ←: emit `side(±1)` (question tabs).
    - Enter or Space: pick.
    - Esc: `cancel`.
    - Digits 1–9 (if enabled and ≤ the option count): pick directly. On a text row a digit only moves the cursor there.
    - Keys during IME composition are ignored. Handled keys are `preventDefault`ed and `stopPropagation`ed.
  - **Text rows** (`input:true`):
    - The label is the placeholder. Moving the cursor onto the row focuses its `<input>`; moving off returns focus to the list.
    - In the input: Enter (without Shift) picks with the trimmed text, Esc cancels, ↑ / ↓ leave the row.
  - **Mouse:**
    - Hover moves the cursor, except onto text rows, and never while the user is typing in a text row.
    - Mousedown on a normal row is `preventDefault`ed, so focus stays in the list.
    - Clicking a text row focuses it. Clicking any other row picks it.
  - When the option count changes, the cursor resets to `initialIndex`. A change to `initialIndex` also moves the cursor.
  - Emits `move(index)` on every cursor change and once on mount.
  - Exposes `focus()` and `setIndex()`.
- **ToolPermissionPrompt.vue** (`W/components/Permission/ToolPermissionPrompt.vue`)
  - **Title:**
    - `context.title` when present.
    - Otherwise: "Bash command" / "PowerShell command", "Create file" (Write), "Edit file" (Edit, MultiEdit, NotebookEdit), "Read file", or "<tool> (MCP: <server>)".
    - Otherwise `displayName` (if it differs from the tool name), else the tool name.
  - **Aside:** "subagent" when `context.agentID` is set.
  - **Body:**
    - Shell tools: the command in a `<pre>` (`max-height: 160px`). Under it, muted, `input.description` or `context.description`.
    - Edit tools and Read: the full path as a link that opens the file.
    - Otherwise, if a `url` exists, it is shown inline.
    - A collapsible `<details>` "Details" with pretty input JSON (`max-height: 160px`), shown for every non-shell tool with non-empty input. That includes file and URL tools.
    - A muted reason: `decisionReason`, plus "Path: <blockedPath>" when it differs from the file path.
  - **Question:**
    - Write: "Do you want to create <basename>?"
    - Edit tools: "Do you want to make this edit to <basename>?"
    - Otherwise: "Do you want to proceed?"
  - **Options:**
    1. "Yes": `accept(inputs)` with no permission updates (this time only).
    2. The don't-ask-again label from `alwaysAllowLabel(suggestions)`: `accept(inputs, suggestions)`. Omitted when there are no usable suggestions or `suppressAlwaysAllowRule` is set.
    3. A text row "No, and tell Claude what to do differently" with hint "esc".
  - **defaultToNo:** the cursor starts on the last option (No), digits are disabled so a stray key can't approve, and the hints become "↑/↓ to select · Enter to confirm · Esc to deny". Otherwise the hints are "↑/↓ or number to select · Enter to confirm · Esc to deny".
  - **Deny text** (same wording as the CLI): "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file)."
    - With feedback it appends " To tell you how to proceed, the user said:\n<text>" and sends `interrupt=false`, so the turn continues.
    - Without feedback, Esc or an empty text row appends " STOP what you are doing and wait for the user to tell you how to proceed." and sends `interrupt=true`.
    - Picking the No row with empty text sends the interrupting deny.
- **permissionSuggestions.ts `alwaysAllowLabel`** (`W/utils/permissionSuggestions.ts`)
  - `addRules` with behavior allow gives "don't ask again for <rules>":
    - Bash or PowerShell rule `npm run:*` reads as "`npm run` commands" (a trailing `:*` is dropped).
    - A WebFetch rule `domain:x` reads as "fetches from x".
    - Other rules read as `Tool(content)`, or just the tool name when there is no content.
  - `setMode`: "allow all edits" for acceptEdits, otherwise "switch to <mode label> mode" (`describeMode`).
  - `addDirectories`: "allow access to <dir>/, …", using only each directory's last segment.
  - Destination suffix:
    - session: " during this session"
    - localSettings or projectSettings: " in this project"
    - userSettings: " in every project"
  - Joining:
    - The first part becomes "Yes, allow…" if it starts with "allow", else "Yes, and …".
    - Further parts are joined with ", and ".
    - The label is empty when nothing applies.
- **PlanApprovalPrompt.vue** (`W/components/Permission/PlanApprovalPrompt.vue`)
  - Title "Ready to code?".
  - Aside: an "Open plan file" link when `input.planFilePath` exists. It opens the file.
  - Preview: the first non-empty line of the plan with leading `#` removed, on one line cut with an ellipsis. The full plan is the ExitPlanMode card above.
  - Question: "Would you like to proceed?"
  - **Options:**
    - "Yes, and use auto mode", only if the `auto` mode is available.
    - "Yes, and bypass permissions", only if `bypassPermissions` is available.
    - "Yes, and auto-accept edits" (acceptEdits).
    - "Yes, and manually approve edits" (default).
    - A text row "No, keep planning (tell Claude what to change)" with hint "esc".
  - A yes option sends `accept(inputs, [{type:'setMode', mode, destination:'session'}])`. The CLI confirms with `system/status`, and the mode picker follows it.
  - **Keep planning:**
    - With feedback: "The user doesn't want to proceed with this plan yet. Stay in plan mode and revise the plan. The user said:\n<text>", `interrupt=false`.
    - Without feedback: "… Stay in plan mode. STOP what you are doing and wait…", `interrupt=true`.
  - Hints: "↑/↓ or number to select · Enter to confirm · Esc to keep planning".
- **AskUserQuestionPrompt.vue** (`W/components/Permission/AskUserQuestionPrompt.vue`)
  - Questions are filtered to those with a string `question` and an array `options`.
  - **One question:** the title row holds the header chip and the question.
  - **Several questions:**
    - The title row becomes tabs, one per question: the header or "Question N", with `pass-filled` once answered, `circle-large` otherwise.
    - A final "Submit" tab (`codicon-check`).
    - Tabs are clickable, not focusable (`tabindex=-1`, mousedown prevented). The question text then shows in the body.
  - **Options** (inline layout, one line each):
    - Each option is its label plus its `description` as detail, unless the description equals the label.
    - Multi-select options have checkboxes reflecting the picks.
    - A text row:
      - Single-select: "Type something else".
      - Multi-select: "Other (type, Enter to add)".
      - Once set, it reads "Other: <text>". In multi-select it is ticked once added.
    - Multi-select adds a final "Next" / "Submit" / "Review answers" row. It is muted until something is answered.
  - **Preview:** a focused option's `preview` shows below in a `<pre>` (`max-height: 200px`) and follows the cursor (`move`).
  - **Picking in single-select:**
    - An option sets the answer, clears the custom text and advances.
    - The text row with text sets a custom answer, clears the picks and advances. Empty text is ignored.
  - **Picking in multi-select:**
    - An option toggles.
    - Enter on the text row sets the custom answer; empty text removes it. It does not advance.
    - The Next row advances only if something is answered.
  - **Advancing:** to the next question; after the last one, to the review step when there are several questions, otherwise straight to submit.
  - ← / → (`side`) switch questions, clamped between the first question and the review step. The cursor resets.
  - **Review step:**
    - "Review your answers", with one row per question: the question, then the joined answers or "Not answered" (styled `missing`).
    - Options: "Submit answers" or "Cancel". Cancel declines.
  - **Submit:**
    - `answers` maps question text to answers joined with ", ". Unanswered questions are omitted.
    - For single-select questions whose picked option has a preview, it adds `annotations[question] = {preview}`.
    - Sends `accept({...inputs, answers, annotations?})`.
  - **Decline** (Esc, Cancel): "The user declined to answer the questions. STOP what you are doing and wait for the user to tell you how to proceed.", `interrupt=true`.
  - Hints: "↑/↓ to select", then "Enter to toggle" (multi) or "Enter to confirm", then "←/→ to switch question" (when there are several), then "Esc to decline".
- **SessionConflictPrompt.vue** (`W/components/SessionConflictPrompt.vue`, `W/core/SessionStore.ts`, `W/pages/ChatPage.vue`)
  - **Trigger:** `SessionStore.openExisting` (from `/resume`, history, or Continue) asks `getSessionOwner(id)`, which sends `get_session_owner`. If another tab owns the conversation, it sets `openConflict` instead of opening it. If the check fails, the conversation opens anyway.
  - Title "Already open in another tab".
  - Text: `"<summary>"` (or "This conversation") "is open in" `tab "<ownerTitle>"` (or "another tab") ". Two tabs would write to the same conversation."
  - **Options:**
    - "Switch to that tab": clears the conflict, then `focusTab(owner.tabId)`. That sends `focus_tab`; the host's `handleFocusTab` calls `webViewService.requestTab({kind:'focus'})`.
    - "Open a fork here" (detail "Same history, continues as a new conversation"): `openFork` creates a new Session with the same id, summary "<summary> (fork)" and `forkOnNextLaunch`. It attaches the permission listener and makes the fork active.
    - "Cancel": clears the conflict.
  - Esc cancels.
  - Hints: "↑/↓ or number to select · Enter to confirm · Esc to cancel".
  - It is hidden while a permission prompt is pending. While it is open, "Recent conversations" is hidden too.
- **ToolPermissionView.vue** (`W/components/ToolPermissionView.vue`)
  - A leftover extension point. It would load a per-tool module's `renderPermissionRequest(context, inputs, onModify)` and emit `modify`, but its loader map is empty (all entries commented out) and **nothing imports it**. It never renders anything.
  - The matching `ToolPermissionRenderer` interface is in `W/types/tool.ts`.

### 7. Dead or inert behavior worth knowing

- `ToolMessageWrapper` ignores `defaultExpanded` (all cards start closed) and its Accept/Reject `permissionState` path is never used.
- MultiEdit shows no live diff before `structuredPatch` arrives, because it reads `old_string` / `new_string` instead of `edits[]`.
- Edit's preview is skipped when `new_string` is empty.
- `TodoList.vue` and `InputExtraBox.vue` are unused, and so is `ToolPermissionView.vue`. `core/ToolContext.ts` is not used by the cards.
- The Grep card draws content-mode result lines as file-path buttons.
- A Bash card with array content shows no output.

## B4. Slash commands và các panel

- **Where slash commands come from, and the `/` suggestion list**
  - **Two sources feed the list** (`webview-ui/claude/src/composables/useRuntime.ts`)
    - **Commands the CLI reports.** The host reads them by running a throwaway SDK query and calling `supportedCommands()` in `loadConfig` (`src/claude/services/claude/handlers/handlers.ts`). They reach the webview as `claudeConfig.slashCommands` and are registered with the id `slash-command-<name>` in the section "Slash Commands". The list is re-registered whenever the connection's `claudeConfig` changes.
    - **Commands this UI handles itself.** `UI_SLASH_COMMANDS` (`webview-ui/claude/src/providers/slashCommandProvider.ts`) registers them with the id `ui-command-<name>` and a no-op action, because `ChatInputBox` intercepts them. They are:
      - `resume [conversation id or name]`, `help`, `memory`, `status`, `export [filename]`, `hooks`
      - `permissions` (alias `allowed-tools`), `add-dir [path]`, `plugin` (alias `plugins`)
      - `release-notes`, `rewind` (aliases `undo`, `checkpoint`), `login`, `logout`
    - **Name clashes:** if the CLI also reports one of the UI's command names, the CLI entry is dropped and the UI one wins (`UI_COMMAND_NAMES`).
    - **Hidden commands:** `color`, `agents`, `focus` and `fast` are left out of the suggestions (`HIDDEN_SLASH_COMMANDS`). Typed by hand, they still go to the CLI.
    - **Aliases:** a plugin alias of the form `plugin:name` is dropped from the alias list, because it names the source rather than another command name.
  - **Where a command comes from ("source")** is worked out by `withCommandSource` (`handlers.ts`), because the SDK only marks commands as `builtin`:
    - an alias `<plugin>:<name>` means the command comes from that plugin
    - `<cwd>/.claude/skills/<name>/SKILL.md` or `<cwd>/.claude/commands/<a>/<b>.md` means `project`
    - the same paths under `CLAUDE_CONFIG_DIR` (or `~/.claude`) mean `user`
    - otherwise a name containing `:` uses the part before the colon
  - **Matching and ranking** (`getSlashCommands`, `slashCommandProvider.ts`)
    - No query: every command, in registration order.
    - With a query, the leading `/` is removed and the name and aliases are checked for a substring match.
      - Rank 0: the main name starts with the query.
      - Rank 1: an alias starts with the query. Typing `/cost` finds `/usage`.
      - Rank 2: any other substring match.
    - Descriptions are searched only when no name matches.
  - **How a dropdown row looks** (`commandToDropdownItem`)
    - The label is `/name` and the detail line is the description.
    - The hint is dimmed on the name line: `(alias1, alias2) <argumentHint>`.
    - The badge is the command's source (`user`, `project`, or the plugin name).
    - Icon: `codicon-window` for UI commands, `codicon-symbol-method` for CLI commands.
    - The dropdown (`webview-ui/claude/src/components/ChatInputBox.vue`):
      - is "stacked" with `clamp-detail`, so long skill descriptions are cut to one line and shown in full on hover
      - has a minimum width of 320px and prefers to open above the input
      - is anchored to the top of the input frame, at the x position of the trigger word
      - shows "No matches" when nothing matches
  - **Keys in the dropdown** (`ChatInputBox.vue` together with `composables/useCompletionDropdown.ts`)
    - ↑/↓ move, Enter or a click picks, Tab picks but only completes, Esc closes (inline mode).
    - When you pick, `openPickerFor(command.label)` runs first. Commands that have a panel open it straight away, even when picked with Tab.
    - If the command has no `argumentHint`, sits alone in the input, and was picked with Enter or a click, it runs at once (`handleSubmit` on the next tick), as in the CLI.
    - Tab, or a command that takes arguments, only replaces the typed text with `"/name "` and puts the caret at the end.
  - **Settings tab:** there is a separate `components/settings/tabs/SettingsTabSlashCommands.vue`, which I did not read.

- **What happens when you submit something starting with `/`** (`ChatInputBox.handleSubmit` / `openPickerFor` / `openUiPanel`, `ChatInputBox.vue`)
  - **Order of checks**
    1. The prompt is always saved to prompt history (`promptHistory.record`).
    2. Bash mode (`!`) is checked next.
    3. Then `openPickerFor(typed)`.
    4. Otherwise the text is sent with `emit('submit')`, or with `emit('queueMessage')` while a turn is running.
  - **Always handled by the UI, with or without an argument** (`UI_PANEL_COMMANDS` and `UI_ACTION_COMMANDS`)
    - The text is parsed as `^(/\S+)(?:\s+(.*))?$`; the name is lowercased and the argument kept in `panelArg`.
    - Panels: `/resume`, `/memory`, `/status`, `/export`, `/hooks`, `/help`, `/permissions`, `/allowed-tools`, `/add-dir`, `/plugin`, `/plugins`, `/login`, `/logout`.
    - Actions with no panel:
      - `/release-notes` runs `openReleaseNotes()`.
      - `/rewind`, `/undo` and `/checkpoint` run `openRewind()`.
    - Arguments:
      - `/add-dir <path>` starts the add-directory flow.
      - `/resume <arg>` switches directly when exactly one conversation matches.
      - `/export <file>` saves straight to a file.
  - **Handled by the UI only when typed with no argument** (`PANEL_COMMANDS`). The whole text, lowercased, must equal the command name. With an argument, the text goes to the CLI as typed.
    - `/output-style`, `/autocompact`, `/rename`, `/name`, `/goal`, `/config`, `/settings`, `/mcp`, `/auto-mode-setup`
    - `/model` opens the model picker.
    - `/effort` opens its panel only when the model lists effort levels; otherwise it goes to the CLI.
  - **Everything else goes to the CLI** through `Session.send` (`webview-ui/claude/src/core/Session.ts`). This includes `/clear`, `/compact`, `/context`, `/usage`, `/cost`, `/init`, `/review`, skills and plugin commands.
    - The editor selection is not attached to slash commands (`isSlashCommand`).
    - The thinking level is not changed temporarily for them.
    - `ChatPage.handleSubmit` (`webview-ui/claude/src/pages/ChatPage.vue`) skips the cold-resume price check for text starting with `/`.
  - **Panel commands go out like typed text:** `runCommand()` emits `submit`, or `queueMessage` while a turn is running.
  - **Queueing** (`ChatPage.vue`)
    - While a turn runs, a queued prompt goes straight to the CLI's queue (`Session.send`, deferred with `inFlightPrompts`).
    - If that send fails, the prompt is held locally. When the turn ends, `flushQueue` sends a held `/command` on its own, never merged with other prompts.
    - Switching conversations clears the local queue.
  - **How panels are shown** (`ChatInputBox.vue`)
    - `activePanel` replaces the input inside the same frame.
    - While a panel is open, the editor, attachments and button row are hidden (`v-show="!activePanel"`) and the bash-mode styling is turned off.
    - `closePanel()` sets `activePanel = null` and puts the focus back in the input on the next tick.
    - `focusInputAtEnd` does nothing while a panel is open.

- **What every panel shares: the `CommandPanel` frame** (`components/CommandPanel/CommandPanel.vue`)
  - **Layout**
    - Header 26px high: the title on the left (muted and ellipsized), with an optional muted subtitle 10px after it.
    - Action buttons on the right. Each shows an optional key hint in 11px dim text; `primary` buttons have a filled background and `active` buttons a highlighted one.
    - A button's tooltip is `"Label (Key)"`.
    - Buttons use `mousedown.prevent` so clicking them does not take focus.
  - **Body:** content is centred vertically by default; `top` (tabbed panels) starts it at the top.
  - **Hint row:** muted key help (`hint[]`) at least 28px high. Entries wrap as whole items on narrow panes, with a 12px gap under 420px wide.
  - **Height:** at least 144px (110px editor + 6px gap + 28px button row), so the frame does not jump when a panel opens.
  - **Focus and keys**
    - The root (`tabindex=0`) focuses itself when mounted.
    - `Escape` emits `cancel` (preventDefault and stopPropagation); every other key is emitted as `key`. Keys pressed during IME composition are ignored.
  - **Closing on focus loss:** when focus leaves the panel, `cancel` is emitted, unless the panel is `persistent` (used by `/login` while waiting and `/plugin` while working or confirming).
  - **Exposes:** `focus()`.

- **Generic `ListPanel`** (`components/CommandPanel/ListPanel.vue`)
  - **States:** "Loading…"; `emptyText` when there are no items (default "Nothing to choose from"); "No matches" when the filter hides everything; otherwise the list.
  - **Rows**
    - Each row shows: a number 1–9 (non-filterable lists only), the label (at most 60% wide, ellipsized), a dim ellipsized detail with the full text in a tooltip, a dim tag on the right, and a check mark when the item is `current`.
    - The list is at most 240px tall and scrolls; the active row is scrolled into view.
  - **Cursor position**
    - When items arrive, the cursor moves to the `current` item, else to row 0.
    - Changing the filter resets it to 0.
  - **Keys in plain lists**
    - ↓/j and ↑/k move and wrap around; Home/End jump; PageUp/PageDown move 8 rows.
    - Enter picks; digits 1–9 pick directly.
  - **Keys in filterable lists**
    - Only the arrow keys move.
    - Printable characters (without Ctrl, Meta or Alt) add to the filter and Backspace removes from it.
    - The subtitle shows `filter: <q>`. The filter matches the label plus the detail.
    - `initialQuery` sets a starting filter.
  - **Default hints**
    - plain: `↑/↓ to select · Enter to confirm · Esc to cancel`
    - filterable: `↑/↓ to select · type to filter · Enter to confirm · Esc to cancel`
  - **Picking** emits `select(value)` and then `close`. The optional `note` is a muted line under the list (it wraps anywhere).

- **Generic `TextPanel`** (`components/CommandPanel/TextPanel.vue`)
  - **Field:** a one-line input with an optional initial value and placeholder, plus a muted note under it.
  - **Focus:** the input takes focus back and selects its text on the next tick, because the frame focuses itself first.
  - **Submitting:** Enter or the primary `submitLabel` button (default "Set", key ↵) submits the trimmed text and closes. Empty text does nothing.
  - **Extra actions** appear to the left of the submit button.
  - **Default hint:** `Enter to confirm · Esc to cancel`.

- **`/effort`: `EffortPanel`** (`components/CommandPanel/EffortPanel.vue`, opened from `ChatInputBox.vue`)
  - **When it opens:** only for a bare `/effort` when `effortLevels` is not empty. The levels come from the model catalogue's `supportedEffortLevels`, and are hidden when `supportsEffort === false` (`ChatPage.effortLevels`). Otherwise `/effort` goes to the CLI.
    - Opening emits `commandPanelOpen('effort')`, and `ChatPage` then calls `session.refreshAppliedEffort()` (request `get_applied_effort`).
  - **What it shows**
    - Captions "Faster" and "Smarter" at the two ends.
    - A rail, a fill, and one tick per level, with a knob on the selected level.
    - Labels: low → Low, medium → Medium, high → High, xhigh → Extra high, max → Max; unknown levels show raw.
  - **Auto state**
    - It applies when the current level is not in the list.
    - The knob is faded and sits on the level auto currently runs at (`autoLevel`, the CLI's `applied.effort`), falling back to medium.
    - The subtitle reads `Auto (<Level>)`.
    - The knob follows `autoLevel` when that answer arrives after the panel opened.
  - **Keys**
    - ←/h and →/l move one level (leaving auto); Home/End jump to the ends.
    - `a` switches to Auto.
    - `s` applies the level for this session only and closes.
    - Enter is Save.
    - Clicking a tick or a label picks that level.
  - **Buttons:** Auto (A, highlighted when active), This session (S), and Save (↵) — or Apply (↵) when the choice is `auto` or `max`.
    - The CLI cannot save auto or max, so for those Enter applies to the session only.
  - **Hint:** `←/→ to adjust · Esc to cancel`.
  - **What happens after a pick**
    - `effortSelect(level, persist)` goes to `ChatPage.handleEffortSelect`, then to `Session.setEffortLevel(level, persist)`.
    - When persisting, the Claude channel is launched if needed. The request is `set_effort_level { effortLevel: null | level, persist }`.
    - On the host (`ClaudeAgentService.setEffortLevel`, `src/claude/services/claude/ClaudeAgentService.ts`):
      - `query.applyFlagSettings({ effortLevel })`
      - if persisting and the level is neither null nor `max`: `query.updateSettings('userSettings', { effortLevel })`
    - The webview then refreshes the applied effort.
  - **Keeping up with a typed `/effort <level>`** (`Session.send`, `Session.processIncomingMessage`, `syncEffortFromCli`)
    - `send` remembers the argument (`pendingEffortArg`).
    - When the `result` event carries `local_command === 'effort'`, the UI reads `get_applied_effort`. The host reads this from `query.getSettings().applied.effort` (`ClaudeAgentService.getAppliedEffort`).
    - The picker only takes a level the CLI confirms, so a typo leaves it unchanged.
    - `auto` comes back from the CLI as the model's default level, so the UI takes `auto` from the typed command instead.
    - Answers that arrive for an older channel are ignored.
  - **Also re-read:** the applied effort is refreshed after every `system/init` and every `result`.

- **`/model`: the model picker** (`ChatInputBox.openPickerFor`, `components/ButtonArea.vue`, `components/ModelSelect.vue`, `pages/ChatPage.vue`)
  - **Opening:** a bare `/model` clears the input and, on the next tick (`setTimeout 0`, so the picking click does not close it), calls `buttonAreaRef.openModelSelect()`, which opens the `ModelSelect` dropdown.
  - **The list** comes from `useModelCatalog` (the CLI's `supportedModels()` plus custom models from Settings).
    - Rows are stacked: label and description, with a check on the selected model.
    - Keyboard handling comes from `usePickerKeyboard`, and the cursor starts on the current model.
  - **Picking** emits `modelSelect(id)`, then `ChatPage.handleModelSelect` calls `Session.setModel({ value })`, which sends the request `set_model`. The host runs `query.setModel(model)`.
    - If the request fails, the previous selection is restored.
    - After a switch the context usage is refreshed, because the context window can change (200K vs 1M).
  - **`/model <name>` goes to the CLI.** The UI follows the change:
    - After each turn, `Session.refreshContextUsage` reads `model` from `getContextUsage()` (request `get_context_usage`) into `cliModel`.
    - A `ChatPage` watcher calls `adoptModel()` only when the model changes between two reads of the same session.
    - It picks the catalogue entry whose `resolvedModel` matches, preferring a named model over "Default"; failing that, it keeps the raw ID.
    - The first read after a launch is ignored, because it only reports the ID behind the selection (for example `opus[1m]` running as `claude-opus-5-5`).
  - **Resumed conversations:** a second watcher maps the raw model ID a conversation ran with to a catalogue entry, choosing the `[1m]` variant only when the ID contains `[1m]`.
  - **Known limit** (`docs/CLAUDE_UI_CLI_PARITY.md`): after `/model opus[1m]` or `opusplan`, the picker shows the plain model, because the CLI only reports the real ID.

- **`/output-style`** (`ChatInputBox.vue` with `ListPanel`)
  - **Bare command:** a "Output style" list opens and `loadOutputStyles()` runs, calling `Session.getOutputStyles()`.
    - This launches the channel if needed and sends `get_output_styles`.
    - The host calls `query.initializationResult()` and returns `output_style` plus `available_output_styles`.
  - **Current style:** marked with a check. It comes from `Session.outputStyle`, which is updated from `output_style` in every `system/init`, falling back to the init answer and then to `'default'`; the comparison ignores case.
  - **States:** "Loading…"; "The CLI listed no output styles" when empty. A failure is only logged to the console.
  - **Picking** sends `/output-style <style>` to the CLI, which writes `.claude/settings.local.json`.
  - **With an argument,** the command goes straight to the CLI.

- **`/autocompact`** (`ChatInputBox.vue` with `ListPanel`)
  - Title "Auto-compact window". Items: Auto ("window tuned for the model"), 100K, 200K, 400K and 1M tokens.
  - Hint: `↑/↓ to select · Enter to confirm · other sizes: /autocompact <tokens>`.
  - Picking sends `/autocompact <auto|n>`. The CLI checks the value (at least 100K).
  - The current value is not marked, because `applied` has no autocompact field (parity doc).

- **`/rename` and `/name`** (`ChatInputBox.vue` with `TextPanel`)
  - Title "Rename conversation", placeholder "New name", submit button "Rename".
  - Note: "Generate lets Claude name it from the conversation."
  - The "Generate" action sends a bare `/rename` so the CLI names it, then closes.
  - Submitting sends `/rename <name>`.
  - **How the new name reaches the tab** (`Session.processIncomingMessage`)
    - `system` / `session_title_changed` sets `Session.summary` to the trimmed title, ignoring blank titles.
    - The `SessionStore` effect (`core/SessionStore.ts`) then calls `renameTab`, cutting titles longer than 25 characters to 24 characters plus `…`.
    - After `/clear` the CLI may send the old title again for the new session; the UI follows the CLI.

- **`/goal`** (`TextPanel`)
  - Title "Goal", placeholder "Condition to keep working toward, e.g. all tests pass".
  - Note: "Claude keeps working until the condition is met."
  - Submitting sends `/goal <condition>`.

- **`/config` and `/settings`: `ConfigPanel`** (`components/CommandPanel/ConfigPanel.vue`)
  - **Where the data comes from**
    - On mount it calls `Session.getConfigOptions()`, which launches the channel and sends `get_config_options`.
    - On the host (`ClaudeAgentService.getConfigOptions`):
      - The key list comes from the usage text of a bare `/config`, run in a throwaway CLI (`ClaudeSdkService.runLocalCommand`, `persistSession: false`, 15 s timeout) so no message lands in the chat.
      - `parseConfigUsage` reads lines like `  key=a|b|c` as a list of choices and `key=<value>` as free text.
      - The key list is cached per process. A failed read, or an empty list, is retried on the next open.
      - Current values come from `query.getSettings().effective` plus the global config `~/.claude.json` (or `$CLAUDE_CONFIG_DIR/.claude.json`), through `readConfigValues` (`src/claude/services/claude/configValues.ts`).
        - That file copies how the CLI (2.1.327) reads each key, including the CLI's defaults.
        - Only values a key accepts are kept, in the CLI's spelling (case-insensitive match).
        - `workflows`, `workflowSizeGuideline` and `switchModelsOnFlag` are unknown unless set, so they show "default".
  - **States**
    - "Loading…"
    - an error line: "No active session", "Could not read the settings list: …", or "The CLI listed no settings"
    - "No matching setting"
  - **Layout**
    - A filter input at the top ("Filter settings…") takes focus on the next tick and matches on the key.
    - Each row shows: a `•` mark (lit when the key has an unsaved change), the key, and the value control.
      - Free text: the value, or a dim "default"; Enter edits it inline.
      - true/false: a switch showing on, off or default.
      - Other choices: `‹ value ›`, with clickable arrows.
    - The subtitle reads `N unsaved`.
  - **Keys**
    - ↑/↓ move and wrap, scrolling the row into view.
    - →, ← or Space step through the choices. Starting from an unknown value, → goes to the first choice and ← to the last.
    - On a free-text row, Enter starts editing. Without Ctrl/Cmd, Enter on any other row saves; Ctrl/Cmd+Enter always saves.
    - While editing: Enter keeps a non-empty value, Esc stops editing; neither saves nor closes the panel.
    - A change back to the value read from the CLI drops it from the unsaved changes.
  - **Buttons:** "Open settings.json" (`openFile`, then `Session.openConfigFile('settings')`, request `open_config_file { configType: 'settings' }`, which opens `~/.claude/settings.json` and closes the panel) and "Save (N)" (↵, primary).
  - **Hint:** `↑/↓ select · ←/→ or Space change · Enter edit text / save · type to filter · Esc cancel`.
  - **Saving**
    - Values without spaces are sent together as one `/config a=b c=d`.
    - Each value containing whitespace gets its own `/config k=v`, because the CLI only takes several pairs when none contains a space.
    - The commands go to `emit('runCommands')`, then `ChatPage.handleRunCommands` sends them one by one with `Session.send` (even while busy; the CLI runs them in order) and stops at the first failure.
    - With no changes, Save just closes.
  - **Edge cases**
    - Keys typed in the filter bubble up to the panel. Space and ←/→ are taken for changing values when the selected row has choices, so you cannot type a space or move the caret with ←/→ in the filter then.
    - A key added by a newer CLI shows "default" until `configValues.ts` learns about it.

- **`/mcp`: `McpPanel`** (`components/CommandPanel/McpPanel.vue`)
  - **Data:** on mount, `Session.getMcpServers()` launches the channel and sends `get_mcp_servers`. The host maps `query.mcpServerStatus()` to `{ name, status, error, scope, toolCount }`, or returns an empty list when the query is not running or fails.
  - **States:** "Loading…" while loading with nothing yet; when there are no servers: "No MCP servers configured. Add one with `claude mcp add` in a terminal."
  - **Rows**
    - A coloured dot: ok for connected, bad for failed, warn for needs-auth or pending, off otherwise.
    - The name.
    - The status: `connected, N tools`, `failed: <error>`, the raw status, or `working…` while an action runs.
    - The scope tag.
  - **Subtitle:** `X/N connected`.
  - **Keys**
    - ↑/↓ or j/k move and wrap.
    - `r` reconnects.
    - `e` or Space toggles enable/disable, depending on whether the status is `disabled`.
  - **Buttons:** Reconnect (R) and Enable/Disable (E), shown only when a server is selected.
  - **Hint:** `↑/↓ to select · R reconnect · E enable/disable · Esc to close`.
  - **Running an action**
    - `Session.mcpServerAction` sends `mcp_server_action { action, serverName }`.
    - The host calls `reconnectMcpServer(name)` or `toggleMcpServer(name, enable)`, and returns `{ ok, error }` (error "No running session" when no query is running).
    - Errors show under the list as `name: error`.
    - Only one action runs at a time. After it, the list is refreshed, the selected server is kept by name, and the panel takes focus back. No chat message is added.
  - **With an argument,** `/mcp …` goes to the CLI.

- **`/auto-mode-setup`: `AutoModeSetupPanel`** (`components/CommandPanel/AutoModeSetupPanel.vue`)
  - **Three questions**, with values from the CLI 2.1.327 usage text:
    - Posture: personal, open-source, enterprise, mixed
    - Scope: all, project
    - Depth: both, shell, repos, here
  - Each starts on its first answer; the active row is highlighted and the picked answer is marked.
  - **Keys:** ↑/↓ or j/k change the question (wrapping); ←/→ or h/l change the answer (wrapping); clicking works too.
  - **Proposing:** Enter or the Propose button (↵) sends `/auto-mode-setup --wizard posture=… scope=… depth=… --propose` through `runCommand` and closes.
  - **Hint:** `↑/↓ question · ←/→ answer · Enter to propose · Esc to cancel`.
  - **Not covered:** the CLI answers with a text proposal; there is no UI for the apply step.

- **`/resume`** (`ChatInputBox.vue` with a filterable `ListPanel`)
  - **List:** title "Resume conversation", filterable, pre-filtered with the typed argument.
    - Items come from `sessionStore.sessionsByLastModified()`, keeping only sessions that have an id, newest first.
    - Each label is the summary, or "New Conversation".
    - The detail is the relative time ("just now", "Nm ago", "Nh ago", "Nd ago", or a date after 30 days) and `N messages`.
    - The active session has a check.
  - **Loading**
    - The panel first shows the cached list. "Loading…" appears only when that list is empty.
    - It then calls `sessionStore.listSessions()` (request `list_sessions_request`, host `handleListSessions`) and rebuilds the list.
  - **Empty:** "No earlier conversations in this workspace".
  - **"All chats" button:** closes the panel and emits `openHistory`; `ChatPage` emits `switchToSessions`, which opens the history page.
  - **Picking:** `store.openExisting(target)`. Picking the current conversation does nothing.
  - **`/resume <arg>`**
    - Switches directly when exactly one session id starts with the argument, or else exactly one summary equals it (case-insensitive).
    - Otherwise the panel opens filtered by the argument.

- **`/memory`** (`ListPanel`, host `handleGetMemoryFiles` and `handleOpenClaudeFile`)
  - **Files** (request `get_memory_files`; host `memoryFiles(cwd)` in `src/claude/services/claude/claudeFiles.ts`):
    - Project memory: `./CLAUDE.md`, or `./.claude/CLAUDE.md` when only that one exists.
    - Project memory (local): `./CLAUDE.local.md`.
    - User memory: `$CLAUDE_CONFIG_DIR/CLAUDE.md` or `~/.claude/CLAUDE.md`.
    - The cwd is the first workspace folder.
  - **Rows:** the label, the full path as detail, and a tag: "checked in", "not checked in", "all projects", or "new file" when the file is missing.
  - **Note:** "Opens the file in the editor (a missing one is created)."
  - **Picking:** `open_claude_file { kind, create: true }`.
    - The host creates the missing file and its folder (`ensureClaudeFile`) and opens it with `showTextDocument(preview: false)`.
    - Errors show as a notification.
  - **Loading:** "Loading…"; a failure is only logged.

- **`/hooks`** (filterable `ListPanel`, host `handleGetHooks` and `readHooks` in `claudeFiles.ts`)
  - **Data:** `get_hooks` reads `hooks.<Event>[].hooks[]` from the user, project and local settings files.
    - Hook types: `command`, or a prompt hook (its `prompt` text).
    - Unreadable JSON files are collected as `errors`.
  - **Rows**
    - label `Event (matcher)` or just `Event`
    - detail: the command, or `<type>: <command>` for non-command hooks
    - tag: user, project or local
  - **Subtitle:** `N configured`.
  - **Note:** one line per unreadable file: `<source> settings could not be read: <error>`.
  - **Empty:** "No hooks in the user, project or local settings".
  - **Hint:** `↑/↓ to select · type to filter · Enter to open its settings file · Esc to close`.
  - **Picking:** `open_claude_file { kind }` without `create`; a missing file gives the error "<file> does not exist".
  - **Not shown:** hooks from plugins or managed settings.

- **`/status`: `StatusPanel`** (`components/CommandPanel/StatusPanel.vue`, host `ClaudeAgentService.getStatus`)
  - **Data:** on mount, `Session.getStatus()` launches the channel and sends `get_status`. The host combines:
    - from the channel's last `system/init`: the version (`claude_code_version`), model, permission mode, cwd, `apiKeySource` and plugins
    - asked live: `accountInfo()`, `initializationResult()` (for the output style) and `mcpServerStatus()`
    - `settingsFiles(cwd)` and `memoryFiles(cwd)` (only files that exist)
    - Any part that fails is just left out.
  - **Header:** title "Status"; subtitle `Claude Code v<version>`.
  - **Sections**
    - **Session:** Version, Working directory, Model, Permission mode, Output style (default `default`). Before the first message, Version, Model and Permission mode show a muted "shown after the first message".
    - **Account:** Email, Organization, Plan, API provider (only when it is not `firstParty`), Auth (token source or API key source, unless `none`). With none of these: "Account — not reported by the CLI" (muted).
    - **MCP servers:** `Connected X/N`, then one row per server (status or `failed: err`; muted unless connected); with none, "Servers — none".
    - **Plugins:** name and version; the section is hidden when there are none.
    - **Settings files:** User, Project and Local paths; a missing file shows `(none)` and is muted.
    - **Memory:** one row per existing file, or "CLAUDE.md — none (create one with /memory)".
  - **States:** "Loading…" before the first answer; the error text if the request fails.
  - **Keys**
    - ↑/↓ or j/k scroll 20px; PageUp/PageDown or Space scroll 160px.
    - `s` opens the user settings (`open_claude_file 'user-settings'`) and closes on success.
    - `r` refreshes.
  - **Buttons:** Refresh (R) and User settings (S).
  - **Hint:** `↑/↓ to scroll · S open user settings · Esc to close`. Refresh (R) is not listed in the hint.

- **`/export`** (`ChatInputBox.vue`, `webview-ui/claude/src/utils/exportTranscript.ts`, host `handleExportConversation`)
  - **Panel:** "Export conversation" with "Save to file" (markdown, through a save dialog) and "Copy to clipboard".
  - **With no messages:** a warning notification "Nothing to export yet".
  - **Markdown** (`transcriptToMarkdown`)
    - The heading is `# <summary>`, or `# Claude conversation`.
    - Each turn gets a `## User` or `## Claude` heading. Consecutive messages from the same role are merged. Slash-command output counts as Claude; bash-mode messages count as User.
    - Block by block:
      - Text is copied as is.
      - Thinking goes inside `<details><summary>Thinking</summary>`.
      - A tool call becomes `**Name(main argument)**`. The main argument is cut to 160 characters; it is the command, file path, pattern, URL, query, description or prompt.
      - A tool result goes in a code fence, cut to 12 lines with `… +N lines`, and prefixed "Error:" for errors.
      - Images and documents become `[image]` and `[document]`; selections become `[selection: …]`.
      - Interrupts and notices are italic; slash-command output goes in a code fence; LLM errors become `**Error:**`.
      - Bash mode becomes a fenced `! cmd` followed by its shortened output.
    - Each fence is longer than any run of backticks inside it.
  - **File name:** `claude-<slug>-YYYY-MM-DD.md`, with an ASCII slug of at most 50 characters (`exportFileName`).
    - `/export <name>` adds `.md` unless the name already ends in `.md` or `.txt`, and goes straight to the save dialog.
  - **Host** (request `export_conversation { markdown, target, fileName }`)
    - Clipboard: `vscode.env.clipboard.writeText`.
    - File:
      - Characters from `\/:*?"<>|` are replaced with `-`.
      - The save dialog starts in the workspace folder, with Markdown and Text filters and the button label "Export".
      - The file is written with `workspace.fs`.
      - Cancelling the dialog returns `cancelled`, and no notification is shown.
  - **Notifications:** "Conversation copied to clipboard", "Conversation exported to <path>", or "Export failed: …" as an error.

- **`/add-dir [path]`** (`ChatInputBox.startAddDirectory` and `confirmAddDirectory`, host `handleResolveDirectory`, `Session.addDirectoryForSession` and `relaunch`)
  - **Finding the folder** (request `resolve_directory { path? }`)
    - With no path, a folder dialog opens ("Add directory", starting at the parent of the workspace).
    - `~` is expanded, and the path is resolved against the workspace cwd.
    - Errors: "<p> is not a directory" or "<p> does not exist", shown as error notifications. Cancelling closes quietly.
    - If there is no active session or connection, nothing happens.
  - **Already covered:** if the folder is the session cwd, a session `/add-dir` folder or a saved `permissions.additionalDirectories` entry (from `get_permissions`), or lies inside one, a warning says "<dir> is already accessible within <covering>". Windows drive letters are compared without case.
  - **Confirmation:** a `ListPanel` titled "Add directory" with the path as subtitle.
    - Choices: "Yes, for this session"; "Yes, and remember this directory" (saved in `.claude/settings.local.json`); "No".
    - Note: "Claude can then read and edit files in this directory. The conversation restarts in place to pick it up."
  - **Applying**
    - While a turn runs it is refused: "Wait for the current turn to finish, then add the directory again".
    - Remember: `update_permission { list: 'additionalDirectories', action: 'add', value, source: 'local-settings' }`, then `Session.relaunch()`, then "Added <dir>, saved in the local settings".
    - Session only: the folder is added to `Session.additionalDirectories`, then `relaunch()`, then "Added <dir> for this session".
    - `relaunch` closes the current channel (`close_channel`) and launches it again (`launch_claude`, which carries the extra directories and resumes the same conversation), because the SDK only takes extra directories at launch.
    - Session-only folders are lost when the webview is rebuilt.
  - **Also reachable** from the Permissions panel's Workspace tab (the `A` key).

- **`/permissions` and `/allowed-tools`: `PermissionsPanel`** (`components/CommandPanel/PermissionsPanel.vue`, host `handleGetPermissions`, `handleUpdatePermission`, and `readPermissions` / `updatePermissionList` in `claudeFiles.ts`)
  - **Tabs:** Allow, Ask, Deny and Workspace, each with a count. Content starts at the top and the content area keeps the same height on every tab.
  - **Subtitles by tab**
    - Allow: "Claude uses these tools without asking"
    - Ask: "Claude always asks before using these tools"
    - Deny: "Claude may never use these tools"
    - Workspace: "Claude can read and edit files in these directories"
  - **Rows**
    - Entries come from `get_permissions`: the user, project and local settings, read lowest precedence first and shown reversed, so the highest precedence comes first.
    - Each row shows the value and a tag (user, project or local).
    - The Workspace tab adds the cwd (tag "working folder") and the session's `/add-dir` folders (tag "this session") before the saved `additionalDirectories`.
    - Files that cannot be read show as an error note.
  - **Empty:** "No <tab> rules. Press A to add one." or "No working directories".
  - **Keys in the list**
    - ←/→ or Tab / Shift+Tab change tab.
    - ↑/↓ or j/k move.
    - `a` adds.
    - `d`, Delete or Backspace delete, in two presses.
    - Enter, or a double-click, opens the file the rule is in.
    - `r` refreshes (not listed in the hint).
  - **Deleting**
    - The first press arms the row ("Press D again to delete X") and the button becomes "Confirm delete". Moving to another row disarms it.
    - Rows with no settings file and no session flag (the cwd) cannot be deleted.
  - **Adding a rule**
    - An input appears with the placeholder "<Tab> rule, e.g. Bash(npm run test:*)".
    - "Save in" choices: Local (default; ".claude/settings.local.json, not checked in"), Project ("…shared with the team") or User ("~/.claude/settings.json, all projects"). Tab / Shift+Tab cycle through them.
    - Examples are shown: `Bash(git diff:*)`, `Read(./secrets/**)`, `WebFetch(domain:example.com)`, `mcp__server`.
    - The rule is checked against `^[A-Za-z_][\w.-]*(\(.+\))?$`; failing that gives an explanatory error.
    - A duplicate in the same file gives the error "X is already in the <src> settings".
    - Saving sends `update_permission { list, action: 'add', value, source }`.
      - The host keeps every other key in the file, creates the file if needed, and throws if the file is not a JSON object.
      - The panel then shows "Added X to Allow (local settings)", refreshes, and selects the new row.
    - Esc or Cancel goes back to the list instead of closing. The buttons are Cancel and Save (↵).
  - **Deleting**
    - A session folder: refused while busy. Otherwise it is removed from `additionalDirectories` and the session relaunches ("Removed X from this session").
    - A rule: `update_permission { action: 'remove' }`. When a list becomes empty, the host deletes its key.
  - **Workspace tab, Add:** emits `addDirectory`, which starts the `/add-dir` flow with the folder dialog.
  - **Hints:** list `←/→ tabs · ↑/↓ to select · A add · D delete · Enter open file · Esc to close`; adding `Enter to save · Tab to change the file · Esc to go back`.
  - **The CLI picks up settings changes on its own;** nothing restarts.

- **`/plugin` and `/plugins`: `PluginPanel`** (`components/CommandPanel/PluginPanel.vue`, host `handleGetPlugins`, `handlePluginAction`, `handleGetAvailablePlugins`, `handleGetMarketplaces` and `handleMarketplaceAction` in `handlers.ts`, and `src/claude/services/claude/claudeCli.ts`)
  - **Tabs:** Installed, Discover and Marketplaces, each with a count. On Discover the tab row also shows a search box ("type to search").
    - The panel stays open on focus loss (`persistent`) while a command runs or a confirmation is shown.
  - **Installed tab** (`claude plugin list --json`; reads both the newer `{ installed }` shape and a bare array)
    - Each row has a dot (lit when enabled), the name, the detail (`enabled`/`disabled`, `vX`, marketplace) and the scope as tag.
    - Subtitle: `X/N enabled`.
    - Empty: "No plugins installed. Find one in Discover (→)."
    - Keys:
      - Enter, `e`, Space or a double-click enable/disable (`plugin_action enable|disable <id> --scope`).
      - `d` or Delete uninstall in two presses ("Press D again to uninstall X").
      - `r` refreshes.
    - Buttons: Refresh (R), Enable/Disable (E), Uninstall / Confirm uninstall (D).
  - **Discover tab** (`claude plugin list --json --available`, 120 s timeout)
    - The host caches the list until a refresh or a marketplace change.
    - Loading text: "Loading plugins from the marketplaces…".
    - Typing searches name, id and description; Backspace deletes a character. The list is sorted by install count.
    - At most 100 rows are drawn, followed by "N more, type to narrow the list".
    - Each row shows the name, an "installed" badge, the marketplace tag and the install count (1.2K, 3.4M) with a cloud icon; the tooltip shows the exact count.
    - An info box shows the selected plugin's name, id and description ("No description" when it has none).
    - j/k are not navigation keys here, because letters go to the search.
    - Empty: "No matches" when searching, otherwise "The marketplaces list no plugins".
    - Buttons: Refresh (reloads with `refresh: true`) and Install (↵), shown only when the plugin is not installed. A plugin that is already installed gives the message "X is already installed".
  - **Installing**
    - **Scope step:** "Install X for" with three choices:
      - You, in all projects — `~/.claude/settings.json`
      - Everyone on this project — `.claude/settings.json`, checked in
      - You, in this project only — `.claude/settings.local.json`
      - Keys: ↑/↓ or j/k, Enter, or 1–3. Esc goes back.
    - Then `plugin_action install <id> --scope <s>` runs with `--json` and a 5-minute timeout.
    - **Approval step:** if the CLI stops at a command declared by the marketplace (`shownCommand`), the panel shows:
      - "X is installed by running this command from its marketplace:"
      - the command in a `<pre>`, the archive URL if any, and "Only run it if you trust the marketplace and the plugin."
      - Enter or "Run and install" runs it again with `--accept-command <sha256>`. The host never uses `-y`.
    - On success: the CLI's message or "Installed X", then the Installed list reloads.
  - **Marketplaces tab** (`claude plugin marketplace list --json`)
    - Each row shows the name and the source plus location (repo, URL or path).
    - Empty: "No marketplaces. Press A to add one."
    - Keys:
      - `a` adds. The input placeholder is "owner/repo, git or https URL, or a local path", with the note "The marketplace is added to your user settings."
      - `u` updates.
      - `d` or Delete remove in two presses ("…(its plugins stay installed)").
    - These run with a 5-minute timeout, and the Discover cache is cleared.
  - **While a command runs:** the body shows the progress text ("Installing X…", "Enabling…", "Adding…"), keys are ignored, buttons are hidden, and the hint reads "Esc to close (the command keeps running)".
  - **After any plugin change,** the host calls `agentService.reloadPlugins()` on every open channel (`query.reloadPlugins()`).
  - **CLI output:** `runPluginCommand` reads the last JSON line of stdout (`outcome`, `message`, `shownCommand`).
    - Success means exit code 0 and `outcome` either missing, `ok`, or `alreadyInGoalState`.
    - `stripAnsi` removes colour codes and links.
  - **Hints by state**
    - scope: `↑/↓ to select · Enter to install · Esc to go back`
    - confirm: `Enter to run and install · Esc to cancel`
    - add marketplace: `Enter to add · Esc to go back`
    - Installed: `←/→ tabs · Enter or E enable/disable · D uninstall · R refresh · Esc to close`
    - Discover: `←/→ tabs · type to search · Enter to install · Esc to close`
    - Marketplaces: `←/→ tabs · A add · U update · D remove · Esc to close`
  - **Esc** in the scope, confirm or add-marketplace steps goes back to the list; otherwise it closes.

- **`/login` and `/logout`: `AuthPanel`** (`components/CommandPanel/AuthPanel.vue`, host `handleGetAuthStatus`, `handleAuthLogin`, `handleAuthLoginAction` and `handleAuthLogout`, and `LoginProcess` in `claudeCli.ts`)
  - **Status:** on mount, `get_auth_status` runs `claude auth status --json` (15 s). The subtitle reads `signed in as <email | API key | method>   <Plan>` or "not signed in".
    - `/logout` while signed out switches to the login panel (`switchMode`).
  - **Stages:** loading → choose → (email for SSO) → starting → waiting → done; logout uses working → done.
  - **Login choices** (numbered 1–3; keys ↑/↓, j/k, Enter, digits)
    - "Claude account with subscription" (Pro, Max, Team or Enterprise)
    - "Anthropic Console account" (API usage billing)
    - "Single sign-on (SSO)" (organization login). This asks for a work email first ("Work email for SSO", pre-filled with the current email); Enter or "Continue" goes on.
    - Note when already signed in: "Signing in again replaces the current account. Open conversations restart with the new one."
  - **Starting the sign-in** (`auth_login { method, email }`)
    - The host spawns `claude auth login --claudeai|--console|--sso [--email]` in a node-pty (4000 columns, so the URL is never wrapped).
    - It waits up to 30 s for the first `https://` URL in the output and returns `{ loginId, url, result }`.
  - **Waiting stage**
    - The panel shows "Finish signing in in the browser. If it did not open, open this link:" with the URL as a clickable link (`auth_login_action open_url`, which calls `openExternal`). Before the URL arrives: "Waiting for the CLI to print the sign-in link…".
    - An input reads "Paste the code from the browser page, if it shows one". Enter or "Send code" sends `auth_login_action code`, which writes `code\r` into the pty. The panel then shows "Code sent, checking…".
    - The panel also sends `auth_login_action wait`, which resolves when the process exits.
    - The panel stays open on focus loss during starting and waiting.
    - Buttons: Open browser and Send code (↵).
  - **Finishing**
    - Exit code 0 means success. The host runs `closeAllChannelsWithCredentialChange()`, so every tab relaunches with the new credentials on its next message.
    - The panel shows "✓ Signed in as X. Open conversations continue with this account."; Enter or Close dismisses it.
    - On failure, the last three output lines appear as the error and the panel returns to the choices with a Close button.
    - The host keeps the finished result for 60 s.
  - **Cancelling:** closing the panel during an unfinished sign-in sends `auth_login_action cancel`, which kills the pty.
  - **Logout:** choices "Log out <email>" and "Cancel".
    - Note: "Open conversations stop; send a message after /login to continue."
    - `auth_logout` runs `claude auth logout`; if the exit code is not 0, the CLI's error is shown. On success, all channels close and the panel shows "Signed out. Use /login to sign in again."
  - **Hints by stage**
    - choose: `↑/↓ to select · Enter to confirm · Esc to cancel`
    - email: `Enter to continue · Esc to cancel`
    - waiting: `Enter to send the code · Esc to cancel the sign-in`
    - done: `Enter or Esc to close`
    - others: `Esc to cancel`

- **`/help`: `HelpPanel`** (`components/CommandPanel/HelpPanel.vue`)
  - **Subtitle:** `N commands`, or `filter: q` while filtering.
  - **Shortcuts section** (static, shown only when there is no filter):
    - Enter — send (queued while Claude is working)
    - Shift+Enter — new line
    - Esc — stop the running turn, or close a menu
    - Shift+Tab — switch permission mode
    - `/` — commands; `@` — mention a file
    - Shift+drop — mention dropped files
    - Ctrl+V — paste an image or file
  - **Commands section:** every registered slash command, sorted by label. Each row shows the label (at most 130px or 40% wide), the description, and a "UI" tag for commands this UI handles.
  - **Filtering:** typing filters on label plus description (a leading `/` is ignored); Backspace deletes. Empty: "No matches".
  - **Keys:** ↑/↓ wrap; PageUp/PageDown move 8; Home only scrolls to the top (the selection stays); Enter or a click picks.
  - **Hint:** `↑/↓ to select · type to filter · Enter to use · Esc to close`. The list is at most 260px tall.
  - **Picking** (`ChatInputBox.pickFromHelp`): the command's panel or picker opens if it has one. Otherwise `"<command> "` is put into the input with the caret at the end, ready for arguments.

- **`/rewind`, `/undo`, `/checkpoint`, Esc Esc, and "Restore checkpoint": `RewindPanel`** (`components/CommandPanel/RewindPanel.vue`, `ChatInputBox.openRewind` and `handleEscape`, `Session.rewindCode` and `rewindConversation`, `ClaudeAgentService.rewindFiles`)
  - **Ways in**
    - the commands
    - pressing Esc twice within 600 ms while idle with an empty input. With text in the input, the double Esc clears it instead.
      - The double press is ignored when it is a key repeat, while a turn runs, or while a bash command runs; there Esc stops the turn or command instead.
    - "Restore checkpoint" on a message (`ChatPage` provides `RestoreCheckpointKey`), which opens directly on that message's second step
  - **While busy:** the warning "Wait for the current turn to finish".
  - **Step 1, choose a message:** a filterable `ListPanel` titled "Rewind".
    - Subtitle: "restore the conversation and code to before a message".
    - The list holds your messages that have a uuid and some text, newest first, each on one line cut to 120 characters, with the relative time.
    - Empty: "Nothing to rewind yet".
  - **Step 2, choose what to restore:** "Rewind to before" with the message (cut to 60 characters) as subtitle.
    - It first runs a dry run: `rewind_files { userMessageId, dryRun: true }`. The host calls `query.rewindFiles(id, { dryRun })`.
    - Choices:
      - "Restore code and conversation" and "Restore code" appear only when there are code changes; their detail reads `N files +ins -del`.
      - "Restore conversation"
      - "Never mind"
    - Note: "Restored files open as diffs to review." or "No code changes to restore after this message."
  - **Applying**
    - Code: `rewind_files`; if `canRewind` is false, it errors with the CLI's message or "Could not restore the code".
    - Conversation:
      - `get_rewind_point` finds the parent uuid; if the message is not in the saved conversation, it errors.
      - The channel is closed, the messages from the target on are removed, todos and queued prompts are cleared, and `pendingResumeAt` is set before the channel relaunches.
      - If the target was the first message, the session id and summary are cleared.
    - The notification reads "Restored code (…) and conversation".
    - Unless only code was restored, the rewound message's text goes back into the input to edit and resend.
    - Errors keep the panel open and show under the choices.

- **`/release-notes`** (host `handleOpenReleaseNotes`): opens `$CLAUDE_CONFIG_DIR/cache/changelog.md` in the markdown preview when it exists; otherwise opens the CHANGELOG on GitHub in the browser. Errors show as a notification.

- **Prompt-history search (Ctrl+R)** (`ChatInputBox.vue` with a filterable `ListPanel`)
  - Opens "Search prompts", pre-filled with the current input; the history is refreshed from the host (`get_prompt_history`).
  - Rows: the prompt on one line (cut to 120 characters) and the relative time.
  - Empty: "No prompts typed in this project yet".
  - Hint: `↑/↓ to select · type to search · Enter to use · Esc to cancel`. Enter puts the prompt into the input.

- **How CLI commands' output and state changes appear in the chat** (`core/Session.ts processIncomingMessage`, `models/Message.ts`, `models/contentParsers.ts`, `src/claude/services/claude/ClaudeSessionService.ts`)
  - **Your command message:** text containing `<command-name>` and `<command-args>` is shown as `"/name args"`, as a text block with `isSlashCommand` and the CSS class `slash-command-text` (`TextBlock.vue`).
  - **Command output**
    - `<local-command-stdout>` and `<local-command-stderr>` become a `slash_command_result` block. It is rendered by `SlashCommandResultMessage.vue` (`codicon-pass` / `codicon-error`, "Command Output" / "Command Error", scrollable `<pre>`) or `SlashCommandResultBlock.vue` (✓ / ❌).
    - Live, the CLI sends local-command output as a `<synthetic>` assistant text. `/usage` (and `/cost`) is parsed by `parseUsageReport` into a usage card (`usage_report` tip); other output renders as normal assistant text.
    - In saved history, `system/local_command` entries are turned into the same synthetic assistant message, with the tags removed (`ClaudeSessionService.ts`).
  - **`conversation_reset`** (sent by the CLI for `/clear`, `/reset`, `/new`, and leaving plan mode with "clear context") calls `resetConversation()`, which:
    - clears queued prompts, messages, background activity and todos
    - clears the summary/title, the last sent selection and the pending effort argument
    - sets the token count to 0 and clears the cold-resume cache markers
    - refreshes the context usage
    - The new session id arrives on later events. The old conversation stays in history.
  - **`system` / `session_title_changed`:** updates the summary, and through it the tab title (see `/rename` above).
  - **`system` / `compact_boundary`:** adds a notice "Conversation compacted" (or "…automatically" when `trigger === 'auto'`) with the detail "15.9K → 6.6K tokens" (or "N tokens before"), and refreshes the context usage. The summary message the CLI adds after compaction is hidden (`isCompactSummary` / `isSynthetic`). "Not enough messages to compact." shows as a normal message.
  - **`system` / `init`**
    - marks the session busy, unless the message came from bash mode
    - takes `output_style` and `permissionMode` (also from `system/status`)
    - refreshes the context usage and the applied effort
    - adds the "Code Mode (experimental) is on" notice once when `uic_code_mode` is set (added by `ClaudeAgentService`)
    - A `hook_*` event that arrives before any session id does not set the session id.
  - **`result`**
    - clears busy, updates the cost (`total_cost_usd`), and refreshes context usage and effort
    - when `local_command === 'effort'`, runs the effort sync described above
    - prompts still queued when the turn ends are marked to run as the next turn
  - **`command_lifecycle`** (`started`, `cancelled`, `failed`): moves queued prompts into the transcript or drops them.
  - **`__llm_request_error__`:** while busy, it becomes an `llm_error` tip in the chat; when idle, a VS Code error notification.

- **Host ↔ webview request types behind these features** (handled in `ClaudeAgentService.processRequest`, with handlers in `handlers.ts`)
  - **Need a running channel:**
    - `get_output_styles`, `get_status`, `get_mcp_servers`, `mcp_server_action`
    - `get_config_options` (plus a throwaway CLI run for the key list)
    - `get_applied_effort`, `get_context_usage`
    - `set_effort_level`, `set_model`, `set_thinking_level`, `set_permission_mode`
    - `rewind_files`, `launch_claude`, `close_channel`
  - **Files and VS Code:**
    - `get_memory_files`, `open_claude_file { kind, create? }`, `get_hooks`
    - `get_permissions`, `update_permission { list, action, value, source }`
    - `resolve_directory { path? }`
    - `export_conversation { markdown, target, fileName }`
    - `open_release_notes`, `open_config_file { configType }`
    - `get_rewind_point`, `list_sessions_request`, `get_prompt_history`, `add_prompt_history`
  - **Run the `claude` CLI directly:**
    - `get_plugins`, `plugin_action { action, pluginId, scope, acceptCommand }`
    - `get_available_plugins { refresh }`, `get_marketplaces`, `marketplace_action { action, target }`
    - `get_auth_status`, `auth_login { method, email }`, `auth_login_action { loginId, action: wait|code|cancel|open_url, code }`, `auth_logout`
    - `get_cli_version` (cached per CLI path)
  - **How file paths are resolved:** the host works out every memory and settings path from the file kind (`resolveClaudeFile`, `claudeFiles.ts`), honouring `CLAUDE_CONFIG_DIR`, with the first workspace folder as cwd. The webview never sends a path.

- **Gaps the code or the parity doc mention** (`docs/CLAUDE_UI_CLI_PARITY.md`)
  - `/autocompact` does not mark the current value.
  - `/auto-mode-setup` has no UI for the apply step.
  - `/plugin` does not support `--config` for plugins with user settings.
  - `/hooks` leaves out plugin and managed hooks.
  - `/usage-credits` and `/extra-usage` open a browser while the UI only shows a line of text.
  - Folders added for this session only are lost when the webview is rebuilt.
  - Most items are marked "[~] done, awaiting manual test".

## B5. Trang Sessions, trang Settings, vòng đời phiên, tab, iframe/giao diện, phía host

### SessionsPage (chat history list)
- **How you get there and how you leave** (`webview-ui/claude/src/App.vue`, `.../webview-ui/claude/src/pages/ChatPage.vue`, `.../webview-ui/claude/src/components/ChatInputBox.vue`)
  - Ways in: the history button (codicon `history`, tooltip "Show chat history") in the ChatPage header; "View all" in the empty-chat "Recent conversations" block; "All chats" in the `/resume` panel.
  - Switching pages runs a small fade and slide (motion-v, 0.3 s easeOut). Going to sessions fades to opacity 0.7 at x -3 before settling; going to chat uses x +3.
  - SessionsPage and ChatPage share one runtime (`useRuntime`). The runtime is created only when the start page is `chat` or `sessions`.
- **Header**, a 35px strip styled like ChatPage (`.../webview-ui/claude/src/pages/SessionsPage.vue`)
  - Back button (codicon `arrow-left`, tooltip "Back to chat") emits `switchToChat` with no session id.
  - Title text is "Chat history".
  - "+" button (tooltip "New conversation") calls `createSession({isExplicit:true})`, makes it active and switches to chat. Unlike ChatPage's "+", this opens the new conversation in the current tab, not a new host tab.
- **Search row**
  - Search icon plus an input with placeholder "Search chats…".
  - Esc clears the query.
  - Matching is case-insensitive and trimmed, on the summary or the session id (substring).
- **States** (all in SessionsPage.vue)
  - Loading: "Loading…" is shown at first (`loading` starts true). `refreshSessions()` runs on mount.
  - Error: "Failed to load chat history: <msg>" plus a "Retry" link. One source is the 15 s timeout in `SessionStore.listSessions` ("Timed out loading chat history"), in `.../webview-ui/claude/src/core/SessionStore.ts`.
  - Empty: "No chats yet." plus a "Start one" link. The link only switches back to chat; it does not create a session.
  - A search with no matches shows an empty list, with no "no results" message (groups with no items are filtered out).
- **Grouping**, by `lastModifiedTime`
  - Buckets: Today (since local midnight), Yesterday (less than 24 h before midnight), Last 7 days (up to 6 days before midnight), Older.
  - The input is already sorted newest first by `sessionsByLastModified`.
- **Each row**
  - Codicon `comment`, then the title (`summary` or "New Conversation"), then a relative time.
  - Relative time: "just now" under 1 min; "N min ago"; "N h ago"; "N d ago" under 7 days; after that `toLocaleDateString('zh-CN')`, a Chinese-locale date. Invalid or missing dates show "just now".
  - Clicking a row calls `SessionStore.openExisting(raw)` without awaiting it, then switches to chat straight away.
  - If another tab owns that conversation, ChatPage shows the conflict prompt. Until the owner check finishes, the previous conversation stays on screen.
- **Not implemented**: delete, rename, pin, export, multi-select and keyboard navigation of the list. Rename exists only as `/rename` in chat (see Session lifecycle).
- **Where the list comes from**
  - Host side: `handleListSessions` → `ClaudeSessionService.listSessions(cwd)` (`.../src/claude/services/claude/handlers/handlers.ts`, `.../src/claude/services/claude/ClaudeSessionService.ts`).
    - It reads `~/.claude/projects/<cwd with non-alphanumerics replaced by ->/*.jsonl`, honouring `CLAUDE_CONFIG_DIR`.
    - Only the default workspace folder is used, and every entry is marked `isCurrentWorkspace: true`.
    - Errors give an empty list, not an error.
  - Title priority: `custom-title` (from `/rename`), then `ai-title`, then a `summary` entry for the leaf, then the first real user prompt.
    - The prompt is cleaned: newlines collapsed, cut to 45 chars plus "...". "No prompt" if there is none.
    - Injected text is skipped: `<command-name>`, `<local-command-`, `<bash-`, `<system-reminder>`, `<task-notification>`, `<ide_`, "Caveat:…".
  - Conversation chains follow `parentUuid`/`logicalParentUuid`, so a conversation compacted with `/compact` is listed once.
  - `lastModified` is the last message's timestamp. `messageCount` is the chain length.
  - Side effect: the first listing of each folder per run calls `sweepProject` (`.../src/claude/services/claude/resumeVisibility.ts`). It rewrites `"entrypoint":"sdk-ts"` to `"entrypoint":"cli"   ` in place (same length, first 256 KB of each file, complete lines only), so the conversations also appear in the terminal's `claude --resume`. After each `result`, `showSessionInCliResume` does the same for that conversation, once per session.
- **Messages**: request `list_sessions_request` / response `list_sessions_response` `{sessions:[{id,lastModified,messageCount,summary,isSidechain,worktree:undefined,isCurrentWorkspace}]}`.

### SettingsPage and its tabs
- **Can the user reach it?** (`.../webview-ui/claude/src/App.vue`, `.../res/webview/claudeFrame.js`)
  - SettingsPage renders only when `UIC_BOOTSTRAP.page === 'settings'`. `claudeFrame.js` always boots iframes with `page: 'chat'`, and nothing in `src/` builds a settings page.
  - So in this extension the page is effectively unreachable. `/config` and `/settings` in chat open the CLI config panel instead (`ChatInputBox.vue`).
  - Everything below describes what the code implements if the page is shown.
- **Layout** (`.../webview-ui/claude/src/pages/SettingsPage.vue`, `.../webview-ui/claude/src/components/settings/SettingsSidebar.vue`)
  - Left sidebar: profile selector, then a search box (placeholder "Search settings ⌘F"), then the tab list. The search box has no binding or handler and does nothing.
  - Tab list, with dividers after Profiles, Memory and Rules, and Network:
    - General (mdi-cog), Models (codicon-cube), Profiles (mdi-account-cog-outline)
    - Plugins (codicon-extensions), Environments (codicon-symbol-variable), Memory and Rules (codicon-clipboard-list)
    - Permissions (mdi-shield-key-outline), Sandbox (mdi-file-table-box-outline), Network (mdi-earth)
    - Hooks (codicon-debug-line-by-line), Skills (codicon-wand), MCP Servers (codicon-cube-nodes), Slash Commands (mdi-apple-keyboard-command)
  - Footer: a "Docs" row with an external-link icon. It has no click handler.
  - The default tab is `general`. `SettingsTabAgent.vue` exists but is not registered as a tab.
  - Icons: `codicon-*` names map to codicon; anything else is treated as mdi.
- **Profile selector** (`.../components/settings/SettingsProfileSelector.vue`, `SettingsSidebar.vue`)
  - Options: "Default Profile" (value `default`), one entry per custom profile ("Custom Profile"), then "Manage Profiles..." with a separator above it and no check mark.
  - Picking "Manage…" switches to the Profiles tab. Picking anything else calls `switchProfile` (`null` for Default).
  - The trigger shows codicon `account`, the truncated label and a chevron.
- **Scope bar**, top right (`.../components/settings/SettingsScopeTab.vue`)
  - Tabs: "User", shown as "User (<profile>)" when a profile is active (codicon account); "Workspace" (folder); "Local" (lock). An indicator bar animates under the active tab.
  - Workspace and Local are disabled when no folder is open, with tooltips "Open a workspace to use Workspace settings" / "…Local settings".
  - Default scope is `global` (User). The scope is provided to child components through `SETTINGS_SCOPE_KEY` (`.../composables/useSettingsScope.ts`); outside the page it falls back to `global`.
  - `SettingScopeSelect.vue` is a scope dropdown with badge colours that no tab uses.
- **Shared row behaviour: `SettingsItem`** (`.../components/settings/SettingsItem.vue`)
  - Badges next to the label:
    - "inherited" (subtle; tooltip "Inherited from a lower-priority scope"): no value at the current scope, but some scope other than the schema default supplies one.
    - "overridden" (warning; "Overridden by Workspace/Local scope"): editing User while Local or Shared has a value, or editing Workspace while Local has one.
    - "Managed" (danger) or "CLI" (warning) when the effective scope is managed or cli; the row is then read-only ("Setting is managed by policy or CLI arguments"), with no reset button.
  - A reset button (codicon `discard`, "Reset to default") appears only when the current scope has an explicit value.
  - What the input shows: the scope's own value; else the inherited effective value; else empty, with the placeholder hinting the default.
  - With a profile active and User selected, edits go to the profile layer (`values.profile`), not `settings.json`.
- **Store** (`.../webview-ui/claude/src/core/SettingsStore.ts`, `.../composables/useSettingsStore.ts`)
  - On creation it fetches `get_settings` and `sdk_probe` in parallel. The probe asks for `supportedModels`, `supportedCommands`, `mcpServerStatus` and `accountInfo`, with a 30 s timeout.
  - Models whose description is "Custom model" are dropped from `supportedModels`.
  - Initial local defaults: `systemNotifications:false`, `completionSound:true`.
  - `updateSetting` is optimistic:
    - It mirrors the host's delta-only rule: a value equal to the schema default deletes the key at that scope.
    - It recomputes the effective value with priority managed > cli > profile > local > shared > global.
    - It sends `update_setting` without waiting; errors are only logged.
  - `resetSetting` is optimistic too. It removes the key, sends `reset_setting`, then re-fetches all settings; on failure it rolls back and rethrows.
  - `switchProfile`, `createProfile` and `deleteProfile` each re-run initialize, which re-fetches settings and re-probes the SDK.
- **Host side** (`.../src/claude/services/configurationService.ts`, `handlers.ts`)
  - Layer files:
    - managed: `~/.claude/managed-settings.json`, a stand-in path
    - cli: always `{}`
    - global: `~/.claude/settings.json`
    - profile: `~/.claude/settings.<name>.json`, deep-merged over global for plain objects
    - shared: `<ws>/.claude/settings.json`
    - local: `<ws>/.claude/settings.local.json`
    - defaults: from `res/claude/claude-code-settings.schema.json`
  - Writes are delta-only: a value equal to the schema default deletes the key.
  - Writes or resets at `global` also call `syncProfileToUic()`.
  - Writing `shared` or `local` with no workspace throws "No workspace open for … settings".
  - `get_settings_response` = `{settings, metadata{effectiveScope, values}, activeProfile, profiles, hasWorkspace}`.
  - Caveat: `getAllSettings()` merges the layers with a shallow spread, despite the comment saying otherwise. A Local `env` or `permissions` object therefore replaces the whole Shared/User object in the effective value the tabs display.
- **General tab** (`.../components/settings/tabs/SettingsTabGeneral.vue`)
  - **Startup Defaults** (stored in the extension config `~/.claude/ai-cli-diff-view-ui.json`, read with `get_extension_config`, written with `update_extension_config`):
    - "Default Permission Mode" dropdown: Default, Accept Edits, Plan Mode, Don't Ask. Default value `default`.
    - "Extended Thinking" switch. On stores `default_on`, off stores `off`.
    - Both values are saved, but no host or webview code reads them when starting a session. `handleInit` hard-codes `thinkingLevel: 'default_on'`.
  - **Language & Output** (Claude Code settings, scope-aware):
    - `language`: text, placeholder "e.g. japanese, chinese".
    - `outputStyle`: text, placeholder "e.g. Explanatory, Concise".
  - **Agent Behavior**:
    - `respectGitignore`: switch, default on.
    - `teammateMode`: Auto / In-Process / Tmux, default auto.
    - `plansDirectory`: monospace text, placeholder `~/.claude/plans`.
  - **UI & Experience**: `showTurnDuration` switch, default off.
  - **Notifications**: `systemNotifications` and `completionSound` switches, both shown off by default.
    - These are written to Claude settings, but no code in this repo acts on them.
  - **Git Attribution**: "Commit Message" and "PR Description" both edit `attribution.{commit,pr}`.
    - Placeholder "Generated with Claude". An empty value removes that sub-key.
  - **Chat History**: "Cleanup Period" number (min 1, width 68px, default 720) plus "days".
    - Always written to `global`, ignoring the scope bar.
  - **Advanced**:
    - `autoUpdatesChannel`: Stable / Latest.
    - `forceLoginMethod`: Not restricted / Claude.ai / Console. "Not restricted" writes an empty string.
    - `apiKeyHelper`: monospace text, placeholder `/path/to/script.sh`.
  - Text inputs commit on `change` (blur or Enter), not on every keystroke.
- **Models tab** (`.../components/settings/tabs/SettingsTabModels.vue`)
  - **Model Manage**
    - "Default Model" (`model`): dropdown of built-in plus custom models. Choosing `default` resets the key at the current scope.
    - Add row: Model ID (monospace) + Display Name (optional) + "+" button, disabled while the ID is empty. Enter in either field adds.
      - A duplicate ID just clears the inputs.
      - The list is stored in extension config `customModels`.
    - A "Search models..." box appears only when more than 6 models are listed. It matches name, ID and description.
    - Custom rows: name, ID, a "custom" badge, an enable switch, and a trash button ("Remove custom model"). Removing also drops the ID from `disabledModels`.
    - Built-in rows: the aliases Default, Sonnet, Opus and Haiku (description from the SDK when it has one), then SDK models not covered by an alias, with " (recommended)" stripped from the name.
    - Each row has an enable switch (tooltip "Enabled/Disabled in chat selector"). This is a deny-list stored in extension config `disabledModels`.
    - States: "Loading models from SDK..." while probing; "No models match your search" or "No models available" when empty.
    - `update_extension_config` makes the host broadcast an `extension_config_changed` request, so the chat model picker refreshes live (`.../composables/useModelCatalog.ts`).
  - **Thinking & Effort**
    - `alwaysThinkingEnabled`: switch, default off.
    - `effortLevel`: Low / Medium / High, default high.
      - Usable only when `settings.model` contains `opus-4-6`. Otherwise the dropdown is dimmed, changes are ignored, and the description reads "Only available for Opus 4.6 — current model does not support effort level."
  - **Model Routing**: env vars written into `env` at the current scope.
    - Dropdowns: `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`.
      - Options: "Not set" first, then models. A current value not in the list is inserted as "Current value".
      - Unset values show "Not set" in a dimmed style.
    - Number inputs (min 0; 0 deletes the var): `MAX_THINKING_TOKENS`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS`.
- **Profiles tab** (`.../components/settings/tabs/SettingsTabProfiles.vue`)
  - Create row: "Add profile name..." + "+" button. Allowed names match `[a-zA-Z0-9_-]+`; otherwise the button is disabled. Enter creates.
  - Errors appear in red text, for example the host's "Profile '<n>' already exists." or "Invalid profile name…".
  - List:
    - A synthetic "Default" row (`~/.claude/settings.json`), then each profile (`~/.claude/settings.<p>.json`).
    - The active row is highlighted with a green "active" badge.
    - Non-default rows have an edit button ("Edit profile name") that only logs (TODO) and a delete button.
    - Delete is disabled for the active profile ("Cannot delete active profile"). Separately, if the host is asked to delete the active profile, it switches to Default first.
  - Profiles are found by scanning `~/.claude` for `settings.<x>.json`.
  - Creating a profile writes `{}`.
  - Switching saves `activeProfile` in extension config, then rewrites the overlay file `~/.claude/ai-cli-diff-view-settings.json`, which running CLIs hot-reload.
- **Environments tab** (`.../components/settings/tabs/SettingsTabEnvironments.vue`)
  - A table with Variable / Value / actions columns.
  - Rows at the current scope:
    - Key, plus an "overridden" badge when a higher scope has the same key.
    - Value: double-click or the edit button turns it into an inline input. Enter or ✓ saves; Esc or ✕ cancels. The text is selected on entry.
    - Trash button: "Remove from this scope".
  - Inherited rows: dimmed, with an "inherited" badge and an "Override in this scope" (↑) button that copies the value into the current scope.
  - Empty state: "No environment variables set."
  - Add row:
    - Key field is a combobox with a list of known variables (about 35: auth, telemetry, features, UI, execution, storage, ripgrep, Vertex regions). Variables already set anywhere are hidden.
    - "Type to search known variables..." when empty; "Press Enter to use "<x>"" for a custom name. Enter or Tab moves focus to the value field.
    - "+" is disabled until a key is typed.
  - Keys managed by other tabs are hidden here: Models, Network, Sandbox shell/bash, and MCP (the `CLAIMED_ENV_KEYS` list).
  - "Reset all env vars at this scope" (shown when the scope has entries) resets the whole `env` key. That also wipes the hidden keys owned by other tabs at that scope.
- **Memory and Rules tab** (`.../components/settings/tabs/SettingsTabMemoryAndRules.vue`)
  - Edit buttons: User Memory `~/.claude/CLAUDE.md`, Project Memory `.claude/CLAUDE.md`, Local `.claude/CLAUDE.local.md`.
  - Open buttons: User Agents `~/.claude/agents/`, Project Agents `.claude/agents/`.
  - **Bug**: these send `open_config_file` with `user-claude-md`, `project-claude-md`, `local-claude-md`, `user-agents` or `project-agents`. `getConfigFilePath` (`handlers.ts`) knows none of them and falls through to `~/.claude/<type>.json`. The file is missing, so the request fails ("Failed to open config file: …").
  - Company Announcements:
    - Each announcement is listed with an ✕ to remove it. "Add announcement..." + Enter adds one.
    - Duplicates and empty strings are ignored. Always written to `global`.
    - The list is copied from settings once on mount, so it does not refresh live.
- **Permissions tab** (`.../components/settings/tabs/SettingsTabPermissions.vue`)
  - **Default Mode**
    - Options: Default, Accept Edits, Plan, Delegate, Don't Ask, Bypass. Shows inherited and overridden badges.
    - Picking Default deletes `defaultMode`.
    - Bypass is offered even when bypass is not allowed.
    - When the managed scope sets `disableBypassPermissionsMode: 'disable'`, a "Bypass Mode Disabled" row with a "Managed" badge appears.
  - **Permission Rules**
    - Caption: "Evaluation order: Deny → Ask → Allow…".
    - Deny, Ask and Allow rule lists are coloured pills. Scope pills have ✕; inherited pills are dimmed, with the tooltip "Inherited — remove from the source scope to change".
    - Inputs (monospace, Enter adds, duplicates ignored), with placeholders `Bash(rm:*)`, `Bash(git push:*)`, `Bash(npm run *)`.
  - **Additional Directories**: same pill UI, placeholder `~/docs, ../shared`.
  - Saving strips empty arrays and the default mode before writing. If nothing is left, the `permissions` key is removed.
- **Sandbox tab** (`.../components/settings/tabs/SettingsTabSandbox.vue`)
  - Switches: Enable Sandbox (off); Auto-approve Bash when Sandboxed (on); Allow Unsandboxed Commands (on). The last two are disabled while the sandbox is off.
  - Excluded commands: pills with "Add command...".
  - Allow Local Binding switch (macOS; disabled while the sandbox is off). Allowed Unix Sockets: pills, monospace input.
  - HTTP and SOCKS proxy ports: 0–65535, where 0 means unset; disabled while the sandbox is off.
  - Edge cases:
    - Values are read from the effective settings once, on mount, and are not scope-aware.
    - Writes call `updateSetting('sandbox', …)` with no target, which means User or the active profile, whatever the scope bar says.
    - Loading values on mount trips the watchers, so a user whose values differ from the component defaults gets a write just by opening the tab.
- **Network tab** (`.../components/settings/tabs/SettingsTabNetwork.vue`)
  - Proxy: `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`.
  - mTLS: `CLAUDE_CODE_CLIENT_CERT`, `CLAUDE_CODE_CLIENT_KEY`, `CLAUDE_CODE_CLIENT_KEY_PASSPHRASE` (password field).
  - Each field shows the effective value and an "inherited" badge. Commits on change to `env` at the current scope; an empty value deletes the key.
- **MCP Servers tab** (`.../components/settings/tabs/SettingsTabMCPServers.vue`)
  - **Server Status**, from the SDK probe:
    - Spinner with "Probing MCP servers..." while probing.
    - Each server: name plus a badge (Connected = success, Failed = danger, Needs Auth = warning, Pending = subtle), and "<name> v<version>" when known.
    - Empty: "No MCP servers configured".
    - Buttons:
      - "Refresh" re-probes (disabled and spinning while loading).
      - "Global Config" opens `~/.claude.json`.
      - "Project Config" opens `<ws>/.mcp.json` (disabled with no workspace).
  - **Project Server Policy**:
    - `enableAllProjectMcpServers` switch.
    - `enabledMcpjsonServers` and `disabledMcpjsonServers` pill lists ("Server name...").
    - These lists start from the effective value, so editing at one scope copies inherited entries into that scope.
  - **Enterprise Policy**: shown only when managed `allowedMcpServers` or `deniedMcpServers` exist. Read-only pills with a "Managed" badge.
  - **MCP Environment Variables**: `MCP_TIMEOUT`, `MCP_TOOL_TIMEOUT`, `MAX_MCP_OUTPUT_TOKENS`, `ENABLE_TOOL_SEARCH`, `MCP_OAUTH_CALLBACK_PORT`, `MCP_CLIENT_SECRET` (password field).
- **Placeholder tabs**, all in `.../components/settings/tabs/`
  - Plugins: "Coming Soon" plus "Discover and manage Claude Code plugins from marketplaces."
  - Skills: "Coming Soon" plus "View and manage custom skills for Claude Code."
  - Hooks: a "Lifecycle Hooks (.claude/hooks)" row marked "Coming Soon".
  - Slash Commands: a "Custom Commands (.claude/commands)" row marked "Coming Soon".
- **Messages**: `get_settings`, `update_setting{key,value,target}`, `reset_setting{key,target}`, `switch_profile{profile}`, `create_profile{name}`, `delete_profile{name}`, `get_extension_config`, `update_extension_config{key,value}` (host then broadcasts `extension_config_changed`), `sdk_probe{capabilities,timeoutMs}`, `open_config_file{configType}`.
  - `configType` values: `vscode` opens VS Code settings filtered to "uic"; `settings`, `config`, `mcp-global` and `mcp-project` are known; anything else maps to `~/.claude/<type>.json`.

### Session lifecycle (`core/Session.ts`, `core/SessionStore.ts`)
- **Start-up and restore** (`.../webview-ui/claude/src/composables/useRuntime.ts`)
  - After the connection opens: fetch the editor selection, then asset URIs, then `listSessions()` (a failure is ignored).
  - If `UIC_BOOTSTRAP.resume` is set and that conversation is in the listed sessions, it becomes the active session. Otherwise `createSession({isExplicit:false})` creates an empty one.
  - The restore does not go through the "already open in another tab" check, and it fails silently when the conversation is not in the current workspace's list.
- **Showing a session** (`SessionStore.ts` effect)
  - Becoming active triggers `loadFromServer()` if the session is offline (has an id, no messages, no connection). Otherwise it calls `preloadConnection()`, which starts the CLI right away.
  - The URL `?session=` is updated where the browser allows it; inside the `srcdoc` iframe `history.replaceState` throws, and the error is ignored.
  - Tab title: `summary` cut to 24 chars plus "…" when longer than 25 chars, else "Claude Code". Sent as `rename_tab`.
- **Creating**
  - `createSession` puts the new session first in the list and makes it active.
  - ChatPage's "+" does not create a session here. It asks the host for a new tab (`startNewConversationTab` → `new_conversation_tab`).
- **Loading history** (`loadFromServer`)
  - Shows `isLoading`, sends `get_session_request`, then attaches each `tool_result` to its `tool_use`.
  - `applyResumedSettings` restores the model, effort and permission mode the conversation last ran with:
    - Only values not already set in this tab are restored.
    - Bypass is restored only if `allowBypassPermissions` is on.
    - Host side (`ClaudeSessionService.ts` `readSessionSettings`): the last non-sidechain assistant entry supplies model (`requestedModel` first, `<synthetic>` ignored) and effort; the last user entry supplies `permissionMode`. Values a tab reported live override the transcript (`webViewService` `liveSessionSettings`, capped at 200 entries).
  - Then it launches the CLI and refreshes context usage.
- **Launching the CLI** (`launchClaude`)
  - A random channel id is generated. `cwd` defaults to `config.defaultCwd`, the model to the `model` setting.
  - Permission mode is sent only after the user picked one; otherwise the CLI's `permissions.defaultMode` applies and comes back in `system/init`.
  - Also sent: thinking level, effort, extra directories, a one-off `resumeSessionAt`, and `forkSession` when the next launch is a fork.
  - `startSettingsReporter` debounces 300 ms, then sends `report_session_settings{sessionId, settings{model, effort (left out when auto), permissionMode}}`.
- **Sending**
  - The first message becomes `summary` if none exists. `isExplicit` turns false and `lastModifiedTime` is set to now.
  - While busy, and if the CLI reports `command_lifecycle`, new messages go to `inFlightPrompts`.
  - The editor selection is attached as `<ide_selection>` only when it changed since the last send, and never for slash commands.
  - Attachments: images (jpeg/png/gif/webp) as base64; text/plain as a text document; PDF as base64; anything else is logged and skipped.
- **Title changes**
  - `system/session_title_changed` (`/rename <name>` or a CLI-generated title) updates `summary`, and so the tab title.
  - `/rename` with no argument opens a text panel; its "Generate" button sends a bare `/rename`.
  - `conversation_reset` (`/clear`, `/reset`, `/new`, leaving plan mode with "clear context") empties the chat, todos, summary and cache state.
- **Session id**
  - Taken from `system` events.
  - Ignored for pre-start `hook_*` events while the session has no id yet, so an empty tab does not look like an open conversation.
- **Rewind** (`rewindConversation`)
  - Refused while busy ("Wait for the current turn to finish") and for messages without a uuid ("This message cannot be rewound to").
  - `get_rewind_point` returns the `parentUuid`; if the message is not found: "This message is not in the saved conversation".
  - Then the channel is closed, the chat cut at the target, and todos and in-flight prompts cleared. The next launch resumes at the parent (same session id, no fork).
  - Rewinding to the first message clears `sessionId` and `summary`.
  - `rewindCode` sends `rewind_files`, with a dry-run preview of files changed and +/- line counts.
- **Withdrawing the last prompt** (`withdrawLastPrompt`, Esc before any tool ran)
  - Interrupt, wait up to 5 s, rewind, and give the text back to the input.
  - If the rewind fails, the message is dropped locally.
- **Relaunch**: `/add-dir` for this session only. Refused while busy; closes the channel and starts it again.
- **Fork, and the "Already open in another tab" prompt** (`SessionStore.openExisting` / `openFork`, `.../webview-ui/claude/src/components/SessionConflictPrompt.vue`, ChatPage)
  - `openExisting` is used by the history list, `/resume`, `/resume <arg>` (direct switch only when exactly one id prefix or exact name matches) and the Recent conversations block.
  - It sends `get_session_owner{sessionId}`; the host answers from `TerminalSessionStore.claudeTabForSession`, excluding the asking tab.
  - If another tab owns it, `openConflict` is set and nothing opens. If the check fails, the conversation opens anyway.
  - Prompt title: "Already open in another tab". Text: "<"summary"|This conversation> is open in <tab "title"|another tab>. Two tabs would write to the same conversation."
  - Options:
    - "Switch to that tab" sends `focus_tab{tabId}`, which runs `terminalSessions.activate`.
    - "Open a fork here" ("Same history, continues as a new conversation") creates a session with the same id and summary "<summary> (fork)", and launches with `forkSession:true`.
    - "Cancel".
  - Keys: ↑/↓ or a number to select, Enter to confirm, Esc to cancel.
  - The prompt is hidden while a permission prompt is pending. The Recent block is hidden while it shows.
  - The host claims a conversation as soon as `launch_claude` carries `resume` (not for forks), so a second tab cannot slip in.
- **Duplicate cleanup** (SessionStore effect)
  - Two Session objects with the same id are merged.
  - The one kept is chosen by: shown (4) + has a CLI channel (2) + has messages (1).
  - Summary, newest time and worktree are merged into the kept copy.
- **Recent conversations**, on an empty chat (ChatPage.vue)
  - Up to 5 most recent conversations, skipping ones open in other tabs. Up to 10 candidates are owner-checked.
  - Header "Recent conversations" with "View all". Rows show the summary (or "Untitled conversation") and a relative time.
- **Cold-resume prompt** (`Session.checkColdResume`, `.../webview-ui/claude/src/components/ColdResumePrompt.vue`, ChatPage `handleSubmit`)
  - Checked only for messages that are not slash commands, and only when not busy.
  - Cache TTL: 5 min, or 1 h, read from `cache_creation.ephemeral_*` in the last response. A 5-minute cache is extended by the keepalive window (assumed 60 min when unknown).
  - A different model counts as cold.
  - Then it re-reads context usage. The prompt shows when `tokens/1e6 × percentPerMillionTokens ≥ minPercent`. Asked once per idle period.
  - Text: "This conversation has been inactive for Xm / Xh Ym and is N tokens long. Resuming it will use about P% (or **all**, at 100% or more) of your 5-hour usage limit."
  - Note: "Your unsent message will still be there after you answer."
  - Options: "Resume" sends the message. "Start a new conversation" sends `/clear` and keeps the text in the input. Esc dismisses.
  - Host pricing (`.../src/claude/coldResumePricing.ts`):
    - Inputs: `~/.claude.json` `cachedGrowthBookFeatures.tengu_amber_tally` (minPercent defaults to 5) and `tengu_sequential_cloud` for keepalive; `rateLimitTier` from `.credentials.json` (only that field) or `oauthAccount`.
    - Cached 60 s. Price keys drop `[1m]` and date suffixes.
    - Disabled when `DISABLE_PROMPT_CACHING` is set. The CLI's own `coldResumeQuota` wins when present.
- **Context usage** (`refreshContextUsage`, `ClaudeAgentService.getContextUsage`)
  - Refreshed on init, `compact_boundary`, `result`, main-chain usage and model switches.
  - Uses `getContextUsage({detail:'summary'})`, which gives `totalTokens`, `maxTokens`, `model`, `coldResumeQuota` and `cacheKeepaliveWindowMs`.
  - Requests made while one is running fold into a single follow-up. Stale answers (after a model switch or another channel) are dropped.
  - Before the CLI first answers, the figure is estimated as input + cache creation + cache read + output. Cost comes from `result.total_cost_usd`.
- **Code Mode notice**
  - On `system/init` carrying `uic_code_mode:true`, a notice tip is inserted once per conversation, before the prompt that started it: "Code Mode (experimental) is on", "this session can be resumed only with Code Mode on".

### Tabs integration
- **New tab**
  - The webview's `startNewConversationTab(initialPrompt?)` sends `new_conversation_tab`. The host calls `requestTab({kind:'new'})` and `extension.ts` runs `terminalSessions.createClaude(80,24)` (`.../src/extension.ts`, `handlers.ts`).
  - `initialPrompt` is dropped at that step.
  - The terminal menu item "Claude UI" also creates a tab and focuses its iframe (`terminalHtml.ts` `startClaudeUI`).
- **Rename**
  - `rename_tab{title}` → `requestTab({kind:'rename'})` → `setClaudeTitle`. The title is trimmed; empty becomes "Claude Code" (`.../src/terminal/terminalSessions.ts`).
- **Focus**: `focus_tab` → `activate(tabId)` → `onActivate`.
- **Restore**
  - `webViewService.noteTabSession` records the session id from the outgoing `io_message.session_id`, or from a resume in `launch_claude`. It fires `onTabSession`, which calls `setClaudeSession`.
  - `snapshot()` includes `resume` for Claude tabs. The rebuilt iframe gets `UIC_BOOTSTRAP{host:'panel',page:'chat',id,resume}`.
  - When a webview is disposed (reload, Agent mode toggle), `releaseClaudeUi` → `releaseTab`: every channel that tab launched is closed, so a turn in progress stops.
  - Closing a tab (`terminalSessions.onClosed`) also runs `releaseTab`.

### claudeFrame.js (iframe host) and the Claude UI appearance settings
- **Loading** (`.../res/webview/claudeFrame.js`)
  - `main.js` and `style.css` are fetched once and inlined. Closing `</script` and `</style` tags inside them are escaped, and `<` in the bootstrap JSON becomes `\u003c`.
  - The document is tried as `srcdoc` first. If the app has not reported in after 5 s, it retries as a `blob:` URL. If that also stays silent for 5 s, it shows "Claude UI did not start. Open Help → Toggle Developer Tools for details."
  - If the assets fail to load: "Could not load Claude UI (<err>). Run "npm run compile" to build dist/claude-ui."
  - Messages posted before the iframe loads are queued.
  - Incoming messages are accepted only when `e.source` is that iframe's window (`owns`).
- **Theme sync**
  - Copied from the parent document: the inline `--vscode-*` styles on `<html>`, the `vscode-*` body classes, the `data-vscode-theme-kind/name/id` attributes and the `#_defaultStyles` block.
  - A MutationObserver re-syncs on theme changes.
- **Shortcut forwarding**
  - Re-dispatched to the parent window: F-keys, and any Ctrl/Meta/Alt combination the app did not handle (`defaultPrevented`).
  - Kept inside the chat: Ctrl/Meta + a/c/v/x/z/y/Backspace/Delete/arrows/Home/End/Enter without Shift or Alt, and Ctrl/Meta+Shift + z/arrows/Home/End.
- **Appearance**
  - Type `ClaudeUiAppearance` (`.../src/terminal/terminalTypes.ts`):
    - `fontSize`: 10–24, default 14. Applied as CSS zoom on the iframe (14 = 100%).
    - `fontFamily`: `''` follows VS Code. The picker also offers System UI and the bundled font list; a stored font not in the list appears as "Custom: …".
    - `themePreset`: `vscode`, any terminal theme preset, or `custom`.
    - `customColors`: background `#1e1e1e`, foreground `#cccccc`, accent `#3b8eea` by default.
    - `lineHeight`: 14–40, default 22.
    - `rowGap`: 0–40, default 14.
    - `columnMaxWidth`: 480–4000 or 0 (full width), default 840.
  - Edited in the terminal settings card "Claude UI appearance" (`.../src/terminal/terminalHtml.ts`). Background, foreground and accent rows appear only for Custom. The values are validated and stored in globalState `ai-cli-diff-view.claudeUi.appearance` (`.../src/terminal/terminalPanel.ts` `normalizeClaudeUi`).
  - Applied by injecting a `<style id="ai-cli-claude-appearance">` with `!important` overrides of `--vscode-*` and `--cs-*` variables:
    - A preset maps its background/foreground/accent and green/red/yellow/blue/purple/orange to about 40 variables, including mixes for raised surfaces, borders, scrollbars and buttons.
    - It also forces the `vscode-dark` or `vscode-light` body class, with light/dark decided by the preset group, or by the luminance of a custom background.

### Host routing (`webViewService.ts`, `ClaudeAgentService`)
- **webViewService** (`.../src/claude/services/webViewService.ts`)
  - Inbound messages get `webviewId = tabId`.
  - Outbound messages go to `webviewId`, else to the tab that owns `channelId`, else to every tab (broadcast).
  - `channelOwner` is set on `launch_claude` and removed on `close_channel`.
  - The terminal webview checks `isClaude(id)` before relaying.
  - The agent and its config services are created on the first message from a Claude UI tab, not at activation, so `~/.claude` files are not created for users who never open Claude UI (`.../src/claude/claudeUi.ts`).
- **ClaudeAgentService** (`.../src/claude/services/claude/ClaudeAgentService.ts`)
  - Message loop: `launch_claude`, `close_channel`, `interrupt_claude`, `io_message`, `request`, `response`, `cancel_request`.
  - A failed launch closes its channel with the error and does not break the loop for other tabs.
  - Requests handled in `processRequest`:
    - Settings and config: `get_settings`, `update_setting`, `reset_setting`, `switch_profile`, `create_profile`, `delete_profile`, `get_extension_config`, `update_extension_config`, `open_config_file`.
    - History and tabs: `list_sessions_request`, `get_session_request`, `get_session_owner`, `focus_tab`, `report_session_settings`, `new_conversation_tab`, `rename_tab`, `get_rewind_point`, `rewind_files`.
    - Session state: `get_context_usage`, `get_applied_effort`, `set_permission_mode`, `set_model`, `set_thinking_level`, `set_effort_level{persist}`, `cancel_queued_prompt`, `stop_task`.
    - Probing and notifications: `sdk_probe`, `show_notification`, among others.
  - Errors come back as `{type:'error', error}`, and the webview rejects the pending request.
  - Stderr lines matching "Error streaming, falling back to non-streaming mode: <code> <json>" are turned into `sdk_error`, at most once per 3 s per channel.
  - In the webview, `sdk_error` becomes `__llm_request_error__`. During a turn it is shown in the chat as an `llm_error` block; with no turn running it becomes a VS Code error notification.
- **ClaudeSdkService** (`.../src/claude/services/claude/ClaudeSdkService.ts`)
  - SDK options:
    - `resumeSessionAt` and `forkSession` are used only together with `resume`.
    - Also set: `enableFileCheckpointing`, `allowDangerouslySkipPermissions` (from `ai-cli-diff-view.claudeAllowBypassPermissions`), `includeHookEvents`, `includePartialMessages`, `settingSources` user/project/local.
    - Extra CLI args: `--debug`, `--debug-to-stderr`, `--settings ~/.claude/ai-cli-diff-view-settings.json`.
    - A VS Code system prompt is appended (markdown file links, `ide_selection`).
  - PreToolUse hook, matcher `Edit|Write|MultiEdit|NotebookEdit`: calls `beforeFileWrite(file_path or notebook_path)` → `diffManager.snapshotBefore`, so the diff has the pre-edit content. Errors are swallowed. The PostToolUse hook calls `notifyPendingContentChanged`.
  - `prepareCliSettings`:
    - Runs `syncFlagSettings()` before each query or probe: re-reads `settings.json` and the profile, and rewrites the overlay only when its content changed.
    - Sets `CLAUDE_CODE_ENTRYPOINT` to `sdk-ts` when Code Mode is on, else `claude-vscode`.
    - Code Mode is on when the overlay's `env.CLAUDE_CODE_EXPERIMENTAL_CODE_MODE` is exactly "1". The value is copied from settings (+ profile), else from the extension host environment, unless the profile already sets it (`withCodeModePassthrough`).
  - Probe and local commands: `queryLite` with the same env and overlay, every tool denied ("SDK probe only"), timeout at least 1 s.
- **cliLocator** (`.../src/claude/cliLocator.ts`)
  - Search order:
    1. The `ai-cli-diff-view.claudeCliPath` setting.
    2. PATH (on Windows: `claude.exe`, `.cmd`, `.bat`, plain).
    3. Known locations (`~/.local/bin`, `~/.claude/local`, `~/.npm-global/bin`, `/usr/local/bin`, `/opt/homebrew/bin`, `/usr/bin`, `%APPDATA%\npm`).
    4. The SDK's bundled native binary (glibc/musl variants).
  - Symlinks are resolved. Windows `.cmd`/`.bat`/`.ps1` shims are parsed to find the real `claude.exe` or `cli.js`.
  - When nothing is found, the error message says what to install or which setting to fill in.

### Toasts and notifications
- **`Toast.vue`** (`.../webview-ui/claude/src/components/Toast.vue`)
  - Variants: error (default) / warning / info, with a codicon, a close button and a `role="alert"`. Auto-dismisses after 8000 ms by default (0 = never).
  - Nothing imports it; it is unused.
- **VS Code notifications**
  - `show_notification{message, severity, buttons, onlyIfNotVisible}` → `showError/Warning/InformationMessage`; the clicked button comes back in `buttonValue`. `onlyIfNotVisible` is ignored (`handlers.ts` `handleShowNotification`).
  - Used for:
    - LLM errors with no turn running (`Session.ts`).
    - Panel errors and confirmations from `notify()` in `ChatInputBox.vue`, e.g. memory-file open errors and "Added <dir>, saved in the local settings".
- **Dead or unused paths**
  - `turnDone` → "Claude finished" in `terminalPanel.ts` has no sender in the webview code.
  - `INotificationService` is injected into handlers, but `handleShowNotification` calls `vscode.window` directly.

