/**
 * Reads the formatting facts that make a porada look like the template —
 * page, styles, numbering, footer, Příloha 1 table — from any .docx. Run on
 * the school's template once (scripts/extract-template-facts.ts) and on every
 * generated document in the parity test; both must agree.
 *
 * Numbering is compared by role, not by numId: each role is found through
 * text that the template and the template-replica fixture share.
 */
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';

interface LevelFacts {
  format: string;
  text: string;
  font: string | null;
  left: number;
  hanging: number;
  bold: boolean;
  italic: boolean;
}

export interface FormatFacts {
  page: {
    width: number;
    height: number;
    margins: Record<'top' | 'right' | 'bottom' | 'left' | 'header' | 'footer', number>;
  };
  annexColumns: { count: number; space: number };
  defaultTabStop: number;
  /** Half-point sizes of the title, big headings, „PŘÍLOHA n“ and the Příloha 1 heading. */
  sizes: { title: number; section: number; annex: number; annexTitle: number };
  normal: {
    font: string;
    size: number;
    alignment: string;
    spacingBefore: number;
    spacingAfter: number;
  };
  heading: { left: number; hanging: number; bold: boolean; keepNext: boolean };
  numbering: {
    points: LevelFacts;
    bullet: LevelFacts;
    rich: [LevelFacts, LevelFacts, LevelFacts];
    dash: LevelFacts;
    partners: LevelFacts;
  };
  footer: { alignment: string; tokens: string[] };
  table: {
    width: number;
    grid: number[];
    layout: string;
    alignment: string;
    cellMargins: Record<'top' | 'bottom' | 'left' | 'right', number>;
    border: { style: string; size: number; color: string };
    font: string;
    size: number;
    headerHeight: number;
    rowHeight: number;
  };
}

type Node = Record<string, unknown>;

const ARRAYS = new Set([
  'w:p',
  'w:r',
  'w:lvl',
  'w:abstractNum',
  'w:num',
  'w:style',
  'w:tr',
  'w:tc',
  'w:gridCol',
  'w:t',
  'w:instrText',
  'w:tbl',
]);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Footer runs like „Stránka “ depend on their spaces.
  trimValues: false,
  isArray: (name) => ARRAYS.has(name),
});

const obj = (v: unknown): Node =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Node) : {};
const arr = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : v ? [obj(v)] : []);
const attr = (n: unknown, name: string): string | undefined => {
  const v = obj(n)[`@w:${name}`];
  return v === undefined ? undefined : String(v);
};
const num = (n: unknown, name: string): number => Number(attr(n, name) ?? 0);
/** <w:b/>, <w:b w:val="true"/> and <w:b w:val="1"/> are on; w:val="false"/"0" is off. */
const flag = (parent: Node, tag: string): boolean => {
  if (!(tag in parent)) return false;
  const val = attr(parent[tag], 'val');
  return val === undefined || val === 'true' || val === '1';
};

/** A paragraph's text; no-break spaces read as spaces, so anchor texts match either way. */
const textOf = (p: Node): string =>
  arr(p['w:r'])
    .flatMap((r) => arr(r['w:t']))
    .map((t) => (typeof t === 'object' ? String((t as Node)['#text'] ?? '') : String(t)))
    .join('')
    .replaceAll('\u00A0', ' ');

const numIdOf = (p: Node): string | undefined =>
  attr(obj(obj(obj(p['w:pPr'])['w:numPr'])['w:numId']), 'val');

async function read(zip: JSZip, path: string): Promise<Node> {
  const file = zip.file(path);
  if (!file) throw new Error(`missing ${path}`);
  return parser.parse(await file.async('string')) as Node;
}

function levelFacts(numbering: Node, numId: string, ilvl: number): LevelFacts {
  const root = obj(numbering['w:numbering']);
  const instance = arr(root['w:num']).find((n) => attr(n, 'numId') === numId);
  const abstractId = attr(obj(obj(instance)['w:abstractNumId']), 'val');
  const abstract = arr(root['w:abstractNum']).find((a) => attr(a, 'abstractNumId') === abstractId);
  const lvl = arr(obj(abstract)['w:lvl']).find((l) => attr(l, 'ilvl') === String(ilvl));
  if (!lvl) throw new Error(`numbering ${numId} has no level ${ilvl}`);
  const ind = obj(obj(lvl['w:pPr'])['w:ind']);
  const rPr = obj(lvl['w:rPr']);
  return {
    format: attr(lvl['w:numFmt'], 'val') ?? '',
    text: attr(lvl['w:lvlText'], 'val') ?? '',
    font: attr(rPr['w:rFonts'], 'ascii') ?? null,
    left: num(ind, 'left') || num(ind, 'start'),
    hanging: num(ind, 'hanging'),
    bold: flag(rPr, 'w:b'),
    italic: flag(rPr, 'w:i'),
  };
}

