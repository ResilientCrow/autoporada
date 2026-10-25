import { describe, expect, it } from 'vitest';

import { POINT_LIMITS, type DraftPerson } from '@/domain/report';
import { richDocFromText } from '@/domain/richtext';

import { draftBulletsSchema, draftStatementsSchema, parsePointJsonb } from './point';

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
      titlesBefore: 'Mgr.',
      titlesAfter: 'Ph.D.',
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
    ['titles', (n: number) => [people({ people: [person({ titlesAfter: x(n) })] })], PERSON.title],
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
