// @vitest-environment happy-dom
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readXlsx } from './xlsx';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
interface Sheet { name: string; rows: string; state?: string; file?: string }

/** A workbook as Excel and LibreOffice write one: tabs in workbook.xml, their files through the relationships. */
async function xlsx(sheets: Sheet[], shared: string[] = []): Promise<JSZip> {
  const z = new JSZip();
  z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rS" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="${s.file ?? `worksheets/sheet${i + 1}.xml`}"/>`).join('')}</Relationships>`);
  sheets.forEach((s, i) => z.file((s.file ?? `worksheets/sheet${i + 1}.xml`).replace(/^\/?(xl\/)?/, 'xl/'), `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${MAIN}"><sheetData>${s.rows}</sheetData></worksheet>`));
  z.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="${MAIN}">${shared.map((t) => (t.startsWith('<') ? `<si>${t}</si>` : `<si><t>${t}</t></si>`)).join('')}</sst>`);
  return JSZip.loadAsync(await z.generateAsync({ type: 'uint8array' }));
}
const read = async (sheets: Sheet[], shared?: string[]) => readXlsx(await xlsx(sheets, shared), new DOMParser());

describe('readXlsx', () => {
  it('reads shared strings, inline strings, formula results and numbers', async () => {
    const rows = '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Třída</t></is></c></row><row r="2"><c r="A2" t="str"><f>A3</f><v>Tereza Malá</v></c><c r="B2"><v>3</v></c></row>';
    expect(await read([{ name: 'List1', rows }], ['Jméno'])).toEqual([[['Jméno', 'Třída'], ['Tereza Malá', '3']]]);
  });

  it('puts each cell in its own column by its reference, leaving gaps empty', async () => {
    const rows = '<row r="1"><c r="B1" t="s"><v>0</v></c><c r="D1" t="s"><v>1</v></c></row>';
    expect(await read([{ name: 'List1', rows }], ['Jan Novák', '2.A'])).toEqual([[['', 'Jan Novák', '', '2.A']]]);
  });

  it('joins rich-text runs and leaves out phonetic hints and escaped control characters', async () => {
    const rows = '<row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>';
    expect(await read([{ name: 'List1', rows }], ['<r><t>Tere</t></r><r><t>za</t></r><rPh><t>x</t></rPh>', '<t>Malá_x000D_</t>'])).toEqual([[['Tereza', 'Malá\r']]]);
  });

  it('leaves out an error cell and rows hidden by a filter', async () => {
    const rows = '<row r="1"><c t="e"><v>#REF!</v></c><c t="inlineStr"><is><t>vidět</t></is></c></row><row r="2" hidden="1"><c t="inlineStr"><is><t>skryto</t></is></c></row><row r="3" hidden="true"><c t="inlineStr"><is><t>skryto</t></is></c></row>';
    expect(await read([{ name: 'List1', rows }])).toEqual([[['', 'vidět']]]);
  });

  it('reads the visible sheets in tab order, wherever their files are', async () => {
    const one = (t: string) => `<row><c t="inlineStr"><is><t>${t}</t></is></c></row>`;
    const sheets = [{ name: 'Druhý', rows: one('b'), file: 'worksheets/sheet9.xml' }, { name: 'Skrytý', rows: one('h'), state: 'hidden' }, { name: 'Třetí', rows: one('c'), file: '/xl/worksheets/a.xml' }];
    expect(await read(sheets)).toEqual([[['b']], [['c']]]);
  });

  it('reads a workbook without shared strings', async () => {
    const z = await xlsx([{ name: 'List1', rows: '<row><c t="inlineStr"><is><t>a</t></is></c></row>' }]);
    z.remove('xl/sharedStrings.xml');
    expect(await readXlsx(z, new DOMParser())).toEqual([[['a']]]);
  });

  it('says broken for XML with a DOCTYPE, which a workbook never has', async () => {
    const z = await xlsx([{ name: 'List1', rows: '' }]);
    z.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><worksheet xmlns="${MAIN}"><sheetData><row><c t="inlineStr"><is><t>&a;</t></is></c></row></sheetData></worksheet>`);
    await expect(readXlsx(z, new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'broken' }));
  });

  it('says broken for a workbook whose XML does not parse', async () => {
    const z = await xlsx([{ name: 'List1', rows: '' }]);
    z.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row>');
    await expect(readXlsx(z, new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'broken' }));
  });
});
