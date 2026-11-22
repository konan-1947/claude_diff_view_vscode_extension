# Claude UI ↔ Claude Code CLI: checklist cho sát CLI

Mục tiêu: tab Claude UI phải **làm việc y như chat trong CLI** (cùng lệnh, cùng phím,
cùng luồng xin quyền, cùng trạng thái session), chỉ khác là có giao diện thay cho màn
hình terminal. Nguyên tắc chung:

- Cái gì trong CLI là **menu / màn hình tương tác** thì UI phải tự dựng control tương
  ứng (dropdown, modal…), vì qua Agent SDK CLI chạy không tương tác và chỉ in text.
- Cái gì CLI **tự đổi trạng thái** (model, effort, session…) thì UI phải đọc lại từ
  event của CLI, không giữ bản sao riêng rồi lệch.
- Cái gì chỉ là **text** thì cứ để CLI trả về, UI chỉ cần render đẹp (markdown, bảng).

Kết quả khảo sát ngày 2026-11-22: gửi từng lệnh qua `query()` của SDK, đúng như
`runtime.ts` gửi `activeSession.send('/<lệnh>')`.

Ký hiệu: `[ ]` chưa làm · `[~]` đã có một phần / cần kiểm tra lại · `[x]` đã có.

---

## 1. Đồng bộ trạng thái UI ↔ CLI (ưu tiên cao nhất: đang gây sai lệch)

- [~] **Model** (đã làm, chờ test tay trong UI): sau mỗi lượt `Session.refreshContextUsage`
      đọc `model` từ `getContextUsage()` (CLI trả ngay sau `/model <tên>`, không đợi lượt
      sau) vào `Session.cliModel`; `ChatPage` thấy model **đổi giữa hai lần đọc** thì
      `adoptModel()` sang mục picker có `resolvedModel` trùng (ưu tiên mục khác
      "Default"), không có thì giữ nguyên ID. Không phân tích chuỗi tên model: tên sai
      thì CLI tự báo lỗi. Hạn chế đã chấp nhận: `/model opus[1m]` / `opusplan` sau đó
      hiện và lưu là model thường (CLI chỉ báo ID thật); với `opusplan`, đổi plan mode
      cũng làm model chạy đổi theo → picker nhảy theo.
- [~] **Effort** (đã làm, chờ test tay trong UI): `/effort <mức>` vẫn gửi cho CLI. Khi
      `result` có `local_command: 'effort'`, `Session.syncEffortFromCli` đọc
      `getSettings().applied.effort` (request `get_applied_effort`) và chỉ nhận mức CLI xác
      nhận; gõ sai thì CLI in usage, picker giữ nguyên. Riêng `auto`: CLI báo lại thành mức
      mặc định của model (ví dụ `medium`), nên lấy `auto` từ chính lệnh đã gõ.
- [~] **`/clear`** (đã làm, chờ test tay): CLI phát event `conversation_reset` (cả
      `/reset`, `/new`, rời plan mode kèm "clear context"); `Session.resetConversation()` xoá
      messages, todos, tiêu đề, token đang hiện. Session id mới đến ở các event sau đó, và
      `webViewService` tự ghi nó vào `TerminalSessionStore` (resume đúng hội thoại mới).
      Hội thoại cũ vẫn nằm trong lịch sử.
- [~] **Permission mode**: đã đọc `permissionMode` từ `system/init` và `system/status`.
      Cần kiểm tra khi CLI tự rời plan mode sau `ExitPlanMode`.
- [~] **`/rename <tên>`** (đã làm, chờ test tay): CLI phát `system/session_title_changed`
      → `Session.summary` → tiêu đề tab (qua `renameTab`). Sau `/clear` CLI vẫn gửi lại
      tên cũ cho session mới; UI theo CLI.
