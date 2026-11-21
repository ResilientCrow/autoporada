import { clean } from '../text';
import type { HtmlParser } from './docx';
import { ImportError } from './messages';
import type { Rows } from './rows';
import { MAX_FILE, readSheets } from './sheet';

type Role = 'full' | 'given' | 'family' | 'class';
type Cols = Partial<Record<Role, number>>;

/** A header is looked for among the first rows that hold something: a title may stand above it. */
const HEAD_SCAN = 10;
/** Without a header, the kind of each column is read from this many rows. */
const GUESS_SAMPLE = 200;
/** Without a header, at most this many neighbouring columns make one name (Příjmení, Jméno, a second name). */
const MAX_NAME_COLS = 3;
const MAX_NAME = 100; // a longer cell is a sentence, not a name
const NAME_ROLES: readonly Role[] = ['full', 'given', 'family'];
/** Whole header cells that name the whole person (accents, case and punctuation dropped). Only whole cells: Žák is a surname too. */
const FULL = new Set(['zak', 'zakyne', 'zak yne', 'zaci', 'student', 'studentka', 'studenti', 'ucastnik', 'ucastnice', 'ucastnici', 'osoba', 'osoby', 'jmena', 'name', 'full name', 'cele jmeno']);
/** Words of a header about someone else, or about a contact: never the participant's name or class. */
const OTHER = new Set(['zastupce', 'zastupci', 'zastupcu', 'rodic', 'rodice', 'rodicu', 'matka', 'matky', 'otec', 'otce', 'ucitel', 'ucitele', 'ucitelka', 'ucitelky', 'tridni', 'tridniho', 'kontakt', 'kontaktni', 'email', 'mail', 'telefon', 'adresa']);
const GIVEN = new Set(['first name', 'firstname', 'given name']);
const FAMILY = new Set(['last name', 'lastname', 'surname', 'family name']);
/** A class as Czech schools write it: 3.B, 3B, 3. B, 1.IT, 4.L2. */
const CLASS_LIKE = /^\d{1,2}\s?\.?\s?\p{L}{1,3}\d?$/u;

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

/** What a header cell names, if anything. */
function roleOf(cell: string): Role | null {
  const t = fold(cell); const words = t.split(' ');
  if (!t || words.some((w) => OTHER.has(w))) return null;
  if (FULL.has(t)) return 'full';
  if (words.includes('trida') || t === 'tr' || t === 'class') return 'class';
  if (words.includes('prijmeni')) return words.includes('jmeno') || words.includes('jmena') ? 'full' : 'family';
  if (FAMILY.has(t)) return 'family';
  return words.includes('jmeno') || GIVEN.has(t) ? 'given' : null;
}
const namesSomeone = (cell: string) => { const r = roleOf(cell); return r !== null && NAME_ROLES.includes(r); };

/** A cell as it goes into the list: cleaned, and a comma made a space, as a comma separates people (ADR 0060). */
const part = (s: string | undefined) => clean(s ?? '').replace(/\s*,\s*/g, ' ').trim();
const isName = (s: string) => /\p{L}/u.test(s) && !/[\d@]/.test(s) && s.length <= MAX_NAME;
const filled = (rows: Rows) => rows.filter((r) => r.some((c) => clean(c)));

/**
 * The header among the first rows: of those that name a name column, the one naming the most columns, then the one with
 * the most cells filled, then the first. A title above it names one at most, in a single cell. The first column of each
 * kind wins.
 */
function header(rows: Rows): { at: number; cols: Cols } | null {
  let best: { at: number; cols: Cols; kinds: number; cells: number } | null = null;
  for (const row of filled(rows).slice(0, HEAD_SCAN)) {
    const cols: Cols = {};
    row.forEach((c, i) => { const r = roleOf(c); if (r && cols[r] === undefined) cols[r] = i; });
    if (!NAME_ROLES.some((r) => cols[r] !== undefined)) continue;
    const kinds = Object.keys(cols).length; const cells = row.filter((c) => clean(c)).length;
    if (!best || kinds > best.kinds || (kinds === best.kinds && cells > best.cells)) best = { at: rows.indexOf(row), cols, kinds, cells };
  }
  return best && { at: best.at, cols: best.cols };
}

