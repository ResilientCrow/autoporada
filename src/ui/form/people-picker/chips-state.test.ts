import { describe, expect, it } from 'vitest';

import { calDate } from '@/domain/time';
import type { DraftPerson } from '@/domain/report';

import {
  addChip,
  confirmClass,
  editChip,
  finishEdit,
  flagsOf,
  movedMessage,
  moveChip,
  removeChip,
  removedMessage,
  salutateAll,
  salutatedMessage,
  settleClass,
  showsBulk,
  switchEditor,
  type Chip,
  type Editing,
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
    expect(addChip(full, person('Karel', 'Dvořák'), 'd', 3)).toEqual({ ok: false, code: 'limit' });
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
    expect(removeChip(three, 'a').focus).toEqual({ key: 'b', button: 'remove' });
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
    expect(removeChip(three, 'zz')).toEqual({ chips: three, focus: null, say: null });
  });
});

describe('moveChip', () => {
  const three = [A, B, C];

  it('moves a chip up and down, and says the place', () => {
    const up = moveChip(three, 'b', -1);
    expect(keys(up.chips)).toEqual(['b', 'a', 'c']);
    expect(up.say).toBe(`Petr Novák, pozice 1 z${NBSP}3.`);
    const down = moveChip(three, 'b', 1);
    expect(keys(down.chips)).toEqual(['a', 'c', 'b']);
    expect(down.say).toBe(`Petr Novák, pozice 3 z${NBSP}3.`);
  });

  it('leaves focus on the button that moved', () => {
    expect(moveChip(three, 'b', -1).focus).toEqual({ key: 'b', button: 'up' });
    expect(moveChip(three, 'b', 1).focus).toEqual({ key: 'b', button: 'down' });
  });

  it('does not move at the ends, keeps focus and says the place again instead of staying silent', () => {
    expect(moveChip(three, 'a', -1)).toEqual({
      chips: three,
      focus: { key: 'a', button: 'up' },
      say: `Jana Nováková, pozice 1 z${NBSP}3.`,
    });
    expect(moveChip(three, 'c', 1)).toEqual({
      chips: three,
      focus: { key: 'c', button: 'down' },
      say: `Eva Novotná, pozice 3 z${NBSP}3.`,
    });
  });

  it('does nothing for a key that is not there', () => {
    expect(moveChip(three, 'zz', 1)).toEqual({ chips: three, focus: null, say: null });
  });

  it('does not touch the chips it did not move', () => {
    const moved = moveChip(three, 'a', 1).chips;
    expect(moved[0]).toBe(B);
    expect(moved[1]).toBe(A);
    expect(moved[2]).toBe(C);
  });
});

describe('switchEditor', () => {
  const messy = chip('a', ' Jan ', ' Novák', { affiliation: ' 3b ' });
  const open = (key: string, klass?: string): Editing => ({ key, klass });

  it('opens an editor when none is open, remembering the class it opened with', () => {
    expect(switchEditor([messy, B], null, 'a', TODAY)).toEqual({
      ok: true,
      chips: [messy, B],
      editing: open('a', '3.B'),
    });
    expect(switchEditor([messy, B], null, 'b', TODAY)).toMatchObject({ editing: open('b') });
  });

  it('closes the editor when its own button is pressed again, finishing it first', () => {
    const closed = switchEditor([messy], open('a', '3.B'), 'a', TODAY);
    expect(closed).toMatchObject({ ok: true, editing: null });
    expect(closed.ok && closed.chips[0]?.person).toEqual(
      person('Jan', 'Novák', { affiliation: '3.B' }),
    );
  });

  it('finishes the open editor before opening another, so its fields are trimmed', () => {
    const switched = switchEditor([messy, B], open('a', '3.B'), 'b', TODAY);
    expect(switched).toMatchObject({ ok: true, editing: open('b') });
    expect(switched.ok && switched.chips[0]?.person.givenName).toBe('Jan');
    expect(switched.ok && switched.chips[0]?.person.familyName).toBe('Novák');
    expect(switched.ok && switched.chips[1]).toBe(B);
  });

  it('stays on an editor that cannot be finished, naming the fields, whichever button asked', () => {
    const blank = chip('a', '', 'Novák');
    expect(switchEditor([blank, B], open('a'), 'a', TODAY)).toEqual({
      ok: false,
      issues: { givenName: 'required' },
    });
    expect(switchEditor([blank, B], open('a'), 'b', TODAY)).toEqual({
      ok: false,
      issues: { givenName: 'required' },
    });
  });

  it('is not stuck on an editor whose chip is gone', () => {
    expect(switchEditor([B], open('gone'), 'b', TODAY)).toEqual({
      ok: true,
      chips: [B],
      editing: open('b'),
    });
    expect(switchEditor([B], open('gone'), 'gone', TODAY)).toMatchObject({
      ok: true,
      editing: null,
    });
  });
});

