# Checklist: Build Cursor-style Diff Editor as Custom Editor

Mục tiêu: thay `vscode.diff` bằng một **`CustomTextEditorProvider`** + **webview chứa Monaco**, đạt trải nghiệm inline diff giống Cursor (accept/reject inline, word-level highlight, streaming-aware).

Scope ngoài checklist: language features đầy đủ (IntelliSense, Go to Definition) — chấp nhận yếu trong diff view, giống Cursor.

---

## 0. Setup nền

- [ ] Quyết định engine editor trong webview: **Monaco** (khuyến nghị, parity cao với VS Code) hoặc CodeMirror 6.
- [ ] Thêm Monaco vào bundle: cài `monaco-editor`, cấu hình webpack/esbuild để output worker files (`editor.worker.js`, `ts.worker.js`, v.v.).
- [ ] Tạo thư mục `media/monaco/` chứa Monaco assets, đăng ký `localResourceRoots` cho webview.
- [ ] Quyết định cách phân phối Monaco: copy vào `res/` hay bundle inline (ảnh hưởng `.vscodeignore`).

---

## 1. Custom Editor registration

- [ ] Thêm `contributes.customEditors` vào `package.json`:
  - `viewType: "ai-cli-diff.diffEditor"`
  - `selector`: pattern file workspace (hoặc đăng ký theo URI scheme riêng nếu chỉ mở qua command)
  - `priority: "option"` (user chọn "Open with..." hoặc command tự mở) — **không** dùng `"default"` để không hijack mở file thông thường.
- [ ] Implement `vscode.window.registerCustomEditorProvider(viewType, provider)`.
- [ ] Implement `resolveCustomTextEditor(document, webviewPanel, token)`:
  - [ ] Set `webview.options = { enableScripts: true, localResourceRoots: [...] }`.
  - [ ] Load HTML shell, inject CSP nonce, Monaco loader.
  - [ ] Truyền snapshot (left side) + current text (right side) qua `postMessage` initial payload.

- [ ] Quyết định cách mở:
  - [ ] Option A: thay thế hoàn toàn `vscode.diff` trong `DiffManager` — gọi `vscode.commands.executeCommand('vscode.openWith', uri, viewType)`.
  - [ ] Option B: chỉ mở khi `ai-cli-diff://` URI scheme — giữ `vscode.diff` làm fallback.

---

## 2. Bridge extension ↔ webview

- [ ] Định nghĩa protocol message (TypeScript types dùng chung cả 2 phía):
  - [ ] `init` — { originalText, modifiedText, languageId, theme, hunks, filePath }
  - [ ] `update` — incremental update khi `onDidChangeTextDocument` bắn (file đổi từ ngoài hoặc streaming)
  - [ ] `acceptHunk` / `rejectHunk` — webview → ext, payload: hunk ID
  - [ ] `acceptAll` / `rejectAll`
  - [ ] `nextFile` / `prevFile`
  - [ ] `ready` — webview báo đã mount xong
  - [ ] `themeChanged` — ext → webview khi VS Code đổi theme
  - [ ] `configChanged` — font, tab size, word wrap
- [ ] Serialize/deserialize an toàn, không truyền `Uri` objects raw.
- [ ] Handle webview reload (VS Code có thể recycle webview khi tab inactive lâu) — `retainContextWhenHidden: true` nếu state phức tạp, nhưng tốn RAM.

---

## 3. Monaco diff editor trong webview

- [ ] Khởi tạo `monaco.editor.createDiffEditor` với:
  - [ ] `renderSideBySide: false` (inline mode — chìa khóa của Cursor look)
  - [ ] `originalEditable: false`
  - [ ] `readOnly: false` cho modified side
  - [ ] `diffAlgorithm: 'advanced'` (word-level)
  - [ ] `renderIndicators: true`
  - [ ] `ignoreTrimWhitespace: false` (cần thấy whitespace diff)
- [ ] Set model:
  - [ ] `originalModel = monaco.editor.createModel(snapshot, languageId)`
  - [ ] `modifiedModel = monaco.editor.createModel(currentText, languageId)`
- [ ] Map `vscode.TextDocument.languageId` → Monaco language ID (hầu hết trùng tên).
- [ ] Đăng ký TextMate grammars nếu cần parity màu sắc với VS Code (qua `monaco-textmate` + `vscode-oniguruma`) — optional, đắt.

---

## 4. Theme & styling parity

- [ ] Đọc `vscode.window.activeColorTheme.kind` → map thành Monaco theme (`vs`, `vs-dark`, `hc-black`).
- [ ] Subscribe `vscode.window.onDidChangeActiveColorTheme` → postMessage `themeChanged`.
- [ ] (Tùy chọn nâng cao) Build theme JSON từ `workbench.colorCustomizations` để màu khớp tuyệt đối — phức tạp, để sau.
- [ ] Đọc config và inject:
  - [ ] `editor.fontFamily`, `editor.fontSize`, `editor.lineHeight`
  - [ ] `editor.tabSize`, `editor.insertSpaces`
  - [ ] `editor.wordWrap`, `editor.renderWhitespace`
  - [ ] `editor.minimap.enabled`
