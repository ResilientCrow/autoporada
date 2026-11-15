# Arch UI design system

Read this before touching anything in `arch/`. Everything below is taken from the code; when code and this file disagree, the code wins and this file needs a fix.

## 1. What it is

- „Arch" is the school's interface for the weekly Porada vedení školy: a hash-routed React SPA in `arch/`, served at `/` by `server/routes/arch-page.ts`. It is the only UI: the classic Next.js pages were removed. See `docs/adr/0053-the-arch-ui-at-the-root.md` and `docs/adr/0065-the-classic-ui-is-removed.md`.
- Source: `arch/a/*.tsx` (screens and kit), `arch/core/*` (state, ops, shared parts), CSS in `arch/a/base.css` (system) and `arch/a/app.css` (additions), fonts in `arch/a/fonts/` via `arch/a/fonts.css` (self-hosted, no request leaves; CSP stays closed), logos `arch/a/logo-dark.svg` and `arch/a/sign-dark.svg`.
- Build: `pnpm build:arch` (`node arch/build-real.mjs`) writes the gitignored `public/arch`. `pnpm dev` and `pnpm build` run it first. `pnpm typecheck` covers `arch/` through `arch/tsconfig.json`; `@/...` imports `src`.
- Visual reference: the prototype in `/work/ssps/app` (app under `/work/ssps/app/a`), school colours in `/work/brand/barvy.pdf`.
- Data: `GET /api/arch/state` (read) and `POST /api/arch/run` (write), which run the use cases in `src/application`.

## 2. Tokens

### Colour (`:root` in `base.css`)

| Variable | Value | Use |
|---|---|---|
| `--ink` | `#161837` | text, dark buttons, dialog veil base |
| `--navy` | `#292D67` | hover of ink surfaces |
| `--desk` | `#161837` | the dark document desk |
| `--desk2` | `#23264F` | secondary dark surface |
| `--gold` | `#F5B400` | accent: primary button, badges, focus ring, current marker |
| `--gold-soft` | `#FFF1C4` | notes, "mine" highlight, input focus halo |
| `--red` | `#8A0F28` | errors, destructive `.q.r` |
| `--mut` | `#585A75` | secondary text |
| `--line` | `#E3E3EC` | hairlines and light borders |
| `--wash` | `#F5F5F9` | hover and disabled backgrounds |
| `--on` | `#C9CBE3` | text on the dark desk |

Other literals in use: `#B9BACB` (input border), `#B4B5C8` (open marker ring), `#8A8BA3` and `#6A6B84` (disabled text), `#E5A800` (gold hover), `#F8E9EC` (error background), `#FFF8E0` and `#D29A00` (warning field), `#FFE9A6` (diff insert).

### Home tiles (`.tl` + `.t-<tone><0|1|2>`, `app.css`)

The index (0, 1, 2) is `i % 3` of the tile's position, so a row cycles through three hues. Hues are the school's Digital primaries (blue `#075A92`, purple `#6C12A1`, red `#8A0F28`) with their Dark, Middark, Sublight and Light steps from the colour manual. Never mix with Print values (the manual forbids combining the two).

| Tone | Role | 0 | 1 | 2 |
|---|---|---|---|---|
| `core` | headmaster's main areas (Porada, Ke kontrole, Archiv) | `#161837` on white text | `#292D67` | `#3A4092` |
| `act` | what you do most (Čeká na Vás first for everyone but the headmaster, Nová akce) | `#075A92` hover `#00233F` | `#6C12A1` hover `#35064C` | `#8A0F28` hover `#3F000F` |
| `browse` | things you look at, and Napsat zprávu, a report nobody asked for (Přehled, Akce školy) | `#CCE8FF` text `#00233F` | `#ECCCFF` text `#35064C` | `#FFCDD6` text `#3F000F` |
| `admin` | management, quiet | `#F7FBFF` + inset 1px `#CCE8FF` | `#FCF7FF` + `#ECCCFF` | `#FFF5F7` + `#FFCDD6` |

Tile grid `.tiles`: 3 columns, gap 10px (8px on phone), `.tl` min-height 132px (116px), padding 16px (12px), radius 12px, icon 30px. Count badge `.tl-n` is gold, 28px high. Title `.tl-t` is 16px/600.

### Type

