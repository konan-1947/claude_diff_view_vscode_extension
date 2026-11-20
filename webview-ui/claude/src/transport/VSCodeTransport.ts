import { BaseTransport } from './BaseTransport';
import { EventEmitter } from '../utils/events';
import type { FromExtensionWrapper, WebViewToExtensionMessage } from '@shared/messages';

/**
 * Transport for a Claude UI tab.
 *
 * Upstream ran as the top-level webview and called `acquireVsCodeApi()`. Here
 * the app runs in an `<iframe srcdoc>` inside the terminal webview (one per
 * Claude UI tab), so messages are relayed by the parent document:
 * - up:   `parent.postMessage({ __claudeUi: tabId, message })`, which the
 *         terminal webview forwards to the extension as `{ type: 'claudeUi' }`;
 * - down: the parent posts the same `{ type: 'from-extension' }` wrapper the
 *         upstream extension sent, into this iframe's window.
 */
export class VSCodeTransport extends BaseTransport {
    private readonly tabId: string;
    private readonly closedPromise: Promise<void>;

    override get closed(): Promise<void> {
        return this.closedPromise;
    }

    private handleMessage = (event: MessageEvent<FromExtensionWrapper>) => {
        if (event.source !== window.parent) {
            return;
        }
        const data = event.data;
        if (!data || data.type !== 'from-extension') {
            return;
        }
        this.fromHost.enqueue(data.message);
    };

    constructor(atMentionEvents: EventEmitter<string>, selectionChangedEvents: EventEmitter<any>) {
        super(atMentionEvents, selectionChangedEvents);

        this.tabId = window.UIC_BOOTSTRAP?.id ?? '';
        window.addEventListener('message', this.handleMessage);

        this.closedPromise = new Promise(() => {
            /* resolved when extension disposes webview */
        });
    }

    protected send(message: WebViewToExtensionMessage): void {
        window.parent.postMessage({ __claudeUi: this.tabId, message }, '*');
    }

    override close(): void {
        window.removeEventListener('message', this.handleMessage);
        super.close();
    }
}
