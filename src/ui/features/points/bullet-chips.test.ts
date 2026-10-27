import { describe, expect, it } from 'vitest';

import type { DraftPerson } from '@/domain/report';

import { setPeople } from './bullets-state';
import { keyBullets, stripKeys } from './bullet-chips';
import type { PointContentWire } from './fields';

type Bullets = PointContentWire['bullets'];

const person = (givenName: string): DraftPerson => ({
  salutation: 'pan',
  givenName,
  familyName: 'Novák',
});

const BULLETS: Bullets = [
  {
    key: 'organizatori',
    label: 'Organizátoři',
    kind: 'people',
    order: 'input',
    people: [person('Jan')],
  },
  {
    key: 'ucastnici',
    label: 'Účastníci',
    kind: 'people',
    order: 'class-surname',
    people: [person('Eva'), person('Petr')],
  },
  { key: 'vysledky', label: 'Výsledky', kind: 'text', text: 'Vyhrál 3.B' },
];

const chipKeys = (bullets: ReturnType<typeof keyBullets>) =>
  bullets.flatMap((b) => (b.kind === 'people' ? b.people.map((c) => c.key) : []));

describe('keyBullets', () => {
  it('gives every person of every people bullet a key of their own', () => {
    const keys = chipKeys(keyBullets(BULLETS));
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
  });

  it('gives the same keys to the same content, so server and browser render alike', () => {
    expect(chipKeys(keyBullets(BULLETS))).toEqual(chipKeys(keyBullets(BULLETS)));
  });

  it('keeps the bullets and the people as they were', () => {
    expect(stripKeys(keyBullets(BULLETS))).toEqual(BULLETS);
  });
});

describe('stripKeys', () => {
  it('leaves no key on a person in the content that is saved', () => {
    const saved = JSON.stringify(stripKeys(keyBullets(BULLETS)));
    expect(saved).not.toContain('"key":"organizatori.');
    expect(saved).not.toMatch(/"person"/);
    for (const key of chipKeys(keyBullets(BULLETS))) expect(saved).not.toContain(key);
  });

  it('copies the people, so the wire content never shares a list with the chips', () => {
    const keyed = keyBullets(BULLETS);
    const [first] = stripKeys(keyed);
    expect(first?.kind === 'people' && Array.isArray(first.people)).toBe(true);
  });
});

describe('keys across edits', () => {
  it('survive a removal, an addition and a move of the people around them', () => {
    const keyed = keyBullets(BULLETS);
    const [eva, petr] = keyed[1]?.kind === 'people' ? keyed[1].people : [];
    if (!eva || !petr) throw new Error('fixture');
    const added = { key: 'new-key', person: person('Jana') };
    const moved = setPeople(keyed, 'ucastnici', [petr, added]);
    const again = setPeople(moved, 'ucastnici', [added, petr]);
    const chips = again[1]?.kind === 'people' ? again[1].people : [];
    expect(chips.map((c) => c.key)).toEqual(['new-key', petr.key]);
    expect(stripKeys(again)[1]).toMatchObject({
      people: [{ givenName: 'Jana' }, { givenName: 'Petr' }],
    });
  });

  it('leave the other bullets’ chips the very same objects', () => {
    const keyed = keyBullets(BULLETS);
    const next = setPeople(keyed, 'ucastnici', []);
    expect(next[0]).toBe(keyed[0]);
  });
});
