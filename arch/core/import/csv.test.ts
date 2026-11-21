import { describe, expect, it } from 'vitest';
import { decodeText, parseCsv } from './csv';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('decodeText', () => {
  it('reads UTF-8 with and without a BOM', () => {
    expect(decodeText(utf8('Šťastná;3.B'))).toBe('Šťastná;3.B');
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Šťastná')]))).toBe('Šťastná');
  });

  it('reads Windows-1250, as Czech Excel saves a CSV, when the bytes are no UTF-8', () => {
    // Š ť a s t n á ; Ž l u ť o u č k ý
    const cp1250 = [0x8a, 0x9d, 0x61, 0x73, 0x74, 0x6e, 0xe1, 0x3b, 0x8e, 0x6c, 0x75, 0x9d, 0x6f, 0x75, 0xe8, 0x6b, 0xfd];
    expect(decodeText(new Uint8Array(cp1250))).toBe('Šťastná;Žluťoučký');
  });

  it('reads UTF-16 with a BOM, as Excel saves Unicode text', () => {
    const le = [0xff, 0xfe, 0x60, 0x01, 0x3b, 0x00, 0x41, 0x00]; // Š ; A
    const be = [0xfe, 0xff, 0x01, 0x60, 0x00, 0x3b, 0x00, 0x41];
    expect(decodeText(new Uint8Array(le))).toBe('Š;A');
    expect(decodeText(new Uint8Array(be))).toBe('Š;A');
  });
});

describe('parseCsv', () => {
  it('splits on semicolons, as Czech Excel writes', () => {
    expect(parseCsv('Jméno;Třída\nTereza Malá;3.B\n')).toEqual([['Jméno', 'Třída'], ['Tereza Malá', '3.B']]);
  });

  it('splits on commas and on tabs', () => {
    expect(parseCsv('Jméno,Třída\nJan Novák,2.A')).toEqual([['Jméno', 'Třída'], ['Jan Novák', '2.A']]);
    expect(parseCsv('Jméno\tTřída\nJan Novák\t2.A')).toEqual([['Jméno', 'Třída'], ['Jan Novák', '2.A']]);
  });

  it('gives a tie to the semicolon, so a comma inside a name stays in its cell', () => {
    expect(parseCsv('Malá, Tereza;3.B\nNovák, Jan;2.A')).toEqual([['Malá, Tereza', '3.B'], ['Novák, Jan', '2.A']]);
  });

  it('counts separators outside quotes only', () => {
    expect(parseCsv('"Malá, Tereza, ml.";3.B\n"Novák, Jan, st.";2.A')).toEqual([['Malá, Tereza, ml.', '3.B'], ['Novák, Jan, st.', '2.A']]);
  });

  it('reads quoted cells with separators, doubled quotes and line breaks', () => {
    expect(parseCsv('"a;b";"say ""hi""";"two\nlines"\nx;y;z')).toEqual([['a;b', 'say "hi"', 'two\nlines'], ['x', 'y', 'z']]);
  });

  it('takes CRLF, LF and CR line ends, and no empty row after the last one', () => {
    expect(parseCsv('a;b\r\nc;d\re;f\ng;h\r\n')).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']]);
  });

  it('follows the sep= line Excel understands, whatever its line end', () => {
    expect(parseCsv('sep=,\r\nMalá;Tereza,3.B')).toEqual([['Malá;Tereza', '3.B']]);
    expect(parseCsv('sep=;\rMalá;Tereza')).toEqual([['Malá', 'Tereza']]);
  });

  it('samples ten lines, a CRLF counting as one', () => {
    const lines = [...Array.from({ length: 6 }, (_, i) => `Jméno ${i}`), 'Malá;3.B'];
    expect(parseCsv(lines.join('\r\n')).at(-1)).toEqual(['Malá', '3.B']);
  });

  it('stops at 10 000 rows and 100 columns, and drops the empty cells at the end of a row', () => {
    expect(parseCsv('a\n'.repeat(10_050))).toHaveLength(10_000);
    expect(parseCsv(`${'x;'.repeat(300)}x`)[0]).toHaveLength(100);
    expect(parseCsv('a;b;;;\nc;;;;')).toEqual([['a', 'b'], ['c']]);
  });

  it('keeps a file without any separator as one column, even if a later line has one', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `Jméno ${i}`);
    expect(parseCsv([...lines, 'Malá, Tereza'].join('\n')).at(-1)).toEqual(['Malá, Tereza']);
  });

  it('reads an empty file as no rows', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
