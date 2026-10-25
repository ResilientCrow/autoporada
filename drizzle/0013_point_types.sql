CREATE TYPE "public"."title_gender" AS ENUM('m', 'f', 'n', 'pl', 'npl');--> statement-breakpoint
CREATE TABLE "point_types" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"title_gender" "title_gender",
	"default_bullets" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_types_name_key" UNIQUE("name"),
	CONSTRAINT "point_types_locked_active" CHECK (NOT "point_types"."locked" OR "point_types"."active"),
	CONSTRAINT "point_types_bullets_array" CHECK (jsonb_typeof("point_types"."default_bullets") = 'array' AND jsonb_array_length("point_types"."default_bullets") <= 12)
);
