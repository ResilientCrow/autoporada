import { describe, expect, it } from 'vitest';

import { ROLES, type Actor, type Role } from '@/domain/actor';

import { can, requiresStepUp, type Action, type Check } from './index';

const actor = (role: Role, extra: Partial<Actor> = {}): Actor => ({
  id: `u-${role}`,
  role,
  status: 'active',
  isStudent: false,
  ...extra,
});

/** Actions that take no resource. */
type Simple = Exclude<
  Action,
  | 'point.view'
  | 'point.edit'
  | 'point.transition'
  | 'future.view'
  | 'future.edit'
  | 'future.transition'
>;

/** Who may do each resource-free action: the expected permission matrix. */
const MATRIX: Readonly<Record<Simple, readonly Role[]>> = {
  'access.request': ['pending'],
  'profile.manage': ['pending', 'submitter', 'reviewer', 'headmaster'],
  'directory.search': ['submitter', 'reviewer', 'headmaster'],
  'point.create': ['submitter', 'reviewer', 'headmaster'],
  'future.create': ['submitter', 'reviewer', 'headmaster'],
  'review.queue': ['reviewer', 'headmaster'],
  'issue.preview': ['reviewer', 'headmaster'],
  'archive.view': ['reviewer', 'headmaster'],
  'registry.view': ['reviewer', 'headmaster'],
  'issue.edit': ['headmaster'],
  'issue.generate': ['headmaster'],
  'registry.edit': ['headmaster'],
  'registry.newSchoolYear': ['headmaster'],
  'pointTypes.manage': ['headmaster'],
  'settings.manage': ['headmaster'],
  'users.manage': ['headmaster'],
  'access.decide': ['headmaster'],
};

describe('permission matrix', () => {
  const rows = Object.entries(MATRIX).flatMap(([action, allowed]) =>
    ROLES.map((role) => [action as Simple, role, allowed.includes(role)] as const),
  );

  it.each(rows)('%s as %s → %s', (action, role, allowed) => {
    expect(can(actor(role), { action } as Check)).toBe(allowed);
  });

  it.each(['blocked', 'deactivated'] as const)('denies everything to %s accounts', (status) => {
    for (const action of Object.keys(MATRIX) as Simple[]) {
      expect(can(actor('headmaster', { status }), { action } as Check)).toBe(false);
    }
  });

  it('never shows the registry or archive to a student, whatever the role says', () => {
    const student = actor('reviewer', { isStudent: true });
    expect(can(student, { action: 'registry.view' })).toBe(false);
    expect(can(student, { action: 'archive.view' })).toBe(false);
    expect(can(actor('headmaster', { isStudent: true }), { action: 'users.manage' })).toBe(false);
  });

  it.each(ROLES)('refuses an action it does not know, as %s', (role) => {
    expect(can(actor(role), { action: 'bogus' } as unknown as Check)).toBe(false);
  });

  it('treats a student as a submitter even if the stored role is higher', () => {
    for (const role of ['reviewer', 'headmaster'] as const) {
      const student = actor(role, { isStudent: true });
      expect(can(student, { action: 'issue.preview' })).toBe(false);
      expect(can(student, { action: 'review.queue' })).toBe(false);
      expect(can(student, { action: 'point.view', point: { authorId: 'other' } })).toBe(false);
      expect(
        can(student, {
          action: 'point.transition',
          point: { authorId: 'other', state: 'submitted' },
          event: 'approve',
        }),
      ).toBe(false);
      expect(can(student, { action: 'point.create' })).toBe(true);
    }
  });

  it('asks for a fresh sign-in only for user management and the new school year', () => {
    const stepUp = (Object.keys(MATRIX) as Simple[]).filter(requiresStepUp);
    expect(stepUp.sort()).toEqual(['registry.newSchoolYear', 'users.manage']);
  });
});

