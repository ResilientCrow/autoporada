import { describe, expect, it } from 'vitest';

import { titleGender } from './title-gender';
import { SUBSTANTIVISED_ADJECTIVES, TITLE_WORDS, type TitleGender } from './title-words';

type Row = readonly [title: string, expected: TitleGender | null];

const NEUTER: readonly Row[] = [
  ['setkání', 'n'],
  ['jednání', 'n'],
  ['slavnostní shromáždění', 'n'],
  ['setkávání', 'n'],
  ['představení', 'n'],
  ['rozdávání', 'n'],
  ['jednání o spolupráci', 'n'],
  ['školní kolo olympiády', 'n'],
  ['Krajské kolo SOČ', 'n'],
  ['2. kolo přijímacího řízení', 'n'],
  ['Mistrovství republiky', 'n'],
  ['Vyhlašování výsledků', 'n'],
  ['Vítání prváků', 'n'],
  ['Pravidelné setkání vedení', 'n'],
  ['Natáčení reportáže', 'n'],
];

const FEMININE: readonly Row[] = [
  ['studijní stáž', 'f'],
  ['porada vedení', 'f'],
  ['konference', 'f'],
  ['návštěva žáků', 'f'],
  ['návštěva Smíchovské střední', 'f'],
  ['panelová diskuse', 'f'],
  ['akce Vaib', 'f'],
  ['výuka', 'f'],
  ['schůze', 'f'],
  ['pedagogická porada', 'f'],
  ['prodloužená v rámci tanečních', 'f'],
  ['schůzka', 'f'],
  ['Tematická exkurze', 'f'],
  ['Cvičná evakuace', 'f'],
  ['„Noc vědců“', 'f'],
  ['Robotiáda 2026', 'f'],
  ['Robotická olympiáda', 'f'],
  ['Slavnost světel', 'f'],
  ['Olympiáda', 'f'],
];

const MASCULINE: readonly Row[] = [
  ['hackathon', 'm'],
  ['edukační pobyt', 'm'],
  ['studentský koncert', 'm'],
  ['GameJam', 'm'],
  ['turnaj', 'm'],
  ['den otevřených dveří', 'm'],
  ['seminář', 'm'],
  ['Vesmírný seminář', 'm'],
  ['Seminář: Robotika', 'm'],
  ['Seminář: Práva a povinnosti', 'm'],
  ['Přednáška o životě a díle', 'f'],
  ['Halloweenská párty', 'f'],
  ['Workshop 3D tisku', 'm'],
  ['Lyžařský výcvik', 'm'],
  ['Maturitní ples', 'm'],
  ['Adaptační kurz 1.A', 'm'],
  ['10. ročník soutěže Robotiáda', 'm'],
  ['XV. ročník Majálesu', 'm'],
  ['Taneční kurz', 'm'],
  ['celoškolní piškvorkový turnaj', 'm'],
  ['celoškolní piškvorkový turnaj, kvalifikace do oblastního kola', 'm'],
  ['Seminář – Robotika', 'm'],
];

const PLURAL: readonly Row[] = [
  ['oslavy', 'pl'],
  ['třídní schůzky', 'pl'],
  ['Dny otevřených dveří', 'pl'],
  ['Tematické exkurze', 'pl'],
  ['Přijímací zkoušky', 'pl'],
  ['Studentské volby', 'pl'],
  ['Vánoční trhy', 'pl'],
  ['Taneční', 'pl'],
  ['Taneční kurzy', 'pl'],
];

const NEUTER_PLURAL: readonly Row[] = [
  ['Krajská kola SOČ', 'npl'],
  ['Pravidelná setkání vedení', 'npl'],
  ['Školní kola olympiády', 'npl'],
];

const UNKNOWN: readonly Row[] = [
  ['účast na školním projektu', null],
  ['Vaib', null],
  ['Kariéra 2026', null],
  ['Hackuj Smíchov', null],
  ['Nový rozvrh', null],
  ['Nový Zéland očima studentů', null],
  ['Kulatý stůl', null],
  ['Krajský kolo', null],
  ['Krajská kolo', null],
  ['Studentský pedagogická porada', null],
  ['Seminář a workshop 3D tisku', null],
  ['Seminář i workshop', null],
  ['Seminář nebo workshop', null],
  ['Seminář + workshop', null],
  ['seminář/workshop', null],
  ['Setkání, diskuse a raut', null],
  ['Seminář pro učitele a workshop pro žáky', null],
  ['Den učitelů, oběd a raut', null],
  ['Seminář (online) a diskuse', null],
  ['Den otevřených dveří, prohlídky a workshopy', null],
  ['Halloween párty', null],
  ['Halloween party', null],
  ['Den-otevřených', null],
  ['O pohár ředitele', null],
  ['Po stopách Karla IV.', null],
  ['Erasmus+', null],
  ['SOČ', null],
  ['Seminar', null],
  ['Velká cena Smíchova', null],
  ['Pravidelné', null],
  ['2.', null],
  ['', null],
  ['   ', null],
  ['\t\n', null],
];

const EDGES: readonly Row[] = [
  ['  seminář  ', 'm'],
  ['SEMINÁŘ', 'm'],
  ['Seminář\u00a03D tisku', 'm'],
  ['Pozvánka\tna seminář', null],
  ['„Seminář“', 'm'],
  ['"Konference" žáků', 'f'],
  ['(seminář)', 'm'],
  ['Studentský seminář a workshop', null],
  ['Studentská konference, workshop', 'f'],
];

const TABLE: readonly Row[] = [
  ...NEUTER,
  ...FEMININE,
  ...MASCULINE,
  ...PLURAL,
  ...NEUTER_PLURAL,
  ...UNKNOWN,
  ...EDGES,
];

describe('titleGender', () => {
  it('has a table of about ninety titles', () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(90);
  });

  it.each(TABLE.map(([title, expected]) => [title, expected] as const))(
    '%j reads as %s',
    (title, expected) => {
      expect(titleGender(title)).toBe(expected);
    },
  );

  it('reads a very long title without trouble', () => {
    const long = `Seminář ${'slovo '.repeat(50_000)}`;
    expect(titleGender(long)).toBe('m');
    expect(titleGender(`slovo ${'slovo '.repeat(50_000)}`)).toBeNull();
  });

  it('reads a long list with a comma only as far as the head', () => {
    expect(titleGender(`Turnaj, ${'slovo '.repeat(1_000)}a ${'slovo '.repeat(1_000)}`)).toBeNull();
  });
});

describe('TITLE_WORDS', () => {
  const entries = Object.entries(TITLE_WORDS) as [TitleGender, readonly string[]][];
  const all = entries.flatMap(([, words]) => words);

  it('puts no word in two classes', () => {
    expect(all.filter((word, i) => all.indexOf(word) !== i)).toEqual([]);
  });

  it('holds lowercase words without whitespace', () => {
    for (const word of all) {
      expect(word).toBe(word.toLocaleLowerCase('cs'));
      expect(word).toMatch(/^\S+$/u);
      expect(word.trim()).toBe(word);
    }
  });

  it('classes every listed word as itself', () => {
    for (const [gender, words] of entries) {
      for (const word of words) expect(titleGender(word)).toBe(gender);
    }
  });

  it('lists every substantivised adjective once', () => {
    for (const word of SUBSTANTIVISED_ADJECTIVES) expect(all).toContain(word);
  });
});
