# Plan: Aggregate Diff Preview trong Agent Mode

## 1. Mục tiêu

Thêm một `Preview diff mode` nằm đè lên terminal trung tâm khi người dùng bấm
`View diff`. Preview phải hiển thị toàn bộ các file đang có pending diff trong
một Webview duy nhất, với nhiều Monaco DiffEditor xếp dọc.

Mục tiêu trải nghiệm:

- Agent terminal vẫn chiếm toàn bộ không gian khi người dùng đang làm việc.
- Preview chỉ xuất hiện khi người dùng chủ động bấm `View diff`.
- Tất cả file được xem trong một luồng cuộn duy nhất, không tạo thêm native tab.
- Monaco DiffEditor thật được dùng lại, thay cho HTML diff mock hiện tại.
- Các thao tác Accept/Reject vẫn dùng cùng snapshot và logic hunk hiện có.
- Đóng preview quay lại đúng terminal/session đang chạy, không mất scroll hoặc
  PTY session.

Issue #23 yêu cầu thêm lựa chọn review toàn bộ thay đổi trong một tab duy nhất,
nhưng không cần loại bỏ cách mở diff riêng từng file. Vì vậy preview này là một
lối vào bổ sung; các diff editor riêng lẻ hiện tại vẫn được giữ.

## 2. Giao diện đề xuất

```text
┌──────────────────────────────────────────────────────────────┐
│ Terminal tabs                         [Back to terminal]      │
├──────────────────────────────────────────────────────────────┤
│ Preview diff mode     8 files   +126 -42   [Collapse all]     │
├───────────────────┬──────────────────────────────────────────┤
│ CHANGED FILES      │ src/app.ts                 +18 -4         │
│                   │ ┌──────────────────────────────────────┐ │
│ ● src/app.ts      │ │ Monaco DiffEditor                    │ │
│   +18 -4          │ │ inline hunk actions                  │ │
│                   │ └──────────────────────────────────────┘ │
│ ○ src/config.ts   │                                          │
│   +3 -1           │ src/config.ts                +3 -1         │
│                   │ ┌──────────────────────────────────────┐ │
│ ○ README.md       │ │ Monaco DiffEditor                    │ │
│   +5 -0           │ └──────────────────────────────────────┘ │
└───────────────────┴──────────────────────────────────────────┘
```

### Header

- `Preview diff mode`.
- Tổng số file pending.
- Tổng số dòng thêm/xóa nếu tính được.
- Nút `Collapse all` / `Expand all`.
- Nút duy nhất ở header terminal đổi trạng thái:
  - `View diff` khi đang ở terminal.
  - `Back to terminal` khi đang ở preview.

Không thêm một nút Back thứ hai bên trong overlay. Điều này giữ đúng quyết định
UX hiện tại: một hành động chuyển đổi, một vị trí cố định.

### Danh sách file

Danh sách file ở cột trái chỉ là navigator, không render nội dung diff tại đây.
Mỗi item hiển thị:

- đường dẫn tương đối workspace;
- số dòng thêm/xóa;
- trạng thái đang loading, changed, accepted hoặc stale;
- trạng thái active của file đang gần viewport.

Bấm item sẽ cuộn tới section tương ứng bằng `scrollIntoView`. Khi section được
cuộn tới, item tương ứng được đánh dấu active. Với màn hình hẹp, cột này ẩn đi
và thay bằng một file picker compact ở toolbar.

### Diff sections

Mỗi file là một section riêng trong cùng một vùng cuộn dọc:

- header của section chứa path, số hunk, số dòng thêm/xóa;
- nút collapse riêng cho file;
- nút `Accept file` và `Reject file` ở header;
- một Monaco DiffEditor bên dưới;
- các nút Accept hunk hiện tại của diff editor được giữ nguyên;
- không tạo vertical scrollbar riêng cho từng editor; chỉ cho phép horizontal
  scroll khi dòng quá dài.

Mặc định các file có thay đổi đều mở ở trạng thái expanded để người dùng có
big-picture. Nếu số file lớn, có thể chuyển sang expanded file đầu tiên và
lazy-load các section còn lại; quyết định này cần kiểm tra qua smoke test.

### Hunk context và các đoạn diff gần nhau

