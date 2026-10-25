# 0020 — Submission mails

Supersedes in part: ADR 0016 items 10 (counts, and the `/body` and `/kontrola`
links after the origin) and 11 (who is mailed).

## Context

ADR 0016 fixed the delivery ledger and kept the templates minimal: a mail
carries no personal data beyond one date and a link to `/prihlaseni`, and only
the requester and a newly granted user are mailed. M8 needs mails about
points: a decision to the author, and, in M8b, reminders, a digest for
reviewers and a summary for the headmaster. A mail that says nothing useful
("something happened") is ignored; a mail that quotes a title or a name puts
text people wrote, and children's names, into mailboxes.

## Decision

1. **Variables.** A template may use the app origin, one date and counts (D3
   (a)). Counts are written in colon form, so no noun has to agree with the
   number: „Nové body ke kontrole: 4.“ Titles, names and notes never appear.
   Subjects are constants.
2. **Links.** The frame's `signInLink?: boolean` becomes
   `link?: '/prihlaseni' | '/body' | '/kontrola'`. Existing templates move to
   `'/prihlaseni'` and their bytes do not change. A signed-out reader who
   follows `/body` or `/kontrola` is sent to sign-in and back
   (`/prihlaseni?returnTo=…`), so a link in a mail works for them too.
3. **Decision mails (M8a)** go to the author when a point is returned,
   approved or rejected: `point.returned`, `point.approved`, `point.rejected`.
   They carry no date (a placement can still move) and link to `{origin}/body`,
   where the note and the state are. The payload is `{ template, recipientId,
   subjectId: eventId }`, the dedupe key `{template}:{eventId}`. The opt-out
   does not cover them.
4. **Mails of M8b** (decided here, built there):
   - `report.prompt` to the author of an approved akce that expects a report,
     once from the day after it ended and once a week later;
   - `reminder.soft` two days before the deadline, and `reminder.hard` on the
     deadline day;
   - `reviewer.digest`, daily at 07:00 and 15:00 Prague time, only when
     something is new, with new access requests added for headmasters;
   - `headmaster.summary` shortly after the deadline, with counts of approved,
     waiting and returned points.
5. **Recipients (D7 (a)).**
   - The soft reminder goes to non-student active submitters who have not opted
     out. An active submitter is a user who submitted a point or akce in the
     current school year, computed from granted columns.
   - The hard reminder goes to every author of a draft (updated in the last 28
     days) or returned point aimed at that issue, students included: it is
     about their own work.
   - Opt-out (D8 (a)) is `users.remind_deadline` and covers only the soft
     reminder. Decision mails and the hard reminder are not optional.
6. **Re-read at send time.** `stillApplies` reads, as the worker, only granted
   columns through narrow port methods (`pointEvents.mailFacts`,
   `points.mailFacts`). A return applies while the point is `returned`, an
   approval while it is `approved` or `published`, a rejection while it is
   `rejected`. Producers check the ledger key before enqueueing, and the worker
   writes no business table.
7. **Grants.** The worker group gets column grants only, asserted with
   `has_column_privilege` on the login role. Titles, openings, bodies, bullets,
   statements, places, `client_ref`, notes, before values, edited fields and
   (M8b) responsible people stay out of reach.
8. **Enqueue goes through `application/notifications`.** A use case never
   imports `application/jobs`, and the web only enqueues, in the decision's
   transaction (ADR 0004, 0011, 0015).

## Options rejected

- **No counts (D3 (b)).** "New points await" gives no sense of size, and the
  colon form removes the grammar cost.
- **A date in decision mails.** The meeting a point lands in can move after a
  skip, so the mail could be wrong.
- **Quoting the note in a return mail.** It is text a person wrote, about a
  child's work, in a mailbox.
- **Students get both reminders, or neither (D7 (b), (c)).** The hard reminder
  is about their own unfinished work; the soft one is a general nudge.
- **A digest every 15 minutes, at most hourly.** Daily at 07:00 and 15:00, only
  when something is new, is enough for reviewers.

## Consequences

- ADR 0016 item 10 now reads "origin, one date and counts", with the three
  links; item 11 now also names the authors, reviewers, headmasters and the
  active submitters above.
- The notify-copy test checks the new templates byte for byte, including
  non-breaking spaces and the dotted times.
- A decision mail can be duplicated rarely, as ADR 0016 says; the dedupe key
  is per event, so a point returned twice is mailed twice, once per return.
- Reminders are staggered over 30 minutes so the first real send does not hit
  the throttle at once (ADR 0016 item 5).
