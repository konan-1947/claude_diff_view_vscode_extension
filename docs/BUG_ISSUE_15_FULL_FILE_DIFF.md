# Bug #15 — Diff ít mà hiển thị thay cả file: điều tra đầy đủ

> Issue: `#15 — diff ít mà thay cả file (diff sai)` · Người báo: konan-1947
> Điều tra: 2026-08-16 → 2026-08-17 · Trạng thái: **đã vá** (§8.3), chờ kiểm thủ công (§9)
>
> Tài liệu này thay thế bản ghi nhận triệu chứng ban đầu. Các giả thuyết đã được
> kiểm chứng bằng đo đạc thật; phần nào bị bác bỏ vẫn được giữ lại kèm lý do.

---

## 1. Kết luận ngắn

`calculateHunks()` cắt dòng bằng `split('\n')`, nên trên file CRLF **mỗi dòng còn
dính lại một ký tự `\r` (mã 13) ở cuối**. Khi hai vế đem so sánh có EOL khác nhau,
`'abc\r' !== 'abc'` ở **100% số dòng** ⇒ Myers buộc phải trả lời "xoá hết, thêm
hết" ⇒ diff phủ cả file.

Thuật toán chạy hoàn toàn đúng. **Input đưa vào nó mới sai.**

Bug này **không** sửa được bằng cách đổi thuật toán (kể cả sang Monaco — xem §7).
Nó chỉ sửa được bằng cách tách EOL ra khỏi nội dung dòng trước khi so sánh (§8).

Có **hai** đường độc lập dẫn tới trạng thái lệch EOL, và đường thứ hai không cần
AI CLI làm gì sai cả (§6).

---

## 2. Triệu chứng ghi nhận

Từ ảnh chụp trong issue:

```
● Update(be/src/main/java/com/edua/beeduasystem/service/slides/SlidePromptBuilder.java)
  ⎿  Added 8 lines, removed 2 lines
```

- CLI báo **+8 / −2 dòng**, tập trung ở 2 cụm quanh dòng ~311–321 và ~419–429.
- Diff view: minimap **phủ kín đỏ/xanh toàn bộ chiều dài file**; ngay cả vùng
  `import` ở dòng 6–26 — nơi CLI không hề đụng tới — cũng nằm trong vùng đánh dấu.

| | Mong đợi | Thực tế |
| --- | --- | --- |
| Số hunk | 2 | ~1 hunk phủ cả file |
| Số dòng đổi | ~10 | ~toàn bộ file |
| Accept/reject theo hunk | dùng được | vô nghĩa (chỉ còn 1 hunk khổng lồ) |

**Ảnh hưởng:** mất hoàn toàn giá trị review — chức năng lõi của extension. Kèm rủi
ro dữ liệu: bấm *Revert all* trên một diff sai kiểu này sẽ ghi đè file bằng
snapshot đang ở EOL khác, tức là **revert cũng làm biến dạng cả file**.

Môi trường: Windows 11 Pro (10.0.22621), file `.java` có text block tiếng Việt,
phát hiện qua workspace watcher (không phải built-in runner).

---

## 3. Đường đi của dữ liệu

Truy từ đĩa tới thuật toán:

| Bước | Vị trí | Nội dung mang theo |
| --- | --- | --- |
| Dựng baseline lần đầu | `fileSnapshotStore.ts:66` | `fs.readFileSync(fullPath, 'utf8')` — **raw, giữ nguyên EOL trên đĩa** |
| Phát hiện thay đổi | `workspaceWatcher.ts:232` | `newContentRaw` — raw |
| Cổng "có đổi không" | `workspaceWatcher.ts:243-254` | so bản **đã normalize** (`trim` + CRLF→LF) |
| Lưu baseline | `workspaceWatcher.ts:237/247/258` | lưu bản **raw**, không normalize |
| Nạp snapshot | `diffManager.ts:145` `loadSnapshot()` | raw |
| Vế trái khi diff | `diffWebviewPanel.ts:63` | snapshot raw |
| Vế phải khi diff | `diffWebviewPanel.ts:69` | `document.getText()` — kèm EOL của document |
| Tính hunk | `hunkCalculator.ts:159-160` | `split('\n')` — **không strip `\r`** |

Điểm mấu chốt: **tầng duy nhất biết normalize EOL (`normalizeContent`,
`workspaceWatcher.ts:121`) chỉ dùng để quyết định "file có đổi không", nó không
nằm trên đường dữ liệu đi tới `calculateHunks()`.**

