# 0016 — Mail delivery

Supersedes: ADR 0014 item 13 (M6 enqueues nothing).

## Context

ADR 0006 promised at-least-once mail with a dedupe key, 20 messages a minute
and respect for `Retry-After`. Graph `sendMail` has no idempotency key and
answers 202 before the message is delivered, so a crash between the answer
and our own bookkeeping cannot be told from a crash before the request. The
decision must say what is guaranteed, what is not, and what a person who is
told "no" or "wait" gets to see.

## Decision

1. **Ledger.** `mail_ledger` holds one row per dedupe key: template, recipient
   and subject ids, a state (`sending`, `unknown`, `sent`, `deferred`,
   `skipped`, `failed`), counters, times and a short code. `mail_gate` holds
   one row, the time before which nothing is sent. Both tables belong to the
   worker group; the web has no grant, and the ledger is deleted with its
   user. No address, subject line, body or provider text is stored. The
   worker claims the key before the call and settles it after, each in a
   short transaction. No external call ever runs inside a transaction.
2. **What the ledger buys.**

   | The worker dies or fails ... | Copies sent |
   |---|---|
   | before the claim, or after it but before the request leaves | 1 |
   | after Graph's 202 but before the settle commits | 2 |
   | after an ambiguous answer (timeout, reset, 500, 502, 504) | at most 2 |
   | after the settle but before pg-boss is told | 1: the retry finds `sent` |

   The duplicate in the second row cannot be closed by any design, because its
   window is the gap between the HTTP answer and the next write. The ledger
   removes the duplicate in the last row, which pg-boss alone cannot, and it
   is the only record of delivery, because nothing is kept in the mailbox.
3. **Ambiguous outcomes are resent once per key.** The first send and one
   resend are at most two copies; then the job goes to the dead-letter queue
   as `ambiguous`. A lost decision mail is worse than a rare duplicate. A
   `sending` row left by a dead attempt counts as an unknown outcome, and a
   `deferred` key that had unknown sends is sent as a resend too. The
   ledger's `unknown_sends` counts every possible copy and is never lowered;
   the cap counts the unknown sends since the last redrive (`cap_from`). A
   redrive is an operator's decision, honoured at the revived job's first
   claim, not its first attempt, which can end before it claims: until then
   the ledger's `job_id` names another job. A key left `sending`, `unknown`
   or `deferred` is sent at once and a `failed` key is sent again, each as a
   resend if a copy may be out, and the cap starts again from there. Once the revived job
   has claimed, its retries keep the cap and stop at a `failed` key. A resend
   that is delivered is logged as `mail.resend_unknown_outcome`. A resend
   whose answer is again ambiguous, an auth refusal or not sent is logged as
   `mail.unknown`, `mail.systemic` or `mail.deferred`; one held by a 429, 503
   or 409 is logged as `mail.waiting`.
