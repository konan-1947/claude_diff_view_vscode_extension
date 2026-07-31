/**
 * writeBurstMeter.ts
 *
 * Đo tốc độ ghi file thực tế để phân biệt batch operation (git checkout) với
 * AI tool edit — mô tả ở docs/GIT_VS_AI_EDIT_DETECTION.md. Ngưỡng/cửa sổ có
 * thể chỉnh qua settings `ai-cli-diff-view.burstDetection*` (xem Advanced
 * section trong Settings popover của terminal panel).
 *
 * `record()` trả về quyết định (có vượt ngưỡng burst hay không) để
 * `WorkspaceWatcher` quyết định giữ lại file đó chờ xác nhận git thay vì mở
 * diff ngay — xem `WorkspaceWatcher.resolveOrHold()`.
 *
 * Ghi nhận TRƯỚC mọi bước lọc (exclude/dedup/debounce) ở WorkspaceWatcher, vì
 * các bước đó có thể che mất đúng cụm burst cần đo.
 */

export interface BurstMeterConfig {
  enabled: boolean;
  windowMs: number;
  threshold: number;
}

export const DEFAULT_BURST_METER_CONFIG: BurstMeterConfig = {
  enabled: true,
  windowMs: 300,
  threshold: 8,
};

export class WriteBurstMeter {
  /** Timestamp của các event gần đây (đã trim theo config.windowMs). */
  private timestamps: number[] = [];
  /** true khi cụm hiện tại đã vượt ngưỡng và đã log — tránh log lặp mỗi file trong cùng 1 burst. */
  private burstActive = false;

  constructor(private config: BurstMeterConfig = DEFAULT_BURST_METER_CONFIG) {}

  updateConfig(config: BurstMeterConfig): void {
    this.config = config;
    if (!config.enabled) {
      this.timestamps = [];
      this.burstActive = false;
    }
  }

  /** Trả `true` nếu event này khiến cửa sổ trượt đạt/vượt ngưỡng burst. */
  record(filePath: string): boolean {
    if (!this.config.enabled) { return false; }

    const now = Date.now();
    this.timestamps.push(now);
    this.trim(now);

    const count = this.timestamps.length;
    const isBurst = count >= this.config.threshold;
    if (isBurst) {
      if (!this.burstActive) {
        this.burstActive = true;
        console.log(
          `[ai-cli-diff burst-meter] ${count} file thay đổi trong ${this.config.windowMs}ms ` +
          `(>= ngưỡng ${this.config.threshold}) — gần nhất: ${filePath}`
        );
      }
    } else {
      this.burstActive = false;
    }
    return isBurst;
  }

  private trim(now: number): void {
    while (this.timestamps.length > 0 && now - this.timestamps[0] > this.config.windowMs) {
      this.timestamps.shift();
    }
  }
}
