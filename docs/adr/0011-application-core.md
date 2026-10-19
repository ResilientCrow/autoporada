# 0011 — Application core: principal-bound transactions and one pipeline

## Context

Plan §3 fixes the order of the action pipeline. M4–M10 add sign-in, access
requests, submissions, review and generation, and every one of them must be
authorized, audited and transactional. Getting any of that wrong must be
hard, not just discouraged. The application layer may not import Next.js,
Drizzle or Node core (ADR 0004).

## Decision

- **A transaction belongs to a principal.** `Db.transaction(ctx, options,
  work)` runs `work` on one pooled connection. `ctx` holds the principal
  (a user, or a named system reason), the time of the call and the request
  id. Every repository, the audit writer and the job queue in the `Tx` use
  that connection and that principal. Nothing is ambient.
- **Repositories scope every query.** Reads and writes add the SQL
  predicate of `readScope(actor, resource)` from `domain/policy`, so a row
  the principal may not see does not exist (`not-found`). Writes that need
  more than visibility re-check `can()` themselves.
- **Each use case declares its access.** `gate` is checked before a
  connection is taken. `resource` is checked inside the transaction in this
  order: load (locked when writing), expected version, `can()`, step-up.
  `system` use cases run only for named system principals. Step-up is
  decided by `requiresStepUp` on the actual check, after `can()` passes.
- **The pipeline** is plan §3 in this order: session, rate limit,
  normalisation (plain JSON, NFC, forbidden characters stripped), strict
  Zod parse, gate, transaction, resource access, use case, output parse,
  commit.
- **Effects are transactional.** Audit events and jobs are written in the
  business transaction. External calls (Graph, mail) never run inside a
  transaction. A failure result always rolls back, and serialization
  failures are retried, which is safe because a `Tx` reaches nothing
  outside the database.
- **Errors.** Outcomes a user can cause are typed codes defined in
  `contracts/`, with Czech copy in `ui/copy`. Everything else is an
  exception that reaches the client as `unavailable` with a request id.
  Database errors leave infra as port errors carrying the SQLSTATE only:
  never the SQL, its parameters or the message.
- **Determinism.** The clock is read once per call. Application code may
  not call `Date.now()`, `new Date()` or `Math.random()`.
- **One suite, two worlds.** Use-case and port contract tests run against
  in-memory fakes (`pnpm test`) and against PostgreSQL
  (`pnpm test:integration`). The fake world fails any commit that writes
  an audited row without an audit event or a named exemption.
- **Every entry point is wrapped.** A test scans the source and imports
  every `"use server"` module and route handler, and fails the build on
  anything not built with `defineAction` or `defineRoute`.

## Consequences

- A new repository has to be added to both the PostgreSQL and the fake
  `Tx`, and to the contract suite.
- The in-memory rate limiter assumes one web replica (ADR 0008). Rules that
  must survive a restart, such as the access-request cooldown, live in the
  database.
- Normalisation strips the characters the document refuses anyway (M2),
  including bidirectional marks.
