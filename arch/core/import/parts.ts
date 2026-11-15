import { ANNEXES_MAX_BYTES } from '@/domain/report';
import { stripForbiddenCharacters, type Indent, type RichDoc } from '@/domain/richtext';
import type { AnnexPart } from '../types';
import { ImportError } from './messages';
import type { PlacedBlock } from './types';

/** An annex part before the editor gives it an id. */
export type PartDraft = AnnexPart extends infer P ? (P extends unknown ? Omit<P, 'id'> : never) : never;
export interface Imported { title: string | null; parts: PartDraft[] }

const MAX_TITLE = 150; // a longer first line is a sentence, not a name
const MAX_PARAGRAPHS = 400; // a text part is far below the 2000 nodes of the rich text limit
const MAX_PART_BYTES = 40_000; // and below its 64 KiB
const MAX_PARAGRAPH = 4000;
const MARGIN = 50_000; // room for what the estimate misses
/** The server refuses an annex list over `ANNEXES_MAX_BYTES`; the import stays this far under it. */
export const IMPORT_LIMIT = ANNEXES_MAX_BYTES - MARGIN;
const ID_BYTES = 48; // `{"id":"part-…",` and the comma of a part the editor will give an id

/** One line of plain text: forbidden characters out, every run of white space one space. */
export const clean = (s: string): string => stripForbiddenCharacters(s).replace(/\s+/g, ' ').trim();

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/** Cuts a long paragraph on spaces so a part can always be split below its limits. */
function chunks(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_PARAGRAPH) {
    const at = rest.lastIndexOf(' ', MAX_PARAGRAPH);
    let cut = at > MAX_PARAGRAPH / 2 ? at : MAX_PARAGRAPH;
    const last = rest.charCodeAt(cut - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut--; // do not cut a surrogate pair
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

const paragraph = (indent: Indent, text: string): RichDoc['content'][number] => ({ type: 'paragraph', attrs: { indent }, content: [{ type: 'text', text }] });

function textParts(paras: RichDoc['content'][number][]): PartDraft[] {
  const out: PartDraft[] = [];
  let cur: RichDoc['content'][number][] = []; let size = 0;
  const flush = () => { if (cur.length) out.push({ kind: 'text', doc: { type: 'doc', content: cur } }); cur = []; size = 0; };
  for (const para of paras) {
    const n = bytes(para) + 1;
    if (cur.length && (cur.length >= MAX_PARAGRAPHS || size + n > MAX_PART_BYTES)) flush();
    cur.push(para); size += n;
  }
  flush();
  return out;
}

/**
 * Groups what a reader found into annex parts: runs of paragraphs become text parts (split to stay inside
 * the limits), tables and pictures their own. A first heading becomes the title of an annex that has none.
 * `existingBytes` is the JSON size of the whole annex list as it is now; with the new parts (ids and a taken title
 * counted) it must stay under `IMPORT_LIMIT`. Throws `ImportError` for nothing to carry or more than the annex save takes.
 */
export function toParts(blocks: PlacedBlock[], { titleEmpty, existingBytes = 0 }: { titleEmpty: boolean; existingBytes?: number }): Imported {
  let title: string | null = null;
  let rest = blocks;
  const first = blocks[0];
  if (titleEmpty && first?.k === 'p' && first.heading) {
    const t = clean(first.text);
    if (t && t.length <= MAX_TITLE) { title = t; rest = blocks.slice(1); }
  }
  const parts: PartDraft[] = [];
  let run: RichDoc['content'][number][] = [];
  const endRun = () => { parts.push(...textParts(run)); run = []; };
  for (const b of rest) {
    if (b.k === 'p') { const t = clean(b.text); for (const c of chunks(t)) run.push(paragraph(b.indent, c)); continue; }
    endRun();
    if (b.k === 'table') {
      const rows = b.rows.map((r) => r.map(clean)).filter((r) => r.some(Boolean));
      if (rows.length) parts.push({ kind: 'table', rows });
    } else parts.push({ kind: 'image', src: b.src, w: b.w, h: b.h, alt: clean(b.alt) });
  }
  endRun();
  if (!parts.length) throw new ImportError('empty');
  if (existingBytes + bytes(parts) + parts.length * ID_BYTES + (title === null ? 0 : bytes(title)) > IMPORT_LIMIT) throw new ImportError('too-big');
  return { title, parts };
}
