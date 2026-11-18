import { defineUseCase, fail, ok } from '@/application/core';
import { readDocumentInput, readDocumentOutput } from '@/contracts';

import { mondayOfText } from '../issues/calendar';
import { archivedModel } from './model';

/**
 * The composed document of a porada, for the staff who open it in the archive: the latest one's
 * model, how many points it holds and when it was generated. Staff already receive every model
 * with the state, so a read leaves no audit record; the audit stays for the files that leave the
 * app (`documents.download`). A porada without a document is not found.
 */
export const readDocument = defineUseCase({
  name: 'documents.read',
  mode: 'read',
  input: readDocumentInput,
  output: readDocumentOutput,
  access: { kind: 'gate', check: () => ({ action: 'archive.view' }) },
  async execute({ tx }, input) {
    const monday = mondayOfText(input.monday);
    if (!monday) return fail({ code: 'invalid-input', fields: { monday: 'invalid' } });
    const [issue] = await tx.issues.between(monday, monday);
    const document = issue && (await tx.documents.forIssue(issue.id));
    const snapshot = document && (await tx.documents.snapshot(document.id));
    if (!document || !snapshot) return fail({ code: 'not-found' });

    const { model, points } = archivedModel(snapshot);
    return ok({ at: document.generatedAt.toISOString(), model, points });
  },
});
