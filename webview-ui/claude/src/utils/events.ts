/**
 * EventEmitter - simple event emitter
 *
 * Manages registering and firing event callbacks
 * Mainly used for tool request/response callbacks and session state change notifications
 */
export class EventEmitter<T = any> {
    private callbacks: Array<(data: T) => void> = [];

    /**
     * Add an event listener
     * @param callback callback function
     * @returns unsubscribe function
     */
    add(callback: (data: T) => void): () => void {
        this.callbacks.push(callback);

        // Return the unsubscribe function
        return () => {
            const index = this.callbacks.indexOf(callback);
            if (index !== -1) {
                this.callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Fire the event, notifying all listeners
     * @param data event data
     */
    emit(data: T): void {
        for (const callback of this.callbacks) {
            try {
                callback(data);
            } catch (error) {
                console.error('[EventEmitter] Callback error:', error);
            }
        }
    }

    /**
     * Remove all listeners
     */
    clear(): void {
        this.callbacks = [];
    }

    /**
     * Get the listener count
     */
    get listenerCount(): number {
        return this.callbacks.length;
    }
}
