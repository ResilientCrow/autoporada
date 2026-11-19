import { describe, expect, it } from 'vitest';
import { emptyRichDoc } from '@/domain/richtext';
import * as A from './ops';
import type { State, User } from './types';

const NOW = '2026-11-19T09:00:00.000Z';
const person = (id: string, extra: Partial<User> = {}): User => ({ id, salutation: 'pan', givenName: 'Jan', familyName: id, email: `${id}@ssps.cz`, role: 'submitter', isStudent: false, status: 'active', tier: null, functions: [], ...extra });

/** The headmaster `boss`, signed in a moment ago unless `stepUpAt` says otherwise, with `users`. */
function state(users: User[] = [], stepUpAt = NOW): State {
  return {
    v: 1, now: NOW, userId: 'boss', users: [person('boss', { role: 'headmaster' }), ...users],
    points: [], futures: [], issues: [], placeholderChecks: {}, plannedThrough: '2026-11-16', registry: [], requests: [],
    settings: { dayOffset: -3, time: '12:00', remindSoft: true, remindHard: true, annex1Heading: '', annex1Intro: emptyRichDoc() },
    mails: [], stepUpAt, seq: 0, audit: [],
  };
}
const ctx = (s: State) => ({ s, vers: { u1: 4, boss: 2 }, real: (id: string) => id });
function run(fx: ReturnType<typeof A.setFunctions>, s0: State) {
  const s = fx(s0);
  return { s, calls: fx.op ? A.toCalls(fx.op, ctx(s)) : [] };
}
const userIn = (s: State, id: string) => s.users.find((u) => u.id === id)!;
const MAJETEK = { head: 'zastupce', complement: 'pro majetek' } as const;
const CLEN = { head: 'clen', complement: null } as const;

describe('setFunctions: the headmaster sets all of a person’s functions (ADR 0072 item 4)', () => {
  it('shows the list on the person and sends all of it from the version Arch knows, keyed by the user', () => {
    const { s, calls } = run(A.setFunctions('u1', [MAJETEK, CLEN]), state([person('u1')]));
    expect(userIn(s, 'u1').functions).toEqual([MAJETEK, CLEN]);
    expect(calls).toEqual([{ name: 'users.setFunctions', key: 'u1', input: { userId: 'u1', version: 4, functions: [MAJETEK, CLEN] } }]);
  });

  it('trims a complement and sends an empty one as none', () => {
    const { s, calls } = run(A.setFunctions('u1', [{ head: 'vedouci', complement: '  IT oddělení ' }, { head: 'clen', complement: '  ' }]), state([person('u1')]));
    expect(userIn(s, 'u1').functions).toEqual([{ head: 'vedouci', complement: 'IT oddělení' }, CLEN]);
    expect(calls[0]?.input).toMatchObject({ functions: [{ head: 'vedouci', complement: 'IT oddělení' }, CLEN] });
  });

  it('sends an empty list to remove them all', () => {
    const { s, calls } = run(A.setFunctions('u1', []), state([person('u1', { functions: [CLEN] })]));
    expect(userIn(s, 'u1').functions).toEqual([]);
    expect(calls[0]?.input).toMatchObject({ functions: [] });
  });

  it('allows the headmaster’s own row, and a student', () => {
    expect(userIn(run(A.setFunctions('boss', [MAJETEK]), state()).s, 'boss').functions).toEqual([MAJETEK]);
    const student = state([person('u1', { tier: 'student', isStudent: true })]);
    expect(userIn(run(A.setFunctions('u1', [CLEN]), student).s, 'u1').functions).toEqual([CLEN]);
  });

  it('changes nothing locally before the sign-in is fresh (the server answers step-up-required)', () => {
    const s0 = state([person('u1')], '2026-11-19T08:00:00.000Z');
    expect(A.setFunctions('u1', [CLEN])(s0)).toBe(s0);
  });

  it('sends nothing for a person Arch does not know', () => {
    expect(run(A.setFunctions('nikdo', [CLEN]), state()).calls).toEqual([]);
  });
});
