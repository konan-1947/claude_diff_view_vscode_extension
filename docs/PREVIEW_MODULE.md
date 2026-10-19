# Module preview file (agent mode)

Hướng dẫn thêm code cho cụm preview: xem file ngay trong khung Agent Terminal,
không mở tab mới để terminal giữ focus.

> Trạng thái: đã có code, markdown, ảnh/svg, csv/tsv, mermaid (`res/webview/preview/`,
> `src/preview/previewKind.ts`). Các mục "Hiện trạng" bên dưới mô tả bản cũ (`filePreview.js`,
> đã xóa); renderer thật nằm trong `res/webview/preview/*.js`, nạp lười marked/dompurify/mermaid
> qua `libs.js`. Mẫu thử: `code_to_test/preview/`.

## Mục tiêu và ranh giới

- Xem được: code/text, markdown, ảnh (png/jpg/gif/webp), svg.
- Không xem được: file binary lạ (zip, exe, db...) → chỉ hiện thông tin file.
- **Không** nhúng được custom editor của extension khác (vd. Markdown Editor For
  Humans). Webview của mình chỉ render bằng renderer của mình.
- Preview không được cướp focus của terminal, trừ khi người dùng chủ động bấm vào.

## Hiện trạng

| Phần | Vị trí |
| --- | --- |
| Webview preview code (Monaco) | `res/webview/filePreview.js`, expose `window.aiCliFilePreview = { open, close }` |
| Khung HTML/CSS overlay | `src/terminal/terminalHtml.ts` (`#file-preview-overlay`, `.file-preview-card`, `#file-preview-editor`) |
| Nạp script | `terminalHtml.ts`: `filePreviewJs = webview.asWebviewUri(... 'filePreview.js')` |
| Phía extension | `src/terminal/terminalPanel.ts`: `postFilePreview`, `applyFilePreviewEdit`, `saveFilePreview`, `postFilePreviewError`; state `filePreviewOpen`, `filePreviewPath` |
| Kiểu message | `src/terminal/terminalTypes.ts` |

### Giao thức message hiện tại

Webview → extension:

| type | Payload | Ý nghĩa |
| --- | --- | --- |
| `requestFilePreview` | `path` | Xin nội dung file |
| `closeFilePreview` | — | Đóng preview |
| `filePreviewEdit` | `path`, `content` | Sửa (debounce 180 ms) |
| `filePreviewSave` | `path` | Ctrl+S |

Extension → webview:

| type | Payload |
| --- | --- |
| `filePreviewData` | `path`, `label`, `content`, `language`, `theme` |
| `filePreviewError` | `path`, `message` |

## Cấu trúc đích

```
res/webview/preview/
  index.js        # điều phối: nhận filePreviewData, chọn renderer theo kind
  code.js         # Monaco (chuyển từ filePreview.js)
  markdown.js     # render markdown
  image.js        # raster + svg
  preview.css     # style riêng cho cụm preview

src/preview/
  previewKind.ts      # đuôi file -> 'code' | 'markdown' | 'image' | 'binary'
  previewProvider.ts  # đọc file, kiểm tra kích thước, tạo payload
```

Quy tắc đặt chỗ:

- Chạy trong webview → `res/webview/preview/`. Chạy trong extension host → `src/preview/`.
- Quyết định "file này thuộc loại nào" chỉ ở **một** nơi: `previewKind.ts`. Webview nhận
  `kind` đã quyết định, không tự đoán lại từ đuôi file.
- Không thêm logic preview vào `terminalHtml.ts` (đã > 2000 dòng). Ở đó chỉ giữ: khung overlay,
  thẻ `<script>`/`<link>`, và lệnh gọi `window.aiCliFilePreview.open(path)`.

## Mở rộng giao thức

`filePreviewData` thêm trường `kind`. Mỗi kind mang payload riêng:

| kind | Payload thêm |
| --- | --- |
| `code` | `content`, `language` (như hiện tại) |
| `markdown` | `content` (text md), `baseUri` (để resolve ảnh tương đối) |
| `image` | `src` (URI webview của file, tạo bằng `webview.asWebviewUri`) |
| `binary` | `size`, `mime` nếu biết |

Ảnh dùng `asWebviewUri`, **không** gửi base64 qua message: ảnh lớn sẽ làm nặng kênh message.
Muốn webview đọc được file ngoài extension thì thư mục chứa nó phải nằm trong
`localResourceRoots` của webview (workspace folders).

## Thêm một loại preview mới (quy trình)

