-- ADR 0054 item 11: a porada that does not take place does not exist. Every `skipped` issue hands
-- its prepared content to its heir, as `issues.drop` does, is audited as a system
-- `issue.dropped { monday, migrated: true }` and is deleted; the coming Mondays up to the heir of
-- the latest coming skipped one get rows and `settings.calendar.plannedThrough` names that heir, so
-- the Mondays between stay poradas. The `skipped` enum value goes in the next migration.
-- The heir of a skipped Monday is the first later Monday that is not itself a skipped row: a
-- stored row, or a row-less Monday (a porada on its Monday under the old calendar). Skipped
-- Mondays are handled from the latest to the earliest, so a run of them ends at one heir.
DO $$
DECLARE
  rule_offset int := coalesce((SELECT (value->>'dayOffset')::int FROM settings WHERE key = 'deadline'), -2);
  rule_time time := coalesce((SELECT (value->>'time')::time FROM settings WHERE key = 'deadline'), time '20:00');
  this_monday date := date_trunc('week', now() AT TIME ZONE 'Europe/Prague')::date;
  s record;
  heir date;
  heir_row record;
  moved_items boolean;
  new_present text;
  new_guests text;
  new_annex2 jsonb;
  texts_changed boolean;
  from_annexes jsonb;
  planned_through date;
  m date;
BEGIN
  -- Nothing but the outline rows hangs on a skipped issue; a document or a registry stamp would
  -- mean a skipped issue was once generated, which the status machine forbids.
  IF EXISTS (SELECT 1 FROM generated_documents d JOIN issues i ON i.id = d.issue_id WHERE i.status = 'skipped')
     OR EXISTS (SELECT 1 FROM registry_entries r JOIN issues i ON i.id = r.first_published_issue_id WHERE i.status = 'skipped') THEN
    RAISE EXCEPTION 'skipped poradas: a skipped issue has a document or a registry stamp';
  END IF;

  FOR s IN SELECT * FROM issues WHERE status = 'skipped' ORDER BY monday DESC LOOP
    heir := s.monday + 7;
    WHILE EXISTS (SELECT 1 FROM issues WHERE monday = heir AND status = 'skipped') LOOP
      heir := heir + 7;
    END LOOP;

    -- The latest coming skipped Monday decides where the stored calendar ends.
    IF s.monday >= this_monday AND planned_through IS NULL THEN
      planned_through := heir;
    END IF;

    -- A coming heir without a row gets one (it stays a porada); a past one is not made, its
    -- content only goes.
    IF heir >= this_monday THEN
      INSERT INTO issues (monday, meeting_date, school_year, deadline_at)
      VALUES (
        heir, heir,
        CASE WHEN extract(month FROM heir) >= 9
             THEN extract(year FROM heir)::int || '/' || (extract(year FROM heir)::int + 1)
             ELSE (extract(year FROM heir)::int - 1) || '/' || extract(year FROM heir)::int END,
        ((heir + rule_offset) + rule_time) AT TIME ZONE 'Europe/Prague'
      )
      ON CONFLICT (monday) DO NOTHING;
    END IF;
    SELECT * INTO heir_row FROM issues WHERE monday = heir;

    IF FOUND AND heir_row.status = 'open' THEN
      -- The outline moves when the heir has none of its own; otherwise it is deleted below.
      moved_items := false;
      IF EXISTS (SELECT 1 FROM issue_items WHERE issue_id = s.id)
         AND NOT EXISTS (SELECT 1 FROM issue_items WHERE issue_id = heir_row.id) THEN
        UPDATE issue_items SET issue_id = heir_row.id WHERE issue_id = s.id;
        moved_items := true;
      END IF;

      -- The texts the heir has not written (null) fill from the skipped one; a Příloha 2 with no
      -- text in it (a removal, as `isRichDocEmpty` reads it) is not handed over.
      new_present := CASE WHEN heir_row.present_text IS NULL THEN s.present_text END;
      new_guests := CASE WHEN heir_row.guests_text IS NULL THEN s.guests_text END;
      new_annex2 := CASE WHEN heir_row.annex2 IS NULL
                          AND s.annex2 IS NOT NULL
                          AND jsonb_path_exists(s.annex2, '$.content[*].content[*].text ? (@ like_regex "\\S")')
                     THEN s.annex2 END;
      texts_changed := new_present IS NOT NULL OR new_guests IS NOT NULL OR new_annex2 IS NOT NULL;
      IF moved_items OR texts_changed THEN
        UPDATE issues
        SET present_text = coalesce(new_present, present_text),
            guests_text = coalesce(new_guests, guests_text),
            annex2 = coalesce(new_annex2, annex2),
            version = version + 1,
            updated_at = now()
        WHERE id = heir_row.id;
      END IF;

      -- The Arch annexes are appended to the heir's.
      SELECT annexes INTO from_annexes FROM arch_annexes WHERE monday = s.monday;
      IF from_annexes IS NOT NULL AND jsonb_array_length(from_annexes) > 0 THEN
        INSERT INTO arch_annexes (monday, annexes) VALUES (heir, from_annexes)
        ON CONFLICT (monday) DO UPDATE
          SET annexes = arch_annexes.annexes || EXCLUDED.annexes,
              version = arch_annexes.version + 1,
              updated_at = now();
      END IF;
    END IF;
  END LOOP;

  -- Rows for the coming Mondays up to the heir of the latest coming skipped one: they stay poradas.
  IF planned_through IS NOT NULL THEN
    m := this_monday;
    WHILE m <= planned_through LOOP
      INSERT INTO issues (monday, meeting_date, school_year, deadline_at)
      VALUES (
        m, m,
        CASE WHEN extract(month FROM m) >= 9
             THEN extract(year FROM m)::int || '/' || (extract(year FROM m)::int + 1)
             ELSE (extract(year FROM m)::int - 1) || '/' || extract(year FROM m)::int END,
        ((m + rule_offset) + rule_time) AT TIME ZONE 'Europe/Prague'
      )
      ON CONFLICT (monday) DO NOTHING;
      m := m + 7;
    END LOOP;
    INSERT INTO settings (key, value)
    VALUES ('calendar', jsonb_build_object('plannedThrough', planned_through))
    ON CONFLICT (key) DO NOTHING;
  END IF;

  -- The trace: one system audit row per deleted skipped issue (dates only), then the rows go.
  INSERT INTO audit_events (actor_id, action, target_type, target_id, data)
  SELECT NULL, 'issue.dropped', 'issue', id,
         jsonb_build_object('meta', jsonb_build_object('monday', monday, 'migrated', true),
                            'system', 'migration:0050')
  FROM issues WHERE status = 'skipped';
  DELETE FROM issue_items WHERE issue_id IN (SELECT id FROM issues WHERE status = 'skipped');
  DELETE FROM arch_annexes WHERE monday IN (SELECT monday FROM issues WHERE status = 'skipped');
  DELETE FROM issues WHERE status = 'skipped';
END $$;
