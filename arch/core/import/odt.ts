import JSZip from 'jszip';
import type { Indent } from '@/domain/richtext';
import { ImportError } from './messages';
import { assertZipSize } from './zipguard';
import type { HtmlParser } from './docx';
import type { Block, RawImage, Read } from './types';

const ELEMENT = 1, TEXT = 3;
const MAX_REPEAT = 50; // number-columns-repeated and number-rows-repeated: a sheet-like repeat cannot explode
const MAX_SPACES = 20;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const SKIPPED = new Set(['text:tracked-changes', 'text:note', 'text:sequence-decls', 'text:variable-decls', 'text:user-field-decls', 'office:forms', 'text:soft-page-break', 'text:bookmark', 'text:bookmark-start', 'text:bookmark-end', 'text:change', 'text:change-start', 'text:change-end', 'svg:title', 'svg:desc']);
/** A frame's `draw:image` elements are one picture with fallbacks (SVG, then a PNG): the first the importer can carry is taken. */
type Seg = { text: string } | { frame: Element[] };
type Kind = 'number' | 'bullet';
const attr = (e: Element, name: string) => e.getAttribute(name) ?? '';
const kids = (e: Element) => Array.from(e.children);
const count = (e: Element, name: string) => Math.min(MAX_REPEAT, Math.max(1, Number.parseInt(attr(e, name), 10) || 1));

/** Which levels of each list style are numbered, from `text:list-style` in the automatic and named styles. */
function listStyles(docs: Document[]): Map<string, Map<number, Kind>> {
  const out = new Map<string, Map<number, Kind>>();
  for (const doc of docs) {
    for (const style of Array.from(doc.getElementsByTagName('text:list-style'))) {
      const levels = new Map<number, Kind>();
      for (const lv of kids(style)) {
        const tag = lv.tagName;
        if (tag === 'text:list-level-style-number') levels.set(Number(attr(lv, 'text:level')) || 1, 'number');
        else if (tag.startsWith('text:list-level-style')) levels.set(Number(attr(lv, 'text:level')) || 1, 'bullet');
      }
      out.set(attr(style, 'style:name'), levels);
    }
  }
  return out;
}

/** Parent of each paragraph style, from `style:style` in the automatic and named styles. */
function parentStyles(docs: Document[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const doc of docs)
    for (const style of Array.from(doc.getElementsByTagName('style:style')))
      if (attr(style, 'style:family') === 'paragraph' && attr(style, 'style:parent-style-name')) out.set(attr(style, 'style:name'), attr(style, 'style:parent-style-name'));
  return out;
}

class OdtReader {
  readonly blocks: Block[] = [];
  skipped = 0;
  constructor(private readonly zip: JSZip, private readonly styles: Map<string, Map<number, Kind>>, private readonly parents: Map<string, string>) {}
  private pending: { block: Extract<Block, { k: 'image' }>; path: string; mime: string }[] = [];

  /** The Title style, named directly or through the style a paragraph was given: a heading as far as the title rule goes. */
  private isTitle(e: Element): true | undefined {
    let name = attr(e, 'text:style-name');
    for (let i = 0; name && i < 10; i++) { if (name === 'Title') return true; name = this.parents.get(name) ?? ''; }
    return undefined;
  }

  private node(n: Node, out: Seg[]): void {
    if (n.nodeType === TEXT) { out.push({ text: n.nodeValue ?? '' }); return; }
    if (n.nodeType !== ELEMENT) return;
    const c = n as Element; const tag = c.tagName;
    if (SKIPPED.has(tag)) return;
    if (tag === 'text:s') out.push({ text: ' '.repeat(Math.min(MAX_SPACES, Number(attr(c, 'text:c')) || 1)) });
    else if (tag === 'text:tab' || tag === 'text:line-break') out.push({ text: ' ' });
    else if (tag === 'draw:image') out.push({ frame: [c] });
    else if (tag === 'draw:frame') {
      const pictures = kids(c).filter((k) => k.tagName === 'draw:image');
      if (pictures.length) out.push({ frame: pictures });
      for (const k of Array.from(c.childNodes)) if (!pictures.includes(k as Element)) this.node(k, out);
    } else for (const k of Array.from(c.childNodes)) this.node(k, out);
  }

  /** Text and pictures of an element in order. */
  private segs(e: Element, out: Seg[] = []): Seg[] {
    for (const n of Array.from(e.childNodes)) this.node(n, out);
    return out;
  }

  private flat(e: Element): string {
    return this.segs(e).map((s) => { if ('text' in s) return s.text; this.skipped++; return ''; }).join(' ').replace(/\s+/g, ' ').trim();
  }

  private paragraph(e: Element, indent: Indent, prefix: string, heading?: true) {
    let run = prefix;
    const flush = () => { const text = run.replace(/\s+/g, ' ').trim(); if (text) this.blocks.push({ k: 'p', indent, text, ...(heading && { heading }) }); run = ''; };
    for (const s of this.segs(e)) { if ('text' in s) run += s.text; else { flush(); this.picture(s.frame); } }
    flush();
  }

