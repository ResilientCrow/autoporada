# Architecture decision records

Each record states one decision, why it was made, and what follows from it.
Records are never edited after acceptance. To change a decision, add a new
record that supersedes it.

| # | Decision | Status |
|---|---|---|
| [0001](0001-stack.md) | TypeScript full stack: Next.js 16, PostgreSQL 18, Drizzle | Accepted |
| [0002](0002-authentication.md) | Entra ID OIDC via openid-client, own DB sessions | Accepted |
| [0003](0003-single-entra-app.md) | One Entra app; Mail.Send scoped by Exchange RBAC | Accepted |
| [0004](0004-module-boundaries.md) | Layered modules with enforced dependency rules | Accepted |
| [0005](0005-document-engine.md) | Snapshot → DocumentModel → DOCX / HTML | Accepted |
| [0006](0006-background-jobs.md) | pg-boss worker with transactional enqueue | Accepted; partly superseded by 0015 |
| [0007](0007-rich-text.md) | Restricted rich text as flat indented paragraphs | Accepted |
| [0008](0008-self-hosting.md) | Docker compose on school infrastructure | Accepted |
| [0009](0009-template-deviations.md) | Deliberate deviations from the Word template | Accepted |
| [0010](0010-database-roles.md) | Database roles, migrations and test databases | Accepted; partly superseded by 0015 |
| [0011](0011-application-core.md) | Application core: principal-bound transactions and one pipeline | Accepted |
| [0012](0012-ui-foundation.md) | UI foundation: brand-only Tailwind, audited React Aria, no inline styles | Accepted |
| [0013](0013-forms-submit-through-actions.md) | Forms submit through actions: one hook, typed problems, refresh after success | Accepted; items 1 and 4, and the no-client-refresh rule, superseded in part by 0017 |
| [0014](0014-access-and-users.md) | Access requests and user administration | Accepted; item 13 superseded by 0016 |
| [0015](0015-worker-and-job-roles.md) | Worker, jobs and database roles | Accepted |
| [0016](0016-mail-delivery.md) | Mail delivery: ledger, throttle and Graph transport | Accepted; items 10 and 11 superseded in part by 0020 |
| [0017](0017-autosaving-editors.md) | Autosaving editors: no refresh on save, version-keyed remount, flush on leave | Accepted |
| [0018](0018-points-and-issues.md) | Points and issues: jsonb content, frozen deadlines, before values, draft privacy | Accepted |
| [0019](0019-people-memory-and-directory-search.md) | People memory from own points, directory search, React Aria audit | Accepted |
| [0020](0020-submission-mails.md) | Submission mails: counts, links, recipients | Accepted |
