import type { ConvertCode, DocumentConverter } from '@/application/ports';
import { assertOutsideTransaction } from '@/infra/system';

/** LibreOffice converts a porada in a few seconds; past this the job tries again later. */
const CONVERT_BUDGET_MS = 60_000;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF

/** The fetch the converter needs: the global one, or a test's. */
export type ConvertFetch = (
  url: string,
  init: { readonly method: 'POST'; readonly body: FormData; readonly signal: AbortSignal },
) => Promise<Response>;

const isPdf = (bytes: Uint8Array) => PDF_MAGIC.every((b, i) => bytes[i] === b);

/**
 * DOCX to PDF through Gotenberg's LibreOffice route (ADR 0038). An answer that is not a PDF is a
 * failure too. Never throws for the converter's outcome, and never keeps its text: only a code.
 */
export function createGotenbergConverter(options: {
  readonly url: string;
  readonly fetch?: ConvertFetch;
  readonly budgetMs?: number;
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
        const response = await fetch(endpoint, { method: 'POST', body: form, signal });
        if (!response.ok) {
          await response.body?.cancel();
          return fail(`convert.http.${response.status}`);
        }
        const pdf = new Uint8Array(await response.arrayBuffer());
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
