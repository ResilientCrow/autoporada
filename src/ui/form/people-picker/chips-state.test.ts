import { describe, expect, it } from 'vitest';

import { calDate } from '@/domain/time';
import type { DraftPerson } from '@/domain/report';

import {
  addChip,
  flagsOf,
  removeChip,
  removedMessage,
  salutateAll,
  salutatedMessage,
  showsBulk,
  type Chip,
} from './chips-state';

const NBSP = '\u00A0';
const TODAY = calDate(2026, 10, 27); // school year 2026/2027

const person = (given: string, family: string, rest: Partial<DraftPerson> = {}): DraftPerson => ({
  salutation: null,
  givenName: given,
  familyName: family,
  ...rest,
});
const chip = (
  key: string,
  given: string,
  family: string,
  rest: Partial<DraftPerson> = {},
): Chip => ({
  key,
  person: person(given, family, rest),
});

const A = chip('a', 'Jana', 'Nováková', { salutation: 'pani' });
const B = chip('b', 'Petr', 'Novák');
const C = chip('c', 'Eva', 'Novotná');
const keys = (chips: readonly Chip[]) => chips.map((c) => c.key);

describe('addChip', () => {
  it('appends under the key it is given and says who was added and the new total', () => {
    const added = addChip([A], person('Petr', 'Novák'), 'b', 10);
    expect(added).toEqual({
      ok: true,
      chips: [A, B],
      say: `Přidáno: Petr Novák. Celkem: 2${NBSP}osoby.`,
    });
  });

  it('keeps two chips of one directory id apart, each under its own key', () => {
    const one = person('Jana', 'Nováková', { graphId: 'g1' });
    const first = addChip([], one, 'k1', 10);
    const second = first.ok ? addChip(first.chips, one, 'k2', 10) : first;
    expect(second.ok && keys(second.chips)).toEqual(['k1', 'k2']);
  });

  it('accepts the last place under the cap and refuses the next one with a code, adding nothing', () => {
    const full = [A, B, C];
    expect(addChip(full.slice(0, 2), person('Eva', 'Novotná'), 'c', 3).ok).toBe(true);
    expect(addChip(full, person('Karel', 'Dvořák'), 'd', 3)).toEqual({
      ok: false,
      code: 'limit',
    });
  });
});

describe('removeChip', () => {
  const three = [A, B, C];

  it('moves focus to the next chip, whose Odebrat takes it', () => {
    const change = removeChip(three, 'b');
    expect(keys(change.chips)).toEqual(['a', 'c']);
    expect(change.focus).toEqual({ key: 'c', button: 'remove' });
  });

  it('moves focus to the search box when the last of several went, not back to the previous chip', () => {
    const change = removeChip(three, 'c');
    expect(keys(change.chips)).toEqual(['a', 'b']);
    expect(change.focus).toBe('search');
  });

  it('moves focus to the first chip when the first one went', () => {
    expect(removeChip(three, 'a').focus).toEqual({
      key: 'b',
      button: 'remove',
    });
  });

  it('moves focus to the search box when the only chip went', () => {
    const change = removeChip([A], 'a');
    expect(change.chips).toEqual([]);
    expect(change.focus).toBe('search');
  });

  it('says who went and how many are left', () => {
    expect(removeChip(three, 'b').say).toBe(`Odebráno: Petr Novák. Celkem: 2${NBSP}osoby.`);
    expect(removeChip([A], 'a').say).toBe(`Odebráno: Jana Nováková. Celkem: 0${NBSP}osob.`);
  });

  it('does nothing for a key that is not there', () => {
    expect(removeChip(three, 'zz')).toEqual({
      chips: three,
      focus: null,
      say: null,
    });
  });
});

