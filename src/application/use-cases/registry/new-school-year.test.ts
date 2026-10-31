import { describe, expect, it } from 'vitest';

import { STEP_UP_MAX_AGE_MS } from '@/domain/policy';

import { registryFixtures } from '../../../../test/support/registry';
import { setupWorld } from '../../../../test/support/world';
import { newSchoolYear } from './index';

const world = setupWorld();
const { people, list, entry, entryById, entriesOf } = registryFixtures(world);

/** The world's clock starts in the school year 2026/2027 or the one before; ask it, not assume it. */
const years = () => {
  const now = world.clock.now();
  const start = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { current: `${start}/${start + 1}`, previous: `${start - 1}/${start}` };
};

async function start() {
  const head = await people.headmaster();
  const english = await list('Angličtina – certifikáty');
  const german = await list('Němčina – certifikáty');
  const fresh = await entry(english.id, 'Nová');
  const printed = await entry(english.id, 'Novák', { printed: true });
  const otherList = await entry(german.id, 'Černý', { printed: true });
  const run = (input: Record<string, unknown>, by = world.as(head)) =>
    world.run(newSchoolYear, by, {
      listIds: [english.id],
      year: years().previous,
      confirmed: true,
      ...input,
    });
  return { head, english, german, fresh, printed, otherList, run };
}

describe('registry.newSchoolYear', () => {
  it('deletes never-printed students, archives the printed ones under the year and keeps the lists', async () => {
    const { head, english, fresh, printed, run } = await start();
    const result = await run({});
    expect(result).toEqual({ ok: true, value: { archived: 1, deleted: 1 } });
    expect(await entryById(fresh.id)).toBeNull();
    expect(await entryById(printed.id)).toMatchObject({
      removedAt: world.clock.now(),
      archivedYear: years().previous,
      version: 2,
    });
    expect(await entriesOf(english.id)).toHaveLength(0);
    const event = (await world.inspect.audit()).at(-1);
    expect(event).toMatchObject({
      actorId: head.id,
      action: 'registry.school_year_archived',
      targetType: 'registry_list',
      targetId: english.id,
    });
    expect(event?.data['meta']).toEqual({ count: 2, year: years().previous });
    expect(JSON.stringify(event?.data)).not.toMatch(/Nová|Novák/);
  });

  it('touches only the lists ticked, and names several of them in the audit', async () => {
    const { english, german, otherList, run } = await start();
    expect(await run({})).toEqual({ ok: true, value: { archived: 1, deleted: 1 } });
    expect(await entryById(otherList.id)).toMatchObject({ removedAt: null, version: 1 });
    expect(await run({ listIds: [english.id, german.id], year: years().current })).toEqual({
      ok: true,
      value: { archived: 1, deleted: 0 },
    });
    const meta = (await world.inspect.audit()).at(-1)?.data['meta'];
    expect(meta).toEqual({ count: 1, year: years().current });
  });

  it('does not touch an already removed student, nor change the year it was archived under', async () => {
    const { english, run } = await start();
    const gone = await entry(english.id, 'Stará', {
      printed: true,
      removedAt: new Date('2025-06-01T00:00:00Z'),
      archivedYear: '2024/2025',
    });
    await run({});
    expect(await entryById(gone.id)).toMatchObject({ archivedYear: '2024/2025', version: 1 });
  });

  it('wants the confirm box, a year of the two offered and lists that exist', async () => {
    const { english, printed, run } = await start();
    expect(await run({ confirmed: false })).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { confirmed: 'required' } },
    });
    expect(await run({ year: '2020/2021' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: { year: 'invalid' } },
    });
    expect(await run({ listIds: [english.id, '0198f000-0000-7000-8000-00000000ffff'] })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(await run({ listIds: ['0198f000-0000-7000-8000-00000000ffff'] })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    });
    expect(await entryById(printed.id)).toMatchObject({ removedAt: null });
    expect(await world.inspect.audit()).toHaveLength(0);
  });

  it('counts a list ticked twice once', async () => {
    const { english, run } = await start();
    expect(await run({ listIds: [english.id, english.id] })).toEqual({
      ok: true,
      value: { archived: 1, deleted: 1 },
    });
  });

  it.each([
    ['no list', { listIds: [] }],
    ['a year that is not a year', { year: 'minule' }],
    ['no year', { year: undefined }],
    ['an unticked box that is not a boolean', { confirmed: 'ano' }],
  ])('refuses %s as invalid input', async (_name, input) => {
    const { run } = await start();
    const result = await run(input);
    expect(!result.ok && result.error.code).toBe('invalid-input');
  });

  it('asks for a fresh sign-in, and archives nothing without it', async () => {
    const { head, printed, run } = await start();
    const stale = world.as(head, {
      authTime: new Date(world.clock.now().getTime() - STEP_UP_MAX_AGE_MS - 1),
    });
    expect(await run({}, stale)).toEqual({ ok: false, error: { code: 'step-up-required' } });
    expect(await entryById(printed.id)).toMatchObject({ removedAt: null });
    const fresh = world.as(head, {
      authTime: new Date(world.clock.now().getTime() - STEP_UP_MAX_AGE_MS + 1000),
    });
    expect((await run({}, fresh)).ok).toBe(true);
  });

  it('is for the headmaster alone', async () => {
    const { printed, run } = await start();
    for (const who of [people.reviewer, people.submitter]) {
      expect(await run({}, world.as(await who()))).toEqual({
        ok: false,
        error: { code: 'forbidden' },
      });
    }
    expect(await entryById(printed.id)).toMatchObject({ removedAt: null });
  });
});