Chiều ngược lại (accept/reject) cũng đi qua cùng vấn đề — text trong hunk không
chỉ để hiển thị, nó được ghép ngược thành nội dung file rồi ghi xuống đĩa:

| Bước | Vị trí |
| --- | --- |
| Dựng lại nội dung sau accept | `diff.monaco.js:585-590` — `split('\n')` … `join('\n')` |
| Dựng lại nội dung sau reject | `diff.monaco.js:597-602` — `split('\n')` … `join('\n')` |
| Ghi vào document | `diffWebviewPanel.ts:194-203` `applyModifiedEdit()` |
| Revert cả file | `diffManager.ts:197` — ghi thẳng `snapshot.content` ra đĩa |

Cặp `split('\n')` / `join('\n')` hiện tại **tình cờ an toàn** khi hai vế cùng EOL,
vì `\r` đi kèm nội dung dòng nên ghép lại vẫn ra CRLF. Đây là lý do phải rất cẩn
thận khi vá (§8).

---

## 4. Nguyên nhân gốc

`\r` là **một ký tự trong text**, chỉ là không vẽ ra được:

```
Nhìn bằng mắt  : "const x = 1;\r" vs "const x = 1;"
Mã ký tự       : 99 111 110 115 116 32 120 32 61 32 49 59 13
                 99 111 110 115 116 32 120 32 61 32 49 59
la[0] === lb[0] ? false
sau khi bỏ \r  ? true
```

- Xuống dòng Windows = **2 ký tự** `CR LF` (13 10); Unix = **1 ký tự** `LF` (10).
- `split('\n')` chỉ cắt tại LF ⇒ CR bị bỏ lại dính đuôi **mọi dòng**.
- So sánh dòng dùng `===` mặc định của jsdiff, không comparator, không
  `ignoreWhitespace`.
- Myers chỉ trả lời được *"hai dòng có bằng nhau không"* — không có khái niệm
  "gần giống". Không dòng nào khớp ⇒ LCS rỗng ⇒ đáp án tối ưu duy nhất là xoá
  toàn bộ + chèn toàn bộ.

**Vì sao chỗ khác không dính:**

- *Monaco / VS Code*: `TextModel` lưu mảng dòng **không kèm ký tự xuống dòng**;
  EOL là thuộc tính riêng của model (`getEOL()`). Nội dung dòng không bao giờ
  chứa `\r`.
- *Git*: normalize qua `core.autocrlf` / `.gitattributes` trước khi so với index.
- *Extension này*: so trực tiếp hai chuỗi raw đọc từ đĩa ⇒ tự rước `\r` vào giữa
  dữ liệu so sánh.

Nói gọn: **`\r` đang bị coi là nội dung dòng, trong khi bản chất nó là thuộc tính
của file.**

---

## 5. Bằng chứng — chạy thật `calculateHunks()`

Harness gọi trực tiếp `out/diff/hunkCalculator.js` trên file mẫu 204 dòng
(`code_to_test/long_sample_crlf.js`):

```
1. LF baseline   -> LF edit    (chuẩn)         hunks=  1  -  1 +  4  (~  2% file)
2. CRLF baseline -> CRLF edit  (chuẩn)         hunks=  1  -  1 +  4  (~  2% file)
3. CRLF baseline -> LF edit    (CLI ghi LF)    hunks=  2  -203 +206  (~101% file)  <-- DIFF SAI
4. LF baseline   -> CRLF edit  (CLI ghi CRLF)  hunks=  2  -203 +206  (~101% file)  <-- DIFF SAI
5. CRLF -> LF, KHÔNG sửa gì cả                 hunks=  2  -203 +203  (~100% file)  <-- DIFF SAI
6. BOM: thêm BOM vào đầu file                  hunks=  2  -  2 +  5  (~  2% file)
7. Snapshot rỗng (file mới)                    hunks=  2  -  0 +203  (~100% file)
```

Đọc kết quả:

- **Xác nhận GT1 (lệch EOL).** Chỉ cần lệch EOL là 100% dòng bị đánh dấu, kể cả
  khi nội dung **không đổi một chữ nào** (ca 5).
- **Bác bỏ GT2 (encoding/BOM).** BOM chỉ ảnh hưởng dòng đầu (ca 6: `-2 +5`), không
  tạo ra triệu chứng "cả file". Loại khỏi danh sách nghi ngờ chính.