describe('salutateAll', () => {
  const three = [A, B, chip('c', 'Eva', 'Novotná', { salutation: 'slecna' })];

  it('sets the salutation only on chips with none, and never overwrites a chosen one', () => {
    const change = salutateAll(
      [A, B, chip('c', 'Eva', 'Novotná', { salutation: 'slecna' })],
      'pan',
    );
    expect(change.chips.map((c) => c.person.salutation)).toEqual(['pani', 'pan', 'slecna']);
    expect(change.chips[0]).toBe(A);
  });

  it('leaves focus alone: the box would pop its list open over the chips just changed', () => {
    expect(salutateAll([B], 'pan').focus).toBeNull();
  });

  it('says how many people were set, without gender', () => {
    const several = [A, B, chip('d', 'Ivan', 'Malý'), chip('c', 'Eva', 'Novotná')];
    expect(salutateAll(several, 'pan').say).toBe(`Oslovení nastaveno: 3${NBSP}osoby.`);
    expect(salutateAll(three, 'slecna').say).toBe(`Oslovení nastaveno: 1${NBSP}osoba.`);
  });

  it('changes nothing, says nothing and leaves focus alone when every chip has one', () => {
    expect(salutateAll([A], 'pan')).toEqual({
      chips: [A],
      focus: null,
      say: null,
    });
  });
});

describe('showsBulk', () => {
  it('shows after an insert while any chip has no salutation', () => {
    expect(showsBulk([A, B], true)).toBe(true);
  });

  it('is gone once every chip has one', () => {
    expect(showsBulk([A], true)).toBe(false);
    expect(showsBulk([], true)).toBe(false);
  });

  it('is not offered for people that were already there, with no insert', () => {
    expect(showsBulk([A, B], false)).toBe(false);
  });
});

describe('flagsOf', () => {
  it('asks for a salutation while there is none', () => {
    expect(flagsOf(person('Jan', 'Novák'), TODAY)).toEqual(['salutation']);
    expect(flagsOf(person('Jan', 'Novák', { salutation: 'pan' }), TODAY)).toEqual([]);
  });

  it('asks to check a class confirmed in another school year', () => {
    const old = person('Jan', 'Novák', {
      salutation: 'pan',
      affiliation: '3.B',
      affiliationYear: '2025/2026',
    });
    expect(flagsOf(old, TODAY)).toEqual(['class']);
    expect(flagsOf({ ...old, affiliationYear: '2026/2027' }, TODAY)).toEqual([]);
  });

  it('counts a class that was never confirmed as stale, and an organisation-free chip as clean', () => {
    expect(
      flagsOf(person('Jan', 'Novák', { salutation: 'pan', affiliation: '3.B' }), TODAY),
    ).toEqual(['class']);
    expect(
      flagsOf(
        person('Jan', 'Novák', {
          salutation: 'pan',
          affiliationYear: '2020/2021',
        }),
        TODAY,
      ),
    ).toEqual([]);
  });

  it('reads the school year from the date it is given, not the clock', () => {
    const p = person('Jan', 'Novák', {
      salutation: 'pan',
      affiliation: '3.B',
      affiliationYear: '2026/2027',
    });
    expect(flagsOf(p, calDate(2026, 8, 31))).toEqual(['class']);
    expect(flagsOf(p, calDate(2026, 9, 1))).toEqual([]);
  });

  it('lists both flags, salutation first', () => {
    expect(flagsOf(person('Jan', 'Novák', { affiliation: '3.B' }), TODAY)).toEqual([
      'salutation',
      'class',
    ]);
  });
});

describe('announcements', () => {
  it('say the name without titles and never the gender', () => {
    const doctor = person('Jan', 'Novák', {
      titlesBefore: 'Mgr.',
      titlesAfter: 'Ph.D.',
      salutation: 'pan',
    });
    expect(removedMessage(doctor, 1)).toBe(`Odebráno: Jan Novák. Celkem: 1${NBSP}osoba.`);
  });

  it('count the people set by the bulk setter in the Czech forms', () => {
    expect(salutatedMessage(1)).toBe(`Oslovení nastaveno: 1${NBSP}osoba.`);
    expect(salutatedMessage(2)).toBe(`Oslovení nastaveno: 2${NBSP}osoby.`);
    expect(salutatedMessage(5)).toBe(`Oslovení nastaveno: 5${NBSP}osob.`);
  });

  it('count in the Czech forms', () => {
    const p = person('Jan', 'Novák');
    expect(removedMessage(p, 2)).toContain(`2${NBSP}osoby`);
    expect(removedMessage(p, 5)).toContain(`5${NBSP}osob`);
  });
});
