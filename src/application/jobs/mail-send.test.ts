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
import { unusedConverter } from '../../../test/support/fake-converter';

const world = setupWorld();
type UserSeed = NonNullable<Parameters<typeof world.seed.user>[0]>;
const ORIGIN = 'https://autoporada.test';
type MailJob = ReturnType<typeof mailJob>;
const EMAIL = 'jana.novakova@ssps.cz';

interface Run {
  /** The id of a job an operator revived from the dead letters; the original job's otherwise. */
  readonly redrive?: string;
  readonly attempt?: number;
}

/**
 * The handler on the worker's side (autoporada_worker in the pg world); seeding runs on app.
 * Every run is the same original job (`id`) unless it names a revived one.
 */
function handler({ takesMs = 0 }: { readonly takesMs?: number } = {}) {
  const fake = createFakeMail();
  /** The transport call takes `takesMs` on the world's clock. */
  const mail: typeof fake = {
    ...fake,
    send: (outgoing) => {
      world.clock.advance(takesMs);
      return fake.send(outgoing);
    },
  };
  const deps: WorkerDeps = {
    db: world.workerDb,
    clock: world.clock,
    appOrigin: ORIGIN,
    mail,
    converter: unusedConverter,
  };
  const id = randomUUID();
  const run = (job: MailJob, { redrive, attempt = 1 }: Run = {}) => {
    const { data, dedupeKey } = job;
    const input: JobInput<'mail.send'> = {
      id: redrive ?? id,
      data,
      attempt,
      dedupeKey,
      redriven: redrive !== undefined,
    };
    return JOB_HANDLERS['mail.send'](deps, input);
  };
  return { mail, run, id };
}

