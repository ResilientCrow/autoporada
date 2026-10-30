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
