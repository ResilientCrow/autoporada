ALTER TABLE "issues" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "issues" ALTER COLUMN "status" SET DEFAULT 'open'::text;--> statement-breakpoint
DROP TYPE "public"."issue_status";--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'generated');--> statement-breakpoint
ALTER TABLE "issues" ALTER COLUMN "status" SET DEFAULT 'open'::"public"."issue_status";--> statement-breakpoint
ALTER TABLE "issues" ALTER COLUMN "status" SET DATA TYPE "public"."issue_status" USING "status"::"public"."issue_status";