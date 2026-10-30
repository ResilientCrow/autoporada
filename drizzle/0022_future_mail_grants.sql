-- The report prompt (design section 13): the worker's daily run finds the approved akce that are
-- owed a report, and at send time reads again who wrote one and where it stands. Column grants
-- only: the title, place, responsible people and the dates of the hand-in stay out of its reach (F2).
-- The two dates are read to find the last day; the mail never names them.
GRANT SELECT (id, author_id, state, start_date, end_date, expects_report, report_state) ON future_items TO autoporada_jobs;
