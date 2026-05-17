# Plan: Embedded Terminal Panel (Independent Module)

## Mục tiêu

Thêm một panel terminal độc lập (xterm.js + node-pty) vào extension, mặc định hiện ở **Secondary Side Bar (bên phải)**, để user chạy `claude` (hoặc bất kỳ lệnh nào) ngay trong VS Code mà không phải mở Terminal tab riêng.

**Nguyên tắc tuyệt đối:** KHÔNG sửa bất kỳ file nào của các pipeline hiện tại — `DiffManager`, `HookWatcher`, `WorkspaceWatcher`, `ClaudeRunner`, `SessionPanelProvider`, `NavBarPanel`, commands, keybindings. Chỉ THÊM file mới và thêm dòng đăng ký vào `extension.ts` + `package.json`.

## Phạm vi (Scope)

### Trong phạm vi
- Một `WebviewViewProvider` mới host xterm.js.
- Một wrapper PTY (node-pty) trong extension host.
- Một view container mới để view xuất hiện độc lập, có thể auto-move sang sidebar phải lần activate đầu tiên.
- Assets xterm tĩnh trong `media/xterm/`.

### Ngoài phạm vi
- Multiple terminals / tabs.
- Tích hợp terminal với DiffManager (hook pipeline đã tự handle, không cần liên kết).
- Sửa lệnh `startSession` hoặc `claudeRunner`.
- Web extension (vscode.dev) — node-pty là native, không hỗ trợ.

## Quyết định đã chốt

| Quyết định | Lựa chọn |
| --- | --- |
| Vị trí mặc định | Sidebar phải (auto-move lần đầu activate, sau đó user tự kéo nếu muốn) |
| Resize | Theo behavior built-in của VS Code (kéo bằng chuột) |
| Shell | `vscode.env.shell` — KHÔNG auto-chạy `claude` |
| PTY lifecycle | Sống xuyên suốt extension, không kill khi ẩn panel |
| Webview retain | `retainContextWhenHidden: true` (giữ scrollback xterm) |
| node-pty package | `@homebridge/node-pty-prebuilt-multiarch` (có prebuilds, không cần electron-rebuild) |

## Cách VS Code đặt view ở sidebar phải

VS Code không có manifest key riêng cho "Secondary Side Bar". Cách làm:

1. Khai báo `contributes.viewsContainers.activitybar` mới (id riêng, tách khỏi container `ai-cli-diff-view` hiện tại). View mặc định sẽ ra sidebar trái.
2. Lần đầu activate (đánh dấu bằng `globalState` flag `ai-cli-diff-view.terminal.movedToRight`), gọi:
   - `workbench.action.focusAuxiliaryBar` (mở secondary bar nếu đang ẩn)
   - `vscode.commands.executeCommand('vscode.moveViews', { viewIds: ['ai-cli-diff-view.terminal'], destinationId: 'workbench.view.extension.<auxiliary-container-id>' })` — **lưu ý:** API `vscode.moveViews` không phải public, nên fallback là dùng command `workbench.action.moveViewToSecondarySideBar` sau khi focus đúng view.
3. VS Code nhớ vị trí trong `workbench.<id>.location`; lần sau không cần move lại.

**Risk:** API move view không stable; nếu không gọi được, view xuất hiện ở sidebar trái — user kéo thủ công 1 lần là xong. Plan B: hiển thị notification "Kéo panel sang sidebar phải lần đầu để có trải nghiệm tốt nhất" và thôi.

## Files mới

```
src/
  terminal/
    ptySession.ts         # Wrapper node-pty: spawn, write, resize, onData, dispose
    terminalPanel.ts      # WebviewViewProvider + bridge PTY ↔ webview
media/
  xterm/
    xterm.css             # copy từ node_modules/xterm/css/xterm.css
    xterm.js              # copy từ node_modules/xterm/lib/xterm.js (UMD build)
    xterm-addon-fit.js    # copy từ node_modules/xterm-addon-fit/lib/...
```

## Files sửa (tối thiểu)

### `package.json`
- Thêm `dependencies`:
  - `@homebridge/node-pty-prebuilt-multiarch`
  - `xterm`
  - `xterm-addon-fit`
- Thêm view container thứ hai trong `contributes.viewsContainers.activitybar`:
  ```json
  {
    "id": "ai-cli-diff-view-terminal",
    "title": "AI CLI Terminal",
    "icon": "media/claude-icon.svg"
  }
  ```
