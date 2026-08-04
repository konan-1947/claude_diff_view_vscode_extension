# Phân biệt "git thay đổi file" vs "AI tool sửa file"

Bối cảnh: `WorkspaceWatcher` (`src/watcher/workspaceWatcher.ts`) phát hiện thay đổi
file qua `FileSystemWatcher('**/*')` — một tín hiệu filesystem thuần tuý, không
mang thông tin về nguyên nhân. Hiện tại extension chỉ loại trừ được 2 trường hợp
đã biết trước (VS Code tự save, hoặc đang trong suppress-window sau khi
`GitBranchWatcher` phát hiện `HEAD` đổi — xem `isSuppressed()` trong
`workspaceWatcher.ts:66-68`). Mọi write không khớp 2 trường hợp đó đều mặc định
bị coi là "AI/tool vừa sửa, cần mở diff" — kể cả khi thực chất là do
`git checkout` gây ra nhưng tín hiệu suppress đến trễ hơn hành động ghi file
(xem phân tích race condition trong lịch sử trò chuyện).

Tài liệu này so sánh 2 tín hiệu được đánh giá là đáng tin cậy nhất để phân biệt
hai nguồn gây thay đổi, làm cơ sở cho việc cải thiện heuristic sau này.

---

## Bảng so sánh

| Tiêu chí | `git checkout` / chuyển nhánh | AI tool edit (Claude/Codex/Qwen…) |
| --- | --- | --- |
| **Tốc độ & mật độ ghi file** | Ghi **rất nhiều file gần như đồng thời**, dồn dập trong một cửa sổ thời gian ngắn (bị giới hạn bởi tốc độ đĩa, có thể chạy song song trong git hiện đại). Số file thay đổi thường bằng đúng số file khác nhau giữa 2 commit — có thể lên tới hàng chục/hàng trăm file cùng lúc. | Ghi **rải rác, số lượng nhỏ mỗi lượt** (thường 1–vài file mỗi tool-call). Khoảng cách giữa các lần ghi không đều, phụ thuộc thời gian LLM suy luận giữa các tool call — không có kiểu "burst" toàn bộ workspace. |
| **Phạm vi thư mục bị ảnh hưởng** | Trải rộng, không liên quan đến nhau về mặt logic — vì mục tiêu là đồng bộ *toàn bộ* working tree theo commit đích, bất kể file đó có "liên quan" tới nhau hay không. | Thường tập trung vào đúng phạm vi task đang làm (vài file liên quan trực tiếp tới yêu cầu), hiếm khi động tới toàn bộ repo trong một lượt. |
| **Thay đổi nội bộ `.git/`** | Luôn kéo theo: `.git/index.lock` xuất hiện (đầu tiên) → nội dung `.git/index` đổi → `.git/HEAD.lock` → `.git/HEAD` đổi → append `.git/logs/HEAD` và `.git/logs/refs/heads/<branch>`. Đây là **tác dụng phụ bắt buộc**, không thể có `git checkout` mà thiếu các thay đổi này. | Không đụng tới `.git/` nếu chỉ là thao tác `Write`/`Edit` file thuần tuý. Chỉ có dấu vết trong `.git/` nếu bản thân AI được yêu cầu chạy lệnh git (commit, stage…) — trường hợp hiếm và có chủ đích rõ ràng. |
| **Thời điểm tương đối giữa 2 tín hiệu** | Thay đổi file code luôn xảy ra **trước** thay đổi `.git/index` và `.git/HEAD` (thứ tự cố định theo thiết kế atomic của git — xem mục "Trình tự thực sự bên trong `git checkout`" ở lịch sử phân tích trước). | Không có khái niệm "trình tự nội bộ .git" liên quan — hoàn toàn không sinh ra sự kiện `.git/` nào để đối chiếu. |
| **Độ tin cậy khi dùng làm tín hiệu suppress** | Cao nếu bắt được sớm (`index.lock` xuất hiện), nhưng vẫn trễ hơn thời điểm file code bắt đầu bị ghi (không thể dùng để "chặn trước" tuyệt đối 100%, chỉ giảm cửa sổ trễ). | Không áp dụng — không có tín hiệu `.git/` để dựa vào; phải dựa vào heuristic khác (hook Claude, hoặc absence của burst pattern). |
| **Chi phí xác minh runtime** | Rẻ: chỉ cần thêm `fs.watch` trên `.git/` (đã có sẵn ở `GitBranchWatcher`) và bắt sự kiện `index.lock`/`index` thay vì chỉ `HEAD`. | Rẻ: đếm số file thay đổi trong một cửa sổ trượt ngắn (vài trăm ms) — nếu vượt ngưỡng N file, tạm coi là batch operation (git hoặc build tool) và trì hoãn/gộp thay vì mở N diff riêng lẻ. |

