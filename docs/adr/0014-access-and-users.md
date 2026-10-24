# 0014 — Access requests and user administration

## Context

A new account has the role `pending` and sees nothing. M6 lets such a user
ask for access, lets the headmaster decide, and lets the headmaster manage
the roles and status of everyone else. It touches the most dangerous data in
the system, who may do what, so every rule is written once, as a pure function
that both the application and the database constraints back up.

Plan §4 fixes the actions (`access.request`, `access.decide`,
`users.manage`), step-up for user management and the rate-limit table. This
record adds the rules around them.

## Decision

1. **Requests.**
   - `requestStanding(history, now)` holds every rule, in this order:
     blocked, pending, cooldown, open.
   - The cooldown ends at 00:00 Europe/Prague on the day of the decision plus
     30 days. It is computed from `access_requests`, so it survives restarts.
     The school-year purge deletes rejected rows and can end a cooldown early.
     That is harmless.
   - Cancelling and approving never start a cooldown.
   - A rejection carries no note, and a request carries its reason as free
     text that is never audited.
   - Nobody is ever moved back to `pending`.
2. **Blocking a request means no more requests.**
   - It never touches `users.status`, and it is final for requests.
   - A mistaken block is repaired by a manual grant (item 6).
3. **Approval is a button press.**
   - „Schválit jako zaměstnance“ and „Schválit jako studenta“ have no
     default. Approval sets `role = submitter` and `isStudent` through the
     repository's `changeAccess` in the same transaction as the request
     transition, and audits both.
   - The `users_end_sessions` trigger then signs the requester out, and the
     pending text says so.
   - Deciding a request that is not the user's newest, or approving one
     whose user is no longer `pending`, is a `conflict`.
4. **Reads and writes of users.**
   - `users.view` sits beside `users.manage` and is granted to the same
     people: headmasters who are not students. Reads use it, with no
     step-up. Writes use `users.manage`, which needs step-up.
   - Approval uses `access.decide`, with no step-up. The repository's
     `changeAccess` still re-checks `users.manage` (the policy, not the
     step-up), and a tripwire test keeps `users.view`, `users.manage` and
     `access.decide` equal for every role, status and student flag, so that
     re-check never refuses an approval the policy allows.
5. **A headmaster never changes their own role, status or student flag.**
   - Policy refuses it, and so does the repository for a user principal.
   - A sole headmaster first promotes a deputy.
   - Only two headmasters demoting each other at the same moment can leave no
     active headmaster. The deferred database trigger catches that and maps
     to the rule `last-headmaster`.
6. **Manual grant.**
   - While a request is pending, only its decision changes the user's role or
     type; the account status may still change.
   - A pending user with no pending request (never asked, cancelled, rejected
     or blocked) can be granted access by hand, under step-up.
7. **Students.** A student may only be `pending` or `submitter`. Policy
   refuses anything else with the rule `student-role`, and so does a CHECK
   constraint.
8. **One account action.**
   - M6 offers „Zablokovat účet“ and „Odblokovat účet“ (status `blocked`).
   - `deactivated` is shown if present and offered only as „Obnovit účet“.
     M10 and M11 give it a meaning.
9. **Confirmations are checked by the server.**
   - Lowering access (the role rank falls, or the status leaves `active`) and
     blocking requests need `confirmed: true`, set from a checkbox.
   - Raising access needs none.
   - Typed confirmation is kept for M9's bulk actions.
10. **Rate limits.**
    - `access.request` uses `accessRequest` (3 per 24 hours).
    - `access.decide` and `users.changeAccess` use a new `LIMITS.admin`:
      600 per hour per user, an abuse guard that a person never reaches.
    - `access.cancel` has `'none'`: each cancel needs a pending request, and
      `accessRequest` already bounds those.
    - There is no rule that every write needs a limit.
11. **Constraints become rules.**
    - `users_student_role` maps to `student-role` and
      `access_requests_one_pending` maps to `request-pending`, next to
      `users_active_headmaster`.
    - The pre-checks run first, under the user's row lock; the mappings make a
      race read as a rule, not as `unavailable`.
    - The fake world emulates the CHECK, the unique index, the
      last-headmaster trigger at commit, and the self-change refusal.
12. **Users list.** Search folds diacritics, and grouping and order
    (`csCollator`) are done in code over the scoped rows. The list shows at
    most 100 rows, with the total, and has no paging.
13. **No job.** M6 enqueues nothing: nobody is mailed about a request or a
    decision.
14. **End-to-end state.**
    - `autoporada_e2e` is rebuilt from the test template for every run.
    - A seed reads the personas from the mock identity provider's
      configuration and inserts them in fixed states; `reditel` is seeded as a
      headmaster, so bootstrap does not race.
    - Read-only screens use fixed personas. Each mutating journey has its own
      persona and runs on desktop only.

## Consequences

- Decisions and grants are audited like every other write, and the audit
  rows keep no request text.
- A reason is visible only to the headmaster. E-mail, job title and
  department appear in the queue and the list, which the privacy review
  covers.
- A wrongly rejected user waits until the cooldown ends, and a wrongly
  blocked user waits for a manual grant. Both are repairable by the school.
- The cooldown length lives in the domain and is copied into the privacy
  notice, with a test that checks they agree.
- No account can be moved to `deactivated` yet, so nobody can be locked out
  by a state with no way back in.
- The tripwire makes a future split of the three actions a deliberate
  change, because the test must be edited first.
- A single use case can no longer demote the last headmaster, so the
  trigger is only reached by a race or by a system principal, and tests of it
  use those.
