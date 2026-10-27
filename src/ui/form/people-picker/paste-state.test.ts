import { describe, expect, it } from 'vitest';

import { parsePeopleList, PASTE_MAX_CHARS, type PasteRow } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import { calDate } from '@/domain/time';
import { people } from '@/ui/copy';

import { addChips } from './chips-state';
import {
  afterAdd,
  checkedMessage,
  chosen,
  chosenCount,
  isFinished,
  knownNames,
  PASTE_INPUT_CEILING,
  pastedMessage,
  pickRow,
  previewOf,
  salutateRows,
  setSalutation,
  swapRow,
  withoutAdded,
  type Preview,
} from './paste-state';

const NBSP = '\u00A0';
const TODAY = calDate(2026, 10, 27);

const row = (
  line: number,
  given: string,
  family: string,
  rest: Partial<PasteRow> = {},
): PasteRow => ({
  line,
  source: `${given} ${family}`,
  givenName: given,
  familyName: family,
  uncertainOrder: false,
  ...rest,
});

const SAMPLE = {
  rows: [
    row(1, 'Jana', 'Nováková', { affiliation: '3.B' }),
    row(2, 'Zdislav', 'Hruška', { uncertainOrder: true }),
    row(4, 'Eva', 'Svobodová', { titlesBefore: 'Mgr.', titlesAfter: 'Ph.D.' }),
  ],
  rejected: [{ line: 3, code: 'no-surname', source: 'Marie' }],
  truncated: false,
} as const;

const preview = (): Preview => previewOf(SAMPLE);
const checkedKeys = (p: Preview) => p.rows.filter((r) => r.checked).map((r) => r.key);

describe('previewOf', () => {
  it('keys a row by its line, so the key survives the rows around it leaving', () => {
    expect(preview().rows.map((r) => r.key)).toEqual([1, 2, 4]);
  });

  it('starts a doubtful row unchecked and every other row checked', () => {
    expect(checkedKeys(preview())).toEqual([1, 4]);
  });

  it('never guesses a salutation', () => {
    expect(preview().rows.map((r) => r.salutation)).toEqual([null, null, null]);
  });

  it('carries the rejected lines and the truncation as they are', () => {
    const p = previewOf({ ...SAMPLE, truncated: true });
    expect(p.rejected).toEqual(SAMPLE.rejected);
    expect(p.truncated).toBe(true);
  });

  it('is what the parser makes of a pasted text, a name known from the recents no longer in doubt', () => {
    const text = 'Zdislav Hruška\nHruška Zdislav';
    const unknown = previewOf(parsePeopleList(text, []));
    expect(unknown.rows.every((r) => !r.checked && r.row.uncertainOrder)).toBe(true);
    const recent: RecentPerson = {
      salutation: 'pan',
      givenName: 'Zdislav',
      familyName: 'Hruška',
      lastUsed: '2026-10-01T10:00:00.000Z',
    };
    const known = previewOf(parsePeopleList(text, knownNames([recent])));
    expect(known.rows.every((r) => r.checked && !r.row.uncertainOrder)).toBe(true);
  });
});

describe('knownNames', () => {
  it('maps recents to the two names the parser compares, nothing else', () => {
    const recent: RecentPerson = {
      graphId: 'g',
      salutation: 'pani',
      givenName: 'Jana',
      familyName: 'Nováková',
      affiliation: '3.B',
      lastUsed: '2026-10-01T10:00:00.000Z',
    };
    expect(knownNames([recent])).toEqual([{ givenName: 'Jana', familyName: 'Nováková' }]);
  });
});

describe('pickRow', () => {
  it('checks and unchecks the one row and leaves the others', () => {
    const on = pickRow(preview(), 2, true);
    expect(checkedKeys(on)).toEqual([1, 2, 4]);
    expect(checkedKeys(pickRow(on, 1, false))).toEqual([2, 4]);
  });

  it('ignores a key that is not in the preview', () => {
    const before = preview();
    expect(pickRow(before, 99, true)).toEqual(before);
  });
});