- Ca 7 (file mới, snapshot rỗng) ra "cả file" nhưng đó là **đúng** — file mới thì
  đúng là toàn bộ nội dung là mới.

---

## 6. Hai đường dẫn tới trạng thái lệch EOL

### 6.1. Đường A — công cụ ghi file bằng EOL khác

CLI đọc file CRLF, ghi lại bằng LF. Baseline (CRLF) vs file (LF) ⇒ ca 3.

**Đo thực tế: Claude Code KHÔNG gây ra đường này.** Tôi sửa một file CRLF 204 dòng
bằng Edit tool rồi đếm byte:

```
long_sample_crlf.js   bytes=4815   totalLF=203   CRLF=203   loneLF=0
```

EOL được giữ nguyên tuyệt đối. Nên với Claude, đường A **không phải** thủ phạm.
Các CLI khác (Codex, Qwen) chưa đo — cần kiểm riêng.

### 6.2. Đường B — baseline trôi lệch EOL (nhiều khả năng là thủ phạm thật)

`workspaceWatcher.ts:243-258`:

```ts
const newContent = this.normalizeContent(newContentRaw);   // trim + CRLF→LF
const oldContent = ...normalizeContent(oldContentRaw);
...
if (oldContent === newContent) { return; }                 // ← 254: THOÁT SỚM
this.snapshots.set(absPath, newContentRaw);                // ← 258: không bao giờ chạy tới
```

Cổng so sánh thì **normalize**, nhưng thứ lưu làm baseline lại là **raw**. Khi file
bị đổi EOL mà nội dung không đổi — `git checkout`, VS Code save đổi EOL, formatter,
`.gitattributes eol=crlf`, chuyển repo giữa máy — watcher kết luận "không có gì
thay đổi" và **thoát trước khi kịp refresh baseline**.

Baseline giữ EOL cũ **vĩnh viễn**, trong khi đĩa đã sang EOL mới.

Lần sau AI CLI sửa **1 dòng**, dù giữ nguyên EOL hoàn hảo ⇒ so baseline-EOL-cũ với
file-EOL-mới ⇒ ca 3/4 ⇒ **đỏ/xanh cả file**.

Đây là đường khớp nhất với issue #15: nó giải thích được vì sao bug xuất hiện dù
CLI hoàn toàn không đổi EOL, và vì sao nó xuất hiện *ngẫu nhiên* trên một số file
chứ không phải mọi file.

> Hệ quả phụ: `-Reset` một file về CRLF cũng đi vào nhánh thoát sớm này, nên
> baseline **không** được refresh. Đó là lý do quy trình tái hiện ở §9 bắt buộc
> phải Reload Window.

---

## 7. Đổi sang diff của Monaco thì sao?

Benchmark chạy trực tiếp `DefaultLinesDiffComputer` / `LegacyLinesDiffComputer` của
monaco-editor 0.49 (chúng là code thuần, không đụng DOM — chạy được ngay trong Node),
so với jsdiff hiện tại.

### 7.1. Ca thường gặp — sửa vài dòng, EOL khớp

| | 200 dòng | 2 000 dòng | 10 000 dòng |
| --- | ---: | ---: | ---: |
| jsdiff `diffArrays` | 17 µs | 16 µs | 43 µs |
| **`calculateHunks` (đang dùng)** | 43 µs | 269 µs | **1.43 ms** |
| monaco legacy | 162 µs | 522 µs | 2.10 ms |
| monaco advanced (mặc định) | *3.97 ms\** | 885 µs | 1.51 ms |
| monaco advanced + moves | *4.01 ms\** | 862 µs | 1.54 ms |

<sub>\* nhiễu warm-up JIT (chậm hơn cả file 2000 dòng) — bỏ qua.</sub>

Tất cả đều dưới 2 ms. **Tốc độ không phải vấn đề, và không phải lý do để đổi.**

### 7.2. Ca bệnh lý — chính là bug #15 (mọi dòng đều khác)

| | 2 000 dòng | 10 000 dòng |
| --- | ---: | ---: |
| **`calculateHunks` (đang dùng)** | 659 ms | **17.56 s** |
| jsdiff `diffArrays` | 625 ms | 16.38 s |
| monaco legacy | **54 ms** | **825 ms** |
| monaco advanced | 221 ms | 1.03 s |
| monaco advanced + moves | 271 ms | 5.17 s |

