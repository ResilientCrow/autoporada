-- The pdf.render job (ADR 0038) reads the DOCX of a generated document and writes its PDF. It never
-- reads the snapshot, and it cannot change the DOCX or make a document.
GRANT SELECT (id, docx, pdf_status) ON generated_documents TO autoporada_jobs;
--> statement-breakpoint
GRANT UPDATE (pdf, pdf_sha256, pdf_status, pdf_at) ON generated_documents TO autoporada_jobs;
