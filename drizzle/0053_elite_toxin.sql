ALTER TABLE "future_items" DROP CONSTRAINT "future_items_lengths";--> statement-breakpoint
ALTER TABLE "future_items" ADD COLUMN "organizer" text;--> statement-breakpoint
ALTER TABLE "future_items" ADD COLUMN "participants" text;--> statement-breakpoint
ALTER TABLE "future_items" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "future_items" ADD CONSTRAINT "future_items_lengths" CHECK (char_length("future_items"."title") <= 200 AND char_length(coalesce("future_items"."place", '')) <= 120
        AND char_length(coalesce("future_items"."organizer", '')) <= 1000
        AND char_length(coalesce("future_items"."participants", '')) <= 2000
        AND char_length(coalesce("future_items"."note", '')) <= 1000);