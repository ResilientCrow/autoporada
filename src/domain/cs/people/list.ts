import { formatName, SALUTATION, type PersonName, type Salutation } from '../names/person';
import { compareStudents, parseClass } from '../sort/class-code';

export interface Person extends PersonName {
  /** Class („1.A“) or role („učitelka fyziky“), shown in parentheses. */
  readonly affiliation?: string;
}

export interface ListOptions {
  /** `comma`: „A, B, C“ (participant bullets). `and`: „A, B a C“ (prose). */
  readonly join: 'comma' | 'and';
  /** Order of salutation groups; the template lists slečny, then paní, then pánové. */
  readonly groupOrder?: readonly Salutation[];
  /** `class-surname` for participants; `input` keeps a ranked order (results, jury). */
  readonly order?: 'input' | 'class-surname';
  /** „slečna Eva Malá a pan Jan Novák (oba 3.B)“ when everyone shares one affiliation. */
  readonly compress?: boolean;
}

const DEFAULT_GROUP_ORDER: readonly Salutation[] = ['slecna', 'pani', 'pan'];

/** „Mgr. Jana Nováková (1.A)“ */
export function renderPerson(p: Person, withAffiliation = true): string {
  const affiliation = p.affiliation?.trim();
  return withAffiliation && affiliation ? `${formatName(p)} (${affiliation})` : formatName(p);
}

/**
 * A class code everyone shares. Roles are never merged: „(obě učitelka
 * fyziky)“ would need the plural noun.
 */
function sharedClass(people: readonly Person[]): string | undefined {
  const first = people[0]?.affiliation?.trim();
  if (!first || parseClass(first) === null) return undefined;
  return people.every((p) => p.affiliation?.trim() === first) ? first : undefined;
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

function joinItems(items: readonly string[], join: ListOptions['join']): string {
  if (join === 'comma' || items.length < 2) return items.join(', ');
  return `${items.slice(0, -1).join(', ')} a ${items[items.length - 1] ?? ''}`;
}

/**
 * Renders a list of people the way the document writes them:
 * „slečna Eva Malá (2.B), pánové John Doe (1.A), Jan Novák (2.A)“.
 */
export function renderPeople(people: readonly Person[], options: ListOptions): string {
  if (people.length === 0) return '';
  const shared = options.compress && people.length >= 2 ? sharedClass(people) : undefined;
  const groupOrder = completeGroupOrder(options.groupOrder);

  const items: string[] = [];
  for (const salutation of groupOrder) {
    const group = people.filter((p) => p.salutation === salutation);
    if (options.order === 'class-surname') group.sort((a, b) => compareStudents(a, b));
    const label = group.length === 1 ? SALUTATION[salutation].label : SALUTATION[salutation].plural;
    group.forEach((p, i) => {
      const name = renderPerson(p, shared === undefined);
      items.push(i === 0 ? `${label} ${name}` : name);
    });
  }

  const text = joinItems(items, options.join);
  return shared ? `${text} (${togetherWord(people)} ${shared})` : text;
}
