-- Report types are a fixed list in code (ADR 0064): a point names its type by key, and the
-- table of editable types goes. The column turns to text first, so it can hold both the old
-- uuid and the new key while the rows are mapped.
ALTER TABLE "points" DROP CONSTRAINT "points_type_id_point_types_id_fk";--> statement-breakpoint
ALTER TABLE "points" ALTER COLUMN "type_id" SET DATA TYPE text;--> statement-breakpoint
-- A seeded type (0014) maps by its name to its key; any other type, one the headmaster added or a
-- seeded one renamed, maps to „Jiné“. version_bump (0016) wants each changed row one version up;
-- updated_at stays, so no list reorders.
UPDATE "points" AS p
   SET "type_id" = CASE t."name"
         WHEN 'Seminář' THEN 'seminar'
         WHEN 'Exkurze' THEN 'exkurze'
         WHEN 'Soutěž' THEN 'soutez'
         WHEN 'Přednáška' THEN 'prednaska'
         WHEN 'Projektový den' THEN 'projektovy'
         ELSE 'jine'
       END,
       "version" = p."version" + 1
  FROM "point_types" AS t
 WHERE p."type_id" = t."id"::text;--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_type" CHECK ("points"."type_id" IS NULL OR "points"."type_id" IN ('seminar','exkurze','soutez','prednaska','projektovy','jine'));--> statement-breakpoint
DROP TABLE "point_types";--> statement-breakpoint
DROP TYPE "public"."title_gender";
