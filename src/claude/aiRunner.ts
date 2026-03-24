/**
 * aiRunner.ts
 *
 * Interface chung cho tất cả AI CLI runner (Claude, Qwen, ...).
 * Cho phép extension hoạt động với nhiều tool mà không thay đổi logic core.
 */

import { DiffManager } from '../diff/diffManager';

export type StatusCallback = (
  status: 'running' | 'idle' | 'error',
  message?: string
) => void;

export type ProgressCallback = (step: string) => void;

export interface IAiRunner {
  /** Tên tool để hiển thị trên UI ("claude" | "qwen") */
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
   * Trả về đường dẫn file settings.json của tool này.
   * Dùng cho tính năng installHooks.
   */
  getSettingsFilePath(): string;

  /**
   * Trả về các tool name file-editing mà CLI này dùng.
   * Dùng cho hook matcher.
   */
  getFileEditToolNames(): string[];
}
