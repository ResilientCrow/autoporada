// @vitest-environment happy-dom
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { readOdt } from './odt';
import type { Block } from './types';

const JPG = '/9j/4AAQSkZJRg=='; // not decoded here, only carried
const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"';

async function odt(body: string, { styles = '', files = {} as Record<string, Uint8Array | string> } = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text');
  zip.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}><office:automatic-styles>${styles}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`);
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  return zip.generateAsync({ type: 'uint8array' });
}
const shape = (blocks: Block[]) => blocks.map((b) => (b.k === 'p' ? `${b.heading ? 'h' : 'p'}${b.indent}:${b.text}` : b.k === 'table' ? `table:${JSON.stringify(b.rows)}` : `image:${b.raw.mime}:${b.alt}`));
const read = async (body: string, o?: Parameters<typeof odt>[1]) => readOdt(await odt(body, o), new DOMParser());

describe('readOdt', () => {
  it('reads headings and paragraphs with spaces, tabs, line breaks and spans', async () => {
    const r = await read('<text:h text:outline-level="1">Nadpis</text:h><text:p>a<text:s text:c="3"/>b<text:tab/>c<text:line-break/>d <text:span>e</text:span><text:a xlink:href="http://x">f</text:a></text:p>');
    expect(shape(r.blocks)).toEqual(['h0:Nadpis', 'p0:a b c d ef']);
    expect(r.textOnly).toBe(false);
  });

  it('skips notes, tracked changes and soft page breaks', async () => {
    const r = await read('<text:tracked-changes><text:changed-region><text:deletion><text:p>smazané</text:p></text:deletion></text:changed-region></text:tracked-changes><text:p>text<text:soft-page-break/><text:note><text:note-body><text:p>poznámka</text:p></text:note-body></text:note> dál</text:p>');
    expect(shape(r.blocks)).toEqual(['p0:text dál']);
  });

  it('reads sections and nested lists, numbering only the lists styled as numbered', async () => {
    const styles = '<text:list-style style:name="L1"><text:list-level-style-number text:level="1"/><text:list-level-style-bullet text:level="2"/></text:list-style><text:list-style style:name="L2"><text:list-level-style-bullet text:level="1"/></text:list-style>';
    const r = await read('<text:section><text:p>v sekci</text:p></text:section><text:list text:style-name="L1"><text:list-item><text:p>první</text:p><text:list><text:list-item><text:p>pod</text:p></text:list-item></text:list></text:list-item><text:list-item><text:p>druhé</text:p></text:list-item></text:list><text:list text:style-name="L2"><text:list-item><text:p>odrážka</text:p></text:list-item></text:list>', { styles });
    expect(shape(r.blocks)).toEqual(['p0:v sekci', 'p1:1. první', 'p2:pod', 'p1:2. druhé', 'p1:odrážka']);
  });

  it('reads tables with header rows, covered cells and repeats, and trims empty columns', async () => {
    const r = await read('<table:table><table:table-header-rows><table:table-row><table:table-cell><text:p>Jméno</text:p></table:table-cell><table:table-cell><text:p>Body</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1000"/></table:table-row></table:table-header-rows><table:table-row><table:table-cell table:number-columns-spanned="2"><text:p>Sloučeno</text:p></table:table-cell><table:covered-table-cell/></table:table-row><table:table-row table:number-rows-repeated="100000"><table:table-cell/></table:table-row></table:table>');
    expect(shape(r.blocks)).toEqual(['table:[["Jméno","Body"],["Sloučeno",""]]']);
  });

  it('carries pictures from Pictures/ with their alt text, in place', async () => {
    const r = await read('<text:p>před<draw:frame><draw:image xlink:href="Pictures/a.jpg"/><svg:desc>Graf</svg:desc></draw:frame>po</text:p>', { files: { 'Pictures/a.jpg': Buffer.from(JPG, 'base64') } });
    expect(shape(r.blocks)).toEqual(['p0:před', 'image:image/jpeg:Graf', 'p0:po']);
    const img = r.blocks[1];
    expect(img?.k === 'image' && img.raw.base64).toBe(JPG);
  });

  it('counts pictures it cannot carry: missing, external, vector, or inside a table', async () => {
    const r = await read('<text:p><draw:frame><draw:image xlink:href="Pictures/x.svg"/></draw:frame><draw:frame><draw:image xlink:href="Pictures/none.png"/></draw:frame><draw:frame><draw:image xlink:href="http://x/y.png"/></draw:frame></text:p><table:table><table:table-row><table:table-cell><text:p>a<draw:frame><draw:image xlink:href="Pictures/p.png"/></draw:frame></text:p></table:table-cell></table:table-row></table:table>', { files: { 'Pictures/x.svg': '<svg/>', 'Pictures/p.png': 'x' } });
    expect(r.skipped).toBe(4);
    expect(shape(r.blocks)).toEqual(['table:[["a"]]']);
  });

  it('reads a paragraph in the Title style as a heading, named directly or through an automatic style', async () => {
    expect(shape((await read('<text:p text:style-name="Title">Název</text:p><text:p>Text</text:p>')).blocks)).toEqual(['h0:Název', 'p0:Text']);
    const styles = '<style:style style:name="P1" style:family="paragraph" style:parent-style-name="Title"/><style:style style:name="P2" style:family="paragraph" style:parent-style-name="Standard"/>';
    expect(shape((await read('<text:p text:style-name="P1">Název</text:p><text:p text:style-name="P2">Text</text:p>', { styles })).blocks)).toEqual(['h0:Název', 'p0:Text']);
  });

  it('takes the picture of a frame that holds an SVG and its PNG fallback, and counts nothing as skipped', async () => {
    const r = await read('<text:p><draw:frame><draw:image xlink:href="Pictures/a.svg"/><draw:image xlink:href="Pictures/a.png"/><svg:desc>Graf</svg:desc></draw:frame></text:p>', { files: { 'Pictures/a.svg': '<svg/>', 'Pictures/a.png': 'png' } });
    expect(shape(r.blocks)).toEqual(['image:image/png:Graf']);
    expect(r.skipped).toBe(0);
  });

  it('counts a frame once when none of its pictures can be carried', async () => {
    const r = await read('<text:p><draw:frame><draw:image xlink:href="Pictures/a.svg"/><draw:image xlink:href="Pictures/b.emf"/></draw:frame></text:p>', { files: { 'Pictures/a.svg': '<svg/>', 'Pictures/b.emf': 'x' } });
    expect(r.blocks).toEqual([]);
    expect(r.skipped).toBe(1);
  });

  it('refuses a content.xml that would inflate beyond the cap, without inflating it', async () => {
    const zip = new JSZip(); zip.file('mimetype', 'application/vnd.oasis.opendocument.text'); zip.file('content.xml', new Uint8Array(31_000_000));
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const probe = await JSZip.loadAsync(bytes);
    const spy = vi.spyOn(Object.getPrototypeOf(probe.file('content.xml')!) as { async: () => unknown }, 'async');
    await expect(readOdt(bytes, new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'too-big' }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('says broken for a zip with no content.xml, for broken xml, and for bytes that are no zip', async () => {
    const empty = new JSZip(); empty.file('mimetype', 'application/vnd.oasis.opendocument.text');
    await expect(readOdt(await empty.generateAsync({ type: 'uint8array' }), new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'broken' }));
    const bad = new JSZip(); bad.file('content.xml', '<office:document-content><unclosed>');
    await expect(readOdt(await bad.generateAsync({ type: 'uint8array' }), new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'broken' }));
    await expect(readOdt(new Uint8Array([1, 2, 3]), new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'broken' }));
  });
});
