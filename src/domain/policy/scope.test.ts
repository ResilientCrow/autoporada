import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ROLES, type Actor, type Role } from '@/domain/actor';
import type { FutureKind } from '@/domain/calendar';
import type { FutureState } from '@/domain/review';

import { admits, can, readScope, type Scope } from './index';

const IDS = ['u1', 'u2', 'u3'] as const;
const FUTURE_STATES: readonly FutureState[] = [
  'draft',
  'submitted',
  'returned',
  'approved',
  'rejected',
  'withdrawn',
  'cancelled',
];

const anyActor: fc.Arbitrary<Actor> = fc.record({
  id: fc.constantFrom(...IDS),
  role: fc.constantFrom(...ROLES),
  status: fc.constantFrom('active', 'blocked', 'deactivated'),
  // Students with a reviewer role are bad data the policy must still contain.
  isStudent: fc.boolean(),
});

describe('readScope agrees with can()', () => {
  it('for points', () => {
    fc.assert(
      fc.property(anyActor, fc.constantFrom(...IDS), (a, authorId) => {
        const visible = admits(readScope(a, 'point'), { ownerId: authorId });
        expect(visible).toBe(can(a, { action: 'point.view', point: { authorId } }));
      }),
    );
  });

  it('for future items', () => {
    fc.assert(
      fc.property(
        anyActor,
        fc.constantFrom(...IDS),
        fc.constantFrom<FutureKind>('jednani', 'akce'),
        fc.constantFrom(...FUTURE_STATES),
        (a, authorId, kind, state) => {
          const visible = admits(readScope(a, 'futureItem'), { ownerId: authorId, kind, state });
          expect(visible).toBe(can(a, { action: 'future.view', item: { authorId, kind, state } }));
        },
      ),
    );
  });
});

describe('readScope for users and access requests', () => {
  const actor = (role: Role, extra: Partial<Actor> = {}): Actor => ({
    id: 'me',
    role,
    status: 'active',
    isStudent: false,
    ...extra,
  });
  const own: Scope = { kind: 'own', userId: 'me' };

  it.each<[string, Actor, Scope, Scope]>([
    ['pending', actor('pending'), own, own],
    ['submitter', actor('submitter'), own, own],
    ['reviewer', actor('reviewer'), own, own],
    ['headmaster', actor('headmaster'), { kind: 'all' }, { kind: 'all' }],
    [
      'blocked headmaster',
      actor('headmaster', { status: 'blocked' }),
      { kind: 'none' },
      { kind: 'none' },
    ],
    ['student marked headmaster', actor('headmaster', { isStudent: true }), own, own],
  ])('%s', (_name, a, users, requests) => {
    expect(readScope(a, 'user')).toEqual(users);
    expect(readScope(a, 'accessRequest')).toEqual(requests);
  });
});

describe('admits', () => {
  it('shows submitters their own future items and every approved akce', () => {
    const scope: Scope = { kind: 'own-or-approved-akce', userId: 'me' };
    expect(admits(scope, { ownerId: 'me', kind: 'jednani', state: 'draft' })).toBe(true);
    expect(admits(scope, { ownerId: 'x', kind: 'akce', state: 'approved' })).toBe(true);
    expect(admits(scope, { ownerId: 'x', kind: 'akce', state: 'submitted' })).toBe(false);
    expect(admits(scope, { ownerId: 'x', kind: 'jednani', state: 'approved' })).toBe(false);
  });
});
