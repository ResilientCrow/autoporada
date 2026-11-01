import { z } from 'zod';

import { FAILURE_CAUSES, type FailureCause } from './failure';

/**
 * Why a download answered with the archive page instead of a file (ADR 0044): the `chyba`
 * parameter the route writes and the page reads. A closed set, so a page shows only a sentence
 * of its own for it, whoever wrote the URL.
 */
export type DownloadError = FailureCause | 'not-found' | 'rate-limited';

export const DOWNLOAD_ERRORS: readonly DownloadError[] = [
  ...FAILURE_CAUSES,
  'not-found',
  'rate-limited',
];

export const isDownloadError = (value: unknown): value is DownloadError =>
  (DOWNLOAD_ERRORS as readonly unknown[]).includes(value);

/**
 * Why a PDF could not be made (ADR 0044): the converter did not answer in time, was not there,
 * refused the document, answered with something that is no PDF, answered with too much, or
 * anything else. Stored with a failed PDF; a failure from before the column has none, which the
 * page reads as `error`.
 */
export const PDF_FAILURES = [
  'timeout',
  'unavailable',
  'refused',
  'not-pdf',
  'too-large',
  'error',
] as const;

export type PdfFailure = (typeof PDF_FAILURES)[number];

/** Where a generated document stands, for the workspace, the preview and the archive (ADR 0038). */
export const documentInfo = z.strictObject({
  generatedAt: z.iso.datetime(),
  pdfStatus: z.enum(['pending', 'ready', 'failed']),
  /** Why the PDF failed; null unless it did, and for a failure from before the reason was kept. */
  pdfFailure: z.enum(PDF_FAILURES).nullable(),
});

/** One file of the porada's document, by the porada's Monday. */
export const downloadDocumentInput = z.strictObject({
  monday: z.iso.date().max(10),
  format: z.enum(['docx', 'pdf']),
});

/**
 * The one binary output: a file a route hands out (ADR 0038). JSON Schema cannot name bytes, so
 * the schema hygiene check knows this schema by identity; no input ever takes it.
 */
export const fileBytes = z.custom<Uint8Array>((value) => value instanceof Uint8Array);

export const downloadDocumentOutput = z.strictObject({
  /** „porada-2026-11-09.docx“, by the meeting date. */
  fileName: z.string(),
  bytes: fileBytes,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const documentArchiveInput = z.strictObject({});

/** Every generated porada, the latest meeting first. */
export const documentArchiveOutput = z.strictObject({
  documents: z.array(
    z.strictObject({
      monday: z.iso.date(),
      meetingDate: z.iso.date(),
      ...documentInfo.shape,
    }),
  ),
});
