# Checklist vấn đề — issue #37 (bulk AI edits)

> Danh sách vấn đề cần sửa, **không kèm giải pháp**. Phân tích tĩnh trên code 4.1.2, chưa profile.
> Chi tiết và độ phức tạp: [PERF_HOTSPOTS_SWIMLANE.md](PERF_HOTSPOTS_SWIMLANE.md) ·
> Hoạt ảnh event loop: [EVENT_LOOP_ANIMATED.html](EVENT_LOOP_ANIMATED.html)
>
> Ký hiệu: N = số file pending, T = số tab diff đang mở, S = kích thước file, D = số dòng khác.

## Hiệu năng

- [x] **HOT-1** — Hết holdMs, `scheduleHoldResolve` thả cả N file trong một vòng `for` đồng bộ, không `await` → N `openDiff` chạy chồng, không nhường lượt cho UI. `src/watcher/workspaceWatcher.ts:517` — vòng `for` giờ chỉ `loadSnapshot` + xếp hàng; `src/watcher/autoOpenQueue.ts` mở theo đợt 10, `await` + nhường event loop giữa các đợt, dừng khi file hết pending (Accept All / đổi nhánh) hoặc vào agent mode.
- [x] **HOT-2** — Mỗi file mới, `loadSnapshot` serialize lại **toàn bộ** map snapshot vào `workspaceState` → O(N²·S). `src/diff/diffManager.ts:204`, `src/diff/snapshotStore.ts:35` — gộp lần lưu (`scheduleSave`): lưu ngay lần đầu, các lần sau trong burst gộp lại (100/500 ms); thao tác người dùng vẫn lưu ngay; xả khi deactivate. Đo 11k file / 1k đổi: ~20 s CPU, ~3,4 GB JSON → 2 lần lưu. Đánh đổi: VS Code crash trong ≤ 0,5 s lúc burst có thể mất snapshot vài file cuối.
- [x] **HOT-3a** — `onDidChangeDiffs` không mang path → **mọi** tab diff chạy lại `postSet` (tính lại diff + gửi lại toàn bộ nội dung) → O(N²·S·D). `src/diff/diffWebviewPanel.ts:157`
- [x] **HOT-3b** — `computeNav` của mỗi tab duyệt O(N) + 2N lần `normalizePath` mỗi event → O(N³). `src/diff/diffWebviewPanel.ts:229`
- [x] **HOT-3c** — Pending list dựng lại toàn bộ HTML (~1,66 MB) mỗi event. `src/terminal/terminalPanel.ts:245` — trang này đã ẩn từ PR #28 nên xoá hẳn (`pendingFilesPage.ts`).
- [x] **HOT-3d** — Nav bar gán `webview.html` 2 lần mỗi event và mỗi lần đổi tab. `src/extension.ts:440`, `src/views/navBarPanel.ts:45` — gộp event + bỏ qua khi HTML không đổi (chỉ reload khi 0 ↔ có pending).
- [x] **HOT-3e** — View PENDING FILES (agent mode + trang Files ở code mode) đọc + diff lại cả N file mỗi event. `src/views/agentChangesPanel.ts:46`, `src/diff/diffManager.ts:376` — đã cache +/- theo file và gộp event (`src/util/coalesce.ts`): 1 burst → ~1 refresh.
- [x] **Double fire** — Mỗi file `fire()` 2 lần (`loadSnapshot` + sau `openWith`) → nhân đôi mọi chi phí HOT-3. `src/diff/diffManager.ts:170` — vẫn fire 2 lần nhưng vô hại: tab diff giờ O(1)/event, các panel phụ đã gộp event.
- [ ] **HOT-4** — `closeTextTabsFor` quét toàn bộ tab cho mỗi file → O(N²). `src/diff/diffManager.ts:177` — giảm nhiều nhờ trần tab: mỗi burst tối đa `maxAutoOpenDiffs` lần quét, mỗi lần ≤ ~50 tab diff.
- [ ] **HOT-5** — Mỗi file một webview Monaco → ~1.300 tab, RAM 5–7 GB. — burst giờ tối đa `maxAutoOpenDiffs` (50) webview tự mở; còn mở thì vẫn mỗi file 1 webview (tab người dùng tự mở thêm không bị giới hạn).
- [ ] **HOT-6** — Accept All dispose N webview liên tiếp, đồng bộ; mỗi tab đóng làm nav bar reload 2 lần (log: đứng ~61 s). `src/diff/diffManager.ts:272`

