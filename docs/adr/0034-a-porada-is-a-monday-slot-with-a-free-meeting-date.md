# 0034 — A porada is a Monday slot with a free meeting date

Refines: ADR 0018 item 1 and the plan's assumption that `meeting_date` equals
`monday` (ADR 0018, Deferrals: editing `meeting_date`). Supersedes in part the
CHECK `issues_meeting_in_week` of drizzle/0011. Hand-in and placement over
slots are in ADR 0029.

## Context

A school meeting is sometimes not on a Monday: Monday 28 September 2026 is a
holiday and its porada is held on Friday 25 September. The headmaster must be
able to move a porada to any date and skip a week as before. The deadline
follows the new date, reminders follow the deadline, and the document's
windows (jednání, akce) and "reports whose event ended before the meeting"
follow the meeting date. The Monday is the key of URLs, `hand_in_monday`,
`earliest_monday`, the mail ledger keys and every M0–M8 caller.

## Decision

1. **The slot key stays `issues.monday`; `meeting_date` is free.** The CHECK
   `issues_meeting_in_week` is dropped (generated migration) and nothing
   replaces it in SQL. The UI prints the meeting date everywhere and
   „Přesunuto z pondělí {datum}“ on the porada page; the Monday appears in
   URLs only.
2. **The meeting order is an invariant over non-skipped slots.** Over the
   calendar's stored and virtual slots that are not skipped, in Monday order:
   meeting dates strictly increase, deadlines strictly increase, and every
   deadline is at or before 00.00 of its own meeting day. It spans rows and
   needs the Prague zone, so it is not a CHECK. `domain/calendar/order.ts`,
   `orderConflicts(slots, changed)`, checks the pairs; the inputs ensure the
   third part (`deadlineDate < meetingDate`). It runs in every write that
   changes a date: `issues.move`, the unskip in `issues.setSkipped` and
   `settings.save` after the refreeze (ADR 0032). Each refuses `meeting-order`
   with refs `{ monday, meetingDate }`. Skipping every conflict restores the
   invariant when it held before (property test).
3. **`issues.move` moves a slot to any date in the horizon.** Input:
   `monday, meetingDate, deadlineDate, deadlineTime, skip[], confirmed,
   version`. The date is from today to `mondayOf(today) + 7 * PLACEMENT_WEEKS -
   1`; `deadlineDate < meetingDate`, else `invalid-input`. The deadline
   defaults to the rule applied to the new date (ADR 0032) and may be set by
   hand; a deadline already past that is not the slot's current one is
   `deadline-past`. A slot that is missing, skipped or generated is
   `issue-not-open` (unskip first). Conflicts are the slots in the way:
   - a generated slot in the way always refuses `meeting-order`;
   - the move is refused `meeting-order` unless every conflict is named in
     `skip` and `confirmed` is set; a `skip` entry that is not a conflict is
     `invalid-input`, so nothing is skipped by accident;
   - the slots named are skipped in the same transaction (audit `reason:
     'moved'`).
   The form pre-fills the deadline from the rule; when that is already past it
   pre-fills nothing and says so. Audit `issue.moved { from, to,
   deadlineMoved, skipped }`: dates and counts.
4. **Hand-in and placement follow the stored slot.** A later deadline
   reopens hand-in for the slot until the new time; points handed in between
   the old and the new deadline keep the slot they were given. An earlier
   deadline keeps every point already handed in for the slot. The reminder
   keys stay `${iso(monday)}:${userId}`, so a reminder not yet sent goes at the
   new times and one already sent is not repeated. The overview strip
   (`issues.window`) and `issues.calendar(today)` read slots, including a slot
   moved later than its own week.
5. **Compose and the snapshot follow the meeting date.** Snapshot `schema: 1`
   keeps its shape. `checkIssueWeek` keeps "`issue.monday` is a Monday" and
   drops "the meeting date is in its week". `buildContext` anchors
   `meetingsWindow`, `eventsWindow`, `routeFuture` and `eventEndedBefore` at
   `meetingDate`. This is valid because no snapshot is stored before M10 and
   every fixture has `meetingDate = monday`, so the golden does not change.
   **From M10 on, a compose change that alters what a stored snapshot prints
   needs a new schema number and an upcaster.**
6. **Submitters hear about a move only when the deadline comes earlier.**
   Přehled always shows a moved porada: the strip and a standing line „Porada
   se koná {datum}, uzávěrka {kdy}.“ A mail `issue.moved` goes only when the
   new deadline is earlier than the old one and still ahead. `issues.move`
   enqueues one `issues.moved-notice {monday, deadlineAt}` job through
   `application/notifications` (`use-cases-not-into-jobs`). The worker re-reads
   the slot, drops the job when the slot's deadline has changed since, and
   sends `mail.send` to the reminders' audience: active submitters who keep
   the soft reminder and authors of a draft or returned point. The ledger key
   is `issue.moved:${iso(monday)}:${userId}:${deadlineEpochMinutes}`, so a
   second move to another earlier deadline mails again. Not staggered: a few a
   year. The mail carries dates, no titles.
7. **Skipping stays possible** for any slot that is not generated (ADR 0029);
   a generated slot in the way of a move or an unskip always refuses.

## Consequences

- The deadline of a moved porada can come earlier than people planned: moving
  the 28 September 2026 porada to Friday 25 September brings it from Saturday
  26 to Wednesday 23 September. The mail exists for this case.
- `submitMonday` and placement pass skipped slots, so an unskip does not
  pull points back (ADR 0029).
- The worker reads `issues.meeting_date` through `GRANT SELECT (meeting_date)
  ON issues TO autoporada_jobs` and reads slots through `issues.calendar`,
  which replaces `issues.deadlines(from, to)`.
- A moved or skipped slot is visible to M10, which generates by Monday and
  prints the meeting date.

## Options rejected

- **Re-key by ISO week of the meeting.** Two meetings can fall in one week
  (the 25 September porada shares a week with the 21 September one).
- **Re-key by meeting date.** Hand-in, earliest, reminder keys, URLs and
  placement of M0–M8 would all change for a few moves a year.
- **A new snapshot schema now.** Nothing is stored to upcast.
- **Přehled only, no mail.** People who planned for the later deadline would
  miss it.
- **A mail at every move.** Noise when the deadline stays or gets later.
