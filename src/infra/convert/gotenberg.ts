import type { ConvertCode, DocumentConverter } from '@/application/ports';
import { assertOutsideTransaction } from '@/infra/system';

/** LibreOffice converts a porada in a few seconds; past this the job tries again later. */
const CONVERT_BUDGET_MS = 60_000;

/** A porada's PDF is a few megabytes; an answer past this is refused while it streams. */
const PDF_MAX_BYTES = 32 * 1024 * 1024;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

/** The fetch the converter needs: the global one, or a test's. */
export type ConvertFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly body: FormData;
    readonly signal: AbortSignal;
    readonly redirect: 'manual';
  },
) => Promise<Response>;

const isPdf = (bytes: Uint8Array) => PDF_MAGIC.every((b, i) => bytes[i] === b);

/** The body, or null once it passes `max` bytes (leaving the loop cancels the rest). */
async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  if (Number(response.headers.get('content-length') ?? 0) > max) {
    await response.body?.cancel();
    return null;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body ?? []) {
    total += chunk.byteLength;
    if (total > max) return null;
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * DOCX to PDF through Gotenberg's LibreOffice route (ADR 0038). An answer that is not a PDF is a
 * failure too. Never throws for the converter's outcome, and never keeps its text: only a code. A
 * redirect is an answer, not followed: it would post the porada to another host (ADR 0039).
 */
export function createGotenbergConverter(options: {
  readonly url: string;
  readonly fetch?: ConvertFetch;
  readonly budgetMs?: number;
  readonly maxBytes?: number;
}): DocumentConverter {
  const fetch: ConvertFetch = options.fetch ?? globalThis.fetch;
  const endpoint = `${options.url}/forms/libreoffice/convert`;
  return {
    async docxToPdf(docx) {
      assertOutsideTransaction('convert');
      const form = new FormData();
      // LibreOffice picks the importer by extension, so the upload is always named .docx.
      form.append('files', new Blob([docx as BlobPart]), 'porada.docx');
      const fail = (code: ConvertCode) => ({ ok: false as const, code });
      try {
        const signal = AbortSignal.timeout(options.budgetMs ?? CONVERT_BUDGET_MS);
        const response = await fetch(endpoint, {
          method: 'POST',
          body: form,
          signal,
          redirect: 'manual',
        });
        if (!response.ok) {
          await response.body?.cancel();
          return fail(`convert.http.${response.status}`);
        }
        const pdf = await readCapped(response, options.maxBytes ?? PDF_MAX_BYTES);
        if (pdf === null) return fail('convert.too-large');
        return isPdf(pdf) ? { ok: true as const, pdf } : fail('convert.not-pdf');
      } catch (error) {
        return fail(
          error instanceof DOMException && error.name === 'TimeoutError'
            ? 'convert.timeout'
            : 'convert.unavailable',
        );
      }
    },
  };
}
