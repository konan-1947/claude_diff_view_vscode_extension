# Thiết kế Agent Mode và Preview Diff

## 1. Mục tiêu

Agent Mode cung cấp một terminal trung tâm cho người dùng làm việc với AI CLI,
đồng thời cho phép review toàn bộ thay đổi của Agent mà không làm mất terminal
session hoặc tạo thêm nhiều native editor tab.

Nguyên tắc chính:

- Agent Terminal là nơi làm việc chính.
- Explorer vẫn là nơi duyệt toàn bộ workspace.
- Changes chỉ hiển thị các file Agent đã thay đổi.
- Diff preview chỉ mở khi người dùng chủ động review.
- Terminal và diff preview dùng chung Main View nhưng không chiếm chỗ của nhau
  cùng lúc.

## 2. Bố cục ba khu vực

```text
┌──────────────┬──────────────────────────────────────┬──────────────────────┐
│ Primary Bar  │ Main View                            │ Secondary Bar        │
│              │                                      │                      │
│ Explorer     │ Agent Terminal                      │ AGENT                │
│ Source       │                                      │                      │
│ Control      │ hoặc                                 │ Session / Status     │
│ Run/Debug    │                                      │                      │
│              │ Preview diff mode                   │ Changes              │
│              │                                      │ ├── app.ts           │
│              │                                      │ ├── config.ts        │
│              │                                      │ └── README.md        │
└──────────────┴──────────────────────────────────────┴──────────────────────┘
```

### 2.1. Primary Bar

Primary Bar giữ hành vi quen thuộc của VS Code:

- Explorer: hiển thị toàn bộ file và folder trong workspace.
- Source Control: trạng thái Git.
- Run and Debug: chạy và debug ứng dụng.
- Các view khác của VS Code.

Explorer không được biến thành danh sách diff. File chưa bị Agent sửa vẫn xuất
hiện bình thường ở đây.

Khi người dùng bấm file trong Explorer:

- mở file code thông thường;
- không có nút Accept/Reject diff;
- không đưa file vào `Preview diff mode` nếu file không có pending diff.

Trong Agent Mode, file code dùng Main View tạm thời thay cho Agent Terminal.
File native vừa được mở sẽ được đóng và thay bằng `File preview` trong chính
webview của Agent: một popup Monaco đặt trên terminal. Popup rộng và cao 80%
vùng terminal nên người dùng vẫn thấy Agent phía dưới; `Escape` hoặc `Back to
terminal` đóng popup. Không tạo editor group, native tab, hay cột phụ.

### 2.2. Main View

Main View là vùng làm việc chính của Agent Mode.

#### Trạng thái mặc định: Agent Terminal

- Terminal chiếm toàn bộ Main View.
- Có nhiều terminal tab nội bộ.
- Agent CLI, command output và lịch sử terminal được giữ nguyên.
- Người dùng có thể tạo, chuyển và đóng terminal tab.

#### Trạng thái review: Preview diff mode

Khi bấm `View diff`, Main View chuyển sang Preview diff mode trong cùng
Webview:

- không tạo native VS Code tab mới;
- không dispose PTY session;
- terminal được ẩn tạm thời nhưng vẫn giữ state;
- nút `View diff` đổi thành `Back to terminal`.

### 2.3. Secondary Bar

Secondary Bar là khu vực context của Agent, không phải Explorer thứ hai.

Nội dung đề xuất:

```text
AGENT

SESSION
● Running
Shell: bash
Branch: feature/issue-23-agent-mode

CHANGES (3)
├── src/app.ts       +18 -4
├── src/config.ts     +3 -1
└── README.md         +5 -0
```

Secondary Bar không render toàn bộ nội dung diff. Nó chỉ làm navigator và hiển
thị trạng thái:

- số file thay đổi;
- số dòng thêm/xóa;
- file đang được review;
- file đã xử lý;
- trạng thái stale hoặc loading.

## 3. Header và nút điều khiển

Thứ tự nút trong terminal header:

```text
[View diff] [Files] [Introduction] [Settings] | [Tắt Agent mode]
```

Nút Agent Mode nằm ngoài cùng bên phải và được ngăn cách bằng một divider để
giảm thao tác nhầm.

### Trạng thái nút

