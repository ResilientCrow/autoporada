import type JSZip from 'jszip';
import { ImportError } from './messages';

/** What one entry and a whole zip may inflate to (decimal bytes). */
const ZIP_LIMITS = { entry: 30_000_000, total: 100_000_000 };
/** The `mimetype` entry of an OpenDocument file is one short line. */
export const MAX_MIMETYPE = 256;

/**
 * What an entry will inflate to, as the zip directory declares it; null when there is no such entry. JSZip checks the
 * real size against it while inflating, so a lie fails there. Read from JSZip's own record (pinned version, covered by
 * the tests); a record without a size counts as unbounded, so the guard fails closed.
 */
export function declaredSize(zip: JSZip, name: string): number | null {
  const entry = zip.file(name) as unknown as { _data?: { uncompressedSize?: unknown } } | null;
  if (!entry) return null;
  const n = entry._data?.uncompressedSize;
  return typeof n === 'number' && n >= 0 ? n : Infinity;
}

/** Refuses a zip before anything is inflated when an entry, or all of them together, would inflate beyond the limits. */
export function assertZipSize(zip: JSZip, limits: { entry: number; total: number } = ZIP_LIMITS): void {
  let total = 0;
  for (const [name, f] of Object.entries(zip.files)) {
    if (f.dir) continue;
    const n = declaredSize(zip, name) ?? 0;
    total += n;
    if (n > limits.entry || total > limits.total) throw new ImportError('too-big');
  }
}
