# Điểm nghẽn hiệu năng khi AI ghi hàng loạt file (issue #37)

> Phân tích tĩnh trên code 4.1.2 — **chưa profile**. Độ phức tạp là ước lượng theo
> code, hằng số thực tế cần đo. Luồng đầy đủ (không chú thích hiệu năng):
> [DIFF_CAPTURE_SWIMLANE.md](DIFF_CAPTURE_SWIMLANE.md).

## Ký hiệu

| Ký hiệu | Nghĩa | Kịch bản issue #37 |
| --- | --- | --- |
| **N** | số file pending | ~1.300 |
| **T** | số tab diff đang mở (≈ N khi auto-open hết) | ~1.340 |
| **S** | kích thước một file (dòng / byte) | ≤ `maxFileLines` (5.000) |
| **D** | số dòng khác nhau giữa snapshot và hiện tại | Myers: **O((S)·D)** |

`normalizePath()` = `path.resolve` + `Uri.file().fsPath` + `toLowerCase` — rẻ nhưng không
miễn phí, và bị gọi **O(T·N)** lần mỗi event (xem HOT-3).

## Sơ đồ

```mermaid
sequenceDiagram
    autonumber

    box rgb(235,245,255) AI CLI / Đĩa
        participant AI as AI CLI
        participant Disk as File workspace
    end
    box rgb(255,245,230) VS Code API
        participant FSW as FileSystemWatcher
        participant VFS as workspace.fs
        participant Tabs as tabGroups +<br/>vscode.openWith
        participant WS as workspaceState
    end
    box rgb(235,255,235) Extension - src
        participant WW as WorkspaceWatcher
        participant DM as DiffManager
        participant DEP as DiffEditorProvider<br/>(1 listener / tab)
        participant TP as TerminalPanel<br/>pending list
        participant NB as NavBarPanel<br/>(extension.ts)
        participant AC as AgentChangesPanel
    end
    box rgb(250,235,255) Webview
        participant MW as T webview Monaco
        participant UI as Webview pending list<br/>+ nav bar
    end

    %% ───────────── A. Nhận N write ─────────────
    rect rgb(248,248,248)
    Note over AI,WW: A. AI ghi N file trong vài giây
    AI->>Disk: ghi N file
    Disk-->>FSW: N event
    FSW-->>WW: onDidChange / onDidCreate × N
    Note right of WW: Mỗi file: lọc O(1) + setTimeout 200ms<br/>+ stat + readFile O(S) + so baseline O(S)<br/>Tổng: O(N·S) — chấp nhận được
    WW->>WW: vượt ngưỡng burst → heldWrites (N file)
    end

    %% ───────────── B. Dump hold ─────────────
    rect rgb(255,225,225)
    Note over WW,DM: ⚠ HOT-1 — hết holdMs: vòng for gọi triggerDiff × N KHÔNG await<br/>→ N openDiff() chạy chồng cùng lúc, event loop bị nghẽn, không yield cho UI
    WW->>WW: for (file of heldWrites) triggerDiff(file)  — O(N) lần gọi, mỗi lần kéo theo cả khối C
    end

    %% ───────────── C. Mỗi file ─────────────
    loop Mỗi file i = 1..N (T tăng dần từ 0 tới ≈ N)
        rect rgb(255,240,240)
        WW->>DM: loadSnapshot(path, before)
        DM->>WS: store.save(toàn bộ snapshots)
        Note over DM,WS: ⚠ HOT-2 — serialize lại CẢ map mỗi file mới<br/>Mỗi lần O(i·S) → tổng O(N²·S)<br/>1.300 file × 5KB ≈ 4 GB dữ liệu serialize
        end

        rect rgb(255,225,225)
        DM-->>DM: fire onDidChangeDiffs  (event 1/2)
        Note over DM,UI: ⚠ HOT-3 — event không mang path → MỌI listener làm lại toàn bộ.<br/>Chi phí 1 event: O(T·(S·D + N)) + O(N)
        par Mỗi tab diff đang mở (T tab)
            DM-->>DEP: callback × T
            DEP->>DEP: postSet(): getText O(S) + calculateHunks O(S·D)
            DEP->>DEP: computeNav(): getPendingFiles + findIndex<br/>= 2N lần normalizePath → O(N)
            DEP->>MW: postMessage 'set' (original + current) — O(S) serialize + IPC
            Note right of DEP: Cả tab nào KHÔNG liên quan cũng tính lại diff,<br/>dù chỉ cần đổi bộ đếm "i / N"
        and Pending list
            DM-->>TP: postFilesUpdate()
            TP->>UI: dựng lại toàn bộ HTML cây O(N) (~1,66 MB) + postMessage
        and Nav bar
            DM-->>NB: updateNavBarState()
            NB->>UI: getNavigationInfo O(N) + gán webview.html × 2 (reload webview)
        and Agent Changes (chỉ khi agent mode)
            DM-->>AC: refresh()
            AC->>VFS: getDiffPreviewMetadata: readFile + calculateHunks cho CẢ N file<br/>O(N·S·D)
        end
        end

        rect rgb(255,240,240)
        WW->>DM: openDiff(path)
        DM->>VFS: readFile O(S)
        DM->>DM: calculateHunks O(S·D)
        DM->>Tabs: closeTextTabsFor: duyệt mọi tab O(T)
        Note over DM,Tabs: ⚠ HOT-4 — quét toàn bộ tab cho mỗi file → tổng O(N·T) ≈ O(N²)
        DM->>Tabs: executeCommand('vscode.openWith')
        Tabs->>MW: tạo webview + load Monaco
        Note over Tabs,MW: ⚠ HOT-5 — mỗi file một iframe Monaco riêng<br/>Bộ nhớ O(T) × vài MB → 5–7 GB khi T ≈ 1.340
        Tabs-->>NB: onDidChangeTabs → updateNavBarState: O(N) + 2 reload
        DM-->>DM: fire onDidChangeDiffs  (event 2/2)
        Note over DM,DEP: ⚠ lặp lại toàn bộ khối HOT-3 lần nữa → O(T·(S·D + N))
        end

        rect rgb(250,240,255)
        MW-->>DEP: postMessage 'ready'
        DEP->>DEP: postSet() cho tab mới — O(S·D + N)
        DEP->>MW: postMessage 'set'
        end
    end

    Note over WW,UI: Tổng pha C với N file: ≈ 2N event × O(T·(S·D + N)), T → N<br/>⇒ O(N²·S·D + N³) CPU, O(N²·S) serialize snapshot, O(N) webview Monaco sống cùng lúc

    %% ───────────── D. Accept All ─────────────
    rect rgb(255,235,225)
    Note over UI,DM: D. User bấm Accept All Changes
    UI->>DM: acceptAllPending()
    DM->>DM: snapshots.clear() + store.save — O(1)
    loop N tab
        DM->>Tabs: closePanel → panel.dispose()  (đồng bộ)
        Tabs-->>NB: onDidChangeTabs → updateNavBarState → gán webview.html × 2
    end
    Note over DM,NB: ⚠ HOT-6 — N lần dispose webview Monaco liên tiếp, không yield<br/>+ 2N lần reload webview nav bar → O(N) nhưng hằng số rất lớn (≈61s trong log)
    DM-->>DM: fire onDidChangeDiffs (1 lần — không còn cascade, unregisterPanel đã chặn)
    end
```

