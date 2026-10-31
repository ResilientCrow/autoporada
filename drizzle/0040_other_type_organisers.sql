-- „Jiné“ gains an optional „Organizátoři“ bullet before „Účastníci“, as the other placeholder
-- types have (0014): without it a point of this type could name no organisers. Only the row as
-- 0014 seeded it changes; a „Jiné“ the headmaster has edited keeps its bullets. Drafts keep the
-- bullets they copied; new points get both.
UPDATE public.point_types
   SET default_bullets = '[
         {"key":"organisers","label":"Organizátoři","kind":"people","required":false,"role":"organisers"},
         {"key":"participants","label":"Účastníci","kind":"people","required":true}
       ]'::jsonb,
       version = version + 1,
       updated_at = now()
 WHERE locked
   AND default_bullets = '[{"key":"participants","label":"Účastníci","kind":"people","required":true}]'::jsonb;
