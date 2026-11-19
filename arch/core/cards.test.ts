import { describe, expect, it } from 'vitest';
import { emptyRichDoc } from '@/domain/richtext';
import * as A from './ops';
import type { Card, State, User } from './types';

const NOW = '2026-11-19T09:00:00.000Z';
const ME: User = { id: 'me', salutation: 'pani', givenName: 'Jana', familyName: 'Nováková', titlesBefore: 'Mgr.', email: 'me@ssps.cz', role: 'reviewer', isStudent: false, status: 'active', affiliation: 'Matematika', tier: 'vedeni' };
const state = (cards: Card[]): State => ({
  v: 1, now: NOW, userId: 'me', users: [ME], cards, points: [], futures: [], issues: [], placeholderChecks: {}, plannedThrough: '2026-11-16', registry: [], requests: [],
  settings: { dayOffset: -3, time: '12:00', remindSoft: true, remindHard: true, annex1Heading: '', annex1Intro: emptyRichDoc() },
  mails: [], stepUpAt: null, seq: 0, audit: [],
});
const organisersOf = (s: State) => { const b = s.points[0]!.content.bullets.find((x) => x.kind === 'people' && x.key === 'organisers'); return b?.kind === 'people' ? b.people : []; };

describe('createPoint: the author among the organisers (ADR 0072 item 7)', () => {
  it('copies the author’s card, with its head and degrees, and the job of the school year', () => {
    const card: Card = { id: 'me', salutation: 'pani', givenName: 'Jana', familyName: 'Nováková', titlesBefore: 'Mgr.', head: 'zastupce', complement: 'pro majetek' };
    const s = A.createPoint('report', null)(state([card]));
    expect(organisersOf(s)).toMatchObject([{ salutation: 'pani', givenName: 'Jana', familyName: 'Nováková', titlesBefore: 'Mgr.', head: 'zastupce', complement: 'pro majetek', affiliation: 'Matematika', affiliationYear: '2026/2027' }]);
  });

  it('writes no head when the card has none, and keeps the author’s degrees', () => {
    const s = A.createPoint('report', null)(state([{ id: 'me', salutation: 'pani', givenName: 'Jana', familyName: 'Nováková', titlesBefore: 'Mgr.' }]));
    const [author] = organisersOf(s);
    expect(author).not.toHaveProperty('head');
    expect(author).toMatchObject({ titlesBefore: 'Mgr.' });
  });

  it('copies, never links: a later change of the card leaves the written person alone', () => {
    const card: Card = { id: 'me', salutation: 'pani', givenName: 'Jana', familyName: 'Nováková', head: 'profesor' };
    const s = A.createPoint('report', null)(state([card]));
    const later = { ...s, cards: [{ ...card, head: 'zastupce' as const }] };
    expect(organisersOf(later)[0]!.head).toBe('profesor');
  });
});
