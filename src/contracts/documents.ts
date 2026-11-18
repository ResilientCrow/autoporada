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

const run = z.strictObject({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
});
const runs = z.array(run).readonly();

/** One block of a document (`document/model`), by its kind. */
const documentBlockWire = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('title'), text: z.string() }),
  z.strictObject({ kind: z.literal('label'), label: z.string(), text: z.string() }),
  z.strictObject({ kind: z.literal('section'), text: z.string() }),
  z.strictObject({ kind: z.literal('point'), number: z.int(), text: z.string() }),
  z.strictObject({ kind: z.literal('body'), runs }),
  z.strictObject({ kind: z.literal('reportLine'), label: z.string(), runs }),
  z.strictObject({ kind: z.literal('dash'), label: z.string(), runs }),
  z.strictObject({ kind: z.literal('bullet'), runs }),
  z.strictObject({
    kind: z.literal('rich'),
    level: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    runs,
  }),
  z.strictObject({ kind: z.literal('partner'), label: z.string(), quote: z.string() }),
  z.strictObject({ kind: z.literal('spacer'), keepNext: z.boolean().optional() }),
  z.strictObject({ kind: z.literal('pageBreak') }),
  z.strictObject({ kind: z.literal('closing'), place: z.string(), signature: z.string() }),
  z.strictObject({ kind: z.literal('annex'), text: z.string() }),
  z.strictObject({ kind: z.literal('annexTitle'), text: z.string() }),
  z.strictObject({
    kind: z.literal('studentTable'),
    rows: z
      .array(z.strictObject({ name: z.string(), classCode: z.string(), isNew: z.boolean() }))
      .readonly(),
  }),
  z.strictObject({
    kind: z.literal('dataTable'),
    rows: z.array(z.array(z.string()).readonly()).readonly(),
  }),
  z.strictObject({
    kind: z.literal('image'),
    src: z.string(),
    width: z.number(),
    height: z.number(),
    alt: z.string(),
  }),
]);

/**
 * A composed document as the archive reads it (`document/model`). `contracts` may not import the
 * model's types, so this names every block once; the use case's output type proves the model fits
 * it, and a test proves the other way round.
 */
const documentModelWire = z.strictObject({
  meta: z.strictObject({ title: z.string(), author: z.string() }),
  sections: z
    .array(
      z.strictObject({
        layout: z.enum(['single', 'twoColumn', 'nextPage']),
        blocks: z.array(documentBlockWire).readonly(),
      }),
    )
    .readonly(),
});

/** One generated porada's document, by the porada's Monday. */
export const readDocumentInput = z.strictObject({ monday: z.iso.date().max(10) });

export const readDocumentOutput = z.strictObject({
  /** When the latest document was generated. */
  at: z.iso.datetime(),
  model: documentModelWire,
  /** How many numbered points the model holds. */
  points: z.int().nonnegative(),
});

/** The archive shelf: every generated porada, no input. */
export const listDocumentsInput = z.strictObject({});

export const listDocumentsOutput = z.strictObject({
  /** Latest meeting first. */
  documents: z
    .array(
      z.strictObject({
        monday: z.iso.date(),
        points: z.int().nonnegative(),
        /** The last three points of the document, in its order. */
        titles: z.array(z.string()).max(3).readonly(),
      }),
    )
    .readonly(),
});
