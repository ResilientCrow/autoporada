# 0067 — Report grammar comes from the title

Supersedes ADR 0064 (report types are a fixed list in code). Amends ADR 0061
(a placeholder already confirmed becomes unchecked when its wording changes;
see Consequences).

## Context

A report's opening sentence must agree with the event's noun: „proběhl
seminář …, který“, „proběhla konference …, kterou“, „proběhlo setkání …,
které“. ADR 0064 kept six report types („Co to bylo“) and let the author's
choice supply the gender. The real week holds about 35 kinds of events, so six
types do not fit, and a longer chooser is clumsy. For an akce's report the
client already guessed the type from the title, and everything else became
„Jiné“.

## Decision

1. **No report types.** `POINT_TYPES`, `pointType`, the chooser („Co to
   bylo“), `guessType` and the `typeId` of contracts, use cases and repos go.
   The title carries its own grammar: the opening prints it as typed.
2. **A title reader.** `titleGender(title)` in `domain/cs/sentence` returns
   `m | f | n | pl | npl` or `null`. Whitespace splits the title; for analysis
   quotes and punctuation are stripped, case is lowercased with locale `cs`,
   diacritics are kept. Leading ordinals („10.“, „XV.“) are skipped; then the
   leading adjectives (hard -ý/-á/-é, soft consonant + -ní, -cí, „třetí“),
   up to a listed noun. The head is the next word; a substantivised adjective
   („prodloužená“, „taneční“) is the head only when nothing, or only a
   preposition, follows it. Coordination gives `null`: a head with „/“, a next
   word „a“, „i“, „nebo“, „či“, „&“ or „+“, or a head with a comma and a bare
   „a“, „i“ or „nebo“ later (a comma alone is an apposition and is kept). The
   class comes from the word list (`title-words.ts`, about 190 lowercase words,
   one line per new kind of event, no migration), else from the endings
   -ání, -ení, -éní, -ění and -nutí (neuter) and -iáda (feminine). The skipped
   hard adjectives must agree (-ý m, -á f, -é n or pl, -á npl); „Tematické
   exkurze“ (-é before a feminine noun in -e) reads as plural and „Pravidelná
   setkání“ (-á before a neuter noun in -í) as neuter plural; any other
   mismatch is `null`.
3. **The fallback is always correct.** When the reader is not sure, the opening
   says „proběhla akce „…““, „kterou“.
4. **Known limits.** A bare name („Vaib“, „Kariéra 2026“) gets „akce „…““; the
   author can write the noun into the title or edit the opening. Only exact
   spelling is read: a title without diacritics falls back. The title prints as
   typed, capitals included; the agenda line already does. „Ocenění studenti“
   (an adjective for people) would read as a neuter noun; it is not an event
   title. Left out of the list on purpose, as not kinds of events or clashing
   with names: cena, program, kino, volno, tábor, test, účast.
5. **One set of rows.** Every report starts with Organizátoři and Účastníci,
   neither required (`REPORT_BULLETS`). A report still needs at least one
   person in some people row (`people-none`), and the wizard's „Kdo to
   organizoval“ step wants an organiser. Older points keep their rows
   (`speakers`, `audience`, `results`); `OPENING_KEYS = ['organisers',
   'speakers']` lets an older Přednáška keep its people in the opening.
6. **Migration 0059** drops `points.type_id` and the checks `points_kind_type`
   and `points_type`. It changes no data, so no version bump. The 0058
   migration test needs the dropped column and is deleted.
7. **The placeholder paragraph uses the same reader** (ADR 0049, 0061): a known
   gender writes „proběhla <title>“ with its own verb, an unknown one
   „proběhla akce <title>“ as before, and „akce Vaib“ no longer prints „akce
   akce Vaib“.

## Consequences

- Snapshots and generated documents do not change: a snapshot holds the
  opening text, never a type or a gender.
- The audit log keeps old diffs with type keys; it is append-only and is not
  rewritten.
- A missing-report placeholder the headmaster already confirmed becomes
  unchecked when its wording changes (items 3 and 7). It only warns (ADR 0061);
  the server never refuses.
- The opening sentence a point stores stays until its author edits a field it
  is built from, as before.
- The gender of a title is a table test in `title-gender.test.ts`, not a
  setting: a wrong guess is a commit that adds a word or a rule.
- The reader and the type-free opening land first; removing the types, the
  one set of rows and migration 0059 follow in a later commit.
