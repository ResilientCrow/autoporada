# 0071 — Participants are addressed as one group

Amends ADR 0060 item 1 (Účastníci printed exactly as typed) and item 7 (the
„Za Smíchovskou střední se zúčastnili:“ sentence of a missing report's
paragraph), and the report's Účastníci row (ADR 0067 item 5), where each
person needed a salutation of their own. Builds on ADR 0063.

## Context

The document addresses students as „slečna“ and „pan“, and a past-tense verb
must agree with them. The app does not know anyone's gender, and Microsoft
Entra will not tell it (it knows only student or employee). Asking every
participant's gender, or guessing it from the name, is a lot of work for one
row and fails on foreign names. The school addresses a group of students as
a whole anyway: „slečny a pánové Eva Malá (3.B), Jan Novák (2.A)“. So the
author who types the participants picks one label for all of them.

## Decision

1. **One label for the whole group.** Under Účastníci of an akce the author
   picks one of four: „slečny a pánové“, „slečny“, „pánové“, „bez oslovení“
   (`participantsAddress`: `slecny-a-panove | slecny | panove |
   bez-osloveni`, column `future_items.participants_address`, a CHECK like
   `organizer_role`'s). The labels are for students only; there is no „dámy“.
   Nothing is preselected. A submit with participants typed and no label is
   refused (`content.participantsAddress` required); a draft saves anything.
2. **The number comes from the names, as in ADR 0063 item 2.** Names with a
   comma are several people, names without one are one: „slečna“, „pan“.
   „Slečny a pánové“ needs several; a submit with one name and that label is
   refused the same way.
3. **The agenda line puts the label before the names**: „…, zúčastní se
   slečny a pánové: Eva Malá (3.B), Jan Novák (2.A)“, or „zúčastní se slečna:
   Eva Malá (3.B)“. The names print as typed. „Bez oslovení“ prints the names
   as typed, with no lead-in, as today.
4. **A missing report's sentence agrees with the label**: „Za Smíchovskou
   střední se zúčastnili slečny a pánové: …“, „… se zúčastnily slečny: …“,
   „… se zúčastnila slečna: …“, „… se zúčastnili pánové: …“, „… se zúčastnil
   pan: …“. „Bez oslovení“ keeps „… se zúčastnili: …“ for any number.
5. **The report's Účastníci row takes the same label**, printed after the
   row's heading: „Účastníci: slečny a pánové Eva Malá (3.B), Jan Novák
   (2.A)“. Its people need no salutation of their own and print without one,
   sorted by class and surname as now; the number is the number of people in
   the row. A report submit whose Účastníci row has people and no label is
   refused, and „slečny a pánové“ needs two people. A report does not copy
   the akce's label: its participants may differ, and nothing is
   preselected. The organisers' row and the older rows (`speakers`,
   `audience`, `results`) keep a salutation per person.
6. **Jednání do not get the label.** Their participants are mostly staff and
   outside partners, whom these labels do not fit; they print as typed.
7. **No label prints as before.** An akce or a report saved before this
   change has no label: the akce's participants print as typed with „se
   zúčastnili:“, and the report's row groups its people by their own
   salutations. A change to such an approved akce that leaves the
   participants alone goes to review without a label; one that changes them
   needs a label. A draft report submitted after this change needs a label.
8. **The snapshot stays `schema: 2`.** A future item gains an optional
   `participantsAddress`; a people bullet gains an optional `address`, and a
   person in a bullet with an address has no salutation. An absent field
   prints as before, so no stored snapshot prints differently (ADR 0034
   item 5) and no upcaster is needed.

## Consequences

- No participant's gender is stored or guessed. A per-person salutation stays
  only where one person is named on their own: organisers and statement
  speakers.
- The label describes the group, not each person, so a wrong pick prints
  wrong. The review sees the printed line in the preview and returns it like
  any other mistake; the label belongs to the `who` part of a return.
- One domain function next to `organizerPhrase` (`domain/cs/sentence`) gives
  the label in the right number and the verb that agrees with it; the
  document, the missing-report paragraph, the report row and the Arch preview
  use it. The choices' words live in `ui/copy`.
- An approved akce gets or changes its label only through `future.save` with
  intent `revise`. The worker does not read participants, so no grant
  changes.
- A confirmed missing-report placeholder whose akce gains a label reads as
  changed (ADR 0061), since its system paragraph changed.
- A group of teachers or guests takes „bez oslovení“ and the author types
  their own words. „Dámy a pánové“ can be added later as another value.
- When the names become a people picker, the number comes from the people
  picked instead of the comma.
