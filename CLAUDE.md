# Autoporada

Weekly management-meeting ("Porada vedení školy") app for a Czech school: Czech UI, generates the DOCX. Stack: Next.js 16, React 19, TypeScript strict, Zod 4, Drizzle on PostgreSQL 18, pg-boss 12, Vitest, Playwright. This Next.js has breaking changes: read `node_modules/next/dist/docs/` before writing Next code.

## Commands (pnpm)

- `pnpm dev:services` starts Postgres, Mailpit, mock IdP, Gotenberg (compose.dev.yaml); `dev:services:down` stops them.
- `pnpm dev` (web), `pnpm dev:worker` (worker), `pnpm db:migrate` (= `pnpm cli migrate`), `pnpm dev:seed` (dev accounts Ředitel and Učitelka, see README), `pnpm cli <command>` (reads `.env`); `pnpm cli jobs:run <job> [key]` queues one cron job now (an unknown name prints the jobs).
- `pnpm build`; `pnpm build:node` bundles `dist/worker.mjs` (and the CLI) with esbuild.

## Gate before calling work done

```
pnpm -s typecheck && pnpm -s lint && pnpm -s lint:arch && pnpm -s lint:unused && pnpm -s lint:chars && pnpm -s lint:palette && pnpm -s format:check && pnpm -s test:all
```

Then, when the change warrants it:

- `pnpm test:e2e`: needs dev services up and port 3100 free. Its global setup runs `dist/worker.mjs`, which must not be older than `src/`, so run `pnpm build:node` first. Never run it together with `check-deploy.sh`.
- `pnpm test:render` needs `dev:services` (Gotenberg, poppler-utils); not part of the gate.
- Docker checks: build the web, worker and tools images as `:check` (commands in the header of `scripts/check-deploy.sh`), then `pnpm -s lint:compose`, `scripts/check-web-image.sh autoporada-web:check` and `scripts/check-deploy.sh` (needs ports 80 and 443).

## Layers (enforced by `.dependency-cruiser.cjs`; changing a rule means updating ADR 0004)

`src/`: `domain` (pure, imports only domain; `report` and `people` hold points and the people memory) <- `snapshot`, `contracts`, `notify` (zod + domain only) <- `document` (compose, model, render-docx, render-html) <- `application` (core, ports, use-cases, jobs, notifications; no I/O) <- `infra` (implements ports; a leaf). Edges and composition roots: `server` (container.ts binds infra), `app` (thin routes, reach server only via `actions|routes|pages/index.ts`), `ui` (theme, copy, kit, form, shell, status, features; fixed set, ADR 0012), `worker/main.ts`, `cli/main.ts`. `infra/directory` is the school people search (a port with `off`, `dev` and `graph` adapters).

- Cross-module imports go through `index.ts` only.
- Only infra imports drizzle, pg, pg-boss, openid-client, jose; only `infra/mail/smtp.ts` imports nodemailer (`nodemailer-only-in-smtp`).
- `web-never-sends-mail`: server/app never reach infra/mail, infra/worker, application/jobs or nodemailer, even transitively. The web only enqueues.
- `worker-isolated`: worker never imports server, app or ui.
- `use-cases-not-into-jobs`: use cases enqueue via application/notifications, never import application/jobs.
- `src/instrumentation-client.ts` imports only zod (it sets zod jitless before hydration; ADR 0023, `instrumentation-client-is-light`).
- `docx` only in `document/render-docx`; React Aria only in `ui/kit` and `ui/form`; TipTap/ProseMirror only in `ui/form/rich-text/{editor,indent,paste}.ts`, and `./editor` only by dynamic import (ADR 0031); `.tsx` only in app, ui and `document/render-html`.
- No circular imports, no orphans, no `test/` imports from `src/`.

## Conventions

- Two test worlds: Vitest `unit` runs against in-memory fakes (`provide: world=fake`), `integration` runs the same suites against PostgreSQL (`world=pg`, a database per test file). Port contracts live in `test/contract` and run in both worlds; helpers in `test/support/world`.
- Every use case is in `USE_CASES` (`use-cases/index.ts`) and its folder's `index.ts`, with a colocated `.test.ts` (`test/arch/inventory.test.ts`). An export with no consumer fails knip, so land it with its first user.
- Autosaving editors: `points.create`, `points.save`, `future.create` and `future.save` are the only actions with `refresh: 'none'` (default `'page'`; the inventory pins the set, ADR 0017). `points.save`, `points.status` and `future.save`/`future.get` use the `autosave` rate limit (120 a minute per user); create, submit, retract and withdraw use `submission`, decisions and reviewer edits use `admin`. An approved akce never autosaves: it changes only through `future.save` with intent `revise` („Uložit změny“). The autosave machine, `NoteField` and the refusal pieces live in `ui/form`.
- `DIRECTORY=off` (default), `dev` (with `DIRECTORY_DEV_PATH`, e.g. `docker/dev/directory.json`) or `graph` (the web's own Entra registration, ADR 0021) switches the people search; `dev` is refused in production, and production stays `off` until SMOKE-TEST step 29 has run on the tenant. The people memory is the author's own points, with no table of its own.
- Timed jobs are the `CRON` entries in `application/jobs/cron.ts` (mail prune, report prompt, deadline reminders, late event reports (`reports.late`)); the reviewer digest, the headmaster summaries and the moved notice are switched off but keep their handlers (ADR 0037). A handler reconciles to the clock and the data, never to the tick, and the mail ledger key makes a rerun send nothing; the worker reads business tables only through narrow column grants (a new column it reads needs a grants migration; 0030 and 0035 added `settings(key, value)` and the late-report dates). The worker has no grants on `registry_*` or `issue_items`.
- The deadline is a rule in `settings` (ADR 0032), counted back from the free `meeting_date`, not the slot (`issues.monday`, ADR 0034). Any code that writes an issue row first reads the rule under `settings.lock` (share lock; the deadline save takes the update lock). Registry rows hold no person ids (ADR 0033).
- Audit meta and logs never carry text people wrote (`test/arch/audit-meta.test.ts` scans `src/application`). Point bounds live in `domain/report/limits.ts` and feed Zod, the UI counters and the CHECK numbers.
- Errors and logs carry codes, never messages, addresses, subjects or provider text (ADR 0015, 0016); a database constraint outside `KNOWN_CONSTRAINTS` fails as `db.constraint.<name>` (ADR 0022).
- Czech UI copy lives in `src/ui/copy`. `lint:chars` forbids raw invisible or look-alike characters in `src`, `test/support`, `scripts`: write NBSP as `\u00a0`.
- Migrations: edit the Drizzle schema, run `pnpm db:generate`, never edit a committed migration.
- Commits: one per feature or fix, Conventional Commits, no AI or Co-Authored-By trailers. Run the gate first.
- The template `.docx` is never committed (only `test/fixtures/template/format-facts.json`, from `pnpm facts:extract <template.docx>`).
- Untracked `AGENTS.md` is rewritten by `next dev`; keep it uncommitted.

## Where to look

- `docs/plan.md`: plan of record; milestones and commit plan in section 10.
- `docs/adr/`: decisions (index in README). An ADR is never edited; add one that supersedes it.
- `docs/features.md`, `docs/glossary.md`: product behavior and terms.
- `deploy/SMOKE-TEST.md`, `docs/ENTRA-SETUP.md`: deploy and tenant setup. `docs/gdpr/privacy-review.md`: GDPR review.
