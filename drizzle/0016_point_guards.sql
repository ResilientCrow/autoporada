-- Optimistic versions for points: the same version_bump() as issues (0012).
CREATE TRIGGER points_version_bump
  BEFORE UPDATE ON public.points
  FOR EACH ROW EXECUTE FUNCTION version_bump();
--> statement-breakpoint
-- The first submit fixes the earliest meeting a point may go to (design §2);
-- a later submit, a return or a retract never moves it. A hit is a bug, not
-- a race: points_earliest_fixed is not a known constraint.
CREATE FUNCTION points_earliest_fixed() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.earliest_monday IS NOT NULL
     AND NEW.earliest_monday IS DISTINCT FROM OLD.earliest_monday THEN
    RAISE EXCEPTION 'earliest_monday is set once'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'points_earliest_fixed';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER points_earliest_fixed
  BEFORE UPDATE ON public.points
  FOR EACH ROW EXECUTE FUNCTION points_earliest_fixed();
--> statement-breakpoint
-- Point events are append-only, like the audit log (0004). The trigger binds
-- the schema owner as well as the app. The app may not delete an event
-- either: deleting a point still deletes its events, because a foreign key's
-- cascade runs as the owner of point_events.
REVOKE UPDATE, DELETE, TRUNCATE ON public.point_events FROM autoporada_app;
--> statement-breakpoint
CREATE FUNCTION point_events_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'point events are append-only (%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER point_events_no_update
  BEFORE UPDATE ON public.point_events
  FOR EACH ROW EXECUTE FUNCTION point_events_append_only();
--> statement-breakpoint
CREATE TRIGGER point_events_no_truncate
  BEFORE TRUNCATE ON public.point_events
  FOR EACH STATEMENT EXECUTE FUNCTION point_events_append_only();
