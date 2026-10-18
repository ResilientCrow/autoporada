# 0006 — pg-boss worker with transactional enqueue

## Context

Several pieces of work must happen outside a request: reminders, reviewer
digests, report prompts, PDF rendering, retention, and the daily ops check.
Mail must never be lost or sent twice because a transaction rolled back.

## Decision

- pg-boss runs in a separate `worker` container built from the same image.
  Cron uses the Europe/Prague timezone.
- Use cases enqueue jobs through a `JobPort` that writes inside the business
  transaction (the pg-boss `db` option). A job therefore exists only if the
  data change committed.
- Mail is at-least-once with a dedupe key per message. Sending is throttled to
  20 messages per minute and respects Graph `Retry-After`.
- Every scheduled job catches up idempotently after downtime.
- Nothing needs a cron job for the submission deadline itself. The issue
  phase (collecting / review) is derived from `deadline_at`.

## Consequences

- No Redis and no second queue system.
- The web container has no Graph mail credentials in use and never talks to
  Gotenberg.
