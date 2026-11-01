# 0048 — Every approved akce owes a report, and nobody declines it

Supersedes in part: ADR 0020 item 4 („that expects a report“ in
`report.prompt`); ADR 0027 the decline sentence of item 2, and item 3; ADR
0035 item 6 („the akce declined“ in the send-time check); ADR 0046 item 1
(„that expects a report“), item 3 („No new grant“) and its Consequences bullet
that keeps such akce out.

## Context

A report from an akce (souhrn z akce) belongs to the soonest porada after the
akce ends, and the organiser cannot decline to bring it (ADR 0046). Two ways
out were still left: the box „Po akci bude následovat zpráva do porady“ on the
akce form (`future_items.expects_report`, off by default), and „Zprávu psát
nebudu“ on the report card (`report_state = 'declined'`). Either one took the
akce out of the prompt, the late-report mails, the soft reminder and the
preflight's late reports. The school wants no room for that.

## Decision

1. **Every approved akce owes a report; a jednání never does.** The kind
   decides it. `expects_report` is dropped with its CHECKs
   `future_items_expects_akce` and `future_items_report_needs_expect`; a new
   CHECK `future_items_report_akce` (`report_state = 'none' OR kind = 'akce'`)
   keeps a report state off a jednání. `reportDue` (domain/review) takes the
   item's `kind` in place of `expectsReport`.
2. **No decline.** `'declined'` leaves the `report_state` type, `decline`
   leaves `REPORT_MACHINE`, and the `future.declineReport` use case, its
   action, its contracts, the card's second button and its live announcement
   go. The card lists the akce with „Napsat zprávu“ only, and renders nothing
   when none is waiting.
3. **No box on the form.** The akce form, the read view and the editor's field
   messages lose the report box. `futureSpec(kind)` becomes `FUTURE_SPEC`,
   the same for both kinds, and the kind no longer threads through
   `issuesOf`, `outcomeOf`, `useSend` and `useFutureEdit`. The contract's
   `strictObject` now refuses a save that still sends `expectsReport`.
4. **Existing rows become owed.** Migration 0044 sets every `declined` report
   back to `none` (raising the version, as the guard trigger asks) before
   migration 0045 recreates the type without it. An akce that had the box
   off simply loses the column. Old akce get no mails from this: the prompt,
   the late mails and the soft reminder all look at a bounded window of last
   days, so only akce that end from now on, or ended within those windows,
   are asked about. The audit keeps its `future.report-declined` rows; the
   action is free text.
5. **The worker reads `kind`.** Its reads (`reportPromptDue`, `reportsEnding`,
   `reportEnding`, `reportsOwed`) filter on `kind = 'akce'` where they read
   `expects_report`. Migration 0046 grants `SELECT (kind) ON future_items` to
   `autoporada_jobs`; the grant on `expects_report` went with the column.
   `reportEnding` gives null for a jednání.

## Consequences

- An organiser who has nothing to report still owes the porada a report and
  is reminded until it is handed in. A placeholder in the document for a
  report that is missing remains a separate change (ADR 0046).
- „Zrušit akci“ (the cancel) is the only way an approved akce stops owing a
  report. It has no date limit, so it works on an akce that has already ended.
- The report card on the author's home page has no date window, unlike the
  mails. After the deploy it lists every ended approved akce of the author
  whose report is unwritten, however old, including those that had the box off
  or were declined. Each one leaves the card only when its report is written or
  the akce is cancelled. Bounding the card is a separate decision.
- A jednání cannot gain a report state, by the CHECK and by `reportDue`.

## Options rejected

- **Keep the column, always true.** A column nothing can change is a second
  name for `kind = 'akce'`, and every reader would still have to remember it.
- **Keep the decline for reviewers only.** It would leave the same way out,
  one step removed; the school asked for none.
- **Set old declined rows to `written`.** Nothing was written; the akce would
  look done when it is not.
