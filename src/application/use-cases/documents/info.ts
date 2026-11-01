import type { DocumentRecord } from '@/application/ports';

/** Where a generated document stands, as the workspace, the preview and the archive send it. */
export const documentInfoOf = (document: DocumentRecord) => ({
  generatedAt: document.generatedAt.toISOString(),
  pdfStatus: document.pdfStatus,
  pdfFailure: document.pdfFailure,
});
