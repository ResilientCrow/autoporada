-- The late-report mails (ADR 0035) read when an event ends, never what it is about. Dates and ids
-- only (F2): an akce's end time and the report started for it, and a report point's event dates
-- and end time (its kind, state, author and hand-in Monday came with 0017, 0024 and 0027).
GRANT SELECT (time_to, report_point_id) ON future_items TO autoporada_jobs;
--> statement-breakpoint
GRANT SELECT (event_date, end_date, time_to) ON points TO autoporada_jobs;