describe('swapRow', () => {
  it('swaps the given name and surname and clears the doubt', () => {
    const swapped = swapRow(preview(), 2).rows[1];
    expect(swapped?.row).toMatchObject({
      givenName: 'Hruška',
      familyName: 'Zdislav',
      uncertainOrder: false,
    });
  });

  it('leaves the other rows, the checkbox and the salutation of the row as they are', () => {
    const before = setSalutation(pickRow(preview(), 2, true), 2, 'pan');
    const after = swapRow(before, 2);
    expect(after.rows[1]?.checked).toBe(true);
    expect(after.rows[1]?.salutation).toBe('pan');
    expect(after.rows[0]).toBe(before.rows[0]);
    expect(after.rows[2]).toBe(before.rows[2]);
  });

  it('twice puts the names back', () => {
    const twice = swapRow(swapRow(preview(), 2), 2).rows[1]?.row;
    expect(twice).toMatchObject({ givenName: 'Zdislav', familyName: 'Hruška' });
  });
});

describe('setSalutation and salutateRows', () => {
  it('sets one row, and can put it back to none', () => {
    const set = setSalutation(preview(), 1, 'pani');
    expect(set.rows.map((r) => r.salutation)).toEqual(['pani', null, null]);
    expect(setSalutation(set, 1, null).rows[0]?.salutation).toBeNull();
  });

  it('the bulk setter fills only the rows still at none', () => {
    const bulk = salutateRows(setSalutation(preview(), 1, 'pani'), 'pan');
    expect(bulk.rows.map((r) => r.salutation)).toEqual(['pani', 'pan', 'pan']);
  });

  it('the bulk setter also fills rows that are not checked', () => {
    expect(salutateRows(preview(), 'slecna').rows[1]?.salutation).toBe('slecna');
  });
});

describe('chosen', () => {
  it('counts the checked rows, and a row unchecked is not counted', () => {
    expect(chosenCount(preview())).toBe(2);
    expect(chosenCount(pickRow(preview(), 2, true))).toBe(3);
    expect(chosenCount(pickRow(pickRow(preview(), 1, false), 4, false))).toBe(0);
  });

  it('gives the checked rows as people, in order, with the salutation as chosen or none', () => {
    const picked = setSalutation(pickRow(preview(), 2, true), 4, 'pani');
    expect(chosen(picked).map((c) => c.person)).toEqual([
      { salutation: null, givenName: 'Jana', familyName: 'Nováková', affiliation: '3.B' },
      { salutation: null, givenName: 'Zdislav', familyName: 'Hruška' },
      {
        salutation: 'pani',
        titlesBefore: 'Mgr.',
        givenName: 'Eva',
        familyName: 'Svobodová',
        titlesAfter: 'Ph.D.',
      },
    ]);
  });

  it('gives a person no directory id, no class year and none of the line bookkeeping', () => {
    for (const { person } of chosen(preview())) {
      expect(Object.keys(person)).not.toContain('graphId');
      expect(Object.keys(person)).not.toContain('affiliationYear');
      expect(Object.keys(person)).not.toContain('line');
      expect(Object.keys(person)).not.toContain('source');
      expect(Object.keys(person)).not.toContain('uncertainOrder');
    }
  });

  it('marks a checked row whose order is still a guess as a doubt, and not once it was swapped', () => {
    const picked = pickRow(preview(), 2, true);
    expect(chosen(picked).map((c) => c.doubt)).toEqual([false, true, false]);
    expect(chosen(swapRow(picked, 2)).map((c) => c.doubt)).toEqual([false, false, false]);
  });
});

describe('withoutAdded', () => {
  it('removes the first rows that were checked, as many as were added, and keeps the others', () => {
    const all = pickRow(preview(), 2, true);
    expect(withoutAdded(all, 2).rows.map((r) => r.key)).toEqual([4]);
  });

  it('keeps the checked rows that did not fit, and the unchecked ones', () => {
    const after = withoutAdded(preview(), 1);
    expect(after.rows.map((r) => r.key)).toEqual([2, 4]);
    expect(checkedKeys(after)).toEqual([4]);
  });

  it('keeps the rejected lines and the truncation', () => {
    const after = withoutAdded(previewOf({ ...SAMPLE, truncated: true }), 2);
    expect(after.rejected).toEqual(SAMPLE.rejected);
    expect(after.truncated).toBe(true);
  });

  it('removes nothing when nothing was added', () => {
    expect(withoutAdded(preview(), 0).rows).toHaveLength(3);
  });
});

