import { describe, expect, it } from 'vitest';
import { deadline } from '@/domain/calendar';
import { emptyRichDoc } from '@/domain/richtext';
import { calDate } from '@/domain/time';
import { addable, futureSnap, me, mePerson, genitiveFor, participantsProblem, personFromCard, poradaDates, rowForPoint, systemText, unaddressed, withoutFunction, type OutlineItem } from './select';
import type { Card, Future, Row, State, User } from './types';

const row = (id: string, p: Partial<Row> = {}): Row => ({ id, section: 'pokyny', slot: null, persistence: 'standing', title: id, body: emptyRichDoc(), quotes: [], pointId: null, ...p });
const at = (refId: string, n: number): OutlineItem => ({ key: `n${n}`, n, title: refId, kind: 'item', group: 'Pokyny', refId });

describe('addable: what the headmaster can type into, apart from what fills itself', () => {
  const rows = [row('meet', { slot: 'meetings' }), row('ev', { slot: 'events' }), row('tal', { slot: 'talent' }), row('ex', { slot: 'exemptions' }), row('prov'), row('prop', { pointId: 'p1' }), row('media', { slot: 'media' }), row('part', { slot: 'partners' }), row('fin', { section: 'hospodareni' })];
  const outline = [at('meet', 1), at('ev', 2), at('tal', 3), at('ex', 4), at('prov', 5), at('prop', 6), at('media', 7), at('part', 8)];

  it('leaves out the rows the document fills and the approved proposals', () => {
    expect(addable(rows, outline).points.map((x) => x.row.id)).toEqual(['prov', 'media', 'fin']);
  });
  it('keeps the partners row apart, with its number', () => {
    expect(addable(rows, outline).partners).toEqual({ row: rows[7], n: 8 });
  });
  it('numbers each row as the document does, and leaves an unprinted row without a number', () => {
    expect(addable(rows, outline).points.map((x) => x.n)).toEqual([5, 7, undefined]);
  });
  it('gives the number of the jednání point', () => {
    expect(addable(rows, outline).meetings).toBe(1);
  });
  it('has no partners row and no jednání number when the porada has none', () => {
    const none = addable([row('prov')], []);
    expect(none.partners).toBeNull();
    expect(none.meetings).toBeUndefined();
  });
  it('lists Pokyny before Hospodaření, also for a row added at the end of the porada', () => {
    const late = [row('fin', { section: 'hospodareni' }), row('a'), row('b')];
    expect(addable(late, []).points.map((x) => x.row.id)).toEqual(['a', 'b', 'fin']);
  });
});

describe('rowForPoint: which porada row a printed point stands for', () => {
  const titleOf = (r: Row) => (r.pointId ? 'Schválený návrh' : r.title);
  it('never takes a row with an empty title, such as a placed proposal', () => {
    const rows = [row('place', { title: '', pointId: 'p1' }), row('prov', { title: 'Provoz' })];
    expect(rowForPoint('Provoz', rows, (r) => r.title)?.id).toBe('prov');
  });
  it('matches a placed proposal by the title it prints', () => {
    const rows = [row('place', { title: '', pointId: 'p1' }), row('prov', { title: 'Provoz' })];
    expect(rowForPoint('Schválený návrh', rows, titleOf)?.id).toBe('place');
  });
  it('prefers the longest title that the point starts with', () => {
    const rows = [row('short', { title: 'Provoz' }), row('long', { title: 'Provoz budovy' })];
    expect(rowForPoint('Provoz budovy', rows, titleOf)?.id).toBe('long');
    expect(rowForPoint('Provoz školy', rows, titleOf)?.id).toBe('short');
  });
  it('finds no row for a point no row prints', () => {
    expect(rowForPoint('Něco jiného', [row('prov', { title: 'Provoz' })], titleOf)).toBeUndefined();
  });
});

// A porada moved from its Monday to Wednesday 18 November 2026; the default rule closes it two days before, at 20.00.
const meetingDate = calDate(2026, 11, 18);
const slot = { meetingDate, deadlineAt: deadline(meetingDate) };
const saturday = new Date('2026-11-14T13:30:00Z');

