import { describe, expect, it } from 'vitest';

import type { Salutation } from '@/domain/cs';

import {
  displayName,
  draftPersonOf,
  isParticipant,
  nameKey,
  participantsOf,
  samePerson,
  type DraftBullet,
  type DraftPerson,
} from './index';

function person(
  givenName: string,
  familyName: string,
  extra: Partial<DraftPerson> & { salutation?: Salutation | null } = {},
): DraftPerson {
  return { salutation: 'pan', givenName, familyName, ...extra };
}

const people = (...list: DraftPerson[]): DraftBullet => ({
  key: 'ucastnici',
  label: 'Účastníci',
  kind: 'people',
  order: 'input',
  people: list,
});
const text: DraftBullet = { key: 'vysledky', label: 'Výsledky', kind: 'text', text: 'Jan Novák' };

describe('samePerson', () => {
  it('compares by graphId when both have one, whatever the names say', () => {
    const listed = person('Jan', 'Novák', { graphId: 'g-1' });
    expect(samePerson(listed, person('Honza', 'Novák', { graphId: 'g-1' }))).toBe(true);
    expect(samePerson(listed, person('Jan', 'Novák', { graphId: 'g-2' }))).toBe(false);
  });

  it('compares by name when either side has no graphId, ignoring case and spaces', () => {
    const listed = person('Jan', 'Novák', { graphId: 'g-1' });
    const typed = person('JAN ', ' novák');
    expect(samePerson(listed, typed)).toBe(true);
    expect(samePerson(typed, listed)).toBe(true);
  });

  it('keeps the given and family names apart', () => {
    expect(samePerson(person('Jan', 'Novák Svoboda'), person('Jan Novák', 'Svoboda'))).toBe(false);
  });

  it('tells two people of different names apart', () => {
    expect(samePerson(person('Jan', 'Novák'), person('Jan', 'Dvořák'))).toBe(false);
  });
});

describe('nameKey', () => {
  it('is the folded given and family name, kept apart', () => {
    expect(nameKey(person(' Jan ', 'NOVÁK'))).toBe(nameKey(person('jan', 'novák')));
    expect(nameKey(person('Jan', 'Novák Svoboda'))).not.toBe(
      nameKey(person('Jan Novák', 'Svoboda')),
    );
  });
});

describe('displayName', () => {
  it('writes the names in the nominative, trimmed, with no salutation', () => {
    expect(displayName(person(' Jan ', 'Novák', { salutation: null }))).toBe('Jan Novák');
  });
});

describe('participantsOf', () => {
  it('lists the people of every people bullet in bullet order, skipping text bullets', () => {
    const [a, b, c] = [person('Jan', 'Novák'), person('Eva', 'Malá'), person('Petr', 'Dvořák')];
    expect(
      participantsOf({ bullets: [people(a!, b!), text, { ...people(c!), key: 'hoste' }] }),
    ).toEqual([a, b, c]);
  });

  it('keeps the first copy of a person named twice, whichever way they match', () => {
    const listed = person('Jan', 'Novák', { graphId: 'g-1' });
    const typed = person('jan', 'novák');
    const other = person('Eva', 'Malá');
    const result = participantsOf({
      bullets: [people(listed, other), { ...people(typed), key: 'hoste' }],
    });
    expect(result).toEqual([listed, other]);
  });

  it('is empty with no people', () => {
    expect(participantsOf({ bullets: [people(), text] })).toEqual([]);
  });

  it('follows samePerson exactly where it is not transitive, in either order', () => {
    // g-1 and g-2 differ, yet each matches the typed copy by name.
    const first = person('Jan', 'Novák', { graphId: 'g-1' });
    const second = person('Jan', 'Novák', { graphId: 'g-2' });
    const typed = person('JAN', 'Novák');
    const idFirst = participantsOf({ bullets: [people(first, second, typed)] });
    expect(idFirst).toEqual([first, second]);
    const typedFirst = participantsOf({ bullets: [people(typed, first, second)] });
    expect(typedFirst).toEqual([typed]);
    // A listed person after a typed copy of someone else's name stays apart by id.
    const other = person('Eva', 'Malá', { graphId: 'g-3' });
    expect(participantsOf({ bullets: [people(other, person('Eva', 'Malá'), other)] })).toEqual([
      other,
    ]);
  });

  it('agrees with a pairwise dedup on every order of a mixed set', () => {
    const set = [
      person('Jan', 'Novák', { graphId: 'g-1' }),
      person('Jan', 'Novák', { graphId: 'g-2' }),
      person('jan', 'novák'),
      person('Eva', 'Malá'),
      person('Eva', 'Malá', { graphId: 'g-3' }),
      person('Petr', 'Dvořák', { graphId: 'g-3' }),
    ];
    const orders = (rest: DraftPerson[]): DraftPerson[][] =>
      rest.length <= 1
        ? [rest]
        : rest.flatMap((p, i) =>
            orders([...rest.slice(0, i), ...rest.slice(i + 1)]).map((o) => [p, ...o]),
          );
    for (const order of orders(set)) {
      const expected = order.reduce<DraftPerson[]>(
        (kept, p) => (kept.some((k) => samePerson(k, p)) ? kept : [...kept, p]),
        [],
      );
      expect(participantsOf({ bullets: [people(...order)] })).toEqual(expected);
    }
  });
});

