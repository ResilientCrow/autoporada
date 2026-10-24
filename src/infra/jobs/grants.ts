import type { Client } from 'pg';

/**
 * What the web and the worker may do in the pg-boss schema (ADR 0015). Run as the owner after
 * every install; idempotent. The grants in `public` (users, access_requests) are in
 * drizzle/0008_job_roles.sql.
 *
 * The worker group is granted table by table what pg-boss 12.38 runs for a worker instance
 * (migrate: false, supervise, schedule, no registry, no persisted stats or warnings) and its
 * producer. Nothing on pgboss.bam: the owner's next migrate runs its `command` rows as SQL. No
 * default privileges either: a table a later pg-boss adds stays denied until a reviewed commit
 * grants it (test/integration/jobs/grants.test.ts lists every table).
 */
const JOB_GRANTS = `
GRANT USAGE ON SCHEMA pgboss TO autoporada_app, autoporada_jobs;

-- producer (web, cli): read the queue cache and the version, insert jobs, read back only the id
GRANT SELECT ON pgboss.queue, pgboss.version TO autoporada_app;
GRANT INSERT, SELECT (id) ON pgboss.job, pgboss.job_common TO autoporada_app;

-- worker: first whatever an earlier release granted (all tables, and the default for new ones)
REVOKE ALL ON ALL TABLES IN SCHEMA pgboss FROM autoporada_jobs;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss REVOKE ALL ON TABLES FROM autoporada_jobs;
-- fetch, settle, retry, dead-letter, expire and delete jobs; send them (cron, handlers)
GRANT SELECT, INSERT, UPDATE, DELETE ON pgboss.job, pgboss.job_common TO autoporada_jobs;
-- schedule, unschedule, getSchedules; the cron pass stamps last_job_id and kind
GRANT SELECT, INSERT, UPDATE, DELETE ON pgboss.schedule TO autoporada_jobs;
-- the queue cache; create_queue's insert (ON CONFLICT DO NOTHING) of the cron queue at every
-- start; the monitor's and the sweep's claims and cached counts, never a queue's name, table or settings
GRANT SELECT, INSERT ON pgboss.queue TO autoporada_jobs;
GRANT UPDATE (monitor_claim_on, monitor_on, maintain_on, deferred_count, blocked_count, queued_count,
  ready_count, active_count, failed_count, total_count, retained_count, retained_on,
  singletons_active, ready_history) ON pgboss.queue TO autoporada_jobs;
-- the schema check reads the version; the cron, flow and vacuum-backoff claims stamp their column
GRANT SELECT ON pgboss.version TO autoporada_jobs;
GRANT UPDATE (cron_on, flow_on, monitor_backoff_on) ON pgboss.version TO autoporada_jobs;
-- the flow poll reads dependencies and the sweep deletes the orphaned ones
GRANT SELECT, DELETE ON pgboss.job_dependency TO autoporada_jobs;
-- the sweep prunes dead instances whether or not this one registers; it locks the rows first
-- (FOR UPDATE), which needs UPDATE on a column, so the one it would least matter to change
GRANT SELECT, DELETE, UPDATE (stopped_on) ON pgboss.instance TO autoporada_jobs;

-- Functions: PUBLIC's default EXECUTE goes (a per-schema default privilege cannot revoke it),
-- then only the worker, and for the one function a producer's insert needs, the web.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO autoporada_jobs;
GRANT EXECUTE ON FUNCTION pgboss.job_now() TO autoporada_app;
`;

export async function applyJobGrants(client: Pick<Client, 'query'>): Promise<void> {
  await client.query(JOB_GRANTS);
}
