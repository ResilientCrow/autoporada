import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import type { FutureKind } from '@/domain/calendar';

import { futureFixtures } from '../../../../test/support/future';
import { setupWorld } from '../../../../test/support/world';
import { decideFuture } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = futureFixtures(world);

type Seed = Parameters<typeof world.seed.user>[0];
const user = (role: UserRecord['role'] = 'submitter', over: Seed = {}) =>
  world.seed.user({ role, ...over });
const decide = (by: UserRecord, input: Record<string, unknown>) =>
  world.run(decideFuture, world.as(by), { expectedVersion: 2, ...input });

/** An item of the author's moved to `state` (version 2), then a minute passes. */
async function handedIn(
  author: UserRecord,
  state: 'submitted' | 'approved' = 'submitted',
  kind: FutureKind = 'akce',
): Promise<string> {
  const id = await start(author, kind);
  await moveTo(author, id, state);
  world.clock.advance(60_000);
  return id;
}

async function refuses(id: string, run: () => Promise<unknown>, error: unknown) {
  const before = await snapshot(id);
  expect(await run()).toEqual({ ok: false, error });
  expect(await snapshot(id)).toEqual(before);
}
const forbidden = { code: 'forbidden' };
const NOTE = 'Doplňte prosím vyjádření.';

describe('future.decide', () => {
  describe('approve', () => {
    it('lets a reviewer approve a colleague’s akce, with the states in the audit only', async () => {
      const author = await user();
      const id = await handedIn(author);
      const reviewer = await user('reviewer');
      expect(await decide(reviewer, { id, event: 'approve' })).toEqual({
        ok: true,
        value: { version: 3 },
      });
      const { item, events, audit } = await snapshot(id);
      expect(item).toMatchObject({ state: 'approved', version: 3, authorId: author.id });
      expect(item?.submittedAt).not.toBeNull();
      expect(events[0]).toMatchObject({
        event: 'approve',
        fromState: 'submitted',
        toState: 'approved',
        note: null,
        actorId: reviewer.id,
      });
      expect(audit.at(-1)).toEqual({
        actorId: reviewer.id,
        action: 'future.approved',
        targetType: 'future_item',
        targetId: id,
        data: { diff: { state: { from: 'submitted', to: 'approved' } }, meta: { kind: 'akce' } },
        requestId: 'test',
      });
    });

    it('leaves what the author wrote as it was', async () => {
      const id = await handedIn(await user());
      const before = (await snapshot(id)).item;
      await decide(await user('reviewer'), { id, event: 'approve' });
      expect((await snapshot(id)).item?.content).toEqual(before?.content);
    });

    it('lets the headmaster approve any item, their own included, a jednání too', async () => {
      const headmaster = await user('headmaster');
      const own = await handedIn(headmaster);
      const other = await handedIn(await user(), 'submitted', 'jednani');
      expect((await decide(headmaster, { id: own, event: 'approve' })).ok).toBe(true);
      expect((await decide(headmaster, { id: other, event: 'approve' })).ok).toBe(true);
      expect((await snapshot(own)).item?.state).toBe('approved');
    });

    it('never lets a reviewer approve their own item', async () => {
      const reviewer = await user('reviewer');
      const id = await handedIn(reviewer);
      await refuses(id, () => decide(reviewer, { id, event: 'approve' }), forbidden);
    });

    it('refuses an approved item', async () => {
      const id = await handedIn(await user(), 'approved');
      const headmaster = await user('headmaster');
      await refuses(id, () => decide(headmaster, { id, event: 'approve' }), forbidden);
    });

    it('takes no note', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      await refuses(id, () => decide(reviewer, { id, event: 'approve', note: NOTE }), {
        code: 'invalid-input',
        fields: { note: 'invalid' },
      });
    });
  });

  describe('return and reject', () => {
    it.each([
      ['return', 'submitted', 'returned', 'future.returned'],
      ['return', 'approved', 'returned', 'future.returned'],
      ['reject', 'submitted', 'rejected', 'future.rejected'],
      ['reject', 'approved', 'rejected', 'future.rejected'],
    ] as const)('%s from %s: the note in the event row, never in the audit', async (...row) => {
      const [event, from, to, action] = row;
      const id = await handedIn(await user(), from);
      const reviewer = await user('reviewer');
      expect(await decide(reviewer, { id, event, note: `  ${NOTE}  ` })).toEqual({
        ok: true,
        value: { version: 3 },
      });
      const { item, events, audit } = await snapshot(id);
      expect(item).toMatchObject({ state: to, version: 3 });
      expect(events[0]).toMatchObject({ event, fromState: from, toState: to, note: NOTE });
      expect(audit.at(-1)).toMatchObject({
        action,
        data: { diff: { state: { from, to } }, meta: { kind: 'akce' } },
      });
      expect(JSON.stringify(audit)).not.toContain('Doplňte');
    });

    it.each(['akce', 'jednani'] as const)(
      'stores the parts of a %s return without a note, never in the audit',
      async (kind) => {
        const id = await handedIn(await user(), 'submitted', kind);
        const reviewer = await user('reviewer');
        const parts = ['who', 'when'];
        expect(await decide(reviewer, { id, event: 'return', parts })).toEqual({
          ok: true,
          value: { version: 3 },
        });
        const { item, events, audit } = await snapshot(id);
        expect(item).toMatchObject({ state: 'returned' });
        expect(events[0]).toMatchObject({ event: 'return', note: null, returnParts: parts });
        expect(JSON.stringify(audit)).not.toContain('who');
      },
    );

    it('stores a note and parts together, and no parts for a return without them', async () => {
      const reviewer = await user('reviewer');
      const withBoth = await handedIn(await user(), 'approved');
      const parts = ['title', 'place'];
      expect(
        (await decide(reviewer, { id: withBoth, event: 'return', note: NOTE, parts })).ok,
      ).toBe(true);
      expect((await snapshot(withBoth)).events[0]).toMatchObject({
        note: NOTE,
        returnParts: parts,
      });
      const plain = await handedIn(await user());
      expect((await decide(reviewer, { id: plain, event: 'return', note: NOTE })).ok).toBe(true);
      expect((await snapshot(plain)).events[0]?.returnParts).toBeNull();
    });

    it('refuses parts on a reject, a part of a point, and a return with neither', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      const refusal = (fields: Record<string, string>) => ({ code: 'invalid-input', fields });
      await refuses(
        id,
        () => decide(reviewer, { id, event: 'reject', note: NOTE, parts: ['title'] }),
        refusal({ parts: 'invalid' }),
      );
      await refuses(
        id,
        () => decide(reviewer, { id, event: 'return', parts: ['people'] }),
        refusal({ 'parts.0': 'invalid' }),
      );
      await refuses(
        id,
        () => decide(reviewer, { id, event: 'return' }),
        refusal({ note: 'required' }),
      );
    });

    it('keeps a returned item handed in, so reviewers still read it', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      await decide(reviewer, { id, event: 'return', note: NOTE });
      const read = await world.tx(world.as(reviewer), (tx) => tx.futureItems.get(id), 'read');
      expect(read).toMatchObject({ state: 'returned' });
    });

    it('lets a reviewer return their own item', async () => {
      const reviewer = await user('reviewer');
      const id = await handedIn(reviewer);
      expect((await decide(reviewer, { id, event: 'return', note: NOTE })).ok).toBe(true);
    });

    it.each([
      ['no note', undefined, 'required'],
      ['a blank note', ' \n ', 'required'],
      ['2001 characters', 'a'.repeat(2001), 'too-long'],
    ])('refuses %s', async (_what, text, code) => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      for (const event of ['return', 'reject']) {
        await refuses(id, () => decide(reviewer, { id, event, note: text }), {
          code: 'invalid-input',
          fields: { note: code },
        });
      }
    });
  });

  describe('who and which version', () => {
    it('refuses the author, who is no reviewer', async () => {
      const author = await user();
      const id = await handedIn(author);
      await refuses(id, () => decide(author, { id, event: 'return', note: NOTE }), forbidden);
    });

    it.each([
      ['pending', { role: 'pending' }],
      ['deactivated', { role: 'reviewer', status: 'deactivated' }],
    ] as const)('does not find the item for a %s user', async (_who, seed) => {
      const id = await handedIn(await user());
      const who = await world.seed.user(seed);
      await refuses(id, () => decide(who, { id, event: 'reject', note: NOTE }), {
        code: 'not-found',
      });
    });

    // A teacher or a student reads an approved akce of a colleague; deciding on it is not theirs.
    it.each([
      ['a colleague', { role: 'submitter' }],
      ['a student', { role: 'submitter', tier: 'student' }],
    ] as const)('does not find an approved akce for %s', async (_who, seed) => {
      const id = await handedIn(await user(), 'approved');
      const who = await world.seed.user(seed);
      await refuses(id, () => decide(who, { id, event: 'reject', note: NOTE }), {
        code: 'not-found',
      });
    });

    it('does not find a draft, which reviewers never see', async () => {
      const id = await start(await user(), 'akce');
      const reviewer = await user('reviewer');
      await refuses(id, () => decide(reviewer, { id, event: 'approve', expectedVersion: 1 }), {
        code: 'not-found',
      });
    });

    it('answers a stale version with conflict, before the state', async () => {
      const id = await handedIn(await user(), 'approved');
      const headmaster = await user('headmaster');
      await refuses(id, () => decide(headmaster, { id, event: 'approve', expectedVersion: 1 }), {
        code: 'conflict',
      });
    });

    it('cannot run for the system', async () => {
      const input = { id: randomUUID(), event: 'approve', expectedVersion: 2 };
      await expect(world.run(decideFuture, system('cli:test'), input)).rejects.toThrow(
        'future.decide: runs as a signed-in user',
      );
    });
  });

  it('sends no mail: the author reads the outcome in the app', async () => {
    const id = await handedIn(await user());
    await decide(await user('reviewer'), { id, event: 'return', note: NOTE });
    expect(await world.inspect.jobs()).toEqual([]);
  });
});
