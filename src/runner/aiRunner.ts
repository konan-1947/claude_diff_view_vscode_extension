/**
 * aiRunner.ts
 *
 * Interface chung cho tất cả AI CLI runner (Claude, ...).
 * Cho phép extension hoạt động với nhiều tool mà không thay đổi logic core.
 */

import { DiffManager } from '../diff/diffManager';

export type StatusCallback = (
  status: 'running' | 'idle' | 'error',
  message?: string
) => void;

export type ProgressCallback = (step: string) => void;

export interface IAiRunner {
  /** Tên tool để hiển thị trên UI ("claude") */
  readonly toolName: string;

  /**
   * Chạy một session AI với prompt cho trước.
   * Gọi onStatus khi trạng thái thay đổi, onProgress để cập nhật UI.
   */
  run(
    prompt: string,
    workingDir: string,
    onStatus: StatusCallback,
    onProgress?: ProgressCallback
  ): Promise<void>;

  /**
   * Huỷ session đang chạy (kill child process) nếu có.
   * Dùng khi extension deactivate để tránh orphan process.
   */
  cancel?(): void;
}
