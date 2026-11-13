# 0065 — The classic UI is removed

Supersedes ADR 0053 item 1's sentence „The classic pages stay at `/klasicke`
and at their old paths“ and item 6's last sentence (a failed step-up keeps
`/prihlaseni`). Supersedes ADRs 0013, 0024, 0025, 0027, 0031 and 0043; ADR 0012
except item 7's nonce policy and item 10; ADR 0017 items 1, 2, 4, 5 and 7; ADR
0019 items 5 and 6; ADR 0044's page surface (`PageFailure` and
`src/app/error.tsx`); ADR 0045 item 2 and item 5; ADR 0047's kit `Dialog`; and
the `ui/` and `app/` rows of ADR 0004's layer table in part.

## Context

ADR 0053 put the Arch client at `/` and kept the classic Next.js pages at
`/klasicke` and their old paths. Arch now covers every flow people use, and the
classic pages were deprecated. They still shipped about thirty pages, the
server actions and page loaders behind them, most of `src/ui`, React Aria,
TipTap and Tailwind, and the lint rules that fenced those libraries. Arch also
still sent people to classic pages in three places: a failed step-up, a failed
or signed-out download, and a signed-out request to a session route.

## Decision

1. **The classic pages are gone.** Every `page.tsx`, the server actions
   (`server/actions`, `defineAction`), the page loaders (`server/pages`,
   `runPage`, `PageFailure`) and `ui/{kit,form,shell,status,features,theme}`
   are deleted. Their old paths, `/klasicke` included, answer with the 404
   page.
2. **Next renders a minimal shell.** `src/app/layout.tsx` holds `html`,
   `body` and the metadata. `not-found.tsx` and `global-error.tsx` use Arch's
   stylesheet and classes and no inline style, so they pass the production
   CSP. The 404 links to `/`. There is no `error.tsx`: no page is left for it
   to catch.
3. **What remains of `src/ui` is `ui/copy`**, the Czech sentences Arch, the
   shell and the server share (`app`, `autosave`, `download`, `failures`,
   `forms`, `future`, `points`, `sign-in`). It imports only `ui`, `contracts`, `domain`
   and zod. `app/` reaches the server only through `server/routes/index.ts`.
4. **Arch shows every outcome the classic pages showed.**
   - A failed sign-in, a failed step-up and a sign-out land on `/` with the
     `chyba=` and `odhlaseno=` parameters. The sign-in screen shows the
     sentence; when the person is still signed in (a failed step-up), Arch
     shows it as a notice and strips the parameters.
   - A signed-out request to a session route redirects to `/`.
   - A failed download 303s to `/#/archiv?chyba=<kind>`, and the archive
     shows the sentence from `ui/copy/download.ts`. A cross-site download goes
     to `/#/archiv`; a signed-out one goes to `/`, like any session route.
5. **The use cases only the classic pages called are removed**, with the
   port methods nothing else calls. Arch reads its state through
   `GET /api/arch/state`. `points.decide` no longer answers the next point
   to review (ADR 0025's decision bar), so the review queue read goes too.
6. **List reordering is dropped.** `registry.moveList` goes with the classic
   registry page. The lists keep their stored order.
7. **The directory search stays without a caller in the UI.** The route
   (`POST /api/adresar/hledat`), the port and its adapters stay (ADR 0019
   items 1 to 4 and 7, ADR 0021). Arch has no people picker that uses it yet.
8. **The full privacy notice is dropped.** The classic
   `/ochrana-osobnich-udaju` page and its typed facts are deleted. Arch's
   short text at `#/soukromi` is what people read.
9. **There is no fallback without JavaScript.** Arch is a client-rendered
   page. The classic forms worked without JavaScript (ADR 0013 items 5
   and 9); nothing replaces that.
10. **The tooling that fenced the classic UI goes with it.** `lint:palette`
    and its scripts, the dependency-cruiser rules for `ui/` modules, React
    Aria, TipTap and the theme, and the ESLint rules for `defineAction`,
    React Aria and `next/link`. A file-level `use server` is refused anywhere.
    The packages `react-aria-components`, `@tiptap/*`, `tailwindcss`,
    `@tailwindcss/postcss` and `@fontsource-variable/*` are removed; Arch
    self-hosts its fonts (ADR 0053 item 7). With no server action left, the
    `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` secret is no longer configured or
    required.

## Consequences

- One UI to keep. Behaviour lives in the use cases and in Arch; `DESIGN.md`
  describes Arch's look.
- The e2e suite covers Arch only. Generation, downloads, the security
  headers, the request guards, sign-in and step-up were ported to Arch before
  the deletion.
- The autosave state machine, the review decision bar and the rich-text
  editor of the classic UI no longer exist. Arch has its own. The server side
  of ADR 0017 (the versioned UPDATE, conflicts first, the `autosave` limit)
  stays.
- A failed step-up returns to `/`, not to the screen the person came from.
- The notices Arch shows for sign-in and download failures are toasts that
  close on their own, where the classic pages showed a lasting alert.
- The directory search and the full privacy notice need a new decision before
  Arch uses or shows them.

## Options rejected

- **Keep the classic pages behind a flag.** Every change would still need
  both UIs and both sets of tests.
- **Redirect the old paths to Arch screens.** Old bookmarks are few, the
  mails already link to Arch (ADR 0053 item 5), and a plain 404 needs no map
  to keep.
- **Keep `registry.moveList` for a later Arch screen.** No one asked for it,
  and it would be code without a caller.
