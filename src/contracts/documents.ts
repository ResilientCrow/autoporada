import { z } from 'zod';

/** Where a generated document stands, for the workspace, the preview and the archive (ADR 0038). */
export const documentInfo = z.strictObject({
  generatedAt: z.iso.datetime(),
  pdfStatus: z.enum(['pending', 'ready', 'failed']),
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
