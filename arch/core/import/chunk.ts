import { ImportError } from './messages';

/**
 * Loads a lazy chunk (the importer, mammoth, pdf.js). A chunk that cannot be fetched means the page is older than
 * the server's build: its hashed file is gone. That is its own error, with its own sentence.
 */
export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  try { return await load(); } catch (e) { throw new ImportError('stale', undefined, { cause: e }); }
}
