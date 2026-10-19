CREATE TYPE "public"."access_request_state" AS ENUM('pending', 'approved', 'rejected', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."auth_purpose" AS ENUM('login', 'step_up');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('pending', 'submitter', 'reviewer', 'headmaster');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'blocked', 'deactivated');--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"state" "access_request_state" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_requests_reason_length" CHECK (char_length("access_requests"."reason") BETWEEN 1 AND 1000),
	CONSTRAINT "access_requests_decided_at" CHECK (("access_requests"."state" = 'pending') = ("access_requests"."decided_at" IS NULL)),
	CONSTRAINT "access_requests_decided_by" CHECK ("access_requests"."state" NOT IN ('approved', 'rejected', 'blocked') OR "access_requests"."decided_by" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "auth_transactions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"cookie_hash" "bytea" NOT NULL,
	"state" text NOT NULL,
	"nonce" text NOT NULL,
	"code_verifier" text NOT NULL,
	"return_to" text NOT NULL,
	"purpose" "auth_purpose" NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_transactions_cookie_hash_key" UNIQUE("cookie_hash"),
	CONSTRAINT "auth_transactions_cookie_hash_sha256" CHECK (octet_length("auth_transactions"."cookie_hash") = 32),
	CONSTRAINT "auth_transactions_step_up_user" CHECK (("auth_transactions"."purpose" = 'step_up') = ("auth_transactions"."user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"user_id" uuid NOT NULL,
	"auth_time" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"abs_expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "sessions_token_hash_sha256" CHECK (octet_length("sessions"."token_hash") = 32),
	CONSTRAINT "sessions_expiry_order" CHECK ("sessions"."idle_expires_at" <= "sessions"."abs_expires_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tid" uuid NOT NULL,
	"oid" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"job_title" text,
	"department" text,
	"role" "role" DEFAULT 'pending' NOT NULL,
	"is_student" boolean DEFAULT false NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_entra_key" UNIQUE("tid","oid"),
	CONSTRAINT "users_student_role" CHECK (NOT "users"."is_student" OR "users"."role" IN ('pending', 'submitter'))
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_transactions" ADD CONSTRAINT "auth_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_one_pending" ON "access_requests" USING btree ("user_id") WHERE "access_requests"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "auth_transactions_expiry_idx" ON "auth_transactions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_idle_expiry_idx" ON "sessions" USING btree ("idle_expires_at");