## Bảng tổng hợp

| # | Vị trí | Mỗi lần | Số lần (N file) | Tổng | Hướng sửa |
| --- | --- | --- | --- | --- | --- |
| HOT-1 | `workspaceWatcher.ts:517` `scheduleHoldResolve` | O(1) gọi `triggerDiff` | N, không await | N × (khối C) chạy chồng | Hàng đợi, batch nhỏ + `await`; ngưỡng tối đa số tab tự mở |
| HOT-2 | `diffManager.ts:204` → `snapshotStore.ts:35` | O(i·S) | N | **O(N²·S)** | Debounce `store.save`, flush khi `deactivate` |
| HOT-3a | `diffWebviewPanel.ts:157` listener → `postSet` | O(S·D) mỗi tab | 2N event × T tab | **O(N²·S·D)** | Chỉ tab của file vừa đổi mới `postSet`, tab khác nhận message `nav` nhỏ |
| HOT-3b | `diffWebviewPanel.ts:229` `computeNav` | O(N) | 2N event × T tab | **O(N³)** | Tính nav một lần mỗi event (map path → index), dùng chung cho mọi tab |
| HOT-3c | `terminalPanel.ts:245` `postFilesUpdate` | O(N) + ~1,66 MB IPC | 2N | O(N²) | Coalesce event, cập nhật từng dòng |
| HOT-3d | `extension.ts:440` `updateNavBarState` | O(N) + 2 reload webview | 2N + số lần đổi tab | O(N²) | Coalesce, gán `html` 1 lần hoặc `postMessage` |
| HOT-3e | `agentChangesPanel.ts:46` → `getDiffPreviewMetadata` | O(N·S·D) + N `readFile` | 2N (agent mode) | **O(N²·S·D)** | Coalesce, cache metadata theo file |
| HOT-4 | `diffManager.ts:177` `closeTextTabsFor` | O(T) | N | O(N²) | Index tab theo path (cập nhật từ `onDidChangeTabs`) |
| HOT-5 | `vscode.openWith` mỗi file | vài MB RAM | N | O(N) RAM, 5–7 GB | Giới hạn số tab tự mở, review gộp khi vượt ngưỡng |
| HOT-6 | `diffManager.ts:272` `acceptAllPending` | dispose 1 webview + 2 reload nav bar | N | O(N), hằng số lớn | `tabGroups.close(tabs[])` một lần, tạm khoá `updateNavBarState` |

**Thứ tự ưu tiên:** HOT-3a + HOT-3b (một chỗ sửa trong listener của `DiffEditorProvider`) →
coalesce event (HOT-3c/d/e) → HOT-2 → HOT-1/HOT-5 (đổi hành vi, đi cùng phần UX của issue).
