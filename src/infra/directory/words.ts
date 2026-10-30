import type { DirectoryPerson } from '@/application/ports';
import { matchesWordPrefixes, searchWords } from '@/domain/cs';

/** The folded words of a person's names, which a query is matched against. */
function nameWords(person: DirectoryPerson): string[] {
  return [
    ...searchWords(person.givenName),
    ...searchWords(person.familyName),
    ...searchWords(person.displayName),
  ];
}

/** The rule of Graph's `$search`, shared by the adapters: every wanted word starts a word of a name. */
export function matchesQuery(wanted: readonly string[], person: DirectoryPerson): boolean {
  return matchesWordPrefixes(wanted, nameWords(person));
}
