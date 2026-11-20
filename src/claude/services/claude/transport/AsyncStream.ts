/**
 * AsyncStream - manually controlled async iterator
 *
 * Implements the producer-consumer pattern, used for:
 * 1. The extension receiving messages from the WebView
 * 2. The extension sending user messages to the SDK
 * 3. The WebView receiving messages from the extension
 *
 * Features:
 * - Supports async iteration (for await...of)
 * - Automatic backpressure (queue buffering)
 * - The stream can be ended manually
 * - Supports error propagation
 */

export class AsyncStream<T> implements AsyncIterable<T>, AsyncIterator<T> {
    private queue: T[] = [];
    private readResolve?: (value: IteratorResult<T>) => void;
    private readReject?: (error: any) => void;
    private isDone = false;
    private hasError?: any;
    private started = false;
    private returned?: () => void;

    constructor(returned?: () => void) {
        this.returned = returned;
    }

    /**
     * Implements the async iterator protocol
     */
    [Symbol.asyncIterator](): AsyncIterator<T> {
        if (this.started) {
            throw new Error("Stream can only be iterated once");
        }
        this.started = true;
        return this;
    }

    /**
     * Get the next value (consumer API)
     */
    async next(): Promise<IteratorResult<T>> {
        // 1. If the queue has data, return it immediately
        if (this.queue.length > 0) {
            return { done: false, value: this.queue.shift()! };
        }

        // 2. If the stream has ended, return the done marker
        if (this.isDone) {
            return { done: true, value: undefined as any };
        }

        // 3. If there is an error, reject the Promise
        if (this.hasError) {
            throw this.hasError;
        }

        // 4. Wait for new data
        return new Promise<IteratorResult<T>>((resolve, reject) => {
            this.readResolve = resolve;
            this.readReject = reject;
        });
    }

    /**
     * Produce data (producer API)
     */
    enqueue(value: T): void {
        // If a consumer is waiting, satisfy it directly
        if (this.readResolve) {
            const resolve = this.readResolve;
            this.readResolve = undefined;
            this.readReject = undefined;
            resolve({ done: false, value });
        } else {
            // Otherwise enqueue
            this.queue.push(value);
        }
    }

    /**
     * Mark the stream as done
     */
    done(): void {
        this.isDone = true;

        // If a consumer is waiting, notify completion
        if (this.readResolve) {
            const resolve = this.readResolve;
            this.readResolve = undefined;
            this.readReject = undefined;
            resolve({ done: true, value: undefined as any });
        }
    }

    /**
     * Set the error state
     */
    error(error: any): void {
        this.hasError = error;

        // If a consumer is waiting, reject the Promise
        if (this.readReject) {
            const reject = this.readReject;
            this.readResolve = undefined;
            this.readReject = undefined;
            reject(error);
        }
    }

    /**
     * Release resources
     */
    async return(): Promise<IteratorResult<T>> {
        this.isDone = true;
        if (this.returned) {
            this.returned();
        }
        return { done: true, value: undefined as any };
    }

    /**
     * Static factory: create a stream from an array
     */
    static from<T>(items: T[]): AsyncStream<T> {
        const stream = new AsyncStream<T>();
        for (const item of items) {
            stream.enqueue(item);
        }
        stream.done();
        return stream;
    }
}

/**
 * Usage example:
 *
 * // Producer
 * const stream = new AsyncStream<string>();
 * setTimeout(() => stream.enqueue("msg1"), 100);
 * setTimeout(() => stream.enqueue("msg2"), 200);
 * setTimeout(() => stream.done(), 300);
 *
 * // Consumer
 * for await (const msg of stream) {
 *     console.log(msg);  // "msg1", "msg2"
 * }
 */
