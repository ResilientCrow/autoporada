import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';

import { selectUsers, USERS_LIST_CAP } from './select';

let n = 0;
const user = (over: Partial<UserRecord> = {}): UserRecord => {
  n += 1;
  const id = `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
  return {
    id,
    tid: 't',
    oid: id,
    displayName: `Uživatel ${n}`,
    email: null,
    jobTitle: null,
    department: null,
    role: 'submitter',
    isStudent: false,
    status: 'active',
    remindDeadline: true,
    version: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
};
const names = (rows: readonly UserRecord[]) => rows.map((r) => r.displayName);

describe('selectUsers', () => {
  describe('groups', () => {
    const rows = [
      user({ displayName: 'P', role: 'pending' }),
      user({ displayName: 'S', role: 'submitter' }),
      user({ displayName: 'R', role: 'reviewer' }),
      user({ displayName: 'H', role: 'headmaster' }),
      user({ displayName: 'Sb', role: 'submitter', status: 'blocked' }),
      user({ displayName: 'Rd', role: 'reviewer', status: 'deactivated' }),
    ];

    it.each([
      ['all', ['H', 'P', 'R', 'Rd', 'S', 'Sb']],
      ['pending', ['P']],
      ['submitter', ['S']],
      ['reviewer', ['R']],
      ['headmaster', ['H']],
      ['inactive', ['Rd', 'Sb']],
    ] as const)('%s', (group, expected) => {
      const result = selectUsers(rows, { group });
      expect(names(result.rows)).toEqual(expected);
      expect(result.total).toBe(expected.length);
    });
  });

  describe('search', () => {
    const rows = [
      user({ displayName: 'Jana Nováková', email: 'jana@skola.cz' }),
      user({ displayName: 'Petr Černý', email: 'novak@skola.cz' }),
      user({ displayName: 'Eva Dvořáková', email: null }),
    ];

    it('folds case and diacritics in the name and the email', () => {
      expect(names(selectUsers(rows, { text: 'novak', group: 'all' }).rows)).toEqual([
        'Jana Nováková',
        'Petr Černý',
      ]);
      expect(names(selectUsers(rows, { text: 'ČERNY', group: 'all' }).rows)).toEqual([
        'Petr Černý',
      ]);
    });

    it('finds part of an email', () => {
      expect(names(selectUsers(rows, { text: 'jana@', group: 'all' }).rows)).toEqual([
        'Jana Nováková',
      ]);
    });

    it.each([undefined, '', '   '])('treats %j as no search', (text) => {
      expect(selectUsers(rows, { text, group: 'all' }).total).toBe(3);
    });

    it('finds nothing for an unknown text', () => {
      expect(selectUsers(rows, { text: 'zzz', group: 'all' })).toEqual({ rows: [], total: 0 });
    });

    it('applies the group and the search together', () => {
      const mixed = [
        user({ displayName: 'Nováková A', role: 'reviewer' }),
        user({ displayName: 'Nováková B', role: 'submitter' }),
      ];
      expect(names(selectUsers(mixed, { text: 'novak', group: 'reviewer' }).rows)).toEqual([
        'Nováková A',
      ]);
    });
  });

  it('orders in Czech: ch after h, ties by id', () => {
    const a = user({ displayName: 'Same' });
    const b = user({ displayName: 'Same' });
    const rows = [
      user({ displayName: 'Chalupa' }),
      user({ displayName: 'Zima' }),
      b,
      user({ displayName: 'Hruška' }),
      a,
      user({ displayName: 'Čech' }),
    ];
    const result = selectUsers(rows, { group: 'all' });
    expect(names(result.rows)).toEqual(['Čech', 'Hruška', 'Chalupa', 'Same', 'Same', 'Zima']);
    expect(result.rows.filter((r) => r.displayName === 'Same').map((r) => r.id)).toEqual([
      a.id,
      b.id,
    ]);
  });

  it('caps the rows but counts every match', () => {
    const rows = Array.from({ length: 120 }, (_, i) =>
      user({ displayName: `U${String(i).padStart(3, '0')}` }),
    );
    const result = selectUsers(rows, { group: 'all' });
    expect(result.rows).toHaveLength(USERS_LIST_CAP);
    expect(result.total).toBe(120);
    expect(result.rows[0]?.displayName).toBe('U000');
  });
});
