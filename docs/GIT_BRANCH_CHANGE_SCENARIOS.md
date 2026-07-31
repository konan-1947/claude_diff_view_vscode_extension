# Ma trận tình huống khi git branch đổi

Tài liệu này liệt kê toàn bộ tổ hợp trạng thái có thể xảy ra khi
`GitBranchWatcher` phát hiện branch đổi và gọi
`DiffManager.clearAll()` (`src/watcher/gitBranchWatcher.ts` →
`clearPendingDiffs()`). Dựa trên code thực tế đã đọc trong
`src/diff/diffManager.ts`, không suy đoán.

Cơ chế nền (áp dụng cho mọi ô trong ma trận):

- **"Pending" là gì:** `DiffManager.getPendingFiles()` trả về key của map
  `snapshots` (`diffManager.ts:213-215`) — **không phụ thuộc** vào việc có tab
  nào đang mở cho file đó hay không. Đóng tab diff bằng nút X **không** xoá
  file khỏi danh sách pending — chỉ gọi `unregisterPanel` (xoá khỏi map
  `panels`), snapshot vẫn còn nguyên.
- **`clearAll()` làm gì:** `disposeAll()` — xoá sạch `snapshots`, và với
  **mọi panel đang mở** (`panels.values()`) gọi `panel.dispose()` (đóng tab
  ngay lập tức, **không** reopen lại dưới dạng text editor — khác với flow
  accept/revert hunk cuối cùng, vốn có gọi `reopenAsTextEditor()`).
- **`clearPendingDiffs()` bỏ qua nếu:** `getPendingFiles().length === 0` —
  không làm gì cả, không hiện thông báo.

---

## Hai trục

**Trục A — Trạng thái editor** (tab đang hiển thị tại thời điểm branch đổi):

| Giá trị | Mô tả |
| --- | --- |
| A1 | Không có tab file nào đang mở (editor trống, hoặc chỉ có tab không liên quan như Settings) |
| A2 | Có tab dạng text editor thường đang mở, **file này không nằm trong pending** |
| A3 | Có tab dạng text editor thường đang mở, **file này đang nằm trong pending** (trạng thái tạm thời) |
| A4 | Có tab "AI CLI Diff" (custom diff editor) đang mở cho 1 file |

**Trục B — Trạng thái hệ thống** (`DiffManager.snapshots` tại thời điểm đó):

| Giá trị | Mô tả |
| --- | --- |
| B1 | Không có pending diff nào trong toàn workspace |
| B2 | Có pending diff, nhưng ở (các) file **khác** với file đang mở ở trục A |
| B3 | Có pending diff **chính là** file đang mở ở trục A |

`A4` luôn kéo theo `B3` cho đúng file đang xem (vì tab diff chỉ tồn tại nhờ có
snapshot) — nhưng vẫn có thể có thêm `B2` cho các file pending khác cùng lúc,
nên tách thành 2 biến thể riêng trong bảng.

---

## Bảng ma trận

