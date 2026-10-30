-- The deadline reminders (design section 13) read when each Monday closes and who has work waiting,
-- never what is in it. Column grants only (F2): the deadline facts of an issue, and of a point its
-- kind, first Monday, hand-in and last change (the author, the state and the id came with 0017).
-- An akce adds its hand-in time, which makes an author an active submitter (D7).
GRANT SELECT (id, monday, status, deadline_at) ON issues TO autoporada_jobs;
GRANT SELECT (kind, earliest_monday, submitted_at, updated_at) ON points TO autoporada_jobs;
GRANT SELECT (submitted_at) ON future_items TO autoporada_jobs;
