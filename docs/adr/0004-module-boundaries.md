# 0004 — Layered modules with enforced dependency rules

## Context

The project must not turn into spaghetti. The core rules — Czech grammar,
date windows, state machines, document composition — have to be testable
without a browser, a database or Next.js.

## Decision

Folders under `src/` are layers. dependency-cruiser enforces them in CI.

| Layer | May import |
|---|---|
| `domain/` | only `domain/` (pure TypeScript) |
| `snapshot/` | `domain/`, zod |
| `document/` | `domain/`, `snapshot/`; `docx` only inside `render-docx/`, React only inside `render-html/` |
| `contracts/`, `notify/` | `domain/`, zod |
| `application/` | `domain/`, `snapshot/`, `document/`, `contracts/`, `notify/`, zod, and its own `ports/`; no Node core, no I/O libraries |
| `infra/` | implements ports; never `app/`, `ui/`, `server/` or use cases |
| `server/`, `worker/`, `cli/` | delivery and composition; only `server/container.ts`, `worker/main.ts` and `cli/main.ts` import `infra/` |
| `app/` | `server/`, `ui/`, `contracts/` |
| `ui/` | `ui/`, `contracts/`, `domain/`, `document/` (never the DOCX renderer) |

Further rules:

- Modules import each other only through their `index.ts`. A module is a
  folder under a layer (`domain/cs/`, `ui/features/<feature>/`); `snapshot/`,
  `contracts/` and `notify/` are one module each.
- `.tsx` files (JSX) exist only in `app/`, `ui/` and `document/render-html/`.
- No circular imports anywhere.
- ESLint limits files to 300 lines.
- `process.env` may be read only in `infra/config`.
- Hex colours may appear only in `ui/theme`.

## Consequences

- Adding a dependency across layers takes a deliberate config change, which
  makes it visible in review.
- Tests are entry points, so test-only modules do not trip the orphan check.
