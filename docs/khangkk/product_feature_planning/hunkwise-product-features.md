# hunkwise — Tổng hợp tính năng sản phẩm

> **hunkwise** là một extension cho VS Code mang khả năng duyệt (review) từng khối thay đổi — Chấp nhận / Loại bỏ theo từng "hunk" — cho *mọi* thay đổi file đến từ bên ngoài (công cụ AI như Claude Code/OpenCode, script, chỉnh sửa tay…).
>
> **Người dùng cuối** là lập trình viên dùng các trợ lý AI dạng CLI/plugin vốn không có IDE riêng, cần một nơi trong VS Code để soi và kiểm soát những gì công cụ đã ghi vào file trước khi giữ lại.
>
> **Cách đọc User Story:** mỗi dòng theo mẫu "Là [vai trò], tôi muốn [nhu cầu] để [giá trị]", viết theo góc nhìn người dùng cuối, không đề cập chi tiết kỹ thuật.

## Bảng tính năng

| Module | Feature | User Story |
| ------ | ------- | ---------- |
| Bật/Tắt theo dự án | Bật theo dõi cho workspace | Là lập trình viên, tôi muốn bật tính năng theo dõi thay đổi cho dự án hiện tại chỉ bằng một cú nhấp để bắt đầu soi các thay đổi mà không phải cấu hình phức tạp. |
| Bật/Tắt theo dự án | Lập ảnh chụp gốc toàn bộ workspace | Là lập trình viên, tôi muốn hệ thống ghi nhận trạng thái ban đầu của mọi file khi bật để mọi thay đổi phát sinh sau đó đều được so sánh chính xác với mốc gốc. |
| Bật/Tắt theo dự án | Tắt và xóa trạng thái theo dõi | Là lập trình viên, tôi muốn tắt tính năng và dọn sạch dữ liệu theo dõi của dự án khi không cần nữa để không để lại rác trong dự án. |
| Phát hiện thay đổi tự động | Bắt thay đổi từ mọi nguồn | Là lập trình viên dùng công cụ AI, tôi muốn mọi thay đổi file do công cụ ngoài ghi vào được tự động đưa vào chế độ duyệt để không bỏ sót bất kỳ chỉnh sửa nào. |
| Phát hiện thay đổi tự động | Phân biệt chỉnh sửa tay và thay đổi từ công cụ | Là lập trình viên, tôi muốn những chỉnh sửa tôi tự gõ được bỏ qua còn thay đổi do công cụ mới hiển thị để không bị làm phiền bởi chính thao tác của mình. |
| Duyệt theo từng hunk trong trình soạn thảo | Nút Chấp nhận / Loại bỏ ngay trên từng khối thay đổi | Là lập trình viên, tôi muốn duyệt từng khối thay đổi ngay tại nơi nó xuất hiện trong file để quyết định giữ hay bỏ mà không rời khỏi ngữ cảnh code. |
| Duyệt theo từng hunk trong trình soạn thảo | Tô màu dòng thêm (xanh) và dòng xóa (đỏ) | Là lập trình viên, tôi muốn nhìn thấy rõ dòng nào được thêm và dòng nào bị xóa để nắm nhanh bản chất của thay đổi. |
| Duyệt theo từng hunk trong trình soạn thảo | Tự động nhảy tới hunk kế tiếp sau mỗi thao tác | Là lập trình viên, tôi muốn con trỏ tự chuyển đến khối thay đổi tiếp theo sau khi tôi xử lý một khối để duyệt liên tục một mạch. |
| Bảng điều khiển tổng hợp | Danh sách toàn bộ file đang chờ duyệt | Là lập trình viên, tôi muốn xem tất cả file có thay đổi đang chờ ở một chỗ để nắm được toàn cảnh cần soi. |
| Bảng điều khiển tổng hợp | Thống kê số dòng thêm/xóa theo file và tổng thể | Là lập trình viên, tôi muốn thấy nhanh số dòng được thêm và bị xóa của từng file lẫn toàn dự án để ước lượng mức độ thay đổi. |
| Bảng điều khiển tổng hợp | Chấp nhận/Loại bỏ theo hunk, theo file, hoặc tất cả | Là lập trình viên, tôi muốn xử lý thay đổi ở nhiều cấp độ — từng khối, cả file, hay toàn bộ — để làm việc với tốc độ phù hợp từng tình huống. |
| Bảng điều khiển tổng hợp | Mở file và nhảy thẳng tới khối thay đổi | Là lập trình viên, tôi muốn nhấp vào một file hoặc một khối trong bảng để mở đúng vị trí thay đổi trong trình soạn thảo, tiết kiệm thời gian tìm kiếm. |
| Chế độ xem so sánh (Diff) | Mở diff cạnh nhau giữa bản gốc và bản hiện tại | Là lập trình viên, tôi muốn tùy chọn xem thay đổi dưới dạng so sánh song song thay vì trực tiếp trên file để đối chiếu bản gốc và bản mới rõ ràng hơn. |
| Chế độ xem so sánh (Diff) | Nút Chấp nhận/Loại bỏ trong khung diff | Là lập trình viên, tôi muốn thao tác giữ hay bỏ ngay trong màn hình so sánh để không phải quay lại trình soạn thảo thường. |
| File mới / xóa / đổi tên | Theo dõi và duyệt file mới tạo | Là lập trình viên, tôi muốn file mới do công cụ tạo ra cũng được đánh dấu để duyệt để có thể chấp nhận hoặc loại bỏ nguyên file. |
| File mới / xóa / đổi tên | Duyệt và khôi phục file bị xóa ngoài ý muốn | Là lập trình viên, tôi muốn khi một file bị công cụ xóa vẫn xem được nội dung gốc và khôi phục lại được để tránh mất mát ngoài ý muốn. |
| File mới / xóa / đổi tên | Giữ nguyên mốc gốc khi đổi tên/di chuyển | Là lập trình viên, tôi muốn việc đổi tên hay di chuyển file không tạo ra thay đổi giả để danh sách duyệt luôn phản ánh đúng thực tế. |
| Loại trừ file khỏi theo dõi | Tôn trọng quy tắc .gitignore | Là lập trình viên, tôi muốn những file dự án đã bỏ qua trong .gitignore cũng không bị theo dõi để tránh nhiễu từ file build hay phụ thuộc. |
| Loại trừ file khỏi theo dõi | Tự định nghĩa mẫu loại trừ riêng | Là lập trình viên, tôi muốn tự thêm/bớt các mẫu file cần loại trừ để kiểm soát chính xác phạm vi được theo dõi. |
| Loại trừ file khỏi theo dõi | Tự đồng bộ khi quy tắc loại trừ thay đổi | Là lập trình viên, tôi muốn khi tôi đổi quy tắc loại trừ thì các file bị ảnh hưởng tự được thêm vào hoặc gỡ ra để không cần bật/tắt lại thủ công. |
| Tích hợp Git & nhánh | Tự dọn hunk khi chuyển nhánh | Là lập trình viên, tôi muốn tùy chọn tự xóa các thay đổi đang chờ mỗi khi chuyển nhánh để không bị nhầm thay đổi của nhánh này sang nhánh khác. |
| Tích hợp Git & nhánh | Tự thêm thư mục nội bộ vào .gitignore | Là lập trình viên, tôi muốn dữ liệu nội bộ của công cụ không lọt vào commit của tôi để giữ lịch sử Git sạch sẽ. |
| Lưu trạng thái bền vững | Khôi phục trạng thái sau khi khởi động lại | Là lập trình viên, tôi muốn các thay đổi đang chờ duyệt vẫn còn nguyên sau khi đóng mở lại VS Code để không phải bắt đầu lại từ đầu. |
| Cài đặt & Cá nhân hóa | Bảng cài đặt tập trung | Là lập trình viên, tôi muốn chỉnh các tùy chọn của tính năng ở một màn hình cài đặt rõ ràng để dễ điều chỉnh theo ý mình. |
| Cài đặt & Cá nhân hóa | Bật/tắt hiển thị trực tiếp trong trình soạn thảo | Là lập trình viên, tôi muốn có thể tắt các nút và tô màu ngay trên file khi thấy vướng để giữ trình soạn thảo gọn gàng và vẫn duyệt qua bảng điều khiển. |
| Cài đặt & Cá nhân hóa | Câu trích dẫn xoay vòng ở màn hình chờ | Là lập trình viên, tôi muốn màn hình khi không có thay đổi hiển thị các câu ngắn thú vị và tự chỉnh được nhịp xoay để trải nghiệm nhẹ nhàng, dễ chịu. |
| Cài đặt & Phân phối | Cài đặt qua quy trình hướng dẫn sẵn | Là lập trình viên, tôi muốn được hướng dẫn cài đặt tự động theo từng hệ điều hành và loại bản VS Code để đưa extension vào dùng dù nó không có trên marketplace. |

