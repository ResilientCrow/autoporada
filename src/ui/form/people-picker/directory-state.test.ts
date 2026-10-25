import { describe, expect, it } from 'vitest';

import type { DirectoryHit } from '@/contracts';
import type { RecentPerson } from '@/domain/people';
import { DIRECTORY_LIMITS } from '@/domain/report';

import {
  addedMessage,
  answerOf,
  begin,
  cancel,
  carriedHits,
  DEBOUNCE_MS,
  foundFor,
  type Found,
  IDLE_LEDGER,
  land,
  manualPerson,
  matchRecents,
  mergeHits,
  optionLabel,
  personOfHit,
  personOfRecent,
  searchDelay,
  shouldSearch,
  withoutShown,
} from './directory-state';

const NBSP = '\u00A0';

function recent(given: string, family: string, lastUsed: string, rest: Partial<RecentPerson> = {}) {
  return { salutation: 'pani', givenName: given, familyName: family, lastUsed, ...rest } as const;
}

/** Ten recents, newest first by their dates; names chosen so one query hits several. */
const RECENTS: readonly RecentPerson[] = [
  recent('Jana', 'Nováková', '2026-10-20T10:00:00.000Z'),
  recent('Jan', 'Novák', '2026-10-19T10:00:00.000Z'),
  recent('Eva', 'Svobodová', '2026-10-18T10:00:00.000Z'),
  recent('Tomáš', 'Nováček', '2026-10-17T10:00:00.000Z'),
  recent('Řehoř', 'Černý', '2026-10-16T10:00:00.000Z'),
  recent('Petr', 'Dvořák', '2026-10-15T10:00:00.000Z'),
  recent('Marie', 'Horáková', '2026-10-14T10:00:00.000Z'),
  recent('Karel', 'Procházka', '2026-10-13T10:00:00.000Z'),
  recent('Alena', 'Králová', '2026-10-12T10:00:00.000Z'),
  recent('Zdeněk', 'Veselý', '2026-10-11T10:00:00.000Z'),
];

const names = (list: readonly RecentPerson[]) => list.map((p) => `${p.givenName} ${p.familyName}`);

describe('matchRecents', () => {
  it('lists the eight newest for an empty or blank box, whatever the order given', () => {
    const shuffled = [...RECENTS].reverse();
    expect(names(matchRecents(shuffled, ''))).toEqual(names(RECENTS.slice(0, 8)));
    expect(matchRecents(RECENTS, '   ')).toHaveLength(8);
  });

  it('folds case and diacritics: „novak“ finds Novák and Nováková, newest first', () => {
    expect(names(matchRecents(RECENTS, 'novak'))).toEqual(['Jana Nováková', 'Jan Novák']);
    expect(names(matchRecents(RECENTS, 'ŘEHOŘ'))).toEqual(['Řehoř Černý']);
  });

  it('matches word starts only, not the middle of a word', () => {
    expect(matchRecents(RECENTS, 'ova')).toEqual([]);
    expect(names(matchRecents(RECENTS, 'nov'))).toEqual([
      'Jana Nováková',
      'Jan Novák',
      'Tomáš Nováček',
    ]);
  });

  it('needs every query word to start some word, in any order', () => {
    expect(names(matchRecents(RECENTS, 'jan nov'))).toEqual(['Jana Nováková', 'Jan Novák']);
    expect(names(matchRecents(RECENTS, 'novak jan'))).toEqual(['Jana Nováková', 'Jan Novák']);
    expect(matchRecents(RECENTS, 'jan sv')).toEqual([]);
  });

  it('is not capped at eight once there is a query', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      recent('Adam', `Novák${i}`, `2026-10-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`),
    );
    expect(matchRecents(many, 'adam')).toHaveLength(12);
    expect(matchRecents(many, 'adam')[0]?.familyName).toBe('Novák11');
  });
});

describe('shouldSearch', () => {
  it.each([
    ['', 'on', false],
    ['no', 'on', false],
    ['  no  ', 'on', false],
    ['nov', 'on', true],
    ['  nov ', 'on', true],
    ['nov', 'off', false],
    ['Jana Nováková', 'off', false],
  ] as const)('%j with the directory %s → %s', (text, directory, expected) => {
    expect(shouldSearch(text, directory)).toBe(expected);
  });

  it('starts at the limit the route and the adapter share', () => {
    expect(shouldSearch('x'.repeat(DIRECTORY_LIMITS.minQuery - 1), 'on')).toBe(false);
    expect(shouldSearch('x'.repeat(DIRECTORY_LIMITS.minQuery), 'on')).toBe(true);
  });
});

