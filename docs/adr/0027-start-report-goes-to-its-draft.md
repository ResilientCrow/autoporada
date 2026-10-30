# 0027 — „Napsat zprávu“ goes to its draft from the client

Supersedes in part: ADR 0013's rule that the client never redirects itself
(stated in the `define-action.ts` comment), for „Napsat zprávu“ on the
„Akce čekající na zprávu“ card only. It sits beside ADR 0017 and ADR 0025,
which relax the same rule for other clients.

## Context

An author whose akce has ended starts its report from the card on the home
page or „Moje body“. `future.startReport` creates the report draft, or finds
the one already started, and answers `{ pointId }`. The draft's id exists only
in that answer, so the page that was rendered before the press cannot link to
it.

ADR 0013 has every successful write refresh the page in the same response and
the client never redirect itself. ADR 0017 (autosaving editors) and ADR 0025
(„Schválit a pokračovat“) name their own exceptions; neither covers this one.

## Decision

1. **`startFutureReport` refreshes like every other write.** It keeps
   `defineAction`'s refresh after success; its answer names `pointId`.
2. **The card's row navigates after „Napsat zprávu“.** Its `onSuccess` calls
   `router.push` to `/body/{pointId}`, the point's own page, where the author
   writes the report. „Zprávu psát nebudu“ stays on the page, as ADR 0013
   says: the refresh drops the akce and the card says so.
3. **One press at a time.** While either button of a row is in flight the
   other is disabled, so a decline and a start cannot both be sent for the
   same akce.

## Options rejected

- **`redirect()` inside the action.** Same reasons as ADR 0025: the form's
  `onSuccess` would never run and the wrapper would need a second success path.
- **Link „Napsat zprávu“ to a route that starts the report.** A write on a GET
  that a prefetch or a crawler could trigger.

## Consequences

- `refresh()` renders the page once before the push replaces it.
- Any other client navigation after a write still needs its own ADR.
