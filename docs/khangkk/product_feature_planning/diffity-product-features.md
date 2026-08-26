# Diffity — Tổng hợp tính năng sản phẩm

> **Diffity** là một công cụ dòng lệnh (CLI) mở ra trình xem diff kiểu GitHub ngay trên trình duyệt cho bất kỳ repo Git nào, kèm khả năng review code có sự tham gia của AI agent. Sản phẩm hoạt động độc lập với agent (agent-agnostic) — dùng được với Claude Code, Cursor, Codex và các AI coding agent khác.
>
> **Người dùng cuối** là lập trình viên muốn xem lại thay đổi code, tự review hoặc nhờ AI agent review, duyệt & chú thích mã nguồn, học công nghệ mới, và xử lý Pull Request của GitHub ngay trên máy cá nhân.
>
> **Cách đọc User Story:** mỗi dòng viết theo góc nhìn người dùng cuối theo mẫu "Là [vai trò], tôi muốn [nhu cầu] để [giá trị]", không đề cập chi tiết kỹ thuật.

## Bảng tính năng

| Module | Feature | User Story |
|---|---|---|
| Xem thay đổi (Diff) | Mở diff từ nhiều loại tham chiếu | Là lập trình viên, tôi muốn xem thay đổi chưa commit, theo commit, nhánh, tag hay khoảng commit tùy ý để nắm được đúng phần code mình quan tâm. |
| Xem thay đổi (Diff) | Lọc theo loại thay đổi | Là lập trình viên, tôi muốn xem riêng thay đổi đã staged, chưa staged hay toàn bộ để tập trung vào đúng nhóm thay đổi cần kiểm tra. |
| Xem thay đổi (Diff) | So sánh hai nhánh/tag theo kiểu PR | Là lập trình viên, tôi muốn so sánh nhánh của mình với nhánh gốc trước khi merge để biết chính xác mình sắp đưa gì vào. |
| Xem thay đổi (Diff) | Chế độ xem tách đôi và xem hợp nhất | Là người review, tôi muốn chuyển đổi giữa xem hai cột và xem một cột để đọc thay đổi theo cách dễ nhìn nhất với mình. |
| Xem thay đổi (Diff) | Tô sáng cú pháp và làm nổi bật thay đổi trong dòng | Là người review, tôi muốn code được tô màu theo cú pháp và làm nổi bật đúng phần chữ bị đổi trong từng dòng để nhanh chóng thấy điều gì thực sự thay đổi. |
| Xem thay đổi (Diff) | Mở rộng ngữ cảnh quanh vùng thay đổi | Là người review, tôi muốn xem thêm các dòng code xung quanh phần thay đổi để hiểu bối cảnh mà không cần rời trang. |
| Xem thay đổi (Diff) | Ẩn/hiện khác biệt khoảng trắng | Là người review, tôi muốn ẩn các thay đổi chỉ về khoảng trắng để tập trung vào những thay đổi có ý nghĩa. |
| Xem thay đổi (Diff) | Điều hướng file và nhảy giữa các thay đổi | Là người review, tôi muốn nhanh chóng nhảy qua từng file và từng vùng thay đổi bằng thanh bên và phím tắt để review nhanh hơn. |
| Xem thay đổi (Diff) | Tìm kiếm và đánh dấu file đã xem | Là người review, tôi muốn tìm file theo tên và đánh dấu file "đã xem" để theo dõi tiến độ review của mình. |
| Xem thay đổi (Diff) | Duyệt theo danh sách commit | Là người review, tôi muốn xem danh sách các commit trong phạm vi so sánh để hiểu lịch sử thay đổi. |
| Xem thay đổi (Diff) | Tự phát hiện diff đã cũ | Là người review, tôi muốn được cảnh báo khi code đã thay đổi so với lúc mở để luôn xem đúng nội dung mới nhất. |
| Chỉnh sửa nhanh | Hoàn tác thay đổi theo file hoặc theo khối | Là lập trình viên, tôi muốn hoàn tác một file hoặc một khối thay đổi ngay trên trình duyệt để loại bỏ nhanh phần code không mong muốn. |
| Chỉnh sửa nhanh | Mở file trong trình soạn thảo | Là lập trình viên, tôi muốn nhảy thẳng từ diff tới đúng dòng trong trình soạn thảo để sửa code mà không phải tìm lại thủ công. |
| Bình luận & Review | Bình luận trên dòng, khoảng dòng hoặc toàn bộ diff | Là người review, tôi muốn để lại nhận xét trên từng dòng, một vùng chọn hay cho cả thay đổi để trao đổi đúng chỗ cần góp ý. |
| Bình luận & Review | Thảo luận theo luồng và trả lời | Là người review, tôi muốn trả lời nối tiếp trong một luồng bình luận để cuộc trao đổi có mạch rõ ràng. |
| Bình luận & Review | Đánh dấu bình luận đã xử lý hoặc bỏ qua | Là người review, tôi muốn đánh dấu một góp ý là đã sửa hoặc sẽ không sửa để quản lý được trạng thái review. |
| Bình luận & Review | Chỉnh sửa và xóa bình luận | Là người review, tôi muốn sửa hoặc xóa nhận xét của mình để giữ nội dung review luôn chính xác. |
| AI Code Review | Nhờ AI agent review và để lại nhận xét | Là lập trình viên, tôi muốn agent tự review diff và để lại các nhận xét theo mức độ ưu tiên để tôi phân loại và xử lý theo tầm quan trọng. |
| AI Code Review | Agent tự sửa code theo bình luận | Là lập trình viên, tôi muốn agent đọc các bình luận đang mở (của tôi hoặc của AI) và tự thực hiện các sửa đổi để tiết kiệm công sức. |
| Duyệt mã nguồn | Duyệt cây thư mục toàn dự án | Là lập trình viên, tôi muốn duyệt toàn bộ cây file của repo mà không cần có diff để khám phá cấu trúc dự án. |
| Duyệt mã nguồn | Đọc file với tô sáng cú pháp và xem trước | Là lập trình viên, tôi muốn đọc nội dung file kèm tô màu cú pháp và xem trước Markdown/SVG để hiểu code trực quan hơn. |
| Duyệt mã nguồn | Bình luận trên file/thư mục để agent xử lý | Là lập trình viên, tôi muốn để lại nhận xét trên bất kỳ file hoặc thư mục nào rồi nhờ agent thực hiện thay đổi tương ứng. |
| Hướng dẫn code (Tour) | Tạo tour hướng dẫn có chú giải từng bước | Là lập trình viên, tôi muốn agent dựng một lộ trình đi qua codebase với vùng code được làm nổi bật và giải thích chi tiết để hiểu cách hệ thống hoạt động. |
| Hướng dẫn code (Tour) | Đi qua từng bước với vùng code được làm nổi bật | Là người học, tôi muốn xem từng bước tour cùng đoạn code được tô sáng và có thể thu hẹp tiêu điểm vào một phần nhỏ để theo dõi các hàm lớn dễ dàng hơn. |
| Hướng dẫn code (Tour) | Tour review trước khi merge | Là người review, tôi muốn tạo một tour đi qua toàn bộ luồng thay đổi của một nhánh hoặc PR để đánh giá kỹ trước khi phê duyệt. |
| Học công nghệ | Lộ trình học theo dự án thực hành | Là người học, tôi muốn agent đóng vai gia sư, xây dự án nhỏ và ra bài tập cho tôi để học ngôn ngữ/công cụ/framework qua thực hành. |
| Học công nghệ | Lưu và tiếp tục tiến độ học | Là người học, tôi muốn tiến độ học được lưu lại để quay lại bất cứ lúc nào và học tiếp đúng chỗ đang dở. |
| GitHub PR | Kéo và review Pull Request tại máy | Là người review, tôi muốn tải một PR về xem diff so với nhánh gốc ngay trên máy để review thuận tiện hơn. |
| GitHub PR | Đồng bộ bình luận hai chiều với GitHub | Là người review, tôi muốn đẩy nhận xét của mình lên PR và kéo bình luận sẵn có về xem tại chỗ để review liền mạch với GitHub. |
| Quản lý phiên chạy | Chạy song song nhiều dự án | Là lập trình viên, tôi muốn mở Diffity cho nhiều repo cùng lúc, mỗi repo một cổng riêng, để làm việc đa dự án không xung đột. |
| Quản lý phiên chạy | Liệt kê, dừng và dọn dẹp các phiên đang chạy | Là lập trình viên, tôi muốn xem, dừng và xóa dữ liệu của các phiên đang chạy để quản lý gọn gàng các instance. |
| Quản lý phiên chạy | Tự kiểm tra môi trường và cập nhật phiên bản | Là lập trình viên, tôi muốn kiểm tra công cụ có chạy đúng không và cập nhật lên bản mới nhất bằng một lệnh để luôn dùng bản ổn định. |
| Tùy biến hiển thị | Chế độ sáng/tối và tùy chọn hiển thị | Là người dùng, tôi muốn chuyển đổi giao diện sáng/tối và tùy chỉnh cách hiển thị để làm việc thoải mái với mắt. |
| Tùy biến hiển thị | Phím tắt và bảng tra cứu phím tắt | Là người dùng thành thạo, tôi muốn thao tác bằng phím tắt và tra cứu chúng nhanh để review hiệu quả hơn. |

