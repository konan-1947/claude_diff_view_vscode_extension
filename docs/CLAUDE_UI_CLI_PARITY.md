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
- [~] Gợi ý `/` (đã làm, chờ test tay): dòng tên hiện alias + `argumentHint` mờ
      (`/usage (cost, stats)`, `/model <model>`) và nguồn `(user)` / `(project)` /
      `(<plugin>)`. SDK chỉ đánh dấu `builtin`; host (`withCommandSource` trong
      `handlers.ts`) suy nguồn: alias `plugin:name` → plugin, có
      `.claude/skills/<name>/SKILL.md` hoặc `.claude/commands/<a>/<b>.md` ở workspace →
      project, ở `~/.claude` (hoặc `CLAUDE_CONFIG_DIR`) → user. Gõ alias cũng tìm ra lệnh
      (`/cost` → `/usage`). Lệnh UI tự dựng cũng có hint / alias (`/add-dir [path]`,
      `/rewind (undo, checkpoint)`).
- [~] Mô tả skill rất dài (vài trăm ký tự) → cắt 1 dòng trong dropdown, xem đầy đủ khi hover
      (đã làm, chờ test tay: prop `clampDetail` của `DropdownItem`, `title` = mô tả đầy đủ).

## 6. Cách nhập liệu và phím tắt như CLI

- [x] `Enter` gửi, `Shift+Enter` xuống dòng.
- [x] `Esc` dừng lượt đang chạy.
- [x] `Shift+Tab` đổi permission mode.
- [~] Gõ tin khi đang bận → vào hàng đợi (`MessageQueueList`, đã sửa, chờ test tay): xem
      mục bug bên dưới.
- [x] `@` gợi ý file, `/` gợi ý lệnh.
- [x] `↑` / `↓` → gọi lại các prompt đã gửi khi caret ở dòng đầu / dòng cuối (đi trong
      prompt nhiều dòng vẫn bình thường; bản nháp đang gõ quay lại khi `↓` hết lịch sử).
      Dùng chung `~/.claude/history.jsonl` với CLI, lọc theo project: CLI chạy qua SDK
      **không** ghi file này, nên UI tự ghi một dòng đúng định dạng CLI mỗi lần Enter
      (`src/claude/services/claude/promptTools.ts`, `webview-ui/.../utils/promptHistory.ts`).
- [x] `Esc Esc` khi rảnh (hoặc `/rewind`, alias `/undo`, `/checkpoint`, có trong gợi ý `/`):
      ô có chữ → xoá ô; ô trống → panel Rewind (chọn tin nhắn, rồi
      "Restore code and conversation" / "Restore conversation" / "Restore code").
      Code: `Query.rewindFiles(uuid)` (bật `enableFileCheckpointing` theo `/config
      checkpoints`); file khôi phục được watcher mở thành diff để review. Hội thoại: đọc
      `parentUuid` của tin đó trong transcript rồi relaunch với `resumeSessionAt` (cùng
      session id, không fork); tin nhắn quay lại ô nhập như CLI. Mỗi tin gửi đi mang `uuid`
      do UI gán, CLI giữ nguyên làm uuid trong transcript. Nút "Restore checkpoint" (hover
      trên tin nhắn đã gửi, `UserMessage.vue`) mở cùng panel, thẳng vào bước chọn cách khôi
      phục cho tin đó (`RewindPanel` prop `initialTarget`, qua `RestoreCheckpointKey`); chỉ
      hiện khi tin có `uuid` (chờ test tay).
- [x] Tiền tố `!` → bash mode: viền ô nhập đổi màu; lệnh chạy ở host (bash/`$SHELL`, Windows:
      `CLAUDE_CODE_GIT_BASH_PATH` hoặc PowerShell), timeout `BASH_DEFAULT_TIMEOUT_MS` (2 phút),
      `Esc` dừng cả process group. Lệnh + output gửi vào transcript bằng một tin
      `shouldQuery: false` (`<bash-input>` / `<bash-stdout>` / `<bash-stderr>`, định dạng của
      CLI): không tốn lượt model, Claude thấy ở tin kế tiếp. Hiển thị bằng `BashMessage.vue`,
      cả với session CLI cũ (CLI lưu hai tin riêng).
