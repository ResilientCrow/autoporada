-- Optimistic versions for the registry: the same version_bump() as issues (0012).
CREATE TRIGGER registry_lists_version_bump
  BEFORE UPDATE ON public.registry_lists
  FOR EACH ROW EXECUTE FUNCTION version_bump();
--> statement-breakpoint
CREATE TRIGGER registry_entries_version_bump
  BEFORE UPDATE ON public.registry_entries
  FOR EACH ROW EXECUTE FUNCTION version_bump();
--> statement-breakpoint
-- The four lists of the template (ADR 0033), with fixed ids and no entries. The document labels
-- are those of test/fixtures/snapshots/template-replica.json; the titles are the screen's names.
INSERT INTO public.registry_lists (id, key, title, doc_label, purpose, position) VALUES
  ('0198f000-0000-7000-8000-000000000001', 'talent', 'Talentovaní studenti',
   'Program na podporu talentovaných a aktivních studentů', 'annex1', 1),
  ('0198f000-0000-7000-8000-000000000002', 'aj-certifikat', 'Angličtina – certifikáty',
   'seznam studentů uvolněných z Anglického jazyka na základě získaných certifikátů', 'point4', 2),
  ('0198f000-0000-7000-8000-000000000003', 'aj-prezkouseni', 'Angličtina – přezkoušení',
   'seznam studentů uvolněných z Anglického jazyka na základě přezkoušení', 'point4', 3),
  ('0198f000-0000-7000-8000-000000000004', 'nj-certifikat', 'Němčina – certifikáty',
   'seznam studentů uvolněných z Německého jazyka na základě získaných certifikátů', 'point4', 4);
