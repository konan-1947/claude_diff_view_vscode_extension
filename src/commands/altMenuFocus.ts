import * as vscode from 'vscode';

/**
 * altMenuFocus.ts
 *
 * Giữ focus ở terminal khi Alt+Tab quay lại VS Code. Với title bar custom
 * (mặc định trên Windows), `window.customMenuBarAltFocus` khiến lần thả Alt
 * sau Alt+Tab đưa focus lên menu bar ("File" sáng lên), cướp focus khỏi
 * terminal ngay sau khi extension vừa khôi phục nó. Webview chuyển tiếp phím
 * ra workbench nên chặn trong xterm không đủ.
 *
 * Setting `ai-cli-diff-view.preventAltMenuFocus` (mặc định bật) đặt giá trị đó
 * thành `false` ở Global. Chỉ khôi phục lại khi chính extension đã đặt nó
 * (cờ trong globalState), để không xoá giá trị user tự đặt.
 */

const OVERRIDDEN_KEY = 'ai-cli-diff-view.altMenuFocusOverridden';

export async function applyAltMenuFocus(context: vscode.ExtensionContext): Promise<void> {
  const prevent = vscode.workspace
    .getConfiguration('ai-cli-diff-view')
    .get<boolean>('preventAltMenuFocus', true);
  const windowConfig = vscode.workspace.getConfiguration('window');
  const current = windowConfig.inspect<boolean>('customMenuBarAltFocus')?.globalValue;

  if (prevent) {
    if (current === false) { return; }
    await windowConfig.update('customMenuBarAltFocus', false, vscode.ConfigurationTarget.Global);
    await context.globalState.update(OVERRIDDEN_KEY, true);
    return;
  }

  if (!context.globalState.get<boolean>(OVERRIDDEN_KEY)) { return; }
  if (current === false) {
    await windowConfig.update('customMenuBarAltFocus', undefined, vscode.ConfigurationTarget.Global);
  }
  await context.globalState.update(OVERRIDDEN_KEY, false);
}