| Variable | Stack | Use |
|---|---|---|
| `--disp` | `'TT Polls','Bitter',Georgia,serif` | page titles `.big` (52px/1.04, `.big.m` 36px, 38 and 30px on phone), dialog `h2` 28px, wizard question `.ask` 44px, shelf titles |
| `--ui` | `'Schibsted Grotesk',system-ui,sans-serif` | all interface text; body 16px/1.5 |
| `--paper` | `'Tinos','Times New Roman',serif` | the document sheet only (`.arch`, `.sheet`), 15.5px/1.42 |

UI scale: `.lead` 18px, item title `.it .tt` 16.5px/600, item sub-line `.it .st` 14.5px, `h2` 15px/700, button 15px/600 (`.lg` 16.5px), small `.sm` 14px, form label `label.l` 15px/600. Icons: `svg.i` 20px, stroke 1.8, drawn by `Ic` from the path table `I` in `ui.tsx`.

### Spacing, radii, borders, shadows

- Column `.col`: padding 32px 40px 40px, gap 36px (narrow `.nar .col`: 28px 32px, gap 28px; phone: 20px 16px 28px, gap 28px). Form stack `.stack` gap 18px, `.st8` gap 8px, `.st6` gap 6px. Items `.it` padding 14px 0, min-height 64px.
- Radii: buttons 10px (`.btn.lg` 12px), inputs 10px, notes and `.fx` 12px, choice cards `.ch` 14px, dialog 20px (phone: 20px 20px 0 0), pills and `.add` 999px, tags 4px, sheet blocks 2px.
- Borders: hairline `1px solid var(--line)` between list rows; controls use `1.5px solid var(--line)`, hover `var(--ink)`. Focus: `:focus-visible` 3px `--gold` outline, 2px offset.
- Shadows: sheet `0 24px 60px rgba(0,0,0,.35)` (none on phone); dialog `0 30px 80px rgba(0,0,0,.4)`; `.add` `0 6px 20px rgba(22,24,55,.08)`. Veil: `rgba(22,24,55,.55)`.
- Motion: `.btn` press `scale(.98)`, tiles `translateY(1px)`; `prefers-reduced-motion` turns transitions off.

### Breakpoints

One real breakpoint: `max-width:900px` is phone (14 rules), `min-width:901px` desktop (hides `.pv`). Extra: `max-width:480px` stacks date pairs in `.two`. `useNarrow()` in `ui.tsx` mirrors the 900px query in JS. Check 375 px and a desktop width.

## 3. Layout

| Piece | What it does |
|---|---|
| `App` (`ui.tsx`) | The one page layout: `.lay` grid, `.work` column on the left (`Offline`, `Bar`, `<main class="col">`, dock or `PhoneBar`), the `desk` prop on the right. Flags: `nar` (420px column, used by wizards), `full` (no desk), `noNav`, `over` (overlay such as a dialog). |
| Grid | Desktop `.lay`: `minmax(0,560px) minmax(0,1fr)`; `.lay.nar` 420px; `.lay.full` one column. Background `--desk`, column `.work` is white. |
| `Desk` (`ui.tsx`) | The dark document desk (`aside.desk`, sticky, full height, scrolls itself) holding the white sheet (`.arch`, `.sheet`). Props `note`, `right`, `cls`, `fold`. With `fold` on a phone the document waits behind one button. |
| `Sheet`, `WholeDesk`, `DocNav` | Sheet renders the built document; `WholeDesk` (`porada.tsx`) is the whole-porada desk; `DocNav` (`core/parts.tsx`) is the outline navigator. Margin notes `.mn` sit left of the sheet on desktop and become inline chips on phone. |
| `Pane` (`admin.tsx`) | Single-column management page (`.work.solo` > `main.pane` with `Tabs`) for headmaster screens (Lidé, Seznamy, Nastavení). Non-headmasters get `NotFound`. |
| `Bar` | Top: logo, `.nav` links (hidden under 900px), account icon `.uu`. Nav items differ per role in `useNav`. |
| `PhoneBar` | Bottom bar `.pb`: sticky, `min-height:62px`, same items as `Bar`, gold count badge `.n`. Displayed only on phone, and only when the screen has no dock. |
| Dock `.dock` | Sticky bottom action area of a screen (primary `.btn` row, hint text). Phone: padding respects `env(safe-area-inset-bottom)`, order places it above `PhoneBar`. |
| Phone flow | `.lay` becomes a flex column: bar, column, desk, dock, `.pb`. The wizard's desk is hidden (`.desk.tall.wzd`) and replaced by an inline preview `.pv` ("Takhle to vyjde"). |
| `Offline` | Banner when the browser is offline: „Jste bez připojení. ..." |

