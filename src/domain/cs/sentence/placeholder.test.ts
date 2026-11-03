import { describe, expect, it } from 'vitest';

import { parseIsoDate as d } from '@/domain/time';

import { placeholderParagraph, type Person, type PlaceholderInput } from '../index';

const jan: Person = {
  salutation: 'pan',
  givenName: 'Jan',
  familyName: 'Novák',
  affiliation: '1.A',
};
const eva: Person = {
  salutation: 'slecna',
  givenName: 'Eva',
  familyName: 'Malá',
  affiliation: '3.B',
};
const lucie: Person = { salutation: 'pani', givenName: 'Lucie', familyName: 'Králová' };

const base: PlaceholderInput = {
  date: d('2027-09-18'),
  title: 'Testovní akce',
  verb: 'organizuje',
  people: [jan],
};

describe('placeholderParagraph', () => {
  it('writes the sentence of ADR 0049 for a one-day akce', () => {
    expect(placeholderParagraph(base)).toBe(
      'Dne 18. 9. 2027 proběhla akce s názvem Testovní akce, kterou organizoval pan Jan Novák (1.A).',
    );
  });

  it('writes a multi-day akce as a range', () => {
    expect(placeholderParagraph({ ...base, endDate: d('2027-09-18'), people: [] })).toBe(
      'Dne 18. 9. 2027 proběhla akce s názvem Testovní akce.',
    );
    expect(placeholderParagraph({ ...base, date: d('2027-09-16'), endDate: d('2027-09-18') })).toBe(
      'Ve dnech 16.–18. 9. 2027 proběhla akce s názvem Testovní akce, kterou organizoval pan Jan Novák (1.A).',
    );
    expect(
      placeholderParagraph({ ...base, date: d('2027-09-30'), endDate: d('2027-10-02') }),
    ).toContain('Ve dnech 30. 9. – 2. 10. 2027 proběhla');
  });

  it.each([
    ['organizuje', [jan], 'organizoval'],
    ['organizuje', [eva], 'organizovala'],
    ['organizuje', [jan, eva], 'organizovali'],
    ['organizuje', [eva, lucie], 'organizovaly'],
    ['koordinuje', [lucie], 'koordinovala'],
    ['koordinuje', [jan, eva], 'koordinovali'],
    ['zajišťuje', [jan], 'zajišťoval'],
    ['zajišťuje', [eva, lucie], 'zajišťovaly'],
    ['vede', [jan], 'vedl'],
    ['vede', [eva], 'vedla'],
    ['vede', [jan, eva], 'vedli'],
    ['vede', [eva, lucie], 'vedly'],
  ] as const)('puts %s with %j into the past tense: %s', (verb, people, word) => {
    expect(placeholderParagraph({ ...base, verb, people })).toContain(`, kterou ${word} `);
  });

  it('lists several people as the agenda does', () => {
    expect(placeholderParagraph({ ...base, people: [eva, jan] })).toContain(
      'kterou organizovali slečna Eva Malá (3.B) a pan Jan Novák (1.A).',
    );
  });

  it('ends after the title with nobody listed', () => {
    expect(placeholderParagraph({ ...base, people: [] })).toBe(
      'Dne 18. 9. 2027 proběhla akce s názvem Testovní akce.',
    );
  });

  it('trims the title onto one line', () => {
    expect(placeholderParagraph({ ...base, title: '  Testovní\takce \n', people: [] })).toBe(
      'Dne 18. 9. 2027 proběhla akce s názvem Testovní akce.',
    );
  });
});
