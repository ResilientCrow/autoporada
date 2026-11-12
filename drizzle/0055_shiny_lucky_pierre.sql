ALTER TABLE "report_placeholders" DROP CONSTRAINT "report_placeholders_paragraph";--> statement-breakpoint
ALTER TABLE "report_placeholders" ALTER COLUMN "paragraph" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "report_placeholders" ADD COLUMN "confirmed_original" text;--> statement-breakpoint
ALTER TABLE "report_placeholders" ADD CONSTRAINT "report_placeholders_confirmed_original" CHECK ("report_placeholders"."confirmed_original" IS NULL OR char_length("report_placeholders"."confirmed_original") BETWEEN 1 AND 4000);--> statement-breakpoint
ALTER TABLE "report_placeholders" ADD CONSTRAINT "report_placeholders_not_empty" CHECK ("report_placeholders"."paragraph" IS NOT NULL OR "report_placeholders"."confirmed_original" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "report_placeholders" ADD CONSTRAINT "report_placeholders_paragraph" CHECK ("report_placeholders"."paragraph" IS NULL OR char_length("report_placeholders"."paragraph") BETWEEN 1 AND 4000);