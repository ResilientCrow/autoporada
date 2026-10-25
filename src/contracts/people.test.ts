import { describe, expect, it } from 'vitest';

import { RECENT_PEOPLE_MAX } from '@/domain/people';
import { PERSON_FIELD_MAX, POINT_LIMITS } from '@/domain/report';

import { recentPeopleOutput } from './people';

const jan = {
  salutation: 'pan',
  givenName: 'Jan',
  familyName: 'Novák',
  genitive: 'pana Jana Nováka',
  lastUsed: '2026-10-19T08:00:00.000Z',
};
const parses = (people: readonly unknown[]) => recentPeopleOutput.safeParse({ people }).success;

describe('recentPeopleOutput', () => {
  it('takes remembered people up to the cap', () => {
    // Design section 4: the picker gets at most 300 remembered people.
    expect(RECENT_PEOPLE_MAX).toBe(300);
    expect(parses([jan])).toBe(true);
    expect(parses(Array.from({ length: RECENT_PEOPLE_MAX }, () => jan))).toBe(true);
    expect(parses(Array.from({ length: RECENT_PEOPLE_MAX + 1 }, () => jan))).toBe(false);
  });

  it.each([
    ['an author id', { authorId: '1b9f3a52-3c1e-4c9b-9d1a-6f4f1c2a7e10' }],
    ['a point id', { pointId: '1b9f3a52-3c1e-4c9b-9d1a-6f4f1c2a7e10' }],
    ['a name past its cap', { familyName: 'x'.repeat(PERSON_FIELD_MAX.name + 1) }],
    ['a title past its cap', { titlesBefore: 'x'.repeat(PERSON_FIELD_MAX.title + 1) }],
    ['a class past its cap', { affiliation: 'x'.repeat(PERSON_FIELD_MAX.affiliation + 1) }],
    ['a genitive past its cap', { genitive: 'x'.repeat(POINT_LIMITS.speakerGenitive + 1) }],
    ['a graphId past its cap', { graphId: 'x'.repeat(POINT_LIMITS.graphId + 1) }],
    ['a date for lastUsed', { lastUsed: '2026-10-19' }],
  ])('refuses %s', (_, over) => {
    expect(parses([{ ...jan, ...over }])).toBe(false);
  });

  it('refuses anything beside the people', () => {
    expect(recentPeopleOutput.safeParse({ people: [], next: null }).success).toBe(false);
  });
});
