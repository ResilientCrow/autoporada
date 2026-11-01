import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import { calDate, wallTime } from '@/domain/time';

import { futureFixtures, futureWire, readyAkce, staffer } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { saveFuture } from './index';

const world = setupWorld();
const { start, moveTo, get, snapshot } = futureFixtures(world);

const user = (role: UserRecord['role'] = 'submitter') => world.seed.user({ role });
const save = (by: UserRecord, id: string, content: unknown, expectedVersion = 1) =>
  world.run(saveFuture, world.as(by), { id, expectedVersion, content });

/** The „Uložit změny“ of an approved akce: the one save that hands the change in. */
const revise = (by: UserRecord, id: string, content: unknown, expectedVersion = 3) =>
  world.run(saveFuture, world.as(by), { id, expectedVersion, content, intent: 'revise' });
const notEditable = { code: 'rule', rule: 'future-not-editable' };

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}

/** An approved akce of the author's with `readyAkce` content, at version 3. */
async function approved(author: UserRecord): Promise<string> {
  const id = await start(author, 'akce');
  expect(await save(author, id, readyAkce())).toMatchObject({ ok: true });
  await moveTo(author, id, 'approved');
  return id;
}

describe('future.save', () => {
  describe('a draft or a returned item', () => {
    it.each(['draft', 'returned'] as const)(
      'stores the whole content of a %s unaudited and keeps its state',
      async (state) => {
        const author = await user();
        const id = await start(author, 'akce');
        if (state !== 'draft') await moveTo(author, id, state);
        const version = state === 'draft' ? 1 : 2;
        world.clock.advance(60_000);
        expect(await save(author, id, readyAkce(), version)).toEqual({
          ok: true,
          value: { version: version + 1, state },
        });
        expect(await get(author, id)).toMatchObject({
          state,
          version: version + 1,
          updatedAt: world.clock.now(),
          content: {
            title: 'Výlet do Prahy',
            startDate: calDate(2026, 11, 10),
            endDate: calDate(2026, 11, 11),
            timeFrom: wallTime(8, 0),
            timeTo: wallTime(14, 30),
            campus: 'radlice',
            place: 'v Národním muzeu',
            responsible: { verb: 'zajišťuje', behalfOf: '2.A' },
          },
        });
        const { events, audit } = await snapshot(id);
        expect(events).toEqual([]);
        expect(audit.map((a) => a.action)).toEqual(
          state === 'draft' ? ['future.created'] : ['future.created', `future.${state}`],
        );
      },
    );

    it('keeps an unfinished item: nothing is required while it is a draft', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      expect(await save(author, id, futureWire({ title: 'Něco' }))).toMatchObject({ ok: true });
      expect(await save(author, id, futureWire(), 2)).toMatchObject({ ok: true });
    });

    it('answers a stale editor with a conflict whatever the state, and writes nothing', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      await moveTo(author, id, 'submitted');
      await refuses(id, () => save(author, id, readyAkce(), 1), { code: 'conflict' });
    });
  });

  describe('refusals', () => {
    it('refuses content the contract refuses: an end date before the start', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      const bad = readyAkce({ endDate: '2026-11-01' });
      await refuses(id, () => save(author, id, bad), {
        code: 'invalid-input',
        fields: { 'content.endDate': 'invalid' },
      });
    });

    it.each(['submitted', 'rejected', 'withdrawn', 'cancelled'] as const)(
      'refuses the author on a %s item',
      async (state) => {
        const author = await user();
        const id = await start(author, 'akce');
        await moveTo(author, id, state);
        await refuses(id, () => save(author, id, readyAkce(), 2), notEditable);
      },
    );

    it('does not find a colleague’s draft', async () => {
      const author = await user();
      const id = await start(author, 'akce');
      const colleague = await user();
      await refuses(id, () => save(colleague, id, readyAkce()), { code: 'not-found' });
    });

    // The port's write scope is the author's (F3): what a reader may see is not theirs to lock.
    it('does not find a waiting item for a reviewer', async () => {
      const author = await user();
      const waiting = await start(author, 'akce');
      await moveTo(author, waiting, 'submitted');
      const reviewer = await user('reviewer');
      await refuses(waiting, () => save(reviewer, waiting, readyAkce(), 2), { code: 'not-found' });
    });

    it.each([
      ['a colleague', { role: 'submitter' }],
      ['a student', { role: 'submitter', isStudent: true }],
      ['a reviewer', { role: 'reviewer' }],
      ['the headmaster', { role: 'headmaster' }],
    ] as const)('does not find an approved akce for %s', async (_who, seed) => {
      const author = await user();
      const id = await approved(author);
      const other = await world.seed.user(seed);
      await refuses(id, () => save(other, id, readyAkce({ title: 'Cizí' }), 3), {
        code: 'not-found',
      });
    });

    it.each([
      ['whose account went back to pending', { role: 'pending' }],
      ['whose account was deactivated', { status: 'deactivated' }],
    ] as const)('does not find their own item for an author %s', async (_case, patch) => {
      const author = await user();
      const id = await start(author, 'akce');
      const demoted = await world.tx(system('test.seed'), (tx) =>
        tx.users.changeAccess(author.id, author.version, patch),
      );
      await refuses(id, () => save(demoted, id, readyAkce()), { code: 'not-found' });
    });
  });

  describe('an approved akce', () => {
    it('never autosaves: a plain save is refused, and writes nothing', async () => {
      const author = await user();
      const id = await approved(author);
      await refuses(id, () => save(author, id, readyAkce({ title: 'Výlet do B' }), 3), notEditable);
      expect(await get(author, id)).toMatchObject({ state: 'approved', version: 3 });
    });

    it('refuses a plain save even when it changes nothing', async () => {
      const author = await user();
      const id = await approved(author);
      await refuses(id, () => save(author, id, readyAkce(), 3), notEditable);
    });

    it('goes back to review on the explicit revise, and says so in the history', async () => {
      const author = await user();
      const id = await approved(author);
      world.clock.advance(60_000);
      expect(await revise(author, id, readyAkce({ title: 'Výlet do Brna' }))).toEqual({
        ok: true,
        value: { version: 4, state: 'submitted' },
      });
      expect(await get(author, id)).toMatchObject({
        state: 'submitted',
        submittedAt: world.clock.now(),
        content: { title: 'Výlet do Brna' },
      });
      const { events, audit } = await snapshot(id);
      expect(events).toEqual([
        expect.objectContaining({
          event: 'revise',
          fromState: 'approved',
          toState: 'submitted',
          actorId: author.id,
          note: null,
        }),
      ]);
      expect(audit.at(-1)).toEqual({
        actorId: author.id,
        action: 'future.revised',
        targetType: 'future_item',
        targetId: id,
        data: {
          diff: {
            state: { from: 'approved', to: 'submitted' },
            submittedAt: { from: expect.any(String), to: world.clock.now().toISOString() },
          },
          meta: { kind: 'akce' },
        },
        requestId: 'test',
      });
    });

    it('fires revise once: the next save of the same editor is a rule, never a second move', async () => {
      const author = await user();
      const id = await approved(author);
      expect(await revise(author, id, readyAkce({ title: 'Výlet do B' }))).toMatchObject({
        ok: true,
      });
      const after = await snapshot(id);
      expect(await save(author, id, readyAkce({ title: 'Výlet do Brna' }), 4)).toEqual({
        ok: false,
        error: notEditable,
      });
      expect(await revise(author, id, readyAkce({ title: 'Výlet do Brna' }), 4)).toEqual({
        ok: false,
        error: notEditable,
      });
      expect(await snapshot(id)).toEqual(after);
    });

    it('stays approved when the revise changes nothing, and writes nothing', async () => {
      const author = await user();
      const id = await approved(author);
      const before = await snapshot(id);
      expect(await revise(author, id, readyAkce())).toEqual({
        ok: true,
        value: { version: 3, state: 'approved' },
      });
      expect(await snapshot(id)).toEqual(before);
    });

    it('refuses a change that would hand in an unfinished item, and stays approved', async () => {
      const author = await user();
      const id = await approved(author);
      await refuses(id, () => revise(author, id, readyAkce({ title: '' })), {
        code: 'invalid-input',
        fields: { 'content.title': 'required' },
      });
      expect(await get(author, id)).toMatchObject({ state: 'approved', version: 3 });
    });

    it('asks for the start date of a change to an approved akce', async () => {
      const author = await user();
      const id = await approved(author);
      await refuses(id, () => revise(author, id, readyAkce({ startDate: null, endDate: null })), {
        code: 'invalid-input',
        fields: { 'content.startDate': 'required' },
      });
    });

    it('asks for a salutation of each responsible person in the change', async () => {
      const author = await user();
      const id = await approved(author);
      const responsible = {
        verb: 'vede',
        behalfOf: '2.A',
        people: [{ ...staffer, salutation: null }],
      };
      await refuses(id, () => revise(author, id, readyAkce({ responsible })), {
        code: 'invalid-input',
        fields: { 'content.responsible.people.0.salutation': 'required' },
      });
    });

    it('asks for an end time after the start on a day that is both the first and the last', async () => {
      const author = await user();
      const id = await approved(author);
      const sameDay = readyAkce({ endDate: '2026-11-10', timeFrom: '14:00', timeTo: '13:00' });
      await refuses(id, () => revise(author, id, sameDay), {
        code: 'invalid-input',
        fields: { 'content.timeTo': 'invalid' },
      });
    });
  });

  describe('the revise intent', () => {
    it.each(['draft', 'returned'] as const)(
      'is refused on a %s item, which only autosaves',
      async (state) => {
        const author = await user();
        const id = await start(author, 'akce');
        if (state !== 'draft') await moveTo(author, id, state);
        const version = state === 'draft' ? 1 : 2;
        await refuses(id, () => revise(author, id, readyAkce(), version), notEditable);
      },
    );
  });
});
