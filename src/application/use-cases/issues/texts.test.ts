import { describe, expect, it } from 'vitest';

import { emptyRichDoc } from '@/domain/richtext';

import {
  monday,
  outlineFixtures,
  richText,
  WEEK_1,
  WEEK_2,
  WEEK_3,
} from '../../../../test/support/outline';
import { setupWorld } from '../../../../test/support/world';
import { readIssueTexts, setIssueAnnex2, setIssueDetails } from './index';

const world = setupWorld();
const fx = outlineFixtures(world);

const read = (by: Parameters<typeof fx.readAs>[0], day: string) =>
  world.run(readIssueTexts, world.as(by), { monday: day });

describe('issues.texts', () => {
  it.each(['submitter', 'reviewer', 'pending'] as const)('refuses a %s', async (role) => {
    const user = await world.seed.user({ role });
    expect(await read(user, monday(WEEK_1))).toEqual({ ok: false, error: { code: 'forbidden' } });
  });

  it('answers empty, carried texts for a Monday that has nothing, and writes nothing', async () => {
    const head = await fx.headmaster();
    expect(await read(head, monday(WEEK_1))).toEqual({
      ok: true,
      value: {
        monday: monday(WEEK_1),
        meetingDate: monday(WEEK_1),
        version: null,
        present: '',
        guests: '',
        annex2: emptyRichDoc(),
        carried: { present: true, guests: true, annex2: true },
      },
    });
    expect(await fx.issueOf(WEEK_1)).toBeNull();
    expect(await world.inspect.audit()).toEqual([]);
  });

  it('answers each text on its own: stored where written, carried where not', async () => {
    const head = await fx.headmaster();
    await world.run(setIssueDetails, world.as(head), {
      monday: monday(WEEK_1),
      present: 'Jana',
      guests: 'Petr',
    });
    await world.run(setIssueAnnex2, world.as(head), {
      monday: monday(WEEK_2),
      body: richText('Příloha'),
    });
    expect(await read(head, monday(WEEK_2))).toMatchObject({
      ok: true,
      value: {
        version: 2,
        present: 'Jana',
        guests: 'Petr',
        annex2: richText('Příloha'),
        carried: { present: true, guests: true, annex2: false },
      },
    });
  });

  it('carries a cleared text as cleared and a removed annex as none', async () => {
    const head = await fx.headmaster();
    await world.run(setIssueDetails, world.as(head), {
      monday: monday(WEEK_1),
      present: 'Jana',
      guests: 'Petr',
    });
    await world.run(setIssueAnnex2, world.as(head), {
      monday: monday(WEEK_1),
      body: richText('Příloha'),
      expectedVersion: 2,
    });
    await world.run(setIssueDetails, world.as(head), {
      monday: monday(WEEK_2),
      present: '',
      guests: '',
    });
    await world.run(setIssueAnnex2, world.as(head), {
      monday: monday(WEEK_2),
      body: emptyRichDoc(),
      expectedVersion: 2,
    });
    const third = await read(head, monday(WEEK_3));
    expect(third).toMatchObject({
      ok: true,
      value: { present: '', guests: '', annex2: emptyRichDoc(), carried: { present: true } },
    });
  });

  it('does not find a Monday outside the calendar and refuses a day that is no Monday', async () => {
    const head = await fx.headmaster();
    for (const day of ['2026-10-12', '2030-01-07']) {
      expect(await read(head, day)).toEqual({ ok: false, error: { code: 'not-found' } });
    }
    expect(await read(head, '2026-11-03')).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});
