CREATE TYPE "public"."registry_purpose" AS ENUM('annex1', 'point4');--> statement-breakpoint
CREATE TABLE "registry_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"list_id" uuid NOT NULL,
	"given_name" text NOT NULL,
	"family_name" text NOT NULL,
	"class_code" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"archived_year" text,
	"first_published_issue_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "registry_entries_lengths" CHECK (char_length("registry_entries"."given_name") BETWEEN 1 AND 60 AND char_length("registry_entries"."family_name") BETWEEN 1 AND 60 AND char_length("registry_entries"."class_code") BETWEEN 1 AND 8),
	CONSTRAINT "registry_entries_archived" CHECK ("registry_entries"."archived_year" IS NULL OR ("registry_entries"."removed_at" IS NOT NULL AND "registry_entries"."archived_year" ~ '^[0-9]{4}/[0-9]{4}$'))
);
--> statement-breakpoint
CREATE TABLE "registry_lists" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"doc_label" text NOT NULL,
	"purpose" "registry_purpose" NOT NULL,
	"position" smallint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_lists_key_key" UNIQUE("key"),
	CONSTRAINT "registry_lists_title_key" UNIQUE("title"),
	CONSTRAINT "registry_lists_key" CHECK ("registry_lists"."key" ~ '^[a-z0-9-]{1,40}$'),
	CONSTRAINT "registry_lists_lengths" CHECK (char_length("registry_lists"."title") BETWEEN 1 AND 120 AND char_length("registry_lists"."doc_label") BETWEEN 1 AND 300),
	CONSTRAINT "registry_lists_annex1_active" CHECK ("registry_lists"."purpose" <> 'annex1' OR "registry_lists"."active")
);
--> statement-breakpoint
ALTER TABLE "registry_entries" ADD CONSTRAINT "registry_entries_list_id_registry_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."registry_lists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_entries" ADD CONSTRAINT "registry_entries_first_published_issue_id_issues_id_fk" FOREIGN KEY ("first_published_issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "registry_entries_active_key" ON "registry_entries" USING btree ("list_id","family_name","given_name","class_code") WHERE "registry_entries"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "registry_entries_list_idx" ON "registry_entries" USING btree ("list_id") WHERE "registry_entries"."removed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "registry_lists_one_annex1" ON "registry_lists" USING btree ("purpose") WHERE "registry_lists"."purpose" = 'annex1';