describe('the request ledger', () => {
  it('lets the latest request land, once', () => {
    const first = begin(IDLE_LEDGER);
    const landed = land(first.ledger, first.id);
    expect(landed).not.toBeNull();
    expect(land(landed ?? IDLE_LEDGER, first.id)).toBeNull();
  });

  it('drops the answer of an older request', () => {
    const a = begin(IDLE_LEDGER);
    const b = begin(a.ledger);
    expect(b.id).not.toBe(a.id);
    expect(land(b.ledger, a.id)).toBeNull();
    expect(land(b.ledger, b.id)).not.toBeNull();
  });

  it('drops a cancelled request, and the older answer stays dropped after the newer landed', () => {
    const a = begin(IDLE_LEDGER);
    expect(land(cancel(a.ledger), a.id)).toBeNull();
    const b = begin(a.ledger);
    const after = land(b.ledger, b.id);
    expect(land(after ?? IDLE_LEDGER, a.id)).toBeNull();
  });

  it('keeps counting after a cancel, so an id is never reused', () => {
    const a = begin(IDLE_LEDGER);
    const b = begin(cancel(a.ledger));
    expect(b.id).toBeGreaterThan(a.id);
  });
});

describe('searchDelay', () => {
  it('is the debounce when nothing blocks the next request', () => {
    expect(searchDelay(1_000, 0)).toBe(DEBOUNCE_MS);
    expect(searchDelay(1_000, 1_000)).toBe(DEBOUNCE_MS);
  });

  it('waits out a rate limit that is longer than the debounce', () => {
    expect(searchDelay(1_000, 6_000)).toBe(5_000);
  });

  it('does not wait less than the debounce for a rate limit about to end', () => {
    expect(searchDelay(1_000, 1_100)).toBe(DEBOUNCE_MS);
  });
});

const HIT: DirectoryHit = {
  graphId: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
  givenName: 'Jana',
  familyName: 'Nováková',
  displayName: 'Jana Nováková',
};

describe('answerOf', () => {
  const ok = (body: unknown) => answerOf({ status: 200, retryAfter: null, body });

  it('gives the hits and no notice for an answer with hits', () => {
    expect(ok({ hits: [HIT] })).toEqual({ hits: [HIT], notice: null, waitMs: 0 });
  });

  it('gives no notice for an answer with no hits and no notice: nobody matched', () => {
    expect(ok({ hits: [] })).toEqual({ hits: [], notice: null, waitMs: 0 });
  });

  it('says the directory is off when the route says so', () => {
    expect(ok({ hits: [], notice: 'off' })).toEqual({ hits: [], notice: 'off', waitMs: 0 });
  });

  it.each(['unavailable', 'timeout', 'denied'])('maps the route notice %s to down', (notice) => {
    expect(ok({ hits: [], notice }).notice).toBe('down');
  });

  it('maps the throttled notice to rate-limited, with the default wait', () => {
    expect(ok({ hits: [], notice: 'throttled' })).toEqual({
      hits: [],
      notice: 'rate-limited',
      waitMs: 5_000,
    });
  });

  it('maps 401 to signed-out', () => {
    expect(answerOf({ status: 401, retryAfter: null, body: null })).toEqual({
      hits: [],
      notice: 'signed-out',
      waitMs: 0,
    });
  });

  it.each([
    ['12', 12_000],
    ['1', 1_000],
    ['0', 1_000],
    ['600', 60_000],
    [null, 5_000],
    ['soon', 5_000],
    ['Wed, 21 Oct 2026 07:28:00 GMT', 5_000],
    ['-3', 5_000],
    ['1.5', 5_000],
  ])('maps 429 with Retry-After %j to rate-limited for %i ms', (retryAfter, waitMs) => {
    expect(answerOf({ status: 429, retryAfter, body: null })).toEqual({
      hits: [],
      notice: 'rate-limited',
      waitMs,
    });
  });

  it.each([400, 403, 413, 500, 502, 204])('maps status %i to down', (status) => {
    expect(answerOf({ status, retryAfter: null, body: { hits: [HIT] } })).toEqual({
      hits: [],
      notice: 'down',
      waitMs: 0,
    });
  });

  it.each([
    ['not an object', 'hits'],
    ['no body', null],
    ['hits missing', {}],
    ['a hit with a field too many', { hits: [{ ...HIT, mail: 'x@example.org' }] }],
    ['a hit with a bad id', { hits: [{ ...HIT, graphId: 'x' }] }],
    ['an unknown notice', { hits: [], notice: 'broken' }],
    ['more hits than a search answers', { hits: Array(DIRECTORY_LIMITS.hits + 1).fill(HIT) }],
    ['an extra key', { hits: [], extra: 1 }],
  ])('maps a 200 with %s to down, not to hits', (_why, body) => {
    expect(ok(body)).toEqual({ hits: [], notice: 'down', waitMs: 0 });
  });
});

