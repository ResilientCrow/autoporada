import JSZip from 'jszip';
import { decodeText, parseCsv } from './csv';
import { odfMimetype, startsWith, ZIP } from './detect';
import type { HtmlParser } from './docx';
import { ImportError } from './messages';
import { readOds } from './ods';
import { readXlsx } from './xlsx';
import type { Rows } from './rows';
import { assertZipSize } from './zipguard';

/** A list of people is small; a bigger file is something else. `readParticipants` checks it before reading the file. */
export const MAX_FILE = 5_000_000;
const TEXT_PROBE = 8192;
const PDF = new TextEncoder().encode('%PDF-');
const MARKUP = /^\uFEFF?\s*</;

/** Text has no NUL byte, unless it is UTF-16 with a BOM; pictures and an old .xls (OLE) have one, a PDF says what it is. */
function looksLikeText(bytes: Uint8Array): boolean {
  if (startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff])) return true;
  return !startsWith(bytes, PDF) && !bytes.subarray(0, TEXT_PROBE).includes(0);
}

async function readZip(bytes: Uint8Array, parser: HtmlParser): Promise<Rows[]> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch (e) { throw new ImportError('broken', undefined, { cause: e }); }
  assertZipSize(zip); // before any entry is inflated; throws ImportError('too-big')
  if (zip.file('xl/workbook.xml')) return readXlsx(zip, parser);
  if ((await odfMimetype(zip)).startsWith('application/vnd.oasis.opendocument.spreadsheet')) return readOds(zip, parser);
  throw new ImportError('unknown');
}

/**
 * The sheets of a spreadsheet file, each as rows of cell texts. The format is found by content, never by name:
 * a zip is an .xlsx or an .ods, anything else that is text a CSV. Throws `ImportError`.
 */
export async function readSheets(bytes: Uint8Array, parser: HtmlParser): Promise<Rows[]> {
  if (bytes.length > MAX_FILE) throw new ImportError('file-too-big');
  if (startsWith(bytes, ZIP)) return readZip(bytes, parser);
  if (!looksLikeText(bytes)) throw new ImportError('unknown');
  const text = decodeText(bytes);
  // A web page or an Excel 2003 XML file saved as .xls is text too, but its tags are no names.
  if (MARKUP.test(text)) throw new ImportError('unknown');
  return [parseCsv(text)];
}
