# Nimbalyst — Bảng tổng hợp tính năng sản phẩm

> **Nimbalyst là gì:** một không gian làm việc trực quan, mã nguồn mở, chạy cục bộ trên máy, giúp con người cộng tác *bằng hình ảnh* với các agent lập trình (Codex, Claude Code, OpenCode, Copilot) trên tài liệu, mockup, sơ đồ, dữ liệu, mã nguồn, phiên làm việc và task.
> **Người dùng cuối:** nhà phát triển, quản lý sản phẩm, nhà thiết kế và người xây dựng sản phẩm nói chung — làm việc trên desktop (macOS/Windows/Linux) và có ứng dụng di động (iOS/Android) đi kèm.
> **Cách đọc:** mỗi User Story theo mẫu "Là [vai trò], tôi muốn [nhu cầu] để [giá trị]", viết theo góc nhìn người dùng cuối, không đề cập chi tiết kỹ thuật.

## Bảng tính năng

| Module | Feature | User Story |
| --- | --- | --- |
| **Agent lập trình** | Nhiều nhà cung cấp agent | Là nhà phát triển, tôi muốn chọn giữa nhiều agent lập trình (Codex, Claude Code, OpenCode, Copilot) để dùng công cụ phù hợp nhất với từng công việc. |
| **Agent lập trình** | Chọn mô hình linh hoạt | Là nhà phát triển, tôi muốn chọn mô hình AI cụ thể theo danh sách cập nhật tự động từ nhà cung cấp để cân bằng giữa tốc độ, chi phí và chất lượng. |
| **Agent lập trình** | Điều chỉnh mức độ suy luận | Là nhà phát triển, tôi muốn tinh chỉnh mức độ "động não" và suy luận mở rộng của agent để đánh đổi giữa độ sâu câu trả lời và thời gian chờ. |
| **Agent lập trình** | Dùng khóa API hoặc tài khoản đăng ký | Là người dùng, tôi muốn cấu hình khóa API riêng cho từng dự án hoặc dùng gói đăng ký sẵn có để kiểm soát chi phí và quyền truy cập. |
| **Agent lập trình** | Trợ lý chat trực tiếp | Là người dùng, tôi muốn trò chuyện trực tiếp với mô hình AI (Claude, OpenAI, mô hình cục bộ) để hỏi đáp nhanh mà không cần agent chỉnh sửa tệp. |
| **Quản lý phiên** | Chạy nhiều phiên song song | Là nhà phát triển, tôi muốn chạy nhiều phiên agent cùng lúc để nhiều đầu việc được xử lý đồng thời. |
| **Quản lý phiên** | Bảng Kanban cho phiên | Là quản lý sản phẩm, tôi muốn xem và kéo-thả các phiên qua các giai đoạn công việc để nắm được tiến độ tổng thể. |
| **Quản lý phiên** | Tìm kiếm & tiếp tục phiên | Là nhà phát triển, tôi muốn tìm kiếm toàn văn và tiếp tục lại một phiên cũ để không mất mạch công việc trước đó. |
| **Quản lý phiên** | Nhóm phiên theo luồng công việc | Là nhà phát triển, tôi muốn nhóm các phiên con dưới một phiên cha (workstream) để tổ chức những nỗ lực lớn thành cấu trúc rõ ràng. |
| **Quản lý phiên** | Rẽ nhánh hội thoại | Là nhà phát triển, tôi muốn tạo nhánh từ một điểm trong cuộc hội thoại để thử một hướng khác mà không làm hỏng mạch gốc. |
| **Quản lý phiên** | Liên kết phiên với tệp và commit | Là nhà phát triển, tôi muốn thấy phiên đã đụng vào những tệp nào và tạo ra commit nào để dễ truy vết thay đổi. |
| **Quản lý phiên** | Xuất, ghim, lưu trữ, xóa phiên | Là người dùng, tôi muốn xuất phiên ra HTML/clipboard và ghim, lưu trữ hoặc xóa phiên để quản lý và chia sẻ kết quả. |
| **Quản lý phiên** | Tự đặt tên phiên & báo cần chú ý | Là người dùng, tôi muốn phiên tự được đặt tên gợi nhớ và báo hiệu khi đang chờ tôi phản hồi để biết việc nào cần mình xử lý ngay. |
| **Hội thoại Agent** | Xem diff đỏ/xanh trong hội thoại | Là nhà phát triển, tôi muốn thấy thay đổi của agent dưới dạng diff đỏ/xanh ngay trong hội thoại để hiểu chính xác điều gì đã bị sửa. |
| **Hội thoại Agent** | Theo dõi mức dùng ngữ cảnh & nén | Là nhà phát triển, tôi muốn theo dõi mức lấp đầy cửa sổ ngữ cảnh và nén lại khi cần để phiên dài không bị hụt bộ nhớ. |
| **Hội thoại Agent** | Duyệt quyền cho công cụ | Là người dùng, tôi muốn duyệt hoặc từ chối từng hành động nhạy cảm của agent (theo lần/phiên/vĩnh viễn) để kiểm soát những gì agent được phép làm. |
| **Hội thoại Agent** | Trả lời câu hỏi & duyệt kế hoạch | Là người dùng, tôi muốn agent hỏi tôi lựa chọn và trình kế hoạch để tôi duyệt trước khi nó thực thi những bước quan trọng. |
| **Hội thoại Agent** | Duyệt đề xuất commit | Là nhà phát triển, tôi muốn xem và chỉnh đề xuất commit (tệp + thông điệp) do agent soạn trước khi xác nhận để mọi commit đều qua kiểm duyệt của tôi. |
| **Hội thoại Agent** | Lệnh tắt & kỹ năng dùng chung | Là người dùng, tôi muốn gọi các lệnh tắt và quy trình dựng sẵn qua một bảng chọn chung để tái sử dụng workflow một cách nhất quán giữa các agent. |
| **Hội thoại Agent** | Chế độ giọng nói | Là người dùng, tôi muốn ra lệnh và trả lời agent bằng giọng nói rảnh tay để làm việc khi không tiện gõ phím. |
| **Trình soạn thảo trực quan** | Soạn Markdown WYSIWYG | Là người dùng, tôi muốn viết và chỉnh tài liệu Markdown ở dạng trực quan (kèm bảng, sơ đồ Mermaid, công thức toán) để tập trung vào nội dung thay vì cú pháp. |
| **Trình soạn thảo trực quan** | Chỉnh mã nguồn | Là nhà phát triển, tôi muốn mở và sửa tệp mã nguồn với tô màu cú pháp và xem diff để làm việc trực tiếp với code trong ứng dụng. |
| **Trình soạn thảo trực quan** | Bảng tính & trang tính tính toán | Là người dùng, tôi muốn mở tệp CSV như bảng tính (công thức, lọc, định dạng) và làm trang tính tính toán có đơn vị để xử lý dữ liệu trực quan. |
| **Trình soạn thảo trực quan** | Sơ đồ & bản vẽ tay | Là nhà thiết kế, tôi muốn vẽ sơ đồ và whiteboard (Excalidraw) có hỗ trợ AI để phác thảo ý tưởng nhanh. |
| **Trình soạn thảo trực quan** | Mockup UI có chú thích | Là nhà thiết kế, tôi muốn tạo mockup giao diện bằng AI với xem trước trực tiếp và ghi chú lên màn hình để trao đổi ý tưởng thiết kế. |
| **Trình soạn thảo trực quan** | Mô hình dữ liệu trực quan | Là nhà phát triển, tôi muốn dựng sơ đồ quan hệ thực thể từ schema thật để hình dung và chỉnh cấu trúc dữ liệu bằng hình ảnh. |
| **Trình soạn thảo trực quan** | Xem tệp chuyên dụng | Là người dùng, tôi muốn duyệt cơ sở dữ liệu SQLite, xem PDF và trang HTML ngay trong ứng dụng để không phải rời khỏi không gian làm việc. |
| **Trình soạn thảo trực quan** | Duyệt thay đổi của AI ngay trên tài liệu | Là người dùng, tôi muốn chấp nhận hoặc từ chối từng thay đổi AI đề xuất ngay trên trình soạn thảo (đỏ/xanh) để kiểm soát nội dung cuối cùng. |
| **Extension & Marketplace** | Cài & quản lý tiện ích | Là người dùng, tôi muốn duyệt marketplace, cài tiện ích (từ marketplace hoặc GitHub) và cập nhật/bật-tắt chúng để mở rộng ứng dụng theo nhu cầu. |
| **Extension & Marketplace** | Trình soạn thảo tùy biến cho mọi loại tệp | Là nhà phát triển, tôi muốn thêm trình soạn thảo trực quan riêng cho loại tệp của mình để tích hợp liền mạch với phần còn lại của Nimbalyst và các agent. |
| **Quản lý công việc (Tracker)** | Nhiều loại mục công việc | Là quản lý sản phẩm, tôi muốn tạo các mục theo loại (bug, quyết định, tính năng, todo, kế hoạch, milestone) để theo dõi mọi đầu việc ở đúng ngữ cảnh. |
| **Quản lý công việc (Tracker)** | Con người và agent cùng chỉnh | Là người dùng, tôi muốn cả tôi và agent đều tạo, sửa, di chuyển và thực thi các mục công việc để công việc luôn được cập nhật từ hai phía. |
| **Quản lý công việc (Tracker)** | Nhiều kiểu xem | Là quản lý sản phẩm, tôi muốn xem tracker dạng Kanban, bảng lưới, dòng thời gian hay hộp phân loại để nhìn công việc theo nhiều góc độ. |
| **Quản lý công việc (Tracker)** | Lọc, nhóm & lưu view | Là người dùng, tôi muốn lọc, nhóm, sắp xếp và lưu các view có tên để quay lại nhanh những lát cắt công việc quen thuộc. |
| **Quản lý công việc (Tracker)** | Milestone, mục tiêu & đánh số mã | Là quản lý sản phẩm, tôi muốn gom mục vào milestone/mục tiêu và mỗi mục có mã tham chiếu riêng để lên kế hoạch và trao đổi rõ ràng. |
| **Quản lý công việc (Tracker)** | Nhập từ nguồn ngoài & liên kết commit/PR | Là nhà phát triển, tôi muốn nhập issue từ nguồn bên ngoài và tự động đóng mục khi commit/PR nhắc tới nó để giảm thao tác thủ công. |
| **Công cụ cho lập trình viên** | Quản lý trạng thái Git | Là nhà phát triển, tôi muốn xem trạng thái nhánh, stage/discard tệp và thực hiện push/pull/rebase/commit ngay trong ứng dụng để không phải chuyển sang công cụ khác. |
| **Công cụ cho lập trình viên** | Nhật ký & diff Git | Là nhà phát triển, tôi muốn xem lịch sử commit, diff từng tệp và nhật ký thao tác git để hiểu điều gì đã xảy ra với mã nguồn. |
| **Công cụ cho lập trình viên** | Worktree cách ly cho phiên | Là nhà phát triển, tôi muốn mỗi phiên agent chạy trong một worktree cách ly để nhiều nhánh làm việc song song mà không giẫm lên nhau. |
| **Công cụ cho lập trình viên** | Terminal tích hợp | Là nhà phát triển, tôi muốn mở terminal đầy đủ ngay trong ứng dụng để chạy lệnh mà không rời khỏi không gian làm việc. |
| **Công cụ cho lập trình viên** | Theo dõi tệp bị AI sửa | Là nhà phát triển, tôi muốn thấy danh sách tệp mà AI đã sửa kèm trạng thái git để rà soát và duyệt thay đổi có hệ thống. |
| **Công cụ cho lập trình viên** | Làm việc với Pull Request | Là nhà phát triển, tôi muốn kéo các PR đang mở vào ứng dụng, xem tệp/commit/kiểm tra và duyệt/gộp PR để quản lý review ngay tại chỗ. |
| **Cộng tác nhóm & Đồng bộ** | Đồng bộ cá nhân đa thiết bị | Là người dùng, tôi muốn phiên, bản nháp và cài đặt của mình đồng bộ giữa desktop và điện thoại để tiếp tục công việc ở bất cứ đâu. |
| **Cộng tác nhóm & Đồng bộ** | Tài liệu chia sẻ thời gian thực | Là thành viên nhóm, tôi muốn cùng chỉnh một tài liệu với đồng đội theo thời gian thực để cộng tác không cần gửi tệp qua lại. |
| **Cộng tác nhóm & Đồng bộ** | Hiện diện & con trỏ đồng đội | Là thành viên nhóm, tôi muốn thấy avatar, con trỏ và vùng chọn của người khác để biết ai đang làm gì ở đâu. |
| **Cộng tác nhóm & Đồng bộ** | Nhắn tin nhóm, nhắc tên & hộp thư | Là thành viên nhóm, tôi muốn nhắn tin trong phòng/riêng, nhắc tên người (và agent) và nhận thông báo tập trung trong hộp thư để trao đổi công việc gọn gàng. |
| **Cộng tác nhóm & Đồng bộ** | Yêu cầu phản hồi có cấu trúc | Là quản lý sản phẩm, tôi muốn gửi cho đồng đội một yêu cầu phản hồi có cấu trúc (chấm điểm, chọn, sắp xếp) và tổng hợp kết quả để ra quyết định dựa trên ý kiến nhóm. |
| **Cộng tác nhóm & Đồng bộ** | Trả lời qua trình duyệt | Là người được hỏi, tôi muốn mở một liên kết trong trình duyệt để trả lời yêu cầu ngay cả khi chưa cài Nimbalyst để không bị cản trở khi đóng góp. |
| **Cộng tác nhóm & Đồng bộ** | Quản lý tổ chức, mời & phân quyền | Là chủ nhóm, tôi muốn tạo tổ chức, mời thành viên, phân vai trò và giới hạn quyền truy cập dự án để kiểm soát ai được thấy dữ liệu nào. |
| **Ứng dụng di động** | Bảng điều khiển phiên trên di động | Là người dùng, tôi muốn xem trên điện thoại phiên nào cần mình và phiên nào đang chạy để nắm tình hình khi đang di chuyển. |
| **Ứng dụng di động** | Trả lời bằng văn bản hoặc giọng nói | Là người dùng, tôi muốn trả lời câu hỏi của agent bằng gõ chữ hoặc nói (trên iOS) để agent tiếp tục ngay lập tức. |
| **Ứng dụng di động** | Duyệt thay đổi & xếp hàng việc | Là người dùng, tôi muốn xem và duyệt thay đổi ngay trong hội thoại và xếp sẵn các việc tiếp theo để agent không phải chờ. |
| **Ứng dụng di động** | Thông báo đẩy & ghép nối | Là người dùng, tôi muốn nhận thông báo đẩy khi agent cần mình và ghép nối điện thoại với desktop bằng mã QR để bắt đầu nhanh và an toàn. |
| **Ứng dụng & Cài đặt** | Thông báo & âm báo hoàn tất | Là người dùng, tôi muốn nhận thông báo hệ điều hành (kèm biểu tượng phân biệt loại) và âm báo khi agent hoàn thành hoặc cần tôi để không bỏ lỡ. |
| **Ứng dụng & Cài đặt** | Giao diện & chủ đề | Là người dùng, tôi muốn chọn giao diện sáng/tối/tùy chỉnh để làm việc thoải mái theo sở thích. |
| **Ứng dụng & Cài đặt** | Tự cập nhật & chọn kênh phát hành | Là người dùng, tôi muốn ứng dụng tự cập nhật và cho tôi chọn kênh ổn định hoặc kênh alpha để cân bằng giữa độ ổn định và tính năng mới. |
| **Ứng dụng & Cài đặt** | Hướng dẫn, mẹo & phím tắt | Là người dùng mới, tôi muốn có hướng dẫn từng bước, mẹo theo ngữ cảnh và phím tắt để nhanh chóng thành thạo ứng dụng. |
| **Ứng dụng & Cài đặt** | Gửi phản hồi trong ứng dụng | Là người dùng, tôi muốn báo lỗi hoặc đề xuất tính năng ngay trong ứng dụng (có agent giúp soạn) để đóng góp mà không phải rời khỏi công cụ. |
| **Ứng dụng & Cài đặt** | Quản lý dự án & duyệt tệp | Là người dùng, tôi muốn mở nhiều dự án, duyệt cây thư mục và thao tác tệp (đổi tên, kéo-thả, xóa) để tổ chức không gian làm việc của mình. |
| **Ứng dụng & Cài đặt** | Quyền riêng tư về dữ liệu | Là người dùng, tôi muốn tắt phân tích sử dụng và biết dữ liệu của mình được lưu cục bộ/mã hóa để yên tâm về quyền riêng tư. |

