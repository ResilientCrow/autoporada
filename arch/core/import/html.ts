import type { Indent } from '@/domain/richtext';
import type { Block, RawImage } from './types';

const ELEMENT = 1, TEXT = 3;
const SKIP = new Set(['script', 'style', 'head', 'title', 'template']);
const HEADING = /^h[1-6]$/;
const BLOCKS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'pre', 'figure', 'figcaption', 'main', 'aside', 'nav', 'body']);
const fold = (s: string) => s.replace(/\s+/g, ' ');
// What mammoth writes for notes: `<sup><a id="footnote-ref-1">` in the text, `<li id="footnote-1">` in a list after it.
const NOTE_REF = 'a[id^="footnote-ref-"], a[id^="endnote-ref-"]';
const NOTE_ITEM = /^(footnote|endnote)-/;
const isNoteRef = (e: Element) => e.matches(NOTE_REF) || (e.tagName.toLowerCase() === 'sup' && e.querySelector(NOTE_REF) !== null);

/** Reads the HTML a docx converter produces into blocks. `images` maps the `src` the converter wrote to the picture. */
export class HtmlReader {
  readonly blocks: Block[] = [];
  skipped = 0;
  constructor(private readonly images: ReadonlyMap<string, RawImage>) {}

  /** The text of an element as one line, pictures dropped (and counted): a table cell, a title. */
  private flat(el: Element): string {
    let out = '';
    const walk = (n: Node) => {
      if (n.nodeType === TEXT) out += n.nodeValue ?? '';
      else if (n.nodeType === ELEMENT) {
        const e = n as Element; const tag = e.tagName.toLowerCase();
        if (SKIP.has(tag) || isNoteRef(e)) return;
        if (tag === 'img') { this.skipped++; return; }
        const gap = tag === 'br' || BLOCKS.has(tag) || tag === 'td' || tag === 'li' || tag === 'tr';
        if (gap) out += ' ';
        e.childNodes.forEach(walk);
        if (gap) out += ' ';
      }
    };
    walk(el);
    return fold(out).trim();
  }

  private text(text: string, indent: Indent, heading?: true) {
    const t = fold(text).trim();
    if (t) this.blocks.push({ k: 'p', indent, text: t, ...(heading && { heading }) });
  }

  /** Inline content of a paragraph, list item or the body: runs of text between pictures become paragraphs. */
  private inline(nodes: Iterable<Node>, indent: Indent, heading: true | undefined, prefix: string, stop?: (e: Element) => boolean) {
    let run = prefix;
    const flush = () => { this.text(run, indent, heading); run = ''; };
    const walk = (n: Node) => {
      if (n.nodeType === TEXT) { run += n.nodeValue ?? ''; return; }
      if (n.nodeType !== ELEMENT) return;
      const e = n as Element; const tag = e.tagName.toLowerCase();
      if (SKIP.has(tag) || isNoteRef(e)) return;
      if (stop?.(e)) return;
      if (tag === 'br') { run += ' '; return; }
      if (tag === 'img') { flush(); this.picture(e); return; }
      e.childNodes.forEach(walk);
    };
    for (const n of nodes) walk(n);
    flush();
  }

  private picture(img: Element) {
    const raw = this.images.get(img.getAttribute('src') ?? '');
    if (raw) this.blocks.push({ k: 'image', raw, alt: fold(img.getAttribute('alt') ?? '').trim() });
    else this.skipped++;
  }

  private list(list: Element, depth: number) {
    const ordered = list.tagName.toLowerCase() === 'ol';
    let n = Number.parseInt(list.getAttribute('start') ?? '1', 10) || 1;
    for (const li of Array.from(list.children)) {
      if (li.tagName.toLowerCase() !== 'li' || NOTE_ITEM.test(li.id)) continue;
      const indent = Math.min(3, depth) as Indent;
      this.inline(li.childNodes, indent, undefined, ordered ? `${n++}. ` : '', (e) => /^(ul|ol)$/i.test(e.tagName));
      for (const sub of Array.from(li.children)) if (/^(ul|ol)$/i.test(sub.tagName)) this.list(sub, depth + 1);
    }
  }

  private table(table: Element) {
    const rows = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table);
    this.blocks.push({ k: 'table', rows: rows.map((tr) => Array.from(tr.children).filter((c) => /^t[dh]$/i.test(c.tagName)).map((c) => this.flat(c))) });
  }

  block(el: Element) {
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) return;
    if (HEADING.test(tag)) this.inline(el.childNodes, 0, true, '');
    else if (tag === 'ul' || tag === 'ol') this.list(el, 1);
    else if (tag === 'table') this.table(el);
    else if (tag === 'p' || tag === 'pre') this.inline(el.childNodes, 0, undefined, '');
    else this.children(el.childNodes);
  }

  /** Children of a container: block elements one by one, loose text and inline elements gathered as a paragraph. */
  children(nodes: NodeListOf<ChildNode>) {
    let loose: Node[] = [];
    const flush = () => { if (loose.length) this.inline(loose, 0, undefined, ''); loose = []; };
    for (const n of Array.from(nodes)) {
      const isBlock = n.nodeType === ELEMENT && (/^(h[1-6]|ul|ol|table|p|pre)$/i.test((n as Element).tagName) || BLOCKS.has((n as Element).tagName.toLowerCase()));
      if (isBlock) { flush(); this.block(n as Element); } else loose.push(n);
    }
    flush();
  }
}
