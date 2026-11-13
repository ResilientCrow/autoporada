# 0062 — Cancelling an approved akce waits for vedení

Changes who makes „Zrušit akci“ (`future.cancel`, design section 12). Adds to
ADR 0057, which left the cancel as it was.

## Context

An approved akce or jednání was called off at once by its author or by a
reviewer. A change to an approved item already goes back to vedení (`revise`),
but a cancel, which takes the item out of the school overview and the porada,
did not. Vedení wants to approve a cancel as it approves a change.

## Decision

1. **A non-vedení author asks; vedení decides.** An author whose role is below
   reviewer cannot cancel an approved item: „Zrušit akci“ sends
   `future.requestCancel` (`submission` limit, `confirmed: true`), which marks
   the item `cancel_requested_at` and records the history event
   `request-cancel`.
2. **Vedení cancels at once,** as before: a reviewer or the headmaster may
   `cancel` an approved item, their own included, with or without a request.
   On an item with a request this is „Potvrdit zrušení“.
3. **Vedení may refuse** with a note (`future.refuseCancel`, `admin` limit,
   history `refuse-cancel`, note required as for a reject). **The author may
   take the request back** (`future.retractCancel`, `submission` limit,
   history `retract-cancel`). Both clear the request; the item stays approved.
4. **The item stays approved while the request waits.** The request is a flag
   on an approved item, not a state: the school still sees the item, the porada
   prints it, it still owes its report. A CHECK keeps the flag on approved items
   only, and every state move clears it, so a return or a reject of an approved
   item drops a waiting request.
5. **A waiting request is in the akce queue** („Žádost o zrušení“), ordered with
   the hand-ins by when it was made. The author cannot change the item while it
   waits; they take the request back first.
6. The audit events are `future.cancel-requested`, `future.cancel-refused` and
   `future.cancel-retracted`, with the states and the flag only; the refusal
   note stays in the history.

## Consequences

- A new state was rejected: every place that reads `approved` (visibility,
  scope SQL, owed and late reports, the document, the worker's grants) would
  have had to learn it, for an item that is still approved in every sense.
- The policy's `future.transition` check reads the flag: asking twice, or
  refusing or taking back a request that does not exist, is `forbidden`, as a
  move from the wrong state is.
- No mail is sent for a request or a decision, as for every akce decision.
