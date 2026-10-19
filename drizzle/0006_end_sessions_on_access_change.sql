-- A user's sessions end when their role, status or student flag changes
-- (plan §4): the next request signs in again and gets the new rights. A
-- trigger, so it binds the app, the owner and the CLI alike (ADR 0010).
CREATE FUNCTION users_end_sessions() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  DELETE FROM public.sessions WHERE user_id = NEW.id;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER users_end_sessions
  AFTER UPDATE OF role, status, is_student ON public.users
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role
     OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.is_student IS DISTINCT FROM NEW.is_student)
  EXECUTE FUNCTION users_end_sessions();
