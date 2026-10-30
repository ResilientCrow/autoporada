import { POINT_LIMITS, type BulletSpec } from '@/domain/report';

/** One bullet row of the form. `uid` keeps its fields in place when another row goes; `key` is '' until saved. */
export interface BulletRow {
  readonly uid: number;
  readonly key: string;
  readonly label: string;
  readonly kind: 'people' | 'text';
  readonly required: boolean;
  readonly organisers: boolean;
}

export interface RowsState {
  readonly rows: readonly BulletRow[];
  /** The `uid` of the next row; a removed row's is never reused. */
  readonly next: number;
}

/** The rows a type starts from. */
export function rowsOf(specs: readonly BulletSpec[]): RowsState {
  return {
    rows: specs.map((spec, uid) => ({
      uid,
      key: spec.key,
      label: spec.label,
      kind: spec.kind,
      required: spec.required,
      organisers: spec.role === 'organisers',
    })),
    next: specs.length,
  };
}

/** An empty optional text row at the end; none beyond the most bullets a type may have. */
export function addRow(state: RowsState): RowsState {
  if (state.rows.length >= POINT_LIMITS.bullets) return state;
  const blank: BulletRow = {
    uid: state.next,
    key: '',
    label: '',
    kind: 'text',
    required: false,
    organisers: false,
  };
  return { rows: [...state.rows, blank], next: state.next + 1 };
}

export function removeRow(state: RowsState, uid: number): RowsState {
  return { ...state, rows: state.rows.filter((row) => row.uid !== uid) };
}

/** Where focus goes after a change of the rows: a row's control, or the add button. */
export type RowFocus = { readonly row: number; readonly control: 'label' | 'remove' } | 'add';

/** After an add: the label of the new row, the last one. */
export function focusAfterAdd(before: RowsState): RowFocus {
  return { row: before.rows.length, control: 'label' };
}

/**
 * After a removal: the remove button of the row that took the place of the removed one (the
 * one before it when it was the last), or the add button when none is left; `null` for a row
 * that is not there, so focus stays where it is. A removed button is gone, and focus with it.
 */
export function focusAfterRemove(before: RowsState, uid: number): RowFocus | null {
  const at = before.rows.findIndex((row) => row.uid === uid);
  if (at < 0) return null;
  const left = before.rows.length - 1;
  return left === 0 ? 'add' : { row: Math.min(at, left - 1), control: 'remove' };
}

/** A row's kind, as the select of a row not saved yet sets it. */
export function setKind(state: RowsState, uid: number, kind: BulletRow['kind']): RowsState {
  return { ...state, rows: state.rows.map((row) => (row.uid === uid ? { ...row, kind } : row)) };
}
