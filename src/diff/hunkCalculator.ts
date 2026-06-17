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
  const origLines = originalContent.split('\n');
  const modLines = modifiedContent.split('\n');

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
        // Start a new hunk — remember where in the original the deletion begins
        currentHunk = {
          id: makeHunkId(),
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
        currentHunk = {
          id: makeHunkId(),
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

  return hunks;
}
