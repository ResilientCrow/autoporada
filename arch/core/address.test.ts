import { describe, expect, it } from 'vitest';
import { emptyRichDoc } from '@/domain/richtext';
import * as A from './ops';
import { me, mePerson, needsAddress } from './select';
import type { State, User } from './types';

const NOW = '2026-11-19T09:00:00.000Z';
const person = (id: string, extra: Partial<User> = {}): User => ({ id, salutation: 'pan', givenName: 'Jan', familyName: id, email: `${id}@ssps.cz`, role: 'submitter', isStudent: false, status: 'active', tier: null, ...extra });

function state(viewer: User): State {
  return {
    v: 1, now: NOW, userId: viewer.id, users: [viewer, person('kolega')], cards: [],
    points: [], futures: [], issues: [], placeholderChecks: {}, plannedThrough: '2026-11-16', registry: [], requests: [],
    settings: { dayOffset: -3, time: '12:00', remindSoft: true, remindHard: true, annex1Heading: '', annex1Intro: emptyRichDoc() },
    mails: [], stepUpAt: null, seq: 0, audit: [],
  };
}
const ctx = (s: State) => ({ s, vers: {}, real: (id: string) => id });

describe('needsAddress: the question Arch asks once (ADR 0072 item 6)', () => {
  it('asks whoever has no salutation yet', () => {
    expect(needsAddress(person('a', { salutation: null }))).toBe(true);
    expect(needsAddress(person('a', { salutation: null, tier: 'ucitel' }))).toBe(true);
    expect(needsAddress(person('a', { salutation: null, tier: 'student', isStudent: true }))).toBe(true);
  });

  it.each([
    ['no tier', null, 'pan'],
    ['no tier', null, 'pani'],
    ['an employee', 'zamestnanec', 'pani'],
    ['vedení', 'vedeni', 'pan'],
    ['a student', 'student', 'pan'],
    ['a student', 'student', 'slecna'],
    ['an absolvent', 'absolvent', 'slecna'],
  ] as const)('does not ask %s (tier %s) who answered „%s“', (_who, tier, salutation) => {
    expect(needsAddress(person('a', { tier, salutation }))).toBe(false);
  });

  it.each([
    ['no tier', null, 'slecna'],
    ['a teacher', 'ucitel', 'slecna'],
    ['a student', 'student', 'pani'],
    ['an absolvent', 'absolvent', 'pani'],
  ] as const)('asks again %s (tier %s) who answered „%s“', (_who, tier, salutation) => {
    expect(needsAddress(person('a', { tier, salutation }))).toBe(true);
  });

  it('asks again once the headmaster has made an employee a student', () => {
    const employee = person('a', { tier: 'ucitel', salutation: 'pani' });
    expect(needsAddress(employee)).toBe(false);
    expect(needsAddress({ ...employee, tier: 'student', isStudent: true })).toBe(true);
  });
});

describe('setAddress', () => {
  const ask = { salutation: 'pani', titlesBefore: 'Mgr.', titlesAfter: null } as const;

  it('puts the answer on the own row at once, and clears the question', () => {
    const viewer = person('me', { salutation: null, tier: 'ucitel' });
    const fx = A.setAddress(ask);
    const s = fx(state(viewer));
    expect(me(s)).toMatchObject({ salutation: 'pani', titlesBefore: 'Mgr.' });
    expect(me(s)).not.toHaveProperty('titlesAfter');
    expect(needsAddress(me(s)!)).toBe(false);
  });

  it('drops a degree that was cleared', () => {
    const viewer = person('me', { titlesBefore: 'Mgr.', titlesAfter: 'Ph.D.' });
    const s = A.setAddress({ salutation: 'pan', titlesBefore: '  ', titlesAfter: null })(state(viewer));
    expect(me(s)).not.toHaveProperty('titlesBefore');
    expect(me(s)).not.toHaveProperty('titlesAfter');
  });

  it('touches nobody else', () => {
    const s0 = state(person('me', { salutation: null }));
    const s = A.setAddress(ask)(s0);
    expect(s.users.find((u) => u.id === 'kolega')).toEqual(s0.users.find((u) => u.id === 'kolega'));
  });

  it('asks the server for users.setAddress with the typed values', () => {
    const s0 = state(person('me', { salutation: null }));
    const fx = A.setAddress({ salutation: 'pan', titlesBefore: ' Ing. ', titlesAfter: '' });
    const calls = A.toCalls(fx.op!, ctx(fx(s0)));
    expect(calls).toEqual([{ name: 'users.setAddress', input: { salutation: 'pan', titlesBefore: 'Ing.', titlesAfter: null } }]);
  });
});

describe('a person with no salutation yet', () => {
  it('is a draft person without one, for the author as for anyone', () => {
    const s = state(person('me', { salutation: null, givenName: 'Eva', familyName: 'Malá' }));
    expect(mePerson(s)).toEqual({ salutation: null, givenName: 'Eva', familyName: 'Malá' });
  });

  it('puts the author into the organisers of a report without one', () => {
    const s0 = state(person('me', { salutation: null, givenName: 'Eva', familyName: 'Malá' }));
    let id = '';
    const s = A.createPoint('report', null, (made) => { id = made; })(s0);
    const organisers = s.points.find((p) => p.id === id)!.content.bullets.find((b) => b.kind === 'people' && b.key === 'organisers');
    expect(organisers).toMatchObject({ people: [{ salutation: null, givenName: 'Eva', familyName: 'Malá' }] });
  });
});
