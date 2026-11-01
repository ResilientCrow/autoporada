/** The mails for a late report (ADR 0035): the akce's end, the last call, and what is dropped at send time. */
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { mailJob } from '@/application/notifications';
import {
  system,
  type JobInput,
  type PointRecord,
  type UserRecord,
  type WorkerDeps,
} from '@/application/ports';
import { calDate } from '@/domain/time';

import { createFakeMail } from '../../../test/support/fake-mail';
import { lateReportFixtures } from '../../../test/support/late-reports';
import { setupWorld } from '../../../test/support/world';
import { JOB_HANDLERS } from './index';
import { unusedConverter } from '../../../test/support/fake-converter';

const world = setupWorld();

/**
 * Meeting Monday 2 November 2026, deadline Saturday 31 October 20.00 Prague (19.00Z). An event on
 * Sunday 1 November ending at 21.00 (20.00Z) closes at 23.00 (22.00Z): the mail at its end goes
 * from 20.00Z, the last call from 21.00Z to 21.45Z.
 */
const MONDAY = calDate(2026, 11, 2);
const MONDAY_ISO = '2026-11-02';
const at = (hhmm: string, day = '2026-11-01') => new Date(`${day}T${hhmm}:00Z`);
const ORIGIN = 'https://autoporada.test';

const deps = (mail = createFakeMail()): WorkerDeps => ({
  db: world.workerDb,
  clock: world.clock,
  appOrigin: ORIGIN,
  converter: unusedConverter,
  mail,
});
const job = (): JobInput<'reports.late'> => ({
  id: randomUUID(),
  data: {},
  attempt: 1,
  dedupeKey: null,
  redriven: false,
});
const runAt = (instant: Date) => {
  world.clock.set(instant);
  return JOB_HANDLERS['reports.late'](deps(), job());
};

async function queued() {
  const jobs = await world.inspect.jobs();
  return jobs.map(({ data, options }) => ({
    data: data as { template: string; recipientId: string; subjectId: string },
    key: options.dedupeKey as string,
  }));
}
const keys = async () => (await queued()).map((q) => q.key).sort();

const submitter = () => world.seed.user({ role: 'submitter' });

const fixtures = lateReportFixtures(world);
const { patchAkce: patch } = fixtures;
const akce = (
  author: UserRecord,
  day: string,
  timeTo: string | null,
  over: Record<string, unknown> = {},
) => fixtures.akce(author, { day, timeTo }, over);
const report = (
  author: UserRecord,
  day: string,
  timeTo: string | null,
  state: PointRecord['state'] = 'draft',
) => fixtures.report(author, { day, timeTo }, state, MONDAY);

const ended = (id: string) => `report.ended:${id}`;
const lastCall = (kind: 'akce' | 'point', id: string) =>
  `report.last-call:${kind}:${id}:${MONDAY_ISO}`;