---

## Kết luận

Hai tín hiệu này **bổ trợ cho nhau**, không thay thế nhau:

- **Thay đổi nội bộ `.git/`** là tín hiệu *đặc thù cho git* — chỉ git checkout/reset/stash/pull… mới sinh ra, không nhầm lẫn với AI edit. Nhưng luôn đến **sau** khi file code đã bắt đầu bị ghi (chỉ giảm cửa sổ trễ, không loại bỏ hoàn toàn race condition), và tự nó **không đủ tin cậy** để làm điều kiện suppress một mình — `git add`/`git commit` cũng ghi lại `.git/index` mà không hề đụng tới nội dung working tree, nên dùng riêng dễ suppress nhầm diff hợp lệ (vd. AI vừa sửa xong, user `git add` để stage).
- **Tốc độ & mật độ ghi file (burst detection)** là tín hiệu *chung*, không cần biết trước nguyên nhân — hữu ích cho cả trường hợp git chạy từ terminal ngoài (không có hook, không chặn được lệnh) lẫn các batch operation khác (build tool ghi generated code, package manager, format-on-save hàng loạt…).

### Quyết định thiết kế: burst detection là tín hiệu chính

**Tốc độ ghi file (burst detection) được chọn làm tín hiệu chính**, vì nó độc lập với việc watcher trên `.git/` có bắt kịp hay không, và áp dụng được cho mọi nguồn batch-write (không riêng git). `.git/index` vẫn giữ vai trò **tín hiệu tương quan phụ tiềm năng** để hạ ngưỡng — nhưng **chưa được hiện thực** (xem "Trạng thái implement" bên dưới); tín hiệu xác nhận thật đang dùng hiện tại là `HEAD` đổi (qua `GitBranchWatcher` đã có sẵn), không phải `.git/index`.

Ngưỡng cụ thể (đã hiện thực, xem bên dưới):

| Điều kiện | Ngưỡng |
| --- | --- |
| Số file khác nhau thay đổi trong cửa sổ trượt 300ms | ≥ 8 file → coi là burst, **giữ lại chờ xác nhận** (không suppress ngay) |

300ms đủ ngắn để không bắt nhầm AI gọi tool-call song song (mỗi Write vẫn tốn
overhead spawn hook + IPC), nhưng đủ dài để bắt trọn một đoạn liên tiếp của
`git checkout`/`reset --hard`/`stash pop`. Ngưỡng "3 file khi có tương quan
`.git/index`" từng đề xuất trước đây **chưa được dùng** — xem lý do bên dưới.

### Quyết định cuối: "giữ lại chờ xác nhận" thay vì "suppress ngay"