- [~] **`/compact`** (đã làm, chờ test tay): `compact_boundary` hiện mốc "Conversation
      compacted · 15.9K → 6.6K tokens" (`NoticeBlock`); tin tóm tắt CLI chèn sau đó
      (`isSynthetic` khi đang chạy, `isCompactSummary` trong lịch sử) bị ẩn. Lịch sử đi qua
      `logicalParentUuid` nên resume vẫn thấy phần trước compact, và danh sách chỉ còn một
      mục. Không còn "result rỗng": CLI 2.1.327 trả text "Not enough messages to compact."
      (hiện như một tin bình thường).
- [x] **`/output-style <tên>`**, **`/fast`**: không cần hiển thị trạng thái. `/fast` qua SDK
      trả "Fast mode is not available in the Agent SDK" (`fast_mode_disabled_reason:
      sdk_opt_in_required`) → nên ẩn khỏi gợi ý (mục 2). `/output-style <tên>` ghi vào
      `.claude/settings.local.json` của project, CLI báo tên style trong `system/init` mỗi
      lượt (`output_style`); dropdown chọn style để ở mục 2.

## 2. Lệnh vốn là menu trong CLI → UI phải tự dựng control

Hiện qua UI chỉ in usage/text. Cách làm: chặn ở `ChatInputBox.handleSubmit` và ở
`onSelect` của slash completion khi lệnh **không có tham số**; có tham số thì vẫn gửi
cho CLI (và đồng bộ trạng thái như mục 1).

- [~] `/model` → mở `ModelSelect` (đã làm: Enter hoặc chọn từ gợi ý `/`, chờ test tay).
- [~] `/effort` → panel kiểu CLI (`components/CommandPanel/EffortPanel.vue`, đã làm, chờ
      test tay): thanh trượt Faster ↔ Smarter, `←/→` chỉnh, `a` auto, `s` chỉ phiên này,
      `Enter` lưu, `Esc` huỷ. Enter = `applyFlagSettings` + `updateSettings('userSettings',
      { effortLevel })` (ghi `modelSettings.<model>.effortLevel` như CLI); `auto` và `max`
      không lưu được nên Enter chỉ áp dụng cho phiên. Model không có mức effort thì lệnh
      vẫn gửi cho CLI. `CommandPanel.vue` là khung chung (tiêu đề, gợi ý phím) cho các
      lệnh menu tiếp theo.
      Còn thiếu: tab mới hiện "Auto" dù CLI đang dùng mức đã lưu → đọc
      `applied.effort` khi mở session.
- [~] `/output-style` → `ListPanel` (đã làm, chờ test tay): danh sách lấy từ
      `initializationResult().available_output_styles` (request `get_output_styles`), style
      đang dùng lấy từ `output_style` của `system/init` gần nhất (`Session.outputStyle`).
      Chọn = gửi `/output-style <tên>` cho CLI (CLI tự ghi `.claude/settings.local.json`).
- [~] `/config` (cả alias `/settings`) → `ConfigPanel` kiểu màn Settings của CLI (đã làm,
      chờ test tay): danh sách key + giá trị lấy từ usage của `/config` trơn (33 key ở CLI
      2.1.327), chạy trong một CLI tạm (`ClaudeSdkService.runLocalCommand`,
      `persistSession: false`, ~0.25 s, cache theo tiến trình) để không thêm tin vào chat.
      Lọc bằng gõ chữ, `←/→`/Space đổi giá trị, true/false hiện dạng công tắc, key tự do
      (`language`) sửa tại chỗ bằng Enter; Enter lưu = `/config a=b c=d` (giá trị có dấu
      cách phải đi một lệnh riêng: CLI chỉ nhận nhiều cặp khi không cặp nào có dấu cách).
      Giá trị hiện tại: CLI không có lệnh đọc, nên `src/claude/services/claude/configValues.ts`
      chép lại chỗ màn /config của CLI 2.1.327 đọc từng key (settings đã merge hoặc
      `~/.claude.json`, kèm giá trị mặc định của CLI). Đọc được 31/33 key; `workflows`,
      `workflowSizeGuideline`, `switchModelsOnFlag` có mặc định do server quyết định nên
      chỉ hiện khi đã được đặt ("default" nếu chưa). Key mới ở CLI sau này hiện "default"
      cho tới khi thêm vào bảng (đối chiếu lại khi nâng CLI).
