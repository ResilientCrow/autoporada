import { classifyFailure, defineUseCase, ok } from '@/application/core';
import type { DocumentRepo } from '@/application/ports';
import { listDocumentsInput, listDocumentsOutput } from '@/contracts';
import { toIsoDate } from '@/domain/time';

import { archivedModel } from './model';

/** The snapshot of a document, or null when none is stored or the stored one fails its schema. */
async function readableSnapshot(documents: DocumentRepo, id: string) {
  try {
    return await documents.snapshot(id);
  } catch (error) {
    if (classifyFailure(error) === 'stored-data') return null;
    throw error;
  }
}

/**
 * The archive shelf: one entry per generated porada, the latest meeting first, with how many
 * points its document holds and the texts of the last three. A porada whose stored snapshot is
 * unreadable is left off (the client shows a generated porada missing here as a row without them).
 * Read-only, no audit record (see `documents.read`).
 */
export const listDocuments = defineUseCase({
  name: 'documents.list',
  mode: 'read',
  input: listDocumentsInput,
  output: listDocumentsOutput,
  access: { kind: 'gate', check: () => ({ action: 'archive.view' }) },
  async execute({ tx }) {
    // The archive lists every version, the latest meeting first and the latest version first within it.
    const seen = new Set<string>();
    const documents = [];
    for (const row of await tx.documents.archive()) {
      if (seen.has(row.issueId)) continue;
      seen.add(row.issueId);
      const snapshot = await readableSnapshot(tx.documents, row.id);
      if (!snapshot) continue;
      const { points, titles } = archivedModel(snapshot);
      documents.push({ monday: toIsoDate(row.monday), points, titles });
    }
    return ok({ documents });
  },
});
