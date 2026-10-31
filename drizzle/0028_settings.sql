CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key" CHECK ("settings"."key" ~ '^[a-z0-9.]{1,64}$'),
	CONSTRAINT "settings_value" CHECK (jsonb_typeof("settings"."value") = 'object'),
	CONSTRAINT "settings_size" CHECK (octet_length("settings"."value"::text) <= 65536)
);
