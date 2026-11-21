import { describe, expect, it } from 'vitest';
import type { DraftPerson } from '@/domain/report';
import { addPeople, toDraftPeople } from './draft-people';

const YEAR = '2026/2027';
const person = (givenName: string, familyName: string, affiliation?: string): DraftPerson => ({ salutation: null, givenName, familyName, ...(affiliation && { affiliation, affiliationYear: YEAR }) });

describe('toDraftPeople', () => {
  it('takes separate names as they are, with the class tidied and its school year', () => {
    expect(toDraftPeople([{ givenName: 'Tereza', familyName: 'Malá', cls: '3B' }, { givenName: 'Jan', familyName: 'Novák' }], [], YEAR)).toEqual({ people: [person('Tereza', 'Malá', '3.B'), person('Jan', 'Novák')], rejected: [] });
  });

  it('reads a name cell like a pasted line: either order, „Příjmení, Jméno“, a class in parentheses', () => {
    const r = toDraftPeople([{ name: 'Tereza Malá' }, { name: 'Malá Tereza' }, { name: 'Novák, Jan' }, { name: 'Eva Nová (2.A)' }], [], YEAR);
    expect(r).toEqual({ people: [person('Tereza', 'Malá'), person('Tereza', 'Malá'), person('Jan', 'Novák'), person('Eva', 'Nová', '2.A')], rejected: [] });
  });

  it('settles an order it cannot tell by a person the author used before', () => {
    expect(toDraftPeople([{ name: 'Kim Lee' }], [{ givenName: 'Lee', familyName: 'Kim' }], YEAR).people).toEqual([person('Lee', 'Kim')]);
  });

  it('prefers the class column to a class in the cell', () => {
    expect(toDraftPeople([{ name: 'Eva Nová (2.A)', cls: '3.B' }], [], YEAR).people).toEqual([person('Eva', 'Nová', '3.B')]);
  });

  it('rejects a cell without a surname and names longer than a person row takes', () => {
    const long = 'A'.repeat(81);
    expect(toDraftPeople([{ name: 'Tereza' }, { givenName: long, familyName: 'Malá' }, { name: 'Jan Novák' }], [], YEAR)).toEqual({ people: [person('Jan', 'Novák')], rejected: ['Tereza', `${long} Malá`] });
  });
});

describe('addPeople', () => {
  it('adds the people not yet in the list, each once, whatever the case', () => {
    expect(addPeople([person('Jan', 'Novák')], [person('jan', 'novák'), person('Eva', 'Nová'), person('Eva', 'Nová')], 10)).toEqual({ people: [person('Eva', 'Nová')], present: 1 });
  });

  it('refuses the whole file when the new people do not fit', () => {
    expect(addPeople([], [person('Jan', 'Novák'), person('Eva', 'Nová')], 1)).toEqual({ tooMany: 2 });
    expect(addPeople([], [person('Jan', 'Novák'), person('Eva', 'Nová')], 2)).toEqual({ people: [person('Jan', 'Novák'), person('Eva', 'Nová')], present: 0 });
  });
});
