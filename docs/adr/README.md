# Architecture decision records

Each record states one decision, why it was made, and what follows from it.
Records are never edited after acceptance. To change a decision, add a new
record that supersedes it.

| # | Decision | Status |
|---|---|---|
| [0001](0001-stack.md) | TypeScript full stack: Next.js 16, PostgreSQL 18, Drizzle | Accepted |
| [0002](0002-authentication.md) | Entra ID OIDC via openid-client, own DB sessions | Accepted |
| [0003](0003-single-entra-app.md) | One Entra app; Mail.Send scoped by Exchange RBAC | Accepted; "One registration" superseded in part by 0021 |
| [0004](0004-module-boundaries.md) | Layered modules with enforced dependency rules | Accepted; the layer table extended in part by 0023 |
| [0005](0005-document-engine.md) | Snapshot → DocumentModel → DOCX / HTML | Accepted |
| [0006](0006-background-jobs.md) | pg-boss worker with transactional enqueue | Accepted; partly superseded by 0015 |
| [0007](0007-rich-text.md) | Restricted rich text as flat indented paragraphs | Accepted; refined by 0031 |
| [0008](0008-self-hosting.md) | Docker compose on school infrastructure | Accepted |
| [0009](0009-template-deviations.md) | Deliberate deviations from the Word template | Accepted |
| [0010](0010-database-roles.md) | Database roles, migrations and test databases | Accepted; partly superseded by 0015 |
| [0011](0011-application-core.md) | Application core: principal-bound transactions and one pipeline | Accepted; database error codes superseded in part by 0022; errors reach the client as a named cause, superseded in part by 0044 |
| [0012](0012-ui-foundation.md) | UI foundation: brand-only Tailwind, audited React Aria, no inline styles | Accepted; items 4, 6 and 9 partly superseded by 0043 |
| [0013](0013-forms-submit-through-actions.md) | Forms submit through actions: one hook, typed problems, refresh after success | Accepted; items 1 and 4, and the no-client-refresh rule, superseded in part by 0017 and 0025; `unavailable` no longer shows the request id, superseded in part by 0044 |
| [0014](0014-access-and-users.md) | Access requests and user administration | Accepted; item 13 superseded by 0016 |
| [0015](0015-worker-and-job-roles.md) | Worker, jobs and database roles | Accepted |
| [0016](0016-mail-delivery.md) | Mail delivery: ledger, throttle and Graph transport | Accepted; items 10 and 11 superseded in part by 0020 |
| [0017](0017-autosaving-editors.md) | Autosaving editors: no refresh on save, version-keyed remount, flush on leave | Accepted; items 5 and 7 superseded in part by 0024 |
| [0018](0018-points-and-issues.md) | Points and issues: jsonb content, frozen deadlines, before values, draft privacy | Accepted; item 3 (`submitted_at` never cleared) superseded in part by 0026; item 8 superseded in part and item 1 widened by 0030; item 1 refined by 0032 and 0034; item 10 superseded by 0046; the skip and unskip of item 1 superseded by 0054 |
| [0019](0019-people-memory-and-directory-search.md) | People memory from own points, directory search, React Aria audit | Accepted |
| [0020](0020-submission-mails.md) | Submission mails: counts, links, recipients | Accepted; item 4 (digest and headmaster summary) superseded in part by 0037; items 3 and 5 (soft audience, opt-out) superseded in part by 0046 |
| [0021](0021-web-access-to-graph.md) | Web access to Graph: a registration of its own, the `ap-edge` bridge | Accepted |
| [0022](0022-database-errors-by-constraint-name.md) | Database errors by constraint name | Accepted |
| [0023](0023-zod-jitless-in-the-browser.md) | Zod runs jitless in the browser | Accepted |
| [0024](0024-autosave-announcements-and-flush-answers.md) | Autosave: one announcement, flush answers while the page lives | Accepted |
| [0025](0025-review-moves-to-the-next-point.md) | Review moves to the next point from the client | Accepted |
| [0026](0026-retract-clears-the-hand-in.md) | A retract clears the hand-in | Accepted |
| [0027](0027-start-report-goes-to-its-draft.md) | „Napsat zprávu“ goes to its draft from the client | Accepted |
| [0028](0028-digest-of-requests-links-the-users-page.md) | A digest of access requests links the users page | Accepted; the digest is switched off by 0037 |
| [0029](0029-points-go-to-an-issue-by-their-due-monday.md) | Points go to an issue by their due Monday | Accepted; skipped slots superseded by 0054 |
| [0030](0030-the-issue-outline.md) | The issue outline | Accepted; item 5 (a write forgets a returned proposal's placement) superseded in part by 0036; the skipped-source „pass“ superseded by 0054 |
| [0031](0031-rich-text-editor-under-the-nonce-csp.md) | Rich-text editor under the nonce CSP | Accepted |
| [0032](0032-settings-and-the-meeting-relative-deadline.md) | Settings and the meeting-relative deadline | Accepted; the user's opt-out sentence of item 3 superseded by 0046; calendar edits take the lock in update mode, amended by 0054 |
| [0033](0033-registry-without-people-ids.md) | Registry without people ids | Accepted |
| [0034](0034-a-porada-is-a-monday-slot-with-a-free-meeting-date.md) | A porada is a Monday slot with a free meeting date | Accepted; item 6 (the moved mail) superseded by 0037; item 3 (`issues.move`) and part of item 2 superseded by 0051; item 7 and „non-skipped“ in item 2 superseded by 0054; item 5 (window ends) superseded in part by 0059 |
| [0035](0035-late-event-reports.md) | Late-event reports | Accepted; item 9 (the headmaster's late summary) superseded by 0037 |
| [0036](0036-a-returned-proposal-keeps-its-place.md) | A returned proposal keeps its place in the outline | Accepted |
| [0037](0037-four-mails-switched-off.md) | Four mails switched off | Accepted |
| [0038](0038-generation-and-the-archive.md) | Generation and the archive | Accepted; item 4 (the worker's grant on the DOCX) superseded by 0039 |
| [0039](0039-the-worker-sees-only-the-docx-it-converts.md) | The worker sees only the DOCX it converts | Accepted |
| [0040](0040-poradas-are-generated-in-order.md) | Poradas are generated in order | Accepted; amended by 0054 (open poradas only) |
| [0041](0041-no-unskip-behind-a-generated-porada.md) | No unskip behind a generated porada | Accepted; superseded by 0054 |
| [0042](0042-development-allows-inline-style-elements.md) | Development allows inline style elements | Accepted |
| [0043](0043-ui-layout-primitives-link-kinds-and-one-frame.md) | UI layout primitives, link kinds and one frame | Accepted; supersedes 0012 items 4, 6 and 9 in part |
| [0044](0044-errors-name-what-failed.md) | Errors name what failed | Accepted; supersedes 0011's error bullet and 0013's `unavailable` text in part; amended by 0045 |
| [0045](0045-error-kinds-amendments.md) | Error kinds and surfaces: amendments to 0044 | Accepted; amends 0044 |
| [0046](0046-the-soft-reminder-asks-for-owed-reports.md) | The soft reminder asks for owed reports, and no one opts out | Accepted; supersedes 0018 item 10, 0020 items 3 and 5 and 0032 item 3 in part; item 2 amended by 0054 |
| [0047](0047-skip-until-a-chosen-porada.md) | Skip until a chosen porada, from a dialog | Accepted; adds to 0018, 0034 and 0041; adds `Dialog` to the kit; items 1 and 2 superseded by 0051; item 3 superseded by 0054 |
| [0048](0048-every-approved-akce-owes-a-report.md) | Every approved akce owes a report, and nobody declines it | Accepted; supersedes 0020 item 4, 0027 items 2 and 3, 0035 item 6 and 0046 items 1 and 3 in part |
| [0049](0049-an-akce-report-goes-to-its-porada-or-a-placeholder-does.md) | An akce's report goes to its porada, or a placeholder does | Accepted; supersedes 0029 and 0035 item 4 in part (akce reports only); adds to 0038; amended by 0054 (Mondays with no porada); item 3 superseded in part by 0056 |
| [0050](0050-development-clamps-a-negative-measure-end.md) | Development clamps a negative measure end | Accepted; adds to 0023 |
| [0051](0051-the-next-porada-on-any-date.md) | The next porada on any date, and no move page | Accepted; supersedes 0047 items 1 and 2 and 0034 item 3 and part of item 2; items 2 to 5 superseded by 0054 |
| [0052](0052-owed-reports-first-proposals-for-vedeni.md) | Owed reports come first, and only vedení proposes | Accepted; builds on 0049; bounds the report card left open by 0048; amended by 0054 |
| [0053](0053-the-arch-ui-at-the-root.md) | The Arch UI at the root, on the same backend | Accepted; builds on 0004, 0012, 0017 and 0043 |
| [0054](0054-a-porada-that-does-not-take-place-does-not-exist.md) | A porada that does not take place does not exist: move, drop, add | Accepted; supersedes 0041, 0051 items 2 to 5, 0047 item 3, 0034 item 7 and parts of 0018, 0029, 0030; amends 0032, 0040, 0046, 0049, 0052 |
| [0055](0055-the-headmaster-deletes-an-unused-point-type.md) | The headmaster deletes a point type no point uses | Accepted; adds to 0053 |
| [0056](0056-a-refused-report-closes-its-akce.md) | A refused report closes its akce | Accepted; supersedes 0049 item 3 in part; builds on 0052 |
| [0057](0057-the-author-deletes-an-unfinished-akce.md) | The author deletes an unfinished akce or schůzka | Accepted; adds to 0053 |
| [0058](0058-a-return-names-the-parts-to-rework.md) | A return names the parts to rework | Accepted; adds to 0053 |
| [0059](0059-the-agenda-windows-end-where-the-monday-porada-would.md) | The agenda windows end where the Monday porada would | Accepted; supersedes 0034 item 5 in part |
| [0060](0060-akce-and-jednani-as-free-text.md) | Akce and jednání are free text | Accepted; supersedes 0009 in part, 0049 item 4, 0058 item 1, 0018 item 9; amends 0049 item 3 |
| [0061](0061-missing-report-placeholders-are-checked-before-generation.md) | Missing-report placeholders are checked before generation | Accepted; amends 0049 items 5 and 7, 0060 item 7, 0053 |
| [0062](0062-cancelling-an-approved-akce-waits-for-vedeni.md) | Cancelling an approved akce waits for vedení | Accepted; adds to 0057 |
