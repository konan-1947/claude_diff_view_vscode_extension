# Cursor sidebar chat — thông số đo trực tiếp (Cursor 3.31.11, theme sáng)

Đo bằng CDP (computed style + toạ độ) trên cuộc chat mẫu trong thư mục tạm; ảnh ở `cursor-live/`.
Màu luôn là **màu chữ editor (`--vscode-editor-foreground`, F) với độ trong suốt**; không hard-code màu.
Chiều rộng pane đo được 621px. Số bên dưới là px.

## Bố cục chung (pane 621 rộng)
- Bubble người dùng và ô nhập: cách mép pane **16** mỗi bên.
- Mọi hàng khác (chữ, dòng "Worked/Thought/Explored", thẻ Edit/Run): cách mép pane **27** (16 + 11).
- Khoảng cách giữa các hàng: **14**. Hàng 22 cao (chữ 14/22).
- Nền toàn pane = nền editor.

## Header (tab strip kiểu VS Code, cao 35)
- Tab: chữ 13, padding-left 10, có icon `codicon-chat`, nút đóng 20×20 (margin-left 4). Tab đang chọn nền = nền editor, tab khác nền hơi xám, viền dưới tab strip.
- Bên phải: `+` (codicon-add), lịch sử (codicon-history), `...` (dropdown), nút toggle panel-right; mỗi nút 22×22, icon 16, màu F 66%, bo 5, gap 2; khối cách mép phải 8.
- Mở lịch sử: popover rộng 252, bo 14, nền editor; hàng tìm kiếm (icon 14, ô nhập "Search Agents…", padding 6px 14px, viền dưới F 8%); nhãn nhóm "Today" 12/16 màu F 60% padding 0 14; mỗi mục cao 30 padding 0 14, icon 16 (check-circle) cách chữ 9, mục chọn nền F 8%, nút hành động bên phải hiện khi hover; vạch ngăn F 8% (margin 6 14); mục "Archived" thu gọn màu F 60%.

## Bubble người dùng
- Hộp: viền 1 F 20%, bo 12, nền editor, padding nội dung **8 10**, chữ **14/22**, màu F.
- Nút restore: 20×20, icon 16, màu F 52%, bo 4, nằm góc phải dưới, căn giữa theo chiều dọc với dòng cuối.

## Dòng bước (Thought / Explored / Worked)
- Nút header: 14/22, gap 4, không nền, không viền.
  - phần hành động ("Thought", "Explored", "Worked"): màu F **60%**.
  - phần chi tiết ("1s", "2 files, 1 search", "for 9s", "briefly"): màu F **36%** (riêng "for 9s" của Worked là 60%).
  - chevron: icon 12, F 52%, margin-left 3, **ẩn (opacity 0) cho tới khi hover/khi đóng**.
- Mở "Thought": đoạn suy nghĩ chữ xám (F ~50%), cỡ 14/22, cách hàng 14.
- Mở "Explored": các dòng con cao 22, cách nhau 4: "Searched files *.py", "Read hello.py L1-6" — động từ F 60%, đối tượng F 36%.
- **"Worked for Ns ⌄"** là header của cả nhóm bước trong một lượt: bấm thì ẩn toàn bộ bước (Thought, Explored, Edit, Run…), chỉ còn câu trả lời cuối. Lượt đã xong mở lại mặc định **thu gọn**.

## Trả lời (markdown)
- 14/22 màu F. Code inline 12.6px, nền F 8%, bo 5, padding 1.5 2. Đoạn cách nhau 16.

## Thẻ tool (Edit / Run command)
- Thẻ: nền editor, viền 1 F 12%, bo 12, **không padding ngoài**; header cao 30 padding 8, gap 6, viền dưới F 12%.
- Edit: header = icon file 16 + tên file (F 60%) + `+N` xanh `#00723e`-like; thân là diff: dòng cao 20, chữ 12/20 mono, gutter 52 (số dòng 11px F 36%, dấu `+`/`-` 11px đậm), dải trái 3px, dòng thêm nền `rgba(20,193,111,.14)`, dòng xoá nền đỏ tương ứng; hiển thị cả dòng ngữ cảnh.
- Run command: header = icon terminal 12 (F 36%) + mô tả (F 60%) + lệnh (F 36%, margin-left -2); nút tuỳ chọn 20×20 hiện khi hover; thân = output **13/18 mono màu F 36%**, padding 6 10 6, bấm để xem đầy đủ.

## Hàng hành động cuối lượt
- Nút 24×24, bo 6, icon 13, màu F 52%: Copy, Fork; gap 2; sau đó "1m ago" 12/18 màu F 60% (padding-left 6).

## Bên dưới (ô nhập)
- Khối: padding 0 16, margin-bottom 10.
- **Thanh "1 File  Undo  Keep  Review"** dính trên ô nhập: viền trên F 8%, bo 8 8 0 0, margin 0 9; header cao 26 padding 4 8; chevron 14 F 66%; nhãn 12 F 66%; nút 12/16 padding 2 6 bo 4 (Undo/Keep F 74%, Review nền F 14% màu F).
- Ô nhập: bo 12, viền 1 F 20%, nền editor 90%, padding 8 10 6, gap 6. Placeholder "Plan, Build, / for skills, @ for context" (F ~36%).
- Hàng nút dưới: cao 28 (margin-top 9).
  - Pill "Agent ⌄": 12/16.8, nền F 14%, bo tròn hết, padding 2 4 2 8, gap 2, opacity .8; icon codicon-infinity 16 (opacity .5); chevron 14 (opacity .5).
  - Tên model: 12px, cạnh pill; khoá nhỏ nếu không đổi được.
  - Bên phải: icon đính kèm 20×20 icon 16 opacity .5; nút mic/gửi tròn 20×20 nền F 66% chữ trắng.
- **Chat trống**: ô nhập nằm **trên cùng** pane (cách đầu 10), không ở đáy; bên dưới trống.
