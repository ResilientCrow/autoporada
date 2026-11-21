import type JSZip from 'jszip';
import type { HtmlParser } from './docx';
import { ImportError } from './messages';
import { MAX_COLS, MAX_ROWS, MAX_SHEETS, trimRow, type Rows } from './rows';
import { all, entryText, kids, parseXml } from './xml';

const ELEMENT = 1, TEXT = 3;
const SPACES = new Set(['s', 'tab', 'line-break']);
const SKIPPED = new Set(['annotation', 'note']);
const HIDDEN = new Set(['collapse', 'filter']);

/** The text of a paragraph: spans and links read through, `text:s`, tabs and line breaks as a space. */
function textOf(n: Node): string {
  if (n.nodeType === TEXT) return n.nodeValue ?? '';
  if (n.nodeType !== ELEMENT) return '';
  const local = (n as Element).localName;
  if (SPACES.has(local)) return ' ';
  if (SKIPPED.has(local)) return '';
  return Array.from(n.childNodes, textOf).join('');
}

/** A cell's paragraphs, joined by a space; a comment (`office:annotation`) is not one of them. */
const cellText = (c: Element) => Array.from(c.children).filter((x) => x.localName === 'p' || x.localName === 'h').map(textOf).join(' ');
const repeat = (e: Element, name: string) => Math.max(1, Number.parseInt(e.getAttribute(name) ?? '', 10) || 1);

function tableRows(table: Element): Rows {
  const rows: Rows = [];
  for (const row of all(table, 'table-row')) {
    if (rows.length >= MAX_ROWS) break;
    if (HIDDEN.has(row.getAttribute('table:visibility') ?? '')) continue; // hidden by hand or by a filter
    const cells: string[] = [];
    for (const c of Array.from(row.children)) {
      if (c.localName !== 'table-cell' && c.localName !== 'covered-table-cell') continue;
      const text = cellText(c);
      // A repeat fills the rest of the sheet (16384 columns); stop at a sane width. A repeated row is read once.
      for (let k = repeat(c, 'table:number-columns-repeated'); k > 0 && cells.length < MAX_COLS; k--) cells.push(text);
    }
    rows.push(trimRow(cells));
  }
  return rows;
}

/** The table styles that hide a sheet (`table:display="false"`), from the automatic styles of `content.xml`. */
function hiddenStyles(doc: Document): Set<string> {
  const out = new Set<string>();
  for (const style of all(doc, 'style'))
    if (style.getAttribute('style:family') === 'table' && kids(style, 'table-properties').some((p) => p.getAttribute('table:display') === 'false')) out.add(style.getAttribute('style:name') ?? '');
  return out;
}

/** The visible sheets of an .ods in order, each as rows of cell texts as they show (`content.xml`). */
export async function readOds(zip: JSZip, parser: HtmlParser): Promise<Rows[]> {
  try {
    const content = await entryText(zip, 'content.xml');
    if (content === null) throw new Error('content');
    const doc = parseXml(parser, content);
    const sheets = all(doc, 'spreadsheet')[0];
    if (!sheets) throw new Error('spreadsheet');
    const hidden = hiddenStyles(doc);
    return kids(sheets, 'table').filter((t) => !hidden.has(t.getAttribute('table:style-name') ?? '')).slice(0, MAX_SHEETS).map(tableRows);
  } catch (e) {
    throw e instanceof ImportError ? e : new ImportError('broken', undefined, { cause: e });
  }
}
