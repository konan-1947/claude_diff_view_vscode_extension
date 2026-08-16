# Bug #15 — Diff ít mà hiển thị thay cả file (diff sai)

> Trạng thái: **Open** — mới ghi nhận hiện tượng, **chưa điều tra code**.
> Issue: `#15 — diff ít mà thay cả file (diff sai)`
> Người báo: konan-1947 · Ghi nhận: 2026-08-16

---

## 1. Tóm tắt

AI CLI chỉ sửa một vài dòng trong file, nhưng Monaco diff view của extension lại
hiển thị **gần như toàn bộ file là thay đổi** (mọi dòng đều bị đánh dấu
removed/added). Diff hiển thị không phản ánh đúng thay đổi thực tế.

## 2. Bằng chứng quan sát được

Từ ảnh chụp màn hình đính kèm trong issue:

**Phía AI CLI (terminal của extension):**

```
● Update(be/src/main/java/com/edua/beeduasystem/service/slides/SlidePromptBuilder.java)
  ⎿  Added 8 lines, removed 2 lines
```

- CLI báo cáo thay đổi rất nhỏ: **+8 / −2 dòng**.
- Nội dung thay đổi tập trung ở 2 cụm quanh dòng ~311–321 và ~419–429, đều là
  các dòng text tiếng Việt bên trong khối prompt (`"""` text block của Java).

**Phía diff view (tab `SlidePromptBuilder.java`, custom editor Monaco):**

- Minimap bên phải cho thấy **toàn bộ chiều dài file** phủ kín màu
  đỏ/xanh (removed/added), từ dòng đầu đến dòng cuối — không phải chỉ 2 vùng hunk
  như CLI báo.
- Vùng code đang xem (dòng 6–26, phần `import` và khai báo hằng đầu file) là phần
  CLI **không hề đụng tới**, nhưng vẫn nằm trong vùng được tô nền thay đổi.

=> Kết luận sơ bộ: **mọi dòng của file đều bị coi là khác nhau**, chứ không phải
diff bị tính sai cục bộ ở vài chỗ. Đây là dấu hiệu điển hình của việc so sánh hai
bản nội dung mà **toàn bộ dòng khác nhau về mặt byte** dù nhìn bằng mắt thì giống
nhau.

## 3. Hành vi mong đợi vs thực tế

| | Mong đợi | Thực tế |
| --- | --- | --- |
| Số hunk | 2 hunk quanh dòng 311–321 và 419–429 | Gần như 1 hunk phủ cả file |
| Số dòng đổi | ~10 dòng | ~toàn bộ file |
| Minimap | Vài vệt màu rời rạc | Kín màu từ trên xuống dưới |
| Accept/Revert từng hunk | Thao tác được trên đúng 2 vùng | Không còn ý nghĩa — chỉ còn "accept/revert cả file" |

## 4. Ảnh hưởng

- **Nghiêm trọng với luồng review chính của extension**: người dùng không thể đọc
  được AI đã sửa gì; toàn bộ giá trị của diff view mất đi trong trường hợp này.
- Accept/reject theo hunk trở nên vô dụng vì chỉ còn một hunk khổng lồ.
- Rủi ro dữ liệu: nếu người dùng bấm **Revert all** trên một diff sai kiểu này,
  file trên đĩa sẽ bị ghi đè bằng snapshot — mà snapshot đó có thể đang ở dạng
  khác (line ending / encoding khác) so với file gốc, tức là **revert cũng có thể
  làm biến dạng cả file** chứ không chỉ hoàn tác 2 hunk.
- Điều hướng `Alt+H`/`Alt+L` giữa các file pending vẫn chạy, nhưng nội dung xem
  không dùng được.

## 5. Các giả thuyết cần kiểm chứng

Xếp theo mức độ khả nghi (đây là **giả thuyết**, chưa đọc code để xác nhận):

### GT1 — Khác line ending (CRLF ↔ LF) — khả nghi nhất
Snapshot (bên trái) được lưu với một kiểu xuống dòng, còn nội dung sau khi AI CLI
ghi file (bên phải) dùng kiểu khác. Với thư viện `diff` (Myers) chạy theo dòng,
mỗi dòng khi đó khác nhau ở ký tự cuối `\r` ⇒ **100% số dòng bị đánh dấu thay
đổi**. Đây là bug rất phổ biến trên Windows và khớp chính xác với hiện tượng
"đỏ/xanh kín cả minimap".
Ngữ cảnh củng cố: người dùng chạy trên Windows 11; file Java nhiều khả năng được
Git checkout ra dạng CRLF (`core.autocrlf=true`), trong khi công cụ AI ghi lại
bằng LF thuần.