Preview phải cho người dùng thấy đủ context để hiểu thay đổi, nhưng không bắt
người dùng cuộn qua toàn bộ các dòng không liên quan.

- Mặc định hiển thị 3 dòng không đổi phía trên và 3 dòng phía dưới mỗi hunk.
- Nếu hunk nằm ở đầu hoặc cuối file thì hiển thị số dòng có sẵn.
- Các hunk cách nhau không quá `2 * contextLines` dòng không đổi được hiển thị
  trong cùng một vùng liên tục. Với mặc định 3 dòng, khoảng cách 2 dòng sẽ
  không tạo vùng collapse ở giữa.
- Không lặp lại các dòng context bị chồng lấn giữa hai hunk.
- Khi khoảng cách lớn hơn 6 dòng, phần không đổi ở giữa được thu gọn thành:

  ```text
  ⋯ 24 dòng không thay đổi
  ```

- Bấm vùng `⋯` sẽ mở toàn bộ các dòng bị thu gọn.
- Việc gộp chỉ áp dụng cho cách hiển thị. Các hunk vẫn giữ identity và action
  riêng để `Accept hunk` / `Reject hunk` không vô tình xử lý cả vùng lớn hơn.
- Toàn bộ nội dung file vẫn tồn tại trong Monaco model; collapse chỉ là cách
  giảm nội dung nhìn thấy ban đầu, không làm mất khả năng chỉnh sửa.

Ví dụ khi hai hunk cách nhau 2 dòng:

```text
- dòng bị xóa ở hunk 1
+ dòng thêm ở hunk 1
  dòng không đổi
  dòng không đổi
- dòng bị xóa ở hunk 2
+ dòng thêm ở hunk 2
```

Ví dụ khi khoảng cách lớn:

```text
- hunk 1
+ hunk 1

⋯ 24 dòng không thay đổi

- hunk 2
+ hunk 2
```

`contextLines = 3` là default cho preview. Có thể đưa thành setting `Diff
context lines` với các lựa chọn `2`, `3`, `5` sau khi luồng cơ bản ổn định.

### Các trạng thái bắt buộc

- Không có pending diff: hiển thị empty state và nút quay lại terminal.
- Đang tải: section có skeleton, không tạo editor ngay.
- Monaco lỗi: section hiện thông báo lỗi riêng, các file khác vẫn dùng được.
- File đã bị thay đổi tiếp: đánh dấu `Updated`, cập nhật lại section sau khi
  nhận dữ liệu mới.
- File đã Accept/Reject: section biến mất hoặc chuyển sang trạng thái resolved;
  counter và danh sách bên trái cập nhật ngay.

## 3. Tái sử dụng renderer diff hiện tại

### Hiện trạng

`src/diff/diffWebviewPanel.ts` đang dựng một webview cho một file và gửi message
`set` gồm:

- `originalContent` từ snapshot;
- `currentContent` từ file trên disk;
- `language`;
- `hunks` từ `calculateHunks`;
- theme và editor configuration.

`res/webview/diff.monaco.js` hiện dùng các DOM id/state singleton như
`#container`, `#btn-accept-file` và một `state.editor`. Vì vậy không nên nhúng
nguyên file này nhiều lần; các instance sẽ tranh chấp DOM id và state.

### Refactor đề xuất

Tách renderer thành một factory có state độc lập, ví dụ:

```ts
const instance = createDiffEditor({
  container,
  toolbar,
  filePath,
  onAcceptHunk,
  onRejectHunk,
  onAcceptFile,
  onRejectFile,
});
```

Mỗi instance phải sở hữu riêng:

- original/current Monaco model;
- diff editor;
- hunk decorations và inline action widgets;
- cursor/scroll state;
- toolbar counter và trạng thái disabled;
- toàn bộ disposable của Monaco.

Các file diff editor riêng hiện tại cũng chuyển sang dùng factory này. Như vậy
logic hiển thị và logic thao tác không bị nhân đôi giữa single-file view và
aggregate preview.

### Provider cho preview

Thêm một lớp quản lý preview, có thể đặt trong `src/diff/` hoặc tách thành
`src/diff/diffPreview.ts`. Trách nhiệm:

