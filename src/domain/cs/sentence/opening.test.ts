import { describe, expect, it } from 'vitest';

import { parseIsoDate as d, parseWallTime as t } from '@/domain/time';

import {
  openingSentence,
  organiserVerb,
  roomLocative,
  type OpeningInput,
  type Person,
} from '../index';

const eva: Person = {
  salutation: 'slecna',
  givenName: 'Eva',
  familyName: 'Malá',
  affiliation: '3.B',
};
const jan: Person = {
  salutation: 'pan',
  givenName: 'Jan',
  familyName: 'Novák',
  affiliation: '3.B',
};
const lucie: Person = {
  salutation: 'slecna',
  givenName: 'Lucie',
  familyName: 'Králová',
  affiliation: '3.B',
};

const base: OpeningInput = {
  date: d('2026-10-14'),
  from: t('10:00'),
  to: t('12:00'),
  campus: 'smichov',
  place: 'v učebně S206',
  title: 'Vesmírný seminář',
  titleGender: 'm',
  organisers: [eva, jan],
};

describe('openingSentence', () => {
  it('writes the template sentence', () => {
    expect(openingSentence(base)).toBe(
      'Ve středu 14. října 2026 od 10.00 do 12.00 hodin v areálu Smíchov v učebně S206 ' +
        'proběhl Vesmírný seminář, který organizovali slečna Eva Malá a pan Jan Novák (oba\u00A03.B).',
    );
  });

  it.each([
    ['f', 'Matematická soutěž', 'proběhla Matematická soutěž, kterou organizovali'],
    ['n', 'Setkání absolventů', 'proběhlo Setkání absolventů, které organizovali'],
    ['pl', 'Dny otevřených dveří', 'proběhly Dny otevřených dveří, které organizovali'],
    ['npl', 'Školní kola olympiády', 'proběhla Školní kola olympiády, která organizovali'],
  ] as const)('agrees with a %s title', (titleGender, title, phrase) => {
    expect(openingSentence({ ...base, title, titleGender })).toContain(phrase);
  });

  it('names the type before the title, agreeing with the type', () => {
    expect(
      openingSentence({ ...base, title: 'Robotická olympiáda', typeName: 'Seminář' }),
    ).toContain('proběhl seminář Robotická olympiáda, který organizovali');
    expect(
      openingSentence({
        ...base,
        title: 'Robotická olympiáda',
        typeName: 'Projektový den',
        organisers: [],
      }),
    ).toMatch(/proběhl projektový den Robotická olympiáda\.$/);
  });

  it('leaves the type out when the title already holds it', () => {
    expect(openingSentence({ ...base, typeName: 'Seminář' })).toContain(
      'proběhl Vesmírný seminář, který',
    );
    expect(
      openingSentence({ ...base, title: 'Soutez Robotiáda', titleGender: 'f', typeName: 'Soutěž' }),
    ).toContain('proběhla Soutez Robotiáda, kterou');
  });

  it('matches the type word only as a whole word', () => {
    expect(openingSentence({ ...base, title: 'Seminární práce', typeName: 'Seminář' })).toContain(
      'proběhl seminář Seminární práce',
    );
    expect(
      openingSentence({
        ...base,
        title: 'Přednáškový cyklus',
        titleGender: 'f',
        typeName: 'Přednáška',
      }),
    ).toContain('proběhla přednáška Přednáškový cyklus');
  });

  it('keeps an acronym type in capitals', () => {
    expect(
      openingSentence({ ...base, title: 'Robotiáda', titleGender: 'f', typeName: 'SOČ' }),
    ).toContain('proběhla SOČ Robotiáda');
  });

  it('names no type when the gender is unknown', () => {
    const { titleGender: _unknown, ...rest } = base;
    expect(openingSentence({ ...rest, title: 'Hackathon', typeName: 'Jiné' })).toContain(
      'proběhla akce „Hackathon“',
    );
  });

  it('falls back to „akce“ when the gender is unknown', () => {
    const { titleGender: _unknown, ...rest } = base;
    expect(openingSentence({ ...rest, title: 'Hackathon' })).toContain(
      'proběhla akce „Hackathon“, kterou organizovali',
    );
  });

  it('writes multi-day events with „Ve dnech“', () => {
    const sentence = openingSentence({
      ...base,
      endDate: d('2026-10-16'),
      from: undefined,
      to: undefined,
    });
    expect(sentence).toMatch(/^Ve dnech 14\.–16\. října 2026 v areálu Smíchov/);
  });

  it('refuses a range that ends before it starts', () => {
    expect(() => openingSentence({ ...base, endDate: d('2026-10-12') })).toThrow(RangeError);
  });

  it('treats an end date equal to the start as a single day', () => {
    expect(openingSentence({ ...base, endDate: base.date })).toMatch(/^Ve středu 14\. října 2026 /);
  });

  it('leaves out what is not known', () => {
    expect(
      openingSentence({
        date: d('2026-10-12'),
        campus: 'jinde',
        place: 'na Pražském hradě',
        title: 'Exkurze',
        titleGender: 'f',
        organisers: [],
      }),
    ).toBe('V pondělí 12. října 2026 na Pražském hradě proběhla Exkurze.');
  });

  it('writes a start time alone as „od 9.00 hodin“', () => {
    expect(openingSentence({ ...base, from: t('9:00'), to: undefined })).toContain(
      'od 9.00 hodin v areálu',
    );
  });
});

describe('organiserVerb', () => {
  it.each([
    [[jan], 'organizoval'],
    [[eva], 'organizovala'],
    [[eva, jan], 'organizovali'],
    [[eva, lucie], 'organizovaly'],
  ])('%#: %s', (people, verb) => {
    expect(organiserVerb(people)).toBe(verb);
  });
});

describe('roomLocative', () => {
  it.each([
    ['S206', 'v učebně S206'],
    ['S8', 'v učebně S8'],
    [' R12A ', 'v učebně R12A'],
    ['v Laboratoři fyziky', 'v Laboratoři fyziky'],
  ])('%j → %j', (room, phrase) => {
    expect(roomLocative(room)).toBe(phrase);
  });
});
