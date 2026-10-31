ALTER TABLE "points" ADD COLUMN "hand_in_monday" date;--> statement-breakpoint
CREATE INDEX "points_eligible_idx" ON "points" USING btree ("state","hand_in_monday") WHERE "points"."state" = 'approved';--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_hand_in_monday" CHECK ("points"."hand_in_monday" IS NULL OR extract(isodow from "points"."hand_in_monday") = 1);