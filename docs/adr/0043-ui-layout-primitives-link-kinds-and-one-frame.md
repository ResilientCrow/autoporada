# 0043 — UI layout primitives, link kinds and one frame

Supersedes ADR 0012 in part: item 4 (the `kit/` module's list), item 6 (links)
and item 9 (the header). The rest of 0012 stands.

## Context

Screens had no shared rhythm. Sixteen features wrote their own
`mt-4 space-y-8`, others put cards side by side with no gap, and `space-y`
does nothing to an inline link, so „Přesunout poradu“ sat glued to the next
card. `Form` stretched a bare submit button to the full width. Headings were
sized by hand (`text-xl`, `text-lg`, `font-semibold`, nothing). Links were
styled ad hoc: a base underline, `font-bold` in twelve places, back links that
point forward and sit at the bottom. The header followed the page width, so
eleven nav items wrapped into two or three rows at 768 px.

## Decision

1. **Kit and form own spacing, type size, weight, borders, backgrounds and
   link decoration.** Features and app pages compose kit and form primitives
   and write layout utilities only (`flex`, `grid`, `items-*`, `w-full`,
   `hidden`, and the like). `lint:palette` enforces this and ESLint bans
   `next/link` outside kit, form and shell. Both land after the screens have
   moved over.
2. **A fixed spacing scale and rhythm.** 4, 8, 12, 16, 24 and 32 px, all
   Tailwind defaults:
   - 4 px inside one field;
   - 8 px inside one item;
   - 12 px from a heading to its content;
   - 16 px between blocks of a section, and between fields of a `FieldGroup`;
   - 24 px between fields of a form;
   - 32 px between the top-level blocks of a page.

   Stacks use flex `gap`, never `space-y`, so a bare link is spaced as well.
   A page feature returns a fragment, and the shell's stack spaces its blocks.
   The primitives are `Stack`, `Cluster`, `Columns`, `PageHeader`, `Section`,
   `Card`, `ItemList` and `Item`, `Meta`, `BulletList`, `FactList` and
   `Disclosure`.
3. **Link kinds, each a kit component:** `TextLink` (in a sentence),
   `InPageLink` (a hash), `ItemLink` (the title of a row), `ArrowLink` (the
   next step), `BackLink` (above the H1, only through `PageHeader`),
   `DownloadLink`, `ButtonLink` (a link that looks like a button), and the
   shell's `NavLink`. Every kind but the nav link keeps its underline, so a
   link never relies on colour. Sign-in and external links stay plain `<a>`
   (ADR 0012 item 6). A back link says „Zpět“ with an arrow that points back.
4. **One frame.** Header, `main` and footer share the `frame` utility: the
   same left edge and a 72 rem maximum. `Shell width` limits only the content
   column (48 rem for text, the whole frame when wide).
5. **The header** has a brand row (name and sign-out on the right from `lg`)
   and, from `lg`, a navigation row. Below `lg` the navigation, name and
   sign-out sit in a native `<details>` menu: no JavaScript, and a `key` on
   the current page closes it on each page. The header stays static
   (ADR 0012 item 9). Only one of the two navigations is displayed at a time.
6. **Card or Section.** A Card is a self-contained panel: a summary, or a form
   that saves on its own. A Section is a heading on the page, for lists of
   items, reading content and editors. A Card never sits in a Card. Headings
   are `text-xl` for sections, `text-lg` in a card, `text-base` for
   sub-headings, set by the base layer and the kit.

## Consequences

- The spacing of a page lives in four places (shell, Section, Card, Form),
  not in every feature.
- A feature that wants a space the scale lacks changes the kit, not its own
  classes.
- No new `ui/` module and no change to the dependency-cruiser rules: the
  primitives live in `kit`, the field pieces in `form`.
- The gallery shows each primitive, which gives knip its consumer.

## Options rejected

- **Utility classes in features, checked by review.** Sixteen features already
  disagree; a rule that nothing runs does not hold.
- **`space-y` in the shell.** It cannot space an inline link, and it spaces
  absolutely positioned children.
- **A JavaScript menu.** The native disclosure works without script and needs
  no focus handling of our own.
