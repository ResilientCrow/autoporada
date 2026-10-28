import { describe, expect, it } from 'vitest';

import { calDate, wallTime } from '@/domain/time';

import {
  diffPointFields,
  newDraft,
  pointFieldValues,
  type DraftBullet,
  type PointContent,
} from './index';

const anna = { salutation: 'pani', givenName: 'Anna', familyName: 'Nová' } as const;
const petr = { salutation: 'pan', givenName: 'Petr', familyName: 'Malý' } as const;
const people = (...who: (typeof anna | typeof petr)[]): DraftBullet => ({
  key: 'organisers',
  label: 'Organizátoři',
  kind: 'people',
  order: 'input',
  people: who,
});
const results: DraftBullet = { key: 'results', label: 'Výsledky', kind: 'text', text: 'Dobré' };
const paragraph = (text: string) => ({
  type: 'paragraph' as const,
  attrs: { indent: 0 as const },
  content: [{ type: 'text' as const, text }],
});

const BASE: PointContent = {
  ...newDraft([]),
  title: 'Den otevřených dveří',
  eventDate: calDate(2027, 1, 14),
  timeFrom: wallTime(9, 0),
  campus: 'smichov',
  place: 'v aule',
  opening: 'Ve čtvrtek se konal den otevřených dveří.',
  body: { type: 'doc', content: [paragraph('První odstavec.')] },
  bullets: [people(anna, petr), results],
  statements: [{ speaker: anna, speakerGenitive: 'paní Anny Nové', quote: 'Krásný den.' }],
};
/** A deep copy: equal values in new objects and arrays. */
const copy = (content: PointContent): PointContent => structuredClone(content);

describe('diffPointFields', () => {
  it('names nothing when the content is unchanged, even in new objects and arrays', () => {
    expect(diffPointFields(BASE, BASE)).toEqual([]);
    expect(diffPointFields(BASE, copy(BASE))).toEqual([]);
  });

  it.each([
    ['title', { title: 'Den dveří' }],
    ['eventDate', { eventDate: calDate(2027, 1, 15) }],
    ['endDate', { endDate: calDate(2027, 1, 16) }],
    ['timeFrom', { timeFrom: wallTime(9, 30) }],
    ['timeTo', { timeTo: wallTime(12, 0) }],
    ['campus', { campus: 'radlice' }],
    ['place', { place: null }],
    ['opening', { opening: 'Jiná věta.' }],
    ['body', { body: { type: 'doc', content: [paragraph('Jiný odstavec.')] } }],
    ['bullets', { bullets: [people(anna, petr)] }],
    ['statements', { statements: [] }],
  ] as const)('names %s when only it changed', (field, patch) => {
    expect(diffPointFields(BASE, { ...copy(BASE), ...patch })).toEqual([field]);
  });

  it('never names the flag openingEdited', () => {
    expect(diffPointFields(BASE, { ...BASE, openingEdited: true })).toEqual([]);
  });

  it('names several fields in the content’s order', () => {
    const after = { ...BASE, statements: [], title: 'Nový', place: 'v tělocvičně' };
    expect(diffPointFields(BASE, after)).toEqual(['title', 'place', 'statements']);
  });

  it('sees reordered bullets and a reordered person inside one', () => {
    expect(diffPointFields(BASE, { ...BASE, bullets: [results, people(anna, petr)] })).toEqual([
      'bullets',
    ]);
    expect(diffPointFields(BASE, { ...BASE, bullets: [people(petr, anna), results] })).toEqual([
      'bullets',
    ]);
  });

  it('sees a change to one person inside a bullet', () => {
    const renamed = { ...anna, familyName: 'Nováková' };
    const bullets = [{ ...people(anna, petr), people: [renamed, petr] }, results];
    expect(diffPointFields(BASE, { ...BASE, bullets })).toEqual(['bullets']);
  });

  it('sees a person given a class, an optional value that was missing', () => {
    const bullets = [people({ ...anna, affiliation: '3.B' } as typeof anna, petr), results];
    expect(diffPointFields(BASE, { ...BASE, bullets })).toEqual(['bullets']);
  });

  it('takes an optional value held as undefined for one that is absent, as jsonb stores it', () => {
    const unset = { ...anna, affiliation: undefined } as typeof anna;
    const bullets = [people(unset, petr), results];
    expect(diffPointFields(BASE, { ...BASE, bullets })).toEqual([]);
    expect(diffPointFields({ ...BASE, bullets }, BASE)).toEqual([]);
  });

  it('sees a statement’s quote and its speaker', () => {
    const [said] = BASE.statements;
    expect(diffPointFields(BASE, { ...BASE, statements: [{ ...said!, quote: 'Jiná.' }] })).toEqual([
      'statements',
    ]);
    expect(diffPointFields(BASE, { ...BASE, statements: [{ ...said!, speaker: petr }] })).toEqual([
      'statements',
    ]);
  });
});

describe('pointFieldValues', () => {
  it('holds exactly the named fields, as the content has them', () => {
    expect(pointFieldValues(BASE, ['title', 'eventDate', 'bullets'])).toEqual({
      title: BASE.title,
      eventDate: BASE.eventDate,
      bullets: BASE.bullets,
    });
    expect(pointFieldValues(BASE, [])).toEqual({});
  });
});
