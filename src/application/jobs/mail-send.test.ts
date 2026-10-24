import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { mailJob } from '@/application/notifications';
import { system, type JobInput, type LedgerRow, type WorkerDeps } from '@/application/ports';
import { cooldownEnd } from '@/domain/review';
import { instantToWallClock } from '@/domain/time';
import { renderMail } from '@/notify';

import { createFakeMail } from '../../../test/support/fake-mail';
import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';

const world = setupWorld();
type UserSeed = NonNullable<Parameters<typeof world.seed.user>[0]>;
const ORIGIN = 'https://autoporada.test';
const EMAIL = 'jana.novakova@ssps.cz';

/** The handler on the worker's side (autoporada_worker in the pg world); seeding runs on app. */
function handler() {
  const mail = createFakeMail();
  const deps: WorkerDeps = { db: world.workerDb, clock: world.clock, appOrigin: ORIGIN, mail };
  const run = (job: ReturnType<typeof mailJob>, redriven = false) => {
    const { data, dedupeKey } = job;
    const input: JobInput<'mail.send'> = {
      id: randomUUID(),
      data,
      attempt: 1,
      dedupeKey,
      redriven,
    };
    return JOB_HANDLERS['mail.send'](deps, input);
  };
  return { mail, run };
}

const ledger = (key: string): Promise<LedgerRow | null> =>
  world.workerDb.transaction(
    { principal: system('job:test'), now: world.clock.now(), requestId: 'inspect' },
    { mode: 'read' },
    (tx) => tx.mailLedger.get(key),
  );

/** A requester whose request the headmaster decided as `state`. */
async function decided(state: 'approved' | 'rejected' | 'blocked', over: UserSeed = {}) {
  const headmaster = await world.seed.user({ role: 'headmaster' });
  const member = state === 'approved' ? 'submitter' : 'pending';
  const user = await world.seed.user({ email: EMAIL, role: member, ...over });
  const request = await world.seed.accessRequest({
    userId: user.id,
    state,
    decidedBy: headmaster.id,
  });
  const template = `access.${state}` as const;
  return { user, request, job: mailJob(template, { recipientId: user.id, requestId: request.id }) };
}

describe('the mail.send handler', () => {
  it('sends the approval outside any transaction and records it as sent', async () => {
    const { job } = await decided('approved');
    const { mail, run } = handler();
    expect(await run(job)).toEqual({ kind: 'done', code: 'sent' });
    expect(mail.calls).toEqual([
      {
        mail: { to: EMAIL, ...renderMail('access.approved', {}, ORIGIN), dedupeKey: job.dedupeKey },
        insideTransaction: false,
      },
    ]);
    expect(await ledger(job.dedupeKey)).toMatchObject({
      ...{ state: 'sent', code: 'sent', graphRequestId: 'request-1', attempts: 1 },
      ...{ unknownSends: 0, claimedAt: world.clock.now(), settledAt: world.clock.now() },
    });
  });

  it('tells a rejected requester from which day they may ask again', async () => {
    const { request, job } = await decided('rejected');
    const { mail, run } = handler();
    expect(await run(job)).toEqual({ kind: 'done', code: 'sent' });
    const retryFrom = instantToWallClock(cooldownEnd(request.decidedAt ?? new Date(0))).date;
    expect(mail.calls[0]?.mail).toMatchObject(renderMail('access.rejected', { retryFrom }, ORIGIN));
  });

  it.each(['access.granted', 'mail.check'] as const)(
    'sends %s, whose subject is the recipient',
    async (template) => {
      const user = await world.seed.user({ email: EMAIL, role: 'submitter' });
      const job =
        template === 'access.granted'
          ? mailJob(template, { userId: user.id, versionAfter: user.version })
          : mailJob(template, { recipientId: user.id, checkId: randomUUID() });
      const { mail, run } = handler();
      expect(await run(job)).toEqual({ kind: 'done', code: 'sent' });
      expect(mail.calls.map((c) => c.mail.subject)).toEqual([
        renderMail(template, {}, ORIGIN).subject,
      ]);
    },
  );

  it('sends nothing for a key already sent, even when redriven', async () => {
    const { job } = await decided('approved');
    const { mail, run } = handler();
    await run(job);
    expect(await run(job)).toEqual({ kind: 'done', code: 'already.sent' });
    expect(await run(job, true)).toEqual({ kind: 'done', code: 'already.sent' });
    expect(mail.calls).toHaveLength(1);
  });

  it('keeps no row about a recipient who no longer exists', async () => {
    const { user, job } = await decided('approved');
    await world.erase.user(user.id);
    const { mail, run } = handler();
    expect(await run(job)).toEqual({ kind: 'done', code: 'skipped.recipient-gone' });
    expect(await ledger(job.dedupeKey)).toBeNull();
    expect(mail.calls).toHaveLength(0);
  });

  it.each([
    ['the request was purged', {}, 'stale', true],
    ['the decision was overtaken', { role: 'pending' }, 'stale', false],
    ['there is no address', { email: null }, 'no-address', false],
    ['the address is not ASCII', { email: 'jana.nováková@ssps.cz' }, 'no-address', false],
  ] as const)('records a skip when %s', async (_why, over, code, purged) => {
    const { user, job } = await decided('approved', over);
    const sent = purged
      ? mailJob('access.approved', { recipientId: user.id, requestId: randomUUID() })
      : job;
    const { mail, run } = handler();
    expect(await run(sent)).toEqual({ kind: 'done', code: `skipped.${code}` });
    expect(await ledger(sent.dedupeKey)).toMatchObject({
      ...{ state: 'skipped', code: `skipped.${code}`, attempts: 0 },
    });
    expect(mail.calls).toHaveLength(0);
  });

  it.each([
    [{ kind: 'rejected', code: 'rejected.400' }, { kind: 'dead', code: 'rejected.400' }, 'failed'],
    [
      { kind: 'not-sent', code: 'net.ENOTFOUND' },
      { kind: 'retry', code: 'net.ENOTFOUND' },
      'deferred',
    ],
    [
      { kind: 'throttled', retryAfterMs: 7_000, code: 'throttled.429' },
      { kind: 'retry', code: 'throttled.429' },
      'deferred',
    ],
    [{ kind: 'auth', code: 'auth.403' }, { kind: 'retry', code: 'auth.403' }, 'deferred'],
    [
      { kind: 'unknown', code: 'unknown.timeout' },
      { kind: 'retry', code: 'unknown.timeout' },
      'unknown',
    ],
  ] as const)('settles %o as %o', async (result, outcome, state) => {
    const { job } = await decided('approved');
    const { mail, run } = handler();
    mail.script(result);
    expect(await run(job)).toEqual(outcome);
    expect(await ledger(job.dedupeKey)).toMatchObject({
      ...{ state, code: result.code, graphRequestId: null },
      unknownSends: state === 'unknown' ? 1 : 0,
    });
  });

  it('dead-letters a job that carries no key: nothing could stop a second copy', async () => {
    const { job } = await decided('approved');
    const { mail } = handler();
    const deps: WorkerDeps = { db: world.workerDb, clock: world.clock, appOrigin: ORIGIN, mail };
    const input = {
      id: randomUUID(),
      data: job.data,
      attempt: 1,
      dedupeKey: null,
      redriven: false,
    };
    expect(await JOB_HANDLERS['mail.send'](deps, input)).toEqual({ kind: 'dead', code: 'no-key' });
    expect(mail.calls).toHaveLength(0);
  });
});
