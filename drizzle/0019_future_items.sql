CREATE TYPE "public"."future_kind" AS ENUM('jednani', 'akce');--> statement-breakpoint
CREATE TYPE "public"."future_state" AS ENUM('draft', 'submitted', 'returned', 'approved', 'rejected', 'withdrawn', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."report_state" AS ENUM('none', 'prompted', 'written', 'declined');--> statement-breakpoint
CREATE TABLE "future_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"future_item_id" uuid NOT NULL,
	"actor_id" uuid,
	"event" text NOT NULL,
	"from_state" "future_state" NOT NULL,
	"to_state" "future_state" NOT NULL,
	"note" text,
	"edited_fields" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "future_events_note" CHECK ("future_events"."note" IS NULL OR char_length("future_events"."note") BETWEEN 1 AND 2000),
	CONSTRAINT "future_events_note_required" CHECK ("future_events"."event" NOT IN ('return','reject') OR "future_events"."note" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "future_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "future_kind" NOT NULL,
	"author_id" uuid NOT NULL,
	"client_ref" uuid NOT NULL,
	"state" "future_state" DEFAULT 'draft' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"start_date" date,
	"end_date" date,
	"time_from" time,
	"time_to" time,
	"campus" text,
	"place" text,
	"responsible" jsonb,
	"expects_report" boolean DEFAULT false NOT NULL,
	"report_state" "report_state" DEFAULT 'none' NOT NULL,
	"report_point_id" uuid,
	"submitted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "future_items_author_client_ref_key" UNIQUE("author_id","client_ref"),
	CONSTRAINT "future_items_expects_akce" CHECK (NOT "future_items"."expects_report" OR "future_items"."kind" = 'akce'),
	CONSTRAINT "future_items_report_needs_expect" CHECK ("future_items"."report_state" = 'none' OR "future_items"."expects_report"),
	CONSTRAINT "future_items_dates" CHECK ("future_items"."end_date" IS NULL OR ("future_items"."start_date" IS NOT NULL AND "future_items"."end_date" >= "future_items"."start_date")),
	CONSTRAINT "future_items_campus" CHECK ("future_items"."campus" IS NULL OR "future_items"."campus" IN ('smichov','radlice','na-vidouli','jinde')),
	CONSTRAINT "future_items_lengths" CHECK (char_length("future_items"."title") <= 200 AND char_length(coalesce("future_items"."place", '')) <= 120),
	CONSTRAINT "future_items_submitted_complete" CHECK ("future_items"."state" NOT IN ('submitted','approved','cancelled')
        OR ("future_items"."title" <> '' AND "future_items"."start_date" IS NOT NULL AND "future_items"."submitted_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "future_events" ADD CONSTRAINT "future_events_future_item_id_future_items_id_fk" FOREIGN KEY ("future_item_id") REFERENCES "public"."future_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "future_events" ADD CONSTRAINT "future_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "future_items" ADD CONSTRAINT "future_items_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "future_items" ADD CONSTRAINT "future_items_report_point_id_points_id_fk" FOREIGN KEY ("report_point_id") REFERENCES "public"."points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "future_events_item_idx" ON "future_events" USING btree ("future_item_id","created_at");--> statement-breakpoint
CREATE INDEX "future_items_author_idx" ON "future_items" USING btree ("author_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "future_items_state_idx" ON "future_items" USING btree ("state","start_date");