'use client';

import { useState } from 'react';

import type { DirectoryHit } from '@/contracts';
import { foldForSearch, matchesWordPrefixes, searchWords } from '@/domain/cs';
import type { RecentPerson } from '@/domain/people';
import { calDate } from '@/domain/time';
import { gallery } from '@/ui/copy';
import {
  PeopleField,
  useHydrated,
  type Chip,
  type Directory,
  type DirectoryFetcher,
  type RawAnswer,
} from '@/ui/form';
import { buttonStyles } from '@/ui/kit';

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

/** Eleven recents, so the empty box shows the newest eight; Jana is also in the directory (listed once). */
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
  // Settles the order of „Hlaváček Radslav“ in the paste sample: the parser alone cannot tell.
  recent('Radslav', 'Hlaváček', 14),
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

/** The date the demo counts its school year from, so a stale class stays stale. */
const TODAY = calDate(2026, 10, 27);

/** Three invented people: one with no salutation, one with last year's class, one in order. */
const START: readonly Chip[] = [
  { key: 'jana', person: { salutation: 'pani', givenName: 'Jana', familyName: 'Nováková' } },
  { key: 'petr', person: { salutation: null, givenName: 'Petr', familyName: 'Svoboda' } },
  {
    key: 'karel',
    person: {
      salutation: 'pan',
      titlesBefore: 'Mgr.',
      givenName: 'Karel',
      familyName: 'Dvořák',
      affiliation: '3.B',
      affiliationYear: '2025/2026',
    },
  },
];

/** A people field over the invented directory, with its chips kept here as an editor would. */
function PickerDemo({
  label,
  listLabel,
  directory,
  start = [],
  limit,
  hint,
  enclosed = false,
}: {
  readonly label: string;
  readonly listLabel: string;
  readonly directory: Directory;
  readonly start?: readonly Chip[];
  readonly limit?: number;
  readonly hint?: string;
  /** Inside a `<form>` that records a send in `data-sent`, to show a key in the field is not one. */
  readonly enclosed?: boolean;
}) {
  const [chips, setChips] = useState<readonly Chip[]>(start);
  const [sent, setSent] = useState(false);
  const hydrated = useHydrated();
  const field = (
    <>
      <PeopleField
        label={label}
        listLabel={listLabel}
        value={chips}
        onChange={setChips}
        today={TODAY}
        recents={RECENTS}
        directory={directory}
        fetcher={stubDirectory}
        limit={limit}
      />
      {hint === undefined ? null : <p>{hint}</p>}
    </>
  );
  return enclosed ? (
    <form
      data-sent={sent ? 'true' : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        setSent(true);
      }}
      className="flex flex-col gap-2"
    >
      {field}
      <div>
        <button type="submit" disabled={!hydrated} className={buttonStyles('secondary')}>
          {people.chips.send}
        </button>
      </div>
    </form>
  ) : (
    <div className="flex flex-col gap-2">{field}</div>
  );
}

/** The people field three times: against the invented directory, with the directory off, and with people in it. */
export function PeopleDemos() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p>{people.paste.hint}</p>
        <pre className="font-mono">{people.paste.sample.join('\n')}</pre>
      </div>
      <PickerDemo
        label={people.live.label}
        listLabel={people.added}
        directory="on"
        hint={people.live.hint}
      />
      <PickerDemo label={people.off.label} listLabel={people.added} directory="off" />
      <PickerDemo
        label={people.chips.label}
        listLabel={people.chips.list}
        directory="on"
        start={START}
        limit={START.length + 1}
        hint={people.chips.hint}
        enclosed
      />
    </div>
  );
}