4. **Classification** is a table by status, never by response text:

   | Answer | Ledger | Job |
   |---|---|---|
   | 202 | `sent` | done |
   | 429, 503, 409 | `deferred`, gate closed until `Retry-After` | wait |
   | refused, DNS, TLS, connect timeout, IdP unreachable | `deferred` (`net.*`) | retry |
   | timeout, reset, 500, 502, 504 | `unknown` | retry |
   | 401 after a token refresh, 403, IdP refusal | `deferred`, gate closed 60 s | retry |
   | 400, 404, 413, other 4xx | `failed` | dead-letter at once |

   A connect timeout means the request never left, so it is not a timeout in
   the sense of the row below. Known limit: a budget abort that fires before
   the Graph fetch starts still reads as `unknown.timeout`: it counts toward
   the cap, and the next send is a resend although nothing went out. The
   other way: every `ERR_TLS_*` and `ERR_SSL_*` code reads as not sent, and a
   few of them (a bad record, a peer's alert) can end a connection after the
   request was written, so that rare mail may arrive twice without being
   counted. Host and network unreachable, like a timeout, mean not sent only
   when `connect` raised them.

   A 403 is expected on the first day, while Exchange RBAC propagates for up
   to 2 hours. Retries (15, backoff from 30 s to 15 min) therefore span about
   2.8 hours, then the job is dead-lettered and `jobs:redrive` revives it.
5. **Throttle.** At most 20 sends in a sliding 60 s, plus the gate, are
   checked in the claim transaction under one advisory lock, so they survive
   restarts and a second process. A `Retry-After` is clamped to 1 s – 15 min
   and read as seconds or a date, and a missing one means 30 s.
6. **Holds.** When the window or the gate is closed, the runner waits, up to
   900 s and inside an execution deadline that ends before the job expires,
   then asks the handler again. A single wait never burns a retry. A second
   wait past the deadline burns one, and so does every 403 or 401 (one per
   Graph call). A stop during a hold, or between fetching a job and claiming
   it, burns one retry too. A job SIGKILLed mid-run is retried after its
   1200 s expiry.
7. **Re-read at send time.** The handler loads the recipient and the request
   and sends only if the mail still applies: an approval mail only while the
   request is approved and the user has access; a rejection or block mail only
   while the user is still `pending`; a grant mail only while the user has
   access. Otherwise the job ends as `skipped` (`stale`). A missing recipient
   ends the job without a ledger row. A purged request is `stale`.
8. **Graph.** `POST /users/{mailbox}/sendMail` as JSON, plain text,
   `saveToSentItems: false`, no `from`. Two headers travel with each mail:
   `X-Autoporada-Dedupe` (the key, to trace a copy) and
   `X-Auto-Response-Suppress: All`. The token is an app-only token from the
   existing certificate; it is cached until five minutes before expiry and
   never requested inside a transaction.
9. **SMTP** exists for development and tests (Mailpit) only, through
   nodemailer as a devDependency, loaded only when `MAIL_TRANSPORT=smtp`,
   which configuration refuses in production. The bundle keeps it external, and
   a test proves the production bundle cannot load it.
10. **Templates** are pure Czech functions in `notify`. Payloads hold ids
    only, never an address or a name. A mail contains no personal data beyond
    the date a rejected person may ask again and a link to `/prihlaseni` on
    the app origin. Subjects are constants. The wording repeats the screens
    (`access.cooldown`, `access.blocked`), checked byte for byte.
11. **Who is mailed.** The requester, when the headmaster approves, rejects or
    blocks the request. A user, when a manual grant moves them out of
    `pending`. Nobody else: not for cancelling, lowering, blocking an account
    or any other change. The job is written in the decision's transaction, so a
    refused decision mails nobody. Dedupe keys are
    per template and subject (`access.approved:<request>`,
    `access.granted:<user>:<version>`), so a rejected request that is later
    blocked mails twice, once for each decision.
12. **Retention.** Finished mail jobs 2 days, unrun 14, dead 90, ledger 91. The
    ledger outlives every dead copy so that a redrive still finds `sent`. The
    daily `mail.prune` job, 05:10 Prague time, deletes it.
13. **Operator.** `pnpm cli mail:test --user <id>` mails an active reviewer or
    headmaster who is not a student and records the audit event
    `cli.mail-test`.

## Consequences

- A person may, rarely, get a decision mail twice. An operator redrive of an
  `ambiguous` dead letter may send up to two more copies, because the count
  starts again; IT asks the recipient first (SMOKE-TEST).
- Messages are not copied to Sent Items. Bounces (NDRs) land in the shared
  mailbox, and nothing reads them yet. IT names a reader and sets a retention
  policy on that inbox (ENTRA-SETUP).
- The ledger lives beyond the 1 September purge of decided requests, and
  backups include it (ids only). The privacy review lists both.
- A permanently wrong RBAC scope shows as `mail.systemic` in the worker log
  from the first minute, and as a dead letter hours later.
- Headmasters are not mailed about new requests in M7: a pending requester
  cannot list headmasters, and a fan-out job is M8's `reviewer.digest`.
- The first real send waits for the school tenant (SMOKE-TEST).
