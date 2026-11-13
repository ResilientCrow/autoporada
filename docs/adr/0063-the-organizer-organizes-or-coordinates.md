# 0063 — The organizer organizes or coordinates

Amends ADR 0060 item 1 (the organizer printed exactly as typed, with no verb)
and item 7 (the „Akci zajišťovali:“ sentence of a missing report's paragraph).
Applies to the Arch UI and the classic UI alike.

## Context

Under ADR 0060 the author typed the verb into Organizátor: „organizuje paní
zástupkyně Jana Nováková“. An akce or jednání is either organized by our
school's person, or organized by another institution and only coordinated for
the school by our person. The school wants that choice asked first, with the
names in a smaller field, and the verb printed by the app.

## Decision

1. **Role first, then the names.** Organizátor is two choices, „Organizuje“
   and „Koordinuje“ (`organizerRole`: `organizes | coordinates`, column
   `future_items.organizer_role`), and a single-line field for the names.
   Nothing is preselected. A submit with names and no role is refused
   (`content.organizerRole` required); a draft saves anything. There is no
   field for the other institution.
2. **The verb follows the number of people.** Several people are listed
   separated by commas, so names with a comma print „organizují …“ or
   „koordinují …“, names without one „organizuje …“ or „koordinuje …“. No
   other grammar: „ a “ does not make a plural, and the names print as typed.
3. **A missing report's paragraph follows the role**: „Akci organizovali: …“
   or „Akci za školu koordinovali: …“.
4. **No role prints as before.** An item saved before this change has no role;
   its organizer prints exactly as typed and its paragraph keeps „Akci
   zajišťovali: …“. Generated documents re-render unchanged. A change to such
   an approved item that leaves the names alone goes to review without a role;
   one that changes the names needs a role. Names typed on several lines show
   on one line in the now single-line field.

## Consequences

- The verb lives in one domain function, used by the document, the
  missing-report paragraph and the Arch preview.
- A confirmed missing-report placeholder whose akce gains a role reads as
  changed (ADR 0061), since its system paragraph changed.
- When the names become a people picker, the plural comes from the number of
  people picked instead of the comma.
