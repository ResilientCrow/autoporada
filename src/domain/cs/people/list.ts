import { headedName, type PersonHead } from '../names/heads';
import { formatName, SALUTATION, type PersonName, type Salutation } from '../names/person';
import { compareStudents, parseClass } from '../sort/class-code';

export interface Person extends PersonName {
  /** Class („1.A“) or job („učitelka fyziky“), shown in parentheses. */
  readonly affiliation?: string;
  /** Written before the salutation: „absolvent pan Jan Novák“. */
  readonly role?: string;
  /** A function or a tier that prints between the salutation and the name (ADR 0072): „pan profesor“. */
  readonly head?: PersonHead;
  /** After the head noun, never declined: „pro majetek“. */
  readonly complement?: string;
}

export interface ListOptions {
  /** `comma`: „A, B, C“ (participant bullets). `and`: „A, B a C“ (prose). */
  readonly join: 'comma' | 'and';
  /** Order of salutation groups; the template lists slečny, then paní, then pánové. */
  readonly groupOrder?: readonly Salutation[];
  /** `class-surname` for participants; `input` keeps a ranked order (results, jury). */
  readonly order?: 'input' | 'class-surname';
}

/**
 * One label for the whole list (ADR 0071): „slečny a pánové Eva Malá (3.B), Jan Novák (2.A)“.
 * The people have no salutation of their own; `women` says whether the label is for women alone, which
 * only picks „obě“ / „všechny“ over „oba“ / „všichni“ for a class shared by neighbours.
 */
interface OneLabel {
  readonly label: string | null;
  readonly women: boolean;
}

/** `ListOptions` for a list with one label: grouping and roles do not apply. */
export interface OneLabelOptions extends Pick<ListOptions, 'join' | 'order'> {
  readonly oneLabel: OneLabel;
}

/** A person in a list with one label: no salutation, role, head or complement to write before the name. */
export type UnaddressedPerson = Omit<Person, 'salutation' | 'role' | 'head' | 'complement'>;

const DEFAULT_GROUP_ORDER: readonly Salutation[] = ['slecna', 'pani', 'pan'];

/**
 * „Jan Novák (1.A)“: the text with a class or job in parentheses, as stored.
 * Only the forms normalise class codes: „3M“ or „1. LF“ may be a company or a
 * faculty, which no shape tells apart from a class.
 */
export function withAffiliation(text: string, affiliation: string | undefined): string {
  const trimmed = affiliation?.trim();
  return trimmed ? `${text} (${trimmed})` : text;
}

/** The person's class code („1.A“, „L1B“), if their affiliation is one; jobs are not. */
function classOf(p: Person): string | undefined {
  const affiliation = p.affiliation?.trim();
  return affiliation && parseClass(affiliation) !== null ? affiliation : undefined;
}

/** Nothing in parentheses after the name. */
const isBare = (p: Person) => !p.affiliation?.trim();

/**
 * A class code everyone shares. Roles are never merged: „(obě učitelka
 * fyziky)“ would need the plural noun.
 */
function sharedClass(people: readonly Person[]): string | undefined {
  const first = people[0] && classOf(people[0]);
  return first && people.every((p) => classOf(p) === first) ? first : undefined;
}

/** The requested order, de-duplicated and completed, so nobody is dropped or repeated. */
function completeGroupOrder(order: readonly Salutation[] | undefined): Salutation[] {
  return [...new Set([...(order ?? []), ...DEFAULT_GROUP_ORDER])];
}

const allWomen = (people: readonly Person[]) =>
  people.every((p) => SALUTATION[p.salutation].sex === 'f');

/** „oba“, „obě“, „všichni“, „všechny“ — by count and whether all are women. */
function togetherWord(people: readonly Person[]): string {
  if (people.length === 2) return allWomen(people) ? 'obě' : 'oba';
  return allWomen(people) ? 'všechny' : 'všichni';
}

/** A bare name since the last parenthesis, and whether a group label stands after it. */
interface Bare {
  readonly person: Person;
  readonly acrossLabel: boolean;
}

/**
 * Could the run's „(oba 1.A)“ be read as counting a bare name before it in
 * too? „Petr Dvořák, Jan Novák, Ivo Žák (oba 3.B)“ can. „Obě“ and „všechny“
 * skip men, so they reach the nearest bare woman. A group label marks where
 * a pair starts, so across one only „všichni“ / „všechny“, which fit any
 * number, reach back.
 */
function tailCouldClaim(bare: readonly Bare[], run: readonly Person[]): boolean {
  const women = allWomen(run);
  const nearest = bare.findLast((b) => !women || SALUTATION[b.person.salutation].sex === 'f');
  if (!nearest) return false;
  return !nearest.acrossLabel || run.length >= 3;
}

/** „(oba 1.A)“ — the class stays with its word, never broken across lines. */
const together = (people: readonly Person[], classCode: string) =>
  `(${togetherWord(people)}\u00A0${classCode})`;

