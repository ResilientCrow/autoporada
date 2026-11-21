/** Rows of cell texts, as a sheet holds them. */
export type Rows = string[][];
/** A sheet is never wider than this for a list of people; a repeated column cannot blow a row up. */
export const MAX_COLS = 100;
/** Nor longer than this. */
export const MAX_ROWS = 10_000;
/** A workbook's sheets read at most. */
export const MAX_SHEETS = 20;

/** A row without the empty cells at its end, filled where it has gaps. */
export const trimRow = (cells: (string | undefined)[]): string[] => {
  const out = Array.from(cells, (c) => c ?? '');
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
};
