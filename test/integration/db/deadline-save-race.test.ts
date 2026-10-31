import { describe, expect, it } from 'vitest';

import { readSlots } from '@/application/core';
import { system } from '@/application/ports';
import { ensureIssue, setSkipped } from '@/application/use-cases/issues';
import { saveSettings } from '@/application/use-cases/settings';
import { toDeadlineRule } from '@/contracts';
import { deadline } from '@/domain/calendar';
import { calDate, toIsoDate } from '@/domain/time';

import { setupWorld } from '../../support/world';

const world = setupWorld();

// The clock starts on Monday 19 October 2026: a hand-in goes to 26 October, so a new rule
// applies from 2 November, and 9 November is a Monday nobody was shown.
const AHEAD = calDate(2026, 11, 9);
const SUNDAY = { dayOffset: -1, time: '18:00' };
const NEW_DEADLINE = deadline(AHEAD, toDeadlineRule(SUNDAY));

/** Resolves once another transaction waits on a lock, or `other` (once started) has settled. */
async function blockedOrSettled(other: () => Promise<unknown> | undefined): Promise<void> {
  let settled = false;
  let watched: Promise<unknown> | undefined;
  const done = async () => {
    const started = other();
    if (started && started !== watched) {
      watched = started;
      started.then(
        () => (settled = true),
        () => (settled = true),
      );
    }
    return settled || (await world.pg!.lockWaits()) >= 1;
  };
  await expect.poll(done, { timeout: 5_000 }).toBe(true);
}

/** Resolves when `signal` is called. */
function latch(): { readonly reached: Promise<void>; readonly signal: () => void } {
  let signal: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => {
    signal = resolve;
  });
  return { reached, signal };
}

const aheadRow = async () => {
  const rows = await world.tx(system('test.seed'), (tx) => tx.issues.between(AHEAD, AHEAD), 'read');
  return rows[0];
};

describe('saving a deadline rule against a freeze in flight (READ COMMITTED)', () => {
  it('waits for a writer that read the old rule, then refreezes the Monday it made', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const read = latch();
    const saving: { started?: Promise<unknown> } = {};
    const writer = world.tx(world.as(head), async (tx) => {
      const { rule } = await readSlots(tx, world.clock.now());
      read.signal();
      // Holds the rule it read until the save waits for it (or, without a lock, has finished).
      await read.reached;
      await blockedOrSettled(() => saving.started);
      return ensureIssue(tx, AHEAD, rule);
    });
    await read.reached;
    saving.started = world.run(saveSettings, world.as(head), {
      key: 'deadline',
      value: SUNDAY,
      version: 0,
    });
    const [made, saved] = await Promise.all([writer, saving.started]);
    expect(made.inserted).toBe(true);
    expect(saved).toEqual({ ok: true, value: { version: 1 } });
    expect(await aheadRow()).toMatchObject({ deadlineAt: NEW_DEADLINE, version: 2 });
  });

  it('makes a skip that starts while the save holds the rule freeze by the new one', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const held = latch();
    const skipping: { started?: Promise<unknown> } = {};
    const save = world.tx(world.as(head), async (tx) => {
      await tx.settings.lock('deadline', 'update');
      await tx.settings.save('deadline', SUNDAY, 0);
      held.signal();
      await held.reached;
      await blockedOrSettled(() => skipping.started);
    });
    await held.reached;
    skipping.started = world.run(setSkipped, world.as(head), {
      monday: toIsoDate(AHEAD),
      event: 'skip',
      confirmed: true,
    });
    const [, skipped] = await Promise.all([save, skipping.started]);
    expect(skipped).toMatchObject({ ok: true, value: { status: 'skipped' } });
    expect(await aheadRow()).toMatchObject({ deadlineAt: NEW_DEADLINE });
  });
});
