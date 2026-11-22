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
- [ ] **Effort**: `/effort high` → CLI báo "Set effort level to high (this session only)",
      `Session.effortLevel` không đổi. Sửa: bắt kết quả lệnh (hoặc tự chặn `/effort`,
      xem mục 2) và cập nhật signal.
- [ ] **`/clear`**: CLI tạo session mới (session id đổi) và quên hết; UI chỉ cập nhật
      `sessionId` (`Session.ts`, nhánh `event.type === 'system'`) mà vẫn hiện hội thoại cũ
      → người dùng tưởng Claude còn nhớ. Sửa: chặn `/clear` ở UI → xoá messages / mở
      hội thoại mới trong cùng tab, cập nhật `{ title, sessionId }` trong `TerminalSessionStore`.
- [~] **Permission mode**: đã đọc `permissionMode` từ `system/init` và `system/status`.
      Cần kiểm tra khi CLI tự rời plan mode sau `ExitPlanMode`.
- [ ] **`/rename <tên>`**: kiểm tra tên mới có về tiêu đề tab trong terminal tab strip
      không (`renameTab`).
- [ ] **`/compact`**: sau `compact_boundary` UI có refresh context usage; cần hiển thị
      một mốc "Conversation compacted" giống CLI, và xử lý result rỗng
      (`/compact` trên hội thoại trống trả về "Error: No messages to compact" + result rỗng).
- [ ] **`/output-style <tên>`**, **`/fast`**: kiểm tra có cần hiển thị trạng thái
      trong UI không (CLI có hiện trên status line).

## 2. Lệnh vốn là menu trong CLI → UI phải tự dựng control

Hiện qua UI chỉ in usage/text. Cách làm: chặn ở `ChatInputBox.handleSubmit` và ở
`onSelect` của slash completion khi lệnh **không có tham số**; có tham số thì vẫn gửi
cho CLI (và đồng bộ trạng thái như mục 1).

- [~] `/model` → mở `ModelSelect` (đã làm: Enter hoặc chọn từ gợi ý `/`, chờ test tay).
- [ ] `/effort` → mở `EffortSelect`.
- [ ] `/output-style` → dropdown chọn style (danh sách lấy từ chính output của lệnh,
      hoặc đọc file style).
- [ ] `/config` → mở trang Settings của uic / form `key=value` (CLI chỉ in danh sách key).
- [ ] `/mcp` → panel danh sách MCP server + reconnect / enable / disable
      (tham số `reconnect|enable|disable [<server>|all]` CLI vẫn nhận được).
- [ ] `/autocompact` → dropdown `auto | <tokens>`.
- [ ] `/rename` không tham số → ô nhập tên (CLI báo "Couldn't generate a name" khi chưa
      có hội thoại).
- [ ] `/goal` không tham số → ô nhập điều kiện (CLI chỉ in "Usage: /goal <condition>").
- [ ] `/auto-mode-setup` → wizard (CLI trả JSON `"code": "usage"`).
- [ ] `/color`: không tham số CLI **tự random màu**; trong UI màu không có tác dụng →
      ẩn khỏi danh sách gợi ý, hoặc gắn vào màu tab.
- [ ] `/agents`: CLI đã bỏ wizard → ẩn khỏi danh sách gợi ý.
- [ ] `/focus`: CLI báo "isn't available here yet" → ẩn.

## 3. Lệnh terminal không có qua SDK ("isn't available in this environment")

Các lệnh này không nằm trong `supportedCommands()` nên không hiện trong gợi ý `/`; gõ
tay thì CLI trả "isn't available in this environment". UI cần tự làm hoặc tự trả lời.

- [ ] `/resume` → mở danh sách lịch sử (nút ⟲ đã có trên header) và load session.
- [ ] `/permissions` → màn hình allow/deny rules (đọc/ghi `settings.json` của project
      và user).
- [ ] `/help` → hiện danh sách lệnh + phím tắt của UI.
- [ ] `/memory` → mở `CLAUDE.md` (project / user) trong editor VS Code.
- [ ] `/status` → panel: version CLI, model, account, cwd, MCP, settings đang áp dụng.
- [ ] `/add-dir` → chọn thư mục (VS Code folder picker) → `additionalDirectories` của SDK.
- [ ] `/hooks` → xem hooks đang có (chỉ đọc là đủ).
- [ ] `/plugin` → tối thiểu: liệt kê plugin; cài/gỡ có thể để sau.
- [ ] `/release-notes` → mở changelog.
- [ ] `/export` → lưu hội thoại ra file markdown (chưa thử qua SDK).
- [ ] `/login`, `/logout` → hướng dẫn chạy trong terminal (chưa thử qua SDK).
- [ ] Tự đưa các lệnh trên vào danh sách gợi ý `/` (đánh dấu là lệnh do UI xử lý).
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