## Ghi chú tính năng chưa hoàn thiện

- **Phụ thuộc API thử nghiệm (proposed API `editorInsets`), không cài được từ Marketplace.** Toàn bộ trải nghiệm nút inline trong trình soạn thảo dựa vào một API còn ở trạng thái thử nghiệm của VS Code; extension phải cài thủ công và bật cờ proposed API, không phân phối qua Marketplace được.
- **Không hoạt động trên VS Code bản stable ở một số bản Linux.** Theo FAQ và skill cài đặt (issue #20), trên một số distro Linux (ví dụ CachyOS) API `editorInsets` không có ở bản stable; người dùng buộc phải chuyển sang VS Code Insiders. Đây là giới hạn nền tảng chưa được khắc phục.
- **Chỉ hỗ trợ file văn bản (UTF-8), bỏ qua file nhị phân.** Khi lập ảnh chụp gốc và khi đọc thay đổi, file không đọc được dưới dạng UTF-8 (ảnh, file nhị phân…) bị âm thầm bỏ qua, nên thay đổi trên các file này không được theo dõi hay duyệt.
- **Chỉ theo dõi thư mục workspace đầu tiên.** Mã nguồn luôn lấy `workspaceFolders[0]`; với workspace nhiều thư mục gốc (multi-root), các thư mục còn lại không được theo dõi.
- **File vừa được "bỏ loại trừ" hoặc chưa kịp lập mốc bị âm thầm nhận làm bản gốc.** Khi quy tắc loại trừ vừa đổi, hoặc trong lúc đang khởi tạo mốc gốc, một số file mới xuất hiện được lặng lẽ nhận nội dung hiện tại làm bản gốc thay vì hiển thị như "file mới" — chủ ý để tránh báo động giả, nhưng đồng nghĩa các thay đổi trong khoảng thời gian đó có thể không được đưa ra duyệt.
- **Phát hiện chuyển nhánh dựa trên cơ chế thăm dò định kỳ.** Việc "tự dọn hunk khi chuyển nhánh" theo dõi thay đổi nhánh bằng cách đọc lại tệp con trỏ nhánh theo chu kỳ và giám sát file; trên macOS cơ chế giám sát có thể bị vô hiệu khi Git thay file, phải tạo lại watcher — là giải pháp mang tính bù trừ chứ chưa phải sự kiện chính thống.
- **Bảng cài đặt có nhiều tùy chọn hơn tài liệu mô tả.** README chỉ liệt kê 3 tùy chọn, trong khi thực tế còn có "mở diff editor từ bảng", "hiển thị trực tiếp trong trình soạn thảo" và "nhịp xoay câu trích dẫn" — tài liệu người dùng chưa cập nhật đầy đủ.
- **Tồn tại hàm rỗng giữ lại cho tương thích.** Hàm hủy tác vụ lưu đang chờ (`cancelPendingSave`) hiện là no-op, chỉ giữ lại cho tương thích API — dấu hiệu còn code chết sau khi đổi sang cơ chế hàng đợi Git.
