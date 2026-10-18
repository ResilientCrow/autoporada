# 0008 — Docker compose on school infrastructure

## Context

The app stores the names and statements of minors. The school wants that data
on infrastructure it controls, and the school has little operations capacity.

## Decision

- One `compose.yaml` with these services:
  - `caddy` (automatic HTTPS, the only published port);
  - `web`, `worker` and `migrate` (one-shot);
  - `postgres` 18;
  - `gotenberg`;
  - `backup`.
- Containers run non-root and `read_only`, with `cap_drop: ALL`, pinned
  digests and internal networks. Postgres and Gotenberg are never exposed.
- Backups, nightly:
  1. `pg_dump`;
  2. restore-verify into a throwaway database;
  3. encrypt with `age` (public key only on the server);
  4. copy off the server.
- Secrets live in Docker secrets, and `.env` is validated at boot.
- A `cli` service gives IT a shell for maintenance, because the runtime image
  has none.

## Consequences

- Minimum host: 2 vCPU, 6 GB RAM, 40 GB disk.
- The RUNBOOK covers install, update (with a backup before migrating),
  restore, and the PostgreSQL major upgrade.