describe('the mail at the end of a late akce', () => {
  it('goes from the akce end, once, to its author with ids only', async () => {
    const author = await submitter();
    const id = await akce(author, '2026-11-01', '21:00');
    expect(await runAt(at('19:59'))).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
    expect(await runAt(at('20:00'))).toEqual({ kind: 'done', code: 'notified' });
    expect(await queued()).toEqual([
      {
        data: { template: 'report.ended', recipientId: author.id, subjectId: id },
        key: ended(id),
      },
    ]);
  });

  it('counts 20.00 as the end of an akce without an end time (due 22.00)', async () => {
    const author = await submitter();
    const id = await akce(author, '2026-11-01', null);
    await runAt(at('18:59'));
    expect(await queued()).toEqual([]);
    await runAt(at('19:00'));
    expect(await keys()).toEqual([ended(id)]);
  });

  it('stops when the last call starts, and the last call takes over', async () => {
    const author = await submitter();
    const id = await akce(author, '2026-11-01', '21:00');
    await runAt(at('20:59'));
    expect(await keys()).toEqual([ended(id)]);
    await runAt(at('21:00'));
    expect(await keys()).toEqual([ended(id), lastCall('akce', id)].sort());
    expect((await queued()).find((q) => q.key === lastCall('akce', id))?.data).toEqual({
      template: 'report.last-call',
      recipientId: author.id,
      subjectId: id,
    });
  });

  it('sends the last call until 15 minutes before the close, not after', async () => {
    const author = await submitter();
    const id = await akce(author, '2026-11-01', '21:00');
    await runAt(at('21:44'));
    expect(await keys()).toEqual([lastCall('akce', id)]);
    expect(await runAt(at('21:45'))).toEqual({ kind: 'done', code: 'none' });
  });

  it('has no last call when an hour before the close is not after the akce end: the first mail runs to 15 minutes before', async () => {
    // ends 23.30 Prague (22.30Z), closes at the cap 00.00 (23.00Z): the last call would start at 22.00Z
    const author = await submitter();
    const id = await akce(author, '2026-11-01', '23:30');
    await runAt(at('22:29'));
    expect(await queued()).toEqual([]);
    await runAt(at('22:30'));
    expect(await keys()).toEqual([ended(id)]);
    await runAt(at('22:44'));
    expect(await keys()).toEqual([ended(id)]);
    expect(await runAt(at('22:45'))).toEqual({ kind: 'done', code: 'none' });
    expect(await keys()).toEqual([ended(id)]);
  });

  it('skips a key the ledger already holds', async () => {
    const author = await submitter();
    const id = await akce(author, '2026-11-01', '21:00');
    await world.workerDb.transaction(
      { principal: system('job:test'), now: world.clock.now(), requestId: 'seed' },
      { mode: 'write' },
      (tx) =>
        tx.mailLedger.skip({
          dedupeKey: ended(id),
          template: 'report.ended',
          recipientId: author.id,
          subjectId: id,
          code: 'skipped.stale',
        }),
    );
    expect(await runAt(at('20:30'))).toEqual({ kind: 'done', code: 'none' });
    expect(await queued()).toEqual([]);
  });

  it('is for an akce that is late for its porada: not one that ended before the deadline, nor on the meeting day', async () => {
    const author = await submitter();
    await akce(author, '2026-10-30', '15:00'); // closes with the deadline
    await akce(author, '2026-10-31', '12:00'); // Saturday 12.00 + 2 h is before 20.00
    await akce(author, MONDAY_ISO, '10:00'); // ends on the meeting day: the next porada
    for (const time of ['10:00', '14:00', '19:30', '20:30', '21:30'] as const) {
      await runAt(at(time));
    }
    await runAt(at('10:00', MONDAY_ISO));
    expect(await queued()).toEqual([]);
  });

  it('leaves out a jednání and an akce that is not approved, has its report or is linked to one', async () => {
    const author = await submitter();
    await fixtures.jednani(author, { day: '2026-11-01', timeTo: '21:00' });
    const cancelled = await akce(author, '2026-11-01', '21:00');
    await patch(author, cancelled, { state: 'cancelled' });
    const written = await akce(author, '2026-11-01', '21:00');
    await patch(author, written, { reportState: 'written' });
    const linked = await akce(author, '2026-11-01', '21:00');
    await patch(author, linked, { reportPointId: await report(author, '2026-11-01', '21:00') });
    await runAt(at('20:30'));
    // only the linked akce's draft is a report to wait for, and it has no mail at its end
    expect(await queued()).toEqual([]);
  });

  it('asks each author about their own akce, and a prompted one is still asked', async () => {
    const one = await submitter();
    const other = await submitter();
    const first = await akce(one, '2026-11-01', '21:00');
    const second = await akce(other, '2026-11-01', '21:00');
    await patch(other, second, { reportState: 'prompted' });
    await runAt(at('20:30'));
    expect((await queued()).map((q) => [q.key, q.data.recipientId]).sort()).toEqual(
      [
        [ended(first), one.id],
        [ended(second), other.id],
      ].sort(),
    );
  });
});

