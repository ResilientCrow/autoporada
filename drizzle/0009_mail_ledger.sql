CREATE TABLE "mail_gate" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"not_before" timestamp with time zone,
	"code" text,
	CONSTRAINT "mail_gate_single_row" CHECK ("mail_gate"."id")
);
--> statement-breakpoint
CREATE TABLE "mail_ledger" (
	"dedupe_key" text PRIMARY KEY NOT NULL,
	"template" text NOT NULL,
	"recipient_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"state" text NOT NULL,
	"unknown_sends" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"code" text,
	"graph_request_id" text,
	CONSTRAINT "mail_ledger_dedupe_key_length" CHECK (length("mail_ledger"."dedupe_key") <= 120),
	CONSTRAINT "mail_ledger_state" CHECK ("mail_ledger"."state" IN ('sending', 'unknown', 'sent', 'deferred', 'skipped', 'failed')),
	CONSTRAINT "mail_ledger_unknown_sends" CHECK ("mail_ledger"."unknown_sends" >= 0),
	CONSTRAINT "mail_ledger_code" CHECK ("mail_ledger"."code" ~ '^[a-z]+(\.[A-Za-z0-9_-]+)*$' AND length("mail_ledger"."code") <= 40),
	CONSTRAINT "mail_ledger_graph_request_id_length" CHECK (length("mail_ledger"."graph_request_id") <= 64)
);
--> statement-breakpoint
ALTER TABLE "mail_ledger" ADD CONSTRAINT "mail_ledger_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_ledger_claimed_at" ON "mail_ledger" USING btree ("claimed_at") WHERE "mail_ledger"."state" IN ('sending', 'unknown', 'sent', 'failed');--> statement-breakpoint
-- The gate is one row from the start; the worker only ever updates it.
INSERT INTO "mail_gate" DEFAULT VALUES;
--> statement-breakpoint
-- Only the worker writes delivery state (ADR 0016); the web may not even read
-- it, and the CLI reads it as the owner. The backup keeps 0000's default
-- SELECT: backups include the ledger, which holds ids only.
REVOKE ALL ON "mail_ledger", "mail_gate" FROM autoporada_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "mail_ledger", "mail_gate" TO autoporada_jobs;
