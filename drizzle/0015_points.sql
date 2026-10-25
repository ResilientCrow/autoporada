CREATE TYPE "public"."point_kind" AS ENUM('report', 'finance', 'pokyn');--> statement-breakpoint
CREATE TYPE "public"."point_state" AS ENUM('draft', 'submitted', 'returned', 'approved', 'rejected', 'withdrawn', 'published');--> statement-breakpoint
CREATE TABLE "point_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"point_id" uuid NOT NULL,
	"actor_id" uuid,
	"event" text NOT NULL,
	"from_state" "point_state" NOT NULL,
	"to_state" "point_state" NOT NULL,
	"note" text,
	"edited_fields" text[],
	"before" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_events_note" CHECK ("point_events"."note" IS NULL OR char_length("point_events"."note") BETWEEN 1 AND 2000),
	CONSTRAINT "point_events_note_required" CHECK ("point_events"."event" NOT IN ('return','reject') OR "point_events"."note" IS NOT NULL),
	CONSTRAINT "point_events_before_edit" CHECK ("point_events"."before" IS NULL OR "point_events"."event" = 'edit')
);
--> statement-breakpoint
CREATE TABLE "points" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "point_kind" NOT NULL,
	"author_id" uuid NOT NULL,
	"client_ref" uuid NOT NULL,
	"type_id" uuid,
	"state" "point_state" DEFAULT 'draft' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"event_date" date,
	"end_date" date,
	"time_from" time,
	"time_to" time,
	"campus" text,
	"place" text,
	"opening" text DEFAULT '' NOT NULL,
	"opening_edited" boolean DEFAULT false NOT NULL,
	"body" jsonb NOT NULL,
	"bullets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"statements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"earliest_monday" date,
	"submitted_at" timestamp with time zone,
	"future_item_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_author_client_ref_key" UNIQUE("author_id","client_ref"),
	CONSTRAINT "points_kind_type" CHECK (("points"."kind" = 'report') = ("points"."type_id" IS NOT NULL)),
	CONSTRAINT "points_dates" CHECK ("points"."end_date" IS NULL OR ("points"."event_date" IS NOT NULL AND "points"."end_date" >= "points"."event_date")),
	CONSTRAINT "points_campus" CHECK ("points"."campus" IS NULL OR "points"."campus" IN ('smichov','radlice','na-vidouli','jinde')),
	CONSTRAINT "points_monday" CHECK ("points"."earliest_monday" IS NULL OR extract(isodow from "points"."earliest_monday") = 1),
	CONSTRAINT "points_lengths" CHECK (char_length("points"."title") <= 200 AND char_length("points"."opening") <= 1000 AND char_length(coalesce("points"."place", '')) <= 120),
	CONSTRAINT "points_content_size" CHECK (octet_length("points"."body"::text) + octet_length("points"."bullets"::text) + octet_length("points"."statements"::text) <= 262144),
	CONSTRAINT "points_submitted_complete" CHECK ("points"."state" NOT IN ('submitted','approved','published')
        OR ("points"."title" <> '' AND "points"."earliest_monday" IS NOT NULL AND "points"."submitted_at" IS NOT NULL
            AND ("points"."kind" <> 'report' OR ("points"."event_date" IS NOT NULL AND "points"."opening" <> ''))))
);
--> statement-breakpoint
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_point_id_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_events" ADD CONSTRAINT "point_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_type_id_point_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."point_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "point_events_point_idx" ON "point_events" USING btree ("point_id","created_at");--> statement-breakpoint
CREATE INDEX "points_author_idx" ON "points" USING btree ("author_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "points_queue_idx" ON "points" USING btree ("state","earliest_monday") WHERE "points"."state" IN ('submitted','approved');