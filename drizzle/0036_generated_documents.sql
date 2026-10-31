CREATE TYPE "public"."pdf_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "generated_documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"issue_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"docx" "bytea" NOT NULL,
	"docx_sha256" text NOT NULL,
	"pdf" "bytea",
	"pdf_sha256" text,
	"pdf_status" "pdf_status" DEFAULT 'pending' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pdf_at" timestamp with time zone,
	CONSTRAINT "generated_documents_issue_version_key" UNIQUE("issue_id","version"),
	CONSTRAINT "generated_documents_version" CHECK ("generated_documents"."version" >= 1),
	CONSTRAINT "generated_documents_sha256" CHECK ("generated_documents"."docx_sha256" ~ '^[0-9a-f]{64}$' AND ("generated_documents"."pdf_sha256" IS NULL OR "generated_documents"."pdf_sha256" ~ '^[0-9a-f]{64}$')),
	CONSTRAINT "generated_documents_pdf" CHECK (("generated_documents"."pdf_status" = 'ready') = ("generated_documents"."pdf" IS NOT NULL AND "generated_documents"."pdf_sha256" IS NOT NULL AND "generated_documents"."pdf_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;