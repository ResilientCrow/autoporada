-- ADR 0048: nobody can decline the report of an akce. A declined one is owed again, before 0045
-- drops 'declined' from the type. The guard trigger wants the version raised by one.
UPDATE future_items SET report_state = 'none', version = version + 1 WHERE report_state = 'declined';