| Trạng thái | Nhãn nút chính |
|---|---|
| Agent Mode tắt | `Agent mode` |
| Agent Terminal đang mở | `Tắt Agent mode` |
| Preview diff đang mở | `Back to terminal` |

Chỉ có một nút chuyển giữa Terminal và Preview. Không thêm nút Back thứ hai bên
trong overlay.

## 4. Preview diff mode

### 4.1. Mở preview

Khi người dùng bấm `View diff`:

1. Giữ nguyên terminal session và terminal tab hiện tại.
2. Hiển thị lớp Preview diff trong Main View.
3. Lấy danh sách từ `DiffManager.getPendingFiles()`.
4. Hiển thị summary: số file, số hunk, số dòng thêm/xóa.
5. Giữ Secondary Bar để người dùng chọn file.

```text
┌─────────────────────────────────────────────────────────────┐
│ Preview diff mode   3 files · +26 -7                        │
├─────────────────────────────────────────────────────────────┤
│ This preview contains all pending Agent changes.             │
├─────────────────────────────────────────────────────────────┤
│ src/app.ts                                      +18 -4       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Monaco DiffEditor                                      │ │
│ │ inline hunk actions                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ src/config.ts                                    +3 -1      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Monaco DiffEditor                                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 4.2. Hiển thị diff

Mỗi file được render thành một section riêng:

- header chứa đường dẫn file;
- thống kê additions/deletions;
- số hunk;
- Accept/Reject toàn file;
- Monaco DiffEditor thật;
- Accept/Reject action cho từng hunk.

Các section nằm trong một vùng scroll dọc duy nhất. Không tạo vertical scrollbar
riêng cho từng editor để tránh trải nghiệm nested scrolling.

### 4.3. Điều hướng file

Khi bấm file trong `Changes` ở Secondary Bar:

- nếu preview chưa mở: mở preview rồi cuộn tới file;
- nếu preview đang mở: cuộn tới section tương ứng;
- file đang ở viewport được highlight trong danh sách Changes;
- không mở thêm native diff tab.

Khi người dùng cuộn Main View:

- file gần viewport được xác định bằng `IntersectionObserver`;
- Secondary Bar cập nhật active file;
- không thay đổi terminal tab.

### 4.4. Accept và Reject

#### Accept/Reject hunk

- chỉ cập nhật hunk của file hiện tại;
- section vẫn được giữ nguyên;
- counter thay đổi nếu số dòng diff thay đổi;
- không mở native editor tab.

#### Accept/Reject file

- cập nhật snapshot thông qua `DiffManager`;
- xóa file khỏi Changes;
- xóa hoặc thu gọn section tương ứng;
- chuyển focus tới file pending tiếp theo;
- nếu không còn file, hiển thị empty state.

Preview cần dùng API riêng hoặc option riêng cho thao tác này để không kích hoạt
hành vi mở file kế tiếp của single-file DiffEditor hiện tại.

## 5. Luồng người dùng

### 5.1. Làm việc bình thường với Agent

```text
Bật Agent Mode
      ↓
Agent Terminal xuất hiện ở Main View
      ↓
Chạy lệnh / đọc output / chuyển terminal tab
      ↓
Secondary Bar cập nhật Changes khi Agent sửa file
```

Trong luồng này Preview diff không tự mở và không làm giảm diện tích terminal.

### 5.2. Review toàn bộ thay đổi

```text
Bấm View diff
      ↓
Preview diff mode mở trong Main View
      ↓
Chọn file từ Changes hoặc cuộn trực tiếp
      ↓
Review Monaco DiffEditor
      ↓
Accept/Reject hunk hoặc file
      ↓
