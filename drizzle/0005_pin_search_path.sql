-- Trigger functions resolve table names through search_path, and pg_temp is
-- searched first: a temporary table named users would hide public.users
-- from the headmaster check. Every trigger function pins its search path
-- (temporary schema last) and qualifies its tables, and no role of the app
-- may create temporary objects at all.
CREATE OR REPLACE FUNCTION users_keep_active_headmaster() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1212498244); -- 'HEAD' (0x48454144)
  IF NOT EXISTS (SELECT FROM public.users WHERE role = 'headmaster' AND status = 'active') THEN
    RAISE EXCEPTION 'at least one active headmaster must remain'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'users_active_headmaster';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
ALTER FUNCTION audit_events_append_only() SET search_path = pg_catalog, public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION audit_events_stamp() SET search_path = pg_catalog, public, pg_temp;
--> statement-breakpoint
-- Effective when the migrator owns the database (ADR 0010).
DO $$
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END
$$;
