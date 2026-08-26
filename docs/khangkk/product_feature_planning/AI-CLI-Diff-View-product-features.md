# AI CLI Diff View — Tổng hợp tính năng sản phẩm

> **AI CLI Diff View** là một extension cho VS Code giúp *duyệt lại từng thay đổi file mà các AI CLI agent (Claude Code, Codex, Qwen…) ghi ra*, bằng một trình diff kiểu Cursor render ngay trong tab — chấp nhận / loại bỏ theo từng khối thay đổi trước khi giữ chúng lại.
>
> **Người dùng cuối** là lập trình viên (và "vibe coder") dùng các trợ lý AI dạng CLI vốn không có IDE riêng, cần một nơi trong VS Code để soi, kiểm soát và giữ/bỏ những gì công cụ đã viết vào file. Extension còn kèm terminal nhúng để chạy chính các CLI đó ngay bên cạnh.
>
> **Cách đọc User Story:** mỗi dòng theo mẫu "Là [vai trò], tôi muốn [nhu cầu] để [giá trị]", viết theo góc nhìn người dùng cuối, không đề cập chi tiết kỹ thuật.

## Bảng tính năng

| Module | Feature | User Story |
| ------ | ------- | ---------- |
| Phát hiện thay đổi tự động | Bắt mọi thay đổi file từ công cụ ngoài | Là lập trình viên dùng AI CLI, tôi muốn mọi thay đổi file do công cụ ghi ra được tự động đưa vào chế độ duyệt để không bỏ sót bất kỳ chỉnh sửa nào. |
| Phát hiện thay đổi tự động | Lập ảnh chụp gốc để so sánh chính xác | Là lập trình viên, tôi muốn hệ thống ghi nhớ nội dung file trước khi bị sửa để thay đổi luôn được đối chiếu với đúng mốc gốc chứ không bị coi là file mới. |
| Phát hiện thay đổi tự động | Nhận biết file mới tạo và file bị xóa | Là lập trình viên, tôi muốn thấy rõ khi công cụ tạo file mới hay xóa file để có thể duyệt và khôi phục lại nếu không mong muốn. |
| Phát hiện thay đổi tự động | Không nhiễu bởi thao tác hàng loạt của Git | Là lập trình viên, tôi muốn extension nhận ra một đợt ghi hàng loạt là do chuyển nhánh/checkout để không mở ra hàng chục tab diff giả. |
| Duyệt thay đổi theo khối | Trình diff hiện đại ngay trong tab | Là lập trình viên, tôi muốn xem thay đổi trong một khung diff có tô màu và tô sáng đúng phần chữ bị đổi trong dòng để nắm nhanh bản chất chỉnh sửa. |
| Duyệt thay đổi theo khối | Chấp nhận / Loại bỏ từng khối thay đổi | Là lập trình viên, tôi muốn giữ hoặc bỏ từng khối thay đổi riêng lẻ để kiểm soát chính xác nội dung nào được giữ lại. |
| Duyệt thay đổi theo khối | Chấp nhận / Loại bỏ toàn bộ một file | Là lập trình viên, tôi muốn giữ hoặc trả toàn bộ một file về bản gốc chỉ với một thao tác để xử lý nhanh file đã xem xong. |
| Duyệt thay đổi theo khối | Nhảy giữa các khối và biết mình ở khối thứ mấy | Là lập trình viên, tôi muốn di chuyển tới khối thay đổi trước/sau và thấy chỉ số "khối hiện tại / tổng số" để rà soát tuần tự cả file. |
| Duyệt thay đổi theo khối | Sửa trực tiếp bản mới ngay trong khung diff | Là lập trình viên, tôi muốn gõ chỉnh lại nội dung do AI viết ngay trong khung duyệt để tinh chỉnh trước khi giữ mà không phải mở file riêng. |
| Duyệt thay đổi theo khối | Chấp nhận tất cả thay đổi trên mọi file | Là lập trình viên, tôi muốn giữ lại toàn bộ thay đổi ở tất cả file cùng lúc để kết thúc gọn một đợt rà soát khi đã tin tưởng kết quả. |
| Điều hướng file đang chờ | Chuyển nhanh giữa các file đang chờ duyệt | Là lập trình viên, tôi muốn nhảy tới file được sửa trước/sau bằng phím tắt để duyệt liền mạch qua nhiều file mà không phải tìm thủ công. |
| Điều hướng file đang chờ | Tự mở file dưới dạng diff khi bấm vào | Là lập trình viên, tôi muốn mỗi file đang chờ luôn mở ra ở chế độ duyệt thay vì editor thường để trải nghiệm review luôn nhất quán. |
| Bảng file đang chờ | Cây file thay đổi kèm số lượng | Là lập trình viên, tôi muốn xem tất cả file đang chờ duyệt gom theo thư mục kèm huy hiệu đếm để nắm toàn cảnh khối lượng cần soi. |
| Bảng file đang chờ | Mở đúng file cần duyệt từ danh sách | Là lập trình viên, tôi muốn bấm một file trong danh sách để mở thẳng phần thay đổi của nó, tiết kiệm thời gian tìm kiếm. |
| Bảng file đang chờ | Trạng thái phiên chạy ngay trong bảng | Là lập trình viên, tôi muốn thấy phiên AI đang chạy, đã xong hay gặp lỗi ngay trong bảng để biết khi nào có kết quả để duyệt. |
| Terminal tích hợp | Chạy AI CLI trong terminal nhúng | Là lập trình viên, tôi muốn mở terminal thật ngay trong VS Code để chạy trợ lý AI ngay bên cạnh chỗ duyệt thay đổi. |
| Terminal tích hợp | Nhiều phiên terminal, khởi động lại khi cần | Là lập trình viên, tôi muốn mở nhiều tab terminal và khởi động lại một phiên bị treo để làm việc linh hoạt không mất mạch. |
| Terminal tích hợp | Tùy biến font, cỡ chữ, chủ đề và con trỏ | Là lập trình viên, tôi muốn chỉnh font, cỡ chữ, bảng màu và kiểu con trỏ của terminal để đọc thoải mái theo sở thích. |
| Terminal tích hợp | Cài đặt font gợi ý bằng một thao tác | Là lập trình viên, tôi muốn cài nhanh một font terminal được đề xuất ngay trong ứng dụng để hiển thị đẹp mà không phải tự tải và cài. |
| Phiên AI dựng sẵn | Khởi động phiên Claude từ trong IDE | Là lập trình viên, tôi muốn nhập một câu lệnh và để trợ lý tự chạy rồi mở diff kết quả để giao việc nhanh mà không rời VS Code. |
| Tích hợp Git & nhánh | Tự dọn thay đổi đang chờ khi chuyển nhánh | Là lập trình viên, tôi muốn thay đổi đang chờ được tự dọn khi tôi chuyển nhánh để không nhầm thay đổi của nhánh này sang nhánh khác. |
| Tích hợp Git & nhánh | Không xóa nhầm khi pull/merge/rebase cùng nhánh | Là lập trình viên, tôi muốn các thao tác pull/merge/rebase trên cùng nhánh không xóa mất danh sách đang duyệt để không phải làm lại từ đầu. |
| Lọc & phạm vi theo dõi | Bỏ qua thư mục sinh tự động và file nhị phân | Là lập trình viên, tôi muốn extension tự bỏ qua các thư mục build, phụ thuộc và file nhị phân để danh sách duyệt chỉ còn những gì đáng review. |
| Lọc & phạm vi theo dõi | Tự khai báo loại file được coi là văn bản | Là lập trình viên, tôi muốn tự thêm phần mở rộng, tên file hay mẫu tên riêng để những loại file đặc thù của tôi cũng được đưa ra duyệt. |
| Lọc & phạm vi theo dõi | Bỏ qua file quá lớn để tránh treo máy | Là lập trình viên, tôi muốn tự đặt ngưỡng số dòng để file quá lớn không được mở diff, tránh làm trình soạn thảo bị khựng. |
| Cài đặt & cá nhân hóa | Bảng cài đặt tập trung ngay trong panel | Là lập trình viên, tôi muốn chỉnh mọi tùy chọn ở một bảng cài đặt rõ ràng để dễ điều chỉnh theo ý mình. |
| Cài đặt & cá nhân hóa | Âm báo khi trợ lý xong việc hoặc cần trả lời | Là lập trình viên, tôi muốn nghe tiếng báo khi trợ lý AI hoàn thành lượt hoặc cần tôi phản hồi để không phải ngồi canh màn hình. |
| Cài đặt & cá nhân hóa | Màn hình giới thiệu cho người mới | Là người dùng lần đầu, tôi muốn có phần giới thiệu ngắn về cách extension hoạt động để bắt đầu dùng nhanh. |
| Lưu trạng thái bền vững | Giữ nguyên danh sách duyệt sau khi khởi động lại | Là lập trình viên, tôi muốn các thay đổi đang chờ duyệt vẫn còn sau khi đóng mở lại VS Code để không mất tiến độ rà soát. |

