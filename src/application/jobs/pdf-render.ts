import {
  JOB_TX_TIMEOUT_MS,
  PDF_RENDER_ATTEMPTS,
  system,
  type JobHandler,
  type JobOutcome,
} from '@/application/ports';
import type { PdfFailure } from '@/contracts';

import { pdfFailureOf } from './pdf-failure';

/**
 * Converts a generated document's DOCX to its PDF (ADR 0038): a read transaction loads the staged
 * DOCX, the converter runs outside any transaction, a write transaction stores the PDF (and drops
 * the staged DOCX) while it is still pending. A failed conversion is retried by the queue; the
 * last attempt marks the PDF failed, and the DOCX stays downloadable. So does a fault (a throw)
 * on the last attempt: the PDF would otherwise stay pending for good. Before that a fault
 * propagates and the queue retries.
 */
export const pdfRender: JobHandler<'pdf.render'> = async ({ db, clock, converter }, job) => {
  const { documentId } = job.data;
  const context = () => ({
    principal: system('job:pdf.render'),
    now: clock.now(),
    requestId: job.id,
  });
  const settle = (result: { readonly pdf: Uint8Array } | { readonly failure: PdfFailure }) =>
    db.transaction(context(), { mode: 'write', transactionTimeoutMs: JOB_TX_TIMEOUT_MS }, (tx) =>
      tx.documents.settlePdf(documentId, result),
    );

  const render = async (): Promise<JobOutcome> => {
    const source = await db.transaction(
      context(),
      { mode: 'read', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
      (tx) => tx.documents.toConvert(documentId),
    );
    if (!source) return { kind: 'done', code: 'skipped.unknown' };
    if (source.pdfStatus !== 'pending') return { kind: 'done', code: 'already.settled' };
    // Staged with the document and dropped only on settling: a pending document without it is a fault.
    if (!source.docx) throw new Error('pdf.render: a pending document has no staged source');

    const result = await converter.docxToPdf(source.docx);
    if (!result.ok && job.attempt < PDF_RENDER_ATTEMPTS) {
      return { kind: 'retry', code: result.code };
    }
    const settled = await settle(
      result.ok ? { pdf: result.pdf } : { failure: pdfFailureOf(result.code) },
    );
    if (!settled) return { kind: 'done', code: 'already.settled' };
    return result.ok
      ? { kind: 'done', code: 'rendered' }
      : { kind: 'done', code: `failed.${result.code}` };
  };

  try {
    return await render();
  } catch (error) {
    if (job.attempt < PDF_RENDER_ATTEMPTS) throw error;
    // The last attempt: give the PDF a final state. If even that cannot be written, the fault stands.
    try {
      if (!(await settle({ failure: 'error' }))) return { kind: 'done', code: 'already.settled' };
    } catch {
      throw error;
    }
    return { kind: 'done', code: 'failed.error' };
  }
};
