import { formatName, type PersonName } from '@/domain/cs';

import type { DraftPerson, PointContent } from './content';

/** The part of a point that says who took part: its bullets. */
type Bullets = Pick<PointContent, 'bullets'>;

/** The person's titles and names in the nominative, trimmed (formatName leaves the salutation out, so any serves for a person who has none yet). */
export function displayName(p: DraftPerson): string {
  const trim = (s: string | undefined) => s?.trim() ?? '';
  const name: PersonName = {
    salutation: p.salutation ?? 'pan',
    titlesBefore: trim(p.titlesBefore),
    givenName: trim(p.givenName),
    familyName: trim(p.familyName),
    titlesAfter: trim(p.titlesAfter),
  };
  return formatName(name);
}

/** The person by given and family name, ignoring case and titles; the two names stay apart. */
export function nameKey(p: DraftPerson): string {
  return `${p.givenName.trim()}|${p.familyName.trim()}`.toLocaleLowerCase('cs');
}

/**
 * The same person: by graphId when both have one, else by given and family
 * name, ignoring case and titles (a typed copy of a listed person still matches).
 * The two names stay apart in the key: „Jan Novák“ „Svoboda“ is not „Jan“
 * „Novák Svoboda“.
 */
export function samePerson(a: DraftPerson, b: DraftPerson): boolean {
  if (a.graphId !== undefined && b.graphId !== undefined) return a.graphId === b.graphId;
  return nameKey(a) === nameKey(b);
}

/** The people of every people bullet in bullet order, duplicates included. */
function everyone(content: Bullets): DraftPerson[] {
  return content.bullets.flatMap((b) => (b.kind === 'people' ? b.people : []));
}

/**
 * The people of every people bullet in bullet order, each once (the first copy of a
 * person stays), in one pass. samePerson is not transitive (two people with different
 * graphIds each match a typed copy by name), so one key per person cannot stand for it;
 * three sets can: the graphIds kept, the names kept, and the names of those kept without
 * a graphId. A newcomer with a graphId repeats a kept one by id or a graphId-less one by
 * name; one without repeats anyone by name.
 */
export function participantsOf(content: Bullets): DraftPerson[] {
  const ids = new Set<string>();
  const names = new Set<string>();
  const namesWithoutId = new Set<string>();
  const kept: DraftPerson[] = [];
  for (const p of everyone(content)) {
    const name = nameKey(p);
    const repeat =
      p.graphId === undefined ? names.has(name) : ids.has(p.graphId) || namesWithoutId.has(name);
    if (repeat) continue;
    kept.push(p);
    names.add(name);
    if (p.graphId === undefined) namesWithoutId.add(name);
    else ids.add(p.graphId);
  }
  return kept;
}

/** Whether `person` is one of the point's participants: someone in a people bullet is the same person. */
export function isParticipant(content: Bullets, person: DraftPerson): boolean {
  return everyone(content).some((p) => samePerson(p, person));
}
