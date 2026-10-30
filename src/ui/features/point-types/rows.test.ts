import { describe, expect, it } from 'vitest';

import { POINT_LIMITS, type BulletSpec } from '@/domain/report';

import {
  addRow,
  focusAfterAdd,
  focusAfterRemove,
  removeRow,
  rowsOf,
  setKind,
  type RowsState,
} from './rows';

const SPECS: readonly BulletSpec[] = [
  { key: 'hoste', label: 'Hosté', kind: 'people', required: true, role: 'organisers' },
  { key: 'popis', label: 'Popis', kind: 'text', required: false },
];

describe('rowsOf', () => {
  it('turns the specs into rows with their own ids, keeping what the type offers', () => {
    const state = rowsOf(SPECS);
    expect(state.rows).toEqual([
      { uid: 0, key: 'hoste', label: 'Hosté', kind: 'people', required: true, organisers: true },
      { uid: 1, key: 'popis', label: 'Popis', kind: 'text', required: false, organisers: false },
    ]);
    expect(state.next).toBe(2);
  });

  it('is empty for a new type', () => {
    expect(rowsOf([])).toEqual({ rows: [], next: 0 });
  });
});

describe('addRow and removeRow', () => {
  it('adds an empty optional text row with a key of its own, to be made from the label on save', () => {
    const state = addRow(rowsOf(SPECS));
    expect(state.rows.at(-1)).toEqual({
      uid: 2,
      key: '',
      label: '',
      kind: 'text',
      required: false,
      organisers: false,
    });
    expect(state.next).toBe(3);
  });

  it('never gives a removed row id to a later one', () => {
    const state = addRow(removeRow(rowsOf(SPECS), 1));
    expect(state.rows.map((r) => r.uid)).toEqual([0, 2]);
  });

  it('adds nothing beyond the limit', () => {
    let state: RowsState = rowsOf([]);
    for (let i = 0; i < POINT_LIMITS.bullets + 3; i += 1) state = addRow(state);
    expect(state.rows).toHaveLength(POINT_LIMITS.bullets);
  });

  it('removes only the row asked for and ignores an unknown one', () => {
    const state = rowsOf(SPECS);
    expect(removeRow(state, 0).rows.map((r) => r.key)).toEqual(['popis']);
    expect(removeRow(state, 9)).toEqual(state);
  });
});

describe('where focus goes', () => {
  const three = (): RowsState => addRow(rowsOf(SPECS));

  it('lands on the label of the row just added', () => {
    expect(focusAfterAdd(rowsOf(SPECS))).toEqual({ row: 2, control: 'label' });
    expect(focusAfterAdd(rowsOf([]))).toEqual({ row: 0, control: 'label' });
  });

  it('after a removal lands on the remove button of the row that took its place', () => {
    expect(focusAfterRemove(three(), 0)).toEqual({ row: 0, control: 'remove' });
    expect(focusAfterRemove(three(), 1)).toEqual({ row: 1, control: 'remove' });
  });

  it('after removing the last row lands on the one before it', () => {
    expect(focusAfterRemove(three(), 2)).toEqual({ row: 1, control: 'remove' });
  });

  it('after removing the only row lands on the add button, and stays put for an unknown row', () => {
    expect(focusAfterRemove(rowsOf([SPECS[0]!]), 0)).toBe('add');
    expect(focusAfterRemove(three(), 9)).toBeNull();
  });
});

describe('setKind', () => {
  it('sets the kind of one row and no other', () => {
    const state = addRow(rowsOf(SPECS));
    expect(setKind(state, 2, 'people').rows.map((r) => r.kind)).toEqual([
      'people',
      'text',
      'people',
    ]);
    expect(setKind(state, 9, 'people')).toEqual(state);
  });
});
