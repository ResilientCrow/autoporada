import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parsePeopleList, PERSON_FIELD_MAX, type PasteRow } from '../index';

/** The parsed fields of a one-line input; the line number and source have their own tests. */
function parse(line: string, known: readonly { givenName: string; familyName: string }[] = []) {
  const { rows, rejected } = parsePeopleList(line, known);
  expect(rejected).toEqual([]);
  expect(rows).toHaveLength(1);
  const { line: _line, source: _source, ...fields } = rows[0] as PasteRow;
  return fields;
}

const person = (
  givenName: string,
  familyName: string,
  more: Partial<PasteRow> = {},
): Omit<PasteRow, 'line' | 'source'> => ({ givenName, familyName, uncertainOrder: false, ...more });

describe('person field caps', () => {
  it('are the form limits, exported for the point content to reuse', () => {
    expect(PERSON_FIELD_MAX).toEqual({ name: 80, affiliation: 120, complement: 80 });
  });
});

describe('degrees', () => {
  // The school uses no degrees (ADR 0076): a pasted list may carry them, the row drops them.
  it.each([
    ['Mgr. Jana Nováková (3.B)', person('Jana', 'Nováková', { affiliation: '3.B' })],
    ['Ing. Petr Dvořák, Ph.D.', person('Petr', 'Dvořák')],
  ])('drops them silently from %j', (line, expected) => {
    expect(parse(line)).toEqual(expected);
  });

  it('drops them from a list that mixes both', () => {
    const { rows, rejected } = parsePeopleList(
      'Mgr. Jana Nováková (3.B)\nIng. Petr Dvořák, Ph.D.\nEva Černá',
    );
    expect(rejected).toEqual([]);
    expect(rows.map(({ line: _l, source: _s, ...fields }) => fields)).toEqual([
      person('Jana', 'Nováková', { affiliation: '3.B' }),
      person('Petr', 'Dvořák'),
      person('Eva', 'Černá'),
    ]);
  });
});

describe('name shapes', () => {
  it.each([
    ['Jan Novák 3.B', person('Jan', 'Novák', { affiliation: '3.B' })],
    ['3.B Jan Novák', person('Jan', 'Novák', { affiliation: '3.B' })],
    ['Novák Jan, 3.B', person('Jan', 'Novák', { affiliation: '3.B' })],
    ['Novák Jan 3.B', person('Jan', 'Novák', { affiliation: '3.B' })],
    ['Jan Novák, 3.B', person('Jan', 'Novák', { affiliation: '3.B' })],
    ['Jan Novák (3.B)', person('Jan', 'Novák', { affiliation: '3.B' })],
    ['Mgr. Jana Nová', person('Jana', 'Nová')],
    ['Jana Nová, Ph.D.', person('Jana', 'Nová')],
    ['Jana Nová Ph.D.', person('Jana', 'Nová')],
    ['Ing. Petr Dvořák, Ph.D., 2.A', person('Petr', 'Dvořák', { affiliation: '2.A' })],
    ['2.A Ing. Petr Dvořák, Ph.D.', person('Petr', 'Dvořák', { affiliation: '2.A' })],
    ['Mgr. et Mgr. Eva Černá', person('Eva', 'Černá')],
    ['doc. Ing. Karel Blažek, CSc.', person('Karel', 'Blažek')],
    ['Ing. arch. Tomáš Veselý', person('Tomáš', 'Veselý')],
    ['Prof. Marie Horáková', person('Marie', 'Horáková')],
    ['Jana Nová, Ph.D., MBA', person('Jana', 'Nová')],
    // a title that belongs before the name, written after a comma
    ['Jan Novák, Bc.', person('Jan', 'Novák')],
    ['Novák Jan, Mgr.', person('Jan', 'Novák')],
    ['Novák, Ing. Jan', person('Jan', 'Novák')],
    ['Novák, Mgr. et Mgr. Jana', person('Jana', 'Novák')],
    ['Novák, Ing. Jan, Ph.D.', person('Jan', 'Novák')],
    ['Mgr. Jan Novák, Bc.', person('Jan', 'Novák')],
    ['Novák, J.', person('J.', 'Novák')],
    ['Petr Dvořák, Gymnázium Praha', person('Petr', 'Dvořák', { affiliation: 'Gymnázium Praha' })],
  ])('reads %j', (line, expected) => {
    expect(parse(line)).toEqual(expected);
  });

  it.each([
    ['Jan Novák (učitelka fyziky)', 'učitelka fyziky'],
    ['Jan Novák (Gymnázium  Praha)', 'Gymnázium Praha'],
    ['Petr Dvořák, ČVUT', 'ČVUT'],
    ['Petr Dvořák \u2013 ČVUT', 'ČVUT'],
    ['Petr Dvořák - ČVUT', 'ČVUT'],
    ['Petr Dvořák \u2014 ČVUT', 'ČVUT'],
    ['Petr Dvořák, firma Alfa s.r.o.', 'firma Alfa s.r.o.'],
    ['Novák, Jan (rodič)', 'rodič'],
  ])('keeps the organisation of %j as written', (line, affiliation) => {
    expect(parse(line).affiliation).toBe(affiliation);
  });

  it('does not take an organisation for a given name after a lone surname', () => {
    const result = parsePeopleList('Novák, učitelka fyziky');
    expect(result.rows).toEqual([]);
    expect(result.rejected).toMatchObject([{ line: 1, code: 'no-surname' }]);
  });

  it.each([
    'Novák, ČVUT',
    'Dvořák, Gymnázium Praha',
    'Novák, Gymnázium Karlín Praha Smíchov',
    'Novák, Ing.',
    'Novák, Mgr. Ph.D.',
  ])('does not take the organisation in %j for a given name', (line) => {
    const result = parsePeopleList(line);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toMatchObject([{ line: 1, code: 'no-surname' }]);
  });

  it.each([
    'Jan Ing. Novák',
    'Jan Novák učitel fyziky',
    'Jana Nováková zástupkyně',
    'Jan\tNovák\tučitel',
    'Jan Novák ml.',
    'učitel Jan Novák',
  ])('does not take the lowercase word in %j for a name', (line) => {
    const result = parsePeopleList(line);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toMatchObject([{ line: 1, code: 'no-surname' }]);
  });
});

