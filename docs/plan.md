# Autoporada — plan of record

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
| Login | Microsoft 365 SSO only, with a **single** single-tenant Entra app registered by school IT and authenticated by a certificate (`private_key_jwt`). The app is reachable from the internet on its own subdomain (e.g. `autoporada.ssps.cz`), with Let's Encrypt HTTPS. |
| Access | Anyone in the tenant can sign in. Only allow-listed users can submit; everyone else gets "Požádat o přístup", and the headmaster approves the request and sets the student/staff flag. |
| Roles | `pending` → `submitter` → `reviewer` (approve, edit, return, reject points) → `headmaster` (everything else, plus generating the document). Students can only ever be `submitter`. |
| What submitters may add | Report points (PROVOZ), future items (jednání / akce), HOSPODAŘENÍ items, other POKYNY points. Ohlasy (media and partners) are headmaster-only. |
| Future items | Placed in the document by date (§6). After an event, its author is prompted to write the report. Each line, in the headmaster's format (checkpoint M2): "úterý 13. října 2026, 7.00 až 14.00 hodin, areál Smíchov, Next Zone Event Space, akce Vaib, za Next Zone Event Space koordinuje absolvent pan Jan Absolon". Every part after the date is optional; multi-day items read "20. až 22. října 2026, …" without times. The responsible part has a verb (organizuje / koordinuje / zajišťuje / vede), an optional "za …" and people with an optional role. |
| Standing POKYNY | Carried over from the previous issue. Edited in a restricted rich-text editor (3 indent levels: o / o / ■). Each item is standing or one-time and can be reordered. |
| Report point form | Structured fields (title, date, from–to, areál, room, organisers) produce a pre-written opening sentence in the house style, which the submitter can edit freely. Point types are defined by admins, each with default labelled bullets. A participant list and at least one vyjádření are mandatory. No photos. |
| Names | A person is title (pan / paní / slečna) + name + class/role. Lists group people by title with plural forms. The 2nd case is suggested and can be corrected. The picker searches the M365 directory; title, class and 2nd case are remembered locally. |
| Weekly cycle | One issue per Monday. Configurable deadline (default Sunday 18:00); later submissions go to the next issue. E-mail reminders and status notifications. Generating locks the issue, archives it and prepares the next one. Reopening and regenerating keep every version. |
| Which reports go in | Every approved, unpublished report whose event took place before the meeting, oldest first (date, then time). |
| Output | DOCX in the exact current look (black and white, Times New Roman), plus a PDF. Every version is archived; download only. **The reference for the "exact look" is Microsoft Word.** |
| Student lists | One registry of named lists: Příloha 1 (the talent programme) and the point-4 exemptions, with more addable. Sorted by class, then surname. Students added since the last issue are **bold**. "Nový školní rok" resets the lists. |
| Příloha 1 table | Two columns. **Each column starts with the "Jméno a příjmení \| Třída" header. No padding rows.** |
| Příloha 2 | Optional free-form admin content, left out when empty. |
| Go-live content | A **seed** of the template's standing structure (POKYNY headings, standard texts, default lists, point types) with no personal data, all editable in the admin panel. A bulk-paste helper fills the registry. No importer from old files. |
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
| Jobs | **pg-boss 12** in a separate `worker` container (same image), with Europe/Prague cron | No Redis; jobs are enqueued inside the business transaction |
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
  ui/            theme/ copy/ kit/ form/ shell/ features/<feature>/ (ADR 0012); editor, paper preview later
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
- Required only for role and user changes (`users.manage`) and for "Nový školní rok". Approving an access request does not need it: it only grants the submitter role, and every submission is still reviewed. Elsewhere, destructive actions get confirmation dialogs (typed confirmation where it matters).
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
  - nonce-based CSP;
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
| access requests | 3/day, with a 30-day cooldown after rejection |

**Audit log**
- An append-only `audit_event` table; a trigger blocks UPDATE and DELETE for the app role.
- Logged: logins, access decisions, role changes, state transitions, reviewer and headmaster edits (with a diff), POKYNY/registry/settings changes, generations (with SHA-256) and downloads.
- Author autosaves are not logged.

