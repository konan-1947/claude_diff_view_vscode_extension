# AI CLI Diff View — Roadmap đề xuất cải thiện (chi tiết)

> Tài liệu này chi tiết hóa các đề xuất cải thiện cho **AI CLI Diff View**, so sánh với 5 sản phẩm tham chiếu (**ClaudeCodeExtension**, **Diffity**, **Diff Tracker**, **hunkwise**, **Nimbalyst**). Đối tượng thụ hưởng: **lập trình viên / vibe coder** dùng AI CLI ngay trong VS Code.
>
> **Cách đọc bảng — mỗi tính năng có 6 cột:**
> - **Feature** — tên tính năng đề xuất.
> - **User Story** — giá trị theo góc nhìn người dùng, mẫu "Là [vai trò], tôi muốn [nhu cầu] để [giá trị]".
> - **Lý do & phạm vi triển khai** — vì sao cần và cần đụng vào đâu.
> - **Tham chiếu** — nên tham khảo/lấy ý tưởng từ sản phẩm nào.
> - **Module cũ** — thuộc nhóm nào trong bảng product feature hiện có (nếu chưa có thì ghi *(module mới)*).
> - **Ước lượng** — cỡ công việc & thời gian cho một lập trình viên đã quen codebase.
>
> **Quy ước ước lượng:** `S` = nhỏ (~0.5–2 ngày) · `M` = vừa (~3–5 ngày) · `L` = lớn (~1–2 tuần). Thời gian là người-ngày, chưa gồm QA/đánh giá diện rộng.

---

## P0 — Must have (lấp lỗ hổng cốt lõi của trải nghiệm duyệt)

| Feature | User Story | Lý do & phạm vi triển khai | Tham chiếu | Module cũ | Ước lượng |
| --- | --- | --- | --- | --- | --- |
| **Xem diff cạnh nhau (split) song song inline** | Là lập trình viên, tôi muốn chuyển giữa xem một cột (inline) và hai cột (song song) để đọc thay đổi lớn theo cách dễ nhìn nhất với mình. | Monaco `DiffEditor` đã hỗ trợ sẵn `renderSideBySide`; chỉ cần thêm nút bật/tắt trên thanh công cụ webview và lưu lựa chọn. Phạm vi gọn, giá trị cao. | Diffity, Diff Tracker, hunkwise | Duyệt thay đổi theo khối | **S** (~1–2 ngày) |
| **Tôn trọng `.gitignore` và `files.exclude`** | Là lập trình viên, tôi muốn file mà dự án đã bỏ qua cũng không bị đưa ra duyệt để danh sách luôn sạch, không nhiễu bởi file build/sinh tự động. | Hiện chỉ loại trừ theo danh sách thư mục cố định. Cần đọc & khớp mẫu `.gitignore` theo từng thư mục gốc + hợp nhất với `files.exclude`/`search.exclude` của VS Code, theo dõi khi các file này đổi để tự đồng bộ. | Diff Tracker, hunkwise | Lọc & phạm vi theo dõi | **M** (~3–5 ngày) |
| **Bật/tắt theo dõi & đặt lại mốc gốc theo phiên** | Là lập trình viên, tôi muốn chủ động bắt đầu/dừng theo dõi và lấy trạng thái hiện tại làm mốc mới để kiểm soát chính xác phạm vi rà soát của một đợt việc. | Extension đang luôn bật từ lúc khởi động, không có cách "bắt đầu từ bây giờ" hay dọn mốc. Thêm trạng thái bật/tắt, lệnh + nút trong panel, và thao tác reset baseline toàn workspace. | Diff Tracker, hunkwise | Phát hiện thay đổi tự động | **M** (~2–3 ngày) |
| **Hỗ trợ workspace nhiều thư mục gốc (multi-root)** | Là lập trình viên làm monorepo, tôi muốn mọi thư mục gốc trong workspace đều được theo dõi và chạy được terminal/phiên AI để không bỏ sót thay đổi ở các gốc khác. | Nhiều luồng (terminal cwd, khởi động phiên AI, mốc gốc) đang lấy `workspaceFolders[0]`. Cần rà soát và cho phép chọn/áp theo từng thư mục gốc; baseline lập theo từng gốc. | *(khoảng trống nội tại)* | Phát hiện thay đổi tự động / Phạm vi theo dõi | **M** (~3–5 ngày) |