describe('one affiliation per row', () => {
  it.each([
    // a class wins from any position, over a parenthesis and over an organisation
    ['Jan Novák, 3.B (rodič)', '3.B'],
    ['Jan Novák 3.B (rodič)', '3.B'],
    ['Jan Novák, ČVUT, 3.B', '3.B'],
    ['3.B Jan Novák, ČVUT', '3.B'],
    // the first class wins, the first organisation wins
    ['Jan Novák 3.B, 2.A', '3.B'],
    ['Jan Novák, 2.A, 3.B', '2.A'],
    ['Jan Novák, 2.A (3.B)', '2.A'],
    ['Jan Novák, ČVUT, Praha', 'ČVUT'],
    ['Jan Novák, ČVUT (Praha)', 'ČVUT'],
    // a part after the comma-inverted given name is an organisation
    ['Novák, Jan, Petr', 'Petr'],
    ['Novák, Jan, ČVUT', 'ČVUT'],
  ])('reads %j with the affiliation %j', (line, affiliation) => {
    expect(parse(line).affiliation).toBe(affiliation);
  });
});

describe('classes', () => {
  it.each([
    ['Jan Novák 3b', '3.B'],
    ['Jan Novák 3 B', '3.B'],
    ['3. B Jan Novák', '3.B'],
    ['Jan Novák 3. B', '3.B'],
    ['3B Jan Novák', '3.B'],
    ['l1b Marek Černý', 'L1B'],
    ['Marek Černý L1B', 'L1B'],
    ['Marek Černý (l2a)', 'L2A'],
    ['Marek Černý, 1.LF', '1.LF'],
  ])('normalizes the class in %j to %j', (line, affiliation) => {
    expect(parse(line).affiliation).toBe(affiliation);
  });

  it('leaves a name without class or organisation bare', () => {
    expect(parse('Jan Novák')).not.toHaveProperty('affiliation');
  });
});

