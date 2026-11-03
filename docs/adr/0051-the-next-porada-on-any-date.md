# 0051 — The next porada on any date, and no move page

Supersedes ADR 0047 items 1 and 2 and its rejected alternative „a date field
for the next porada“. Supersedes ADR 0034 item 3 (`issues.move` and the move
form) and the part of item 2 that names `issues.move`. ADR 0034 items 1, 2,
4, 5 and 7 stand: the Monday is the key, `meeting_date` is free, and the
meeting order holds over the slots that take place.

## Context

The „Porada se nekoná“ dialog (ADR 0047) offered a select of the open Monday
slots after the skipped one. The headmaster wants to type the day the next
porada is held, whatever weekday it is. Moving a porada had its own page,
„Přesunout poradu“ (`/porada/[datum]/presunout`), with a meeting date, a
hand-set deadline and a list of poradas in the way to cancel. The headmaster
asked for that page to go: one place says when the next porada is held.

A free date has to land on a slot. A school holds a porada on another day
for a holiday Monday: Easter Monday's moves to the Tuesday after or the
Friday before, and a break skips weeks and the porada comes back on any day.

## Decision

1. **A date belongs to the nearest Monday.** `slotMondayOf(date)` is the
   Monday of `date + 3 days`: Monday to Thursday belong to that week's
   Monday, Friday to Sunday to the next one. A porada held on another day
   than its Monday is that slot's, with „Přesunuto z pondělí …“ as before.
2. **`issues.setSkipped` takes `nextMeeting`**, with `event: 'skip'` only, in
   place of `until`: the day the next porada is held. With M the skipped
   slot and S the slot of `nextMeeting`:
   - S is M: M is moved to that day and nothing is skipped. „Porada se
     nekoná“ on Easter Monday with the next porada on Tuesday holds it on
     Tuesday.
   - S is after M: M and every open slot before S are skipped, each audited;
     one already skipped stays as it is. S is held on that day: when the day
     is not S's meeting date, S is moved to it.
   - A moved slot gets the deadline the rule counts back from the new day
     (ADR 0032). There is no hand-set deadline any more. A slot that is not
     moved keeps its deadline.
   - Without `nextMeeting` a skip is the single skip (the Přehled strip).
3. **The rules, in one pure function.** `planNextMeeting` in
   `domain/calendar` decides the slot, what is skipped and the new deadline.
   It refuses:
   - `early`: a day before today (Prague), or before the Friday before M (it
     would belong to an earlier porada);
   - `late`: a day after the Thursday after the calendar's last Monday (its
     slot would be past the horizon);
   - `same`: M's own meeting date, which changes nothing;
   - `skipped`: S does not take place. The headmaster brings it back on its
     own page first. A generated S cannot happen: poradas are generated in
     order (ADR 0040) and M is open;
   - `deadline-past`: S's deadline is still ahead and the new one is not, so
     hand-in would close at once. When S's deadline has already passed, a
     new past one is taken: hand-in is closed either way;
   - `meeting-order`: S on the new day, with the skips done, breaks the
     meeting order against the slots that take place (`orderConflicts`, ADR
     0034). Nothing in the way is cancelled: the headmaster picks another
     day or skips that porada first.
   The use case runs it inside the transaction, after reading the rule and
   the slots (lock order, ADR 0032). The first four reach the wire as
   `invalid-input` on the field `nextMeeting`. The last two are the rules
   `deadline-past` and `meeting-order`. A skipped or generated M with
   `nextMeeting` is `issue-not-open`. Only M carries the client's version:
   a slot the use case skips or moves is written only while its row is still
   what the plan read (open, same meeting date and deadline), and otherwise
   the whole skip fails as `conflict` and nothing is written.
4. **The dialog runs the same function.** The porada page reads
   `issues.window` (the rows, the rule and the instant), as the move page
   did, and the dialog's date field is pre-filled with the meeting date of
   the next open slot after M (a plain skip). Under the field the dialog
   says what will happen („Nekoná se: … Další porada: …, uzávěrka …“) or,
   for a refusal, why, from `planNextMeeting` on the client. The submit
   button stays enabled; the use case refuses what changed meanwhile.
   `issues.workspace` drops `heldNext`.
5. **The move page is gone.** The route, `poradaMovePage`, `MovePage`,
   `MoveForm`, `porada.move` copy, `issues.move`, its contract and the
   „Přesunout poradu“ link on the porada page are removed. The audit action
   `issue.moved { monday, from, to, deadlineAt }` is now written by
   `issues.setSkipped` for the slot it moves. The repository's `reschedule` stays: `settings.save`
   refreezes with it, and now the skip moves with it. The switched-off
   `issues.moved-notice` handler and the `issue.moved` mail stay (ADR 0037);
   nothing enqueues them.

## Consequences

- Moving a porada, holding it on another weekday and skipping a run of
  poradas are one dialog. Moving a porada later than the Thursday of its
  week makes it the next slot's: the porada of 13 April held on Friday 10
  April means there is no separate porada on Monday 13 April.
- The deadline can no longer be set by hand. A porada moved at short notice,
  when the rule's deadline for the new day has passed while the old one is
  still ahead, is refused. The headmaster can still skip to a later porada.
- M moved within its week after its deadline gets the deadline of the new
  day, which may still be ahead: hand-in opens again for that porada. The
  dialog then leaves out the note that the approved points move to the next
  porada, since they stay with M.
- A move no longer cancels a porada in the way in the same step. With
  nearest-Monday slots, a conflict needs a neighbour that was moved itself,
  which is rare.
- The dialog needs JavaScript, as before.

## Alternatives considered

- **A date belongs to its own week (Monday to Sunday).** A holiday Monday
  could not move to the Friday before, and a porada held on a Friday would
  still leave its own slot's porada on the Monday after.
- **The date is always a later porada.** Easter Monday's porada held on the
  Tuesday would take the next Monday's slot and leave that week without a
  porada.
- **Unskipping S when the date falls on a skipped slot.** It mixes two
  confirmations in one dialog, and the unskip has its own refusals
  (`later-generated`, `meeting-order`).
- **Keeping the move page next to the dialog.** Two places said when a
  porada is held, and the headmaster asked for one.
