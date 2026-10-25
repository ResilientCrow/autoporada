-- A redrive restarts the cap at the revived job's first claim (ADR 0016):
-- job_id names the job that last claimed the key, cap_from is unknown_sends
-- at the last redrive. 0009's table grants cover the new columns.
ALTER TABLE "mail_ledger" ADD COLUMN "cap_from" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_ledger" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "mail_ledger" ADD CONSTRAINT "mail_ledger_cap_from" CHECK ("mail_ledger"."cap_from" >= 0 AND "mail_ledger"."cap_from" <= "mail_ledger"."unknown_sends");