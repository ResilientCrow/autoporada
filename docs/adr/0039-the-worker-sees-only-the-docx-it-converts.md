# 0039 — The worker sees only the DOCX it converts

Supersedes in part: ADR 0038 item 4 (the worker's grant on the DOCX of
every generated document). It adds to ADR 0038 items 3 and 5.

## Context

The review of slim M10 found three gaps:

- Migration 0037 lets the worker read `docx` on every row of
  `generated_documents`, for good. A DOCX carries everything the withheld
  snapshot does: every point's text and the Příloha 1 student table. Until
  M10 the worker could read no text people wrote (ADR 0020 items 6 and 7),
  and it is the one process on the `egress` network.
- The archive is meant to be the record of what was handed out. But the
  app role holds full DML on it, and only the repository's `WHERE` clause
  keeps the worker to a pending PDF.
- A download is a GET that writes an audit row. The session cookie is
  `SameSite=Lax`, so a link on another site downloads, and audits, in the
  reader's name. Next answers HEAD by running GET.

## Decision

1. **`pdf_sources` holds the DOCX until its PDF is settled.** It has
   `document_id` (the key, cascading from `generated_documents`) and `docx`.
   `documents.insert` writes it in the generation transaction.
   `settlePdf` deletes it in the transaction that stores the PDF or marks
   it failed. The worker gets `SELECT, DELETE` on `pdf_sources`. On
   `generated_documents` it keeps `SELECT (id, pdf_status)` and the PDF
   columns of `UPDATE`, without `docx`. It can read a DOCX only while that
   DOCX waits for its PDF. The app may only insert into `pdf_sources`.
2. **A settled document cannot change, even for the owner.** The app loses
   `UPDATE` and `TRUNCATE` on `generated_documents`. It keeps `DELETE` for
   a later erasure, and the cascade to `pdf_sources` runs as the owner. A
   `BEFORE UPDATE` trigger raises `insufficient_privilege` unless:
   - the row is `pending`;
   - its id, issue, version, snapshot, DOCX, DOCX digest and generation
     time stay as they are.
3. **A fault on the last try marks the PDF failed.** `pdf.render` catches
   a throw on its last attempt and marks the PDF `failed`, so the page stops
   saying it is being prepared. If marking it fails too, the job fails with
   the first error.
4. **The converter follows no redirect and reads at most 32 MiB.** A 3xx is
   an answer (`convert.http.3xx`): following it would post the porada to
   whatever host the answer names. A body past the limit, by its
   `Content-Length` or while it streams, is `convert.too-large`.
5. **A download is a same-site GET.**
   - HEAD answers 405.
   - A request with `Sec-Fetch-Site: cross-site` gets a 303 to „Archiv
     porad“, with no file and no audit row. A redirect and not a 403,
     because the return from the Entra sign-in also comes cross-site. The
     reader clicks the file once more.
   - A request without the header (an old browser, a script with the
     cookie) is served as before.
6. **`lint:compose` checks the containment.** Gotenberg sits on internal
   networks only, and no service but the worker shares them.

## Consequences

- A failed PDF cannot be retried from the worker's side: its source is
  gone. A retry or a regenerate (a later ADR) stages the DOCX again in the
  web's transaction.
- A mistake in an archived document is now fixed only by an owner who
  drops the trigger: the app cannot rewrite the record.
- The worker writes two business tables, both for the PDF only: the PDF
  columns of a pending document, and the deletion of its source. ADR 0020
  item 6 ("the worker writes no business table") holds for everything
  else.

## Options rejected

- **Row-level security on `generated_documents`.** `UPDATE … RETURNING`
  checks the new row (`ready`) against the select policy, so the settle
  would fail. Policies would also be the only RLS in the schema.
- **The DOCX in the job's payload.** It would sit in `pgboss.job`, which
  the web writes, for the queue's whole retention.
- **A 403 for a cross-site download.** It would break the link that brings
  a signed-out reader back from the sign-in.
