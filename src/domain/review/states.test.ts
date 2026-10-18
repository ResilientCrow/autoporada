import { describe, expect, it } from 'vitest';

import { ROLES, type Role } from '@/domain/actor';

import {
  ACCESS_MACHINE,
  availableEvents,
  canEditPoint,
  FUTURE_MACHINE,
  ISSUE_MACHINE,
  POINT_MACHINE,
  REPORT_MACHINE,
  transition,
  type PointState,
  type ReviewActor,
} from './index';

const user = (role: Role, isAuthor = false): ReviewActor => ({ kind: 'user', role, isAuthor });
const SYSTEM: ReviewActor = { kind: 'system' };
const author = user('submitter', true);
const reviewer = user('reviewer');
const headmaster = user('headmaster');

describe('point lifecycle', () => {
  it.each([
    ['draft', 'submit', author, 'submitted'],
    ['returned', 'submit', author, 'submitted'],
    ['submitted', 'retract', author, 'draft'],
    ['submitted', 'withdraw', author, 'withdrawn'],
    ['submitted', 'approve', reviewer, 'approved'],
    ['submitted', 'approve', headmaster, 'approved'],
    ['approved', 'publish', SYSTEM, 'published'],
    ['published', 'unpublish', headmaster, 'approved'],
  ] as const)('%s --%s--> %s', (from, event, actor, to) => {
    expect(transition(POINT_MACHINE, from, event, actor)).toEqual({ ok: true, to });
  });

  it('requires a note to return or reject', () => {
    expect(transition(POINT_MACHINE, 'submitted', 'return', reviewer)).toEqual({
      ok: false,
      reason: 'note-required',
    });
    expect(transition(POINT_MACHINE, 'submitted', 'reject', reviewer, '   ')).toMatchObject({
      reason: 'note-required',
    });
    expect(transition(POINT_MACHINE, 'approved', 'return', reviewer, 'Doplňte vyjádření.')).toEqual(
      {
        ok: true,
        to: 'returned',
      },
    );
  });

  it('keeps reviewers from approving their own points, but not the headmaster', () => {
    expect(transition(POINT_MACHINE, 'submitted', 'approve', user('reviewer', true))).toMatchObject(
      {
        reason: 'not-allowed',
      },
    );
    expect(
      transition(POINT_MACHINE, 'submitted', 'approve', user('headmaster', true)),
    ).toMatchObject({
      ok: true,
    });
  });

  it('lets only the system publish', () => {
    for (const role of ROLES) {
      expect(transition(POINT_MACHINE, 'approved', 'publish', user(role, true)).ok).toBe(false);
    }
  });

  it('never lets someone else act as the author', () => {
    for (const event of ['submit', 'retract', 'withdraw'] as const) {
      expect(availableEvents(POINT_MACHINE, 'draft', reviewer)).not.toContain(event);
      expect(availableEvents(POINT_MACHINE, 'submitted', headmaster)).not.toContain(event);
    }
  });

  it('gives a pending user nothing to do, even on their own point', () => {
    const states: PointState[] = ['draft', 'submitted', 'returned', 'approved'];
    for (const state of states) {
      expect(availableEvents(POINT_MACHINE, state, user('pending', true))).toEqual([]);
    }
  });

  it('treats rejected and withdrawn as final', () => {
    for (const actor of [author, reviewer, headmaster, SYSTEM]) {
      expect(availableEvents(POINT_MACHINE, 'rejected', actor)).toEqual([]);
      expect(availableEvents(POINT_MACHINE, 'withdrawn', actor)).toEqual([]);
    }
  });

  it('rejects events from the wrong state', () => {
    expect(transition(POINT_MACHINE, 'draft', 'approve', reviewer)).toEqual({
      ok: false,
      reason: 'wrong-state',
    });
  });

  it.each([
    ['draft', author, true],
    ['returned', author, true],
    ['submitted', author, false],
    ['approved', author, false],
    ['submitted', reviewer, true],
    ['approved', headmaster, true],
    ['draft', reviewer, false],
    ['published', headmaster, false],
  ] as const)('editing a %s point: %o → %s', (state, actor, allowed) => {
    expect(canEditPoint(state, actor)).toBe(allowed);
  });
});

describe('future items', () => {
  it('sends an author’s change to an approved item back to review', () => {
    expect(transition(FUTURE_MACHINE, 'approved', 'revise', author)).toEqual({
      ok: true,
      to: 'submitted',
    });
    expect(transition(FUTURE_MACHINE, 'approved', 'revise', reviewer).ok).toBe(false);
  });

  it('lets the author or a reviewer cancel an approved item', () => {
    expect(transition(FUTURE_MACHINE, 'approved', 'cancel', author).ok).toBe(true);
    expect(transition(FUTURE_MACHINE, 'approved', 'cancel', reviewer).ok).toBe(true);
    expect(transition(FUTURE_MACHINE, 'approved', 'cancel', user('submitter')).ok).toBe(false);
  });

  it('prompts for a report, then records it as written or declined', () => {
    expect(transition(REPORT_MACHINE, 'none', 'prompt', SYSTEM)).toEqual({
      ok: true,
      to: 'prompted',
    });
    expect(transition(REPORT_MACHINE, 'prompted', 'prompt', SYSTEM)).toEqual({
      ok: true,
      to: 'prompted',
    });
    expect(transition(REPORT_MACHINE, 'prompted', 'write', author)).toEqual({
      ok: true,
      to: 'written',
    });
    expect(transition(REPORT_MACHINE, 'written', 'decline', author).ok).toBe(false);
  });
});

describe('issues', () => {
  it('lets only the headmaster generate, reopen, skip and unskip', () => {
    expect(availableEvents(ISSUE_MACHINE, 'open', headmaster)).toEqual(['generate', 'skip']);
    expect(availableEvents(ISSUE_MACHINE, 'generated', headmaster)).toEqual(['reopen']);
    expect(availableEvents(ISSUE_MACHINE, 'skipped', headmaster)).toEqual(['unskip']);
    expect(availableEvents(ISSUE_MACHINE, 'open', reviewer)).toEqual([]);
  });
});

describe('access requests', () => {
  const requester = user('pending', true);
  it('is decided by the headmaster and cancelled only by the requester', () => {
    expect(availableEvents(ACCESS_MACHINE, 'pending', headmaster)).toEqual([
      'approve',
      'reject',
      'block',
    ]);
    expect(availableEvents(ACCESS_MACHINE, 'pending', requester)).toEqual(['cancel']);
    expect(availableEvents(ACCESS_MACHINE, 'pending', reviewer)).toEqual([]);
    expect(transition(ACCESS_MACHINE, 'rejected', 'block', headmaster)).toEqual({
      ok: true,
      to: 'blocked',
    });
  });
});
