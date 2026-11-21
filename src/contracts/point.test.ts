import { describe, expect, it } from 'vitest';

import { PERSON_FIELD_MAX, PERSON_HEADS, schoolYear } from '@/domain/cs';
import { POINT_LIMITS, type DraftPerson } from '@/domain/report';
import { richDocFromText } from '@/domain/richtext';
import { calDate } from '@/domain/time';

import {
  draftBulletsSchema,
  draftStatementsSchema,
  parsePointJsonb,
  savePointInput,
} from './point';

const person = (over: Record<string, unknown> = {}): DraftPerson => ({
  salutation: 'pani',
  givenName: 'Eva',
  familyName: 'Malá',
  ...over,
});
const people = (over: Record<string, unknown> = {}) => ({
  key: 'participants',
  label: 'Účastníci',
  kind: 'people',
  order: 'input',
  people: [person()],
  ...over,
});
const text = (over: Record<string, unknown> = {}) => ({
  key: 'results',
  label: 'Výsledky',
  kind: 'text',
  text: '1. místo',
  ...over,
});
const statement = (over: Record<string, unknown> = {}) => ({
  speaker: person(),
  speakerGenitive: 'paní Evy Malé',
  quote: 'Bylo to zajímavé.',
  ...over,
});

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;
const times = <T>(n: number, make: (i: number) => T) =>
  Array.from({ length: n }, (_, i) => make(i));
const x = (n: number) => 'x'.repeat(n);
const { person: PERSON } = POINT_LIMITS;