---

## P1 — Should have (nâng chất lượng review & mở rộng agent)

| Feature | User Story | Lý do & phạm vi triển khai | Tham chiếu | Module cũ | Ước lượng |
| --- | --- | --- | --- | --- | --- |
| **Khởi động phiên dựng sẵn cho nhiều agent (Codex, Qwen…)** | Là lập trình viên, tôi muốn khởi động thẳng phiên của agent mình đang dùng (không chỉ Claude) từ trong IDE để đúng với tinh thần "any AI CLI". | Cơ chế theo dõi đã agent-agnostic nhưng launcher chỉ dò `claude`. Thêm runner + parser output cho Codex/Qwen, dò PATH và cho chọn agent. Mỗi CLI có định dạng stream khác nhau nên tốn công tích hợp. | ClaudeCodeExtension, Nimbalyst | Phiên AI dựng sẵn | **M–L** (~4–6 ngày) |
| **Cảnh báo diff đã cũ / file đổi bên dưới** | Là lập trình viên, tôi muốn được báo khi file đang duyệt bị ghi lại để không lỡ chấp nhận nhầm nội dung đã lỗi thời. | Khi có write mới vào file đang mở diff, so mốc và hiển thị cảnh báo + nút làm mới trong webview. Tận dụng luồng theo dõi & repost sẵn có. | Diffity | Duyệt thay đổi theo khối | **S–M** (~1–2 ngày) |
| **Tìm kiếm file & đánh dấu "đã xem" trong danh sách chờ** | Là lập trình viên, tôi muốn lọc file theo tên và đánh dấu file đã review để theo dõi tiến độ khi AI sửa hàng chục file. | Thêm ô tìm kiếm + trạng thái "đã xem" cho từng file trong panel danh sách chờ; lưu trạng thái theo phiên. Chủ yếu là UI webview + state. | Diffity | Bảng file đang chờ | **M** (~2–3 ngày) |
| **Bỏ qua khác biệt chỉ ở khoảng trắng** | Là lập trình viên, tôi muốn ẩn các thay đổi thuần khoảng trắng để tập trung vào thay đổi có ý nghĩa khi formatter chạy kèm. | Monaco hỗ trợ `ignoreTrimWhitespace`; thêm nút bật/tắt + cân nhắc bỏ qua ở tầng tính hunk để nút accept/reject cũng nhất quán. | Diffity | Duyệt thay đổi theo khối | **S** (~1 ngày) |
| **Tự sinh commit message từ thay đổi đã chấp nhận** | Là lập trình viên, tôi muốn có sẵn một commit message soạn từ những thay đổi tôi đã giữ để commit nhanh mà không phải tự viết. | Sau khi accept, gom diff đã giữ và nhờ agent soạn message rồi điền vào ô commit của Git (hoặc clipboard nếu không có). Rất hợp vibe coder. | ClaudeCodeExtension, Nimbalyst | Tích hợp Git & nhánh *(mở rộng)* | **M** (~3–5 ngày) |
| **Âm báo & thông báo đa nền tảng (macOS/Linux)** | Là lập trình viên trên macOS/Linux, tôi muốn cũng nghe được tiếng báo khi trợ lý xong việc để không phải ngồi canh màn hình. | Âm báo hiện chỉ chạy Windows (PowerShell) và chỉ cho Claude. Bổ sung đường phát âm thanh cho macOS/Linux và tách khỏi ràng buộc Claude. | Nimbalyst, ClaudeCodeExtension | Cài đặt & cá nhân hóa | **S–M** (~1–2 ngày) |
| **Chỉ báo trạng thái ở thanh trạng thái + phím tắt bật/tắt** | Là lập trình viên, tôi muốn thấy đang theo dõi hay không và còn bao nhiêu file chờ ngay trên thanh trạng thái để nắm tình hình mà không cần mở panel. | Thêm `StatusBarItem` phản ánh số file chờ/trạng thái theo dõi, đồng bộ với `onDidChangeDiffs`; kèm lệnh bật/tắt nhanh. | Diff Tracker | Bảng file đang chờ | **S** (~1–2 ngày) |

---

## P2 — Nice to have (bổ trợ, giá trị thấp hơn hoặc lệch nhẹ định vị)

