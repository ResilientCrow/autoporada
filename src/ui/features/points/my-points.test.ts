import { describe, expect, it } from 'vitest';

import type { PointState } from '@/domain/review';

import { countByGroup, groupMyPoints, type MyPointRow } from './my-points';

const row = (id: string, state: PointState, over: Partial<MyPointRow> = {}): MyPointRow => ({
  id,
  state,
  title: id,
  returnNote: null,
  placement: null,
  ...over,
});

describe('groupMyPoints', () => {
  it('orders the groups: returned, draft, submitted, approved, closed', () => {
    const grouped = groupMyPoints([
      row('a', 'rejected'),
      row('b', 'approved'),
      row('c', 'submitted'),
      row('d', 'draft'),
      row('e', 'returned'),
    ]);
    expect(grouped.map((g) => g.group)).toEqual([
      'returned',
      'draft',
      'submitted',
      'approved',
      'closed',
    ]);
    expect(grouped.map((g) => g.rows.map((r) => r.id))).toEqual([
      ['e'],
      ['d'],
      ['c'],
      ['b'],
      ['a'],
    ]);
  });

  it('keeps the order the rows came in within a group', () => {
    const grouped = groupMyPoints([row('1', 'draft'), row('2', 'submitted'), row('3', 'draft')]);
    expect(grouped[0]?.rows.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('leaves out the groups with no rows, and has none for no rows', () => {
    expect(groupMyPoints([row('x', 'approved')]).map((g) => g.group)).toEqual(['approved']);
    expect(groupMyPoints([])).toEqual([]);
  });

  it('puts rejected and withdrawn points in the collapsed group, and no other', () => {
    const states = [
      'rejected',
      'withdrawn',
      'draft',
      'returned',
      'approved',
      'submitted',
      'published',
    ] as const;
    const grouped = groupMyPoints(states.map((state) => row(state, state)));
    const collapsed = grouped.filter((g) => g.collapsed);
    expect(collapsed.map((g) => g.group)).toEqual(['closed']);
    expect(collapsed[0]?.rows.map((r) => r.id)).toEqual(['rejected', 'withdrawn']);
  });

  it('puts a published point with the approved ones', () => {
    const grouped = groupMyPoints([row('p', 'published'), row('q', 'approved')]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.group).toBe('approved');
    expect(grouped[0]?.rows.map((r) => r.id)).toEqual(['p', 'q']);
  });

  it('hands the rows over as they are', () => {
    const returned = row('r', 'returned', { returnNote: 'Doplňte název.' });
    expect(groupMyPoints([returned])[0]?.rows).toEqual([returned]);
  });
});

describe('countByGroup', () => {
  const counts = (over: Partial<Record<PointState, number>>): Record<PointState, number> => ({
    draft: 0,
    submitted: 0,
    returned: 0,
    approved: 0,
    rejected: 0,
    withdrawn: 0,
    published: 0,
    ...over,
  });

  it('adds the states of a group', () => {
    expect(countByGroup(counts({ approved: 2, published: 3, rejected: 1, withdrawn: 4 }))).toEqual({
      returned: 0,
      draft: 0,
      submitted: 0,
      approved: 5,
      closed: 5,
    });
  });

  it('counts each state in its own group', () => {
    expect(countByGroup(counts({ returned: 1, draft: 2, submitted: 3 }))).toMatchObject({
      returned: 1,
      draft: 2,
      submitted: 3,
    });
  });
});
