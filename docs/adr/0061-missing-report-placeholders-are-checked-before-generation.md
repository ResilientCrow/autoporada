# 0061 — Missing-report placeholders are checked before generation

Amends: ADR 0049 item 5 (the headmaster's paragraph gains a confirmation and a
higher cap), item 7 (the preflight gains a second warning beside
`reports-missing`; both stay warnings), ADR 0060 item 7 (the paragraph the
headmaster confirms), ADR 0053 (the Arch UI lists placeholders under Ke
kontrole). Supersedes nothing. Applies to the Arch UI and the classic UI alike.

## Context

When an akce's report is not handed in, the document prints a paragraph the
system wrote from the akce's own fields (ADR 0049, 0060). Since the free-text
fields (ADR 0060) that paragraph quotes whatever the author typed, and nobody
looks at it before it is printed. The headmaster wants to see each one and say
„Zkontrolováno“, without a missing report ever stopping the porada: a porada
that cannot be generated because an author did not write is worse than a
sentence nobody read.

## Decision

1. **A placeholder exists while its report is missing.** For an akce in
   `missingReports` of an open porada (owed, report not approved, published or
   rejected, `report_state` not `missed`, with a start date). It leaves the
   list when a report is approved, when the porada is generated, or when the
   akce stops being owed.
2. **Confirmation is stored on `report_placeholders`.** `paragraph` becomes
   nullable (null: the system's text prints); the new `confirmed_original`
   holds the system paragraph the headmaster confirmed. A placeholder is
   **checked** exactly when `confirmed_original` equals the paragraph the
   system would write now. Any change that alters that text un-checks it: an
   edit of the akce, a template change, the headmaster's own save (which clears
   `confirmed_original`), and „Obnovit původní text“ (which deletes the row).
   The printed text stays `paragraph`, else the system paragraph. CHECKs:
   `paragraph` and `confirmed_original` each null or 1 to
   `POINT_LIMITS.placeholder` characters, and one of them not null
   (`report_placeholders_not_empty`). `POINT_LIMITS.placeholder` is 4000: the
   longest paragraph the free-text fields can produce fits. The worker has no
   grant on the table, as before.
3. **Status.** `placeholderStatus` (`domain/review/placeholder.ts`) gives
   `checked`; `handed-in` (a report is submitted and waits for a decision);
   `open` (the author can still hand in: now is before the close of
   `reportCloses` for the akce); else `to-check`. Only `to-check` goes to the
   headmaster's Ke kontrole; the other two are visible on Chybějící zprávy.
   The headmaster can confirm a placeholder in any status.
4. **Generation warns, never blocks.** The preflight gets a warning
   `placeholders-unchecked` for every existing unchecked placeholder (open,
   handed-in and to-check alike), linking the akce. `issues.generate` does not
   refuse for it, and the server enforces nothing. On the generate screen a
   bold banner stands above the check list: „Některé odstavce za nedodané
   zprávy nejsou zkontrolované. Vyjdou tak, jak je napsal systém.“, linking to
   the list. Pressing „Vygenerovat“ with any unchecked opens a client-side
   confirm dialog: „{n} odstavce za nedodané zprávy jste nezkontrolovali.
   Vyjdou tak, jak je napsal systém.“ (one: „1 odstavec … Vyjde tak, jak ho
   napsal systém.“; five and more: „{n} odstavců …“), with „Zkontrolovat“
   (to the list) and „Vygenerovat i tak“. `reports-missing` stays as it is and
   sits beside the new warning.
5. **`issues.confirmPlaceholder`.** Headmaster (`issue.edit`), `admin` rate
   limit, refresh `'page'`. Input: `monday`, `itemId`, `expectedVersion` (0:
   no row yet) and `akceVersion`. It takes the issue row lock like
   `issues.setPlaceholder`, refuses a generated porada, answers `not-found`
   for an akce that is not owed and missing, and `conflict` when the akce moved
   past `akceVersion` (the headmaster confirms what they saw) or the row moved
   past `expectedVersion`. The server computes the system paragraph itself and
   stores it as `confirmed_original`. Audit `issue.placeholder_confirmed`, meta
   `{ monday }`, never the text.
6. **The check follows the akce, not the porada.** Moving or dropping a porada
   changes nothing about the text; a confirmed placeholder stays confirmed.
7. **No classic Ke kontrole row.** The classic UI confirms on Chybějící zprávy
   only, with a status line and a „Zkontrolováno“ form beside the editor. The
   Arch UI lists the placeholders under Ke kontrole (headmaster only).

## Consequences

- The headmaster sees every generated paragraph before it prints, and an edit
  to the akce after the check is noticed because the text no longer matches.
- A porada is never held back by a missing report or by an unread paragraph;
  the cost is that a click on „Vygenerovat i tak“ is the only guard.
- The confirm dialog is not enforced by the server: another client can
  generate without it. That is accepted; the dialog is a reminder, not a rule.
- `paragraph` being nullable is a data model change; readers use
  `paragraph ?? system paragraph`.

## Options rejected

- **Block generation until every placeholder is checked.** Rejected by the
  school: an unwritten report must not stop the porada.
- **A boolean `confirmed` flag.** An edit of the akce would leave a stale
  confirmation on text the headmaster never saw.
- **Store the confirmed text only.** Confirming the system's own paragraph
  would then pin it, and a later akce edit would no longer reach the document.
