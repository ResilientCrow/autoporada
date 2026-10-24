-- The role of the background worker (ADR 0015). Like the group roles of 0000,
-- production creates it in initdb because the owner has no CREATEROLE; the
-- login role of the worker is a member of this group and of nothing else.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'autoporada_jobs') THEN
    CREATE ROLE autoporada_jobs NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- What the worker's handlers read; each later milestone grants what its own handlers need.
GRANT USAGE ON SCHEMA public TO autoporada_jobs;
--> statement-breakpoint
GRANT SELECT ON users, access_requests TO autoporada_jobs;
