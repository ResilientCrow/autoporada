ALTER TABLE "point_events" DROP CONSTRAINT "point_events_note_required";--> statement-breakpoint
ALTER TABLE "future_events" DROP CONSTRAINT "future_events_note_required";--> statement-breakpoint
ALTER TABLE "point_events" ADD COLUMN "return_parts" text[];--> statement-breakpoint
ALTER TABLE "future_events" ADD COLUMN "return_parts" text[];--> statement-breakpoint
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_return_parts" CHECK ("point_events"."return_parts" IS NULL OR ("point_events"."event" = 'return' AND cardinality("point_events"."return_parts") BETWEEN 1 AND 4));--> statement-breakpoint
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_note_required" CHECK ("point_events"."event" NOT IN ('return','reject') OR "point_events"."note" IS NOT NULL OR ("point_events"."event" = 'return' AND "point_events"."return_parts" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "future_events" ADD CONSTRAINT "future_events_return_parts" CHECK ("future_events"."return_parts" IS NULL OR ("future_events"."event" = 'return' AND cardinality("future_events"."return_parts") BETWEEN 1 AND 4));--> statement-breakpoint
ALTER TABLE "future_events" ADD CONSTRAINT "future_events_note_required" CHECK ("future_events"."event" NOT IN ('return','reject') OR "future_events"."note" IS NOT NULL OR ("future_events"."event" = 'return' AND "future_events"."return_parts" IS NOT NULL));