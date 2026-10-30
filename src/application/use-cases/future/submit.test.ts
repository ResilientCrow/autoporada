import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import type { FutureState } from '@/domain/review';

import {
  futureFixtures,
  futureWire,
  readyAkce,
  readyJednani,
  staffer,
} from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { retractFuture, saveFuture, submitFuture } from './index';

const world = setupWorld();
const { start, moveTo, get, snapshot } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const submit = (by: UserRecord, id: string, content: unknown, expectedVersion = 1) =>
  world.run(submitFuture, world.as(by), { id, expectedVersion, content });

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}
const invalid = (fields: Record<string, string>) => ({ code: 'invalid-input', fields });
const forbidden = { code: 'forbidden' };

describe('future.submit', () => {
  it('hands in a ready akce: stored, submitted now, in the history and the audit log', async () => {
    const author = await user();
    const id = await start(author, 'akce');
    world.clock.advance(60_000);
    expect(await submit(author, id, readyAkce())).toEqual({ ok: true, value: { version: 2 } });
    expect(await get(author, id)).toMatchObject({
      state: 'submitted',
      version: 2,
      submittedAt: world.clock.now(),
      content: { title: 'Výlet do Prahy', expectsReport: true },
    });
    const { events, audit } = await snapshot(id);
    expect(events).toEqual([
      expect.objectContaining({
        event: 'submit',
        fromState: 'draft',
        toState: 'submitted',
        actorId: author.id,
      }),
    ]);
    expect(audit.slice(1)).toEqual([
      {
        actorId: author.id,
        action: 'future.submitted',
        targetType: 'future_item',
        targetId: id,
        data: {
          diff: {
            state: { from: 'draft', to: 'submitted' },
            submittedAt: { from: null, to: world.clock.now().toISOString() },
          },
          meta: { kind: 'akce' },
        },
        requestId: 'test',
      },
    ]);
  });

  it('hands in a ready jednání and a returned item', async () => {
    const author = await user();
    const meeting = await start(author, 'jednani');
    expect(await submit(author, meeting, readyJednani())).toMatchObject({ ok: true });
    const returned = await start(author, 'akce');
    await moveTo(author, returned, 'returned');
    expect(await submit(author, returned, readyAkce(), 2)).toEqual({
      ok: true,
      value: { version: 3 },
    });
  });

  it('hands in again after a retract', async () => {
    const author = await user();
    const id = await start(author, 'akce');
    await submit(author, id, readyAkce());
    await world.run(retractFuture, world.as(author), { id, expectedVersion: 2 });
    expect(await submit(author, id, readyAkce(), 3)).toEqual({ ok: true, value: { version: 4 } });
  });

  describe('what a handed-in item must hold', () => {
    const cases: readonly (readonly [string, Record<string, unknown>, Record<string, string>])[] = [
      ['a title', { title: '  ' }, { 'content.title': 'required' }],
      ['a start date', { startDate: null, endDate: null }, { 'content.startDate': 'required' }],
      ['a start time with an end time', { timeFrom: null }, { 'content.timeTo': 'invalid' }],
      [
        'an end time after the start on one day',
        { endDate: null, timeFrom: '14:00', timeTo: '14:00' },
        { 'content.timeTo': 'invalid' },
      ],
      [
        'people when it names who is responsible',
        { responsible: { verb: 'vede', people: [] } },
        { 'content.responsible.people': 'required' },
      ],
      [
        'a family name and a salutation for each responsible person',
        {
          responsible: {
            verb: 'vede',
            people: [staffer, { ...staffer, familyName: ' ', salutation: null }],
          },
        },
        {
          'content.responsible.people.1.familyName': 'required',
          'content.responsible.people.1.salutation': 'required',
        },
      ],
      [
        'a name for the organisation it acts for, if it names one',
        { responsible: { verb: 'vede', behalfOf: ' ', people: [staffer] } },
        { 'content.responsible.behalfOf': 'required' },
      ],
    ];

    it.each(cases)('asks for %s', async (_what, over, fields) => {
      const author = await user();
      const id = await start(author, 'akce');
      await refuses(id, () => submit(author, id, readyAkce(over)), invalid(fields));
    });

    it('lets an end time equal the start on a multi-day akce, and asks for nothing else', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      const content = futureWire({
        title: 'Škola v přírodě',
        startDate: '2026-11-10',
        endDate: '2026-11-12',
        timeFrom: '08:00',
        timeTo: '08:00',
      });
      expect(await submit(author, id, content)).toMatchObject({ ok: true });
    });

    it('refuses a jednání that expects a report', async () => {
      const author = await user();
      const id = await start(author, 'jednani');
      await refuses(
        id,
        () => submit(author, id, readyJednani({ expectsReport: true })),
        invalid({
          'content.expectsReport': 'invalid',
        }),
      );
    });
  });

  describe('access', () => {
    it('answers a stale editor with a conflict', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      await world.run(saveFuture, world.as(author), {
        id,
        expectedVersion: 1,
        content: readyAkce(),
      });
      await refuses(id, () => submit(author, id, readyAkce(), 1), { code: 'conflict' });
    });

    it.each(['submitted', 'approved', 'rejected', 'withdrawn', 'cancelled'] as const)(
      'refuses the author on a %s item',
      async (state: FutureState) => {
        const author = await user();
        const id = await start(author, 'akce');
        await moveTo(author, id, state);
        await refuses(id, () => submit(author, id, readyAkce(), 2), forbidden);
      },
    );

    it('does not find a colleague’s draft', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      const colleague = await user();
      await refuses(id, () => submit(colleague, id, readyAkce()), { code: 'not-found' });
    });

    it.each([
      ['a colleague', { role: 'submitter' }],
      ['a student', { role: 'submitter', isStudent: true }],
      ['a reviewer', { role: 'reviewer' }],
      ['the headmaster', { role: 'headmaster' }],
    ] as const)('refuses %s on an item they can see', async (_who, seed) => {
      const author = await user();
      const id = await start(author, 'akce');
      await moveTo(author, id, 'approved');
      const other = await world.seed.user(seed);
      await refuses(id, () => submit(other, id, readyAkce(), 2), forbidden);
    });
  });
});
