# 0076 — No academic degrees

Amends ADR 0072 item 6 (the degrees part: `users.setAddress` took a salutation
and two degrees).

## Context

ADR 0072 let a person write their degrees („Mgr.“, „Ph.D.“) on Účet, and a
report's people carried `titlesBefore` and `titlesAfter`. The school decided
that degrees are not used at all: not in the documents, not in the lists, not
in the genitive. Storing, asking for and printing them is work and personal
data for nothing.

## Decision

1. **Users have no degrees.** `users.titles_before`, `users.titles_after` and
   their CHECKs are dropped (migration `0064_drop_degrees`). `users.setAddress`
   takes the salutation only; the audit meta names `salutation`. The Arch
   state's `cards` and users carry no degree, and the Účet page has no degree
   inputs.
2. **A report's person has no degrees.** `DraftPerson`, the point contract,
   `displayName`, the recent people, the report compose and the snapshot
   person lose `titlesBefore` and `titlesAfter`; so does the person title
   limit (`PERSON_FIELD_MAX.title`, `POINT_LIMITS.person.title`).
3. **Names are written without degrees.** `PersonName` and `formatName`, and
   the genitive suggestion, work with the given and family name only.
4. **A pasted list may still carry degrees**, as school lists often do. The
   paste parser (and `splitFullName`) recognises the degrees of
   `domain/cs/names/titles` and drops them silently: the row keeps the given
   name, the family name and the class. A line of degrees only is still no
   person. A user's name from Microsoft 365 (`displayName`, split for the
   Arch people and cards) drops its degrees the same way.
5. **Free text stays as typed** (ADR 0060): an akce's or jednání's organizer,
   participants and note, quotes, the report body and the placeholder
   paragraphs. `names/several.ts` keeps its rule that a comma before an
   after-name degree does not separate two people.

## Consequences

- The development database held no user, point or generated snapshot with a
  degree, so there is no data migration of jsonb and no snapshot upcaster; the
  snapshot stays `schema: 2` (as in ADR 0074). A stored point with a degree
  would no longer pass the point contract, and a snapshot with one would no
  longer parse.
- The migration drops the two columns and their data. A database that holds
  degrees loses them, which is the decision.
- The privacy review no longer lists degrees among the stored data.
- An Arch tab opened before the update sends the old degree fields on „Uložit“
  in Účet and gets `invalid-input` until it is reloaded.
