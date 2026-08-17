/**
 * fileSizeLimit.ts
 *
 * Bỏ qua hẳn những file quá lớn — coi như một dạng ignore, giống
 * `pathExclusions.ts` nhưng theo kích thước thay vì đường dẫn.
 *
 * Lý do: file cực lớn hầu như luôn là code sinh tự động, bundle, lock file hay
 * dump dữ liệu — không phải thứ người ta ngồi review từng hunk. Đổi lại chúng
 * kéo theo chi phí lớn nhất ở mọi khâu: giữ baseline trong RAM, tính diff (Myers
 * là O((M+N)·D), nên xấu đi rất nhanh khi file to), và render trong webview.
 *
 * File bị loại ở đây thì không có baseline, không mở diff — nó đơn giản không
 * nằm trong tầm ngắm của extension.
 */

import * as vscode from 'vscode';

/** Giá trị mặc định của `ai-cli-diff-view.maxFileLines`. 0 = không giới hạn. */
const DEFAULT_MAX_FILE_LINES = 5000;

/**
 * Số byte/dòng dùng cho bước lọc thô theo kích thước file, để không phải đọc
 * một file vài MB chỉ để rồi loại nó.
 *
 * Đo trên 189 file nguồn thật (repo này + monaco + jsdiff): trung vị 43 ký tự
 * /dòng, p90 55. Lấy 200 là rộng gấp ~4 lần p90, nên bước lọc này gần như không
 * bao giờ loại nhầm file code bình thường. Thứ nó loại là bundle minify — vốn
 * có thể chỉ 1 dòng nhưng nặng hàng MB, tức là ngưỡng số dòng không bắt được.
 */
const BYTES_PER_LINE_HEADROOM = 200;

let cachedMaxLines: number | undefined;

export function refreshFileSizeLimit(): void {
  const config = vscode.workspace.getConfiguration('ai-cli-diff-view');
  const value = config.get<number>('maxFileLines', DEFAULT_MAX_FILE_LINES);
  cachedMaxLines = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function maxLines(): number {
  if (cachedMaxLines === undefined) { refreshFileSizeLimit(); }
  return cachedMaxLines!;
}

/**
 * Lọc thô theo số byte, dùng trước khi đọc file.
 * Chỉ trả về true khi chắc chắn file không thể lọt qua giới hạn số dòng với
 * mật độ ký tự hợp lý — nên không cần đọc nội dung nữa.
 */
export function exceedsSizeLimitByBytes(byteSize: number): boolean {
  const max = maxLines();
  if (max <= 0) { return false; }
  return byteSize > max * BYTES_PER_LINE_HEADROOM;
}

/**
 * Kiểm tra chính xác theo số dòng, sau khi đã có nội dung.
 *
 * Newline cuối file KHÔNG tính thành một dòng nữa — file 5000 dòng kết thúc
 * bằng '\n' vẫn là 5000 dòng, đúng như editor hiển thị (khác `split('\n').length`,
 * vốn trả về 5001).
 */
export function exceedsLineLimit(content: string): boolean {
  const max = maxLines();
  if (max <= 0) { return false; }

  let newlines = 0;
  let idx = content.indexOf('\n');
  while (idx !== -1) {
    // Vượt ngưỡng chỉ tính riêng số newline thì chắc chắn vượt, thoát sớm.
    if (++newlines > max) { return true; }
    idx = content.indexOf('\n', idx + 1);
  }
  const lines = content.endsWith('\n') ? newlines : newlines + 1;
  return lines > max;
}

/** Dùng cho log/thông báo. */
export function currentMaxFileLines(): number {
  return maxLines();
}
