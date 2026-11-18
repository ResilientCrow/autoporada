# 0070 — The state carries the working set, history is read on demand

Refines ADR 0053 item 2 (one read, one write) and settles its consequence „the
state composes the document of each issue for reviewers … to be split if it
ever shows up in the timings“. ADR 0018 and ADR 0026 (who may see a point)
stand: this decides what is sent, not what may be seen.

## Context

`GET /api/arch/state` sent everything its viewer may see. For the vedení that
was every point and future item ever handed in with their events, every
generated document (its snapshot read and composed again on each request) and
the annexes of every porada (up to 3.5 MB each). The client reads the state
after each write, on return to the tab and every three seconds while a PDF
renders, and the limit is 300 reads a minute for each user.

So the cost of one read grew with the school's history, and any member of
staff could grow it for everyone above them: a point holds up to 200 KB and
nothing bounded how many one author could hand in.

## Decision

1. **The state carries the live working set.** The policy still decides what a
   viewer may see; `server/routes/arch-live.ts` is a second, narrower filter on
   what is sent, and `infra/db/arch.ts` reads a superset of it, so history is
   not loaded at all.
   - A point: never a withdrawn one. The viewer's own; a colleague's while it
     is `submitted`, `returned` or `approved`; a colleague's refused report of
     an akce that is itself in the set (the client reads it to see that the
     akce is closed). A colleague's published or refused point is history.
   - A jednání or akce: never a withdrawn one. The viewer's own; a colleague's
     while it is `submitted` or `returned`, or approved with a cancel request;
     otherwise one whose last day (`endDate`, else `startDate`) is on or after
     the earlier of today and the meeting date of the last generated porada.
     What ended before that meeting is settled with it. A porada is generated
     before it is held, so until the meeting day the cut is today: what has
     not happened yet stays in everyone's list.
   - History begins with the first generated porada: until then everything the
     viewer may see is sent, withdrawn items apart.
   - Events and names are read for the items in the set only.
2. **A generated porada is metadata in the state**: its Monday, dates, status
   and `doc` (`at`, `pdf`, `pdfFailure`). No document, no texts, no annexes;
   the snapshot column is not read and annexes are read for open poradas only.
3. **History is read on demand through `/api/arch/run`**, by two read use
   cases behind `archive.view`: `documents.read {monday}` answers the composed
   document of one generated porada and `documents.list` the archive's shelf
   (point count and the last three titles of each). They take the `admin`
   limit and are not audited: the DOCX and PDF downloads stay the audited
   reads (ADR 0038). A stored document never changes, so the client keeps what
   it read for the session (`arch/core/archive.ts`).
4. **One author's share of everyone's state is capped** (`domain/report/limits.ts`):
   `PENDING_CAP` 20 points at `submitted` (`points.submit` refuses with
   `pending-cap`), `FUTURE_CAP` 50 future items at `draft` and, separately, 50
   at `submitted` (`future.create` `future-draft-cap`, `future.submit`
   `future-pending-cap`). The count is taken under a per-author advisory lock,
   as the draft cap is. A returned item counts for neither, since a reviewer
   put it there. A retract and a revise have no check: a retract can exceed
   the draft cap by at most the submitted cap, and a revise the submitted cap
   by the author's approved akce, each of which a reviewer approved.
5. **What is not in the set is not found.** A link to a colleague's settled
   point, or to one's own withdrawn one, ends on the not-found screen. The
   audit log and the generated documents remain the record.

## Consequences

- One read costs what is in flight, not what ever was. The vedení no longer
  see a colleague's refused or published point in Arch; the printed porada is
  where a published one is read.
- An author's own points and future items are still sent whole, so one's own
  list grows with one's own history. It grows only as fast as the vedení
  decide, and only for that author; to be paged if it shows.
- Returned items are uncapped: each one costs a reviewer a decision.
- `documents.list` composes every stored document on each call. It runs only
  when the archive is opened; a summary stored at generation replaces it if it
  shows in the timings.
- A document whose stored snapshot cannot be read fails as `unavailable` when
  opened. The shelf still lists it, without its count and titles, and its
  files still download.
- Annex table cells and picture descriptions take the snapshot's text rule
  from this change on. A snapshot or an annex list stored before it with a
  control character in one no longer passes: the document reads as above, and
  the annex list is refused on its next save until that table is typed again.
  Only development data from before the first release can hold one.
