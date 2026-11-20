/**
 * Workspace Service
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';

export const IWorkspaceService = createDecorator<IWorkspaceService>('workspaceService');

export interface IWorkspaceService {
	readonly _serviceBrand: undefined;

	/**
	 * Get all workspace folders
	 */
	getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined;

	/**
	 * Get the workspace folder for a URI
	 */
	getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined;

	/**
	 * Get the default (first) workspace folder
	 */
	getDefaultWorkspaceFolder(): vscode.WorkspaceFolder | undefined;

	/**
	 * Workspace change event
	 */
	onDidChangeWorkspaceFolders: vscode.Event<vscode.WorkspaceFoldersChangeEvent>;
}

export class WorkspaceService implements IWorkspaceService {
	readonly _serviceBrand: undefined;

	getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
		return vscode.workspace.workspaceFolders;
	}

	getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
		return vscode.workspace.getWorkspaceFolder(uri);
	}

	getDefaultWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
		const folders = vscode.workspace.workspaceFolders;
		return folders && folders.length > 0 ? folders[0] : undefined;
	}

	get onDidChangeWorkspaceFolders(): vscode.Event<vscode.WorkspaceFoldersChangeEvent> {
		return vscode.workspace.onDidChangeWorkspaceFolders;
	}
}
