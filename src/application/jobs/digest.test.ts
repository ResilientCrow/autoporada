/** The reviewer digest (design section 13): who is told, from when it counts, which key, and what the mail says. */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { system, type JobInput, type UserRecord, type WorkerDeps } from '@/application/ports';

import { createFakeMail } from '../../../test/support/fake-mail';
import { futureFixtures } from '../../../test/support/future';
import { pointFixtures } from '../../../test/support/points';
import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';

const world = setupWorld();
const points = pointFixtures(world);
const akce = futureFixtures(world);

/** Tuesday 27 October 2026: 07.00 and 15.00 Prague are 06.00Z and 14.00Z (the clocks went back on Sunday). */
const MORNING = new Date('2026-10-27T06:00:00Z');
const AFTERNOON = new Date('2026-10-27T14:00:00Z');
const HOUR = 3_600_000;
const DAY = '2026-10-27';
const ORIGIN = 'https://autoporada.test';

const job = (): JobInput<'reviewer.digest'> => ({
  id: randomUUID(),
  data: {},
  attempt: 1,
  dedupeKey: null,
  redriven: false,
});
const fake = createFakeMail();
/** The worker's side: autoporada_worker in the pg world. A digest run sends no mail itself. */
const deps = (): WorkerDeps => ({
  db: world.workerDb,
  clock: world.clock,
  appOrigin: ORIGIN,
  mail: { send: () => Promise.reject(new Error('a digest run sends no mail')) },
});
const runAt = (instant: Date) => {
  world.clock.set(instant);
  return JOB_HANDLERS['reviewer.digest'](deps(), job());
};

async function queued() {
  const jobs = await world.inspect.jobs();
  return jobs.map(({ data, options }) => ({
    data: data as { template: string; recipientId: string; subjectId: string },
    key: options.dedupeKey,
  }));
}
const keys = async () => (await queued()).map((q) => q.key).sort();
const key = (user: UserRecord, slot: '07' | '15') => `reviewer.digest:${user.id}:${DAY}:${slot}`;

const reviewer = (over: Parameters<typeof world.seed.user>[0] = {}) =>
  world.seed.user({ role: 'reviewer', email: 'kontrola@ssps.cz', ...over });
const author = () => world.seed.user({ role: 'submitter' });

/** The author hands in a pokyn at `when`. */
async function handIn(by: UserRecord, when: Date) {
  world.clock.set(when);
  await points.moveTo(by, await points.start(by, 'pokyn'), 'submitted');
}
const hoursBefore = (instant: Date, hours: number) => new Date(instant.getTime() - hours * HOUR);

/** A digest to the person that reached them: claimed at `at`, settled as sent. */
const sentAt = (to: UserRecord, at: Date, dedupeKey = `reviewer.digest:${to.id}:earlier`) =>
  world.workerDb.transaction(
    { principal: system('job:test'), now: at, requestId: 'seed' },
    { mode: 'write' },
    async (tx) => {
      await tx.mailLedger.claim({
        dedupeKey,
        template: 'reviewer.digest',
        recipientId: to.id,
        subjectId: to.id,
        unknownSends: 0,
        capFrom: 0,
        jobId: '00000000-0000-7000-8000-00000000b001',
      });
      await tx.mailLedger.settle(dedupeKey, { state: 'sent', code: 'sent' });
    },
  );

/** Changes the user's access after they have worked. */
const afterwards = (user: UserRecord, patch: Parameters<typeof world.seed.user>[0]) =>
  world.tx(system('test.seed'), async (tx) => {
    const current = await tx.users.lock(user.id);
    await tx.users.changeAccess(user.id, current!.version, patch ?? {});
  });

