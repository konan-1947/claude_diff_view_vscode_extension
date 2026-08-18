/**
 * hunkCalculator.ts
 *
 * Computes "hunks" (contiguous diff blocks) between an original and a modified file.
 * Delegates the line-level diff to the well-known `diff` library (kpdecker/jsdiff),
 * which implements the Myers diff algorithm internally.
 *
 * The public export `calculateHunks()` is the sole entry point, used by
 * `DiffManager` and `DiffWebviewPanel` to produce the Hunk[] that drives
 * both the visual diff decorations and the accept/reject logic.
 */

import { diffArrays } from 'diff';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Hunk {
  /** Unique hunk ID (used for accept/reject lookups) */
  id: string;
  /**
   * Id của KHỐI thay đổi liền kề mà hunk này thuộc về — tức khối do Pass 1 gom,
   * TRƯỚC khi Pass 3 tách nó ra theo từng cặp dòng.
   *
   * Các hunk cùng `groupId` luôn nằm liền nhau và không có dòng không đổi xen
   * giữa. Đây là ranh giới NGOÀI mà UI dùng để gom nút Accept/Reject; bên trong
   * một `groupId`, webview còn cắt thêm ở mỗi chuyển tiếp dòng-thêm → dòng-xoá
   * (xem `buildGroups()` trong res/webview/diff.monaco.js). Hunk không bị tách
   * mang `groupId` bằng chính `id` của nó.
   */
  groupId: string;
  /**
   * Start line in the MODIFIED content (0-indexed).
   * This is where gutter icons and inline decorations are anchored.
   */
  modifiedStart: number;
  /**
   * Start line in the ORIGINAL content (0-indexed).
   * This marks where the patch begins relative to the original file.
   */
  originalStart: number;
  /** Lines that were deleted from the original file */
  removedLines: RemovedLine[];
  /** Lines that were added (new content) */
  addedLines: AddedLine[];
}

export interface RemovedLine {
  /** The content of the deleted line */
  text: string;
  /** Its position in the original file (0-indexed) */
  originalLineIndex: number;
}

export interface AddedLine {
  /** The content of the added line */
  text: string;
  /** Its position in the modified file (0-indexed) */
  modifiedLineIndex: number;
}

// ---------------------------------------------------------------------------
// Internal diff operation types
// ---------------------------------------------------------------------------

/**
 * Internal representation of a single atomic diff operation.
 *
 * - `equal`:  line present unchanged in both files (both indices are meaningful)
 * - `delete`: line only present in the original (carries origIdx only)
 * - `insert`: line only present in the modified  (carries modIdx only;
 *              origIdx is meaningless for an insert — the line doesn't exist
 *              in the original, so we deliberately omit it from the type)
 */
type DiffOp =
  | { type: 'equal'; text: string; origIdx: number; modIdx: number }
  | { type: 'delete'; text: string; origIdx: number }
  | { type: 'insert'; text: string; modIdx: number };

// ---------------------------------------------------------------------------
// Diff computation (Myers via `diff` library)
// ---------------------------------------------------------------------------

/**
 * Compute a Myers diff between two line arrays using `diff.diffArrays()`.
 *
 * The `diff` library (kpdecker/jsdiff, 28M+ weekly downloads on npm) is a
 * mature, well-maintained implementation of the Myers O((M+N)D) algorithm.
 * It is used by Babel, Webpack, Mocha, and many other major tools.
 *
 * Compared to the previous LCS-based implementation (O(M×N) time & space),
 * this version runs in O((M+N)D) time and O(M+N) space, where D is the
 * edit distance.  For typical AI-assisted edits (D is small because only a
 * few lines change per tool call) this is substantially faster.
 *
 * @param origLines - Original file content split by '\n'
 * @param modLines  - Modified file content split by '\n'
 * @returns DiffOp array in sequential (top-to-bottom) order
 */
