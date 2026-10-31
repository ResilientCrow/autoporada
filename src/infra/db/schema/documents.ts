import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgEnum, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { at, bytea, id } from './columns';
import { issues } from './issues';

export const pdfStatus = pgEnum('pdf_status', ['pending', 'ready', 'failed']);

/**
 * A generated document of an issue (ADR 0038): the snapshot it was composed from and the DOCX,
 * then the PDF the worker converts it to. Kept for good: the archive downloads it. Who generated it
 * is in the audit log, not here. The worker reads the DOCX and writes the PDF columns only
 * (migration 0037).
 */
export const generatedDocuments = pgTable(
  'generated_documents',
  {
    id: id(),
    issueId: uuid()
      .notNull()
      .references(() => issues.id),
    /** 1 for the first; a regeneration (not built) would add the next. */
    version: integer().notNull().default(1),
    snapshot: jsonb().notNull(),
    docx: bytea().notNull(),
    docxSha256: text().notNull(),
    pdf: bytea(),
    pdfSha256: text(),
    pdfStatus: pdfStatus().notNull().default('pending'),
    generatedAt: at().notNull().defaultNow(),
    pdfAt: at(),
  },
  (t) => [
    unique('generated_documents_issue_version_key').on(t.issueId, t.version),
    check('generated_documents_version', sql`${t.version} >= 1`),
    check(
      'generated_documents_sha256',
      sql`${t.docxSha256} ~ '^[0-9a-f]{64}$' AND (${t.pdfSha256} IS NULL OR ${t.pdfSha256} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      'generated_documents_pdf',
      sql`(${t.pdfStatus} = 'ready') = (${t.pdf} IS NOT NULL AND ${t.pdfSha256} IS NOT NULL AND ${t.pdfAt} IS NOT NULL)`,
    ),
  ],
);
