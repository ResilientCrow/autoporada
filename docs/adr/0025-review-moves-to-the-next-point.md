# 0025 — Review moves to the next point from the client

Supersedes in part: ADR 0013's rule that the client never redirects itself
(stated in the `define-action.ts` comment), for the decision bar's
„Schválit a pokračovat“ only.

## Context

On /kontrola/[id] the reviewer approves a point and goes on to the next one
waiting („Schválit a pokračovat“, design §10). Which point is next depends on
the decision: the decided point leaves the queue, and a reviewer never gets
their own point, which they may not approve. `points.decide` therefore reads
the next point inside the decision's transaction and answers
`{ version, next }`. The client learns where to go only from that answer.

ADR 0013 has every successful write refresh the page in the same response and
the client never redirect itself. ADR 0017 relaxed that for autosaving editors
only, so it does not cover the review.

## Decision

1. **`decidePoint` refreshes like every other write.** It keeps
   `defineAction`'s refresh after success; its answer names `next`.
2. **The decision bar navigates after „Schválit a pokračovat“.** Its
   `onSuccess` calls `router.push` to `/kontrola/{next}`, or to `/kontrola`
   when `next` is null. „Schválit“, „Vrátit k úpravě“ and „Zamítnout“ stay on
   the point, as ADR 0013 says.
3. **The host still speaks first.** Before the push the bar's host says the
   approval and focuses the point's title, as after any decision. The next
   point opens with focus at the top of the page, like any page the app opens.

## Options rejected

- **`redirect()` inside the action.** `defineAction` is the one place that
  refreshes after a write and leaves a failure in place for its form
  (ADR 0013 item 4). A redirect throws out of the action: the bar's
  `onSuccess` never runs, so the host could not say what happened, and the
  wrapper would need a second success path that only this action takes.
- **A `/kontrola/dalsi` route that redirects to the next point.** A second
  read of the queue after the decision, outside its transaction, and one more
  route to guard; the answer already holds the point.

## Consequences

- `refresh()` renders the decided point once before the push replaces it: one
  extra render of the page the reviewer is leaving.
- Both point pages have the same tab title, so Next.js announces nothing on
  the route change; what the reviewer hears is the host's approval sentence.
- Any other client navigation after a write still needs its own ADR.
