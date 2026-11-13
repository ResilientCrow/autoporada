# Autoporada — plan of record

> Note, 2026-11-13: the classic Next.js UI (pages, server actions, `src/ui` apart from `ui/copy`) was removed; Arch is the only UI. Page paths, UI libraries and `ui/` layer rules named below describe the plan as written. See [ADR 0065](adr/0065-the-classic-ui-is-removed.md).

## Context

Every Monday the headmaster of Smíchovská střední (ssps.cz) assembles the
"Porada vedení školy" Word document by hand from e-mails sent by students and staff.
It contains:

- POKYNY: organisational instructions;
- HOSPODAŘENÍ: finances;
- INFORMACE Z PROVOZU ŠKOLY: reports on past events;
- upcoming meetings and events;
- appendices with student lists.

Autoporada replaces the e-mails with a web app:

1. Approved submitters file structured points.
2. Reviewers approve them.
3. The headmaster edits the standing parts and generates a DOCX that matches the template exactly, plus a PDF.

Starting point:

- The repo `autoporada` is empty (branch `main`, no commits).
- The formatting references are the blank template (`porada vedení 12. 10. 2026.docx`) and the mandatory colour manual (`Barvy - Smíchov.pdf`).
- The `caveman-commit` skill is installed. Every commit message is written with it.

This plan comes from six interview rounds and a 9-agent design workflow:

- research: an exact DOCX spec from the template, current library and Graph facts, a threat model, and Czech grammar;
- three architecture proposals, each from a different angle;
- a synthesis of those proposals;
- an adversarial critique, whose simplifications are applied here.

## 1. Decisions (plan of record)

| Area | Decision |
|---|---|
| Login | Microsoft 365 SSO only, with a single-tenant Entra app registered by school IT and authenticated by a certificate (`private_key_jwt`). From M8b the web has its own registration (sign-in and directory search) and the mail registration is the worker's (ADR 0021, amending the "single" app of ADR 0003). The app is reachable from the internet on its own subdomain (e.g. `autoporada.ssps.cz`), with Let's Encrypt HTTPS. |
| Access | Anyone in the tenant can sign in. Only allow-listed users can submit; everyone else gets "Požádat o přístup", and the headmaster approves the request and sets the student/staff flag. |
| Roles | `pending` → `submitter` → `reviewer` (approve, edit, return, reject points) → `headmaster` (everything else, plus generating the document). Students can only ever be `submitter`. |
| What submitters may add | Report points (PROVOZ), future items (jednání / akce), HOSPODAŘENÍ items, other POKYNY points. Ohlasy (media and partners) are headmaster-only. |
| Future items | Placed in the document by date (§6). After an event, its author is prompted to write the report. Each line, in the headmaster's format (checkpoint M2): "úterý 13. října 2026, 7.00 až 14.00 hodin, areál Smíchov, Next Zone Event Space, akce Vaib, za Next Zone Event Space koordinuje absolvent pan Jan Absolon". Every part after the date is optional; multi-day items read "neděle 3. května až čtvrtek 14. května 2026" without times. Organizátor, Účastníci and Poznámka are free text printed as typed (ADR 0060, superseding the structured responsible part with its verb, "za …" and people). |
| Standing POKYNY | Carried over from the previous issue. Edited in a restricted rich-text editor (3 indent levels: o / o / ■). Each item is standing or one-time and can be reordered. |
| Report point form | Structured fields (title, date, from–to, areál, room, organisers) produce a pre-written opening sentence in the house style, which the submitter can edit freely. Six point types are fixed in code, each with default labelled bullets (ADR 0064, superseding the admin-defined types). A participant list and at least one vyjádření are mandatory. No photos. |
| Names | A person is title (pan / paní / slečna) + name + class/role. Lists group people by title with plural forms. The 2nd case is suggested and can be corrected. The picker searches the M365 directory; title, class and 2nd case are remembered locally. |
| Weekly cycle | One issue per Monday. Configurable deadline, counted back from the meeting date (default two days before at 20:00: Saturday 20:00 for a Monday meeting, ADR 0032); later submissions go to the next issue, except reports on events that end after the deadline (ADR 0035). E-mail reminders and status notifications. Generating locks the issue, archives it and prepares the next one. Reopening and regenerating keep every version. |
| Which reports go in | Every approved, unpublished report whose event took place before the meeting, oldest first (date, then time). |
| Output | DOCX in the exact current look (black and white, Times New Roman), plus a PDF. Every version is archived; download only. **The reference for the "exact look" is Microsoft Word.** |
| Student lists | One registry of named lists: Příloha 1 (the talent programme) and the point-4 exemptions, with more addable. Sorted by class, then surname. Students added since the last issue are **bold**. "Nový školní rok" resets the lists. |
| Příloha 1 table | Two columns. **Each column starts with the "Jméno a příjmení \| Třída" header. No padding rows.** |
| Příloha 2 | Optional free-form admin content, left out when empty. |
| Go-live content | A **seed** of the template's standing structure (POKYNY headings, standard texts, default lists) with no personal data, all editable in the admin panel. A bulk-paste helper fills the registry. No importer from old files. |
| E-mail | Graph `sendMail` as `autoporada@ssps.cz` through the same Entra app. Mail.Send is scoped to that one mailbox through Exchange RBAC for Applications and is never granted in Entra. Mailpit in development. |
| Hosting | Docker compose on a school-controlled Linux server: Caddy, web, worker, Postgres, Gotenberg and backups. Encrypted backups are copied off the server. |
| Retention | Issues and their approved points are kept forever. Drafts, rejected points and access requests are purged after the school year ends. The audit log is kept 3 years. |
| Web design | The colour manual is mandatory. Blue (Technologické) leads, like ssps.cz. #22232A gives structure; #F5B800 is a rare accent. **Print #004D8C is never used on the web.** Purple and red are unused. Fonts: Mona Sans and Bitter, both self-hosted. |

## 2. Stack

These versions were checked on the web on 2026-10-18.

| Component | Choice | Why |
|---|---|---|
| Runtime | Node 24 LTS, from a pinned image | Full ICU, so `Intl.Collator('cs')` works; pg-boss needs ≥22.12 |
| Framework | **Next.js 16.4** (React 19.3), App Router, `output:'standalone'`, **`cacheComponents` off**, every route dynamic | Thin delivery layer; nonce CSP requires dynamic rendering |
| Language | TypeScript strict (`noUncheckedIndexedAccess`), pnpm pinned | |
| Auth | **openid-client 6.x** + own sessions stored hashed in the DB | Small and certified. Auth.js is frozen, and Better Auth has a long advisory history in the OAuth paths we would use |
| DB | PostgreSQL 18 + **Drizzle** 0.45 (drizzle-kit SQL migrations) | Typed SQL; migrations can be reviewed |
| Jobs | **pg-boss 12** in a separate `worker` container (its own distroless target, ADR 0015), with Europe/Prague cron | No Redis; jobs are enqueued inside the business transaction |
| Validation | Zod 4, with contracts shared by client and server | |
| DOCX / PDF | **docx 9.12** (dolanmiu); **Gotenberg 8** child image with OpenSymbol and Liberation fonts (Times New Roman and Aptos Narrow if licensed) | Covers the format spec; LibreOffice stays isolated |
| Rich text | TipTap 3, restricted schema, stored as JSON (never HTML) | |
| UI | Tailwind 4 `@theme` with `--color-*: initial`, so only brand colours exist; **React Aria Components** | Accessibility, Czech date pickers |
| Fonts | Mona Sans (body) and Bitter (slab headings), Fontsource CSS imported by `ui/theme` (ADR 0012); Tinos (paper preview, metric-compatible with Times New Roman) arrives with the first rendered preview. All self-hosted | OFL-1.1 (all three); works with CSP `font-src 'self'` |
| Logs | pino JSON to stdout, with redaction | |
| Edge | Stock Caddy 2.11 (automatic HTTPS, body size limit); rate limits live in the app | No custom Caddy build |
| Tests | Vitest, fast-check, Playwright + axe, `mock-oauth2-server` (fake IdP), Mailpit | |
| Gates | ESLint, dependency-cruiser (layer rules), knip, palette check, gitleaks, `pnpm audit` (production deps, blocking at high), Renovate | osv-scanner cannot read pnpm 12's multi-document lockfile |

## 3. Architecture

```
 Internet ─:80/:443─▶ caddy ──▶ web (Next.js) ───────────────▶ login.microsoftonline.com
                              │  (internal net)              graph.microsoft.com (search, sendMail)
                              ▼                                   ▲
                          postgres 18 ◀──── worker (pg-boss) ─────┘
                           ▲     ▲             │ (render net, no egress)
                 migrate (1-shot) backup       ▼
                                (age→off-site) gotenberg
```

**Modules.** Dependency rules are enforced by dependency-cruiser in CI.

```
src/
  domain/        pure TS, no framework imports (dependency order top to bottom)
    time/          CalDate, WallTime, Prague zone conversion (Intl only)
    actor/         Role, Actor, role ranking
    cs/            Czech dates, typography, 2nd case, people lists, opening sentence, class sort
    calendar/      targetMonday, deadline, phase, routeFutureItem
    review/        state machines (points, future items, issues, access requests)
    policy/        can(actor, check), deny-by-default; step-up list
    richtext/      pure-TS validator (Zod wrapper lives in contracts/)
    registry/      isNewInIssue, entriesAsOf, carry-over planner
    retention/     what the school-year purge may delete; audit cutoff
  snapshot/      IssueSnapshot v1 Zod contract: the only input to the document engine
  document/      deep module: compose(snapshot) → DocumentModel → renderHtml / renderDocx
    model/ compose/ render-html/ render-docx/{styles,numbering,blocks,table}.ts
  contracts/     Zod input schemas shared by forms and actions
  notify/        pure Czech e-mail templates
  application/   use cases + queries + ports, e.g. MailPort, DirectoryPort, JobPort, Clock
  infra/         adapters: db (Drizzle schema, repos), oidc, graph, mail, gotenberg, pgboss, config, log
  server/        composition root, session, defineAction pipeline
  app/           Next routes with Czech slugs; thin, they call server/actions
  ui/            theme/ copy/ kit/ form/ shell/ features/<feature>/ (status/ reserved) (ADR 0012); editor, paper preview later
  worker/  cli/  other composition roots
```

