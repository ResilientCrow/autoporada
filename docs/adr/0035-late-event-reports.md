# 0035 — Late-event reports

Refines: ADR 0029 (the hand-in slot of a report), ADR 0034 (slots and
deadlines). No earlier record is superseded.

## Context

A report about an event (a report point, usually written from an akce through
„Napsat zprávu“) must be handed in for the porada after the event. An event
that ends on Sunday evening, after Saturday 20.00 but before the Monday
porada, would otherwise miss that porada and wait a week. The reports are the
news of the meeting, so the school wants them in, and wants the author told in
time. Until now a report was owed from the day after the event's last day.

## Decision

1. **A late report has its own close.** `eventEnd(r)` is the last day at
   `timeTo ?? 20:00`, Prague time. For a slot S with `lastDay <
   S.meetingDate`: `reportCloses(S, r) = max(S.deadlineAt, min(eventEnd + 2 h,
   00:00 of S.meetingDate))`. For every other slot (the event ends on or after
   the meeting day) the close is `S.deadlineAt`. A report is late for S when
   its close is after `S.deadlineAt`. Examples for a Monday porada with the
   default deadline: ends Sunday 21.00, due Sunday 23.00; no end time on
   Sunday, due 22.00; ends Sunday 23.30, due 00.00; ends Saturday 18.30, due
   20.30; ends Friday 15.00, not late (Saturday 20.00); ends Monday 10.00, goes
   to the next porada. The two hours are absolute time and the cap is wall time,
   so the DST nights 2026-10-25 and 2027-03-28 are tested.
2. **The cap is 00.00 of the meeting day.** The meeting time is not stored,
   and the headmaster needs the night to approve and generate. An event that
   ends at 23.00 the evening before has one hour. 06.00 is the named
   alternative and a one-constant change.
3. **The `max()` is an extension of the school's rule.** Taken strictly, a
   report is late only when the event ends after the deadline, which leaves one
   minute to an event ending at 19.59. `max()` gives the same two hours before
   the deadline (Saturday 18.30, due 20.30). It is overridable.
4. **The close decides the hand-in slot.** `handInMonday(now, slots, rule,
   report)` is the first open slot whose close is after `now`; `points.submit`
   stores it as `hand_in_monday` and, at the first submit, as `earliest_monday`
   (otherwise a late report's earliest would be the next slot and keep it out
   of S). A resubmit after a return recomputes `hand_in_monday` with the same
   rule. A report handed in after its close goes to the next open slot like
   any late hand-in.
5. **A report is owed from the event's end.** `reportDue(akce, now)` counts
   from `eventEnd`, not from the next day, so a Sunday report can be started
   before its close. „Zprávy k napsání“ therefore shows an akce on its last
   evening; the 08.00 prompts keep their days. The report editor and its detail
   show „Zprávu odevzdejte do {kdy}; půjde na poradu {datum}.“
6. **A new cron job, `reports.late`, runs every 15 minutes with catch-up
   skip.** A missed tick is found by the next while its window is open. It
   produces:
   - `report.ended`, to the akce author when a late akce has ended and no
     report is handed in. Due from `eventEnd` until `due - 60 min` (until
     `due - 15 min` when no last call fits). Key `report.ended:${itemId}`,
     view `{ due, meetingDate }`.
   - `report.last-call`, due from `due - 60 min` until `due - 15 min`, only
     when `due - 60 min > eventEnd`. To the akce author when the akce has no
     live report point, else to the author of each late report point in
     draft or returned state (linked to an akce or not). Key
     `report.last-call:${akce|point}:${id}:${iso(monday)}`.
   - Neither mail is staggered: one recipient each, and minutes matter.
     `stillApplies` re-reads at send time and drops the mail when the report
     was handed in, the akce declined, or `now >= due`.
   The producers reconcile to the clock and the data, never to the tick; a
   rerun finds the ledger key and sends nothing (`lateMailDue` is pure).
7. **The 08.00 report prompt yields.** `future.report-prompt` skips stage 1
   when `tx.mailLedger.get` finds `report.ended:${itemId}`, so a missed
   `report.ended` still gets stage 1; stage 2 stays.
8. **Saturday's hard reminder leaves late reports out.**
   `points.reminderAuthors` excludes drafts that are late for the slot (an SQL
   twin of `isLateReport`, kept in step by a parity contract test); an author
   with other drafts still gets it. The soft reminder is unchanged. The
   `reminders` setting (ADR 0032) does not switch the late mails.
9. **The headmaster hears about the late reports.** `headmaster.summary` gains
   `lateExpected` (late reports for the slot not yet handed in) and
   `lastLateDue`. The same job sends `headmaster.late-summary` from 5 minutes
   to 2 hours after the slot's last late deadline when the slot had late
   reports: handed-in and missing counts, key `${userId}:${iso(monday)}`.
   Counts only. The preflight finding `late-reports-expected` (a warning, never
   a block) carries titles and due times from a web read.
10. **The worker reads dates and ids only.** Grants to `autoporada_jobs`:
    `future_items(time_to, report_point_id)` and `points(event_date, end_date,
    time_to)`, with rows in `grants.test.ts`. No title, body, place or name
    reaches the worker; the mails carry dates and counts, never titles
    (ADR 0015, 0016).

## Consequences

- Mails pile up for one late report only in part: the hard reminder leaves it
  out, stage 1 yields to `report.ended`, and `report.ended` and
  `report.last-call` are each sent at most once per report and slot.
- A late report still needs approval before the meeting. The headmaster is
  told at the last late deadline; generation is a separate click (M10), and a
  report handed in after generation goes to the next open slot.
- The cap is tight for late-evening events: an event ending at 23.50 leaves
  ten minutes.
- A moved porada (ADR 0034) uses its own meeting date and deadline: with a
  Wednesday meeting and a Monday 20.00 deadline, an event ending Tuesday 18.00
  is due Tuesday 20.00.
- Ledger keys: `report.ended:${itemId}`,
  `report.last-call:${akce|point}:${id}:${iso(monday)}`,
  `headmaster.late-summary:${userId}:${iso(monday)}`.

## Options rejected

- **One pg-boss job per report, scheduled at approval or submit.** Jobs to
  cancel on every edit, move, return and decline; a cron reconciles to the
  clock and the data.
- **A cap at 06.00 of the meeting day.** It leaves no time to approve before
  an early meeting.
- **The strict reading (late only if the event ends after the deadline).**
  It leaves a cliff at the deadline.
