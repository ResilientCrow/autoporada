# 0001 — TypeScript full stack: Next.js 16, PostgreSQL 18, Drizzle

## Context

The app has a form-heavy UI, an admin panel, a document generator and
scheduled jobs. Volunteers and students at one school will maintain it, so one
language across all of these matters more than squeezing out performance.

## Decision

- **Language:** TypeScript (strict) everywhere: UI, server, worker, CLI.
- **Framework:** Next.js 16 (App Router, React 19) as a thin delivery layer.
  - Build output `standalone`; `cacheComponents` off; every route renders
    dynamically.
  - Business logic lives outside `src/app`.
- **Database:** PostgreSQL 18 with Drizzle ORM. Migrations are SQL files from
  drizzle-kit and are reviewed in pull requests.
- **Validation:** Zod 4 schemas, shared by forms and server actions.
- **UI:** Tailwind CSS 4, with only the brand colours defined, and React Aria
  Components for accessible widgets.
- **TypeScript 6.0:** typescript-eslint does not support TypeScript 7 yet.
  Revisit once it does.

## Consequences

- Every page is personalised. Turning caching off costs little, and a
  nonce-based CSP needs dynamic rendering anyway.
- Drizzle keeps the SQL visible. Constraints and triggers are written by hand
  in migrations where Drizzle cannot express them.
