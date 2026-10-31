/**
 * Czech alphabetical order (IJP id 900): ch after h; č, ř, š, ž are letters
 * of their own; á ď é ě í ň ó ť ú ů ý differ only at the second level.
 */
export const csCollator = new Intl.Collator('cs', { sensitivity: 'variant', numeric: true });

/** „1.A“ → { year: 1, program: '', letter: 'A' }; „L1B“ → { year: 1, program: 'L', letter: 'B' }. */
export interface ClassKey {
  readonly year: number;
  readonly program: string;
  readonly letter: string;
}

/** The longest text that can be a class once trimmed; a longer one is refused before any regex runs. */
const CLASS_CODE_MAX = 12;

/** Spacing is at most two blanks in a row, so the patterns cannot backtrack on a long run. */
const NUMERIC = /^(\d)\s{0,2}\.?\s{0,2}([A-Za-z]{1,2})$/;
const PROGRAM = /^([A-Za-z]{1,2})\s{0,2}(\d)\s{0,2}\.?\s{0,2}([A-Za-z]{0,2})$/;

export function parseClass(text: string): ClassKey | null {
  const raw = text.trim();
  if (raw.length > CLASS_CODE_MAX) return null;
  const numeric = NUMERIC.exec(raw);
  if (numeric)
    return { year: Number(numeric[1]), program: '', letter: (numeric[2] ?? '').toUpperCase() };
  const program = PROGRAM.exec(raw);
  if (program) {
    return {
      year: Number(program[2]),
      program: (program[1] ?? '').toUpperCase(),
      letter: (program[3] ?? '').toUpperCase(),
    };
  }
  return null;
}

/** „1a“, „1. A“, „1.a“ → „1.A“; „l1b“ → „L1B“. Anything else (a role) is only trimmed. */
export function normalizeClass(text: string): string {
  const key = parseClass(text);
  if (!key) return text.trim();
  return key.program ? `${key.program}${key.year}${key.letter}` : `${key.year}.${key.letter}`;
}

export interface ClassOrder {
  /** Rank of a study programme within a year; plain classes („1.A“) have program ''. */
  readonly programRank?: (program: string) => number;
}

const defaultRank = (program: string) => (program === '' ? 0 : 1);

/**
 * Year first, so L1B sits among the first years: 1.A < 1.B < L1B < 2.A.
 * Texts that are not class codes sort after all classes.
 */
export function compareClass(a: string, b: string, order: ClassOrder = {}): number {
  const ka = parseClass(a);
  const kb = parseClass(b);
  if (!ka || !kb) return ka ? -1 : kb ? 1 : csCollator.compare(a.trim(), b.trim());
  const rank = order.programRank ?? defaultRank;
  return (
    ka.year - kb.year ||
    rank(ka.program) - rank(kb.program) ||
    csCollator.compare(ka.program, kb.program) ||
    csCollator.compare(ka.letter, kb.letter)
  );
}

export interface SortableStudent {
  readonly familyName: string;
  readonly givenName: string;
  readonly affiliation?: string;
}

/** Registry and participant order: class, then surname, then given name. */
export function compareStudents(
  a: SortableStudent,
  b: SortableStudent,
  order: ClassOrder = {},
): number {
  return (
    compareClass(a.affiliation ?? '', b.affiliation ?? '', order) ||
    csCollator.compare(a.familyName, b.familyName) ||
    csCollator.compare(a.givenName, b.givenName)
  );
}
