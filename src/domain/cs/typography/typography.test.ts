import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { typographize, typographizeText as ty } from '../index';

const NB = '\u00A0';

describe('typographizeText', () => {
  it.each([
    ['V Praze', `V${NB}Praze`],
    ['a v Radlicích', `a${NB}v${NB}Radlicích`],
    ['studenti z 1.A a 2.B', `studenti z${NB}1.A a${NB}2.B`],
    ['(s rodiči)', `(s${NB}rodiči)`],
  ])('keeps one-letter words with the next word: %j', (input, output) => {
    expect(ty(input)).toBe(output);
  });

  it.each([
    ['dne 12. října 2026', `dne 12.${NB}října 2026`],
    ['19. 10. 2026', `19.${NB}10.${NB}2026`],
    ['Mgr. Jana Nováková', `Mgr.${NB}Jana Nováková`],
    ['Ing. arch. Klára', `Ing.${NB}arch.${NB}Klára`],
    ['učebna č. 12', `učebna č.${NB}12`],
  ])('binds dates, titles and „č.“: %j', (input, output) => {
    expect(ty(input)).toBe(output);
  });

  it.each([
    ['"Vyjádření"', '„Vyjádření“'],
    ['“Vyjádření”', '„Vyjádření“'],
    ['řekl: "Bylo to \'skvělé\'."', 'řekl: „Bylo to ‚skvělé‘.“'],
    ["rock'n'roll", 'rock’n’roll'],
    ['(„už česky“)', '(„už česky“)'],
    ['""', '„“'],
  ])('uses Czech quotes: %j', (input, output) => {
    expect(ty(input)).toBe(output);
  });

  it.each([
    ['seminář - přednáška', 'seminář – přednáška'],
    ['10:00-12:00', '10:00–12:00'],
    ['27.-29. října', `27.–29.${NB}října`],
    ['Čekáme...', 'Čekáme…'],
  ])('uses dashes and ellipses: %j', (input, output) => {
    expect(ty(input)).toBe(output);
  });

  it.each([
    '- účast studentů:',
    'https://ssps.cz/a-b?x=1',
    'jana.novakova@ssps.cz',
    '2026-10-19',
    'třída 1.A',
    'docházka 75%',
  ])('leaves %j alone', (input) => {
    expect(ty(input)).toBe(input);
  });
});

describe('typographize (runs)', () => {
  it('applies rules across run boundaries and keeps run fields', () => {
    const runs = [{ text: 'je uveden v ' }, { text: 'Příloze 1', bold: true }];
    expect(typographize(runs)).toEqual([
      { text: `je uveden v${NB}` },
      { text: 'Příloze 1', bold: true },
    ]);
  });

  it('closes a quote opened in an earlier run', () => {
    const runs = [{ text: 'vyjádření: "' }, { text: 'Super', italic: true }, { text: '"' }];
    expect(typographize(runs).map((r) => r.text)).toEqual(['vyjádření: „', 'Super', '“']);
  });

  const czechish = fc.string({
    unit: fc.constantFrom(...'avkszouiAVKSZ .,-:"\'„“’()12345čřžýáíéěůú\u00A0'.split('')),
    maxLength: 40,
  });

  it('is idempotent (property)', () => {
    fc.assert(
      fc.property(czechish, (s) => {
        expect(ty(ty(s))).toBe(ty(s));
      }),
      { numRuns: 2000 },
    );
  });

  it('gives the same text however a paragraph is split into runs (property)', () => {
    const noEllipsis = czechish.filter((s) => !s.includes('...'));
    fc.assert(
      fc.property(noEllipsis, fc.array(fc.nat(), { maxLength: 4 }), (s, cuts) => {
        const points = [...new Set(cuts.map((c) => c % (s.length + 1)))].sort((a, b) => a - b);
        const pieces = [0, ...points, s.length]
          .slice(0, -1)
          .map((start, i, all) => s.slice(start, all[i + 1] ?? s.length));
        const runs = pieces.map((text) => ({ text }));
        expect(
          typographize(runs)
            .map((r) => r.text)
            .join(''),
        ).toBe(ty(s));
      }),
    );
  });
});