| # | Tổ hợp | Tình huống | Hành vi hệ thống khi branch đổi | Ghi chú / rủi ro |
| --- | --- | --- | --- | --- |
| 1 | A1 × B1 | Không mở file nào, không có pending diff nào cả | `clearPendingDiffs()` thấy `count === 0` → **return sớm**, không làm gì, không hiện thông báo | An toàn tuyệt đối — trường hợp lý tưởng |
| 2 | A1 × B2 | Không mở file nào, nhưng có pending diff ở đâu đó (tab đã bị đóng bằng X trước đó, hoặc chưa từng mở) | `clearAll()` chạy: xoá `snapshots`, không có panel nào để dispose (vì không tab nào mở) → chỉ có tác dụng "âm thầm" xoá state + persist. Vẫn hiện `Git branch changed — cleared N pending diff(s)` vì `count` tính trước khi xoá | User có thể ngạc nhiên thấy thông báo dù "không thấy gì đang mở" — vì pending diff tồn tại độc lập với tab |
| 3 | A2 × B1 | Đang xem 1 file bất kỳ (không liên quan AI diff), hệ thống không có pending nào | `clearPendingDiffs()` return sớm, không đụng gì tới tab đang mở | An toàn — file đang xem hoàn toàn không bị ảnh hưởng |
| 4 | A2 × B2 | Đang xem 1 file không liên quan, nhưng có pending ở (các) file khác | `clearAll()` đóng panel của các file pending đó (nếu đang có tab mở), xoá snapshot. Tab đang xem **không đổi gì** | An toàn cho file đang focus; nhưng nếu 1 trong các file pending khác đang mở ở tab nền (background tab), tab đó **biến mất đột ngột** mà user không để ý ngay |
| 5 | A3 × B3 | File đang mở dạng **text editor thường**, nhưng chính file này đang có pending diff — trạng thái transient (trước khi `autoRouteTab` kịp chuyển nó thành diff tab) | `clearAll()` xoá snapshot của file này (và mọi pending khác). Vì tab đang là text editor thường (không phải `webviewPanel`), nó **không nằm trong `panels` map** → không bị `dispose()` → tab **vẫn ở nguyên**, chỉ là baseline diff đã bị xoá âm thầm | Race condition thật: nếu `autoRouteTab` xử lý **trước** `clearAll()`, file sẽ kịp bật thành diff tab rồi mới bị đóng (rơi vào case 6). Nếu `clearAll()` xử lý **trước**, file vẫn ở dạng text thường và snapshot biến mất trước khi kịp mở diff — user hoàn toàn không thấy gì bất thường, chỉ là sẽ không bao giờ được nhắc review nội dung cũ nữa |
| 6 | A4 × B3 (1 file duy nhất) | Đang xem đúng diff của file bị ảnh hưởng, và đây là pending duy nhất trong hệ thống | `clearAll()` đóng tab diff đang xem **ngay lập tức**, không cảnh báo, không reopen lại dạng text. Hiện thông báo `cleared 1 pending diff` | Đây chính là hiện tượng "tab tự đóng" user từng báo — mất focus đột ngột, không có cách quay lại xem diff cũ |
| 7 | A4 × B3 (nhiều file, đang xem 1 trong số đó) | Đang xem diff của file X, nhưng còn N-1 file pending khác (một số có tab mở ở nền, một số chưa mở) | `clearAll()` đóng **toàn bộ** N tab diff cùng lúc (kể cả các tab nền user không đang nhìn thấy), không chỉ riêng tab đang active | Đây là bản phóng đại của hiện tượng ban đầu (63 file "chớp nháy rồi biến mất" cùng lúc) — càng nhiều pending, càng nhiều tab biến mất đồng loạt không báo trước |
| — | A3 × B1, A3 × B2, A4 × B1, A4 × B2 | — | — | **Không hợp lệ / không thể xảy ra** theo thiết kế hiện tại — A3/A4 luôn kéo theo B3 cho đúng file đang mở (đã giải thích ở trên) |

---

## Yếu tố thời gian cắt ngang toàn bộ bảng

Mọi ô ở trên đều còn phụ thuộc **branch đổi được phát hiện sớm hay muộn** so
với các sự kiện khác (đã phân tích chi tiết ở phần trước của cuộc trò
chuyện — xem `docs/GIT_VS_AI_EDIT_DETECTION.md`):

- Nếu `WorkspaceWatcher` phát hiện file bị checkout ghi đè **trước khi**
  `GitBranchWatcher` kịp xác nhận `HEAD` đổi (suppress chưa bật), file đó sẽ
  **tự sinh thêm 1 pending diff mới** ngay trong lúc branch đang đổi — tức
  case 1/3 (ban đầu không có pending) có thể **chuyển động** sang case 2/4
  chỉ trong vài trăm ms, rồi lại bị `clearAll()` dọn sạch ngay sau đó. Đây
  chính là nguồn gốc hiện tượng "file bật ra rồi tự ẩn" đã mô tả trước đó.
- Case 5, 6, 7 là những case **hiển thị trực tiếp trên màn hình** — tác động
  tới trải nghiệm rõ nhất, nên được ưu tiên xem xét nếu muốn cải thiện UX
  (ví dụ: cảnh báo trước khi đóng tab đang active, hoặc giữ lại tab dạng
  read-only thay vì đóng hẳn).
