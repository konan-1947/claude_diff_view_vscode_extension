# Onboarding — AI CLI Diff View

Guideline cho người mới nhận maintain repo. Mục tiêu: hiểu **bài toán**, **kiến trúc hiện tại**, **các invariant không được phá**, và **cách thêm feature an toàn**.

> Nguồn sự thật (source of truth) về kiến trúc là [CLAUDE.md](../CLAUDE.md) — nó là bản mô tả cập nhật nhất.
> Một số tài liệu cũ đã **lỗi thời một phần**, xem mục [Tài liệu nào tin được](#8-tài-liệu-nào-tin-được).

---

## 1. Bài toán extension giải quyết

Khi một AI CLI agent (Claude, Codex, Qwen, …) sửa file trong workspace, nó ghi thẳng ra disk — user **không có bước review** như khi dùng Cursor. Extension này chèn lại bước đó:

1. Chụp **before-image** (snapshot) của file trước khi bị AI ghi.
2. Phát hiện **after-image** khi file bị ghi ra disk.
3. Hiện một diff review được (Monaco DiffEditor trong webview), cho **accept/revert từng khối (hunk), từng file, hoặc tất cả**.

Điểm cốt lõi về triết lý: **file trên disk luôn là bản "current" mà AI vừa ghi**, cho đến khi user *reject*. Accept chỉ dời baseline trong RAM; Reject mới ghi lại disk. Xem [invariant](#5-các-invariant-không-được-phá).

Phạm vi hỗ trợ:
- **Review edit**: mọi AI CLI, phát hiện đồng nhất qua workspace watcher — không cần hook, không cần cấu hình.
- **Launch built-in (`startSession`)**: chỉ Claude (`ClaudeRunner`).

---

## 2. Bản đồ nhanh codebase

`src/` (~7k LOC TS, strict mode). Entry: [src/extension.ts](../src/extension.ts), activate `onStartupFinished`.

| Vùng | File | Vai trò |
| --- | --- | --- |
| **Entry** | `extension.ts` | Wire mọi thứ: DiffManager, watchers, custom editor, terminal panel, commands, auto-route tab. |
| **Diff state** | `diff/diffManager.ts` (542 LOC) | **Trái tim.** Snapshot map (left side), panel registry, last-cursor, accept/revert mức file + hunk, persistence. |
| | `diff/hunkCalculator.ts` (506) | Tính `Hunk[]` từ snapshot vs current (thư viện `diff`/Myers). Có `groupId` gom khối. |
| | `diff/diffWebviewPanel.ts` (384) | `CustomTextEditorProvider` (`DiffEditorProvider`). Cầu message webview ↔ DiffManager. |
| | `diff/snapshotStore.ts` | Persist snapshot vào `workspaceState['ai-cli-diff.snapshots']` (sống qua reload). |
| | `diff/navigationManager.ts` | prev/next pending file. |
| | `diff/eol.ts` | Detect/convert EOL (LF ↔ CRLF) — quan trọng để không tạo diff giả toàn file. |
| **Webview FE** | `res/webview/diff.monaco.{js,css}` | Monaco từ `node_modules`, render decorations + view-zones + nút accept/reject, gửi postMessage. |
| **Phát hiện edit** | `watcher/workspaceWatcher.ts` (389) | **Đường phát hiện chính.** save event + `FileSystemWatcher` cho mọi external write. |
| | `watcher/baselineScanner.ts` / `baselineStore.ts` / `fileTypeRules.ts` | Scan, lưu baseline theo folder và xác định rule file text. |
| | `watcher/gitBranchWatcher.ts` (308) | Theo dõi `.git/HEAD` + reflog để phân biệt git op với AI edit. |
| | `watcher/writeBurstMeter.ts` | Đếm burst (git checkout vs AI edit). |
| | `watcher/pathExclusions.ts`, `fileSizeLimit.ts` | Lọc path / giới hạn số dòng. |
| **Runner** | `runner/claudeRunner.ts` (270) | Spawn `claude` stream-json, snapshot trước Write/Edit/MultiEdit. Dùng bởi `startSession`. |
| | `runner/runnerFactory.ts`, `aiRunner.ts` | Factory + interface runner. |
| **Terminal** | `terminal/terminalPanel.ts` (569) | PTY terminal (xterm + node-pty) + trang pending-files/status. |
| | `terminal/terminalHtml.ts` (1530) | Shell webview + Settings popover. |
| | `terminal/ptySession.ts`, `fontInstaller.ts` | Wrapper node-pty; cài font. |
| **UI khác** | `views/diffActionPanel.ts`, `views/navBarPanel.ts` | Panel action / nav. |
| **Commands** | `commands/commandsRegistry.ts` | Đăng ký các command (`startSession`, accept/revert…). |
| | `commands/soundNotifications.ts` | Ghi hook `Notification`/`Stop` vào `~/.claude/settings.json` (Windows, âm thanh) — **không liên quan diff**. |

---

## 3. Luồng dữ liệu (đường chính, đã bỏ hook pipeline)

```
AI CLI ghi file ra disk
        │
        ▼
WorkspaceWatcher (onDidSaveTextDocument + FileSystemWatcher '**/*')
  - skip: path excluded / vừa save bởi VS Code (<2s) / không phải text / ngoài workspace / vượt maxFileLines
  - debounce per-file, so old baseline vs new (đã normalize EOL+trim)
  - burst? → hold trong heldWrites, chờ GitBranchWatcher xác nhận branch change
        │  (nếu là git op → notifyExternalBatch() drop held writes, rebuild baseline)
        ▼
DiffManager.loadSnapshot(path, contentTrước, fileExistedBefore)
DiffManager.openDiff(path)
        │
        ▼  vscode.openWith → viewType 'ai-cli-diff-view.diffEditor'
DiffEditorProvider.resolveCustomTextEditor()
  - buildHtml (Monaco + diff.monaco.js), registerPanel, postSet(payload)
        │
        ▼  Monaco webview: decorations (dòng thêm) + view-zones (dòng xoá) + nút accept/reject
        │  message ↑↓
        ▼
DiffManager.applyHunkAccept/Reject | accept | revert
  - accept  = dời snapshot trong RAM  (KHÔNG ghi disk)
  - reject  = writeFile ra disk       (rollback)
  - hết hunk → cleanup: xoá snapshot, đóng panel, reopen text editor tại cursor cũ, nhảy file kế
        │
        ▼
onDidChangeDiffs → cập nhật nav bar + context key 'ai-cli-diff-view.hasPendingDiff'
```

`GitBranchWatcher`:
- `.git/HEAD` đổi (branch switch/checkout) → `diffManager.clearAll()` (snapshot cũ vô nghĩa với working tree khác).
- reflog `.git/logs/HEAD` khớp `pull|merge|rebase (finish)|reset` cùng branch → `notifyExternalBatch()` (drop held writes, rebuild baseline) **nhưng không** clear diff đang mở. `commit`/`checkout` cố ý bị loại khỏi regex này. Chi tiết: [GIT_VS_AI_EDIT_DETECTION.md](GIT_VS_AI_EDIT_DETECTION.md).

---

## 4. Hai trục "hunk" vs "group" — chỗ dễ nhầm nhất

Trong Monaco webview có **hai không gian chỉ số khác nhau**:

- **Hunk** (mịn, tới từng cặp dòng): dùng để **render** — để dòng đỏ nằm đúng trên dòng xanh thay thế nó.
- **Group / khối** (`groupId`, gộp các hunk liền kề): dùng cho **thao tác** — mỗi khối có **một** cặp nút Accept/Reject, và prev/next hunk (F7) nhảy theo **khối**.

`state.groups` dựng ngay khi nhận `set`; sau đó hover/nav/command **không đụng** `state.hunks` nữa. Nếu định sửa logic accept/reject hoặc navigation, đọc kỹ mục 6 của [DIFF_VIEW_FLOW.md](DIFF_VIEW_FLOW.md) (phần luồng cũ đã stale nhưng phần render/group vẫn đúng).

---

## 5. Các invariant KHÔNG được phá

Sửa code diff mà quên các điểm này gần như chắc chắn gây bug:

1. **Accept = sửa snapshot RAM; Reject = ghi disk.** Đảo lại làm sai phía trái (left/original) của diff. Áp dụng ở cả mức file lẫn mức khối.
2. **Path normalization load-bearing.** Mọi key của `snapshots`/`panels`/`lastCursors` phải qua `normalizePath()` (`Uri.file(resolve(p)).fsPath`, lowercase trên Windows). Khi gọi VS Code API cần case hiển thị đúng → `canonicalCasePath()` (`fs.realpathSync.native`).
3. **EOL & trim normalize trước khi so sánh.** Không normalize → mở diff giả toàn file (CRLF vs LF). Xem `eol.ts` + [BUG_ISSUE_15_FULL_FILE_DIFF.md](BUG_ISSUE_15_FULL_FILE_DIFF.md).
4. **`fileExistedBefore`** quyết định Revert-all ghi đè content hay **xoá file**. File vượt `maxFileLines` được ghi vào `sizeSkipped` để lần sau nó tụt xuống dưới ngưỡng không bị nhầm là file mới (nếu nhầm → "Revert all" xoá mất file).
5. **writeFile khi document đang dirty**: ưu tiên `WorkspaceEdit.replace` + `doc.save()` (tránh đè dirty edit của user), fallback `workspace.fs.writeFile`.
6. **Snapshot persistent nhưng diff tab thì không.** Sau reload window, snapshot còn (bỏ entry mà file vật lý đã mất), nhưng tab diff chỉ mở lại khi: có write mới, hoặc user tự mở file (auto-route trong `extension.ts` chuyển tab text → custom editor).
7. **CSP webview**: `script-src 'unsafe-eval'` (Monaco AMD loader) + `worker-src blob:` (blob no-op cho worker Monaco). Đừng siết chặt hai cái này.

---

## 6. Vòng lặp phát triển

```bash
npm install
npm run compile      # tsc -p ./ → out/  — GATE tối thiểu, phải sạch lỗi
npm run watch        # dev loop
npx @vscode/vsce package   # đóng .vsix
```

- **F5** mở Extension Development Host (`.vscode/launch.json`). Recompile xong phải **reload host**.
- **Không có lint/formatter/test runner.** `npm run compile` là cổng đúng-sai duy nhất tự động. Còn lại **test tay** với file mẫu trong [code_to_test/](../code_to_test): render diff, accept/revert theo hunk/file/all, nav Alt+H/Alt+L.
- **node-pty là native module.** Nếu terminal tích hợp fail load (ABI mismatch với Electron của VS Code) → rebuild bằng `@electron/rebuild`. Không có postinstall tự làm việc này.
- Monaco/xterm nạp thẳng từ `node_modules/` qua `localResourceRoots`, **không có bước bundle asset**.
- Style: 2-space, semicolons, single quotes, `PascalCase` class/provider, `camelCase` hàm/biến, `kebab-case` tên file asset.

---

## 7. Công thức thêm feature (recipes)

**Thêm một command mới**
1. Khai báo trong `package.json` → `contributes.commands` (+ `keybindings` nếu cần, có thể gate bằng `when: ai-cli-diff-view.hasPendingDiff`).
2. Đăng ký trong `commands/commandsRegistry.ts` (nhận `CommandDeps`: diffManager, panel, context, getRunner/setRunner).
3. Cập nhật bảng command trong `README.md` + `CLAUDE.md`.

**Thêm một message accept/reject/… giữa webview và extension**
- FE gửi trong `res/webview/diff.monaco.js`; xử lý ở `onDidReceiveMessage` trong `diff/diffWebviewPanel.ts`; logic state ở `diff/diffManager.ts`. **Không** đăng ký thành VS Code command — hunk-level đi qua postMessage.

**Thêm một setting**
- `package.json` → `contributes.configuration.properties` (prefix `ai-cli-diff-view.`).
- Đọc setting + refresh trên `onDidChangeConfiguration` trong `extension.ts` (xem mẫu `refreshTextFileRules`/`refreshFileSizeLimit`).
- Nếu muốn hiện trong Settings popover của terminal → sửa `terminal/terminalHtml.ts` (dùng chung config `ai-cli-diff-view.*`, không phải storage riêng).

**Hỗ trợ một loại AI runner mới (built-in launch)**
- Implement interface `IAiRunner` (`runner/aiRunner.ts`), thêm nhánh detect trong `runner/runnerFactory.ts`. Lưu ý đường này phải tôn trọng `maxFileLines` (xem `snapshotBefore` trong `diffManager.ts`).

**Đổi rule file nào là "text/reviewable"**
- `watcher/fileTypeRules.ts` → `refreshTextFileRules()` / `isTextFile()`. `supportedFileDetectionMode` chọn built-in+custom hay custom-only.

Sau mọi thay đổi có ảnh hưởng hành vi: chạy `npm run compile`, F5, và test tay theo mục 6.

---

## 8. Tài liệu nào tin được

| File | Trạng thái |
| --- | --- |
| [CLAUDE.md](../CLAUDE.md) | ✅ **Source of truth** — cập nhật nhất về kiến trúc. |
| [README.md](../README.md) | ✅ User-facing, đúng. |
| [docs/GIT_VS_AI_EDIT_DETECTION.md](GIT_VS_AI_EDIT_DETECTION.md) | ✅ Đúng, phần burst/branch detection. |
| [docs/BUG_ISSUE_15_FULL_FILE_DIFF.md](BUG_ISSUE_15_FULL_FILE_DIFF.md) | ✅ Bối cảnh bug EOL/full-file diff. |
| [docs/DIFF_VIEW_FLOW.md](DIFF_VIEW_FLOW.md) | ⚠️ **Stale một phần**: mục 3.1 mô tả `hookWatcher`/`pre-tool-hook.js`/`installHooks` — **pipeline hook đã bị xoá**, giờ mọi CLI phát hiện qua workspace watcher. Mục render/group/accept-reject (4–7) vẫn đúng. |
| `plan.md` | 🗄️ Lịch sử: plan gốc của terminal panel (đã làm xong). Đọc để biết *tại sao*, phần "Out of scope" ở cuối = gợi ý hướng tương lai. |

Nếu sửa kiến trúc, **cập nhật CLAUDE.md** trước tiên.

---

## 9. Định hướng / việc còn mở

- **Known gap**: xác nhận git op sớm bằng `.git/index` chưa làm — hold mechanism hiện chỉ dựa vào xác nhận `HEAD`-change của `GitBranchWatcher` (xem cuối `GIT_VS_AI_EDIT_DETECTION.md`).
- Từ `plan.md` (out of scope, ứng viên tương lai): multiple terminal tabs; tích hợp terminal với `startSession`; terminal theo VS Code color theme; search trong terminal; web extension (bất khả thi vì node-pty là native).
- Built-in launch mới chỉ Claude — mở rộng Codex/Qwen qua `IAiRunner` là hướng tự nhiên.

---

## 10. Checklist "hiểu rồi" cho người mới

- [ ] Chạy được `npm run compile` sạch và F5 mở được Dev Host.
- [ ] Sửa 1 file mẫu trong `code_to_test/` bằng tay/CLI, thấy diff nổ lên, accept/revert 1 hunk, 1 file, rồi all.
- [ ] Giải thích được vì sao Accept không đụng disk còn Reject thì có.
- [ ] Phân biệt được "hunk" vs "group" và cái nào dùng để render / thao tác.
- [ ] Biết `normalizePath` vs `canonicalCasePath` dùng lúc nào.
- [ ] Thử đổi branch git khi đang có diff pending, quan sát `GitBranchWatcher` xử lý.
