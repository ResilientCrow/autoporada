import type { PointState } from './states';

/**
 * Where a missing report's placeholder stands for the headmaster (ADR 0061): `checked` once they
 * confirmed the paragraph the system writes now; `handed-in` when the author has handed a report
 * in and it awaits a decision; `open` while the author can still hand one in; else `to-check`.
 */
export type PlaceholderStatus = 'checked' | 'handed-in' | 'open' | 'to-check';

export interface PlaceholderBasis {
  /** True when `placeholderChecked` holds for the stored row. */
  readonly checked: boolean;
  /** Where the akce's report point stands; `none` when nobody started one. */
  readonly report: 'none' | PointState;
  /** When hand-in closes for the akce (`reportCloses`). */
  readonly closesAt: Date;
}

export function placeholderStatus(basis: PlaceholderBasis, now: Date): PlaceholderStatus {
  if (basis.checked) return 'checked';
  if (basis.report === 'submitted') return 'handed-in';
  return now.getTime() < basis.closesAt.getTime() ? 'open' : 'to-check';
}

/**
 * A placeholder is checked exactly when the paragraph the headmaster confirmed is the one the
 * system would write now (`basis`): any change to the akce's text, or to the template, un-checks it.
 */
export function placeholderChecked(
  confirmedOriginal: string | null,
  basis: string | null,
): boolean {
  return confirmedOriginal !== null && basis !== null && confirmedOriginal === basis;
}