describe('bullets', () => {
  it.each([
    '- Eva Malá 1.A',
    '-Eva Malá 1.A',
    '– Eva Malá 1.A',
    '• Eva Malá 1.A',
    '•\tEva Malá 1.A',
    '* Eva Malá 1.A',
    '1. Eva Malá 1.A',
    '12. Eva Malá 1.A',
    '2) Eva Malá 1.A',
    '  -  Eva Malá 1.A  ',
  ])('strips the bullet of %j', (line) => {
    expect(parse(line)).toEqual(person('Eva', 'Malá', { affiliation: '1.A' }));
  });

  it('keeps the source line as typed, bullet included', () => {
    const { rows } = parsePeopleList('  • Eva Malá 1.A  ');
    expect(rows[0]?.source).toBe('• Eva Malá 1.A');
  });
});

describe('name order', () => {
  it.each([
    // a known given name first, a known one last, a surname ending, a comma, a particle
    ['Jan Novák', 'Jan', 'Novák', false],
    ['Novák Jan', 'Jan', 'Novák', false],
    ['J. Novák', 'J.', 'Novák', false],
    ['Eva Nováková', 'Eva', 'Nováková', false],
    ['Nováková Eva', 'Eva', 'Nováková', false],
    ['Hana Černá', 'Hana', 'Černá', false],
    ['Černá Hana', 'Hana', 'Černá', false],
    ['Novák, Jan', 'Jan', 'Novák', false],
    ['Šlégr, Radomír', 'Radomír', 'Šlégr', false],
    ['Ludwig van Beethoven', 'Ludwig', 'van Beethoven', false],
    ['Petr de la Cruz', 'Petr', 'de la Cruz', false],
    // no evidence, or evidence for both readings: given name first, flagged
    ['Bořivoj Vlk', 'Bořivoj', 'Vlk', true],
    ['Vlk Bořivoj', 'Vlk', 'Bořivoj', true],
    ['Marek Daniel', 'Marek', 'Daniel', true],
    ['Daniel Marek', 'Daniel', 'Marek', true],
    ['Nová Malá', 'Nová', 'Malá', true],
    ['Jan, Bořivoj', 'Jan', 'Bořivoj', true],
  ])('reads %j as %j %j (uncertain: %s)', (line, givenName, familyName, uncertainOrder) => {
    expect(parse(line)).toEqual(person(givenName, familyName, { uncertainOrder }));
  });

  it.each([
    ['Jana Nováková Dvořáková', 'Jana', 'Nováková Dvořáková'],
    ['Nováková Dvořáková Jana', 'Jana', 'Nováková Dvořáková'],
    ['Anna Marie Nováková', 'Anna Marie', 'Nováková'],
    ['Nováková Anna Marie', 'Anna Marie', 'Nováková'],
    ['Eva Nováková-Dvořáková', 'Eva', 'Nováková-Dvořáková'],
    ['Petr Novotný Černý', 'Petr', 'Novotný Černý'],
    ['Karel Jan Novák', 'Karel Jan', 'Novák'],
    ['Jan Novák van Beethoven', 'Jan Novák', 'van Beethoven'],
  ])('splits the longer name %j into %j and %j', (line, givenName, familyName) => {
    const row = parse(line);
    expect([row.givenName, row.familyName]).toEqual([givenName, familyName]);
    expect(row.uncertainOrder).toBe(false);
  });

  // Where the given names end is a guess when a middle word could be either.
  it.each(['Jan Novák Dvořák', 'J. Novák Dvořák', 'Novák Dvořák Jan'])(
    'flags %j, whose given names and surname could be split elsewhere',
    (line) => {
      expect(parse(line).uncertainOrder).toBe(true);
    },
  );

  it('never guesses a salutation', () => {
    expect(Object.keys(parse('Eva Nováková 1.A'))).not.toContain('salutation');
  });
});

