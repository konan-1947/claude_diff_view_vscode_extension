/**
 * Tabs and Editors Service
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';

export const ITabsAndEditorsService = createDecorator<ITabsAndEditorsService>('tabsAndEditorsService');

export interface ITabsAndEditorsService {
	readonly _serviceBrand: undefined;
	getActiveTextEditor(): vscode.TextEditor | undefined;
	getVisibleTextEditors(): readonly vscode.TextEditor[];
	onDidChangeActiveTextEditor: vscode.Event<vscode.TextEditor | undefined>;
}

export class TabsAndEditorsService implements ITabsAndEditorsService {
	readonly _serviceBrand: undefined;

	getActiveTextEditor(): vscode.TextEditor | undefined {
		return vscode.window.activeTextEditor;
	}

	getVisibleTextEditors(): readonly vscode.TextEditor[] {
		return vscode.window.visibleTextEditors;
	}

	get onDidChangeActiveTextEditor(): vscode.Event<vscode.TextEditor | undefined> {
		return vscode.window.onDidChangeActiveTextEditor;
	}
}
