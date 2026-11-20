/*---------------------------------------------------------------------------------------------
 *  Simplified base utilities for the DI framework.
 *  Extracted from microsoft/vscode — only the symbols actually used by src/di/ are retained.
 *---------------------------------------------------------------------------------------------*/

// ── IDisposable ──

export interface IDisposable {
  dispose(): void;
}

export function isDisposable<E>(thing: E): thing is E & IDisposable {
  return typeof thing === 'object' && thing !== null
    && typeof (thing as any).dispose === 'function'
    && (thing as any).dispose.length === 0;
}

export function toDisposable(fn: () => void): IDisposable {
  let disposed = false;
  return {
    dispose() {
      if (!disposed) {
        disposed = true;
        fn();
      }
    }
  };
}

export function dispose<T extends IDisposable>(arg: T | Iterable<T> | undefined): any {
  if (arg === undefined || arg === null) {
    return;
  }
  if (Symbol.iterator in Object(arg)) {
    const errors: any[] = [];
    for (const d of arg as Iterable<T>) {
      if (d) {
        try {
          d.dispose();
        } catch (e) {
          errors.push(e);
        }
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Encountered errors while disposing');
    return Array.isArray(arg) ? [] : arg;
  }
  (arg as T).dispose();
  return arg;
}

// ── DisposableStore ──

export class DisposableStore implements IDisposable {
  private readonly _toDispose = new Set<IDisposable>();
  private _isDisposed = false;

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    this.clear();
  }

  clear(): void {
    if (this._toDispose.size === 0) return;
    try {
      dispose(this._toDispose);
    } finally {
      this._toDispose.clear();
    }
  }

  add<T extends IDisposable>(o: T): T {
    if (!o) return o;
    if ((o as unknown as DisposableStore) === this) {
      throw new Error('Cannot register a disposable on itself!');
    }
    if (this._isDisposed) {
      console.warn('Trying to add a disposable to a DisposableStore that has already been disposed of.');
    } else {
      this._toDispose.add(o);
    }
    return o;
  }
}

// ── Event (type-only — used for delayed instantiation proxy) ──

export interface Event<T> {
  (listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

// ── LinkedList ──

class LLNode<E> {
  static readonly Undefined = new LLNode<any>(undefined);
  element: E;
  next: LLNode<E>;
  prev: LLNode<E>;

  constructor(element: E) {
    this.element = element;
    this.next = LLNode.Undefined;
    this.prev = LLNode.Undefined;
  }
}

export class LinkedList<E> {
  private _first: LLNode<E> = LLNode.Undefined;
  private _last: LLNode<E> = LLNode.Undefined;
  private _size: number = 0;

  get size(): number { return this._size; }

  isEmpty(): boolean { return this._first === LLNode.Undefined; }

  clear(): void {
    let node = this._first;
    while (node !== LLNode.Undefined) {
      const next = node.next;
      node.prev = LLNode.Undefined;
      node.next = LLNode.Undefined;
      node = next;
    }
    this._first = LLNode.Undefined;
    this._last = LLNode.Undefined;
    this._size = 0;
  }

  push(element: E): () => void {
    return this._insert(element, true);
  }

  unshift(element: E): () => void {
    return this._insert(element, false);
  }

  private _insert(element: E, atTheEnd: boolean): () => void {
    const newNode = new LLNode(element);
    if (this._first === LLNode.Undefined) {
      this._first = newNode;
      this._last = newNode;
    } else if (atTheEnd) {
      const oldLast = this._last;
      this._last = newNode;
      newNode.prev = oldLast;
      oldLast.next = newNode;
    } else {
      const oldFirst = this._first;
      this._first = newNode;
      newNode.next = oldFirst;
      oldFirst.prev = newNode;
    }
    this._size += 1;

    let didRemove = false;
    return () => {
      if (!didRemove) {
        didRemove = true;
        this._remove(newNode);
      }
    };
  }

  shift(): E | undefined {
    if (this._first === LLNode.Undefined) return undefined;
    const res = this._first.element;
    this._remove(this._first);
    return res;
  }

  pop(): E | undefined {
    if (this._last === LLNode.Undefined) return undefined;
    const res = this._last.element;
    this._remove(this._last);
    return res;
  }

  private _remove(node: LLNode<E>): void {
    if (node.prev !== LLNode.Undefined && node.next !== LLNode.Undefined) {
      node.prev.next = node.next;
      node.next.prev = node.prev;
    } else if (node.prev === LLNode.Undefined && node.next === LLNode.Undefined) {
      this._first = LLNode.Undefined;
      this._last = LLNode.Undefined;
    } else if (node.next === LLNode.Undefined) {
      this._last = this._last.prev;
      this._last.next = LLNode.Undefined;
    } else {
      this._first = this._first.next;
      this._first.prev = LLNode.Undefined;
    }
    this._size -= 1;
  }

  *[Symbol.iterator](): Iterator<E> {
    let node = this._first;
    while (node !== LLNode.Undefined) {
      yield node.element;
      node = node.next;
    }
  }
}

// ── GlobalIdleValue (lazy evaluation — idle callbacks unavailable in extension host) ──

export class GlobalIdleValue<T> {
  private _didRun = false;
  private _value?: T;
  private _error: unknown;

  constructor(private readonly _executor: () => T) {}

  get value(): T {
    if (!this._didRun) {
      try {
        this._value = this._executor();
      } catch (err) {
        this._error = err;
      } finally {
        this._didRun = true;
      }
    }
    if (this._error) throw this._error;
    return this._value!;
  }

  get isInitialized(): boolean {
    return this._didRun;
  }

  dispose(): void {
    // no-op: no idle handle to cancel in simplified version
  }
}

// ── Errors ──

export function illegalState(msg = 'Illegal state'): Error {
  return new Error(msg);
}
