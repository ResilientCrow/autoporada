# 0046 — The soft reminder asks for owed reports, and no one opts out

Supersedes ADR 0020 in part: the soft-reminder bullet and the opt-out bullet
of item 5 (D7 (a), D8 (a)) and the opt-out sentence of item 3. Supersedes ADR
0018 item 10 (`users.remind_deadline`). Supersedes ADR 0032 in part: the
sentence of item 3 „A user's own soft opt-out stays“.

## Context

The soft reminder, two days before the deadline, went to every non-student
who had handed in a point or an akce this school year, unless they had
switched it off on `/profil`. It said only that the deadline was near, so
most of its readers had nothing to do, and the people the porada actually
waited on could switch it off.

The school wants the opposite. A report from an akce (souhrn z akce) belongs
to the soonest porada after the akce ends, and the organiser cannot decline
to bring it. The reminder is for them, and it is not optional.

## Decision

1. **Audience.** The soft reminder goes to the author of an approved akce that
   expects a report nobody has handed in: no report started, or the report
   point still a draft or returned (the same condition as the preflight's
   `awaitingReport`). Students too: it is about their own akce. Any active
   member gets it; the old „staff only“ rule goes.
2. **Which porada a report is owed to.** The first non-skipped porada whose
   meeting day is after the akce's last day. So the reminder for the Monday
   collected now covers akce whose last day is on or after the meeting day of
   the porada before it (`reportsSince` in `domain/calendar/reminders.ts`,
   looking back at most 12 weeks through `issues.calendarBetween`; a Monday
   with no row counts as a porada held that Monday, a skipped one is stepped
   over) and that have ended by now (`eventEnd`, 20.00 without an end time).
   A report an earlier porada was owed is late and has its own mails
   (`reports.late`, ADR 0035); it is not reminded here.
3. **Reads.** `FutureItemRepo.reportsOwed({ from, to })`, system only, on the
   columns migrations 0017, 0022 and 0035 already grant the worker. No new
   grant. `submitterIds` on points and future items, which only the old
   audience read, is removed.
4. **No opt-out.** `users.remind_deadline` is dropped (migration 0043), with
   the `profile.setReminders` use case, its action and the `/profil` page,
   which held nothing else. The page's nav entry goes too. Both reminders are
   now about the reader's own work, and neither can be switched off by them.
5. **The headmaster's switch stays.** `settings.reminders` `{ soft, hard }`
   still turns a kind off for everyone (ADR 0032 item 3); the label of the
   soft one names the report.
6. **Send-time check.** `loadReminder` reads whether the recipient still owes
   a report (soft) or still has a draft or returned point (hard);
   `stillApplies` sends either only while that holds. The moved notice
   (switched off, ADR 0037) goes to the union of both audiences.
7. **The mail.** Subject „Autoporada: odevzdejte zprávu z akce“; the body names
   the porada and asks for the report from an akce that took place. Ids only,
   no title of the akce (D3 (a)).

## Consequences

- Staff with nothing owed no longer get a mail two days ahead. A draft point
  is still reminded on the deadline day by the hard one.
- An akce that the organiser marked as not expecting a report, or whose report
  was declined („Zprávu psát nebudu“), is still left out. Removing both, so
  every approved akce owes a report, and writing a placeholder into the
  document when one is missing, are separate changes.
- A user who wanted no mail at all has no switch; the headmaster's switch is
  for everyone.

## Options rejected

- **Keep the opt-out for the soft reminder.** It would let exactly the people
  the porada waits on stop being asked.
- **Remind every akce that ended in the last N days.** A fixed window would
  remind reports already late for an earlier porada, which have their own
  mails, or miss the akce of a long gap after skipped Mondays.
- **Keep `/profil` with nothing on it.** A page with no content is noise in
  the nav; it can come back when there is something to set.
