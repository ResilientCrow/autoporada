# 0054 — A porada that does not take place does not exist: move, drop, add

Supersedes ADR 0051 items 2 to 5 (item 1, `slotMondayOf`, stands), ADR 0047
item 3 (item 4, `Dialog` in the kit, stands), ADR 0041, ADR 0034 item 7 and
the words „non-skipped“ in item 2, the skipped slots of ADR 0029 items 2, 3
and 5, the skip and unskip of ADR 0018 item 1, and the skipped-source „pass“
rule of ADR 0030. Amends ADR 0032 (calendar edits take the lock in update
mode), ADR 0040 (open poradas only), ADR 0046 item 2, ADR 0049 and ADR 0052
(a Monday with no porada is stepped over, not a skipped one).

## Context

A skipped porada was an `issues` row with the status `skipped`. The archive
listed it as „Nekonala se“ with „Porada se koná“ to bring it back, the
calendar strips showed it, and every calendar function stepped over it. The
headmaster asked for a porada that does not take place to exist nowhere:
not in the database, the backend or the UI. Only the audit log may say what
happened. In its place the headmaster wants three acts: move this porada to
another date, drop this week's porada, and add a new porada (rare).

The calendar implied a porada on every Monday unless a row said otherwise.
Without rows for dropped poradas, something else has to say where the
implied Mondays stop.

## Decision

1. **Only poradas exist.** An `issues` row is a porada that takes place or
   is coming. Its status is `open` or `generated`; `skipped` is gone from
   the enum. The setting `calendar` holds `{ plannedThrough }`: null or the
   Monday of a stored porada. Up to and including the later of
   `plannedThrough` and last week's Monday, the calendar is exactly its
   rows. After it, a Monday with no row is a porada on that Monday with the
   rule's deadline, as before. `settings.save` cannot write the key and the
   settings page does not show it. The worker reads it through its existing
   grant on `settings(key, value)`.
2. **The Monday is the key and never changes.** A move changes the meeting
   date and the deadline only; points, the outline, the texts, the annexes
   and the URL `/porada/[datum]` stay with the porada. An added porada is
   keyed by `slotMondayOf(date)` (ADR 0051 item 1). There is one porada per
   key: a second porada in a week that has one is refused. The meeting
   order (ADR 0034) holds over all poradas.
3. **`issues.move { monday, meetingDate }`** moves an open porada to a day
   from today, and after the previous porada's meeting date, to before the
   next porada's, within the calendar's horizon. It never moves into or
   past a neighbour: the date field offers only those days. The deadline
   is the rule's for the new day (ADR 0032). It refuses `early`, `late` and
   `same` as `invalid-input` on `meetingDate`, and the rules
   `issue-not-open`, `porada-exists`, `meeting-order` and `deadline-past`
   (a hand-in that is open would close at once). Audit: `issue.moved
   { monday, from, to, deadlineAt }`.
4. **`issues.drop { monday, confirmed }`** removes an open porada K. In one
   transaction:
   - the coming Mondays before K with no row get rows, so they stay
     poradas;
   - the next porada after K (its heir) gets a row, and `plannedThrough`
     rises to the heir's Monday. No stored value names K;
   - when the heir is open, it takes K's outline if it has none of its own,
     fills its empty texts (Přítomni, Hosté, Příloha 2) from K's, and takes
     K's Arch annexes. When the heir is generated, K's prepared content is
     deleted;
   - K's outline items, its annexes setting and its row are deleted.
   Points are not written: their hand-in Monday stays, and the cumulative
   rule (ADR 0029) places them in the next porada. A drop after the
   deadline is allowed. No mail. Audit: `issue.dropped { monday,
   meetingDate, heir, filled, handedOver }`, dates and counts only.
5. **`issues.add { meetingDate }`** inserts a porada on a date whose
   `slotMondayOf` Monday has no porada and lies up to `plannedThrough`. It
   refuses `early` and `late` as `invalid-input`, and the rules
   `porada-exists`, `later-generated` (a generated porada after it) and
   `meeting-order`. A deadline that has already passed is allowed, and the
   dialog says so. Audit: `issue.added { monday, meetingDate, deadlineAt }`.
6. **The rules are pure functions.** `planMove`, `planDrop` and `planAdd`
   in `domain/calendar` replace `planNextMeeting`. The use cases run them
   inside the transaction, and both UIs' dialogs run them to show the
   effect or the refusal before the headmaster confirms.
7. **Locks and guards.** The three take `settings.lock('deadline',
   'update')` before reading the calendar; every other issue writer holds
   it in share mode (ADR 0032). This also closes ADR 0041's unlocked race
   with generation. `ensureIssue` refuses a Monday up to `plannedThrough`
   with no row as `not-found`, so a stale client never brings a dropped
   porada back.
8. **Calendar functions range over poradas.** `issueSlots`, `handInSlot`,
   `placementSlot`, `workingSlot`, `reportsSince`, `owedPorada`, the
   preflight `earlier-open` and the reminders step over a Monday with no
   porada. `earlier-open` asks to generate or drop the earlier porada.
9. **The UIs.** The Arch UI and the porada page offer „Přesunout poradu“
   and „Porada se nekoná“ on an open porada, and the headmaster „Přidat
   poradu“ by the calendar strip. The archive lists generated poradas only.
   The „Přesunuto z pondělí …“ line goes: an added porada would be
   mislabelled by it, and the meeting date is printed anyway.
10. **Removed:** `issues.setSkipped`, `planNextMeeting`, the skip window,
    the `skipped` status, unskip, the outline's „pass“ for a skipped
    source, and „Nekonala se“.
11. **Migration.** Each skipped row hands over to its heir as in item 4,
    from the latest to the earliest, and is audited as a system
    `issue.dropped { monday, migrated: true }` row. Coming Mondays up to
    the heir of the latest coming skipped row get rows, and
    `plannedThrough` is that heir's Monday. Then the skipped rows are
    deleted and the enum value goes.

## Consequences

- A dropped porada leaves only audit rows.
- Two poradas in one week are impossible; the week's porada is moved
  instead.
- A move no longer reaches into another porada's place; merging two weeks
  is a drop.
- Up to `plannedThrough`, rows exist for empty coming poradas. They cost
  nothing and are what a drop keeps.
- Past Mondays nobody touched no longer count as held poradas, so an
  akce's report look-back can reach further at go-live.
- The migration and the enum change cannot be undone; rolling back means
  restoring a backup.

## Alternatives considered

- **Rows made ahead by a cron job, with drop as a delete.** The worker would
  need INSERT on `issues`, whether a porada exists would depend on a job
  having run, and reads past what the job made still need a default.
- **Each porada storing the date of the next one.** Every read walks the
  chain, every move or drop rewrites a neighbour, and the first coming
  porada has no stored predecessor.
- **The latest row's Monday as the boundary, nothing stored.** A hand-in to
  a porada weeks ahead creates its row and would silently drop the Mondays
  in between.
- **Hidden rows for dropped poradas, or reading drops from the audit log.**
  The first is the trace the headmaster asked to remove; the second puts
  business state in the audit log, which the worker cannot read.
- **Keys that are not Mondays.** Two poradas in a week would need a new key
  across the URLs, the hand-in Mondays, three CHECKs and the mail ledger.
- **A moved porada replacing the porada of the week it lands in.** One act
  doing two things; a drop says it plainly.
