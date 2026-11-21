import { foldForSearch } from '@/domain/cs';
import type { DraftPerson, PointContent } from '@/domain/report';

/** A person the author named in one of their own points (design section 4). */
export interface RecentPerson extends DraftPerson {
  /** The genitive the author last wrote for them as a speaker. */
  readonly genitive?: string;
  /** When the point that last named them changed, as ISO text. */
  readonly lastUsed: string;
}

/** The parts of a point the memory reads: who it names, and when it changed. */
export type RecentSource = Pick<PointContent, 'bullets' | 'statements'> & {
  readonly updatedAt: Date;
};

/** The most people the memory gives the picker. */
export const RECENT_PEOPLE_MAX = 300;

interface Copy {
  readonly person: DraftPerson;
  readonly genitive?: string;
}

interface Entry {
  readonly person: DraftPerson;
  readonly lastUsed: string;
  readonly genitive?: string;
  /** Still looking for a genitive among older copies that read the same. */
  readonly open: boolean;
}

const fold = (text: string | undefined) => foldForSearch((text ?? '').trim());

/**
 * One person, however often named: a directory person by their Entra id, a
 * typed one by name and class. The names stay two fields, so „Jan Novák“
 * „Svoboda“ is not „Jan“ „Novák Svoboda“; a typed person and a directory
 * person of the same name stay two (the id is the only proof they are one).
 */
const keyOf = ({ graphId, givenName, familyName, affiliation }: DraftPerson) =>
  JSON.stringify(
    graphId ? ['id', graphId] : ['name', fold(givenName), fold(familyName), fold(affiliation)],
  );

/** Whether two copies give the same 2nd case: salutation and names. */
const readsSame = (a: DraftPerson, b: DraftPerson) =>
  a.salutation === b.salutation &&
  (['givenName', 'familyName'] as const).every(
    (field) => (a[field] ?? '').trim() === (b[field] ?? '').trim(),
  );

/** Folds an older copy of a person into the entry kept from a newer one. */
function older(kept: Entry, person: DraftPerson, genitive: string | undefined): Entry {
  if (!kept.open) return kept;
  if (!readsSame(kept.person, person)) return { ...kept, open: false };
  return genitive === undefined ? kept : { ...kept, genitive, open: false };
}

function copiesIn({ bullets, statements }: RecentSource): Copy[] {
  const named = bullets.flatMap((b) => (b.kind === 'people' ? b.people : []));
  const speakers = statements.flatMap(({ speaker, speakerGenitive }) =>
    speaker ? [{ person: speaker, genitive: speakerGenitive }] : [],
  );
  return [...named.map((person) => ({ person })), ...speakers];
}

/**
 * The people of the author's points, newest first and each once, at most
 * `max`. The newest copy of a person wins with its salutation and class. The
 * genitive is the newest one written for them while their copies still read
 * the same (salutation, names): a later bullet naming them the same
 * way keeps it, a renamed person drops it, since a remembered
 * genitive is prefilled unchecked. A copy at the same instant loses to the
 * one listed first (bullets before speakers). A person without a family name
 * is not remembered: readiness would refuse them anyway.
 */
export function recentPeople(points: readonly RecentSource[], max: number): RecentPerson[] {
  const newestFirst = [...points].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const seen = new Map<string, Entry>();
  for (const point of newestFirst) {
    const lastUsed = point.updatedAt.toISOString();
    for (const { person, genitive } of copiesIn(point)) {
      if (person.familyName.trim() === '') continue;
      const key = keyOf(person);
      const said = genitive?.trim() ? genitive : undefined;
      const kept = seen.get(key);
      seen.set(
        key,
        kept ? older(kept, person, said) : { person, lastUsed, genitive: said, open: !said },
      );
    }
  }
  return [...seen.values()]
    .slice(0, max)
    .map(({ person, lastUsed, genitive }) =>
      genitive === undefined ? { ...person, lastUsed } : { ...person, genitive, lastUsed },
    );
}
