# Diff View — Luồng hoạt động hiện tại

Mô tả luồng thực tế của phần diff view sau khi đã refactor sang Monaco webview
(commit `d38e209` "bản mới 3.0.0 thay hoàn toàn diff view" và `5639ef4`).
Tài liệu này phản ánh code đang có trong repo, không phải kiến trúc cũ trong `CLAUDE.md`
(có nhắc tới `inlineDiffRenderer`, `hunkCodeLensProvider`, `sessionPanel` — những
file đó đã bị bỏ).

---

## 1. Thành phần chính

| File | Vai trò |
| --- | --- |
| `src/extension.ts` | Entry point. Khởi tạo `DiffManager`, các watcher, custom editor provider, NavBar, terminal, đăng ký command, gắn auto-route tab. |
| `src/diff/diffManager.ts` | Trung tâm state. Giữ snapshot (left side), registry panel theo file, last-cursor, persistence, accept/revert ở mức file & hunk. |
| `src/diff/diffWebviewPanel.ts` | `CustomTextEditorProvider` (viewType `ai-cli-diff-view.diffEditor`). Mỗi pending file = 1 tab webview Monaco riêng. Cầu nối message ↔ `DiffManager`. |
| `src/diff/hunkCalculator.ts` | LCS-based line diff → mảng `Hunk { id, modifiedStart, originalStart, removedLines, addedLines }`. |
| `src/diff/snapshotStore.ts` | Persist snapshot vào `workspaceState['ai-cli-diff.snapshots']`, có backward-compat với shape cũ (string). |
| `src/diff/navigationManager.ts` | Tính prev/next pending file cho NavBar; chuyển file qua `DiffManager.openDiff()`. |
| `src/views/navBarPanel.ts` | Sidebar webview hiển thị Accept/Reject File, Accept All Changes, prev/next file, counter. |
| `src/watcher/hookWatcher.ts` | Pipeline 1 — đọc signal JSON do `hooks/post-tool-hook.js` ghi vào temp dir. |
| `src/watcher/workspaceWatcher.ts` | Pipeline 2 — fallback `FileSystemWatcher` + `onDidSaveTextDocument` cho mọi external write không qua hook. |
| `src/watcher/fileSnapshotStore.ts` | Baseline content theo workspace folder để watcher có thể so sánh "before/after". |
| `src/watcher/gitBranchWatcher.ts` | Quan sát `.git/HEAD`, set suppress window trên `WorkspaceWatcher` khi đổi branch để không nổ diff giả. |
| `res/webview/diff.monaco.{js,css}` | Frontend webview: load Monaco từ `node_modules/monaco-editor/min`, render decorations + view-zones, toolbar buttons, gửi message accept/reject/edit. |

---

## 2. Khởi động (activate)

`extension.ts:13-151` — trên `onStartupFinished`:

1. Khởi tạo `DiffManager` (đọc snapshot persistent qua `SnapshotStore.load()` —
   bỏ entry mà file vật lý không còn).
2. Khởi tạo `WorkspaceWatcher`, `HookWatcher`, `GitBranchWatcher`, `NavigationManager`.
3. `registerCustomEditorProvider(DIFF_EDITOR_VIEW_TYPE, DiffEditorProvider, { retainContextWhenHidden: true, supportsMultipleEditorsPerDocument: false })`.
4. Đăng ký `NavBarPanel` (sidebar webview) và `TerminalPanelProvider`.
5. Lần đầu chạy: di chuyển panel terminal sang auxiliary bar (best-effort, có flag
   `globalState['ai-cli-diff-view.terminal.movedToRight']`).
6. `fsHookWatcher.start()`, `workspaceWatcher.start()`, `gitBranchWatcher.start()`.
7. `registerAllCommands(...)` (start session, accept/revert, accept-all-pending,
   install hooks, openPendingFile).
8. Đăng ký command `nextFile`/`prevFile`.
9. **NavBar refresh**: lắng nghe `diffManager.onDidChangeDiffs` và
   `vscode.window.tabGroups.onDidChangeTabs` → gọi `updateNavBarState()` (set context
   key `ai-cli-diff-view.hasPendingDiff`, gọi `navBarPanel.update(...)`).
