-- Every handed-in point gets the Monday it was handed in for (ADR 0029). Order matters (M9 V1):
-- the guard, the backfill, and only then the CHECK that ties hand_in_monday to submitted_at.
--
-- Every issue frozen so far has the Sunday 18.00 deadline of its Monday and its meeting on that
-- Monday, and the hand-in Monday of a point handed in under that rule is computed from the
-- instant alone. This migration hard-codes that rule and runs before the default changes; the
-- guard turns the premise into a precondition, so a database that broke it fails loudly.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM issues
             WHERE deadline_at <> ((monday - 1) + time '18:00') AT TIME ZONE 'Europe/Prague'
                OR meeting_date <> monday) THEN
    RAISE EXCEPTION 'hand_in_monday backfill: an issue was frozen under another rule';
  END IF;
END $$;
--> statement-breakpoint
-- Local Sunday 17.59 plus 6 h is 23.59 of the same Sunday, whose ISO week starts at M - 7, so M;
-- 18.00 plus 6 h is Monday 00.00, so M + 7. The points_version_bump trigger refuses an UPDATE
-- that leaves version alone.
UPDATE points
SET hand_in_monday = (date_trunc('week', (submitted_at AT TIME ZONE 'Europe/Prague') + interval '6 hours'))::date + 7,
    version = version + 1
WHERE submitted_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_hand_in_set" CHECK (("points"."submitted_at" IS NULL) = ("points"."hand_in_monday" IS NULL));
--> statement-breakpoint
-- The worker's summary and reminders read the hand-in Monday: a date, no text (F2).
GRANT SELECT (hand_in_monday) ON points TO autoporada_jobs;
