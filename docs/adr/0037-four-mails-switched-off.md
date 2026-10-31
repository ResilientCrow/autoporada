# 0037 — Four mails switched off

Supersedes in part: ADR 0020 item 4 (the `reviewer.digest` and
`headmaster.summary` mails), ADR 0028 (what the digest links), ADR 0034
item 6 (the `issue.moved` mail), ADR 0035 item 9 (the
`headmaster.late-summary` mail).

## Context

The school wants few mails. Authors need the ones about their own work: the
report prompt, the deadline reminders, the late-report mails and the
decisions on their points. Reviewers and the headmaster work in the app
anyway, and the preflight of a porada shows where its points stand. A moved
porada is shown on Přehled. The document is never mailed.

## Decision

1. **Not scheduled:** `reviewer.digest` (7:00 and 15:00) and
   `headmaster.summary` (every 5 minutes; the same job sends
   `headmaster.late-summary`) leave `CRON`. The worker unschedules what is not
   listed, so a running deployment stops them at its next boot. `jobs:run`
   reads `CRON` and no longer offers them.
2. **Not enqueued:** `issues.move` no longer enqueues `issues.moved-notice`.
   The move form no longer promises a mail.
3. **The code stays.** Handlers, templates, notification queries, grants and
   their tests are kept and keep passing, so turning a mail back on is one
   cron entry or one enqueue, with a new ADR.

## Consequences

- New items to review and new access requests are seen only in the app
  (Přehled, `/kontrola`, `/uzivatele`).
- Nobody is told by mail that a porada moved or that its deadline came
  earlier; the late-report mails still carry each report's own close.

## Options rejected

- **Delete the four mails.** More churn (templates, views, grants, the job
  catalog and their tests) for mails the school may want back.
- **A switch in `mail.send`.** The jobs would still run and queue mails only
  to drop them.
