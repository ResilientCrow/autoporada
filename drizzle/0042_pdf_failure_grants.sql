-- The pdf.render job (ADR 0044) writes why a conversion failed in the update that marks the PDF
-- failed. It only writes it: the reason is shown by the web, which reads the table as a whole, and
-- the job's SELECT stays on id and pdf_status (0037). 0039's trigger lets the column change while
-- the PDF is pending and refuses it once settled.
GRANT UPDATE (pdf_failure) ON generated_documents TO autoporada_jobs;