Ban đầu cân nhắc suppress ngay khi vừa chạm ngưỡng (đơn giản, nhưng rủi ro
nuốt mất diff nếu đoán nhầm — vd. Codex ghi thật >8 file không qua hook, tốc
độ ghi không khác gì git nên không thể phân biệt chỉ bằng overhead). Đã chốt
dùng hướng **an toàn**: file vượt ngưỡng không suppress ngay, mà giữ lại
(`heldWrites` trong `WorkspaceWatcher`) chờ `burstDetectionHoldMs` (mặc định
2000ms) — nếu trong lúc chờ `GitBranchWatcher` xác nhận `HEAD` đổi thật
(gọi `notifyExternalBatch()`), file bị bỏ âm thầm; nếu không, mở diff bình
thường sau khi hết giờ chờ, không mất gì cả. File dưới ngưỡng không bị ảnh
hưởng — mở diff ngay như trước, không delay.

### Trạng thái implement

- `src/watcher/writeBurstMeter.ts` (`WriteBurstMeter.record()`) — trả về
  `boolean` (đã đạt ngưỡng burst hay chưa) thay vì chỉ log, dùng làm quyết
  định giữ/mở ngay.
- `src/watcher/workspaceWatcher.ts` — `resolveOrHold()`/`scheduleHoldResolve()`
  hiện thực hàng chờ nói trên; `notifyExternalBatch()` (gọi bởi
  `GitBranchWatcher` khi xác nhận `HEAD` đổi) xoá hàng chờ khi được gọi.
- Ngưỡng/cửa sổ/thời gian chờ/bật-tắt đã đưa ra config:
  `ai-cli-diff-view.burstDetectionEnabled` / `burstDetectionWindowMs` /
  `burstDetectionThreshold` / `burstDetectionHoldMs` — đọc qua
  `WorkspaceWatcher.applyBurstConfig()`, tự refresh khi đổi config. Cũng sửa
  được qua mục **Advanced** trong Settings popover của terminal panel
  (`src/terminal/terminalHtml.ts`), backed bởi đúng config trên, không phải
  storage riêng.
- **Đã làm:** xác nhận `pull`/`merge`/`rebase`/`reset` trên **cùng branch** —
  các thao tác này không đổi nội dung `HEAD` nên đường so-nội-dung-`HEAD`
  không bắt được. `gitBranchWatcher.ts` theo dõi thêm `.git/logs/HEAD`
  (reflog); mỗi ref update git append 1 dòng gắn nhãn hành động
  (`pull: Fast-forward`, `merge …`, `rebase (finish): …`, `reset: …`). Khi
  dòng cuối khớp `/^(pull|merge|rebase|reset)\b/i`, coi là batch-op git đã xác
  nhận → gọi `notifyExternalBatch()` (bỏ âm thầm `heldWrites`, rebuild
  baseline) nhưng **không** `clearPendingDiffs()`, vì các diff đang mở khác
  không liên quan tới file bị pull. `commit`/`checkout` bị loại khỏi regex có
  chủ đích (xem comment đầu `gitBranchWatcher.ts`). Caveat: format message
  reflog là convention lâu năm của git, không phải API cam kết ổn định tuyệt
  đối — đây là lưới xác nhận phụ, lưới chính vẫn là burst detection; nếu
  message không khớp, hành vi rơi về đúng như trước khi có tính năng này.

- **Chưa làm (vẫn tồn đọng):** watcher cho `.git/index`/`index.lock` (mở rộng
  `gitBranchWatcher.ts`) để có tín hiệu xác nhận sớm hơn `HEAD`/reflog — hiện
  tại vẫn hoàn toàn dựa vào xác nhận `HEAD`/reflog sẵn có, vốn luôn trễ hơn
  lúc file thật sự bị ghi (xem phần đầu tài liệu). Nếu `burstDetectionHoldMs`
  không đủ dài so với độ trễ xác nhận thực tế trên máy user (vd. checkout/pull
  rất lớn), hàng chờ sẽ hết giờ trước khi xác nhận tới và mở diff như thể
  không phải git — không phải lỗi mới, chỉ là quay lại đúng hành vi trước khi
  có tính năng này cho riêng những file đó.