## 4. Components

### `arch/a/ui.tsx`

| Component | Purpose |
|---|---|
| `Ic` | Inline icon by name (`plus`, `chk`, `chev`, `back`, `user`, ...). Add a path to `I` rather than importing an icon set. |
| `Top` | Page heading: `h` title (`big` for the large one), optional `lead`. |
| `Back` | „Zpět" link with a back icon; `to`, `t`. |
| `Sec` | Titled group `.grp` with `h2`, optional `right` link. |
| `Item` | List row `.it`. With `to`: an `<a>` to a hash route. With `act`: a `<button>` that runs a function (no navigation). With neither: a plain `div`. Props `t` title, `st` sub-line, `mk` marker (`c` done check, `o` open ring, `n` gold dot, `x` red dot), `end` right-hand content, `warn`. |
| `Note` | Gold-soft information box; `err` gives the red `role="alert"` variant. |
| `Dialog` | Modal `.veil` > `.dlg` with `title`, Escape and outside click close, focus returns to opener. Bottom sheet on phone. |
| `Toast` | `role="status"` message; with `undo` shows „Vrátit zpět" for 15 s, else 5 s. |
| `Saved` | „Uloženo" status with check. |
| `Seg` | Radio group of pill buttons (`role="radiogroup"`, `role="radio"`), `label` is its accessible name. |
| `Todo` | Checklist `.todo` of rows with markers `d` done, `n` open, `o` ring, `x` problem. |
| `Track` | Step tracker `ol.trk` with `on` index and `steps`; `aria-current="step"`. |
| `Stamp` | Gold stamp `.stamp` on the sheet corner (e.g. generated). |
| `TitleField` | Auto-growing title textarea; Enter moves on. |
| `Desk`, `App`, `Bar`, `PhoneBar`, `Offline` | Layout, see section 3. |
| `useNav`, `useNarrow`, `goReplace`, `Hash`, `focusOn`, `WHEN`, `diffWords` | Role nav, phone query, no-history redirect, hash link, sheet cut to what matters while writing, clock format, word diff rendered with `ins`/`del`. |

### `arch/core/parts.tsx`

| Component | Purpose |
|---|---|
| `OutlineField` | Textarea for indented bullet text (tab indents, paste is normalised by `pastedLines`); `label` is required for accessibility, `help` optional. |
| `AnnexEditor` | Editor for one annex of a porada (text, table via `parseTable`, or image via `readImage`). `annexDoc` and `annexToText` convert to and from the rich document. |
| `DocNav` | Outline of the document with `attention` filter and `scrollToSeg`. |

### Recurring CSS classes

| Class | Meaning |
|---|---|
| `.btn` | 44px button, 1.5px `--line` border. `.go` gold primary, `.dk` ink, `.off` disabled look (grey, `cursor:not-allowed`), `.lg` 54px large, `.w` full width. Combine: `btn go lg w`. |
| `.q` | Text-style button/link (underlined, `--mut`); `.q.r` red destructive. 44px tap height. |
| `.add` | Pill action „Přidat do porady" with a gold round plus. |
| `.ch` | Choice card (bordered, 14px radius) with `.tx`, `b`, `span`. `button.ch` is the button form. |
| `.l` | `label.l`: stacked label with optional `small` help; `.in` is the text input (50px, 10px radius, gold-soft focus halo; `:disabled` has a `--wash` background, `--line` border and `#6A6B84` text, as Místo before an areál is chosen). |
| `.stack`, `.st8`, `.st6` | Vertical flex gaps 18, 8, 6px. |
| `.row`, `.wr` | Horizontal flex row (children `.btn` grow); `.wr` wraps. |
| `.mz` | Section with top hairline and 17px `h2`. |
| `.dock` | Sticky bottom bar of actions. |
| `.it`, `.rowi`, `.todo`, `.tb` | List row, row with inline controls, checklist, table. |
| `.pr`, `.pick` | Person row and pick-a-person card in writing forms. |
| `.tag`, `.sv`, `.sm` | Small tag, save indicator, small text. |
| `.seg-*`, `.bl`, `.mn`, `.slot` | Sheet segments, blocks, margin notes, dashed empty slot on the sheet. |

## 5. Patterns

### One question at a time (`NovaAkce` in `akce.tsx`, `Wizard` in `write.tsx`)