Bấm Back to terminal
```

Khi quay lại terminal, cần giữ:

- terminal session;
- terminal tab đang active;
- nội dung output;
- vị trí scroll của terminal;
- trạng thái Agent đang chạy.

### 5.3. File chưa bị Agent sửa

File chưa có pending diff không xuất hiện trong `Changes`.

Nếu người dùng bấm file đó trong Explorer:

- mở file như editor thông thường;
- không có Accept/Reject;
- không thêm file vào Preview diff.

Nếu một file từng có diff nhưng diff đã hết do Accept/Reject hoặc do nội dung
quay lại snapshot:

- bỏ file khỏi Changes;
- không mở diff rỗng;
- hiển thị thông báo ngắn `No pending changes for this file` nếu người dùng
  vừa chọn file đó.

### 5.4. File thay đổi trong lúc preview

Khi workspace watcher phát hiện file thay đổi:

- không mở native diff tab nếu Agent Mode đang bật;
- cập nhật file tương ứng trong Preview;
- giữ scroll position của Main View;
- đánh dấu `Updated` trong lúc chờ dữ liệu mới;
- cập nhật Monaco DiffEditor sau khi debounce.

## 6. Hiệu suất Preview

Mô hình nhiều Monaco DiffEditor xếp dọc không có nghĩa phải khởi tạo tất cả
editor ngay khi mở preview.

### 6.1. Lazy render

Ban đầu chỉ render metadata và placeholder:

- file path;
- additions/deletions;
- số hunk;
- kích thước file;
- trạng thái loading.

Khi section gần viewport, dùng `IntersectionObserver` để tải nội dung và khởi
tạo Monaco DiffEditor.

### 6.2. Giới hạn editor đang sống

- giữ khoảng 3–5 DiffEditor instance gần viewport;
- dispose editor ở xa viewport;
- giữ metadata và chiều cao placeholder;
- khôi phục editor khi người dùng cuộn lại;
- lưu view state nếu cần giữ cursor hoặc vị trí scroll.

### 6.3. Tải dữ liệu theo tầng

Không gửi toàn bộ nội dung của tất cả file ngay khi mở preview.

```text
Mở preview
  → gửi danh sách metadata
  → người dùng sắp nhìn thấy file nào
  → request snapshot/current content của file đó
  → tính hoặc nhận hunks
  → tạo Monaco DiffEditor
```

Các giới hạn hiện tại như `maxFileLines`, file type rules và snapshot state vẫn
được giữ nguyên.

### 6.4. Cập nhật hiệu quả

- debounce các sự kiện `onDidChangeDiffs` trong khoảng 100–200ms;
- chỉ refresh file bị ảnh hưởng;
- không destroy/recreate toàn bộ preview;
- giữ trạng thái expanded/collapsed;
- gọi `editor.layout()` trong `requestAnimationFrame` sau resize;
- tránh nested vertical scrollbar;
- cân nhắc tắt minimap trong aggregate preview để giảm chiều rộng và memory.

## 7. Trường hợp lỗi và empty state

### Không có pending diff

```text
No pending changes

Agent chưa tạo thay đổi nào cần review.
[Back to terminal]
```

### File không đọc được

Chỉ section đó hiện lỗi; các file khác vẫn tiếp tục review được.

### Monaco không khởi tạo được

Hiển thị lỗi tại section và cung cấp action thử lại. Không làm mất terminal
session.

### Preview bị đóng do tắt Agent Mode

- dispose toàn bộ Monaco editor/model của preview;
- đóng overlay;
- khôi phục terminal/sidebar theo lifecycle Agent Mode;
- không giữ trạng thái preview giữa các lần bật Agent Mode.

## 8. Quy tắc tránh tranh chỗ

| Hành động | Kết quả khi Agent Mode bật |
|---|---|
| Bấm `View diff` | Mở aggregate preview trong cùng Main View |
| Bấm file trong `Changes` | Cuộn tới diff section |
| Bấm file chưa sửa trong Explorer | Mở code editor bình thường |
| Workspace phát hiện file mới | Cập nhật Changes, không tự mở native diff tab |
| Bấm `Open in separate editor` | Người dùng chủ động mở native DiffEditor |
| Bấm `Back to terminal` | Quay lại terminal cũ |
| Tắt Agent Mode | Đóng preview và Agent terminal |

## 9. Tiêu chí nghiệm thu

- Explorer vẫn hiển thị toàn bộ workspace.
- Changes chỉ hiển thị file có pending diff.
- Preview hiển thị diff thật bằng Monaco, không dùng HTML mock.
- Nhiều file xuất hiện trong một Main View duy nhất.
- Không tạo native diff tab khi review trong Agent Mode.
- Terminal session không mất khi mở hoặc đóng Preview.
- Accept/Reject hunk và file cập nhật đúng `DiffManager`.
- Với nhiều file, không khởi tạo toàn bộ Monaco editor ngay lập tức.
- Không có nested vertical scrollbar khó sử dụng.
- Tắt Agent Mode dọn sạch editor, model và listener của Preview.
