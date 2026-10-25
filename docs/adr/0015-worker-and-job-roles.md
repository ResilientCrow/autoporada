# 0015 — Worker, jobs and database roles

Supersedes in part: ADR 0006 bullet 1 (the worker image) and ADR 0010's role
table and its Tests bullet.

## Context

M7 builds the worker. It holds the Graph credential and runs everything that
happens outside a request, so it must not be reachable from the internet, and
the web must not be able to read or change what the queue holds. ADR 0006 said
the worker is built from the same image as the web, and ADR 0010 knew three
database roles. Neither fits a worker that has its own login, its own tables
and its own image.

## Decision

1. **pg-boss** is pinned to an exact version and installed by
   `pnpm cli migrate` as the schema owner, in its own `pgboss` schema, under
   the advisory lock that migrations already take. `migrate` first refuses to
   run over `pgboss` rows it did not make: a queue it does not know, a
   partitioned queue, a queue on another table, or background commands
   (`bam`) that are not finished. If its wait for `bam` times out, those rows
   stay, and the next `migrate` refuses until an operator looks. Its schema
   number is asserted in a test. A pg-boss upgrade is one commit: version, test and
   template rebuild.
2. **Queues** are specified in code (`infra/jobs/queues.ts`), one entry per
   job name, and a job without a spec fails the type check. Policy `standard`;
   the job id is derived from the dedupe key, so enqueueing the same key twice
   is a no-op. Retention: finished jobs 2 days, unrun jobs 14 days. One shared
   queue `dead` keeps 90 days. A permanent failure goes there at once, a
   transient one after its retries. Operators replay with
   `pnpm cli jobs:redrive`.
3. **Three instances, one factory.** The installer runs in `migrate`. The
   producer (web, CLI, and the worker's own handlers) neither supervises nor
   schedules, and is started once, outside any transaction. `enqueue` never
   starts it and fails closed (`unavailable`) when it is not running. The
   worker instance supervises and schedules. Every pg-boss `error` and
   `warning` event is logged scrubbed to name, code and queue.
4. **Roles.**

   | Role | Login | Privileges |
   |---|---|---|
   | owner (migrator) | yes | owns both schemas; used only by `migrate` and `cli` |
   | `autoporada_app` | no (group) | DML on `public` except the mail tables; on `pgboss` only `SELECT` on `queue` and `version`, `INSERT` plus `SELECT (id)` on `job` and `job_common`, and `EXECUTE` on `pgboss.job_now()` |
   | `autoporada_jobs` | no (group) | on `pgboss`, table by table what a supervising, scheduling worker uses (`src/infra/jobs/grants.ts`), and nothing on `bam`; `SELECT` on the `public` tables its handlers read, extended by each milestone and listed in a test; the mail tables |
   | `autoporada_backup` | no (group) | `SELECT` on `public` and the migration history |

   `autoporada_web` stays a member of `autoporada_app`. `autoporada_worker`
   is a member of `autoporada_jobs` only: it owns nothing, runs no DDL, and
   cannot write users, sessions or audit events. `EXECUTE` on `pgboss`
   functions is revoked from PUBLIC and granted to the group; the web gets
   `job_now()` only. `bam` gets nothing, because the owner's `migrate` runs
   its rows as SQL. Backups take
   nothing from `pgboss`; that is configured with the backup sidecar in M11.
5. **Cron** is a registry of resolved schedules, not hand-written cron strings.
   The zone is always Europe/Prague. Hour 02 is refused, because it is
   skipped in spring and repeated in autumn. A missed run is filed once after
   downtime. A scheduled handler reconciles the world to now, computed from
   the clock and the data and never from the tick, so running it twice does
   nothing. Registration at boot removes entries that are no longer listed.
6. **One worker replica.** Compose refuses more. The throttle and the mail
   ledger live in the database (ADR 0016), so a deploy overlap still cannot
   exceed the limit.
7. **Image and network.** `worker` is a distroless target of the same
   Dockerfile and build stage, running one esbuild bundle. Stopping waits up to
   35 s for a job in flight, inside a 50 s grace period. The worker sits on
   `data` and its own `egress` network, never on `edge`, so Caddy cannot route
   to it. `egress` allows any host; only the school firewall narrows it to
   `login.microsoftonline.com` and `graph.microsoft.com`. The network has the
   fixed bridge name `ap-egress`, the handle for a host firewall rule (the
   `DOCKER-USER` chain or nftables). Because the name is fixed, two stacks
   cannot run on one host.
8. **Fences** (dependency-cruiser):
   - `web-never-sends-mail`: the web entry points cannot reach, even
     transitively, `infra/mail`, `infra/worker`, `application/jobs` or
     `nodemailer`;
   - use cases never import `application/jobs`; what both sides need (keys,
     payloads, the check that a mail still applies) lives in
     `application/notifications`;
   - `src/worker` never imports `server`, `app` or `ui`;
   - `nodemailer` is imported only by `infra/mail/smtp.ts`.
9. **Tests.** The template database is also rebuilt when the pg-boss install,
   grants or queue files or the pg-boss version change. Tests of the worker
   side run as `autoporada_worker` on a second database handle next to
   `autoporada_app`, so every test also exercises both sets of grants. Time is
   not faked inside pg-boss: DST is proven with `previewSchedule`, the
   application clock is injected, and tests shorten queue timings.

## Consequences

- A compromised web process can enqueue mail, from the fixed catalogue, to
  addresses read from the database. It cannot read payloads, the mail ledger
  or the schedule, and cannot alter or delete a job.
- Every later job needs its `autoporada_jobs` grants added and listed in the
  grants test.
- Each pg-boss release is a deliberate upgrade, never a drive-by. A table it
  adds stays denied to the worker until a reviewed commit grants it, so an
  upgrade that persists new state needs its grants added.
- `migrate` takes longer, because it waits for pg-boss's background
  migration to finish before it returns.
- A worker started before `migrate` ran stops with a message that says so,
  and compose restarts it.
- The RUNBOOK (M11) documents the login role for an existing volume and the
  manual rollback.
