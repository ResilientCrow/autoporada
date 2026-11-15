# 0066 — An annex from a file

Adds to ADR 0039 items 4 and 6: a second Gotenberg, on a network of its own.
ADR 0038 item 7 (`render` is the worker's and Gotenberg's) stands.

## Context

A headmaster's annex (Příloha) usually exists already as a Word or PDF file,
and typing it again into the annex editor is the slowest part of a porada.
The annex has three ordinary parts (`text`, `table`, `image`, ADR 0053), each
saved through `arch.annexes` and printed by the DOCX renderer as editable
content. Attaching the file itself would be a new kind of storage, and a PDF
cannot be edited in the final DOCX.

## Decision

1. **The browser imports a file into ordinary parts.** The headmaster picks a
   file in the annex editor; the browser reads it and appends `text`, `table`
   and `image` parts. What is saved is what is saved today, so the save path,
   the snapshot, the DOCX renderer and their limits (ADR 0053, the 3.5 MB
   annex cap) do not change. The result is editable in the app and prints as
   editable text in the generated DOCX. Nothing of the file is kept.
2. **The format is detected by content, not by extension.**

   | Format | Detected by | Read by | What is carried |
   | --- | --- | --- | --- |
   | `.docx` | a zip with `word/document.xml` | mammoth in the browser | paragraphs, headings, lists, tables, PNG/JPEG/GIF/WebP pictures |
   | `.odt` | a zip whose `mimetype` is `application/vnd.oasis.opendocument.text` | jszip and the XML of `content.xml` | the same |
   | `.pdf` | `%PDF-` | pdf.js, text only | paragraphs and bullets |
   | `.doc` | the OLE header `D0 CF 11 E0 A1 B1 1A E1` | the server converts it to a PDF (item 4), then as `.pdf` | paragraphs and bullets |

   Lost on every path: bold and italic (the annex text editor is plain text
   with tab indents and drops marks on the first edit), fonts, colours,
   alignment, merged cells. Headings become plain paragraphs; ordered list
   items keep their number as a text prefix; lists nest to indent 3. A PDF or
   `.doc` carries no tables and no pictures, and the editor says so after the
   import. EMF, WMF and SVG pictures are skipped and counted. A document that
   starts with a heading, when the annex has no title, gives it as the title.
   Text parts are cut so each stays well inside the rich-text limits, and the
   browser counts the whole annex list as it would be saved (every annex, with
   the new parts) against the annex cap, `ANNEXES_MAX_BYTES`, and refuses a
   file that would pass it, so the autosave never fails on it.
3. **pdf.js runs in a module worker from `/arch/`.** The worker file is
   served by the app, and the CSP gains `worker-src 'self'`. pdf.js 6 has no
   eval path (it builds no function from a string), so the CSP still has no
   `unsafe-eval` in production, and the import sets no option for it. The
   importer (mammoth, pdf.js) loads on demand and is not in the first bundle.
4. **An old `.doc` goes to the web's own Gotenberg.**
   `POST /api/arch/convert` takes the raw bytes (`application/msword`, a
   `Content-Length` of at most 10 000 000, decimal like Caddy's `10MB`) and
   answers a PDF, or an error in Arch's shape: 403 `forbidden`, 429
   `rate-limited` (its own `import` limit, 20 an hour per user, or another
   conversion in flight), 413 `too-long`, 400 `invalid` (not an OLE file with
   a `WordDocument` stream), 502 `convert-failed`. The PDF comes with
   `Content-Disposition: attachment` and `Content-Security-Policy: sandbox`.
   The `DocumentConverter` port gains `docToPdf`; the adapter posts the file
   as `annex.doc` (LibreOffice picks its importer by extension) and shares
   everything else with `docxToPdf`: no redirect followed, a body read at most
   32 MiB, an answer that is not a PDF is a failure (ADR 0039 item 4). The
   web's budget is 30 s.
5. **The untrusted file never meets a porada.** LibreOffice parses the `.doc`
   in a second instance of the same image, `gotenberg-import`, on a new
   internal network `import` that only the web and that service share. The
   web is not on `render`, and the worker's Gotenberg never sees an uploaded
   file; `lint:compose` pins both rules (each Gotenberg on internal networks,
   shared with one service, and no network in common). The web reaches it
   through `GOTENBERG_IMPORT_URL` (unset, the import says it is unavailable;
   the worker never reads it). Its flags: no Chromium or PDF-engine routes, no
   webhook, no `downloadFrom`, no outbound fetch to private or public
   addresses, a fresh LibreOffice per conversion, a queue of two, 30 s, an
   11 MB body, and a memory, process and CPU limit. The worker's Gotenberg
   also turns off the routes and features a DOCX never uses.
   LibreOffice reads an `INCLUDETEXT` field of a `.doc` as a linked section; a
   `.doc` made with one (`file:` and a path) converted to the text it
   already held, not the file, in a headless conversion, so nothing local
   leaks. The container is read-only and has no way out in any case.
6. **Security.** Only a user who may edit the porada (`issue.edit`, the
   headmaster) converts. The route has the session and same-site protections
   of every session route, a magic-byte and `WordDocument` check before the
   converter, a cap of 10 000 000 counted while the body streams, and one
   conversion at a time per process (the slot is taken before the body is
   read). Nothing is stored and nothing is audited. A failure logs the
   converter's code (`convert.http.500`, `convert.timeout`, …) and never the
   file, its text or the converter's answer (ADR 0015, 0016). The browser's
   own limit is 20 MB for the other formats, which never reach the server.
7. **Body limits.** Caddy gives `/api/arch/run` 4 MB (the annex cap, 3.5 MB,
   and the ids) and `/api/arch/convert` 10 MB; every other path keeps 1 MB,
   and a body that takes over 60 s to arrive is dropped (`read_body`). The
   run limit was 1 MB until now, so an annex with pictures over 1 MB never
   saved in production: a bug before this ADR. `arch-run` refuses a body over
   1 MB from anyone without `issue.edit` before it parses it. The Next proxy
   leaves both paths out of its matcher: Next would buffer the body for it and
   cut it at 10 MB, and these two answer no page, so a nonce and a CSP add
   nothing (the routes read the raw Cookie header, which counts a repeated
   cookie as none, and the request id is Caddy's).

## Consequences

- The web process now reaches a Gotenberg of its own: an outage makes the
  `.doc` import fail with a sentence that asks for a `.docx`, and delays
  nothing else, the porada's PDF included. LibreOffice parses a file a
  headmaster chose, in a container that is read-only, unprivileged, limited
  and without a way out, apart from the one that converts poradas.
- One more container to run and watch, and a `GOTENBERG_IMPORT_URL` in the
  web's environment (`.env.example` and `compose.dev.yaml` have it).
- Imported text has no marks and a PDF import has no tables or pictures. The
  headmaster fixes layout by hand, in the same editor as any other annex.
- Imports are not a new write: the annex save validates them as it validates
  typed text.

## Options rejected

- **Attach the file as it is.** It would need a table or a column for the
  file, a download route and a way to print it into the DOCX; the DOCX would
  hold a reference, not text people can still edit.
- **Convert every format on the server.** One reader, but every file would
  cross the network and the web would parse documents. The browser already
  holds the file, and only `.doc` has no reader there.
- **Convert `.doc` in the browser.** No maintained reader exists for it.
- **The worker converts `.doc` through a job.** The headmaster waits for the
  answer in the editor; a queue and a place to keep the file would turn an
  import into stored data.
