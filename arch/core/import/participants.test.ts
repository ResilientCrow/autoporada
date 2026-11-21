// @vitest-environment happy-dom
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { appendNames, namesFromRows, readParticipants } from './participants';

const ODS_NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"';

describe('namesFromRows with a header row', () => {
  it('puts the given name first from separate columns, with the class in parentheses', () => {
    expect(namesFromRows([['Příjmení', 'Jméno', 'Třída'], ['Malá', 'Tereza', '3.B'], ['Novák', 'Jan', '2.A']])).toEqual(['Tereza Malá (3.B)', 'Jan Novák (2.A)']);
  });

  it('prints one name column as the file has it, in whichever order', () => {
    expect(namesFromRows([['Příjmení a jméno', 'Tř.'], ['Malá Tereza', '3.B']])).toEqual(['Malá Tereza (3.B)']);
    expect(namesFromRows([['Jméno a příjmení'], ['Tereza Malá'], ['Jan Novák']])).toEqual(['Tereza Malá', 'Jan Novák']);
  });

  it('takes a lone Jméno or Příjmení column as the whole name', () => {
    expect(namesFromRows([['Jméno', 'Třída'], ['Tereza Malá', '3.B']])).toEqual(['Tereza Malá (3.B)']);
    expect(namesFromRows([['Příjmení'], ['Malá']])).toEqual(['Malá']);
  });

  it('knows the usual headers whatever their case, accents and punctuation', () => {
    expect(namesFromRows([['ŽÁK', 'třída:'], ['Tereza Malá', '3.B']])).toEqual(['Tereza Malá (3.B)']);
    expect(namesFromRows([['Celé jméno', 'Kmenová třída'], ['Tereza Malá', '3.B']])).toEqual(['Tereza Malá (3.B)']);
    expect(namesFromRows([['Účastník'], ['Jan Novák']])).toEqual(['Jan Novák']);
    expect(namesFromRows([['First name', 'Last name', 'Class'], ['Tereza', 'Malá', '3.B']])).toEqual(['Tereza Malá (3.B)']);
  });

  it('takes Celé jméno as the whole name, even beside a Příjmení column', () => {
    expect(namesFromRows([['Příjmení', 'Celé jméno', 'Třída'], ['Malá', 'Tereza Malá', '3.B']])).toEqual(['Tereza Malá (3.B)']);
  });

  it('takes the row naming the most columns, so a title above the header is not one', () => {
    expect(namesFromRows([['Účastníci lyžařského kurzu 2026'], ['Příjmení', 'Jméno', 'Třída'], ['Malá', 'Tereza', '3.B'], ['Novák', 'Jan', '2.A']])).toEqual(['Tereza Malá (3.B)', 'Jan Novák (2.A)']);
    expect(namesFromRows([['Žáci 3.B'], ['Příjmení', 'Jméno'], ['Malá', 'Tereza']])).toEqual(['Tereza Malá']);
    expect(namesFromRows([['Účastníci'], ['P.č.', 'Jméno a příjmení'], ['1', 'Tereza Malá']])).toEqual(['Tereza Malá']);
  });

  it('never lists a header as a name: a title over a one-column header, or a header repeated on every page', () => {
    expect(namesFromRows([['Účastníci'], ['Jméno a příjmení'], ['Tereza Malá']])).toEqual(['Tereza Malá']);
    expect(namesFromRows([['Jméno', 'Třída'], ['Tereza Malá', '3.B'], ['Jméno', 'Třída'], ['Jan Novák', '2.A']])).toEqual(['Tereza Malá (3.B)', 'Jan Novák (2.A)']);
  });

  it('takes a whole-person word for a header only when it is the whole cell, as Žák is also a surname', () => {
    expect(namesFromRows([['Jan Žák'], ['Eva Nová']])).toEqual(['Jan Žák', 'Eva Nová']);
    expect(namesFromRows([['Žák Jan', '3.B'], ['Nová Eva', '2.A']])).toEqual(['Žák Jan (3.B)', 'Nová Eva (2.A)']);
    expect(namesFromRows([['Jméno', 'Třída'], ['Jan Žák', '3.B'], ['Student Eva', '2.A']])).toEqual(['Jan Žák (3.B)', 'Student Eva (2.A)']);
  });

  it('skips a title above the header and the columns around the names', () => {
    const rows = [['Seznam účastníků'], [], ['P.č.', 'Příjmení', 'Jméno', 'Datum narození', 'Třída', 'E-mail'], ['1', 'Malá', 'Tereza', '1.1.2009', '3.B', 'mala@example.cz']];
    expect(namesFromRows(rows)).toEqual(['Tereza Malá (3.B)']);
  });

  it('takes the first column of a kind, not a guardian, a parent, a contact or the class teacher', () => {
    const rows = [['Jméno zákonného zástupce', 'Příjmení', 'Jméno', 'Třídní učitel', 'Třída'], ['Petr Malý', 'Malá', 'Tereza', 'Jana Nováková', '3.B']];
    expect(namesFromRows(rows)).toEqual(['Tereza Malá (3.B)']);
    const parents = [['Jméno matky', 'Příjmení otce', 'Kontaktní osoba', 'Příjmení', 'Jméno', 'Jméno třídního učitele'], ['Jana', 'Malý', 'Petr Malý', 'Malá', 'Tereza', 'Eva']];
    expect(namesFromRows(parents)).toEqual(['Tereza Malá']);
  });

  it('leaves out rows without a name and repeats, and prints a name without its class when the cell is empty', () => {
    const rows = [['Jméno', 'Třída'], ['Tereza Malá', '3.B'], ['', '3.B'], ['Tereza Malá', '3.B'], ['Jan Novák', '']];
    expect(namesFromRows(rows)).toEqual(['Tereza Malá (3.B)', 'Jan Novák']);
  });

  it('cleans the text and turns a comma inside a cell into a space, as a comma separates people', () => {
    const rows = [['Jméno', 'Třída'], ['  Malá,\tTereza\u202e ', '3.B\n'], ['Novák, Jan', '2.A, 2.B']];
    expect(namesFromRows(rows)).toEqual(['Malá Tereza (3.B)', 'Novák Jan (2.A 2.B)']);
  });
});

