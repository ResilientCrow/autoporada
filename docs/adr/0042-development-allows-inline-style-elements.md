# 0042 — Development allows inline style elements

Adds to ADR 0012 item 7 (CSP). Production is unchanged.

## Context

The Next.js devtools (the dev indicator, its menu and the error overlay)
insert their `<style>` elements into a shadow root with no nonce. Their
bundle fixes the nonce to none, so nothing in the app can hand it one. Under
`style-src 'self' 'nonce-…'` the browser refuses every one of them. The
indicator then renders as an unstyled grey button in the top left of the
page, its menu as loose text, and the console fills with violations.

## Decision

1. **In development, `style-src` is `'self' 'unsafe-inline'`, without the
   nonce.** Browsers ignore `'unsafe-inline'` next to a nonce, so the nonce
   goes. This is what the Next.js CSP guide does in development.
2. **Everything else stays.** `style-src-attr 'none'` still refuses style
   attributes. `script-src` keeps the nonce and `'strict-dynamic'`, with
   `'unsafe-eval'` for hot reload.
3. **The production policy is unchanged**, and its test still refuses
   `unsafe-inline`.

## Consequences

- The devtools render as Next.js draws them, the error overlay included.
- A `<style>` element without a nonce works in `pnpm dev` and fails in
  production. The end-to-end tests run a production build and fail on any
  CSP violation (ADR 0012 item 11), so they still catch it. The style
  attributes ADR 0012 is about are still refused in development.

## Options rejected

- **`devIndicators: false`.** It hides the indicator, but the error overlay
  would still render unstyled whenever an error is shown.
- **Hashes of the devtools styles.** They change with every Next.js version,
  and some are inserted at run time.
