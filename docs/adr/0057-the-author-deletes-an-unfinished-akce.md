# 0057 — The author deletes an unfinished akce or schůzka

Adds to ADR 0053 (the Arch UI on the same backend). Leaves „Zrušit akci“
(`future.cancel`, an approved akce called off) as it was.

## Context

FUTURE_MACHINE has had `withdraw` (draft, returned or submitted to
`withdrawn`, the author only) since M8, but no use case made it. An akce or a
schůzka started by mistake stayed in „Moje“ for good. The Arch client's
`withdrawFuture` op existed and was sent as `future.retract`, which only takes
a submitted item back to the drafts.

## Decision

1. **`future.withdraw`** (author only, `submission` rate limit) moves a draft,
   returned or submitted akce or jednání to `withdrawn` at the version the
   author saw, with `confirmed: true` (the dialog's yes; `invalid-input` on
   `confirmed` without it). It records the history event `withdraw` and the
   audit event `future.withdrawn` with the states only.
2. **The write scope decides who finds it**, as for `future.retract`: another
   user, a reviewer included, gets `not-found`. An approved, rejected,
   cancelled or withdrawn item is `forbidden`.
3. **An item once submitted stays readable to reviewers** as `withdrawn`; a
   draft never handed in has no submit time and stays the author's alone, as
   ADR 0013 has it for points.
4. **Arch shows „Smazat akci“, „Smazat schůzku“ or „Smazat termín“** in the
   wizard's header next to „Odejít, rozepsané zůstane uložené“, behind a
   confirmation, as the report wizard shows „Smazat zprávu“. A submitted item
   is taken back first („Vzít zpět a upravit“). The classic UI does not offer
   it.

## Consequences

- `withdrawn` items drop out of „Moje“ and every list, as withdrawn points do.
- An approved akce is never withdrawn: it is cancelled, which the school sees.