| Feature | User Story | Lý do & phạm vi triển khai | Tham chiếu | Module cũ | Ước lượng |
| --- | --- | --- | --- | --- | --- |
| **Bình luận / ghi chú trên dòng để agent xử lý lại** | Là lập trình viên, tôi muốn để lại nhận xét trên từng dòng rồi nhờ agent tự sửa theo để biến review thành vòng lặp góp ý → sửa. | Cần UI bình luận trong webview, lưu trữ theo file/dòng và cầu nối gửi lại cho agent. Giá trị cao nhưng là phần mở rộng lớn, chạm nhiều tầng. | Diffity, Nimbalyst | *(module mới: Bình luận & Review)* | **L** (~1–2 tuần) |
| **AI code review tự động, nhận xét theo mức ưu tiên** | Là vibe coder, tôi muốn agent tự soát diff và để lại nhận xét phân theo độ quan trọng để tôi xử lý theo thứ tự. | Gọi agent review trên diff hiện tại rồi gắn nhận xét vào đúng vị trí; cần định dạng kết quả và tầng hiển thị. Vượt ra ngoài lõi duyệt thủ công. | Diffity | *(module mới: AI Code Review)* | **L** (~1–2 tuần) |
| **Theo dõi mức dùng token / chi phí mỗi lượt** | Là lập trình viên, tôi muốn thấy token và chi phí mỗi lượt của phiên dựng sẵn để kiểm soát hạn mức. | Đọc số liệu từ stream-json của agent và hiển thị trong panel trạng thái phiên. Phụ thuộc từng agent có cấp số liệu hay không. | ClaudeCodeExtension, Nimbalyst | *(module mới: Usage & Cost)* | **M** (~3–5 ngày) |
| **Tùy chọn hiển thị diff (word wrap, mở rộng ngữ cảnh, minimap)** | Là lập trình viên, tôi muốn bật/tắt xuống dòng, minimap và mở rộng vùng ngữ cảnh để đọc diff theo cách hợp với mình. | Monaco đã hỗ trợ phần lớn qua `editorConfig`; chủ yếu là phơi các tùy chọn ra thanh công cụ và lưu lại. | Diff Tracker, Diffity | Duyệt thay đổi theo khối | **S–M** (~1–2 ngày) |
| **Bảng tra cứu phím tắt** | Là lập trình viên, tôi muốn tra nhanh các phím tắt (duyệt khối, chuyển file, accept/revert) để dùng thành thạo hơn. | Overlay tĩnh liệt kê phím tắt hiện có; ít rủi ro, dùng lại được cơ chế overlay giới thiệu sẵn có. | Diffity, Nimbalyst | Cài đặt & cá nhân hóa | **S** (~0.5–1 ngày) |
| **Preset màu cho diff theo theme** | Là lập trình viên, tôi muốn chọn preset màu cho khung diff để đồng nhất thẩm mỹ với IDE. | Diff đã theo theme VS Code; thêm vài preset là bổ trợ thẩm mỹ, chi phí thấp. | ClaudeCodeExtension | Cài đặt & cá nhân hóa | **S** (~1–2 ngày) |

---

## Tổng hợp & thứ tự đề xuất triển khai

| Nhóm | Số tính năng | Tổng ước lượng thô | Gợi ý làm trước |
| --- | --- | --- | --- |
| **P0 — Must have** | 4 | ~9–15 ngày | Xem diff split (S) → `.gitignore` (M) là hai việc "đáng đồng tiền" nhất, làm trước. |
| **P1 — Should have** | 7 | ~14–22 ngày | Cảnh báo diff cũ (S) và whitespace toggle (S) làm xen kẽ vì rẻ; multi-agent launcher là hạng nặng nhất của nhóm. |
| **P2 — Nice to have** | 6 | ~20–35 ngày | Ưu tiên các món S trước (phím tắt, preset màu, tùy chọn hiển thị); hai món L (bình luận, AI review) chỉ làm khi muốn mở rộng định vị. |

> **Lưu ý:** ước lượng mang tính định hướng cho một lập trình viên đã quen codebase, chưa gồm thời gian kiểm thử diện rộng, xử lý đa nền tảng (`node-pty` native), và cập nhật tài liệu. Các món chạm vào phát hiện Git (mục P0 reset baseline, P1 cảnh báo diff cũ) cần kiểm thử kỹ vì tương tác với logic burst-detection và git-branch-watcher hiện có.
