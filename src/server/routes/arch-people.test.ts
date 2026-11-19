import { describe, expect, it } from 'vitest';

import type { Tier, UserFunction } from '@/domain/actor';
import type { Salutation } from '@/domain/cs';

import { cardsFor, peopleFor } from './arch-people';

const row = (
  id: string,
  tier: Tier | null,
  role = 'submitter',
  address: {
    salutation?: Salutation;
    titlesBefore?: string;
    titlesAfter?: string;
  } = {},
) => ({
  id,
  version: 3,
  displayName: `Jana ${id}`,
  email: `${id}@ssps.cz`,
  role,
  status: 'active',
  tier,
  salutation: address.salutation ?? null,
  titlesBefore: address.titlesBefore ?? null,
  titlesAfter: address.titlesAfter ?? null,
  jobTitle: null,
  department: null,
});
const ROWS = [row('me', 'ucitel'), row('kolega', 'absolvent'), row('nikdo', null)];
const people = (head: boolean) =>
  peopleFor({
    rows: ROWS,
    actorId: 'me',
    head,
    staff: true,
    named: new Set(ROWS.map((r) => r.id)),
    functions: new Map(),
    vers: {},
  });
const byId = (list: ReturnType<typeof people>, id: string) => list.find((p) => p.id === id);

describe('peopleFor: the tier (ADR 0072)', () => {
  it('gives the headmaster everyone’s tier, null while unset', () => {
    const list = people(true);
    expect(byId(list, 'me')).toMatchObject({ tier: 'ucitel', isStudent: false });
    expect(byId(list, 'kolega')).toMatchObject({ tier: 'absolvent', isStudent: true });
    expect(byId(list, 'nikdo')).toMatchObject({ tier: null });
  });

  it('gives anyone else their own tier only', () => {
    const list = people(false);
    expect(byId(list, 'me')).toMatchObject({ tier: 'ucitel' });
    expect(byId(list, 'kolega')).not.toHaveProperty('tier');
    expect(byId(list, 'kolega')).toMatchObject({ isStudent: false });
  });
});

describe('peopleFor: the salutation and the degrees (ADR 0072 item 6)', () => {
  const addressed = [
    row('me', 'ucitel', 'submitter', {
      salutation: 'pani',
      titlesBefore: 'Mgr.',
      titlesAfter: 'Ph.D.',
    }),
    // The name reads as a woman's, and the person said „pan“: their answer stands.
    row('kolega', 'zamestnanec', 'submitter', { salutation: 'pan' }),
    row('eva', 'student', 'submitter', { salutation: 'slecna' }),
    // Named „Jana“, which reads as a woman's: nothing is guessed from it.
    row('nikdo', null),
  ];
  const list = (head: boolean, actorId = 'me') =>
    peopleFor({
      rows: addressed,
      actorId,
      head,
      staff: true,
      named: new Set(addressed.map((r) => r.id)),
      functions: new Map(),
      vers: {},
    });

  it('gives every row the person’s own answer, whoever looks', () => {
    for (const head of [true, false]) {
      const people = list(head);
      expect(byId(people, 'me')).toMatchObject({
        salutation: 'pani',
        titlesBefore: 'Mgr.',
        titlesAfter: 'Ph.D.',
      });
      expect(byId(people, 'kolega')).toMatchObject({ salutation: 'pan' });
      expect(byId(people, 'eva')).toMatchObject({ salutation: 'slecna' });
    }
  });

  it('guesses nothing: a user without a salutation comes without one', () => {
    const nikdo = byId(list(true), 'nikdo');
    expect(nikdo).toMatchObject({ salutation: null });
    expect(nikdo).not.toHaveProperty('titlesBefore');
    expect(nikdo).not.toHaveProperty('titlesAfter');
  });

  it('leaves out an absent degree instead of sending null', () => {
    const kolega = byId(list(true), 'kolega');
    expect(kolega).not.toHaveProperty('titlesBefore');
    expect(kolega).not.toHaveProperty('titlesAfter');
  });
});

describe('peopleFor: the functions (ADR 0072 item 4)', () => {
  const MAJETEK = { head: 'zastupce', complement: 'pro majetek' } as const;
  const IT = { head: 'vedouci', complement: 'IT oddělení' } as const;
  const held = new Map([
    ['me', [MAJETEK, IT]],
    ['kolega', [IT]],
  ]);
  const list = (head: boolean) =>
    peopleFor({
      rows: ROWS,
      actorId: 'me',
      head,
      staff: true,
      named: new Set(ROWS.map((r) => r.id)),
      functions: held,
      vers: {},
    });

  it('gives the headmaster everyone’s functions in order, an empty list for none', () => {
    const people = list(true);
    expect(byId(people, 'me')).toMatchObject({ functions: [MAJETEK, IT] });
    expect(byId(people, 'kolega')).toMatchObject({ functions: [IT] });
    expect(byId(people, 'nikdo')).toMatchObject({ functions: [] });
  });

  it('gives anyone else their own functions and nobody else’s', () => {
    const people = list(false);
    expect(byId(people, 'me')).toMatchObject({ functions: [MAJETEK, IT] });
    expect(byId(people, 'kolega')).not.toHaveProperty('functions');
    expect(byId(people, 'nikdo')).not.toHaveProperty('functions');
  });
});

