# 0059 — The agenda windows end where the Monday porada would

Supersedes ADR 0034 item 5 in part (where the jednání and akce windows end).
Leaves the rest of item 5, the deadline (ADR 0032) and `eventEndedBefore` as
they were.

## Context

Points 1 and 2 („Zatím známá jednání v týdnu od … do …“, „Zatím známé akce
v týdnech od … do …“) ran from the meeting date M to M+7 and M+14. A porada
moved from Monday 16 November 2026 to Wednesday 18 November printed „od
18. listopadu do 25. listopadu“ and „do 2. prosince“ and listed the items of
those days, although the next porada on Monday 23 November lists them again.
The windows should be shorter when the porada is not on its Monday.

## Decision

1. **A window runs from the meeting date to the Monday one (jednání) or two
   (akce) weeks after the meeting's slot Monday**, both ends inclusive:
   `meetingsWindow(M) = [M, S+7]`, `eventsWindow(M) = [M, S+14]` with
   S = `slotMondayOf(M)`. A Monday porada is unchanged; one moved to
   Wednesday 18 November runs 18.–23. 11. and 18.–30. 11.
2. **S is computed from the meeting date, not read from `issues.monday`.**
   For every move inside the porada's own week they are the same. A porada
   held on the Friday to Sunday before its Monday (the holiday case of ADR
   0034) belongs to that Monday and runs from the day it is held to the
   Monday a week (two weeks) after; its window is longer than a week, and no
   day falls between it and the porada before. A window can never end before
   it starts, whatever day a porada is moved to.
3. **The same windows route the items** (`routeFutureItem`): the document,
   the Arch preview, the preflight's „akce čeká“ and the placement strip
   list exactly the items the headings name.

## Consequences

- Snapshot `schema: 1` keeps its shape and needs no upcaster: no porada has
  been generated outside development, so no stored snapshot of a moved
  porada prints differently.
- `slotMondayOf` lives in `domain/calendar/issue-calendar.ts`; `plan.ts`
  imports it from there.
