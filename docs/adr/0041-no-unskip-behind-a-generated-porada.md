# 0041 — No unskip behind a generated porada

Adds to ADR 0040 (poradas are generated in order) and ADR 0018 (skip and
unskip).

## Context

ADR 0040 holds a porada until every earlier one is generated or skipped. It
left one way back out of order: „Porada se koná“ on a skipped porada after
a later one was generated. The porada would be open again behind a
generated one, and generating it would publish points the later document
already took on, from an outline that has moved on.

## Decision

1. **`issues.setSkipped` refuses an unskip when a later porada of the
   calendar is generated**, with the rule `later-generated`. The check runs
   before the meeting-order check and writes nothing.
2. **Skip stays allowed** for an open porada before a generated one. It can
   only exist from before ADR 0040, and skipping it puts the calendar back
   in order.
3. **The forms keep their button.** The skip control in the workspace and
   the strip on the Přehled show the refusal text („Tuto poradu už nelze
   obnovit, protože pozdější porada je vygenerovaná.“). The case is rare,
   and the text says why.

## Consequences

- A skipped porada before a generated one stays skipped. The meeting can
  only be recorded outside the app until reopen and regenerate exist.
- The checks of ADR 0040 and this one read the calendar without a lock. A
  generation and an unskip at the same instant could both pass. Both are
  the headmaster's acts, so this needs one person in two tabs at once.

## Options rejected

- **Hiding „Porada se koná“ behind a generated porada.** The strip and the
  workspace would repeat the rule, and the button vanishing says less than
  the refusal.
- **A shared lock on the calendar.** It would serialize every skip, move
  and generation for a race one headmaster cannot really run.