describe('the last call for a report that is a point', () => {
  it('goes to the author of a draft, linked to an akce or not, and of a returned report', async () => {
    const one = await submitter();
    const two = await submitter();
    const three = await submitter();
    const unlinked = await report(one, '2026-11-01', '21:00');
    const linkedAkce = await akce(two, '2026-11-01', '21:00');
    const linked = await report(two, '2026-11-01', '21:00');
    await patch(two, linkedAkce, { reportPointId: linked });
    const returned = await report(three, '2026-11-01', '21:00', 'returned');
    await runAt(at('21:00'));
    expect(await keys()).toEqual(
      [lastCall('point', unlinked), lastCall('point', linked), lastCall('point', returned)].sort(),
    );
    const mails = Object.fromEntries((await queued()).map((q) => [q.key, q.data]));
    expect(mails[lastCall('point', linked)]).toEqual({
      template: 'report.last-call',
      recipientId: two.id,
      subjectId: linked,
    });
  });

  it('is not for a report already handed in or approved, nor for one that is not late', async () => {
    const author = await submitter();
    await report(author, '2026-11-01', '21:00', 'submitted');
    await report(author, '2026-11-01', '21:00', 'approved');
    await report(author, '2026-10-30', '15:00'); // closes with the deadline
    await runAt(at('21:00'));
    await runAt(at('20:00', '2026-10-31'));
    expect(await queued()).toEqual([]);
  });

  it('gives a draft with no end time its last call at 21.00 Prague (20.00Z)', async () => {
    const author = await submitter();
    const id = await report(author, '2026-11-01', null);
    await runAt(at('19:59'));
    expect(await queued()).toEqual([]);
    await runAt(at('20:00'));
    expect(await keys()).toEqual([lastCall('point', id)]);
  });

  it('has none when it does not fit, and no mail at the end of a point at all', async () => {
    const author = await submitter();
    await report(author, '2026-11-01', '23:30');
    await runAt(at('22:30'));
    await runAt(at('22:40'));
    expect(await queued()).toEqual([]);
  });

  it('keeps a key per slot: the same report late for the next porada after a move is a new key', async () => {
    const author = await submitter();
    const id = await report(author, '2026-11-01', '21:00');
    await runAt(at('21:00'));
    expect(await keys()).toEqual([lastCall('point', id)]);
    expect(lastCall('point', id)).not.toBe(`report.last-call:point:${id}:2026-11-09`);
  });
});

