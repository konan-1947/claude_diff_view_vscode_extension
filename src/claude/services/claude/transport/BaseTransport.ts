/**
 * BaseTransport - abstract transport-layer interface
 *
 * Defines the basic Transport contract for passing messages between the Agent and the client
 *
 * Implementations:
 * - VSCodeTransport: VS Code WebView transport
 * - NestJSTransport: NestJS WebSocket transport (future)
 * - ElectronTransport: Electron IPC transport (future)
 *
 * Design principles:
 * - Bidirectional: send() sends messages, onMessage() receives them
 * - Platform-agnostic: no dependency on a specific host environment API
 * - Minimal abstraction: defines only the core transport capability
 */

/**
 * Transport interface
 *
 * Passes messages between the Claude Agent and the client (WebView/WebSocket/IPC)
 */
export interface ITransport {
    /**
     * Send a message to the client
     *
     * @param message - the message object to send
     */
    send(message: any): void;

    /**
     * Listen for messages from the client
     *
     * @param callback - message receive callback
     */
    onMessage(callback: (message: any) => void): void;
}

/**
 * Abstract Transport base class (optional)
 *
 * Provides common functionality; concrete implementations can extend it
 */
export abstract class BaseTransport implements ITransport {
    protected messageCallback?: (message: any) => void;

    /**
     * Send a message (implemented by subclasses)
     */
    abstract send(message: any): void;

    /**
     * Register a message listener
     */
    onMessage(callback: (message: any) => void): void {
        this.messageCallback = callback;
    }

    /**
     * Fire the message callback (for subclasses)
     */
    protected triggerMessage(message: any): void {
        if (this.messageCallback) {
            this.messageCallback(message);
        }
    }
}