/**
 * Each person's text, and the bare names left at the end. Neighbours from the
 * same class share one class at the end of their run: „Tomáš Černý, John Doe
 * (oba 1.A)“; anyone else keeps their own „(2.B)“ or „(učitelka fyziky)“, and
 * so does a run whose tail could claim a bare name before it.
 */
function withClassRuns(
  people: readonly Person[],
  name: (p: Person) => string,
  bareBefore: readonly Bare[],
): { texts: string[]; bare: Bare[] } {
  const texts: string[] = [];
  let bare = [...bareBefore];
  for (let start = 0; start < people.length;) {
    const first = people[start];
    if (!first) break;
    const classCode = classOf(first);
    let end = start + 1;
    while (classCode && end < people.length && classOf(people[end] as Person) === classCode) end++;
    const run = people.slice(start, end);
    if (classCode && run.length >= 2 && !tailCouldClaim(bare, run)) {
      run.forEach((p, i) =>
        texts.push(i === run.length - 1 ? `${name(p)} ${together(run, classCode)}` : name(p)),
      );
    } else {
      for (const p of run) texts.push(withAffiliation(name(p), p.affiliation));
    }
    // Any parenthesis ends the reach of a later tail. A run of two or more
    // always has one, so only a lone person can be bare.
    bare = isBare(first) ? [...bare, { person: first, acrossLabel: false }] : [];
    start = end;
  }
  return { texts, bare };
}

/**
 * One person in a list of people named one by one: „absolvent pan Jan Novák“, „členka PR oddělení
 * paní Jana Malá“, „pan profesor Jan Novák“, „paní Jana Malá“. A role typed by hand goes first, and
 * then an absolvent head would only repeat it.
 */
function namedOnOwn(p: Person): string {
  const role = p.role?.trim();
  const { head, ...rest } = p;
  const named = headedName(role && head === 'absolvent' ? rest : p, formatName(p));
  return role ? `${role} ${named}` : named;
}

function joinItems(items: readonly string[], join: ListOptions['join']): string {
  if (join === 'comma' || items.length < 2) return items.join(', ');
  return `${items.slice(0, -1).join(', ')} a ${items[items.length - 1] ?? ''}`;
}

/**
 * Renders a list of people the way the document writes them:
 * „slečna Eva Malá (2.B), pánové Tomáš Černý, John Doe (oba 1.A)“.
 * People are grouped by salutation (one label per group); with roles they
 * are named one by one: „absolvent pan X a učitelka paní Y“. A class shared
 * by the whole list is written once at the end: „(všichni 1.A)“.
 */
export function renderPeople(people: readonly Person[], options: ListOptions): string;
/** With `oneLabel`: one group under that label, whoever the people are. */
export function renderPeople(
  people: readonly UnaddressedPerson[],
  options: OneLabelOptions,
): string;
export function renderPeople(
  listed: readonly (Person | UnaddressedPerson)[],
  options: ListOptions | OneLabelOptions,
): string {
  if (listed.length === 0) return '';
  const oneLabel = 'oneLabel' in options ? options.oneLabel : undefined;
  // The rest reads a salutation for the grouping and for „obě“ / „oba“; a list with one label has
  // one sex for everybody, so it is given that, and the salutation is never printed.
  const people: readonly Person[] = oneLabel
    ? listed.map((p) => ({ ...p, salutation: oneLabel.women ? 'slecna' : 'pan' }))
    : (listed as readonly Person[]);
  const shared = people.length >= 2 ? sharedClass(people) : undefined;
  const sort = (list: readonly Person[]) =>
    options.order === 'class-surname' ? [...list].sort((a, b) => compareStudents(a, b)) : [...list];

  const withRoles = !oneLabel && people.some((p) => p.role?.trim() || p.head !== undefined);
  const groups: { label?: string; people: Person[] }[] = [];
  if (oneLabel) {
    groups.push({
      ...(oneLabel.label !== null && { label: oneLabel.label }),
      people: sort(people),
    });
  } else if (withRoles) {
    groups.push({ people: sort(people) });
  } else {
    const order = completeGroupOrder('groupOrder' in options ? options.groupOrder : undefined);
    for (const salutation of order) {
      const members = sort(people.filter((p) => p.salutation === salutation));
      const { label, plural } = SALUTATION[salutation];
      if (members.length > 0)
        groups.push({ label: members.length === 1 ? label : plural, people: members });
    }
  }

  const name = (p: Person) => (withRoles ? namedOnOwn(p) : formatName(p));
  const items: string[] = [];
  let bare: Bare[] = [];
  for (const g of groups) {
    // This group's label stands between its runs and every bare name before it.
    const before = g.label ? bare.map((b) => ({ ...b, acrossLabel: true })) : bare;
    const group = shared
      ? { texts: g.people.map(name), bare: [] }
      : withClassRuns(g.people, name, before);
    if (g.label && group.texts[0] !== undefined) group.texts[0] = `${g.label} ${group.texts[0]}`;
    items.push(...group.texts);
    bare = group.bare;
  }

  const text = joinItems(items, options.join);
  return shared ? `${text} ${together(people, shared)}` : text;
}
