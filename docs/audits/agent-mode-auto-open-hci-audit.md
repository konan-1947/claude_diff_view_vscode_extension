# Audit HCI: tự mở diff trong Agent Mode

## Audit scope

- Mục tiêu: luồng nhận thay đổi tệp từ agent trong Agent Mode.
- Đã xem: `src/watcher/workspaceWatcher.ts`, `src/diff/diffManager.ts`, `src/extension.ts`, `src/views/agentChangesPanel.ts`, và ảnh được cung cấp.
- Tác vụ chính suy ra: giữ Agent terminal/preview là bề mặt làm việc trung tâm; sidebar chỉ điều hướng các thay đổi đang chờ.
- Giới hạn: audit tĩnh; chưa chạy Extension Development Host hay kiểm thử tương tác.

## Verdict

**P1 — Fix before release:** thay đổi tệp mới từ agent có thể tự chuyển tiêu điểm sang custom diff ở editor chính, phá vỡ luồng Agent Mode.

## Scorecard

| Hạng mục | Trạng thái |
| --- | --- |
| Information hierarchy | Risk |
| Navigation/flow | Fail |
| Forms/error states | Not evidenced |
| Feedback/state | Risk |
| Accessibility | Not evidenced |
| Responsive/visual quality | Pass |
| Trust | Risk |

## Findings

### HCI-01 · P1

| Field | Evidence |
| --- | --- |
| Evidence type | Code + Screenshot |
| Evidence | `src/watcher/workspaceWatcher.ts:447-450`; `src/diff/diffManager.ts:155-162`; ảnh cho thấy Agent panel đang hoạt động trong khi editor chính bị custom diff chiếm chỗ. |
| Problem | `WorkspaceWatcher.triggerDiff()` luôn nạp snapshot rồi gọi `DiffManager.openDiff()`. Khi không phải burst dump, không có `preserveFocus`; `openDiff()` gọi `vscode.openWith` với `preserveFocus: false`, nên editor chính bị chuyển sang tab diff. Luồng này không biết Agent Mode có đang bật. |
| Impact | Mỗi lần agent ghi tệp, người dùng bị rời Agent terminal/preview. Điều này làm gián đoạn việc theo dõi agent và trái với mô tả Agent Changes panel là navigator cho central Agent preview. |
| Recommendation | Cho `WorkspaceWatcher` một callback/policy `shouldAutoOpenDiff()` hoặc `onPendingDiff()`. Trong Agent Mode, chỉ nạp snapshot và phát `onDidChangeDiffs`; không gọi `openDiff()`. Có thể chọn file mới trong central preview bằng `TerminalPanelProvider.openPendingFileInAgent()` nếu đó là hành vi mong muốn, nhưng không được mở custom editor. |
| Confidence | High |

### HCI-02 · P2

| Field | Evidence |
| --- | --- |
| Evidence type | Code |
| Evidence | `src/extension.ts:405-412` và `src/extension.ts:344-353`. |
| Problem | Route Agent Mode hiện chỉ áp dụng cho tab văn bản thường hoặc command `openPendingFile`; watcher lại gọi custom editor trực tiếp. Hai đường mở tệp dùng hai chính sách khác nhau. |
| Impact | Lỗi có thể tái diễn khi thêm entry point mới và hành vi phụ thuộc vào cách tệp được mở. |
| Recommendation | Tập trung quyết định mở diff vào một router chung, rồi dùng router đó cho watcher, command, navigation và built-in runner. |
| Confidence | High |

## Manual verification queue

1. Bật Agent Mode, để Agent terminal là view đang hoạt động, rồi để agent sửa một file nhỏ: editor chính phải không nhận custom diff tab và sidebar phải cập nhật file.
2. Chọn file từ Agent Changes: preview trung tâm phải hiển thị diff, không đổi editor tab/tiêu điểm ngoài ý muốn.
3. Tắt Agent Mode và sửa file ngoài: custom diff editor vẫn phải tự mở như hành vi hiện có.
4. Lặp lại với burst hold hết hạn để xác nhận nhánh `fromBurstDump` cũng tuân theo policy Agent Mode.

## Strengths

- `AgentChangesPanel` chỉ đóng vai trò navigator và không tự render/apply source (`src/views/agentChangesPanel.ts:5-8`).
- Command mở pending file đã ưu tiên Agent preview khi Agent Mode hoạt động (`src/commands/commandsRegistry.ts:82-91`).
- `autoRouteTab()` đã có ý định giữ các tab text ngoài Agent Mode khỏi editor chính (`src/extension.ts:405-412`).

## Suggested next fixes

1. Chặn auto-open custom diff từ watcher khi Agent Mode bật.
2. Dùng một policy/router duy nhất cho mọi nguồn mở pending diff.
3. Kiểm thử thủ công cả thay đổi đơn lẻ và burst-held write trong Agent Mode.
