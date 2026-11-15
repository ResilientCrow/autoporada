// @vitest-environment happy-dom
import { AlignmentType, Document, FootnoteReferenceRun, HeadingLevel, ImageRun, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { describe, expect, it } from 'vitest';
import { htmlToBlocks, readDocx, type MammothLib } from './docx';
import type { Block } from './types';

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const lib: MammothLib = { convertToHtml: (bytes, options) => (mammoth as unknown as { convertToHtml(i: unknown, o: unknown): Promise<{ value: string }> }).convertToHtml({ buffer: Buffer.from(bytes) }, options), images: mammoth.images as MammothLib['images'] };
const shape = (blocks: Block[]) => blocks.map((b) => (b.k === 'p' ? `${b.heading ? 'h' : 'p'}${b.indent}:${b.text}` : b.k === 'table' ? `table:${JSON.stringify(b.rows)}` : `image:${b.raw.mime}:${b.alt}`));
const p = (html: string) => shape(htmlToBlocks(html, new Map(), new DOMParser()).blocks);

describe('htmlToBlocks', () => {
  it('reads headings and paragraphs, folding white space', () => {
    expect(p('<h1>Nadpis</h1><p>Jedna  <strong>tučně</strong> a <em>šikmo</em>.</p><p></p>')).toEqual(['h0:Nadpis', 'p0:Jedna tučně a šikmo.']);
  });

  it('turns list nesting into indent and caps it at 3', () => {
    const html = '<ul><li>a<ul><li>b<ul><li>c<ul><li>d<ul><li>e</li></ul></li></ul></li></ul></li></ul></li><li>f</li></ul>';
    expect(p(html)).toEqual(['p1:a', 'p2:b', 'p3:c', 'p3:d', 'p3:e', 'p1:f']);
  });

  it('keeps the number of an ordered list as a prefix', () => {
    expect(p('<ol><li>první</li><li>druhé<ol><li>x</li><li>y</li></ol></li></ol><p>text</p><ol><li>znovu</li></ol>')).toEqual(['p1:1. první', 'p1:2. druhé', 'p2:1. x', 'p2:2. y', 'p0:text', 'p1:1. znovu']);
  });

  it('reads a table into rows, flattening what a cell holds', () => {
    expect(p('<table><tr><td><p>A</p><p>B</p></td><td>C<br>D</td></tr><tr><td></td><td> </td></tr></table>')).toEqual(['table:[["A B","C D"],["",""]]']);
  });

  it('puts a picture where it stands in the text and splits the paragraph around it', () => {
    const images = new Map([['i1', { mime: 'image/png', base64: 'AA' }]]);
    const r = htmlToBlocks('<p>před<img src="i1" alt="Graf"/>po</p>', images, new DOMParser());
    expect(shape(r.blocks)).toEqual(['p0:před', 'image:image/png:Graf', 'p0:po']);
  });

  it('counts a picture it cannot find or one inside a table', () => {
    const images = new Map([['i1', { mime: 'image/png', base64: 'AA' }]]);
    const r = htmlToBlocks('<p><img src="zzz"/></p><table><tr><td><img src="i1"/>x</td></tr></table>', images, new DOMParser());
    expect(r.skipped).toBe(2);
    expect(shape(r.blocks)).toEqual(['table:[["x"]]']);
  });

  it('skips what mammoth writes for footnotes and endnotes: the notes list and the superscript marks', () => {
    const html = '<p>Věta<sup><a href="#footnote-1" id="footnote-ref-1">[1]</a></sup> a<sup><a href="#endnote-2" id="endnote-ref-2">[2]</a></sup> konec, m<sup>2</sup>.</p><ol><li id="footnote-1"><p>Poznámka <a href="#footnote-ref-1">↑</a></p></li><li id="endnote-2"><p>Vysvětlivka</p></li></ol><ol><li>skutečný seznam</li></ol>';
    expect(p(html)).toEqual(['p0:Věta a konec, m2.', 'p1:1. skutečný seznam']);
  });

  it('ignores scripts and styles, and bare text outside any block', () => {
    expect(p('<script>alert(1)</script><style>p{}</style>holý text<div><p>uvnitř</p></div>')).toEqual(['p0:holý text', 'p0:uvnitř']);
  });
});

async function build(children: (Paragraph | Table)[]): Promise<Uint8Array> {
  const doc = new Document({
    numbering: { config: [{ reference: 'dec', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }] }] },
    sections: [{ children }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

describe('readDocx', () => {
  it('reads a real .docx: heading, paragraphs, bullets, numbers, table, picture', async () => {
    const bytes = await build([
      new Paragraph({ text: 'Zápis z jednání', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun({ text: 'Úvodní ', bold: true }), new TextRun('odstavec.')] }),
      new Paragraph({ text: 'bod', bullet: { level: 0 } }),
      new Paragraph({ text: 'podbod', bullet: { level: 1 } }),
      new Paragraph({ text: 'první', numbering: { reference: 'dec', level: 0 } }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('Jméno')] }), new TableCell({ children: [new Paragraph('Počet')] })] }), new TableRow({ children: [new TableCell({ children: [new Paragraph('Anna')] }), new TableCell({ children: [new Paragraph('3')] })] })] }),
      new Paragraph({ children: [new ImageRun({ type: 'png', data: PNG, transformation: { width: 20, height: 20 }, altText: { name: 'g', title: 'g', description: 'Graf výsledků' } })] }),
    ]);
    const r = await readDocx(bytes, lib, new DOMParser());
    expect(r.textOnly).toBe(false);
    expect(shape(r.blocks)).toEqual([
      'h0:Zápis z jednání', 'p0:Úvodní odstavec.', 'p1:bod', 'p2:podbod', 'p1:1. první',
      'table:[["Jméno","Počet"],["Anna","3"]]', 'image:image/png:Graf výsledků',
    ]);
    const img = r.blocks.find((b) => b.k === 'image');
    expect(img && img.k === 'image' && img.raw.base64).toBe(PNG.toString('base64'));
  });

  it('reads a paragraph in the Title style as a heading, so it can name the annex', async () => {
    const bytes = await build([new Paragraph({ text: 'Výsledky voleb', heading: HeadingLevel.TITLE }), new Paragraph('Text')]);
    expect(shape((await readDocx(bytes, lib, new DOMParser())).blocks)).toEqual(['h0:Výsledky voleb', 'p0:Text']);
  });

  it('leaves out footnotes, endnotes and the marks that point at them', async () => {
    const doc = new Document({
      footnotes: { 1: { children: [new Paragraph('Text poznámky pod čarou')] } },
      sections: [{ children: [new Paragraph({ children: [new TextRun('Věta'), new FootnoteReferenceRun(1), new TextRun(' pokračuje.')] }), new Paragraph('Další odstavec')] }],
    });
    const r = await readDocx(new Uint8Array(await Packer.toBuffer(doc)), lib, new DOMParser());
    expect(shape(r.blocks)).toEqual(['p0:Věta pokračuje.', 'p0:Další odstavec']);
  });

  it('refuses a .docx that would inflate beyond the cap before mammoth sees it', async () => {
    const z = new JSZip(); z.file('word/document.xml', new Uint8Array(31_000_000));
    const bomb = await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    let called = false;
    const spy: MammothLib = { ...lib, convertToHtml: () => { called = true; return Promise.resolve({ value: '' }); } };
    await expect(readDocx(bomb, spy, new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'too-big' }));
    expect(called).toBe(false);
  });

  it('says broken for bytes that are not a zip', async () => {
    await expect(readDocx(new Uint8Array([1, 2, 3]), lib, new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'broken' }));
  });
});