/** A delivered mail: its code and a closed detail (the fake transport answers at once). */
const delivered = (code: 'sent' | 'resent') => ({
  kind: 'done',
  code,
  detail: { graphRequestId: expect.any(String), ms: 0 },
});

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
    const { mail, run, id } = handler();
    expect(await run(job)).toEqual(delivered('sent'));
    expect(mail.calls).toEqual([
      {
        mail: { to: EMAIL, ...renderMail('access.approved', {}, ORIGIN), dedupeKey: job.dedupeKey },
        insideTransaction: false,
      },
    ]);
    expect(await ledger(job.dedupeKey)).toMatchObject({
      ...{ state: 'sent', code: 'sent', graphRequestId: 'request-1', attempts: 1 },
      ...{ unknownSends: 0, capFrom: 0, jobId: id },
      ...{ claimedAt: world.clock.now(), settledAt: world.clock.now() },
    });
  });

  describe('the detail of a sent mail', () => {
    it('carries the request id and the transport call time from the clock', async () => {
      const { job } = await decided('approved');
      const { run } = handler({ takesMs: 183 });
      expect(await run(job)).toEqual({
        kind: 'done',
        code: 'sent',
        detail: { graphRequestId: 'request-1', ms: 183 },
      });
    });

    it('carries it on a resend too', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler({ takesMs: 40 });
      mail.script({ kind: 'unknown', code: 'unknown.timeout' });
      await run(job);
      expect(await run(job)).toEqual({
        kind: 'done',
        code: 'resent',
        detail: { graphRequestId: 'request-2', ms: 40 },
      });
    });

    it('carries a null request id when Graph gave none', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler({ takesMs: 5 });
      mail.script({ kind: 'sent', requestId: null });
      expect(await run(job)).toEqual({
        kind: 'done',
        code: 'sent',
        detail: { graphRequestId: null, ms: 5 },
      });
    });

    it('never reports a negative time when the clock steps back during the call', async () => {
      const { job } = await decided('approved');
      const { run } = handler({ takesMs: -5 });
      expect(await run(job)).toMatchObject({ detail: { ms: 0 } });
    });

    it('has no detail on an outcome that sent nothing', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler({ takesMs: 9 });
      mail.script({ kind: 'not-sent', code: 'net.ENOTFOUND' });
      expect(await run(job)).toEqual({ kind: 'retry', code: 'net.ENOTFOUND' });
    });
  });

  it('tells a rejected requester from which day they may ask again', async () => {
    const { request, job } = await decided('rejected');
    const { mail, run } = handler();
    expect(await run(job)).toEqual(delivered('sent'));
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
      expect(await run(job)).toEqual(delivered('sent'));
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
    expect(await run(job, { redrive: randomUUID() })).toEqual({
      kind: 'done',
      code: 'already.sent',
    });
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
    const deps: WorkerDeps = {
      db: world.workerDb,
      clock: world.clock,
      appOrigin: ORIGIN,
      mail,
      converter: unusedConverter,
    };
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
      expect(await run(job)).toEqual(delivered('resent'));
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
      expect(await run(job)).toEqual(delivered('resent'));
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
      for (let attempt = 1; attempt <= 3; attempt += 1) await run(job, { attempt });
      const redrive = randomUUID();
      expect(await run(job, { redrive })).toEqual(delivered('resent'));
      expect(await run(job, { redrive, attempt: 2 })).toEqual({
        kind: 'done',
        code: 'already.sent',
      });
      expect(mail.calls).toHaveLength(3);
      // Every possible copy stays counted; the cap counts from the redrive.
      expect(await ledger(job.dedupeKey)).toMatchObject({
        ...{ state: 'sent', unknownSends: 2, capFrom: 2, jobId: redrive },
      });
    });
  });

  describe('a redrive whose first attempt ends before it claims', () => {
    const SECOND = 1_000;
    /**
     * Closes the gate, then runs the revived job's attempt 1: it is held there without a claim,
     * and a shutdown (or a throw, or an expiry) ends the attempt. Its attempt 2 runs once the
     * gate opens.
     */
    async function heldAtTheGate(run: ReturnType<typeof handler>['run'], job: MailJob) {
      const until = new Date(world.clock.now().getTime() + 30 * SECOND);
      await world.workerDb.transaction(
        { principal: system('job:test'), now: world.clock.now(), requestId: 'seed' },
        { mode: 'write' },
        (tx) => tx.mailLedger.closeGate(until, 'throttled.429'),
      );
      const before = await ledger(job.dedupeKey);
      const redrive = randomUUID();
      expect(await run(job, { redrive })).toEqual({ kind: 'wait', until, code: 'wait.gate' });
      expect(await ledger(job.dedupeKey)).toEqual(before);
      world.clock.set(until);
      return () => run(job, { redrive, attempt: 2 });
    }

    it('sends a rejected key on the revived job’s attempt 2', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler();
      mail.script({ kind: 'rejected', code: 'rejected.400' });
      expect(await run(job)).toEqual({ kind: 'dead', code: 'rejected.400' });
      const secondAttempt = await heldAtTheGate(run, job);
      expect(await secondAttempt()).toEqual(delivered('sent'));
      expect(mail.calls).toHaveLength(2);
    });

    it('resends a key left unknown at the cap on the revived job’s attempt 2', async () => {
      const { job } = await decided('approved');
      const { mail, run } = handler();
      mail.script(
        { kind: 'unknown', code: 'unknown.timeout' },
        { kind: 'unknown', code: 'unknown.reset' },
      );
      await run(job);
      await run(job, { attempt: 2 });
      const secondAttempt = await heldAtTheGate(run, job);
      expect(await secondAttempt()).toEqual(delivered('resent'));
      expect(mail.calls).toHaveLength(3);
    });
  });

  describe('a redrive of a job dead-lettered while its outcome was unknown', () => {
    const UNKNOWN = { kind: 'unknown', code: 'unknown.timeout' } as const;
    /** Two unknown outcomes, then the job ran out of retries: the row stays unknown at the cap. */
    async function leftUnknown() {
      const { job } = await decided('approved');
      const { mail, run } = handler();
      mail.script(UNKNOWN, UNKNOWN);
      await run(job);
      await run(job, { attempt: 2 });
      expect(await ledger(job.dedupeKey)).toMatchObject({ state: 'unknown', unknownSends: 2 });
      return { job, mail, run, redrive: randomUUID() };
    }

    it('sends at once, flagged, instead of failing the key as ambiguous', async () => {
      const { job, mail, run, redrive } = await leftUnknown();
      expect(await run(job, { redrive })).toEqual(delivered('resent'));
      expect(mail.calls).toHaveLength(3);
      expect(await ledger(job.dedupeKey)).toMatchObject({
        ...{ state: 'sent', unknownSends: 2, capFrom: 2 },
      });
    });

    it('keeps the cap for the revived job’s own retries: two more calls at most', async () => {
      const { job, mail, run, redrive } = await leftUnknown();
      mail.script(UNKNOWN, UNKNOWN);
      expect(await run(job, { redrive })).toEqual({ kind: 'retry', code: 'unknown.timeout' });
      expect(await run(job, { redrive, attempt: 2 })).toEqual({
        kind: 'retry',
        code: 'unknown.timeout',
      });
      expect(await run(job, { redrive, attempt: 3 })).toEqual({ kind: 'dead', code: 'ambiguous' });
      expect(mail.calls).toHaveLength(4);
      expect(await ledger(job.dedupeKey)).toMatchObject({
        ...{ state: 'failed', code: 'ambiguous', unknownSends: 4, capFrom: 2 },
      });
    });

    it('logs the revived send a resend after it was throttled: the 202 may be a third copy', async () => {
      const { job, mail, run, redrive } = await leftUnknown();
      mail.script({ kind: 'throttled', retryAfterMs: 7_000, code: 'throttled.429' });
      expect(await run(job, { redrive })).toMatchObject({ kind: 'wait', code: 'throttled.429' });
      expect(await ledger(job.dedupeKey)).toMatchObject({
        ...{ state: 'deferred', unknownSends: 2, capFrom: 2 },
      });
      world.clock.advance(7_000);
      expect(await run(job, { redrive })).toEqual(delivered('resent'));
      expect(mail.calls).toHaveLength(4);
      expect(await ledger(job.dedupeKey)).toMatchObject({ state: 'sent', code: 'resent' });
    });
  });

  it('gives a redriven deferred key two more unknown sends before it is ambiguous', async () => {
    const UNKNOWN = { kind: 'unknown', code: 'unknown.timeout' } as const;
    const { job } = await decided('approved');
    const { mail, run } = handler();
    // One unknown send, then auth refusals until the job ran out of retries.
    mail.script(UNKNOWN, { kind: 'auth', code: 'auth.403' });
    await run(job);
    await run(job, { attempt: 2 });
    expect(await ledger(job.dedupeKey)).toMatchObject({ state: 'deferred', unknownSends: 1 });
    world.clock.advance(24 * 3_600_000);
    const redrive = randomUUID();
    mail.script(UNKNOWN, UNKNOWN);
    expect(await run(job, { redrive })).toEqual({ kind: 'retry', code: 'unknown.timeout' });
    expect(await run(job, { redrive, attempt: 2 })).toEqual({
      kind: 'retry',
      code: 'unknown.timeout',
    });
    expect(await run(job, { redrive, attempt: 3 })).toEqual({ kind: 'dead', code: 'ambiguous' });
    expect(mail.calls).toHaveLength(4);
    expect(await ledger(job.dedupeKey)).toMatchObject({ unknownSends: 3, capFrom: 1 });
  });

  it('logs a resend after unknown, then deferred: the 202 may be a second copy', async () => {
    const { job } = await decided('approved');
    const { mail, run } = handler();
    mail.script({ kind: 'unknown', code: 'unknown.timeout' }, { kind: 'auth', code: 'auth.403' });
    await run(job);
    await run(job, { attempt: 2 });
    expect(await ledger(job.dedupeKey)).toMatchObject({ state: 'deferred', unknownSends: 1 });
    world.clock.advance(24 * 3_600_000);
    expect(await run(job, { attempt: 3 })).toEqual(delivered('resent'));
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
      expect(await run(job)).toEqual(delivered('sent'));
    });

    it('holds the 21st mail of a minute until the oldest send leaves the window', async () => {
      const first = world.clock.now();
      const mail = await sendMany(20);
      const { job } = await decided('approved');
      const { run } = handler();
      const until = new Date(first.getTime() + 60 * SECOND);
      expect(await run(job)).toEqual({ kind: 'wait', until, code: 'wait.window' });
      world.clock.set(until);
      expect(await run(job)).toEqual(delivered('sent'));
      expect(mail.calls).toHaveLength(20);
    });

    it('frees the slot of a mail that was deferred: nothing was sent', async () => {
      const { mail, run } = handler();
      mail.script({ kind: 'not-sent', code: 'net.ENOTFOUND' });
      await run((await decided('approved')).job);
      await sendMany(19);
      expect(await run((await decided('approved')).job)).toEqual(delivered('sent'));
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