describe('editChip', () => {
  it('changes one chip and no other', () => {
    const edited = editChip([A, B], 'b', { givenName: 'Pavel', salutation: 'pan' });
    expect(edited[0]).toBe(A);
    expect(edited[1]).toEqual({
      key: 'b',
      person: person('Pavel', 'Novák', { salutation: 'pan' }),
    });
  });

  it('drops an emptied optional field instead of keeping an empty string', () => {
    const [edited] = editChip(
      [chip('a', 'Jan', 'Novák', { titlesBefore: 'Mgr.', titlesAfter: 'Ph.D.' })],
      'a',
      { titlesBefore: '', titlesAfter: '' },
    );
    expect(edited?.person).toEqual(person('Jan', 'Novák'));
    expect(edited?.person).not.toHaveProperty('titlesBefore');
  });

  it('keeps a cleared name as an empty string, for the field problem to show', () => {
    expect(editChip([A], 'a', { familyName: '' })[0]?.person.familyName).toBe('');
  });

  it('drops the confirmed year with an emptied class', () => {
    const [edited] = editChip(
      [chip('a', 'Jan', 'Novák', { affiliation: '3.B', affiliationYear: '2026/2027' })],
      'a',
      { affiliation: '' },
    );
    expect(edited?.person).not.toHaveProperty('affiliation');
    expect(edited?.person).not.toHaveProperty('affiliationYear');
  });

  it('turns an empty choice into no salutation', () => {
    const [edited] = editChip([A], 'a', { salutation: null });
    expect(edited?.person.salutation).toBeNull();
  });
});

describe('settleClass', () => {
  const klass = (affiliation: string, rest: Partial<DraftPerson> = {}) =>
    chip('a', 'Jan', 'Novák', { affiliation, ...rest });
  const last = { affiliationYear: '2025/2026' };

  it('writes a class the way the lists do', () => {
    const settled = settleClass([klass(' 3b ')], { key: 'a', klass: undefined }, TODAY);
    expect(settled.chips[0]?.person.affiliation).toBe('3.B');
  });

  it('only trims an organisation, and does nothing for a chip without a class', () => {
    const org = settleClass([klass(' Policie ČR ')], { key: 'a', klass: undefined }, TODAY);
    expect(org.chips[0]?.person.affiliation).toBe('Policie ČR');
    expect(settleClass([B], { key: 'b', klass: undefined }, TODAY).chips[0]).toBe(B);
  });

  it('makes a class the author changed current: this school year', () => {
    const settled = settleClass([klass('4c', last)], { key: 'a', klass: '3.B' }, TODAY);
    expect(settled.chips[0]?.person).toMatchObject({
      affiliation: '4.C',
      affiliationYear: '2026/2027',
    });
  });

  it('makes a class typed where there was none current, and counts an organisation as typed', () => {
    const typed = settleClass([klass('3b')], { key: 'a', klass: undefined }, TODAY);
    expect(typed.chips[0]?.person.affiliationYear).toBe('2026/2027');
    const org = settleClass([klass('Policie ČR', last)], { key: 'a', klass: '3.B' }, TODAY);
    expect(org.chips[0]?.person.affiliationYear).toBe('2026/2027');
  });

  it('leaves the year of a class the author did not change, so the flag stays', () => {
    const same = settleClass([klass('3.B', last)], { key: 'a', klass: '3.B' }, TODAY);
    expect(same.chips[0]?.person.affiliationYear).toBe('2025/2026');
    // „3b“ is „3.B“ written another way: not a change either.
    const spelled = settleClass([klass('3b', last)], { key: 'a', klass: '3.B' }, TODAY);
    expect(spelled.chips[0]?.person).toMatchObject({
      affiliation: '3.B',
      affiliationYear: '2025/2026',
    });
  });

  it('drops the class and its year when it was emptied', () => {
    const emptied = settleClass([klass('  ', last)], { key: 'a', klass: '3.B' }, TODAY);
    expect(emptied.chips[0]?.person).not.toHaveProperty('affiliation');
    expect(emptied.chips[0]?.person).not.toHaveProperty('affiliationYear');
    expect(emptied.editing).toEqual({ key: 'a', klass: undefined });
  });

  it('takes the settled class as the one to compare with next time', () => {
    const settled = settleClass([klass('4c', last)], { key: 'a', klass: '3.B' }, TODAY);
    expect(settled.editing).toEqual({ key: 'a', klass: '4.C' });
  });

  it('does nothing once the editor is closed, so a late blur cannot undo Hotovo', () => {
    const finished = finishEdit([klass(' 3b ', last)], { key: 'a', klass: '3.B' }, TODAY);
    const chips = finished.ok ? finished.chips : [];
    const late = settleClass(chips, null, TODAY);
    expect(late).toEqual({ chips, editing: null });
    expect(late.chips).toBe(chips);
  });

  it('does nothing for an editor whose chip is gone', () => {
    const gone = { key: 'gone', klass: undefined };
    expect(settleClass([B], gone, TODAY)).toEqual({ chips: [B], editing: gone });
  });
});

