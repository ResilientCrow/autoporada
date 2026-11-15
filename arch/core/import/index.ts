import { detectFormat } from './detect';
import { readDocx, type HtmlParser, type MammothLib } from './docx';
import { ImportError } from './messages';
import { readOdt } from './odt';
import { IMPORT_LIMIT, toParts, type Imported } from './parts';
import { readPdf, type PdfLib } from './pdf';
import type { Block, PlacedBlock, Read, Shrink } from './types';

const MAX_FILE = 20_000_000;
const MAX_DOC = 10_000_000; // what the server takes (decimal, as its own cap is)
const PICTURES = /^image\/(png|jpeg|gif|webp)$/;

/** What the importer needs from the browser, so tests can stand in for it. */
export interface ImportDeps {
  shrink: Shrink;
  mammoth(): Promise<MammothLib>;
  pdf(): Promise<PdfLib>;
  parser: HtmlParser;
  convertDoc(bytes: Uint8Array): Promise<Uint8Array>;
}
export interface Imports extends Imported { skipped: number; textOnly: boolean }

/** Shrinks the pictures a browser can decode (PNG, JPEG, GIF, WebP) to JPEG; the rest are counted, not carried. */
export async function placeImages(blocks: Block[], shrink: Shrink): Promise<{ blocks: PlacedBlock[]; skipped: number }> {
  const out: PlacedBlock[] = []; let skipped = 0; let total = 0;
  for (const b of blocks) {
    if (b.k !== 'image') { out.push(b); continue; }
    if (!PICTURES.test(b.raw.mime)) { skipped++; continue; }
    const small = await shrink(b.raw).catch(() => null);
    if (!small) { skipped++; continue; }
    total += small.src.length;
    if (total > IMPORT_LIMIT) throw new ImportError('too-big');
    out.push({ k: 'image', alt: b.alt, ...small });
  }
  return { blocks: out, skipped };
}

async function readAs(format: 'docx' | 'odt' | 'pdf' | 'doc', bytes: Uint8Array, deps: ImportDeps): Promise<Read> {
  if (format === 'docx') return readDocx(bytes, await deps.mammoth(), deps.parser);
  if (format === 'odt') return readOdt(bytes, deps.parser);
  if (format === 'pdf') return readPdf(bytes, await deps.pdf());
  const pdf = await deps.convertDoc(bytes);
  const lib = await deps.pdf();
  try { return await readPdf(pdf, lib); } catch (e) {
    // Too many pages is a size, not a failure of the converter; everything else the reader refuses is.
    if (e instanceof ImportError && e.code === 'too-big') throw e;
    throw new ImportError('doc-failed', undefined, { cause: e });
  }
}

/**
 * A file into annex parts: its format is found by content, a reader makes blocks, pictures are shrunk,
 * and `toParts` groups and splits them. Throws `ImportError`; the editor words each code.
 */
export async function importFile(bytes: Uint8Array, opts: { titleEmpty: boolean; /** The JSON size of the whole annex list as it is saved now, every annex with ids and titles (`listBytes`). */ existingBytes?: number }, deps: ImportDeps): Promise<Imports> {
  if (bytes.length > MAX_FILE) throw new ImportError('file-too-big');
  const format = await detectFormat(bytes);
  if (format === 'unknown') throw new ImportError('unknown');
  if (format === 'doc' && bytes.length > MAX_DOC) throw new ImportError('file-too-big');
  const read = await readAs(format, bytes, deps);
  const placed = await placeImages(read.blocks, deps.shrink);
  const skipped = read.skipped + placed.skipped;
  try {
    return { ...toParts(placed.blocks, { titleEmpty: opts.titleEmpty, existingBytes: opts.existingBytes ?? 0 }), skipped, textOnly: read.textOnly };
  } catch (e) {
    // A file of pictures only, none of which could be carried, did not lack text; it lacked pictures we can read.
    if (e instanceof ImportError && e.code === 'empty' && skipped > 0) throw new ImportError('pictures-skipped', undefined, { cause: e });
    throw e;
  }
}
