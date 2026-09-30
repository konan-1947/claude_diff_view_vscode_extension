# Agent Changes panel HCI audit

## Audit scope

Target: `src/views/agentChangesPanel.ts` (Agent mode pending-files tree).

Inputs reviewed: supplied screenshot and the panel's rendered HTML/CSS/source. The inferred primary task is to scan pending changes and open the relevant file quickly. This was a non-interactive review; keyboard, focus, screen-reader, and responsive behavior were not run.

## Verdict

**P1 — Fix before release:** deeply nested source trees make file names and change summaries needlessly distant and difficult to scan in a narrow side bar.

## Scorecard

| Area | Status |
| --- | --- |
| Information hierarchy | Risk |
| Navigation / flow | Risk |
| Forms / error states | Not evidenced |
| Feedback / state | Pass |
| Accessibility | Risk |
| Responsive / visual quality | Risk |
| Trust | Pass |

## Findings

### HCI-01 · P1

| Field | Detail |
| --- | --- |
| Evidence type | Code + Screenshot |
| Evidence | Screenshot's `be/src/main/java/com/...` chain; `agentChangesPanel.ts:185,193` adds 14px per level. |
| Problem | A Java package path consumes most of the panel width before a file row begins. The filename has little usable width, while its `+/-/hunks` summary is pinned to the far right. The resulting empty middle area makes the relation between a file and its change summary slow to parse. |
| Impact | Reviewers must horizontally track each row and may miss the file or its change size. This is most acute in a side bar and for conventional deep package trees. |
| Recommendation | Compact the visible path: render a single collapsible path row such as `be › … › agent › impl` above its direct files, or compress chains of folders with one child into `src/main/java/com/edua/.../agent/impl`. Keep only 8px indentation for branches, rather than increasing indentation on every path segment. |
| Confidence | High |

### HCI-02 · P2

| Field | Detail |
| --- | --- |
| Evidence type | Code + Screenshot |
| Evidence | `agentChangesPanel.ts:156,190–193`; screenshot shows separate `+`, `-`, and hunk count at the row's far edge. |
| Problem | Three small status tokens compete with the filename in a narrow row. For low-change files the hunk count is more useful than exact line counts; the all-zero/red `-0` token adds visual noise. |
| Impact | The list looks busy without improving prioritisation. |
| Recommendation | Use one compact diff pill: `+10 −2 · 3` (with a hunk icon/tooltip), hide zero values, and reveal full counts in the row tooltip or on hover. Keep it immediately after the filename when room permits, otherwise right-align the single pill. |
| Confidence | High |

### HCI-03 · P2

| Field | Detail |
| --- | --- |
| Evidence type | Screenshot + Code |
| Evidence | Header actions at `agentChangesPanel.ts:125–130`; screenshot shows a dense mix of outlined button, two unlabeled icons, and a prominent blue Agent-mode button. |
| Problem | Header tools receive almost as much visual emphasis as the actual review queue. The primary action is not clearly distinguished from settings and the mode toggle. |
| Impact | The user starts from controls instead of the task list, and unfamiliar icons increase discovery cost. |
| Recommendation | Make the header a compact toolbar: title plus pending count on the left; a single primary `Review all` action; move Introduce/Settings/Agent mode to the VS Code view title actions or an overflow menu. |
| Confidence | Medium |

## Manual verification queue

- At 260–320px panel width, verify no file name or diff summary becomes unusably truncated after path compaction.
- Tab through folder and file rows; verify a visible focus indicator and that Enter/Space have an expected action.
- Verify the collapsed-path label exposes the full path through its title/accessible name.

## Strengths

- File icons and active-row styling make the selected file recognizable (`agentChangesPanel.ts:153–155,188–193`).
- Folder rows are collapsible, so users can control overall list density (`agentChangesPanel.ts:171–173,185`).
- Addition and deletion use VS Code Git-decoration theme colours, which preserves theme consistency (`agentChangesPanel.ts:157–159`).

## Suggested next fixes

1. Collapse single-child directory chains and reduce remaining indentation to 8px per branch.
2. Replace three diff-stat tokens with a zero-suppressing compact summary pill.
3. Simplify the header so `Review all` is the only immediately visible text action.
