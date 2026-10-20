# Luồng bắt diff — swimlane theo tầng

> Chỉ mô tả việc **phát hiện edit và mở diff** (workspace watcher). Không gồm
> accept/revert, built-in runner (`startSession`) hay agent-mode preview.
> Đối chiếu code 4.1.2 — nếu lệch, tin code.

Các tầng (từ trái sang phải):

| Tầng | Gồm | Ghi chú |
| --- | --- | --- |
| **Người dùng / AI CLI** | User gõ trong VS Code, AI CLI (Claude/Codex/Qwen) chạy ngoài | AI CLI **không** nói chuyện với extension — chỉ ghi file |
| **Đĩa** | File trong workspace, `.git/HEAD`, `.git/logs/HEAD` | |
| **VS Code (API)** | `FileSystemWatcher`, `workspace.fs`, `onDidSaveTextDocument`, `tabGroups`, `vscode.openWith`, `workspaceState` | Mọi thứ extension làm với editor đều đi qua tầng này |
| **Extension (src)** | `WorkspaceWatcher`, `BaselineStore`, `WriteBurstMeter`, `GitBranchWatcher`, `DiffManager`, `DiffEditorProvider` | `GitBranchWatcher` là ngoại lệ: đọc `.git` bằng Node `fs` trực tiếp, không qua VS Code |
| **Webview** | Monaco `DiffEditor` (`res/webview/diff.monaco.js`) | Chỉ nhận dữ liệu qua `postMessage` |

```mermaid
sequenceDiagram
    autonumber

    box rgb(235,245,255) Người dùng / AI CLI
        actor User as User (VS Code)
        participant AI as AI CLI
    end
    box rgb(245,245,245) Đĩa
        participant Disk as File workspace
        participant Git as .git/HEAD + logs/HEAD
    end
    box rgb(255,245,230) VS Code API
        participant FSW as FileSystemWatcher<br/>('**/*')
        participant VFS as workspace.fs<br/>findFiles / stat / readFile
        participant Ev as workspace events<br/>onDidSaveTextDocument<br/>onDidChangeTextDocument
        participant Tabs as tabGroups +<br/>commands.executeCommand
        participant WS as workspaceState
    end
    box rgb(235,255,235) Extension (src)
        participant WW as WorkspaceWatcher
        participant BS as BaselineStore<br/>(+ BaselineScanner)
        participant BM as WriteBurstMeter
        participant GW as GitBranchWatcher
        participant DM as DiffManager
        participant DEP as DiffEditorProvider
    end
    box rgb(250,235,255) Webview
        participant MW as Monaco DiffEditor
    end

    %% ───────────── 0. Khởi động ─────────────
    rect rgb(248,248,248)
    Note over WW,DEP: 0. activate (onStartupFinished)
    DM->>WS: get('ai-cli-diff.snapshots')<br/>khôi phục pending từ phiên trước
    DEP->>Tabs: registerCustomEditorProvider<br/>(ai-cli-diff-view.diffEditor)
    WW->>Ev: đăng ký onDidSaveTextDocument
    WW->>FSW: createFileSystemWatcher('**/*')<br/>onDidChange / onDidCreate
    WW->>BS: watchFolder() → buildInitialSnapshots
    BS->>VFS: findFiles + readFile (song song,<br/>baselineScanConcurrency)
    VFS-->>BS: nội dung "before" của mọi file text
    GW->>Git: fs.watch(.git) — Node fs, không qua VS Code
    end

    %% ───────────── 1a. User tự sửa (không tạo diff) ─────────────
    rect rgb(240,248,255)
    Note over User,WW: 1a. User tự lưu file trong VS Code → chỉ cập nhật baseline
    User->>Ev: Ctrl+S
    Ev->>Disk: ghi file
    Ev-->>WW: onDidSaveTextDocument(doc)
    WW->>BS: set(path, doc.getText())
    WW->>WW: savedFilesByVsCode[path] = now
    Disk-->>FSW: thay đổi file
    FSW-->>WW: onDidChange(uri)
    WW->>WW: vừa save < 2s → bỏ qua
    end

    %% ───────────── 1b. AI CLI ghi file ─────────────
    rect rgb(255,250,240)
    Note over AI,WW: 1b. AI CLI ghi file từ process bên ngoài
    AI->>Disk: write / create file
    Disk-->>FSW: thay đổi file
    FSW-->>WW: onDidChange / onDidCreate(uri)
    WW->>BM: record(path) → burstHold?
    Note right of WW: Lọc: excludedPaths, vừa được VS Code save,<br/>debounce 500ms, isTextFile, ngoài workspace<br/>Đang scan baseline → xếp hàng queuedExternalWrites
    WW->>WW: setTimeout 200ms (đợi ghi xong)
    WW->>VFS: stat(uri) — lọc theo byte
    WW->>VFS: readFile(uri)
    VFS-->>WW: nội dung "after"
    WW->>BS: get(path) → nội dung "before"
    alt Đang trong suppress window (sau git)
        WW->>BS: set(path, after) — không tạo diff
    else before == after (bỏ qua EOL/trim)
        WW->>BS: set(path, after) — không tạo diff
    else Có thay đổi thật
        WW->>BS: set(path, after) — baseline mới
    end
    end

    %% ───────────── 2. Burst / git ─────────────
    rect rgb(255,240,240)
    Note over WW,GW: 2. resolveOrHold — phân biệt git checkout và AI edit
    alt burstHold = false (ít file)
        WW->>WW: triggerDiff ngay
    else burstHold = true (vượt ngưỡng trong window)
        WW->>WW: heldWrites.set, chờ holdMs (2s)
        opt Git đổi HEAD / pull / merge / rebase / reset
            Git-->>GW: fs.watch báo đổi
            GW->>WW: notifyExternalBatch()<br/>bỏ heldWrites, rebuild baseline
            GW->>DM: clearAll() (chỉ khi đổi branch)
        end
        WW->>WW: hết holdMs → triggerDiff từng file<br/>(preserveFocus: true)
    end
    end

    %% ───────────── 3. Mở diff ─────────────
    rect rgb(240,255,240)
    Note over WW,Tabs: 3. triggerDiff → DiffManager
    WW->>DM: loadSnapshot(path, before)
    DM->>WS: update('ai-cli-diff.snapshots', toàn bộ map)
    DM-->>DM: fire onDidChangeDiffs<br/>(nav bar, pending list, mọi tab diff)
    opt Agent mode đang bật
        WW-->>WW: dừng — review trong preview của terminal
    end
    WW->>DM: openDiff(path)
    DM->>VFS: readFile(uri)
    DM->>DM: calculateHunks(snapshot, current)
    alt 0 hunk (chỉ khác EOL)
        DM->>DM: xoá snapshot, không mở tab
    else Có hunk
        DM->>Tabs: tabGroups.close(tab text cùng file, nếu không dirty)
        DM->>Tabs: executeCommand('vscode.openWith',<br/>uri, 'ai-cli-diff-view.diffEditor')
    end
    end

    %% ───────────── 4. Render ─────────────
    rect rgb(250,240,255)
    Note over Tabs,MW: 4. VS Code tạo tab custom editor
    Tabs->>DEP: resolveCustomTextEditor(document, webviewPanel)
    DEP->>MW: webview.html (load Monaco từ node_modules)
    DEP->>DM: registerPanel(path, panel)
    MW-->>DEP: postMessage 'ready'
    DEP->>DM: getSnapshotContent(path) — vế trái
    DEP->>Ev: document.getText() — vế phải (live)
    DEP->>DEP: calculateHunks
    DEP->>MW: postMessage 'set'<br/>(original, current, hunks, nav)
    MW->>User: hiển thị diff + nút accept/reject
    end

    %% ───────────── 5. Cập nhật tiếp ─────────────
    rect rgb(248,248,248)
    Note over AI,MW: 5. AI ghi tiếp vào file đang mở diff
    AI->>Disk: write tiếp
    Disk-->>Ev: VS Code reload TextDocument
    Ev-->>DEP: onDidChangeTextDocument
    DEP->>MW: postSet() lại — vế trái giữ snapshot cũ
    Note right of WW: WorkspaceWatcher cũng nhận event nhưng<br/>hasPendingDiff = true → không mở thêm
    end
```

