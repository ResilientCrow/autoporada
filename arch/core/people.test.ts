import { describe, expect, it } from 'vitest';
import { emptyRichDoc } from '@/domain/richtext';
import * as A from './ops';
import type { State, User } from './types';

const NOW = '2026-11-19T09:00:00.000Z';
const person = (id: string, extra: Partial<User> = {}): User => ({ id, salutation: 'pan', givenName: 'Jan', familyName: id, email: `${id}@ssps.cz`, role: 'submitter', isStudent: false, status: 'active', tier: null, ...extra });

/** The headmaster `boss`, signed in a moment ago (no step-up due), with `users` and one pending request of `new`. */
function state(users: User[] = []): State {
  return {
    v: 1, now: NOW, userId: 'boss', users: [person('boss', { role: 'headmaster' }), person('new', { role: 'pending' }), ...users], cards: [],
    points: [], futures: [], issues: [], placeholderChecks: {}, plannedThrough: '2026-11-16', registry: [],
    requests: [{ id: 'r1', name: 'Jan new', email: 'new@ssps.cz', reason: 'Učím.', at: NOW, state: 'pending', userId: 'new' }],
    settings: { dayOffset: -3, time: '12:00', remindSoft: true, remindHard: true, annex1Heading: '', annex1Intro: emptyRichDoc() },
    mails: [], stepUpAt: NOW, seq: 0, audit: [],
  };
}
const ctx = (s: State) => ({ s, vers: { r1: 1, u1: 4, boss: 2 }, real: (id: string) => id });
/** Applies `fx` and returns the state with the calls its tag asks of the server. */
function run(fx: ReturnType<typeof A.setUser>, s0: State) {
  const s = fx(s0);
  return { s, calls: fx.op ? A.toCalls(fx.op, ctx(s)) : [] };
}
const userIn = (s: State, id: string) => s.users.find((u) => u.id === id)!;

describe('decideRequest: an approval names the tier (ADR 0072)', () => {
  it('approves with the tier picked and shows the person placed', () => {
    const { s, calls } = run(A.decideRequest('r1', 'approved', 'absolvent'), state());
    expect(calls).toEqual([{ name: 'access.decide', input: { requestId: 'r1', version: 1, decision: 'approve', tier: 'absolvent' } }]);
    expect(userIn(s, 'new')).toMatchObject({ role: 'submitter', tier: 'absolvent', isStudent: true });
  });

  it('sends nothing and changes nothing without a tier', () => {
    const s0 = state();
    const { s, calls } = run(A.decideRequest('r1', 'approved'), s0);
    expect(calls).toEqual([]);
    expect(s).toBe(s0);
  });

  it('rejects and blocks without a tier', () => {
    expect(run(A.decideRequest('r1', 'rejected'), state()).calls).toEqual([{ name: 'access.decide', input: { requestId: 'r1', version: 1, decision: 'reject', confirmed: true } }]);
    expect(run(A.decideRequest('r1', 'blocked'), state()).calls).toEqual([{ name: 'access.decide', input: { requestId: 'r1', version: 1, decision: 'block', confirmed: true } }]);
  });
});

describe('setUser: the form sends the tier with the role and status', () => {
  it('sends the whole access with the new tier, from the version Arch knows', () => {
    const { s, calls } = run(A.setUser('u1', { tier: 'vedeni' }), state([person('u1', { role: 'reviewer', tier: 'ucitel' })]));
    expect(calls).toEqual([{ name: 'users.changeAccess', key: 'u1', input: { userId: 'u1', version: 4, role: 'reviewer', tier: 'vedeni', status: 'active', confirmed: true } }]);
    expect(userIn(s, 'u1')).toMatchObject({ tier: 'vedeni', isStudent: false });
  });

  it('sends a tier still unset as null', () => {
    expect(run(A.setUser('u1', { role: 'reviewer' }), state([person('u1')])).calls[0]?.input).toMatchObject({ role: 'reviewer', tier: null });
  });

  it('makes a reviewer turned student a submitter, as the server requires', () => {
    const { s, calls } = run(A.setUser('u1', { tier: 'student' }), state([person('u1', { role: 'reviewer', tier: 'ucitel' })]));
    expect(userIn(s, 'u1')).toMatchObject({ role: 'submitter', tier: 'student', isStudent: true });
    expect(calls[0]?.input).toMatchObject({ role: 'submitter', tier: 'student' });
  });

  it('lets the headmaster set their own staff tier, and nothing else on their row', () => {
    const own = run(A.setUser('boss', { tier: 'reditel' }), state());
    expect(userIn(own.s, 'boss')).toMatchObject({ role: 'headmaster', tier: 'reditel' });
    expect(own.calls[0]?.input).toMatchObject({ userId: 'boss', version: 2, role: 'headmaster', tier: 'reditel' });
    for (const patch of [{ tier: 'student' }, { tier: 'absolvent' }, { role: 'reviewer' }, { status: 'blocked' }] as const) {
      const s0 = state();
      expect(A.setUser('boss', patch)(s0)).toBe(s0);
    }
  });
});
