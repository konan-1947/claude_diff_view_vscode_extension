/**
 * VSCodeTransport - VS Code WebView transport adapter
 *
 * Responsibilities:
 * 1. Implement the BaseTransport abstract class
 * 2. Wrap VS Code WebView communication through WebViewService
 * 3. Pass messages between the Agent and the WebView
 *
 * Features:
 * - Isolates native VS Code APIs from the core logic
 * - All dependencies injected via DI
 * - Easy to swap for another transport later (e.g. NestJS WebSocket)
 */

import { BaseTransport } from './BaseTransport';
import { ILogService } from '../../logService';
import { IWebViewService } from '../../webViewService';

/**
 * VS Code WebView Transport implementation
 */
export class VSCodeTransport extends BaseTransport {
    constructor(
        @IWebViewService private readonly webViewService: IWebViewService,
        @ILogService private readonly logService: ILogService
    ) {
        super();
        this.logService.info('[VSCodeTransport] Initialized');
    }

    /**
     * Send a message to the WebView
     */
    send(message: any): void {
        try {
            this.logService.info(`[VSCodeTransport] Sending message: ${message.type}`);
            this.webViewService.postMessage(message);
        } catch (error) {
            this.logService.error('[VSCodeTransport] Failed to send message:', error);
        }
    }
}
