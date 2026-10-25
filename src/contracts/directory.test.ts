import { describe, expect, it } from 'vitest';

import { DIRECTORY_LIMITS, PERSON_FIELD_MAX } from '@/domain/report';

import { directorySearchRequest, directorySearchResponse } from './directory';

const hit = {
  graphId: '1b9f3a52-3c1e-4c9b-9d1a-6f4f1c2a7e10',
  givenName: 'Jan',
  familyName: 'Novák',
  displayName: 'Jan Novák (3.B)',
};
const answers = (body: unknown) => directorySearchResponse.safeParse(body).success;

describe('directorySearchRequest', () => {
  it('takes a query of at most 64 characters', () => {
    expect(directorySearchRequest.parse({ q: 'nov' })).toEqual({ q: 'nov' });
    expect(directorySearchRequest.safeParse({ q: 'x'.repeat(64) }).success).toBe(true);
    expect(directorySearchRequest.safeParse({ q: 'x'.repeat(65) }).success).toBe(false);
  });

  it.each([
    ['no query', {}],
    ['a number', { q: 5 }],
    ['an unknown key', { q: 'nov', top: 50 }],
  ])('refuses %s', (_, body) => {
    expect(directorySearchRequest.safeParse(body).success).toBe(false);
  });
});

describe('directorySearchResponse', () => {
  it('answers hits up to the cap, with or without a notice', () => {
    expect(answers({ hits: [hit] })).toBe(true);
    expect(answers({ hits: [], notice: 'off' })).toBe(true);
    expect(answers({ hits: Array.from({ length: DIRECTORY_LIMITS.hits }, () => hit) })).toBe(true);
    expect(answers({ hits: Array.from({ length: DIRECTORY_LIMITS.hits + 1 }, () => hit) })).toBe(
      false,
    );
  });

  it.each(['off', 'unavailable', 'throttled', 'denied', 'timeout'])('names the %s notice', (n) => {
    expect(answers({ hits: [], notice: n })).toBe(true);
  });

  it.each([
    ['an unknown notice', { hits: [], notice: 'broken' }],
    ['an unknown key', { hits: [], query: 'nov' }],
    ['a hit with a mailbox', { hits: [{ ...hit, mail: 'jan.novak@ssps.cz' }] }],
    ['a hit without an id', { hits: [{ ...hit, graphId: undefined }] }],
    ['an id that is no guid', { hits: [{ ...hit, graphId: 'x'.repeat(36) }] }],
    ['an empty name', { hits: [{ ...hit, givenName: '' }] }],
    [
      'a name past its cap',
      { hits: [{ ...hit, familyName: 'x'.repeat(PERSON_FIELD_MAX.name + 1) }] },
    ],
    [
      'a display name past its cap',
      { hits: [{ ...hit, displayName: 'x'.repeat(DIRECTORY_LIMITS.displayName + 1) }] },
    ],
  ])('refuses %s', (_, body) => {
    expect(answers(body)).toBe(false);
  });

  it('takes names at their caps', () => {
    const full = {
      ...hit,
      givenName: 'x'.repeat(PERSON_FIELD_MAX.name),
      displayName: 'x'.repeat(DIRECTORY_LIMITS.displayName),
    };
    expect(answers({ hits: [full] })).toBe(true);
  });
});
