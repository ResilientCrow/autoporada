import { describe, expect, it } from 'vitest';
import { parseTable } from './table';

const FORBIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200e\u200f\u2028-\u202e\u2066-\u2069]/;

describe('parseTable', () => {
  it('splits tab-separated lines into cells', () => {
    expect(parseTable('Třída\tPočet\r\n1.A\t25\n')).toEqual([['Třída', 'Počet'], ['1.A', '25']]);
  });

  it('splits semicolon-separated lines when every line has one, and otherwise keeps a line as one cell', () => {
    expect(parseTable('a; b ;c\nd;e;f')).toEqual([['a', 'b', 'c'], ['d', 'e', 'f']]);
    expect(parseTable('a;b\nc')).toEqual([['a;b'], ['c']]);
  });

  it('skips blank lines', () => {
    expect(parseTable('a\t b\n\n  \nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('stores no forbidden character: a manual line break from Word, a control, a direction mark', () => {
    const rows = parseTable('a\u000bb\tc\u0001d\ne\u202ef\tg\u200fh\ni\u000bj;k');
    expect(rows.flat().some((c) => FORBIDDEN.test(c))).toBe(false);
    expect(rows).toEqual([['a b', 'cd'], ['ef', 'gh'], ['i j;k']]);
  });
});