10. **Auto-route tab**: bất kỳ `TabInputText` nào mở mà file đó đang có pending diff
    sẽ bị close và mở lại bằng custom editor (`diffManager.openDiff`). Áp dụng cho
    cả tab đã mở sẵn lúc activate và tab mở sau (`onDidChangeTabs.opened/changed`).

---

## 3. Hai pipeline phát hiện edit

### 3.1 Hook pipeline (AI CLI bên ngoài, ví dụ `claude` chạy trong terminal khác)

```
pre-tool-hook.js   → snapshot file vào tmpdir/ai-cli-diff-snapshots/
post-tool-hook.js  → ghi signal JSON vào tmpdir/ai-cli-diff-signals/
HookWatcher (fs.watch tmpdir/ai-cli-diff-signals/)
   → debounce 150ms → processSignal()
   → bỏ qua nếu filePath không thuộc workspaceFolders hiện tại
     (không unlink — để VS Code window khác đọc)
   → đọc snapshot content (+ optional meta { fileExistedBefore, timestamp })
   → diffManager.loadSnapshot(filePath, content, fileExistedBefore)
   → diffManager.openDiff(filePath)
```

- `start()` còn `pruneOldSignals()` (xóa signal cũ > 24h) và `drainExisting()`
  (xử lý các signal còn sót từ lần chạy trước).
- Cài hooks: command `ai-cli-diff-view.installHooks` ghi `~/.claude/settings.json`
  (path lấy từ `runner.getSettingsFilePath()` của `claudeRunner`) với
  `PreToolUse`/`PostToolUse` matcher = `Write|Edit|MultiEdit|...`. Trên Windows
  còn cài thêm `Notification` + `Stop` để phát âm thanh.

### 3.2 Workspace watcher (fallback)

```
WorkspaceWatcher.start()
  ├── onDidSaveTextDocument           → cập nhật baseline trong FileSnapshotStore
  │                                     + đánh dấu savedFilesByVsCode (window 2s)
  └── vscode.workspace.createFileSystemWatcher('**/*')
       ↓ onDidChange / onDidCreate
       handleExternalWrite(filePath):
         - skip nếu isExcludedPathSegment (node_modules, bin/obj, ...)
         - skip nếu vừa save bởi VS Code (< 2s)
         - debounce per-file 500ms
         - skip nếu không phải text file hoặc ngoài workspace
         - setTimeout(200ms) → đọc lại file
            - re-check savedFilesByVsCode (race)
            - nếu isSuppressed() (git branch switch window): chỉ refresh baseline,
              không tạo diff
            - so sánh old/new (đã normalize trim + \r\n→\n)
            - nếu chưa có baseline: lưu baseline mới, chỉ trigger diff khi content
              non-empty (coi là file mới được tạo)
            - nếu khác baseline và chưa có pending: triggerDiff()
              → loadSnapshot + openDiff
```

`GitBranchWatcher` gọi `workspaceWatcher.notifyExternalBatch(5000)` khi
`.git/HEAD` thay đổi: clear baseline + set `suppressUntil = now + 5s`. Trong window
này mọi fs event chỉ rebuild baseline, không nổ diff.

---

## 4. Mô hình state của một file pending

`DiffManager.snapshots: Map<normalizedPath, SnapshotState>`:

```ts
SnapshotState = { content: string; fileExistedBefore: boolean }
```

- `content` = snapshot left-side (nội dung TRƯỚC khi AI sửa).
- `fileExistedBefore` = quyết định revert toàn bộ sẽ ghi đè content hay xóa file.
- Persist qua `SnapshotStore` mỗi lần `snapshots` đổi.

Path normalize: `vscode.Uri.file(path.resolve(p)).fsPath`, lower-case trên Windows.
Khi gọi VS Code API (mở tab, show document) dùng `canonicalCasePath()` (qua
`fs.realpathSync.native`) để case hiển thị đúng như trên disk.