function computeLineDiff(origLines: string[], modLines: string[]): DiffOp[] {
  const changes = diffArrays(origLines, modLines);
  const ops: DiffOp[] = [];
  let origIdx = 0; // running index in the original array
  let modIdx = 0;  // running index in the modified array

  for (const change of changes) {
    const { value, added, removed } = change;

    if (added) {
      // Block of lines only present in the modified file
      for (let k = 0; k < value.length; k++) {
        ops.push({ type: 'insert', text: value[k]!, modIdx: modIdx + k });
      }
      modIdx += value.length;
    } else if (removed) {
      // Block of lines only present in the original file
      for (let k = 0; k < value.length; k++) {
        ops.push({ type: 'delete', text: value[k]!, origIdx: origIdx + k });
      }
      origIdx += value.length;
    } else {
      // Block of unchanged lines (present in both files)
      for (let k = 0; k < value.length; k++) {
        ops.push({
          type: 'equal',
          text: value[k]!,
          origIdx: origIdx + k,
          modIdx: modIdx + k,
        });
      }
      origIdx += value.length;
      modIdx += value.length;
    }
  }

  return ops;
}

// ---------------------------------------------------------------------------
// Hunk construction from DiffOps
// ---------------------------------------------------------------------------

let hunkCounter = 0;

function makeHunkId(): string {
  return `hunk-${++hunkCounter}-${Date.now()}`;
}

/**
 * Take the full original and modified file contents and produce a list of
 * Hunk objects, each representing one contiguous block of changes.
 *
 * Processing pipeline:
 *   1. Split both strings by '\n' into line arrays.
 *   2. Run `computeLineDiff()` (Myers via the `diff` library) to get DiffOps.
 *   3. Walk the DiffOps, grouping consecutive non-equal operations into Hunks.
 *   4. Apply offset corrections for pure-insert / pure-delete hunks so that
 *      modifiedStart / originalStart are correctly positioned when one side
 *      has no lines in the hunk.
 *
 * @param originalContent - Full file content before edits
 * @param modifiedContent - Full file content after edits
 * @returns Array of Hunk objects (empty if files are identical)
 */
