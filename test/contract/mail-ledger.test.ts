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

/** The pg-boss job that claims, and a job an operator revived from the dead letters. */
const JOB_ID = '00000000-0000-7000-8000-00000000b001';
const REVIVED_ID = '00000000-0000-7000-8000-00000000b002';

const claimRow = (
  recipientId: string,
  key = 'access.approved:1',
  unknownSends = 0,
  claim: Partial<Pick<ClaimRow, 'jobId' | 'capFrom'>> = {},
): ClaimRow => ({
  dedupeKey: key,
  template: 'access.approved',
  recipientId,
  subjectId: '00000000-0000-7000-8000-00000000a001',
  unknownSends,
  capFrom: 0,
  jobId: JOB_ID,
  ...claim,
});

/** The fields a skip writes: a skip names no job and starts no cap. */
const skipRow = (recipientId: string, key = 'access.approved:1') => {
  const { jobId: _job, capFrom: _cap, unknownSends: _unknown, ...row } = claimRow(recipientId, key);
  return row;
};

const later = (ms: number) => new Date(world.clock.now().getTime() + ms);
/** A CHECK or foreign key refusal, named as infra/db/pg-errors.ts reports it. */
const refusedBy = (constraint: string) => new DatabaseFailure(`db.constraint.${constraint}`);

