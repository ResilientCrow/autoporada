-- Guards for future items (design §2), in the style of 0012 and 0016.
-- Optimistic versions: the same version_bump() as issues (0012).
CREATE TRIGGER future_items_version_bump
  BEFORE UPDATE ON public.future_items
  FOR EACH ROW EXECUTE FUNCTION version_bump();
--> statement-breakpoint
-- The report point's link to the akce it answers. It could not be declared in
-- the Drizzle schema without a circular import (future_items already refers to
-- points). No cascade: SET NULL would update points without a version bump,
-- and neither side may be deleted from under the other.
ALTER TABLE public.points
  ADD CONSTRAINT points_future_item_id_future_items_id_fk
  FOREIGN KEY (future_item_id) REFERENCES public.future_items (id);
--> statement-breakpoint
-- Future events are append-only, like point events (0016): the trigger binds
-- the schema owner as well as the app, and deleting an item still deletes its
-- events, because a foreign key's cascade runs as the owner of future_events.
REVOKE UPDATE, DELETE, TRUNCATE ON public.future_events FROM autoporada_app;
--> statement-breakpoint
CREATE FUNCTION future_events_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'future events are append-only (%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint
CREATE TRIGGER future_events_no_update
  BEFORE UPDATE ON public.future_events
  FOR EACH ROW EXECUTE FUNCTION future_events_append_only();
--> statement-breakpoint
CREATE TRIGGER future_events_no_truncate
  BEFORE TRUNCATE ON public.future_events
  FOR EACH STATEMENT EXECUTE FUNCTION future_events_append_only();
