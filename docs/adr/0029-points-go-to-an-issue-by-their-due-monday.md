# 0029 — Points go to an issue by their due Monday

Supersedes in part: the rule of commit 33c7354 that a Monday past its
deadline can be neither skipped nor unskipped, for the headmaster. That rule
lives in the code of `issues.setSkipped` (its window), not in an ADR item, so
no README status changes for it. ADR 0018 item 1 says only that skip and
unskip are headmaster-only and need a confirm checkbox; that stays.

## Context

M9 builds the issue snapshot from the approved points. Which points belong to
issue M must be one question with one answer, for the lists, the preview and
(from M10) the generated document. Until now the answer was computed on read:
`pointMonday` is `placementMonday(max(earliest_monday, submitMonday(
submittedAt, rule, known)), now, known)`, clamped to the next Monday. It
depends on the clock, on the deadline rule and on which issue rows exist. M9
makes the rule editable (ADR 0032) and lets a headmaster skip after a
deadline, so a point could change issue when a setting is saved, and the
clamp to today would move points off an issue that is being generated late.

## Decision

1. **`points.hand_in_monday` stores the hand-in slot.** It is a nullable
   `date` set at every submit, in the same UPDATE as `submitted_at`: the key
   (Monday) of the first open slot whose deadline was still ahead at that
   moment. For a report about a late event the slot's close is the report's
   own (ADR 0035). `points.retract` clears it together with `submitted_at`
   (ADR 0026); return, approve, reject and withdraw keep it. CHECKs:
   `points_hand_in_monday` (a Monday) and `points_hand_in_set`
   (`(submitted_at IS NULL) = (hand_in_monday IS NULL)`); a partial index
   `points_eligible_idx` on `(state, hand_in_monday)` where approved.
2. **A point is in issue M iff it is approved and `dueMonday <= M`.**
   `dueMonday = max(earliest_monday, hand_in_monday)`. A report also needs its
   event's last day to be before M's meeting date. The rule is cumulative:
   points of a skipped or never generated earlier slot roll into M. One SQL
   predicate, `points.eligibleFor(monday, meetingDate, { lock })`, and the
   pure `inIssue` implement it; a contract test runs both. The predicate does
   not read the clock.
3. **Hand-in and placement pass skipped and generated slots.** `submitMonday`
   and `handInMonday` work over `IssueSlot`s (stored rows plus virtual
   Mondays) and step over skipped and generated slots: the hand-in slot is the
   first open slot whose deadline is still ahead, the one the submitter was
   shown. Otherwise a point handed in after slot B's deadline could reach B
   through a skipped slot A before it whose moved deadline is later. An unskip does not pull back points handed in while the slot was
   skipped; the unskip form says so („Body odevzdané během zrušení zůstávají
   na poradě {datum}.“). Placement, `placementSlot(due, today, slots)`, takes
   the first open slot with `monday >= due` and a meeting date of today or
   later, and replaces the clamp to the next Monday. `pointMonday` loses its
   rule, clock and `submittedAt` inputs and becomes
   `placementSlot(dueMonday(p), today, slots)`.
4. **The working slot is the first open slot whose meeting is today or
   later.** `/porada` opens `workingSlot(today, slots)`; null shows „Žádná
   porada k přípravě“ (no open slot within the 26-slot horizon). A property
   test (fast-check, 2000 runs) proves that for the working slot the placed
   points and the eligible points agree, so the lists and the preview show
   the same hand-ins.
5. **The headmaster may skip or unskip any slot that is not generated, before
   or after its deadline.** `issues.setSkipped` accepts every slot of the
   calendar (from `mondayOf(today)`, or earlier with a meeting still ahead)
   with `confirmed` and the issue version. A generated slot stays refused
   (`issue-not-open`). An unskip runs the meeting-order check (ADR 0034). After
   the deadline the form warns „Uzávěrka už proběhla; schválené body se
   přesunou na poradu {datum}.“ Only the headmaster can skip, so this
   supersedes the 33c7354 rule for the headmaster and for nobody else.
6. **The backfill hard-codes the old rule and is guarded.** Existing
   submitted points get `hand_in_monday` in a custom migration, in this order
   (the order is binding):
   - add the column, with no CHECK;
   - a guard raises when any `issues` row has a `deadline_at` other than
     Sunday 18.00 Prague time before its Monday, or a `meeting_date` other
     than its Monday ("an issue was frozen under another rule");
   - `UPDATE points SET hand_in_monday = …, version = version + 1 WHERE
     submitted_at IS NOT NULL`. The `version` bump is required by the
     `points_version_bump` trigger, which rejects any UPDATE that leaves
     `version` alone. The Monday is `date_trunc('week', submitted_at AT TIME
     ZONE 'Europe/Prague' + interval '6 hours')::date + 7`: Sunday 17.59 plus
     six hours is still Sunday, Sunday 18.00 is Monday;
   - only then add `points_hand_in_set` (`NOT VALID` then `VALIDATE`, or plain
     after the UPDATE), because the CHECK would fail on the old rows.
   The migration runs before the default deadline changes (ADR 0032), so the
   rule it hard-codes is the rule every frozen deadline was made under. An
   integration test compares the SQL with `submitMonday` under a test-local
   legacy rule over a DST matrix and asserts that the guard raises.
7. **The worker may read the column.** `GRANT SELECT (hand_in_monday) ON
   points TO autoporada_jobs`, with a row in `grants.test.ts`: after the
   refactor `summaryFacts` and `handedInFor` read it in the worker role. The
   role is `autoporada_jobs`, never a "worker" role.

## Consequences

- Changing the rule or moving a porada never moves a point already handed in:
  the stored slot is the record of what the submitter was told.
- A proposal placed in M+7 but published in M by M10 disappears from M+7
  without a finding: `mergeProposals` drops a placement row whose point is
  published silently, and raises `proposal-dropped` only for points now
  returned, rejected or withdrawn (ADR 0030).
- A skip after the summary mail names a meeting that no longer happens, and an
  unskip after the summary window (5 minutes to 2 hours after the deadline)
  means that meeting never gets a headmaster summary. Accepted; the overview
  shows the skip.
- A slot of the current week whose meeting has passed and that was never
  generated stays editable until Sunday; its points already roll into the next
  slot, and the preflight says so.
- M10 publishes exactly the eligible points, with the same predicate and
  `FOR UPDATE`.
- `earliest_monday` keeps its meaning (ADR 0018 item 3); a late-event report
  sets it from the same slot as `hand_in_monday` (ADR 0035).

## Options rejected

- **Compute `submitMonday(submittedAt)` on read.** It depends on the editable
  rule and on which issue rows exist.
- **Select through `placementMonday`.** Its clamp to today moves points off an
  issue that is generated late.
- **Keep the 33c7354 rule (no skip after the deadline).** The headmaster
  needs to cancel a meeting once its deadline has passed.
