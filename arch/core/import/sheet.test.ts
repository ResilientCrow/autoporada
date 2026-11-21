// @vitest-environment happy-dom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ImportError, importMessage, sheetMessage, tooManyNames } from './messages';
import { readSheets } from './sheet';

const zip = async (files: Record<string, string | Uint8Array>) => { const z = new JSZip(); for (const [k, v] of Object.entries(files)) z.file(k, v); return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }); };
const read = (bytes: Uint8Array) => readSheets(bytes, new DOMParser());
const code = (c: string) => expect.objectContaining({ code: c });
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

describe('readSheets', () => {
  it('knows an .xlsx by xl/workbook.xml, whatever the name', async () => {
    const bytes = await zip({
      'xl/workbook.xml': `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="A" sheetId="1" r:id="r1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      'xl/worksheets/sheet1.xml': `<worksheet xmlns="${MAIN}"><sheetData><row><c t="inlineStr"><is><t>Jan</t></is></c></row></sheetData></worksheet>`,
    });
    expect(await read(bytes)).toEqual([[['Jan']]]);
  });

  it('knows an .ods and an .ots by the mimetype entry', async () => {
    const content = '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table><table:table-row><table:table-cell><text:p>Jan</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>';
    expect(await read(await zip({ mimetype: 'application/vnd.oasis.opendocument.spreadsheet', 'content.xml': content }))).toEqual([[['Jan']]]);
    expect(await read(await zip({ mimetype: 'application/vnd.oasis.opendocument.spreadsheet-template', 'content.xml': content }))).toEqual([[['Jan']]]);
  });

  it('reads anything else that is text as a CSV', async () => {
    expect(await read(new TextEncoder().encode('Jméno;Třída\nJan Novák;2.A'))).toEqual([[['Jméno', 'Třída'], ['Jan Novák', '2.A']]]);
    expect(await read(new Uint8Array([0xff, 0xfe, 0x4a, 0x00, 0x09, 0x00, 0x41, 0x00]))).toEqual([[['J', 'A']]]);
  });

  it('says unknown for a document, a PDF, an old .xls, a picture and another zip', async () => {
    await expect(read(await zip({ 'word/document.xml': '<w/>' }))).rejects.toEqual(code('unknown'));
    await expect(read(await zip({ mimetype: 'application/vnd.oasis.opendocument.text', 'content.xml': '<x/>' }))).rejects.toEqual(code('unknown'));
    await expect(read(new TextEncoder().encode('%PDF-1.7\n1 0 obj'))).rejects.toEqual(code('unknown'));
    await expect(read(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))).rejects.toEqual(code('unknown'));
    await expect(read(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]))).rejects.toEqual(code('unknown'));
    await expect(read(await zip({ 'a.txt': 'x' }))).rejects.toEqual(code('unknown'));
  });

  it('says unknown for a web page or an Excel 2003 XML file saved as .xls', async () => {
    await expect(read(new TextEncoder().encode('\ufeff  <html>\n<body><table><tr><td>Malá</td><td>Tereza</td></tr></table>'))).rejects.toEqual(code('unknown'));
    await expect(read(new TextEncoder().encode('<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">'))).rejects.toEqual(code('unknown'));
  });

  it('reads a sheet wider and longer than any list of people only up to the caps', async () => {
    const rows = await read(new TextEncoder().encode(`a${';'.repeat(200_000)}\n${'Jan\n'.repeat(12_000)}`));
    expect(rows[0]).toHaveLength(10_000);
    expect(rows[0]![0]).toEqual(['a']);
  });

  it('says broken for a zip that does not open', async () => {
    await expect(read(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).rejects.toEqual(code('broken'));
  });

  it('refuses a zip that would inflate beyond the cap, before it inflates anything', async () => {
    const bomb = await zip({ 'xl/workbook.xml': '<w/>', 'xl/worksheets/sheet1.xml': new Uint8Array(31_000_000) });
    expect(bomb.length).toBeLessThan(200_000);
    await expect(read(bomb)).rejects.toEqual(code('too-big'));
  });

  it('refuses a file over 5 MB before reading it', async () => {
    await expect(read(new Uint8Array(5_000_001).fill(0x61))).rejects.toEqual(code('file-too-big'));
  });

  it('words each code for the participants field, a code it never meets as broken', () => {
    expect(sheetMessage(new ImportError('unknown'))).toMatch(/\.xlsx.*\.ods.*CSV.*\.xls/);
    expect(sheetMessage(new ImportError('too-big'))).toBe(sheetMessage(new ImportError('file-too-big')));
    expect(sheetMessage(new ImportError('stale'))).toBe(importMessage(new ImportError('stale')));
    expect(sheetMessage(new ImportError('signed-out'))).toBe(importMessage(new ImportError('broken')));
    expect(tooManyNames(2400, 2000)).toContain('2000 znaků');
  });

  it('reads the mimetype entry only when it is tiny', async () => {
    const bytes = await zip({ mimetype: 'application/vnd.oasis.opendocument.spreadsheet' + ' '.repeat(100_000), 'content.xml': '<x/>' });
    await expect(read(bytes)).rejects.toEqual(code('unknown'));
  });
});
