import { describe, expect, it } from 'vitest';

import { SEED_OUTLINE } from '@/domain/outline';
import { calDate } from '@/domain/time';

import { issueFixtures } from '../../../../test/support/issues';
import { monday, outlineFixtures, WEEK_1, WEEK_2 } from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { readOutline } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);
const issues = issueFixtures(world);

const read = async (day: Parameters<typeof fx.readAs>[1], by?: Parameters<typeof fx.readAs>[0]) => {
  const result = await fx.readAs(by ?? (await fx.headmaster()), day);
  if (!result.ok) throw new Error(`read refused: ${JSON.stringify(result.error)}`);
  return result.value;
};

describe('outline.read', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)('refuses a %s', async (role) => {
    const user = await world.seed.user({ role });
    expect(await fx.readAs(user, WEEK_1)).toEqual({ ok: false, error: { code: 'forbidden' } });
  });

  it('answers the seed for a Monday with no row, and writes nothing', async () => {
    const value = await read(WEEK_1);
    expect(value).toMatchObject({
      monday: monday(WEEK_1),
      meetingDate: monday(WEEK_1),
      version: null,
      origin: { kind: 'seed', from: null },
    });
    expect(value.pokyny.map((r) => r.lineageId)).toEqual(
      SEED_OUTLINE.pokyny.map((r) => r.lineageId),
    );
    expect(value.hospodareni).toHaveLength(1);
    expect(value.pokyny[0]).toMatchObject({
      slot: 'meetings',
      persistence: 'standing',
      quotes: 0,
      proposal: null,
    });
    expect(await fx.issueOf(WEEK_1)).toBeNull();
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('answers the outline derived from the latest earlier porada, without storing it', async () => {
    const head = await fx.headmaster();
    await fx.addItem(head, WEEK_1, 'Trvalý pokyn');
    await fx.addItem(head, WEEK_1, 'Jednorázový', { persistence: 'once', expectedVersion: 2 });
    const before = await world.inspect.audit();

    const value = await read(WEEK_2, head);
    expect(value).toMatchObject({
      version: null,
      origin: { kind: 'derived', from: monday(WEEK_1) },
    });
    const titles = value.pokyny.map((r) => r.title);
    expect(titles).toContain('Trvalý pokyn');
    expect(titles).not.toContain('Jednorázový');
    expect(await fx.issueOf(WEEK_2)).toBeNull();
    expect(await world.inspect.audit()).toEqual(before);
  });

  it('answers the stored outline with the version of the row', async () => {
    const head = await fx.headmaster();
    await fx.addItem(head, WEEK_1, 'Pokyn');
    expect(await read(WEEK_1, head)).toMatchObject({ version: 2, origin: { kind: 'stored' } });
  });

  it('lists an approved proposal last with its own title, as new until it is placed', async () => {
    const head = await fx.headmaster();
    const pointId = await fx.approvedProposal('finance');
    const value = await read(WEEK_1, head);
    expect(value.pokyny.some((r) => r.proposal)).toBe(false);
    expect(value.hospodareni.at(-1)).toMatchObject({
      lineageId: pointId,
      slot: null,
      persistence: 'once',
      proposal: { pointId, isNew: true },
    });
  });

  it('prints the meeting date of a moved porada beside its Monday', async () => {
    const head = await fx.headmaster();
    await issues.reschedule(WEEK_2, {
      meetingDate: calDate(2026, 11, 4),
      deadlineAt: new Date('2026-11-02T19:00:00Z'),
    });
    expect(await read(WEEK_2, head)).toMatchObject({
      monday: monday(WEEK_2),
      meetingDate: '2026-11-04',
    });
  });

  it('does not find a Monday outside the calendar, and refuses a day that is no Monday', async () => {
    const head = await fx.headmaster();
    for (const day of ['2026-10-12', '2030-01-07']) {
      expect(await world.run(readOutline, world.as(head), { monday: day })).toEqual({
        ok: false,
        error: { code: 'not-found' },
      });
    }
    expect(await world.run(readOutline, world.as(head), { monday: '2026-11-03' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});