## Ghi chú tính năng chưa hoàn thiện

- **Phiên AI dựng sẵn chỉ hỗ trợ Claude.** Tuy tài liệu nói hỗ trợ Claude/Codex/Qwen, phần "khởi động phiên trong IDE" chỉ dò và chạy được `claude` trên PATH; Codex và Qwen chỉ được duyệt gián tiếp qua cơ chế theo dõi file chứ không khởi chạy được từ nút.
- **Không tôn trọng `.gitignore` của dự án.** Việc loại trừ chỉ dựa trên một danh sách thư mục cố định (node_modules, dist, .git…) và quy tắc nhận diện file văn bản; các mẫu trong `.gitignore` hay `files.exclude` của VS Code không được đọc, nên file mà dự án đã bỏ qua vẫn có thể bị đưa ra duyệt.
- **Âm báo chỉ chạy trên Windows.** Tính năng phát âm thanh khi trợ lý xong việc chỉ hoạt động trên Windows (dùng PowerShell) và chỉ áp cho Claude — người dùng macOS/Linux hoặc CLI khác không có.
- **Cài đặt font chỉ có sẵn cho một số font.** Nút cài font gợi ý chỉ hoạt động với các font đã đăng ký sẵn trình cài; font khác báo "chưa có trình cài".
- **Ưu tiên workspace đầu tiên cho một số luồng.** Việc chạy terminal và khởi động phiên AI đều lấy thư mục gốc đầu tiên của workspace; với workspace nhiều thư mục gốc, các phần này không nhắm tới các thư mục còn lại.
- **Chỉ hỗ trợ file văn bản UTF-8.** File không đọc được dưới dạng UTF-8 (ảnh, nhị phân…) bị bỏ qua khi lập mốc và khi so sánh, nên thay đổi trên chúng không được theo dõi.
- **Xác nhận chuyển nhánh dựa trên theo dõi tệp con trỏ và reflog.** Phát hiện chuyển nhánh/pull/rebase dựa vào giám sát `.git/HEAD` và đọc reflog; tài liệu ghi rõ cơ chế xác nhận sớm bằng `.git/index` vẫn là một khoảng trống chưa làm.
- **Trình duyệt diff mặc định chỉ ở chế độ nội tuyến (inline).** Chưa có tùy chọn chuyển sang xem cạnh nhau (split) — một chế độ mà nhiều công cụ cùng loại đều có.