`DiffManager` còn giữ:
- `panels: Map<path, WebviewPanel>` — registry panel đang mở để `openDiff()` có thể
  `reveal` thay vì tạo trùng tab. Mỗi `DiffEditorProvider.resolveCustomTextEditor`
  gọi `registerPanel`, `onDidDispose` gọi `unregisterPanel`.
- `lastCursors: Map<path, {line, column}>` — vị trí cursor cuối thấy từ Monaco, dùng
  để reopen text editor sau accept/revert tại đúng chỗ.

---

## 5. Mở diff

```
DiffManager.openDiff(filePath):
  - normalize path
  - nếu chưa có snapshot → return (chỉ mở khi loadSnapshot đã gọi)
  - đọc modifiedContent từ disk
  - calculateHunks(snapshot, modified)
       → nếu 0 hunks: xóa snapshot, fire onDidChangeDiffs, return
  - nếu đã có panel cho file đó: panels.get(absPath).reveal()
  - closeTextTabsFor(absPath): đóng mọi TabInputText cũ của file này
    (tránh có 2 tab cùng file: text + diff)
  - vscode.commands.executeCommand('vscode.openWith', uri, DIFF_EDITOR_VIEW_TYPE,
    { preview: false })
  - fire onDidChangeDiffs
```

VS Code sau đó gọi `DiffEditorProvider.resolveCustomTextEditor(document, panel)`:

