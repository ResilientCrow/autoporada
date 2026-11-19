import { describe, expect, it } from 'vitest';

import type { UserRecord } from '@/application/ports';
import { FUTURE_CAP } from '@/domain/report';
import type { FutureState } from '@/domain/review';

import {
  futureFixtures,
  futureWire,
  readyAkce,
  readyJednani,
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
      content: { title: 'Výlet do Prahy' },
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
      [
        'a role when an organizer is named',
        { organizer: 'Jana Nováková', organizerRole: null },
        { 'content.organizerRole': 'required' },
      ],
      ['a start date', { startDate: null, endDate: null }, { 'content.startDate': 'required' }],
      ['a start time with an end time', { timeFrom: null }, { 'content.timeTo': 'invalid' }],
      [
        'an end time after the start on one day',
        { endDate: null, timeFrom: '14:00', timeTo: '14:00' },
        { 'content.timeTo': 'invalid' },
      ],
      [
        'an end time after the start when the end date is the start date',
        { endDate: '2026-11-10', timeFrom: '14:00', timeTo: '13:00' },
        { 'content.timeTo': 'invalid' },
      ],
    ];

    it.each(cases)('asks for %s', async (_what, over, fields) => {
      const author = await user();
      const id = await start(author, 'akce');
      await refuses(id, () => submit(author, id, readyAkce(over)), invalid(fields));
    });

    it('asks for an address when participants are typed (ADR 0071)', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      await refuses(
        id,
        () => submit(author, id, readyAkce({ participants: 'Eva Malá (3.B)' })),
        invalid({ 'content.participantsAddress': 'required' }),
      );
    });

    it('asks for several people when the address is „slečny a pánové“, and no more', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      const one = { participants: 'Eva Malá (3.B)', participantsAddress: 'slecny-a-panove' };
      await refuses(
        id,
        () => submit(author, id, readyAkce(one)),
        invalid({ 'content.participantsAddress': 'several' }),
      );
      const many = { participants: 'Eva Malá (3.B), Jan Novák (2.A)' };
      expect(
        await submit(author, id, readyAkce({ ...many, participantsAddress: 'slecny-a-panove' })),
      ).toMatchObject({ ok: true });
    });

    it.each(['slecny', 'panove', 'bez-osloveni'])(
      'takes %s for one person and for several',
      async (participantsAddress) => {
        const author = await user();
        for (const participants of ['Eva Malá (3.B)', 'Eva Malá (3.B), Jan Novák (2.A)']) {
          const id = await start(author, 'akce');
          const content = readyAkce({ participants, participantsAddress });
          expect(await submit(author, id, content)).toMatchObject({ ok: true });
        }
      },
    );

    it('asks for no address when no participants are typed', async () => {
      const author = await user();
      for (const participants of [null, '', '   ']) {
        const id = await start(author, 'akce');
        expect(await submit(author, id, readyAkce({ participants }))).toMatchObject({ ok: true });
      }
    });

    it('refuses an address on a jednání: it prints as typed', async () => {
      const author = await user();
      const id = await start(author, 'jednani');
      await refuses(
        id,
        () => submit(author, id, readyJednani({ participantsAddress: 'slecny' })),
        invalid({ 'content.participantsAddress': 'invalid' }),
      );
      const typed = readyJednani({ participants: 'vedení školy' });
      expect(await submit(author, id, typed)).toMatchObject({ ok: true });
    });

    it('asks for no role when nobody is named', async () => {
      const author = await user();
      for (const organizer of [null, '', '   ']) {
        const id = await start(author, 'akce');
        const over = { organizer, organizerRole: null };
        expect(await submit(author, id, readyAkce(over))).toMatchObject({ ok: true });
      }
    });

    it('refuses a time on a multi-day akce: it prints none', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      const over = { endDate: '2026-11-12', timeFrom: '08:00', timeTo: '08:00' };
      await refuses(
        id,
        () => submit(author, id, readyAkce(over)),
        invalid({ 'content.timeFrom': 'invalid' }),
      );
      const onlyTo = { endDate: '2026-11-12', timeFrom: null, timeTo: '09:00' };
      await refuses(
        id,
        () => submit(author, id, readyAkce(onlyTo)),
        invalid({ 'content.timeFrom': 'invalid', 'content.timeTo': 'invalid' }),
      );
    });

    it('accepts a multi-day akce without a time, and asks for nothing else', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      const content = futureWire({
        title: 'Škola v přírodě',
        startDate: '2026-11-10',
        endDate: '2026-11-12',
      });
      expect(await submit(author, id, content)).toMatchObject({ ok: true });
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

    it.each([
      ['a reviewer', { role: 'reviewer' }],
      ['the headmaster', { role: 'headmaster' }],
      ['a colleague', { role: 'submitter' }],
    ] as const)(
      'does not let %s hand in a colleague’s returned item, and writes nothing',
      async (_who, seed) => {
        const author = await user();
        const id = await start(author, 'akce');
        await moveTo(author, id, 'returned');
        const other = await world.seed.user(seed);
        await refuses(id, () => submit(other, id, readyAkce(), 2), { code: 'not-found' });
        // The author still can: it is the state, not the item, that was fine.
        expect(await submit(author, id, readyAkce(), 2)).toMatchObject({ ok: true });
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
      ['a student', { role: 'submitter', tier: 'student' }],
      ['a reviewer', { role: 'reviewer' }],
      ['the headmaster', { role: 'headmaster' }],
    ] as const)(
      'does not find an approved akce for %s (the write scope is the author’s)',
      async (_who, seed) => {
        const author = await user();
        const id = await start(author, 'akce');
        await moveTo(author, id, 'approved');
        const other = await world.seed.user(seed);
        await refuses(id, () => submit(other, id, readyAkce(), 2), { code: 'not-found' });
      },
    );
  });

  describe('pending cap', () => {
    const capRule = { code: 'rule', rule: 'future-pending-cap' };

    /** `count` items of the author's (akce and jednání alternate), moved to `submitted` past the use cases. */
    async function handedIn(author: UserRecord, count: number): Promise<string[]> {
      const ids: string[] = [];
      for (let i = 0; i < count; i++) {
        const id = await start(author, i % 2 === 0 ? 'akce' : 'jednani');
        await moveTo(author, id, 'submitted');
        ids.push(id);
      }
      return ids;
    }

    it(`hands in the ${FUTURE_CAP}th item: ${FUTURE_CAP - 1} are waiting`, async () => {
      const author = await user();
      await handedIn(author, FUTURE_CAP - 1);
      const id = await start(author, 'akce');
      expect(await submit(author, id, readyAkce())).toEqual({ ok: true, value: { version: 2 } });
    });

    it(`refuses the ${FUTURE_CAP + 1}st item, a jednání as well as an akce, and writes nothing`, async () => {
      const author = await user();
      await handedIn(author, FUTURE_CAP);
      const akce = await start(author, 'akce');
      await refuses(akce, () => submit(author, akce, readyAkce()), capRule);
      const jednani = await start(author, 'jednani');
      await refuses(jednani, () => submit(author, jednani, readyJednani()), capRule);
      expect(await get(author, akce)).toMatchObject({ state: 'draft', version: 1 });
    });

    it('is held to the author’s own items: a colleague at the cap does not block them', async () => {
      const colleague = await user();
      await handedIn(colleague, FUTURE_CAP);
      const author = await user();
      const id = await start(author, 'akce');
      expect((await submit(author, id, readyAkce())).ok).toBe(true);
    });

    it('checks the content first: an unready item at the cap is invalid, not capped', async () => {
      const author = await user();
      await handedIn(author, FUTURE_CAP);
      const id = await start(author, 'akce');
      expect(await submit(author, id, readyAkce({ title: '' }))).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    });

    it('frees a place when the author takes a submitted item back', async () => {
      const author = await user();
      const [first] = await handedIn(author, FUTURE_CAP);
      const id = await start(author, 'akce');
      await refuses(id, () => submit(author, id, readyAkce()), capRule);
      const retracted = await world.run(retractFuture, world.as(author), {
        id: first!,
        expectedVersion: 2,
      });
      expect(retracted.ok).toBe(true);
      expect((await submit(author, id, readyAkce())).ok).toBe(true);
    });

    it('does not count a returned, approved or cancelled item, but sending a returned one needs a free place', async () => {
      const author = await user();
      await handedIn(author, FUTURE_CAP - 1);
      for (const state of ['approved', 'cancelled'] as const) {
        await moveTo(author, await start(author, 'akce'), state);
      }
      const returned = await start(author, 'akce');
      await moveTo(author, returned, 'returned');
      const fresh = await start(author, 'akce');
      expect((await submit(author, fresh, readyAkce())).ok).toBe(true);
      await refuses(returned, () => submit(author, returned, readyAkce(), 2), capRule);
    });

    it('lets one of two submits at once through at one below the cap', async () => {
      const author = await user();
      await handedIn(author, FUTURE_CAP - 1);
      const [a, b] = [await start(author, 'akce'), await start(author, 'jednani')];
      const results = await Promise.all([
        submit(author, a!, readyAkce()),
        submit(author, b!, readyJednani()),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.error)).toEqual([capRule]);
    });
  });
});
