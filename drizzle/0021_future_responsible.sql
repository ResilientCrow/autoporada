-- Defence in depth for future_items.responsible, as points_content_size is for a point: an object,
-- no larger than 262,144 bytes of its text form. Zod and the repository's parse come first.
ALTER TABLE "future_items" ADD CONSTRAINT "future_items_responsible" CHECK ("future_items"."responsible" IS NULL
        OR (jsonb_typeof("future_items"."responsible") = 'object' AND octet_length("future_items"."responsible"::text) <= 262144));