describe('MailLedgerPort (port contract)', () => {
  it('starts every test with no rows and an open gate', async () => {
    expect(await ledger((l) => l.get('access.approved:1'))).toBeNull();
    expect(await ledger((l) => l.gate())).toEqual({ notBefore: null, code: null });
  });

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
    const row = { ...skipRow(user.id), code: 'skipped.stale' };
    await ledger((l) => l.skip(row));
    expect(await ledger((l) => l.get(row.dedupeKey))).toEqual({
      ...skipRow(user.id),
      unknownSends: 0,
      capFrom: 0,
      jobId: null,
      state: 'skipped',
      code: 'skipped.stale',
      attempts: 0,
      claimedAt: null,
      settledAt: world.clock.now(),
      graphRequestId: null,
    });

    await ledger((l) => l.claim(claimRow(user.id, 'access.approved:2', 1, { capFrom: 1 })));
    await ledger((l) => l.settle('access.approved:2', { state: 'deferred', code: 'auth.403' }));
    world.clock.advance(SECOND);
    await ledger((l) =>
      l.skip({ ...skipRow(user.id, 'access.approved:2'), code: 'skipped.stale' }),
    );
    expect(await ledger((l) => l.get('access.approved:2'))).toMatchObject({
      state: 'skipped',
      code: 'skipped.stale',
      attempts: 1,
      unknownSends: 1,
      capFrom: 1,
      jobId: JOB_ID,
      settledAt: world.clock.now(),
    });
  });

  it('records the job that claimed the key and where its cap starts, overwritten by each claim', async () => {
    const user = await world.seed.user();
    await ledger((l) => l.claim(claimRow(user.id, 'access.approved:1', 0)));
    await ledger((l) =>
      l.settle('access.approved:1', { state: 'unknown', code: 'unknown.timeout', unknownSends: 2 }),
    );
    expect(await ledger((l) => l.get('access.approved:1'))).toMatchObject({
      ...{ unknownSends: 2, capFrom: 0, jobId: JOB_ID },
    });
    await ledger((l) =>
      l.claim(claimRow(user.id, 'access.approved:1', 2, { jobId: REVIVED_ID, capFrom: 2 })),
    );
    expect(await ledger((l) => l.get('access.approved:1'))).toMatchObject({
      ...{ state: 'sending', unknownSends: 2, capFrom: 2, jobId: REVIVED_ID, attempts: 2 },
    });
  });

  it('keeps the cap start within the unknown count, and both non-negative, as the CHECKs do', async () => {
    const user = await world.seed.user();
    const refused = refusedBy('mail_ledger_cap_from');
    const claim = (key: string, unknownSends: number, capFrom: number) =>
      ledger((l) => l.claim(claimRow(user.id, key, unknownSends, { capFrom })));
    await expect(claim('cap.above', 1, 2)).rejects.toEqual(refused);
    await expect(claim('cap.negative', 0, -1)).rejects.toEqual(refused);
    await expect(claim('unknown.negative', -1, 0)).rejects.toEqual(refused);
    for (const key of ['cap.above', 'cap.negative', 'unknown.negative']) {
      expect(await ledger((l) => l.get(key))).toBeNull();
    }

    await claim('cap.kept', 2, 2);
    await expect(
      ledger((l) =>
        l.settle('cap.kept', { state: 'unknown', code: 'unknown.reset', unknownSends: 1 }),
      ),
    ).rejects.toEqual(refused);
    await expect(
      ledger((l) =>
        l.settle('cap.kept', { state: 'unknown', code: 'unknown.reset', unknownSends: -1 }),
      ),
    ).rejects.toEqual(refused);
    expect(await ledger((l) => l.get('cap.kept'))).toMatchObject({
      ...{ state: 'sending', unknownSends: 2, capFrom: 2 },
    });
  });

  it('refuses a row for a recipient who does not exist', async () => {
    const ghost = randomUUID();
    const refused = refusedBy('mail_ledger_recipient_id_users_id_fk');
    await expect(ledger((l) => l.claim(claimRow(ghost)))).rejects.toEqual(refused);
    await expect(
      ledger((l) => l.skip({ ...skipRow(ghost), code: 'skipped.no-address' })),
    ).rejects.toEqual(refused);
  });

  it('refuses a code outside the closed set, as the CHECK does', async () => {
    const user = await world.seed.user();
    await expect(
      ledger((l) => l.skip({ ...skipRow(user.id, 'bad.skip'), code: 'no-address' })),
    ).rejects.toEqual(refusedBy('mail_ledger_code'));
    await ledger((l) => l.claim(claimRow(user.id, 'bad.settle')));
    await expect(
      ledger((l) => l.settle('bad.settle', { state: 'sent', code: `sent.${'x'.repeat(40)}` })),
    ).rejects.toEqual(refusedBy('mail_ledger_code'));
    expect(await ledger((l) => l.get('bad.skip'))).toBeNull();
    expect(await ledger((l) => l.get('bad.settle'))).toMatchObject({ state: 'sending' });
  });

  it('bounds the dedupe key at 120 characters and the Graph request id at 64, as the CHECKs do', async () => {
    const user = await world.seed.user();
    const key = (length: number) => `k:${'x'.repeat(length - 2)}`;
    await ledger((l) => l.claim(claimRow(user.id, key(120))));
    const tooLong = refusedBy('mail_ledger_dedupe_key_length');
    await expect(ledger((l) => l.claim(claimRow(user.id, key(121))))).rejects.toEqual(tooLong);
    await expect(
      ledger((l) => l.skip({ ...skipRow(user.id, key(121)), code: 'skipped.no-address' })),
    ).rejects.toEqual(tooLong);
    expect(await ledger((l) => l.get(key(121)))).toBeNull();

    await ledger((l) => l.claim(claimRow(user.id, 'long.id')));
    await expect(
      ledger((l) =>
        l.settle('long.id', { state: 'sent', code: 'sent', graphRequestId: 'a'.repeat(65) }),
      ),
    ).rejects.toEqual(refusedBy('mail_ledger_graph_request_id_length'));
    expect(await ledger((l) => l.get('long.id'))).toMatchObject({ state: 'sending' });
    await ledger((l) =>
      l.settle('long.id', { state: 'sent', code: 'sent', graphRequestId: 'a'.repeat(64) }),
    );
    expect(await ledger((l) => l.get('long.id'))).toMatchObject({
      state: 'sent',
      graphRequestId: 'a'.repeat(64),
    });
  });

  it('closes the gate to the latest instant it was given, and keeps that one code', async () => {
    await ledger((l) => l.closeGate(later(30 * SECOND), 'throttled.429'));
    expect(await ledger((l) => l.gate())).toEqual({
      notBefore: later(30 * SECOND),
      code: 'throttled.429',
    });
    await ledger((l) => l.closeGate(later(10 * SECOND), 'auth.403'));
    expect(await ledger((l) => l.gate())).toEqual({
      notBefore: later(30 * SECOND),
      code: 'throttled.429',
    });
    await ledger((l) => l.closeGate(later(60 * SECOND), 'auth.403'));
    expect(await ledger((l) => l.gate())).toEqual({
      notBefore: later(60 * SECOND),
      code: 'auth.403',
    });
  });

  it('counts the sends claimed after an instant: deferred and skipped rows sent nothing', async () => {
    const user = await world.seed.user();
    const start = world.clock.now();
    const claim = (key: string) => ledger((l) => l.claim(claimRow(user.id, key)));
    await claim('sending');
    await claim('unknown');
    await ledger((l) =>
      l.settle('unknown', { state: 'unknown', code: 'unknown.reset', unknownSends: 1 }),
    );
    await claim('deferred');
    await ledger((l) => l.settle('deferred', { state: 'deferred', code: 'throttled.429' }));
    world.clock.advance(10 * SECOND);
    await claim('sent');
    await ledger((l) => l.settle('sent', { state: 'sent', code: 'sent' }));
    await claim('failed');
    await ledger((l) => l.settle('failed', { state: 'failed', code: 'rejected.400' }));
    await ledger((l) => l.skip({ ...skipRow(user.id, 'skipped'), code: 'skipped.stale' }));

    const since = (instant: Date) => ledger((l) => l.callsSince(instant));
    expect(await since(new Date(start.getTime() - 1))).toEqual({ count: 4, oldest: start });
    // the window is open at its start: a claim exactly at the instant is outside it
    expect(await since(start)).toEqual({ count: 2, oldest: world.clock.now() });
    expect(await since(world.clock.now())).toEqual({ count: 0, oldest: null });
  });

  it('serialises gate users: a second lock waits for the first transaction to end', async () => {
    const order: string[] = [];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = () => {};
    const first = ledger(async (l) => {
      await l.lockGate();
      order.push('first locked');
      locked();
      await held;
      order.push('first done');
    });
    await new Promise<void>((resolve) => {
      locked = resolve;
    });
    const second = ledger(async (l) => {
      await l.lockGate();
      order.push('second locked');
    });
    if (world.pg) {
      const pg = world.pg;
      await expect.poll(() => pg.lockWaits(), { timeout: 5_000 }).toBe(1);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(order).toEqual(['first locked']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['first locked', 'first done', 'second locked']);
  });

  it('serves only jobs and the CLI', async () => {
    const user = await world.seed.user({ role: 'headmaster' });
    await ledger((l) => l.get('x'), system('cli:jobs'));
    for (const principal of [world.as(user), system('auth.session'), system('test.seed')]) {
      await expect(ledger((l) => l.get('x'), principal)).rejects.toBeInstanceOf(ScopeViolation);
      await expect(ledger((l) => l.gate(), principal)).rejects.toBeInstanceOf(ScopeViolation);
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
    await ledger((l) => l.skip({ ...skipRow(user.id, 'old.skipped'), code: 'skipped.stale' }));
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