- Thêm view trong `contributes.views`:
  ```json
  "ai-cli-diff-view-terminal": [
    {
      "id": "ai-cli-diff-view.terminal",
      "name": "Terminal",
      "type": "webview"
    }
  ]
  ```
- **Không** đụng `ai-cli-diff-view` container, `views.ai-cli-diff-view`, hay `views.explorer` hiện có.

### `src/extension.ts`
Thêm đúng 1 block (sau khi register `sessionPanel`):

```ts
import { TerminalPanelProvider } from './views/terminalPanel';
// ...
const terminalPanel = new TerminalPanelProvider(context);
context.subscriptions.push(
  vscode.window.registerWebviewViewProvider(
    TerminalPanelProvider.viewType,
    terminalPanel,
    { webviewOptions: { retainContextWhenHidden: true } }
  ),
  { dispose: () => terminalPanel.dispose() }
);

// Auto-move sang secondary sidebar lần đầu
const KEY = 'ai-cli-diff-view.terminal.movedToRight';
if (!context.globalState.get<boolean>(KEY)) {
  void context.globalState.update(KEY, true);
  // Defer để VS Code đăng ký view xong
  setTimeout(() => {
    void vscode.commands.executeCommand('workbench.action.focusAuxiliaryBar');
    // (Best-effort; nếu fail thì user tự kéo)
  }, 500);
}
```

Không sửa logic nào khác trong `extension.ts`.

## Thiết kế chi tiết

### `ptySession.ts`

```ts
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import * as vscode from 'vscode';

export class PtySession {
  private proc: pty.IPty | undefined;
  private readonly _onData = new vscode.EventEmitter<string>();
  readonly onData = this._onData.event;
  private readonly _onExit = new vscode.EventEmitter<number>();
  readonly onExit = this._onExit.event;

  start(cwd: string, cols: number, rows: number): void {
    const shell = vscode.env.shell || process.env.ComSpec || 'powershell.exe';
    this.proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols, rows, cwd,
      env: { ...process.env } as Record<string, string>,
    });
    this.proc.onData(d => this._onData.fire(d));
    this.proc.onExit(({ exitCode }) => this._onExit.fire(exitCode));
  }

  write(data: string): void { this.proc?.write(data); }
  resize(cols: number, rows: number): void { this.proc?.resize(cols, rows); }
  dispose(): void { this.proc?.kill(); this.proc = undefined; }
}
```

### `terminalPanel.ts` (skeleton)

- Implements `vscode.WebviewViewProvider`.
- `static viewType = 'ai-cli-diff-view.terminal'`.
- Trong `resolveWebviewView`:
  - `webview.options = { enableScripts: true, localResourceRoots: [extensionUri] }`
  - Lazy-init PtySession ở lần `resolveWebviewView` đầu tiên (cwd = `workspaceFolders[0]?.uri.fsPath ?? os.homedir()`, cols/rows tạm 80x24 — sẽ resize ngay khi webview gửi kích thước thật).
  - Cầu nối message:
    - `webview.onDidReceiveMessage`:
      - `{type:'ready', cols, rows}` → start PTY nếu chưa có, resize.
      - `{type:'input', data}` → `pty.write(data)`.
      - `{type:'resize', cols, rows}` → `pty.resize(...)`.
    - `pty.onData` → `webview.postMessage({type:'data', data})`.
    - `pty.onExit` → `webview.postMessage({type:'exit', code})` + restart PTY khi user gõ phím (or hiện nút "Restart").
- `dispose()`: dispose PTY + emitters.

### HTML webview (inline trong `terminalPanel.ts`)

- CSP: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${nonce} ${cspSource}; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource};">`
- Load `xterm.css`, `xterm.js`, `xterm-addon-fit.js` qua `webview.asWebviewUri(media/xterm/...)`.
- Init:
  ```js
  const term = new Terminal({ fontFamily: 'Consolas, monospace', fontSize: 13, cursorBlink: true, theme: { background: 'transparent' } });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById('term'));
  fit.fit();
  vscode.postMessage({ type:'ready', cols: term.cols, rows: term.rows });

  term.onData(d => vscode.postMessage({ type:'input', data: d }));
  window.addEventListener('resize', () => {
    fit.fit();
    vscode.postMessage({ type:'resize', cols: term.cols, rows: term.rows });
  });
  window.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'data') term.write(m.data);
    if (m.type === 'exit') term.writeln(`\r\n[process exited: ${m.code}]`);
  });
  ```
