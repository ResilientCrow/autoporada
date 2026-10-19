import { formatName, SALUTATION, type PersonName, type Salutation } from '../names/person';
import { compareStudents, parseClass } from '../sort/class-code';

export interface Person extends PersonName {
  /** Class („1.A“) or job („učitelka fyziky“), shown in parentheses. */
  readonly affiliation?: string;
  /** Written before the salutation: „absolvent pan Jan Novák“. */
  readonly role?: string;
}

export interface ListOptions {
  /** `comma`: „A, B, C“ (participant bullets). `and`: „A, B a C“ (prose). */
  readonly join: 'comma' | 'and';
  /** Order of salutation groups; the template lists slečny, then paní, then pánové. */
  readonly groupOrder?: readonly Salutation[];
  /** `class-surname` for participants; `input` keeps a ranked order (results, jury). */
  readonly order?: 'input' | 'class-surname';
}

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

/** „Mgr. Jana Nováková (1.A)“ */
export function renderPerson(p: Person, showAffiliation = true): string {
  return showAffiliation ? withAffiliation(formatName(p), p.affiliation) : formatName(p);
}

/** The person's class code, if their affiliation is one („1.A“, „L1B“); roles are not. */
function classOf(p: Person): string | undefined {
  const affiliation = p.affiliation?.trim();
  return affiliation && parseClass(affiliation) !== null ? affiliation : undefined;
}

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

/** „oba“, „obě“, „všichni“, „všechny“ — by count and whether all are women. */
function togetherWord(people: readonly Person[]): string {
  const allWomen = people.every((p) => SALUTATION[p.salutation].sex === 'f');
  if (people.length === 2) return allWomen ? 'obě' : 'oba';
  return allWomen ? 'všechny' : 'všichni';
}

/** „(oba 1.A)“ — the class stays with its word, never broken across lines. */
const together = (people: readonly Person[], classCode: string) =>
  `(${togetherWord(people)}\u00A0${classCode})`;

/**
 * Each person's text. Neighbours from the same class share one class at the
 * end of their run: „Tomáš Černý, John Doe (oba 1.A)“; anyone else keeps
 * their own „(2.B)“ or „(učitelka fyziky)“.
 */
function withClassRuns(people: readonly Person[], name: (p: Person) => string): string[] {
  const texts: string[] = [];
  for (let start = 0; start < people.length;) {
    const first = people[start];
    if (!first) break;
    const classCode = classOf(first);
    let end = start + 1;
    while (classCode && end < people.length && classOf(people[end] as Person) === classCode) end++;
    const run = people.slice(start, end);
    if (classCode && run.length >= 2) {
      run.forEach((p, i) =>
        texts.push(i === run.length - 1 ? `${name(p)} ${together(run, classCode)}` : name(p)),
      );
    } else {
      texts.push(withAffiliation(name(first), first.affiliation));
    }
    start = end;
  }
  return texts;
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
export function renderPeople(people: readonly Person[], options: ListOptions): string {
  if (people.length === 0) return '';
  const shared = people.length >= 2 ? sharedClass(people) : undefined;
  const sort = (list: readonly Person[]) =>
    options.order === 'class-surname' ? [...list].sort((a, b) => compareStudents(a, b)) : [...list];

  const withRoles = people.some((p) => p.role?.trim());
  const groups: { label?: string; people: Person[] }[] = withRoles
    ? [{ people: sort(people) }]
    : completeGroupOrder(options.groupOrder)
        .map((salutation) => {
          const members = sort(people.filter((p) => p.salutation === salutation));
          const { label, plural } = SALUTATION[salutation];
          return { label: members.length === 1 ? label : plural, people: members };
        })
        .filter((g) => g.people.length > 0);

  const name = (p: Person) =>
    withRoles
      ? [p.role?.trim(), SALUTATION[p.salutation].label, formatName(p)].filter(Boolean).join(' ')
      : formatName(p);
  const items = groups.flatMap((g) => {
    const texts = shared ? g.people.map(name) : withClassRuns(g.people, name);
    if (g.label && texts[0] !== undefined) texts[0] = `${g.label} ${texts[0]}`;
    return texts;
  });

  const text = joinItems(items, options.join);
  return shared ? `${text} ${together(people, shared)}` : text;
}