**Layer rules**

- `domain` imports nothing outside itself.
- `document` imports only `domain` and `snapshot`:
  - `docx` may be used only in `render-docx`;
  - React may be used only in `render-html`.
- `application` never imports Next, Drizzle or infra.
- Only the composition roots import infra: `server/container.ts`, `worker/main.ts` and `cli/main.ts`.
- `ui` never imports server, infra, application or the DOCX renderer. Inside `ui`, modules import one way (ADR 0012); React Aria is used only in `ui/kit` and `ui/form`.
- Across modules, imports go only through `index.ts`. Circular imports are not allowed.

**ESLint rules**

- At most 300 lines per file.
- UI strings live only in `ui/copy` (one `cs` object).
- No `style` props or `dangerouslySetInnerHTML`; no `next/image`, `next/script` or `next/font` (ADR 0012).
- `process.env` is read only in `infra/config`.

**Palette check** (`scripts/check-palette.ts`, rules in `scripts/palette-rules.ts`, CI
`lint:palette`): hex colours only in `ui/theme` and only the manual's, and #004D8C nowhere in `src/`;
outside tests also no colour functions, arbitrary values or properties, default-palette names,
accent except as a `StatusChip` background, outline removal or SVG paint but `currentColor`, and no
stylesheet but `ui/theme/theme.css` and `paper.module.css`.

**Action pipeline.** Every `"use server"` export goes through `defineAction`, in this order:

1. session lookup;
2. input normalisation (NFC; control characters stripped);
3. Zod `.strict()` parsing;
4. `policy.can`;
5. a transaction;
6. the use case, with an optimistic `version` check;
7. audit and job enqueue in the same transaction;
8. a DTO back to the caller.

An inventory test fails the build if any action or route handler is not wrapped.

## 4. Security design (all MUST for v1)

**OIDC sign-in**
- Auth code flow with PKCE S256, plus `state`, `nonce` and `domain_hint=ssps.cz`. The only authority is `https://login.microsoftonline.com/{TENANT}/v2.0`.
- The login transaction lives in a single-use DB row behind a 10-minute `__Host-` cookie.
- ID token checks:
  - signature against the JWKS;
  - exact `iss`, `aud`, `tid`;
  - `exp`/`nbf`;
  - `nonce`.
- Guests are rejected, failing closed: the optional claim `acct` must be present and `0`, and the UPN must not contain `#EXT#` (the `upn` claim is configured with *externally authenticated* so guests get the `#EXT#` form).
- Users are keyed by `(tid, oid)`. E-mail and UPN are for display only.
- `returnTo` must be a same-origin path.

**Sessions**
- A 256-bit random token. The DB stores only its SHA-256.
- Cookie: `__Host-ap_session; Secure; HttpOnly; SameSite=Lax`.
- Idle timeout 4 h, absolute 12 h.
- The role is re-read from the DB on every request.
- A user's sessions are revoked when their role or status changes. "Odhlásit všude" is available, and logout is a POST.

**First headmaster**
- `BOOTSTRAP_HEADMASTER_OID` applies only while no active headmaster exists. It is audited, and the app warns at boot while it is still set.
- A DB trigger keeps at least one active headmaster.

**Step-up re-auth**
- `prompt=login`, with `auth_time` no older than 10 min.
- Required only for writes of user management (`users.manage`) and for "Nový školní rok". Reading the users list and detail uses `users.view` and needs no step-up. Approving an access request does not need it: it only grants the submitter role, and every submission is still reviewed.
- Elsewhere, destructive actions need confirmation. Access and user changes use a confirmation checkbox that the server checks (`confirmed: true`); typed confirmation stays for irreversible bulk actions such as M9's "Nový školní rok".
- Day-to-day MFA comes from the school's Conditional Access.

**Authorization**
- `policy.can` is pure and deny-by-default, with an exhaustive action enum and a generated matrix test.
- Repositories require an `Actor`, which closes IDOR holes.
- Submitters see only their own points and future items, plus approved akce. Students never see the registry or the archive.
- `proxy.ts` only sets the CSP nonce; it is never the security gate. Pages redirect to sign-in through `requireViewer`, and routes and actions check the session themselves.

**Input and output safety**
- Rich text is validated JSON: at most 3 indent levels, bold and italic only, no links, at most 64 KB. It is rendered by components, never through `dangerouslySetInnerHTML`.
- The DOCX is built only through the `docx` API, so user text can never become fields, hyperlinks or external relationships.
- Downloads are `attachment` with `nosniff` and `no-store`.

**CSRF and headers**
- Server Actions use Next's Origin/Host check (Caddy forwards Host). Route handlers require `Origin === APP_ORIGIN` on non-GET requests.
- Headers:
  - nonce-based CSP; inline attributes refused (`script-src-attr` and `style-src-attr 'none'`), and the nonce reaches React Aria through a `csp-nonce` meta (ADR 0012);
  - HSTS;
  - `Referrer-Policy: same-origin`;
  - COOP and CORP;
  - `Permissions-Policy`;
  - `no-store` on authenticated pages.

**Rate limits.** An in-memory limiter, since there is a single web replica:

| Action | Limit |
|---|---|
| `/auth/*` | per IP, loose (the school is behind one NAT address) |
| directory search | 30/min per user |
| submissions | 30/h per user |
| headmaster `admin` writes (deciding requests, changing access) | 600/h per user, an abuse guard a person never reaches |
| access requests | 3/day; the 30-day cooldown after rejection is computed from the database, so it survives restarts |

**Audit log**
- An append-only `audit_event` table; a trigger blocks UPDATE and DELETE for the app role.
- Logged: logins, access decisions, role changes, state transitions, reviewer and headmaster edits (with a diff), POKYNY/registry/settings changes, generations (with SHA-256) and downloads.
- Author autosaves are not logged.

