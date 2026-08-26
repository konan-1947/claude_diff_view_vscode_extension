# Product Features — Claude Code Extension for Visual Studio

> Danh sách tính năng sản phẩm, trích xuất từ implementation thực tế trong source code.
> Đối tượng: lập trình viên .NET dùng Visual Studio 2022/2026 trên Windows, muốn chạy các AI coding agent (Claude Code, Codex, Cursor, Devin, PI, Antigravity, Open Code, Reasonix) ngay trong IDE.
> User story theo format: *Là [vai trò], tôi muốn [nhu cầu] để [giá trị].*

| Module | Feature | User Story |
|--------|---------|-----------|
| **Overview** | Mở AI agent trong Visual Studio | Là lập trình viên, tôi muốn mở một panel AI agent ngay trong Visual Studio để làm việc mà không phải rời khỏi IDE. |
| **Overview** | Tự bám theo solution | Là lập trình viên, tôi muốn extension tự nhận solution đang mở và khởi động lại agent khi tôi đổi solution để agent luôn chạy đúng dự án. |
| **Overview** | Hướng dẫn cài đặt khi thiếu CLI | Là người mới, tôi muốn được chỉ ngay câu lệnh cài đặt khi chọn một agent chưa cài để bắt đầu dùng được nhanh. |
| **AI Providers** | Chọn giữa nhiều AI agent | Là người dùng, tôi muốn chọn giữa nhiều agent (Claude Code, Codex, Cursor, Devin, PI, Antigravity, Open Code, Reasonix) trong cùng một chỗ để dùng đúng công cụ cho từng việc. |
| **AI Providers** | Ẩn/hiện agent trong danh sách | Là người dùng, tôi muốn ẩn bớt các agent không dùng để menu chọn agent gọn gàng. |
| **AI Providers** | Bật chế độ chạy tự động không hỏi | Là người dùng đã hiểu rủi ro, tôi muốn bật chế độ "bỏ qua xác nhận" của agent để nó chạy liền mạch không hỏi từng bước. |
| **AI Providers** | Cập nhật & khởi động lại agent | Là người dùng, tôi muốn cập nhật hoặc khởi động lại agent bằng một click để luôn dùng bản mới và khôi phục khi agent treo. |
| **Terminal** | Chạy agent trong terminal nhúng | Là người dùng, tôi muốn xem agent làm việc trong terminal thật ngay trong VS để có trải nghiệm đầy đủ của CLI. |
| **Terminal** | Chọn loại terminal | Là người dùng, tôi muốn chuyển sang Windows Terminal để emoji và Unicode hiển thị đúng. |
| **Terminal** | Tách/gắn lại terminal | Là người dùng nhiều màn hình, tôi muốn tách terminal thành tab riêng và gắn lại khi cần để bố trí không gian làm việc linh hoạt. |
| **Terminal** | Chỉnh font & cỡ chữ | Là người dùng, tôi muốn chỉnh font và cỡ chữ terminal để đọc thoải mái. |
| **Native Mode** | Xem hội thoại dạng chat *(beta)* | Là người dùng, tôi muốn xem hội thoại dưới dạng chat có định dạng thay vì terminal để đọc câu trả lời dễ hơn. |
| **Native Mode** | Trả lời câu hỏi bằng thẻ bấm | Là người dùng, tôi muốn trả lời câu hỏi của agent bằng cách click vào thẻ (kèm ô nhập tự do) để chọn nhanh và chính xác. |
| **Native Mode** | Duyệt plan trước khi chạy | Là người dùng, tôi muốn agent trình kế hoạch trước rồi tôi duyệt hoặc yêu cầu sửa để kiểm soát trước khi nó thực thi. |
| **Native Mode** | Xem diff màu cho mỗi lần sửa file | Là người dùng, tôi muốn mỗi lần agent sửa file mở ra một diff có màu ngay trong chat để thấy thay đổi mà không phải chuyển tab. |
| **Native Mode** | Chạy nhiều phiên chat song song | Là người dùng, tôi muốn mở nhiều phiên chat độc lập cùng lúc để xử lý nhiều luồng công việc song song. |
| **Native Mode** | Đặt tên & màu cho phiên | Là người dùng nhiều phiên, tôi muốn đặt tên và màu riêng cho từng phiên để dễ phân biệt. |
| **Native Mode** | Dừng lượt trả lời | Là người dùng, tôi muốn dừng lượt trả lời của agent ngay lập tức khi nó đi sai hướng. |
| **Native Mode** | Đổi model/effort giữa hội thoại | Là người dùng, tôi muốn đổi agent, model và effort ngay giữa cuộc trò chuyện mà không mất nội dung để thử nghiệm nhanh. |
| **Prompt** | Soạn prompt nhiều dòng | Là người dùng, tôi muốn viết prompt nhiều dòng và tự chọn phím gửi để soạn prompt dài thoải mái. |
| **Prompt** | Chèn file bằng "@" | Là người dùng, tôi muốn gõ `@` để tìm và chèn file/thư mục trong dự án để dẫn ngữ cảnh cho agent nhanh. |
| **Prompt** | Xem lại lịch sử prompt | Là người dùng, tôi muốn duyệt lại các prompt đã gửi gần đây để tái sử dụng mà không phải gõ lại. |
| **Prompt** | Gửi code đang chọn | Là người dùng, tôi muốn gửi đoạn code đang chọn kèm đường dẫn và số dòng để hỏi agent về đúng đoạn đó. |
| **Prompt** | Đính kèm file & ảnh | Là người dùng, tôi muốn dán ảnh hoặc kéo-thả file bất kỳ vào prompt để cung cấp thêm ngữ cảnh cho agent. |
| **Model** | Chọn model của agent | Là người dùng, tôi muốn chọn model đang dùng để cân đối tốc độ, chi phí và chất lượng. |
| **Model** | Chọn mức effort/reasoning | Là người dùng, tôi muốn chọn mức độ "suy nghĩ" của agent để đánh đổi độ sâu với tốc độ và chi phí. |
| **Model** | Đổi tài khoản đăng nhập | Là người dùng, tôi muốn đổi tài khoản đăng nhập của agent ngay trong IDE để quản lý tài khoản không rời VS. |
| **Code Changes** | Xem thay đổi Git chưa commit | Là người dùng, tôi muốn xem toàn bộ thay đổi chưa commit với tìm kiếm và nhảy tới file/dòng để review nhanh. |
| **Code Changes** | Tự mở Changes khi gửi prompt | Là người dùng, tôi muốn tab thay đổi tự mở khi gửi prompt để theo dõi diff trực tiếp lúc agent làm việc. |
| **Session History** | Quản lý & tiếp tục phiên cũ | Là người dùng, tôi muốn xem, đổi tên, xóa hoặc tiếp tục các phiên trước để nối lại công việc dang dở. |
| **Usage & Cost** | Theo dõi mức dùng & chi phí | Là người dùng, tôi muốn xem mức sử dụng theo phiên/tuần và chi phí mỗi lượt để kiểm soát hạn mức và chi tiêu. |
| **Automation** | Hành động khi agent hoàn tất | Là người dùng, tôi muốn khi agent xong việc thì tự phát âm thanh, báo và chạy hành động (build, run, test, script hoặc follow-up) để tự động hóa quy trình. |
| **Automation** | Tự sinh commit message | Là người dùng, tôi muốn agent viết commit message từ thay đổi hiện tại và điền sẵn vào Git để review cùng diff. |
| **Automation** | Tự gửi lỗi build cho agent | Là người dùng, tôi muốn lỗi build được tự gửi cho agent để nó sửa, tạo vòng lặp sửa lỗi tự động. |
| **Automation** | Tự gửi lỗi runtime cho agent | Là người dùng đang debug, tôi muốn exception chưa xử lý được tự gửi cho agent kèm call stack để nó sửa. |
| **Automation** | Lệnh tùy chỉnh một-click | Là người dùng, tôi muốn lưu các câu lệnh/prompt hay dùng và gửi chỉ bằng một click để tái sử dụng quy trình quen thuộc. |
| **Settings** | Đồng bộ giao diện theo theme | Là người dùng, tôi muốn extension theo theme sáng/tối của VS (hoặc màu tùy chỉnh) để đồng nhất với IDE. |
| **Settings** | Tùy biến bố cục & toolbar | Là người dùng, tôi muốn sắp xếp lại panel và thăng các chức năng hay dùng thành nút toolbar để truy cập nhanh. |
| **Settings** | Nhớ cấu hình qua các phiên | Là người dùng, tôi muốn mọi lựa chọn được lưu và khôi phục để không phải cấu hình lại mỗi lần mở VS. |

## Ghi chú tính năng chưa hoàn thiện

- **Native Mode** đang ở trạng thái *beta* (opt-in); **Reasonix luôn chạy trong terminal**, và agent nào không hỗ trợ sẽ tự quay về terminal.
- **Session History** hiện chỉ hỗ trợ Claude Code, Codex và Devin — chưa phủ toàn bộ 8 agent.
- **Theo dõi mức dùng & chi phí** hỗ trợ đầy đủ cho Claude (thanh usage inline) và Codex (chi phí/token mỗi lượt); các agent khác chưa có.
- **Sinh commit message** yêu cầu bật Native Mode; nếu không tìm được ô commit của Git sẽ chép nội dung vào clipboard.