1. Cấu hình webview options + CSP (`worker-src blob:` cho Monaco's no-op worker).
2. `buildHtml(...)`: nhúng toolbar (prev/next hunk + counter + Reject/Accept,
   prev/next file + counter, tên file), `<div id="container">`, load
   `node_modules/monaco-editor/min/vs/loader.js` + `res/webview/diff.monaco.js`.
3. `diffManager.registerPanel(filePath, panel)`.
4. Đăng ký listener:
   - `webview.onDidReceiveMessage` → dispatch ready/acceptHunk/rejectHunk/editModified/
     acceptAll/rejectAll/nextFile/prevFile/save/undo/redo/cursor.
   - `vscode.workspace.onDidChangeTextDocument` (cùng document) → `postSet()` re-push.
   - `diffManager.onDidChangeDiffs` → `postSet()` re-push (cập nhật nav, hunk count).
   - `onDidChangeActiveColorTheme` → `theme-change`.
   - `onDidChangeConfiguration('editor')` → `config-change`.
5. Khi webview gửi `ready`: `postSet()` push payload đầu tiên.

Payload `set`:

```ts
{
  type: 'set',
  filePath,
  language,           // detectLanguageId từ extension
  originalContent,    // snapshot
  currentContent,     // document.getText()
  hunks,              // Hunk[]
  theme,              // 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
  editorConfig,       // fontFamily, fontSize, tabSize, wordWrap, minimap...
  nav: { currentIdx, total }
}
```

---

## 6. Render trong Monaco webview (`res/webview/diff.monaco.js`)

- Tạo `monaco.editor.create()` thường (không phải DiffEditor) — model = current
  content, decorations + view-zones tự render từ `hunks`.
- `renderDiffDecorations()`:
  - Mỗi `addedLine` → decoration whole-line class `diff-added-line` (xanh).
  - Mỗi hunk có `removedLines` → view-zone phía trên `modifiedStart`,
    `heightInLines = removedLines.length`, mỗi dòng class `diff-removed-line` (đỏ).
- `renderHunkWidgets()` → các nút overlay "Accept hunk / Reject hunk" cạnh hunk.
- Toolbar:
  - Prev/Next hunk: di chuyển cursor + reveal.
  - Reject/Accept (toàn file) → message `rejectAll`/`acceptAll`.
  - Prev/Next file → `prevFile`/`nextFile`.
- Edit nội dung: debounce 200ms → gửi `editModified { newCurrent }`.
- Cursor change: debounce 150ms → gửi `cursor { line, column }` để
  `DiffManager.setLastCursor` lưu lại.
- `setInFlight(true)` khi đang đợi extension xử lý action, disable hết button cho
  tới `set` mới.

CSP cho phép `script-src 'unsafe-eval'` (Monaco AMD loader cần) và `worker-src blob:`
(workaround Monaco gọi worker — webview cung cấp blob no-op để không lỗi).

---

## 7. Accept / Reject

### 7.1 Toàn file

`DiffManager.accept(filePath)` — file trên disk đã có currentContent rồi, chỉ
việc dọn state:

1. Tính `nextTarget` = pending file kế tiếp (theo thứ tự `snapshots.keys()`).
2. `snapshots.delete()` + `store.save()`.
3. `closePanel(absPath)` (dispose webview panel).
4. `reopenAsTextEditor(absPath)`: mở lại file dưới dạng text editor thường tại
   `lastCursor` đã lưu (nếu có), xóa khỏi `lastCursors`.
5. Nếu có `nextTarget`: `openDiff(nextTarget)` để tự nhảy sang file kế.
6. Fire `onDidChangeDiffs`.

`DiffManager.revert(filePath)`:

- Nếu `fileExistedBefore`: `writeFile(absPath, snapshot.content)` (ghi qua
  `WorkspaceEdit` nếu đang có document mở để tránh đè dirty edit của user, fallback
  `workspace.fs.writeFile`).
- Nếu không: `deleteFile(absPath)`.
- Sau đó dọn snapshot, đóng panel, reopen text editor (chỉ khi file tồn tại lại),
  rồi nhảy sang next pending nếu có.

`DiffManager.acceptAllPending()` — clear toàn bộ snapshots và đóng mọi panel,
trả về `count` cho command toast.

### 7.2 Mức hunk (gọi từ webview)

Webview tự compute `newOriginal` + `newCurrent` (vì chỉ webview biết text Monaco
đang giữ, có thể đã edit thêm) rồi gửi message:

`applyHunkAcceptFromWebview(filePath, newOriginal, newCurrent)`:

1. Cập nhật `snapshot.content = newOriginal` (snapshot "trồi lên" để bao gồm hunk
   đã accept), persist.
2. Nếu `newOriginal === newCurrent` (không còn hunk nào): gọi `accept(absPath)`
   để dọn + nhảy file tiếp.
3. Ngược lại: fire `onDidChangeDiffs` → provider tự `postSet()` lại để webview
   redraw với hunks còn lại.

`applyHunkRejectFromWebview(filePath, newOriginal, newCurrent)`:

1. `writeFile(absPath, newCurrent)` — apply rollback ra disk.
2. Nếu sau write hết diff (`newOriginal === newCurrent`):
   - Nếu file vốn không tồn tại trước đó và `newCurrent` rỗng → delete file.
   - Tính next pending, xóa snapshot, đóng panel, mở next.
3. Fire `onDidChangeDiffs`.

Lưu ý asymmetry: **Accept ⇒ chỉ sửa snapshot trong RAM**; **Reject ⇒ ghi disk thật**.
Đây là invariant đã định: file trên disk luôn là "current" Claude vừa ghi cho đến
khi user reject.

---

## 8. Điều hướng giữa pending files

Hai đường:

1. **NavBar (sidebar)** — `NavigationManager.getNavigationInfo(activePath)` cấp
   tên prev/next + counter. Nút bấm → execute command `nextFile`/`prevFile` →
   `NavigationManager.navigate(±1)` → `diffManager.openDiff(target)`.
2. **Toolbar trong diff editor** — webview gửi message `nextFile`/`prevFile` →
   `DiffEditorProvider.gotoSibling()` → cũng gọi `openDiff(target)`.

Cập nhật NavBar:
- `diffManager.onDidChangeDiffs` → `updateNavBarState()`.
- `tabGroups.onDidChangeTabs` → `updateNavBarState()` (để counter đúng khi user
  tự đóng tab diff).
- Context key `ai-cli-diff-view.hasPendingDiff` đồng bộ để các keybinding
  (`Alt+H/L`) chỉ active khi có pending.

---

## 9. Persist & restore qua reload window

- `SnapshotStore.save` chạy sau mỗi mutate `snapshots`. Key:
  `workspaceState['ai-cli-diff.snapshots']`.
- `SnapshotStore.load` lúc activate đọc lại, **bỏ entry mà file vật lý không còn**
  (`fs.existsSync(absPath)`), normalize backward-compat.
- Tuy nhiên: chỉ snapshot là persistent, **không tự reopen diff tab** sau reload.
  Tab diff được mở khi:
  - Có signal hook mới đến, hoặc
  - Watcher phát hiện ghi mới, hoặc
  - User tự mở file (auto-route trong `extension.ts:125-148` sẽ thấy
    `hasPendingDiff` và chuyển sang custom editor).
- `gitBranchWatcher` có thể gọi `diffManager.clearAll()` (qua `SnapshotStore.clear()`)
  để xóa cả persistent state khi đổi branch.

---

## 10. Sơ đồ luồng tổng quát

```
                         AI CLI (Claude bên ngoài)
                                 │
                                 ▼
              hooks/pre-tool-hook.js  → snapshot vào tmpdir
              hooks/post-tool-hook.js → signal JSON
                                 │
                                 ▼
                  HookWatcher.processSignal()
                                 │
                                 ▼
              ┌──────────────────────────────────────┐
              │  DiffManager                          │
              │    .loadSnapshot(path, content, ex)   │
              │    .openDiff(path)                    │◀── WorkspaceWatcher
              │                                       │   (fallback fs event)
              └──────────────────────────────────────┘
                                 │
              vscode.openWith → DIFF_EDITOR_VIEW_TYPE
                                 │
                                 ▼
                     DiffEditorProvider
                  .resolveCustomTextEditor()
                  ─ buildHtml (Monaco + diff.monaco.js)
                  ─ registerPanel
                  ─ postSet (ready, doc change, diffs change)
                                 │
                                 ▼
                       Monaco webview
                  ─ decorations (added line)
                  ─ view-zones (removed line)
                  ─ hunk overlay widgets
                  ─ toolbar: hunk nav, file nav, accept/reject
                                 │
                       message ↑↓
                                 │
              acceptHunk / rejectHunk / acceptAll / rejectAll /
              editModified / nextFile / prevFile / cursor
                                 │
                                 ▼
              DiffManager.applyHunk*  /  .accept  /  .revert
                  ─ snapshot mutate (left) hoặc writeFile (right)
                  ─ closePanel + reopenAsTextEditor
                  ─ openDiff(nextTarget) nếu còn pending
                                 │
                                 ▼
                   onDidChangeDiffs → NavBar refresh
                                       (+ context key)
```

---

## 11. Một số ràng buộc đáng nhớ

- **Path normalize load-bearing**: mọi key của `snapshots`, `panels`, `lastCursors`
  đều phải đi qua `normalizePath`. Khi gọi VS Code API mà cần case hiển thị đúng,
  dùng `canonicalCasePath`.
- **Snapshot vs writeFile**: nguyên tắc "accept = sửa snapshot, reject = ghi disk"
  được hold ở cả mức file lẫn mức hunk. Đảo lại sẽ làm sai phía left của diff.
- **writeFile khi document đang dirty**: `DiffManager.writeFile()` ưu tiên
  `WorkspaceEdit.replace` + `doc.save()` nếu document đang mở (tránh ghi đè dirty
  edit) — fallback `workspace.fs.writeFile` khi không có document.
- **`worker-src blob:` trong CSP**: bắt buộc vì Monaco AMD bundle vẫn cố tạo
  worker; webview cung cấp blob no-op (`getWorkerUrl`) để không lỗi.
- **Auto-route**: nếu file đang pending mà ai đó mở dưới dạng text editor (vd
  command palette, click tree), tab text sẽ bị đóng và mở lại bằng custom editor —
  để không có 2 view cho cùng 1 file.
- **`retainContextWhenHidden: true`** trên custom editor để Monaco không bị mount
  lại khi user chuyển tab qua tab khác rồi quay về.
