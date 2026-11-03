# 0049 — An akce's report goes to its porada, or a placeholder does

Builds on ADR 0046 (which porada a report is owed to) and ADR 0048 (every
approved akce owes a report). Supersedes in part: ADR 0029 (points go to an
issue by their due Monday) and ADR 0035 item 4 (the close decides the hand-in
slot), both only for the report of an approved akce. Adds to ADR 0038
(the generation transaction and the preflight).

## Context

ADR 0046 settled which porada an akce's report is owed to: the first
porada not skipped whose meeting day is after the akce's last day. The
report point itself still went by its hand-in time (ADR 0029, 0035): one
handed in after its close moved to the next porada, and one never handed
in simply never appeared. The school wants the report in the porada it is
owed to, and only there. When it is missing, the document says so in a
fixed form instead of leaving the akce out.

## Decision

1. **The akce decides the porada.** The report of an owed akce (the point
   its `report_point_id` names) goes to the akce's porada: the first porada
   not skipped, in Monday order from `REPORT_LOOKBACK_WEEKS` before the
   akce's last day, whose meeting day is after that day (`owedPorada` in
   `domain/calendar/reminders.ts`, the inverse of `reportsSince`, which also
   holds for a meeting moved weeks past its Monday; a Monday with no row is
   a porada held on its Monday). An akce is owed when it is approved, or back
   in review after its author's revise of an approved akce (it was approved
   before, which its append-only history in `future_events` shows; returned
   counts too): a revise never takes an ended akce out of its porada. The
   akce's dates decide it, not the report's own; the snapshot dates the
   report by the akce too, so the PROVOZ filter and order follow the same
   dates. The hand-in time does not decide it: a report handed in after the
   deadline or after its late close (ADR 0035) still goes to that porada
   while it is open. `points.submit` stores the porada's Monday as
   `hand_in_monday` (and as `earliest_monday` at the first submit), so the
   editor and the queues name it. The close of ADR 0035 stays the time the
   author is told and mailed. A submit is refused (`report-not-due`) when
   the owed porada is generated, or is a past Monday with no row, which no
   porada will print. A report that answers no owed akce keeps ADR 0029 and
   0035.
2. **Assembly reads the reports by the akce.** `PointRepo.eligibleFor`
   takes the porada's `since` (`reportsSince`) and prints an approved report
   of an owed akce when its akce's last day is from `since` to the day
   before the meeting, whatever its `hand_in_monday` and its own dates.
   `FutureItemRepo.owedTo({ from, to })` lists the owed akce of that window,
   whatever their report state, minus the missed ones. A placeholder of an
   akce in review is written from its current title, dates and people.
3. **A missing report becomes a placeholder.** Every akce owed to the porada
   whose report point is not approved (none started, draft, submitted,
   returned or withdrawn) is printed in PROVOZ among the reports, by its
   dates and title: the akce's title as the point, one paragraph, then
   „Seznam účastníků nebyl dodán.“ and „Vyjádření organizátora nebylo
   dodáno.“ The snapshot's report carries `missing: true` with the paragraph
   as its body and no bullets or statements; the composer adds the two fixed
   lines. The snapshot stays schema 1: the field is optional, so stored
   snapshots still parse.
4. **The system writes the paragraph.** „Dne 18. 9. 2027 proběhla akce
   s názvem Testovní akce, kterou organizoval pan Jan Novák (1.A).“ A
   multi-day akce reads „Ve dnech 16.–18. 9. 2027 …“. The people are the
   akce's „Kdo to zajišťuje“ (`responsible.people`, with their salutation
   and class, rendered as the agenda renders them); anyone without a
   salutation is left out. The verb is the akce's own in the past tense,
   agreeing like `organiserVerb` (organizoval, koordinovala, zajišťovali,
   vedly). With nobody listed the sentence ends after the title. `behalfOf`
   is not used. (`placeholderParagraph` in `domain/cs/sentence`.)
5. **The headmaster can replace the paragraph.** The porada's page „Chybějící
   zprávy“ (`/porada/[datum]/zpravy`, headmaster) lists the akce owed to the
   porada whose report is not approved, each with the paragraph the document
   would print, the report's state, and the two fixed lines shown read-only.
   `issues.setPlaceholder` (`issue.edit`, `admin` rate limit, refresh
   `'page'`) stores a replacement in `report_placeholders`, keyed by the akce
   (so it follows the akce across skips and moves), with a version;
   „Obnovit původní text“ deletes the row. It is plain text, one paragraph,
   at most `POINT_LIMITS.opening` characters, and only while the akce is owed
   to an open porada. The save and the generation both lock the issue row, so
   a save is never acknowledged after the generation has read the text. A
   report approved before generation replaces the placeholder; the stored
   paragraph is then unused.
6. **Generation closes the report.** In the generation transaction, for every
   placeholder: the akce's `report_state` becomes `missed` (system event
   `miss` of `REPORT_MACHINE`, audit `future.report-missed`, no text), and its
   linked report point, if it is a draft, returned or submitted, becomes
   `withdrawn` (system event `close` of `POINT_MACHINE`, audit
   `point.closed`). A missed akce is never due again (`reportDue`), so it
   leaves the author's card, „Napsat zprávu“ is refused, and the worker's
   reads, which take `none` and `prompted` only, mail nothing more. No later
   porada prints it.
7. **The preflight warns.** A new finding `reports-missing` (warn) names the
   owed akce whose report is not approved, linking „Chybějící zprávy“. It
   never blocks: a missing report is what the placeholder is for.
   `late-reports-expected` and `points-waiting` stay as they are.
8. **The worker is unchanged.** It reads no new column and has no grant on
   `report_placeholders`. Migration adds the `missed` value and the table.

## Consequences

- No akce is left out of the porada it is owed to, and no report reaches a
  later one. A report handed in after the deadline still makes its porada if
  the headmaster approves it before generating.
- A report still being reviewed at generation is closed with the others; the
  preflight's `points-waiting` and `reports-missing` are the warning.
- A revised akce that its author then retracts to a draft owes nothing: a
  draft is the author's alone, and no porada prints it.
- Nothing was generated in production before this change, so no backfill
  marks the akce of earlier poradas missed.
- An akce approved only after its porada was generated owes nothing: its
  porada is closed and no later one takes it. The school considers this not
  to happen in practice, so nothing marks it.
- The paragraph names the people of the akce, which an approved akce already
  shows every signed-in user; the replacement text is the headmaster's
  and is never logged or audited.

## Options rejected

- **Block generation while a report is submitted.** It makes the porada wait
  for one reviewer; the school wants the porada out on time and the gap
  visible.
- **Send a missing report to the next porada.** The school ruled it out: an
  akce's report belongs to its porada and nowhere else.
- **Name the akce's author.** Accounts carry no salutation or class, so the
  sentence could not say „pan“ or „paní“; the akce's people already do.
- **Store the replacement with the porada's texts.** A skip or a move would
  lose it, because the akce then belongs to another porada.
- **Write the fixed lines into the snapshot's body.** They are the document's
  wording, not data; the flag keeps the snapshot honest and the text in one
  place.
