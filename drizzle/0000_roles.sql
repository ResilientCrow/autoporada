-- Database roles (ADR 0010). These group roles carry the privileges; the
-- operator creates the login roles (web, worker, backup) and grants them
-- membership. If the operator created the group roles already, nothing here
-- needs CREATEROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'autoporada_app') THEN
    CREATE ROLE autoporada_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'autoporada_backup') THEN
    CREATE ROLE autoporada_backup NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- Only the owner creates objects; the app and the backup only use them.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO autoporada_app, autoporada_backup;
--> statement-breakpoint
-- Every table a later migration creates is granted here, once. Exceptions
-- (the append-only audit log) revoke in their own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autoporada_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO autoporada_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO autoporada_backup;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO autoporada_backup;
--> statement-breakpoint
-- The backup also keeps the migration history, so a restore knows its version.
GRANT USAGE ON SCHEMA drizzle TO autoporada_backup;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO autoporada_backup;
--> statement-breakpoint
GRANT SELECT ON ALL SEQUENCES IN SCHEMA drizzle TO autoporada_backup;
