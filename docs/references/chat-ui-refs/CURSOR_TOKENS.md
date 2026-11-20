# Cursor chat UI — thông số trích từ bản cài (3.31.11)

Nguồn: `resources/app/out/vs/workbench/workbench.desktop.main.css` (và `.js` cho các biến `--cursor-*`).
Chỉ dùng làm số tham khảo để chỉnh `webview-ui/claude/`.

| Thành phần | Giá trị |
| --- | --- |
| Bo góc lớn (`--cursor-radius-xl`) | 12px (`--cursor-radius-lg` = 8px) |
| Chữ transcript | 15px / 24px (glass); chữ tool `--cursor-font-size-lg` 14px / 22px |
| Viền nhạt (`--cursor-stroke-tertiary`) | màu chữ editor 8% |
| Viền thường (`--cursor-stroke-secondary`, `--card-border-color`) | màu chữ editor 12% |
| Chữ phụ (`--cursor-text-quaternary`) | màu chữ editor 60% hoặc 36% |
| Nền hover/tertiary | màu chữ editor 6–8% |
| Thời gian chuyển (`--cursor-duration-fast`) | 100ms |
| Bubble người dùng | padding 8px 10px; viền stroke-tertiary; `box-shadow: 0 1px 2px rgba(0,0,0,.05)`; radius xl; mờ nền `blur(10px)` |
| Ô nhập (`.ui-prompt-input__container`) | border 1px stroke-tertiary → stroke-secondary khi focus; radius xl; không vòng accent |
| Thẻ tool (`.composer-tool-call-block-card[data-chrome=card]`) | nền = nền editor; border stroke-secondary; radius xl; padding 8px 10px; gap 6px |
| Header thẻ tool | cao 28px; padding `0 8px 0 6px`; gap 8px; viền dưới stroke-secondary; chữ 13px màu tertiary |
| Body thẻ tool | padding `4px 8px 4px 6px` |
| Chevron của panel thu gọn | đóng: hiện; mở: ẩn, chỉ hiện khi rê chuột vào header |
| Step đã xong (`.ui-step-group-collapsible`) | markdown trong đó `opacity: .5` |
| Chiều rộng tối đa của composer | 840px |
