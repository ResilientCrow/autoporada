-- The jobs read the deadline rule (settings.value), so a Monday with no row is reminded by the rule
-- in force. Key and value only: `version` is the save token of the headmaster's screen, and the
-- worker never reads through readSetting (ADR 0032 item 9).
GRANT SELECT (key, value) ON settings TO autoporada_jobs;