## Ghi chú tính năng chưa hoàn thiện

- **Mở file trong trình soạn thảo chỉ hỗ trợ VS Code.** Chức năng nhảy tới trình soạn thảo dựa hoàn toàn vào lệnh `code`; nếu máy không có VS Code thì nút này bị vô hiệu (endpoint trả về "No editor available"). Chưa hỗ trợ các trình soạn thảo khác.
- **Duyệt cây file chỉ đọc được trạng thái working tree hiện tại.** Chức năng duyệt mã nguồn không nhận tham số ref để duyệt theo một commit/nhánh khác (tham số ref bị bỏ qua trong xử lý), nên chỉ xem được ảnh chụp mã nguồn hiện tại.
- **Hoàn tác thay đổi bị giới hạn theo ngữ cảnh.** Khả năng hoàn tác file/khối chỉ khả dụng khi đang xem thay đổi trên working tree; khi so sánh commit/nhánh/tag đã hoàn tất thì không hoàn tác được.
- **Tour có trạng thái trung gian "đang dựng".** Một tour do agent tạo trải qua trạng thái "building" trước khi chuyển sang "ready"; nếu agent chưa đánh dấu hoàn tất, tour hiển thị ở dạng chưa sẵn sàng xem.
- **Đồng bộ GitHub yêu cầu điều kiện bên ngoài.** Các tính năng liên quan PR (kéo PR, đẩy/kéo bình luận) bắt buộc cài và đăng nhập GitHub CLI (`gh`), có remote GitHub hợp lệ, và repo cục bộ phải trùng repo của PR; thiếu bất kỳ điều kiện nào thì thao tác bị chặn.
- **Tính năng Học công nghệ chủ yếu do skill/agent điều khiển.** Lộ trình học được dẫn dắt bằng hướng dẫn cho agent (dựng dự án, ra bài, chấm bài) chứ không phải một module giao diện chuyên biệt; trải nghiệm phụ thuộc vào năng lực của agent đang dùng.
- **Cập nhật skill phải làm thủ công.** Khi bản phát hành mới thay đổi skill, người dùng được nhắc tự chạy lệnh cài lại skill (`npx skills add ...`); công cụ không tự động cập nhật skill kèm theo lệnh cập nhật phiên bản.