export function calculateHunks(
  originalContent: string,
  modifiedContent: string
): Hunk[] {
  // Cắt dòng bằng /\r?\n/ chứ không phải '\n': với split('\n') thì `\r` của file
  // CRLF còn dính đuôi mỗi dòng, và khi hai vế lệch EOL thì 100% số dòng "khác
  // nhau" -> diff phủ cả file (bug #15). Số phần tử mảng không đổi nên toàn bộ
  // logic chỉ số dòng bên dưới giữ nguyên; chỉ text trong hunk là không còn mang
  // ký tự EOL. Caller vẫn nên `toLf()` trước (xem eol.ts) — đây là lớp phòng thủ.
  const origLines = originalContent.split(/\r?\n/);
  const modLines = modifiedContent.split(/\r?\n/);

  // Nội dung kết thúc bằng newline sinh ra một phần tử rỗng ở cuối mảng. Nó
  // giống hệt nhau ở hai bên nên không mang thông tin gì — nhưng Myers có thể
  // đem nó khớp với một DÒNG TRỐNG nằm giữa file bên kia. Cặp khớp đó hợp lệ về
  // edit distance nhưng vô nghĩa về nội dung, và nó cắt đôi một khối thay đổi
  // liền mạch (vd: đổi cả 200 dòng ra "-9 +200" rồi "-191 +0" thay vì "-200 +200").
  // Bỏ nó đi khi CẢ HAI bên đều có; chỉ một bên có nghĩa là newline cuối vừa
  // được thêm/bớt — đó là thay đổi thật, phải giữ lại để diff nhìn thấy.
  const lastOrig = origLines.length - 1;
  const lastMod = modLines.length - 1;
  if (lastOrig >= 0 && lastMod >= 0 && origLines[lastOrig] === '' && modLines[lastMod] === '') {
    origLines.pop();
    modLines.pop();
  }

  const ops = computeLineDiff(origLines, modLines);

  // ------------------------------------------------------------------
  // Pass 1: group consecutive changes into hunks
  // ------------------------------------------------------------------
  const hunks: Hunk[] = [];
  let currentHunk: Hunk | null = null;

  for (const op of ops) {
    if (op.type === 'equal') {
      // An unchanged line ends the current hunk (if one is open)
      if (currentHunk) {
        hunks.push(currentHunk);
        currentHunk = null;
      }
    } else if (op.type === 'delete') {
      if (!currentHunk) {
        // Start a new hunk — remember where in the original the deletion begins.
        // Đây là nơi "khối thay đổi liền kề" thực sự tồn tại, nên nó cũng là nơi
        // đặt groupId; Pass 3 tách ra bao nhiêu hunk con thì tất cả vẫn mang id này.
        const id = makeHunkId();
        currentHunk = {
          id,
          groupId: id,
          modifiedStart: 0,
          originalStart: op.origIdx,
          removedLines: [],
          addedLines: [],
        };
      }
      // For a delete-first or mixed hunk, update originalStart every time
      // we encounter a delete BEFORE any addedLines (i.e. the deleted region
      // starts here in the original file).
      if (currentHunk.removedLines.length === 0) {
        currentHunk.originalStart = op.origIdx;
      }
      currentHunk.removedLines.push({
        text: op.text,
        originalLineIndex: op.origIdx,
      });
    } else if (op.type === 'insert') {
      if (!currentHunk) {
        // Start a new hunk for a pure-insert block.
        // originalStart is meaningless when the hunk has no deletions — the
        // downstream offset-correction loop will compute the correct value.
        const id = makeHunkId();
        currentHunk = {
          id,
          groupId: id,
          modifiedStart: op.modIdx,
          originalStart: 0,
          removedLines: [],
          addedLines: [],
        };
      }
      // Record the first insert's line index as the modified start,
      // so the hunk's visual anchor in the modified file is correct
      if (currentHunk.addedLines.length === 0) {
        currentHunk.modifiedStart = op.modIdx;
      }
      currentHunk.addedLines.push({
        text: op.text,
        modifiedLineIndex: op.modIdx,
      });
    }
  }

  // Push the final hunk if one is still open
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  // ------------------------------------------------------------------
  // Pass 2: offset correction for single-sided hunks
  //
  // When a hunk contains ONLY deletions (no additions), modifiedStart
  // was set to 0 as a placeholder.  We fix it here so the hunk anchors
  // at the correct line in the modified view, accounting for the net
  // line-count shift introduced by preceding hunks.
  //
  // Conversely, when a hunk contains ONLY additions (no deletions),
  // originalStart was set to 0 as a placeholder and is corrected here.
  // ------------------------------------------------------------------
  let origOffset = 0;
  for (const hunk of hunks) {
    if (hunk.addedLines.length === 0 && hunk.removedLines.length > 0) {
      const firstOrigIdx = hunk.removedLines[0]!.originalLineIndex;
      hunk.modifiedStart = Math.max(0, firstOrigIdx + origOffset);
    }
    // Net line-count delta this hunk contributes
    origOffset += hunk.addedLines.length - hunk.removedLines.length;
  }

  let modOffset = 0;
  for (const hunk of hunks) {
    if (hunk.removedLines.length === 0 && hunk.addedLines.length > 0) {
      const firstModIdx = hunk.addedLines[0]!.modifiedLineIndex;
      hunk.originalStart = Math.max(0, firstModIdx + modOffset);
    }
    modOffset += hunk.removedLines.length - hunk.addedLines.length;
  }

  // ------------------------------------------------------------------
  // Pass 3: tách khối thành từng cặp dòng khi ghép cặp được
  //
  // Việc tách CHỈ phục vụ hiển thị: nó cho phép view zone của dòng cũ nằm đúng
  // ngay trên dòng mới thay thế nó. Nó KHÔNG có nghĩa mỗi hunk con là một đơn vị
  // thao tác riêng — `flatMap` làm mất danh tính khối liền kề, và `groupId` là
  // thứ giữ lại danh tính đó để UI dựng lại một nút cho cả khối.
  // ------------------------------------------------------------------
  return hunks.flatMap(splitAlignedLines);
}


// ---------------------------------------------------------------------------
// Pass 3 — ghép cặp dòng cũ với dòng mới tương ứng
// ---------------------------------------------------------------------------

/**
 * Ngưỡng độ giống để coi hai dòng là "cùng một dòng, đã sửa".
 *
 * Dưới ngưỡng thì KHÔNG ghép — thà hiển thị khối thô còn hơn khẳng định một cặp
 * mà thuật toán không tin. Đặt thấp vừa phải vì dòng ngắn (`}`, `{`) bị dìm điểm
 * một cách giả tạo: `'}'` so với `'} // ghi chú'` chỉ ra 0.11 dù rõ ràng là cùng
 * một dòng.
 */
const LINE_PAIR_THRESHOLD = 0.35;

