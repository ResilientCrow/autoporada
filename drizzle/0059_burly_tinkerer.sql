-- A report has no type (ADR 0067): its grammar comes from the title, and every report starts
-- with the same rows. The column and the two checks that bound it go.
ALTER TABLE "points" DROP CONSTRAINT "points_kind_type";--> statement-breakpoint
ALTER TABLE "points" DROP CONSTRAINT "points_type";--> statement-breakpoint
ALTER TABLE "points" DROP COLUMN "type_id";