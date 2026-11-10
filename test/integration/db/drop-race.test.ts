import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { readSlots } from '@/application/core';
import { system } from '@/application/ports';
import { dropIssue, ensureIssue } from '@/application/use-cases/issues';
import { addOutlineItem } from '@/application/use-cases/outline';
import { calDate, parseIsoDate, toIsoDate } from '@/domain/time';
import { createArchStore } from '@/infra/db';

import { seedAnnexes } from '../../support/annexes';
import { setupWorld } from '../../support/world';

const world = setupWorld();

// The clock starts on Monday 19 October 2026; 9 November is a Monday nobody has a row for yet.
const DROPPED = calDate(2026, 11, 9);
const HEIR = '2026-11-16';

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

const rowOf = async (monday: string) =>
  (await world.tx(system('test.seed'), (tx) => tx.issues.between(DROPPED, DROPPED), 'read')).find(
    (row) => toIsoDate(row.monday) === monday,
  );

describe('dropping a porada against a write in flight (READ COMMITTED)', () => {
  it('waits for a writer that made the row, then deletes it', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const read: { signal: () => void } = { signal: () => undefined };
    const reached = new Promise<void>((resolve) => (read.signal = resolve));
    const dropping: { started?: Promise<unknown> } = {};
    const writer = world.tx(world.as(head), async (tx) => {
      const { rule, plannedThrough } = await readSlots(tx, world.clock.now());
      read.signal();
      await blockedOrSettled(() => dropping.started);
      return ensureIssue(tx, DROPPED, { rule, plannedThrough });
    });
    await reached;
    dropping.started = world.run(dropIssue, world.as(head), {
      monday: toIsoDate(DROPPED),
      confirmed: true,
    });
    const [made, dropped] = await Promise.all([writer, dropping.started]);
    expect(made?.inserted).toBe(true);
    expect(dropped).toMatchObject({ ok: true, value: { heir: { monday: HEIR } } });
    expect(await rowOf('2026-11-09')).toBeUndefined();
  });

  it('does not let a write that starts after the drop make the Monday again', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const dropped = await world.run(dropIssue, world.as(head), {
      monday: toIsoDate(DROPPED),
      confirmed: true,
    });
    expect(dropped.ok).toBe(true);
    const made = await world.tx(world.as(head), async (tx) => {
      const { rule, plannedThrough } = await readSlots(tx, world.clock.now());
      return ensureIssue(tx, DROPPED, { rule, plannedThrough });
    });
    expect(made).toBeNull();
    expect(
      await world.run(addOutlineItem, world.as(head), {
        monday: toIsoDate(DROPPED),
        lineageId: crypto.randomUUID(),
        section: 'pokyny',
        title: 'Pozdě',
        persistence: 'standing',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await rowOf('2026-11-09')).toBeUndefined();
  });

  it('ends without a row whichever of a drop and a concurrent outline write goes first', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const [dropped, added] = await Promise.all([
      world.run(dropIssue, world.as(head), { monday: toIsoDate(DROPPED), confirmed: true }),
      world.run(addOutlineItem, world.as(head), {
        monday: toIsoDate(DROPPED),
        lineageId: crypto.randomUUID(),
        section: 'pokyny',
        title: 'Souběh',
        persistence: 'standing',
      }),
    ]);
    expect(dropped.ok).toBe(true);
    // Either the write came first (and its outline was handed to the heir) or it was refused.
    expect(added.ok || added.error.code === 'invalid-input').toBe(true);
    expect(await rowOf('2026-11-09')).toBeUndefined();
  });
});

const annexesOf = async (monday: string) =>
  (
    await world.pg!.owner<{ annexes: unknown }>(
      `SELECT annexes FROM arch_annexes WHERE monday = $1`,
      [monday],
    )
  )[0]?.annexes;

describe('the Arch annexes of a porada against a drop (READ COMMITTED)', () => {
  it('refuses a stale tab saving annexes for a dropped Monday, so a later add starts empty', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const dropped = await world.run(dropIssue, world.as(head), {
      monday: toIsoDate(DROPPED),
      confirmed: true,
    });
    expect(dropped.ok).toBe(true);
    const arch = createArchStore(world.pg!.db);
    expect(
      await arch.saveAnnexes(toIsoDate(DROPPED), [{ id: 'stale' }], head.id, world.clock.now()),
    ).toBe('not-found');
    expect(await annexesOf('2026-11-09')).toBeUndefined();
  });

  it('still saves the annexes of a Monday past the boundary that has no row yet', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const arch = createArchStore(world.pg!.db);
    expect(
      await arch.saveAnnexes('2026-11-23', [{ id: 'ahead' }], head.id, world.clock.now()),
    ).toBe('saved');
    expect(await annexesOf('2026-11-23')).toEqual([{ id: 'ahead' }]);
  });

  it('holds a save back while a calendar change holds the deadline lock', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    const arch = createArchStore(world.pg!.db);
    const saving: { started?: Promise<unknown> } = {};
    const early = await world.tx(world.as(head), async (tx) => {
      await tx.settings.lock('deadline', 'update');
      saving.started = arch.saveAnnexes(HEIR, [{ id: 'late' }], head.id, world.clock.now());
      await blockedOrSettled(() => saving.started);
      return Promise.race([saving.started, Promise.resolve('pending')]);
    });
    expect(early).toBe('pending');
    expect(await saving.started).toBe('saved');
  });

  it('hands over the annexes a save committed while the hand-over waited, not the ones before it', async () => {
    const head = await world.seed.user({ role: 'headmaster' });
    await seedAnnexes(world, DROPPED, [{ id: 'old' }]);
    const read: { signal: () => void } = { signal: () => undefined };
    const reached = new Promise<void>((resolve) => (read.signal = resolve));
    const handing: { started?: Promise<unknown> } = {};
    const saver = world.pg!.db.transaction(async (t) => {
      await t.execute(
        sql`UPDATE arch_annexes SET annexes = '[{"id":"new"}]'::jsonb WHERE monday = '2026-11-09'`,
      );
      read.signal();
      await blockedOrSettled(() => handing.started);
    });
    await reached;
    handing.started = world.tx(world.as(head), (tx) =>
      tx.issueItems.handOverAnnexes(DROPPED, parseIsoDate(HEIR)),
    );
    await Promise.all([saver, handing.started]);
    expect(await annexesOf(HEIR)).toEqual([{ id: 'new' }]);
    expect(await annexesOf('2026-11-09')).toBeUndefined();
  });
});