/**
 * Độ giống rẻ giữa hai dòng: (tiền tố chung + hậu tố chung) / độ dài dòng dài hơn.
 *
 * O(độ dài dòng), không cấp phát, không đụng tới Myers. Đây chỉ là phép đo đủ
 * dùng để trả lời "hai dòng này có phải cùng một dòng đã bị sửa không", không
 * phải một phép diff.
 */
function lineSimilarity(a: string, b: string): number {
  if (a === b) { return 1; }
  const max = a.length > b.length ? a.length : b.length;
  if (max === 0) { return 1; }
  const min = a.length < b.length ? a.length : b.length;

  let prefix = 0;
  while (prefix < min && a.charCodeAt(prefix) === b.charCodeAt(prefix)) { prefix++; }

  let suffix = 0;
  while (
    suffix < min - prefix &&
    a.charCodeAt(a.length - 1 - suffix) === b.charCodeAt(b.length - 1 - suffix)
  ) {
    suffix++;
  }

  return (prefix + suffix) / max;
}

/**
 * Tách một hunk thành các hunk nhỏ hơn sao cho mỗi dòng cũ nằm cạnh đúng dòng
 * mới của nó — để diff đọc theo từng dòng, thay vì một khối đỏ chồng lên một
 * khối xanh.
 *
 * Tách là chuyện HIỂN THỊ, không phải chuyện thao tác: mọi hunk con vẫn mang
 * `groupId` của hunk cha, và UI gom chúng lại thành một nút Accept/Reject duy
 * nhất cho cả khối.
 *
 * Hai chế độ:
 *
 * 1. SỐ DÒNG BẰNG NHAU -> ghép theo chỉ số, không cần đo gì. Vào bao nhiêu ra
 *    bấy nhiêu là dấu hiệu chắc chắn của "sửa tại chỗ".
 *
 * 2. LỆCH SỐ DÒNG -> đi dọc hai danh sách, dùng `lineSimilarity` để quyết định
 *    ghép cặp hay bỏ qua một dòng ở một bên (dòng đó là chèn/xoá thuần).
 *
 * Khi không đủ tự tin, các dòng được dồn vào bộ đệm và cuối cùng phát ra thành
 * một khối gộp — tức là quay về đúng hành vi cũ cho riêng đoạn đó. Thuật toán
 * không bao giờ khẳng định một cặp mà nó không tin.
 *
 * Chạy SAU hai pass hiệu chỉnh offset là an toàn: các hunk con cộng lại đóng góp
 * đúng bằng hunk gốc vào độ lệch dòng.
 *
 * Chỉ ảnh hưởng cách hiển thị — nội dung diff không đổi.
 *
 * BẤT BIẾN mà accept/reject theo group dựa vào (webview gộp cả khối bằng MỘT
 * splice, nên nếu phá một trong ba điều dưới đây thì accept/reject sẽ âm thầm
 * ghi sai nội dung, không có lỗi biên dịch nào bắt được):
 *
 *   (I2) Đây là một PHÂN HOẠCH GIỮ THỨ TỰ: mỗi dòng của `removed`/`added` rơi
 *        vào đúng một hunk con, và nối các hunk con lại theo thứ tự phát ra thì
 *        được đúng mảng của hunk cha, phần tử một phần tử. (`flush()` luôn chạy
 *        TRƯỚC khi phát ra một cặp, nên khối đệm ra trước cặp kết thúc nó.)
 *   (C1) `subs[0].originalStart === parent.originalStart` và tương tự cho
 *        `modifiedStart` — xem `makeHunk` bên dưới.
 *   (C2) Tổng `removedLines.length` / `addedLines.length` của các hunk con bằng
 *        đúng của hunk cha.
 *
 * => TUYỆT ĐỐI không sắp xếp lại, không khử trùng lặp, không bỏ bớt hunk con.
 */
