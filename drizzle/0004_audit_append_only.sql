-- The audit log is append-only (plan §4, ADR 0010). These triggers bind the
-- schema owner as well as the app: only rows past the retention period
-- (AUDIT_RETENTION_YEARS in src/domain/retention) may be deleted.
REVOKE UPDATE, TRUNCATE ON audit_events FROM autoporada_app;
--> statement-breakpoint
CREATE FUNCTION audit_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.at < now() - interval '3 years' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'the audit log is append-only (%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_change
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();
--> statement-breakpoint
-- The database clock, not the caller, says when an event happened.
CREATE FUNCTION audit_events_stamp() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.at := now();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_stamp
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_stamp();
