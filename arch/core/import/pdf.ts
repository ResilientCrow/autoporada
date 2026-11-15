import { ImportError } from './messages';
import type { Block, Read } from './types';

/** One piece of text with where it sits on its page (PDF space: y grows upward). `w` is its width when known. */
export interface PdfItem { str: string; x: number; y: number; h: number; eol: boolean; w?: number }
/** `r` is where the line ends on the right, when the widths are known. */
interface Line { text: string; x: number; y: number; h: number; r?: number }

/** The part of pdf.js this reader uses; the real module is loaded lazily by `index.ts`. */
export interface PdfLib {
  getDocument(src: { data: Uint8Array; disableFontFace?: boolean }): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage> }
interface PdfPage { getTextContent(): Promise<{ items: unknown[] }>; cleanup?(): void }

const MAX_PAGES = 300;
const SAME_LINE = 0.5; // a baseline within half a line height is the same line
const PARAGRAPH_GAP = 1.6; // a gap above this many line heights starts a paragraph
const WORD_GAP = 0.2; // a gap above this many line heights between items is a space
// Word's Symbol and Wingdings bullets come out of LibreOffice as private-use characters (U+F0B7 and kin).
const GLYPH_BULLET = /^[•◦▪‣∙●○■·\uF000-\uF0FF]\s*/u;
const SIZE_CHANGE = 0.15; // a line this much taller or shorter than the one above starts a paragraph
const SHORT_LINE = 0.75; // a line ending before this share of the page's text width ends its paragraph
const SAME_X = 3; // bullets within this many points are on the same level
const DASH_BULLET = /^[–-]\s+/;
const PAGE_NUMBER = /^\d{1,4}$/;
const SENTENCE_END = /[.!?:;…]["')“”]?$/;
const BROKEN_WORD = /\p{L}-$/u;
const LOWER_START = /^\p{Ll}/u;

function lineOf(items: PdfItem[]): Line {
  let text = ''; let prev: PdfItem | undefined;
  for (const it of items) {
    const gap = prev && prev.w !== undefined ? it.x - (prev.x + prev.w) : prev ? Infinity : 0;
    if (prev && !/\s$/.test(text) && !/^\s/.test(it.str) && gap > WORD_GAP * Math.max(it.h, 1)) text += ' ';
    text += it.str; prev = it;
  }
  const first = items[0]!; const last = items[items.length - 1]!;
  return { text: text.trim(), x: first.x, y: first.y, h: Math.max(...items.map((i) => i.h), 1), ...(last.w !== undefined && { r: last.x + last.w }) };
}

/** Items of one page into lines: a new line after an end-of-line item or when the baseline moves. */
function pageLines(items: PdfItem[]): Line[] {
  const lines: Line[] = []; let cur: PdfItem[] = [];
  const flush = () => { if (cur.length) { const l = lineOf(cur); if (l.text) lines.push(l); } cur = []; };
  for (const it of items) {
    const last = cur[cur.length - 1];
    if (last && Math.abs(it.y - last.y) > SAME_LINE * Math.max(it.h, last.h, 1)) flush();
    cur.push(it);
    if (it.eol) flush();
  }
  flush();
  if (lines.length > 1) {
    const top = lines.reduce((a, b) => (b.y > a.y ? b : a)); const bottom = lines.reduce((a, b) => (b.y < a.y ? b : a));
    return lines.filter((l) => !((l === top || l === bottom) && PAGE_NUMBER.test(l.text)));
  }
  return lines.filter((l) => !PAGE_NUMBER.test(l.text));
}

/**
 * Paragraphs from the text items of every page. Lines join with a space. A new paragraph starts on a gap clearly
 * above the line height, a change of text size (a heading), after a line that ends well short of the page's text
 * width (the last line of a paragraph, a heading, a table row), on a bullet glyph, or on a new page after a
 * finished sentence. Bullets nest by how far right they sit. A word broken by a hyphen at the line end is put
 * back together.
 */
export function pdfBlocks(pages: PdfItem[][]): Block[] {
  const out: { indent: 0 | 1 | 2 | 3; text: string }[] = [];
  let prev: Line | null = null;
  let bullets: number[] = []; // the x of each open bullet level
  pages.forEach((items, pageIndex) => {
    prev = pageIndex === 0 ? null : prev;
    let first = true;
    const lines = pageLines(items);
    const left = Math.min(...lines.map((l) => l.x));
    const right = Math.max(...lines.map((l) => l.r ?? -Infinity));
    const short = (l: Line) => l.r !== undefined && Number.isFinite(right) && right > left && l.r - left < SHORT_LINE * (right - left);
    for (const line of lines) {
      const glyph = GLYPH_BULLET.exec(line.text) ?? DASH_BULLET.exec(line.text);
      const text = glyph ? line.text.slice(glyph[0].length).trim() : line.text;
      const cur = out[out.length - 1];
      const spaced = prev !== null && !first && prev.y - line.y > PARAGRAPH_GAP * Math.max(prev.h, line.h);
      const resized = prev !== null && Math.abs(prev.h - line.h) > SIZE_CHANGE * Math.max(prev.h, line.h);
      const ended = prev !== null && !first && short(prev);
      const pageBreakOpen = first && prev !== null && cur !== undefined && !SENTENCE_END.test(cur.text) && LOWER_START.test(text);
      const joins = cur !== undefined && prev !== null && !glyph && !spaced && !resized && !ended && (!first || pageBreakOpen);
      if (joins) cur.text = BROKEN_WORD.test(cur.text) && LOWER_START.test(text) ? cur.text.slice(0, -1) + text : `${cur.text} ${text}`;
      else if (text) {
        if (glyph) {
          bullets = bullets.filter((x) => x < line.x + SAME_X);
          if (!bullets.length || line.x - bullets[bullets.length - 1]! >= SAME_X) bullets.push(line.x);
        } else bullets = [];
        out.push({ indent: glyph ? (Math.min(3, bullets.length) as 1 | 2 | 3) : 0, text });
      }
      prev = line; first = false;
    }
  });
  return out.map((p) => ({ k: 'p', indent: p.indent, text: p.text }));
}

const items = (raw: unknown[]): PdfItem[] =>
  raw.flatMap((r) => {
    const t = r as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown; hasEOL?: unknown };
    if (typeof t.str !== 'string' || !Array.isArray(t.transform) || t.str === '' && !t.hasEOL) return [];
    return [{ str: t.str, x: Number(t.transform[4]) || 0, y: Number(t.transform[5]) || 0, h: Number(t.height) || 0, w: typeof t.width === 'number' ? t.width : undefined, eol: t.hasEOL === true }];
  });

/** Text of every page of a PDF; tables and pictures are not read. */
export async function readPdf(bytes: Uint8Array, lib: PdfLib): Promise<Read> {
  const task = lib.getDocument({ data: bytes, disableFontFace: true });
  try {
    const doc = await task.promise.catch((e: unknown) => { throw new ImportError('broken', undefined, { cause: e }); });
    if (doc.numPages > MAX_PAGES) throw new ImportError('too-big');
    const pages: PdfItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) { const page = await doc.getPage(n); pages.push(items((await page.getTextContent()).items)); page.cleanup?.(); }
    return { blocks: pdfBlocks(pages), skipped: 0, textOnly: true };
  } catch (e) {
    throw e instanceof ImportError ? e : new ImportError('broken', undefined, { cause: e });
  } finally { await task.destroy().catch(() => undefined); }
}