describe('cardsFor: what a person writing a point may copy of a colleague (ADR 0072 item 7)', () => {
  const ZASTUPCE: UserFunction = { head: 'zastupce', complement: 'pro majetek' };
  const withStatus = (r: ReturnType<typeof row>, status: string, role = r.role) => ({
    ...r,
    status,
    role,
  });
  const ROWS = [
    row('me', 'ucitel', 'submitter', { salutation: 'pani', titlesBefore: 'Mgr.' }),
    row('reditel', 'reditel', 'headmaster', { salutation: 'pan', titlesAfter: 'Ph.D.' }),
    row('zastupkyne', 'vedeni', 'reviewer', { salutation: 'pani' }),
    row('eva', 'student', 'submitter', { salutation: 'slecna' }),
    row('bez-osloveni', 'zamestnanec'),
    withStatus(row('cekajici', 'ucitel', 'pending', { salutation: 'pan' }), 'active'),
    withStatus(row('zablokovany', 'ucitel', 'submitter', { salutation: 'pan' }), 'blocked'),
    withStatus(row('odesel', 'ucitel', 'submitter', { salutation: 'pan' }), 'deactivated'),
  ];
  const FUNCTIONS = new Map([['zastupkyne', [ZASTUPCE]]]);
  const CARD_KEYS = new Set([
    'id',
    'salutation',
    'givenName',
    'familyName',
    'titlesBefore',
    'titlesAfter',
    'head',
    'complement',
  ]);
  const cards = (viewer: 'staff' | 'student' | 'none', actorId = 'me') =>
    cardsFor({ rows: ROWS, actorId, viewer, functions: FUNCTIONS });
  const ids = (list: ReturnType<typeof cards>) => list.map((c) => c.id).sort();

  it('gives staff who write points a card for every active colleague', () => {
    expect(ids(cards('staff'))).toEqual(['bez-osloveni', 'eva', 'me', 'reditel', 'zastupkyne']);
  });

  it('leaves out a pending, a blocked and a deactivated user', () => {
    const out = ids(cards('staff'));
    for (const gone of ['cekajici', 'zablokovany', 'odesel']) expect(out).not.toContain(gone);
  });

  it('gives a student their own card only', () => {
    expect(ids(cards('student', 'eva'))).toEqual(['eva']);
  });

  it('gives a viewer who may not write points no card', () => {
    expect(cards('none')).toEqual([]);
  });

  it('gives a student with no row of their own nothing', () => {
    expect(cards('student', 'nobody')).toEqual([]);
  });

  it('copies name, salutation and degrees', () => {
    const card = cards('staff').find((c) => c.id === 'me');
    expect(card).toMatchObject({
      salutation: 'pani',
      givenName: 'Jana',
      familyName: 'me',
      titlesBefore: 'Mgr.',
    });
    expect(card).not.toHaveProperty('titlesAfter');
    expect(cards('staff').find((c) => c.id === 'reditel')).toMatchObject({ titlesAfter: 'Ph.D.' });
  });

  it('guesses nothing: a user without a salutation keeps null', () => {
    expect(cards('staff').find((c) => c.id === 'bez-osloveni')).toMatchObject({
      salutation: null,
    });
  });

  it('prints what stands before the name: a function wins over the tier', () => {
    const byId = new Map(cards('staff').map((c) => [c.id, c]));
    expect(byId.get('zastupkyne')).toMatchObject({ head: 'zastupce', complement: 'pro majetek' });
    expect(byId.get('reditel')).toMatchObject({ head: 'reditel' });
    expect(byId.get('reditel')).not.toHaveProperty('complement');
    expect(byId.get('me')).toMatchObject({ head: 'profesor' });
  });

  it('gives a student and a person without a tier no head', () => {
    const byId = new Map(cards('staff').map((c) => [c.id, c]));
    expect(byId.get('eva')).not.toHaveProperty('head');
    expect(byId.get('bez-osloveni')).not.toHaveProperty('head');
  });

  it('never carries email, role, status, tier, the function list or the access flags', () => {
    for (const card of cards('staff')) {
      expect(Object.keys(card).filter((k) => !CARD_KEYS.has(k))).toEqual([]);
    }
  });
});
