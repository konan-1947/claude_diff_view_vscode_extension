# VS Code API baseline scan activity

Activity diagram này chỉ mô tả nhánh quét file ban đầu bằng VS Code API. Luồng
watcher và xử lý diff không nằm trong phạm vi của sơ đồ.

```mermaid
flowchart TD
    START([Bắt đầu initial scan]) --> GET_FOLDERS[Lấy workspace.workspaceFolders]
    GET_FOLDERS --> HAS_FOLDER{Có workspace folder?}
    HAS_FOLDER -- Không --> DONE_EMPTY([Kết thúc: không có file để quét])
    HAS_FOLDER -- Có --> NEXT_FOLDER[Chọn workspace folder tiếp theo]

    NEXT_FOLDER --> PATTERN[Tạo RelativePattern<br/>base = workspace folder<br/>pattern = **/*]
    PATTERN --> FIND[await workspace.findFiles<br/>pattern, exclude, maxResults, token]
    FIND --> FIND_OK{findFiles thành công?}
    FIND_OK -- Không --> FOLDER_FAILED[FOLDER_SCAN_FAILED<br/>Ghi lỗi, không coi file vắng mặt là file mới]
    FIND_OK -- Có --> COMPLETE{Kết quả có thể đã chạm<br/>maxResults hoặc bị cancel?}
    COMPLETE -- Có --> FOLDER_INCOMPLETE[FOLDER_SCAN_INCOMPLETE<br/>Đánh dấu folder chưa được quét đầy đủ]
    COMPLETE -- Không --> FILE_POOL[Đưa URI vào hàng đợi<br/>concurrency giới hạn]
    FOLDER_INCOMPLETE --> FILE_POOL

    FILE_POOL --> HAS_FILE{Còn URI chưa xử lý?}
    HAS_FILE -- Không --> FOLDER_DONE[Hoàn tất workspace folder]
    HAS_FILE -- Có --> SCANNING[SCANNING<br/>Đang tạo baseline cho file]

    SCANNING --> TEXT_FILE{Tên/path thuộc loại<br/>text được hỗ trợ?}
    TEXT_FILE -- Không --> EXCLUDED[EXCLUDED]
    TEXT_FILE -- Có --> STAT[await workspace.fs.stat URI]
    STAT --> STAT_OK{stat thành công?}
    STAT_OK -- Không --> READ_FAILED[READ_FAILED<br/>Đã thấy file nhưng không có baseline]
    STAT_OK -- Có --> SIZE_OK{Kích thước byte<br/>trong giới hạn?}
    SIZE_OK -- Không --> SIZE_SKIPPED[SIZE_SKIPPED]
    SIZE_OK -- Có --> READ[await workspace.fs.readFile URI]

    READ --> READ_OK{readFile thành công?}
    READ_OK -- Không --> READ_FAILED
    READ_OK -- Có --> DECODE[Decode UTF-8]
    DECODE --> LINE_OK{Số dòng trong giới hạn?}
    LINE_OK -- Không --> SIZE_SKIPPED
    LINE_OK -- Có --> SAVE[READY<br/>Lưu path + content + fileExistedBefore = true]

    EXCLUDED --> RELEASE[Giải phóng slot trong worker pool]
    READ_FAILED --> RELEASE
    SIZE_SKIPPED --> RELEASE
    SAVE --> RELEASE
    RELEASE --> HAS_FILE

    FOLDER_FAILED --> MORE_FOLDER{Còn workspace folder?}
    FOLDER_DONE --> MORE_FOLDER
    MORE_FOLDER -- Có --> NEXT_FOLDER
    MORE_FOLDER -- Không --> DONE([Kết thúc initial scan])

    classDef work fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef ready fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef skipped fill:#f3f4f6,stroke:#6b7280,color:#111827;
    classDef warning fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef failed fill:#fee2e2,stroke:#dc2626,color:#111827;

    class FIND,FILE_POOL,SCANNING,STAT,READ work;
    class SAVE,DONE,DONE_EMPTY,FOLDER_DONE ready;
    class EXCLUDED,SIZE_SKIPPED skipped;
    class FOLDER_INCOMPLETE warning;
    class FOLDER_FAILED,READ_FAILED failed;
```

## Trạng thái đầu ra của nhánh scan

| Trạng thái | Ý nghĩa |
| --- | --- |
| `READY` | Đã đọc được baseline; file chắc chắn tồn tại trước các thay đổi tiếp theo. |
| `EXCLUDED` | File không thuộc loại/path cần theo dõi. |
| `SIZE_SKIPPED` | File vượt giới hạn byte hoặc số dòng. |
| `READ_FAILED` | Discovery thấy file nhưng không thể đọc metadata/content. |
| `FOLDER_SCAN_INCOMPLETE` | Scan bị cancel hoặc chạm giới hạn kết quả; không được suy luận file không xuất hiện là file mới. |
| `FOLDER_SCAN_FAILED` | `findFiles()` thất bại cho workspace folder đó. |

## API được sử dụng

```ts
const pattern = new vscode.RelativePattern(folder, '**/*');
const uris = await vscode.workspace.findFiles(
  pattern,
  exclude,
  maxResults,
  cancellationToken
);

const stat = await vscode.workspace.fs.stat(uri);
const bytes = await vscode.workspace.fs.readFile(uri);
```

`findFiles()` trả về toàn bộ mảng URI sau khi tìm xong, vì vậy bước đọc content
phải dùng worker pool/concurrency giới hạn thay vì `Promise.all()` toàn bộ file.
