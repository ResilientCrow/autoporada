ALTER TABLE "future_items" DROP CONSTRAINT "future_items_expects_akce";--> statement-breakpoint
ALTER TABLE "future_items" DROP CONSTRAINT "future_items_report_needs_expect";--> statement-breakpoint
ALTER TABLE "future_items" ALTER COLUMN "report_state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "future_items" ALTER COLUMN "report_state" SET DEFAULT 'none'::text;--> statement-breakpoint
DROP TYPE "public"."report_state";--> statement-breakpoint
CREATE TYPE "public"."report_state" AS ENUM('none', 'prompted', 'written');--> statement-breakpoint
ALTER TABLE "future_items" ALTER COLUMN "report_state" SET DEFAULT 'none'::"public"."report_state";--> statement-breakpoint
ALTER TABLE "future_items" ALTER COLUMN "report_state" SET DATA TYPE "public"."report_state" USING "report_state"::"public"."report_state";--> statement-breakpoint
ALTER TABLE "future_items" DROP COLUMN "expects_report";--> statement-breakpoint
ALTER TABLE "future_items" ADD CONSTRAINT "future_items_report_akce" CHECK ("future_items"."report_state" = 'none' OR "future_items"."kind" = 'akce');