Chênh **20×**. Và 17.5 giây đó chạy trên **main thread của extension host**
(`diffWebviewPanel.ts:70`, `diffManager.ts:95`) ⇒ **treo cả VS Code**. Monaco thì
diff chạy trong web worker, không chặn UI.

Ca thật (không phải bug), sửa 1/3 số dòng của file 2000 dòng: jsdiff **163 ms** vs
monaco legacy **8 ms**.

### 7.3. Kết luận

- **Monaco KHÔNG sửa được bug #15.** Cả 5 thuật toán đều trả về `-2000 / +2003` —
  Monaco chỉ tính ra **cùng một đáp án sai, nhanh hơn 20 lần**. Input lệch EOL thì
  thuật toán nào cũng phải nói "cả file đổi", vì đó là đáp án đúng cho input đó.
- Monaco còn có **bẫy riêng**: `maxComputationTimeMs` (mặc định 5000 ms), khi vượt
  ngưỡng nó trả `hitTimeout` kèm **một diff phủ cả file** — tức là thêm một đường
  thứ hai dẫn tới đúng triệu chứng đang điều tra.
- Nếu vẫn muốn đổi (vì **độ bền**, không phải tốc độ): `LegacyLinesDiffComputer` là
  điểm ngọt. `DefaultLinesDiffComputer` đắt hơn 2–4× nhưng cho diff cấp ký tự trong
  dòng — thứ hiện chưa có. `computeMoves` nên tắt (5.17 s ở worst case).
- Cả hai class chạy được thẳng trong extension host, nên **không cần** đẩy hunk
  model sang webview; giữ nguyên kiến trúc accept/revert. Chỉ cần thay thân
  `calculateHunks()` và map `RangeMapping` → `Hunk`.
- **Sau khi vá EOL, input bệnh lý biến mất, nên toàn bộ áp lực hiệu năng ở §7.2
  cũng biến mất theo.** Vá EOL trước, đổi thuật toán là việc riêng.

---

## 8. Thiết kế bản vá

Hướng đúng là làm so sánh **lỏng hơn** (bỏ qua EOL), không phải chặt hơn. Nhưng
strip ở đâu mới là chỗ dễ sai, vì hunk còn được ghép ngược thành nội dung file.

### 8.1. Đo 3 cách — cột cuối là EOL của file **sau khi reject 1 hunk**

```
=== CRLF baseline -> CRLF hiện tại (chuẩn) ===
  hiện tại            hunks=1   -1 +3   | EOL sau reject: CRLF
  strip hết           hunks=1   -1 +3   | EOL sau reject: MIXED(199 crlf / 1 lf)   <-- HỎNG FILE
  strip để so sánh    hunks=1   -1 +3   | EOL sau reject: CRLF

=== CRLF baseline -> LF hiện tại (bug 15) ===
  hiện tại            hunks=1 -200 +202 | EOL sau reject: CRLF                     <-- BUG
  strip hết           hunks=1   -1 +3   | EOL sau reject: LF
  strip để so sánh    hunks=1   -1 +3   | EOL sau reject: MIXED(1 crlf / 199 lf)   <-- lem 1 dòng
```

- **`replace(/\r\n/g,'\n')` ngay đầu `calculateHunks` là bẫy.** Diff nhìn đúng,
  nhưng text trong hunk mất `\r`, splice vào file CRLF ⇒ mixed EOL. Ca đầu tiên là
  ca *bình thường* của mọi user Windows — fix kiểu này làm hỏng luôn đường đang chạy tốt.
- **Giữ text raw trong hunk cũng chưa đủ.** Khi hai vế thật sự lệch EOL, reject
  splice dòng lấy từ baseline (EOL cũ) vào file (EOL mới) ⇒ lem đúng 1 dòng.

### 8.2. Cách chạy đúng cả 4 ca

Hunk **EOL-neutral** (text không bao giờ chứa `\r`) **+** tái dựng ghép theo EOL
thật của phía đích:

```
ca                        hunks  -del  +ins   EOL sau reject   EOL sau accept
CRLF -> CRLF (chuan)          1     1     3   CRLF             CRLF
LF   -> LF   (chuan)          1     1     3   LF               LF
CRLF -> LF   (bug 15)         1     1     3   LF               CRLF
LF   -> CRLF (bug 15)         1     1     3   CRLF             LF
```

Diff đúng ở cả 4, không còn MIXED chỗ nào.

### 8.3. Bản vá đã áp dụng

Nguyên tắc: **LF ở giữa, EOL ở biên** — mọi nội dung từ lúc đọc tới lúc webview
tính xong đều ở LF thuần; chỉ khôi phục EOL thật tại các điểm ghi.

