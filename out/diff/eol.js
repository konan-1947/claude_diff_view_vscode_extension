"use strict";
/**
 * eol.ts
 *
 * Tách line ending ra khỏi nội dung dòng.
 *
 * `\r` là thuộc tính của file, không phải nội dung của dòng — nhưng
 * `split('\n')` để nó dính lại đuôi mỗi dòng, khiến `'abc\r' !== 'abc'` ở 100%
 * số dòng khi hai vế so sánh lệch EOL. Đó là nguyên nhân của bug #15 (diff nhỏ
 * mà hiển thị thay cả file) — xem `docs/BUG_ISSUE_15_FULL_FILE_DIFF.md`.
 *
 * Nguyên tắc dùng: **LF ở giữa, EOL ở biên**. Mọi nội dung đi vào
 * `calculateHunks()` và sang webview đều đã qua `toLf()`; chỉ `fromLf()` lại
 * đúng tại các điểm ghi ra document/đĩa.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectEol = detectEol;
exports.toLf = toLf;
exports.fromLf = fromLf;
/**
 * Đoán EOL của một chuỗi theo đa số. File mixed EOL trả về loại chiếm ưu thế.
 * Chuỗi không có xuống dòng nào -> '\n'.
 */
function detectEol(text) {
    const total = (text.match(/\n/g) || []).length;
    if (total === 0) {
        return '\n';
    }
    const crlf = (text.match(/\r\n/g) || []).length;
    return crlf * 2 > total ? '\r\n' : '\n';
}
/** Chuẩn hoá về LF thuần để so sánh / tính hunk. */
function toLf(text) {
    return text.replace(/\r\n/g, '\n');
}
/**
 * Khôi phục EOL thật trước khi ghi.
 * `text` phải đang ở dạng LF thuần (đã qua `toLf`), nếu không sẽ sinh ra `\r\r\n`.
 */
function fromLf(text, eol) {
    return eol === '\n' ? text : text.replace(/\n/g, '\r\n');
}
//# sourceMappingURL=eol.js.map