- Container `#term` chiếm 100% chiều cao webview, dùng `ResizeObserver` để gọi `fit.fit()` khi sidebar bị kéo rộng/hẹp.

## Các bước thực hiện (verifiable)

| # | Bước | Verify |
| --- | --- | --- |
| 1 | `npm install @homebridge/node-pty-prebuilt-multiarch xterm xterm-addon-fit` | `npm run compile` không lỗi; `node -e "require('@homebridge/node-pty-prebuilt-multiarch')"` chạy được trong Node của VS Code Extension Host (kiểm tra bằng dev host log) |
| 2 | Copy xterm assets vào `media/xterm/` (script copy hoặc thủ công 1 lần) | 3 file tồn tại; `localResourceRoots` đã bao gồm `extensionUri` nên webview load được |
| 3 | Viết `ptySession.ts` | Tự test: 1 unit script trong scratch chạy `start → write("dir\r") → onData log → dispose` |
| 4 | Viết `terminalPanel.ts` với HTML webview | F5 → mở view → xterm render được prompt PowerShell; gõ `dir` ra kết quả |
| 5 | Thêm view container + view trong `package.json` | View "Terminal" xuất hiện trong activity bar; mở được panel |
| 6 | Register provider trong `extension.ts` (1 block, không sửa logic cũ) | Các tính năng cũ (diff, hook, nav bar) vẫn hoạt động bình thường |
| 7 | Auto-move sang sidebar phải lần đầu activate | Cài lại extension trên VS Code profile sạch → view tự xuất hiện ở sidebar phải (hoặc fallback: notification gợi ý) |
| 8 | Test resize: kéo sidebar rộng/hẹp, xterm wrap đúng | Chữ không bị cắt; `pty.resize` được gọi |
| 9 | Test lifecycle: collapse panel → expand lại, scrollback giữ nguyên | Output trước đó vẫn còn |
| 10 | Package `.vsix` (`npx vsce package`) và cài thử trên VS Code chính (không phải Extension Dev Host) | Terminal vẫn chạy được; không lỗi `NODE_MODULE_VERSION` |

## Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| `node-pty` native binary mismatch ABI Electron của VS Code | Dùng `@homebridge/node-pty-prebuilt-multiarch` (có prebuilds cho nhiều Electron version); test bước 10 trên VS Code thật trước khi publish |
| API move-view-to-secondary không stable | Best-effort + fallback notification; user kéo thủ công 1 lần, VS Code nhớ |
| Sidebar quá hẹp khiến terminal wrap xấu | Không phải bug; tài liệu hướng dẫn user kéo rộng. Có thể đặt `min-width` CSS gợi ý |
| CSP block xterm inline styles | Cho phép `style-src 'unsafe-inline'` (xterm cần) hoặc dùng nonce cho style tag |
| PTY giữ sống tốn RAM khi user không dùng | Chấp nhận đánh đổi để có scrollback; có thể thêm option sau này |
| Đóng `.vsix` size tăng do native binary | Chấp nhận; node-pty prebuilt ~vài MB |

## Success Criteria (toàn dự án)

- [ ] Build `.vsix` thành công và cài được trên VS Code stable.
- [ ] Mở view "AI CLI Terminal" ở sidebar phải, xterm hiển thị shell prompt của user.
- [ ] Gõ `claude` (hoặc lệnh shell bất kỳ) chạy bình thường, output stream về xterm.
- [ ] Resize sidebar → xterm tự fit, không lỗi.
- [ ] Tất cả tính năng cũ (diff view, hook detection, nav bar, accept/revert) hoạt động y nguyên — không regression.
- [ ] PTY sống xuyên suốt extension; ẩn/hiện panel không reset session.

## Out of scope (lưu ý cho tương lai)

- Multiple terminal tabs.
- Tích hợp terminal với `startSession` command (có thể thay thế prompt-based runner sau).
- Theme follow VS Code color theme (xterm có thể đọc CSS variables nhưng tùy chỉnh sau).
- Search trong terminal (`xterm-addon-search`).
- Web extension support — không khả thi với node-pty.
