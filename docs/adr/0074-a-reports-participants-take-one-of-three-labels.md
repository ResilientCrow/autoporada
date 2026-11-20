# 0074 — A report's participants take one of three labels

Amends ADR 0071 item 5 (the report's Účastníci row takes the same label as an
akce).

## Context

ADR 0071 gave the report's Účastníci row the akce's four labels: „slečny a
pánové“, „slečny“, „pánové“, „bez oslovení“. On an akce, „bez oslovení“ is for
participants typed as a group („třída 3.B“, „učitelé 1. stupně“), which no
label fits. A report's row is different: its people are picked or typed one
by one, each a person with a name, so one of the three labels always fits
them. With „bez oslovení“ the row printed bare names, which the school does
not write in a report.

## Decision

1. **A report's Účastníci row takes one of three labels**: „slečny a
   pánové“, „slečny“ or „pánové“. „Bez oslovení“ is not offered and is
   refused on save (the point contract) and at generation (the snapshot).
2. **Everything else in ADR 0071 item 5 stands**: the label is required on
   submit when the row has people, „slečny a pánové“ needs two people,
   nothing is preselected, and a report does not copy the akce's label.
3. **An akce keeps all four labels** (ADR 0071 item 1), and its agenda line
   and missing-report sentence print as before.
4. `REPORT_ADDRESSES` (`domain/cs/sentence/participants.ts`) lists the three;
   the content type, the point contract, the snapshot shape and the Arch
   wizard take it.

## Consequences

- A report row stored with „bez oslovení“ would no longer save or generate.
  None exists: ADR 0071 is not deployed and the development database holds
  none, so no migration or upcaster is needed and the snapshot stays
  `schema: 2`.
- An author whose participants are not slečny or pánové („učitelé“, guests)
  picks the closest label or writes them in a vyjádření; „dámy a pánové“ can
  be added later as a fourth report label.
