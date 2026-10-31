import { defineUseCase, fail, ok } from '@/application/core';
import { downloadDocumentInput, downloadDocumentOutput } from '@/contracts';
import { toIsoDate } from '@/domain/time';

import { mondayOfText } from '../issues/calendar';

/**
 * One file of a porada's generated document (ADR 0038), for the staff who read the archive. The
 * document names every student of the registry, so each download is audited with the digest of
 * the bytes it handed out. A porada without a document, or a PDF not converted yet, is not found.
 */
export const downloadDocument = defineUseCase({
  name: 'documents.download',
  mode: 'write',
  input: downloadDocumentInput,
  output: downloadDocumentOutput,
  access: { kind: 'gate', check: () => ({ action: 'archive.view' }) },
  async execute({ tx }, input) {
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    const [issue] = await tx.issues.between(monday, monday);
    const document = issue && (await tx.documents.forIssue(issue.id));
    if (!issue || !document) return fail({ code: 'not-found' });
    const file = await tx.documents.file(document.id, input.format);
    if (!file) return fail({ code: 'not-found' });

    await tx.audit.record({
      action: 'document.downloaded',
      target: { type: 'document', id: document.id },
      meta: { monday: toIsoDate(monday), format: input.format, sha256: file.sha256 },
    });
    return ok({
      fileName: `porada-${toIsoDate(issue.meetingDate)}.${input.format}`,
      bytes: file.bytes,
      sha256: file.sha256,
    });
  },
});