## Thứ tự & điều hướng

- [x] Thứ tự Prev/Next và ô đếm `n / N` theo thứ tự chèn (gần như ngẫu nhiên khi có burst), **lệch** với pending list / Agent Changes (sắp theo thư mục → tên).
- [ ] Accept/revert làm số thứ tự các file phía sau dồn lên, vị trí đang xem bị nhảy.
- [x] **Bug** — `navigationManager` so display path (giữ chữ hoa) với path đã viết thường → trên Windows, file có chữ hoa trong đường dẫn cho `indexOf = -1`: nav bar báo sai vị trí, Alt+L nhảy về file đầu. `src/diff/navigationManager.ts:44`, `:84`

## UX

- [ ] File dưới ngưỡng burst mở diff **chiếm focus** (không `preserveFocus`), làm gián đoạn lúc đang gõ. `src/watcher/workspaceWatcher.ts:476`
- [x] Không giới hạn số tab tự mở → thay đổi lớn tràn hàng trăm / hàng nghìn tab. — setting `ai-cli-diff-view.maxAutoOpenDiffs` (mặc định 50, `0` = không giới hạn, Settings > Advanced): tính trên tổng tab diff đang mở, kể cả file lẻ; chọn theo thứ tự cây; file thừa chỉ nằm ở Pending Files, không tự mở bù; thông báo 1 lần mỗi khi chạm trần + nút Show Pending Files.
- [ ] Thả file và Accept All hàng loạt không có tiến độ, không huỷ được. — thả file: có thông báo số file chưa mở, Accept All / đổi nhánh dừng hàng đợi mở tab; Accept All vẫn chưa có tiến độ (HOT-6).
- [x] Không tôn trọng `.gitignore` → build output / file generated / package giải nén agent ghi hàng loạt lọt vào diff (workspace issue: root không phải repo, 7 repo con). `src/watcher/pathExclusions.ts` — setting **Respect .gitignore** (`ai-cli-diff-view.respectGitignore`, mặc định bật, có trong Settings của panel AI CLI): đọc `.gitignore` mọi cấp + `.git/info/exclude`, repo lồng dùng rule riêng, workspace mở ở thư mục con vẫn áp `.gitignore` gốc repo; sửa `.gitignore` lúc đang chạy có hiệu lực. Chưa đọc `core.excludesFile` toàn cục.

## Để sau

- [ ] **Nhật ký append-only cho snapshot** (nếu sau HOT-2 việc lưu vẫn nặng, vd. hàng nghìn file pending rồi accept từng hunk — mỗi lần vẫn ghi đè cả map).
  - `<storageUri>/snapshots.log`: mỗi thay đổi 1 dòng JSON (`set` path + content + existed, hoặc `del` path); khởi động đọc và phát lại; compaction (viết lại file chỉ còn snapshot sống, ghi file tạm rồi đổi tên) khi log > ~2× dữ liệu sống.
  - Cần: hàng đợi ghi duy nhất (append song song có thể xen dòng), bỏ qua dòng cuối ghi dở khi crash, fallback `workspaceState` khi không có `storageUri` (cửa sổ không có folder), migrate một lần từ key `ai-cli-diff.snapshots`.
  - Ưu điểm so với "mỗi snapshot 1 file": thứ tự ghi tự đúng, khởi động vẫn đồng bộ (đọc 1 file).
  - Đo (1k file đổi): 1.000 append ~0,2 s, log 3,8 MB, đọc lại khi khởi động ~22 ms.
