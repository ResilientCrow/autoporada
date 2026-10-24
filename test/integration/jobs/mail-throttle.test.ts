import { describe, expect, it } from 'vitest';

import { setupTestDatabase } from '../../support/database';
import { setupJobs } from '../../support/jobs';
import { setupDelivery } from '../../support/mail-delivery';

const database = setupTestDatabase();
const jobs = setupJobs(database);
const { deliver, approved, enqueue, row, settled } = setupDelivery(database, jobs);
const SLOW = 60_000;
const SECOND = 1_000;

describe('pacing kept in the database (real runner, holds on the harness clock)', () => {
  it(
    'sends 20 in a minute and the 21st after it, across a worker restart, burning no retry',
    async () => {
      await jobs.timing({ retryLimit: 3 });
      const start = jobs.clock.now();
      const at = (ms: number) => new Date(start.getTime() + ms);
      const mails = [];
      for (let i = 0; i < 21; i += 1) mails.push(await approved());

      const first = await deliver();
      const ids = await Promise.all(mails.slice(0, 20).map((job) => enqueue(first.boss, job)));
      for (const id of ids) await settled(id, 'completed', 30_000);
      await first.worker.stop();
      expect(first.calls).toEqual(Array.from({ length: 20 }, () => start));

      // A new process: the window is in the ledger, not in memory.
      const second = await deliver({ graph: first.graph });
      const last = await enqueue(second.boss, mails[20]!);
      await settled(last, 'completed');
      expect(second.calls).toEqual([at(60 * SECOND)]);
      for (const id of [...ids, last]) {
        expect(await row(id)).toMatchObject({ retry_count: 0, output: { code: 'sent' } });
      }
      expect(first.graph.sent).toHaveLength(21);
    },
    SLOW,
  );

  it(
    'honours a Retry-After with a hold, not a retry',
    async () => {
      await jobs.timing({ retryLimit: 3 });
      const start = jobs.clock.now();
      const { graph, boss, calls } = await deliver();
      graph.script({ status: 429, retryAfter: '7' });
      const id = await enqueue(boss, await approved());
      await settled(id, 'completed');
      expect(calls).toEqual([start, new Date(start.getTime() + 7 * SECOND)]);
      expect(await row(id)).toMatchObject({ retry_count: 0, output: { code: 'sent' } });
      expect(graph.sent).toHaveLength(1);
    },
    SLOW,
  );

  it(
    'keeps the 429 pause for the next process when the worker stops mid-hold',
    async () => {
      await jobs.timing({ retryLimit: 3 });
      const start = jobs.clock.now();
      const first = await deliver({ sleep: jobs.untilAborted });
      first.graph.script({ status: 429, retryAfter: '300' });
      const id = await enqueue(first.boss, await approved());
      await expect.poll(() => first.calls.length, { timeout: 15_000 }).toBe(1);
      await first.worker.stop();

      const second = await deliver({ graph: first.graph });
      await settled(id, 'completed');
      expect(second.calls).toEqual([new Date(start.getTime() + 300 * SECOND)]);
      // The stop during the hold cost the one retry ADR 0016 accepts; the wait cost none.
      expect(await row(id)).toMatchObject({ retry_count: 1, output: { code: 'sent' } });
      expect(first.graph.sent).toHaveLength(1);
    },
    SLOW,
  );
});
