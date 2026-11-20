/**
 * WebView service: routes the uic chat protocol between ClaudeAgentService and
 * the Claude UI tabs.
 *
 * Upstream uic owned one sidebar webview. Here every Claude UI tab is an iframe
 * inside a terminal webview (side bar view or the Agent mode panel), so:
 * - inbound messages arrive through `receive(tabId, message)` and are tagged
 *   with `webviewId = tabId` before reaching the agent service;
 * - outbound messages go to the tab named by `webviewId`, else to the tab that
 *   launched `channelId`, else to every tab (config broadcasts);
 * - a tab that goes away (closed, or its webview disposed) has its channels
 *   closed, because nothing is left to read their stream.
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';

export const IWebViewService = createDecorator<IWebViewService>('webViewService');

/** A terminal webview that hosts Claude UI iframes. */
export interface ClaudeUiSink {
	readonly webview: vscode.Webview;
	/** Deliver `payload` to the iframe of `tabId` (or to all iframes when `tabId` is undefined). */
	post(tabId: string | undefined, payload: unknown): void;
}

export interface ClaudeUiTabRequest {
	kind: 'new' | 'rename';
	tabId: string;
	title?: string;
	initialPrompt?: string;
}

export interface IWebViewService {
	readonly _serviceBrand: undefined;

	/** Any webview, for `asWebviewUri` lookups. */
	getWebView(): vscode.Webview | undefined;

	/** Send one protocol message from the extension to the webview side. */
	postMessage(message: any): void;

	/** Handler that receives every message coming from a tab (the agent service). */
	setMessageHandler(handler: (message: any) => void): void;

	/** Called by ClaudeAgentService wiring to close a channel whose tab disappeared. */
	setChannelCloser(closer: (channelId: string) => void): void;

	registerSink(sink: ClaudeUiSink): vscode.Disposable;

	/** A message from the iframe of `tabId`. */
	receive(tabId: string, message: any): void;

	/** The tab's iframe is gone; close the channels it launched. */
	releaseTab(tabId: string): void;

	/** `new_conversation_tab` / `rename_tab` requests, handled by the terminal panel. */
	readonly onTabRequest: vscode.Event<ClaudeUiTabRequest>;
	requestTab(request: ClaudeUiTabRequest): void;

	/** The Claude session id a tab is showing, so a rebuilt tab can resume it. */
	readonly onTabSession: vscode.Event<{ tabId: string; sessionId: string }>;
}

export class WebViewService implements IWebViewService {
	readonly _serviceBrand: undefined;

	private readonly sinks = new Set<ClaudeUiSink>();
	private readonly channelOwner = new Map<string, string>();
	private messageHandler?: (message: any) => void;
	private channelCloser?: (channelId: string) => void;
	private readonly tabRequests = new vscode.EventEmitter<ClaudeUiTabRequest>();
	readonly onTabRequest = this.tabRequests.event;
	private readonly tabSessions = new vscode.EventEmitter<{ tabId: string; sessionId: string }>();
	readonly onTabSession = this.tabSessions.event;
	private readonly lastSession = new Map<string, string>();

	constructor(@ILogService private readonly logService: ILogService) {}

	getWebView(): vscode.Webview | undefined {
		for (const sink of this.sinks) {
			return sink.webview;
		}
		return undefined;
	}

	postMessage(message: any): void {
		const payload = { type: 'from-extension', message };
		const tabId = this.targetTab(message);
		for (const sink of this.sinks) {
			try {
				sink.post(tabId, payload);
			} catch (error) {
				this.logService.warn('[WebViewService] post failed', error as Error);
			}
		}
		if (message?.type === 'io_message' && tabId) {
			const sessionId = message.message?.session_id;
			if (typeof sessionId === 'string' && sessionId && this.lastSession.get(tabId) !== sessionId) {
				this.lastSession.set(tabId, sessionId);
				this.tabSessions.fire({ tabId, sessionId });
			}
		}
		if (message?.type === 'close_channel' && typeof message.channelId === 'string') {
			this.channelOwner.delete(message.channelId);
		}
	}

	setMessageHandler(handler: (message: any) => void): void {
		this.messageHandler = handler;
	}

	setChannelCloser(closer: (channelId: string) => void): void {
		this.channelCloser = closer;
	}

	registerSink(sink: ClaudeUiSink): vscode.Disposable {
		this.sinks.add(sink);
		return new vscode.Disposable(() => {
			this.sinks.delete(sink);
		});
	}

	receive(tabId: string, message: any): void {
		if (!message || typeof message !== 'object') {
			return;
		}
		if (message.type === 'launch_claude' && typeof message.channelId === 'string') {
			this.channelOwner.set(message.channelId, tabId);
		} else if (message.type === 'close_channel' && typeof message.channelId === 'string') {
			this.channelOwner.delete(message.channelId);
		}
		this.messageHandler?.({ ...message, webviewId: tabId });
	}

	releaseTab(tabId: string): void {
		this.lastSession.delete(tabId);
		for (const [channelId, owner] of [...this.channelOwner]) {
			if (owner !== tabId) {
				continue;
			}
			this.channelOwner.delete(channelId);
			try {
				this.channelCloser?.(channelId);
			} catch (error) {
				this.logService.warn(`[WebViewService] closing ${channelId} failed`, error as Error);
			}
		}
	}

	requestTab(request: ClaudeUiTabRequest): void {
		this.tabRequests.fire(request);
	}

	private targetTab(message: any): string | undefined {
		if (typeof message?.webviewId === 'string') {
			return message.webviewId;
		}
		if (typeof message?.channelId === 'string') {
			return this.channelOwner.get(message.channelId);
		}
		return undefined;
	}
}