- [x] ~~Tiền tố `#` → thêm ghi chú vào memory~~: N/A, CLI đã bỏ từ 2.0.70 ("Removed #
      shortcut for quick memory entry").
- [x] `Ctrl+R` → panel "Search prompts" (lọc khi gõ, Enter đưa prompt vào ô nhập). Không
      chuyển ra VS Code (Open Recent) vì phím được `preventDefault` trong ô nhập.
- [~] Dán ảnh (`Ctrl+V`) và kéo thả file: đã có `handlePaste` / Shift+drop, cần kiểm tra
      với ảnh chụp màn hình.
- [x] `Ctrl+C` khi ô nhập có chữ và không có vùng chọn → xoá ô nhập; có vùng chọn → copy.
- [~] Bug (đã sửa, chờ test tay): `ChatInputBox` emit `queueMessage` khi đang bận nhưng
      `ChatPage` không nghe → tin gõ lúc Claude đang chạy bị mất. Giờ `ChatPage` giữ hàng
      đợi (kèm attachment), hiện `MessageQueueList` trên ô nhập (xoá / "Send immediately"
      gửi thẳng cho CLI giữa lượt), gửi khi lượt xong: các prompt liền nhau gộp thành một
      tin (nối `\n`, như CLI), lệnh `/` luôn gửi riêng. `Esc` dừng lượt → prompt trong
      hàng đợi quay lại ô nhập thay vì tự gửi. Đổi session → bỏ hàng đợi.

## 7. Luồng xin quyền và tương tác của tool

- [x] Hộp xin quyền tool: `PermissionRequestModal.vue` chỉ chọn prompt theo tool; các
      prompt nằm trong `components/Permission/` (khung `PromptFrame`, danh sách đánh số
      `PromptOptions`: ↑/↓, số, Enter, Esc; tự lấy focus khi hiện).
- [~] Các lựa chọn giống CLI (đã làm, chờ test tay): `ToolPermissionPrompt.vue` —
      "Yes" (chỉ lần này: `updatedPermissions: []`; trước đây "Yes" ghi luôn suggestions,
      tức là thành "don't ask again"), "Yes, and don't ask again for …" (gửi nguyên
      `suggestions` của CLI; nhãn ghép từ chúng trong `utils/permissionSuggestions.ts`:
      `addRules` → "`touch a.txt` commands in this project", `setMode acceptEdits` →
      "allow all edits during this session", `addDirectories` → "allow access to ws/"),
      "No, and tell Claude what to do differently" (dòng nhập; có chữ → deny
      `interrupt: false`, Claude đọc phản hồi và làm tiếp; trống/Esc → deny + dừng lượt).
      Host chuyển thêm phần hiển thị của options `canUseTool` (`ToolPermissionContext`
      trong `shared/messages.ts`: `title`, `description`, `decisionReason`, `blockedPath`,
      `defaultToNo` → con trỏ ở "No" và tắt phím số, `suppressAlwaysAllowRule` → ẩn lựa
      chọn 2, `agentID` → nhãn "subagent"). Bash hiện lệnh + mô tả, Edit/Write hiện path
      (bấm để mở), tool khác hiện "Details" JSON.
- [~] `AskUserQuestion` (đã làm, chờ test tay): `AskUserQuestionPrompt.vue`. Một câu mỗi
      lần, nhiều câu → tab (←/→) + bước "Review your answers" trước khi gửi; single-select
      chọn là sang câu tiếp, multi-select dùng checkbox (Enter/Space) + dòng Next/Submit;
      dòng "Other" nhập tự do; option có `preview` hiện preview của dòng đang trỏ. Trả
      `updatedInput = { ...input, answers: { [question]: "a, b" }, annotations? }` (khảo
      sát: CLI nhận và trả tool_result "Your questions have been answered: …"). Esc → deny.
- [~] `ExitPlanMode` (đã làm, chờ test tay): `PlanApprovalPrompt.vue` — "Yes, and use
      auto mode" (khi model hỗ trợ), "Yes, and bypass permissions" (khi được bật), "Yes,
      and auto-accept edits", "Yes, and manually approve edits" → allow +
      `updatedPermissions: [{ type: 'setMode', mode, destination: 'session' }]` (khảo sát:
      CLI phát `system/status` với `permissionMode` mới, mode picker tự theo); "No, keep
      planning" + phản hồi → deny. Input có `plan` và `planFilePath` (link "Open plan
      file"). Thẻ Plan trong transcript tự mở khi đang chờ duyệt, và transcript không bị
      làm mờ khi đang hỏi plan / AskUserQuestion (vẫn mờ với hộp quyền thường).
- [~] Hook (đã làm, chờ test tay): `includeHookEvents: true` trong `ClaudeSdkService` →
      `system/hook_started|hook_response` cho command hook của user (callback hook của
      extension không phát event). `Message.fromRaw` → block `hook` (`HookBlock.vue`, nằm
      trong lượt đang chạy, không tách lượt): exit 2 → "hook blocked", lỗi khác → "hook
      error" + exit code, JSON `continue: false` → "hook stopped the turn", `decision:
      block` → blocked, `systemMessage` → "says"; chạy thành công / bị huỷ thì không hiện
      (như CLI). Lịch sử: CLI lưu attachment `hook_non_blocking_error`,
      `hook_error_during_execution`, `hook_blocking_error`, `hook_stopped_continuation`,
      `hook_system_message`; `ClaudeSessionService.hookAttachment` đổi sang cùng dạng.
      PreToolUse chặn tool không có attachment: lỗi nằm ở tool_result (thẻ tool đã hiện).

## 8. Hiển thị trong lúc chạy

- [x] Renderer cho Bash, Read, Edit, Write, MultiEdit, Grep, Glob, Task, TodoWrite,
      WebFetch, WebSearch, NotebookEdit, MCP tool, KillShell, BashOutput.
- [~] Subagent (đã làm, chờ test tay). CLI hiện gọi tool là **`Agent`** (không còn `Task`),
      và mặc định chạy subagent **nền** (`is_backgrounded: true`): tool_result về ngay
      ("launched"), task chạy tiếp cả sau `result` của lượt chính. Message của subagent có
      `parent_tool_use_id` = id của tool_use `Agent`; giờ được tách khỏi transcript chính
      (`core/LiveActivity.ts`) và gom theo id đó. Thẻ Agent (`tools/Task.vue`, khớp cả
      `Task` lẫn `Agent`): một dòng live kiểu CLI (tool đang chạy, số tool, token, thời
      gian, lấy từ `system/task_started|task_progress|task_updated|task_notification`), mở
      ra thấy prompt, danh sách tool call con và kết quả. Session mở lại từ lịch sử không có
      tool call con (transcript sidechain nằm ở file riêng).
- [~] Tác vụ nền (đã làm, chờ test tay): `BackgroundTasksList.vue` trên ô nhập, lấy từ
      `system/background_tasks_changed` (cả `local_bash` và `local_agent`), mỗi task có
      thời gian / token và nút stop → `stop_task` → `Query.stopTask(id)` ở host. Task đã báo
      xong qua `task_*` bị ẩn ngay dù CLI chưa gửi danh sách mới (chưa xác nhận CLI có gửi
      lại danh sách khi task xong).
- [~] Ctrl+B (đã làm, chờ test tay): khi lượt đang chạy, Ctrl+B trong ô nhập →
      `background_tasks` → `Query.backgroundTasks()` ở host, đưa Bash/subagent đang chạy
      foreground ra nền. Lúc rảnh và ở tab OMP, Ctrl+B vẫn về VS Code.
      Hành vi của CLI 2.1.332 (đọc từ binary): action `task:background` (context `Task`,
      `ctrl+b` và `ctrl+x ctrl+b`; trong tmux là `ctrl+b ctrl+b`). Có tác vụ foreground →
      một lần bấm đưa hết Bash rồi agent ra nền (`z2e`). Không có → bấm lần hai trong 800ms
      đưa cả session ra nền ("Your session moved to the background") — UI không làm (SDK
      không có API, tab vẫn chạy khi chuyển tab). Session remote gửi `background_tasks`
      (đường UI đang dùng) và báo lỗi bằng thông báo — UI báo bằng toast, kể cả khi không
      có gì để chuyển. Gợi ý `(ctrl+b to run in background)` trên thẻ Bash và Agent chạy
      foreground.
- [~] `/btw <question>` (đã làm, chờ test tay): CLI có control request `side_question`;
      SDK 0.3.327 có `Query.askSideQuestion()` lúc chạy nhưng chưa có trong `sdk.d.ts`. Đã
      khảo sát với CLI 2.1.332: hỏi giữa lúc một Bash `sleep 20` đang chạy, trả lời sau ~3s
      đúng ngữ cảnh, lượt chính chạy tiếp. Câu hỏi và trả lời không vào transcript; hiện
      trong `BtwPanel.vue` thay ô nhập. Chưa hỗ trợ hỏi tiếp (option `history` của SDK).
- [~] `/branch [name]` (đã làm, chờ test tay): CLI "Create a branch of the current
      conversation at this point" → tab chuyển sang bản copy (`forkSession: true`), bản gốc
      còn trong `/resume`. Không cho chạy khi lượt đang chạy.
- [~] `/fork [prompt]` (đã làm, chờ test tay): CLI 2.1.332 "Copy this conversation into a
      new background session and keep working here" → ở extension là một tab Claude UI mới
      mở bản copy; có prompt thì tab mới tự gửi prompt, tab hiện tại giữ focus.
- [~] Thinking: đã có `ThinkingBlock`; kiểm tra khi CLI trả thinking rỗng có chữ ký
      (thinking bị ẩn).
- [~] Spinner kèm thời gian chạy + số token của lượt hiện tại (đã làm, chờ test tay):
      `↓ N tokens` = `output_tokens` của các response đã xong (`stream_event`
      `message_delta`) + ước lượng response đang stream (4 ký tự ≈ 1 token, thinking lấy max
      với `system/thinking_tokens`), chỉ tính hội thoại chính.
- [~] Context usage (`TokenIndicator`): kiểm tra sau `/compact`, `/clear`, đổi model
      (context window khác nhau, ví dụ `[1m]`).
- [~] Lỗi API / rate limit / hết quota (đã làm, chờ test tay): `rate_limit_event` đến ở
      mỗi request (cả `allowed`, kèm `utilization` / `resetsAt`, có khi chỉ trong
      `unifiedWindows[<type>]`). `RateLimitBanner.vue` trên ô nhập: `allowed_warning` →
      "You've used N% of your 5-hour limit, resets …" (tắt được, hiện lại khi đổi cửa sổ);
      `rejected` → "You've hit your … limit, resets …". `system/api_retry` → spinner hiện
      "API error (529), retrying in Ns   attempt x/y". Chưa thấy được `allowed_warning` /
      `rejected` thật.

## 9. Session và nhiều tab

- [x] Tab do terminal tab strip quản lý; store giữ `{ title, sessionId }` để resume.
- [~] Resume giữ nguyên model / effort / permission mode (đã làm, chờ test tay). Transcript
      của CLI có sẵn: `requestedModel` + `effort` trên mỗi entry assistant, `permissionMode`
      trên mỗi entry user (bỏ qua sidechain). `ClaudeSessionService.getSessionSettings` đọc
      giá trị cuối, trả kèm `get_session_response.settings`; `Session.applyResumedSettings`
      áp trước `launchClaude` (chỉ giá trị chưa ai chọn trong tab; Auto mặc định của UI
      không tính là "đã chọn"; bypass chỉ khi được bật). Model về dạng ID → ChatPage đổi
      sang mục picker có `resolvedModel` trùng. Đổi mode / model giữa chừng **không** vào
      transcript cho tới prompt kế tiếp (khảo sát: duyệt plan → acceptEdits, transcript vẫn
      `plan`), nên tab đang chạy còn báo settings hiện tại về host
      (`report_session_settings`, map trong bộ nhớ của `WebViewService`) và host ưu tiên
      map đó → tab dựng lại (bật/tắt Agent mode) resume đúng mode.
- [~] `claude --continue` (đã làm, chờ test tay): tab còn trống hiện nút "Continue last
      conversation" (tên + thời gian) dưới ô nhập — dưới để ô nhập căn giữa không nhảy khi
      nút hiện muộn. Lấy hội thoại mới nhất **không** đang mở ở tab khác (thường cái mới
      nhất là cái đang làm ở tab bên cạnh).
- [~] Hai tab cùng một session (đã làm, chờ test tay): mọi đường mở hội thoại cũ (`/resume`,
      trang lịch sử, Continue) đi qua `SessionStore.openExisting` → hỏi host
      `get_session_owner` (tra `TerminalSessionStore`, giữ sessionId của tab cả khi iframe
      bị huỷ; tab nhận session ngay lúc `launch_claude` có `resume`). Trùng → prompt
      `SessionConflictPrompt.vue`: "Switch to that tab" (`focus_tab` → tab strip chuyển
      tab), "Open a fork here" (`forkSession: true` khi resume: cùng lịch sử, session id
      mới, file gốc không bị ghi — đã khảo sát với CLI), "Cancel".

## 10. Cách kiểm thử lại

Script khảo sát dùng `query()` của `@anthropic-ai/claude-agent-sdk` trong `node_modules`:

1. `supportedCommands()` → danh sách lệnh SDK nhận (có `argumentHint`).
2. Gửi từng lệnh không tham số, ghi `assistant` / `result` trả về.
3. Gửi chuỗi `"prompt" → "/model haiku" → "/effort high" → "/clear" → "prompt"` trong
   **một** streaming session, xem `system/init` (model, session id) đổi thế nào.

Chạy trong một thư mục tạm, không chạy các lệnh ở mục 4 khi chưa chủ động muốn.