1. **`previewKind.ts`**: thêm đuôi file vào bảng ánh xạ, trả về kind mới (vd. `'csv'`).
2. **`previewProvider.ts`**: thêm nhánh tạo payload cho kind đó. Áp giới hạn kích thước
   (xem bên dưới) trước khi đọc.
3. **`terminalTypes.ts`**: mở rộng kiểu `filePreviewData` cho kind mới.
4. **`res/webview/preview/<kind>.js`**: viết renderer. Mỗi renderer export hai hàm:
   `render(host, data)` và `dispose()`.
5. **`res/webview/preview/index.js`**: đăng ký renderer vào bảng `renderers[kind]`.
6. **`terminalHtml.ts`**: nếu renderer là file mới, thêm một thẻ `<script>` với
   `asWebviewUri`. Không cần sửa gì khác.
7. `npm run compile`, F5, thử với file mẫu trong `code_to_test/`.

## Hợp đồng renderer

```js
// res/webview/preview/<kind>.js
(function () {
  'use strict';
  function render(host, data) { /* dựng nội dung vào host */ }
  function dispose() { /* gỡ listener, giải phóng model/object URL */ }
  (window.aiCliPreviewRenderers = window.aiCliPreviewRenderers || {}).<kind> = { render, dispose };
}());
```

- `index.js` gọi `dispose()` của renderer cũ trước khi `render()` renderer mới.
- Renderer không tự `postMessage` ngoài các loại đã định nghĩa; gửi qua
  `window.__AI_CLI_VSCODE_API__` như `filePreview.js` đang làm.
- Renderer chỉ ghi vào `host`, không chạm DOM ngoài nó.

## Bảo mật

- **Markdown**: parse xong phải sanitize HTML (bỏ `<script>`, `on*=`, `javascript:`). Không
  render HTML thô từ file.
- **SVG**: hiển thị bằng `<img src=...>`, **không** inline vào DOM (SVG có thể chứa script).
- **HTML preview** (nếu thêm sau): iframe `sandbox` không có `allow-scripts`, hoặc để trống.
- Đường dẫn file từ webview phải được extension kiểm tra nằm trong workspace trước khi đọc.

## Focus (quan trọng với agent mode)

- Mở preview **không** được gọi `focus()` lên editor/phần tử preview nếu người dùng chưa
  tương tác. `filePreview.js` hiện gọi `editor.focus()` sau `setFile` — khi chuyển sang
  module mới, chỉ focus khi mở do người dùng bấm.
- Đóng preview thì trả focus về terminal: gửi `focusTerminal` (xem `terminalPanel.ts`
  `restoreTerminalFocus`).
- Khi overlay preview đang mở, handler `focusTerminal` với `onlyIfIdle` sẽ bỏ qua — đừng đổi
  hành vi đó; id overlay (`file-preview-overlay`) là một phần của điều kiện.

## Giới hạn kích thước

- Text/code: tái dùng `maxFileLines` (`src/watcher/fileSizeLimit.ts`). Quá giới hạn → hiện
  thông báo, không nạp vào Monaco.
- Ảnh: đề xuất trần ~10 MB; quá thì hiện thông tin file thay vì ảnh.
- Markdown: cùng giới hạn như text.

## Kiểm thử thủ công

Không có test runner, kiểm tra tay trong Extension Development Host:

- [ ] Mở `.ts`, `.json`: tô màu đúng, sửa và Ctrl+S ghi được.
- [ ] Mở `.md`: heading, list, bảng, code block, ảnh tương đối hiển thị đúng.
- [ ] Mở `.md` có `<script>` và link `javascript:`: không chạy.
- [ ] Mở `.png`, `.svg`: hiển thị, svg không chạy script.
- [ ] Mở file `.zip`: hiện thông tin, không lỗi.
- [ ] File vượt giới hạn: có thông báo, không treo.
- [ ] Mở rồi đóng preview: con trỏ về terminal.
- [ ] Alt-tab khi preview đang mở: không bị giật focus (xem `onlyIfIdle`).
- [ ] Mở liên tiếp nhiều loại file: không rò listener/object URL (renderer `dispose`).

## Quyết định còn mở

1. Chuyển `filePreview.js` vào `preview/code.js` hay giữ nguyên và thêm file cạnh nó.
2. Markdown: dùng `marked` (thêm vào `localResourceRoots`) hay renderer tối giản tự viết.
3. Ảnh/markdown có cho sửa không, hay chỉ xem (đề xuất: chỉ xem).