---

# Đề xuất cải thiện — so sánh với 5 sản phẩm tham chiếu

So sánh AI CLI Diff View với **ClaudeCodeExtension**, **Diffity**, **Diff Tracker**, **hunkwise** và **Nimbalyst**. Chỉ chọn những tính năng phù hợp với định vị cốt lõi của repo (duyệt thay đổi AI trong VS Code) và với người dùng là **lập trình viên / vibe coder**. Bỏ qua các nhóm lệch định vị (cộng tác nhóm, task tracker, học công nghệ, ứng dụng di động, worktree, giọng nói…).

### P0 — Must have (lấp lỗ hổng cốt lõi của trải nghiệm duyệt)

| Tính năng đề xuất | Học từ | Vì sao cần cho repo này |
| --- | --- | --- |
| **Chế độ xem diff cạnh nhau (split) song song với inline** | Diffity, Diff Tracker, hunkwise | Repo hiện chỉ render diff nội tuyến; với thay đổi lớn, xem hai cột giúp đối chiếu gốc ↔ mới dễ hơn nhiều. Là kỳ vọng mặc định của mọi công cụ diff. |
| **Tôn trọng `.gitignore` và `files.exclude`** | Diff Tracker, hunkwise | Hiện chỉ loại trừ theo danh sách cứng nên file dự án đã bỏ qua vẫn lọt vào danh sách duyệt, gây nhiễu. Đây là kỳ vọng nền tảng của lập trình viên. |
| **Bật/tắt theo dõi & đặt lại mốc gốc theo phiên làm việc** | Diff Tracker, hunkwise | Extension hiện luôn bật từ lúc khởi động, không có cách "bắt đầu theo dõi từ bây giờ" hay dọn mốc để mở một đợt việc mới — một control cơ bản để kiểm soát phạm vi review. |
| **Hỗ trợ workspace nhiều thư mục gốc** | (khoảng trống nội tại) | Terminal và phiên AI hiện chỉ nhắm thư mục gốc đầu tiên; vibe coder hay mở monorepo/multi-root nên dễ mất thay đổi ở các gốc còn lại. |

