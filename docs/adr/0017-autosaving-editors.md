# 0017 — Autosaving editors

Supersedes in part: ADR 0013 items 1 and 4, for autosaving editors only (the
editor is keyed by `id:loadedVersion` and a save does not refresh), and the
rule that the client never refreshes or redirects itself (ADR 0013 with item
3's „Načíst aktuální stav“ link, stated in the `define-action.ts` comment). An
autosaving editor's client calls `router.refresh()` for „Načíst aktuální stav“
after a conflict, and `router.replace()` to the new draft after
`points.create` or `future.create`.

## Context

M8 adds the first long form: a report with people, quotes and a live preview,
written over many minutes by a teacher. ADR 0013 fits a short form that
submits once. Its `refresh()` after every successful write would remount an
editor the author is typing in, and its rule that the client never refreshes
itself leaves no way to load the server's version after a conflict.

Nothing may be lost when the author leaves. Three facts were measured (spikes
SP-A and SP-B, on the production build unless noted):

- A server action sent from an unmount cleanup reached the server 15 of 15
  times on soft navigation, in dev and in prod, and did not delay the
  navigation (about 185 ms dev and 125 ms prod, the same as the baseline).
- A `pagehide` handler that calls the action reached the server 15 of 15 times
  on reload and 15 of 15 on close. In dev it delivered 0 of 2, so it is tested
  only against the production build.
- With no refresh, the caret, value and DOM node of a keyed editor survived
  200 saves. A `router.refresh()` after a version change remounts the editor
  with the server values; a refresh with the version unchanged keeps the local
  text.

## Decision

1. **Saves do not refresh.** `ActionOptions` gains
   `refresh?: 'page' | 'none'`, default `'page'`, so ADR 0013 item 4 is
   unchanged for every other action. `WrappedInfo`'s action variant records it
   through `markWrapped`. `test/arch/inventory.test.ts` reads it through
   `wrappedInfo` and pins the set of `'none'` actions exactly: `points.create`
   and `points.save` (M8a), plus `future.create` and `future.save` (M8b). It
   never includes `points.reviewEdit`, which is explicit and refreshes.
2. **The editor is keyed by `${id}:${loadedVersion}`.** Saves keep the key
   while the author types; the result of each save replaces the version held
   in a ref. A version change from outside shows up as a conflict on the next
   save; „Načíst aktuální stav“ (or a same-tab transition, which refreshes)
   brings a new key and a remount with the server values.
3. **The save is one versioned UPDATE** (`WHERE version = expected`, rowCount
   0 means stale). The author's `points.save` is a separate use case from the
   reviewers' `points.reviewEdit`, so autosave stays unaudited (exemption
   `author-autosave`, no new entry in `AUDIT_EXEMPTIONS`) and the explicit
   edit stays audited with before values.
4. **A pure state machine** (`ui/form/autosave/machine.ts`) drives the hook:
   `idle → dirty → saving → saved | conflict | locked | failed | signedOut`.
   A save starts 1.5 s after the last change, on blur, and when the page goes
   hidden. One save is in flight at a time; changes made meanwhile are sent
   next with the new version. A failed save retries after 5, 15 and 60 s, then
   asks the author to retry by hand.
5. **Flush on leave.** The effect cleanup calls the action with the pending
   content when the editor unmounts on a soft navigation, and a `pagehide`
   listener does the same on reload and close. The result of a flush is
   dropped; a late conflict is harmless because the next visit loads the
   server version. `beforeunload` warns while the editor is dirty or saving.
   Any refresh the client starts on the page (submit, „Načíst aktuální stav“)
   first waits for the flush.
6. **Conflicts.** `conflict` comes first, before the access decision (the
   version compare in `run-use-case.ts` runs before `decide`). The client then
   asks the read action `points.status` for `{ version, state, editable }`. If
   the point is no longer editable it shows the locked banner; otherwise it
   offers „Načíst aktuální stav“ (a refresh) and „Ponechat moji verzi“ (a save
   against the fresh version). A point that is current but no longer editable
   returns the rule `point-not-editable`.
7. **Status is visual, not spoken.** The status line has `aria-live="off"`.
   Only failed, conflict, locked and signedOut are announced, once each,
   through `LiveStatus`. Focus does not move and fields are read-only until
   the banner is resolved.
8. **No browser storage.** The unsaved text lives in memory; a signed-out
   author keeps it in the open tab and retries after signing in in a new tab.
9. **No navigation guard and no beacon route.** A guard would be a
   `useNavigationGuard(flush)` hook in `ui/kit`, used by the link components;
   the fences would allow it. It is not built because the cleanup flush
   reached the server every time without delaying the navigation. A beacon
   route would be a second write path outside `defineAction`, the Origin
   check, the rate limit and the exemption. The trigger to revisit is a Next
   upgrade that breaks the measured behaviour; the e2e soft-navigation case
   would catch it.
10. **Limit.** `points.save` (and `future.save` later) have their own limit,
    `autosave`, 120 per minute per user. The `submission` limit stays "creating,
    submitting and proposing; never autosave".

## Options rejected

- **Keep ADR 0013 and refresh after each save.** It remounts the editor under
  the author's hands and loses the caret.
- **Key by `id` only.** After „Načíst aktuální stav“ the editor would keep its
  stale local state, because nothing remounts it.
- **A beacon route for hard unloads.** See item 9.
- **A navigation guard now.** Cost without a measured need.
- **Draft text in `localStorage`.** A second copy of names and quotes
  of pupils would sit in a browser on a shared computer, outside any retention
  rule.
- **One `points.save` for authors and reviewers.** It would blur the audit rule
  and make autosave refresh or audit.

## Consequences

- An autosaving client now holds navigation behaviour that ADR 0013 kept on
  the server. The exception is narrow, pinned by the inventory test and limited
  to the editors named in item 1.
- The `define-action.ts` comment is updated with the commit that adds
  `refresh`.
- A tab or browser crash loses the changes since the last save that reached
  the server: the typing since the last 1.5 s pause, plus any save still in
  flight or waiting to retry. No browser storage covers it (item 8). A maximum
  wait on the debounce would bound the loss.
- Dev mode cannot show `pagehide` delivery. Only the production-build e2e
  covers it.
