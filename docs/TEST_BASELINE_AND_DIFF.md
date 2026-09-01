# Baseline and Diff Regression Test Report

## Test scope

Kiểm tra baseline scan, external write detection, diff safety và các trường hợp
thường gây whole-file diff theo issue #20 và bug EOL #15.

## Test environment

| Item | Value |
| --- | --- |
| Repository branch | `fix/issue-20-deep-snapshot-baseline` |
| VS Code | `1.135.0` |
| Test mode | Extension Development Host + state/hunk smoke checks |
| Automated test runner | Không có trong repository |

## Test matrix

| ID | Scenario | Expected result | Status | Evidence / notes |
| --- | --- | --- | --- | --- |
| B01 | Existing file at depth 1 | Baseline is captured | PASS | `root.js`, persisted baseline had `fileExistedBefore: true` |
| B02 | Existing file at depth 5 | Baseline is captured | PASS | `depth5.js`, persisted baseline had `fileExistedBefore: true` |
| B03 | Existing file at depth 6–7+ | Baseline is captured; no whole-file false diff | PASS | `depth7.js`, one hunk with 1 removed/1 added line |
| B04 | Empty existing file | Empty baseline is retained | PASS | `empty.js`, baseline content was empty and `fileExistedBefore: true` |
| B05 | Initial scan with concurrency 1 | Scan completes without missed baseline | PASS | Isolated host setting `baselineScanConcurrency: 1` |
| B06 | Initial scan with concurrency 4 | Scan completes without missed baseline | PASS | Default setting in isolated host |
| E01 | External edit of one region | Only changed hunk is shown | PASS | `depth7.js`, hunk result: 1 removed/1 added |
| E02 | External edit of multiple regions | Each real hunk is shown | PASS | `multi.js`, hunk result: 2 independent hunks |
| E03 | Create a new file | Whole file is shown as added; revert may delete it | PASS | `new.js`, snapshot was empty with `fileExistedBefore: false` |
| E04 | Edit during initial scan | Event is queued; existing file is not treated as new | BLOCKED | Requires deterministic slow initial scan fixture |
| E05 | Missing/failed baseline on change event | No empty-original diff; current content becomes safe baseline | BLOCKED | No automated fault-injection/test harness |
| L01 | CRLF file rewritten as LF | No whole-file EOL-only diff | PASS | Old CRLF/current LF produced 1 hunk with 1 removed/1 added |
| L02 | CRLF file edited and kept CRLF | Only real hunk is shown | BLOCKED | Manual EOL-preserving edit not automated |
| L03 | LF file edited | Only real hunk is shown | BLOCKED | Manual UI/external-write case |
| S01 | File exceeds `maxFileLines` | No diff and no unsafe empty baseline | PASS | Isolated host with limit 2 skipped a 3-line file |
| S02 | File exceeds byte pre-check | File is skipped before content read | BLOCKED | No byte-limit fixture/instrumentation |
| S03 | Skipped file later becomes small | Baseline is refreshed; no false new-file diff | PASS | 3-line file reduced to 2 lines; no diff snapshot persisted |
| V01 | VS Code editor save | No duplicate external diff | BLOCKED | Requires interactive editor save |
| G01 | Git checkout / branch switch | No stale or branch-wide false diffs | BLOCKED | Requires interactive Git operation |
| A01 | Accept one hunk | Hunk is accepted and remaining diff stays valid | BLOCKED | Manual UI |
| A02 | Revert one hunk | Original content is restored safely | BLOCKED | Manual UI |
| A03 | Revert existing file with uncertain baseline | Existing file is never deleted | BLOCKED | Requires fault-injected missing baseline + UI |
| D01 | Delete file before delayed read | Event is ignored without extension error | BLOCKED | Not run deterministically |

## Results summary

- `npm run compile`: PASS
- `git diff --check`: PASS
- Automated/host smoke cases: 12 PASS, 0 FAIL
- 11 cases remain BLOCKED because they require interactive UI, fault injection,
  or a dedicated automated test harness.
- Extension Development Host activation completed without extension-specific
  errors. VS Code emitted unrelated Claude provider/deprecation warnings.

## Evidence

- Extension Host persisted snapshots were inspected from isolated temporary
  VS Code workspace state databases.
- Hunk counts were independently checked with the compiled
  `out/diff/hunkCalculator.js`.
- Temporary fixtures were removed after testing.

## Limitations

Repository không có automated test runner. Các case liên quan đến webview,
Accept/Revert và Remote VS Code cần được xác nhận thủ công trong Extension
Development Host hoặc môi trường Remote tương ứng.
