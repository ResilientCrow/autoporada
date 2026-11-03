/**
 * The mail for a deadline that came earlier (D21), switched off (ADR 0037): the move no longer
 * queues it, but the handler stays. Who is told, when the job is stale, which key.
 */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { mailJob, movedNoticeJob } from '@/application/notifications';
import {
  system,
  type JobInput,
  type LedgerRow,
  type UserRecord,
  type WorkerDeps,
} from '@/application/ports';
import { setSkipped } from '@/application/use-cases';
import { calDate, parseIsoDate, parseWallTime, toIsoDate, wallClockToInstant } from '@/domain/time';

import { createFakeMail } from '../../../test/support/fake-mail';
import { issueFixtures } from '../../../test/support/issues';
import { lateReportFixtures } from '../../../test/support/late-reports';
import { pointFixtures } from '../../../test/support/points';
import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';
import { unusedConverter } from '../../../test/support/fake-converter';

const world = setupWorld();
const points = pointFixtures(world);
const late = lateReportFixtures(world);
const issues = issueFixtures(world);

/** Monday 2 November 2026: the rule's deadline is Saturday 31 October 20.00 Prague (19.00Z). */
const MONDAY = calDate(2026, 11, 2);
const ISO = toIsoDate(MONDAY);
const WEDNESDAY = new Date('2026-10-28T10:00:00Z');
/** Friday 30 October 20.00 and Thursday 29 October 20.00 Prague (CET, UTC+1 after the 25th). */
const FRIDAY_8PM = new Date('2026-10-30T19:00:00Z');
const THURSDAY_8PM = new Date('2026-10-29T19:00:00Z');
const MINUTE = 60_000;
const ORIGIN = 'https://autoporada.test';

const deps = (mail = createFakeMail()): WorkerDeps => ({
  db: world.workerDb,
  clock: world.clock,
  appOrigin: ORIGIN,
  converter: unusedConverter,
  mail,
});
const noticeJob = (data: {
  monday: string;
  deadlineAt: string;
}): JobInput<'issues.moved-notice'> => ({
  id: randomUUID(),
  data,
  attempt: 1,
  dedupeKey: null,
  redriven: false,
});
const runNotice = (data: { monday: string; deadlineAt: string }) =>
  JOB_HANDLERS['issues.moved-notice'](deps(), noticeJob(data));

const headmaster = () => world.seed.user({ role: 'headmaster', email: 'reditel@ssps.cz' });
const submitter = (over: Parameters<typeof world.seed.user>[0] = {}) =>
  world.seed.user({ role: 'submitter', ...over });

/** The Monday's deadline moved (the meeting stays on the Monday), as a move left it before ADR 0051. */
async function moveDeadline(date: string, time = '20:00') {
  await issues.reschedule(MONDAY, {
    deadlineAt: wallClockToInstant(parseIsoDate(date), parseWallTime(time)),
  });
}

async function jobs(name: string) {
  const all = await world.inspect.jobs();
  return all.filter((j) => j.name === name);
}
/** The job a move to `deadlineAt` queued before the mail was switched off (ADR 0037). */
const noticeFor = (deadlineAt: Date) => movedNoticeJob(MONDAY, deadlineAt).data;
const mailKeys = async () =>
  (await jobs('mail.send')).map((j) => j.options.dedupeKey as string).sort();
const mailTo = async () =>
  (await jobs('mail.send')).map((j) => (j.data as { recipientId: string }).recipientId).sort();
const movedKey = (user: UserRecord, deadlineAt: Date) =>
  `issue.moved:${ISO}:${user.id}:${Math.floor(deadlineAt.getTime() / MINUTE)}`;

/** The author handed in a point last month: that alone puts nobody in the audience. */
async function handedIn(author: UserRecord) {
  world.clock.set(new Date('2026-10-12T08:00:00Z'));
  await points.moveTo(author, await points.start(author, 'pokyn'), 'submitted');
  world.clock.set(WEDNESDAY);
}
/** The author's akce ended on Monday 26 October, after that porada: its report goes to 2 November. */
async function owes(author: UserRecord) {
  world.clock.set(new Date('2026-10-01T08:00:00Z'));
  await late.akce(author, { day: '2026-10-26', timeTo: '14:00' });
  world.clock.set(WEDNESDAY);
}
async function draft(author: UserRecord) {
  world.clock.set(new Date('2026-10-26T08:00:00Z'));
  await points.start(author, 'pokyn');
  world.clock.set(WEDNESDAY);
}