describe('poradaDates: the day a porada meets and its uzávěrka, apart', () => {
  it('names the porada by the day it meets, not by its uzávěrka', () => {
    expect(poradaDates(slot, saturday).meets).toBe('ve středu 18. 11.');
  });

  it('names the uzávěrka by its own day and Prague time', () => {
    expect(poradaDates(slot, saturday).close).toBe('v pondělí 16. 11. v 20:00');
  });

  it('says whether the uzávěrka has passed', () => {
    expect(poradaDates(slot, saturday).closed).toBe(false);
    expect(poradaDates(slot, slot.deadlineAt).closed).toBe(true);
  });

  it('prints a close at midnight as the last minute of the day before', () => {
    const midnight = { meetingDate, deadlineAt: new Date('2026-11-15T23:00:00Z') };
    expect(poradaDates(midnight, saturday).close).toBe('v neděli 15. 11. v 23:59');
  });
});

const akce = (p: Partial<Future> = {}): Future => ({ id: 'f1', kind: 'akce', authorId: 'u1', title: 'Seminář', date: calDate(2026, 10, 22), endDate: null, timeFrom: null, timeTo: null, campus: null, place: '', organizer: '', organizerRole: null, participants: '', participantsAddress: null, remark: '', state: 'draft', changed: false, wasApproved: false, cancelRequested: false, cancelRequestedAt: null, cancelRefusal: null, note: null, parts: null, report: 'none', submittedAt: null, savedAt: '', trail: [], ...p });

describe('participantsProblem: what stops an akce over its participants (ADR 0071)', () => {
  it('asks for an address once participants are typed', () => {
    expect(participantsProblem(akce({ participants: 'Eva Malá (3.B)' }))).toBe('Vyberte oslovení účastníků.');
  });
  it('asks for nothing when nobody is named, or an address is chosen', () => {
    expect(participantsProblem(akce())).toBeNull();
    expect(participantsProblem(akce({ participants: '  ' }))).toBeNull();
    expect(participantsProblem(akce({ participants: 'Eva Malá (3.B)', participantsAddress: 'slecny' }))).toBeNull();
    expect(participantsProblem(akce({ participants: 'vedení', participantsAddress: 'bez-osloveni' }))).toBeNull();
  });
  it('needs several names for „slečny a pánové“', () => {
    const one = akce({ participants: 'Eva Malá (3.B)', participantsAddress: 'slecny-a-panove' });
    expect(participantsProblem(one)).toBe('Slečny a pánové potřebují aspoň dvě jména oddělená čárkou.');
    expect(participantsProblem({ ...one, participants: 'Eva Malá (3.B), Jan Novák (2.A)' })).toBeNull();
  });
  it('asks nothing of a jednání', () => {
    expect(participantsProblem(akce({ kind: 'jednani', participants: 'vedení školy' }))).toBeNull();
  });
});

describe('the address in what the preview prints (ADR 0071)', () => {
  const typed = akce({ participants: 'Eva Malá (3.B), Jan Novák (2.A)', participantsAddress: 'slecny-a-panove' });
  it('goes into the agenda line snapshot, and not for a jednání', () => {
    expect(futureSnap(typed)).toMatchObject({ participants: 'Eva Malá (3.B), Jan Novák (2.A)', participantsAddress: 'slecny-a-panove' });
    expect(futureSnap({ ...typed, kind: 'jednani' })).not.toHaveProperty('participantsAddress');
    expect(futureSnap({ ...typed, participants: '' })).not.toHaveProperty('participantsAddress');
    expect(futureSnap({ ...typed, participantsAddress: null })).not.toHaveProperty('participantsAddress');
  });
  it('goes into the paragraph of a missing report', () => {
    expect(systemText(typed)).toContain('Za Smíchovskou střední se zúčastnili slečny a pánové: Eva Malá (3.B), Jan Novák (2.A).');
    expect(systemText({ ...typed, participantsAddress: null })).toContain('Za Smíchovskou střední se zúčastnili: Eva Malá');
  });
});

const CARD: Card = { id: 'k', salutation: 'pani', givenName: 'Jana', familyName: 'Nováková', titlesBefore: 'Mgr.', titlesAfter: 'Ph.D.', head: 'zastupce', complement: 'pro majetek' };

