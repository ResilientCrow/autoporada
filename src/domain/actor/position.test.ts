import { describe, expect, it } from 'vitest';

import { isStudentTier, TIERS } from './index';

describe('isStudentTier', () => {
  it('counts a student and an absolvent as students', () => {
    expect(isStudentTier('student')).toBe(true);
    expect(isStudentTier('absolvent')).toBe(true);
  });

  it.each(['reditel', 'vedeni', 'ucitel', 'zamestnanec'] as const)('counts %s as staff', (tier) => {
    expect(isStudentTier(tier)).toBe(false);
  });

  it('counts no tier yet as staff', () => {
    expect(isStudentTier(null)).toBe(false);
  });

  it('lists every tier once', () => {
    expect(TIERS).toEqual(['reditel', 'vedeni', 'ucitel', 'zamestnanec', 'student', 'absolvent']);
  });
});
