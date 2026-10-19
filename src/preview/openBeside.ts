import * as vscode from 'vscode';

/**
 * Files the user explicitly sent to a side editor. In agent mode every other
 * tab is closed and re-routed into the in-panel preview (`autoRouteTab`), so
 * these must be exempted until their tab is closed.
 */
const besidePaths = new Set<string>();
const changeEmitter = new vscode.EventEmitter<void>();
export const onDidChangeOpenedBeside = changeEmitter.event;

function key(fsPath: string): string {
  return vscode.Uri.file(fsPath).fsPath.toLowerCase();
}

export function isOpenedBeside(fsPath: string): boolean {
  return besidePaths.has(key(fsPath));
}

export function forgetOpenedBeside(fsPath: string): void {
  if (besidePaths.delete(key(fsPath))) { changeEmitter.fire(); }
}

export function hasOpenedBeside(): boolean {
  return besidePaths.size > 0;
}

/** Opens the file with its normal editor in a group beside, keeping focus where it is. */
export async function openBeside(fsPath: string): Promise<void> {
  besidePaths.add(key(fsPath));
  changeEmitter.fire();
  try {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(fsPath), {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
    });
  } catch (err) {
    besidePaths.delete(key(fsPath));
    changeEmitter.fire();
    throw err;
  }
}
