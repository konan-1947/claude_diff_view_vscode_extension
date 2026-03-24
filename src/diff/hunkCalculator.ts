/**
 * hunkCalculator.ts
 *
 * Tính toán các "hunks" thay đổi giữa 2 chuỗi nội dung file.
 * Dùng thuật toán Myers diff (đơn giản hóa) theo từng dòng.
 */

export interface Hunk {
  /** ID duy nhất cho mỗi hunk (dùng để tra cứu khi accept/revert) */
  id: string;
  /** Dòng bắt đầu trong nội dung SỬA ĐỔI (0-indexed), nơi gắn gutter icon */
  modifiedStart: number;
  /** Các dòng bị XÓA (nội dung gốc) */
  removedLines: RemovedLine[];
  /** Các dòng được THÊM (nội dung mới) */
  addedLines: AddedLine[];
}

export interface RemovedLine {
  /** Nội dung dòng bị xóa */
  text: string;
  /** Vị trí dòng trong file gốc (0-indexed) */
  originalLineIndex: number;
}

export interface AddedLine {
  /** Nội dung dòng được thêm */
  text: string;
  /** Vị trí dòng trong file sửa đổi (0-indexed) */
  modifiedLineIndex: number;
}

type DiffOp =
  | { type: 'equal'; text: string; origIdx: number; modIdx: number }
  | { type: 'delete'; text: string; origIdx: number }
  | { type: 'insert'; text: string; modIdx: number };

/**
 * Tính LCS-based diff giữa 2 mảng dòng.
 * Trả về mảng DiffOp theo thứ tự.
 */
function computeLineDiff(origLines: string[], modLines: string[]): DiffOp[] {
  const m = origLines.length;
  const n = modLines.length;

  // Bảng LCS: dp[i][j] = độ dài LCS của origLines[0..i-1] và modLines[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === modLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Truy vết để tạo danh sách DiffOp
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      ops.push({ type: 'equal', text: origLines[i - 1]!, origIdx: i - 1, modIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || (dp[i][j - 1] ?? 0) >= (dp[i - 1][j] ?? 0))) {
      ops.push({ type: 'insert', text: modLines[j - 1]!, modIdx: j - 1 });
      j--;
    } else {
      ops.push({ type: 'delete', text: origLines[i - 1]!, origIdx: i - 1 });
      i--;
    }
  }

  return ops.reverse();
}

let hunkCounter = 0;

function makeHunkId(): string {
  return `hunk-${++hunkCounter}-${Date.now()}`;
}

/**
 * Tính danh sách Hunk từ nội dung file gốc và file đã sửa đổi.
 *
 * @param originalContent - Nội dung trước khi Claude sửa
 * @param modifiedContent - Nội dung sau khi Claude sửa
 * @returns Mảng Hunk, mỗi Hunk đại diện cho một khối thay đổi liên tiếp
 */
export function calculateHunks(
  originalContent: string,
  modifiedContent: string
): Hunk[] {
  const origLines = originalContent.split('\n');
  const modLines = modifiedContent.split('\n');

  const ops = computeLineDiff(origLines, modLines);

  const hunks: Hunk[] = [];
  let currentHunk: Hunk | null = null;

  for (const op of ops) {
    if (op.type === 'equal') {
      // Kết thúc hunk hiện tại nếu có
      if (currentHunk) {
        hunks.push(currentHunk);
        currentHunk = null;
      }
    } else if (op.type === 'delete') {
      if (!currentHunk) {
        // Xác định modifiedStart: dùng modIdx của dòng delete tiếp theo
        // Sẽ cập nhật khi gặp insert, hoặc dùng origIdx nếu chỉ có delete
        currentHunk = {
          id: makeHunkId(),
          modifiedStart: 0,
          removedLines: [],
          addedLines: [],
        };
      }
      currentHunk.removedLines.push({
        text: op.text,
        originalLineIndex: op.origIdx,
      });
    } else if (op.type === 'insert') {
      if (!currentHunk) {
        currentHunk = {
          id: makeHunkId(),
          modifiedStart: op.modIdx,
          removedLines: [],
          addedLines: [],
        };
      }
      // Ghi nhận modifiedStart theo dòng insert đầu tiên
      if (currentHunk.addedLines.length === 0) {
        currentHunk.modifiedStart = op.modIdx;
      }
      currentHunk.addedLines.push({
        text: op.text,
        modifiedLineIndex: op.modIdx,
      });
    }
  }

  // Đẩy hunk cuối cùng nếu còn
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  // Với các hunk chỉ có removedLines (xóa thuần), tính modifiedStart
  // từ vị trí của dòng remove đầu tiên trong file modified (offset bù trừ)
  let origOffset = 0;
  for (const hunk of hunks) {
    if (hunk.addedLines.length === 0 && hunk.removedLines.length > 0) {
      const firstOrigIdx = hunk.removedLines[0]!.originalLineIndex;
      hunk.modifiedStart = Math.max(0, firstOrigIdx + origOffset);
    }
    origOffset += hunk.addedLines.length - hunk.removedLines.length;
  }

  return hunks;
}
