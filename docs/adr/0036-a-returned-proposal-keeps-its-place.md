# 0036 — A returned proposal keeps its place in the outline

Supersedes in part: ADR 0030 item 5 (a placed row whose point is no longer
eligible is skipped, and the next outline write forgets it).

## Context

Every outline op works on the stored outline merged with the eligible
proposals (ADR 0030). A placed proposal that a reviewer returns is not
eligible, so the merge left its row out, and the next write, of any item,
deleted it. The preview's `proposal-dropped` warning went with it, and once
approved again the proposal came back unplaced at the end of its section. The
headmaster had placed it on purpose; a return is a request for a change, not
a decision against the place.

## Decision

1. **A placement whose point is on its way back is held.** The point is
   returned, or handed in again and not decided yet (`draft` after a retract,
   `submitted`). `mergeProposals` reports it as `held`, with the lineage ids of
   the rows it stood after, nearest first.
2. **The editor does not list a held row,** so it cannot be moved, and no op
   sees it.
3. **Every outline write puts it back** (`restoreHeld`): after the nearest row
   it stood after that is still there, else at the top of its section. Rows
   held after the same row keep their order. The 60 rows of a section count
   held rows (`outline-full`).
4. **The preview keeps reporting it.** A returned one stays in
   `proposal-dropped` and is not printed; approved again, it is eligible and
   prints at its place.
5. **Rejected and withdrawn placements are forgotten as before:** reported
   until the next write, then gone. So is a placement whose point is approved
   for a later porada or published.

## Consequences

- An editor read and an outline write each read the placed points that are
  not eligible (`placedElsewhere`, as the assembler does), one `points.get`
  per such row.
- A held row of a point that never comes back stays in that issue's rows; it
  is never printed and is not carried over (proposal rows are one-time).
- The editor can refuse an add with `outline-full` while it lists fewer than
  60 rows.

## Options rejected

- **Show held rows in the editor, greyed out.** Moves and their neighbours
  would act on rows the document does not print.
- **Keep only `returned`.** A resubmitted proposal would lose its place to the
  first write before its approval.