describe('namesFromRows without a header row', () => {
  it('takes a single column as names', () => {
    expect(namesFromRows([['Tereza Malá'], ['Jan Novák']])).toEqual(['Tereza Malá', 'Jan Novák']);
  });

  it('finds the class column by its values', () => {
    expect(namesFromRows([['Tereza Malá', '3.B'], ['Jan Novák', '2. A'], ['Eva Nová', '4A']])).toEqual(['Tereza Malá (3.B)', 'Jan Novák (2. A)', 'Eva Nová (4A)']);
  });

  it('joins neighbouring name columns in the order of the file', () => {
    expect(namesFromRows([['1', 'Malá', 'Tereza', '3.B'], ['2', 'Novák', 'Jan', '2.A']])).toEqual(['Malá Tereza (3.B)', 'Novák Jan (2.A)']);
  });

  it('leaves out numbers, addresses and rows whose name is not one', () => {
    expect(namesFromRows([['Tereza Malá', 'mala@example.cz'], ['Celkem 2', ''], ['Jan Novák', 'novak@example.cz']])).toEqual(['Tereza Malá', 'Jan Novák']);
  });

  it('finds nothing in a sheet of numbers or an empty one', () => {
    expect(namesFromRows([['1', '2'], ['3', '4']])).toEqual([]);
    expect(namesFromRows([])).toEqual([]);
    expect(namesFromRows([['Jméno', 'Třída']])).toEqual([]);
  });
});

describe('appendNames', () => {
  it('fills an empty field', () => {
    expect(appendNames('  ', ['Tereza Malá (3.B)', 'Jan Novák (2.A)'], 2000)).toEqual({ text: 'Tereza Malá (3.B), Jan Novák (2.A)', added: 2, present: 0 });
  });

  it('appends after what is typed, with one comma', () => {
    expect(appendNames('Eva Nová', ['Jan Novák'], 2000)).toEqual({ text: 'Eva Nová, Jan Novák', added: 1, present: 0 });
    expect(appendNames('Eva Nová, \n', ['Jan Novák'], 2000)).toEqual({ text: 'Eva Nová, Jan Novák', added: 1, present: 0 });
  });

  it('does not add a name that is already there', () => {
    expect(appendNames('Tereza Malá (3.B),Eva  Nová', ['Tereza Malá (3.B)', 'Eva Nová', 'Jan Novák'], 2000)).toEqual({ text: 'Tereza Malá (3.B),Eva  Nová, Jan Novák', added: 1, present: 2 });
    expect(appendNames('Jan Novák', ['Jan Novák'], 2000)).toEqual({ text: 'Jan Novák', added: 0, present: 1 });
  });

  it('refuses the whole list when the field would pass its limit', () => {
    expect(appendNames('Eva', ['Jan Novák'], 14)).toEqual({ text: 'Eva, Jan Novák', added: 1, present: 0 });
    expect(appendNames('Eva', ['Jan Novák'], 13)).toEqual({ tooLong: 14 });
  });
});

describe('readParticipants', () => {
  it('takes the first sheet that has names', async () => {
    const z = new JSZip();
    const t = (cells: string) => `<table:table><table:table-row>${cells}</table:table-row></table:table>`;
    z.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet');
    z.file('content.xml', `<office:document-content ${ODS_NS}><office:body><office:spreadsheet>${t('<table:table-cell><text:p>42</text:p></table:table-cell>')}${t('<table:table-cell><text:p>Jan Novák</text:p></table:table-cell>')}${t('<table:table-cell><text:p>Eva Nová</text:p></table:table-cell>')}</office:spreadsheet></office:body></office:document-content>`);
    expect(await readParticipants(new Blob([await z.generateAsync({ type: 'arraybuffer' })]), new DOMParser())).toEqual(['Jan Novák']);
  });

  it('reads the names from a file', async () => {
    const csv = new Blob(['\ufeffPříjmení;Jméno;Třída\r\nMalá;Tereza;3.B\r\nNovák;Jan;2.A\r\n']);
    expect(await readParticipants(csv, new DOMParser())).toEqual(['Tereza Malá (3.B)', 'Jan Novák (2.A)']);
  });

  it('gives an empty list for a file without names', async () => {
    expect(await readParticipants(new Blob(['1;2\n3;4']), new DOMParser())).toEqual([]);
  });

  it('refuses a file over 5 MB before reading it', async () => {
    const big = new Blob([new Uint8Array(5_000_001)]);
    const read = vi.spyOn(big, 'arrayBuffer');
    await expect(readParticipants(big, new DOMParser())).rejects.toEqual(expect.objectContaining({ code: 'file-too-big' }));
    expect(read).not.toHaveBeenCalled();
  });
});
