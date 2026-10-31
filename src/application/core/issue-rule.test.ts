import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { DEFAULT_DEADLINE, deadline } from '@/domain/calendar';
import { calDate, isSameDate, parseWallTime } from '@/domain/time';

import { setupWorld } from '../../../test/support/world';
import { readDeadlineRule, readSlots } from './index';

const world = setupWorld();
const job = system('job:test');

const STORED = { dayOffset: -3, time: '12:00' };
const STORED_RULE = { dayOffset: -3, time: parseWallTime('12:00') };

describe('readDeadlineRule', () => {
  const read = () => world.tx(job, (tx) => readDeadlineRule(tx), 'read');

  it('is the default rule while nothing is stored', async () => {
    expect(await read()).toEqual(DEFAULT_DEADLINE);
  });

  it('is the stored rule, with its time as a wall time', async () => {
    await world.seed.setting('deadline', STORED);
    expect(await read()).toEqual(STORED_RULE);
  });
});

describe('readSlots', () => {
  // Tuesday 3 November 2026: the first virtual Monday is the 2nd.
  const NOW = new Date('2026-11-03T10:00:00Z');
  const read = () => {
    world.clock.set(NOW);
    return world.tx(job, (tx) => readSlots(tx, NOW), 'read');
  };

  it('hands back the rule it made the virtual Mondays with', async () => {
    await world.seed.setting('deadline', STORED);
    const { slots, rule } = await read();
    const monday = calDate(2026, 11, 9);
    expect(rule).toEqual(STORED_RULE);
    expect(slots.find((slot) => isSameDate(slot.monday, monday))?.deadlineAt).toEqual(
      deadline(monday, STORED_RULE),
    );
  });
});