describe('mergeHits', () => {
  const hit = (id: string, name: string): DirectoryHit => ({
    graphId: `00000000-0000-4000-8000-00000000000${id}`,
    givenName: name,
    familyName: 'X',
    displayName: `${name} X`,
  });
  const [a, b, c, d] = [hit('1', 'A'), hit('2', 'B'), hit('3', 'C'), hit('4', 'D')];
  const ids = (list: readonly DirectoryHit[]) => list.map((h) => h.givenName);

  it('takes the incoming list when no hit is focused', () => {
    expect(ids(mergeHits([a!, b!], [c!, d!], null))).toEqual(['C', 'D']);
  });

  it('takes the incoming list when the focused hit is still in it', () => {
    expect(ids(mergeHits([a!, b!], [b!, c!], b!.graphId))).toEqual(['B', 'C']);
  });

  it('keeps a focused hit the new answer dropped, at the place it had', () => {
    expect(ids(mergeHits([a!, b!, c!], [c!, d!], b!.graphId))).toEqual(['C', 'B', 'D']);
  });

  it('puts it last when the new answer is shorter than its place', () => {
    expect(ids(mergeHits([a!, b!, c!], [d!], c!.graphId))).toEqual(['D', 'C']);
  });

  it('ignores a focus that is not on a current hit', () => {
    expect(ids(mergeHits([a!], [b!], 'recent:x'))).toEqual(['B']);
  });
});

describe('withoutShown', () => {
  it('drops a hit already listed as a recent with the same directory id', () => {
    const known = recent('Jana', 'Nováková', '2026-10-20T10:00:00.000Z', { graphId: HIT.graphId });
    const other: DirectoryHit = { ...HIT, graphId: '9f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b' };
    expect(withoutShown([HIT, other], [known])).toEqual([other]);
  });

  it('keeps a hit whose namesake was typed, since only the id proves they are one', () => {
    expect(withoutShown([HIT], [recent('Jana', 'Nováková', '2026-10-20T10:00:00.000Z')])).toEqual([
      HIT,
    ]);
  });
});

describe('manualPerson', () => {
  it('splits a typed name and leaves the salutation to the author', () => {
    expect(manualPerson('Jana Nováková')).toEqual({
      salutation: null,
      givenName: 'Jana',
      familyName: 'Nováková',
    });
  });

  it('reads titles on both sides', () => {
    expect(manualPerson('  Mgr. Jan Novák, Ph.D. ')).toEqual({
      salutation: null,
      titlesBefore: 'Mgr.',
      givenName: 'Jan',
      familyName: 'Novák',
      titlesAfter: 'Ph.D.',
    });
  });

  it('takes a lone word as the surname', () => {
    expect(manualPerson('Novák')).toEqual({ salutation: null, givenName: '', familyName: 'Novák' });
  });
});

describe('what an add hands over', () => {
  it('keeps a recent as it was, minus when it was used and the genitive', () => {
    const full = recent('Jana', 'Nováková', '2026-10-20T10:00:00.000Z', {
      graphId: HIT.graphId,
      titlesBefore: 'Mgr.',
      affiliation: '3.B',
      affiliationYear: '2026/2027',
      genitive: 'paní ředitelky',
    });
    expect(personOfRecent(full)).toEqual({
      graphId: HIT.graphId,
      salutation: 'pani',
      titlesBefore: 'Mgr.',
      givenName: 'Jana',
      familyName: 'Nováková',
      affiliation: '3.B',
      affiliationYear: '2026/2027',
    });
  });

  it('takes the id and the two names of a hit, with no salutation and nothing more', () => {
    expect(personOfHit(HIT)).toEqual({
      graphId: HIT.graphId,
      salutation: null,
      givenName: 'Jana',
      familyName: 'Nováková',
    });
  });
});

