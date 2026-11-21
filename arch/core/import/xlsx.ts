import type JSZip from 'jszip';
import type { HtmlParser } from './docx';
import { ImportError } from './messages';
import { MAX_COLS, MAX_ROWS, MAX_SHEETS, trimRow, type Rows } from './rows';
import { all, entryText, kids, parseXml } from './xml';

const ESCAPED = /_x([0-9A-Fa-f]{4})_/g; // how OOXML writes a control character into text
const HIDDEN = new Set(['1', 'true']);

/** Where each relationship of the workbook points, as a path in the zip (`Target` is relative to `xl/`, or absolute). */
async function relationships(zip: JSZip, parser: HtmlParser): Promise<{ byId: Map<string, string>; shared: string }> {
  const byId = new Map<string, string>(); let shared = 'xl/sharedStrings.xml';
  const text = await entryText(zip, 'xl/_rels/workbook.xml.rels');
  if (text === null) return { byId, shared };
  for (const r of all(parseXml(parser, text), 'Relationship')) {
    const target = r.getAttribute('Target') ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    byId.set(r.getAttribute('Id') ?? '', path);
    if ((r.getAttribute('Type') ?? '').endsWith('/sharedStrings')) shared = path;
  }
  return { byId, shared };
}

/** The text of a string item: its runs joined, phonetic hints left out. */
const runs = (si: Element | undefined): string => (si ? all(si, 't').filter((t) => t.parentElement?.localName !== 'rPh').map((t) => t.textContent ?? '').join('').replace(ESCAPED, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16))) : '');

async function sharedStrings(zip: JSZip, path: string, parser: HtmlParser): Promise<string[]> {
  const text = await entryText(zip, path);
  return text === null ? [] : kids(parseXml(parser, text).documentElement, 'si').map(runs);
}

/** `B12` to 1; null without a reference, when the cell follows the one before it. */
function columnOf(ref: string | null): number | null {
  const m = /^([A-Z]{1,3})\d*$/.exec(ref ?? '');
  if (!m) return null;
  let n = 0;
  for (const ch of m[1]!) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function cellText(c: Element, shared: string[]): string {
  const type = c.getAttribute('t');
  if (type === 'inlineStr') return runs(kids(c, 'is')[0]);
  if (type === 'e') return '';
  const v = kids(c, 'v')[0]?.textContent ?? '';
  return type === 's' ? shared[Number(v)] ?? '' : v;
}

function sheetRows(doc: Document, shared: string[]): Rows {
  const rows: Rows = [];
  for (const row of all(doc, 'row')) {
    if (rows.length >= MAX_ROWS) break;
    if (HIDDEN.has(row.getAttribute('hidden') ?? '')) continue; // hidden by hand or by a filter
    const cells: (string | undefined)[] = []; let next = 0;
    for (const c of kids(row, 'c')) {
      const at = columnOf(c.getAttribute('r')) ?? next;
      next = at + 1;
      if (at < MAX_COLS) cells[at] = cellText(c, shared);
    }
    rows.push(trimRow(cells));
  }
  return rows;
}

/** The visible sheets of an .xlsx in tab order, each as rows of cell texts (numbers as stored, not as formatted). */
export async function readXlsx(zip: JSZip, parser: HtmlParser): Promise<Rows[]> {
  try {
    const book = await entryText(zip, 'xl/workbook.xml');
    if (book === null) throw new Error('workbook');
    const rels = await relationships(zip, parser);
    const shared = await sharedStrings(zip, rels.shared, parser);
    const out: Rows[] = [];
    for (const sheet of all(parseXml(parser, book), 'sheet').slice(0, MAX_SHEETS)) {
      if (/hidden/i.test(sheet.getAttribute('state') ?? '')) continue; // hidden and veryHidden
      // r:id; matched by name, as not every DOM gives a prefixed attribute its local name
      const id = Array.from(sheet.attributes).find((a) => /(^|:)id$/.test(a.name))?.value ?? '';
      const text = await entryText(zip, rels.byId.get(id) ?? '');
      if (text !== null) out.push(sheetRows(parseXml(parser, text), shared));
    }
    return out;
  } catch (e) {
    throw e instanceof ImportError ? e : new ImportError('broken', undefined, { cause: e });
  }
}