**Secrets**
- Docker secrets: DB passwords, the Entra certificate key and `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- `.env` is validated by Zod in `instrumentation.ts` at boot; a bad value stops the server.
- `APP_ENV` (development / test / production) switches on production hardening. It is separate from `NODE_ENV`, which `next start` always sets to production, and is required whenever `NODE_ENV=production`.
- A Server Actions key given as a Docker secret is copied into `process.env` at boot, because Next.js reads it only from there.
- Three DB roles: `migrator`, `app` and `backup`.
- An alert fires 45 days before the certificate expires.

**Graph least privilege**
- Delegated: `openid profile email User.Read`, with no `offline_access` and no stored user tokens.
- Application: `User.ReadBasic.All` (admin consent) for people search: `$search` with `ConsistencyLevel: eventual`, at least 3 characters, a minimal `$select`, results not cached.
- `Mail.Send` only through the Exchange RBAC management scope on `autoporada@ssps.cz`.

**Containers**
- Non-root, `read_only`, `cap_drop: ALL`, `no-new-privileges`, pinned digests.
- Internal networks: Gotenberg and Postgres are never exposed.
- A `cli` maintenance container gives IT a shell for debugging.

**Logs.** pino redacts cookies, tokens, `code` and request bodies. PG errors are logged as code only, actors as UUIDs, and the error page shows a `reqId`.

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
- `point_types(name, title_gender, default_bullets jsonb[{key,label,kind people|text,required}], active, position)`
  - The admin sets `title_gender` through a sample sentence: proběhl / proběhla / proběhlo / proběhly.
  - The "Jiné" type is seeded and locked.

**Points**
- `points(kind report|finance|pokyn, author_id, state, version, type_id, title, event_date, end_date, time_from, time_to, campus, place, body jsonb, earliest_monday, published_issue_id?, future_item_id?, review_note, …)`
  - CHECK `(state='published') = (published_issue_id IS NOT NULL)`.
  - `earliest_monday` is set at first submit and kept across returns, which gives deterministic late roll-over.
- `point_bullets`, `point_people` (frozen copy plus `person_id`), `point_statements(speaker_genitive, affiliation, quote)`
- `point_events(point_id, at, actor_id, from_state, to_state, note)`: the user-facing timeline, independent of audit retention.
- `future_items(kind jednani|akce, author_id, state, version, title, start_date, end_date, time_from, time_to, campus, place, expects_report, report_state none|prompted|written|declined, report_point_id?)`

**Issues and output**
- `issues(monday UNIQUE, meeting_date?, school_year, status open|generated|skipped, deadline_at, present_text, guests_text, annex2 jsonb?, current_version)`
  - `meeting_date` covers holiday shifts (e.g. Tuesday after Easter Monday). The title and closing use it; the date windows use `monday`.
- `issue_items(issue_id, section pokyny|hospodareni, slot, position, lineage_id, title, body jsonb, persistence standing|once, source_point_id?)`
  - `slot` marks system items: meetings, events, talent, exemptions, media, partners.
  - Points 3 and 4 carry editable intro text with a `{skolniRok}` token.
- `registry_lists(key, title, doc_label, purpose annex1|point4, position, active)`
- `registry_entries(list_id, person_id, display_name, class_code, added_at, removed_at, archived_year, first_published_issue_id?)`
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
- After the end date, `report_state` goes none → prompted → written or declined.

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

**Routing future items** (approved, not cancelled, M = the meeting Monday)

| Item | Window | Goes to |
|---|---|---|
| jednání | overlaps [M, M+7] | point 1 |
| akce | overlaps [M, M+14] | point 2 |
| akce | starts after M+14 | last PROVOZ point, "Další doposud známé akce školy" |

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
| `/prihlaseni`, `/pristup` | all / pending | "Přihlásit se účtem školy"; access request with reason and its state |
| `/` Přehled | submitter+ | Deadline card, "Vráceno" card, "Akce čekající na zprávu" card, quick actions |
| `/body`, `/body/novy?typ=`, `/body/[id]` | author | Report editor beside a sticky A4 preview (≥1024 px; a Formulář \| Náhled toggle below that). Autosave and a timeline. |
| `/akce`, `/akce/nova` | submitter+ | Future items by week, plus a strip showing where each item will appear |
| `/navrhy/novy` | submitter+ | Proposals for POKYNY (x) and HOSPODAŘENÍ |
| `/kontrola`, `/kontrola/[id]` | reviewer+ | Queue by section; split view of form, preview and history; return templates |
| `/porada/[datum]/…` | headmaster | Weekly stepper: Uzávěrka → Kontrola → Přítomni/Hosté → Pokyny → Registr → Náhled → Vygenerovat (with preflight) |
| `/archiv` | reviewer+ | Versions with DOCX and PDF downloads |
| `/registr` | reviewer read, headmaster write | Lists, NOVÉ tags, bulk paste (class codes normalised), "Nový školní rok" |
| `/nastaveni`, `/uzivatele` | headmaster | Deadline, texts, point types, reminders; users, roles, access requests |
| `/profil`, `/ochrana-osobnich-udaju`, `/napoveda` | all | E-mail preferences, "Odhlásit všude", privacy, house-style guide |

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
| `mail.send` | enqueued in the transaction | Graph sendMail, throttled to ≤20/min, dedupe key, `Retry-After` honoured, retries plus a dead-letter queue (at-least-once with deduplication) |
| `reminders.deadline` | every 15 min | Deadline −2 days at 13:00 to active submitters (opt-out); deadline day at 12:00 to authors with drafts or returned points. Spread out over time. |
| `reviewer.digest` | every 15 min | New submissions |
| `headmaster.summary` | deadline + 5 min | Counts: approved, pending, returned |
| `future.report-prompt` | daily 08:00 | Day after the event; one nudge after 7 days, at most 2 |
| `pdf.render` | at generation | Gotenberg |
| `retention.daily` | 03:15 | Expired sessions and auth transactions, old jobs |
| `retention.school-year` | 1 Sep | Purge drafts, rejected and withdrawn points, decided requests, unreferenced people; audit log older than 3 years |
| `ops.check` | daily 07:00 | Backup age (local and off-site), dead-letter queue, certificate expiry, disk. Mails the IT contact and shows a banner to the headmaster. |
| backup sidecar | nightly 02:30 | `pg_dump` → restore-verify into a throwaway database → `age`-encrypt (public key only) → off-site copy (SFTP/rsync, SMB NAS or S3-compatible). The private key stays offline; a manual restore drill every quarter. |

Immediate notifications:
- point approved, returned or rejected → the author;
- access request decided → the requester.

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

**M7 Worker & mail**
1. pg-boss worker, cron registry, transactional `JobPort`
2. Graph mail transport + throttle
3. SMTP (Mailpit) transport + Czech templates
4. access notifications

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
- Headmaster sign-off on the look and the Czech copy; DPO sign-off on the DPIA.

## 12. Defaults assumed (change any time)

- **Licence:** MIT (the repo is open source). Fixtures use only fake names.
- **Future items:** need reviewer approval. Reviewers cannot approve their own points; the headmaster can.
- **Jednání beyond the meeting week:** not shown until they enter the window.
- **Holidays:** a holiday week uses "Porada se nekoná" (skip) or a shifted `meeting_date`.
- **PDF fonts:** use Liberation and OpenSymbol unless the school licenses Times New Roman and Aptos Narrow for the server; the DOCX stays the canonical file.
- **School year:** ends 31 Aug, and the purge runs on 1 Sep.

## 13. School IT checklist (sent at M0.2)

1. Register a single-tenant web app with redirect URI `https://autoporada.ssps.cz/auth/callback` and a certificate credential.
2. Add the ID-token optional claims `acct`, `auth_time`, `email` and `upn` (with *externally authenticated* turned on).
3. Grant admin consent for application `User.ReadBasic.All`.
4. Create the shared mailbox `autoporada@ssps.cz`.
5. Run `New-ServicePrincipal`, `New-ManagementScope` and `New-ManagementRoleAssignment -Role "Application Mail.Send"`. Do **not** grant Mail.Send in Entra.
6. Create the DNS record `autoporada.ssps.cz` and open TCP 80 and 443 to the server.
7. Provide an off-site backup target.
8. Name an IT contact for alerts and patching.
9. Provide the object ID of the first headmaster.
