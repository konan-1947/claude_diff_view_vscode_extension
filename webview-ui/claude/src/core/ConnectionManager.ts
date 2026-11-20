import { signal, computed } from 'alien-signals';
import type { BaseTransport } from '../transport/BaseTransport';

type ConnectionFactory = () => BaseTransport;

export class ConnectionManager {
  private readonly connectionSignal = signal<BaseTransport | undefined>(undefined);
  private currentPromise?: Promise<BaseTransport>;

  readonly state = computed(() => this.connectionSignal()?.state() ?? 'disconnected');
  readonly connection = computed(() => this.connectionSignal());

  constructor(private readonly factory: ConnectionFactory) {}

  async get(): Promise<BaseTransport> {
    const current = this.connectionSignal();
    if (current) {
      return current;
    }

    if (this.currentPromise) {
      return this.currentPromise;
    }

    this.currentPromise = Promise.resolve(this.factory()).then((connection) => {
      this.connectionSignal(connection);
      return connection;
    });

    return this.currentPromise;
  }

  async open(): Promise<BaseTransport> {
    return this.get();
  }

  close(): void {
    const current = this.connectionSignal();
    if (current) {
      current.close();
      this.connectionSignal(undefined);
    }
    this.currentPromise = undefined;
  }
}