describe('personFromCard: a user copied into a people row (ADR 0072 item 7)', () => {
  it('copies the name, salutation, degrees, head and complement, and nothing that links back', () => {
    expect(personFromCard(CARD)).toEqual({ salutation: 'pani', givenName: 'Jana', familyName: 'Nováková', titlesBefore: 'Mgr.', titlesAfter: 'Ph.D.', head: 'zastupce', complement: 'pro majetek' });
  });
  it('keeps a missing salutation null: nothing is guessed', () => {
    expect(personFromCard({ id: 'k', salutation: null, givenName: 'Jana', familyName: 'Nováková' })).toEqual({ salutation: null, givenName: 'Jana', familyName: 'Nováková' });
  });
  it('leaves out what the card does not have', () => {
    const p = personFromCard({ id: 'k', salutation: 'pan', givenName: 'Jan', familyName: 'Novák' });
    expect(Object.keys(p).sort()).toEqual(['familyName', 'givenName', 'salutation']);
  });
  it('adds the class or job for the school year when given both', () => {
    expect(personFromCard(CARD, '2026/2027', '3.B')).toMatchObject({ affiliation: '3.B', affiliationYear: '2026/2027' });
    expect(personFromCard(CARD, '2026/2027')).not.toHaveProperty('affiliation');
  });
});

describe('unaddressed and withoutFunction: what a row may keep', () => {
  it('takes the salutation, head and complement off a person of the addressed row', () => {
    const p = unaddressed({ ...personFromCard(CARD), affiliation: '3.B', affiliationYear: '2026/2027' });
    expect(p).toEqual({ salutation: null, givenName: 'Jana', familyName: 'Nováková', titlesBefore: 'Mgr.', titlesAfter: 'Ph.D.', affiliation: '3.B', affiliationYear: '2026/2027' });
  });
  it('drops only the head and complement, keeping the salutation', () => {
    expect(withoutFunction(personFromCard(CARD))).toEqual({ salutation: 'pani', givenName: 'Jana', familyName: 'Nováková', titlesBefore: 'Mgr.', titlesAfter: 'Ph.D.' });
  });
});

const USER: User = { id: 'me', salutation: 'pani', givenName: 'Eva', familyName: 'Malá', titlesBefore: 'Ing.', email: 'me@ssps.cz', role: 'submitter', isStudent: false, status: 'active', affiliation: 'Matematika' };
const stateOf = (cards: Card[]): State => ({ v: 1, now: '2026-11-19T09:00:00.000Z', userId: 'me', users: [USER], cards, points: [], futures: [], issues: [], placeholderChecks: {}, plannedThrough: '2026-11-16', registry: [], requests: [], settings: { dayOffset: -3, time: '12:00', remindSoft: true, remindHard: true, annex1Heading: '', annex1Intro: emptyRichDoc() }, mails: [], stepUpAt: null, seq: 0, audit: [] });

describe('mePerson: the author as a person of a report', () => {
  it('copies the viewer’s own card, with its head and the job of the school year', () => {
    const s = stateOf([{ id: 'me', salutation: 'pani', givenName: 'Eva', familyName: 'Malá', titlesBefore: 'Ing.', head: 'profesor' }]);
    expect(me(s)).toBe(USER);
    expect(mePerson(s)).toEqual({ salutation: 'pani', givenName: 'Eva', familyName: 'Malá', titlesBefore: 'Ing.', head: 'profesor', affiliation: 'Matematika', affiliationYear: '2026/2027' });
  });
  it('reads the user row when no card came, without a head', () => {
    expect(mePerson(stateOf([]))).toEqual({ salutation: 'pani', givenName: 'Eva', familyName: 'Malá', titlesBefore: 'Ing.', affiliation: 'Matematika', affiliationYear: '2026/2027' });
  });
});

describe('genitiveFor: a statement speaker’s „vyjádření koho“', () => {
  it('is none until the person has a salutation', () => {
    expect(genitiveFor({ salutation: null, givenName: 'Jana', familyName: 'Nováková' })).toBeNull();
  });
  it('declines the name and keeps the degrees', () => {
    expect(genitiveFor({ salutation: 'pan', givenName: 'Jan', familyName: 'Novák', titlesBefore: 'Mgr.' })?.text).toBe('pana Mgr. Jana Nováka');
  });
  it('passes the head and complement of a copied person to the sentence', () => {
    expect(genitiveFor(personFromCard(CARD))?.text).toBe('paní zástupkyně pro majetek Mgr. Jany Novákové, Ph.D.');
  });
});
