import { describe, expect, it } from 'vitest';

import { ORGANIZER_ROLES, organizerOnOneLine, organizerPhrase } from '../index';

describe('organizerPhrase (ADR 0063)', () => {
  it('names the roles once', () => {
    expect(ORGANIZER_ROLES).toEqual(['organizes', 'coordinates']);
  });

  it('writes the singular for one name', () => {
    expect(organizerPhrase('organizes', 'paní zástupkyně Jana Nováková')).toBe(
      'organizuje paní zástupkyně Jana Nováková',
    );
    expect(organizerPhrase('coordinates', 'pan Petr Malý')).toBe('koordinuje pan Petr Malý');
  });

  it('writes the plural when the names contain a comma', () => {
    expect(organizerPhrase('organizes', 'Jana Nováková, Petr Malý')).toBe(
      'organizují Jana Nováková, Petr Malý',
    );
    expect(organizerPhrase('coordinates', 'Jana Nováková, Petr Malý')).toBe(
      'koordinují Jana Nováková, Petr Malý',
    );
  });

  it('does not take " a " for several people', () => {
    expect(organizerPhrase('organizes', 'Jana Nováková a Petr Malý')).toBe(
      'organizuje Jana Nováková a Petr Malý',
    );
  });

  it('prints the names as typed when there is no role', () => {
    expect(organizerPhrase(null, 'zajišťuje 2.A paní učitelka Nováková')).toBe(
      'zajišťuje 2.A paní učitelka Nováková',
    );
    expect(organizerPhrase(null, 'A, B')).toBe('A, B');
  });

  it('trims, and writes nothing for empty names', () => {
    expect(organizerPhrase('organizes', '  Jana Nováková  ')).toBe('organizuje Jana Nováková');
    expect(organizerPhrase('organizes', '')).toBe('');
    expect(organizerPhrase('coordinates', '   ')).toBe('');
    expect(organizerPhrase(null, '  ')).toBe('');
  });

  it('puts names typed on several lines on one line', () => {
    expect(organizerOnOneLine('Jana Nováková\nPetr Malý')).toBe('Jana Nováková Petr Malý');
    expect(organizerOnOneLine('Jana Nováková,  \r\n  Petr Malý')).toBe('Jana Nováková, Petr Malý');
    expect(organizerOnOneLine('Jana Nováková')).toBe('Jana Nováková');
  });
});
