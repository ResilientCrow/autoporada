// @vitest-environment happy-dom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readOds } from './ods';

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/"';

async function ods(tables: string): Promise<JSZip> {
  const z = new JSZip();
  z.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet');
  z.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}><office:body><office:spreadsheet>${tables}</office:spreadsheet></office:body></office:document-content>`);
  return JSZip.loadAsync(await z.generateAsync({ type: 'uint8array' }));
}
const cell = (t: string, attrs = '') => `<table:table-cell${attrs}><text:p>${t}</text:p></table:table-cell>`;
const row = (cells: string, attrs = '') => `<table:table-row${attrs}>${cells}</table:table-row>`;
const table = (rows: string, name = 'List1') => `<table:table table:name="${name}">${rows}</table:table>`;
const read = async (tables: string) => readOds(await ods(tables), new DOMParser());

describe('readOds', () => {
  it('reads the text of each cell, paragraphs, spans, spaces and links included', async () => {
    const r = await read(table(row(cell('Jméno') + cell('Třída')) + row(`<table:table-cell><text:p>Tereza<text:s/><text:span>Malá</text:span></text:p><text:p><text:a>ml.</text:a></text:p></table:table-cell>${cell('3.B')}`)));
    expect(r).toEqual([[['Jméno', 'Třída'], ['Tereza Malá ml.', '3.B']]]);
  });

  it('leaves out comments in a cell', async () => {
    const r = await read(table(row('<table:table-cell><office:annotation><dc:creator>Učitel</dc:creator><text:p>poznámka</text:p></office:annotation><text:p>Jan Novák</text:p></table:table-cell>')));
    expect(r).toEqual([[['Jan Novák']]]);
  });

  it('repeats columns, counts covered cells and drops the empty ones at the end of a row', async () => {
    const r = await read(table(row(`<table:table-cell table:number-columns-repeated="2"/>${cell('a', ' table:number-columns-spanned="2"')}<table:covered-table-cell/>${cell('b')}<table:table-cell table:number-columns-repeated="16384"/>`)));
    expect(r).toEqual([[['', '', 'a', '', 'b']]]);
  });

  it('stops a row at a sane width', async () => {
    const r = await read(table(row(cell('x', ' table:number-columns-repeated="16384"'))));
    expect(r[0]![0]!.length).toBe(100);
  });

  it('reads header rows and row groups, and leaves out rows a filter or the author hid', async () => {
    const rows = `<table:table-header-rows>${row(cell('Jméno'))}</table:table-header-rows><table:table-row-group>${row(cell('vidět'))}${row(cell('skryto'), ' table:visibility="collapse"')}${row(cell('vyfiltrováno'), ' table:visibility="filter"')}</table:table-row-group>${row('<table:table-cell/>', ' table:number-rows-repeated="1048576"')}`;
    expect(await read(table(rows))).toEqual([[['Jméno'], ['vidět'], []]]);
  });

  it('reads every sheet in order', async () => {
    expect(await read(table(row(cell('a')), 'A') + table(row(cell('b')), 'B'))).toEqual([[['a']], [['b']]]);
  });

  it('leaves out a hidden sheet, as a list for drop-downs often is', async () => {
    const z = new JSZip();
    z.file('content.xml', `<office:document-content ${NS} xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"><office:automatic-styles><style:style style:name="ta1" style:family="table"><style:table-properties table:display="true"/></style:style><style:style style:name="ta2" style:family="table"><style:table-properties table:display="false"/></style:style></office:automatic-styles><office:body><office:spreadsheet><table:table table:name="Seznam" table:style-name="ta2">${row(cell('skrytý'))}</table:table><table:table table:name="List1" table:style-name="ta1">${row(cell('vidět'))}</table:table></office:spreadsheet></office:body></office:document-content>`);
    expect(await readOds(z, new DOMParser())).toEqual([[['vidět']]]);
  });

  it('says broken when content.xml is missing or does not parse', async () => {
    const z = await ods('');
    z.remove('content.xml');
    await expect(readOds(z, new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'broken' }));
    z.file('content.xml', '<office:document-content><office:body>');
    await expect(readOds(z, new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'broken' }));
  });
});
