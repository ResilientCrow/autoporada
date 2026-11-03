ALTER TYPE "public"."report_state" ADD VALUE 'missed';--> statement-breakpoint
CREATE TABLE "report_placeholders" (
	"future_item_id" uuid PRIMARY KEY NOT NULL,
	"paragraph" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_placeholders_paragraph" CHECK (char_length("report_placeholders"."paragraph") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
ALTER TABLE "report_placeholders" ADD CONSTRAINT "report_placeholders_future_item_id_future_items_id_fk" FOREIGN KEY ("future_item_id") REFERENCES "public"."future_items"("id") ON DELETE cascade ON UPDATE no action;