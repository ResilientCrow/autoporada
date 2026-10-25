'use client';

import { useId, useState } from 'react';

import type { DirectoryHit } from '@/contracts';
import { foldForSearch, matchesWordPrefixes, searchWords } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import type { DraftPerson } from '@/domain/report';
import { gallery } from '@/ui/copy';
import { SearchBox, type Directory, type DirectoryFetcher, type RawAnswer } from '@/ui/form';

const { people } = gallery;

const id = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

/** Invented people the stub directory knows. */
const DIRECTORY: readonly DirectoryHit[] = [
  ['Petr', 'Novák', 1],
  ['Jana', 'Nováková', 2],
  ['Eva', 'Novotná', 3],
  ['Tomáš', 'Novotný', 4],
  ['Karel', 'Dvořák', 5],
  ['Marie', 'Svobodová', 6],
].map(([given, family, n]) => ({
  graphId: id(Number(n)),
  givenName: String(given),
  familyName: String(family),
  displayName: `${given} ${family}`,
}));

const recent = (given: string, family: string, day: number, rest: Partial<RecentPerson> = {}) =>
  ({
    salutation: null,
    givenName: given,
    familyName: family,
    lastUsed: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    ...rest,
  }) satisfies RecentPerson;

/** Ten recents, so the empty box shows the newest eight; Jana is also in the directory (listed once). */
const RECENTS: readonly RecentPerson[] = [
  recent('Jana', 'Nováková', 24, { graphId: id(2), salutation: 'pani' }),
  recent('Tomáš', 'Nováček', 23, { affiliation: '3.B' }),
  recent('Eva', 'Svobodová', 22),
  recent('Karel', 'Procházka', 21),
  recent('Marie', 'Horáková', 20),
  recent('Petr', 'Dvořák', 19),
  recent('Alena', 'Králová', 18),
  recent('Zdeněk', 'Veselý', 17),
  recent('Řehoř', 'Černý', 16),
  recent('Ivana', 'Malá', 15),
];

/** The slow query: its answer takes this long, and comes even though the box aborted it. */
const SLOW_QUERY = 'nov';
const SLOW_MS = 1_200;
const FAST_MS = 80;

function later<T>(value: T, ms: number, signal: AbortSignal | null): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

const reply = (body: unknown, status = 200, retryAfter: string | null = null): RawAnswer => ({
  status,
  retryAfter,
  body,
});

/**
 * What the route would answer, over the invented people. A few words answer with
 * a notice instead. The one slow query ignores the abort, as an answer already
 * on the wire would, so the box's own rule that only the latest request lands is
 * what the e2e test proves.
 */
const stubDirectory: DirectoryFetcher = (query, signal) => {
  const folded = foldForSearch(query).trim();
  const { triggers } = people;
  if (folded.includes(triggers.down)) {
    return later(reply({ hits: [], notice: 'unavailable' }), FAST_MS, signal);
  }
  if (folded.includes(triggers.rateLimited)) {
    return later(reply(null, 429, '3'), FAST_MS, signal);
  }
  if (folded.includes(triggers.signedOut)) return later(reply(null, 401), FAST_MS, signal);
  const wanted = searchWords(folded);
  const hits = DIRECTORY.filter((hit) => matchesWordPrefixes(wanted, searchWords(hit.displayName)));
  const slow = folded === SLOW_QUERY;
  return later(reply({ hits }), slow ? SLOW_MS : FAST_MS, slow ? null : signal);
};

/** A search box and what it added, so the demo shows the hand-over. */
function PickerDemo({
  label,
  directory,
  hint,
}: {
  readonly label: string;
  readonly directory: Directory;
  readonly hint?: string;
}) {
  const [added, setAdded] = useState<readonly DraftPerson[]>([]);
  const addedId = useId();
  return (
    <div className="flex flex-col gap-2">
      <SearchBox
        label={label}
        recents={RECENTS}
        directory={directory}
        count={added.length}
        onAdd={(person) => setAdded((before) => [...before, person])}
        fetcher={stubDirectory}
      />
      {hint === undefined ? null : <p>{hint}</p>}
      <p id={addedId} className="font-bold">
        {people.added}
      </p>
      {added.length === 0 ? (
        <p>{people.none}</p>
      ) : (
        <ul aria-labelledby={addedId} className="list-disc pl-6">
          {added.map((person, i) => (
            <li key={i}>{[person.givenName, person.familyName].filter(Boolean).join(' ')}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The people search box twice: against the invented directory, and with the directory off. */
export function PeopleDemos() {
  return (
    <div className="flex flex-col gap-6">
      <PickerDemo label={people.live.label} directory="on" hint={people.live.hint} />
      <PickerDemo label={people.off.label} directory="off" />
    </div>
  );
}
