import { describe, expect, it } from 'vitest';

import { PERSON_FIELD_MAX } from '@/domain/cs';
import { LIMITS as RICH_LIMITS } from '@/domain/richtext';

import { DIRECTORY_LIMITS, POINT_LIMITS, PERSON_FIELD_MAX as REEXPORTED } from './index';

describe('POINT_LIMITS', () => {
  it('pins the bounds of design section 14', () => {
    expect(POINT_LIMITS).toMatchObject({
      peoplePerBullet: 200,
      peoplePerPoint: 400,
      bullets: 12,
      statements: 10,
      bodyBytes: 64 * 1024,
      title: 200,
      opening: 1000,
      place: 120,
      textBullet: 2000,
      quote: 1500,
      note: 2000,
      bulletLabel: 60,
      bulletKey: 40,
      affiliationYear: 9,
      graphId: 36,
      speakerGenitive: 200,
      statementAffiliation: 120,
      contentBytes: 200_000,
    });
  });

  it('pins the bounds of the people search (design sections 4 and 14)', () => {
    expect(DIRECTORY_LIMITS).toEqual({ hits: 10, minQuery: 3, query: 64, displayName: 160 });
  });

  it('shares the person caps with the paste parser instead of copying them', () => {
    expect(POINT_LIMITS.person).toBe(PERSON_FIELD_MAX);
    expect(REEXPORTED).toBe(PERSON_FIELD_MAX);
    expect(POINT_LIMITS.person).toEqual({ name: 80, title: 40, affiliation: 120 });
  });

  it('takes the body cap from the rich text module', () => {
    expect(POINT_LIMITS.bodyBytes).toBe(RICH_LIMITS.maxBytes);
  });

  it('keeps a year of the form 2026/2027 within its cap', () => {
    expect('2026/2027'.length).toBeLessThanOrEqual(POINT_LIMITS.affiliationYear);
    expect(crypto.randomUUID().length).toBe(POINT_LIMITS.graphId);
  });

  it('leaves headroom under the 262,144-byte CHECK for the content cap', () => {
    expect(POINT_LIMITS.contentBytes).toBeLessThan(262_144);
  });

  it('allows one full bullet of people within the per-point cap', () => {
    expect(POINT_LIMITS.peoplePerBullet).toBeLessThanOrEqual(POINT_LIMITS.peoplePerPoint);
  });
});
