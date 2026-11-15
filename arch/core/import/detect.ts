import JSZip from 'jszip';
import { assertZipSize, declaredSize, MAX_MIMETYPE } from './zipguard';

export type Format = 'docx' | 'odt' | 'pdf' | 'doc' | 'unknown';

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const PDF = new TextEncoder().encode('%PDF-');
const startsWith = (b: Uint8Array, magic: ArrayLike<number>) => b.length >= magic.length && Array.from({ length: magic.length }, (_, i) => b[i] === magic[i]).every(Boolean);

/** What a file is by its content (magic bytes, zip entries), never by its name. */
export async function detectFormat(bytes: Uint8Array): Promise<Format> {
  if (startsWith(bytes, OLE)) return 'doc';
  if (startsWith(bytes, ZIP)) {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(bytes); } catch { return 'unknown'; }
    assertZipSize(zip); // before any entry is inflated; throws ImportError('too-big')
    if (zip.file('word/document.xml')) return 'docx';
    if ((declaredSize(zip, 'mimetype') ?? Infinity) > MAX_MIMETYPE) return 'unknown';
    try {
      const mime = await zip.file('mimetype')?.async('string');
      return mime?.trim().startsWith('application/vnd.oasis.opendocument.text') ? 'odt' : 'unknown';
    } catch { return 'unknown'; }
  }
  // The spec lets a PDF start within its first kilobyte.
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + PDF.length <= head.length; i++) if (startsWith(head.subarray(i), PDF)) return 'pdf';
  return 'unknown';
}
