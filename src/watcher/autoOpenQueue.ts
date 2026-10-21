/**
 * autoOpenQueue.ts
 *
 * Mở diff tab cho các file AI vừa ghi, có giới hạn (issue #37). Một agent ghi
 * hàng nghìn file từng làm extension mở hàng nghìn webview Monaco cùng lúc
 * (HOT-1, HOT-5); không ai review nổi chừng đó tab.
 *
 * - Tổng số tab diff đang mở không vượt `maxOpen()` (0 = không giới hạn). File
 *   thừa vẫn pending (PENDING FILES, Alt+H/L) nhưng không tự mở tab, và không
 *   được mở bù khi có chỗ trống.
 * - Chọn file đầu theo thứ tự cây, như PENDING FILES / Alt+L.
 * - Mở theo đợt nhỏ, `await` và nhường event loop giữa các đợt.
 * - Không bao giờ cướp focus (burst hay ghi lẻ đều vậy): người dùng có thể
 *   đang gõ cho agent khi file được ghi.
 */

export interface AutoOpenDeps {
  /** Must open without taking keyboard focus. */
  openDiff(path: string): Promise<void>;
  isPending(path: string): boolean;
  /** Position in Pending Files tree order. */
  pendingIndex(path: string): number;
  openDiffCount(): number;
  shouldAutoOpen(): boolean;
  /** 0 = no limit. */
  maxOpen(): number;
  /** `skipped` files were left in Pending Files because `max` diff tabs are open. */
  notifyCapped(skipped: number, max: number): void;
}

const BATCH_SIZE = 10;

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export class AutoOpenQueue {
  private queue = new Set<string>();
  private drainTimer: NodeJS.Timeout | undefined;
  private draining = false;
  private disposed = false;
  /** One notice per time the cap is hit, not one per file while it stays full. */
  private cappedNoticeShown = false;

  constructor(private readonly deps: AutoOpenDeps) {}

  enqueue(path: string): void {
    if (this.disposed) { return; }
    this.queue.add(path);
    // Writes released in the same tick (a burst dump) are sorted and capped together.
    if (!this.drainTimer && !this.draining) {
      this.drainTimer = setTimeout(() => {
        this.drainTimer = undefined;
        void this.drain();
      }, 0);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.drainTimer) { clearTimeout(this.drainTimer); }
    this.drainTimer = undefined;
    this.queue.clear();
  }

  private async drain(): Promise<void> {
    this.draining = true;
    try {
      while (this.queue.size > 0 && !this.disposed) {
        const entries = Array.from(this.queue);
        this.queue.clear();
        if (!this.deps.shouldAutoOpen()) { continue; }

        const candidates = entries
          .filter((p) => this.deps.isPending(p))
          .sort((a, b) => this.deps.pendingIndex(a) - this.deps.pendingIndex(b));
        const max = this.deps.maxOpen();
        const slots = max > 0 ? Math.max(0, max - this.deps.openDiffCount()) : candidates.length;
        const toOpen = candidates.slice(0, slots);
        const skipped = candidates.length - toOpen.length;

        if (skipped > 0) {
          if (!this.cappedNoticeShown) {
            this.cappedNoticeShown = true;
            this.deps.notifyCapped(skipped, max);
          }
        } else if (candidates.length > 0) {
          this.cappedNoticeShown = false;
        }

        for (let i = 0; i < toOpen.length && !this.disposed; i += BATCH_SIZE) {
          if (!this.deps.shouldAutoOpen()) { break; }
          // Accept All / a git branch switch may have resolved files meanwhile.
          const batch = toOpen.slice(i, i + BATCH_SIZE).filter((p) => this.deps.isPending(p));
          await Promise.all(batch.map((p) =>
            this.deps.openDiff(p).catch((err: unknown) => {
              console.error('[ai-cli-diff-view] auto-open diff failed:', err);
            })
          ));
          await yieldToEventLoop();
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
