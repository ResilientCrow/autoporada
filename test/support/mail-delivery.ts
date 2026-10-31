/**
 * End-to-end mail delivery for integration tests: the real Graph transport
 * against the fake Graph and TestIdp, a real worker as autoporada_worker on
 * the harness's queue timing, and requesters seeded on the app's side.
 */
import { randomUUID } from 'node:crypto';

import type { PgBoss } from 'pg-boss';
import { expect } from 'vitest';

import { JOB_HANDLERS } from '@/application/jobs';
import { mailJob } from '@/application/notifications';
import {
  system,
  type JobHandlers,
  type MailPort,
  type Tx,
  type WorkerDeps,
} from '@/application/ports';
import { jobId } from '@/infra/jobs';
import { createGraphMail } from '@/infra/mail';
import { createAppTokenSource } from '@/infra/oidc';
import { startWorker, type Sleep } from '@/infra/worker';

import type { TestDatabase } from './database';
import { createFakeGraph, GRAPH_BASE } from './graph/fake-graph';
import type { FakeGraph } from './graph/fake-graph-api';
import type { setupJobs } from './jobs';
import { createTestIdp, TEST_CLIENT, TEST_ISSUER, TEST_SECRET } from './oidc/test-idp';
import { FixedClock } from './world/clock';
import { insertAccessRequest } from './world/pg/backend';
import { unusedConverter } from './fake-converter';

export const ORIGIN = 'https://autoporada.test';
export const MAILBOX = 'autoporada@ssps.cz';
export const EMAIL = 'jana.novakova@ssps.cz';

/** Faults of the worker, each once: it dies after Graph's 202, or pg-boss loses the completion. */
interface Options {
  readonly dieAfterAccept?: boolean;
  readonly loseCompletion?: boolean;
  /** The runner's hold; by default instant, moving the harness clock. */
  readonly sleep?: Sleep;
  /** Another process's view of the same Graph (a restart): its mails and scripts carry over. */
  readonly graph?: FakeGraph;
}

export function setupDelivery(database: TestDatabase, jobs: ReturnType<typeof setupJobs>) {
  /** A worker process; `calls` holds the harness clock's instant of each Graph call. */
  async function deliver(options: Options = {}) {
    let { dieAfterAccept = false, loseCompletion = false } = options;
    const wall = new FixedClock(new Date());
    const graph =
      options.graph ??
      createFakeGraph({ idp: await createTestIdp(), mailbox: MAILBOX, clock: wall });
    const tokens = createAppTokenSource({
      provider: {
        ...{ issuer: TEST_ISSUER, clientId: TEST_CLIENT, appOrigin: ORIGIN, production: true },
        ...{ credential: { kind: 'secret', secret: TEST_SECRET }, domainHint: null },
        fetch: graph.fetch,
      },
      scope: 'https://graph.microsoft.com/.default',
      clock: wall,
    });
    const graphMail = createGraphMail({
      ...{ baseUrl: GRAPH_BASE, mailbox: MAILBOX, tokens, fetch: graph.fetch, clock: wall },
    });
    const calls: Date[] = [];
    // Phase row 3: the mail left, and the settle never runs.
    const mail: MailPort = {
      async send(outgoing) {
        calls.push(jobs.clock.now());
        const result = await graphMail.send(outgoing);
        if (!dieAfterAccept) return result;
        dieAfterAccept = false;
        throw new Error('the worker died after the 202');
      },
    };
    // Phase row 5: the settle committed, and pg-boss never heard of it.
    const handlers: JobHandlers = {
      ...JOB_HANDLERS,
      async 'mail.send'(deps, job) {
        const outcome = await JOB_HANDLERS['mail.send'](deps, job);
        if (!loseCompletion) return outcome;
        loseCompletion = false;
        throw new Error('the completion was lost');
      },
    };
    const deps: WorkerDeps = {
      db: database.worker,
      clock: jobs.clock,
      appOrigin: ORIGIN,
      mail,
      converter: unusedConverter,
    };
    const boss = jobs.boss();
    const worker = await startWorker({
      ...{ boss, handlers, schedules: [], deps, log: jobs.log },
      ...{ pollSeconds: 0.5, sleep: options.sleep ?? jobs.instant },
    });
    return { graph, boss, worker, calls };
  }

  /** An approved requester, seeded on the app's side; returns their mail job. */
  async function approved(email: string | null = EMAIL) {
    const seed = <T>(work: (tx: Tx) => Promise<T>) =>
      database.app.transaction(
        { principal: system('test.seed'), now: jobs.clock.now(), requestId: 'seed' },
        { mode: 'write' },
        work,
      );
    const person = (address: string | null) =>
      seed((tx) =>
        tx.users.upsertFromClaims({
          ...{ tid: '00000000-0000-0000-0000-000000000001', oid: randomUUID() },
          ...{ displayName: 'Jana Nováková', email: address, jobTitle: null, department: null },
        }),
      );
    const headmaster = await person(null);
    const fresh = await person(email);
    const user = await seed((tx) =>
      tx.users.changeAccess(fresh.id, fresh.version, { role: 'submitter' }),
    );
    const request = await insertAccessRequest(database, {
      ...{ userId: user.id, reason: 'Učím informatiku.', state: 'approved' },
      ...{ decidedBy: headmaster.id, decidedAt: jobs.clock.now(), createdAt: jobs.clock.now() },
    });
    return mailJob('access.approved', { recipientId: user.id, requestId: request.id });
  }

  /** Enqueues `job` as the web does: the id derived from the key, the key kept for humans. */
  async function enqueue(boss: PgBoss, job: Awaited<ReturnType<typeof approved>>) {
    const id = jobId('mail.send', job.dedupeKey);
    await boss.send('mail.send', job.data, { id, singletonKey: job.dedupeKey });
    return id;
  }

  const row = async (id: string) =>
    (
      await database.owner<{ state: string; retry_count: number; output: unknown }>(
        `SELECT state, retry_count, output FROM pgboss.job WHERE name = 'mail.send' AND id = $1`,
        [id],
      )
    )[0];
  const settled = (id: string, state: string, timeout = 15_000) =>
    expect.poll(async () => (await row(id))?.state, { timeout }).toBe(state);
  const ledger = async (key: string) =>
    (
      await database.owner<{ state: string; code: string }>(
        'SELECT state, code FROM mail_ledger WHERE dedupe_key = $1',
        [key],
      )
    )[0];

  return { deliver, approved, enqueue, row, settled, ledger };
}