describe('recent people', () => {
  const recents = [{ givenName: 'Bořivoj', familyName: 'Vlk' }];

  it('keeps a doubt without a match', () => {
    expect(parse('Bořivoj Vlk')).toMatchObject({ uncertainOrder: true });
    expect(parse('Bořivoj Vlk', [{ givenName: 'Eva', familyName: 'Malá' }])).toMatchObject({
      uncertainOrder: true,
    });
  });

  it('clears the doubt of a name that matches a recent', () => {
    expect(parse('Bořivoj Vlk', recents)).toEqual(person('Bořivoj', 'Vlk'));
  });

  it('puts a swapped name in the recent order', () => {
    expect(parse('Vlk Bořivoj', recents)).toEqual(person('Bořivoj', 'Vlk'));
  });

  it('matches without case and diacritics', () => {
    expect(parse('BORIVOJ VLK', recents).uncertainOrder).toBe(false);
    expect(parse('Borivoj Vlk', recents).uncertainOrder).toBe(false);
    expect(parse('Vlk Bořivoj', recents)).toMatchObject({ givenName: 'Bořivoj' });
  });

  it('matches in decomposed form, on either side', () => {
    const decomposed = [{ givenName: 'Bo\u0072\u030civoj', familyName: 'Vlk' }];
    expect(parse('Vlk Bořivoj', decomposed)).toEqual(person('Bořivoj', 'Vlk'));
    expect(parse('Vlk Bo\u0072\u030civoj', recents)).toEqual(person('Bořivoj', 'Vlk'));
  });

  it('leaves a certain reading alone, whatever the recents say', () => {
    expect(parse('Jan Novák', [{ givenName: 'Novák', familyName: 'Jan' }])).toEqual(
      person('Jan', 'Novák'),
    );
  });

  it('keeps the class when it swaps', () => {
    expect(parse('Ing. Vlk Bořivoj, Ph.D., 4.C', recents)).toEqual(
      person('Bořivoj', 'Vlk', { affiliation: '4.C' }),
    );
  });
});

describe('decomposed text', () => {
  // Pasted from some editors, an accent is a separate combining character.
  it('reads the same as the precomposed text, and returns it precomposed', () => {
    const decomposed = parse('Nova\u0301kova\u0301 Bo\u0072\u030civoj, Ing.');
    expect(decomposed).toEqual(parse('Nováková Bořivoj, Ing.'));
    expect(decomposed).toEqual(person('Bořivoj', 'Nováková'));
  });

  it('keeps the source precomposed too', () => {
    expect(parsePeopleList('Nova\u0301k Jan').rows[0]?.source).toBe('Novák Jan');
  });
});

describe('lines and separators', () => {
  it('numbers rows by their line, blank lines counted', () => {
    const { rows, rejected } = parsePeopleList('Jan Novák\n\n  \nEva Malá 1.A\r\nPetr Dvořák');
    expect(rows.map((r) => [r.line, r.givenName])).toEqual([
      [1, 'Jan'],
      [4, 'Eva'],
      [5, 'Petr'],
    ]);
    expect(rejected).toEqual([]);
  });

  it('keeps the trimmed source of each line', () => {
    const { rows } = parsePeopleList('  Jan  Novák 3.B \nEva Malá');
    expect(rows.map((r) => r.source)).toEqual(['Jan  Novák 3.B', 'Eva Malá']);
  });

  it('accepts CR, LF and CRLF line breaks', () => {
    expect(parsePeopleList('Jan Novák\rEva Malá\nPetr Dvořák\r\nIvo Horák').rows).toHaveLength(4);
  });

  it('splits on semicolons when there is no line break', () => {
    const { rows } = parsePeopleList('Jan Novák 3.B; Eva Malá 1.A;Petr Dvořák, Ph.D.;');
    expect(rows.map((r) => [r.line, r.givenName, r.familyName])).toEqual([
      [1, 'Jan', 'Novák'],
      [2, 'Eva', 'Malá'],
      [3, 'Petr', 'Dvořák'],
    ]);
  });

  it('ignores a line break at the very end when it looks for semicolons', () => {
    expect(parsePeopleList('Jan Novák; Eva Malá\n').rows).toHaveLength(2);
  });

  it('does not split on semicolons when there are line breaks, and ignores a stray one', () => {
    const { rows } = parsePeopleList('Jan Novák 3.B;\nEva Malá 1.A;');
    expect(rows.map((r) => [r.line, r.givenName, r.affiliation])).toEqual([
      [1, 'Jan', '3.B'],
      [2, 'Eva', '1.A'],
    ]);
  });

  it('gives nothing for empty or blank input', () => {
    expect(parsePeopleList('')).toEqual({ rows: [], rejected: [], truncated: false });
    expect(parsePeopleList(' \n\t\n ')).toEqual({ rows: [], rejected: [], truncated: false });
  });

  it('keeps tabs and no-break spaces inside names', () => {
    expect(parse('Jan\u00a0Novák\t3.B')).toEqual(person('Jan', 'Novák', { affiliation: '3.B' }));
  });
});

