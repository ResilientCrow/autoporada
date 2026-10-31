-- The jobs read the issue calendar (issues.calendar: which Mondays meet when), so a porada moved off its
-- Monday (ADR 0034) is reminded and summarised by its own date. A date, no text: column grant only (F2).
GRANT SELECT (meeting_date) ON issues TO autoporada_jobs;
