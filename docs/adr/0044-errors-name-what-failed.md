# 0044 — Errors name what failed

Supersedes ADR 0011 in part: the Errors bullet (an exception reaches the
client as `unavailable` with a request id). Supersedes ADR 0013 in part: the
`unavailable` bullet of item 3 (it shows the request id). Supersedes the line
in plan §10 „the error page shows a `reqId`“.

## Context

Every failure showed „Něco se nepovedlo… Kód chyby: <uuid>“, whether the
database was down, a migration had not run, a stored row did not parse or the
code had a bug. The kind was known where the exception was caught and was
logged, but never reached the page. A teacher cannot do anything with a UUID,
and the administrator found the cause only by reading the log.

## Decision

1. **A failure is classified where it is caught, into one closed set of
   causes, and the page shows that cause's Czech sentence.** The sentence also
   says what to do: try again in a moment, or tell the administrator.
2. **No code on screen.** The request id stays in the log and in the
   `x-request-id` header. Every failure log line carries the cause, so the
   administrator finds the line by time and user.
3. **No raw technical text in production**: no SQL, stack trace, host name or
   provider text. The one exception to come is a Microsoft AADSTS number on
   the sign-in page, which is public and which the administrator looks up.
4. **Development adds one technical line**, `Technicky: …`, to a failure: the
   error's name, its SQLSTATE or code, and for a lost database where it is
   and how to start it (`pnpm dev:services`). Production binds no describer,
   so it sends none; tests pin that, and that the database URL's credentials
   never appear in it. A database error is never quoted by message.

### The causes

`FailureCause` is in `contracts/failure.ts`; `classifyFailure` is a pure
function in `application/core`. It reads only the SQLSTATE or schema code of a
`DatabaseFailure`, or of a raw driver error, which it detects by shape because
application may not import `pg`.

| Cause | Classified from | Czech text |
|---|---|---|
| `database-down` | SQLSTATE class 08, `57P01`–`57P03`, class 53 | Databáze aplikace teď neodpovídá. Zkuste to prosím za chvíli. |
| `timeout` | `57014` | Server nestihl odpovědět včas. Zkuste to prosím znovu. |
| `database-setup` | `42P01`, `42703`, `42883`, `42501`, class 28, `3D000` | Databáze aplikace není správně nastavená (chybí úprava databáze nebo oprávnění). Dejte to prosím vědět správci. |
| `stored-data` | `db.parse.*`, `settings.invalid.*` | Uložená data jsou v neočekávaném stavu a aplikace je neumí přečíst. Dejte to prosím vědět správci. |
| `bug` | everything else: `db.constraint.*`, `25P02`, `XX000`, `TxClosed`, any other error | V aplikaci nastala neočekávaná chyba. Dejte to prosím vědět správci. |
| `network` (client only, unchanged) | the request never reached the server | Nepodařilo se spojit se serverem. Zkontrolujte připojení… |

The texts live in `ui/copy/failures.ts`.

### Surfaces

- **Forms.** `ActionError`'s `unavailable` is
  `{ code, cause, detail? }`; `requestId` leaves the wire. `FormProblem` shows
  „Změny se neuložily.“ and the cause's sentence, since a failure always rolls
  back (ADR 0011). A form whose action only reads (the paste check) shows the
  sentence alone. `detail` shows below in monospace.
- **Routes.** `RouteSpec.failure` is told `{ cause, detail?, requestId }`.
- **Pages.** A page loader turns an exception from a use case into a
  `PageFailure` whose `digest` is `autoporada:<cause>`. Next keeps a digest an
  error already has, so it survives to the client in production, where error
  messages do not. A new `src/app/error.tsx`, inside the shell, maps the
  digest to the sentence; `global-error.tsx` does the same for failures of
  the root layout. A digest that is not ours shows `bug`. Development adds the
  error's message.
- **Sign-in and sign-out (`chyba=`).** `kod` goes. `unavailable` stays;
  `idp-error` becomes `idp-refused` (with the AADSTS number), `invalid-response`
  becomes `idp-invalid`, missing or invalid claims become `claims`, and
  anything thrown shows its classified cause with the prefix „Přihlášení se
  nepodařilo:“. `failed` disappears.
- **People search.** The client stops folding every notice into „down“:
  `unavailable`, `timeout` and `denied` each have their own sentence, and
  each keeps „Osobu můžete zadat ručně.“
- **Downloads (DOCX and PDF).** A failure answers 303 to the porada page with
  `?chyba=<cause>` and the page shows a notice, instead of a bare 500 the
  browser words itself.
- **PDF failure reason.** `generated_documents.pdf_failure` records why the
  conversion failed (`timeout`, `unavailable`, `refused`, `not-pdf`,
  `too-large`, `error`), and the document card says so before the DOCX
  fallback.
- **Mail.** No page shows mail failures; they stay in the worker log and
  `mail:test`.

Forms and routes land with this ADR and pages in the commit after it. The
rest follow as their own commits and are listed here so the rule is one
decision.

## Consequences

- A new kind of failure means a new cause in `FAILURE_CAUSES`, a sentence in
  `failures` (the type forces it) and a row in `classifyFailure`'s table test.
- The log is the only place the request id is read. Anyone reporting a
  problem gives the time and what they were doing.
- `ActionError` changes shape on the wire; every reader of `unavailable`
  is found by the compiler.
- The browser has the cause in the digest, so the page can distinguish a
  database outage from a bug without any message leaving the server.

## Options rejected

- **Keep the code and add a sentence.** The user said no code, and a code
  alone is the complaint.
- **Send the exception message.** A driver or provider message can quote a
  stored value or a host.
- **One sentence per SQLSTATE.** Dozens of states, nearly all the same advice;
  five causes cover what a reader can act on.
