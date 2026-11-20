/**
 * AsyncQueue - async queue on the WebView side
 *
 * Same implementation as AsyncStream on the extension side
 * Used by the WebView to receive messages from the extension
 *
 * Named AsyncQueue on the WebView side for semantic clarity
 */

export class AsyncQueue<T> implements AsyncIterable<T>, AsyncIterator<T> {
    private queue: T[] = [];
    private readResolve?: (value: IteratorResult<T>) => void;
    private readReject?: (error: any) => void;
    private isDone = false;
    private hasError?: any;
    private started = false;

    [Symbol.asyncIterator](): AsyncIterator<T> {
        if (this.started) {
            throw new Error("Queue can only be iterated once");
        }
        this.started = true;
        return this;
    }

    async next(): Promise<IteratorResult<T>> {
        if (this.queue.length > 0) {
            return { done: false, value: this.queue.shift()! };
        }

        if (this.isDone) {
            return { done: true, value: undefined as any };
        }

        if (this.hasError) {
            throw this.hasError;
        }

        return new Promise<IteratorResult<T>>((resolve, reject) => {
            this.readResolve = resolve;
            this.readReject = reject;
        });
    }

    enqueue(value: T): void {
        if (this.readResolve) {
            const resolve = this.readResolve;
            this.readResolve = undefined;
            this.readReject = undefined;
            resolve({ done: false, value });
        } else {
            this.queue.push(value);
        }
    }

    done(): void {
        this.isDone = true;

        if (this.readResolve) {
            const resolve = this.readResolve;
            this.readResolve = undefined;
            this.readReject = undefined;
            resolve({ done: true, value: undefined as any });
        }
    }

    error(error: any): void {
        this.hasError = error;

        if (this.readReject) {
            const reject = this.readReject;
            this.readResolve = undefined;
            this.readReject = undefined;
            reject(error);
        }
    }

    async return(): Promise<IteratorResult<T>> {
        this.isDone = true;
        return { done: true, value: undefined as any };
    }
}
