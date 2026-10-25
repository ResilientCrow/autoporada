# 0019 — People memory and directory search

Supersedes: none. ADR 0012 item 5 asks that widening the React Aria allow
list repeats an audit, not that a record supersedes it; the audit is recorded
below.

## Context

A report names organisers, participants and speakers, often fifteen at a time.
Typing them each week is the main cost of writing a point. Plan §5 has a
`people` table; the first M8 design wrote it back at submit, and its review
found three problems: a forged write-back, an empty memory when the directory is
off, and no audit rule. The directory (Microsoft Graph) is also not available
until the school's tenant is set up, and searching it is a read of minors'
names.

## Decision

1. **The memory is the author's own points (D11 (a)).**
   - `people.recent` flattens the people in the actor's last 30 points updated
     within 400 days (bullets and statement speakers), deduplicated by
     `graphId` when there is one, else by folded name plus affiliation. The
     newest copy wins, and the genitive last used for a person comes with it.
   - The repo method always filters `author_id = principal`, so a reviewer's
     memory is their own, and it refuses a system principal.
   - Typed and pasted people are remembered too, for their author only. A
     reviewer's correction comes back through the approved version of the
     author's own point.
   - Nothing is stored for the memory: no `people` or `people_use` table, no
     purge hook. It goes when the points go. It works with `DIRECTORY=off`.
2. **The directory is a port with three adapters.** `DirectoryPort.search`
   never throws; its errors carry codes only. `dev` reads an invented file and
   is refused in production, `off` returns `directory.off` and is the
   production value until the tenant answers whether `User.ReadBasic.All`
   allows `$search` (D9 (a)), and `graph` arrives in M8b. A pick stores
   nothing: only graph id (dedupe, grants nothing) and names reach the point,
   and a Graph hit carries no class, so no pupil's class is disclosed.
3. **A route, not an action, and a gate first.** `POST /api/adresar/hledat` is
   a route because server actions run one at a time per client, and a slow
   Graph call would queue autosaves behind it. It runs the read use case
   `people.searchGate` (gate `directory.search`) first, so a refused caller
   never reaches Graph, then calls the port outside any transaction. The wire
   shapes live in `contracts/directory.ts`, because `ui` may not import the
   port. Pipeline refusals are HTTP statuses (401, 403, 429), mapped to
   notices by the client.
4. **The limit is 120 per minute per user,** with a comment: a class of fifteen
   needs about 45 searches a minute. The earlier 30 was too low.
5. **The picker is a React Aria ComboBox,** with the recents filtered in the
   browser, the search debounced 300 ms with one abort per request, and a last
   option „Přidat ručně“. Chips are a `<ul>` of `<li>`, not TagGroup or
   GridList. Notices are `<p role="status">` beside the box, never a ListBox
   empty state. The paste parser lives in `domain/cs/people`, never calls
   Graph, and shows a preview table before anything is inserted.
6. **React Aria audit (ADR 0012 item 5).** The allow list in
   `eslint.config.mjs` gains the subpaths `react-aria-components/ComboBox`,
   `Input`, `ListBox`, `Popover`, `Label` and `Header`; `ListBoxSection` is
   imported from the `ListBox` subpath. The package root stays banned, and the
   components stay in `ui/kit` and `ui/form`. The SSR audit found no inline `style=`
   in the server-rendered markup; a test renders the picker with
   `renderToStaticMarkup` and fails on any `style=`, and it stays in the suite.
   Whether the ComboBox also hydrates with no `style=` under the real CSP is
   checked in commit 24 (S3) by an e2e CSP-violation listener on the gallery
   page. If that check fails, the picker is a native input with a results
   `<ul>` of buttons, the allow list is not widened, and a new ADR records it.
7. **Logs and audit carry codes only.** The directory logs its code and the
   status class, never the query. A test scans `audit(` calls and fails on
   meta keys that would carry text people wrote.

## Options rejected

- **A shared `people` row per Entra id (D11 (b)).** A forged write-back, an
  empty memory without the directory, no audit rule, and a new table of minors'
  data that needs a pick-proof table and student-aware card filtering.
- **A `vyber` route that stores the picked person.** Dropped with (b); a pick
  stores nothing.
- **Search as a server action.** Actions serialise per client.
- **`User.Read.All` from the start (D9 (b)).** More access than the product
  needs before the tenant has answered; decided with the Graph identity in ADR
  0021.

## Consequences

- A new teacher starts with an empty memory and types or pastes until their own
  points fill it. This is accepted over sharing minors' names.
- A reviewer's correction reaches only the author of that point, through its
  approved version; other authors never see it. This is the price of nothing
  shared.
- With `DIRECTORY=off` the product works end to end; the search box says so.
- The privacy review states: what (point content, the memory is only your own
  points, no one else sees it), where from (the school directory, names only),
  to whom, and how long (as long as the points).
- The Graph adapter, its egress rules and the choice of app identity are
  decided in M8b (ADR 0021).
