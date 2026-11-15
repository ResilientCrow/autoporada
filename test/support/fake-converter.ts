import type { ConvertResult, DocumentConverter } from '@/application/ports';
import { insideTransaction } from '@/infra/system';

type Answer = ConvertResult | Error;

/** A converter that records each call; the PDF it makes is the DOCX's bytes behind a `%PDF` mark. */
export function createFakeConverter(): DocumentConverter & {
  readonly calls: { readonly docx: Uint8Array; readonly insideTransaction: boolean }[];
  /** The `.doc` conversions (the web's annex import), apart from the worker's DOCX ones. */
  readonly docCalls: { readonly doc: Uint8Array; readonly insideTransaction: boolean }[];
  /** One-shot answers for the next calls, in order; an Error is thrown. */
  script(...answers: readonly Answer[]): void;
} {
  const calls: { docx: Uint8Array; insideTransaction: boolean }[] = [];
  const docCalls: { doc: Uint8Array; insideTransaction: boolean }[] = [];
  const answers: Answer[] = [];
  return {
    calls,
    docCalls,
    script: (...more) => void answers.push(...more),
    async docxToPdf(docx) {
      calls.push({ docx, insideTransaction: insideTransaction() });
      const answer = answers.shift() ?? { ok: true, pdf: pdfOf(docx) };
      if (answer instanceof Error) throw answer;
      return answer;
    },
    async docToPdf(doc) {
      docCalls.push({ doc, insideTransaction: insideTransaction() });
      const answer = answers.shift() ?? { ok: true, pdf: pdfOf(doc) };
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

const pdfOf = (docx: Uint8Array) => new Uint8Array([...new TextEncoder().encode('%PDF-'), ...docx]);

/** For a handler that converts nothing. */
export const unusedConverter: DocumentConverter = {
  docxToPdf: () => Promise.reject(new Error('this job converts nothing')),
  docToPdf: () => Promise.reject(new Error('this job converts nothing')),
};
