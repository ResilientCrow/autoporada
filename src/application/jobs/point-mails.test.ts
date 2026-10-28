/** The decision mails end to end (ADR 0020): the decision queues the job, the worker sends or skips it. */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type JobCatalog, type UserRecord, type WorkerDeps } from '@/application/ports';
import { decidePoint } from '@/application/use-cases';
import { renderMail } from '@/notify';

import { createFakeMail } from '../../../test/support/fake-mail';
import { pointFixtures } from '../../../test/support/points';
import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';

const world = setupWorld();
const { start, moveTo } = pointFixtures(world);
const ORIGIN = 'https://autoporada.test';
const EMAIL = 'jana.novakova@ssps.cz';
const NOTE = 'Doplňte prosím vyjádření.';

/** The worker's side (autoporada_worker in the pg world) and the transport it calls. */
function worker() {
  const mail = createFakeMail();
  const deps: WorkerDeps = { db: world.workerDb, clock: world.clock, appOrigin: ORIGIN, mail };
  const run = async () => {
    const [job, ...rest] = await world.inspect.jobs();
    expect(rest).toEqual([]);
    const data = job!.data as JobCatalog['mail.send'];
    const dedupeKey = job!.options.dedupeKey ?? null;
    const input = { id: randomUUID(), data, attempt: 1, dedupeKey, redriven: false };
    return JOB_HANDLERS['mail.send'](deps, input);
  };
  return { mail, run };
}

/** A submitted pokyn of an author with an address, and a reviewer to decide it. */
async function handedIn(): Promise<{ author: UserRecord; reviewer: UserRecord; id: string }> {
  const author = await world.seed.user({ role: 'submitter', email: EMAIL });
  const reviewer = await world.seed.user({ role: 'reviewer' });
  const id = await start(author, 'pokyn');
  await moveTo(author, id, 'submitted');
  return { author, reviewer, id };
}

const decide = (by: UserRecord, id: string, event: string, note?: string) =>
  world.run(decidePoint, world.as(by), {
    id,
    event,
    expectedVersion: 2,
    ...(note !== undefined && { note }),
  });

describe('decision mails', () => {
  it.each([
    ['return', 'point.returned', NOTE],
    ['approve', 'point.approved', undefined],
    ['reject', 'point.rejected', NOTE],
  ] as const)('%s: mails the author %s with the link to their points', async (...row) => {
    const [event, template, note] = row;
    const { reviewer, id } = await handedIn();
    expect((await decide(reviewer, id, event, note)).ok).toBe(true);
    const { mail, run } = worker();
    expect(await run()).toMatchObject({ kind: 'done', code: 'sent' });
    expect(mail.calls).toHaveLength(1);
    const sent = mail.calls[0]!.mail;
    expect(sent).toMatchObject({ to: EMAIL, ...renderMail(template, {}, ORIGIN) });
    expect(sent.text).toContain(`\n${ORIGIN}/body\n`);
    // Ids only: the note stays in the app.
    expect(sent.text).not.toContain('Doplňte');
  });

  it('skips a return as stale once the author handed the point in again', async () => {
    const { author, reviewer, id } = await handedIn();
    expect((await decide(reviewer, id, 'return', NOTE)).ok).toBe(true);
    await moveTo(author, id, 'submitted');
    const { mail, run } = worker();
    expect(await run()).toEqual({ kind: 'done', code: 'skipped.stale' });
    expect(mail.calls).toEqual([]);
  });

  it('skips as stale once the author’s account was deactivated', async () => {
    const { author, reviewer, id } = await handedIn();
    expect((await decide(reviewer, id, 'approve')).ok).toBe(true);
    await world.tx(system('test.seed'), (tx) =>
      tx.users.changeAccess(author.id, author.version, { status: 'deactivated' }),
    );
    const { mail, run } = worker();
    expect(await run()).toEqual({ kind: 'done', code: 'skipped.stale' });
    expect(mail.calls).toEqual([]);
  });
});
