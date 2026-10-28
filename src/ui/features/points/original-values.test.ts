import { describe, expect, it } from 'vitest';

import { originalValues, type EditBefore } from './original-values';

const anna = { salutation: 'pani', givenName: 'Anna', familyName: 'Nová' } as const;
const petr = {
  salutation: 'pan',
  titlesBefore: 'Mgr.',
  givenName: 'Petr',
  familyName: 'Malý',
} as const;
const paragraph = (text?: string) => ({
  type: 'paragraph' as const,
  attrs: { indent: 0 as const },
  ...(text !== undefined && { content: [{ type: 'text' as const, text }] }),
});

describe('originalValues', () => {
  it('is empty for an event that kept no previous values', () => {
    expect(originalValues(null)).toEqual([]);
    expect(originalValues(undefined)).toEqual([]);
    expect(originalValues({})).toEqual([]);
  });

  it('labels each field as the timeline names it, capitalized, in the content’s order', () => {
    const before: EditBefore = { place: 'v aule', title: 'Den otevřených dveří' };
    expect(originalValues(before)).toEqual([
      { label: 'Název', text: 'Den otevřených dveří' },
      { label: 'Místo', text: 'v aule' },
    ]);
  });

  it('writes dates and times out, and the campus by its name', () => {
    expect(
      originalValues({
        eventDate: '2027-01-14',
        endDate: '2027-01-16',
        timeFrom: '08:05',
        timeTo: '14:30',
        campus: 'na-vidouli',
      }),
    ).toEqual([
      { label: 'Datum začátku', text: '14. ledna 2027' },
      { label: 'Datum konce', text: '16. ledna 2027' },
      { label: 'Čas od', text: '8.05' },
      { label: 'Čas do', text: '14.30' },
      { label: 'Areál', text: 'Na Vidouli' },
    ]);
  });

  it('says a field was empty rather than leaving a blank', () => {
    expect(
      originalValues({
        title: '  ',
        eventDate: null,
        timeTo: null,
        campus: null,
        place: null,
        opening: '',
        body: { type: 'doc', content: [] },
        bullets: [],
        statements: [],
      }).map((v) => v.text),
    ).toEqual(Array(9).fill('(nevyplněno)'));
  });

  it('writes the body one paragraph per line, as plain text', () => {
    const body = {
      type: 'doc' as const,
      content: [paragraph('První.'), paragraph('<b>Druhý</b>')],
    };
    expect(originalValues({ body })).toEqual([
      { label: 'Další odstavce', text: 'První.\n<b>Druhý</b>' },
    ]);
  });

  it('writes each bullet on its own line, people by name', () => {
    expect(
      originalValues({
        bullets: [
          {
            key: 'organisers',
            label: 'Organizátoři',
            kind: 'people',
            order: 'input',
            people: [anna, petr],
          },
          { key: 'results', label: 'Výsledky', kind: 'text', text: ' Dobré ' },
          { key: 'guests', label: 'Hosté', kind: 'people', order: 'input', people: [] },
        ],
      }),
    ).toEqual([
      {
        label: 'Řádky',
        text: 'Organizátoři: Anna Nová, Mgr. Petr Malý\nVýsledky: Dobré\nHosté: (nevyplněno)',
      },
    ]);
  });

  it('writes each statement on its own line as „speaker: quote“, the quote alone with no speaker', () => {
    expect(
      originalValues({
        statements: [
          { speaker: anna, speakerGenitive: 'paní Anny Nové', quote: 'Krásný den.' },
          { speaker: null, speakerGenitive: '', quote: 'Bez mluvčího.' },
        ],
      }),
    ).toEqual([{ label: 'Vyjádření', text: 'Anna Nová: Krásný den.\nBez mluvčího.' }]);
  });
});
