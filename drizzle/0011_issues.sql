CREATE TYPE "public"."issue_status" AS ENUM('open', 'generated', 'skipped');--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"monday" date NOT NULL,
	"meeting_date" date NOT NULL,
	"school_year" text NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issues_monday_key" UNIQUE("monday"),
	CONSTRAINT "issues_is_monday" CHECK (extract(isodow from "issues"."monday") = 1),
	CONSTRAINT "issues_meeting_in_week" CHECK ("issues"."meeting_date" >= "issues"."monday" AND "issues"."meeting_date" < "issues"."monday" + 7),
	CONSTRAINT "issues_school_year" CHECK ("issues"."school_year" ~ '^\d{4}/\d{4}$')
);
