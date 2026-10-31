import { describe, expect, it } from 'vitest';

import { planCarryOver, type IssueItemLike } from './index';

describe('planCarryOver', () => {
  type Item = IssueItemLike<string> & { readonly title: string };
  const item = (title: string, position: number, rest: Partial<Item> = {}): Item => ({
    title,
    position,
    lineageId: `l-${title}`,
    persistence: 'standing',
    slot: null,
    body: `${title} body`,
    ...rest,
  });

  it('keeps slots and standing items in order, drops one-time items, empties ohlasy', () => {
    const items = [
      item('Provozní pokyny', 4),
      item('Jednání', 0, { slot: 'meetings', body: '' }),
      item('Výzva ředitele', 5, { persistence: 'once' }),
      item('Ohlasy v médiích', 6, { slot: 'media', persistence: 'once', body: 'článek v Deníku' }),
      item('Talenti', 2, { slot: 'talent', body: 'úvodní text' }),
    ];
    expect(planCarryOver(items, '').map((i) => [i.title, i.position, i.body])).toEqual([
      ['Jednání', 0, ''],
      ['Talenti', 1, 'úvodní text'],
      ['Provozní pokyny', 2, 'Provozní pokyny body'],
      ['Ohlasy v médiích', 3, ''],
    ]);
  });

  it('keeps each item’s lineage so its history can be followed', () => {
    expect(planCarryOver([item('A', 3)], '')[0]?.lineageId).toBe('l-A');
  });
});
