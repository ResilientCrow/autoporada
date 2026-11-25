# Autoporada

Autoporada is a web application for Smíchovská střední (ssps.cz). It collects
what teachers, students and the school management want to say at the weekly
management meeting, lets the management check it, and turns it into the meeting
document **„Porada vedení školy“** as a Word file (DOCX) and a PDF.

Before Autoporada, one person gathered the contributions by e-mail and typed
the document by hand every week. The app replaces that with one place where
everybody writes their own part, and a button that produces the finished
document in the school's layout.

The user interface is in Czech. The documentation and the code are in English.

> **Status, November 2026.** The application is built and tested end to end
> against local stand-ins for Microsoft 365. It has not been installed on the
> school server yet: the first installation
> ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)) and the recommended test against the
> real school tenant ([deploy/SMOKE-TEST.md](deploy/SMOKE-TEST.md)) are still to
> be done. What is not built is listed under [Status in detail](#status-in-detail).

## Contents

- [What it does](#what-it-does)
- [Who uses it](#who-uses-it)
- [What it is made of](#what-it-is-made-of)
- [Status in detail](#status-in-detail)
- [Documentation](#documentation)
- [Running it at the school](#running-it-at-the-school)
- [Development](#development)
- [Licence](#licence)

## What it does

A **porada** is one weekly meeting and the document made for it. Each week
goes like this:

1. **People sign in** with their school Microsoft 365 account. The app has no
   passwords of its own. Somebody who signs in for the first time has no
   rights: they ask for access on the first screen and the headmaster decides.
2. **They write.** A person with access writes a **zpráva** (a point for the
   meeting, called a *point* in the code), or announces something that is
   coming: an **akce** (an event, such as a trip or a competition) or a
   **jednání** (a meeting with somebody). Work in progress is saved
   automatically and stays private until its author hands it in.
3. **The management checks.** A member of the management reads what was handed
   in and approves it, returns it with a note, or refuses it. The author of a
   point gets an e-mail about the decision.
4. **After an akce, its author owes a report.** The app asks for it by e-mail
   and it goes into the porada that follows the akce.
5. **Contributions close at a deadline** counted back from the meeting date
   (the headmaster sets the rule). The app sends reminder e-mails before it.
6. **The headmaster prepares the porada**: who is present, the guests, the
   instructions (pokyny), the annexes, and a look at the preview.
7. **The headmaster generates the document.** The app stores the DOCX, makes a
   PDF from it and puts both in the archive, where the management can download
   them. A generated porada cannot be changed any more.

[docs/features.md](docs/features.md) describes every rule in detail and
[docs/glossary.md](docs/glossary.md) explains the Czech terms.

## Who uses it

Every user has exactly one role. The headmaster assigns it on the users screen.

| Name in the app | Name in the code | What the person can do |
|---|---|---|
| „Bez přístupu“ | `pending` | Sign in and ask for access. Nothing else. |
| „Píše zprávy“ | `submitter` | Write points, announce akce and jednání, write the reports from their own akce. Sees only their own drafts. |
| „Vedení“ | `reviewer` | All of the above, plus: read what others handed in, approve, return or refuse it, see the preview of the porada, read and download the archive. |
| „Ředitel“ | `headmaster` | All of the above, plus: prepare and generate the porada, change the calendar and the deadline, decide access requests, manage users and their roles, edit the school lists. |

Two more rules:

- A **student** account can only be „Píše zprávy“ or „Bez přístupu“, and never
  sees the archive or the school lists.
- There is always at least one active headmaster. The database refuses a
  change that would leave none.

## What it is made of

In production the app runs on one Linux server as a set of containers, started
by Docker Compose from [deploy/compose.yaml](deploy/compose.yaml). Six of them
stay up; the seventh (`migrate`) runs at every start and exits:

```
                      the school server
 browser ──HTTPS──▶ caddy ──▶ web ──▶ postgres ◀── worker
                               │                     │
                               │                     ├──▶ gotenberg (DOCX → PDF)
                               ├──▶ gotenberg-import │
                               ▼                     ▼
                  Microsoft Entra ID (sign-in)   Microsoft Graph
                  Microsoft Graph (people search)   (sends e-mail)
```

| Container | What it does |
|---|---|
| `caddy` | The only door from the internet: HTTPS on ports 80 and 443, with a certificate it gets and renews itself (Let's Encrypt). |
| `web` | The application the browser talks to (Next.js). Signs people in through Microsoft Entra ID. Never sends e-mail. |
| `worker` | Background jobs: sends the e-mails through one shared mailbox, runs the timed reminders, turns each generated DOCX into a PDF. |
| `postgres` | The database (PostgreSQL 18). **All data lives here**, including the generated DOCX and PDF files. |
| `gotenberg` | Converts DOCX to PDF for the worker. No access to the internet. |
| `gotenberg-import` | A second, locked-down converter used only when somebody imports an old `.doc` file into an annex. |
| `migrate` | Runs once at every start and brings the database structure up to date, then exits. |

The source code is TypeScript: Next.js 16 and React 19 for the web, Zod for
validation, Drizzle on PostgreSQL 18, pg-boss for the job queue, the `docx`
library for the document.

## Status in detail

Built and covered by automated tests:

- sign-in with a school account, access requests, roles, blocking a user;
- points, akce and jednání with review (approve, return, refuse, withdraw);
- reports from akce, including what happens when a report does not arrive;
- the calendar of poradas (move, drop, add) and the deadline rule;
- the headmaster's preparation of a porada, the preview, annexes (also
  imported from .docx, .odt, .pdf and .doc files);
- generation of the DOCX and the PDF, the archive and the downloads;
- e-mails: decisions about access and about points, the request for a report,
  deadline reminders, reminders of late reports;
- the production stack in `deploy/` with its installation script.

**Not built.** Each of these has a manual replacement in
[docs/OPERATIONS.md](docs/OPERATIONS.md):

- **Automatic backups.** Nothing backs the database up until school IT
  schedules the backup command from the operations guide.
- **Alerts.** The app does not e-mail anybody when a certificate is about to
  expire, the disk fills up or a job fails. Somebody has to look.
- **Automatic deletion of old data.** The retention rules are written in the
  code (`src/domain/retention`), but no job applies them yet. Only the
  delivery log of sent e-mails is pruned.
- **Reopening or regenerating a generated porada.**
- **Maintenance commands for users** (change a role, end sessions, export one
  person's data). These are done in SQL, as the operations guide shows.

## Documentation

| If you are… | Read |
|---|---|
| School IT, installing the app for the first time | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), which leads you through [docs/ENTRA-SETUP.md](docs/ENTRA-SETUP.md) (the Microsoft 365 part) and [deploy/SMOKE-TEST.md](deploy/SMOKE-TEST.md) (the recommended test of a new installation) |
| School IT, keeping it running | [docs/OPERATIONS.md](docs/OPERATIONS.md): backups, restore, updates, certificates, emergencies, troubleshooting |
| Whoever runs the school's Gitea | [docs/GITEA.md](docs/GITEA.md): the runner, the registry token, publishing a release's images |
| Anybody who wants to know what the app does | [docs/features.md](docs/features.md) and [docs/glossary.md](docs/glossary.md) |
| The data protection officer | [docs/gdpr/privacy-review.md](docs/gdpr/privacy-review.md) |
| A developer taking the project over | [Development](#development) below, then [CLAUDE.md](CLAUDE.md) (the rules of the code base on two pages), [docs/plan.md](docs/plan.md) (the original plan; later decisions override it), [docs/adr/README.md](docs/adr/README.md) (every decision and its reason) and [DESIGN.md](DESIGN.md) (the user interface) |

## Running it at the school

Everything school IT needs is in two documents:

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) installs the app on a new server,
  step by step, from an empty Linux machine to the first porada.
- [docs/OPERATIONS.md](docs/OPERATIONS.md) is the runbook for the time after:
  what to check, how to back up and restore, how to update, what to do when
  something breaks.

Neither assumes that the reader knows the app or can ask its developer.

## Development

### What you need

- Node.js 24 (the version is in [.nvmrc](.nvmrc)) and pnpm. `corepack enable`
  installs the pnpm version that `package.json` names.
- Docker with the Compose plugin, for the local services.

No access to the school's Microsoft 365 is needed. Locally, a mock identity
provider stands in for Microsoft Entra ID and Mailpit catches the e-mails.

### First start

```bash
pnpm install
cp .env.example .env
pnpm dev:services   # PostgreSQL, Mailpit, the mock sign-in, two Gotenbergs (Docker)
pnpm db:migrate     # creates the tables and the job queue
pnpm dev:seed       # the two accounts below
pnpm dev            # the web, on http://localhost:3000
```

Open http://localhost:3000 and click „Přihlásit se školním účtem“. The
development login page ([docker/dev/mock-login.html](docker/dev/mock-login.html))
has no passwords; pick one of the two accounts:

| Account | Who | Role | Can |
|---|---|---|---|
| **Ředitel** | Karel Dvořák | `headmaster` („Ředitel“) | review, prepare the porada, generate the document, manage users |
| **Učitelka** | Jana Nováková | `submitter` („Píše zprávy“) | write points and akce |

`pnpm dev:seed` can be run again at any time; it resets only those two roles.
The other people on the login page, folded under „Další testovací osoby“,
belong to the automated tests. Without the seed they land on „Zatím tu nemáte
přístup“.

The **worker** sends the e-mails, runs the timed jobs and makes the PDFs. Run
it in a second terminal:

```bash
pnpm dev:worker
```

Mail goes to Mailpit at http://localhost:8025. `WORKER_POLL_SECONDS` in `.env`
sets how often the worker looks for jobs; the default is 2 seconds.

`pnpm dev:services:down` stops the local services. Their data stays in a
Docker volume.

### Local addresses

| What | Address |
|---|---|
| The app | http://localhost:3000 |
| Mailpit (caught e-mail) | http://localhost:8025 |
| Mock identity provider | http://localhost:8080 |
| PostgreSQL | `localhost:5432`, database, user and password `autoporada` |
| Gotenberg (PDF) and Gotenberg for the `.doc` import | http://localhost:3001 and http://localhost:3002 |

All of them listen on `127.0.0.1` only.

### Checks before a change is done

```bash
pnpm -s typecheck && pnpm -s lint && pnpm -s lint:arch && pnpm -s lint:unused && pnpm -s lint:chars && pnpm -s format:check && pnpm -s test:all
```

`test:all` runs the unit tests, the same suites against a real PostgreSQL
(the local services must be up) and the golden tests of the document.
Further checks, for changes that call for them:

| Command | What it checks | Needs |
|---|---|---|
| `pnpm test:e2e` | The app in a browser (Playwright) | local services, port 3100 free, `pnpm build:node` run first |
| `pnpm test:render` | The DOCX converted to PDF and compared | local services, `poppler-utils` |
| `pnpm -s lint:compose` | The rules of the production stack (networks, hardening) | Docker |
| `scripts/check-deploy.sh` | The whole production stack, started locally with throwaway secrets | Docker, ports 80 and 443 free; see the header of the script |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all of them on
every pull request and on every push to `main`.

### Where things are

| Path | What is there |
|---|---|
| `src/domain` | The rules, with no input or output: review, calendar, Czech grammar, limits |
| `src/application` | Use cases and background jobs, written against ports |
| `src/infra` | The ports' implementations: database, sign-in, mail, people search, PDF conversion |
| `src/document` | The document: its model, the DOCX and the HTML preview |
| `src/server`, `src/app` | The web server: routes and the page shell |
| `src/worker`, `src/cli` | The worker and the maintenance commands |
| `arch/` | The browser client (the screens people see) |
| `drizzle/` | Database migrations, in order. A committed migration is never edited. |
| `test/` | Tests that are not next to their code: contracts, integration, e2e, golden files |
| `deploy/` | The production stack |
| `docker/` | The image definitions and the development stand-ins |
| `docs/` | Documentation and the decision records (`docs/adr`) |

The layers and what may import what are enforced by `pnpm lint:arch`;
[CLAUDE.md](CLAUDE.md) lists the rules.

## Licence

[MIT](LICENSE)
