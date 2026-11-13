# Autoporada

Autoporada is a web application that assembles the weekly management meeting
document **„Porada vedení školy“** of Smíchovská střední (ssps.cz).

Students and staff sign in with their school Microsoft 365 account. Approved
contributors file structured points, which reviewers approve or return. The
headmaster then edits the standing parts and generates the document. It is a
DOCX that matches the original template exactly, plus a PDF.

> Status: in development (milestones M0–M9 done; document generation next).

## Documentation

| Document | Purpose |
|---|---|
| [docs/plan.md](docs/plan.md) | Plan of record: decisions, architecture, data model, milestones |
| [docs/features.md](docs/features.md) | v1 feature list and deferred items |
| [docs/glossary.md](docs/glossary.md) | Czech domain terms used in code |
| [docs/adr/](docs/adr/) | Architecture decision records |
| [docs/ENTRA-SETUP.md](docs/ENTRA-SETUP.md) | What school IT has to configure in Microsoft 365 |

## Development

Node 24 and pnpm, plus Docker for the local services: PostgreSQL, Mailpit, a
stand-in for Microsoft Entra ID and Gotenberg.

```bash
pnpm install
cp .env.example .env
pnpm dev:services   # PostgreSQL, Mailpit, mock sign-in, Gotenberg (Docker)
pnpm db:migrate
pnpm dev:seed       # the two dev accounts below
pnpm dev
```

Open http://localhost:3000 and click „Přihlásit se školním účtem“. The development
login page ([docker/dev/mock-login.html](docker/dev/mock-login.html)) has no
passwords; pick one of the two accounts:

| Account | Who | Can |
|---|---|---|
| **Ředitel** | Karel Dvořák, headmaster | review points, prepare the porada, generate the document, manage users |
| **Učitelka** | Jana Nováková, teacher (role „Přispěvatel“) | file points and akce |

`pnpm dev:seed` makes both ready and can be rerun at any time; it resets only those
two roles. The other personas, folded under „Další testovací osoby“, belong to the
e2e tests; without the seed they land on „Zatím tu nemáte přístup“.

The worker sends the e-mails and runs the scheduled jobs. In another terminal,
with `pnpm dev:services` up and `pnpm db:migrate` done (it also installs
pg-boss), run `pnpm dev:worker`. Mail goes to Mailpit at
http://localhost:8025. `WORKER_POLL_SECONDS` in `.env` sets how often it looks
for jobs; the default is 2.

## Licence

[MIT](LICENSE)