describe('confirmClass', () => {
  it('sets the year to this school year, also for a class carried over from last year', () => {
    const [done] = confirmClass(
      [chip('a', 'Jan', 'Novák', { affiliation: '3.B', affiliationYear: '2025/2026' })],
      'a',
      TODAY,
    );
    expect(done?.person.affiliationYear).toBe('2026/2027');
    const [spring] = confirmClass(
      [chip('a', 'Jan', 'Novák', { affiliation: '3.B' })],
      'a',
      calDate(2027, 3, 1),
    );
    expect(spring?.person.affiliationYear).toBe('2026/2027');
  });

  it('does nothing for a chip with no class', () => {
    expect(confirmClass([B], 'b', TODAY)[0]).toBe(B);
  });
});

describe('finishEdit', () => {
  const none = (key: string): Editing => ({ key, klass: undefined });

  it('closes the editor and returns focus to the chip’s Upravit', () => {
    const finished = finishEdit([A, B], none('b'), TODAY);
    expect(finished).toMatchObject({ ok: true, focus: { key: 'b', button: 'edit' } });
  });

  it('keeps the editor open while a name is empty, and names the fields', () => {
    expect(finishEdit([chip('a', '', 'Novák')], none('a'), TODAY)).toEqual({
      ok: false,
      issues: { givenName: 'required' },
    });
    expect(finishEdit([chip('a', 'Jan', '')], none('a'), TODAY)).toEqual({
      ok: false,
      issues: { familyName: 'required' },
    });
    expect(finishEdit([chip('a', ' ', ' ')], none('a'), TODAY)).toEqual({
      ok: false,
      issues: { givenName: 'required', familyName: 'required' },
    });
  });

  it('is not finished for an editor whose chip is gone', () => {
    expect(finishEdit([B], none('gone'), TODAY)).toEqual({ ok: false, issues: {} });
  });

  it('trims what the author left around the fields', () => {
    const finished = finishEdit(
      [chip('a', ' Jan ', ' Novák', { titlesBefore: ' Mgr. ', titlesAfter: '  ' })],
      none('a'),
      TODAY,
    );
    expect(finished.ok && finished.chips[0]?.person).toEqual(
      person('Jan', 'Novák', { titlesBefore: 'Mgr.' }),
    );
  });

  it('writes the class the way the lists do, as Enter in its field would leave it', () => {
    const finished = finishEdit(
      [chip('a', 'Jan', 'Novák', { affiliation: ' 3b ' })],
      { key: 'a', klass: '3.B' },
      TODAY,
    );
    expect(finished.ok && finished.chips[0]?.person.affiliation).toBe('3.B');
  });

  it('dates a class that was changed, keeps the date of one that was not, and drops an emptied one', () => {
    const old = { affiliationYear: '2025/2026' };
    const changed = finishEdit(
      [chip('a', 'Jan', 'Novák', { affiliation: '4c', ...old })],
      { key: 'a', klass: '3.B' },
      TODAY,
    );
    expect(changed.ok && changed.chips[0]?.person.affiliationYear).toBe('2026/2027');
    const kept = finishEdit(
      [chip('a', 'Jan', 'Novák', { affiliation: '3.B', ...old })],
      { key: 'a', klass: '3.B' },
      TODAY,
    );
    expect(kept.ok && kept.chips[0]?.person.affiliationYear).toBe('2025/2026');
    const emptied = finishEdit(
      [chip('a', 'Jan', 'Novák', { affiliation: ' ', ...old })],
      { key: 'a', klass: '3.B' },
      TODAY,
    );
    expect(emptied.ok && emptied.chips[0]?.person).toEqual(person('Jan', 'Novák'));
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

  it('sends focus to the Upravit of the first chip that was set, not to the box', () => {
    const several = [A, B, chip('d', 'Ivan', 'Malý'), chip('c', 'Eva', 'Novotná')];
    expect(salutateAll(several, 'pan').focus).toEqual({ key: 'b', button: 'edit' });
  });

  it('says how many people were set, without gender', () => {
    const several = [A, B, chip('d', 'Ivan', 'Malý'), chip('c', 'Eva', 'Novotná')];
    expect(salutateAll(several, 'pan').say).toBe(`Oslovení nastaveno: 3${NBSP}osoby.`);
    expect(salutateAll(three, 'slecna').say).toBe(`Oslovení nastaveno: 1${NBSP}osoba.`);
  });

  it('changes nothing, says nothing and leaves focus alone when every chip has one', () => {
    expect(salutateAll([A], 'pan')).toEqual({ chips: [A], focus: null, say: null });
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
      flagsOf(person('Jan', 'Novák', { salutation: 'pan', affiliationYear: '2020/2021' }), TODAY),
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
    expect(movedMessage(doctor, 2, 5)).toBe(`Jan Novák, pozice 2 z${NBSP}5.`);
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
