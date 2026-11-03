import { describe, expect, it } from 'vitest';

import { system } from '@/application/ports';
import { generateIssue, setPlaceholder } from '@/application/use-cases/issues';
import { calDate, parseIsoDate as d, toIsoDate } from '@/domain/time';

import { issueFixtures } from '../../support/issues';
import { setupWorld } from '../../support/world';

const world = setupWorld();
const fixtures = issueFixtures(world);
const seeder = system('test.seed');

// The clock starts Monday 19 October 2026: the porada of 26 October owes the akce that ended
// from 19 to 25 October.
const W1 = calDate(2026, 10, 26);

/** Holds a transaction that took the issue row until the other one waits on it (or has settled). */
async function holdUntilBlocked(
  other: Promise<unknown>,
  hold: () => Promise<void>,
): Promise<{ readonly otherSettledEarly: boolean }> {
  let settled = false;
  void other.then(
    () => (settled = true),
    () => (settled = true),
  );
  await hold();
  await expect
    .poll(async () => settled || (await world.pg!.lockWaits()) >= 1, { timeout: 5_000 })
    .toBe(true);
  return { otherSettledEarly: settled };
}

describe('placeholder save and generation on one issue row (READ COMMITTED)', () => {
  it('makes a placeholder save wait for whoever holds the issue row, then run after it', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    const akce = await fixtures.future({ author, title: 'Seminář', startDate: d('2026-10-22') });
    const issue = await fixtures.issue(W1);

    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let held: () => void = () => undefined;
    const taken = new Promise<void>((resolve) => (held = resolve));
    const holder = world.tx(seeder, async (tx) => {
      await tx.issues.lock(issue.id);
      held();
      await released;
    });
    await taken;
    const saving = world.run(setPlaceholder, world.as(head), {
      monday: toIsoDate(W1),
      itemId: akce,
      paragraph: 'Vlastní věta.',
      expectedVersion: 0,
    });
    const { otherSettledEarly } = await holdUntilBlocked(saving, async () => undefined);
    release();
    await holder;

    expect(otherSettledEarly).toBe(false);
    expect(await saving).toEqual({ ok: true, value: { version: 1 } });
  });

  it('makes a generation read the placeholders after a save that holds the issue row commits', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const author = await world.seed.user({ role: 'submitter' });
    const akce = await fixtures.future({ author, title: 'Seminář', startDate: d('2026-10-22') });
    // This week's porada did not happen, so W1 is the first one open (ADR 0040).
    await fixtures.issue(calDate(2026, 10, 19), { status: 'skipped' });
    const issue = await fixtures.issue(W1);

    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let saved: () => void = () => undefined;
    const written = new Promise<void>((resolve) => (saved = resolve));
    // The save as setPlaceholder does it: the issue row first, then the text, uncommitted.
    const saving = world.tx(seeder, async (tx) => {
      await tx.issues.lock(issue.id);
      await tx.reportPlaceholders.save(akce, 'Text z uložení.', 0);
      saved();
      await released;
    });
    await written;
    const generating = world.run(generateIssue, world.as(head), {
      monday: toIsoDate(W1),
      confirmed: true,
    });
    const { otherSettledEarly } = await holdUntilBlocked(generating, async () => undefined);
    release();
    await saving;
    const result = await generating;

    expect(otherSettledEarly).toBe(false);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const stored = await world.tx(seeder, (tx) => tx.documents.snapshot(result.value.documentId));
    expect(JSON.stringify(stored?.reports)).toContain('Text z uložení.');
  });
});