## Ghi chú tính năng chưa hoàn thiện

**Nhà cung cấp agent còn ở giai đoạn thử nghiệm / phân kỳ**
- **Claude Code CLI (gói đăng ký):** mới ở giai đoạn đầu — phần đọc trạng thái đã có nhưng khả năng điều khiển agent gửi lệnh trực tiếp qua CLI còn thuộc pha sau (mã nguồn ghi rõ "Phase 0…Phase 1+").
- **OpenCode**, **GitHub Copilot CLI**, và **OpenAI Codex ACP** được đánh dấu **alpha** (mặc định tắt, có thể thay đổi/lỗi).
- **Trợ lý chat trực tiếp** (Claude/OpenAI/LM Studio) bị ẩn sau tùy chọn "hiện nhà cung cấp chat trực tiếp" — mặc định tắt, người dùng phải tự bật mới thấy.
- **Agent do extension cung cấp:** đang ở pha thiết kế/plugin, cần đồng ý ở lần dùng đầu; chưa phải luồng phổ thông.
- Bộ nhớ đệm danh sách mô hình đang bị **cố ý bỏ qua** ("SKIP CACHE FOR NOW"), nên mỗi lần đều gọi lại API nhà cung cấp.

**Chế độ phiên nâng cao (alpha, mặc định tắt)**
- **Super Loops** (vòng lặp agent tự động trong worktree), **Blitz** (chạy cùng một yêu cầu trên nhiều worktree song song) và **Meta Agent** (phiên điều phối giao việc cho phiên con) đều là tính năng **alpha**, phải bật thủ công trong phần Agent Features.
- Các cờ **beta** `blitz` và `codex` mặc định tắt.