  /** The first picture of a frame that can be carried; the frame counts as skipped only when none can. */
  private picture(group: Element[]) {
    for (const img of group) {
      const href = attr(img, 'xlink:href');
      const mime = MIME[href.split('.').pop()?.toLowerCase() ?? ''];
      if (!href.startsWith('Pictures/') || href.includes('..') || !mime || !this.zip.file(href)) continue;
      const frame = img.parentElement; const alt = frame ? (['svg:desc', 'svg:title'].map((t) => frame.getElementsByTagName(t)[0]?.textContent ?? '').find(Boolean) ?? '') : '';
      const block: Extract<Block, { k: 'image' }> = { k: 'image', raw: { mime, base64: '' }, alt };
      this.blocks.push(block); this.pending.push({ block, path: href, mime });
      return;
    }
    this.skipped++;
  }

  /** Loads the bytes of the pictures the text pointed at. */
  async loadPictures(): Promise<void> {
    for (const p of this.pending) { const raw: RawImage = { mime: p.mime, base64: await this.zip.file(p.path)!.async('base64') }; p.block.raw = raw; }
  }

  private list(list: Element, depth: number, style: Map<number, Kind> | undefined) {
    const kind = style?.get(depth);
    let n = 1;
    for (const item of kids(list)) {
      if (item.tagName !== 'text:list-item' && item.tagName !== 'text:list-header') continue;
      const indent = Math.min(3, depth) as Indent;
      let first = true;
      for (const c of kids(item)) {
        if (c.tagName === 'text:list') this.list(c, depth + 1, style);
        else if (c.tagName === 'text:p' || c.tagName === 'text:h') { this.paragraph(c, indent, first && kind === 'number' && item.tagName === 'text:list-item' ? `${n}. ` : ''); first = false; }
      }
      if (item.tagName === 'text:list-item') n++;
    }
  }

  private table(table: Element) {
    const rows: string[][] = [];
    const walk = (e: Element) => {
      for (const c of kids(e)) {
        if (c.tagName === 'table:table-row') {
          const cells: string[] = [];
          for (const cell of kids(c)) {
            if (cell.tagName === 'table:covered-table-cell') cells.push('');
            else if (cell.tagName === 'table:table-cell') { const t = this.flat(cell); for (let i = 0; i < count(cell, 'table:number-columns-repeated'); i++) cells.push(t); }
          }
          for (let i = 0; i < count(c, 'table:number-rows-repeated'); i++) rows.push(cells);
        } else if (/^table:table-(header-rows|rows|row-group)$/.test(c.tagName)) walk(c);
      }
    };
    walk(table);
    const width = rows.reduce((w, r) => Math.max(w, r.findLastIndex((x) => x) + 1), 0);
    const trimmed = rows.filter((r) => r.some(Boolean)).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
    if (width) this.blocks.push({ k: 'table', rows: trimmed });
  }

  body(e: Element, list?: Map<number, Kind>) {
    for (const c of kids(e)) {
      const tag = c.tagName;
      if (SKIPPED.has(tag)) continue;
      if (tag === 'text:h') this.paragraph(c, 0, '', true);
      else if (tag === 'text:p') this.paragraph(c, 0, '', this.isTitle(c));
      else if (tag === 'text:list') this.list(c, 1, this.styles.get(attr(c, 'text:style-name')) ?? list);
      else if (tag === 'table:table') this.table(c);
      else if (tag === 'draw:frame' || tag === 'draw:image') { const out: Seg[] = []; this.node(c, out); for (const s of out) if ('frame' in s) this.picture(s.frame); }
      else this.body(c, list); // text:section, text:index-body, office:text and the like
    }
  }
}

/** An XML entry as text; `assertZipSize` checked its declared size before anything was inflated. */
const read = async (zip: JSZip, name: string): Promise<string | null> => {
  const f = zip.file(name); if (!f) return null;
  return new TextDecoder().decode(await f.async('uint8array'));
};
const xml = (parser: HtmlParser, text: string): Document => {
  const doc = parser.parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
  return doc;
};

/** An .odt: text, headings, lists, tables (header rows too) and pictures from `Pictures/`, read from `content.xml`. */
export async function readOdt(bytes: Uint8Array, parser: HtmlParser): Promise<Read> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    assertZipSize(zip); // an entry or the whole is refused by what the directory declares, before inflating
    const content = await read(zip, 'content.xml');
    if (content === null) throw new Error('content');
    const docs = [xml(parser, content)];
    const named = await read(zip, 'styles.xml');
    if (named !== null) docs.push(xml(parser, named));
    const text = docs[0]!.getElementsByTagName('office:text')[0];
    if (!text) throw new Error('text');
    const reader = new OdtReader(zip, listStyles(docs), parentStyles(docs));
    reader.body(text);
    await reader.loadPictures();
    return { blocks: reader.blocks, skipped: reader.skipped, textOnly: false };
  } catch (e) {
    throw e instanceof ImportError ? e : new ImportError('broken', undefined, { cause: e });
  }
}
