-- At least one active headmaster always remains (plan §4). A deferred
-- constraint trigger checks at commit, so one transaction may hand the role
-- over in either order. The advisory lock serialises the check: two
-- transactions demoting the last two headmasters cannot both see the other
-- one still active.
CREATE FUNCTION users_keep_active_headmaster() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1212498244); -- 'HEAD' (0x48454144)
  IF NOT EXISTS (SELECT FROM users WHERE role = 'headmaster' AND status = 'active') THEN
    RAISE EXCEPTION 'at least one active headmaster must remain'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'users_active_headmaster';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER users_active_headmaster
  AFTER UPDATE OF role, status OR DELETE ON users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.role = 'headmaster' AND OLD.status = 'active')
  EXECUTE FUNCTION users_keep_active_headmaster();
