import type { PdfFailure } from '@/contracts';
import type { CalDate } from '@/domain/time';
import type { IssueSnapshot } from '@/snapshot';

export type PdfStatus = 'pending' | 'ready' | 'failed';
export type DocumentFormat = 'docx' | 'pdf';

/** A generated document without its files (ADR 0038). */
export interface DocumentRecord {
  readonly id: string;
  readonly issueId: string;
  readonly version: number;
  readonly docxSha256: string;
  readonly pdfStatus: PdfStatus;
  readonly pdfSha256: string | null;
  /** Why the PDF failed; null unless it did, and for a failure from before the reason was kept. */
  readonly pdfFailure: PdfFailure | null;
  readonly generatedAt: Date;
}

/** A row of the archive: the document and the porada it is of. */
export interface ArchivedDocument extends DocumentRecord {
  readonly monday: CalDate;
  readonly meetingDate: CalDate;
}

/** What `insert` writes; the repository hashes the DOCX. */
export interface NewDocument {
  readonly issueId: string;
  readonly snapshot: IssueSnapshot;
  readonly docx: Uint8Array;
}

/** A file of a document, with the digest it was stored with. */
export interface DocumentFile {
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

/**
 * Generated documents (ADR 0038). They name every student of the registry, so a user reads them
 * only with `archive.view` and makes one only with `issue.generate` (ScopeViolation otherwise). The
 * worker never reads an archived DOCX: it gets the DOCX of a pending document from its staging row
 * and writes the PDF, nothing else (migrations 0037, 0039). A settled document never changes.
 */
export interface DocumentRepo {
  /**
   * Version 1 of the issue's document, PDF pending, with the DOCX staged for the PDF job in the
   * same transaction. A second one for the issue fails as
   * DatabaseFailure(`db.constraint.generated_documents_issue_version_key`).
   */
  insert(document: NewDocument): Promise<DocumentRecord>;
  /** The issue's latest document, or null. */
  forIssue(issueId: string): Promise<DocumentRecord | null>;
  /** Every document with its porada, the latest meeting first. */
  archive(): Promise<readonly ArchivedDocument[]>;
  /** The snapshot the document was composed from, or null for an unknown document. */
  snapshot(id: string): Promise<IssueSnapshot | null>;
  /** The file, or null for an unknown document or a PDF that is not ready. */
  file(id: string, format: DocumentFormat): Promise<DocumentFile | null>;
  /**
   * What the PDF job reads (system only, ScopeViolation for a user): where the PDF stands, and the
   * staged DOCX, which only a pending document has (null once settled). Null for an unknown id.
   */
  toConvert(
    id: string,
  ): Promise<{ readonly pdfStatus: PdfStatus; readonly docx: Uint8Array | null } | null>;
  /**
   * Stores the PDF (hashed here) or marks it failed with its reason, in the same update, and drops
   * the staged DOCX, only while the PDF is pending; false, with nothing changed, otherwise. System
   * only.
   */
  settlePdf(
    id: string,
    result: { readonly pdf: Uint8Array } | { readonly failure: PdfFailure },
  ): Promise<boolean>;
}

/** The `pdf.render` runs before a PDF is marked failed (the queue retries the ones before). */
export const PDF_RENDER_ATTEMPTS = 6;

/** Why a conversion failed: a code for the log, never the converter's text. */
export type ConvertCode =
  | 'convert.timeout'
  | 'convert.unavailable'
  | 'convert.not-pdf'
  | 'convert.too-large'
  | `convert.http.${number}`;

/** DOCX to PDF (Gotenberg, LibreOffice). Called outside any transaction. */
export interface DocumentConverter {
  docxToPdf(
    docx: Uint8Array,
  ): Promise<
    | { readonly ok: true; readonly pdf: Uint8Array }
    | { readonly ok: false; readonly code: ConvertCode }
  >;
}
