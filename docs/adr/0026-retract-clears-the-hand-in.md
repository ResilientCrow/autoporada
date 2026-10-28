# 0026 — A retract clears the hand-in

Supersedes in part: ADR 0018 item 3, the sentence that `submitted_at` is set
at every submit and never cleared.

## Context

ADR 0018 item 5 lets a non-author reviewer see a point once it was submitted
and is not now a draft (`own-or-submitted`, `everSubmitted` read from
`submitted_at`). With `submitted_at` never cleared, an author could submit a
point, retract it, rewrite the draft and then withdraw it. The withdrawn point
still carried the old `submitted_at`, so reviewers and the headmaster could
read by id a text the author had never handed in.

## Decision

1. **`points.retract` clears `submitted_at`.** The point is a draft again and
   counts as not handed in; every later standing (a withdraw included) keeps
   it the author's alone until the next submit.
2. **Every submit sets `submitted_at` again**, as before. `earliest_monday`
   stays fixed at the first submit (ADR 0018 item 3 and the
   `points_earliest_fixed` trigger), so a resubmitted point keeps its Monday.
3. A point returned by a reviewer keeps `submitted_at`: reviewers have read
   it, so it stays visible to them, withdrawn or not.

## Consequences

- `submitted_at` means "handed in now, or until a decision", not "ever
  submitted"; the `everSubmitted` input of `point.view` keeps its name.
- The audit event `point.retracted` shows `submittedAt` going to null.
- No migration: the column is already nullable and no check ties it to a
  draft.
