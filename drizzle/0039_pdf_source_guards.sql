-- The PDF job's view of the files (ADR 0039). Migration 0037 let it read every document's DOCX
-- for good, and the DOCX holds a whole porada, student names included. The DOCX now waits for the
-- job in pdf_sources and is deleted when the PDF settles, so the job reads only what is pending.
REVOKE SELECT (docx) ON generated_documents FROM autoporada_jobs;
--> statement-breakpoint
GRANT SELECT, DELETE ON pdf_sources TO autoporada_jobs;
--> statement-breakpoint
-- The web writes the source with the document and never reads, changes or deletes it. Deleting a
-- document still deletes its source: a foreign key's cascade runs as the owner of pdf_sources.
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON pdf_sources FROM autoporada_app;
--> statement-breakpoint
-- Only the worker settles a PDF, and the web has no other change to make to a document. DELETE
-- stays for the erasure of an issue; TRUNCATE goes.
REVOKE UPDATE, TRUNCATE ON generated_documents FROM autoporada_app;
--> statement-breakpoint
-- A document is immutable once its PDF is settled, and until then only the PDF columns change.
-- The trigger binds the schema owner and the worker alike (as point_events_append_only, 0016).
CREATE FUNCTION generated_documents_settle_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF OLD.pdf_status IS DISTINCT FROM 'pending'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.issue_id IS DISTINCT FROM OLD.issue_id
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.docx IS DISTINCT FROM OLD.docx
     OR NEW.docx_sha256 IS DISTINCT FROM OLD.docx_sha256
     OR NEW.generated_at IS DISTINCT FROM OLD.generated_at THEN
    RAISE EXCEPTION 'a generated document changes only while its PDF is pending, and only its PDF'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER generated_documents_settle_only
  BEFORE UPDATE ON public.generated_documents
  FOR EACH ROW EXECUTE FUNCTION generated_documents_settle_only();
