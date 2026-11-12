import { beforeEach, describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import { calDate, parseIsoDate as d, parseWallTime } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { setupWorld } from '../../../../test/support/world';
import { reportTally } from './index';

const world = setupWorld();
const fixtures = issueFixtures(world);

// Sunday 25 October 2026, 23.00 in Prague: the working porada is the one of Monday 26 October,
// which owes the akce that end from 19 to 25 October.
const SUNDAY_NIGHT = new Date('2026-10-25T22:00:00Z');
const W1 = calDate(2026, 10, 26);

const headmaster = () => world.seed.user({ role: 'headmaster' });
const submitter = () => world.seed.user({ role: 'submitter' });
const read = (by: UserRecord) => world.run(reportTally, world.as(by), {});

async function tally(by: UserRecord) {
  const result = await read(by);
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  return result.value.porada;
}

/** An akce of the 21st whose report point is in `state`. */
async function reported(
  author: UserRecord,
  state: 'draft' | 'returned' | 'withdrawn' | 'submitted' | 'approved' | 'rejected',
) {
  const akce = await fixtures.future({ author, startDate: d('2026-10-21') });
  await fixtures.point({
    author,
    kind: 'report',
    eventDate: d('2026-10-21'),
    futureItemId: akce,
    state,
  });
}

describe('issues.reportTally', () => {
  beforeEach(() => world.clock.set(SUNDAY_NIGHT));

  it.each(['submitter', 'reviewer', 'pending'] as const)('refuses a %s', async (role) => {
    expect(await read(await world.seed.user({ role }))).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    });
  });

  it('counts the akce the working porada owes and those with no report handed in', async () => {
    const head = await headmaster();
    const author = await submitter();
    await fixtures.future({ author, startDate: d('2026-10-22') });
    // Not ended yet, and owed all the same.
    await fixtures.future({
      author,
      startDate: d('2026-10-25'),
      content: { timeTo: parseWallTime('23:30') },
    });
    for (const state of ['draft', 'returned', 'withdrawn', 'submitted', 'approved'] as const) {
      await reported(author, state);
    }
    // A refused report closes its akce (ADR 0056): neither owed nor missing.
    await reported(author, 'rejected');
    // Owed to other porady: not counted.
    await fixtures.future({ author, startDate: d('2026-10-15') });
    await fixtures.future({ author, startDate: d('2026-10-27') });

    expect(await tally(head)).toEqual({
      monday: '2026-10-26',
      meetingDate: '2026-10-26',
      owed: 7,
      missing: 5,
    });
  });

  it('is null when the working porada owes nothing', async () => {
    expect(await tally(await headmaster())).toBeNull();
  });

  it('steps over a porada already held, and a generated one, to the next open one ahead', async () => {
    const head = await headmaster();
    const author = await submitter();
    await fixtures.future({ author, startDate: d('2026-10-28') });
    await fixtures.issue(W1, { status: 'generated' });

    expect(await tally(head)).toMatchObject({ monday: '2026-11-02', owed: 1, missing: 1 });
  });
});
