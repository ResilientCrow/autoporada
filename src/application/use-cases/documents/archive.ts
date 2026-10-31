import { defineUseCase, ok } from '@/application/core';
import { documentArchiveInput, documentArchiveOutput } from '@/contracts';
import { toIsoDate } from '@/domain/time';

import { documentInfoOf } from './info';

/** „Archiv“: every generated porada with where its PDF stands, the latest meeting first. */
export const documentArchive = defineUseCase({
  name: 'documents.archive',
  mode: 'read',
  input: documentArchiveInput,
  output: documentArchiveOutput,
  access: { kind: 'gate', check: () => ({ action: 'archive.view' }) },
  async execute({ tx }) {
    const documents = await tx.documents.archive();
    return ok({
      documents: documents.map((d) => ({
        monday: toIsoDate(d.monday),
        meetingDate: toIsoDate(d.meetingDate),
        ...documentInfoOf(d),
      })),
    });
  },
});
