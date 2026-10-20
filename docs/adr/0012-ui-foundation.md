# 0012 — UI foundation: brand-only Tailwind, audited React Aria, no inline styles

## Context

M5 builds the look every later screen reuses. Four things constrain it:

- **The colour manual** (plan §1, §8): seven web colours, blue leads,
  #F5B800 is a rare accent, the print blue #004D8C never appears on the web.
- **The nonce CSP** (plan §4): scripts and styles run only with the
  response's nonce. A `style="…"` attribute in server HTML is refused, and
  React does not repair it on hydration.
- **WCAG 2.2 AA, Czech, mobile first** (plan §8), with axe on every screen.
- **The layers of ADR 0004**: `ui/` may not reach the server, and modules
  talk through their `index.ts`.

An audit of React Aria Components 1.22 found:

- Checkbox, Radio, Switch, Select, the date fields and Calendar render
  `style="…"` attributes on the server.
- Every pressable inserts a `<style>` element at run time, which needs a
  nonce.
- The package has no `"use client"` directives.

Tailwind 4 still generates arbitrary values such as `bg-[red]` after its
palette is reset.

## Decision

1. **Brand-only styling.** One stylesheet, `src/ui/theme/theme.css`, imported
   only through `ui/theme/index.ts` by the root layout and `global-error`:
   - Tailwind's colour, font, radius and shadow namespaces are reset to the
     manual's seven colours, two font stacks and one 4 px radius.
   - Source detection is explicit (`source(none)`).
   - *Surfaces* set background, text, heading, link and focus colours
     together, so links and focus rings pass contrast on navy by
     construction.
2. **Palette rules** (`lint:palette`), as typed pure functions:
   - Hex colours only from the manual and only in `ui/theme`; #004D8C nowhere.
   - No colour functions, arbitrary values or arbitrary properties.
   - No class names of the removed palette.
   - The accent only as a `StatusChip` background.
   - No removed focus outline; SVG paint only `currentColor`.
   - CSS files only in `ui/theme` and the paper preview.
3. **Fonts.**
   - Mona Sans and Bitter (variable, weight axis) come from Fontsource CSS
     imported by the theme, with `unicode-range` subsets; Czech pages fetch
     latin and latin-ext.
   - Tinos arrives with the first rendered paper preview, imported through
     its weight files (400, 700 and their italics; the per-subset files
     carry no `unicode-range`), never from `document/`.
4. **`ui/` modules**, fenced by dependency-cruiser:

   | Module | Job | May import inside `ui/` |
   |---|---|---|
   | `theme/` | the stylesheet | nothing |
   | `copy/` | the Czech catalogue | nothing |
   | `kit/` | primitives (Button, SlantLabel, StatusChip, Card, ArrowLink, Notice) | nothing; text arrives as props |
   | `form/` | React Aria fields and the error summary | kit, copy |
   | `shell/` | the page frame and the navigation | kit, copy |
   | `status/` | domain status → tone and label maps (reserved) | kit, copy |
   | `features/<f>/` | one screen's body | kit, form, status, copy; never theme, shell or another feature |

   - A new `ui/` module changes the `ui-known-modules` rule and needs an
     ADR.
   - `status/` is created when the first screen maps a domain status; features
     never map statuses themselves.
5. **React Aria only where audited.** It is imported only by `kit/` and
   `form/`, and only through subpaths whose server HTML has no `style=`
   attribute: Button, Form, TextField and I18nProvider. Widening the list
   repeats that audit. Files that import it start with `'use client'`.
6. **Kit owns the look.**
   - Components take no `className`.
   - Native pseudo-classes come first; React Aria's `data-*` states are used
     only where no native signal exists.
   - `Button` is React Aria's.
   - Links that start a sign-in (`/auth/*`) are plain `<a>` elements, never
     prefetched; links to pages use `next/link` without prefetch.
7. **CSP.**
   - The policy spells out `script-src-attr 'none'` and
     `style-src-attr 'none'`.
   - A `csp-nonce` meta element carries the response nonce for the
     `<style>` React Aria inserts at run time. It keeps its first value, so
     a later server render cannot swap it.
   - A spike verified it end to end: hoisted into `<head>`, the nonce hidden
     from the DOM, and no violation after navigation and refresh.
   - Server HTML has no `style` attribute. ESLint bans `style` props,
     `dangerouslySetInnerHTML`, `next/image`, `next/script` and `next/font`.
   - A component that needs server-rendered style attributes needs a new
     ADR that changes the policy, its test and the allowed-style list
     together. No mechanism is chosen in advance.
8. **Forms (principles).**
   - React Aria fields validate in `aria` mode, so the server contract is the
     only validator.
   - A field's `FieldIssues` path is its input name and its key in one
     `FormSpec`, which holds the label and messages once. Field ids carry the
     form id.
   - Never a function `<form action>`: React resets the fields after it and
     renders an inline script. The `Form` API has no `action`.
   - One error summary at the top of the form, focused after a failed
     submit, never on mount; its links name the field.
   - How a form calls a server action and maps its result is designed in M6
     with the first real form.
9. **Shell.**
   - Each page renders the shell from its own viewer lookup; layouts hold no
     viewer data, because they persist across client navigation.
   - The header is static.
   - Navigation entries carry a policy check and show only when `can()`
     passes. Only implemented routes are listed.
10. **Copy.**
    - One `cs` object, assembled from one file per area; client components
      import only the area objects they need.
    - Every string passes `typographizeText` from `domain/cs`, plus the
      no-break spaces it does not cover (legal references, numbers with
      units, postal codes).
    - The privacy notice is typed data whose unconfirmed facts show a
      visible review flag until it is approved.
11. **Verification.**
    - Every component's server HTML is checked for inline styles, scripts and
      handlers.
    - Every end-to-end test fails on a CSP violation, in both Playwright
      projects.
    - axe runs on every screen (WCAG 2.0–2.2 A/AA plus best practice, no
      exclusions, incomplete contrast fails).
    - Contrast is tested from the stylesheet.
    - What no real screen shows is shown on `/vzornik`, a gallery page that
      exists in development and test only (404 in production).
    - Every kit and form export has a real consumer, so knip still reports
      dead ones.

## Consequences

- The brand cannot drift silently, and every component runs in a real
  browser under the real CSP. No test-only DOM library is needed.
- Fonts load without preload or metric-matched fallbacks: text flashes in a
  system font first. `next/font/local` is the switch if layout shift is
  measured as a problem; it stays inside `ui/theme`.
- Submitting a form needs JavaScript, because actions take plain objects
  (ADR 0011).
- The gallery route exists in the production build and answers 404 there.
- Checkbox, Select and the date pickers stay unused until an ADR decides how
  their style attributes meet the CSP.