- Narrow layout `<App nar noNav ...>`: a „Odejít, rozepsané zůstane uložené" link, „Nová akce, krok 2 z 5" text, segmented progress bar `.steps` (gold for done), one big question `.ask` plus optional `.lead` help, the single input, and a `.dock` with `Zpět` and `Pokračovat` (`.wzb`). A disabled step shows `.btn.off` and a `.hint` with the reason.
- `NovaAkce` steps, the same for everyone and both kinds (ADR 0060): `nazev`, `kdy`, `kde` (Areál, Místo), `kdo` (Organizátor and Účastníci, free text), `poznamka`, `hotovo`. Only Název and Den block „Pokračovat“; an optional step whose fields are all empty (Kde counts as empty while Areál and Místo are) shows „Přeskočit“ in its place, as `Wizard` does for bullets. Od and Do hide, and their times clear, once Poslední den is after Den. The preview line is the document's own (`futureBullet`): date, time, areál, místo, název, poznámka, organizátor, účastníci. The last step asks „Takhle to vyjde. Zařadíme to?" (headmaster, goes straight into the porada) or „Můžeme to poslat?".
- Document preview: desktop shows the sheet on the desk (`focusOn` cuts it to the title, the section and your part); phone shows the same line inside `.pv` ("Takhle to vyjde") because the desk is hidden. Always provide both.
- Steps are route segments (`/nova-akce/<id>/<step>`, `/psat/<id>/<step>`); drafts autosave through `apply`.

### „Přidat do porady" (`Pridat` in `porada.tsx`, route `pridat`)

- Headmaster only: `main.tsx` renders `<Pridat />` when `head`, else `NotFound`. Entered from the `.add` button on the porada screen.
- Two groups, sorted by what is added. „Nové": Akce, Jednání, Bod, Zpráva o tom, co proběhlo, Ohlas sociálního partnera, Student do seznamu, Příloha (Bod and Příloha only when the porada has a row, Ohlas only when it has the partners row). Each sub-line says where it lands. „Doplnit do bodu, který v poradě už je": the rows `Q.addable` returns (no row the document fills itself, no approved proposal, partners apart; Pokyny before Hospodaření), titled with the document's number (`5. …`), sub-line „Trvalý bod" or „Jen pro tuto poradu", plus „zatím bez textu". A row the document does not print has no number: it is named by its title, and its sub-line ends „zatím se netiskne", or „bez textu se netiskne" when it is empty. The numbers come from the outline, whose rows are matched to points by `Q.rowForPoint` (the longest printed title, never an empty one).
- A row that creates something ends in the plus icon (`end`), a row that opens a page keeps the chevron.
- It goes straight into the porada without approval. The desk shows the live document with „Přeškrtnuté zatím nevyjde."

### Missing-report placeholders (`Kontrola` in `review.tsx`, `Zpravy` in `porada.tsx`, ADR 0061)

- A placeholder is the paragraph the system prints for an akce whose report did not come. `State.placeholderChecks` (headmaster only, by akce id: `{ checked, was }`) says whether the headmaster confirmed the paragraph the system writes now; `was` is the one they confirmed. `Q.placeholdersOf(s, monday)` lists an open porada's placeholders with their status (`checked`, `handed-in`, `open`, `to-check`, as the server's `placeholderStatus`); `Q.placeholderQueue` is the `to-check` ones over every open porada, headmaster only.
- Ke kontrole lists the `to-check` ones after the points and akce, with the marker „Vygenerováno automaticky (zpráva nedodána)“ and the dates. Its count badge (nav, Domů tile, Porada step) includes them. The detail is `/kontrola/chybi-<akce id>` and opens for a placeholder in any status: marker, author, report state and close, the paragraph with „Přepsat odstavec“ (Uložit / Zpět) and „Vrátit původní text“, a Note „Akce se od vaší kontroly změnila“ with `diffWords` when the akce changed after a check, and the dock primary „Zkontrolováno“ (`confirmPlaceholder`, then the next item).
- Chybějící zprávy under Porada is only the overview: one `Item` per placeholder with the status line („Čeká na Vaši kontrolu“, „Zkontrolováno“, „Autor může zprávu odevzdat do …“, „Zpráva je odevzdaná a čeká na rozhodnutí“), each linking to the detail. The WholeDesk `missing` segments open the detail too; „Čeká na Vás“ in the document navigator counts only the unchecked ones (`Segment.state` is `checked` for a confirmed one).
- A local edit of the akce or a save of the paragraph sets `checked: false`, as the server does.

### A write, end to end