## Extension chạm vào VS Code ở đâu (tóm tắt)

| Mục đích | VS Code API | Nơi gọi |
| --- | --- | --- |
| Phát hiện file đổi từ bên ngoài | `workspace.createFileSystemWatcher('**/*')` | `WorkspaceWatcher.watchWorkspaceFolders` |
| Phân biệt save của chính VS Code | `workspace.onDidSaveTextDocument` | `WorkspaceWatcher.watchVscodeEvents` |
| Chụp baseline ban đầu | `workspace.findFiles`, `workspace.fs.readFile` | `BaselineScanner.buildInitialSnapshots` |
| Đọc nội dung sau khi AI ghi | `workspace.fs.stat`, `workspace.fs.readFile` | `WorkspaceWatcher.processExternalWrite`, `DiffManager.openDiff` |
| Lưu pending qua restart | `ExtensionContext.workspaceState` | `SnapshotStore.save/load` |
| Đóng tab text trùng file | `window.tabGroups.close` | `DiffManager.closeTextTabsFor` |
| Mở tab diff | `commands.executeCommand('vscode.openWith', …)` | `DiffManager.openDiff` |
| Render diff | `registerCustomEditorProvider` + `WebviewPanel.postMessage` | `DiffEditorProvider.resolveCustomTextEditor` |
| Theo dõi nội dung live | `workspace.onDidChangeTextDocument` | `DiffEditorProvider` |
| Theo dõi git | *(không qua VS Code)* Node `fs.watch` + `fs.readFileSync` | `GitBranchWatcher` |
