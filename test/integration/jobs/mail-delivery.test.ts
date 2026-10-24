import { describe, expect, it } from 'vitest';

import { renderMail } from '@/notify';

import { setupTestDatabase } from '../../support/database';
import { setupJobs } from '../../support/jobs';
import { EMAIL, MAILBOX, ORIGIN, setupDelivery } from '../../support/mail-delivery';

const database = setupTestDatabase();
const jobs = setupJobs(database);
const { deliver, approved, enqueue, row, settled, ledger } = setupDelivery(database, jobs);
const SLOW = 30_000;

describe('mail delivery end to end (Graph transport, pg-boss, autoporada_worker)', () => {
  it(
    'sends the approval once, exactly as rendered',
    async () => {
      await jobs.timing();
      const { graph, boss } = await deliver();
      const job = await approved();
      const id = await enqueue(boss, job);
      await settled(id, 'completed');
      expect(await row(id)).toMatchObject({ output: { code: 'sent' }, retry_count: 0 });
      expect(graph.sent).toEqual([
        {
          ...{ mailbox: MAILBOX, to: EMAIL, ...renderMail('access.approved', {}, ORIGIN) },
          headers: { 'X-Autoporada-Dedupe': job.dedupeKey, 'X-Auto-Response-Suppress': 'All' },
        },
      ]);
      expect(graph.seen).toMatchObject({ callsInsideTransaction: 0, unscopedGrant: false });
      expect(await ledger(job.dedupeKey)).toEqual({ state: 'sent', code: 'sent' });

      // A dead copy of the same key, redriven by an operator, finds the ledger's `sent`.
      await boss.send('dead', job.data, { singletonKey: job.dedupeKey });
      expect(await boss.redrive('dead', { destination: 'mail.send' })).toBe(1);
      const [redriven] = await database.owner<{ id: string }>(
        `SELECT id FROM pgboss.job WHERE name = 'mail.send' AND id <> $1`,
        [id],
      );
      await settled(String(redriven?.id), 'completed');
      expect(await row(String(redriven?.id))).toMatchObject({ output: { code: 'already.sent' } });
      expect(graph.sent).toHaveLength(1);
    },
    SLOW,
  );

  it(
    'records a skipped key and calls nobody',
    async () => {
      await jobs.timing();
      const { graph, boss } = await deliver();
      const job = await approved(null);
      const id = await enqueue(boss, job);
      await settled(id, 'completed');
      expect(await row(id)).toMatchObject({ output: { code: 'skipped.no-address' } });
      expect(await ledger(job.dedupeKey)).toEqual({ state: 'skipped', code: 'skipped.no-address' });
      expect(graph.seen.calls).toBe(0);
    },
    SLOW,
  );

  it(
    'dead-letters a mail Graph refuses with 400, without a retry',
    async () => {
      await jobs.timing({ retryLimit: 3 });
      const { graph, boss } = await deliver();
      graph.script(400);
      const job = await approved();
      const id = await enqueue(boss, job);
      await settled(id, 'failed');
      expect(await row(id)).toMatchObject({ retry_count: 0, output: { code: 'rejected.400' } });
      const dead = await database.owner(
        `SELECT 1 FROM pgboss.job WHERE name = 'dead' AND source_id = $1`,
        [id],
      );
      expect(dead).toHaveLength(1);
      expect(await ledger(job.dedupeKey)).toEqual({ state: 'failed', code: 'rejected.400' });
      expect(graph.sent).toHaveLength(0);
    },
    SLOW,
  );

  const resends = () => jobs.lines.filter((l) => l['msg'] === 'mail.resend_unknown_outcome');

  it(
    'resends a mail whose attempt died after the 202: the one duplicate the ledger cannot close',
    async () => {
      await jobs.timing({ retryLimit: 3 });
      const { graph, boss } = await deliver({ dieAfterAccept: true });
      const job = await approved();
      const id = await enqueue(boss, job);
      await settled(id, 'completed');
      expect(await row(id)).toMatchObject({ retry_count: 1, output: { code: 'resent' } });
      expect(graph.sent).toHaveLength(2);
      expect(graph.sent[1]).toEqual(graph.sent[0]);
      expect(resends()).toHaveLength(1);
      expect(await ledger(job.dedupeKey)).toEqual({ state: 'sent', code: 'resent' });
    },
    SLOW,
  );

  it(
    'sends nothing again when only the completion was lost: what the ledger buys',
    async () => {
      await jobs.timing({ retryLimit: 3 });
      const { graph, boss } = await deliver({ loseCompletion: true });
      const job = await approved();
      const id = await enqueue(boss, job);
      await settled(id, 'completed');
      expect(await row(id)).toMatchObject({ retry_count: 1, output: { code: 'already.sent' } });
      expect(graph.sent).toHaveLength(1);
      expect(await ledger(job.dedupeKey)).toEqual({ state: 'sent', code: 'sent' });
    },
    SLOW,
  );

  it(
    'gives up after two ambiguous answers, and sends once more when an operator redrives it',
    async () => {
      await jobs.timing({ retryLimit: 5 });
      const { graph, boss } = await deliver();
      graph.acceptThenDrop();
      graph.acceptThenDrop();
      const job = await approved();
      const id = await enqueue(boss, job);
      await settled(id, 'failed');
      expect(await row(id)).toMatchObject({ retry_count: 2, output: { code: 'ambiguous' } });
      expect(graph.seen.calls).toBe(2);
      expect(await ledger(job.dedupeKey)).toEqual({ state: 'failed', code: 'ambiguous' });

      expect(await boss.redrive('dead')).toBe(1);
      const [redriven] = await database.owner<{ id: string }>(
        `SELECT id FROM pgboss.job WHERE name = 'mail.send' AND id <> $1`,
        [id],
      );
      await settled(String(redriven?.id), 'completed');
      expect(await row(String(redriven?.id))).toMatchObject({ output: { code: 'resent' } });
      expect(graph.seen.calls).toBe(3);
      expect(graph.sent).toHaveLength(3);
      expect(resends()).toHaveLength(1);
      expect(await ledger(job.dedupeKey)).toEqual({ state: 'sent', code: 'resent' });
    },
    SLOW,
  );
});
