ALTER TABLE "users" DROP CONSTRAINT "users_titles_before";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_titles_after";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "titles_before";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "titles_after";