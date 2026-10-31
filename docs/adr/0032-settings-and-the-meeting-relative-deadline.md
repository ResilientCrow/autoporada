# 0032 — Settings and the meeting-relative deadline

Refines: ADR 0018 item 1. The deadline is still frozen on the issue row when
it is created, but from the stored rule instead of the constant, and the rule
counts back from the meeting date. The settings screen that item announces is
built here.

## Context

`DEADLINE_RULE = DEFAULT_DEADLINE` (Sunday 18.00, counted from the Monday) is
a constant in `application/core/issue-rule.ts`, read by seven modules, two of
them in the worker. The school wants everything editors hand in to be due by
Saturday 20.00 before a Monday porada, and the headmaster wants to change the
rule without code. A deadline already shown to an author must not move
because a rule changed (ADR 0018), and a moved porada (ADR 0034) must have its
deadline follow its meeting date.

## Decision

1. **One table, `settings(key, value)`, with the keys in code.** Columns:
   `key text primary key`, `value jsonb not null`, `version`, `updated_at`;
   CHECKs `settings_key` (`^[a-z0-9.]{1,64}$`) and `settings_size` (65536
   bytes); a `version_bump` trigger. No `updated_by`: the audit event names the
   actor. `contracts/settings.ts` holds a Zod registry `SETTINGS` with a schema
   and a default per key: `deadline`, `reminders` and `texts.annex1`. A missing
   row means the default. `readSetting(tx, key)` throws
   `settings.invalid.<key>` for a stored value that fails its schema, which
   can only be corruption because writes are validated.
2. **The deadline counts back from the meeting date.** `DeadlineRule` is
   `{ dayOffset, time }` with `dayOffset` from -4 to -1 and `time` between
   08.00 and 22.00 on a quarter hour. The default `DEFAULT_DEADLINE` is
   `{ dayOffset: -2, time: 20:00 }`: Saturday 20.00 for a Monday meeting.
   `deadline(meetingDate, rule)` no longer asserts a Monday. `ensureIssue`
   freezes `deadline(meetingDate, rule)`. `readDeadlineRule(tx)` replaces the
   constant; `readWindow` returns `{ slots, first, last, rule }`. The form
   reads „{n} dny před poradou v {čas}“ with the example „U pondělní porady:
   sobota 20.00“.
3. **Reminders switch on and off, their times stay fixed.** `reminders` is
   `{ soft, hard }`, both default true. The soft reminder is two days before the
   deadline's date at 13.00 and the hard one the deadline's day at 12.00
   (`domain/calendar/reminders.ts`). The producer skips a kind that is off and
   `loadReminder` checks again at send time. A user's own soft opt-out stays.
   The late-report mails (ADR 0035) are not switched by this setting: they are
   about one report, not about the porada.
4. **`texts.annex1` is `{ heading, intro }`.** Its default is the template's
   text; the intro is a `paragraphs` rich document. The list of annex 1 itself
   is the registry (ADR 0033).
5. **Saving the deadline freezes what was shown, first.** In one transaction
   `settings.save` computes `deadlineChange(now, oldRule, newRule, slots)` =
   `{ keep, from }`, where `keep` is the hand-in slot of this moment
   (`submitMonday`). Then:
   - `ensureIssue`, with the OLD rule, for every slot from this week's Monday
     to `keep` (not only `keep`), so that a later rule can never send the
     submit Monday backwards (a rule from Thursday to Sunday saved on a
     Friday);
   - `issues.refreeze(from, oldRule, newRule)`: open stored rows after `keep`
     whose `deadline_at` still equals `deadline(meeting_date, oldRule)` get
     `deadline(meeting_date, newRule)`; at most 26 rows, recomputed in TS. A
     deadline the headmaster set by hand in a move stays;
   - `orderConflicts` over the result (ADR 0034); a conflict fails the call
     with `meeting-order` and the transaction rolls back.
6. **A refreeze bumps `issues.version`** (the trigger requires it). An outline
   or details editor open on one of those slots goes stale and shows the
   conflict notice; this is accepted and the headmaster is the only writer.
7. **The form shows the effect before saving:** „Uzávěrka porady {keep}
   zůstává {den} {čas}. Nové pravidlo platí od porady {from}. Uzávěrky
   přesunutých porad se nemění.“
8. **The default changes in code, before the first deploy.** Sunday 18.00 to
   Saturday 20.00 ships as a code change; frozen rows keep their deadlines and
   nothing is refrozen. The `hand_in_monday` backfill (ADR 0029) runs before
   it. Any later change goes through `settings.save`.
9. **The worker reads settings through a column grant.** `GRANT SELECT (key,
   value) ON settings TO autoporada_jobs`, with a row in `grants.test.ts`. It
   reads `deadline` and `reminders` only; the annex texts never reach it.
   Writes are headmaster-only (`settings.manage`, rate limit `admin`), the
   audit event `settings.saved` carries the key.
10. **`/nastaveni` has three forms** (Uzávěrka, Připomínky, Texty přílohy 1)
    and a link to „Typy bodů“; the nav entry `/nastaveni/typy-bodu` becomes
    `/nastaveni`.

## Consequences

- Reminder keys stay `${iso(monday)}:${userId}`: a reminder not yet sent goes
  at the slot's new times, one already sent is not repeated.
- Every deadline is before 00.00 of its meeting day: `dayOffset` is at most
  -1 and the inputs of a move require `deadlineDate < meetingDate`.
- Only a move that brings a deadline earlier sends mail (ADR 0034); a rule
  change does not.

## Options rejected

- **Reminder times editable too.** They interact with the 6-hour HOLD and the
  30-minute stagger; not worth it now.
- **A change that touches no stored row.** Slots the headmaster prepared ahead
  would keep the old rule forever.