describe('isFinished', () => {
  it('is when no row and no rejected line is left, and not while either is', () => {
    expect(isFinished(preview())).toBe(false);
    expect(isFinished({ rows: [], rejected: SAMPLE.rejected, truncated: false })).toBe(false);
    expect(isFinished(withoutAdded(previewOf({ ...SAMPLE, rejected: [] }), 3))).toBe(false);
    expect(isFinished({ rows: [], rejected: [], truncated: false })).toBe(true);
  });
});

describe('pastedMessage', () => {
  const added = (picked: Preview, chips: Parameters<typeof addChips>[0] = [], limit = 60) => {
    const items = chosen(picked);
    const batch = addChips(
      chips,
      items.map((i) => i.person),
      items.map((_, i) => `k${i}`),
      limit,
      TODAY,
    );
    return pastedMessage(
      batch,
      items.map((i) => i.doubt),
      limit,
      TODAY,
    );
  };

  it('says how many were added and how many still ask for a look', () => {
    // Nobody has a salutation: all three ask for one. The doubtful order is one of them already.
    const all = pickRow(preview(), 2, true);
    expect(added(all)).toBe(`Přidáno: 3${NBSP}osoby. Kontrolu vyžadují: 3.`);
  });

  it('counts a missing salutation, and nothing else, as a look when the order is certain', () => {
    const named = salutateRows(preview(), 'pan');
    expect(added(named)).toBe(`Přidáno: 2${NBSP}osoby. Kontrolu vyžadují: 0.`);
    const oneBare = setSalutation(named, 4, null);
    expect(added(oneBare)).toBe(`Přidáno: 2${NBSP}osoby. Kontrolu vyžadují: 1.`);
  });

  it('counts an order left uncertain, even when the salutation is set', () => {
    const named = pickRow(salutateRows(preview(), 'pan'), 2, true);
    expect(added(named)).toBe(`Přidáno: 3${NBSP}osoby. Kontrolu vyžadují: 1.`);
  });

  it('does not count an order that was swapped', () => {
    const named = swapRow(pickRow(salutateRows(preview(), 'pan'), 2, true), 2);
    expect(added(named)).toBe(`Přidáno: 3${NBSP}osoby. Kontrolu vyžadují: 0.`);
  });

  it('does not count a pasted class: it is dated this year', () => {
    const jana = pickRow(pickRow(salutateRows(preview(), 'pani'), 4, false), 1, true);
    expect(added(jana)).toBe(`Přidáno: 1${NBSP}osoba. Kontrolu vyžadují: 0.`);
  });

  it('counts only the people that fitted (Jana, and Zdislav whose order is a guess), and says what did not', () => {
    const named = pickRow(salutateRows(preview(), 'pan'), 2, true);
    const full = [...Array(58).keys()].map((i) => ({
      key: `x${i}`,
      person: { salutation: 'pan' as const, givenName: 'A', familyName: `B${i}` },
    }));
    expect(added(named, full)).toBe(
      `Přidáno: 2${NBSP}osoby. Kontrolu vyžadují: 1. Nevešlo se: 1${NBSP}osoba.`,
    );
  });

  it('says only that the list is full when nothing fitted', () => {
    const full = [...Array(60).keys()].map((i) => ({
      key: `x${i}`,
      person: { salutation: 'pan' as const, givenName: 'A', familyName: `B${i}` },
    }));
    expect(added(preview(), full)).toBe(`Osobu nelze přidat: nejvýše 60${NBSP}osob.`);
  });
});

