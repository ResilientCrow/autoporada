import { foldForSearch, normalizeClass, parseClass } from '@/domain/cs';

/** The order of the two names on a pasted line; „Jméno Příjmení“ is the default (ADR 0033). */
export type NameOrder = 'given-family' | 'family-given';

export type PasteProblem = 'name-missing' | 'class-missing' | 'class-unknown' | 'duplicate';
export type PasteWarning = 'group-count';

/** One student the paste names, before anything is added. */
export interface PasteRow {
  /** The item as written; shown in the preview, never logged. */
  readonly source: string;
  readonly givenName: string;
  readonly familyName: string;
  /** `normalizeClass` of the class, or null when the item names none. */
  readonly classCode: string | null;
  readonly problems: readonly PasteProblem[];
  readonly warnings: readonly PasteWarning[];
}

/** Whether `text` is a class: „1.A“, „1a“, „1. A“, „L1B“. */
export function isClassCode(text: string): boolean {
  return parseClass(text) !== null;
}

/** The bounds of one paste (ADR 0033); the use case holds the rows to the second. */
export const PASTE_LIMITS = { chars: 20_000, rows: 200 } as const;

type GroupWord = 'oba' | 'obe' | 'vsichni' | 'vsechny';
const GROUP_WORDS: ReadonlySet<string> = new Set<GroupWord>(['oba', 'obe', 'vsichni', 'vsechny']);

interface Item {
  readonly source: string;
  readonly words: readonly string[];
  readonly classCode: string | null;
  /** The group word of `(oba 1.B)`, folded. */
  readonly group: GroupWord | null;
  readonly unknownBracket: boolean;
}

const SPACES = /[   -   　]/g;
const MARKER = /^(?:[-•*–]\s*|\d{1,3}[.)]\s+)/;

/** Splits a line on `,` and `;` outside brackets and on a lowercase „a“ between spaces outside brackets. */
function splitItems(line: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let from = 0;
  let i = 0;
  while (i < line.length) {
    const ch = line.charAt(i);
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === ';')) {
      items.push(line.slice(from, i));
      from = i + 1;
    } else if (depth === 0 && line.startsWith(' a ', i)) {
      items.push(line.slice(from, i));
      from = i + 2;
      i += 1;
    }
    i++;
  }
  items.push(line.slice(from));
  return items.map((s) => s.trim()).filter((s) => s !== '');
}

/** `(oba 1.B)`, `(všichni z 1.C)`: the group word, folded, and the class. */
function readGroup(bracket: string): { group: GroupWord; classCode: string } | null {
  const [first = '', ...rest] = bracket.trim().split(/\s+/);
  const word = foldForSearch(first);
  if (!GROUP_WORDS.has(word)) return null;
  if (rest.length > 0 && ['z', 'ze'].includes(foldForSearch(rest[0] ?? ''))) rest.shift();
  const classText = rest.join(' ');
  return isClassCode(classText)
    ? { group: word as GroupWord, classCode: normalizeClass(classText) }
    : null;
}

function readItem(source: string): Item {
  const brackets = [...source.matchAll(/\(([^()]*)\)/g)].map((m) => m[1] ?? '');
  const stripped = source.replace(/\([^()]*\)/g, ' ');
  const stray = /[()]/.test(stripped);
  const words = stripped.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);
  let classCode: string | null = null;
  let group: GroupWord | null = null;
  let unknownBracket = stray;
  for (const [index, bracket] of brackets.entries()) {
    const grouped = index === 0 ? readGroup(bracket) : null;
    if (index === 0 && isClassCode(bracket)) classCode = normalizeClass(bracket);
    else if (grouped) ({ group, classCode } = grouped);
    else unknownBracket = true;
  }
  const last = words.at(-1);
  if (last !== undefined && isClassCode(last)) {
    words.pop();
    classCode ??= normalizeClass(last);
  }
  return { source, words, classCode, group, unknownBracket };
}

/** A line with a tab is one row of columns: the last class column is the class, the rest the name. */
function readColumns(line: string): Item {
  const columns = line
    .split('\t')
    .map((c) => c.trim())
    .filter(Boolean);
  const at = columns.findLastIndex(isClassCode);
  const classCode = at < 0 ? null : normalizeClass(columns[at] ?? '');
  const words = columns
    .filter((_, i) => i !== at)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);
  return { source: line.trim(), words, classCode, group: null, unknownBracket: false };
}

function readItems(text: string): Item[] {
  const lines = text
    .normalize('NFC')
    .replace(SPACES, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(MARKER, ''))
    .filter((l) => l.trim() !== '');
  return lines.flatMap((line) =>
    line.includes('\t') ? [readColumns(line)] : splitItems(line).map(readItem),
  );
}

/** What a group word counts as a good size: oba/obě are two, všichni/všechny at least two. */
const groupFits = (group: GroupWord, count: number) =>
  group === 'oba' || group === 'obe' ? count === 2 : count >= 2;

const studentKey = (given: string, family: string, classCode: string) =>
  [given, family, classCode].map(foldForSearch).join('\u0000');

/**
 * The students a pasted class list names (ADR 0033, D12): the document's own list format
 * (`Jana Nováková (1.A), Patricie Nováková, Anna Nováková (obě 2.B)`), a name and a class per line,
 * or tab columns. Pure: the preview shows what comes out and nothing is added before the user
 * ticks it. `existing` are the names already on the list; a row equal to one of them, or to an
 * earlier row, folded for case and diacritics, is a `duplicate`.
 */
export function parsePaste(
  text: string,
  order: NameOrder = 'given-family',
  existing: readonly { givenName: string; familyName: string; classCode: string }[] = [],
): PasteRow[] {
  const items = readItems(text);
  const classes = items.map((item) => item.classCode);
  const warned = new Set<number>();
  let lastClassed = -1;
  for (const [index, item] of items.entries()) {
    if (item.classCode === null) continue;
    if (item.group !== null) {
      const covered = index - lastClassed;
      for (let j = lastClassed + 1; j < index; j++) classes[j] = item.classCode;
      if (!groupFits(item.group, covered)) {
        for (let j = lastClassed + 1; j <= index; j++) warned.add(j);
      }
    }
    lastClassed = index;
  }
  const seen = new Set(existing.map((e) => studentKey(e.givenName, e.familyName, e.classCode)));
  return items.map((item, index): PasteRow => {
    const [first = '', ...others] = item.words;
    const last = item.words.at(-1) ?? '';
    const named = item.words.length >= 2;
    const givenName = !named
      ? ''
      : order === 'given-family'
        ? item.words.slice(0, -1).join(' ')
        : others.join(' ');
    const familyName = !named ? first : order === 'given-family' ? last : first;
    const classCode = classes[index] ?? null;
    const problems: PasteProblem[] = [];
    if (!named) problems.push('name-missing');
    if (item.unknownBracket) problems.push('class-unknown');
    else if (classCode === null) problems.push('class-missing');
    if (named && classCode !== null) {
      const key = studentKey(givenName, familyName, classCode);
      if (seen.has(key)) problems.push('duplicate');
      seen.add(key);
    }
    return {
      source: item.source,
      givenName,
      familyName,
      classCode,
      problems,
      warnings: warned.has(index) ? ['group-count'] : [],
    };
  });
}
