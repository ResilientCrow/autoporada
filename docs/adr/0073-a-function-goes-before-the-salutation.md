# 0073 — A function goes before the salutation

Amends ADR 0072 item 5 (the word order of what prints before a name).

## Context

ADR 0072 item 5 printed a function between the salutation and the name:
„paní členka PR oddělení Jana Nováková“, „paní zástupkyně pro pedagogickou
činnost Mgr. Jana Nováková“. The school writes a function as a description of
the person, in front of the salutation, as it already writes an absolvent:
„členka PR oddělení paní Jana Nováková“, „absolvent pan Jan Novák“. „Paní
ředitelka“ and „pan profesor“ are different: they are how the person is
addressed, so the salutation stays in front of them.

## Decision

1. **The four function heads print before the salutation**, with their
   complement: statutární zástupce, zástupce, vedoucí, člen. The order is
   noun, complement, salutation, name: „členka PR oddělení paní Jana
   Nováková“, „zástupkyně pro pedagogickou činnost paní Mgr. Jana Nováková“,
   „statutární zástupkyně paní Mgr. Jana Nováková“, „vedoucí IT oddělení pan
   Jan Novák“, „členka PR oddělení slečna Eva Malá (3.B)“.
2. **The 2nd case keeps the order**: „vyjádření členky PR oddělení paní Jany
   Novákové“, „zástupkyně pro majetek paní Mgr. Jany Novákové“.
3. **Ředitel and profesor are unchanged**: „paní ředitelka Mgr. Jana
   Nováková“, „pan profesor Jan Novák“, „pana profesora Mgr. Jana Nováka“.
   An absolvent is unchanged: „absolvent pan Jan Novák“.
4. Everything else in ADR 0072 item 5 stands: the noun table, the salutation
   choosing the noun's sex, which function prints, and the tier fallbacks.
   One function (`headedName` in `domain/cs/names/heads.ts`) gives the order
   for the document, the opening, the genitive and the Arch suggestions.

## Consequences

- Rows already written keep the head and complement they copied and print in
  the new order; a people row stores no word order. No stored snapshot holds
  a head yet, since ADR 0072 is not deployed, so no generated document prints
  differently.
- Organizátor and the jednání's free text still print as typed. The Arch help
  example shows the new order („zástupkyně paní Jana Nováková“), and the
  organizer suggestions insert it.
- A hand-typed role still goes first: „moderátorka členka PR oddělení paní
  Jana Nováková“.
