# 0022 — Database errors by constraint name

Supersedes in part: ADR 0011 (errors: database errors leave infra carrying
the SQLSTATE or the name of the refusing constraint, a schema identifier).

## Context

ADR 0011 lets a database error leave infra as a port error carrying the
SQLSTATE only, so no SQL, parameters or message reach the logs. A constraint
in `KNOWN_CONSTRAINTS` becomes a `ConstraintViolation` and a typed rule. M8
adds many CHECKs that back up Zod and the use cases (`points_dates`,
`points_submitted_complete`, `version_bump`, …) and are not registered,
because a race cannot trip them (ADR 0018). A hit is a bug or a bypassed
check, and as `23514` alone the log cannot say which one refused.

## Decision

1. When a constraint that is not in `KNOWN_CONSTRAINTS` refuses a statement,
   infra throws `DatabaseFailure('db.constraint.<name>')`, with the name
   PostgreSQL reports. Without a constraint name it stays the SQLSTATE.
2. A constraint name is a schema identifier written in our migrations. It
   holds no data, so it may be logged like a SQLSTATE. The SQL, its
   parameters and the database message still never leave infra.
3. Registered constraints are unchanged: they become a `ConstraintViolation`
   and the runner maps them to a rule.

## Options rejected

- **Registering every CHECK.** The registry is for outcomes a user can cause
  at commit; a bug would turn into a polite form message.
- **Logging the message.** A PostgreSQL message can quote a value, and point
  content holds minors' data.

## Consequences

- `DatabaseFailure.sqlstate` keeps its name but holds a code: the SQLSTATE,
  `db.constraint.<name>`, or a parse code such as `db.parse.point_types` for
  a stored row its contract refuses. The log field stays `sqlstate`.
- The fake world throws the same `db.constraint.<name>` where a port contract
  checks a constraint hit, so both worlds agree (the mail ledger first).
- Renaming a constraint changes its log code; the guard tests name each one.
