# Features

This list is the scope of v1. A feature that is not listed here is not built
in v1 unless the [plan of record](plan.md) changes first.

## v1

### Access

- Sign-in with the school Microsoft 365 account (single-tenant Entra ID, OIDC).
  The app stores no passwords.
- Allow-list with access requests. Users who are not approved see
  „Požádat o přístup“, and the headmaster decides each request.
- The requester gets an e-mail when the request is approved, rejected or
  blocked, and a user gets one when access is granted by hand.
- After a rejection the person can ask again 30 days later. A blocked request
  is final, but the headmaster can still grant access by hand.
- Roles: submitter, reviewer, headmaster. A student flag limits students to
  the submitter role.
- The headmaster finds people in the users list by name or e-mail. A
  headmaster cannot change their own role, type or account status; a sole
  headmaster first promotes a deputy.
- Re-authentication (step-up) for changes to users' roles, types and account
  status, and for „Nový školní rok“.
- „Odhlásit všude“, which revokes all of a user's sessions.

### Submitting

- Report points for INFORMACE Z PROVOZU ŠKOLY:
  - structured fields that produce a pre-written opening sentence;
  - admin-defined point types with labelled bullets;
  - at least one participant list and one vyjádření, both mandatory;
  - a live document preview.
- People picker that searches the M365 directory (when the search is switched
  on; production starts with it off) and offers the people from the author's
  own earlier points, with their salutation, class and genitive form. Nothing
  is shared between authors. A list of people can be pasted. Class codes are
  saved in the school's form ("1. a" becomes "1.A").
- Genitive suggestion with a confidence indicator. The submitter can correct it.
- Future items (jednání / akce). They are placed into points 1 and 2 and the
  last PROVOZ point by date. After the event, the author is asked to write the
  report.
- Proposals for HOSPODAŘENÍ items and for extra POKYNY points.
- Autosave with conflict detection, a status timeline, „Stáhnout“ (back to a
  draft) and „Zrušit bod“. A late hand-in goes to the next meeting whose
  deadline is still ahead, and the editor says which one.

### Reviewing

- A queue grouped by section. Reviewers approve, edit, return (a note is
  required) or reject. A reviewer cannot approve their own point.
- A reviewer sees a colleague's point only after the author handed it in; a
  draft stays private. A returned point stays visible to reviewers.
- A reviewer's edit keeps the original wording of the changed fields in the
  point's timeline („Původní znění“).
- E-mail notifications to authors (a point returned, approved or rejected; none
  when the author decided their own point) and digests to reviewers.

### Weekly issue

- One issue per Monday with a configurable deadline. Submissions after the
  deadline go to the next issue.
- Deadline reminders by e-mail.
- Přítomni and Hosté, prefilled from the last issue.
- A POKYNY outline editor with carry-over. Each item is standing or one-time,
  items can be reordered, and the text is restricted rich text with three
  indent levels.
- Ohlasy v médiích and ohlasy sociálních partnerů (headmaster only).
- Příloha 2, optional free-form content.
- Student registry: Příloha 1 and point-4 lists, sorted by class, with new
  students in bold. Supports bulk paste and „Nový školní rok“.
- Full preview and a preflight check before generating.
- Generation: a DOCX in the exact template look, plus a PDF. Every version is
  archived, and an issue can be reopened and regenerated.
- „Porada se nekoná“ (skip a week) and a shifted meeting day for holidays.

### Operations

- Docker compose deployment: Caddy, web, worker, Postgres, Gotenberg, backups.
- Encrypted nightly backups. Each one is restore-verified, then copied off the
  server.
- Retention jobs:
  - drafts and requests are purged at the end of the school year;
  - the audit log is kept 3 years.
- Health endpoint, a daily ops check, and alert e-mails to the IT contact.
- A break-glass CLI: generate, revoke sessions, set role, render a snapshot,
  and handle data-subject requests.
- CLI commands for the queue: `jobs:status` lists jobs and the dead-letter
  queue, `jobs:redrive` replays dead jobs, and `mail:test` sends a test e-mail
  to a reviewer or headmaster.
- Privacy notice page.

## Deferred (later)

- Entra group claims for roles; a second approver.
- In-app notification feed; attendance checkboxes for Přítomni.
- Data-subject-request UI (v1 has the CLI only).
- Photos in points.
- An importer for legacy `.doc` / `.docx` poradas.
- An ICS calendar feed of future items; statistics.
- PDF/A output; Trusted Types; Postgres row-level security.
