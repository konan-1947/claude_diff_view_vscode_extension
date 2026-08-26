# Diff Tracker — Tổng hợp tính năng sản phẩm

> **Sản phẩm:** Diff Tracker là một extension cho VS Code dùng để "quay lại" (record) và theo dõi trực quan mọi thay đổi file trong workspace kể từ một thời điểm mốc, rồi cho phép xem lại, chấp nhận hoặc hoàn tác từng thay đổi.
>
> **Người dùng cuối:** Lập trình viên / người dùng VS Code muốn kiểm soát các chỉnh sửa (thủ công hoặc do công cụ/AI sinh ra) trong một phiên làm việc, độc lập với Git.
>
> **Cách đọc User Story:** Mỗi dòng theo góc nhìn người dùng cuối, dạng "Là [vai trò], tôi muốn [nhu cầu] để [giá trị]" — mô tả giá trị nhận được, không đề cập chi tiết kỹ thuật.

## Bảng tính năng

| Module | Feature | User Story |
|--------|---------|------------|
| Quay & theo dõi thay đổi | Bật/tắt chế độ ghi (recording) | Là lập trình viên, tôi muốn bật hoặc tắt chế độ ghi thay đổi bằng một thao tác để chủ động chọn thời điểm bắt đầu theo dõi công việc của mình. |
| Quay & theo dõi thay đổi | Thiết lập mốc so sánh toàn workspace | Là lập trình viên, tôi muốn hệ thống tự chụp trạng thái gốc của toàn bộ file khi bắt đầu ghi để mọi chỉnh sửa sau đó đều được so với một điểm mốc rõ ràng. |
| Quay & theo dõi thay đổi | Theo dõi cả file đang mở lẫn thay đổi bên ngoài | Là lập trình viên, tôi muốn nắm được cả những thay đổi xảy ra ngoài trình soạn thảo để không bỏ sót bất kỳ chỉnh sửa nào trong workspace. |
| Quay & theo dõi thay đổi | Nhận biết file mới, file bị xóa và file rỗng | Là lập trình viên, tôi muốn thấy rõ file nào được tạo mới hay bị xóa để có bức tranh đầy đủ về những gì đã thay đổi. |
| Quay & theo dõi thay đổi | Đặt lại mốc về trạng thái hiện tại | Là lập trình viên, tôi muốn xóa danh sách thay đổi và lấy trạng thái hiện tại làm mốc mới để bắt đầu theo dõi một giai đoạn công việc kế tiếp. |
| Bảng danh sách thay đổi | Cây file thay đổi theo thư mục | Là lập trình viên, tôi muốn xem toàn bộ file đã thay đổi được nhóm theo cấu trúc thư mục để dễ định vị và nắm tổng quan. |
| Bảng danh sách thay đổi | Huy hiệu đếm số file thay đổi | Là lập trình viên, tôi muốn nhìn thấy ngay số lượng file đang có thay đổi để biết mức độ chỉnh sửa của phiên làm việc. |
| Bảng danh sách thay đổi | Điều khiển ghi ngay trong bảng | Là lập trình viên, tôi muốn bắt đầu hoặc dừng ghi ngay trong bảng danh sách để thao tác nhanh mà không cần rời khỏi khu vực làm việc. |
| Bảng danh sách thay đổi | Mở nhanh file gốc và các chế độ xem | Là lập trình viên, tôi muốn mở nhanh file gốc hoặc các chế độ xem diff từ danh sách để chuyển đổi giữa các file thay đổi mà không mất thời gian. |
| Xem khác biệt (diff) | Chế độ xem inline trong editor | Là lập trình viên, tôi muốn xem trực tiếp phần thêm/xóa/sửa ngay trong nội dung file để hiểu thay đổi mà không cần chuyển cửa sổ. |
| Xem khác biệt (diff) | Chế độ xem cạnh nhau (bản gốc ↔ hiện tại) | Là lập trình viên, tôi muốn so sánh song song bản gốc và bản hiện tại để dễ đối chiếu từng dòng. |
| Xem khác biệt (diff) | Bảng diff tương tác kiểu Cursor | Là lập trình viên, tôi muốn xem một bảng diff hiện đại với nút chấp nhận/hoàn tác nổi bên cạnh từng thay đổi để duyệt thay đổi trực quan và nhanh chóng. |
| Xem khác biệt (diff) | Tùy biến hiển thị bảng diff | Là lập trình viên, tôi muốn chuyển đổi giữa xem gộp/tách đôi, bật xuống dòng và mở rộng phần không đổi để đọc diff theo cách phù hợp với mình. |
| Xem khác biệt (diff) | Tô sáng thay đổi ở cấp dòng và cấp từ | Là lập trình viên, tôi muốn thấy chính xác từ nào trong một dòng bị thay đổi để nắm bản chất chỉnh sửa mà không phải dò từng ký tự. |
| Xem khác biệt (diff) | Xem chi tiết thay đổi khi rê chuột | Là lập trình viên, tôi muốn rê chuột lên dòng đã đổi để xem nội dung cũ/mới hoặc nội dung đã bị xóa mà không cần mở view riêng. |
| Xem khác biệt (diff) | Chọn chế độ mở mặc định cho file thay đổi | Là lập trình viên, tôi muốn chọn sẵn cách mở diff khi bấm vào một file để trải nghiệm luôn nhất quán theo ý mình. |
| Chấp nhận & hoàn tác | Chấp nhận hoặc hoàn tác từng khối thay đổi | Là lập trình viên, tôi muốn giữ lại hoặc hủy bỏ từng đoạn thay đổi riêng lẻ để kiểm soát chính xác nội dung nào được giữ. |
| Chấp nhận & hoàn tác | Chấp nhận hoặc hoàn tác toàn bộ một file | Là lập trình viên, tôi muốn giữ hoặc trả toàn bộ một file về bản gốc chỉ với một thao tác để xử lý nhanh những file đã xem xong. |
| Chấp nhận & hoàn tác | Chấp nhận hoặc hoàn tác toàn bộ workspace | Là lập trình viên, tôi muốn giữ hoặc hoàn tác tất cả thay đổi cùng lúc để kết thúc gọn gàng một đợt rà soát. |
| Chấp nhận & hoàn tác | Khôi phục lại cả file đã bị xóa | Là lập trình viên, tôi muốn hoàn tác cả những file đã bị xóa để lấy lại nội dung khi cần. |
| Điều hướng thay đổi | Nút hành động nội tuyến trên khối thay đổi | Là lập trình viên, tôi muốn thấy nút hoàn tác/giữ ngay phía trên mỗi khối thay đổi trong editor để xử lý mà không rời file. |
| Điều hướng thay đổi | Nhảy giữa các khối thay đổi | Là lập trình viên, tôi muốn di chuyển tới khối thay đổi trước/sau và biết mình đang ở khối thứ mấy để rà soát tuần tự cả file. |
| Điều hướng thay đổi | Đánh dấu và đếm dòng bị xóa | Là lập trình viên, tôi muốn nhìn thấy chỉ báo về những dòng đã bị xóa để không bỏ sót phần nội dung không còn hiển thị trong file. |
| Cấu hình & lọc | Bảng tùy chỉnh hiển thị nhanh | Là lập trình viên, tôi muốn bật/tắt nhanh các tùy chọn tô sáng và chỉ báo ngay trong thanh bên để điều chỉnh giao diện theo nhu cầu. |
| Cấu hình & lọc | Quản lý danh sách bỏ qua khi theo dõi | Là lập trình viên, tôi muốn khai báo những file/thư mục cần bỏ qua để hệ thống chỉ theo dõi những thay đổi thực sự quan trọng. |
| Cấu hình & lọc | Tôn trọng quy tắc .gitignore và loại trừ của VS Code | Là lập trình viên, tôi muốn hệ thống tự bỏ qua các file mà dự án đã loại trừ để danh sách thay đổi luôn sạch và đúng trọng tâm. |
| Cấu hình & lọc | Kiểm thử một đường dẫn có bị bỏ qua hay không | Là lập trình viên, tôi muốn thử xem một đường dẫn cụ thể có bị lọc không để kiểm tra quy tắc bỏ qua của mình đang hoạt động đúng. |
| Trạng thái & thông báo | Chỉ báo trạng thái ghi trên thanh trạng thái | Là lập trình viên, tôi muốn luôn thấy hệ thống đang ghi hay không (và mốc đã sẵn sàng chưa) để yên tâm rằng thay đổi của mình đang được theo dõi. |
| Trạng thái & thông báo | Phím tắt bật/tắt ghi nhanh | Là lập trình viên, tôi muốn bật/tắt ghi bằng phím tắt để chuyển trạng thái tức thì trong lúc tập trung làm việc. |

