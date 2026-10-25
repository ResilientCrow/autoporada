import { describe, expect, it } from 'vitest';

import { POINT_LIMITS } from '@/domain/report';

import { defaultBulletsSchema } from './point-type';

const bullet = (over: Record<string, unknown> = {}) => ({
  key: 'participants',
  label: 'Účastníci',
  kind: 'people',
  required: true,
  ...over,
});

describe('defaultBulletsSchema', () => {
  it('accepts people and text bullets, with or without the organisers role', () => {
    const bullets = [bullet({ key: 'organisers', role: 'organisers' }), bullet({ kind: 'text' })];
    expect(defaultBulletsSchema.parse(bullets)).toEqual(bullets);
    expect(defaultBulletsSchema.parse([])).toEqual([]);
  });

  it('bounds the label and the number of bullets', () => {
    expect(
      defaultBulletsSchema.safeParse([bullet({ label: 'x'.repeat(POINT_LIMITS.bulletLabel) })])
        .success,
    ).toBe(true);
    expect(
      defaultBulletsSchema.safeParse([bullet({ label: 'x'.repeat(POINT_LIMITS.bulletLabel + 1) })])
        .success,
    ).toBe(false);
    expect(defaultBulletsSchema.safeParse([bullet({ label: '' })]).success).toBe(false);
    const many = (n: number) => Array.from({ length: n }, (_, i) => bullet({ key: `b${i}` }));
    expect(defaultBulletsSchema.safeParse(many(POINT_LIMITS.bullets)).success).toBe(true);
    expect(defaultBulletsSchema.safeParse(many(POINT_LIMITS.bullets + 1)).success).toBe(false);
  });

  it.each([
    ['an unknown kind', bullet({ kind: 'photo' })],
    ['an unknown role', bullet({ role: 'speakers' })],
    ['a missing required flag', bullet({ required: undefined })],
    ['a key that is not a slug', bullet({ key: 'Účastníci' })],
    ['an extra field', bullet({ people: [] })],
  ])('refuses %s', (_name, value) => {
    expect(defaultBulletsSchema.safeParse([value]).success).toBe(false);
  });

  it('refuses two bullets with the same key', () => {
    const twice = [bullet(), bullet({ kind: 'text', required: false })];
    expect(defaultBulletsSchema.safeParse(twice).success).toBe(false);
  });

  it('refuses what is not an array', () => {
    for (const value of [null, {}, 'x', 7]) {
      expect(defaultBulletsSchema.safeParse(value).success).toBe(false);
    }
  });
});