- [~] `/mcp` → `McpPanel` (đã làm, chờ test tay): danh sách server + trạng thái + số tool
      (`mcpServerStatus()`, request `get_mcp_servers` — trước đây là stub trả `[]`);
      `R` reconnect, `E`/Space enable/disable qua `reconnectMcpServer` / `toggleMcpServer`
      (request `mcp_server_action`), không thêm tin nhắn vào chat. Gõ kèm tham số thì vẫn
      gửi cho CLI.
- [~] `/autocompact` → `ListPanel`: Auto / 100K / 200K / 400K / 1M → gửi
      `/autocompact <giá trị>`; cỡ khác thì gõ tay. Chưa đánh dấu giá trị đang dùng
      (`getSettings().applied` không có `autoCompactWindow`).
- [~] `/rename` (cả alias `/name`) không tham số → `TextPanel` nhập tên → `/rename <tên>`;
      nút "Generate" gửi `/rename` trơn để CLI tự đặt tên.
- [~] `/goal` không tham số → `TextPanel` nhập điều kiện → `/goal <condition>`.
- [~] `/auto-mode-setup` → `AutoModeSetupPanel`: 3 câu hỏi của wizard (posture / scope /
      depth, giá trị lấy từ usage của CLI 2.1.327) → gửi
      `--wizard posture=… scope=… depth=… --propose`. Bước apply (`--expect-sha256 …
      --apply-file …`) chưa có UI, CLI trả proposal dạng text.
- [x] `/color`, `/agents`, `/focus`, `/fast`: ẩn khỏi gợi ý `/` (`HIDDEN_SLASH_COMMANDS`
      trong `useRuntime.ts`); gõ tay vẫn gửi cho CLI.

Các panel đều nằm trong `components/CommandPanel/` và dùng khung `CommandPanel.vue`:
`ListPanel.vue` (chọn 1 mục: ↑/↓, j/k, số 1–9, Enter), `TextPanel.vue` (ô nhập một dòng),
`McpPanel.vue`, `AutoModeSetupPanel.vue`, `StatusPanel.vue`, `HelpPanel.vue`,
`PermissionsPanel.vue`, `PluginPanel.vue`, `AuthPanel.vue`. Bảng lệnh →
panel là `PANEL_COMMANDS` (chỉ khi gõ trơn) và `UI_PANEL_COMMANDS` (lệnh mục 3, luôn do UI
xử lý kể cả khi có tham số) trong `ChatInputBox.vue`.

## 3. Lệnh terminal không có qua SDK ("isn't available in this environment")

Các lệnh này không nằm trong `supportedCommands()` nên không hiện trong gợi ý `/`; gõ
tay thì CLI trả "isn't available in this environment". UI cần tự làm hoặc tự trả lời.

- [~] `/resume` → `ListPanel` (đã làm, chờ test tay): các hội thoại của workspace, mới nhất
      trước, gõ để lọc, Enter chuyển sang hội thoại đó; nút "All chats" mở trang lịch sử.
      `/resume <id hoặc tên>` chuyển thẳng nếu đúng một hội thoại khớp, không thì mở panel
      đã lọc sẵn theo chữ đó.
- [~] `/permissions` (alias `/allowed-tools`) → `PermissionsPanel` (đã làm, chờ test tay):
      tab Allow / Ask / Deny / Workspace như CLI (←/→); rules của settings user / project /
      local kèm nguồn, ưu tiên cao nhất trước. `A` thêm rule (Tab chọn file đích, mặc định
      local), `D` hai lần để xoá, Enter mở file chứa rule. Tab Workspace: thư mục làm việc,
      thư mục `/add-dir` của session và `permissions.additionalDirectories`; `A` ở đây chạy
      luồng `/add-dir`. Ghi file qua `updatePermissionList` (`claudeFiles.ts`, giữ các key
      khác). Cần test: CLI có nhận rule mới ngay mà không cần mở lại session không.
