/**
 * Log Service
 * Provides multi-level logging
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';

export const ILogService = createDecorator<ILogService>('logService');

export enum LogLevel {
	Trace = 0,
	Debug = 1,
	Info = 2,
	Warning = 3,
	Error = 4
}

export interface ILogService {
	readonly _serviceBrand: undefined;

	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;
	setLevel(level: LogLevel): void;
}

export class LogService implements ILogService {
	readonly _serviceBrand: undefined;

	private level: LogLevel = LogLevel.Info;
	private outputChannel: vscode.LogOutputChannel;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('AI CLI Claude UI', { log: true });
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	trace(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Trace) {
			this.outputChannel.trace(message, ...args);
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Debug) {
			this.outputChannel.debug(message, ...args);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Info) {
			this.outputChannel.info(message, ...args);
		}
	}

	warn(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Warning) {
			this.outputChannel.warn(message, ...args);
		}
	}

	error(message: string | Error, ...args: any[]): void {
		if (this.level <= LogLevel.Error) {
			if (message instanceof Error) {
				this.outputChannel.error(message.message, ...args);
				if (message.stack) {
					this.outputChannel.error(message.stack);
				}
			} else {
				this.outputChannel.error(message, ...args);
			}
		}
	}
}