describe('addedMessage', () => {
  it('names the person and the total, counting the person just added', () => {
    expect(addedMessage(manualPerson('Jana Nováková'), 2)).toBe(
      `Přidáno: Jana Nováková. Celkem: 3${NBSP}osoby.`,
    );
    expect(addedMessage(manualPerson('Jana Nováková'), 0)).toBe(
      `Přidáno: Jana Nováková. Celkem: 1${NBSP}osoba.`,
    );
    expect(addedMessage(manualPerson('Jana Nováková'), 4)).toBe(
      `Přidáno: Jana Nováková. Celkem: 5${NBSP}osob.`,
    );
  });

  it('names the person without titles, so no full stop doubles, and never says the gender', () => {
    const message = addedMessage(manualPerson('Mgr. Jan Novák, Ph.D.'), 0);
    expect(message).toBe(`Přidáno: Jan Novák. Celkem: 1${NBSP}osoba.`);
  });

  it('names a lone surname without a stray space', () => {
    expect(addedMessage(manualPerson('Novák'), 1)).toBe(`Přidáno: Novák. Celkem: 2${NBSP}osoby.`);
  });
});

describe('optionLabel', () => {
  it('writes titles as lists do, and the class in brackets', () => {
    expect(
      optionLabel({
        salutation: null,
        titlesBefore: 'Mgr.',
        givenName: 'Jan',
        familyName: 'Novák',
        titlesAfter: 'Ph.D.',
        affiliation: '3.B',
      }),
    ).toBe('Mgr. Jan Novák, Ph.D. (3.B)');
  });

  it('is the bare name for a person with no class', () => {
    expect(optionLabel({ salutation: 'pani', givenName: 'Eva', familyName: 'Svobodová' })).toBe(
      'Eva Svobodová',
    );
  });
});

describe('foundFor and carriedHits', () => {
  const hit = (n: number, name: string): DirectoryHit => ({
    graphId: `00000000-0000-4000-8000-00000000000${n}`,
    givenName: name,
    familyName: 'Novotný',
    displayName: `${name} Novotný`,
  });
  const answered = (query: string, notice: Found['notice'] = null): Found => ({
    hits: [hit(1, 'Tomáš')],
    notice,
    query,
  });

  it('shows the answer for the text it answers, and for text typed on from it or backed off from it', () => {
    expect(foundFor(answered('nov'), 'nov', 'on').hits).toHaveLength(1);
    expect(foundFor(answered('nov'), 'novo', 'on').hits).toHaveLength(1);
    expect(foundFor(answered('novot'), 'nov', 'on').hits).toHaveLength(1);
    expect(foundFor(answered('nov'), '  NOV ', 'on').hits).toHaveLength(1);
    expect(foundFor(answered('nov', 'down'), 'novo', 'on').notice).toBe('down');
  });

  it('shows no hits of an answer to another text: „dvo“ after „nov“ is not „Novotný“', () => {
    expect(foundFor(answered('nov'), 'dvo', 'on').hits).toEqual([]);
    expect(foundFor(answered('nov'), 'dvo', 'on').notice).toBeNull();
  });

  it('drops a notice of another text, but keeps signed-out and rate-limited', () => {
    expect(foundFor(answered('chyba', 'down'), 'dvo', 'on').notice).toBeNull();
    expect(foundFor(answered('rychle', 'rate-limited'), 'dvo', 'on').notice).toBe('rate-limited');
    expect(foundFor(answered('odhlasen', 'signed-out'), 'dvo', 'on').notice).toBe('signed-out');
  });

  it('shows no hits while the text is too short or the directory is off, whatever was answered', () => {
    expect(foundFor(answered('nov'), 'no', 'on').hits).toEqual([]);
    expect(foundFor(answered('nov'), '', 'on').hits).toEqual([]);
    expect(foundFor(answered('nov'), 'nov', 'off').hits).toEqual([]);
    expect(foundFor(answered('chyba', 'down'), 'ch', 'on').notice).toBeNull();
    expect(foundFor(answered('rychle', 'rate-limited'), '', 'on').notice).toBe('rate-limited');
  });

  it('shows nothing before any answer', () => {
    expect(foundFor({ hits: [], notice: null, query: '' }, 'nov', 'on')).toEqual({
      hits: [],
      notice: null,
    });
  });

  it('carries hits into a merge only for a text the answer relates to', () => {
    expect(carriedHits(answered('nov'), 'novo')).toHaveLength(1);
    expect(carriedHits(answered('nov'), 'dvo')).toEqual([]);
  });
});