describe('what goes at send time', () => {
  const send = (mail: ReturnType<typeof createFakeMail>, built: ReturnType<typeof mailJob>) =>
    JOB_HANDLERS['mail.send'](deps(mail), {
      id: randomUUID(),
      data: built.data,
      attempt: 1,
      dedupeKey: built.dedupeKey,
      redriven: false,
    });
  const endedMail = (author: UserRecord, itemId: string) =>
    mailJob('report.ended', { authorId: author.id, itemId });
  const callMail = (author: UserRecord, kind: 'akce' | 'point', id: string) =>
    mailJob('report.last-call', { authorId: author.id, kind, id, monday: MONDAY });

  it('sends the mail at the end while the report is still owed', async () => {
    const author = await world.seed.user({ role: 'submitter', email: 'jana@ssps.cz' });
    const id = await akce(author, '2026-11-01', '21:00');
    world.clock.set(at('20:30'));
    const mail = createFakeMail();
    expect(await send(mail, endedMail(author, id))).toMatchObject({ kind: 'done', code: 'sent' });
    expect(mail.calls).toHaveLength(1);
  });

  it('drops the mail when the report was written meanwhile', async () => {
    const author = await world.seed.user({ role: 'submitter', email: 'jana@ssps.cz' });
    const id = await akce(author, '2026-11-01', '21:00');
    await patch(author, id, { reportState: 'written' });
    world.clock.set(at('20:30'));
    const mail = createFakeMail();
    expect(await send(mail, endedMail(author, id))).toEqual({
      kind: 'done',
      code: 'skipped.stale',
    });
    expect(mail.calls).toHaveLength(0);
  });

  it('drops the mail once the close has passed: the report is then for the next porada', async () => {
    const author = await world.seed.user({ role: 'submitter', email: 'jana@ssps.cz' });
    const id = await akce(author, '2026-11-01', '21:00');
    const mail = createFakeMail();
    world.clock.set(at('22:01')); // after 23.00 Prague
    expect(await send(mail, endedMail(author, id))).toEqual({
      kind: 'done',
      code: 'skipped.stale',
    });
    expect(await send(mail, callMail(author, 'akce', id))).toEqual({
      kind: 'done',
      code: 'skipped.stale',
    });
    expect(mail.calls).toHaveLength(0);
  });

  it.each([
    ['21:04', 'sent'],
    ['21:06', 'skipped.stale'],
  ])(
    'at %s, the mail at the end, with the last call started at 21.00Z and a short grace for the queue, is %s',
    async (time, code) => {
      const author = await world.seed.user({ role: 'submitter', email: 'jana@ssps.cz' });
      const id = await akce(author, '2026-11-01', '21:00');
      world.clock.set(at(time));
      expect(await send(createFakeMail(), endedMail(author, id))).toMatchObject({ code });
    },
  );

  it.each([
    ['21:49', 'sent'],
    ['21:51', 'skipped.stale'],
  ])(
    'at %s, the last call, which stops at 21.45Z, with the same grace, is %s',
    async (time, code) => {
      const author = await world.seed.user({ role: 'submitter', email: 'jana@ssps.cz' });
      const id = await akce(author, '2026-11-01', '21:00');
      world.clock.set(at(time));
      expect(await send(createFakeMail(), callMail(author, 'akce', id))).toMatchObject({ code });
    },
  );

  it('sends the last call of a draft, and drops it once the draft is handed in or returned to nobody', async () => {
    const author = await world.seed.user({ role: 'submitter', email: 'jana@ssps.cz' });
    const draft = await report(author, '2026-11-01', '21:00');
    const done = await report(author, '2026-11-01', '21:00', 'submitted');
    world.clock.set(at('21:10'));
    const mail = createFakeMail();
    expect(await send(mail, callMail(author, 'point', draft))).toMatchObject({ code: 'sent' });
    expect(await send(mail, callMail(author, 'point', done))).toEqual({
      kind: 'done',
      code: 'skipped.stale',
    });
    expect(mail.calls).toHaveLength(1);
  });

  it('sends the last call of an akce still without a report, with the ledger holding its report id', async () => {
    const author = await world.seed.user({ role: 'submitter', email: 'jana@ssps.cz' });
    const id = await akce(author, '2026-11-01', '21:00');
    world.clock.set(at('21:10'));
    const mail = createFakeMail();
    const built = callMail(author, 'akce', id);
    expect(built.data.subjectId).toBe(id);
    expect(await send(mail, built)).toMatchObject({ kind: 'done', code: 'sent' });
    expect(mail.calls).toHaveLength(1);
  });

  it('drops the last call of an akce that got its report, and of one that is gone', async () => {
    const author = await world.seed.user({ role: 'submitter', email: 'jana@ssps.cz' });
    const id = await akce(author, '2026-11-01', '21:00');
    world.clock.set(at('21:10'));
    const mail = createFakeMail();
    await patch(author, id, { reportState: 'written' });
    expect(await send(mail, callMail(author, 'akce', id))).toEqual({
      kind: 'done',
      code: 'skipped.stale',
    });
    const gone = '00000000-0000-7000-8000-00000000dead';
    expect(await send(mail, callMail(author, 'akce', gone))).toEqual({
      kind: 'done',
      code: 'skipped.stale',
    });
    expect(mail.calls).toHaveLength(0);
  });

  it('sends nothing to someone else than the author', async () => {
    const author = await world.seed.user({ role: 'submitter', email: 'jana@ssps.cz' });
    const other = await world.seed.user({ role: 'submitter', email: 'petr@ssps.cz' });
    const id = await akce(author, '2026-11-01', '21:00');
    world.clock.set(at('20:30'));
    const mail = createFakeMail();
    expect(await send(mail, endedMail(other, id))).toEqual({ kind: 'done', code: 'skipped.stale' });
  });
});
