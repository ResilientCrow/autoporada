# 0053 — The Arch UI at the root, on the same backend

Builds on ADR 0004 (layers), ADR 0012 (the fixed `ui` set), ADR 0017 (autosave
actions) and ADR 0043 (the UI foundation). Changes only what `/` serves.

## Context

The school chose a new interface, „Arch“, built as a prototype: a tile launcher
at home, a wizard for akce, and two roles in the eyes of the user (the
headmaster and everyone else). It had to look exactly like the prototype and
behave exactly like the existing application: the same sign-in, use cases,
limits, audit and mail.

## Decision

1. **Arch is a separate client in `arch/`**, a hash-routed single page bundled
   by `arch/build-real.mjs` into `public/arch` (`pnpm build:arch`, part of
   `pnpm dev` and `pnpm build`, not committed). `/` serves it through
   `server/routes/arch-page.ts`. The classic pages stay at `/klasicke` and at
   their old paths. It is type-checked by `pnpm typecheck` through
   `arch/tsconfig.json` and imports `@/...` from `src`.
2. **One read, one write.** `GET /api/arch/state` composes what the page may
   show; `POST /api/arch/run` runs the same use cases as the classic actions.
   The route checks the same origin, the session and each action's rate limit. Sign-in stays
   the classic Microsoft flow (ADR 0021 and the auth routes), unchanged.
3. **The state names only what its reader may know.** A person who is not the
   headmaster gets only the users their own view mentions, without role, status
   or contact, and a reviewer is the pseudo user `vedeni` to a non-reviewer.
4. **Two things have no classic use case**, and live in `infra/db/arch.ts`: the
   annexes of a porada (`arch_annexes`, validated by the snapshot's
   `issueAnnexSchema`, audited as `issue.annexes`, refused once the porada is no
   longer open) and retyping a point. Both are rate limited.
5. **Mail links point into Arch** (`ARCH_ADDRESS` in `notify/frame.ts`).
6. **The Arch sign-in screen says how the last attempt ended.** A failed sign-in
   and a sign-out redirect to `/` with the classic `chyba=` and `odhlaseno=`
   parameters and the same copy. After a sign-out its button asks Microsoft to
   choose the account (a shared computer, risk 12). Only a failed step-up keeps
   `/prihlaseni`, since that person is still signed in and `/` would show home.
7. **Fonts are self-hosted** (`arch/a/fonts`): no request leaves for Google, and
   the CSP stays closed.

## Consequences

- A change to a use case reaches both clients; a change to what a screen shows
  must be made in `arch/` and, while it lives, in the classic page.
- The state composes the document of each issue for reviewers. Fine for a school
  year of poradas; to be split if it ever shows up in the timings.
- Annexes are last-writer-wins between two headmaster tabs.