/** With a header: given and family name in that order when the file has both, else the one name column as it is. */
function nameBy(cols: Cols): (row: string[]) => string {
  const { given, family, full } = cols;
  const one = (row: string[], i: number | undefined) => (i === undefined ? '' : part(row[i]));
  if (given !== undefined && family !== undefined) return (row) => [one(row, given), one(row, family)].filter(Boolean).join(' ') || one(row, full);
  return (row) => one(row, full ?? given ?? family);
}

/** Without a header the values decide: a column of classes, and the first run of name columns, joined as the file has them. */
function guess(rows: Rows): { name: (row: string[]) => string; cls: number | undefined } {
  const sample = rows.slice(0, GUESS_SAMPLE);
  const width = sample.reduce((w, r) => Math.max(w, r.length), 0);
  const kinds = Array.from({ length: width }, (_, j) => {
    const values = sample.map((r) => part(r[j])).filter(Boolean);
    if (!values.length) return 'empty';
    if (values.every((v) => CLASS_LIKE.test(v))) return 'class';
    return values.filter(isName).length * 2 > values.length ? 'name' : 'other';
  });
  const first = kinds.indexOf('name');
  const names: number[] = [];
  for (let j = first; j >= 0 && j < width && kinds[j] === 'name' && names.length < MAX_NAME_COLS; j++) names.push(j);
  const cls = kinds.indexOf('class');
  return { name: (row) => names.map((j) => part(row[j])).filter(Boolean).join(' '), cls: cls < 0 ? undefined : cls };
}

/**
 * The participants a sheet lists, as they go into the Účastníci text: „Tereza Malá (3.B)“, the class only when the
 * row has one. A header row decides the columns (Jméno, Příjmení, Jméno a příjmení, Žák, Třída, ...); without one
 * the values do. Rows whose name is no name (empty, a number, an address, a total) and repeats are left out.
 */
export function namesFromRows(rows: Rows): string[] {
  const head = header(rows);
  const data = head ? rows.slice(head.at + 1) : filled(rows);
  const { name, cls } = head ? { name: nameBy(head.cols), cls: head.cols.class } : guess(data);
  const out = new Set<string>();
  for (const row of data) {
    const n = name(row);
    if (!isName(n) || namesSomeone(n)) continue; // a header again (on every printed page), or one under a title
    const c = cls === undefined ? '' : part(row[cls]);
    out.add(c ? `${n} (${c})` : n);
  }
  return [...out];
}

/** The names of the first sheet that has any; empty when none does. Throws `ImportError` for a file it cannot read. */
export async function readParticipants(file: Blob, parser: HtmlParser): Promise<string[]> {
  if (file.size > MAX_FILE) throw new ImportError('file-too-big'); // before the whole file is read into memory
  for (const rows of await readSheets(new Uint8Array(await file.arrayBuffer()), parser)) {
    const names = namesFromRows(rows);
    if (names.length) return names;
  }
  return [];
}

export type Appended = { text: string; added: number; present: number } | { tooLong: number };

/**
 * The Účastníci text with the names appended after what is typed, „, “ between them. A name already in the text (as one
 * of its comma-separated entries) is not added again. When the result would pass `max`, nothing is added: a list cut
 * short would print as if it were whole.
 */
export function appendNames(now: string, names: readonly string[], max: number): Appended {
  const have = new Set(now.split(',').map(clean).filter(Boolean));
  const fresh = names.filter((n) => !have.has(n));
  const present = names.length - fresh.length;
  if (!fresh.length) return { text: now, added: 0, present };
  const head = now.replace(/[\s,]+$/u, '');
  const text = (head ? `${head}, ` : '') + fresh.join(', ');
  return text.length > max ? { tooLong: text.length } : { text, added: fresh.length, present };
}
