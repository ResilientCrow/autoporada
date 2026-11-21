import { describe, expect, it } from 'vitest';

import type { DraftBullet, DraftPerson, DraftStatement } from '@/domain/report';

import { recentPeople, type RecentSource } from './index';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 19, 8, minute));
const iso = (minute: number) => at(minute).toISOString();

const jan: DraftPerson = { salutation: 'pan', givenName: 'Jan', familyName: 'Novák' };
const eva: DraftPerson = {
  salutation: 'slecna',
  givenName: 'Eva',
  familyName: 'Malá',
  affiliation: '3.B',
  affiliationYear: '2026/2027',
};
const GRAPH = '1b9f3a52-3c1e-4c9b-9d1a-6f4f1c2a7e10';

const bullet = (...people: readonly DraftPerson[]): DraftBullet => ({
  key: 'participants',
  label: 'Účastníci',
  kind: 'people',
  order: 'input',
  people,
});
const text: DraftBullet = { key: 'results', label: 'Výsledky', kind: 'text', text: 'Jan Novák' };
const said = (speaker: DraftPerson | null, speakerGenitive: string): DraftStatement => ({
  speaker,
  speakerGenitive,
  affiliation: 'ředitel',
  quote: 'Bylo to skvělé.',
});

const point = (
  minute: number,
  bullets: readonly DraftBullet[],
  statements: readonly DraftStatement[] = [],
): RecentSource => ({ updatedAt: at(minute), bullets, statements });

const names = (sources: readonly RecentSource[], max = 300) =>
  recentPeople(sources, max).map((p) => `${p.givenName} ${p.familyName}`);

