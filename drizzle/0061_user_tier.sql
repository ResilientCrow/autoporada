-- ADR 0072 item 2: the student flag becomes the tier. Students become `student`; everyone else
-- starts without one. users_end_sessions (0006) reads is_student, so it goes before the column and
-- comes back on the tier: only a change of student-ness signs out, not ucitel -> vedeni.
ALTER TABLE "users" ADD COLUMN "tier" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tier" CHECK ("users"."tier" IS NULL OR "users"."tier" IN ('reditel','vedeni','ucitel','zamestnanec','student','absolvent'));--> statement-breakpoint
UPDATE "users" SET "tier" = 'student' WHERE "is_student";--> statement-breakpoint
DROP TRIGGER "users_end_sessions" ON "users";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_student_role";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_student";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_student_role" CHECK ("users"."tier" IS NULL OR "users"."tier" NOT IN ('student', 'absolvent') OR "users"."role" IN ('pending', 'submitter'));--> statement-breakpoint
CREATE TRIGGER users_end_sessions
  AFTER UPDATE OF role, status, tier ON public.users
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role
     OR OLD.status IS DISTINCT FROM NEW.status
     OR COALESCE(OLD.tier IN ('student', 'absolvent'), false)
        IS DISTINCT FROM COALESCE(NEW.tier IN ('student', 'absolvent'), false))
  EXECUTE FUNCTION users_end_sessions();