describe('draftBulletsSchema', () => {
  it('accepts what a draft holds, unfinished parts too', () => {
    const full = person({
      graphId: '6f1c3d0e-0000-4000-8000-000000000001',
      affiliation: '3.B',
      affiliationYear: '2026/2027',
    });
    const bullets = [
      people({ people: [full, person({ salutation: null })], order: 'class-surname' }),
      text({ label: '', text: '' }),
    ];
    expect(draftBulletsSchema.parse(bullets)).toEqual(bullets);
    expect(draftBulletsSchema.parse([])).toEqual([]);
  });

  it.each([
    ['bullets', (n: number) => times(n, (i) => text({ key: `b${i}` })), POINT_LIMITS.bullets],
    ['label', (n: number) => [text({ label: x(n) })], POINT_LIMITS.bulletLabel],
    ['key', (n: number) => [text({ key: `k${x(n - 1)}` })], POINT_LIMITS.bulletKey],
    ['text', (n: number) => [text({ text: x(n) })], POINT_LIMITS.textBullet],
    [
      'people per bullet',
      (n: number) => [people({ people: times(n, () => person()) })],
      POINT_LIMITS.peoplePerBullet,
    ],
    [
      'people per point',
      (n: number) => [
        people({ people: times(POINT_LIMITS.peoplePerBullet, () => person()) }),
        people({ key: 'more', people: times(n - POINT_LIMITS.peoplePerBullet, () => person()) }),
      ],
      POINT_LIMITS.peoplePerPoint,
    ],
    ['given name', (n: number) => [people({ people: [person({ givenName: x(n) })] })], PERSON.name],
    [
      'family name',
      (n: number) => [people({ people: [person({ familyName: x(n) })] })],
      PERSON.name,
    ],
    [
      'affiliation',
      (n: number) => [people({ people: [person({ affiliation: x(n) })] })],
      PERSON.affiliation,
    ],
  ])('bounds the %s', (_name, make, max) => {
    expect(ok(draftBulletsSchema, make(max))).toBe(true);
    expect(ok(draftBulletsSchema, make(max + 1))).toBe(false);
  });

  it.each([
    ['an unknown kind', text({ kind: 'photo' })],
    ['an unknown order', people({ order: 'random' })],
    ['a key that is not a slug', text({ key: 'Výsledky' })],
    ['an extra field', text({ required: true })],
    ['people on a text bullet', text({ people: [] })],
    ['a person with an extra field', people({ people: [person({ email: 'a@b.cz' })] })],
    ['an unknown salutation', people({ people: [person({ salutation: 'dr' })] })],
  ])('refuses %s', (_name, value) => {
    expect(ok(draftBulletsSchema, [value])).toBe(false);
  });

  describe('the address of the participants row (ADR 0071, 0074)', () => {
    it.each(['slecny-a-panove', 'slecny', 'panove', null])(
      'accepts %j on the participants row, and keeps it',
      (address) => {
        const bullets = [people({ address, people: [person({ salutation: null })] })];
        expect(draftBulletsSchema.parse(bullets)).toEqual(bullets);
      },
    );

    it('needs none: an older row has no address', () => {
      expect(ok(draftBulletsSchema, [people()])).toBe(true);
    });

    it.each(['bez-osloveni', 'damy', '', 7])('refuses the address %j', (address) => {
      expect(ok(draftBulletsSchema, [people({ address })])).toBe(false);
    });

    it.each(['organisers', 'speakers', 'audience', 'guests'])(
      'refuses an address on the %s row',
      (key) => {
        expect(ok(draftBulletsSchema, [people({ key, address: 'panove' })])).toBe(false);
      },
    );

    it('lets another row carry a null address, which says nothing', () => {
      expect(ok(draftBulletsSchema, [people({ key: 'organisers', address: null })])).toBe(true);
    });

    it('refuses one on a text bullet', () => {
      expect(ok(draftBulletsSchema, [text({ address: 'panove' })])).toBe(false);
    });
  });

  describe('a person’s function (ADR 0072)', () => {
    const parses = (over: Record<string, unknown>) =>
      ok(draftBulletsSchema, [people({ people: [person(over)] })]);

    it.each(PERSON_HEADS)('accepts the head %s, and keeps it with its complement', (head) => {
      const bullets = [
        people({ people: [person({ head, complement: 'pro majetek' }), person({ head })] }),
      ];
      expect(draftBulletsSchema.parse(bullets)).toEqual(bullets);
    });

    it('needs neither: an older person has none', () => {
      expect(parses({})).toBe(true);
    });

    it.each(['ucitel', '', 'Reditel', 7, null])('refuses the head %j', (head) => {
      expect(parses({ head })).toBe(false);
    });

    it('bounds the complement', () => {
      expect(parses({ head: 'clen', complement: x(PERSON_FIELD_MAX.complement) })).toBe(true);
      expect(parses({ head: 'clen', complement: x(PERSON_FIELD_MAX.complement + 1) })).toBe(false);
    });

    it('takes the head and complement of a statement’s speaker too', () => {
      const speaker = person({ head: 'profesor' });
      const statements = [{ speaker, speakerGenitive: 'pana profesora Nováka', quote: 'Ano.' }];
      expect(draftStatementsSchema.parse(statements)).toEqual(statements);
    });
  });

  describe('a person’s directory id and school year', () => {
    const parses = (over: Record<string, unknown>) =>
      ok(draftBulletsSchema, [people({ people: [person(over)] })]);

    it.each([
      ['a dev directory id', { graphId: '0d000000-0000-4000-8000-000000000001' }],
      ['a Graph user id', { graphId: '1b9f3a52-3c1e-4c9b-9d1a-6f4f1c2a7e10' }],
      ['a Graph test id', { graphId: '00000000-0000-0000-0000-000000000001' }],
      ['the school year schoolYear() writes', { affiliationYear: schoolYear(calDate(2026, 9, 1)) }],
      ['a school year that ended', { affiliationYear: '2020/2021' }],
    ])('accepts %s', (_name, over) => {
      expect(parses(over)).toBe(true);
    });

    it.each([
      ['an id that is no guid', { graphId: 'abc' }],
      ['an id of 36 letters', { graphId: 'x'.repeat(36) }],
      ['a school year that is text', { affiliationYear: 'abc' }],
      ['a school year with a dash', { affiliationYear: '2026-2027' }],
      ['a school year of two years', { affiliationYear: '2026/2028' }],
      ['a school year backwards', { affiliationYear: '2027/2026' }],
      ['a school year with spaces', { affiliationYear: ' 2026/2027' }],
      ['a degree before the name (ADR 0076)', { titlesBefore: 'Mgr.' }],
      ['a degree after the name (ADR 0076)', { titlesAfter: 'Ph.D.' }],
    ])('refuses %s', (_name, over) => {
      expect(parses(over)).toBe(false);
    });
  });

  it('refuses two bullets with the same key', () => {
    const result = draftBulletsSchema.safeParse([people(), text({ key: 'participants' })]);
    expect(result.error?.issues.map((i) => i.message)).toEqual(['duplicate-key']);
  });
});