describe('isParticipant', () => {
  const content = { bullets: [people(person('Jan', 'Novák', { graphId: 'g-1' }))] };

  it('is true for the same person under the same rule', () => {
    expect(isParticipant(content, person('JAN', 'Novák'))).toBe(true);
  });

  it('is false for a stranger and for the same name with another graphId', () => {
    expect(isParticipant(content, person('Karel', 'Cizí'))).toBe(false);
    expect(isParticipant(content, person('Jan', 'Novák', { graphId: 'g-2' }))).toBe(false);
  });

  it('counts a person named in any people bullet, a copy among several included', () => {
    const several = {
      bullets: [
        people(person('Jan', 'Novák', { graphId: 'g-1' })),
        text,
        { ...people(person('Jan', 'Novák', { graphId: 'g-2' })), key: 'hoste' },
      ],
    };
    expect(isParticipant(several, person('jan', 'novák'))).toBe(true);
    expect(isParticipant(several, person('Jan', 'Novák', { graphId: 'g-2' }))).toBe(true);
    expect(isParticipant(several, person('Jan', 'Novák', { graphId: 'g-9' }))).toBe(false);
    expect(isParticipant({ bullets: [text] }, person('Jan', 'Novák'))).toBe(false);
  });
});

describe('draftPersonOf', () => {
  it('keeps only the fields a stored person has (the people memory adds lastUsed and genitive)', () => {
    const remembered = {
      ...person('Jana', 'Oborová', {
        salutation: null,
        affiliation: '4.GC',
        affiliationYear: '2026/2027',
      }),
      lastUsed: '2026-11-20T09:09:18.015Z',
      genitive: 'Jany Oborové',
      how: 'uvedli jste v dřívější zprávě',
    };
    expect(draftPersonOf(remembered)).toStrictEqual({
      salutation: null,
      givenName: 'Jana',
      familyName: 'Oborová',
      affiliation: '4.GC',
      affiliationYear: '2026/2027',
    });
  });

  it('keeps every DraftPerson field and leaves out the ones not set', () => {
    const full: DraftPerson = {
      graphId: '01a15559-04d8-705c-96a3-c3c67ecd5caf',
      salutation: 'pani',
      givenName: 'Jana',
      familyName: 'Nováková',
      head: 'clen',
      complement: 'PR oddělení',
      affiliation: '4.GC',
      affiliationYear: '2026/2027',
    };
    expect(draftPersonOf(full)).toStrictEqual(full);
    expect(Object.keys(draftPersonOf(person('Jan', 'Novák')))).toStrictEqual([
      'salutation',
      'givenName',
      'familyName',
    ]);
  });
});
