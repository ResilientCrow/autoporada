import { describe, expect, it } from 'vitest';

import { FUNCTION_HEADS, FUNCTIONS_MAX, highestFunction, isStudentTier, TIERS } from './index';

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

describe('functions (ADR 0072 item 4)', () => {
  it('lists the heads from the highest to the lowest', () => {
    expect(FUNCTION_HEADS).toEqual(['statutarni-zastupce', 'zastupce', 'vedouci', 'clen']);
  });

  it('caps a person at five functions', () => {
    expect(FUNCTIONS_MAX).toBe(5);
  });
});

describe('highestFunction', () => {
  it('is none for no functions', () => {
    expect(highestFunction([])).toBeNull();
  });

  it('picks the highest head, whatever the order they were held in', () => {
    const clen = { head: 'clen', complement: 'PR oddělení' } as const;
    const zastupce = { head: 'zastupce', complement: 'pro majetek' } as const;
    const vedouci = { head: 'vedouci', complement: 'IT oddělení' } as const;
    expect(highestFunction([clen, vedouci, zastupce])).toBe(zastupce);
    expect(
      highestFunction([clen, { head: 'statutarni-zastupce', complement: null }, vedouci]),
    ).toEqual({
      head: 'statutarni-zastupce',
      complement: null,
    });
  });

  it('keeps the one held first of two with the same head', () => {
    const first = { head: 'zastupce', complement: 'pro majetek' } as const;
    const second = { head: 'zastupce', complement: 'pro pedagogickou činnost' } as const;
    expect(highestFunction([first, second])).toBe(first);
    expect(highestFunction([second, first])).toBe(second);
  });
});
