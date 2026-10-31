# 0038 — Generation and the archive

## Context

The headmaster has to get the porada out as a file: the DOCX the school
edits and prints, and a PDF to send. Plan section 10 lists five items for
M10: the generation transaction, the PDF job, the archive with downloads,
reopen and regenerate, and a break-glass CLI. The school needs the first
three now. Reopen, regenerate and the CLI wait until the generated porada
is in use and somebody asks for them.

## Decision

1. **„Vygenerovat dokument“ sits on the Náhled.** Only the headmaster sees
   it (`issue.generate`), only for an open porada, and only after ticking
   „Rozumím, že vygenerovanou poradu už nelze změnit.“ The form is held off
   while a preflight finding blocks. It sends the issue version it was
   shown. The workspace only links to the preview („Zkontrolovat
   a vygenerovat“), so nobody generates without seeing the paper.
2. **`issues.generate` is one transaction.** In order:
   - it reads the rule (the settings share lock first, ADR 0032);
   - it ensures the issue row and checks the version the form showed
     (`conflict` otherwise);
   - it assembles the snapshot with the points locked;
   - it refuses with `issue-blocked` when the preflight blocks;
   - it sets the status to `generated` at that version.

   Two clicks at once generate once. The second waits on the row, then
   fails `conflict` or `issue-not-open`. In the same transaction it then:
   - writes a derived or seeded outline as the issue's rows, held
     placements kept (ADR 0036), so the next porada carries on from this
     one;
   - renders the DOCX and stores it with its snapshot;
   - publishes every point it printed;
   - stamps the registry entries it printed first;
   - queues `pdf.render`;
   - audits `issue.generated` (document id, DOCX digest and counts, no
     text).

   The publish is recorded as the headmaster's act. There is no check at
   the snapshot level between what the preview showed and what is
   generated: the version check covers every edit of the issue, and a
   point that changed in between is printed as it now is.
3. **`generated_documents` holds one row per issue and version.** It
   stores the snapshot, the DOCX and its sha256, and then the PDF and its
   sha256, `pdf_status` (`pending`, `ready`, `failed`) and the time of each
   step. The version is always 1 until a regenerate exists. The row names
   no user: the audit names the actor.
4. **The worker makes the PDF.** `pdf.render` reads the DOCX in a system
   read transaction and converts it through Gotenberg outside any
   transaction. It stores the PDF in a second transaction, which only moves
   a `pending` row. It tries 6 times with backoff (60 s up to 600 s), then
   marks the PDF `failed`. The DOCX stays the canonical file either way.
   Migration 0037 grants the worker `SELECT (id, docx, pdf_status)` and
   `UPDATE (pdf, pdf_sha256, pdf_status, pdf_at)` and nothing else: it
   never reads the snapshot and cannot make or change a document. Settling
   the PDF writes no audit row (the worker has no audit grant). A download
   audits the PDF's digest.
5. **Downloads are routes keyed by the Monday:**
   `/porada/[datum]/dokument/docx` and `…/pdf`. They are for the headmaster
   and the staff reviewers (`archive.view`) and fall under the `admin` rate
   limit. They are served as attachments with `nosniff` and `no-store`.
   `documents.download` audits `document.downloaded` with the format and
   the sha256. They are plain links, not `next/link`: a prefetch would
   count as a download.
6. **The Náhled of a generated porada shows its stored snapshot**, not a
   fresh assembly. Its points are published and would vanish from a new
   one. The workspace and the preview show a „Dokument“ card with the
   generation time and the files. „Archiv porad“ (`/porada/archiv`, in the
   navigation for `archive.view`) lists every generated porada, latest
   meeting first.
7. **Production runs Gotenberg in the compose stack**, built from
   `docker/gotenberg` (the porada's fonts). It runs hardened like the other
   services (read-only with tmpfs for `/tmp` and the LibreOffice profile).
   It sits on an internal `render` network that only the worker shares: no
   port and no way out.

## Consequences

- A generated porada cannot be corrected in the app. A mistake is fixed in
  the DOCX, by hand, until reopen and regenerate exist (a new ADR).
- The next porada derives from the generated one and leaves out what it
  published.
- A Gotenberg outage delays only the PDF. The page says the PDF is being
  prepared, and after the last try it says to save the DOCX as PDF in
  Word.

## Options rejected

- **The PDF in the generation transaction.** It would put a network call of
  up to a minute inside the transaction that holds the issue row and the
  points.
- **Downloads keyed by the document id.** The Monday is what people and
  links know. One document per issue makes it unambiguous.
- **Reopen and regenerate now.** They need the registry's as-of rule and a
  version history in the UI, for a need the school has not yet had.
