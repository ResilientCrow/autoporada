# 0047 — Skip until a chosen porada, from a dialog

Adds to ADR 0018 (skip and unskip), ADR 0034 (a porada is a Monday slot) and
ADR 0041 (no unskip behind a generated porada). Adds a kit component under
ADR 0012 and ADR 0043.

## Context

„Porada se nekoná“ lived in its own card on `/porada/[datum]`: a checkbox
and a button that skipped that one porada. A school break or a holiday
cancels several poradas in a row, and the headmaster then had to open each
one and skip it. The card also sat apart from the status it changes, below
the counts.

## Decision

1. **A skip names the porada held next.** `issues.setSkipped` takes an
   optional `until`, with `event: 'skip'` only: the Monday of the porada
   that is held next. Every open porada after the skipped one and before
   `until` is skipped in the same transaction, each with its own
   `issue.skipped` audit row. `until` must be an open slot of the calendar
   after the skipped one; anything else (itself, an earlier one, a skipped
   one, a non-Monday, past the horizon, or `until` with an unskip) fails as
   `invalid-input` on the field `until`. Without `until`, a skip is the
   single skip it was. Choosing the next open porada is the same as a single
   skip. A porada between them that is already skipped stays as it is.
2. **The workspace lists the choices.** `issues.workspace` gives each slot
   `heldNext`: the open slots after it up to the calendar's horizon, as
   `{ monday, meetingDate }`, earliest first. The page writes their meeting
   dates out („úterý 24. listopadu 2026“).
3. **The control is a button at the right of the status card.** While the
   porada is not generated, the status card („Porada se koná …“) carries
   „Porada se nekoná“ (or „Porada se koná“ for a skipped one) at its right
   from `sm` up, under its lines below. The button opens a dialog with the
   porada's date, a select of `heldNext` (the first one chosen), the
   confirmation box and the confirm button, and „Zrušit“. An unskip dialog
   has no select. The separate skip card is gone. The status line that says
   what happened stays in the card, outside the dialog. The skip control on
   the overview strip is unchanged: it skips one porada.
4. **`Dialog` joins `ui/kit`.** It wraps React Aria's `DialogTrigger`,
   `ModalOverlay`, `Modal` and `Dialog`: focus is trapped and goes back to
   the trigger, Escape and a press outside close it, and the open state
   belongs to the caller so a form can close it when it settles. It renders
   nothing until it opens, so server markup stays free of inline styles; the
   overlay's own style is set from script, which the CSP allows. The subpaths
   `Dialog`, `Heading` and `Modal` join the audited list in
   `eslint.config.mjs`. `Card` gains `aside` for a control beside its content.

## Consequences

- Skipping a run of poradas is one confirmation. Bringing them back is still
  one unskip each, from each porada's page.
- The approved points of the skipped poradas go to the chosen one, as they
  went to the next porada before (ADR 0029); the dialog warns after the
  deadline.
- The dialog needs JavaScript; so did the form it replaces.
- The dialog's form is tested on its own, because a closed dialog renders
  nothing and the unit tests have no DOM.

## Alternatives considered

- **A date field for the next porada.** A free date can fall on no slot or
  on a skipped one; the select offers only what the use case accepts.
- **Skipping each porada in the range from the client.** Several requests
  could half succeed; one transaction skips all or none.
- **Keeping the checkbox on the page and adding the select there.** It kept
  the control apart from the status it changes, which is what the
  headmaster asked to change.
