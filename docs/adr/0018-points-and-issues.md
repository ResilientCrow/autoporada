# 0018 — Points and issues

Supersedes: none. The deviations below are from `docs/plan.md`, not from an
ADR.

## Context

M8 lets an author write a point for the weekly meeting, a reviewer decide on
it, and the headmaster skip a meeting. Plan §4 and §5 describe the tables,
the checks and the review flow. Building them against the real code and the
approved design (D1–D13) showed where the plan should change, and one policy
input that must change so that reviewers do not read colleagues' drafts.

## Decision

1. **Issues.**
   - `ensureIssue` runs inside the caller's transaction, in submit and in skip
     only; never in a GET and never in the worker. It is
     `INSERT … ON CONFLICT (monday) DO NOTHING` followed by a `SELECT`, so a
     concurrent second inserter reads the committed row.
   - `deadline_at` is frozen when the issue row is created, from the default
     rule. A deadline already shown never moves. A settings screen (M9.7)
     changes the rule for issues created later.
   - Skip and unskip are headmaster-only (`issue.generate`), need a confirm
     checkbox and send no mail. Skipping moves points without writing them:
     the placement Monday is computed on read.
   - A late submit lands in the next issue whose deadline is still ahead.
2. **Points (D5 (a)).** Point content is validated jsonb on `points`: `body`,
   `bullets` and `statements`, parsed with the contracts schema on read and
   written in one versioned UPDATE. Bounds live in `domain/report/limits.ts`
   and feed Zod, the counters and the CHECK numbers. A CHECK on the byte size
   of the three columns' text form is defence in depth; the app-side total is
   lower, because jsonb adds spaces.
3. **Versions, events and fixed fields.**
   - `issues`, `point_types`, `points` and (M8b) `future_items` have a
     `version_bump` trigger that rejects an UPDATE unless
     `version = old.version + 1`, and every repo UPDATE filters
     `WHERE version = expected`. A row count of 0 is `StaleVersion`.
   - `earliest_monday` is set once, at the first submit, and a trigger refuses
     a change. `submitted_at` is set at every submit and never cleared, which
     is the "ever submitted" fact.
   - `point_events` is append-only (a trigger, and no UPDATE or TRUNCATE for
     the web role).
   - Creating a point is idempotent through `client_ref`: a second create with
     the same reference returns the first point.
4. **Before values (D13 (a)).** A reviewer's edit appends an `edit` event with
   the field names and the previous values of those fields. The author and
   reviewers see them as „Původní znění“ in the timeline, as plain text per
   field. They are purged with the point. This keeps the diff plan §4 asks for.
   The audit still holds field names only.
5. **Who sees drafts.** `point.view` takes
   `Owned & { state, everSubmitted }`, and a non-author reviewer is admitted
   only when the point was submitted at least once and is not now a draft. The
   check names stay the same. A new scope kind `own-or-submitted` carries this
   into `scopeWhere`. Every point read goes through the scope, so a guessed
   id is not found.
6. **Authors and reviewers edit through different use cases.**
   `points.save` is the author's autosave (ADR 0017). `points.reviewEdit` is
   explicit, audited as `point.edited` with field names, and refused for the
   point's own author, who retracts and edits instead.
7. **Transitions.** `submit` (draft or returned → submitted), `retract`
   (submitted → draft) and `withdraw`; `decide` approves, returns or rejects
   with a required note of 1–2000 characters for the last two. The machine
   enforces separation of duties. Audit meta holds states only, and the note
   stays in the event row.
8. **Finance and pokyn proposals (D6 (a))** are points of those kinds with no
   type; approval only approves. M9 adds `issue_items` and copies approved
   proposals there.
9. **Akce visibility** (M8b): on `revise` an akce disappears from the overview
   until a reviewer approves it again, and a cancelled akce disappears for
   everyone except its author and reviewers, who see „Zrušeno“. Approved akce
   are visible to every active user, students included, with their
   responsible people (D4 (a), following the existing `future.view` rule).
10. **Opt-out (D8 (a)).** One column, `users.remind_deadline boolean not null
    default true`, in M8b.

### Deviations from plan §5

- Content is jsonb on `points`, not child tables (item 2).
- Point types carry no section.
- `deadline_at` is frozen on the issue (item 1).
- The opt-out is a column, not a preferences document (item 10).
- There is no `issue_items` table yet (item 8).
- The plan's `people` table is not built (ADR 0019).

### Deferrals

- „Z registru“ moves to M9.5.
- Editing `meeting_date` moves to M9.4 or M10.1; until then `meeting_date`
  equals `monday`.
- `published_issue_id` with its CHECK moves to M10.1.

## Options rejected

- **Child tables for bullets and statements (D5 (b)).** Three more commits, and
  a save would become several statements that must share one version.
- **`issue_items` in M8 (D6 (b)).** It would write a row at approval for a
  table nothing reads before M9.
- **Computing the deadline on read.** A deadline already shown to an author
  could move when the rule changes.
- **Names only in the event (D13 (b)).** The reviewer's change could not be
  shown to the author, which is what the plan's "with a diff" is for.
- **Letting `point.view` admit any reviewer.** Reviewers would read colleagues'
  drafts.
- **Registering `version_bump` and `points_earliest_fixed` as known
  constraints.** A race cannot trip them: optimistic locking filters on the
  version, and a hit is a bug that should surface as a database failure.

## Consequences

- Before values contain what the author wrote, so they are personal data kept
  as long as the point. The privacy review lists them and flags them for the
  school's data protection officer (D13). Pupils' names and quotes are in point
  content, and approved akce expose responsible people to students (D4); both
  are flagged too.
- One versioned UPDATE saves a whole point, so two tabs of the same author
  conflict at the point level, not per field.
- Policy tests gain matrix rows for `point.view`; the property test covers the
  new scope kind.
- `KNOWN_CONSTRAINTS` holds only constraints a race can trip at commit. M8
  adds only `point_types_name_key` to it; the other CHECKs are defence in depth
  behind Zod and readiness.
- Skipping an issue changes where its points are shown, not the points: the
  placement Monday is computed on read, at most 26 weeks ahead.
