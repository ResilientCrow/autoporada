import {
  JOB_TX_TIMEOUT_MS,
  PDF_RENDER_ATTEMPTS,
  system,
  type JobHandler,
} from '@/application/ports';

/**
 * Converts a generated document's DOCX to its PDF (ADR 0038): a read transaction loads the DOCX,
 * the converter runs outside any transaction, a write transaction stores the PDF while it is still
 * pending. A failed conversion is retried by the queue; the last attempt marks the PDF failed, and
 * the DOCX stays downloadable.
 */
export const pdfRender: JobHandler<'pdf.render'> = async ({ db, clock, converter }, job) => {
  const { documentId } = job.data;
  const context = () => ({
    principal: system('job:pdf.render'),
    now: clock.now(),
    requestId: job.id,
  });
  const source = await db.transaction(
    context(),
    { mode: 'read', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
    (tx) => tx.documents.toConvert(documentId),
  );
  if (!source) return { kind: 'done', code: 'skipped.unknown' };
  if (source.pdfStatus !== 'pending') return { kind: 'done', code: 'already.settled' };

  const result = await converter.docxToPdf(source.docx);
  if (!result.ok && job.attempt < PDF_RENDER_ATTEMPTS) return { kind: 'retry', code: result.code };

  const settled = await db.transaction(
    context(),
    { mode: 'write', transactionTimeoutMs: JOB_TX_TIMEOUT_MS },
    (tx) => tx.documents.settlePdf(documentId, result.ok ? { pdf: result.pdf } : 'failed'),
  );
  if (!settled) return { kind: 'done', code: 'already.settled' };
  return result.ok
    ? { kind: 'done', code: 'rendered' }
    : { kind: 'done', code: `failed.${result.code}` };
};
