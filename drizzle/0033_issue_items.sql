CREATE TYPE "public"."issue_section" AS ENUM('pokyny', 'hospodareni');--> statement-breakpoint
CREATE TYPE "public"."issue_slot" AS ENUM('meetings', 'events', 'talent', 'exemptions', 'media', 'partners');--> statement-breakpoint
CREATE TYPE "public"."item_persistence" AS ENUM('standing', 'once');--> statement-breakpoint
CREATE TABLE "issue_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"issue_id" uuid NOT NULL,
	"section" "issue_section" NOT NULL,
	"position" smallint NOT NULL,
	"lineage_id" uuid NOT NULL,
	"slot" "issue_slot",
	"persistence" "item_persistence" NOT NULL,
	"title" text,
	"body" jsonb,
	"quotes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_point_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_items_lineage_key" UNIQUE("issue_id","lineage_id"),
	CONSTRAINT "issue_items_position_key" UNIQUE("issue_id","section","position"),
	CONSTRAINT "issue_items_position" CHECK ("issue_items"."position" BETWEEN 0 AND 59),
	CONSTRAINT "issue_items_kind" CHECK (("issue_items"."source_point_id" IS NULL) = ("issue_items"."title" IS NOT NULL AND "issue_items"."body" IS NOT NULL)),
	CONSTRAINT "issue_items_source" CHECK ("issue_items"."source_point_id" IS NULL OR ("issue_items"."slot" IS NULL AND "issue_items"."persistence" = 'once' AND "issue_items"."lineage_id" = "issue_items"."source_point_id")),
	CONSTRAINT "issue_items_slot" CHECK ("issue_items"."slot" IS NULL OR ("issue_items"."section" = 'pokyny' AND "issue_items"."persistence" = 'standing')),
	CONSTRAINT "issue_items_quotes" CHECK ((coalesce("issue_items"."slot" = 'partners', false) OR "issue_items"."quotes" = '[]'::jsonb) AND jsonb_array_length("issue_items"."quotes") <= 20),
	CONSTRAINT "issue_items_title" CHECK ("issue_items"."title" IS NULL OR char_length("issue_items"."title") BETWEEN 1 AND 300),
	CONSTRAINT "issue_items_size" CHECK (octet_length(coalesce("issue_items"."body"::text,'')) + octet_length("issue_items"."quotes"::text) <= 131072)
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "present_text" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "guests_text" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "annex2" jsonb;--> statement-breakpoint
ALTER TABLE "issue_items" ADD CONSTRAINT "issue_items_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_items" ADD CONSTRAINT "issue_items_source_point_id_points_id_fk" FOREIGN KEY ("source_point_id") REFERENCES "public"."points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_items_slot_key" ON "issue_items" USING btree ("issue_id","slot") WHERE "issue_items"."slot" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_items_source_key" ON "issue_items" USING btree ("issue_id","source_point_id") WHERE "issue_items"."source_point_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_texts" CHECK (char_length(coalesce("issues"."present_text",'')) <= 2000 AND char_length(coalesce("issues"."guests_text",'')) <= 2000 AND octet_length(coalesce("issues"."annex2"::text,'')) <= 65536);