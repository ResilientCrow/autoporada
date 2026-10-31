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
 * worker reads the DOCX and writes the PDF, nothing else (migration 0037).
 */
export interface DocumentRepo {
  /** Version 1 of the issue's document; ConstraintViolation(`generated_documents_issue_version_key`) for a second. */
  insert(document: NewDocument): Promise<DocumentRecord>;
  /** The issue's latest document, or null. */
  forIssue(issueId: string): Promise<DocumentRecord | null>;
  /** Every document with its porada, the latest meeting first. */
  archive(): Promise<readonly ArchivedDocument[]>;
  /** The snapshot the document was composed from, or null for an unknown document. */
  snapshot(id: string): Promise<IssueSnapshot | null>;
  /** The file, or null for an unknown document or a PDF that is not ready. */
  file(id: string, format: DocumentFormat): Promise<DocumentFile | null>;
  /** What the PDF job reads: the DOCX and where its PDF stands; null for an unknown id. */
  toConvert(
    id: string,
  ): Promise<{ readonly docx: Uint8Array; readonly pdfStatus: PdfStatus } | null>;
  /** Stores the PDF (hashed here) or marks it failed, only while it is pending; false otherwise. */
  settlePdf(id: string, result: { readonly pdf: Uint8Array } | 'failed'): Promise<boolean>;
}

/** The `pdf.render` runs before a PDF is marked failed (the queue retries the ones before). */
export const PDF_RENDER_ATTEMPTS = 6;

/** Why a conversion failed: a code for the log, never the converter's text. */
export type ConvertCode =
  'convert.timeout' | 'convert.unavailable' | 'convert.not-pdf' | `convert.http.${number}`;

/** DOCX to PDF (Gotenberg, LibreOffice). Called outside any transaction. */
export interface DocumentConverter {
  docxToPdf(
    docx: Uint8Array,
  ): Promise<
    | { readonly ok: true; readonly pdf: Uint8Array }
    | { readonly ok: false; readonly code: ConvertCode }
  >;
}