- [ ] Subscribe `vscode.workspace.onDidChangeConfiguration` → postMessage `configChanged`.

---

## 5. Inline Accept/Reject UI (ViewZones)

- [ ] Tính hunks từ diff result của Monaco (`diffEditor.getLineChanges()`).
- [ ] Với mỗi hunk, tạo **ViewZone** chèn DOM ngay dưới hunk:
  - [ ] Nút `Accept` (hotkey hint: `⌘Y` / `Ctrl+Y`)
  - [ ] Nút `Reject` (hotkey hint: `⌘N` / `Ctrl+N`)
  - [ ] Counter "Hunk i/n"
- [ ] Style ViewZone đồng bộ theme (border, background — đọc từ Monaco theme colors).
- [ ] Click handler → postMessage `acceptHunk` / `rejectHunk` với hunk ID ổn định.
- [ ] Sau khi hunk được resolve, recompute diff & re-render ViewZones.

---

## 6. Keyboard shortcuts trong webview

- [ ] Đăng ký commands trong Monaco (`editor.addAction` hoặc `addCommand`):
  - [ ] Accept current hunk (cursor's hunk) — `Ctrl+Y`
  - [ ] Reject current hunk — `Ctrl+N` hoặc `Ctrl+Shift+Z`
  - [ ] Next hunk — `F7` / `Alt+Down`
  - [ ] Previous hunk — `Shift+F7` / `Alt+Up`
  - [ ] Next file — `Alt+L` (parity với extension hiện tại)
  - [ ] Previous file — `Alt+H`
  - [ ] Accept all in file — `Ctrl+Shift+Y`
  - [ ] Reject all in file — `Ctrl+Shift+Z`
- [ ] Forward các shortcut "thoát webview" (như `Ctrl+S` save) — VS Code không tự nhận khi webview có focus; cần `postMessage` → ext gọi `document.save()`.

---

## 7. Sync với TextDocument (single source of truth)

- [ ] Modified side là mirror của `document.getText()`:
  - [ ] Khi user gõ trong webview → debounce → gửi `WorkspaceEdit` ra ext → ext apply lên `TextDocument`.
  - [ ] Khi `onDidChangeTextDocument` bắn (từ ext hoặc nguồn khác) → postMessage `update` với delta hoặc full text.
- [ ] Tránh echo loop: track "last edit origin" (webview vs external).
- [ ] Original side là **read-only snapshot** từ `DiffManager`, không sync.
- [ ] Khi accept hunk:
  - [ ] Webview tính diff range, gửi `acceptHunk` payload kèm range.
  - [ ] Ext gọi `DiffManager.acceptHunk()` (đã có logic: update in-memory snapshot, không đụng file).
  - [ ] Ext postMessage `init` lại với snapshot mới → webview re-render.
- [ ] Khi reject hunk:
  - [ ] Ext gọi `DiffManager.revertHunk()` → `WorkspaceEdit` ghi đè text gốc.
  - [ ] `onDidChangeTextDocument` tự fire → webview update.

---

## 8. Streaming-aware behavior

- [ ] Phát hiện file đang được AI ghi liên tục (signal từ `claudeRunner` hoặc `hookWatcher`).
- [ ] Debounce recompute diff (Monaco diff có thể chậm trên file lớn) — throttle 100–200ms.
- [ ] Smooth scroll theo dòng đang được thêm (auto-follow tail nếu cursor user ở cuối).
- [ ] Animation fade-in cho added lines (CSS transition trên decoration class).
- [ ] Disable accept/reject UI khi đang streaming, enable khi stream kết thúc.

---

## 9. Dirty state, save, undo/redo

- [ ] Verify VS Code tự manage dirty dot trên tab khi `WorkspaceEdit` được apply.
- [ ] `Ctrl+S` trong webview:
  - [ ] Webview gửi `save` message → ext gọi `document.save()`.
  - [ ] Alternative: dùng `vscode.commands.registerCommand` cho `workbench.action.files.save` proxy nếu cần.
- [ ] Undo/redo:
  - [ ] Nếu mọi mutation đi qua `WorkspaceEdit`, VS Code tự build undo stack — `Ctrl+Z` ngoài webview hoạt động.
  - [ ] Bên trong webview, Monaco có undo stack riêng — cần disable hoặc bridge ra ext để tránh 2 stacks lệch.
  - [ ] Đề xuất: **disable Monaco undo**, forward `Ctrl+Z` ra ext.

---

## 10. Find / Replace

- [ ] Monaco có sẵn Find Widget (`Ctrl+F`) — verify hoạt động trong webview.
- [ ] Replace (`Ctrl+H`) — verify, hoặc disable nếu xung đột với VS Code shortcut bên ngoài.
- [ ] (Tùy chọn) Hide Monaco Find, forward ra VS Code's Find — phức tạp, skip cho v1.

---

## 11. Minimap & scrollbar diff indicators

- [ ] Bật Monaco minimap, custom màu cho added/removed lines.
- [ ] Scrollbar markers cho mỗi hunk — Monaco support qua `OverviewRulerLane`.
- [ ] Click marker → scroll tới hunk tương ứng.

---

## 12. Multi-file navigation

- [ ] Webview header bar:
  - [ ] Tên file hiện tại
  - [ ] Counter "File i/n pending"
  - [ ] Nút prev/next file
- [ ] Click prev/next → postMessage → ext:
  - [ ] Lấy file kế tiếp từ `NavigationManager`.
  - [ ] Gọi `vscode.commands.executeCommand('vscode.openWith', nextUri, viewType)`.
  - [ ] VS Code reuse cùng custom editor tab nếu set đúng `viewColumn`.

---

## 13. Persistence & restore

- [ ] Khi VS Code restart, custom editor được restore tự động cho mỗi tab đang mở.
- [ ] `resolveCustomTextEditor` được gọi lại với cùng `document` — `DiffManager` snapshot từ workspace state vẫn còn → re-init webview như bình thường.
- [ ] Test edge case: file đã thay đổi trên đĩa giữa các session restart → invalidate snapshot, đóng diff.

---

## 14. Path normalization & Windows quirks

- [ ] Mọi path so sánh đi qua `vscode.Uri.file(...).fsPath` + lowercase trên Windows (parity với codebase hiện tại — load-bearing theo `CLAUDE.md`).
- [ ] Webview URIs: dùng `webview.asWebviewUri()` cho mọi resource.
- [ ] CSP đầy đủ, không inline script trừ qua nonce.

---

## 15. Performance budget

- [ ] File > 5000 dòng: lazy compute diff, chỉ render viewport visible.
- [ ] File > 20000 dòng: cân nhắc disable word-level diff, fallback line-level.
- [ ] Profile Monaco diff compute time, đặt timeout warning.
- [ ] Test file binary / file rất lớn → fallback graceful về `vscode.diff` cũ.

---

## 16. Test plan (manual)

- [ ] Mở 1 file `.md` qua hook flow → custom editor hiện ra, snapshot bên trái, current bên phải.
- [ ] Edit modified side → save → file trên đĩa đổi.
- [ ] Accept 1 hunk → snapshot bên trái update, hunk biến mất.
- [ ] Reject 1 hunk → file trên đĩa revert dòng đó.
- [ ] Accept all → diff đóng, file mở ở editor thường (parity với behavior hiện tại của `DiffManager.cleanup`).
- [ ] Reject all → file revert hoàn toàn.
- [ ] Streaming: chạy Claude session, verify diff cập nhật dần, không flicker.
- [ ] Đổi theme dark ↔ light → editor đổi theo.
- [ ] Đổi `editor.fontSize` trong settings → editor cập nhật.
- [ ] Restart VS Code khi đang có pending diff → restore đúng.
- [ ] Multi-file: edit 5 file, navigate prev/next, accept lần lượt.
- [ ] File path có dấu cách / Unicode / lowercase mismatch (Windows).

---

## 17. Migration & rollback

- [ ] Feature flag `ai-cli-diff-view.useCustomDiffEditor` (default: false trong v1).
- [ ] Khi flag off → fallback về `vscode.diff` cũ (giữ code path hiện tại).
- [ ] Sau khi stable, default flag on, schedule deprecate code path cũ.

---

## 18. Những thứ KHÔNG build (out of scope v1)

- Language services đầy đủ (hover, completion, go-to-def) trong diff view.
- LSP proxy từ ext host vào Monaco webview.
- Codex/Qwen-specific streaming nuances (chỉ test Claude pipeline trước).
- Tích hợp với extension khác đang decorate editor (GitLens, ESLint inline) — chấp nhận mất.
- Diff cho file binary, image, notebook (.ipynb).

---

## Thứ tự build đề xuất

1. Setup Monaco trong webview (section 0, 1, 3) — verify mở được file, render text.
2. Bridge messages + sync 1 chiều: ext → webview (section 2, 7 phần đọc).
3. Inline diff render với ViewZones giả lập (section 5 không có logic accept).
4. Wire accept/reject end-to-end qua `DiffManager` (section 7 phần ghi, section 5 logic).
5. Theme + config parity (section 4).
6. Keyboard shortcuts (section 6).
7. Multi-file navigation (section 12).
8. Streaming polish (section 8).
9. Performance + edge cases (section 15, 16).
10. Feature flag rollout (section 17).
