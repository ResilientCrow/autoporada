ALTER TABLE "users" ADD COLUMN "salutation" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "titles_before" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "titles_after" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_salutation" CHECK ("users"."salutation" IS NULL OR "users"."salutation" IN ('pan','pani','slecna'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_titles_before" CHECK ("users"."titles_before" IS NULL OR (char_length("users"."titles_before") <= 40 AND "users"."titles_before" !~ '[[:cntrl:]]'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_titles_after" CHECK ("users"."titles_after" IS NULL OR (char_length("users"."titles_after") <= 40 AND "users"."titles_after" !~ '[[:cntrl:]]'));