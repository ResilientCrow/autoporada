import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DatabaseFailure,
  ScopeViolation,
  system,
  type ClaimRow,
  type MailLedgerPort,
  type Principal,
  type TxMode,
} from '@/application/ports';

import { setupWorld } from '../support/world';

const world = setupWorld();
const job = system('job:mail.send');
const SECOND = 1_000;
const DAY = 86_400_000;

/** One transaction on the worker's connection (autoporada_worker in the pg world), at the world's clock. */
const ledger = <T>(
  work: (mailLedger: MailLedgerPort) => Promise<T>,
  principal: Principal = job,
  mode: TxMode = 'write',
) =>
  world.workerDb.transaction(
    { principal, now: world.clock.now(), requestId: 'test' },
    { mode },
    (tx) => work(tx.mailLedger),
  );

const claimRow = (recipientId: string, key = 'access.approved:1', unknownSends = 0): ClaimRow => ({
  dedupeKey: key,
  template: 'access.approved',
  recipientId,
  subjectId: '00000000-0000-7000-8000-00000000a001',
  unknownSends,
});

const later = (ms: number) => new Date(world.clock.now().getTime() + ms);

describe('MailLedgerPort (port contract)', () => {
  it('claims a key as sending at the transaction instant, counting each attempt', async () => {
    const user = await world.seed.user();
    const first = world.clock.now();
    await ledger((l) => l.claim(claimRow(user.id)));
    expect(await ledger((l) => l.get('access.approved:1'))).toEqual({
      ...claimRow(user.id),
      state: 'sending',
      attempts: 1,
      claimedAt: first,
      settledAt: null,
      code: null,
      graphRequestId: null,
    });

    world.clock.advance(30 * SECOND);
    await ledger((l) => l.claim(claimRow(user.id, 'access.approved:1', 1)));
    expect(await ledger((l) => l.get('access.approved:1'))).toMatchObject({
      state: 'sending',
      attempts: 2,
      unknownSends: 1,
      claimedAt: world.clock.now(),
    });
  });

  it('settles a claim with its state, code, request id and unknown count', async () => {
    const user = await world.seed.user();
    await ledger((l) => l.claim(claimRow(user.id)));
    world.clock.advance(2 * SECOND);
    await ledger((l) =>
      l.settle('access.approved:1', { state: 'unknown', code: 'unknown.timeout', unknownSends: 1 }),
    );
    expect(await ledger((l) => l.get('access.approved:1'))).toMatchObject({
      state: 'unknown',
      code: 'unknown.timeout',
      unknownSends: 1,
      settledAt: world.clock.now(),
      graphRequestId: null,
    });

    world.clock.advance(60 * SECOND);
    await ledger((l) => l.claim(claimRow(user.id, 'access.approved:1', 1)));
    await ledger((l) =>
      l.settle('access.approved:1', { state: 'sent', code: 'resent', graphRequestId: 'req-42' }),
    );
    expect(await ledger((l) => l.get('access.approved:1'))).toMatchObject({
      state: 'sent',
      code: 'resent',
      unknownSends: 1,
      attempts: 2,
      settledAt: world.clock.now(),
      graphRequestId: 'req-42',
    });
  });

  it('records a skip as settled now, never claimed, over any earlier row', async () => {
    const user = await world.seed.user();
    const row = { ...claimRow(user.id), code: 'skipped.stale' };
    await ledger((l) => l.skip(row));
    expect(await ledger((l) => l.get(row.dedupeKey))).toEqual({
      ...claimRow(user.id),
      state: 'skipped',
      code: 'skipped.stale',
      attempts: 0,
      claimedAt: null,
      settledAt: world.clock.now(),
      graphRequestId: null,
    });

    await ledger((l) => l.claim(claimRow(user.id, 'access.approved:2')));
    await ledger((l) => l.settle('access.approved:2', { state: 'deferred', code: 'auth.403' }));
    world.clock.advance(SECOND);
    await ledger((l) =>
      l.skip({ ...claimRow(user.id, 'access.approved:2'), code: 'skipped.stale' }),
    );
    expect(await ledger((l) => l.get('access.approved:2'))).toMatchObject({
      state: 'skipped',
      code: 'skipped.stale',
      attempts: 1,
      settledAt: world.clock.now(),
    });
  });

  it('refuses a row for a recipient who does not exist', async () => {
    const ghost = randomUUID();
    await expect(ledger((l) => l.claim(claimRow(ghost)))).rejects.toEqual(
      new DatabaseFailure('23503'),
    );
    await expect(
      ledger((l) => l.skip({ ...claimRow(ghost), code: 'skipped.no-address' })),
    ).rejects.toEqual(new DatabaseFailure('23503'));
  });

  it('serves only jobs and the CLI', async () => {
    const user = await world.seed.user({ role: 'headmaster' });
    await ledger((l) => l.get('x'), system('cli:jobs'));
    for (const principal of [world.as(user), system('auth.session'), system('test.seed')]) {
      await expect(ledger((l) => l.get('x'), principal)).rejects.toBeInstanceOf(ScopeViolation);
      await expect(ledger((l) => l.claim(claimRow(user.id)), principal)).rejects.toBeInstanceOf(
        ScopeViolation,
      );
      await expect(ledger((l) => l.purgeBefore(later(0)), principal)).rejects.toBeInstanceOf(
        ScopeViolation,
      );
    }
    expect(await ledger((l) => l.get('access.approved:1'))).toBeNull();
  });

  it('writes nothing in a read transaction', async () => {
    const user = await world.seed.user();
    await expect(ledger((l) => l.claim(claimRow(user.id)), job, 'read')).rejects.toEqual(
      new DatabaseFailure('25006'),
    );
  });

  it('goes with the person: deleting the recipient deletes their rows', async () => {
    const user = await world.seed.user();
    const other = await world.seed.user();
    await ledger((l) => l.claim(claimRow(user.id, 'access.approved:gone')));
    await ledger((l) => l.claim(claimRow(other.id, 'access.approved:kept')));
    await world.erase.user(user.id);
    expect(await ledger((l) => l.get('access.approved:gone'))).toBeNull();
    expect(await ledger((l) => l.get('access.approved:kept'))).not.toBeNull();
  });

  it('purges rows settled, or claimed and never settled, before the cutoff', async () => {
    const user = await world.seed.user();
    await ledger((l) => l.claim(claimRow(user.id, 'old.sent')));
    await ledger((l) => l.settle('old.sent', { state: 'sent', code: 'sent' }));
    await ledger((l) => l.skip({ ...claimRow(user.id, 'old.skipped'), code: 'skipped.stale' }));
    await ledger((l) => l.claim(claimRow(user.id, 'old.sending')));
    world.clock.advance(DAY);
    await ledger((l) => l.claim(claimRow(user.id, 'new.sent')));
    await ledger((l) => l.settle('new.sent', { state: 'sent', code: 'sent' }));

    const cutoff = new Date(world.clock.now().getTime() - 1);
    expect(await ledger((l) => l.purgeBefore(cutoff))).toBe(3);
    for (const key of ['old.sent', 'old.skipped', 'old.sending']) {
      expect(await ledger((l) => l.get(key))).toBeNull();
    }
    expect(await ledger((l) => l.get('new.sent'))).not.toBeNull();
    expect(await ledger((l) => l.purgeBefore(cutoff))).toBe(0);
  });
});
