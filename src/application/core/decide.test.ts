import { describe, expect, it } from 'vitest';

import type { UserPrincipal } from '@/application/ports';
import { ROLES, type Role } from '@/domain/actor';
import { STEP_UP_ACTIONS, STEP_UP_MAX_AGE_MS } from '@/domain/policy';

import { decide } from './decide';
import { fromTransition } from './failure';

const now = new Date('2026-10-19T10:00:00Z');
const principal = (role: Role, signedInMsAgo = 0): UserPrincipal => ({
  kind: 'user',
  actor: { id: 'u1', role, status: 'active', isStudent: false },
  sessionId: 's1',
  authTime: new Date(now.getTime() - signedInMsAgo),
});

describe('decide', () => {
  it('lets through what the policy allows', () => {
    expect(decide({ action: 'review.queue' }, principal('reviewer'), now)).toBeNull();
  });

  it('refuses what the policy refuses, before thinking about step-up', () => {
    const stale = principal('reviewer', STEP_UP_MAX_AGE_MS + 1);
    expect(decide({ action: 'users.manage' }, stale, now)).toBe('forbidden');
  });

  it('asks a headmaster with an old sign-in to sign in again for step-up actions', () => {
    expect(decide({ action: 'users.manage' }, principal('headmaster', 60_000), now)).toBeNull();
    const stale = principal('headmaster', STEP_UP_MAX_AGE_MS + 1);
    expect(decide({ action: 'users.manage' }, stale, now)).toBe('step-up-required');
    expect(decide({ action: 'issue.edit' }, stale, now)).toBeNull();
  });
});

describe.each(STEP_UP_ACTIONS)('decide %s', (action) => {
  const stale = STEP_UP_MAX_AGE_MS + 1;

  it('asks a stale headmaster to sign in again and lets a fresh one through', () => {
    expect(decide({ action }, principal('headmaster', stale), now)).toBe('step-up-required');
    expect(decide({ action }, principal('headmaster', 0), now)).toBeNull();
  });

  it.each(ROLES.filter((role) => role !== 'headmaster'))(
    'refuses a stale %s as forbidden',
    (role) => {
      expect(decide({ action }, principal(role, stale), now)).toBe('forbidden');
    },
  );

  it('refuses a student marked headmaster as forbidden', () => {
    const student = {
      ...principal('headmaster', stale),
      actor: { ...principal('headmaster').actor, isStudent: true },
    };
    expect(decide({ action }, student, now)).toBe('forbidden');
  });
});

describe('fromTransition', () => {
  it.each([
    ['wrong-state', { code: 'conflict' }],
    ['not-allowed', { code: 'forbidden' }],
    ['note-required', { code: 'invalid-input', fields: { reviewNote: 'required' } }],
  ] as const)('maps %s', (reason, error) => {
    expect(fromTransition({ ok: false, reason }, 'reviewNote')).toEqual({ ok: false, error });
  });
});
