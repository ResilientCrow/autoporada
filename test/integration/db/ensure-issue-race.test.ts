import { describe, expect, it } from 'vitest';

import { system, type NewIssue } from '@/application/ports';
import { calDate } from '@/domain/time';

import { setupWorld } from '../../support/world';

const world = setupWorld();

const ISSUE: NewIssue = {
  monday: calDate(2026, 10, 26),
  meetingDate: calDate(2026, 10, 26),
  schoolYear: '2026/2027',
  deadlineAt: new Date('2026-10-23T10:00:00Z'),
};

describe('ensure issue, two transactions at once (READ COMMITTED)', () => {
  it('inserts once; the second waits on the unique key and reads the committed row', async () => {
    let firstInserted: () => void = () => undefined;
    const inserted = new Promise<void>((resolve) => {
      firstInserted = resolve;
    });
    const ensure = (signal?: () => void) =>
      world.tx(system('test.seed'), async (tx) => {
        const result = await tx.issues.ensure(ISSUE);
        if (signal) {
          signal();
          // Holds its insert uncommitted until the other transaction blocks on the index.
          await expect
            .poll(() => world.pg!.lockWaits(), { timeout: 2_000 })
            .toBeGreaterThanOrEqual(1);
        }
        return result;
      });
    const first = ensure(firstInserted);
    await inserted;
    const second = ensure();
    const [a, b] = await Promise.all([first, second]);
    expect(a.inserted).toBe(true);
    expect(b.inserted).toBe(false);
    expect(b.issue).toEqual(a.issue);
  });

  it('gives one winner when both start together', async () => {
    const results = await Promise.all(
      [1, 2].map(() => world.tx(system('test.seed'), (tx) => tx.issues.ensure(ISSUE))),
    );
    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(new Set(results.map((r) => r.issue.id)).size).toBe(1);
  });
});