describe('rejected lines', () => {
  it.each([
    ['Jan', 'a lone given name'],
    ['Novák', 'a lone surname'],
    ['3.B', 'a class only'],
    ['Mgr.', 'a title only'],
    ['Mgr. Ph.D.', 'titles only'],
    ['-', 'a bullet only'],
    ['Účastníci:', 'a heading'],
    ['Novák, 3.B', 'a surname and a class'],
    ['Seznam hostů:', 'a heading with a colon'],
    ['Jan Novák 3.B 4.C', 'a stray code in the name'],
    ['(3.B)', 'a parenthesis only'],
  ])('rejects %j (%s) as no-surname', (line) => {
    const result = parsePeopleList(line);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([{ line: 1, code: 'no-surname', source: line }]);
  });

  it('lists rejected lines with their line numbers beside the rows', () => {
    const { rows, rejected } = parsePeopleList(
      'Účastníci:\nJan Novák 3.B\n\nEva\n- Petr Dvořák\n3.B',
    );
    expect(rows.map((r) => r.line)).toEqual([2, 5]);
    expect(rejected).toEqual([
      { line: 1, code: 'no-surname', source: 'Účastníci:' },
      { line: 4, code: 'no-surname', source: 'Eva' },
      { line: 6, code: 'no-surname', source: '3.B' },
    ]);
  });

  it.each([
    ['given name', `${'A'.repeat(81)} Novák`, `${'A'.repeat(80)} Novák`],
    ['family name', `Jan ${'A'.repeat(81)}`, `Jan ${'A'.repeat(80)}`],
    ['organisation', `Jan Novák (${'x'.repeat(121)})`, `Jan Novák (${'x'.repeat(120)})`],
  ])('rejects a %s over its cap as too-long, and accepts the cap itself', (_what, over, at) => {
    expect(parsePeopleList(over).rejected).toMatchObject([{ line: 1, code: 'too-long' }]);
    expect(parsePeopleList(over).rows).toEqual([]);
    expect(parsePeopleList(at).rejected).toEqual([]);
    expect(parsePeopleList(at).rows).toHaveLength(1);
  });
});