describe('the notice job', () => {
  it('carries dates only', () => {
    expect(movedNoticeJob(MONDAY, FRIDAY_8PM).data).toEqual({
      monday: ISO,
      deadlineAt: FRIDAY_8PM.toISOString(),
    });
  });

  it('is keyed by slot and deadline: a second earlier deadline has its own key', () => {
    expect(movedNoticeJob(MONDAY, FRIDAY_8PM).dedupeKey).not.toBe(
      movedNoticeJob(MONDAY, THURSDAY_8PM).dedupeKey,
    );
  });

  it('is not queued by a move: the mail is switched off (ADR 0037)', async () => {
    world.clock.set(WEDNESDAY);
    await moveDeadline('2026-10-30');
    expect(await jobs('issues.moved-notice')).toEqual([]);
  });
});

describe('the audience', () => {
  it('mails whoever owes an akce report or has a draft, once each, and nobody else', async () => {
    const owing = await submitter();
    await owes(owing);
    const student = await submitter({ isStudent: true });
    await owes(student); // a student owes the report of their akce too
    const writer = await submitter({ isStudent: true });
    await draft(writer);
    const both = await submitter();
    await owes(both);
    await draft(both);
    const idle = await submitter();
    await handedIn(idle); // handed in a point, owes nothing
    const blocked = await submitter();
    await owes(blocked);
    await world.tx(system('test.seed'), async (tx) => {
      const current = await tx.users.lock(blocked.id);
      await tx.users.changeAccess(blocked.id, current!.version, { status: 'blocked' });
    });
    void idle;

    await moveDeadline('2026-10-30');
    const data = noticeFor(FRIDAY_8PM);
    expect(await runNotice(data)).toEqual({ kind: 'done', code: 'notified' });
    expect(await mailTo()).toEqual([owing.id, student.id, writer.id, both.id].sort());
    expect(await mailKeys()).toEqual(
      [owing, student, writer, both].map((u) => movedKey(u, FRIDAY_8PM)).sort(),
    );
    for (const job of await jobs('mail.send')) {
      expect(job.data).toMatchObject({ template: 'issue.moved' });
      expect(Object.keys(job.data as object).sort()).toEqual([
        'recipientId',
        'subjectId',
        'template',
      ]);
    }
  });

  it('says none when nobody is in the audience', async () => {
    world.clock.set(WEDNESDAY);
    await moveDeadline('2026-10-30');
    const data = noticeFor(FRIDAY_8PM);
    expect(await runNotice(data)).toEqual({ kind: 'done', code: 'none' });
    expect(await jobs('mail.send')).toEqual([]);
  });

  it('skips a person whose mail for this deadline is already in the ledger', async () => {
    const done = await submitter();
    const fresh = await submitter();
    await owes(done);
    await owes(fresh);
    await moveDeadline('2026-10-30');
    await world.workerDb.transaction(
      { principal: system('job:test'), now: world.clock.now(), requestId: 'seed' },
      { mode: 'write' },
      (tx) =>
        tx.mailLedger.skip({
          dedupeKey: movedKey(done, FRIDAY_8PM),
          template: 'issue.moved',
          recipientId: done.id,
          subjectId: done.id,
          code: 'skipped.stale',
        }),
    );
    const data = noticeFor(FRIDAY_8PM);
    await runNotice(data);
    expect(await mailTo()).toEqual([fresh.id]);
  });

  it('mails again for a second earlier deadline, under its own key', async () => {
    const user = await submitter();
    await owes(user);
    await moveDeadline('2026-10-30');
    await moveDeadline('2026-10-29', '20:00');
    // the first notice is stale once the second move happened; only the second mails
    expect(await runNotice(noticeFor(FRIDAY_8PM))).toEqual({ kind: 'done', code: 'none' });
    expect(await runNotice(noticeFor(THURSDAY_8PM))).toEqual({ kind: 'done', code: 'notified' });
    expect(await mailKeys()).toEqual([movedKey(user, THURSDAY_8PM)]);
  });
});

