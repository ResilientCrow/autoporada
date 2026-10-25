-- Optimistic versions (design §2): every repository UPDATE sets
-- version = version + 1 WHERE version = the expected one. This trigger
-- binds the owner and the CLI too, so no write can skip or reuse a version.
-- A hit is a bug, not a race: version_bump is not a known constraint.
-- Later tables attach the same function with their own trigger.
CREATE FUNCTION version_bump() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'version must rise by one'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'version_bump';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER issues_version_bump
  BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION version_bump();
