/**
 * long_sample_crlf.js
 *
 * File dài dùng để tái hiện bug #15 (diff ít mà hiển thị thay cả file).
 * File này được ghi xuống đĩa với line ending CRLF, mô phỏng đúng trạng thái
 * của một file vừa được git checkout trên Windows (core.autocrlf=true).
 *
 * Cách dùng: sửa vài dòng ở giữa file rồi quan sát diff view.
 */

'use strict';

const DEFAULT_TIMEOUT_MS = 12000;
const MAX_RETRIES = 8;
const BACKOFF_BASE_MS = 250;
const BACKOFF_MAX_MS = 10000;

/**
 * Một hàng đợi công việc rất đơn giản, chạy tuần tự.
 */
class TaskQueue {
  constructor(name) {
    this.name = name;
    this.items = [];
    this.running = false;
    this.completed = 0;
    this.failed = 0;
    this.startedAt = null;
  }

  push(task) {
    if (typeof task !== 'function') {
      throw new TypeError('task must be a function');
    }
    this.items.push(task);
    return this.items.length;
  }

  size() {
    return this.items.length;
  }

  clear() {
    const dropped = this.items.length;
    this.items = [];
    return dropped;
  }

  async run() {
    if (this.running) {
      return { skipped: true };
    }
    this.running = true;
    while (this.items.length > 0) {
      const task = this.items.shift();
      try {
        await task();
        this.completed += 1;
      } catch (err) {
        this.failed += 1;
        console.error('[' + this.name + '] task failed:', err);
      }
    }
    this.running = false;
    return { completed: this.completed, failed: this.failed };
  }
}

/**
 * Chờ một khoảng thời gian.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thử lại một thao tác bất đồng bộ với backoff tuyến tính.
 */
async function withRetry(fn, retries = MAX_RETRIES) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await delay(BACKOFF_BASE_MS * (attempt + 1));
      }
    }
  }
  throw lastError;
}

/**
 * Chuẩn hoá một chuỗi đường dẫn cho việc so sánh.
 */
function normalizePath(input) {
  if (!input) {
    return '';
  }
  return String(input)
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Gom một mảng thành các nhóm có kích thước cố định.
 */
function chunk(list, size) {
  if (size <= 0) {
    throw new RangeError('size must be positive');
  }
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

/**
 * Đếm số lần xuất hiện của mỗi khoá.
 */
function countBy(list, keyFn) {
  const result = new Map();
  for (const item of list) {
    const key = keyFn(item);
    result.set(key, (result.get(key) || 0) + 1);
  }
  return result;
}

/**
 * Loại bỏ phần tử trùng lặp, giữ nguyên thứ tự xuất hiện đầu tiên.
 */
function unique(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/**
 * Định dạng một khoảng thời gian tính bằng mili giây.
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return ms + 'ms';
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return seconds + 's';
  }
  const minutes = Math.floor(seconds / 60);
  return minutes + 'm' + (seconds % 60) + 's';
}

/**
 * Điểm vào demo — chạy vài tác vụ giả lập.
 */
async function main() {
  const queue = new TaskQueue('demo');
  const inputs = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];

  for (const name of inputs) {
    queue.push(async () => {
      await withRetry(async (attempt) => {
        if (attempt === 0 && name === 'gamma') {
          throw new Error('transient failure for ' + name);
        }
        await delay(10);
      });
    });
  }

  const started = 0;
  const summary = await queue.run();
  console.log('queue summary:', summary);
  console.log('groups:', chunk(inputs, 2));
  console.log('counts:', countBy(inputs, (s) => s.length));
  console.log('unique:', unique([1, 2, 2, 3, 3, 3]));
  console.log('path:', normalizePath('D:\\Some\\Folder\\'));
  console.log('elapsed:', formatDuration(DEFAULT_TIMEOUT_MS - started));
}

module.exports = {
  TaskQueue,
  delay,
  withRetry,
  normalizePath,
  chunk,
  countBy,
  unique,
  formatDuration,
  main,
};
