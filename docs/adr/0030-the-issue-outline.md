# 0030 — The issue outline

Supersedes in part: ADR 0018 item 8 (approved finance and pokyn proposals are
copied into `issue_items`). Widens ADR 0018 item 1 (`ensureIssue` runs in
submit and skip only) for the headmaster writes listed in item 8 below.

## Context

POKYNY and HOSPODAŘENÍ are the standing part of the document: system slots
(meetings, events, talent, exemptions, media, partners), standing items that
carry from porada to porada, items for one porada only, and approved finance
and pokyn proposals. The headmaster edits them before generating. M10 does
not exist yet, so no earlier issue has been generated and nothing writes a
carry-over. ADR 0018 item 8 planned to copy an approved proposal into
`issue_items`; against the real flow a later return, reject, skip or move would
leave stale copies, and an edit would bypass the review diff.

## Decision

1. **The outline is rows of `issue_items`, one set per issue.** Columns:
   `issue_id` (restrict), `section` (`issue_section`: `pokyny`,
   `hospodareni`), `position` (0–59), `lineage_id`, `slot` (`issue_slot`:
   `meetings`, `events`, `talent`, `exemptions`, `media`, `partners`, or null),
   `persistence` (`item_persistence`: `standing`, `once`), `title`, `body`
   (jsonb `RichDoc`), `quotes` (jsonb, default `[]`), `source_point_id` and
   `created_at`. Keys: `issue_items_lineage_key (issue_id, lineage_id)`,
   `issue_items_position_key (issue_id, section, position)`, partial unique
   indexes `issue_items_slot_key` (slot) and `issue_items_source_key`
   (source point). The row has no `version`: the issue is the aggregate.
2. **The lineage id names an item across issues.** A carried item keeps its
   lineage id and gets a new row id at every replace. The CHECKs
   `issue_items_kind` (a placement row has no title or body; every other row
   has both), `issue_items_source` (a placement row has no slot, is `once` and
   has `lineage_id = source_point_id`), `issue_items_slot` (a slot is a
   `pokyny` standing item), `issue_items_quotes` (quotes only on `partners`,
   at most 20; the test is `coalesce(slot = 'partners', false)` because a NULL
   slot would otherwise pass), `issue_items_title` (1–300),
   `issue_items_position`
   and `issue_items_size` (131072 bytes) are defence in depth behind Zod and
   `domain/outline`. `source_point_id` cascades on delete, so M11's purge of a
   point removes its placement rows; the generated snapshot is the record.
3. **An open issue without rows is derived on read, never written by a GET.**
   The source S is the latest earlier issue that has item rows. A skipped S
   passes its rows unchanged (that meeting did not happen); otherwise
   `planCarryOver(S)` runs (once items dropped, media body and partners
   quotes emptied, slots and standing items kept; the partners quotes are new
   in this ADR). With no S the code seed `domain/outline/seed.ts` is used:
   the blank template's POKYNY and HOSPODAŘENÍ as compact `[indent, text]`
   tuples with fixed lineage ids (`0192f000-0000-7000-8000-0000000000NN`),
   without the sample quote, media sample, names or registry entries. The
   page names its origin („Obsah převzatý z porady {datum}“, „Výchozí obsah ze
   šablony“) and says it is saved on the first change. `derive` applies
   `planCarryOver` per section and the array index is the position; a row has
   no stored position in the model. `SystemSlot` and `planCarryOver` move from
   `domain/registry` to the new module `domain/outline`.
4. **Writes replace the whole outline under the issue version.** Every
   outline use case (`outline.add`, `outline.save`, `outline.move`,
   `outline.remove`) runs the same flow: `ensureIssue`; refuse unless the
   issue is open (`issue-not-open`); `issues.touch(id, expectedVersion)`
   (`UPDATE … SET version = version + 1 WHERE version = $v`, 0 rows is
   `StaleVersion`); `loadOutline`; a pure op from `domain/outline`; `DELETE`
   and `INSERT` of the issue's rows. At most 60 rows a section (`outline-full`).
   A slot cannot be removed or made `once` (`slot-fixed`). Audit events
   `outline.added|saved|moved|removed|materialized` carry lineage ids,
   section and position, never text. Two tabs of the headmaster conflict at
   the issue level; there is one writer in practice.
5. **Approved proposals stay points; the outline holds placement rows.** A
   row with `source_point_id` resolves its title and body from the point at
   assembly. Eligible proposals (ADR 0029) without a row are appended to their
   section (finance to HOSPODAŘENÍ, pokyn to POKYNY) ordered by
   `submitted_at`, then id, as virtual rows flagged „Nově schválený návrh“;
   moving one writes its placement row. A proposal row cannot be removed or
   edited in the outline (`proposal-fixed`); the page links to `/kontrola/[id]`,
   where the headmaster changes the wording by a reviewer edit, with the
   before values kept. A placed row whose point is no longer eligible is
   skipped: silently when the point is published, with the preflight warning
   `proposal-dropped` when it is now returned, rejected or withdrawn.
   Taking a proposal out of an issue means returning or rejecting it.
6. **A proposal the headmaster wrote cannot be reworded through
   `points.reviewEdit`** (ADR 0018 item 6 refuses a reviewer edit of one's own
   point). The headmaster withdraws and resubmits it, or another reviewer
   edits it.
7. **Přítomni, Hosté and Příloha 2 carry from the latest earlier issue that
   has a value.** The columns `issues.present_text`, `guests_text` (each at
   most 2000 characters) and `annex2` (jsonb, at most 65536 bytes) are
   nullable. Null means derive from the latest earlier issue, skipped ones
   included, whose value is not null, else empty. An empty string (an empty
   doc for `annex2`) means cleared, and a cleared value carries as cleared.
   „Odebrat přílohu“ stores an empty doc; the assembler passes it on as no
   Příloha 2. One port read, `issueItems.latestTextsBefore(monday)`, returns
   the three values; the check is `issues_texts`.
8. **Headmaster writes may create the issue row.** `ensureIssue` is now also
   called by the outline operations, `issues.setDetails`, `issues.setAnnex2`
   and `settings.save` (the deadline freeze, ADR 0032), and by `issues.move`
   (ADR 0034). It is still never called in a GET or in the worker. Each
   caller runs in the headmaster's write transaction.
9. **`issue.preview` narrows to staff reviewers.** The preview carries the
   students' names from the registry, so it is one policy line and one matrix
   row; reviewers who are not staff do not see it. Staff reviewers see the
   full preview and read `/porada/[datum]/nahled` only.

## Consequences

- A standing item changed in S after M was materialised does not reach M. The
  page says „Obsah uložen {datum}“, and M10 adds a lineage diff.
- After M10 generates S, M+7 derives from S with no carry-over write; M10
  only reconciles issues materialised before S was generated and freezes a
  derived outline with `writeOutline`.
- The snapshot assembler sees stored or derived rows through `loadOutline`
  and merges proposals; `writeOutline` writes stored rows only.
- A generated issue refuses outline and detail writes (`issue-not-open`).

## Options rejected

- **Copy proposals into `issue_items` at approval or at first placement.**
  Stale rows to clean up, or two texts that drift apart and edits that skip
  the review diff.
- **Materialise the outline at first open.** A GET may not write (ADR 0018).
- **Write the carry-over when a slot passes.** It duplicates M10 and needs a
  job.
- **Row-level CRUD with a deferrable position unique.** More SQL and race
  tests for no gain at about 40 rows and one writer.