**Chế độ giọng nói (alpha, giới hạn nền tảng)**
- Voice Mode được gắn nhãn **alpha** trên desktop.
- Trên di động, giọng nói **chỉ có trên iOS**; ứng dụng Android chưa có phần voice nào.

**Cộng tác nhóm (beta)**
- Toàn bộ chế độ Team (tạo tổ chức, nhắn tin, tài liệu chia sẻ) tự gắn nhãn **beta** kèm thông báo cảnh báo trong ứng dụng; route "Chia sẻ dự án" trong cài đặt cũng đánh dấu alpha.
- **Cộng tác trên tài liệu ngoài Markdown** phụ thuộc "binding cộng tác" của từng loại tệp: các loại chưa khai báo binding sẽ hiện lý do bị vô hiệu (chưa cùng chỉnh thời gian thực được); binding cho trình soạn mã còn là cờ pha 2.
- **Đồng bộ tài liệu cá nhân** giữa các dự án được giới hạn cho tính năng alpha; đồng bộ lược đồ tracker mã hóa là tính năng nhiều pha (đang triển khai).
- **CHANGELOG hiện tại** ghi nhận: tệp mockup chia sẻ mới bổ sung khung soạn nguồn để cùng chỉnh, và tệp dự án mockup tạm thời **không cho chia sẻ lên nhóm** vì các màn hình chưa đồng bộ giữa người dùng.

