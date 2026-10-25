import { z } from 'zod';

import type { DirectoryPerson, DirectoryPort, DirectoryResult } from '@/application/ports';
import { directoryHit } from '@/contracts';
import { foldForSearch, matchesWordPrefixes, searchWords } from '@/domain/cs';
import { DIRECTORY_LIMITS } from '@/domain/report';
import { ConfigError } from '@/infra/config';

import { MAX_DEV_PEOPLE } from './limits';

export type ReadFile = (path: string) => string;

/** The file holds what a search may answer, so the route's hit contract checks it. */
const people = z.array(directoryHit).max(MAX_DEV_PEOPLE);

/** A person with the words a query is matched against, folded once. */
interface Entry {
  readonly person: DirectoryPerson;
  readonly words: readonly string[];
}

function load(path: string, readFile: ReadFile): Entry[] {
  // Dev and test only: a bad file stops the boot, with the key and no content (ADR 0015).
  const refuse = (why: string): never => {
    throw new ConfigError([`DIRECTORY_DEV_PATH: ${why}`]);
  };
  let text: string;
  try {
    text = readFile(path);
  } catch {
    return refuse('cannot read the file it points to');
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return refuse('is not JSON');
  }
  const parsed = people.safeParse(json);
  if (!parsed.success) return refuse(`is not a list of at most ${MAX_DEV_PEOPLE} people`);
  return parsed.data.map((p) => ({
    person: p,
    words: [
      ...searchWords(p.givenName),
      ...searchWords(p.familyName),
      ...searchWords(p.displayName),
    ],
  }));
}

/**
 * Searches a JSON file read once when the adapter is created. It matches the way Graph's `$search`
 * does: every word of the query is the start of a word of the name, ignoring case and diacritics.
 */
export function createDevDirectory(path: string, readFile: ReadFile): DirectoryPort {
  const entries = load(path, readFile);
  return {
    search: (query, signal): Promise<DirectoryResult<readonly DirectoryPerson[]>> => {
      try {
        if (signal.aborted) return Promise.resolve({ ok: false, code: 'directory.timeout' });
        const folded = foldForSearch(query).trim();
        if (folded.length < DIRECTORY_LIMITS.minQuery)
          return Promise.resolve({ ok: true, value: [] });
        const wanted = searchWords(folded);
        if (wanted.length === 0) return Promise.resolve({ ok: true, value: [] });
        const value = entries
          .filter((entry) => matchesWordPrefixes(wanted, entry.words))
          .slice(0, DIRECTORY_LIMITS.hits)
          .map((entry) => entry.person);
        return Promise.resolve({ ok: true, value });
      } catch {
        return Promise.resolve({ ok: false, code: 'directory.unavailable' });
      }
    },
  };
}
