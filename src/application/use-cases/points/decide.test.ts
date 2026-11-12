import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type UserRecord } from '@/application/ports';
import type { PointKind } from '@/domain/report';

import { pointFixtures } from '../../../../test/support/points';
import { setupWorld } from '../../../../test/support/world';
import { decidePoint } from './index';

const world = setupWorld();
const { start, moveTo, snapshot } = pointFixtures(world);

type Seed = Parameters<typeof world.seed.user>[0];
const user = (role: UserRecord['role'] = 'submitter', over: Seed = {}) =>
  world.seed.user({ role, ...over });
const decide = (by: UserRecord, input: Record<string, unknown>) =>
  world.run(decidePoint, world.as(by), { expectedVersion: 2, ...input });

/** A point of the author's moved to `state` (version 2), then a minute passes. */
async function handedIn(
  author: UserRecord,
  state: 'submitted' | 'approved' = 'submitted',
  kind: PointKind = 'pokyn',
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
const note = (fields: Record<string, string>) => ({ code: 'invalid-input', fields });
const NOTE = 'Doplňte prosím vyjádření.';

describe('points.decide', () => {
  describe('approve', () => {
    it('lets a reviewer approve a colleague’s point, with the states in the audit only', async () => {
      const author = await user();
      const id = await handedIn(author);
      const reviewer = await user('reviewer');
      expect(await decide(reviewer, { id, event: 'approve' })).toEqual({
        ok: true,
        value: { version: 3, next: null },
      });
      const { point, events, audit } = await snapshot(id);
      expect(point).toMatchObject({ state: 'approved', version: 3 });
      expect(events[0]).toMatchObject({
        event: 'approve',
        fromState: 'submitted',
        toState: 'approved',
        note: null,
        actorId: reviewer.id,
      });
      expect(audit.at(-1)).toEqual({
        actorId: reviewer.id,
        action: 'point.approved',
        targetType: 'point',
        targetId: id,
        data: { diff: { state: { from: 'submitted', to: 'approved' } }, meta: { kind: 'pokyn' } },
        requestId: 'test',
      });
    });

    it('lets the headmaster approve any point, their own included', async () => {
      const headmaster = await user('headmaster');
      const own = await handedIn(headmaster);
      const other = await handedIn(await user());
      expect((await decide(headmaster, { id: own, event: 'approve' })).ok).toBe(true);
      expect((await decide(headmaster, { id: other, event: 'approve' })).ok).toBe(true);
      expect((await snapshot(own)).point?.state).toBe('approved');
    });

    it('never lets a reviewer approve their own point', async () => {
      const reviewer = await user('reviewer');
      const id = await handedIn(reviewer);
      await refuses(id, () => decide(reviewer, { id, event: 'approve' }), forbidden);
    });

    it('refuses an approved point', async () => {
      const id = await handedIn(await user(), 'approved');
      const headmaster = await user('headmaster');
      await refuses(id, () => decide(headmaster, { id, event: 'approve' }), forbidden);
    });

    it('takes no note', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      await refuses(
        id,
        () => decide(reviewer, { id, event: 'approve', note: NOTE }),
        note({ note: 'invalid' }),
      );
    });
  });

  describe('return and reject', () => {
    it.each([
      ['return', 'submitted', 'returned', 'point.returned'],
      ['return', 'approved', 'returned', 'point.returned'],
      ['reject', 'submitted', 'rejected', 'point.rejected'],
      ['reject', 'approved', 'rejected', 'point.rejected'],
    ] as const)('%s from %s: the note in the event row, never in the audit', async (...row) => {
      const [event, from, to, action] = row;
      const id = await handedIn(await user(), from);
      const reviewer = await user('reviewer');
      expect(await decide(reviewer, { id, event, note: `  ${NOTE}  ` })).toEqual({
        ok: true,
        value: { version: 3, next: null },
      });
      const { point, events, audit } = await snapshot(id);
      expect(point).toMatchObject({ state: to, version: 3 });
      expect(events[0]).toMatchObject({ event, fromState: from, toState: to, note: NOTE });
      expect(audit.at(-1)).toMatchObject({
        action,
        data: { diff: { state: { from, to } }, meta: { kind: 'pokyn' } },
      });
      expect(JSON.stringify(audit)).not.toContain('Doplňte');
    });

    it('lets a reviewer return their own point', async () => {
      const reviewer = await user('reviewer');
      const id = await handedIn(reviewer);
      expect((await decide(reviewer, { id, event: 'return', note: NOTE })).ok).toBe(true);
    });

    it.each(['return', 'reject'] as const)(
      'lets a reviewer %s their own point once a colleague approved it',
      async (event) => {
        const reviewer = await user('reviewer');
        const id = await handedIn(reviewer, 'approved');
        expect((await decide(reviewer, { id, event, note: NOTE })).ok).toBe(true);
        expect((await snapshot(id)).events[0]).toMatchObject({ event, fromState: 'approved' });
      },
    );

    it.each([
      ['no note', undefined, 'required'],
      ['a blank note', ' \n ', 'required'],
      ['2001 characters', 'a'.repeat(2001), 'too-long'],
    ])('refuses %s', async (_what, text, code) => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      for (const event of ['return', 'reject']) {
        await refuses(id, () => decide(reviewer, { id, event, note: text }), note({ note: code }));
      }
    });

    it('takes a note of 2000 characters', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      const text = 'á'.repeat(2000);
      expect((await decide(reviewer, { id, event: 'reject', note: text })).ok).toBe(true);
      expect((await snapshot(id)).events[0]?.note).toBe(text);
    });

    it('counts a CRLF line break as one character and stores it as \\n (the pipeline normalises it)', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      const text = `${'a'.repeat(999)}\r\n${'b'.repeat(1000)}`;
      expect((await decide(reviewer, { id, event: 'return', note: text })).ok).toBe(true);
      expect((await snapshot(id)).events[0]?.note).toBe(`${'a'.repeat(999)}\n${'b'.repeat(1000)}`);
    });
  });

  describe('the parts to rework', () => {
    it('stores the parts of a return without a note, in the event row and never in the audit', async () => {
      const id = await handedIn(await user(), 'submitted', 'report');
      const reviewer = await user('reviewer');
      const parts = ['people', 'heading'];
      expect(await decide(reviewer, { id, event: 'return', parts })).toEqual({
        ok: true,
        value: { version: 3, next: null },
      });
      const { point, events, audit } = await snapshot(id);
      expect(point).toMatchObject({ state: 'returned' });
      expect(events[0]).toMatchObject({ event: 'return', note: null, returnParts: parts });
      expect(JSON.stringify(audit)).not.toContain('people');
    });

    it('stores a note and parts together', async () => {
      const id = await handedIn(await user(), 'approved', 'report');
      const reviewer = await user('reviewer');
      const parts = ['body', 'statements'];
      expect((await decide(reviewer, { id, event: 'return', note: NOTE, parts })).ok).toBe(true);
      expect((await snapshot(id)).events[0]).toMatchObject({ note: NOTE, returnParts: parts });
    });

    it('keeps no parts on a return that names none', async () => {
      const id = await handedIn(await user());
      const reviewer = await user('reviewer');
      expect((await decide(reviewer, { id, event: 'return', note: NOTE })).ok).toBe(true);
      expect((await snapshot(id)).events[0]?.returnParts).toBeNull();
    });

    it('takes heading and body of a proposal', async () => {
      const id = await handedIn(await user(), 'submitted', 'finance');
      const reviewer = await user('reviewer');
      const parts = ['heading', 'body'];
      expect((await decide(reviewer, { id, event: 'return', parts })).ok).toBe(true);
      expect((await snapshot(id)).events[0]?.returnParts).toEqual(parts);
    });

    it.each([
      ['finance', 'people'],
      ['finance', 'statements'],
      ['pokyn', 'people'],
      ['pokyn', 'statements'],
    ] as const)('refuses %s with the part %s, which a proposal has not', async (kind, part) => {
      const id = await handedIn(await user(), 'submitted', kind);
      const reviewer = await user('reviewer');
      await refuses(
        id,
        () => decide(reviewer, { id, event: 'return', note: NOTE, parts: ['heading', part] }),
        note({ parts: 'invalid' }),
      );
    });

    it('refuses parts on a reject and on an approval, and a return with neither', async () => {
      const id = await handedIn(await user(), 'submitted', 'report');
      const reviewer = await user('reviewer');
      await refuses(
        id,
        () => decide(reviewer, { id, event: 'reject', note: NOTE, parts: ['body'] }),
        note({ parts: 'invalid' }),
      );
      await refuses(
        id,
        () => decide(reviewer, { id, event: 'approve', parts: ['body'] }),
        note({ parts: 'invalid' }),
      );
      await refuses(
        id,
        () => decide(reviewer, { id, event: 'return' }),
        note({ note: 'required' }),
      );
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
      ['student', { role: 'submitter', isStudent: true }],
    ] as const)('does not find the point for a %s user', async (_who, seed) => {
      const id = await handedIn(await user());
      const who = await world.seed.user(seed);
      await refuses(id, () => decide(who, { id, event: 'reject', note: NOTE }), {
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
      await expect(world.run(decidePoint, system('cli:test'), input)).rejects.toThrow(
        'points.decide: runs as a signed-in user',
      );
    });
  });

  describe('the next point', () => {
    it('is the queue’s next submitted point after the decision, in the queue’s order', async () => {
      const author = await user();
      const pokyn = await handedIn(author);
      const finance = await handedIn(author, 'submitted', 'finance');
      const report = await handedIn(author, 'submitted', 'report');
      await handedIn(author, 'approved');
      const reviewer = await user('reviewer');
      // By kind first: the report goes before the older finance and pokyn points.
      expect(await decide(reviewer, { id: report, event: 'approve' })).toMatchObject({
        value: { next: finance },
      });
      expect(await decide(reviewer, { id: finance, event: 'reject', note: NOTE })).toMatchObject({
        value: { next: pokyn },
      });
      expect(await decide(reviewer, { id: pokyn, event: 'approve' })).toMatchObject({
        value: { next: null },
      });
    });

    it('skips the reviewer’s own points, which they may not approve', async () => {
      const reviewer = await user('reviewer');
      const own = await handedIn(reviewer, 'submitted', 'report');
      const colleague = await handedIn(await user());
      const decided = await handedIn(await user());
      expect(await decide(reviewer, { id: decided, event: 'approve' })).toMatchObject({
        value: { next: colleague },
      });
      expect(await decide(reviewer, { id: colleague, event: 'approve' })).toMatchObject({
        value: { next: null },
      });
      expect((await snapshot(own)).point?.state).toBe('submitted');
    });

    it('names the headmaster’s own point to the headmaster', async () => {
      const headmaster = await user('headmaster');
      const own = await handedIn(headmaster, 'submitted', 'report');
      const id = await handedIn(await user());
      expect(await decide(headmaster, { id, event: 'approve' })).toMatchObject({
        value: { next: own },
      });
    });

    it('never names a draft', async () => {
      const author = await user();
      await start(author, 'pokyn');
      const id = await handedIn(author);
      const headmaster = await user('headmaster');
      expect(await decide(headmaster, { id, event: 'approve' })).toMatchObject({
        value: { next: null },
      });
    });
  });

  describe('the author’s mail', () => {
    /** The `mail.send` job the decision recorded as `event` queued for the author. */
    const mailFor = (template: string, author: UserRecord, eventId: string) => ({
      name: 'mail.send',
      data: { template, recipientId: author.id, subjectId: eventId },
      options: { dedupeKey: `${template}:${eventId}` },
    });

    it.each([
      ['approve', 'point.approved', undefined],
      ['return', 'point.returned', NOTE],
      ['reject', 'point.rejected', NOTE],
    ] as const)(
      '%s queues %s about the new event, in the decision’s transaction',
      async (...row) => {
        const [event, template, text] = row;
        const author = await user();
        const id = await handedIn(author);
        const reviewer = await user('reviewer');
        const input = { id, event, ...(text !== undefined && { note: text }) };
        expect((await decide(reviewer, input)).ok).toBe(true);
        const [appended] = (await snapshot(id)).events;
        expect(await world.inspect.jobs()).toEqual([mailFor(template, author, appended!.id)]);
      },
    );

    it.each([
      ['a submitter', 'submitter', 'approve', 'point.approved', undefined],
      ['a submitter', 'submitter', 'return', 'point.returned', NOTE],
      ['a reviewer', 'reviewer', 'approve', 'point.approved', undefined],
      ['a reviewer', 'reviewer', 'return', 'point.returned', NOTE],
    ] as const)(
      'mails the author when the headmaster decides on the point of %s: %s %s',
      async (...row) => {
        const [, role, event, template, text] = row;
        const author = await user(role);
        const id = await handedIn(author);
        const headmaster = await user('headmaster');
        const input = { id, event, ...(text !== undefined && { note: text }) };
        expect((await decide(headmaster, input)).ok).toBe(true);
        const [appended] = (await snapshot(id)).events;
        expect(await world.inspect.jobs()).toEqual([mailFor(template, author, appended!.id)]);
      },
    );

    it('queues one mail per decision, so a second return is mailed again', async () => {
      const author = await user();
      const id = await handedIn(author);
      const reviewer = await user('reviewer');
      await decide(reviewer, { id, event: 'return', note: NOTE });
      await moveTo(author, id, 'submitted');
      await decide(reviewer, { id, event: 'return', expectedVersion: 4, note: NOTE });
      const returns = (await snapshot(id)).events.filter((e) => e.event === 'return').reverse();
      expect(returns).toHaveLength(2);
      expect(await world.inspect.jobs()).toEqual(
        returns.map((e) => mailFor('point.returned', author, e.id)),
      );
    });

    it('mails nobody about their own decision on their own point', async () => {
      const headmaster = await user('headmaster');
      const approved = await handedIn(headmaster);
      expect((await decide(headmaster, { id: approved, event: 'approve' })).ok).toBe(true);
      const reviewer = await user('reviewer');
      const returned = await handedIn(reviewer);
      expect((await decide(reviewer, { id: returned, event: 'return', note: NOTE })).ok).toBe(true);
      expect(await world.inspect.jobs()).toEqual([]);
    });

    it('queues nothing when the decision is refused, stale or without its note', async () => {
      const author = await user();
      const id = await handedIn(author);
      const reviewer = await user('reviewer');
      await decide(author, { id, event: 'return', note: NOTE });
      await decide(reviewer, { id, event: 'approve', expectedVersion: 1 });
      await decide(reviewer, { id, event: 'reject' });
      await decide(reviewer, { id, event: 'return', note: ' ' });
      expect(await world.inspect.jobs()).toEqual([]);
      expect((await snapshot(id)).point?.state).toBe('submitted');
    });
  });
});