1. A screen calls `apply(A.someOp(...))` (`arch/core/ops.ts`). Each op is an `Fx`, a pure `State => State` function tagged with `op: { k, a, tmp?, d?, m? }` (`tag`, `simple`).
2. `useStore().apply` (`core/react.tsx`) runs the function on local state at once (optimistic) and pushes the op on a queue. `core/store.ts` holds the pure state functions the ops wrap; add new state logic there.
3. `pump` takes ops in order, coalesces superseded saves (`COALESCED`), and asks `toCalls(op, { s, vers, real })` for use-case calls `{ name, input, tmp?, key? }`. Temporary ids (`createWith`, `onId`) become server ids, replacing them in state and in the hash.
4. Each call is `POST /api/arch/run` with `{ name, input }`. Failures set `problem` (`code`, `rule?`, `keep`); `unauthenticated` redirects to `/`, `step-up-required` to the step-up page, and typed text stays on screen after a refused autosave.
5. `GET /api/arch/state` is re-read only when no write is queued or running.

To add a write: a state function in `store.ts`, a tagged op in `ops.ts`, a branch in `toCalls` mapping it to a use case. If no use case fits, add or extend one in `src/application/use-cases` (see rules); if the screen needs data `GET /api/arch/state` does not return, extend `src/server/routes/arch-state.ts`.

## 6. Hard rules

1. **Style is 1:1 with the prototype**: font, colour, spacing, radii, shadows and icons, on desktop and phone. Structure may differ where it is better; style may not. After any UI change, compare screenshots side by side with the prototype (`/work/ssps/app`) at the same viewport.
2. **Backend changes are allowed when a feature needs them.** Prefer an existing use case; when none fits, change `src/` (domain, contracts, application, infra, server, document) and `drizzle/` by the rules in `CLAUDE.md`: the layers in `.dependency-cruiser.cjs`, a new use case in `USE_CASES` with its colocated test, schema changes through `pnpm db:generate` (never edit a committed migration), a grants migration for any new column the worker reads, and a new ADR (never an edited one) for a decision. The classic UI at `/klasicke` runs on the same use cases, so a backend change must keep it working.
3. **No slanted edges or rotated elements. No gradients, no cards with a coloured left border, no emoji.**
4. **Copy is Czech** (live in the screen files; the sentences shared with the server, such as failures, sign-in and downloads, are in `src/ui/copy`). No em dashes, no all-caps labels, no middle dots, no eyebrow labels. Sentences that address a person avoid gendered forms where they can. Address the reader formally, with a capital: Vy, Vás, Vám, Váš, Vaše. Use ` ` for non-breaking spaces (see the hint „v Národním muzeu“ in `write.tsx`).
5. **Real porada documents in `/work/ssps/porady` hold real names.** Never copy content or names from them into the repo; use fictional samples.
6. **Every UI change**: check 375 px and desktop for horizontal overflow, and keep labels accessible. The e2e tests in `test/e2e/arch.spec.ts` find controls by role and name (for example `getByRole('button', { name: 'Nová akce' })`, `getByLabel('Den', { exact: true })`), so renaming a label breaks them.
7. Only the headmaster sees management screens; there are two roles in the user's eyes (headmaster and everyone else), plus the reviewer for Ke kontrole.

## 7. Verify

Gate (repo root, from `CLAUDE.md`):

```
pnpm -s typecheck && pnpm -s lint && pnpm -s lint:arch && pnpm -s lint:unused && pnpm -s lint:chars && pnpm -s lint:palette && pnpm -s format:check && pnpm -s test:all
```

Arch e2e (needs dev services up, `pnpm build:node` done first):

```
E2E_PORT=3120 DATABASE_URL=postgres://autoporada:autoporada@localhost:15432/autoporada E2E_DATABASE_URL=postgres://autoporada:autoporada@localhost:15432/autoporada_e2e pnpm -s exec playwright test test/e2e/arch.spec.ts --project=desktop --project=mobile
```

Visual: run `responsive-shots <url> [outdir]`, read the PNGs, and compare against the prototype at the same size.

## 8. Known inconsistencies in the code

- The document sheet uses `text-transform:uppercase` (`.arch .s`, `.bl .h`) because the printed porada does; interface labels must not.
- `.slot` and `.chk-it` use dashed or full borders in gold, not a coloured left border.
- `.btn.off` is defined in both `base.css` (`#8A8BA3`) and `app.css` (`#6A6B84`); the later one wins.