## Ghi chú tính năng chưa hoàn thiện

- **Thay đổi kiểu xuống dòng (CRLF/LF/CR) bị bỏ qua:** Nếu một file chỉ khác nhau ở kiểu ký tự xuống dòng (không đổi nội dung logic), hệ thống cố tình coi như *không có thay đổi* và không hiển thị trong danh sách (đã được ghi rõ trong mục "Known Issues" của README). Đây là giới hạn có chủ đích nhưng khiến một loại thay đổi thật sự không được theo dõi.
- **Giới hạn kích thước và loại file được theo dõi:** File lớn hơn 5 MB và file bị nhận diện là nhị phân (binary) sẽ bị bỏ qua hoàn toàn khỏi việc chụp mốc và theo dõi. Việc nhận diện nhị phân dựa trên phương pháp lấy mẫu byte (tỷ lệ ký tự không in được > 30%), nên có thể phân loại nhầm với một số định dạng văn bản đặc biệt.
- **Phụ thuộc vào giới hạn của trình theo dõi file hệ điều hành:** Khi hệ thống chạm giới hạn số lượng file watcher (ví dụ lỗi ENOSPC), tính năng theo dõi thay đổi bên ngoài sẽ *tự động hạ cấp* xuống chỉ theo dõi các file đang mở, kèm cảnh báo. Ở trạng thái này, các thay đổi bên ngoài trình soạn thảo sẽ không được ghi nhận.
- **Nhãn màu tô sáng dòng sửa chưa khớp mô tả:** Phần cấu hình mô tả dòng bị sửa được tô nền màu xanh dương, nhưng cài đặt thực tế trong code dùng nền vàng/cam. Đây là điểm chưa nhất quán giữa mô tả và hành vi.
- **Phím tắt hiển thị trên nút Undo/Keep của bảng diff mang tính trang trí:** Các nhãn phím tắt (ví dụ ⌘N, ⌘Y) hiển thị cạnh nút trong bảng diff tương tác chỉ là chữ tĩnh, chưa được gắn với một phím tắt thật sự hoạt động.
- **Một số lệnh nội bộ không xuất hiện trong giao diện chính:** Các lệnh như "Show Diffs" (chỉ hiện thông báo áp dụng tô sáng) hay các biến thể mở diff cho file đang mở tồn tại trong bảng lệnh nhưng không phải là luồng chính mà người dùng thường thao tác qua nút bấm.
