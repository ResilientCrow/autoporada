-- The decision mails (ADR 0020): at send time the worker reads again who
-- wrote a point and where it stands, and what an event did to which point.
-- Column grants only: titles, texts, people, places, notes and the values a
-- reviewer replaced stay out of its reach (F2).
GRANT SELECT (id, author_id, state) ON points TO autoporada_jobs;
--> statement-breakpoint
GRANT SELECT (id, point_id, event, to_state) ON point_events TO autoporada_jobs;
