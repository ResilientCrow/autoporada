import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { mailJob } from '@/application/notifications';
import { system, type JobInput, type LedgerRow, type WorkerDeps } from '@/application/ports';
import { changeUserAccess, decideAccess } from '@/application/use-cases';
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
  describe('an approval overtaken after its mail was queued (S5)', () => {
    /** The approval runs as a use case on the app handle; the worker then gets the job it queued. */
    async function approved() {
      const head = await world.seed.user({ role: 'headmaster' });
      const user = await world.seed.user({ email: EMAIL, role: 'pending' });
      const request = await world.seed.accessRequest({ userId: user.id, state: 'pending' });
      expect(
        await world.run(decideAccess, world.as(head), {
          requestId: request.id,
          version: request.version,
          decision: 'approve-staff',
        }),
      ).toEqual({ ok: true, value: { state: 'approved' } });
      const job = mailJob('access.approved', { recipientId: user.id, requestId: request.id });
      expect(await world.inspect.jobs()).toEqual([
        { name: 'mail.send', data: job.data, options: { dedupeKey: job.dedupeKey } },
      ]);
      return { head, job, member: { id: user.id, version: user.version + 1 } };
    }

    it('skips as stale when the account is blocked meanwhile, and sends nothing', async () => {
      const { head, job, member } = await approved();
      expect(
        await world.run(changeUserAccess, world.as(head), {
          userId: member.id,
          version: member.version,
          role: 'submitter',
          audience: 'staff',
          status: 'blocked',
          confirmed: true,
        }),
      ).toEqual({ ok: true, value: { changed: true } });
      const { mail, run } = handler();
      expect(await run(job)).toEqual({ kind: 'done', code: 'skipped.stale' });
      expect(mail.calls).toHaveLength(0);
      expect(await ledger(job.dedupeKey)).toMatchObject({ state: 'skipped', attempts: 0 });
    });

    it('skips as stale when the user is lowered to pending meanwhile', async () => {
      // The form never offers pending (changeAccess refuses it), so the row is lowered directly.
      const { job, member } = await approved();
      await world.tx(system('test.seed'), (tx) =>
        tx.users.changeAccess(member.id, member.version, { role: 'pending' }),
      );
      const { mail, run } = handler();
      expect(await run(job)).toEqual({ kind: 'done', code: 'skipped.stale' });
      expect(mail.calls).toHaveLength(0);
    });
  });

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

  describe('ambiguous outcomes', () => {
    const UNKNOWN = { kind: 'unknown', code: 'unknown.timeout' } as const;

    it('resends after an unknown outcome, flagged as a resend', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler();
      mail.script(UNKNOWN);
      expect(await run(job)).toEqual({ kind: 'retry', code: 'unknown.timeout' });
      expect(await run(job)).toEqual({ kind: 'done', code: 'resent' });
      expect(mail.calls).toHaveLength(2);
      expect(await ledger(job.dedupeKey)).toMatchObject({
        ...{ state: 'sent', code: 'resent', unknownSends: 1, attempts: 2 },
      });
    });

    it('resends a mail whose attempt died before it settled', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler();
      mail.script(new Error('the worker died after the provider took the mail'));
      await expect(run(job)).rejects.toThrow(/worker died/);
      expect(await ledger(job.dedupeKey)).toMatchObject({ state: 'sending', unknownSends: 0 });
      expect(await run(job)).toEqual({ kind: 'done', code: 'resent' });
      expect(await ledger(job.dedupeKey)).toMatchObject({ state: 'sent', unknownSends: 1 });
      expect(mail.calls.map((c) => c.mail)).toEqual([mail.calls[0]?.mail, mail.calls[0]?.mail]);
    });

    it('gives up after the second unknown outcome, without a third call', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler();
      mail.script(UNKNOWN, UNKNOWN);
      await run(job);
      expect(await run(job)).toEqual({ kind: 'retry', code: 'unknown.timeout' });
      expect(await run(job)).toEqual({ kind: 'dead', code: 'ambiguous' });
      expect(await run(job)).toEqual({ kind: 'dead', code: 'already.failed' });
      expect(mail.calls).toHaveLength(2);
      expect(await ledger(job.dedupeKey)).toMatchObject({
        ...{ state: 'failed', code: 'ambiguous', unknownSends: 2 },
      });
    });

    it('sends once more, flagged, when an operator redrives the ambiguous key', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler();
      mail.script(UNKNOWN, UNKNOWN);
      for (let attempt = 0; attempt < 3; attempt += 1) await run(job);
      expect(await run(job, true)).toEqual({ kind: 'done', code: 'resent' });
      expect(await run(job, true)).toEqual({ kind: 'done', code: 'already.sent' });
      expect(mail.calls).toHaveLength(3);
      expect(await ledger(job.dedupeKey)).toMatchObject({ state: 'sent', unknownSends: 0 });
    });
  });

  describe('pacing (one gate and a 20-per-minute window, kept in the ledger)', () => {
    const SECOND = 1_000;
    const gate = () =>
      world.workerDb.transaction(
        { principal: system('job:test'), now: world.clock.now(), requestId: 'inspect' },
        { mode: 'read' },
        (tx) => tx.mailLedger.gate(),
      );
    /** `count` mails sent a second apart, the first at the clock's now; the clock ends there. */
    async function sendMany(count: number) {
      const { mail, run } = handler();
      for (let i = 0; i < count; i += 1) {
        await run((await decided('approved')).job);
        world.clock.advance(SECOND);
      }
      return mail;
    }

    it('waits at a closed gate without a call or a claim', async () => {
      const until = new Date(world.clock.now().getTime() + 30 * SECOND);
      await world.workerDb.transaction(
        { principal: system('job:test'), now: world.clock.now(), requestId: 'seed' },
        { mode: 'write' },
        (tx) => tx.mailLedger.closeGate(until, 'throttled.429'),
      );
      const { job } = await decided('approved');
      const { mail, run } = handler();
      expect(await run(job)).toEqual({ kind: 'wait', until, code: 'wait.gate' });
      expect(mail.calls).toHaveLength(0);
      expect(await ledger(job.dedupeKey)).toBeNull();
      world.clock.set(until);
      expect(await run(job)).toEqual({ kind: 'done', code: 'sent' });
    });

    it('holds the 21st mail of a minute until the oldest send leaves the window', async () => {
      const first = world.clock.now();
      const mail = await sendMany(20);
      const { job } = await decided('approved');
      const { run } = handler();
      const until = new Date(first.getTime() + 60 * SECOND);
      expect(await run(job)).toEqual({ kind: 'wait', until, code: 'wait.window' });
      world.clock.set(until);
      expect(await run(job)).toEqual({ kind: 'done', code: 'sent' });
      expect(mail.calls).toHaveLength(20);
    });

    it('frees the slot of a mail that was deferred: nothing was sent', async () => {
      const { mail, run } = handler();
      mail.script({ kind: 'not-sent', code: 'net.ENOTFOUND' });
      await run((await decided('approved')).job);
      await sendMany(19);
      expect(await run((await decided('approved')).job)).toEqual({ kind: 'done', code: 'sent' });
    });

    it('closes the gate for a Retry-After and waits for it, burning no retry', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler();
      mail.script({ kind: 'throttled', retryAfterMs: 7 * SECOND, code: 'throttled.429' });
      const until = new Date(world.clock.now().getTime() + 7 * SECOND);
      expect(await run(job)).toEqual({ kind: 'wait', until, code: 'throttled.429' });
      expect(await gate()).toEqual({ notBefore: until, code: 'throttled.429' });
      expect(await ledger(job.dedupeKey)).toMatchObject({
        state: 'deferred',
        code: 'throttled.429',
      });
    });

    it('pauses everyone for a minute on an auth refusal, and retries', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler();
      mail.script({ kind: 'auth', code: 'auth.403' });
      const until = new Date(world.clock.now().getTime() + 60 * SECOND);
      expect(await run(job)).toEqual({ kind: 'retry', code: 'auth.403' });
      expect(await gate()).toEqual({ notBefore: until, code: 'auth.403' });
      expect(await ledger(job.dedupeKey)).toMatchObject({ state: 'deferred', code: 'auth.403' });
      expect(await run(job)).toEqual({ kind: 'wait', until, code: 'wait.gate' });
    });
  });
});