- [~] `/help` → `HelpPanel` (đã làm, chờ test tay): phím tắt của UI + mọi lệnh `/` (lệnh
      do UI xử lý có nhãn "UI"), gõ để lọc; Enter mở panel của lệnh hoặc điền lệnh vào ô
      nhập để gõ tiếp tham số.
- [~] `/memory` → `ListPanel` (đã làm, chờ test tay): `./CLAUDE.md` (hoặc
      `./.claude/CLAUDE.md` nếu chỉ có file đó), `./CLAUDE.local.md`, `~/.claude/CLAUDE.md`
      (theo `CLAUDE_CONFIG_DIR`); Enter mở trong editor, file chưa có thì tạo rỗng.
- [~] `/status` → `StatusPanel` (đã làm, chờ test tay): version / model / permission mode /
      cwd lấy từ `system/init` cuối của channel (host giữ lại, `get_status`), account từ
      `accountInfo()`, MCP từ `mcpServerStatus()`, kèm plugin, các file settings và
      CLAUDE.md. Trước lượt đầu tiên CLI chưa gửi `system/init` nên version / model hiện
      "shown after the first message".
- [~] `/add-dir [path]` (đã làm, chờ test tay): không có path → folder picker; path tương
      đối tính từ workspace, `~` được mở rộng. Thư mục đã nằm trong một thư mục làm việc thì
      báo như CLI. Hỏi "Yes, for this session" (`Session.additionalDirectories`, gửi theo
      `launch_claude` → option `additionalDirectories` của SDK) hoặc "Yes, and remember this
      directory" (ghi `permissions.additionalDirectories` vào `.claude/settings.local.json`).
      SDK không thêm được thư mục vào query đang chạy (`register_repo_root` chỉ nhận thư mục
      con), nên cả hai cách đều đóng query và mở lại với resume (`Session.relaunch()`); bị từ
      chối khi đang chạy một lượt. Thư mục "this session" mất khi webview dựng lại.
- [~] `/hooks` → `ListPanel` chỉ đọc (đã làm, chờ test tay): hooks trong settings user /
      project / local (`claudeFiles.ts`), event + matcher + lệnh + nguồn; Enter mở file
      settings chứa hook đó. File JSON hỏng thì báo dưới danh sách. Hook do plugin hay
      managed settings khai báo chưa hiện.
- [~] `/plugin` (alias `/plugins`) → `PluginPanel`, 3 tab (←/→). Phía host các lệnh
      `claude plugin …` đã chạy thử thật trên một `CLAUDE_CONFIG_DIR` tạm; giao diện còn
      chờ test tay.
      - **Installed:** `claude plugin list --json`; Enter / `E` → `enable|disable <id> --scope`,
        `D` hai lần → `uninstall`.
      - **Discover:** `claude plugin list --json --available` (~4100 plugin từ
        `anthropic-plugin-directory` có sẵn và các marketplace đã thêm; host giữ cache), gõ để
        lọc, sắp theo `installCount`, vẽ tối đa 100 dòng, hiện mô tả của dòng đang chọn.
        Enter → chọn scope (user / project / local) → `install <id> --scope <s> --json`. Plugin
        cài bằng một lệnh do marketplace khai báo: CLI trả `shownCommand` (`command`,
        `sha256`, `archiveUrl`) → panel hiện lệnh, người dùng duyệt thì chạy lại với
        `--accept-command <sha256>` (không bao giờ dùng `-y`). Chưa làm: `--config` cho
        plugin có userConfig (dùng `claude plugin configure` trong terminal).
      - **Marketplaces:** `marketplace list --json` (thư mục có sẵn không nằm trong danh
        sách), `A` thêm (owner/repo, URL, đường dẫn), `U` cập nhật, `D` hai lần để xoá.
      - Mọi thay đổi xong đều `reloadPlugins()` trên các channel đang mở.
      - Lưu ý: CLI **không kiểm tra id** khi `enable` (id không tồn tại vẫn được ghi vào
        `enabledPlugins`), nên panel chỉ thao tác trên id lấy từ danh sách.
