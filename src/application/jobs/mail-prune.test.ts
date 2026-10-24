import { describe, expect, it } from 'vitest';

import { system, type JobInput, type WorkerDeps } from '@/application/ports';
import { MAIL_LEDGER_RETENTION_DAYS } from '@/domain/retention';

import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';

const world = setupWorld();
const DAY = 86_400_000;
const RETENTION = MAIL_LEDGER_RETENTION_DAYS * DAY;
const job: JobInput<'mail.prune'> = {
  id: 'prune-1',
  data: {},
  attempt: 1,
  dedupeKey: null,
  redriven: false,
};

/** The worker's side: autoporada_worker in the pg world. Mail is never sent by a prune. */
const deps = (): WorkerDeps => ({
  db: world.workerDb,
  clock: world.clock,
  appOrigin: 'https://autoporada.test',
  mail: { send: () => Promise.reject(new Error('a prune sends no mail')) },
});

const ledger = <T>(work: Parameters<typeof world.workerDb.transaction<T>>[2]) =>
  world.workerDb.transaction(
    { principal: system('job:test'), now: world.clock.now(), requestId: 'seed' },
    { mode: 'write' },
    work,
  );

const row = (recipientId: string, dedupeKey: string) => ({
  dedupeKey,
  template: 'access.approved' as const,
  recipientId,
  subjectId: '00000000-0000-7000-8000-00000000a001',
  unknownSends: 0,
});

const keys = () =>
  ledger(async (tx) =>
    Promise.all(
      ['old.sent', 'old.skipped', 'edge.sent', 'new.sent'].map(async (k) =>
        (await tx.mailLedger.get(k)) ? k : null,
      ),
    ),
  ).then((found) => found.filter((k) => k !== null));

describe('the mail.prune handler', () => {
  it('deletes ledger rows settled more than 91 days ago, skipped ones included, and is idempotent', async () => {
    const user = await world.seed.user();
    await ledger(async (tx) => {
      await tx.mailLedger.claim(row(user.id, 'old.sent'));
      await tx.mailLedger.settle('old.sent', { state: 'sent', code: 'sent' });
      await tx.mailLedger.skip({ ...row(user.id, 'old.skipped'), code: 'skipped.stale' });
    });
    world.clock.advance(1);
    await ledger((tx) =>
      tx.mailLedger.skip({ ...row(user.id, 'edge.sent'), code: 'skipped.stale' }),
    );
    world.clock.advance(DAY);
    await ledger(async (tx) => {
      await tx.mailLedger.claim(row(user.id, 'new.sent'));
      await tx.mailLedger.settle('new.sent', { state: 'sent', code: 'sent' });
    });

    // now is exactly 91 days after edge.sent settled: the older rows go, it stays
    world.clock.advance(RETENTION - DAY);
    expect(await JOB_HANDLERS['mail.prune'](deps(), job)).toEqual({ kind: 'done', code: 'purged' });
    expect(await keys()).toEqual(['edge.sent', 'new.sent']);

    expect(await JOB_HANDLERS['mail.prune'](deps(), job)).toEqual({ kind: 'done', code: 'purged' });
    expect(await keys()).toEqual(['edge.sent', 'new.sent']);
  });
});
