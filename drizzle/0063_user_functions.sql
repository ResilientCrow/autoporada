CREATE TABLE "user_functions" (
	"user_id" uuid NOT NULL,
	"head" text NOT NULL,
	"complement" text,
	"position" integer NOT NULL,
	CONSTRAINT "user_functions_user_id_position_pk" PRIMARY KEY("user_id","position"),
	CONSTRAINT "user_functions_head" CHECK ("user_functions"."head" IN ('statutarni-zastupce','zastupce','vedouci','clen')),
	CONSTRAINT "user_functions_complement" CHECK ("user_functions"."complement" IS NULL OR (char_length("user_functions"."complement") <= 80 AND "user_functions"."complement" !~ '[[:cntrl:]]'))
);
--> statement-breakpoint
ALTER TABLE "user_functions" ADD CONSTRAINT "user_functions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;