/** Finds the numId of the first numbered paragraph matching `pick`. */
function numIdWhere(
  paragraphs: Node[],
  pick: (p: Node, i: number) => boolean,
  what: string,
): string {
  const index = paragraphs.findIndex((p, i) => numIdOf(p) !== undefined && pick(p, i));
  const id = index >= 0 ? numIdOf(paragraphs[index] ?? {}) : undefined;
  if (!id) throw new Error(`cannot find the ${what} numbering`);
  return id;
}

/** The font size of the first text run of the first unnumbered paragraph whose text matches. */
function runSize(paragraphs: Node[], match: (text: string) => boolean): number {
  const p = paragraphs.find((x) => match(textOf(x)) && numIdOf(x) === undefined);
  const run = arr(obj(p)['w:r']).find((r) => textOf({ 'w:r': [r] }).trim() !== '');
  return Number(attr(obj(obj(run)['w:rPr'])['w:sz'], 'val') ?? 0);
}

export async function extractFacts(docx: Uint8Array | Buffer): Promise<FormatFacts> {
  const zip = await JSZip.loadAsync(docx);
  const document = await read(zip, 'word/document.xml');
  const styles = await read(zip, 'word/styles.xml');
  const numbering = await read(zip, 'word/numbering.xml');
  const settings = await read(zip, 'word/settings.xml');
  const body = obj(obj(document['w:document'])['w:body']);
  const paragraphs = arr(body['w:p']);

  // Sections: the final body sectPr plus sectPrs carried by section-break paragraphs.
  const sections = [
    ...paragraphs.map((p) => obj(p['w:pPr'])['w:sectPr']).filter(Boolean),
    body['w:sectPr'],
  ].map(obj);
  const first = sections[0] ?? {};
  const pgMar = obj(first['w:pgMar']);
  const twoColumn = sections.find((s) => num(s['w:cols'], 'num') === 2) ?? {};

  const stylesRoot = obj(styles['w:styles']);
  const defaults = obj(stylesRoot['w:docDefaults']);
  const defaultRun = obj(obj(defaults['w:rPrDefault'])['w:rPr']);
  const defaultPara = obj(obj(defaults['w:pPrDefault'])['w:pPr']);
  const style = (id: string) =>
    arr(stylesRoot['w:style']).find((s) => attr(s, 'styleId') === id) ?? {};
  const normal = style('Normal');
  const normalRun = obj(normal['w:rPr']);
  const normalPara = obj(normal['w:pPr']);
  const heading = style('Heading1');
  const headingPara = obj(heading['w:pPr']);
  const headingRun = obj(heading['w:rPr']);

  const at = (needle: string) => paragraphs.findIndex((p) => textOf(p).includes(needle));
  const meetings = at('Zatím známá jednání');
  const events = at('Zatím známé akce');
  const partners = at('Ohlasy sociálních partnerů');
  const pointsId = numIdOf(paragraphs[meetings] ?? {});
  if (!pointsId) throw new Error('cannot find the point numbering');

  const footerPath =
    Object.keys(zip.files).find(
      (f) => /^word\/footer\d*\.xml$/.test(f) && !f.endsWith('footer1.xml'),
    ) ?? 'word/footer1.xml';
  const footerCandidates = Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f));
  let footerParagraph: Node = {};
  for (const path of [footerPath, ...footerCandidates]) {
    const p = arr(obj((await read(zip, path))['w:ftr'])['w:p'])[0];
    if (p && arr(p['w:r']).length > 0) {
      footerParagraph = p;
      break;
    }
  }
  // Field codes become {PAGE}; cached field results (between separate and end) are skipped,
  // because a generated document carries none.
  let inResult = false;
  const tokens = arr(footerParagraph['w:r']).flatMap((r) => {
    const fldChar = attr(r['w:fldChar'], 'fldCharType');
    if (fldChar === 'separate') inResult = true;
    if (fldChar === 'end') inResult = false;
    if (fldChar) return [];
    const bold = flag(obj(r['w:rPr']), 'w:b') ? '*' : '';
    const instr = arr(r['w:instrText'])
      .map((t) => String(typeof t === 'object' ? (t as Node)['#text'] : t).trim())
      .filter(Boolean);
    if (instr.length > 0) return instr.map((i) => `${bold}{${i}}`);
    const t = textOf({ 'w:r': [r] });
    return t && !inResult ? [`${bold}${t}`] : [];
  });

  const table = arr(body['w:tbl'])[0] ?? {};
  const tblPr = obj(table['w:tblPr']);
  const rows = arr(table['w:tr']);
  const firstCell = arr(obj(rows[0])['w:tc'])[0] ?? {};
  const borders = obj(obj(firstCell['w:tcPr'])['w:tcBorders']);
  const cellRun = arr(arr(obj(firstCell)['w:p'])[0]?.['w:r'])[0] ?? {};
  const cellRunPr = obj(cellRun['w:rPr']);
  const rowHeight = (row: Node | undefined) => num(obj(obj(row)['w:trPr'])['w:trHeight'], 'val');
  /** The template pads with hundreds of rows; the usual data-row height is the most common one. */
  const dataHeights = rows.slice(1).map(rowHeight);
  const commonHeight = [...new Set(dataHeights)].sort(
    (a, b) => dataHeights.filter((h) => h === b).length - dataHeights.filter((h) => h === a).length,
  )[0];
  const margins = obj(tblPr['w:tblCellMar']);

  return {
    page: {
      width: num(first['w:pgSz'], 'w'),
      height: num(first['w:pgSz'], 'h'),
      margins: {
        top: num(pgMar, 'top'),
        right: num(pgMar, 'right'),
        bottom: num(pgMar, 'bottom'),
        left: num(pgMar, 'left'),
        header: num(pgMar, 'header'),
        footer: num(pgMar, 'footer'),
      },
    },
    annexColumns: {
      count: num(twoColumn['w:cols'], 'num'),
      space: num(twoColumn['w:cols'], 'space'),
    },
    defaultTabStop: num(obj(settings['w:settings'])['w:defaultTabStop'], 'val'),
    sizes: {
      title: runSize(paragraphs, (t) => t.startsWith('PORADA VEDENÍ ŠKOLY')),
      section: runSize(paragraphs, (t) => t.startsWith('POKYNY PRO ZAMĚSTNANCE')),
      annex: runSize(paragraphs, (t) => t.startsWith('PŘÍLOHA 1')),
      annexTitle: runSize(paragraphs, (t) =>
        t.startsWith('Studenti v ředitelském „Programu na podporu talentovaným'),
      ),
    },
    normal: {
      font: attr(normalRun['w:rFonts'], 'ascii') ?? attr(defaultRun['w:rFonts'], 'ascii') ?? '',
      size: Number(attr(normalRun['w:sz'], 'val') ?? attr(defaultRun['w:sz'], 'val') ?? 20),
      alignment: attr(normalPara['w:jc'], 'val') ?? attr(defaultPara['w:jc'], 'val') ?? 'left',
      spacingBefore: num(normalPara['w:spacing'] ?? defaultPara['w:spacing'], 'before'),
      spacingAfter: num(normalPara['w:spacing'] ?? defaultPara['w:spacing'], 'after'),
    },
    heading: {
      left: num(headingPara['w:ind'], 'left') || num(headingPara['w:ind'], 'start'),
      hanging: num(headingPara['w:ind'], 'hanging'),
      bold: flag(headingRun, 'w:b'),
      keepNext: flag(headingPara, 'w:keepNext'),
    },
    numbering: {
      points: levelFacts(numbering, pointsId, 0),
      bullet: levelFacts(
        numbering,
        numIdWhere(
          paragraphs,
          (p, i) => i > meetings && i < events && numIdOf(p) !== pointsId,
          'bullet',
        ),
        0,
      ),
      rich: [0, 1, 2].map((l) =>
        levelFacts(
          numbering,
          numIdWhere(
            paragraphs,
            (p) => textOf(p).includes('používání programu Techambition'),
            'rich',
          ),
          l,
        ),
      ) as FormatFacts['numbering']['rich'],
      dash: levelFacts(
        numbering,
        numIdWhere(paragraphs, (p) => textOf(p).startsWith('seznam studentů:'), 'dash'),
        0,
      ),
      partners: levelFacts(
        numbering,
        numIdWhere(paragraphs, (p, i) => i > partners && numIdOf(p) !== pointsId, 'partners'),
        0,
      ),
    },
    footer: { alignment: attr(obj(footerParagraph['w:pPr'])['w:jc'], 'val') ?? 'left', tokens },
    table: {
      width: num(tblPr['w:tblW'], 'w'),
      grid: arr(obj(table['w:tblGrid'])['w:gridCol']).map((g) => num(g, 'w')),
      layout: attr(tblPr['w:tblLayout'], 'type') ?? 'autofit',
      alignment: attr(tblPr['w:jc'], 'val') ?? 'left',
      cellMargins: {
        top: num(margins['w:top'], 'w'),
        bottom: num(margins['w:bottom'], 'w'),
        left: num(margins['w:left'] ?? margins['w:start'], 'w'),
        right: num(margins['w:right'] ?? margins['w:end'], 'w'),
      },
      border: {
        style: attr(borders['w:top'], 'val') ?? '',
        size: num(borders['w:top'], 'sz'),
        color: attr(borders['w:top'], 'color') ?? '',
      },
      font: attr(cellRunPr['w:rFonts'], 'ascii') ?? '',
      size: Number(attr(cellRunPr['w:sz'], 'val') ?? 0),
      headerHeight: rowHeight(rows[0]),
      rowHeight: commonHeight ?? 0,
    },
  };
}