function splitAlignedLines(hunk: Hunk): Hunk[] {
  const removed = hunk.removedLines;
  const added = hunk.addedLines;

  // Chỉ thêm hoặc chỉ xoá: không có gì để ghép cặp.
  if (removed.length === 0 || added.length === 0) { return [hunk]; }
  // Đã là một đổi một: nhỏ nhất có thể rồi.
  if (removed.length === 1 && added.length === 1) { return [hunk]; }

  if (removed.length === added.length) {
    const out: Hunk[] = [];
    for (let i = 0; i < removed.length; i++) {
      out.push(makeHunk([removed[i]!], [added[i]!], hunk, i + 1, i + 1));
    }
    return out;
  }

  const out: Hunk[] = [];
  let bufRemoved: RemovedLine[] = [];
  let bufAdded: AddedLine[] = [];
  let i = 0;
  let j = 0;

  const flush = (): void => {
    if (bufRemoved.length === 0 && bufAdded.length === 0) { return; }
    out.push(makeHunk(bufRemoved, bufAdded, hunk, i, j));
    bufRemoved = [];
    bufAdded = [];
  };

  while (i < removed.length && j < added.length) {
    if (lineSimilarity(removed[i]!.text, added[j]!.text) >= LINE_PAIR_THRESHOLD) {
      flush();
      i++;
      j++;
      out.push(makeHunk([removed[i - 1]!], [added[j - 1]!], hunk, i, j));
      continue;
    }

    // Không giống nhau: thử bỏ qua một dòng ở một bên xem có khớp lại không.
    const skipRemoved = i + 1 < removed.length
      ? lineSimilarity(removed[i + 1]!.text, added[j]!.text)
      : -1;
    const skipAdded = j + 1 < added.length
      ? lineSimilarity(removed[i]!.text, added[j + 1]!.text)
      : -1;

    if (skipRemoved >= LINE_PAIR_THRESHOLD && skipRemoved >= skipAdded) {
      bufRemoved.push(removed[i]!);   // dòng này bị xoá hẳn
      i++;
    } else if (skipAdded >= LINE_PAIR_THRESHOLD) {
      bufAdded.push(added[j]!);       // dòng này là thêm mới
      j++;
    } else {
      // Bí hoàn toàn. Dồn cả hai vào đệm để cuối cùng thành một khối gộp, thay
      // vì bịa ra một cặp không có cơ sở.
      bufRemoved.push(removed[i]!);
      bufAdded.push(added[j]!);
      i++;
      j++;
    }
  }

  while (i < removed.length) { bufRemoved.push(removed[i++]!); }
  while (j < added.length) { bufAdded.push(added[j++]!); }
  flush();

  return out;
}

/**
 * Dựng một hunk con từ các dòng đã gom.
 *
 * `nextRemovedIdx` / `nextAddedIdx` là vị trí chưa tiêu thụ trong hunk gốc, dùng
 * để neo phía KHÔNG có dòng nào: một hunk chỉ-thêm vẫn cần `originalStart` trỏ
 * đúng chỗ nó được chèn vào bản gốc, và ngược lại.
 *
 * Nhờ ba nhánh của `originalStart` đều quy về "vị trí gốc + số dòng đã tiêu thụ
 * trước đó", hunk con ĐẦU TIÊN luôn có `originalStart` bằng của hunk cha — đó là
 * bất biến (C1) mà accept theo group dựa vào. (Nhánh fallback cuối cùng là bất
 * khả đạt trong đường tách: `removed.length === 0` đã early-return từ trước.)
 *
 * `groupId` kế thừa từ cha để cả khối vẫn là một đơn vị thao tác duy nhất.
 */
function makeHunk(
  removedLines: RemovedLine[],
  addedLines: AddedLine[],
  parent: Hunk,
  nextRemovedIdx: number,
  nextAddedIdx: number
): Hunk {
  const parentRemoved = parent.removedLines;
  const parentAdded = parent.addedLines;

  const originalStart = removedLines.length > 0
    ? removedLines[0]!.originalLineIndex
    : nextRemovedIdx < parentRemoved.length
      ? parentRemoved[nextRemovedIdx]!.originalLineIndex
      : parentRemoved.length > 0
        ? parentRemoved[parentRemoved.length - 1]!.originalLineIndex + 1
        : parent.originalStart;

  const modifiedStart = addedLines.length > 0
    ? addedLines[0]!.modifiedLineIndex
    : nextAddedIdx < parentAdded.length
      ? parentAdded[nextAddedIdx]!.modifiedLineIndex
      : parentAdded.length > 0
        ? parentAdded[parentAdded.length - 1]!.modifiedLineIndex + 1
        : parent.modifiedStart;

  return {
    id: makeHunkId(),
    groupId: parent.groupId,
    originalStart,
    modifiedStart,
    removedLines,
    addedLines,
  };
}