### P1 — Should have (nâng chất lượng review và mở rộng agent)

| Tính năng đề xuất | Học từ | Vì sao cần cho repo này |
| --- | --- | --- |
| **Khởi động phiên dựng sẵn cho nhiều agent (Codex, Qwen…)** | ClaudeCodeExtension, Nimbalyst | Nút khởi động hiện chỉ chạy Claude dù cơ chế theo dõi đã agent-agnostic; mở rộng launcher giúp đúng với định vị "any AI CLI". |
| **Cảnh báo diff đã cũ / file đổi bên dưới** | Diffity | Khi file bị ghi lại trong lúc đang duyệt, người dùng cần được báo để không chấp nhận nhầm nội dung cũ. |
| **Tìm kiếm file và đánh dấu "đã xem" trong danh sách chờ** | Diffity | Khi AI sửa hàng chục file, khả năng lọc theo tên và đánh dấu đã review giúp theo dõi tiến độ. |
| **Bỏ qua khác biệt chỉ ở khoảng trắng** | Diffity | Giúp tập trung vào thay đổi có ý nghĩa, giảm nhiễu khi formatter chạy kèm. |
| **Tự sinh commit message từ thay đổi đã chấp nhận** | ClaudeCodeExtension, Nimbalyst | Rất hợp vibe coder: sau khi giữ lại thay đổi thì có sẵn message để commit nhanh. |
| **Âm báo & thông báo đa nền tảng (macOS/Linux)** | Nimbalyst, ClaudeCodeExtension | Tính năng âm báo hiện chỉ chạy Windows; hoàn thiện cho các nền tảng còn lại. |
| **Chỉ báo trạng thái ở thanh trạng thái + phím tắt bật/tắt** | Diff Tracker | Tăng khả năng nhận biết đang theo dõi/đang có bao nhiêu file chờ mà không phải mở panel. |

### P2 — Nice to have (bổ trợ, giá trị thấp hơn hoặc lệch nhẹ định vị)

| Tính năng đề xuất | Học từ | Ghi chú |
| --- | --- | --- |
| **Bình luận / ghi chú trên dòng để agent xử lý lại** | Diffity, Nimbalyst | Biến review một chiều thành vòng lặp "góp ý → AI sửa"; giá trị cao nhưng là phần mở rộng lớn. |
| **AI code review tự động để lại nhận xét theo mức ưu tiên** | Diffity | Phù hợp vibe coder muốn "soát hộ", nhưng vượt ra ngoài lõi duyệt thủ công hiện tại. |
| **Theo dõi mức dùng token / chi phí mỗi lượt** | ClaudeCodeExtension, Nimbalyst | Hữu ích khi chạy phiên dựng sẵn nhiều, nhưng phụ thuộc từng agent. |
| **Xem/chỉnh tùy chọn hiển thị diff (word wrap, mở rộng ngữ cảnh, minimap)** | Diff Tracker, Diffity | Tinh chỉnh nhỏ cho trải nghiệm đọc; Monaco đã hỗ trợ sẵn phần lớn nên chi phí thấp. |
| **Bảng tra cứu phím tắt** | Diffity, Nimbalyst | Giúp khám phá các phím tắt sẵn có (duyệt khối, chuyển file, accept/revert). |
| **Đồng bộ chủ đề diff theo theme VS Code + preset màu** | ClaudeCodeExtension | Diff đã theo theme; thêm preset là bổ trợ thẩm mỹ. |