describe('points', () => {
  const submitter = actor('submitter');
  const mine = { authorId: submitter.id };
  const theirs = { authorId: 'someone-else' };

  it('shows submitters their own points only; reviewers see all', () => {
    expect(can(submitter, { action: 'point.view', point: mine })).toBe(true);
    expect(can(submitter, { action: 'point.view', point: theirs })).toBe(false);
    expect(can(actor('reviewer'), { action: 'point.view', point: theirs })).toBe(true);
  });

  it('follows the lifecycle for edits and transitions (IDOR-safe)', () => {
    expect(can(submitter, { action: 'point.edit', point: { ...mine, state: 'draft' } })).toBe(true);
    expect(can(submitter, { action: 'point.edit', point: { ...theirs, state: 'draft' } })).toBe(
      false,
    );
    expect(
      can(submitter, {
        action: 'point.transition',
        point: { ...mine, state: 'draft' },
        event: 'submit',
      }),
    ).toBe(true);
    expect(
      can(submitter, {
        action: 'point.transition',
        point: { ...theirs, state: 'draft' },
        event: 'submit',
      }),
    ).toBe(false);
    expect(
      can(submitter, {
        action: 'point.transition',
        point: { ...mine, state: 'submitted' },
        event: 'approve',
      }),
    ).toBe(false);
  });

  it('lets a reviewer approve others’ points but not their own', () => {
    const reviewer = actor('reviewer');
    const point = (authorId: string) => ({ authorId, state: 'submitted' as const });
    expect(can(reviewer, { action: 'point.transition', point: point('x'), event: 'approve' })).toBe(
      true,
    );
    expect(
      can(reviewer, { action: 'point.transition', point: point(reviewer.id), event: 'approve' }),
    ).toBe(false);
  });
});

describe('future items', () => {
  const submitter = actor('submitter');
  const item = (authorId: string, kind: 'akce' | 'jednani', state: 'approved' | 'submitted') => ({
    authorId,
    kind,
    state,
  });

  it('shows submitters their own items and approved akce of others, never others’ jednání', () => {
    expect(can(submitter, { action: 'future.view', item: item('x', 'akce', 'approved') })).toBe(
      true,
    );
    expect(can(submitter, { action: 'future.view', item: item('x', 'akce', 'submitted') })).toBe(
      false,
    );
    expect(can(submitter, { action: 'future.view', item: item('x', 'jednani', 'approved') })).toBe(
      false,
    );
    expect(
      can(submitter, { action: 'future.view', item: item(submitter.id, 'jednani', 'submitted') }),
    ).toBe(true);
  });

  it('applies the lifecycle to future-item transitions', () => {
    const reviewer = actor('reviewer');
    const headmaster = actor('headmaster');
    const submitted = (authorId: string) => ({
      authorId,
      kind: 'akce' as const,
      state: 'submitted' as const,
    });
    const approved = (authorId: string) => ({
      authorId,
      kind: 'akce' as const,
      state: 'approved' as const,
    });
    expect(
      can(reviewer, {
        action: 'future.transition',
        item: submitted(reviewer.id),
        event: 'approve',
      }),
    ).toBe(false);
    expect(
      can(reviewer, { action: 'future.transition', item: submitted('x'), event: 'approve' }),
    ).toBe(true);
    expect(
      can(headmaster, {
        action: 'future.transition',
        item: submitted(headmaster.id),
        event: 'approve',
      }),
    ).toBe(true);
    for (const event of ['revise', 'cancel'] as const) {
      expect(can(submitter, { action: 'future.transition', item: approved('x'), event })).toBe(
        false,
      );
    }
    expect(
      can(submitter, { action: 'future.transition', item: submitted('x'), event: 'withdraw' }),
    ).toBe(false);
  });

  it('lets authors and reviewers edit at the right moments', () => {
    expect(
      can(submitter, { action: 'future.edit', item: item(submitter.id, 'akce', 'approved') }),
    ).toBe(true);
    expect(can(submitter, { action: 'future.edit', item: item('x', 'akce', 'approved') })).toBe(
      false,
    );
    expect(
      can(actor('reviewer'), { action: 'future.edit', item: item('x', 'akce', 'submitted') }),
    ).toBe(true);
  });
});
