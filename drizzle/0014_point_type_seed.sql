-- Optimistic versions for point types: the same version_bump() as issues (0012).
CREATE TRIGGER point_types_version_bump
  BEFORE UPDATE ON public.point_types
  FOR EACH ROW EXECUTE FUNCTION version_bump();
--> statement-breakpoint
-- PLACEHOLDER SEEDS until the school says which types and bullets it uses
-- (design spike S6; ask the headmaster). The admin edits them from M8b
-- commit 49 on. Bullet keys are stable ASCII slugs: drafts copy them, so a
-- key is never renamed. At most one bullet per type has role 'organisers'.
-- "Jiné" is locked: it stays active so there is always a type to choose.
INSERT INTO public.point_types (name, title_gender, default_bullets, locked, position) VALUES
  ('Seminář', 'm', '[
    {"key":"organisers","label":"Organizátoři","kind":"people","required":true,"role":"organisers"},
    {"key":"participants","label":"Účastníci","kind":"people","required":true}
  ]', false, 1),
  ('Exkurze', 'f', '[
    {"key":"organisers","label":"Organizátoři","kind":"people","required":false,"role":"organisers"},
    {"key":"participants","label":"Účastníci","kind":"people","required":true}
  ]', false, 2),
  ('Soutěž', 'f', '[
    {"key":"organisers","label":"Organizátoři","kind":"people","required":false,"role":"organisers"},
    {"key":"participants","label":"Účastníci","kind":"people","required":false},
    {"key":"results","label":"Výsledky","kind":"text","required":false}
  ]', false, 3),
  ('Přednáška', 'f', '[
    {"key":"speakers","label":"Přednášející","kind":"people","required":false,"role":"organisers"},
    {"key":"audience","label":"Posluchači","kind":"text","required":false}
  ]', false, 4),
  ('Projektový den', 'm', '[
    {"key":"organisers","label":"Organizátoři","kind":"people","required":false,"role":"organisers"},
    {"key":"participants","label":"Účastníci","kind":"people","required":false}
  ]', false, 5),
  ('Jiné', NULL, '[
    {"key":"participants","label":"Účastníci","kind":"people","required":true}
  ]', true, 6);