**Secrets**
- Docker secrets: DB passwords, the Entra certificate keys (the web's own, and the mail registration's held by the worker and cli only) and `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- `.env` is validated by Zod in `instrumentation.ts` at boot; a bad value stops the server.
- `APP_ENV` (development / test / production) switches on production hardening. It is separate from `NODE_ENV`, which `next start` always sets to production, and is required whenever `NODE_ENV=production`.
- A Server Actions key given as a Docker secret is copied into `process.env` at boot, because Next.js reads it only from there.
- Four DB roles: `migrator`, `app`, `jobs` and `backup` (ADR 0010, 0015). The login roles are `autoporada_web` (in `app`) and `autoporada_worker` (in `jobs` only). The web can read the queue list, insert jobs and read back their ids; only the worker reads the mail ledger.
- An alert fires 45 days before the certificate expires.

**Graph least privilege** (two registrations from M8b, ADR 0021)
- Web registration, delegated: `openid profile email User.Read`, with no `offline_access` and no stored user tokens.
- Web registration, application: `User.ReadBasic.All` (admin consent) for people search: `$search` with `ConsistencyLevel: eventual`, at least 3 characters, a minimal `$select`, results not cached. If the tenant answers 403 to `$search`, the fallback `User.Read.All` needs a new ADR and an updated privacy review first.
- Mail registration: no API permissions. `Mail.Send` only through the Exchange RBAC management scope on `autoporada@ssps.cz`; the web holds none of its credential.

**Containers**
- Non-root, `read_only`, `cap_drop: ALL`, `no-new-privileges`, pinned digests.
- Internal networks: Gotenberg and Postgres are never exposed.
- The worker is built from its own distroless target and sits on `data` and `egress`, never on `edge`. `egress` allows any host (bridge name `ap-egress`); the school firewall narrows it to `login.microsoftonline.com` and `graph.microsoft.com`. The `edge` network (Caddy and the web) has the bridge name `ap-edge`; the firewall allows the Microsoft hosts for the web and the ACME host for Caddy from it (ADR 0021). There is exactly one worker replica.
- A `cli` maintenance container gives IT a shell for debugging.

**Logs.** pino redacts cookies, tokens, `code` and request bodies. PG errors are logged as code only, actors as UUIDs. The log line of a failure carries its `reqId` and its cause; the page names the cause and shows no id (ADR 0044).

**GDPR** (legal basis Art. 6(1)(e))
- A privacy notice at `/ochrana-osobnich-udaju`.
- A DPIA, a record of processing and the DPO's sign-off before go-live.
- Retention jobs (§9). A data-subject-request CLI (find and export).
- The open-source repo contains only fake fixtures.

## 5. Data model (Drizzle, UUIDv7, `timestamptz`)

**Identity**
- `users(tid, oid, display_name, email, job_title, department, role, is_student, status, notify_prefs)`
  - UNIQUE(tid, oid). CHECK: students only `pending` or `submitter`.
- `access_requests(user_id, reason, state pending|approved|rejected|blocked|cancelled, decided_by, decided_at)`
  - One pending request per user.
- `sessions(token_sha256, user_id, auth_time, idle_expires_at, abs_expires_at)`, `auth_tx`

**People and point types**
- `people(graph_id?, salutation, titles_before, given, family, titles_after, affiliation, affiliation_year, genitive_override, last_used_at)`
  - An affiliation from an earlier school year shows "ověřte třídu".
- Point types are the list `POINT_TYPES` in code (`domain/report`); `points.type_id` holds a key from it (ADR 0064, which dropped the `point_types` table).

**Points**
- `points(kind report|finance|pokyn, author_id, state, version, type_id, title, event_date, end_date, time_from, time_to, campus, place, body jsonb, earliest_monday, published_issue_id?, future_item_id?, review_note, …)`
  - CHECK `(state='published') = (published_issue_id IS NOT NULL)`.
  - `earliest_monday` is set at first submit and kept across returns, which gives deterministic late roll-over.
- `point_bullets`, `point_people` (frozen copy plus `person_id`), `point_statements(speaker_genitive, affiliation, quote)`
- `point_events(point_id, at, actor_id, from_state, to_state, note)`: the user-facing timeline, independent of audit retention.
- `future_items(kind jednani|akce, author_id, state, version, title, start_date, end_date, time_from, time_to, campus, place, report_state none|prompted|written, report_point_id?)` (every approved akce owes a report, ADR 0048)

**Issues and output**
- `issues(monday UNIQUE, meeting_date?, school_year, status open|generated|skipped, deadline_at, present_text, guests_text, annex2 jsonb?, current_version)`
  - `meeting_date` covers holiday shifts (e.g. Tuesday after Easter Monday). The title and closing use it; the date windows use `monday`. (M9, ADR 0034: `meeting_date` is free, `monday` is only the slot key, and the windows follow the meeting date.)
- `issue_items(issue_id, section pokyny|hospodareni, slot, position, lineage_id, title, body jsonb, persistence standing|once, source_point_id?)`
  - `slot` marks system items: meetings, events, talent, exemptions, media, partners.
  - Points 3 and 4 carry editable intro text with a `{skolniRok}` token.
- `registry_lists(key, title, doc_label, purpose annex1|point4, position, active)`
- `registry_entries(list_id, person_id, display_name, class_code, added_at, removed_at, archived_year, first_published_issue_id?)` (M9, ADR 0033: given name, family name and class instead of `person_id` and `display_name`.)
- `generated_documents(issue_id, version, snapshot jsonb, model_hash, renderer_version, template_sha256, docx bytea, docx_sha256, pdf bytea?, pdf_status, generated_by, generated_at)`
  - Insert-only; only the PDF columns can be filled in afterwards.

**Ops:** `audit_event`, `settings(key, value jsonb)` (validated by a Zod registry), pg-boss schema.

**State machines**

Points:
- draft or returned → submitted: author; validation requires at least one participant and one vyjádření for reports.
- submitted → draft ("Stáhnout"): author.
- draft, returned or submitted → withdrawn: author.
- submitted → approved: a reviewer (not on their own point) or the headmaster. An approved finance or pokyn point becomes an `issue_item`.
- submitted or approved (while unpublished) → returned or rejected: reviewer and above; a note is required and the author is notified.
- Reviewer and above may edit submitted or approved points; the diff is audited.
- approved → published: at generation.
- published → approved ("Odebrat z čísla"): only while that issue is reopened.

Future items:
- Reviewed the same way, plus `cancelled`.
- If the author edits an approved item, it goes back to `submitted`.
- After the end date, `report_state` goes none → prompted → written; it cannot be declined (ADR 0048).

Issues:
- open → generated (in order) → reopened while the next issue is not generated → v+1.
- open → skipped ("Porada se nekoná").
- The phase (collecting or review) is derived from `deadline_at`, so the deadline needs no cron job.

## 6. Document engine (de-risked first)

**Pipeline**
1. `assembleIssueSnapshot` (query)
2. `IssueSnapshot.parse`
3. `composeDocument` (pure)
4. `DocumentModel` (a closed set of blocks)
5. `assertModelInvariants`
6. one of:
   - `renderDocx` (server) → bytes + SHA-256;
   - `renderHtml`, for the full preview and the live preview inside the form, which uses the same compose rules.

Each renderer handles every block type exhaustively (a `switch` on `never`), so a new block cannot be added without both renderers.

**Composition rules**
- Order: title, then Přítomni/Hosté, then POKYNY (stored order, system slots included), then HOSPODAŘENÍ (if any), then PROVOZ, then the closing, Příloha 1 and Příloha 2 (if any).
- **Point numbering is continuous** across all three sections ("1).").
- Empty optional parts are left out: HOSPODAŘENÍ, ohlasy, Příloha 2, an empty point-4 list line, and an empty "Další doposud známé akce".

**Routing future items** (approved, not cancelled, M = the meeting date, S = its slot Monday, `slotMondayOf(M)`; ADR 0059)

| Item | Window | Goes to |
|---|---|---|
| jednání | overlaps [M, S+7] | point 1 |
| akce | overlaps [M, S+14] | point 2 |
| akce | starts after S+14 | last PROVOZ point, "Další doposud známé akce školy" |

The headings come from the windows, e.g. "v týdnu od 19. října do 26. října 2026", including cross-month and cross-year cases.

**Which reports go in.** Approved, unpublished, `earliest_monday ≤ M`, and the event ended before M. Sorted by date, then time, then title.

**Report layout.** The body paragraphs, then the labelled bullets ("- účast studentů: …"), then the "- vyjádření pana X (1.A): „…“" lines.

**Exact format** (from the template spec, encoded once in `render-docx/styles.ts` and `numbering.ts`)
- Page: A4, margins 720, footer 113, compatibility mode 11.
- Text: Times New Roman 12 pt, justified, spacing 0/0, `cs-CZ`.
- Heading sizes: title 14 pt bold; section headings 16 pt bold; "PŘÍLOHA n" 18 pt bold.
- Point headings: decimal `%1).`, indent 527/357.
- Bullets: `•` (Symbol ``) for points 1, 2 and the last point. Rich text uses levels "o" (Courier New, bold-italic) / "o" / ■ (Wingdings ``), with the paragraph-mark formatting set per block. Points 3 and 4 use "-" (bold-italic).
- Footer: centred "Stránka PAGE z NUMPAGES".
- Sections:
  1. main body plus the Příloha 1 intro;
  2. continuous, 2 columns (space 708): the table;
  3. next page: Příloha 2, dropped when empty.

**Příloha 1 table**
- Grid 3399 | 961, borders single sz 4, Aptos Narrow 11 pt.
- Students sorted by class, then surname; new students bold in both cells.
- **A header row at the top of each column**, no padding rows.
- Spike commit (M2.8):
  - **First choice:** a repeating header row (`tblHeader`), if both Word and LibreOffice repeat it at column breaks.
  - **Fallback:** per-column chunked tables separated by column breaks. Capacity: 48 rows per column on later pages; on the first page it is computed from the intro's estimated line count with a safety margin, and the headmaster can override it.
  - Render tests assert that every column starts with a header and that no column ends on a header.

**Point 4.** Each list renders as a "-" label followed by the students inline ("Jan Novák (1.A), …"); new students are bold.

**Bold "new" rule.** An entry is new if `first_published_issue_id` is NULL or equals this issue. Generation stamps the NULL entries. When an issue is regenerated, the registry is read as of the previous version's generation time, plus explicit corrections, so changes made for the next issue cannot leak in.

**Typography** is applied at compose time:
- Czech quotes „…“;
- spaced en dashes;
- non-breaking spaces after one-letter prepositions, in dates and after titles.

The literal "- " at the start of report lines is left alone. All template deviations go in one ADR, signed off by the headmaster at the M2 checkpoint.

**Generation transaction**
1. Lock the issue, its eligible points and the registry entries (`FOR UPDATE`).
2. Compose and render the DOCX.
3. Insert version n+1 with the snapshot and hashes.
4. Mark points published and stamp the registry.
5. Carry over standing items to the next issue. If that issue has already been edited, show a diff dialog first.
6. Audit, then enqueue `pdf.render`.

The DOCX can be downloaded immediately.

**PDF.** The worker sends the file to Gotenberg (internal, concurrency 1, 60 s timeout, retries). Its image includes `fonts-opensymbol` for the bullet glyphs and pins the LibreOffice version.

**Golden tests**
- Snapshot variants (`test/support/variants.ts`): `template-replica`, `lean` (no optional parts), `empty`, `full-week` (every window boundary), `year-boundary`, `many-students` (150), `annex2`, `escape-hell`. Regeneration of an older issue (`reopen-v2`) is covered with the generation use case in M10.
- Compared outputs: pretty-printed XML (`document`, `numbering`, `styles`, `settings`, `footer`), `model.json` and the preview HTML.
- PDF render check (`pnpm test:render`, CI job): page footers, bold page numbers, point order, only the expected fonts, a header at every Příloha 1 column top and none at a column bottom, no page ending in a big heading.
- A template-parity test checks the pinned template's SHA-256 and asserts numbering geometry, glyphs, page setup and styles against it.

## 7. Czech module (`domain/cs`, pure, table-driven tests)

| Function | Rules |
|---|---|
| `suggestGenitive(person)` | Titles: pan → pana, paní → paní, slečna → slečny. Each name part is declined by ordered suffix rules: -ek → -ka, -ec → -ce, -el → -la (lexical exceptions), -a (masc.) → -y, -ová → -ové, -á → -é, -ý → -ého, -í → -ího, consonant → +a. Academic titles pass through. Result `{text, confidence high/medium/low}`: low keeps the nominative and asks the submitter to check. Foreign surnames ending in a vowel stay undeclined ("pana Johna Doe"). Corrections are saved per person. **300+ test cases** built from public Czech name-frequency lists, including every example from the requirements word for word. |
| `renderPeople(list)` | Groups by title, with each label once per group: slečna / slečny, paní, pan / pánové; default order slečna → paní → pan. Class or job in parentheses, as stored. Neighbouring classmates share one "(oba / obě / všichni / všechny X)"; a class shared by the whole list goes once at the end; jobs never merge (ADR 0009). |
| `openingSentence(fields, type)` | Template: "V {weekday} {date} od {10.00} do {12.00} hodin v areálu {Smíchov} v {učebně S206} {proběhl} {Název}, {který} {organizovali} …". The verb agrees with the type's grammatical gender and the organisers' number. Multi-day: "Ve dnech 27.–29. října 2026 proběhla …". Neutral fallback when the gender is unknown. |
| Dates | Own `CalDate` type plus Europe/Prague conversion (DST tested on 25 Oct and 28 Mar). Formats "pondělí 19. 10. 2026", "19. října", "27.–29. 10. 2026", "30. 10. – 2. 11. 2026". `windowHeading`, `schoolYear` (switches in September), `targetMonday`, `deadline`. |
| `typographize(runs)` | Quotes, dashes, NBSP; idempotent across run boundaries. URLs, e-mails and class codes untouched. |
| `compareClass` / `compareStudents` | Year, then programme, then letter (L1B sits among the first years; programme rank is configurable), then surname with `Intl.Collator('cs')`; an ICU guard test checks that ch sorts after h. |

Time style: dot, no leading zero, "hodin" — "7.00 až 14.00 hodin" in agenda bullets, "od 10.00 do 12.00 hodin" in prose.

## 8. Screens & UX (Czech, formal "vy", WCAG 2.2 AA, mobile-first for students)

| Route | Who | Purpose |
|---|---|---|
| `/prihlaseni` | all | "Přihlásit se školním účtem" |
| `/pristup` | signed-in | Access request with a reason, and its state: open, pending (with cancel), cooldown after a rejection, blocked, or already a member |
| `/` Přehled | submitter+ | Deadline card, "Vráceno" card, "Akce čekající na zprávu" card, quick actions. Until M8 it shows the account's state; a pending user sees a card with their request standing and a link to `/pristup` |
| `/body`, `/body/novy?typ=`, `/body/[id]` | author | Report editor beside a sticky A4 preview (≥1024 px; a Formulář \| Náhled toggle below that). Autosave and a timeline. |
| `/akce`, `/akce/nova` | submitter+ | Future items by week, plus a strip showing where each item will appear |
| `/navrhy/novy` | submitter+ | Proposals for POKYNY (x) and HOSPODAŘENÍ |
| `/kontrola`, `/kontrola/[id]` | reviewer+ | Queue by section; split view of form, preview and history; return templates |
| `/porada/[datum]/…` | headmaster | Weekly stepper: Uzávěrka → Kontrola → Přítomni/Hosté → Pokyny → Registr → Náhled → Vygenerovat (with preflight) |
| `/archiv` | reviewer+ | Versions with DOCX and PDF downloads |
| `/registr` | reviewer read, headmaster write | Lists, NOVÉ tags, bulk paste (class codes normalised), "Nový školní rok" |
| `/nastaveni` | headmaster | Deadline, texts, reminders |
| `/uzivatele` | headmaster | Queue of pending access requests (approve as staff or as student, reject); people grouped by role with search by name or e-mail, at most 100 rows |
| `/uzivatele/[id]` | headmaster | One user: facts, the decision on their request, block further requests, role and type (step-up), block or unblock the account |
| `/profil`, `/ochrana-osobnich-udaju`, `/napoveda` | all | E-mail preferences, "Odhlásit všude", privacy, house-style guide |
| `/vzornik` | development and test only (404 in production) | The UI parts no real screen shows, for the look and accessibility checks |

**People picker** (React Aria ComboBox)
- Local "Naposledy vybraní" and "Z registru" results first, then M365 results after 3 characters.
- Each person becomes a chip with inline title and class. A class is saved normalised (`normalizeClass`: "1. a" → "1.A"); the document prints affiliations as stored, because "3M" or "1. LF" may be an organisation.
- Reordering uses ↑↓ buttons.
- "Vložit seznam" pastes a whole list at once.

**Design tokens**

| Token | Hex | Use |
|---|---|---|
| ink | #22232A | text |
| navy-dark | #000E19 | header bar |
| navy-mid | #00233F | slanted title blocks, subheadings |
| digital | #0062B3 | primary buttons, "Zobrazit →" links, focus |
| sublight | #CCE8FF | containers |
| light | #F7FBFF | page background, text on dark |
| accent | #F5B800 | only NOVÉ tags, deadline under 24 h, "Vráceno"; never body text on light, never large areas |

**Visual language and accessibility**
- Slanted label blocks (`skewX(-12deg)`, text counter-skewed), uppercase Bitter headings, Mona Sans 16/1.5, 4 px radius, generous whitespace.
- Status never relies on colour alone (shape + icon + text), since the manual has no red or green.
- axe runs on every screen.

## 9. Jobs & notifications (pg-boss, Europe/Prague, idempotent catch-up)

| Job | When | Does |
|---|---|---|
| `mail.send` | enqueued in the transaction | Graph sendMail as plain text with `saveToSentItems: false`; a ledger and a gate in the database, at most 20 sends per 60 s, `Retry-After` honoured by holds of up to 900 s that burn no retry; at most 2 unknown outcomes per key; 15 retries over about 2.8 h, then the dead-letter queue (ADR 0016) |
| `mail.prune` | daily 05:10 (M7) | Deletes mail-ledger rows older than 91 days |
| `reminders.deadline` | every 15 min | Deadline −2 days at 13:00 to active submitters (opt-out); deadline day at 12:00 to authors with drafts or returned points. Spread out over time. |
| `reviewer.digest` | daily 07:00 and 15:00 | New submissions and akce (counts only). M8 also tells headmasters about new access requests (a pending requester cannot list them, so M7 does not) |
| `headmaster.summary` | deadline + 5 min | Counts: approved, pending, returned |
| `future.report-prompt` | daily 08:00 | Day after the event; one nudge after 7 days, at most 2 |
| `pdf.render` | at generation (M10) | Gotenberg |
| `retention.daily` | 03:15 | Expired sessions and auth transactions (jobs: pg-boss retention and `mail.prune`, M7) |
| `retention.school-year` | 1 Sep | Purge drafts, rejected and withdrawn points, decided requests, unreferenced people; audit log older than 3 years |
| `ops.check` | daily 07:00 | Backup age (local and off-site), dead-letter queue, certificate expiry, disk. Mails the IT contact and shows a banner to the headmaster. |
| backup sidecar | nightly 02:30 | `pg_dump` → restore-verify into a throwaway database → `age`-encrypt (public key only) → off-site copy (SFTP/rsync, SMB NAS or S3-compatible). The private key stays offline; a manual restore drill every quarter. |

Immediate notifications:
- point approved, returned or rejected → the author;
- access request approved, rejected or blocked → the requester;
- access granted by hand to a pending user → that user.

## 10. Implementation plan (commit by commit)

**Rules for every commit**
- One coherent step, about 50–400 changed lines, never more than about 500.
- Tests included; typecheck, lint, architecture rules and tests all green.
- Message written with **`/caveman-commit`**.

**Branches.** One branch per milestone (`m0-scaffold`, `m1-domain`, …), fast-forward merged into `main` once the milestone is green, which keeps history linear. After each milestone, a code-review pass (workflow) runs before the merge.

**M0 Architecture & scaffold**
1. `docs(adr)`: plan of record, module map, glossary, feature list, ADRs
2. `docs(it)`: ENTRA-SETUP.md + IT request checklist — **send to school IT now**
3. `chore(repo)`: pnpm, TS strict, `.gitignore`, licence, `.editorconfig`, `.env.example`
4. `chore(next)`: Next 16 standalone skeleton (`src/`, poweredBy off)
5. `build(lint)`: ESLint flat config, Prettier, dependency-cruiser layers (tests as entry points), knip
6. `test(setup)`: Vitest projects (unit / integration / golden), Playwright skeleton
7. `ci`: typecheck, lint, arch, test, gitleaks, `pnpm audit`
8. `build(dev)`: `compose.dev.yaml` (Postgres 18, Mailpit, mock-oauth2-server, Gotenberg)
9. `feat(config)`: Zod env and secrets loader
10. `feat(log)`: pino with redaction + request id

**M1 Domain core (pure, test-driven)**
1. `cs`: CalDate, zone, month/weekday tables
2. `cs`: date formats, ranges, window headings, school year
3. `cs`: typography
4. `cs`: genitive for male names
5. `cs`: genitive for female names, adjectival forms, titles, indeclinables, 300+ cases
6. `cs`: people grouping
7. `cs`: opening sentence
8. `cs`: class sort + collation
9. `calendar`: targetMonday, deadline, phase, routeFuture
10. `review`: state machines
11. `policy`: `can()` + matrix
12. `richtext`: schema + validator + fuzz tests
13. `registry`: isNew, carry-over planner

**M2 Document engine**
1. `snapshot`: v1 contract + fixtures
2. `test(docx)`: template-parity spec, written first
3. `document`: model + compose header and POKYNY
4. `document`: compose HOSPODAŘENÍ, PROVOZ, closing
5. `document`: compose přílohy
6. `docx`: page setup, styles, numbering, footer
7. `docx`: block renderers
8. `docx`: Příloha 1 per-column-header table (spike decides between the two approaches)
9. `test(docx)`: golden fixtures + injection corpus
10. `html`: paper preview renderer + golden
11. `build(gotenberg)`: font image + render-check script
12. `cli`: `render-snapshot`

★ **Checkpoint:** you compare `template-replica` in Word against the template, and sign off the deviations ADR.

**M3 Persistence & app core**
1. `db`: Drizzle, migrate service, test-DB harness
2. `db`: identity schema
3. `audit`: append-only table + trigger
4. `app`: ports, composition root, fakes
5. `app`: `defineUseCase` / `defineAction` + inventory test
6. `security`: rate limiter

**M4 Auth**
1. ID-token claim validator (unit tests)
2. login and callback routes, PKCE, transaction cookie
3. certificate client assertion
4. DB sessions, logout, revoke-all, bootstrap headmaster
5. mock-IdP negative test suite
6. CSP nonce in `proxy.ts`, security headers, Caddyfile
7. `build(deploy)`: minimal prod compose

★ **Smoke test against the real tenant on the school server:** a member signs in, a guest is rejected, a student lands in pending.

**M5 UI foundation**
1. brand tokens + self-hosted fonts
2. app shell (header, nav, skip link) + Czech copy catalogue
3. Button, SlantLabel, StatusChip, Card, ArrowLink
4. React Aria fields + ErrorSummary
5. login page + privacy notice

**M6 Access & users**
1. access request page + headmaster decision (with student flag); the form submit path (action result → fields, error summary, problem notice) is designed with it
2. step-up re-auth
3. users and roles admin

Built (ADR 0013, 0014): `/pristup`, `/uzivatele` and `/uzivatele/[id]` over the form path `useActionForm`; reads under `users.view`, role, type and account changes under step-up with a server-checked confirmation; the 30-day cooldown after a rejection, a final block of further requests that a manual grant can override, and no change to one's own account. The privacy notice states the cooldown.

Note: React Aria's Checkbox, Radio, Select and Date* render `style` attributes that the CSP refuses, so M6 uses a native checkbox and a native `<select>` styled with tokens. M8's DatePicker needs a new ADR (`style-src-attr`); ADR 0012 records the constraint.

**M7 Worker & mail**
1. pg-boss worker, cron registry, transactional `JobPort`
2. Graph mail transport + throttle
3. SMTP (Mailpit) transport + Czech templates
4. access notifications

Built (ADR 0015, 0016): the worker with its own login role, image and `egress` network; pg-boss installed by `migrate`; a mail ledger and gate in the database; the Graph and Mailpit transports; five Czech templates; the decisions of §9. The CLI gains `jobs:status`, `jobs:redrive` and `mail:test`.

Deviations from the list above:
- `pdf.render` is not in the job catalogue until M10.
- The cron registry ships one entry, `mail.prune` (05:10). `retention.daily` stays M11's.
- Headmasters are not mailed about new requests: M8's `reviewer.digest` does that.
- The real-tenant checks wait for school IT (SMOKE-TEST).

Note: the Graph mail adapter sends `saveToSentItems: false`, so no copies pile up in the shared mailbox.

**M8 Submissions & review**
1. issues schema + `ensureIssue`, deadline, skip
2. point-type admin + seeds
3. points, bullets, people, statements schema
4. Graph directory search + local people memory
5. PeoplePicker + paste list
6. report form base fields + opening sentence
7. bullets, statements, genitive suggestion UI
8. live preview, autosave, version conflicts
9. submit / withdraw, "Moje body", timeline
10. review queue + decisions + notifications
11. HOSPODAŘENÍ and POKYNY proposals
12. future items CRUD + review + placement strip
13. report-prompt job + prefilled report
14. deadline reminders, digests, summary

Built, M8a „Bod od autora po schválení“ (ADR 0017–0020, 0022–0026; autosave editors, review and mail; the directory has `off` and `dev` adapters only). Each fact names its commit.

What exists:
- Issues with a frozen deadline and skip/unskip by the headmaster, a point-type table with seeds, `points` and `point_events` with guards, a scoped repository, idempotent draft start (`client_ref`) under a per-author lock, author save/submit/retract/withdraw, the review queue, approve/return/reject, reviewer edits with the original kept, and decision mails (e421e6a, bab108f, 629c605, 20f04ff, 5fa9060, 3ca1389, a21b7ae, b93419c, 0d76823, 1803d5d, 3cff912, ec49d5d, e89c252, a0168fb, 4a87ec8).
- The report editor: people search, chips, paste of a list, autosave, bullets, opening sentence, statements with genitive, live preview, readiness list, standing line, „Moje body“, read view and timeline (f1e2e11, 49f1e38, 5029898, 182f0cd, db46431, 3cd785c, 36a3de8, 0ece731, 31195ef, cebb05e, 55421b7, 5c5c12c, d2fea58).
- E2E for the author and review journeys J1 and J2 (7702afe), and for every M8a screen under axe in both projects, autosave (flushes, conflict, keep-mine, signed out, locked, gone, the retry ladder, `beforeunload` per phase) and the editor's interactions (0320df9).

Deviations from the design (design §3, §14 and the ADRs are not edited):
- **Placement.** Every point, waiting or approved, is placed by `pointMonday` from the latest of `earliest_monday`, the submit Monday of its last hand-in (`submitMonday(submittedAt)`) and the first Monday on or after today in Prague; a skipped Monday is passed over and `placementMonday` returns null after 26 Mondays. This refines design §3 and keeps ADR 0018 item 1: a late resubmit goes to the next open porada (03fe9e2, db0123d, f92b966). `submitMonday` starts at `mondayOf(now)` (f87a09c).
- **Retract.** A retract clears `submitted_at` (ADR 0026, which supersedes ADR 0018 item 3 in part), so a retracted point is a draft again and reviewers no longer see it; a returned point keeps `submitted_at` (1c2da2c).
- **Visibility.** Headmasters get `own-or-submitted` too (the system principal keeps all) (876d6a7). A point withdrawn after a hand-in stays readable to reviewers; a never-submitted withdrawn draft does not (1803d5d).
- **Save.** `points.save` is author-only through `authorEditsPoint` and not `can(point.edit)`, which would let a reviewer-author autosave a submitted point unaudited (b93419c). Field issues sit on `content.body`, `content.bullets` and `content.statements`; finance and pokyn refuse only non-empty bullets and statements (b93419c). `PointRepo.update` filters by scope, so an out-of-scope point answers StaleVersion (20f04ff).
- **Create.** `beginCreate(clientRef)` runs under `pg_advisory_xact_lock`; only drafts count toward `DRAFT_CAP` 50; a retry with a used `clientRef` returns that point unchanged and unaudited (3ca1389, a21b7ae). Retract is allowed above the cap (1803d5d).
- **Database.** `REVOKE DELETE` on `point_events` as well as UPDATE; a point's delete still cascades (629c605). A constraint outside `KNOWN_CONSTRAINTS` fails as `db.constraint.<name>` (ADR 0022, afcd951). The fakes refuse by constraint name too (f350ad4). The worker reads `points` (id, author_id, state) and `point_events` (id, point_id, event, to_state) through the column grants of migration 0017 (4a87ec8).
- **Events.** A concrete `createPointEventRepo`, with no generic `eventsRepo(table)`; `append` returns the stored record; a scoped principal on an unknown or out-of-scope point gets ScopeViolation (5fa9060).
- **Issues.** The input field of skip is `confirmed`, required for skip and unskip (33c7354). `issues.window` returns a superset (`submitMonday` and the issues with versions) and the strip is built only for `issue.generate` (e874952, 35b9163). The window reads the tail past 26 weeks when the last skippable Monday lies beyond it (95009e8).
- **Point types.** Every Organizátoři bullet has the role `organisers` and unmarked bullets are `required: false`, as placeholders (bab108f).
- **Directory.** `DIRECTORY_DEV_PATH`, not `DIRECTORY_DEV_FILE` (readEnv reads `NAME_FILE` as the Docker-secret form); the dev file `docker/dev/directory.json` holds 54 people (42 from 6c913f2, 12 e2e personas from 7702afe) and the web image does not ship `docker/dev` (6c913f2). `DIRECTORY_LIMITS` (10 hits, 3 characters, 64 for the query, 160 for the display name) live in `domain/report` (6c913f2, 0a16e60). The route counts the body in bytes while streaming and answers 413 to a non-numeric Content-Length; `graphId` is a GUID (0a16e60, 95009e8).
- **People memory.** `people.recent` flattens the author's own points; an older genitive is kept only while the person's copies read the same; typed and directory people with one name stay two (8519154). `affiliationYear` is a „2026/2027“ school year (95009e8).
- **Actions.** `defineAction` gains `refresh: 'page' | 'none'`; `points.create` and `points.save` are the only `'none'` actions, pinned by the inventory (ADR 0017, ec2c57e). `points.save` and `points.status` share the new `autosave` rate limit (120 a minute per user) (3aa52ec, 182f0cd).
- **Client.** zod runs jitless in the browser through `src/instrumentation-client.ts` (ADR 0023, fe81f0d). The client bundle carries zod and the contracts, about 296 KB per the builder (f1e2e11). One announcement channel and a role=alert banner for autosave (ADR 0024, 182f0cd); a `gone` phase for a point the server no longer finds, with „Položka neexistuje, nebo k ní nemáte přístup.“ (643a5f5). `router.push` after „Schválit a pokračovat“ (ADR 0025, c83ae3b). Reviewer edits have a `beforeunload` guard but no soft-navigation guard (a0168fb, ADR 0017 item 9).
- **Reading.** „Moje body“ pages by a cursor `{ms}.{uuid}` of 200 (`MY_POINTS_PAGE`) with „Starší body“ and gains the return note of a returned point; published points sit under „Schválené“; the timeline also shows under the editor and has lines for retract, withdraw, reject, publish and unpublish; finance and pokyn read views print no paper; the read view's school year comes from `earliest_monday` (d44bd5e, 4e9234e, 78d45a4, 5c8f243, d2fea58).
- **Review.** The note goes into the event row only, never the audit; `next` is read inside the decision's transaction and skips points the actor may not approve (ec49d5d). `reviewEdit` runs the submit's readiness and stores `submittedContent` (e89c252). The audit-meta test follows arrow and const helpers; a meta object built in a variable is not followed (e89c252).
- **Mail.** The three point subjects carry the „Autoporada: “ prefix and the paragraphs open lower case: „Autoporada: bod byl vrácen k úpravě“, „Autoporada: bod byl schválen“, „Autoporada: bod nebyl přijat“; no mail goes to an author who decided their own point (4a87ec8). Mails carry ids only and link `/body`.
- **Copy** (the design's copy tables were not edited):
  - readiness: „Čas do musí být později než čas od.“ (equal times refused, as the snapshot) replaces „Čas do nesmí být před časem od.“ (55421b7); a neutral „Mluvčí {name} není mezi účastníky.“ replaces „… už není …“, because a speaker picked through „Jiná osoba…“ never was a participant (0ece731, 55421b7); `body-too-long` shows „Text je příliš dlouhý.“ (31195ef);
  - preview notices: „Osoby bez oslovení nebo příjmení se v náhledu nezobrazí: {n}.“ and „Prázdné nebo nepojmenované řádky se v náhledu nezobrazí: {n}.“ (31195ef, cebb05e);
  - Shell has a `wide` width (`lg:max-w-6xl`) for the point pages, and the sticky preview scrolls inside itself (cebb05e); the decision bar is sticky from `md`, not `sm`, and only while the note is closed (c83ae3b); a `bar-room` scroll margin on the editor's controls replaces design §6's html scroll padding, which broke the gallery listbox (55421b7);
  - review: nav and page „Kontrola“, „Ke kontrole: n“, „Porada {d. m.}“, „Porada zatím neurčena“, „Vráceno dříve“, „Schválené, čekají na poradu“, the cap line „Zobrazeno je jen 500 nejstarších bodů.“, „Rozhodnutí kontroly“, „Poznámka pro autora“, „Bod byl schválen.“, „Bod byl vrácen autorovi k úpravě.“, „Bod byl zamítnut.“, „Upravit“, „Uložit úpravy“, „Nic se nezměnilo, nebylo co uložit.“ (b894d33, c83ae3b, a0168fb).
- **Accessibility.** The readiness links are inline blocks with vertical padding, for the WCAG 2.2 target size that axe found missing (b3675c3).
- **Tests.** There is no DOM test environment: node tests cover SSR markup and pure logic, and interaction goes to Playwright (design H2 (a)). `setupWorld` resets the clock before every test (6edfe8a). `POINT_LIMITS` is tied to the CHECK numbers in `point-guards` (b7cf01e).

Deferred or open after M8a:
- **Privacy** (docs/gdpr/privacy-review.md, items 28–31): the erasure foreign keys for `points.author_id` and `point_events.actor_id` (erasing a user who has points is refused; round A F8, not now), and the open decision on a returned point's visibility (security review S1).
- **Not built, noted for later rows:** the Přehled card counts only the newest 200 points (d2fea58) and runs `points.queue` to count submitted ones (3cff912); `/kontrola/[id]` on a reviewer's own draft shows the read view with an empty bar (b894d33); `dateText` is spelled in three places and `SALUTATIONS` twice (rows 19 and 25); a query of one-letter words such as „j n“ passes the directory floor (6c913f2); the fake issues repo does not mirror the CHECKs (round A F6); the version check runs before the policy, so an in-scope actor who may not act gets a conflict, not forbidden (0d76823, ec49d5d); the paste regexes are not checked for backtracking (client only, at most 4000 characters; a913d76); `errorSummary` logs the message and stack of a non-database error (before M8); `editor.test` and `autosave-wiring.test` duplicate their fixtures (643a5f5); `revealAndFocus` opening a closed `<details>` or the hidden form pane has no e2e, because no link targets either, and a rate-limited save waits on the retry ladder with no banner of its own (0320df9); the „Moje body“ cursor carries milliseconds while `updated_at` holds microseconds, so rows written by SQL with the same instant as a page's last row would be skipped (the app writes `updated_at` from its own clock, so none are) (d44bd5e); the Graph adapter, its errors mapped to codes and the web's own registration are M8b (rows 46–48, 65).
- **For M9:** under the Sunday 18.00 rule of M0–M8, after the deadline the coming Monday could be neither skipped nor unskipped (33c7354; M9 replaced the rule with ADR 0032's and lets the headmaster skip after the deadline, fda9624); a generation run for a Monday that has passed must not pick its points through `pointMonday` or `placementMonday`, which place from today's Monday and so move them on (03fe9e2, f92b966); the snapshot builder asserts zero counts, a non-null report and the report's dates and times equal to the content's (31195ef).
- **Real tenant:** the mail, grant and directory checks wait for school IT (SMOKE-TEST).

Built, M8b „Návrhy, akce, adresář a připomínky“ (ADR 0021, 0027, 0028; the Graph directory, point types, proposals, akce and the timed mails). Production keeps `DIRECTORY=off` until SMOKE-TEST step 29 has run on the school's tenant. Each fact names its commit.

What exists:
- The Graph directory: a fake Graph with the user search, the `graph` adapter, and the web's own registration with its token source and the `ap-edge` egress (9950882, b1328bc, d5dfe2f, 4061381).
- The headmaster's point-type editor, and proposals for HOSPODAŘENÍ and POKYNY (8ab854f, 36aacd4, fc26ba3, cea2012).
- Future items: tables and guards, repositories, create/save/submit/retract, the list, read view, editor and four-Monday placement strip, reviewer decisions, revise and cancel (ccd325a, 39edcdc, da87a06, 944c64e, 8ad2de3, 9059cae, ee84bbf, 29ead4c, 9c3696f, b18bf27, 921758e).
- The report after an akce: start or decline from the report-due card, the daily prompt mail, ADR 0027 (49ebbfc, ab6b3f2, 6b32145, 393a130, 4086ffe).
- Timed mails: the profile switch for deadline reminders, `reminders.deadline`, `reviewer.digest` (07.00 and 15.00), `headmaster.summary`, and `pnpm cli jobs:run <job> [key]` (42af78e, 127a841, 894b80b, c1c0d0c, 81f9038, 5444015, b4e8e3c).
- Tests: the DST and downtime matrix (d8d2fb2) and the J3 akce journey with `jobs:run` and Mailpit, plus axe over the M8b routes in both projects (f32da59).

Deviations from the design (design §12, §13 and the ADRs are not edited):
- **Directory (rows 46–48).** The fake Graph and the adapter match without folding diacritics (S9 open): `novak` does not find Nováková, and the adapter sends the cleaned text as typed. The adapter's test is a unit test (`src/infra/directory/graph.test.ts`, no PostgreSQL, like the mail adapter), and `createDirectory` takes `graphBaseUrl` in its deps. Web and Caddy share the `ap-edge` bridge, so the firewall rule names the three Graph hosts on that bridge, not per service. `auth:probe` probes only the mail registration. SMOKE-TEST step 29 is the Graph check, and go-live moved after it (to 30, then to 34 with the M8b mail steps).
- **Point types (row 49).** The list use case gains `includeInactive` and a `detail` field. The „Zobrazit neaktivní“ checkbox is local to `ui/features/point-types` because the kit's one appends „(nepovinné)“. Bullets cannot be reordered. A bullet key carries its kind (`hoste--p`).
- **Akce data (rows 51–52).** Extra CHECKs (campus, lengths, event notes), a unique `(author_id, client_ref)` and two indexes, like `points`. `points.future_item_id` has no `ON DELETE` action (SET NULL would trip `version_bump`). Responsible moved to `domain/report`. The `future_item` audit target came with the repositories. The events repositories share helpers instead of one generic repo.
- **Akce use cases (row 53).** There is no withdraw for akce (not in the rows). A write in the wrong state answers `forbidden`, and an approved save that changes nothing writes nothing. An approved akce is changed only through a save with intent `revise` (never by autosave), so the design's „an author's edit fires revise“ happens on an explicit „Uložit změny“ (8ad2de3). `future.get` gives non-authors a names-only view and the author the full content.
- **Akce review (row 55).** No decision mail for akce (the design mails only point decisions) and no approve-and-continue. The akce queue is flat: oldest hand-in first, with a mark for a changed approved akce. Reviewers use the names-only view from `future.get`. `futureHistoryScopeOf` was renamed `futureReviewScopeOf`. Decisions use `loadForDecision`/`decide`. The quick phrases and the cancel wording are invented copy. A reviewer always gets a (possibly empty) bar so the status line survives a decision. The Přehled count card still counts points only.
- **Report after an akce (row 56).** The akce report takes a point type the author picks (the design names none). Start and decline are unversioned and idempotent through `clientRef` = akce id. The akce's time is not copied into the report. The policy action `future.report` and the rule `report-not-due` are new. The report-due card reads only the newest `future.list` page (200 items), and the type radio shows only with more than one active type.
- **Report prompt (row 57).** Only the latest due stage is sent per run per akce, and no „prompted“ state is stored: the worker writes no business table and the ledger dedupes. Subject „Autoporada: napište zprávu z akce“. The worker's column grant is migration 0022.
- **Reminders and the digest (rows 59–61).** The worker needs SELECT on `future_items.submitted_at` (0024). New narrow ports: `issues.deadlines`, `points.reminderAuthors`, `submitterIds`. The mail frame gained an optional `Body.after`. The pg test backend reports `startAfter` when it differs from `created_on`. The summary subject carries the „Autoporada: “ prefix like the other mails, and its counts are placed with `pointMonday` in the application, not by a SQL count.

Known gaps (not fixed):
- Row 49: the locked type may still get a title gender (review F6; needs a UI and rule decision). Focus after remove and after save was not checked in a browser before the e2e of row 64.
- Row 54 review F9: the press scaffolding and `CAMPUSES` are duplicated.
- Row 56 review: R56-4, declining after starting leaves the linked draft, which counts against the draft cap; R56-6, the fake world does not enforce the foreign key of `future_items.report_point_id`.
- Row 57 review: the send-time check does not re-check `expects_report` or that the akce is over (reachable only on a mail retry after an edit and re-approval); the prompt mail does not name the akce, so two akce ending the same day give two identical mails.
- Row 58 review R58-3: `/profil` shows the reminder checkbox to pending users and students with no wording of its own (pending users hold `profile.manage`).
- Row 59 review: the 0–30 min stagger can push a mail past a window shorter than 30 min (only once deadlines become editable); the hard-reminder re-check is O(n²) per run; the 127a841 body says „two days before“ loosely (the D7 timing holds).
- Row 60 review R60-2: the digest count window has no upper bound, so an item handed in between enqueue and send can be counted in two digests (noted in the `digestFacts` comment).
- Row 62 review: `jobs:run` checks its arguments after connecting to pg-boss; for `reviewer.digest` the key picks the schedule but the handler takes the slot from the clock, so „Queued … afternoon“ can mislead; the no-echo test covers only an unknown job name.
- Privacy: the retention table does not yet say that akce follow the points' purge and that a cancelled akce is kept (docs/gdpr/privacy-review.md, items 14 and 32).
- Real tenant: the Graph search (S2, S9), the reminder, digest and summary mails and the report prompt wait for school IT (SMOKE-TEST steps 29–33).

**M9 Headmaster tools**
1. snapshot assembler (read-only query + integration tests)
2. restricted TipTap editor (indent 0–3: 0 = plain paragraph, 1–3 = the o / o / ■ levels, so levels can be skipped as in the template)
3. POKYNY outline editor (reorder, standing / one-time, system slots)
4. Přítomni/Hosté, ohlasy, Příloha 2
5. registry lists, entries, bulk paste
6. "Nový školní rok"
7. settings (deadline, standard texts, reminders)
8. `feat(seed)`: initial standing content from the blank template
9. full preview + preflight

Built, M9 „Headmaster tools“ (ADR 0029–0035; the porada pages, the outline and rich-text editor, the registry, settings, moved poradas and late-event reports). The branch is `m9-headmaster-tools`, cut from main 0d948a3. Each fact names its commit. Rows 3–12 were built test-first; from row 13 the builders wrote code only and all tests, the gate and the reviews ran in one final phase (rows 49–52 and this one at the end).

What exists:
- ADRs 0029–0035: selection, outline and editor; settings, registry, slots and late reports (dd3e4ae, 9ef102d).
- Slots and the deadline rule: issues carry their meeting date, points keep their `hand_in_monday` and are placed by it, the deadline counts back from the meeting date (default 2 days before at 20.00), the agenda windows follow the meeting date, a late report closes at its own time and a report is owed from the end of its akce (56b0dce, eef752e, b7f2e02, f758da8, 20403c8, 8858b62, 05c7186, 60e7b46, 336c34f).
- Settings: the `settings` table, its key registry, saving under a version, the deadline save with the freeze of what was shown, and `/nastaveni` (b2c8fb2, 536b0ec, 9bfc825, 09f9fd3, 51c43b5, f7d5b42). The rule is read from settings by every issue writer, and the worker reads it through a column grant (88ad10e, f2f5335, 436dc32).
- Registry: lists and entries with the four seeded lists, the paste parser, `/registr`, the two-step paste preview and „Nový školní rok“ (e06fb3e, c11e731, 30766d6, a34fd47, e3043c7, dcff181, bbf3718).
- Outline and the issue's data: `domain/outline` (derive, ops, merge, seed), `issue_items` and the issue's own texts, the eligible points and akce for a slot, the outline store, the snapshot assembler with `issues.preview`, and the preflight (d28ff8c, 7c6e06c, 448a933, b897889, 1aaefc5, 4863360, 1848b34, f4db5d1, 8766de1).
- The porada pages: working slot and `/porada`, the full preview, skip after the deadline, the meeting order, „Přesunout poradu“ with its moved notice mail (6e16273, cc78149, fda9624, 61855cd, a322d6f, c811636, 07e0d6e).
- Late-event reports: the mail when a late akce ends, the last call, Saturday's reminder leaving late reports alone, the headmaster's late summary and the preflight finding (23a11db, ac1afa7, 2996b85, 35908f1, 126eead).
- The editors: outline operations and `/porada/[datum]/pokyny` (e4d0b9f, 8a191e8), TipTap 3.32.0 behind the `tiptap-only-in-rich-text` fence, the toolbar and the dirty guard (bdefcb2, 2420d59), the item editor (c8f97cb), „Údaje“ and Příloha 2 (b9dadc9, 5cabf73).
- Tests: the suite grew from 8402 passing at 5cabf73 (66 failing) to 9586 passing at 372519c; the J4 journey and the SP-T checks (keys, copy, drag and a Word paste under the nonce CSP, both projects) are in a2c45ca.

Deviations from the design (design §0–§18 and the ADRs are not edited):
- **Sizes and splits.** Rows 8, 10 and 12 were split in two for size (8858b62 and 05c7186; b2c8fb2 and 536b0ec; 9bfc825 and 51c43b5) and row 11 in three (88ad10e, f2f5335, 436dc32). Row 5 is b7f2e02 and row 6 f758da8.
- **Backfill and the year boundary (rows 3, 4, 7).** The `hand_in_monday` backfill is exact for rows frozen under the old Sunday 18.00 rule. The year-boundary golden changed (meeting Tuesday 29.12., the headings start a day later), where ADR 0034 item 5 said it would not (20403c8).
- **Late reports (rows 8, 9).** `reportCloses` takes a structural `PoradaClose` to avoid a cycle between slots and late-report (8858b62). `ReportFacts` carries `endsAt` because `domain/review` cannot import `domain/calendar`; both callers compute it with `eventEnd(lateFacts(…))` (60e7b46).
- **Settings (rows 10–13).** A CHECK `settings_value` (`jsonb_typeof = 'object'`) was added to the design's two, because Drizzle's jsonb mapping parses a top-level string (b2c8fb2). The worker's grant is `SELECT (key, value)`, so the port has a value-only read, `value(key)`; `settings.read` keeps the versioned one, and an arch test (`worker-settings`) keeps `application/notifications` and `application/jobs` off `readSetting(` and `settings.get(` (536b0ec, f2f5335). `settings.lock(key, 'share'|'update')` is an advisory transaction lock: every reader of the rule takes it shared before touching an issue row and the deadline save takes it for update first (51c43b5). The deadline form also shows its effect before saving.
- **Registry (rows 14–20).** `registry.newSchoolYear` takes `{ listIds, year, confirmed }`; `year` was added to the design's input (bbf3718) and bounded at 9 characters later (afa6438). `registry.read` counts a list's `entries`, not `active` (e3043c7). Paste is parsed on the server by `registry.previewPaste`, a read use case; the action keeps the default `refresh: 'page'` although it is a read.
- **Outline (rows 22, 26, 42).** An outline write works on the outline merged with the eligible proposals, so it drops the placement of a returned or withdrawn proposal (e4d0b9f). `outline.read` and `outline.item` were added as read use cases; `outline.add` takes its `lineageId` from the client (`z.uuid()`, a repeated add leaves one item). Limits: 60 rows per section, 300 characters per title, 20 quotes.
- **Snapshot and preview (rows 27–31).** The assembler takes `now` and has no `groupOrder` option (f4db5d1). `issues.preview` carries the snapshot as JSON text, because contracts cannot import the snapshot schema (2600f90). `issue.preview` is narrowed to staff reviewers, who open `/porada/[datum]/nahled` read-only (cc78149).
- **Skip, order and move (rows 32–36).** A generated slot is refused as `issue-not-open` (a322d6f). `meeting-order` has no refs on the wire (a rule failure has no slot for them), so the move page computes the conflicting porady itself with `orderConflicts` (c811636). The moved notice mails only if the moved slot is still the collected one and its deadline unchanged, and the subject carries the meeting date (07e0d6e). `activeSubmitters` and `authorsWaiting` moved to `application/notifications/reminders.ts`.
- **Late-report jobs (rows 37–41).** `reports.late` runs every 15 minutes with catch-up skip. `report.ended` goes only for an akce with report state none or prompted and no report point (23a11db); `reportPoints` and `reportPoint` replace `reportDraftsEnding` (ac1afa7); `reminderAuthors` moved to `repos/points-reports.ts` (2996b85). The migration 0035 grants are `future_items(time_to, report_point_id)` and `points(event_date, end_date, time_to)`. The headmaster's preflight lists the akce awaiting a report by title, also once its report is a draft or returned; other authors' report drafts never handed in show only as a count (bc70df8).
- **Rich text (rows 44–46).** TipTap core, ProseMirror, `extension-document`, `-paragraph`, `-text`, `-bold`, `-italic` and `@tiptap/extensions` at exact versions (3.32.1 and 3.32.2 were inside `minimumReleaseAge`). Our own hook mounts a vanilla `Editor` after hydration (no `@tiptap/react`), `injectCSS` is false, the indent is `data-indent` plus a class, and the chunk is one lazy ~96.5 KB gzipped (bdefcb2). `quoteField` lives in `features/porada/item-editor.ts`, not in the client file QuotesEditor (2c64d1d). A proposal row in the item editor redirects to `/kontrola/[id]`.
- **Details and Příloha 2 (rows 47, 48).** One version-checked UPDATE sets the issue's texts (`IssueRepo.setTexts`, no touch and write); present and guests are at most 2000 characters; „Odebrat přílohu“ stores an empty document; the `/nastaveni` annex 1 intro became a rich-text field with the `paragraphs` profile (b9dadc9, 5cabf73).
- **Autosave.** ADR 0017's set is unchanged (`points.create`, `points.save`, `future.create`, `future.save`): every M9 editor saves explicitly and guards unsaved changes (ADR 0031 item 8).

Fixes found in the test phase (each has its test):
- Audit meta built with spreads (142b874); the audit of „Nový školní rok“ now names the archived entries (c45ab5e); a list title race maps to `registry-list-taken` (85bfe37).
- The last-call mail wrote `"akce:<uuid>"` into a uuid column, so every real send failed (72930ee); the SQL twin of `isLateReport` picked the later instant in the repeated autumn 02:30 hour (268ce46).
- Pasted Word HTML broke the style CSP, because the HTML parser reports every style block and attribute even in an inert document (33c7f90).
- No-break spaces and a bidi override written raw in copy, the parser and a test (aaa7a0d, 1c8f0bc, 372519c); the school year of `newSchoolYear` bounded (afa6438); existing tests followed the new behaviour (0632431, 7ce4d50).

Not covered by a unit test: `createRichEditor` and `cleanPastedHtml` (no DOM environment; the e2e SP-T checks cover them, with a Word and a Google Docs paste), the cruiser rules `tiptap-only-in-rich-text` and `editor-chunk-only-lazy` (`lint:arch` enforces them), `report-incomplete` in the preflight (unreachable through `points_submitted_complete`), and the lock order of `issues.move` (no transaction spy; refusals roll back).

**M9 review and open decisions**

The final phase ran three code reviews (settings and registry; issues, outline and porada; jobs, mails and editor), a security review and the e2e journeys J4–J6 with SP-T (330 passed). Fixed, each with its test:
- Security: `parseClass` backtracked quadratically on a long run of spaces, and the contract's refine ran past `max(12)`, so any session could block the web for minutes per request (f0ed6ff). Registry audit meta no longer carries list keys, which are slugs of the title (05a3609).
- Registry and settings: a list titled „Nový školní rok“ took the archive route's key (a371c29); the new-school-year audit names the rows its DELETE and UPDATE returned (05a3609); the group-count warning carries its word (3599f3f); a stale settings form fails `conflict` before any deadline work (69a1054); the effect line names the meeting date, shows only on a change and says hand-set deadlines stay (eed3e41); a class written „2. B“ is read (d300fd3).
- Outline and move: moving next to an unplaced proposal really moves it, a full section refuses `outline-full`, fixed slots take no body (78abcce); the move horizon is the last slot Monday + 6 as ADR 0034 says, not + 13 (8ba4281); blank partner quotes are refused (9cb1135); a repeated add changes nothing and a lineage id may not name a point the headmaster can read (091d510); the Příloha 2 audit counts a cleared editor as removed (1b5658e).
- Jobs and mails: late-report mails re-check their window when they go (70844d0); a 00.00 close prints as 23.59 of the day before, and the last call fits an unlinked draft (936ec4e).
- Editor: invisible characters no longer block a save, the unsaved-changes guard sets `returnValue`, TipTap is fenced to `editor`, `indent` and `paste` with `./editor` only loaded lazily (35f9ef0, ab12ff3); a Google Docs paste no longer turns bold, and Word's `mso-bidi-*` styles are not bold or italic (9677486).

Open, for the user to decide:
1. An outline write drops a *returned* proposal's placement; re-approved, it lands at the end (keep returned rows on write, hidden in the editor?).
2. Only `open` rows are refrozen when the deadline rule changes; a porada skipped at the time and unskipped later keeps the old rule's deadline (refreeze `skipped` too?).
3. The settings grant (`settings(key, value)`, 0030) lets the worker read `texts.annex1`; a view filtered to `deadline` and `reminders` would stop it (privacy review item 42).
4. A moved notice held until after the slot rolls over describes the next slot: its subject is the recipient, not the issue. The notice also goes again for each distinct deadline minute, so moving a date back and forth mails staff each time (cap per issue per day?).
5. The preflight's close line still prints 0.00 for a midnight cap, where the mails print 23.59 of the day before.
6. The seeded registry lists (0032: talent, aj-certifikat, aj-prezkouseni, …) are not yet checked against the template's wording.
7. The design's overridable defaults stand: the 00.00 late-report cap, the 2 h grace, counts not titles in late mails, the move mail only for an earlier deadline, „a“ between pasted names, hand-in passing skipped slots.
8. Carried from M8: S1 (returned-point visibility) and the erasure FKs.

**M10 Generation & archive**
1. generation transaction (locks, version, publish, stamp, carry-over) + two-connection race test
2. PDF job + retry
3. archive + downloads
4. reopen / regenerate (registry as-of rule)
5. break-glass CLI

**M11 Ops & GDPR**
1. daily retention
2. school-year purge + audit retention
3. backup: dump → verify → encrypt → off-site
4. `/healthz`, ops check, admin banner
5. prod compose hardening
6. data-subject-request CLI
7. Playwright end-to-end: five journeys
8. RUNBOOK (install, update with a backup before migrations, restore, PG upgrade, minimum host 2 vCPU / 6 GB RAM / 40 GB)

Note: there are two Entra registrations and two certificate pairs (ADR 0021). `ops.check` runs in the worker, which holds only the mail pair, so its certificate-expiry check must cover the web's certificate too: the web reports its own expiry, or the public `web_entra_cert` (not secret) is also given to the worker.

Note: before go-live the privacy notice is approved: `approved: true`, the effective date set, no review flags left (`docs/gdpr/privacy-review.md`).

## 11. Verification

**Unit**
- Table tests: genitive, people lists, dates and DST, placement, sorting, state machines.
- fast-check properties: typography idempotence, sort as a total order, rich-text fuzzing.
- The policy matrix is compared with an expected table.

**Integration (real Postgres 18 via the compose test database)**
- Every use case: happy path, authorization refusal, IDOR, state conflict, jobs enqueued.
- Constraints: publish-once, append-only audit, last-headmaster trigger.
- A generation race test.

**Document**
- Golden XML, model and HTML tests, plus template parity.
- Render check: Gotenberg → `pdftotext -layout` snapshot, page count, "Stránka X z Y", a header at the top of each Příloha 1 column, bullet glyphs checked via `pdffonts`.
- Manual side-by-side in Word.

**End-to-end** (Playwright + mock IdP + Mailpit API + axe), five journeys:
1. access request → approval;
2. submit → return → resubmit → approve;
3. future item → prompt → report;
4. generate → download DOCX and PDF;
5. reopen → v2.

Every e2e test fails on a CSP violation, and axe runs on every screen in both Playwright projects
(desktop and mobile).

**Security tests**
- OIDC negatives: bad signature, `alg=none`, wrong `iss`, `aud` or `tid`, expired token, replayed `state`, wrong `nonce`, guest.
- Cookie flags, expiry and revocation.
- Cross-origin POST rejected; `returnTo` open-redirect fuzzing.
- CSP snapshot with zero violations on a real page; no tokens in logs.

**Acceptance on the school server**
- Entra smoke test.
- `Test-ServicePrincipalAuthorization` returns InScope true / false as expected.
- Mail arrives from `autoporada@ssps.cz`.
- A dry-run week that includes the DST Sunday.
- A restore drill.
- Screen-reader passes (NVDA, VoiceOver).
- Headmaster sign-off on the look and the Czech copy; the full-page screenshots attached to the e2e report (both projects, every screen state) are the pack for the look. DPO sign-off on the DPIA.

## 12. Defaults assumed (change any time)

- **Licence:** MIT (the repo is open source). Fixtures use only fake names.
- **Future items:** need reviewer approval. Reviewers cannot approve their own points; the headmaster can.
- **Jednání beyond the meeting week:** not shown until they enter the window.
- **Holidays:** a holiday week uses "Porada se nekoná" (skip) or a shifted `meeting_date`.
- **PDF fonts:** use Liberation and OpenSymbol unless the school licenses Times New Roman and Aptos Narrow for the server; the DOCX stays the canonical file.
- **School year:** ends 31 Aug, and the purge runs on 1 Sep.

## 13. School IT checklist (sent at M0.2)

1. Register a single-tenant web app (`Autoporada`) with redirect URI `https://autoporada.ssps.cz/auth/callback` and a certificate credential. Register a second single-tenant app (`Autoporada mail`) with no redirect URI, no API permissions and its own certificate (ADR 0021).
2. Add the ID-token optional claims `acct`, `auth_time`, `email` and `upn` (with *externally authenticated* turned on) to the web app.
3. Grant admin consent for application `User.ReadBasic.All` on the web app only.
4. Create the shared mailbox `autoporada@ssps.cz`.
5. For the mail app, run `New-ServicePrincipal`, `New-ManagementScope` and `New-ManagementRoleAssignment -Role "Application Mail.Send"`. Do **not** grant Mail.Send in Entra.
6. Create the DNS record `autoporada.ssps.cz` and open TCP 80 and 443 to the server.
7. Provide an off-site backup target.
8. Name an IT contact for alerts and patching.
9. Provide the object ID of the first headmaster.