describe('draftStatementsSchema', () => {
  it('accepts a statement without a speaker yet', () => {
    const statements = [statement({ speaker: null, speakerGenitive: '', quote: '' })];
    expect(draftStatementsSchema.parse(statements)).toEqual(statements);
  });

  it.each([
    ['statements', (n: number) => times(n, () => statement()), POINT_LIMITS.statements],
    ['quote', (n: number) => [statement({ quote: x(n) })], POINT_LIMITS.quote],
    [
      'genitive',
      (n: number) => [statement({ speakerGenitive: x(n) })],
      POINT_LIMITS.speakerGenitive,
    ],
    [
      'affiliation',
      (n: number) => [statement({ affiliation: x(n) })],
      POINT_LIMITS.statementAffiliation,
    ],
  ])('bounds the %s', (_name, make, max) => {
    expect(ok(draftStatementsSchema, make(max))).toBe(true);
    expect(ok(draftStatementsSchema, make(max + 1))).toBe(false);
  });

  it('refuses an extra field and what is not an array', () => {
    expect(ok(draftStatementsSchema, [statement({ title: 'x' })])).toBe(false);
    for (const value of [null, {}, 'x']) expect(ok(draftStatementsSchema, value)).toBe(false);
  });
});

describe('parsePointJsonb', () => {
  const jsonb = {
    body: richDocFromText('Odstavec.'),
    bullets: [people()],
    statements: [statement()],
  };

  it('gives back the parsed body, bullets and statements', () => {
    expect(parsePointJsonb(jsonb)).toEqual(jsonb);
  });

  it.each([
    ['a body that is not rich text', { body: { type: 'paragraph' } }],
    ['two bullets with the same key', { bullets: [people(), people()] }],
    ['a statement with a bad quote', { statements: [statement({ quote: 7 })] }],
  ])('refuses %s', (_name, over) => {
    expect(parsePointJsonb({ ...jsonb, ...over })).toBeNull();
  });
});

describe('savePointInput', () => {
  const content = (over: Record<string, unknown> = {}) => ({
    title: '',
    eventDate: null,
    endDate: null,
    timeFrom: null,
    timeTo: null,
    campus: null,
    place: null,
    opening: '',
    openingEdited: false,
    body: { type: 'doc', content: [] },
    bullets: [],
    statements: [],
    ...over,
  });
  const input = (over: Record<string, unknown> = {}) => ({
    id: '6f1c3d0e-0000-4000-8000-000000000001',
    expectedVersion: 1,
    content: content(over),
  });

  it.each([
    ['title', POINT_LIMITS.title],
    ['opening', POINT_LIMITS.opening],
    ['place', POINT_LIMITS.place],
  ])('bounds the %s', (field, max) => {
    expect(ok(savePointInput, input({ [field]: x(max) }))).toBe(true);
    expect(ok(savePointInput, input({ [field]: x(max + 1) }))).toBe(false);
  });

  it.each([
    ['an unknown field', { tags: [] }],
    ['an unknown campus', { campus: 'karlin' }],
    ['a date with a time', { eventDate: '2027-01-14T10:00' }],
    ['a body that is not a doc', { body: { type: 'paragraph', content: [] } }],
    [
      'a body node with an extra field',
      { body: { type: 'doc', content: [{ type: 'paragraph', attrs: { indent: 0 }, id: 1 }] } },
    ],
    ['a body over its own cap', { body: richDocFromText(x(POINT_LIMITS.bodyBytes)) }],
    [
      'a newline inside a body text',
      {
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', attrs: { indent: 0 }, content: [{ type: 'text', text: 'a\nb' }] },
          ],
        },
      },
    ],
  ])('refuses %s', (_name, over) => {
    expect(ok(savePointInput, input(over))).toBe(false);
  });

  it('refuses an unknown field next to the content, and a version below one', () => {
    expect(ok(savePointInput, { ...input(), state: 'draft' })).toBe(false);
    expect(ok(savePointInput, { ...input(), expectedVersion: 0 })).toBe(false);
  });
});
