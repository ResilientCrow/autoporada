import { describe, expect, it } from 'vitest';

import { POINT_LIMITS, type BulletSpec } from '@/domain/report';

import { addRow, removeRow, rowsOf, type RowsState } from './rows';

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