1. Lấy danh sách từ `DiffManager.getPendingFiles()`.
2. Lấy snapshot và current content theo từng file.
3. Tính hunks ở extension host, không tính lại trong từng webview section.
4. Gửi metadata trước, nội dung file theo yêu cầu lazy-load.
5. Chuyển các thao tác của section về `DiffManager`.
6. Lắng nghe `onDidChangeDiffs` và thay đổi file để cập nhật preview.

Message từ webview phải kèm `filePath`, không dùng một message state chung:

```ts
{ type: 'acceptHunk', filePath, newOriginal, newCurrent }
{ type: 'rejectHunk', filePath, newOriginal, newCurrent }
{ type: 'acceptFile', filePath }
{ type: 'rejectFile', filePath }
{ type: 'loadFile', filePath }
```

## 4. Đồng bộ Accept/Reject

Không gọi mù `DiffManager.accept()` từ preview nếu hành vi hiện tại của method
đó tự mở file kế tiếp hoặc khôi phục native text editor. Preview cần hành vi
riêng:

- accept/reject một hunk chỉ cập nhật section hiện tại;
- accept/reject một file cập nhật snapshot, xóa section đó khỏi preview và
  chuyển focus tới section kế tiếp;
- accept/reject không tự mở thêm native diff tab;
- nếu không còn pending file, hiển thị empty state;
- nếu thao tác từ diff editor riêng lẻ cùng lúc, preview nhận
  `onDidChangeDiffs` và đồng bộ lại.

Có thể thêm option nội bộ như `openNext: false` hoặc method riêng
`acceptFromPreview()` / `revertFromPreview()` để tránh thay đổi hành vi của
luồng diff editor cũ.

## 5. Chiến lược hiệu suất

Mục tiêu là cho phép review nhiều file mà không tạo hàng chục Monaco editor
cùng lúc. “Nhiều editor xếp dọc” là mô hình hiển thị, không có nghĩa tất cả
editor phải được khởi tạo ngay khi mở preview.

### 5.1. Hai tầng dữ liệu

Khi mở preview, gửi trước metadata nhẹ:

- filePath/displayPath;
- language;
- số hunk;
- số dòng thêm/xóa;
- kích thước file;
- trạng thái pending.

Chỉ khi section sắp vào viewport mới gửi `loadFile` để lấy
`originalContent`, `currentContent` và hunks. Điều này tránh gửi toàn bộ nội
dung của hàng chục file ngay lúc mở overlay.

### 5.2. Lazy creation bằng IntersectionObserver

Mỗi section ban đầu chỉ có shell và placeholder. Dùng
`IntersectionObserver` với `rootMargin` khoảng `800px` để:

- khởi tạo editor sớm hơn một chút trước khi người dùng nhìn thấy;
- không gây cảm giác chờ khi cuộn;
- chỉ tạo editor cho vùng gần viewport.

Khi section rời viewport rất xa:

- giữ metadata và scroll height của section;
- dispose `DiffEditor` instance;
- giữ hoặc dispose Monaco models theo memory pressure;
- tạo lại instance khi section quay lại viewport.

Nếu cần giữ trạng thái chỉnh sửa/cursor, lưu `viewState` trước khi dispose.

### 5.3. Giới hạn editor đang sống

Đặt soft limit khoảng 3–5 live DiffEditor instance. Con số này cần kiểm tra
trên Extension Development Host, không hardcode như một giới hạn sản phẩm.

Khi vượt giới hạn, dispose section xa viewport nhất trước. Editor đang được
focus và các section trong vùng `rootMargin` được ưu tiên giữ lại.

### 5.4. Tối ưu kích thước và layout

- Không dùng `height: 100%` cho mọi editor trong trang aggregate.
- Tính chiều cao section theo nội dung diff và giới hạn hợp lý cho file cực
  dài.
- Gọi `editor.layout()` trong `requestAnimationFrame` sau khi section hiện ra.
- Không lồng vertical scrollbar trong editor và container chính.
- Debounce các lần layout liên tiếp do resize hoặc theme change.
- Không render minimap cho aggregate preview nếu nó làm tăng chiều rộng và
  memory; giữ nguyên setting hiện tại cho single-file diff nếu cần.

### 5.5. Đồng bộ thay đổi có debounce

`onDidChangeDiffs` có thể phát nhiều lần trong một burst. Preview nên:

