# Autoporada

Autoporada is a web application that assembles the weekly management meeting
document **„Porada vedení školy“** of Smíchovská střední (ssps.cz).

Students and staff sign in with their school Microsoft 365 account. Approved
contributors file structured points, which reviewers approve or return. The
headmaster then edits the standing parts and generates the document. It is a
DOCX that matches the original template exactly, plus a PDF.

> Status: early development (milestone M4 — sign-in).

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
pnpm dev:services
cp .env.example .env
DATABASE_URL=postgres://autoporada:autoporada@localhost:5432/autoporada pnpm db:migrate
pnpm dev
```

At http://localhost:3000 the sign-in goes to a development login page with
fixed personas ([docker/dev/mock-oauth2.json](docker/dev/mock-oauth2.json)):
a teacher, a student, a guest, an account from another tenant and more.
„Ředitel“ is the `BOOTSTRAP_HEADMASTER_OID` of `.env.example`, so the first
sign-in as that persona becomes the headmaster.

## Licence

[MIT](LICENSE)
