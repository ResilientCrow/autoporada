CREATE TABLE "arch_annexes" (
	"monday" date PRIMARY KEY NOT NULL,
	"annexes" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arch_annexes_list" CHECK (jsonb_typeof("arch_annexes"."annexes") = 'array'),
	CONSTRAINT "arch_annexes_size" CHECK (octet_length("arch_annexes"."annexes"::text) <= 4000000)
);
