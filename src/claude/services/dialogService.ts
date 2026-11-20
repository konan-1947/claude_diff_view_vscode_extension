/**
 * Dialog Service
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';

export const IDialogService = createDecorator<IDialogService>('dialogService');

export interface IDialogService {
	readonly _serviceBrand: undefined;
	showInputBox(options?: vscode.InputBoxOptions): Thenable<string | undefined>;
	showQuickPick(items: string[], options?: vscode.QuickPickOptions): Thenable<string | undefined>;
	showOpenDialog(options?: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined>;
	showSaveDialog(options?: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined>;
}

export class DialogService implements IDialogService {
	readonly _serviceBrand: undefined;

	showInputBox(options?: vscode.InputBoxOptions): Thenable<string | undefined> {
		return vscode.window.showInputBox(options);
	}

	showQuickPick(items: string[], options?: vscode.QuickPickOptions): Thenable<string | undefined> {
		return vscode.window.showQuickPick(items, options);
	}

	showOpenDialog(options?: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined> {
		return vscode.window.showOpenDialog(options);
	}

	showSaveDialog(options?: vscode.SaveDialogOptions): Thenable<vscode.Uri | undefined> {
		return vscode.window.showSaveDialog(options);
	}
}
