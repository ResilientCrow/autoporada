# 0060 — Akce and jednání are free text

Supersedes in part: ADR 0009 (the structured „responsible“ part of an akce
line, the order of its pieces, the multi-day format), ADR 0049 item 4 (the
paragraph of a missing report: verb and people), ADR 0058 item 1 (the parts of
a returned akce or jednání) and ADR 0018 item 9 with decision D4 (a) (what
other readers see of the people). Amends ADR 0049 item 3 (the snapshot is now
`schema: 2`, with an upcaster for `schema: 1`). Applies to the Arch UI (ADR
0053) and to the classic UI alike.

## Context

An akce or jednání named the people behind it as structured data: a verb, an
„on behalf of“ text and a list of people, each with a salutation, a class and
a role. The school's real lines are looser: „organizuje paní zástupkyně Jana
Nováková, za Smíchovskou střední organizuje šéfredaktor školního časopisu pan
Petr Malý (2.B)“, „účast slečny a pánové …“, „téma stáže kybernetická
bezpečnost“. Fitting them into verbs, salutations and pickers cost the author
more than typing the sentence, and the result still needed the headmaster to
fix it. The school wants to type the line and see it printed as typed.

## Decision

1. **Three free-text fields replace `responsible`.** Organizátor
   (`organizer`), Účastníci (`participants`) and Poznámka (`note`), all
   optional, printed exactly as typed. No grammar, no dictionary, no
   salutation, no verb, no people picker, no directory search. Structured
   `responsible` is removed; existing data is dropped (no production data
   exists). Bounds in `domain/report/limits.ts`: organizer 1000, participants
   2000, note 1000. Název, Den, Poslední den, Od, Do, Areál and Místo are
   unchanged. Nobody is required at submit any more.
2. **Printed line, fixed order**, empty pieces left out, joined by „, “: date,
   time, areál, místo, název, poznámka, organizátor, účastníci. Areál prints
   „areál Smíchov“; Jinde prints nothing.
3. **Multi-day format.** Weekday, day and month at both ends, the year once at
   the end: „neděle 3. května až čtvrtek 14. května 2026“; across years both
   ends carry their year: „pondělí 28. prosince 2026 až pátek 1. ledna 2027“.
   A multi-day item prints no time: the editors hide Od and Do once Poslední
   den is a later day than Den and clear the saved times, the revise of `future.save`
   clears them too before it checks (so a „Změnit“ that makes a timed akce multi-day
   is not refused for a field the editor hides), and a submit with a time on a
   multi-day item is refused (`timeFrom` invalid). The order ignores a stored
   time on a multi-day item.
4. **Sorting inside each list**: by start day; on one start day multi-day
   items first, then timed items by start time, then untimed ones; ties by
   title in Czech collation. Untimed items used to come first.
5. **The wizard** has the steps Název, Kdy, Kde, Kdo (Organizátor and
   Účastníci together), Poznámka, Hotovo, for every akce and jednání. Only
   Název and Den block „Pokračovat“; an optional step whose fields are empty
   offers „Přeskočit“ instead. The headmaster's short „termín“ path (Název,
   Kdy, Hotovo) is gone.
6. **A new item has no areál.** The campus starts empty and prints nothing
   until the author picks one; Kde offers „Přeskočit“ while areál and Místo
   are both empty.
7. **A missing report's paragraph is built from the fields.** Heading: the
   akce's title. Paragraph, single day: „V úterý 5. května 2026 od
   14.00 hodin proběhla akce předání diplomů oceněným studentům (areál
   Smíchov, Zasedací místnost zastupitelstva Prahy 5). Akci zajišťovali:
   <Organizátor>. Za Smíchovskou střední se zúčastnili: <Účastníci>. Zpráva
   o akci nebyla dodána.“ Multi-day: „Od pondělí 11. května do středy
   20. května 2026 proběhla akce …“, without a time. „V úterý“, „ve středu“,
   „ve čtvrtek“, „v pátek“, „v sobotu“, „v neděli“, „v pondělí“ and the
   genitive „do středy“ come from fixed weekday tables; only dates are
   inflected, never what people typed. Empty pieces are left out: no time, no
   „od … hodin“; no areál and no Místo, no parentheses; no Organizátor, no
   „Akci zajišťovali“ sentence; no Účastníci, no „se zúčastnili“ sentence.
   „Zpráva o akci nebyla dodána.“ always ends it. One report line follows,
   „vyjádření organizátora: nebylo dodáno“, replacing the two fixed lines of
   ADR 0049. The headmaster can still replace the paragraph (ADR 0049 item 5).
8. **Snapshot `schema: 2`.** A future item in the snapshot carries
   `organizer`, `participants` and `note` as text instead of `responsible`.
   `parseIssueSnapshot` reads `schema: 1` through an upcaster that turns the
   old `responsible` into an organizer text with the code that used to print
   it (verb, on behalf of, people with salutations), so a document generated
   earlier still renders; `schema: 3` is refused. Every reader goes through
   `parseIssueSnapshot`.
9. **A report no longer pre-fills its organisers bullet from the akce.** There
   are no structured people to copy; title, dates, areál and Místo still
   pre-fill.
10. **A return names these parts of an akce or jednání**: `title`, `when`,
    `place`, `who` (Organizátor and Účastníci) and `note`, replacing
    `responsible`; at most five. A report's and a proposal's parts are
    unchanged. Migration 0054 rewrites a stored return's `responsible` to
    `who` in place, lifting the append-only trigger once inside the migration
    transaction.
11. **Privacy: other readers see the fields as typed.** An approved akce is
    readable by every signed-in user, and the three texts print in the
    document anyway, so they are shown like the title. The privacy notice
    (`ui/copy/privacy-processing.ts`) and the privacy review (item 32) say
    that the texts may name staff and pupils and are shown as typed.

## Consequences

- Authors write one sentence instead of filling pickers; the text is theirs to
  get right, and the reviewer checks it as written.
- The columns land in two steps: the new ones first, `responsible` and the
  old return-parts bound dropped once nothing reads them.
- A pupil's name typed in Účastníci is personal data that is not tied to an
  account: it is covered by the same retention and access as the akce.
- A porada generated before this change re-renders its paper view with the
  new layout (one missing-report line, the new order). The stored DOCX and PDF
  are the record and stay as they were. The app was not live, so this is
  accepted and no legacy rendering is kept.
- The missing-report paragraph no longer agrees in gender or number with the
  organizer: it quotes the typed text after a colon.

## Options rejected

- **Keep `responsible` and add the texts beside it.** Two ways to say who
  organizes would disagree, and the pickers stay the cost the school wants
  gone.
- **Parse the typed text into people.** It brings back the grammar the school
  wants to be rid of, and a wrong guess prints a wrong name.
- **Keep the headmaster's short termín path.** With nothing structured to
  skip, it differs from the full wizard only by hiding optional steps that
  „Přeskočit“ now covers.
