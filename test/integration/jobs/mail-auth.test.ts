import { describe, expect, it } from 'vitest';

import { setupTestDatabase } from '../../support/database';
import { setupJobs } from '../../support/jobs';
import { MAILBOX, setupDelivery } from '../../support/mail-delivery';

const database = setupTestDatabase();
const jobs = setupJobs(database);
const { deliver, approved, enqueue, row, settled, ledger } = setupDelivery(database, jobs);
const SLOW = 60_000;
const MINUTE = 60_000;

const deadCopies = (id: string) =>
  database.owner(`SELECT 1 FROM pgboss.job WHERE name = 'dead' AND source_id = $1`, [id]);
/** The gaps between consecutive Graph calls, on the harness clock. */
const gaps = (calls: readonly Date[]) =>
  calls.slice(1).map((call, i) => call.getTime() - (calls[i]?.getTime() ?? 0));
const systemic = () => jobs.lines.filter((l) => l['msg'] === 'mail.systemic');

describe('an auth refusal pauses sending (403 while Exchange RBAC propagates)', () => {
  it(
    'rides out five refusals, one Graph call a minute, and sends',
    async () => {
      await jobs.timing();
      const { graph, boss, calls } = await deliver();
      graph.rbacPendingFor(5);
      const job = await approved();
      const id = await enqueue(boss, job);
      await settled(id, 'completed', 45_000);
      expect(await row(id)).toMatchObject({ retry_count: 5, output: { code: 'sent' } });
      expect(graph.seen.calls).toBe(6);
      expect(gaps(calls)).toEqual(Array.from({ length: 5 }, () => MINUTE));
      expect(systemic()).toHaveLength(5);
      expect(await deadCopies(id)).toHaveLength(0);
      expect(await ledger(job.dedupeKey)).toEqual({ state: 'sent', code: 'sent' });
    },
    SLOW,
  );

  it(
    'dead-letters a mailbox out of scope once its retries run out',
    async () => {
      await jobs.timing({ retryLimit: 3 });
      const { graph, boss, calls } = await deliver();
      graph.outOfScope(MAILBOX);
      const job = await approved();
      const id = await enqueue(boss, job);
      await settled(id, 'failed', 45_000);
      expect(await row(id)).toMatchObject({ retry_count: 3, output: { code: 'auth.403' } });
      expect(graph.seen.calls).toBe(4);
      expect(gaps(calls)).toEqual([MINUTE, MINUTE, MINUTE]);
      expect(await deadCopies(id)).toHaveLength(1);
      expect(await ledger(job.dedupeKey)).toEqual({ state: 'deferred', code: 'auth.403' });
      expect(graph.sent).toHaveLength(0);
    },
    SLOW,
  );
});