**Duyệt thay đổi trên di động**
- Trên cả iOS và Android, việc duyệt thay đổi được thực hiện qua thẻ tác vụ **bên trong hội thoại** (duyệt kế hoạch, cấp quyền); **không có** thao tác "vuốt để duyệt diff" như một số tài liệu mô tả.

**Extension còn ở giai đoạn sớm**
- Các extension **Git** (nhật ký git trực quan), **Playwright**, **Image Generation**, **iOS Dev** yêu cầu kênh **alpha**.
- **Project Graph** vừa là alpha vừa mặc định tắt (rất sớm — phiên bản 0.1.0).
- **Nimbalyst Memory** (chỉ mục tri thức cục bộ) mặc định tắt và mới hoàn thiện một phần — phần "grounding cho voice-agent" thuộc pha sau.
- Các extension **error-test** và **example-theme** chỉ là ví dụ/kiểm thử, không phải tính năng người dùng.

**Trình soạn thảo được nhắc trong tài liệu nhưng CHƯA có trong mã nguồn**
- README/tài liệu SDK có nhắc **mindmap, trình soạn website Astro, slides, và trình soạn vật thể 3D**, nhưng **không tìm thấy mã nguồn/manifest** cho chúng trong kho — đây là extension bên ngoài/marketplace hoặc hạng mục lộ trình, chưa phải tính năng có sẵn.

**Tính năng nâng cao khác có điều kiện**
- **Proxy API Claude tùy chỉnh** là thử nghiệm, chỉ chạy loopback nội bộ và cần khởi động lại phiên.
- **Panel Database** trong cài đặt là alpha và chỉ hiện ở chế độ nhà phát triển; route "Beta Features" hiện đang bị ẩn hoàn toàn.
- **Xuất kỹ năng/lệnh tương thích** (cho Codex và Claude) nằm trong mục Experimental (alpha).