describe('bounds', () => {
  const names = (count: number) =>
    Array.from({ length: count }, (_, i) => `Jan Novák ${(i % 9) + 1}.A`);

  it('takes exactly 60 lines', () => {
    const result = parsePeopleList(names(60).join('\n'));
    expect(result.rows).toHaveLength(60);
    expect(result.truncated).toBe(false);
  });

  it('ignores a trailing line break after the 60th line', () => {
    const result = parsePeopleList(`${names(60).join('\n')}\n\n`);
    expect(result.rows).toHaveLength(60);
    expect(result.truncated).toBe(false);
  });

  it('drops the 61st line and says so', () => {
    const result = parsePeopleList(names(61).join('\n'));
    expect(result.rows).toHaveLength(60);
    expect(result.rows.at(-1)?.line).toBe(60);
    expect(result.truncated).toBe(true);
  });

  it('counts blank lines', () => {
    const result = parsePeopleList(`${'\n'.repeat(59)}Jan Novák\nEva Malá`);
    expect(result.rows.map((r) => [r.line, r.givenName])).toEqual([[60, 'Jan']]);
    expect(result.truncated).toBe(true);
  });

  it('applies the same count to semicolon entries', () => {
    const result = parsePeopleList(names(61).join('; '));
    expect(result.rows).toHaveLength(60);
    expect(result.truncated).toBe(true);
  });

  /** `lines` lines of `Jan Novák` padded so the block is `total` characters long. */
  function block(lines: number, total: number): string {
    const width = Math.floor((total - (lines - 1)) / lines);
    const text = Array.from({ length: lines }, () => 'Jan Novák'.padEnd(width));
    const last = text.length - 1;
    text[last] = (text[last] ?? '').padEnd(total - (lines - 1) - width * (lines - 1));
    return text.join('\n');
  }

  it('takes exactly 4000 characters', () => {
    const raw = block(40, 4000);
    expect(raw).toHaveLength(4000);
    const result = parsePeopleList(raw);
    expect(result.rows).toHaveLength(40);
    expect(result.truncated).toBe(false);
  });

  it('drops the line cut by the 4001st character and says so', () => {
    const raw = block(40, 4001);
    expect(raw).toHaveLength(4001);
    const result = parsePeopleList(raw);
    expect(result.rows).toHaveLength(39);
    expect(result.truncated).toBe(true);
  });

  it('keeps whole lines when the 4000th character ends one', () => {
    const result = parsePeopleList(`${block(40, 4000)}\nEva Malá`);
    expect(result.rows).toHaveLength(40);
    expect(result.truncated).toBe(true);
  });

  it('does not report padding after the last whole line as lost text', () => {
    const result = parsePeopleList(`${block(39, 3900)}\n${' '.repeat(200)}`);
    expect(result.rows).toHaveLength(39);
    expect(result.truncated).toBe(false);
  });

  it('gives nothing, and truncated, for one line longer than the limit', () => {
    const result = parsePeopleList(`Jan ${'N'.repeat(5000)}`);
    expect(result).toEqual({ rows: [], rejected: [], truncated: true });
  });

  it('cuts semicolon entries at the character limit too', () => {
    const raw = `${'Jan Novák'.padEnd(99)};`.repeat(41);
    const result = parsePeopleList(raw);
    expect(result.rows).toHaveLength(40);
    expect(result.truncated).toBe(true);
  });

  it('copes with a huge paste', () => {
    const result = parsePeopleList('Jan Novák\n'.repeat(200_000));
    expect(result.rows).toHaveLength(60);
    expect(result.truncated).toBe(true);
  });
});

describe('a list pasted from a staff room', () => {
  const raw = [
    'Seznam hostů:',
    '1. Mgr. Hana Králová \u2013 učitelka dějepisu',
    '2. Ing. Libor Šimek, Ph.D. (ČVUT)',
    '3. Barbora Veselá 2.C',
    '4. Doležal Matyáš 4.A',
    '',
    '\u2022 Petra Nováková-Svobodová, 3.B',
    '\u2022 Ladislav Kubát',
    '\u2022 Bořivoj Vlk',
  ].join('\n');

  it('reads it row by row', () => {
    const { rows, rejected, truncated } = parsePeopleList(raw);
    expect(truncated).toBe(false);
    expect(rejected).toEqual([{ line: 1, code: 'no-surname', source: 'Seznam hostů:' }]);
    expect(rows.map(({ line, source: _source, ...fields }) => [line, fields])).toEqual([
      [2, person('Hana', 'Králová', { affiliation: 'učitelka dějepisu' })],
      [
        3,
        person('Libor', 'Šimek', {
          affiliation: 'ČVUT',
        }),
      ],
      [4, person('Barbora', 'Veselá', { affiliation: '2.C' })],
      [5, person('Matyáš', 'Doležal', { affiliation: '4.A' })],
      [7, person('Petra', 'Nováková-Svobodová', { affiliation: '3.B' })],
      [8, person('Ladislav', 'Kubát')],
      [9, person('Bořivoj', 'Vlk', { uncertainOrder: true })],
    ]);
  });
});

describe('any text', () => {
  it('never throws, and rows and rejected lines stay in order and apart', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), fc.boolean(), (raw, semicolons) => {
        const text = semicolons ? raw.replaceAll('\n', ';') : raw;
        const { rows, rejected } = parsePeopleList(text);
        const lines = [...rows.map((r) => r.line), ...rejected.map((r) => r.line)];
        expect(new Set(lines).size).toBe(lines.length);
        expect(rows.map((r) => r.line)).toEqual([...rows.map((r) => r.line)].sort((a, b) => a - b));
        for (const row of rows) {
          expect(row.givenName).not.toBe('');
          expect(row.familyName).not.toBe('');
          expect(row.givenName).toBe(row.givenName.trim());
          expect(row.familyName).toBe(row.familyName.trim());
        }
      }),
    );
  });
});