| # | Vị trí | Đã sửa |
| --- | --- | --- |
| 1 | `src/diff/eol.ts` (**mới**) | `detectEol()` / `toLf()` / `fromLf()` — thuần, không phụ thuộc vscode |
| 2 | `hunkCalculator.ts:159-165` | `split(/\r?\n/)` thay `split('\n')` ⇒ hunk EOL-neutral. Số phần tử mảng không đổi nên logic chỉ số dòng và 2 pass hiệu chỉnh offset giữ nguyên |
| 3 | `diffWebviewPanel.ts` `postSet()` | `toLf()` cả snapshot lẫn `document.getText()` trước khi tính hunk và gửi sang webview |
| 4 | `diffWebviewPanel.ts` `applyModifiedEdit()` | `fromLf(newCurrent, document.eol)` **trước** cả phép so sánh lẫn `edit.replace()` |
| 5 | `diffManager.ts` `openDiff()` | `calculateHunks(toLf(...), toLf(...))` ⇒ thay đổi thuần EOL cho 0 hunk và rơi vào nhánh dọn snapshot |
| 6 | `diffManager.ts` `applyHunkAcceptFromWebview()` | lưu `fromLf(newOriginal, detectEol(snapshot.content))` ⇒ snapshot giữ nguyên dạng byte gốc |
| 7 | `diffManager.ts` `writeFile()` | thêm `opts.fromLf`; EOL đích lấy từ `doc.eol` nếu document đang mở, ngược lại `detectEol` nội dung trên đĩa. `applyHunkRejectFromWebview()` bật cờ; `revert()` không bật (ghi raw snapshot) |
| 8 | `workspaceWatcher.ts:254` | refresh `snapshots.set(absPath, newContentRaw)` **trước** khi return ⇒ chặn đường B (§6.2) |

**Không đổi:** `res/webview/diff.monaco.js` (extension chỉ gửi LF nên mọi
`split('\n')`/`join('\n')` trong webview tự đúng), `snapshotStore.ts` (giữ nguyên
schema `SnapshotState`), và thuật toán jsdiff.

> Thiết kế ban đầu định thêm field `eol` vào `SnapshotState`. Cách cuối cùng **bỏ
> được yêu cầu đó**: snapshot vẫn lưu raw đúng EOL gốc, EOL được suy ra bằng
> `detectEol()` khi cần ⇒ không đổi schema, không cần migrate state cũ, và
> `revert()` vẫn khôi phục byte-chuẩn.

Ghi chú rủi ro:

- **File vốn đã mixed EOL**: `detectEol` lấy đa số ⇒ lần ghi kế tiếp sẽ đồng nhất
  hoá EOL. Chỉ xảy ra với file vốn đã hỏng sẵn.
- Điểm 8 độc lập hoàn toàn với 1-7; thiếu nó thì baseline vẫn trôi.
- `split(/\r?\n/)` không xử lý `\r` đơn lẻ (Mac cổ). Không đáng làm.
- **Đánh đổi có chủ ý:** sau bản vá, thay đổi thuần EOL **không** hiện trong diff.
  Đúng với mục đích của extension (review sửa đổi của AI), khác với `git diff` mặc
  định (git có hiện `^M`).

### 8.4. Kết quả đo sau khi vá

Chạy lại harness §5 trên code đã compile:

```
1. LF baseline   -> LF edit    (chuẩn)         hunks=1  -1 +4     (không đổi)
2. CRLF baseline -> CRLF edit  (chuẩn)         hunks=1  -1 +4     (không đổi)
3. CRLF baseline -> LF edit    (CLI ghi LF)    hunks=1  -1 +4     <-- đã sửa
4. LF baseline   -> CRLF edit  (CLI ghi CRLF)  hunks=1  -1 +4     <-- đã sửa
5. CRLF -> LF, KHÔNG sửa gì cả                 hunks=0            <-- đã sửa, không mở diff
6. BOM                                         hunks=2  -2 +5     (không đổi)
7. Snapshot rỗng (file mới)                    hunks=2  -0 +203   (đúng: file mới)
```

Mô phỏng end-to-end cả đường ghi (postSet → webview splice → `fromLf` khi ghi):

