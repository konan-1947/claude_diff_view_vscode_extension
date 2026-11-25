# Dải ghim tin nhắn người dùng khi lăn lên (Claude UI)

Ngày: 2026-11-25 — thay đổi nhỏ, chỉ trong webview `webview-ui/claude`.

## Mục đích
Khi đọc ngược một đoạn chat dài trong Claude UI, người dùng cần biết đoạn đang xem là trả lời cho câu hỏi nào — giống TUI của Claude Code: lăn lên thì trên cùng hiện tin nhắn của mình.

## Hành vi (đã chốt với người dùng)
- Dải ghim hiện **tin nhắn của turn đang cắt mép trên khung chat** (đổi theo turn khi lăn).
- **Ẩn** khi bubble tin nhắn gốc của turn đó còn nhìn thấy (kể cả khi ở đáy, turn ngắn).
- **Bấm vào dải → cuộn tới bubble gốc** (`scrollIntoView({ block: 'start' })`), dải tự ẩn.

## Đề xuất của mình (người dùng có thể sửa)
- Hoạt động cả khi đang chạy lẫn khi đã xong.
- 1 dòng, `text-overflow: ellipsis`; chỉ lấy text (bỏ ảnh), cùng cách tính với `displayContent` của `UserMessage.vue`.
- Cùng nền bubble user, dính mép trên, viền mờ dưới; **đè lên** nội dung (absolute), không đẩy layout; đổi chữ tại chỗ, không animation.

## Các cách đã cân nhắc
1. **Một dải duy nhất trong ChatPage + scroll listener (rAF)** — **đã chọn**: gọn một chỗ, dễ đáp ứng đủ ẩn/1 dòng/overlay.
2. IntersectionObserver từng UserMessage — vòng đời observer + ghép 2 tín hiệu, rối hơn mà không lợi.
3. CSS `position: sticky` trong TurnView — cần bản sao rút gọn chiếm chỗ trong flow → layout shift.

## Thiết kế
- Component mới `components/Messages/StickyPrompt.vue`: props `text`; emit `click`. Không có text → không render.
- `ChatPage.vue`:
  - Mỗi `TurnView` mang `data-turn-key`; `UserMessage` đã có class `.user-message` để đo.
  - Listener `scroll` (passive, gộp bằng `requestAnimationFrame`) trên `.messagesContainer`, chạy lại khi `chatItems` đổi / resize. Tìm turn cuối cùng có `top <= containerTop`; nếu `.user-message` của nó có `bottom <= containerTop` → `stickyKey = key`, ngược lại `null`.
  - Dải đặt **ngoài** `.messagesContainer` (container đó có mask + overflow), `position: absolute; top: 0` trong `.main` (đã `position: relative`), cùng `max-width: var(--cs-column-max)` căn giữa, và tránh đè thanh cuộn.
  - Bấm: tìm `[data-turn-key=…] .user-message` → `scrollIntoView({ block: 'start' })`.
- Ẩn khi `dimTranscript` hoặc không có tin nhắn.

## Để builder tự quyết
Màu/viền cụ thể theo biến `--cs-*`/`--vscode-*` sẵn có; icon/ký hiệu đầu dòng.

## Kiểm tra
`npm run typecheck` + `npm run compile`; thử thủ công: turn dài lăn lên, đổi turn, bấm dải, ở đáy dải ẩn, Agent mode (cột rộng).