- [x] `/release-notes` → mở `CLAUDE_CONFIG_DIR/cache/changelog.md` (CLI tự lưu) bằng
      markdown preview; không có file thì mở CHANGELOG trên GitHub.
- [~] `/export` → `ListPanel` "Save to file" / "Copy to clipboard" (đã làm, chờ test tay):
      transcript markdown dựng ở webview (`utils/exportTranscript.ts`: text, thinking gập
      lại, tool call một dòng + kết quả cắt 12 dòng), host ghi qua save dialog hoặc
      `vscode.env.clipboard`. `/export <tên file>` mở thẳng save dialog với tên đó.
- [~] `/login`, `/logout` → `AuthPanel` (đã làm, chờ test tay; chưa đăng nhập thật lần nào):
      trạng thái từ `claude auth status --json`. Login: chọn Claude subscription / Console /
      SSO (SSO hỏi email) → host chạy `claude auth login --claudeai|--console|--sso` trong
      node-pty (`LoginProcess`, `claudeCli.ts`). CLI tự mở trình duyệt, in URL ("If the browser
      didn't open, visit: …", hyperlink OSC 8) rồi chờ ở `Paste code here if prompted >`:
      panel hiện link (mở bằng `openExternal`, dùng được qua Remote) và ô dán code (ghi vào
      stdin của PTY). Xong thì `closeAllChannelsWithCredentialChange()`: các tab mở lại query
      ở tin nhắn sau. Logout: xác nhận → `claude auth logout`. Panel `persistent` (không đóng
      khi mất focus lúc đang chờ trình duyệt); đóng panel giữa chừng thì kill tiến trình login.
- [x] Tự đưa các lệnh trên vào danh sách gợi ý `/` (đánh dấu là lệnh do UI xử lý):
      `UI_SLASH_COMMANDS` trong `slashCommandProvider.ts`, icon khác lệnh của CLI.
- [x] `/cost` chạy được (cùng output với `/usage`).
- Bỏ qua (không có ý nghĩa trong UI): `/theme`, `/vim`, `/statusline`, `/terminal-setup`.

## 4. Lệnh có tác dụng phụ ngoài UI

- [ ] `/usage-credits`, `/extra-usage`: **mở trình duyệt** mà UI chỉ hiện một dòng text
      → hiện thành link/nút rõ ràng, hoặc hỏi xác nhận trước.
- [ ] Chưa khảo sát (tác dụng phụ / tốn phí): `/fast`, `/heapdump`, `/loop`, `/schedule`,
      `/insights`, `/team-onboarding`, `/doctor`. Cần thử và ghi kết quả vào đây.

## 5. Lệnh chạy được, chỉ cần render tốt

- [~] `/context` (bảng markdown), `/usage`, `/cost`, `/reload-plugins`, `/reload-skills`,
      `/list-agents`, `/recap`: render bằng `SlashCommandResultBlock`, kiểm tra bảng và
      định dạng.
- [x] Lệnh dạng prompt / skill (`/init`, `/debug`, `/code-review`, `/simplify`,
      `/security-review`, `/batch`, skill của user…): chạy như một lượt chat bình thường.
- [ ] Gợi ý `/`: hiện `argumentHint` (SDK có trả, ví dụ `/model <model>`,
      `/effort <low|…|auto>`) giống CLI; hiện nguồn của lệnh (user / project / plugin).
- [ ] Mô tả skill rất dài (vài trăm ký tự) → cắt 1 dòng trong dropdown, xem đầy đủ khi hover.

## 6. Cách nhập liệu và phím tắt như CLI

- [x] `Enter` gửi, `Shift+Enter` xuống dòng.
- [x] `Esc` dừng lượt đang chạy.
- [x] `Shift+Tab` đổi permission mode.
- [x] Gõ tin khi đang bận → vào hàng đợi (`MessageQueueList`).
- [x] `@` gợi ý file, `/` gợi ý lệnh.
- [ ] `↑` / `↓` khi ô nhập trống → gọi lại các prompt đã gửi (history của CLI).
- [ ] `Esc Esc` → rewind: chọn một tin nhắn cũ để quay lại (CLI có checkpoint: khôi phục
      hội thoại và/hoặc code). Có thể dùng `resumeSessionAt` / file checkpointing của SDK.
- [ ] Tiền tố `!` → chạy lệnh shell trực tiếp, đưa output vào context (bash mode của CLI).
- [ ] Tiền tố `#` → thêm ghi chú vào memory (nếu CLI còn hỗ trợ; kiểm tra lại).
- [ ] `Ctrl+R` → tìm trong lịch sử prompt.
- [~] Dán ảnh (`Ctrl+V`) và kéo thả file: đã có `handlePaste` / Shift+drop, cần kiểm tra
      với ảnh chụp màn hình.
- [ ] `Ctrl+C` khi ô nhập có chữ → xoá ô nhập (giống CLI), không đụng tới copy khi có
      vùng chọn.

## 7. Luồng xin quyền và tương tác của tool

- [x] Hộp xin quyền tool (`PermissionRequestModal` / `ToolPermissionView`).
- [ ] Các lựa chọn giống CLI: "Yes", "Yes, and don't ask again for <rule>" (ghi rule vào
      settings), "No, and tell Claude what to do differently" (kèm ô nhập lý do).
- [ ] `AskUserQuestion`: chưa có renderer riêng → dựng UI chọn đáp án (single /
      multi-select, ô "Other"), trả kết quả qua `canUseTool` `updatedInput`.
- [~] `ExitPlanMode`: đã có renderer; cần nút duyệt kế hoạch + chọn chế độ tiếp theo
      (auto-accept edits / manual) như CLI.
- [ ] Hiển thị hook bị chặn / output của hook (CLI in ra dòng hook).

## 8. Hiển thị trong lúc chạy

- [x] Renderer cho Bash, Read, Edit, Write, MultiEdit, Grep, Glob, Task, TodoWrite,
      WebFetch, WebSearch, NotebookEdit, MCP tool, KillShell, BashOutput.
- [ ] Subagent (`Task`): hiện tiến trình lồng nhau của subagent như CLI (tool call con).
- [ ] Tác vụ nền (bash chạy nền, `system/background_tasks_changed`): danh sách + nút kill.
- [~] Thinking: đã có `ThinkingBlock`; kiểm tra khi CLI trả thinking rỗng có chữ ký
      (thinking bị ẩn).
- [ ] Spinner kèm thời gian chạy + số token của lượt hiện tại (như dòng trạng thái CLI).
- [~] Context usage (`TokenIndicator`): kiểm tra sau `/compact`, `/clear`, đổi model
      (context window khác nhau, ví dụ `[1m]`).
- [ ] Lỗi API / rate limit / hết quota: hiện thông báo và thời điểm reset như CLI.

## 9. Session và nhiều tab

- [x] Tab do terminal tab strip quản lý; store giữ `{ title, sessionId }` để resume.
- [ ] Resume giữ nguyên model / effort / permission mode của session (hiện chỉ giữ
      sessionId, xem mục 1).
- [ ] `claude --continue` tương đương: nút "tiếp tục hội thoại gần nhất" khi mở tab mới.
- [ ] Hai tab cùng resume một session → cảnh báo (CLI không cho hai tiến trình ghi cùng
      session).

## 10. Cách kiểm thử lại

Script khảo sát dùng `query()` của `@anthropic-ai/claude-agent-sdk` trong `node_modules`:

1. `supportedCommands()` → danh sách lệnh SDK nhận (có `argumentHint`).
2. Gửi từng lệnh không tham số, ghi `assistant` / `result` trả về.
3. Gửi chuỗi `"prompt" → "/model haiku" → "/effort high" → "/clear" → "prompt"` trong
   **một** streaming session, xem `system/init` (model, session id) đổi thế nào.

Chạy trong một thư mục tạm, không chạy các lệnh ở mục 4 khi chưa chủ động muốn.
