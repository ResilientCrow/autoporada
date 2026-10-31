import { describe, expect, it } from 'vitest';

import { isClassCode, parsePaste } from './index';

const SAMPLE =
  'Jana Nováková (1.A), Patricie Nováková, Anna Nováková (obě 2.B), Jan Novák (1.A), Patrik Novák, ' +
  'Ondřej Novák (oba 1.B), Jan Hezký, Milan Nový, Jiří Novotný (všichni 1.C)';

/** Name and class of each row, the way the preview shows them. */
const brief = (text: string, order?: 'given-family' | 'family-given') =>
  parsePaste(text, order).map((r) => `${r.givenName}|${r.familyName}|${r.classCode}`);

describe('parsePaste', () => {
  it('reads the document’s own list format, groups reaching back to the last classed name', () => {
    const rows = parsePaste(SAMPLE);
    expect(rows.map((r) => [r.givenName, r.familyName, r.classCode])).toEqual([
      ['Jana', 'Nováková', '1.A'],
      ['Patricie', 'Nováková', '2.B'],
      ['Anna', 'Nováková', '2.B'],
      ['Jan', 'Novák', '1.A'],
      ['Patrik', 'Novák', '1.B'],
      ['Ondřej', 'Novák', '1.B'],
      ['Jan', 'Hezký', '1.C'],
      ['Milan', 'Nový', '1.C'],
      ['Jiří', 'Novotný', '1.C'],
    ]);
    expect(rows.every((r) => r.problems.length === 0 && r.warnings.length === 0)).toBe(true);
    expect(rows[1]?.source).toBe('Patricie Nováková');
    expect(rows[2]?.source).toBe('Anna Nováková (obě 2.B)');
  });

  it('gives the same rows when the sample is split over lines, with markers, and joined by „a“', () => {
    const lines = [
      '- Jana Nováková (1.A)',
      '• Patricie Nováková',
      '* Anna Nováková (obě 2.B)',
      '1. Jan Novák (1.A)',
      '2) Patrik Novák a Ondřej Novák (oba 1.B)',
      '',
      'Jan Hezký; Milan Nový; Jiří Novotný (všichni 1.C)',
    ].join('\r\n');
    expect(brief(lines)).toEqual(brief(SAMPLE));
  });

  it('does not take „1.A Jan“ for a list marker', () => {
    const [row] = parsePaste('1.A Jan Novák');
    expect(row?.source).toBe('1.A Jan Novák');
    expect(row?.familyName).toBe('Novák');
    // a leading class is not the trailing class either: the item has no class
    expect(row?.problems).toEqual(['class-missing']);
  });

  it('treats NBSP and the other spaces as spaces', () => {
    const exotic = 'Jana\u00a0Nováková (1.A), Jan　Novák\u00a01.B';
    expect(brief(exotic)).toEqual(['Jana|Nováková|1.A', 'Jan|Novák|1.B']);
  });

  it('accepts a trailing class, lower case, in brackets with a space, and the L1B form', () => {
    expect(brief('Jan Novák 1.a\nEva Nová (2. B)\nOla Bílá L1B\nPetr Černý 3c')).toEqual([
      'Jan|Novák|1.A',
      'Eva|Nová|2.B',
      'Ola|Bílá|L1B',
      'Petr|Černý|3.C',
    ]);
  });

  it('matches group words and „z“ folded for case and diacritics', () => {
    const rows = parsePaste('Jan Novák, Eva Nová (OBE z 1.A), Ota Nový, Ida Nová (VSICHNI ze 2.B)');
    expect(rows.map((r) => r.classCode)).toEqual(['1.A', '1.A', '2.B', '2.B']);
    expect(rows.flatMap((r) => r.warnings)).toEqual([]);
  });

  it('reads tab columns: the last class column is the class, the rest is the name', () => {
    expect(brief('Jan\tNovák\t1.A\nEva\tNová\t2.B\t')).toEqual(['Jan|Novák|1.A', 'Eva|Nová|2.B']);
    const row = parsePaste('Jan\tNovák\tbez třídy')[0];
    expect(row?.classCode).toBeNull();
    expect(row?.problems).toEqual(['class-missing']);
  });

  it('puts the family name first for „Příjmení Jméno“', () => {
    expect(brief('Nováková Jana (1.A), Novák Jan Karel 1.B', 'family-given')).toEqual([
      'Jana|Nováková|1.A',
      'Jan Karel|Novák|1.B',
    ]);
    expect(brief('Jan Karel Novák 1.B')).toEqual(['Jan Karel|Novák|1.B']);
  });

  it('keeps the case as typed', () => {
    expect(brief('jan NOVÁK (1.a)')).toEqual(['jan|NOVÁK|1.A']);
  });

  it('does not split on separators inside brackets', () => {
    const rows = parsePaste('Jan Novák (oba 1.A, 1.B)');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.problems).toEqual(['class-unknown']);
  });

  describe('problems', () => {
    const problems = (text: string) => parsePaste(text).map((r) => r.problems);

    it('name-missing for one word, and the word is the family name', () => {
      const [row] = parsePaste('Novák (1.A)');
      expect(row).toMatchObject({ givenName: '', familyName: 'Novák', classCode: '1.A' });
      expect(row?.problems).toEqual(['name-missing']);
    });

    it('class-missing when nothing names a class', () => {
      expect(problems('Jan Novák')).toEqual([['class-missing']]);
    });

    it('class-unknown for a bracket that is neither a class nor a group, and its text is not in the name', () => {
      const [row] = parsePaste('Jan Novák (hostující) 1.A');
      expect(row?.problems).toEqual(['class-unknown']);
      expect(row?.givenName).toBe('Jan');
      expect(row?.familyName).toBe('Novák');
      expect(problems('Jan Novák (1.A')).toEqual([['class-unknown']]);
      expect(problems('Jan Novák 1.A)')).toEqual([['class-unknown']]);
    });

    it('a group word with an unknown class is class-unknown', () => {
      expect(problems('Jan Novák (oba 12.A)')).toEqual([['class-unknown']]);
    });

    it('duplicate folds case and diacritics, against earlier rows', () => {
      expect(problems('Jan Novák (1.A), JAN NOVAK (1.a), Jan Novák (1.B)')).toEqual([
        [],
        ['duplicate'],
        [],
      ]);
    });

    it('duplicate against the names already on the list', () => {
      const rows = parsePaste('Jan Novák (1.A), Eva Nová (1.A)', 'given-family', [
        { givenName: 'Eva', familyName: 'Nová', classCode: '1.A' },
      ]);
      expect(rows.map((r) => r.problems)).toEqual([[], ['duplicate']]);
    });

    it('a row with a problem other than the duplicate does not shadow a later equal row', () => {
      expect(problems('Jan Novák, Jan Novák (1.A)')).toEqual([['class-missing'], []]);
    });
  });

  describe('group-count warning', () => {
    const warned = (text: string) => parsePaste(text).map((r) => r.warnings.length > 0);

    it('oba over three names warns on all three, and leaves the problems empty', () => {
      const rows = parsePaste('A Bé, C Dé, E Éf (oba 1.A)');
      expect(rows.map((r) => r.warnings)).toEqual([
        ['group-count'],
        ['group-count'],
        ['group-count'],
      ]);
      expect(rows.flatMap((r) => r.problems)).toEqual([]);
      expect(rows.map((r) => r.classCode)).toEqual(['1.A', '1.A', '1.A']);
    });

    it('oba over one name warns, over two does not', () => {
      expect(warned('A Bé (oba 1.A)')).toEqual([true]);
      expect(warned('A Bé, C Dé (oba 1.A)')).toEqual([false, false]);
    });

    it('všichni over one name warns, over two or more does not', () => {
      expect(warned('A Bé (všichni 1.A)')).toEqual([true]);
      expect(warned('A Bé, C Dé, E Éf (všichni 1.A)')).toEqual([false, false, false]);
    });

    it('counts only the names after the last classed one', () => {
      expect(warned('X Y (1.B), A Bé, C Dé (oba 1.A)')).toEqual([false, false, false]);
    });
  });

  describe('malformed input', () => {
    it('gives no rows for empty text, whitespace, markers and separators only', () => {
      for (const text of ['', '   \n\t\n', '-\n•\n', ',;,', ' a ']) {
        expect(parsePaste(text), JSON.stringify(text)).toEqual([]);
      }
    });

    it('survives stray brackets, lone class text and very long lines', () => {
      expect(() => parsePaste(')))((( 1.A ((')).not.toThrow();
      expect(parsePaste('1.A')[0]?.problems).toContain('name-missing');
      expect(parsePaste(`${'Jan Novák, '.repeat(500)}Eva Nová`)).toHaveLength(501);
    });

    it('does not take a capital A for „a“', () => {
      expect(parsePaste('Jan A Novák (1.A)')).toHaveLength(1);
    });
  });
});

describe('isClassCode', () => {
  it.each(['1.A', '1a', '1. A', 'L1B', ' 2.b '])('accepts %j', (text) => {
    expect(isClassCode(text)).toBe(true);
  });
  it.each(['', 'Jan', '12.A', '1.', 'oba'])('refuses %j', (text) => {
    expect(isClassCode(text)).toBe(false);
  });
});
