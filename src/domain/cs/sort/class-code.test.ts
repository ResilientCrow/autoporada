import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { compareClass, compareStudents, csCollator, normalizeClass, parseClass } from '../index';

describe('class codes', () => {
  it.each([
    ['1.A', '1.A'],
    ['1a', '1.A'],
    ['1. a', '1.A'],
    [' 2.b ', '2.B'],
    ['l1b', 'L1B'],
    ['L1B', 'L1B'],
    ['L 2 A', 'L2A'],
    ['učitelka fyziky', 'učitelka fyziky'],
    ['  ředitel ', 'ředitel'],
  ])('normalizes %j to %j', (raw, normalized) => {
    expect(normalizeClass(raw)).toBe(normalized);
  });

  it('parses programme classes', () => {
    expect(parseClass('L1B')).toEqual({ year: 1, program: 'L', letter: 'B' });
    expect(parseClass('ředitel')).toBeNull();
  });

  it('orders by year first, plain classes before programmes, roles last', () => {
    const shuffled = ['3.A', 'učitel', 'L2B', '1.B', '2.A', 'L1B', '1.A', 'asistentka'];
    expect([...shuffled].sort((a, b) => compareClass(a, b))).toEqual([
      '1.A',
      '1.B',
      'L1B',
      '2.A',
      'L2B',
      '3.A',
      'asistentka',
      'učitel',
    ]);
  });

  it('lets a programme rank move L classes after all plain classes of a year', () => {
    const rank = (program: string) => (program === 'L' ? 9 : 0);
    expect(['L1A', '1.C', '1.A'].sort((a, b) => compareClass(a, b, { programRank: rank }))).toEqual(
      ['1.A', '1.C', 'L1A'],
    );
  });

  it('is a consistent total order (property)', () => {
    const code = fc.oneof(
      fc
        .tuple(fc.integer({ min: 1, max: 4 }), fc.constantFrom('A', 'B', 'C'))
        .map(([y, l]) => `${y}.${l}`),
      fc
        .tuple(fc.integer({ min: 1, max: 4 }), fc.constantFrom('A', 'B'))
        .map(([y, l]) => `L${y}${l}`),
      fc.constantFrom('učitel', 'asistentka', 'ředitel'),
    );
    fc.assert(
      fc.property(code, code, code, (a, b, c) => {
        expect(Math.sign(compareClass(a, b)) + Math.sign(compareClass(b, a))).toBe(0);
        if (compareClass(a, b) <= 0 && compareClass(b, c) <= 0) {
          expect(compareClass(a, c)).toBeLessThanOrEqual(0);
        }
      }),
    );
  });
});

describe('Czech collation', () => {
  it('sorts surnames the Czech way (ch after h, č after c, ř after r)', () => {
    const surnames = [
      'Žák',
      'Chalupa',
      'Čermák',
      'Novák',
      'Řezáč',
      'Cibulka',
      'Hrubý',
      'Šimek',
      'Ondra',
      'Rychlý',
      'Nováková',
      'Sedlák',
      'Zelený',
    ];
    expect([...surnames].sort(csCollator.compare)).toEqual([
      'Cibulka',
      'Čermák',
      'Hrubý',
      'Chalupa',
      'Novák',
      'Nováková',
      'Ondra',
      'Rychlý',
      'Řezáč',
      'Sedlák',
      'Šimek',
      'Zelený',
      'Žák',
    ]);
  });

  it('runs on full ICU data (fails on small-icu Node builds)', () => {
    expect(csCollator.compare('ch', 'h')).toBeGreaterThan(0);
    expect(csCollator.compare('ch', 'i')).toBeLessThan(0);
  });
});

describe('compareStudents', () => {
  it('orders by class, then surname, then given name', () => {
    const students = [
      { givenName: 'Jan', familyName: 'Žák', affiliation: '2.A' },
      { givenName: 'Petr', familyName: 'Novák', affiliation: '1.B' },
      { givenName: 'Adam', familyName: 'Novák', affiliation: '1.B' },
      { givenName: 'Eva', familyName: 'Čermáková', affiliation: '1.B' },
    ];
    expect([...students].sort((a, b) => compareStudents(a, b)).map((s) => s.givenName)).toEqual([
      'Eva',
      'Adam',
      'Petr',
      'Jan',
    ]);
  });
});