- gom các thay đổi trong khoảng 100–200ms;
- chỉ cập nhật file bị ảnh hưởng;
- không destroy/recreate tất cả editor;
- giữ scroll position và expanded/collapsed state của các file không đổi.

### 5.6. Giới hạn dữ liệu

Preview phải tôn trọng các giới hạn đang có:

- `maxFileLines`;
- file type rules;
- snapshot không tồn tại;
- file bị xóa hoặc không đọc được.

Không copy toàn bộ nội dung file vào nhiều message nếu file đã được load. Dùng
cache theo normalized path và version/generation của snapshot; invalidate cache
khi file hoặc snapshot thay đổi.

## 6. Vòng đời Webview và terminal

Overlay là một lớp DOM bên trong terminal Webview, không phải WebviewPanel mới.
Khi mở/đóng preview:

- không dispose PTY session;
- không gọi `startFresh()`;
- không tạo native editor tab;
- chỉ pause hoặc giảm hoạt động của xterm nếu cần;
- khi quay lại terminal, gọi fit/layout cho active xterm một lần.

Khi tắt Agent Mode:

- đóng overlay nếu đang mở;
- dispose toàn bộ Monaco editors/models của preview;
- khôi phục header về `View diff`;
- terminal trung tâm bị dispose theo lifecycle Agent Mode hiện tại.

## 7. Các mốc triển khai

### Phase 1: Tách renderer

- Tách `diff.monaco.js` singleton thành renderer instance.
- Giữ nguyên hành vi single-file diff.
- Thêm test thủ công Accept/Reject hunk và Accept/Reject file.

### Phase 2: Preview một file thật

- Thay mock section đầu tiên bằng Monaco DiffEditor thật.
- Dữ liệu lấy từ `DiffManager`, không còn hardcode.
- Kiểm tra theme, language, cursor và hunk actions.

### Phase 3: Nhiều section + file navigator

- Render metadata cho tất cả pending files.
- Thêm IntersectionObserver và lazy-load.
- Thêm scroll sync giữa file list và section.
- Thêm collapse/expand.

### Phase 4: Actions và live update

- Accept/Reject theo filePath.
- Đồng bộ `onDidChangeDiffs` có debounce.
- Xử lý file bị xóa, file stale và empty state.

### Phase 5: Tối ưu và hardening

- Giới hạn live editors.
- Kiểm tra memory khi có nhiều file.
- Kiểm tra resize, theme change, hide/show webview và đóng Agent Mode.
- Xóa mock data và mock-only CSS.

## 8. Tiêu chí nghiệm thu

- Với 3 file pending, preview hiển thị diff thật của cả 3 file trong một
  Webview, không tạo native diff tab mới.
- Monaco hiển thị syntax highlighting và inline diff giống diff editor hiện tại.
- Mỗi hunk hiển thị 3 dòng context mặc định ở trên và dưới nếu có thể.
- Hai hunk cách nhau 2 dòng không đổi được hiển thị liền nhau, không có vùng
  collapse thừa ở giữa.
- Hai hunk cách nhau nhiều dòng có vùng `⋯` để mở rộng context.
- Các hunk hiển thị liền nhau vẫn có action Accept/Reject riêng.
- Accept/Reject hunk của file A không làm mất trạng thái file B.
- Accept/Reject file cập nhật đúng snapshot và danh sách pending.
- Agent terminal vẫn giữ nguyên session, nội dung và vị trí scroll sau khi đóng
  preview.
- Với 20+ file, mở preview không tạo 20 Monaco editor ngay lập tức.
- Cuộn qua danh sách không bị giật rõ rệt và không sinh ra nhiều vertical
  scrollbar lồng nhau.
- Theme sáng/tối, resize panel và đóng/mở Agent Mode không để lại editor,
  listener hoặc model bị leak.
- Khi không còn pending diff, preview hiển thị empty state rõ ràng.

## 9. Kết luận

Hướng nhiều Monaco DiffEditor xếp dọc phù hợp với mục tiêu “nhìn toàn cảnh”
của issue #23, nhưng cần triển khai theo kiểu lazy/virtualized. Phần quan
trọng nhất không phải viết lại thuật toán diff; đó là tách renderer hiện tại
khỏi singleton DOM, quản lý lifecycle của nhiều editor, và giữ
`DiffManager` làm nguồn dữ liệu duy nhất.