describe('who is mailed, and under which key', () => {
  it('mails a reviewer the 07.00 digest when something came in since yesterday, with ids only', async () => {
    const reader = await reviewer();
    await handIn(await author(), hoursBefore(MORNING, 5));
    expect(await runAt(MORNING)).toEqual({ kind: 'done', code: 'digested' });
    const [only, ...rest] = await queued();
    expect(rest).toEqual([]);
    expect(only).toEqual({
      data: { template: 'reviewer.digest', recipientId: reader.id, subjectId: reader.id },
      key: key(reader, '07'),
    });
  });

  it('files the 15.00 run under its own key, and a rerun of a slot adds nothing', async () => {
    const reader = await reviewer();
    await handIn(await author(), hoursBefore(MORNING, 5));
    await runAt(MORNING);
    await runAt(new Date(MORNING.getTime() + 15 * 60_000));
    expect(await keys()).toEqual([key(reader, '07')]);
    await runAt(AFTERNOON);
    expect(await keys()).toEqual([key(reader, '07'), key(reader, '15')]);
  });

  it('mails nobody when nothing is new, and not for what came in more than a day before', async () => {
    await reviewer();
    expect(await runAt(MORNING)).toEqual({ kind: 'done', code: 'none' });
    await handIn(await author(), hoursBefore(MORNING, 25));
    expect(await runAt(MORNING)).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });

  it('counts a point or an akce waiting for review, not one already decided or still a draft', async () => {
    const reader = await reviewer();
    const [pointAuthor, akceAuthor, other] = [await author(), await author(), await author()];
    world.clock.set(hoursBefore(MORNING, 5));
    await akce.moveTo(akceAuthor, await akce.start(akceAuthor), 'submitted');
    await points.moveTo(other, await points.start(other, 'pokyn'), 'approved');
    await points.start(pointAuthor, 'pokyn');
    await runAt(MORNING);
    expect(await keys()).toEqual([key(reader, '07')]);
  });

  it('asks nobody when the ledger holds the key already', async () => {
    const reader = await reviewer();
    await handIn(await author(), hoursBefore(MORNING, 5));
    world.clock.set(MORNING);
    await world.workerDb.transaction(
      { principal: system('job:test'), now: MORNING, requestId: 'seed' },
      { mode: 'write' },
      (tx) =>
        tx.mailLedger.skip({
          dedupeKey: key(reader, '07'),
          template: 'reviewer.digest',
          recipientId: reader.id,
          subjectId: reader.id,
          code: 'skipped.stale',
        }),
    );
    expect(await runAt(MORNING)).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });
});

describe('the watermark is the last digest sent, from the ledger', () => {
  it('counts what came in after it, however long ago it was, and nothing before', async () => {
    const reader = await reviewer();
    const writer = await author();
    await handIn(writer, hoursBefore(AFTERNOON, 70));
    await sentAt(reader, hoursBefore(AFTERNOON, 60));
    expect(await runAt(AFTERNOON)).toEqual({ kind: 'done', code: 'none' });
    await handIn(writer, hoursBefore(AFTERNOON, 40));
    expect(await runAt(AFTERNOON)).toEqual({ kind: 'done', code: 'digested' });
    expect(await keys()).toEqual([key(reader, '15')]);
  });

  it('does not start from a digest that was skipped or never went out', async () => {
    const reader = await reviewer();
    await handIn(await author(), hoursBefore(AFTERNOON, 20));
    world.clock.set(hoursBefore(AFTERNOON, 2));
    await world.workerDb.transaction(
      { principal: system('job:test'), now: world.clock.now(), requestId: 'seed' },
      { mode: 'write' },
      (tx) =>
        tx.mailLedger.skip({
          dedupeKey: `reviewer.digest:${reader.id}:skipped`,
          template: 'reviewer.digest',
          recipientId: reader.id,
          subjectId: reader.id,
          code: 'skipped.stale',
        }),
    );
    expect(await runAt(AFTERNOON)).toEqual({ kind: 'done', code: 'digested' });
  });

  it('carries the count over a quiet slot: the next digest counts since the last one sent', async () => {
    const reader = await reviewer();
    const writer = await author();
    await handIn(writer, hoursBefore(AFTERNOON, 30));
    await sentAt(reader, hoursBefore(AFTERNOON, 31));
    expect(await runAt(AFTERNOON)).toEqual({ kind: 'done', code: 'digested' });
  });
});