describe('afterAdd', () => {
  it('leaves nothing and an empty text when the whole preview was added', () => {
    const only = previewOf({ ...SAMPLE, rows: [SAMPLE.rows[0] ?? row(1, 'x', 'y')], rejected: [] });
    expect(afterAdd(only, 1)).toEqual({ preview: null, text: '' });
  });

  it('keeps in the text only the lines still in the preview, rows and rejected lines in line order', () => {
    const after = afterAdd(preview(), 2);
    expect(after.text).toBe('Zdislav Hruška\nMarie');
    expect(after.preview?.rows.map((r) => r.row.source)).toEqual(['Zdislav Hruška']);
  });

  it('numbers what is left as the text now has it, so a re-check reads the same lines', () => {
    const after = afterAdd(preview(), 2).preview;
    expect(after?.rows.map((r) => [r.key, r.row.line])).toEqual([[1, 1]]);
    expect(after?.rejected.map((r) => r.line)).toEqual([2]);
    const again = previewOf(parsePeopleList(afterAdd(preview(), 2).text));
    expect(again.rows.map((r) => r.row.source)).toEqual(['Zdislav Hruška']);
    expect(again.rejected.map((r) => r.line)).toEqual([2]);
  });

  it('keeps what the author chose on the rows that stay', () => {
    const picked = setSalutation(pickRow(preview(), 4, false), 4, 'pani');
    const after = afterAdd(picked, 1).preview;
    expect(after?.rows.map((r) => [r.row.source, r.checked, r.salutation])).toEqual([
      ['Zdislav Hruška', false, null],
      ['Eva Svobodová', false, 'pani'],
    ]);
  });

  it('keeps the rows that did not fit with their text, and the truncation', () => {
    const after = afterAdd(previewOf({ ...SAMPLE, truncated: true }), 1);
    expect(after.text).toBe('Zdislav Hruška\nMarie\nEva Svobodová');
    expect(after.preview?.truncated).toBe(true);
  });

  it('keeps only rejected lines when every row was added', () => {
    const picked = pickRow(preview(), 2, true);
    expect(afterAdd(picked, 3)).toMatchObject({ text: 'Marie' });
  });
});

describe('checkedMessage', () => {
  it('says how many people were read and how many lines were not', () => {
    expect(checkedMessage(preview())).toBe(`Přečteno: 3${NBSP}osoby. Nelze přečíst řádků: 1.`);
  });

  it('leaves the rejected lines out when there are none', () => {
    expect(checkedMessage(previewOf({ ...SAMPLE, rejected: [] }))).toBe(`Přečteno: 3${NBSP}osoby.`);
  });

  it('says what the preview says when nobody was found and nothing rejected', () => {
    expect(checkedMessage(previewOf({ rows: [], rejected: [], truncated: false }))).toBe(
      people.paste.nothing,
    );
  });

  it('says that no one was read when only rejected lines were found', () => {
    expect(
      checkedMessage(previewOf({ rows: [], rejected: SAMPLE.rejected, truncated: false })),
    ).toBe(`Přečteno: 0${NBSP}osob. Nelze přečíst řádků: 1.`);
  });

  it('adds the truncation notice when the text was cut', () => {
    expect(checkedMessage(previewOf({ ...SAMPLE, truncated: true }))).toBe(
      `Přečteno: 3${NBSP}osoby. Nelze přečíst řádků: 1. ${people.paste.truncated}`,
    );
  });
});

describe('a text longer than the limit', () => {
  const pad = ' '.repeat(73);
  const long = Array.from({ length: 50 }, () => `${pad}Jana Nováková`).join('\n');

  it('is read by the parser to whole entries: truncated, and no row with a cut name', () => {
    expect(long.length).toBeGreaterThan(PASTE_MAX_CHARS);
    const read = previewOf(parsePeopleList(long));
    expect(read.truncated).toBe(true);
    expect(read.rejected).toEqual([]);
    expect(read.rows.length).toBeGreaterThan(0);
    for (const entry of read.rows) expect(entry.row.familyName).toBe('Nováková');
  });

  it('is still within what the field lets through, so the parser sees the overflow', () => {
    expect(PASTE_INPUT_CEILING).toBeGreaterThan(PASTE_MAX_CHARS);
    expect(long.length).toBeLessThan(PASTE_INPUT_CEILING);
  });
});