describe('a stale job is dropped', () => {
  async function moved() {
    const head = await headmaster();
    const user = await submitter();
    await owes(user);
    await moveDeadline('2026-10-30');
    const data = noticeFor(FRIDAY_8PM);
    return { head, user, data };
  }

  it('when the deadline was moved again since', async () => {
    const { data } = await moved();
    await moveDeadline('2026-11-01', '12:00');
    expect(await runNotice(data)).toEqual({ kind: 'done', code: 'none' });
    expect(await jobs('mail.send')).toEqual([]);
  });

  it('when the deadline has passed and the slot collected now is the next one', async () => {
    const { data } = await moved();
    world.clock.set(new Date(FRIDAY_8PM.getTime() + MINUTE));
    expect(await runNotice(data)).toEqual({ kind: 'done', code: 'none' });
    expect(await jobs('mail.send')).toEqual([]);
  });

  it('when the slot was skipped meanwhile', async () => {
    const { head, data } = await moved();
    const result = await world.run(setSkipped, world.as(head), {
      monday: ISO,
      event: 'skip',
      expectedVersion: 2,
      confirmed: true,
    });
    expect(result.ok).toBe(true);
    expect(await runNotice(data)).toEqual({ kind: 'done', code: 'none' });
  });
});

describe('at send time', () => {
  const mailSend = (mail: ReturnType<typeof createFakeMail>, user: UserRecord) =>
    JOB_HANDLERS['mail.send'](deps(mail), {
      id: randomUUID(),
      data: mailJob('issue.moved', { userId: user.id, monday: MONDAY, deadlineAt: FRIDAY_8PM })
        .data,
      attempt: 1,
      dedupeKey: movedKey(user, FRIDAY_8PM),
      redriven: false,
    });
  const ledger = (key: string): Promise<LedgerRow | null> =>
    world.workerDb.transaction(
      { principal: system('job:test'), now: world.clock.now(), requestId: 'inspect' },
      { mode: 'read' },
      (tx) => tx.mailLedger.get(key),
    );

  it('sends to a member with a draft or an owed report, and nothing to one who owes nothing', async () => {
    const worker = await submitter({ email: 'jana@ssps.cz' });
    const owing = await submitter({ email: 'eva@ssps.cz' });
    const quiet = await submitter({ email: 'petr@ssps.cz' });
    await draft(worker);
    await owes(owing);
    await handedIn(quiet);
    await moveDeadline('2026-10-30');
    const mail = createFakeMail();
    expect(await mailSend(mail, worker)).toMatchObject({ kind: 'done', code: 'sent' });
    expect(await mailSend(mail, owing)).toMatchObject({ kind: 'done', code: 'sent' });
    expect(mail.calls).toHaveLength(2);
    expect(await mailSend(mail, quiet)).toEqual({ kind: 'done', code: 'skipped.stale' });
    expect(mail.calls).toHaveLength(2);
  });

  it('sends nothing to a user who is gone, and nothing to a pending or blocked one', async () => {
    await moveDeadline('2026-10-30');
    const mail = createFakeMail();
    const gone = { id: '00000000-0000-7000-8000-00000000dead' } as UserRecord;
    expect(await mailSend(mail, gone)).toEqual({ kind: 'done', code: 'skipped.recipient-gone' });
    const pending = await world.seed.user({ role: 'pending', email: 'x@ssps.cz' });
    expect(await mailSend(mail, pending)).toEqual({ kind: 'done', code: 'skipped.stale' });
    const blocked = await submitter({ email: 'b@ssps.cz', status: 'blocked' });
    expect(await mailSend(mail, blocked)).toEqual({ kind: 'done', code: 'skipped.stale' });
    expect(mail.calls).toHaveLength(0);
    expect(await ledger(movedKey(pending, FRIDAY_8PM))).toMatchObject({ state: 'skipped' });
  });
});
