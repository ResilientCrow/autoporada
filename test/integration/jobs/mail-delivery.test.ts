import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { JOB_HANDLERS } from '@/application/jobs';
import { mailJob } from '@/application/notifications';
import { system, type Tx, type WorkerDeps } from '@/application/ports';
import { jobId } from '@/infra/jobs';
import { createGraphMail } from '@/infra/mail';
import { createAppTokenSource } from '@/infra/oidc';
import { startWorker } from '@/infra/worker';
import { renderMail } from '@/notify';

import { setupTestDatabase } from '../../support/database';
import { createFakeGraph, GRAPH_BASE } from '../../support/graph/fake-graph';
import { setupJobs } from '../../support/jobs';
import { createTestIdp, TEST_CLIENT, TEST_ISSUER, TEST_SECRET } from '../../support/oidc/test-idp';
import { FixedClock } from '../../support/world/clock';
import { insertAccessRequest } from '../../support/world/pg/backend';

const database = setupTestDatabase();
const jobs = setupJobs(database);
const SLOW = 30_000;
const ORIGIN = 'https://autoporada.test';
const MAILBOX = 'autoporada@ssps.cz';
const EMAIL = 'jana.novakova@ssps.cz';

/** The real Graph transport against the fake Graph and TestIdp, under a real worker as autoporada_worker. */
async function deliver() {
  const idp = await createTestIdp();
  const wall = new FixedClock(new Date());
  const graph = createFakeGraph({ idp, mailbox: MAILBOX, clock: wall });
  const tokens = createAppTokenSource({
    provider: {
      ...{ issuer: TEST_ISSUER, clientId: TEST_CLIENT, appOrigin: ORIGIN, production: true },
      ...{ credential: { kind: 'secret', secret: TEST_SECRET }, domainHint: null },
      fetch: graph.fetch,
    },
    scope: 'https://graph.microsoft.com/.default',
    clock: wall,
  });
  const mail = createGraphMail({
    ...{ baseUrl: GRAPH_BASE, mailbox: MAILBOX, tokens, fetch: graph.fetch, clock: wall },
  });
  const deps: WorkerDeps = { db: database.worker, clock: jobs.clock, appOrigin: ORIGIN, mail };
  const boss = jobs.boss();
  await startWorker({
    ...{ boss, handlers: JOB_HANDLERS, schedules: [], deps, log: jobs.log },
    ...{ pollSeconds: 0.5, sleep: jobs.instant },
  });
  return { graph, boss };
}

/** An approved requester, seeded on the app's side. */
async function approved(email: string | null) {
  const seed = <T>(work: (tx: Tx) => Promise<T>) =>
    database.app.transaction(
      { principal: system('test.seed'), now: jobs.clock.now(), requestId: 'seed' },
      { mode: 'write' },
      work,
    );
  const person = (oid: string, address: string | null) =>
    seed((tx) =>
      tx.users.upsertFromClaims({
        ...{ tid: '00000000-0000-0000-0000-000000000001', oid, displayName: 'Jana Nováková' },
        ...{ email: address, jobTitle: null, department: null },
      }),
    );
  const headmaster = await person(randomUUID(), null);
  const fresh = await person(randomUUID(), email);
  const user = await seed((tx) =>
    tx.users.changeAccess(fresh.id, fresh.version, { role: 'submitter' }),
  );
  const request = await insertAccessRequest(database, {
    ...{ userId: user.id, reason: 'Učím informatiku.', state: 'approved' },
    ...{ decidedBy: headmaster.id, decidedAt: jobs.clock.now(), createdAt: jobs.clock.now() },
  });
  return mailJob('access.approved', { recipientId: user.id, requestId: request.id });
}

const row = async (id: string) =>
  (
    await database.owner<{ state: string; retry_count: number; output: unknown }>(
      `SELECT state, retry_count, output FROM pgboss.job WHERE name = 'mail.send' AND id = $1`,
      [id],
    )
  )[0];
const settled = (id: string, state: string) =>
  expect.poll(async () => (await row(id))?.state, { timeout: 15_000 }).toBe(state);
const ledger = async (key: string) =>
  (
    await database.owner<{ state: string; code: string }>(
      'SELECT state, code FROM mail_ledger WHERE dedupe_key = $1',
      [key],
    )
  )[0];

describe('mail delivery end to end (Graph transport, pg-boss, autoporada_worker)', () => {
  it(
    'sends the approval once, exactly as rendered',
    async () => {
      await jobs.timing();
      const { graph, boss } = await deliver();
      const job = await approved(EMAIL);
      const id = await boss.send('mail.send', job.data, {
        ...{ id: jobId('mail.send', job.dedupeKey), singletonKey: job.dedupeKey },
      });
      await settled(String(id), 'completed');
      expect(await row(String(id))).toMatchObject({ output: { code: 'sent' }, retry_count: 0 });
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
      const id = jobId('mail.send', job.dedupeKey);
      await boss.send('mail.send', job.data, { id, singletonKey: job.dedupeKey });
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
      const job = await approved(EMAIL);
      const id = jobId('mail.send', job.dedupeKey);
      await boss.send('mail.send', job.data, { id, singletonKey: job.dedupeKey });
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
});
