ALTER TABLE "point_events" DROP CONSTRAINT "point_events_return_parts";--> statement-breakpoint
ALTER TABLE "future_events" DROP CONSTRAINT "future_events_return_parts";--> statement-breakpoint
-- A return named the structured part "responsible"; it is now "who" (Organizátor a účastníci). The
-- append-only trigger (0020) is lifted for this one rewrite, inside the migration's transaction.
ALTER TABLE "future_events" DISABLE TRIGGER "future_events_no_update";--> statement-breakpoint
UPDATE "future_events" SET "return_parts" = array_replace("return_parts", 'responsible', 'who') WHERE 'responsible' = ANY("return_parts");--> statement-breakpoint
ALTER TABLE "future_events" ENABLE TRIGGER "future_events_no_update";--> statement-breakpoint
ALTER TABLE "future_items" DROP CONSTRAINT "future_items_responsible";--> statement-breakpoint
ALTER TABLE "future_items" DROP COLUMN "responsible";--> statement-breakpoint
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_return_parts" CHECK ("point_events"."return_parts" IS NULL OR ("point_events"."event" = 'return' AND cardinality("point_events"."return_parts") BETWEEN 1 AND 5));--> statement-breakpoint
ALTER TABLE "future_events" ADD CONSTRAINT "future_events_return_parts" CHECK ("future_events"."return_parts" IS NULL OR ("future_events"."event" = 'return' AND cardinality("future_events"."return_parts") BETWEEN 1 AND 5));