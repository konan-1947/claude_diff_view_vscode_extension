/**
 * Terminal Service
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';

export const ITerminalService = createDecorator<ITerminalService>('terminalService');

export interface ITerminalService {
	readonly _serviceBrand: undefined;

	createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): vscode.Terminal;
	createTerminal(options: vscode.TerminalOptions): vscode.Terminal;
	createTerminal(options: vscode.ExtensionTerminalOptions): vscode.Terminal;

	getActiveTerminal(): vscode.Terminal | undefined;
	sendText(text: string, addNewLine?: boolean): void;
}

export class TerminalService implements ITerminalService {
	readonly _serviceBrand: undefined;

	createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): vscode.Terminal;
	createTerminal(options: vscode.TerminalOptions): vscode.Terminal;
	createTerminal(options: vscode.ExtensionTerminalOptions): vscode.Terminal;
	createTerminal(name?: any, shellPath?: any, shellArgs?: any): vscode.Terminal {
		return vscode.window.createTerminal(name, shellPath, shellArgs);
	}

	getActiveTerminal(): vscode.Terminal | undefined {
		return vscode.window.activeTerminal;
	}

	sendText(text: string, addNewLine: boolean = true): void {
		const terminal = this.getActiveTerminal();
		if (terminal) {
			terminal.sendText(text, addNewLine);
		}
	}
}