```
ca                       hunks -del +ins   EOL file sau reject  EOL snapshot sau accept
CRLF -> CRLF (thường)        1    1    3   CRLF ok              CRLF ok
LF   -> LF   (thường)        1    1    3   LF ok                LF ok
CRLF -> LF   (bug 15)        1    1    3   LF ok                CRLF ok
LF   -> CRLF (bug 15)        1    1    3   CRLF ok              LF ok

đổi EOL thuần tuý (không đổi nội dung) -> hunks=0  ok (không mở diff)
toLf -> fromLf round-trip giữ nguyên byte: ok
```

---

## 9. Cách tái hiện

Tài sản đã tạo sẵn trong `code_to_test/`:

| File | Vai trò |
| --- | --- |
| `long_sample_crlf.js` | 204 dòng, **CRLF** — mô phỏng file sau `git checkout` trên Windows |
| `long_sample_lf.js` | bản **LF** đối chứng |
| `simulate_cli_edit.ps1` | giả lập AI CLI ghi đè file (`-Eol lf` / `-Eol crlf` / `-Reset`) |

Thứ tự **bắt buộc** — chạy sai thứ tự sẽ tự làm hỏng repro (baseline bị cập nhật
thành LF ⇒ false negative):

```
1. Accept/dismiss hết diff đang pending của long_sample_crlf.js
2. Ctrl+Shift+P → Reload Window        (ép dựng lại baseline từ đĩa, lúc này là CRLF)
3. powershell -File code_to_test\simulate_cli_edit.ps1
```

Kỳ vọng: diff view tô cả 204 dòng thay vì 1 hunk. Chạy `-Eol crlf` để đối chứng
(phải ra 1 hunk nhỏ), `-Reset` để trả file về trạng thái đầu.

### Dựng lại harness đo đạc

Các script đo nằm ngoài repo (scratchpad). Cách dựng lại:

- **Harness hunk** (§5, §8): `require('out/diff/hunkCalculator.js')` rồi gọi
  `calculateHunks()` trên các cặp `(snapshot, current)` sinh sẵn theo từng kịch bản
  EOL/BOM; đếm `removedLines`/`addedLines`.
- **Benchmark Monaco** (§7): copy `node_modules/monaco-editor/esm/vs/base` và
  `esm/vs/editor/common` sang một thư mục tạm, thả `package.json` chứa
  `{"type":"module"}` vào gốc thư mục đó, rồi import
  `vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer.js` và
  `vs/editor/common/diff/legacyLinesDiffComputer.js`. Không cần DOM.
  Options: `{ ignoreTrimWhitespace: false, maxComputationTimeMs: 5000, computeMoves: false }`.

---

## 10. Tiêu chí coi là xong

- Sửa vài dòng bằng AI CLI trên file CRLF ⇒ diff chỉ hiện đúng các hunk tương ứng,
  số dòng khớp báo cáo của CLI.
- Không dòng nào bị đánh dấu chỉ vì khác EOL hoặc BOM.
- Accept/reject từng hunk hoạt động đúng, và **EOL của file trên đĩa không đổi** sau
  accept, reject, revert — kiểm cả 4 tổ hợp ở §8.2, xác minh bằng đếm byte
  (`CRLF == totalLF` hoặc `loneLF == totalLF`), không phải bằng mắt.
- Đổi EOL thuần tuý (không đổi nội dung) không mở diff, **và** baseline được refresh
  (kiểm bằng cách sửa 1 dòng ngay sau đó — phải ra 1 hunk).
- File 10 000 dòng không làm treo extension host.

---

## 11. Việc còn mở

- [ ] **Kiểm thủ công bản vá trong Extension Development Host theo §9** — chưa chạy.
- [ ] Đo xem Codex / Qwen có giữ EOL khi ghi file không (Claude đã xác nhận là có).
- [x] ~~Quyết định điểm 4 §8.3: migrate snapshot cũ hay bỏ~~ — không cần nữa, xem §8.3.
- [ ] Cân nhắc riêng việc đổi sang `LegacyLinesDiffComputer` vì độ bền (§7.3) —
      độc lập với bản vá EOL.
- [ ] `CLAUDE.md` đang mô tả webview dùng **Monaco DiffEditor**; thực tế
      `diff.monaco.js:126` dùng `monaco.editor.create()` thường + decoration vẽ từ
      hunk tính sẵn ở extension host. `docs/DIFF_VIEW_FLOW.md:184` ghi đúng. Cần sửa
      `CLAUDE.md`.
- [ ] `out/diff/monacoLinesDiffTypes.js` là artifact thừa của một file nguồn đã xoá.
