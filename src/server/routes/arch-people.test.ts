import { describe, expect, it } from 'vitest';

import type { Tier } from '@/domain/actor';
import type { Salutation } from '@/domain/cs';

import { peopleFor } from './arch-people';

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
