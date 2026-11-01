-- ADR 0048: an akce owes a report by its kind, not by expects_report (gone in 0045, and its grant
-- with it). The worker's report prompt, late reports and reminders filter on kind = 'akce'.
GRANT SELECT (kind) ON future_items TO autoporada_jobs;
