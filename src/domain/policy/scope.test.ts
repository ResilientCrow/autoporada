import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ROLES, type Actor, type Role } from '@/domain/actor';
import type { FutureKind } from '@/domain/calendar';
import type { FutureState, PointState } from '@/domain/review';

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

const POINT_STATES: readonly PointState[] = [
  'draft',
  'submitted',
  'returned',
  'approved',
  'rejected',
  'withdrawn',
  'published',
];

/**
 * A state with the `everSubmitted` flags it can really carry: only a draft
 * (never submitted, or retracted) and a withdrawn row may lack a submit;
 * every other state is reached through one, and only a retract clears
 * `submitted_at` (ADR 0026).
 */
function reachable<S extends string>(states: readonly S[]) {
  return fc.tuple(fc.constantFrom(...states), fc.boolean()).map(([state, flag]) => ({
    state,
    everSubmitted: state === 'draft' || state === 'withdrawn' ? flag : true,
  }));
}

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
      fc.property(
        anyActor,
        fc.constantFrom(...IDS),
        fc.constantFrom(...POINT_STATES),
        fc.boolean(),
        (a, authorId, state, everSubmitted) => {
          const visible = admits(readScope(a, 'point'), {
            ownerId: authorId,
            state,
            everSubmitted,
          });
          expect(visible).toBe(
            can(a, { action: 'point.view', point: { authorId, state, everSubmitted } }),
          );
        },
      ),
    );
  });

  it('for future items', () => {
    fc.assert(
      fc.property(
        anyActor,
        fc.constantFrom(...IDS),
        fc.constantFrom<FutureKind>('jednani', 'akce'),
        reachable(FUTURE_STATES),
        (a, authorId, kind, { state, everSubmitted }) => {
          const row = { ownerId: authorId, kind, state, everSubmitted };
          const visible = admits(readScope(a, 'futureItem'), row);
          expect(visible).toBe(
            can(a, { action: 'future.view', item: { authorId, kind, state, everSubmitted } }),
          );
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

describe('readScope for users follows users.view', () => {
  it('for every actor', () => {
    fc.assert(
      fc.property(anyActor, fc.constantFrom(...IDS), (a, ownerId) => {
        const sees = admits(readScope(a, 'user'), { ownerId });
        const expected =
          can(a, { action: 'users.view' }) ||
          (ownerId === a.id && can(a, { action: 'profile.manage' }));
        expect(sees).toBe(expected);
      }),
    );
  });
});

describe('readScope for points and future items', () => {
  const actor = (role: Role, extra: Partial<Actor> = {}): Actor => ({
    id: 'me',
    role,
    status: 'active',
    isStudent: false,
    ...extra,
  });
  const submitted: Scope = { kind: 'own-or-submitted', userId: 'me' };

  it.each<[string, Actor, Scope, Scope]>([
    ['pending', actor('pending'), { kind: 'none' }, { kind: 'none' }],
    [
      'submitter',
      actor('submitter'),
      { kind: 'own', userId: 'me' },
      { kind: 'own-or-approved-akce', userId: 'me' },
    ],
    ['reviewer', actor('reviewer'), submitted, submitted],
    ['headmaster', actor('headmaster'), submitted, submitted],
    [
      'student marked reviewer',
      actor('reviewer', { isStudent: true }),
      { kind: 'own', userId: 'me' },
      { kind: 'own-or-approved-akce', userId: 'me' },
    ],
    [
      'blocked reviewer',
      actor('reviewer', { status: 'blocked' }),
      { kind: 'none' },
      { kind: 'none' },
    ],
  ])('%s', (_name, a, points, futureItems) => {
    expect(readScope(a, 'point')).toEqual(points);
    expect(readScope(a, 'futureItem')).toEqual(futureItems);
  });
});

describe('admits', () => {
  it('shows reviewers their own rows and others’ once submitted and not in draft', () => {
    const scope: Scope = { kind: 'own-or-submitted', userId: 'me' };
    expect(admits(scope, { ownerId: 'me', state: 'draft', everSubmitted: false })).toBe(true);
    expect(admits(scope, { ownerId: 'x', state: 'submitted', everSubmitted: true })).toBe(true);
    expect(admits(scope, { ownerId: 'x', state: 'draft', everSubmitted: true })).toBe(false);
    expect(admits(scope, { ownerId: 'x', state: 'withdrawn', everSubmitted: false })).toBe(false);
    // A row that does not say it was submitted is not admitted.
    expect(admits(scope, { ownerId: 'x', state: 'approved' })).toBe(false);
    expect(admits(scope, { ownerId: 'x', everSubmitted: true })).toBe(false);
  });

  it('shows submitters their own future items and every approved akce', () => {
    const scope: Scope = { kind: 'own-or-approved-akce', userId: 'me' };
    expect(admits(scope, { ownerId: 'me', kind: 'jednani', state: 'draft' })).toBe(true);
    expect(admits(scope, { ownerId: 'x', kind: 'akce', state: 'approved' })).toBe(true);
    expect(admits(scope, { ownerId: 'x', kind: 'akce', state: 'submitted' })).toBe(false);
    expect(admits(scope, { ownerId: 'x', kind: 'jednani', state: 'approved' })).toBe(false);
  });
});
