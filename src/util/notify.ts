import * as vscode from 'vscode';

const AUTO_CLOSE_MS = 2000;

/**
 * Info/warning toast that closes itself after `ms`. A plain showInformationMessage
 * stays until the user dismisses it and the API cannot close it, so this shows the
 * text as a notification-area progress that ends on a timer. No buttons possible.
 * Errors keep showErrorMessage: they should stay until read.
 */
export function notify(message: string, ms = AUTO_CLOSE_MS): void {
  void vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: message, cancellable: false },
    () => new Promise<void>((resolve) => setTimeout(resolve, ms))
  );
}