### GT2 — Khác encoding / BOM
Snapshot đọc file dưới một encoding (ví dụ UTF-8 có BOM), còn bản sau đọc theo
encoding khác. File này chứa **nhiều text tiếng Việt có dấu**, nên chỉ cần lệch
encoding là mọi dòng có dấu sẽ khác nhau. Tuy nhiên hiện tượng ảnh cho thấy cả
những dòng thuần ASCII (`import ...`) cũng bị đánh dấu ⇒ giả thuyết này chỉ đúng
nếu kèm BOM/normalization toàn file, xếp sau GT1.

### GT3 — Snapshot bên trái bị lấy sai thời điểm hoặc sai nguồn
Ví dụ: snapshot rỗng / snapshot của một phiên trước / snapshot khôi phục từ
workspace state (`ai-cli-diff.snapshots`) đã cũ so với file hiện tại. Nếu snapshot
rỗng hoặc lệch hẳn, diff cũng sẽ ra "cả file là mới".

### GT4 — Chuẩn hoá whitespace / trailing newline khi lưu snapshot
Nếu đường ghi snapshot có bước trim, normalize indentation, hoặc thêm/bớt newline
cuối file, kết quả có thể lệch trên diện rộng — nhưng thường không phủ 100% file,
nên xếp sau.

### GT5 — Text block Java (`"""`) và ký tự đặc biệt
File này gồm các Java text block dài chứa tiếng Việt, dấu nháy, dấu ngoặc nhọn.
Ít khả năng gây lỗi diff toàn file, nhưng cần loại trừ.

## 6. Các bước tái hiện (dự kiến — cần xác nhận lại)

1. Mở một repo Git trên Windows có file text được checkout dạng **CRLF**
   (kiểm tra: `git config core.autocrlf`, và mở file trong VS Code xem góc dưới
   phải hiển thị `CRLF`).
2. Bật extension, để workspace watcher theo dõi bình thường.
3. Dùng AI CLI (Claude/Codex/Qwen) sửa **vài dòng** trong file đó.
4. Khi diff view mở ra, quan sát minimap và các vùng được đánh dấu.

**Cần xác nhận thêm khi tái hiện:**
- File gốc là CRLF hay LF? (status bar VS Code)
- Sau khi AI CLI ghi, file chuyển sang LF hay giữ nguyên?
- Hiện tượng có xảy ra với file thuần ASCII không, hay chỉ file có tiếng Việt?
- Có xảy ra với file mới tạo trong phiên hiện tại, hay chỉ với file có snapshot
  đã persist qua lần restart VS Code?
- Xảy ra ở mọi CLI hay chỉ một CLI cụ thể?

## 7. Thông tin môi trường

| Mục | Giá trị |
| --- | --- |
| OS | Windows 11 Pro (10.0.22621) |
| Editor | VS Code (custom editor `ai-cli-diff-view.diffEditor`, Monaco DiffEditor) |
| Loại file | `.java` (Java text block, nội dung tiếng Việt có dấu) |
| Đường dẫn | `be/src/main/java/com/edua/beeduasystem/service/slides/SlidePromptBuilder.java` |
| Đường phát hiện | Workspace watcher (không phải built-in runner) |

## 8. Khu vực code cần soi khi bắt đầu điều tra

Chưa đọc code, nhưng theo kiến trúc mô tả trong `CLAUDE.md`, các điểm đáng nghi
theo thứ tự:

1. `src/watcher/fileSnapshotStore.ts` — nơi dựng và cập nhật baseline nội dung
   file; kiểm tra cách đọc file (encoding, có normalize EOL không).
2. `src/diff/diffManager.ts` — nơi giữ snapshot bên trái và ghép với
   `TextDocument` bên phải; kiểm tra bên phải lấy từ `document.getText()`
   (theo `files.eol` của VS Code) trong khi bên trái đọc raw từ đĩa hay không.
3. `src/diff/hunkCalculator.ts` — cách tách dòng trước khi đưa vào thư viện
   `diff`; có strip `\r` không.
4. `src/diff/snapshotStore.ts` — snapshot persist trong workspace state
   (`ai-cli-diff.snapshots`); kiểm tra vòng đời serialize/deserialize.
5. `res/webview/diff.monaco.js` — cấu hình model gửi sang Monaco (Monaco tự có
   khái niệm EOL cho từng model; nếu hai model khác EOL cũng cho kết quả tương tự).

## 9. Tiêu chí coi là đã sửa xong

- Sửa vài dòng bằng AI CLI trên file CRLF ⇒ diff view chỉ hiển thị đúng các hunk
  tương ứng, số dòng thay đổi khớp với báo cáo của CLI.
- Không có dòng nào bị đánh dấu thay đổi chỉ vì khác line ending hoặc BOM.
- Accept/Revert từng hunk hoạt động đúng, và **Revert không đổi line ending gốc
  của file trên đĩa**.
- Kiểm tra chéo với cả file LF thuần, file CRLF, file có BOM, và file chứa ký tự
  Unicode ngoài ASCII.
