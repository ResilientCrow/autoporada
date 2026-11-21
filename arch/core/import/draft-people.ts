import { normalizeClass, parsePeopleList, PERSON_FIELD_MAX, type KnownName } from '@/domain/cs';
import { nameKey, type DraftPerson } from '@/domain/report';
import type { SheetPerson } from './participants';

export interface Drafted { people: DraftPerson[]; rejected: string[] }

const fits = (p: DraftPerson) => p.givenName.length <= PERSON_FIELD_MAX.name && p.familyName.length <= PERSON_FIELD_MAX.name && (p.affiliation?.length ?? 0) <= PERSON_FIELD_MAX.affiliation;

/**
 * Sheet people as the people of a report's Účastníci row (ADR 0077). Separate columns are taken as they are; a name
 * cell is read as a pasted line (`parsePeopleList` picks the order of the names and a class in parentheses, and a person
 * the author used before settles an order it cannot tell). The class column wins over a class in the cell. No
 * salutation: the row has one label for everybody (ADR 0071). A cell without a surname, or names longer than a person
 * row takes, is `rejected` as written.
 */
export function toDraftPeople(sheet: readonly SheetPerson[], known: readonly KnownName[], year: string): Drafted {
  const people: DraftPerson[] = []; const rejected: string[] = [];
  const add = (source: string, givenName: string, familyName: string, cls: string | undefined) => {
    const p: DraftPerson = { salutation: null, givenName, familyName, ...(cls && { affiliation: normalizeClass(cls), affiliationYear: year }) };
    if (fits(p)) people.push(p); else rejected.push(source);
  };
  for (const s of sheet) {
    if ('givenName' in s) { add(`${s.givenName} ${s.familyName}`, s.givenName, s.familyName, s.cls); continue; }
    const rows = parsePeopleList(s.name, known).rows;
    if (!rows.length) rejected.push(s.name);
    for (const r of rows) add(s.name, r.givenName, r.familyName, s.cls ?? r.affiliation);
  }
  return { people, rejected };
}

export type Added = { people: DraftPerson[]; present: number } | { tooMany: number };

/**
 * The new people not yet in `list` (`nameKey`, ignoring case), each once, and how many were there already. When more
 * than `room` would be added, nothing is: a list cut short would print as if it were whole.
 */
export function addPeople(list: readonly DraftPerson[], fresh: readonly DraftPerson[], room: number): Added {
  const before = new Set(list.map(nameKey)); const seen = new Set(before);
  const people = fresh.filter((p) => { const k = nameKey(p); if (seen.has(k)) return false; seen.add(k); return true; });
  if (people.length > room) return { tooMany: people.length };
  return { people, present: new Set(fresh.map(nameKey).filter((k) => before.has(k))).size };
}
