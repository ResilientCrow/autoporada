# 0033 — Registry without people ids

Deviates from `docs/plan.md` §5, which gives registry entries a `person_id`
and a `display_name`. No ADR is superseded.

## Context

The document prints lists of students: Příloha 1 (talent) and the lists of
point 4 (certificates and exams in English and German). The headmaster keeps
them up to date, many names arrive as a pasted class list, and M10 must print
them as they were on the day a document was generated. There is no people
table (ADR 0019) and the students never sign in for this, so a `person_id`
would point at nothing. The names and classes of students, many of them minors,
are personal data.

## Decision

1. **An entry is a given name, a family name and a class.**
   `registry_entries(id, list_id, given_name, family_name, class_code,
   added_at, removed_at, archived_year, first_published_issue_id, version)`.
   There is no `person_id`, no `display_name` and no link to a user account;
   the display form is made from the three fields. CHECKs
   `registry_entries_lengths` (names 1–60, class 1–8) and
   `registry_entries_archived` (`archived_year` only with `removed_at`, shape
   `YYYY/YYYY`); a `version_bump` trigger. The unique index
   `registry_entries_active_key (list_id, family_name, given_name, class_code)
   WHERE removed_at IS NULL` compares stored text exactly, because the
   database collation's `lower()` is not trusted with Czech letters; the paste
   preview folds case and diacritics in TypeScript first.
2. **Lists are rows too.** `registry_lists(id, key, title, doc_label, purpose,
   position, active, version)` with `purpose` `annex1` or `point4`. Constraints:
   `registry_lists_key_key`, `registry_lists_title_key`,
   `registry_lists_one_annex1` (one annex1 list), `registry_lists_key`
   (`^[a-z0-9-]{1,40}$`), `registry_lists_lengths` and
   `registry_lists_annex1_active` (the annex1 list cannot be deactivated;
   the use case refuses it as `registry-list-fixed`). A custom migration seeds
   the four lists with fixed ids and the keys `talent`, `aj-certifikat`,
   `aj-prezkouseni`, `nj-certifikat` (titles and document labels from the
   template fixture), and no entries.
3. **Removal depends on whether the entry was ever printed.**
   `registry.removeEntry` deletes the row when `first_published_issue_id IS
   NULL`; otherwise it sets `removed_at = now()` and keeps the row for M10's
   as-of rule (a regenerated document prints the entries as they were).
   Entries added since the last published issue are marked „NOVÉ“.
4. **„Nový školní rok“ archives, it does not delete.** The headmaster ticks
   lists (all ticked by default), confirms, and passes step-up
   (`registry.newSchoolYear`). Every active entry of a ticked list gets
   `removed_at = now()` and `archived_year` = the school year that ends
   (a choice of the current and the previous school year; the default is the
   previous one in September and October, else the current); never-printed
   entries are deleted. The lists stay. Archived entries may be purged one
   school year after archiving (M11). Generated documents are kept forever.
5. **Bulk paste is parsed on the server, in two steps.** `registry.previewPaste`
   is a read use case behind a server action whose result the page holds in
   `useActionState`; the pasted text lives only in the form and the action
   state and is never stored, logged or put in a URL. It returns rows with
   problems and nothing is added. `registry.addEntries` then re-validates
   every chosen row with Zod and inserts in one transaction. Bounds: 20 000
   characters, at most 200 rows (`invalid-input` otherwise). The parser is
   `domain/registry/paste.ts`, `parsePaste(text, order)`, pure.
6. **The grammar is the document's own list format and one name per line.**
   The rules, in order:
   - Normalise: NFC, any space to a space, `\r\n` to `\n`; drop empty lines
     and a leading list marker (`-`, `•`, `*`, `–`, or `1.` or `1)` followed
     by a space; „1.A Jan“ is not a marker).
   - A line with a tab is one row of columns: the last column that
     `normalizeClass` accepts is the class, the other non-empty columns
     joined by a space are the name.
   - Any other line splits into items on `,` and `;` outside brackets and on
     the lowercase word „a“ between spaces outside brackets. Lines are only
     separators: a group reaches back across them.
   - An item is `NAME [(BRACKET)] [CLASS]`. `(CLASS)` classes this name.
     `(GROUP [z|ze] CLASS)`, GROUP one of oba, obě, všichni, všechny
     (compared folded, so „obe“ and „VSICHNI“ match), classes this name and
     every classless name before it back to the last item with a class. A
     trailing class word without brackets counts as `(CLASS)`. Any other
     bracket is `class-unknown` and is not part of the name.
   - Name order is a toggle, default „Jméno Příjmení“ (the last word is the
     family name); „Příjmení Jméno“ takes the first word. Fewer than two
     words is `name-missing`. Case is kept as typed.
   - Problems per row: `name-missing`, `class-missing`, `class-unknown`,
     `duplicate` (folded against the list's active entries and the rows before
     it). Warning `group-count`: oba or obě over other than two names, všichni
     or všechny over fewer than two; the rows stay ticked. Rows with problems
     arrive unticked.
   The sample given by the school (`Jana Nováková (1.A), Patricie Nováková,
   Anna Nováková (obě 2.B), …, Jiří Novotný (všichni 1.C)`) gives nine rows
   and no problems; it is the main test case.
7. **Access.** `registry.view` is a staff reviewer's, every write is the
   headmaster's (`registry.edit`, rate limit `admin`). Audit events carry the
   list key, counts and field names, never a name.
8. **Registry errors are codes.** `KNOWN_CONSTRAINTS` gains
   `registry_entries_active_key` → `registry-duplicate` and
   `registry_lists_title_key` → `registry-list-taken`; every other new
   constraint fails as `db.constraint.<name>` (ADR 0022).

## Consequences

- Two students with the same name in the same class collide on the unique
  index and cannot be told apart in one list; the paste preview flags the
  second as `duplicate`.
- The privacy review lists purpose, recipients, retention (archive, purge one
  school year later, documents kept) and the preview audience (staff
  reviewers).
- A person can appear in several lists as several entries; nothing joins them.
- A mis-split paste is caught by the preview, not by the grammar.

## Options rejected

- **A `people` table with `person_id`.** Nothing to link to, and a data model
  for students who never sign in.
- **Always soft-remove.** Names that were never printed would be kept for no
  reason.
- **Delete everything at „Nový školní rok“.** It breaks M10's as-of rule for
  the archive.
- **Guess the name order.** Czech names give no reliable signal.
- **Parse in the browser.** The grammar grew, and one parser on the server is
  enough at 200 names.
