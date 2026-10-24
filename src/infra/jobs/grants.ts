import type { Client } from 'pg';

/**
 * What the web and the worker may do in the pg-boss schema (ADR 0015). Run as the owner after
 * every install, so a table a pg-boss upgrade adds is granted in the step that created it.
 * Idempotent. The grants in `public` (users, access_requests) are in drizzle/0008_job_roles.sql.
 */
const JOB_GRANTS = `
GRANT USAGE ON SCHEMA pgboss TO autoporada_app, autoporada_jobs;

-- producer (web, cli): read the queue cache and the version, insert jobs, read back only the id
GRANT SELECT ON pgboss.queue, pgboss.version TO autoporada_app;
GRANT INSERT, SELECT (id) ON pgboss.job, pgboss.job_common TO autoporada_app;

-- worker: everything a supervising, scheduling worker (and its producer) does; no DDL, owns nothing
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO autoporada_jobs;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autoporada_jobs;

-- Functions: PUBLIC's default EXECUTE goes (a per-schema default privilege cannot revoke it),
-- then only the worker, and for the one function a producer's insert needs, the web.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO autoporada_jobs;
GRANT EXECUTE ON FUNCTION pgboss.job_now() TO autoporada_app;
`;

export async function applyJobGrants(client: Pick<Client, 'query'>): Promise<void> {
  await client.query(JOB_GRANTS);
}