describe('who counts as a reviewer', () => {
  it('mails reviewers and headmasters who can sign in, and no one else', async () => {
    const [reviewerA, headmaster, blocked, deactivated, submitter, pending] = [
      await reviewer(),
      await reviewer({ role: 'headmaster' }),
      await reviewer(),
      await reviewer(),
      await author(),
      await author(),
    ];
    await afterwards(blocked, { status: 'blocked' });
    await afterwards(deactivated, { status: 'deactivated' });
    await afterwards(pending, { role: 'pending' });
    await handIn(await author(), hoursBefore(MORNING, 5));
    await runAt(MORNING);
    expect(await keys()).toEqual([key(reviewerA, '07'), key(headmaster, '07')].sort());
    expect(submitter.role).toBe('submitter');
  });

  it('does not tell a reviewer about what they handed in themselves', async () => {
    const reader = await reviewer();
    await handIn(reader, hoursBefore(MORNING, 5));
    expect(await runAt(MORNING)).toEqual({ kind: 'done', code: 'none' });
  });

  it('tells the headmaster about new access requests alone, and a reviewer nothing', async () => {
    const [head, reader] = [await reviewer({ role: 'headmaster' }), await reviewer()];
    const requester = await world.seed.user({ role: 'pending' });
    await world.seed.accessRequest({
      userId: requester.id,
      state: 'pending',
      createdAt: hoursBefore(MORNING, 3),
    });
    await runAt(MORNING);
    expect(await keys()).toEqual([key(head, '07')]);
    expect(reader.role).toBe('reviewer');
  });
});

describe('the mail that goes out', () => {
  /** Runs the queued digest of `to` through mail.send, as the worker does. */
  async function deliver(to: UserRecord, slot: '07' | '15') {
    const [mail] = (await queued()).filter((q) => q.key === key(to, slot));
    const input: JobInput<'mail.send'> = {
      id: randomUUID(),
      data: { template: 'reviewer.digest', recipientId: to.id, subjectId: to.id },
      attempt: 1,
      dedupeKey: mail!.key,
      redriven: false,
    };
    const send = { ...deps(), mail: fake };
    return JOB_HANDLERS['mail.send'](send, input);
  }

  it('counts at send time and carries the watermark to the next digest', async () => {
    const head = await reviewer({ role: 'headmaster' });
    const writer = await author();
    const requester = await world.seed.user({ role: 'pending' });
    await handIn(writer, hoursBefore(MORNING, 4));
    await world.seed.accessRequest({
      userId: requester.id,
      state: 'pending',
      createdAt: hoursBefore(MORNING, 3),
    });
    await runAt(MORNING);
    expect(await deliver(head, '07')).toMatchObject({ kind: 'done', code: 'sent' });
    expect(fake.calls.at(-1)?.mail.text).toContain(
      `nové body ke kontrole: 1.\n\nNové žádosti o\u00a0přístup: 1.\n\n${ORIGIN}/kontrola`,
    );

    await handIn(writer, hoursBefore(AFTERNOON, 2));
    await handIn(writer, hoursBefore(AFTERNOON, 1));
    await runAt(AFTERNOON);
    expect(await deliver(head, '15')).toMatchObject({ kind: 'done', code: 'sent' });
    const text = fake.calls.at(-1)?.mail.text ?? '';
    expect(text).toContain('nové body ke kontrole: 2.');
    expect(text).not.toContain('přístup');
  });

  it('skips a digest to someone who can no longer sign in by the time it goes out', async () => {
    const reader = await reviewer();
    await handIn(await author(), hoursBefore(MORNING, 4));
    await runAt(MORNING);
    await afterwards(reader, { status: 'blocked' });
    expect(await deliver(reader, '07')).toEqual({ kind: 'done', code: 'skipped.stale' });
  });
});