describe('recentPeople', () => {
  it('flattens the people of people bullets and the statement speakers, with when they were used', () => {
    expect(
      recentPeople(
        [point(5, [text, bullet(jan)], [said(eva, 'slečny Evy Malé'), said(null, '')])],
        300,
      ),
    ).toEqual([
      { ...jan, lastUsed: iso(5) },
      { ...eva, genitive: 'slečny Evy Malé', lastUsed: iso(5) },
    ]);
  });

  it('gives nothing for no points, or points without people', () => {
    expect(recentPeople([], 300)).toEqual([]);
    expect(recentPeople([point(1, [text, bullet()], [said(null, 'pana ředitele')])], 300)).toEqual(
      [],
    );
  });

  it('orders the people newest first, whatever order the points come in', () => {
    const petr = { ...jan, givenName: 'Petr', familyName: 'Dvořák' };
    expect(
      names([point(1, [bullet(jan)]), point(9, [bullet(petr)]), point(4, [bullet(eva)])]),
    ).toEqual(['Petr Dvořák', 'Eva Malá', 'Jan Novák']);
  });

  it('keeps the newest copy of a person, with its salutation and class', () => {
    const older = { ...eva, salutation: null, affiliation: '2.B', affiliationYear: '2025/2026' };
    const newer = { ...eva, salutation: 'pani' as const };
    const got = recentPeople([point(1, [bullet(older)]), point(7, [bullet(newer)])], 300);
    // The class is part of the key: 2.B and 3.B are two people of the same name.
    expect(got).toEqual([
      { ...newer, lastUsed: iso(7) },
      { ...older, lastUsed: iso(1) },
    ]);
    const sameClass = recentPeople([point(1, [bullet(eva)]), point(7, [bullet(newer)])], 300);
    expect(sameClass).toEqual([{ ...newer, lastUsed: iso(7) }]);
  });

  it.each<[string, DraftPerson, DraftPerson]>([
    ['case', jan, { ...jan, givenName: 'JAN', familyName: 'novák' }],
    ['diacritics', jan, { ...jan, familyName: 'Novak' }],
    ['spaces around', jan, { ...jan, givenName: ' Jan ', familyName: 'Novák ' }],
    ['the case of the class', eva, { ...eva, affiliation: '3.b' }],
  ])('treats a typed person differing only in %s as one', (_, a, b) => {
    expect(recentPeople([point(1, [bullet(a)]), point(2, [bullet(b)])], 300)).toEqual([
      { ...b, lastUsed: iso(2) },
    ]);
  });

  it('keeps the given and the family name apart in the key', () => {
    const one = { ...jan, givenName: 'Jan Novák', familyName: 'Svoboda' };
    const two = { ...jan, givenName: 'Jan', familyName: 'Novák Svoboda' };
    expect(names([point(1, [bullet(one, two)])])).toEqual([
      'Jan Novák Svoboda',
      'Jan Novák Svoboda',
    ]);
  });

  it('dedupes a directory person by graphId, whatever their name was written as', () => {
    const picked = { ...jan, graphId: GRAPH };
    const renamed = { ...jan, graphId: GRAPH, familyName: 'Nováková', salutation: 'pani' as const };
    expect(recentPeople([point(1, [bullet(picked)]), point(3, [bullet(renamed)])], 300)).toEqual([
      { ...renamed, lastUsed: iso(3) },
    ]);
  });

  it('keeps a directory person and a typed person of the same name as two entries', () => {
    const picked = { ...jan, graphId: GRAPH };
    expect(recentPeople([point(1, [bullet(jan)]), point(3, [bullet(picked)])], 300)).toEqual([
      { ...picked, lastUsed: iso(3) },
      { ...jan, lastUsed: iso(1) },
    ]);
  });

  it('remembers the genitive the author last used for the person', () => {
    const got = recentPeople(
      [
        point(1, [], [said(jan, 'pana Jana Nováka')]),
        point(4, [], [said(jan, 'pana Jendy Nováka')]),
        // Named the same way in a bullet later, with no genitive: the last one used stays.
        point(8, [bullet({ ...jan, affiliationYear: '2026/2027' })]),
      ],
      300,
    );
    expect(got).toEqual([
      { ...jan, affiliationYear: '2026/2027', genitive: 'pana Jendy Nováka', lastUsed: iso(8) },
    ]);
  });

  it.each<[string, DraftPerson, DraftPerson]>([
    [
      'a renamed directory person',
      { ...jan, graphId: GRAPH },
      { ...jan, graphId: GRAPH, familyName: 'Nováková', salutation: 'pani' },
    ],
    ['a changed salutation', jan, { ...jan, salutation: null }],
    ['a changed given name', jan, { ...jan, givenName: 'JAN' }],
  ])('drops an older genitive after %s', (_, older, newer) => {
    const got = recentPeople(
      [point(1, [], [said(older, 'pana Jana Nováka')]), point(5, [bullet(newer)])],
      300,
    );
    expect(got).toEqual([{ ...newer, lastUsed: iso(5) }]);
  });

  it('stops at the first copy that renders the person differently', () => {
    const unaddressed = { ...jan, salutation: null };
    const got = recentPeople(
      [
        point(1, [], [said(jan, 'pana Jana Nováka')]),
        point(3, [bullet(unaddressed)]),
        point(5, [bullet({ ...jan, givenName: ' Jan ', affiliationYear: '2026/2027' })]),
      ],
      300,
    );
    expect(got).toEqual([
      { ...jan, givenName: ' Jan ', affiliationYear: '2026/2027', lastUsed: iso(5) },
    ]);
  });

  it('remembers no blank genitive', () => {
    expect(recentPeople([point(1, [], [said(jan, '  ')])], 300)).toEqual([
      { ...jan, lastUsed: iso(1) },
    ]);
  });

  it('keeps the first copy when two copies of a person share an instant', () => {
    const first = { ...jan, affiliationYear: '2026/2027' };
    expect(recentPeople([point(2, [bullet(first)], [said(jan, 'pana Jana Nováka')])], 300)).toEqual(
      [{ ...first, genitive: 'pana Jana Nováka', lastUsed: iso(2) }],
    );
  });

  it('does not remember a person without a family name', () => {
    const blank = { ...jan, familyName: '  ' };
    const picked = { ...blank, graphId: GRAPH };
    expect(
      recentPeople([point(1, [bullet(blank, picked)], [said(blank, 'pana Jana')])], 300),
    ).toEqual([]);
  });

  it('caps the entries at max, keeping the newest', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      point(i, [bullet({ ...jan, familyName: `Novák ${i}` })]),
    );
    expect(names(many, 3)).toEqual(['Jan Novák 4', 'Jan Novák 3', 'Jan Novák 2']);
    expect(names(many, 0)).toEqual([]);
  });
});
