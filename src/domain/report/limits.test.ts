import { describe, expect, it } from 'vitest';

import { PERSON_FIELD_MAX, placeholderParagraph } from '@/domain/cs';
import { LIMITS as RICH_LIMITS } from '@/domain/richtext';
import { calDate, parseWallTime } from '@/domain/time';

import { DIRECTORY_LIMITS, POINT_LIMITS, PERSON_FIELD_MAX as REEXPORTED } from './index';

describe('POINT_LIMITS', () => {
  it('fits the longest paragraph the system writes for a missing report', () => {
    const paragraph = placeholderParagraph({
      date: calDate(2026, 12, 28),
      endDate: calDate(2027, 1, 1),
      from: parseWallTime('14:00'),
      campus: 'na-vidouli',
      place: 'š'.repeat(POINT_LIMITS.place),
      title: 'ž'.repeat(POINT_LIMITS.title),
      organizer: 'á'.repeat(POINT_LIMITS.organizer),
      participants: 'é'.repeat(POINT_LIMITS.participants),
    });
    expect(paragraph.length).toBeLessThanOrEqual(POINT_LIMITS.placeholder);
  });

  it('pins the bounds of design section 14', () => {
    expect(POINT_LIMITS).toMatchObject({
      peoplePerBullet: 200,
      peoplePerPoint: 400,
      bullets: 12,
      statements: 10,
      bodyBytes: 64 * 1024,
      title: 200,
      opening: 1000,
      placeholder: 4000,
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
    expect(POINT_LIMITS.person).toEqual({ name: 80, affiliation: 120, complement: 80 });
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
